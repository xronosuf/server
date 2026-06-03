#!/usr/bin/env bash
set -Eeuo pipefail

mkdir -p /run/sshd "${SAGECELL_WORKDIR:-/tmp/sagecell}" /var/lib/sagecell
chown -R sage:sage "${SAGECELL_WORKDIR:-/tmp/sagecell}" /var/lib/sagecell

/usr/sbin/sshd

# Fail early if SageCell's localhost provider transport will not work.
su -s /bin/bash sage -c 'ssh -o BatchMode=yes -o ConnectTimeout=5 localhost true'

if [[ "${1:-sagecell}" == "sagecell" ]]; then
    port="${SAGECELL_PORT:-8888}"
    workdir="${SAGECELL_WORKDIR:-/tmp/sagecell}"
    exec su -s /bin/bash sage -c "cd /opt/sagecell && exec sage web_server.py --port '${port}' --dir '${workdir}'"
fi

exec "$@"
