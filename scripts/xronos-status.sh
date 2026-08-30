#!/usr/bin/env bash
set -euo pipefail

REPO="${XRONOS_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
APP="${XRONOS_APP_CONTAINER:-devximserver}"
MONGO="${XRONOS_MONGO_CONTAINER:-xronos-mongo7-test}"
REDIS="${XRONOS_REDIS_CONTAINER:-xronos-redis74-bridge}"
SAGE="${XRONOS_SAGE_CONTAINER:-sagecell}"
PUBLIC_URL="${XRONOS_PUBLIC_URL:-https://dev.xronos.clas.ufl.edu}"
APP_PORT="${XRONOS_APP_HOST_PORT:-2022}"

cd "$REPO"

status_of() {
  local name="$1"
  if podman container exists "$name"; then
    podman inspect "$name" --format '{{.State.Status}}'
  else
    printf 'missing\n'
  fi
}

image_of() {
  local name="$1"
  if podman container exists "$name"; then
    podman inspect "$name" --format '{{.ImageName}}'
  else
    printf -- '-\n'
  fi
}

started_of() {
  local name="$1"
  if podman container exists "$name"; then
    podman inspect "$name" --format '{{.State.StartedAt}}'
  else
    printf -- '-\n'
  fi
}

printf '============================================================\n'
printf 'XRONOS STACK STATUS\n'
printf '============================================================\n\n'
printf 'Repository: %s\n' "$REPO"
printf 'Branch:     %s\n' "$(git branch --show-current 2>/dev/null || true)"
printf 'Commit:     %s\n' "$(git rev-parse HEAD 2>/dev/null || true)"
printf 'Public URL: %s\n' "$PUBLIC_URL"
printf '\n%-28s %-10s %-52s %s\n' 'CONTAINER' 'STATUS' 'IMAGE' 'STARTED'
printf '%-28s %-10s %-52s %s\n' '----------------------------' '----------' '----------------------------------------------------' '------------------------------'
for c in "$APP" "$MONGO" "$REDIS" "$SAGE"; do
  printf '%-28s %-10s %-52s %s\n' "$c" "$(status_of "$c")" "$(image_of "$c")" "$(started_of "$c")"
done

printf '\nNetworks:\n'
for n in "${XRONOS_APP_NETWORK:-xronos-modernization-net}" "${XRONOS_SAGE_NETWORK:-xronos-net}"; do
  if podman network exists "$n"; then
    printf '  %-28s present\n' "$n"
  else
    printf '  %-28s MISSING\n' "$n"
  fi
done

printf '\nPersistent data:\n'
for v in "${XRONOS_MONGO_VOLUME:-xronos-mongo7-testdata}" "${XRONOS_SAGE_VOLUME:-sagecell-data}"; do
  if podman volume exists "$v"; then
    printf '  %-28s present\n' "$v"
  else
    printf '  %-28s MISSING\n' "$v"
  fi
done

printf '\nApplication checks:\n'
if [ "$(status_of "$APP")" = running ]; then
  local_code="$(curl -sS --max-time 3 -o /tmp/xronos-status-local.$$ -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/" 2>/dev/null || true)"
  printf '  local HTTP:                  %s\n' "${local_code:-unreachable}"
  rm -f /tmp/xronos-status-local.$$ || true
else
  printf '  local HTTP:                  app not running\n'
fi

public_code="$(curl -k -sS --max-time 5 -o /tmp/xronos-status-public.$$ -w '%{http_code}' "$PUBLIC_URL/" 2>/dev/null || true)"
printf '  public HTTP:                 %s\n' "${public_code:-unreachable}"
rm -f /tmp/xronos-status-public.$$ || true

if [ "$(status_of "$REDIS")" = running ]; then
  redis_ping="$(podman exec "$REDIS" redis-cli ping 2>/dev/null || true)"
  printf '  Redis PING:                  %s\n' "${redis_ping:-failed}"
else
  printf '  Redis PING:                  not running\n'
fi

if [ "$(status_of "$MONGO")" = running ]; then
  mongo_ping="$(podman exec "$MONGO" mongosh --quiet --eval 'db.adminCommand({ping:1}).ok' 2>/dev/null || true)"
  printf '  Mongo PING:                  %s\n' "${mongo_ping:-failed}"
else
  printf '  Mongo PING:                  not running\n'
fi

if [ "$(status_of "$SAGE")" = running ]; then
  sage_health="$(podman inspect "$SAGE" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' 2>/dev/null || true)"
  printf '  SageCell health:             %s\n' "${sage_health:-unknown}"
else
  printf '  SageCell health:             not running\n'
fi

workers=0
printf '\nGradebook workers:\n'
while IFS= read -r c; do
  [ -n "$c" ] || continue
  if podman exec "$c" test -f /usr/var/server/routes/gradebook.js >/dev/null 2>&1 \
     && podman exec "$c" /bin/sh -lc 'grep -q "setInterval( process, 10000 )" /usr/var/server/routes/gradebook.js' >/dev/null 2>&1; then
    printf '  %s\n' "$c"
    workers=$((workers + 1))
  fi
done < <(podman ps --format '{{.Names}}')
printf '  count=%d\n' "$workers"
if [ "$workers" -gt 1 ]; then
  printf '  WARNING: multiple application workers can compete for the shared gradebook queue.\n'
fi

printf '\n============================================================\n'
printf 'STATUS COMPLETE\n'
printf '============================================================\n'
