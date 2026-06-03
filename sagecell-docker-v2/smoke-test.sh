#!/usr/bin/env bash
set -Eeuo pipefail

image="${1:-local/sagecell-xronos}"
container="sagecell-smoke-$$"
port="${SAGECELL_TEST_PORT:-8888}"

cleanup() {
    podman rm -f "$container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

podman run -d --name "$container" -p "${port}:8888" "$image" >/dev/null

# Give SageCell time to start Sage and prefork the first kernel.
for i in {1..80}; do
    if curl -fsS -X POST --data-urlencode 'code=print(2+2)' "http://127.0.0.1:${port}/service" | grep -q '4'; then
        echo "SageCell smoke test passed."
        exit 0
    fi
    sleep 3
done

echo "SageCell smoke test failed; recent logs:" >&2
podman logs "$container" >&2 || true
exit 1
