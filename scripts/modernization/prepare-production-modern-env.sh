#!/bin/bash
set -euo pipefail

SOURCE=${1:-/home/ximera/xronosuf/server/repositories/.env}
DEST=${2:-/home/ximera/xronosuf/server/repositories/.env.modernization-next}

[[ -f "$SOURCE" ]] || { echo "ERROR: source env missing: $SOURCE" >&2; exit 1; }
[[ "$SOURCE" != "$DEST" ]] || { echo "ERROR: source and destination must differ" >&2; exit 1; }

SOURCE_MODE=$(stat -c '%a' "$SOURCE")
case "$SOURCE_MODE" in
    600|660) ;;
    *) echo "ERROR: source env mode must be 600 or 660, found $SOURCE_MODE" >&2; exit 1 ;;
esac

python3 - "$SOURCE" "$DEST" "$SOURCE_MODE" <<'PY'
from pathlib import Path
import os
import re
import sys

src = Path(sys.argv[1])
dst = Path(sys.argv[2])
mode = int(sys.argv[3], 8)

updates = {
    "XIMERA_START_MONGODB": "0",
    "XIMERA_START_REDIS": "0",
    "XIMERA_MONGO_URI": "mongodb://xronos-mongo7:27017/ximera",
    "XIMERA_REDIS_URL": "xronos-redis74",
    "XIMERA_REDIS_PORT": "6379",
    "SAGECELL_SERVICE": "http://sagecell:8888/service",
}

lines = src.read_text().splitlines()
seen = set()
out = []
pat = re.compile(r"^(\s*)(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=.*$")

for line in lines:
    m = pat.match(line)
    if m and m.group(2) in updates:
        key = m.group(2)
        if key not in seen:
            out.append(f"export {key}={updates[key]}")
            seen.add(key)
        continue
    out.append(line)

if out and out[-1] != "":
    out.append("")
out.append("# Xronos modernization external-service overrides")
for key, value in updates.items():
    if key not in seen:
        out.append(f"export {key}={value}")

text = "\n".join(out) + "\n"
tmp = dst.with_name(dst.name + ".tmp")
tmp.write_text(text)
os.chmod(tmp, mode)
os.replace(tmp, dst)
os.chmod(dst, mode)
PY

[[ "$(stat -c '%a' "$DEST")" == "$SOURCE_MODE" ]] || {
    echo "ERROR: destination mode does not match source mode $SOURCE_MODE" >&2
    exit 1
}

# Validate only non-secret modernization routing values. Never print the full env.
for expected in \
    'XIMERA_START_MONGODB=0' \
    'XIMERA_START_REDIS=0' \
    'XIMERA_MONGO_URI=mongodb://xronos-mongo7:27017/ximera' \
    'XIMERA_REDIS_URL=xronos-redis74' \
    'XIMERA_REDIS_PORT=6379' \
    'SAGECELL_SERVICE=http://sagecell:8888/service'
do
    key=${expected%%=*}
    value=${expected#*=}
    actual=$(sed -n -E "s/^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=[[:space:]]*(.*)$/\\2/p" "$DEST" | tail -1)
    [[ "$actual" == "$value" ]] || { echo "ERROR: $key was not staged correctly" >&2; exit 1; }
done

echo "Prepared modernization env: $DEST"
echo "Mode preserved from source: $SOURCE_MODE"
echo "Mongo: xronos-mongo7:27017/ximera"
echo "Redis: xronos-redis74:6379"
echo "SageCell: sagecell:8888/service"
echo "Bundled Mongo/Redis: disabled"
echo "Secret values were preserved but not printed."
