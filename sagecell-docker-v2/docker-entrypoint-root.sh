#!/usr/bin/env bash
set -Eeuo pipefail

mkdir -p "${SAGECELL_WORKDIR:-/tmp/sagecell}" /var/lib/sagecell

if [[ "${1:-sagecell}" == "sagecell" ]]; then
    port="${SAGECELL_PORT:-8888}"
    export HOME="${HOME:-/root}"
    cd /opt/sagecell
    exec sage web_server.py -p "${port}"
fi

exec "$@"
