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
if [ -z "$APP_IMAGE" ]; then
  APP_IMAGE="localhost/xronos-server:${SHORT_SHA}"
fi

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

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
  local i code
  for i in $(seq 1 120); do
    code="$(curl -sS --max-time 2 -o /tmp/xronos-start-app.$$ -w '%{http_code}' "http://127.0.0.1:${APP_HOST_PORT}/" 2>/dev/null || true)"
    if [ "$code" = 200 ]; then
      if grep -q "$HEAD_SHA" /tmp/xronos-start-app.$$; then
        rm -f /tmp/xronos-start-app.$$
        echo "Xronos ready after check $i"
        return 0
      fi
    fi
    sleep 1
  done
  rm -f /tmp/xronos-start-app.$$ || true
  return 1
}

ensure_attached() {
  local container="$1" network="$2"
  if podman inspect "$container" --format '{{range $name, $net := .NetworkSettings.Networks}}{{$name}} {{end}}' | grep -qw "$network"; then
    return 0
  fi
  echo "Connecting $container to $network"
  podman network connect "$network" "$container"
}

start_existing_or_create_mongo() {
  if podman container exists "$MONGO"; then
    if [ "$(podman inspect "$MONGO" --format '{{.State.Status}}')" != running ]; then
      echo "Starting existing Mongo container $MONGO"
      podman start "$MONGO" >/dev/null
    else
      echo "Mongo container $MONGO: already running"
    fi
    ensure_attached "$MONGO" "$APP_NETWORK"
    return
  fi
  echo "Creating Mongo container $MONGO"
  podman run -d --name "$MONGO" --network "$APP_NETWORK" \
    -v "$MONGO_VOLUME:/data/db" \
    "$MONGO_IMAGE" --bind_ip_all --dbpath /data/db >/dev/null
}

start_existing_or_create_redis() {
  if podman container exists "$REDIS"; then
    if [ "$(podman inspect "$REDIS" --format '{{.State.Status}}')" != running ]; then
      echo "Starting existing Redis container $REDIS"
      podman start "$REDIS" >/dev/null
    else
      echo "Redis container $REDIS: already running"
    fi
    ensure_attached "$REDIS" "$APP_NETWORK"
    return
  fi
  echo "Creating Redis container $REDIS"
  podman run -d --name "$REDIS" --network "$APP_NETWORK" \
    "$REDIS_IMAGE" --save "" --appendonly no >/dev/null
}

start_existing_or_create_sage() {
  if podman container exists "$SAGE"; then
    if [ "$(podman inspect "$SAGE" --format '{{.State.Status}}')" != running ]; then
      echo "Starting existing SageCell container $SAGE"
      podman start "$SAGE" >/dev/null
    else
      echo "SageCell container $SAGE: already running"
    fi
    ensure_attached "$SAGE" "$SAGE_NETWORK"
    return
  fi
  if ! podman image exists "$SAGE_IMAGE"; then
    if [ -n "$SAGE_BUILD_CONTEXT" ]; then
      echo "Building missing SageCell image from $SAGE_BUILD_CONTEXT"
      podman build -t "$SAGE_IMAGE" "$SAGE_BUILD_CONTEXT"
    else
      fail "SageCell image $SAGE_IMAGE is missing and XRONOS_SAGE_BUILD_CONTEXT is not set"
    fi
  fi
  echo "Creating SageCell container $SAGE"
  podman run -d --name "$SAGE" --network "$SAGE_NETWORK" \
    -v "$SAGE_VOLUME:/var/lib/sagecell" \
    "$SAGE_IMAGE" sagecell >/dev/null
}

count_gradebook_workers() {
  local c count=0
  while IFS= read -r c; do
    [ -n "$c" ] || continue
    if podman exec "$c" test -f /usr/var/server/routes/gradebook.js >/dev/null 2>&1 \
       && podman exec "$c" /bin/sh -lc 'grep -q "setInterval( process, 10000 )" /usr/var/server/routes/gradebook.js' >/dev/null 2>&1; then
      echo "$c"
      count=$((count + 1))
    fi
  done < <(podman ps --format '{{.Names}}')
  return "$count"
}

printf '============================================================\n'
printf 'XRONOS STACK START\n'
printf '============================================================\n\n'

[ -f "$ENVFILE" ] || fail "persistent deployment config missing: $ENVFILE"
mode="$(stat -c '%a' "$ENVFILE")"
[ "$mode" = 600 ] || fail "$ENVFILE must have mode 600 (found $mode)"
[ -d "$REPO/repositories" ] || fail "repositories directory missing"

branch="$(git branch --show-current)"
[ -n "$branch" ] || fail "repository is not on a branch"
[ -z "$(git status --porcelain)" ] || fail "repository worktree is dirty"

echo "Repository: $REPO"
echo "Branch:     $branch"
echo "Commit:     $HEAD_SHA"
echo "App image:  $APP_IMAGE"
echo

echo "Checking networks and persistent volumes"
ensure_network "$APP_NETWORK"
ensure_network "$SAGE_NETWORK"
ensure_volume "$MONGO_VOLUME"
ensure_volume "$SAGE_VOLUME"

echo
echo "Checking backing-service images"
ensure_pullable_image "$MONGO_IMAGE"
ensure_pullable_image "$REDIS_IMAGE"
if podman image exists "$SAGE_IMAGE"; then
  echo "Image $SAGE_IMAGE: present"
fi

echo
echo "Starting backing services"
start_existing_or_create_mongo
wait_mongo || fail "Mongo did not become ready"
start_existing_or_create_redis
wait_redis || fail "Redis did not become ready"
start_existing_or_create_sage
wait_sage || fail "SageCell did not become ready"

echo
echo "Checking for competing running Xronos applications"
workers=()
while IFS= read -r c; do
  [ -n "$c" ] || continue
  if podman exec "$c" test -f /usr/var/server/routes/gradebook.js >/dev/null 2>&1 \
     && podman exec "$c" /bin/sh -lc 'grep -q "setInterval( process, 10000 )" /usr/var/server/routes/gradebook.js' >/dev/null 2>&1; then
    workers+=("$c")
  fi
done < <(podman ps --format '{{.Names}}')
for c in "${workers[@]:-}"; do
  if [ -n "$c" ] && [ "$c" != "$APP" ]; then
    fail "competing gradebook-capable application is already running: $c"
  fi
done

echo
echo "Preparing application image/container"
if podman container exists "$APP"; then
  existing_image="$(podman inspect "$APP" --format '{{.ImageName}}')"
  echo "Existing app container image: $existing_image"
  if [ "$(podman inspect "$APP" --format '{{.State.Status}}')" != running ]; then
    echo "Starting existing application container $APP"
    podman start "$APP" >/dev/null
  else
    echo "Application container $APP: already running"
  fi
  ensure_attached "$APP" "$APP_NETWORK"
  ensure_attached "$APP" "$SAGE_NETWORK"
else
  if ! podman image exists "$APP_IMAGE"; then
    echo "Building missing Xronos image $APP_IMAGE from canonical Dockerfile"
    podman build -t "$APP_IMAGE" "$REPO"
  fi
  echo "Creating application container $APP"
  podman run -d --name "$APP" --network "$APP_NETWORK" \
    -p "0.0.0.0:${APP_HOST_PORT}:${APP_CONTAINER_PORT}" \
    -e "NODE_ENV=${NODE_ENV_VALUE}" \
    -e "PORT=${APP_CONTAINER_PORT}" \
    -e "XRONOS_APPLICATION_VERSION=${HEAD_SHA}" \
    -v "$REPO/repositories:/usr/var/server/repositories" \
    "$APP_IMAGE" >/dev/null
  ensure_attached "$APP" "$SAGE_NETWORK"
fi

wait_app || fail "Xronos did not become ready with application marker $HEAD_SHA"

echo
echo "Verifying resolved runtime configuration"
podman exec -i "$APP" node - <<'NODE'
const config = require('/usr/var/server/config');
const mongo = new URL(config.mongodb.uri);
const sage = new URL(config.sagecellService);
console.log('root=' + config.root);
console.log('mongo=' + mongo.hostname);
console.log('redis=' + config.redis.url + ':' + config.redis.port);
console.log('sage=' + sage.hostname + ':' + (sage.port || 80));
NODE

workers=()
while IFS= read -r c; do
  [ -n "$c" ] || continue
  if podman exec "$c" test -f /usr/var/server/routes/gradebook.js >/dev/null 2>&1 \
     && podman exec "$c" /bin/sh -lc 'grep -q "setInterval( process, 10000 )" /usr/var/server/routes/gradebook.js' >/dev/null 2>&1; then
    workers+=("$c")
  fi
done < <(podman ps --format '{{.Names}}')
[ "${#workers[@]}" -eq 1 ] || fail "expected exactly one gradebook-capable application, found ${#workers[@]}"
[ "${workers[0]}" = "$APP" ] || fail "gradebook worker is ${workers[0]}, expected $APP"

public_code="$(curl -k -sS --max-time 10 -o /tmp/xronos-start-public.$$ -w '%{http_code}' "$PUBLIC_URL/" 2>/dev/null || true)"
echo "Public endpoint HTTP=$public_code"
rm -f /tmp/xronos-start-public.$$ || true

printf '\n============================================================\n'
printf 'XRONOS STACK READY\n'
printf '============================================================\n'
printf 'App:      %s (%s)\n' "$APP" "$(podman inspect "$APP" --format '{{.State.Status}}')"
printf 'Mongo:    %s (%s)\n' "$MONGO" "$(podman inspect "$MONGO" --format '{{.State.Status}}')"
printf 'Redis:    %s (%s)\n' "$REDIS" "$(podman inspect "$REDIS" --format '{{.State.Status}}')"
printf 'SageCell: %s (%s)\n' "$SAGE" "$(podman inspect "$SAGE" --format '{{.State.Status}}')"
printf 'Public:   %s HTTP=%s\n' "$PUBLIC_URL" "${public_code:-unreachable}"
