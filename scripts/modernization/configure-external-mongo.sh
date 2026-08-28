#!/bin/bash
set -euo pipefail

APP_CONTAINER=${APP_CONTAINER:-devximserver}
ENV_FILE=${XRONOS_ENV_FILE:-/home/ximera/xronosuf/server/repositories/.env}
MONGO_CONTAINER=${XRONOS_MONGO_BRIDGE_CONTAINER:-xronos-mongo5-bridge}
MONGO_URI=${XIMERA_MONGO_URI:-mongodb://${MONGO_CONTAINER}:27017/ximera}
BACKUP_DIR=${XRONOS_ENV_BACKUP_DIR:-/home/ximera/xronos-mongo-migration/env-backups}
STATE_FILE=${XRONOS_ENV_BACKUP_STATE:-/home/ximera/xronos-mongo-migration/latest-env-backup}

usage() {
    cat <<'USAGE'
Usage: scripts/modernization/configure-external-mongo.sh [--check|--apply|--rollback]

--check     Show only the external-Mongo-related configuration state. Never
            prints the rest of repositories/.env.
--apply     Back up repositories/.env, atomically set XIMERA_START_MONGODB=0
            and XIMERA_MONGO_URI to the configured bridge URI, and record the
            backup path for rollback. Does NOT restart the application.
--rollback  Restore the .env backup recorded by the most recent --apply. Does
            NOT restart the application.
USAGE
}

mode=${1:---check}
case "$mode" in
    --check|--apply|--rollback) ;;
    *) usage; exit 2 ;;
esac

show_setting() {
    key=$1
    if [[ ! -f "$ENV_FILE" ]]; then
        echo "$key=<env file missing>"
        return
    fi

    # Report presence/value only for the explicitly requested modernization
    # settings. Do not expose unrelated .env contents or secrets.
    value=$(awk -v key="$key" '
        $0 ~ "^[[:space:]]*(export[[:space:]]+)?" key "[[:space:]]*=" {
            line=$0
            sub("^[[:space:]]*(export[[:space:]]+)?" key "[[:space:]]*=[[:space:]]*", "", line)
            found=line
        }
        END { if (found != "") print found }
    ' "$ENV_FILE")

    if [[ -n "$value" ]]; then
        echo "$key=$value"
    else
        echo "$key=<unset>"
    fi
}

check_bridge() {
    podman container exists "$MONGO_CONTAINER" || {
        echo "ERROR: MongoDB bridge container '$MONGO_CONTAINER' does not exist." >&2
        exit 1
    }

    if [[ "$(podman inspect "$MONGO_CONTAINER" --format '{{.State.Running}}')" != "true" ]]; then
        echo "ERROR: MongoDB bridge container '$MONGO_CONTAINER' is not running." >&2
        exit 1
    fi

    podman exec "$MONGO_CONTAINER" mongo --quiet --eval \
        'quit(db.adminCommand({ping:1}).ok ? 0 : 1)' >/dev/null
}

show_state() {
    echo "ENV_FILE=$ENV_FILE"
    echo "MONGO_CONTAINER=$MONGO_CONTAINER"
    echo "TARGET_MONGO_URI=$MONGO_URI"
    show_setting XIMERA_START_MONGODB
    show_setting XIMERA_MONGO_URI

    if [[ -f "$STATE_FILE" ]]; then
        echo "ROLLBACK_BACKUP_RECORDED=yes"
    else
        echo "ROLLBACK_BACKUP_RECORDED=no"
    fi
}

if [[ "$mode" == "--check" ]]; then
    show_state
    exit 0
fi

if [[ "$mode" == "--rollback" ]]; then
    if [[ ! -f "$STATE_FILE" ]]; then
        echo "ERROR: no rollback backup has been recorded at $STATE_FILE" >&2
        exit 1
    fi

    backup=$(cat "$STATE_FILE")
    if [[ -z "$backup" || ! -f "$backup" ]]; then
        echo "ERROR: recorded rollback backup is missing." >&2
        exit 1
    fi

    echo "Restoring repositories/.env from recorded backup."
    cp -p "$backup" "$ENV_FILE"
    rm -f "$STATE_FILE"
    echo "Rollback configuration restored. Application restart is still required."
    show_state
    exit 0
fi

# --apply
check_bridge

if [[ ! -f "$ENV_FILE" ]]; then
    echo "ERROR: expected deployment environment file does not exist: $ENV_FILE" >&2
    exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
mkdir -p "$(dirname "$STATE_FILE")"

stamp=$(date +%Y%m%d_%H%M%S)
backup="$BACKUP_DIR/repositories.env.$stamp"
cp -p "$ENV_FILE" "$backup"
chmod 600 "$backup"
printf '%s\n' "$backup" > "$STATE_FILE"
chmod 600 "$STATE_FILE"

tmp=$(mktemp "$(dirname "$ENV_FILE")/.env.external-mongo.XXXXXX")
cleanup_tmp() {
    rm -f "$tmp"
}
trap cleanup_tmp EXIT

awk '
    !/^[[:space:]]*(export[[:space:]]+)?XIMERA_START_MONGODB[[:space:]]*=/ &&
    !/^[[:space:]]*(export[[:space:]]+)?XIMERA_MONGO_URI[[:space:]]*=/
' "$ENV_FILE" > "$tmp"

printf '\n# Xronos legacy modernization: external MongoDB\n' >> "$tmp"
printf 'XIMERA_START_MONGODB=0\n' >> "$tmp"
printf "XIMERA_MONGO_URI='%s'\n" "$MONGO_URI" >> "$tmp"

chmod --reference="$ENV_FILE" "$tmp" 2>/dev/null || chmod 600 "$tmp"
chown --reference="$ENV_FILE" "$tmp" 2>/dev/null || true
mv "$tmp" "$ENV_FILE"
trap - EXIT

echo "External MongoDB configuration applied."
echo "Backup recorded without displaying its contents: $backup"
echo "Application has NOT been restarted."
show_state
