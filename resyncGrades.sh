#!/usr/bin/env bash

set -uo pipefail

SERVER_DIR="/home/ximera/xronosuf/server"
CONTAINER_NAME="xronos"

cd "$SERVER_DIR"

if ! podman container exists "$CONTAINER_NAME"; then
    echo "Error: container '$CONTAINER_NAME' does not exist." >&2
    exit 1
fi

if [ "$(podman inspect "$CONTAINER_NAME" --format '{{.State.Running}}')" != "true" ]; then
    echo "Error: container '$CONTAINER_NAME' is not running." >&2
    exit 1
fi

execute_mode=false
course_name=""
context_id=""

args=("$@")

for ((i=0; i<${#args[@]}; i++)); do
    case "${args[$i]}" in
        --execute)
            execute_mode=true
            ;;
        --course|--repo|-repo|-r)
            if (( i + 1 < ${#args[@]} )); then
                course_name="${args[$((i + 1))]}"
            fi
            ;;
        --context)
            if (( i + 1 < ${#args[@]} )); then
                context_id="${args[$((i + 1))]}"
            fi
            ;;
    esac
done

podman exec -i "$CONTAINER_NAME" sh -lc '
    cd /usr/var/server

    set -a
    . /usr/var/server/repositories/.env
    set +a

    exec node scripts/resync-grades.js "$@"
' sh "$@"

status=$?

echo
echo "============================================================"
echo "Grade resync reminder"
echo "============================================================"

if [ "$status" -ne 0 ]; then
    echo "This run FAILED with exit status $status."
    echo "No successful dry run or execution should be assumed."
elif [ "$execute_mode" = true ]; then
    echo "This was an EXECUTION run."
    echo "Eligible grades were placed into the Canvas passback queue."
else
    echo "This was a DRY RUN."
    echo "No grades were changed or queued."
    echo
    echo "After reviewing the results, rerun with:"
    echo "  ./resyncGrades.sh --execute"
fi

if [ -n "$course_name" ]; then
    echo
    echo "Repository/course restriction:"
    echo "  $course_name"
else
    echo
    echo "Repository/course restriction: none"
fi

if [ -n "$context_id" ]; then
    echo
    echo "Canvas context restriction:"
    echo "  $context_id"
else
    echo
    echo "Canvas context restriction: none"
fi

echo
echo "Useful syntax:"
echo "  ./resyncGrades.sh"
echo "      Dry-run all eligible grades from the last 18 weeks."
echo
echo "  ./resyncGrades.sh --execute"
echo "      Queue all eligible grades for Canvas passback."
echo
echo "  ./resyncGrades.sh --course mac2233limits"
echo "      Dry-run only one repository/course."
echo
echo "  ./resyncGrades.sh --context CONTEXT_ID"
echo "      Dry-run only one Canvas/LTI course context."
echo
echo "  ./resyncGrades.sh --course mac2233limits --context CONTEXT_ID"
echo "      Restrict by both repository and Canvas context."
echo
echo "  ./resyncGrades.sh --course mac2233limits --context CONTEXT_ID --execute"
echo "      Queue only that repository/context combination."
echo
echo "  ./resyncGrades.sh --weeks 18 --delay 10 --execute"
echo "      Override the time window or queue spacing."
echo
echo "  ./resyncGrades.sh --help"
echo "      Display the full option list."
echo "============================================================"

exit "$status"
