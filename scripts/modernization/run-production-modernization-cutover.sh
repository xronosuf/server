#!/bin/bash
set -euo pipefail

MODE=${1:---help}

EXPECTED_HOST=${XRONOS_EXPECTED_HOST:-ls-xronos01}
PROD_REPO=${XRONOS_REPO:-/home/ximera/xronosuf/server}
TOOL_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
EXPECTED_TOOLING_COMMIT=${XRONOS_EXPECTED_TOOLING_COMMIT:-}

LEGACY_APP=${XRONOS_LEGACY_APP_CONTAINER:-xronos}
FINAL_MONGO=${XRONOS_MONGO_CONTAINER:-xronos-mongo7}
FINAL_MONGO_VOLUME=${XRONOS_MONGO_VOLUME:-xronos-mongo7-data}
FINAL_REDIS=${XRONOS_REDIS_CONTAINER:-xronos-redis74}
SAGE=${XRONOS_SAGE_CONTAINER:-sagecell}
NETWORK=${XRONOS_MODERNIZATION_NETWORK:-xronos-modernization-net}
SAGE_NETWORK=${XRONOS_SAGE_NETWORK:-xronos-net}
RUN_ROOT=${XRONOS_MONGO_MIGRATION_RUN_ROOT:-/home/ximera/mongo-migration-cutover}

ENV_CURRENT=${XRONOS_ENV_CURRENT:-$PROD_REPO/repositories/.env}
ENV_NEXT=${XRONOS_ENV_NEXT:-$PROD_REPO/repositories/.env.modernization-next}
ENV_BACKUP=${XRONOS_ENV_BACKUP:-$PROD_REPO/repositories/.env.pre-modernization-cutover}
QUEUE_SNAPSHOT=${XRONOS_QUEUE_SNAPSHOT:-/home/ximera/xronos-gradebook-cutover.tsv}

MONGO5_IMAGE=${XRONOS_MONGO5_IMAGE:-docker.io/library/mongo:5.0.31}
MONGO6_IMAGE=${XRONOS_MONGO6_IMAGE:-docker.io/library/mongo:6.0.27}
MONGO7_IMAGE=${XRONOS_MONGO7_IMAGE:-docker.io/library/mongo:7.0.40}
REDIS_IMAGE=${XRONOS_REDIS7_IMAGE:-docker.io/library/redis:7.4.11-bookworm}
APP_IMAGE=${XRONOS_APP_IMAGE:-localhost/xronos-server:55d59b2}

MIGRATION="$TOOL_ROOT/scripts/modernization/migrate-production-mongo3-to-mongo7.sh"
PREP_CUTOVER="$TOOL_ROOT/scripts/modernization/prepare-cutover-migration-runner.sh"
PREP_ENV="$TOOL_ROOT/scripts/modernization/prepare-production-modern-env.sh"
SWITCH="$TOOL_ROOT/scripts/modernization/switch-production-to-modern-stack.sh"

usage() {
    cat <<'USAGE'
Usage:
  scripts/modernization/run-production-modernization-cutover.sh --preflight
  scripts/modernization/run-production-modernization-cutover.sh --cutover

--preflight
    Read-only production readiness check. It verifies host, production checkout,
    exact tooling commit when supplied, images, networks, destination freshness,
    legacy Mongo/Redis/Sage health, known Redis namespaces, cutover-runner
    generation, and modernization env staging to a temporary file. It does not
    quiesce production or alter MongoDB, Redis, containers, or production env.

--cutover
    Maintenance-window conductor. Requires BOTH:

      XRONOS_ALLOW_PRODUCTION_CUTOVER=YES
      XRONOS_EXPECTED_TOOLING_COMMIT=<verified legacy-modernization commit>

    It stages repositories/.env.modernization-next, generates the cutover-safe
    variant of the proven migration script, runs the frozen-source Mongo 3.2 ->
    7 migration using the permanent xronos-mongo7 / xronos-redis74 resources,
    then immediately invokes the guarded modern-stack switch.

    Before public modern startup, failures are designed to restore the legacy
    application/source TTL state. Once public modern startup is attempted,
    automatic legacy rollback is intentionally disabled because Mongo writes or
    Canvas grade passbacks may already have occurred.
USAGE
}

case "$MODE" in
    --preflight|--cutover) ;;
    --help|-h|help) usage; exit 0 ;;
    *) usage; exit 2 ;;
esac

fail() {
    echo "ERROR: $*" >&2
    exit 1
}

scan_keys() {
    podman exec "$1" redis-cli --raw --scan
}

legacy_key_allowed() {
    case "$1" in
        gradebook|activities:*|blob:*|metadata:*) return 0 ;;
        *) return 1 ;;
    esac
}

require_file() {
    [[ -f "$1" ]] || fail "required tooling file missing: $1"
    bash -n "$1" || fail "shell syntax check failed: $1"
}

check_common() {
    echo "============================================================"
    echo "XRONOS PRODUCTION MODERNIZATION — ${MODE#--}"
    echo "============================================================"

    [[ "$(hostname -s)" == "$EXPECTED_HOST" ]] || fail "wrong host"
    [[ -d "$PROD_REPO/.git" ]] || fail "production repository missing: $PROD_REPO"

    PROD_BRANCH=$(git -C "$PROD_REPO" branch --show-current)
    PROD_HEAD=$(git -C "$PROD_REPO" rev-parse HEAD)
    TOOLING_COMMIT=$(git -C "$TOOL_ROOT" rev-parse HEAD)

    echo "Host:               $(hostname -s)"
    echo "Production branch:  $PROD_BRANCH"
    echo "Production commit:  $PROD_HEAD"
    echo "Tooling commit:     $TOOLING_COMMIT"

    [[ "$PROD_BRANCH" == "podman" ]] || fail "production checkout must remain on podman"

    if [[ -n "$EXPECTED_TOOLING_COMMIT" ]]; then
        [[ "$TOOLING_COMMIT" == "$EXPECTED_TOOLING_COMMIT" ]] || \
            fail "tooling commit mismatch: expected $EXPECTED_TOOLING_COMMIT, found $TOOLING_COMMIT"
        echo "Verified tooling commit: PASS"
    elif [[ "$MODE" == "--cutover" ]]; then
        fail "cutover requires XRONOS_EXPECTED_TOOLING_COMMIT"
    else
        echo "Verified tooling commit: not pinned (preflight only)"
    fi

    require_file "$MIGRATION"
    require_file "$PREP_CUTOVER"
    require_file "$PREP_ENV"
    require_file "$SWITCH"

    [[ -f "$ENV_CURRENT" ]] || fail "production env missing: $ENV_CURRENT"
    ENV_MODE=$(stat -c '%a' "$ENV_CURRENT")
    case "$ENV_MODE" in
        600|660) ;;
        *) fail "production env mode must be 600 or 660, found $ENV_MODE" ;;
    esac
    echo "Production env mode: $ENV_MODE"

    for image in "$MONGO5_IMAGE" "$MONGO6_IMAGE" "$MONGO7_IMAGE" "$REDIS_IMAGE" "$APP_IMAGE"; do
        podman image exists "$image" || fail "required image missing: $image"
    done
    echo "Required images: PASS"

    podman network exists "$NETWORK" || fail "network missing: $NETWORK"
    podman network exists "$SAGE_NETWORK" || fail "network missing: $SAGE_NETWORK"
    echo "Required networks: PASS"

    [[ "$(podman inspect "$LEGACY_APP" --format '{{.State.Status}}')" == "running" ]] || \
        fail "legacy app must be running"
    [[ "$(podman inspect "$SAGE" --format '{{.State.Status}}')" == "running" ]] || \
        fail "SageCell must be running"
    [[ "$(podman inspect "$SAGE" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')" == "healthy" ]] || \
        fail "SageCell must be healthy"

    SOURCE_VERSION=$(mongo --quiet --host 127.0.0.1 --port 27017 --eval 'print(db.version())' | tail -1 | tr -d '[:space:]')
    [[ "$SOURCE_VERSION" == "3.2.22" ]] || fail "expected source Mongo 3.2.22, found $SOURCE_VERSION"
    echo "Legacy Mongo: 3.2.22 PASS"

    [[ "$(podman exec "$LEGACY_APP" redis-cli ping)" == "PONG" ]] || fail "legacy Redis is not ready"

    redis_total=0
    redis_cache=0
    redis_gradebook=0
    while IFS= read -r key; do
        [[ -n "$key" ]] || continue
        redis_total=$((redis_total + 1))
        legacy_key_allowed "$key" || fail "unexpected legacy Redis key namespace: $key"
        case "$key" in
            gradebook) redis_gradebook=$((redis_gradebook + 1)) ;;
            activities:*|blob:*|metadata:*) redis_cache=$((redis_cache + 1)) ;;
        esac
    done < <(scan_keys "$LEGACY_APP")
    [[ "$redis_gradebook" -le 1 ]] || fail "multiple gradebook keys detected"

    gradebook_type=$(podman exec "$LEGACY_APP" redis-cli --raw TYPE gradebook | tr -d '\r\n')
    case "$gradebook_type" in
        none) gradebook_entries=0 ;;
        zset) gradebook_entries=$(podman exec "$LEGACY_APP" redis-cli ZCARD gradebook | tr -d '[:space:]') ;;
        *) fail "gradebook key has unexpected type: $gradebook_type" ;;
    esac

    echo "Legacy Redis: ${redis_total} keys; ${redis_cache} disposable cache keys; ${gradebook_entries} queued gradebook entries"

    if podman container exists "$FINAL_MONGO"; then
        fail "final Mongo container already exists: $FINAL_MONGO"
    fi
    if podman container exists "$FINAL_REDIS"; then
        fail "final Redis container already exists: $FINAL_REDIS"
    fi

    if podman volume exists "$FINAL_MONGO_VOLUME"; then
        VOLUME_PATH=$(podman volume inspect "$FINAL_MONGO_VOLUME" --format '{{.Mountpoint}}')
        if find "$VOLUME_PATH" -mindepth 1 -print -quit | grep -q .; then
            fail "final Mongo volume is not empty: $FINAL_MONGO_VOLUME"
        fi
        echo "Final Mongo volume exists and is empty: PASS"
    else
        echo "Final Mongo volume absent; migration will create it."
    fi

    if [[ -e "$RUN_ROOT" ]] && find "$RUN_ROOT" -mindepth 1 -print -quit | grep -q .; then
        fail "cutover run root is not fresh: $RUN_ROOT"
    fi
    echo "Cutover run root freshness: PASS"
}

check_preflight_artifacts() {
    local tmp=$1
    local runner="$tmp/migrate-production-mongo3-to-mongo7-cutover.sh"
    local env_test="$tmp/.env.modernization-test"

    bash "$PREP_CUTOVER" "$MIGRATION" "$runner"
    bash -n "$runner"
    grep -Fq 'CUTOVER_VALIDATED=0' "$runner" || fail "generated runner lacks CUTOVER_VALIDATED guard"
    grep -Fq 'SAFE FOR CUTOVER: frozen source matched migrated Mongo 7 exactly.' "$runner" || \
        fail "generated runner lacks successful frozen-source marker"
    grep -Fq 'Legacy Xronos will remain frozen on successful exit.' "$runner" || \
        fail "generated runner lacks frozen-success behavior"
    echo "Generated cutover migration runner: PASS"

    bash "$PREP_ENV" "$ENV_CURRENT" "$env_test"
    [[ "$(stat -c '%a' "$env_test")" == "$ENV_MODE" ]] || fail "temporary staged env mode mismatch"
    echo "Temporary modern env staging: PASS"
}

TMP=$(mktemp -d /tmp/xronos-production-cutover.XXXXXX)
cleanup_tmp() {
    rm -rf "$TMP"
}
trap cleanup_tmp EXIT

check_common
check_preflight_artifacts "$TMP"

if [[ "$MODE" == "--preflight" ]]; then
    HTTP=$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' https://xronos.clas.ufl.edu/ || true)
    echo "Public production HTTP: $HTTP"
    [[ "$HTTP" == "200" ]] || fail "production HTTP health check failed"

    echo
    echo "============================================================"
    echo "PREFLIGHT PASS"
    echo "============================================================"
    echo "No production state was changed."
    exit 0
fi

[[ "${XRONOS_ALLOW_PRODUCTION_CUTOVER:-NO}" == "YES" ]] || \
    fail "cutover requires XRONOS_ALLOW_PRODUCTION_CUTOVER=YES"

[[ ! -e "$ENV_NEXT" ]] || fail "staged modern env already exists: $ENV_NEXT"
[[ ! -e "$ENV_BACKUP" ]] || fail "cutover env backup already exists: $ENV_BACKUP"
[[ ! -e "$QUEUE_SNAPSHOT" ]] || fail "gradebook queue snapshot already exists: $QUEUE_SNAPSHOT"

RUNNER="$TMP/migrate-production-mongo3-to-mongo7-cutover.sh"

# Recreate the generated runner after authorization so the exact file about to
# execute is derived from the already-verified migration body in this tooling
# checkout.
bash "$PREP_CUTOVER" "$MIGRATION" "$RUNNER"
bash -n "$RUNNER"

# Stage secrets/routing without replacing the live production env yet.
bash "$PREP_ENV" "$ENV_CURRENT" "$ENV_NEXT"
[[ "$(stat -c '%a' "$ENV_NEXT")" == "$ENV_MODE" ]] || fail "staged production env mode mismatch"

echo
echo "============================================================"
echo "BEGINNING AUTHORIZED MAINTENANCE-WINDOW CUTOVER"
echo "============================================================"
echo "Tooling commit: $TOOLING_COMMIT"
echo "Destination Mongo: $FINAL_MONGO / $FINAL_MONGO_VOLUME"
echo "Destination Redis: $FINAL_REDIS"
echo "Migration run root: $RUN_ROOT"
echo

# The generated runner differs from the proven rehearsal migration only in its
# successful --cutover-quiesced cleanup behavior: validated success leaves the
# legacy Node process frozen and source TTL disabled for the switch handoff.
cd "$PROD_REPO"
env \
    XRONOS_ALLOW_PRODUCTION_QUIESCE=YES \
    XRONOS_EXPECTED_HOST="$EXPECTED_HOST" \
    XRONOS_APP_CONTAINER="$LEGACY_APP" \
    XRONOS_MODERNIZATION_NETWORK="$NETWORK" \
    XRONOS_MONGO_REHEARSAL_CONTAINER="$FINAL_MONGO" \
    XRONOS_MONGO_REHEARSAL_VOLUME="$FINAL_MONGO_VOLUME" \
    XRONOS_REDIS_REHEARSAL_CONTAINER="$FINAL_REDIS" \
    XRONOS_MONGO_MIGRATION_RUN_ROOT="$RUN_ROOT" \
    XRONOS_MONGO5_IMAGE="$MONGO5_IMAGE" \
    XRONOS_MONGO6_IMAGE="$MONGO6_IMAGE" \
    XRONOS_MONGO7_IMAGE="$MONGO7_IMAGE" \
    XRONOS_REDIS7_IMAGE="$REDIS_IMAGE" \
    XRONOS_MODERN_APP_IMAGE="$APP_IMAGE" \
    bash "$RUNNER" --cutover-quiesced

echo
echo "============================================================"
echo "FROZEN-SOURCE MIGRATION PASSED — HANDING OFF TO STACK SWITCH"
echo "============================================================"

# No interactive pause here: successful migration intentionally leaves legacy
# frozen. The switch script owns rollback from this point until its explicit
# public-modern-app boundary.
env \
    XRONOS_ALLOW_PRODUCTION_SWITCH=YES \
    XRONOS_EXPECTED_HOST="$EXPECTED_HOST" \
    XRONOS_REPO="$PROD_REPO" \
    XRONOS_LEGACY_APP_CONTAINER="$LEGACY_APP" \
    XRONOS_MONGO_CONTAINER="$FINAL_MONGO" \
    XRONOS_REDIS_CONTAINER="$FINAL_REDIS" \
    XRONOS_SAGE_CONTAINER="$SAGE" \
    XRONOS_APP_NETWORK="$NETWORK" \
    XRONOS_SAGE_NETWORK="$SAGE_NETWORK" \
    XRONOS_APP_IMAGE="$APP_IMAGE" \
    XRONOS_ENV_CURRENT="$ENV_CURRENT" \
    XRONOS_ENV_NEXT="$ENV_NEXT" \
    XRONOS_ENV_BACKUP="$ENV_BACKUP" \
    XRONOS_QUEUE_SNAPSHOT="$QUEUE_SNAPSHOT" \
    bash "$SWITCH"

echo
echo "============================================================"
echo "XRONOS PRODUCTION MODERNIZATION CUTOVER COMPLETE"
echo "============================================================"
echo "Tooling commit:     $TOOLING_COMMIT"
echo "Modern Mongo:       $FINAL_MONGO"
echo "Modern Redis:       $FINAL_REDIS"
echo "Legacy container:   retained for rollback review"
echo "Migration evidence: $RUN_ROOT"
echo "Queue snapshot:     $QUEUE_SNAPSHOT"
echo "Env backup:         $ENV_BACKUP"
echo
echo "Do not delete rollback/evidence artifacts until post-cutover validation is complete."
