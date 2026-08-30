#!/bin/bash
set -euo pipefail

SOURCE=${1:?usage: prepare-cutover-migration-runner.sh SOURCE DEST}
DEST=${2:?usage: prepare-cutover-migration-runner.sh SOURCE DEST}

python3 - "$SOURCE" "$DEST" <<'PY'
from pathlib import Path
import sys

src = Path(sys.argv[1])
dst = Path(sys.argv[2])
text = src.read_text()

old = '''NODE_PID=""
SOURCE_TTL_WAS=""
SOURCE_QUIESCED=0
DEST_TTL_DISABLED=0

cleanup() {
    local rc=$?
    set +e

    if [[ "$SOURCE_QUIESCED" == "1" ]]; then
        if [[ -n "$SOURCE_TTL_WAS" ]]; then
            source_mongo admin --eval \\
                "var r=db.adminCommand({setParameter:1,ttlMonitorEnabled:${SOURCE_TTL_WAS}}); if(!r.ok){printjson(r);quit(2);}" \\
                >/dev/null 2>&1 || echo "WARNING: failed to restore source TTL monitor." >&2
        fi
        if [[ -n "$NODE_PID" ]]; then
            podman exec "$APP_CONTAINER" kill -CONT "$NODE_PID" \\
                >/dev/null 2>&1 || echo "WARNING: failed to resume production node process." >&2
        fi
    fi

    exit "$rc"
}
'''

new = '''NODE_PID=""
SOURCE_TTL_WAS=""
SOURCE_QUIESCED=0
DEST_TTL_DISABLED=0
CUTOVER_VALIDATED=0

cleanup() {
    local rc=$?
    set +e

    if [[ "$SOURCE_QUIESCED" == "1" ]]; then
        if [[ "$rc" -ne 0 || "$CUTOVER_VALIDATED" != "1" ]]; then
            if [[ -n "$SOURCE_TTL_WAS" ]]; then
                source_mongo admin --eval \\
                    "var r=db.adminCommand({setParameter:1,ttlMonitorEnabled:${SOURCE_TTL_WAS}}); if(!r.ok){printjson(r);quit(2);}" \\
                    >/dev/null 2>&1 || echo "WARNING: failed to restore source TTL monitor." >&2
            fi
            if [[ -n "$NODE_PID" ]]; then
                podman exec "$APP_CONTAINER" kill -CONT "$NODE_PID" \\
                    >/dev/null 2>&1 || echo "WARNING: failed to resume production node process." >&2
            fi
        else
            echo "CUTOVER VALIDATED: legacy Xronos remains frozen; source TTL remains disabled."
            echo "Proceed with the explicit modern-stack switch."
        fi
    fi

    exit "$rc"
}
'''

if text.count(old) != 1:
    raise SystemExit("ERROR: expected cleanup block not found exactly once")

text = text.replace(old, new)

marker = 'echo "The original host MongoDB is not upgraded."\n'
insert = '''echo "The original host MongoDB is not upgraded."\n\nif [[ "$MODE" == "--cutover-quiesced" ]]; then\n    CUTOVER_VALIDATED=1\n    echo\n    echo "SAFE FOR CUTOVER: frozen source matched migrated Mongo 7 exactly."\n    echo "Legacy Xronos will remain frozen on successful exit."\n    echo "Source TTL will remain disabled until rollback or retirement."\nfi\n'''

if text.count(marker) != 1:
    raise SystemExit("ERROR: final migration marker not found exactly once")
text = text.replace(marker, insert)

dst.write_text(text)
PY

chmod 700 "$DEST"
bash -n "$DEST"

echo "Prepared cutover runner: $DEST"
echo "Migration body preserved; only successful quiesced-exit behavior changed."
