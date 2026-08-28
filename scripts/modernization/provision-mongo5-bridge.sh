#!/bin/bash
set -euo pipefail

APP_CONTAINER=${APP_CONTAINER:-devximserver}
NET=${XRONOS_MODERNIZATION_NETWORK:-xronos-modernization-net}
MONGO_CONTAINER=${XRONOS_MONGO_BRIDGE_CONTAINER:-xronos-mongo5-bridge}
MONGO_VOLUME=${XRONOS_MONGO_BRIDGE_VOLUME:-xronos-mongo5-data}
MONGO_IMAGE=${XRONOS_MONGO_BRIDGE_IMAGE:-docker.io/library/mongo:5.0.31-focal}

usage() {
    cat <<'USAGE'
Usage: scripts/modernization/provision-mongo5-bridge.sh [--create|--status]

--create  Pull the pinned MongoDB bridge image, create the private network and
          persistent volume if needed, attach devximserver to the network, and
          create/start the bridge container. This does not migrate Xronos data.
--status  Show the current bridge/network/volume state without changing it.
USAGE
}

mode=${1:---status}
case "$mode" in
    --create|--status) ;;
    *) usage; exit 2 ;;
esac

show_status() {
    echo "APP_CONTAINER=$APP_CONTAINER"
    echo "NETWORK=$NET"
    echo "MONGO_CONTAINER=$MONGO_CONTAINER"
    echo "MONGO_VOLUME=$MONGO_VOLUME"
    echo "MONGO_IMAGE=$MONGO_IMAGE"
    echo

    podman ps -a --filter "name=^${MONGO_CONTAINER}$" \
        --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' || true

    echo
    if podman network exists "$NET"; then
        echo "Network $NET exists."
    else
        echo "Network $NET does not exist."
    fi

    if podman volume exists "$MONGO_VOLUME"; then
        echo "Volume $MONGO_VOLUME exists."
    else
        echo "Volume $MONGO_VOLUME does not exist."
    fi
}

if [[ "$mode" == "--status" ]]; then
    show_status
    exit 0
fi

podman container exists "$APP_CONTAINER" || {
    echo "ERROR: required application container '$APP_CONTAINER' does not exist." >&2
    exit 1
}

podman pull "$MONGO_IMAGE"

if ! podman network exists "$NET"; then
    podman network create "$NET" >/dev/null
fi

if ! podman volume exists "$MONGO_VOLUME"; then
    podman volume create "$MONGO_VOLUME" >/dev/null
fi

# Network connect is intentionally idempotent. If already attached, Podman may
# return an error, so inspect first rather than masking unrelated failures.
if ! podman inspect "$APP_CONTAINER" --format '{{json .NetworkSettings.Networks}}' | grep -q "\"$NET\""; then
    podman network connect "$NET" "$APP_CONTAINER"
fi

if podman container exists "$MONGO_CONTAINER"; then
    if [[ "$(podman inspect "$MONGO_CONTAINER" --format '{{.State.Running}}')" != "true" ]]; then
        podman start "$MONGO_CONTAINER" >/dev/null
    fi
else
    podman run -d \
        --name "$MONGO_CONTAINER" \
        --network "$NET" \
        --volume "$MONGO_VOLUME:/data/db" \
        --restart=unless-stopped \
        "$MONGO_IMAGE" \
        --bind_ip_all >/dev/null
fi

show_status
