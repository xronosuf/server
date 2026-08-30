#!/usr/bin/env bash
set -euo pipefail

REPO="${XRONOS_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
APP="${XRONOS_APP_CONTAINER:-devximserver}"
MONGO="${XRONOS_MONGO_CONTAINER:-xronos-mongo7-test}"
REDIS="${XRONOS_REDIS_CONTAINER:-xronos-redis74-bridge}"
SAGE="${XRONOS_SAGE_CONTAINER:-sagecell}"
APP_NETWORK="${XRONOS_APP_NETWORK:-xronos-modernization-net}"
SAGE_NETWORK="${XRONOS_SAGE_NETWORK:-xronos-net}"
MONGO_VOLUME="${XRONOS_MONGO_VOLUME:-xronos-mongo7-testdata}"
SAGE_VOLUME="${XRONOS_SAGE_VOLUME:-sagecell-data}"
MONGO_IMAGE="${XRONOS_MONGO_IMAGE:-docker.io/library/mongo:7.0.40}"
REDIS_IMAGE="${XRONOS_REDIS_IMAGE:-docker.io/library/redis:7.4.11-bookworm}"
SAGE_IMAGE="${XRONOS_SAGE_IMAGE:-localhost/local/sagecell-xronos:latest}"
APP_HOST_PORT="${XRONOS_APP_HOST_PORT:-2022}"
APP_CONTAINER_PORT="${XRONOS_APP_CONTAINER_PORT:-2000}"
PUBLIC_URL="${XRONOS_PUBLIC_URL:-https://dev.xronos.clas.ufl.edu}"
NODE_ENV_VALUE="${XRONOS_NODE_ENV:-test}"
ENVFILE="${XRONOS_ENVFILE:-$REPO/repositories/.env}"
APP_IMAGE="${XRONOS_APP_IMAGE:-}"
SAGE_BUILD_CONTEXT="${XRONOS_SAGE_BUILD_CONTEXT:-}"

cd "$REPO"
HEAD_SHA="$(git rev-parse HEAD)"
SHORT_SHA="$(git rev-parse --short=7 HEAD)"
[ -n "$APP_IMAGE" ] || APP_IMAGE="localhost/xronos-server:${SHORT_SHA}"

fail() { echo "ERROR: $*" >&2; exit 1; }

ensure_network() {
  local name="$1"
  if podman network exists "$name"; then
    echo "Network $name: present"
  else
    echo "Creating network $name"
    podman network create "$name" >/dev/null
  fi
}

ensure_volume() {
  local name="$1"
  if podman volume exists "$name"; then
    echo "Volume $name: present"
  else
    echo "Creating volume $name"
    podman volume create "$name" >/dev/null
  fi
}

ensure_pullable_image() {
  local image="$1"
  if podman image exists "$image"; then
    echo "Image $image: present"
  else
    echo "Pulling missing image $image"
    podman pull "$image"
  fi
}

ensure_attached() {
  local container="$1" network="$2"
  if ! podman inspect "$container" --format '{{range $name, $net := .NetworkSettings.Networks}}{{$name}} {{end}}' | grep -qw "$network"; then
    echo "Connecting $container to $network"
    podman network connect "$network" "$container"
  fi
}

wait_redis() {
  local i
  for i in $(seq 1 60); do
    if [ "$(podman exec "$REDIS" redis-cli ping 2>/dev/null || true)" = PONG ]; then
      echo "Redis ready after check $i"
      return 0
    fi
    sleep 1
  done
  return 1
}

wait_mongo() {
  local i
  for i in $(seq 1 90); do
    if [ "$(podman exec "$MONGO" mongosh --quiet --eval 'db.adminCommand({ping:1}).ok' 2>/dev/null || true)" = 1 ]; then
      echo "Mongo ready after check $i"
      return 0
    fi
    sleep 1
  done
  return 1
}

wait_sage() {
  local i status health
  for i in $(seq 1 180); do
    status="$(podman inspect "$SAGE" --format '{{.State.Status}}' 2>/dev/null || true)"
    health="$(podman inspect "$SAGE" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' 2>/dev/null || true)"
    if [ "$status" = running ] && { [ "$health" = healthy ] || [ "$health" = none ]; }; then
      echo "SageCell ready after check $i"
      return 0
    fi
    sleep 1
  done
  return 1
}

wait_app() {
  local expected="$1" i code
  for i in $(seq 1 120); do
    code="$(curl -sS --max-time 2 -o /tmp/xronos-start-app.$$ -w '%{http_code}' "http://127.0.0.1:${APP_HOST_PORT}/" 2>/dev/null || true)"
    if [ "$code" = 200 ] && grep -q "$expected" /tmp/xronos-start-app.$$; then
      rm -f /tmp/xronos-start-app.$$
      echo "Xronos ready after check $i with marker $expected"
      return 0
    fi
    sleep 1
  done
  rm -f /tmp/xronos-start-app.$$ || true
  return 1
}

app_declared_version() {
  podman inspect "$APP" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | sed -n 's/^XRONOS_APPLICATION_VERSION=//p' \
    | head -1
}

start_mongo() {
  if podman container exists "$MONGO"; then
    [ "$(podman inspect "$MONGO" --format '{{.State.Status}}')" = running ] || podman start "$MONGO" >/dev/null
    ensure_attached "$MONGO" "$APP_NETWORK"
  else
    echo "Creating Mongo container $MONGO"
    podman run -d --name "$MONGO" --network "$APP_NETWORK" \
      -v "$MONGO_VOLUME:/data/db" \
      "$MONGO_IMAGE" --bind_ip_all --dbpath /data/db >/dev/null
  fi
}

start_redis() {
  if podman container exists "$REDIS"; then
    [ "$(podman inspect "$REDIS" --format '{{.State.Status}}')" = running ] || podman start "$REDIS" >/dev/null
    ensure_attached "$REDIS" "$APP_NETWORK"
  else
    echo "Creating Redis container $REDIS"
    podman run -d --name "$REDIS" --network "$APP_NETWORK" \
      "$REDIS_IMAGE" --save "" --appendonly no >/dev/null
  fi
}

start_sage() {
  if podman container exists "$SAGE"; then
    [ "$(podman inspect "$SAGE" --format '{{.State.Status}}')" = running ] || podman start "$SAGE" >/dev/null
    ensure_attached "$SAGE" "$SAGE_NETWORK"
  else
    if ! podman image exists "$SAGE_IMAGE"; then
      [ -n "$SAGE_BUILD_CONTEXT" ] || fail "SageCell image $SAGE_IMAGE is missing and XRONOS_SAGE_BUILD_CONTEXT is not set"
      podman build -t "$SAGE_IMAGE" "$SAGE_BUILD_CONTEXT"
    fi
    echo "Creating SageCell container $SAGE"
    podman run -d --name "$SAGE" --network "$SAGE_NETWORK" \
      -v "$SAGE_VOLUME:/var/lib/sagecell" \
      "$SAGE_IMAGE" sagecell >/dev/null
  fi
}

find_workers() {
  local c
  while IFS= read -r c; do
    [ -n "$c" ] || continue
    if podman exec "$c" test -f /usr/var/server/routes/gradebook.js >/dev/null 2>&1 \
       && podman exec "$c" /bin/sh -lc 'grep -q "setInterval( process, 10000 )" /usr/var/server/routes/gradebook.js' >/dev/null 2>&1; then
      echo "$c"
    fi
  done < <(podman ps --format '{{.Names}}')
}

printf '============================================================\nXRONOS STACK START\n============================================================\n\n'

[ -f "$ENVFILE" ] || fail "persistent deployment config missing: $ENVFILE"
[ "$(stat -c '%a' "$ENVFILE")" = 600 ] || fail "$ENVFILE must have mode 600"
[ -d "$REPO/repositories" ] || fail "repositories directory missing"
[ -n "$(git branch --show-current)" ] || fail "repository is not on a branch"
[ -z "$(git status --porcelain)" ] || fail "repository worktree is dirty"

echo "Repository: $REPO"
echo "Branch:     $(git branch --show-current)"
echo "Commit:     $HEAD_SHA"
echo

ensure_network "$APP_NETWORK"
ensure_network "$SAGE_NETWORK"
ensure_volume "$MONGO_VOLUME"
ensure_volume "$SAGE_VOLUME"
ensure_pullable_image "$MONGO_IMAGE"
ensure_pullable_image "$REDIS_IMAGE"

start_mongo
wait_mongo || fail "Mongo did not become ready"
start_redis
wait_redis || fail "Redis did not become ready"
start_sage
wait_sage || fail "SageCell did not become ready"

mapfile -t workers < <(find_workers)
for c in "${workers[@]:-}"; do
  if [ -n "$c" ] && [ "$c" != "$APP" ]; then
    fail "competing gradebook-capable application is already running: $c"
  fi
done

if podman container exists "$APP"; then
  EXPECTED_APP_VERSION="${XRONOS_EXPECTED_APP_VERSION:-$(app_declared_version)}"
  [ -n "$EXPECTED_APP_VERSION" ] || fail "existing app container has no XRONOS_APPLICATION_VERSION; set XRONOS_EXPECTED_APP_VERSION explicitly"
  echo "Existing app image: $(podman inspect "$APP" --format '{{.ImageName}}')"
  echo "Expected deployed marker: $EXPECTED_APP_VERSION"
  [ "$(podman inspect "$APP" --format '{{.State.Status}}')" = running ] || podman start "$APP" >/dev/null
  ensure_attached "$APP" "$APP_NETWORK"
  ensure_attached "$APP" "$SAGE_NETWORK"
else
  EXPECTED_APP_VERSION="${XRONOS_EXPECTED_APP_VERSION:-$HEAD_SHA}"
  if ! podman image exists "$APP_IMAGE"; then
    echo "Building missing Xronos image $APP_IMAGE"
    podman build -t "$APP_IMAGE" "$REPO"
  fi
  echo "Creating application container $APP"
  podman run -d --name "$APP" --network "$APP_NETWORK" \
    -p "0.0.0.0:${APP_HOST_PORT}:${APP_CONTAINER_PORT}" \
    -e "NODE_ENV=${NODE_ENV_VALUE}" \
    -e "PORT=${APP_CONTAINER_PORT}" \
    -e "XRONOS_APPLICATION_VERSION=${EXPECTED_APP_VERSION}" \
    -v "$REPO/repositories:/usr/var/server/repositories" \
    "$APP_IMAGE" >/dev/null
  ensure_attached "$APP" "$SAGE_NETWORK"
fi

wait_app "$EXPECTED_APP_VERSION" || fail "Xronos did not become ready with marker $EXPECTED_APP_VERSION"

mapfile -t workers < <(find_workers)
[ "${#workers[@]}" -eq 1 ] || fail "expected exactly one gradebook-capable application, found ${#workers[@]}"
[ "${workers[0]}" = "$APP" ] || fail "gradebook worker is ${workers[0]}, expected $APP"

podman exec -i "$APP" node - <<'NODE'
const config = require('/usr/var/server/config');
const mongo = new URL(config.mongodb.uri);
const sage = new URL(config.sagecellService);
console.log('root=' + config.root);
console.log('mongo=' + mongo.hostname);
console.log('redis=' + config.redis.url + ':' + config.redis.port);
console.log('sage=' + sage.hostname + ':' + (sage.port || 80));
NODE

public_code="$(curl -k -sS --max-time 10 -o /tmp/xronos-start-public.$$ -w '%{http_code}' "$PUBLIC_URL/" 2>/dev/null || true)"
rm -f /tmp/xronos-start-public.$$ || true

printf '\n============================================================\nXRONOS STACK READY\n============================================================\n'
printf 'App:      %s (%s) marker=%s\n' "$APP" "$(podman inspect "$APP" --format '{{.State.Status}}')" "$EXPECTED_APP_VERSION"
printf 'Mongo:    %s (%s)\n' "$MONGO" "$(podman inspect "$MONGO" --format '{{.State.Status}}')"
printf 'Redis:    %s (%s)\n' "$REDIS" "$(podman inspect "$REDIS" --format '{{.State.Status}}')"
printf 'SageCell: %s (%s)\n' "$SAGE" "$(podman inspect "$SAGE" --format '{{.State.Status}}')"
printf 'Public:   %s HTTP=%s\n' "$PUBLIC_URL" "${public_code:-unreachable}"
