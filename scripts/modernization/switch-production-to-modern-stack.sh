#!/bin/bash
set -euo pipefail

[[ "${XRONOS_ALLOW_PRODUCTION_SWITCH:-NO}" == "YES" ]] || {
    echo "ERROR: set XRONOS_ALLOW_PRODUCTION_SWITCH=YES for the maintenance-window switch." >&2
    exit 1
}

EXPECTED_HOST=${XRONOS_EXPECTED_HOST:-ls-xronos01}
REPO=${XRONOS_REPO:-/home/ximera/xronosuf/server}
LEGACY_APP=${XRONOS_LEGACY_APP_CONTAINER:-xronos}
MODERN_APP=${XRONOS_MODERN_APP_CONTAINER:-xronos-modern}
SMOKE_APP=${XRONOS_MODERN_SMOKE_CONTAINER:-xronos-modern-smoke}
MONGO=${XRONOS_MONGO_CONTAINER:-xronos-mongo7}
REDIS=${XRONOS_REDIS_CONTAINER:-xronos-redis74}
SAGE=${XRONOS_SAGE_CONTAINER:-sagecell}
APP_NETWORK=${XRONOS_APP_NETWORK:-xronos-modernization-net}
SAGE_NETWORK=${XRONOS_SAGE_NETWORK:-xronos-net}
APP_IMAGE=${XRONOS_APP_IMAGE:-localhost/xronos-server:55d59b2}
APP_VERSION=${XRONOS_APP_VERSION:-55d59b29d896a581ec5b4f139179a3c41177bcc4}
ENV_CURRENT=${XRONOS_ENV_CURRENT:-$REPO/repositories/.env}
ENV_NEXT=${XRONOS_ENV_NEXT:-$REPO/repositories/.env.modernization-next}
ENV_BACKUP=${XRONOS_ENV_BACKUP:-$REPO/repositories/.env.pre-modernization-cutover}
QUEUE_SNAPSHOT=${XRONOS_QUEUE_SNAPSHOT:-/home/ximera/xronos-gradebook-cutover.tsv}
SMOKE_PORT=${XRONOS_SMOKE_PORT:-2024}
PUBLIC_PORT=${XRONOS_PUBLIC_PORT:-2000}
PUBLIC_URL=${XRONOS_PUBLIC_URL:-https://xronos.clas.ufl.edu}

ROLLBACK_ARMED=0
ENV_SWAPPED=0
LEGACY_STOPPED=0
PUBLIC_START_ATTEMPTED=0

mongo_shell() {
    if podman exec "$MONGO" sh -lc 'command -v mongosh >/dev/null 2>&1'; then
        echo mongosh
    else
        echo mongo
    fi
}

scan_redis_keys() {
    local container=$1
    podman exec "$container" redis-cli --raw --scan
}

legacy_redis_key_allowed() {
    local key=$1
    case "$key" in
        gradebook|activities:*|blob:*|metadata:*) return 0 ;;
        *) return 1 ;;
    esac
}

modern_smoke_redis_key_allowed() {
    local key=$1
    case "$key" in
        activities:*|blob:*|metadata:*) return 0 ;;
        *) return 1 ;;
    esac
}

rollback() {
    local rc=$?
    set +e
    if [[ "$rc" -eq 0 || "$ROLLBACK_ARMED" != "1" ]]; then
        exit "$rc"
    fi

    echo >&2
    echo "============================================================" >&2
    echo "MODERN STACK SWITCH FAILED — ATTEMPTING LEGACY ROLLBACK" >&2
    echo "============================================================" >&2

    if [[ "$PUBLIC_START_ATTEMPTED" == "1" ]]; then
        echo "ERROR: automatic rollback is disabled after public modern-app start was attempted." >&2
        echo "Modern Mongo/Redis may have accepted production work. Inspect state before any legacy restart." >&2
        exit "$rc"
    fi

    podman rm -f "$MODERN_APP" >/dev/null 2>&1 || true
    podman rm -f "$SMOKE_APP" >/dev/null 2>&1 || true

    # Any modern gradebook key is only a copy until the public app starts.
    podman exec "$REDIS" redis-cli DEL gradebook >/dev/null 2>&1 || true

    if [[ "$ENV_SWAPPED" == "1" && -f "$ENV_BACKUP" ]]; then
        cp -p "$ENV_BACKUP" "$ENV_CURRENT"
    fi

    if [[ "$LEGACY_STOPPED" == "1" ]]; then
        podman start "$LEGACY_APP" >/dev/null 2>&1 || true
        for _ in $(seq 1 60); do
            [[ "$(podman exec "$LEGACY_APP" redis-cli ping 2>/dev/null || true)" == "PONG" ]] && break
            sleep 1
        done
        if [[ -s "$QUEUE_SNAPSHOT" ]]; then
            podman exec "$LEGACY_APP" redis-cli DEL gradebook >/dev/null 2>&1 || true
            while IFS=$'\t' read -r member score; do
                [[ -n "$member" ]] || continue
                podman exec "$LEGACY_APP" redis-cli ZADD gradebook "$score" "$member" >/dev/null 2>&1 || true
            done < "$QUEUE_SNAPSHOT"
        fi
    else
        # The migration runner left the legacy Node process frozen on success.
        node_pid=$(podman exec "$LEGACY_APP" sh -c "ps -eo pid=,args= | awk '\$2 == \"node\" && \$3 == \"app.js\" {print \$1}'" 2>/dev/null | head -1)
        [[ -z "$node_pid" ]] || podman exec "$LEGACY_APP" kill -CONT "$node_pid" >/dev/null 2>&1 || true
    fi

    mongo --quiet --host 127.0.0.1 --port 27017 admin --eval '
        db.adminCommand({setParameter:1,ttlMonitorEnabled:true});
    ' >/dev/null 2>&1 || true

    echo "Rollback attempted. Verify legacy HTTP and gradebook queue before reopening service." >&2
    exit "$rc"
}
trap rollback EXIT INT TERM

fail() { echo "ERROR: $*" >&2; exit 1; }

wait_http() {
    local port=$1
    local i code
    for i in $(seq 1 120); do
        code=$(curl -sS --max-time 2 -o /tmp/xronos-switch-http.$$ -w '%{http_code}' "http://127.0.0.1:${port}/" 2>/dev/null || true)
        rm -f /tmp/xronos-switch-http.$$ || true
        [[ "$code" == "200" ]] && return 0
        sleep 1
    done
    return 1
}

run_modern_app() {
    local name=$1
    local host_port=$2
    podman run -d --name "$name" --network "$APP_NETWORK" \
        -p "127.0.0.1:${host_port}:2000" \
        -e PORT=2000 \
        -e "XRONOS_APPLICATION_VERSION=${APP_VERSION}" \
        -v "$REPO/repositories:/usr/var/server/repositories" \
        "$APP_IMAGE" >/dev/null
    podman network connect "$SAGE_NETWORK" "$name"
}

echo "============================================================"
echo "XRONOS PRODUCTION — SWITCH TO MODERN STACK"
echo "============================================================"

[[ "$(hostname -s)" == "$EXPECTED_HOST" ]] || fail "wrong host"
[[ -f "$ENV_CURRENT" && -f "$ENV_NEXT" ]] || fail "deployment env files missing"
ENV_MODE=$(stat -c '%a' "$ENV_CURRENT")
case "$ENV_MODE" in
    600|660) ;;
    *) fail "current env must be mode 600 or 660 (found $ENV_MODE)" ;;
esac
[[ "$(stat -c '%a' "$ENV_NEXT")" == "$ENV_MODE" ]] || fail "next env mode must match current env mode $ENV_MODE"
podman image exists "$APP_IMAGE" || fail "modern app image missing"
podman network exists "$APP_NETWORK" || fail "modernization network missing"
podman network exists "$SAGE_NETWORK" || fail "Sage network missing"
[[ "$(podman inspect "$LEGACY_APP" --format '{{.State.Status}}')" == "running" ]] || fail "legacy app container must still be running/frozen"
[[ "$(podman inspect "$MONGO" --format '{{.State.Status}}')" == "running" ]] || fail "Mongo 7 container is not running"
[[ "$(podman inspect "$REDIS" --format '{{.State.Status}}')" == "running" ]] || fail "Redis 7 container is not running"
[[ "$(podman inspect "$SAGE" --format '{{.State.Status}}')" == "running" ]] || fail "SageCell is not running"
[[ "$(podman inspect "$SAGE" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')" == "healthy" ]] || fail "SageCell is not healthy"

shell=$(mongo_shell)
version=$(podman exec "$MONGO" "$shell" --quiet admin --eval 'print(db.version())' | tail -1 | tr -d '[:space:]')
fcv=$(podman exec "$MONGO" "$shell" --quiet admin --eval 'print(db.adminCommand({getParameter:1,featureCompatibilityVersion:1}).featureCompatibilityVersion.version)' | tail -1 | tr -d '[:space:]')
ttl=$(podman exec "$MONGO" "$shell" --quiet admin --eval 'print(db.adminCommand({getParameter:1,ttlMonitorEnabled:1}).ttlMonitorEnabled)' | tail -1 | tr -d '[:space:]')
[[ "$version" == "7.0.40" ]] || fail "expected Mongo 7.0.40, found $version"
[[ "$fcv" == "7.0" ]] || fail "expected FCV 7.0, found $fcv"
[[ "$ttl" == "false" ]] || fail "destination TTL monitor should still be disabled at cutover boundary"
[[ "$(podman exec "$REDIS" redis-cli ping)" == "PONG" ]] || fail "Redis 7 is not ready"

node_pid=$(podman exec "$LEGACY_APP" sh -c "ps -eo pid=,stat=,args= | awk '\$3 == \"node\" && \$4 == \"app.js\" {print \$1}'" | head -1)
[[ -n "$node_pid" ]] || fail "legacy node app.js process not found"
node_stat=$(podman exec "$LEGACY_APP" ps -o stat= -p "$node_pid" | tr -d '[:space:]')
[[ "$node_stat" == *T* ]] || fail "legacy node process is not frozen (state=$node_stat)"

echo "Migration cutover boundary verified."

# From this point through the last pre-public validation, any failure is safe to
# roll back automatically to the still-authoritative legacy stack.
ROLLBACK_ARMED=1

# Legacy Redis contains disposable repository/content caches plus the gradebook
# passback queue. The caches are deliberately NOT migrated; they rebuild from
# authoritative Git repository data. Fail closed on any unknown namespace.
legacy_key_count=0
legacy_cache_count=0
legacy_gradebook_keys=0
while IFS= read -r key; do
    [[ -n "$key" ]] || continue
    legacy_key_count=$((legacy_key_count + 1))
    legacy_redis_key_allowed "$key" || fail "unexpected legacy Redis key namespace: $key"
    case "$key" in
        gradebook) legacy_gradebook_keys=$((legacy_gradebook_keys + 1)) ;;
        activities:*|blob:*|metadata:*) legacy_cache_count=$((legacy_cache_count + 1)) ;;
    esac
done < <(scan_redis_keys "$LEGACY_APP")
[[ "$legacy_gradebook_keys" -le 1 ]] || fail "multiple gradebook keys detected"
echo "Legacy Redis namespaces accepted: ${legacy_key_count} keys (${legacy_cache_count} disposable cache keys; gradebook key count=${legacy_gradebook_keys})"

# Redis 7 comes from the migration acceptance stage and must start with no
# application keys. This guarantees the smoke app cannot process old grades.
modern_initial_keys=0
while IFS= read -r key; do
    [[ -n "$key" ]] || continue
    modern_initial_keys=$((modern_initial_keys + 1))
    fail "unexpected modern Redis key before smoke: $key"
done < <(scan_redis_keys "$REDIS")
[[ "$modern_initial_keys" == "0" ]]

echo "Modern Redis starts empty: PASS"

[[ ! -e "$ENV_BACKUP" ]] || fail "env backup already exists: $ENV_BACKUP"
cp -p "$ENV_CURRENT" "$ENV_BACKUP"
cp -p "$ENV_NEXT" "${ENV_CURRENT}.cutover-tmp"
mv -f "${ENV_CURRENT}.cutover-tmp" "$ENV_CURRENT"
ENV_SWAPPED=1

echo "Modern deployment env activated. Secret values not printed."

if podman container exists "$SMOKE_APP"; then
    fail "$SMOKE_APP already exists"
fi
if podman container exists "$MODERN_APP"; then
    fail "$MODERN_APP already exists"
fi

# Smoke the modern stack while Redis has NO gradebook queue. Every app instance
# has a gradebook worker, so copying the queue before this point could cause
# Canvas passbacks during smoke testing.
run_modern_app "$SMOKE_APP" "$SMOKE_PORT"
wait_http "$SMOKE_PORT" || fail "modern smoke app did not become HTTP-ready"

podman exec -i "$SMOKE_APP" node - <<'NODE'
const config = require('/usr/var/server/config');
const mongo = new URL(config.mongodb.uri);
const sage = new URL(config.sagecellService);
if (mongo.hostname !== 'xronos-mongo7') throw new Error('wrong Mongo host: ' + mongo.hostname);
if (config.redis.url !== 'xronos-redis74') throw new Error('wrong Redis host: ' + config.redis.url);
if (sage.hostname !== 'sagecell') throw new Error('wrong SageCell host: ' + sage.hostname);
console.log('Modern config routing: PASS');
NODE

podman rm -f "$SMOKE_APP" >/dev/null

# Smoke may legitimately warm only the known disposable cache namespaces. It
# must not create a gradebook queue or any unknown application state.
modern_smoke_cache_count=0
while IFS= read -r key; do
    [[ -n "$key" ]] || continue
    modern_smoke_redis_key_allowed "$key" || fail "unexpected modern Redis key after smoke: $key"
    modern_smoke_cache_count=$((modern_smoke_cache_count + 1))
done < <(scan_redis_keys "$REDIS")
echo "Modern smoke Redis state accepted: ${modern_smoke_cache_count} disposable cache keys"

# Snapshot and reproduce the pending gradebook sorted set exactly only AFTER
# smoke validation has completed and the smoke app has been removed.
: > "$QUEUE_SNAPSHOT"
podman exec "$LEGACY_APP" redis-cli --raw ZRANGE gradebook 0 -1 WITHSCORES \
    | awk 'NR % 2 == 1 {member=$0; next} {print member "\t" $0}' \
    > "$QUEUE_SNAPSHOT"
chmod 600 "$QUEUE_SNAPSHOT"

podman exec "$REDIS" redis-cli DEL gradebook >/dev/null
while IFS=$'\t' read -r member score; do
    [[ -n "$member" ]] || continue
    podman exec "$REDIS" redis-cli ZADD gradebook "$score" "$member" >/dev/null
done < "$QUEUE_SNAPSHOT"

legacy_count=$(podman exec "$LEGACY_APP" redis-cli ZCARD gradebook | tr -d '[:space:]')
modern_count=$(podman exec "$REDIS" redis-cli ZCARD gradebook | tr -d '[:space:]')
[[ "$legacy_count" == "$modern_count" ]] || fail "gradebook queue cardinality mismatch"

podman exec "$REDIS" redis-cli --raw ZRANGE gradebook 0 -1 WITHSCORES \
    | awk 'NR % 2 == 1 {member=$0; next} {print member "\t" $0}' \
    > "${QUEUE_SNAPSHOT}.modern"
cmp -s "$QUEUE_SNAPSHOT" "${QUEUE_SNAPSHOT}.modern" || fail "gradebook queue content mismatch"
rm -f "${QUEUE_SNAPSHOT}.modern"
echo "Pending gradebook queue copied exactly: $legacy_count entries"
echo "Legacy disposable Redis caches intentionally left behind."

# Stop the old container only after smoke validation and exact queue copy.
podman stop --time 10 "$LEGACY_APP" >/dev/null || podman kill "$LEGACY_APP" >/dev/null
LEGACY_STOPPED=1
[[ "$(podman inspect "$LEGACY_APP" --format '{{.State.Status}}')" != "running" ]] || fail "legacy container did not stop"

# Integrity and smoke acceptance have passed. Enable normal destination TTL
# maintenance before opening the modern public service.
podman exec "$MONGO" "$shell" --quiet admin --eval '
    var r=db.adminCommand({setParameter:1,ttlMonitorEnabled:true});
    printjson(r); if(!r.ok) quit(2);
' >/dev/null

# This is the rollback boundary. Once a public modern app is started it may
# accept Mongo writes and its gradebook worker may send Canvas passbacks. An
# automatic legacy restart after this point could create divergence/duplicates.
PUBLIC_START_ATTEMPTED=1

run_modern_app "$MODERN_APP" "$PUBLIC_PORT"
wait_http "$PUBLIC_PORT" || fail "modern production app did not become HTTP-ready"

[[ "$(podman inspect "$MODERN_APP" --format '{{.State.Status}}')" == "running" ]] || fail "modern app is not running"
[[ "$(podman inspect "$LEGACY_APP" --format '{{.State.Status}}')" != "running" ]] || fail "legacy app unexpectedly running"

public_code=$(curl -k -sS --max-time 15 -o /tmp/xronos-switch-public.$$ -w '%{http_code}' "$PUBLIC_URL/" || true)
rm -f /tmp/xronos-switch-public.$$
[[ "$public_code" == "200" ]] || fail "public endpoint returned HTTP $public_code"

ROLLBACK_ARMED=0
trap - EXIT INT TERM

echo
echo "============================================================"
echo "MODERN PRODUCTION STACK IS LIVE"
echo "============================================================"
echo "Legacy container: stopped and retained for rollback"
echo "Mongo:             7.0.40 / FCV 7.0"
echo "Redis:             7.4.11"
echo "Modern app:        running on 127.0.0.1:${PUBLIC_PORT}"
echo "Public HTTP:       $public_code"
echo "Gradebook queue:   copied exactly after smoke validation"
echo "Redis caches:      intentionally rebuilt cold"
echo
echo "Do not delete legacy Mongo/container/env backup until post-cutover validation is complete."
