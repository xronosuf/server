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
          A bridge container whose configuration does not match this script is
          recreated while preserving its named data volume. The Mongo image's
          Docker entrypoint is bypassed because the Xronos test host cannot
          execute that wrapper; mongod is launched directly instead.
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

create_bridge=1
if podman container exists "$MONGO_CONTAINER"; then
    configured_entrypoint=$(podman inspect "$MONGO_CONTAINER" --format '{{json .Config.Entrypoint}}')
    configured_image=$(podman inspect "$MONGO_CONTAINER" --format '{{.ImageName}}')

    if [[ "$configured_entrypoint" == *"$MONGO_ENTRYPOINT"* ]] && \
       [[ "$configured_image" == "$MONGO_IMAGE" ]]; then
        create_bridge=0

        if [[ "$(podman inspect "$MONGO_CONTAINER" --format '{{.State.Running}}')" != "true" ]]; then
            echo "Starting existing correctly configured MongoDB bridge container."
            podman start "$MONGO_CONTAINER" >/dev/null
        else
            echo "MongoDB bridge container is already running with the expected configuration."
        fi
    else
        echo "Existing MongoDB bridge configuration does not match the repository definition."
        echo "Configured image:      $configured_image"
        echo "Configured entrypoint: $configured_entrypoint"
        echo "Expected image:        $MONGO_IMAGE"
        echo "Expected entrypoint:   $MONGO_ENTRYPOINT"
        echo "Recreating bridge container while preserving volume $MONGO_VOLUME."

        # -f is intentional: an old container may be caught in a restart loop.
        # The named database volume is not removed.
        podman rm -f "$MONGO_CONTAINER" >/dev/null
    fi
fi

if [[ "$create_bridge" == "1" ]]; then
    podman run -d \
        --name "$MONGO_CONTAINER" \
        --network "$NET" \
        --volume "$MONGO_VOLUME:/data/db" \
        --entrypoint "$MONGO_ENTRYPOINT" \
        "$MONGO_IMAGE" \
        --bind_ip_all >/dev/null
fi

show_status
