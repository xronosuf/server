#!/usr/bin/env bash
set -Eeuo pipefail

port="${SAGECELL_PORT:-8888}"

curl --max-time 30 -fsS \
  --data-urlencode 'code=print(2+2)' \
  "http://127.0.0.1:${port}/service" \
  | grep -q '4'
