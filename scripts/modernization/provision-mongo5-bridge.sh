#!/bin/bash
set -euo pipefail

APP_CONTAINER=${APP_CONTAINER:-devximserver}
NET=${XRONOS_MODERNIZATION_NETWORK:-xronos-modernization-net}
MONGO_CONTAINER=${XRONOS_MONGO_BRIDGE_CONTAINER:-xronos-mongo5-bridge}
MONGO_VOLUME=${XRONOS_MONGO_BRIDGE_VOLUME:-xronos-mongo5-data}
MONGO_IMAGE=${XRONOS_MONGO_BRIDGE_IMAGE:-docker.io/library/mongo:5.0.31-focal}
MONGO_ENTRYPOINT=${XRONOS_MONGO_BRIDGE_ENTRYPOINT:-/usr/bin/mongod}

usage() {
    cat <<'USAGE'
Usage: scripts/modernization/provision-mongo5-bridge.sh [--create|--status]

--create  Pull the pinned MongoDB bridge image, create the private network and
          persistent volume if needed, attach devximserver to the network, and
          create/start the bridge container. This does not migrate Xronos data.
          A stopped bridge container is recreated while preserving its named
          data volume. The Mongo image's Docker entrypoint is bypassed because
          the Xronos test host cannot execute that wrapper; mongod is launched
          directly instead.
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
    echo "MONGO_ENTRYPOINT=$MONGO_ENTRYPOINT"
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

# A stopped bridge container is safe to recreate here because the database data
# lives in the named volume, not in the container writable layer. This also
# repairs containers created before we began bypassing the image entrypoint.
if podman container exists "$MONGO_CONTAINER"; then
    if [[ "$(podman inspect "$MONGO_CONTAINER" --format '{{.State.Running}}')" == "true" ]]; then
        echo "MongoDB bridge container is already running; leaving it unchanged."
        show_status
        exit 0
    fi

    echo "Recreating stopped MongoDB bridge container (preserving volume $MONGO_VOLUME)."
    podman rm "$MONGO_CONTAINER" >/dev/null
fi

podman run -d \
    --name "$MONGO_CONTAINER" \
    --network "$NET" \
    --volume "$MONGO_VOLUME:/data/db" \
    --restart=unless-stopped \
    --entrypoint "$MONGO_ENTRYPOINT" \
    "$MONGO_IMAGE" \
    --bind_ip_all >/dev/null

show_status
