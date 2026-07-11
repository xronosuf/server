#!/usr/bin/env bash

set -uo pipefail

SERVER_DIR="/home/ximera/xronosuf/server"
CONTAINER_NAME="xronos"

cd "$SERVER_DIR"

course_name=""
execute_mode=false
prepare_mode=false

args=("$@")

for ((i=0; i<${#args[@]}; i++)); do
    case "${args[$i]}" in
        --course|--repo|-r)
            if (( i + 1 < ${#args[@]} )); then
                course_name="${args[$((i + 1))]}"
            fi
            ;;
        --prepare)
            prepare_mode=true
            ;;
        --execute)
            execute_mode=true
            ;;
    esac
done

if ! podman container exists "$CONTAINER_NAME"; then
    echo "Error: container '$CONTAINER_NAME' does not exist." >&2
    exit 1
fi

if [ "$(podman inspect "$CONTAINER_NAME" --format '{{.State.Running}}')" != "true" ]; then
    echo "Error: container '$CONTAINER_NAME' is not running." >&2
    exit 1
fi

if [ "$prepare_mode" = true ]; then
    podman run --rm       --entrypoint sh       -v /home/ximera/xronosuf/server:/usr/var/server       -v /home/ximera/lrs-archives:/lrs-archives       ghcr.io/ximeraproject/ximeraserver:v2.9       -lc '
        cd /usr/var/server

        set -a
        . /usr/var/server/repositories/.env
        set +a

        exec node scripts/archive-old-lrs.js "$@"
      ' sh "$@"
else
    podman exec -i "$CONTAINER_NAME" sh -lc '
        cd /usr/var/server

        set -a
        . /usr/var/server/repositories/.env
        set +a

        exec node scripts/archive-old-lrs.js "$@"
    ' sh "$@"
fi

status=$?

echo
echo "============================================================"
echo "LRS archive reminder"
echo "============================================================"

if [ "$status" -ne 0 ]; then
    echo "This run FAILED or reported an incomplete live snapshot."
    echo "No successful archive or prune should be assumed."
elif [ "$execute_mode" = true ]; then
    echo "This was an EXECUTION request."
elif [ "$prepare_mode" = true ]; then
    echo "This was a PREPARATION run."
    echo "Archive outputs were created, but the active LRS was not changed."
else
    echo "This was a DRY RUN."
    echo "No LRS files or summaries were changed."
fi

if [ -n "$course_name" ]; then
    echo
    echo "Repository/course:"
    echo "  $course_name"
fi

echo
echo "Useful syntax:"
echo "  ./archiveOldLRS.sh --course mac2233limits"
echo "      Validate and preview the two-year archival split."
echo
echo "  ./archiveOldLRS.sh --course mac2233limits --before 2024-07-11"
echo "      Preview an explicit UTC cutoff date."
echo
echo "  ./archiveOldLRS.sh --course mac2233limits --prepare"
echo "      Create and validate archive outputs without changing the active LRS."
echo
echo "  ./archiveOldLRS.sh --course mac2233limits --execute"
echo "      Build summaries, archive old records, prune, and restart Xronos."
echo "      Execution remains safety-locked until preparation is reviewed."
echo
echo "  ./archiveOldLRS.sh --help"
echo "      Display the complete option list."
echo "============================================================"

exit "$status"
