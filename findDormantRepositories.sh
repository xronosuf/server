#!/usr/bin/env bash

set -uo pipefail

SERVER_DIR="/home/ximera/xronosuf/server"
CONTAINER_NAME="xronos"
IMAGE_NAME="ghcr.io/ximeraproject/ximeraserver:v2.9"

cd "$SERVER_DIR"

if podman container exists "$CONTAINER_NAME" &&
   [ "$(podman inspect "$CONTAINER_NAME" --format '{{.State.Running}}')" = "true" ]; then
    podman exec -i "$CONTAINER_NAME" sh -c '
        cd /usr/var/server
        exec node scripts/find-dormant-repositories.js "$@"
    ' sh "$@"
    exit $?
fi

echo "Notice: container '$CONTAINER_NAME' is not running." >&2
echo "Running the read-only census in a temporary container." >&2

podman run --rm \
  --entrypoint sh \
  -v "$SERVER_DIR:/usr/var/server:ro" \
  "$IMAGE_NAME" \
  -lc '
    cd /usr/var/server
    exec node scripts/find-dormant-repositories.js "$@"
  ' sh "$@"
