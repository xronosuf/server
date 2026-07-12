#!/usr/bin/env bash

set -euo pipefail

SERVER_ROOT="/home/ximera/xronosuf/server"
ACTIVE_ROOT="$SERVER_ROOT/repositories"
RETIRED_ROOT="/home/ximera/retired-repositories"
LRS_ARCHIVE_ROOT="/home/ximera/lrs-archives"
HOME_ROOT="/home/ximera"
LABELS_FILE="$SERVER_ROOT/repository-activity-labels.tsv"

active_top_count=5
retired_top_count=3

usage() {
    cat <<'USAGE'
Usage:
  ./diskUsageReport.sh
  ./diskUsageReport.sh --top NUMBER
  ./diskUsageReport.sh --help

Purpose:
  Report disk usage for the Xronos server, active repositories,
  retired repositories, and external LRS archives.

The main combined total avoids double-counting active repositories by
measuring server code/configuration with the repositories directory excluded.

Options:
  --top NUMBER   Number of largest active and retired repositories to show.
                 Default: 20
  --help         Show this help text.
USAGE
}

while (($# > 0)); do
    case "$1" in
        --top)
            shift

            if (($# == 0)) || [[ ! "$1" =~ ^[1-9][0-9]*$ ]]; then
                echo "Error: --top requires a positive integer." >&2
                exit 2
            fi

            active_top_count="$1"
            retired_top_count="$1"
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            echo "Error: unknown option: $1" >&2
            usage >&2
            exit 2
            ;;
    esac

    shift
done

human_bytes() {
    local bytes="$1"

    numfmt \
        --to=iec \
        --suffix=B \
        "$bytes"
}

designation_display() {
    case "$1" in
        A) printf '%s\n' '(A)ctive' ;;
        D) printf '%s\n' '(D)ormant' ;;
        K) printf '%s\n' '(K)eep' ;;
        U) printf '%s\n' '(U)nknown' ;;
        unlabeled) printf '%s\n' 'Unlabeled' ;;
        *) printf '%s\n' "$1" ;;
    esac
}

directory_bytes() {
    local directory="$1"

    if [[ -d "$directory" ]]; then
        du -sb -- "$directory" |
            awk '{print $1}'
    else
        printf '0\n'
    fi
}

server_without_repositories_bytes() {
    if [[ ! -d "$SERVER_ROOT" ]]; then
        printf '0\n'
        return
    fi

    du \
        -sb \
        --exclude='repositories' \
        -- "$SERVER_ROOT" |
        awk '{print $1}'
}

declare -A labels

if [[ -f "$LABELS_FILE" ]]; then
    while read -r repository designation extra; do
        [[ -z "${repository:-}" ]] && continue
        [[ "$repository" == \#* ]] && continue
        [[ -n "${extra:-}" ]] && continue

        labels["$repository"]="$designation"
    done < "$LABELS_FILE"
fi

temporary_directory=$(
    mktemp -d "${TMPDIR:-/tmp}/xronos-disk-usage.XXXXXX"
)

trap 'rm -rf -- "$temporary_directory"' EXIT

active_details="$temporary_directory/active.tsv"
retired_details="$temporary_directory/retired.tsv"

: > "$active_details"
: > "$retired_details"

declare -A active_label_bytes=(
    [A]=0
    [K]=0
    [U]=0
    [D]=0
    [unlabeled]=0
)

declare -A active_label_counts=(
    [A]=0
    [K]=0
    [U]=0
    [D]=0
    [unlabeled]=0
)

declare -A retired_label_bytes=(
    [A]=0
    [K]=0
    [U]=0
    [D]=0
    [unlabeled]=0
)

declare -A retired_label_counts=(
    [A]=0
    [K]=0
    [U]=0
    [D]=0
    [unlabeled]=0
)

if [[ -d "$ACTIVE_ROOT" ]]; then
    while IFS= read -r -d '' repository_path; do
        repository_name=$(
            basename "$repository_path"
        )
        repository_name="${repository_name%.git}"

        repository_bytes=$(
            directory_bytes "$repository_path"
        )

        designation="${labels[$repository_name]:-unlabeled}"

        if [[ -z "${active_label_bytes[$designation]+set}" ]]; then
            designation="unlabeled"
        fi

        active_label_bytes["$designation"]=$((
            (
                active_label_bytes["$designation"] +
                repository_bytes
            )
        ))

        active_label_counts["$designation"]=$((
            (
                active_label_counts["$designation"] +
                1
            )
        ))

        printf '%s\t%s\t%s\t%s\n' \
            "$repository_bytes" \
            "$designation" \
            "$repository_name" \
            "$repository_path" \
            >> "$active_details"
    done < <(
        find "$ACTIVE_ROOT" \
            -mindepth 1 \
            -maxdepth 1 \
            -type d \
            -name '*.git' \
            -print0
    )
fi

if [[ -d "$RETIRED_ROOT" ]]; then
    while IFS= read -r -d '' repository_path; do
        repository_name=$(
            basename "$repository_path"
        )
        repository_name="${repository_name%.git}"

        repository_bytes=$(
            directory_bytes "$repository_path"
        )

        designation="${labels[$repository_name]:-unlabeled}"

        if [[ -z "${retired_label_bytes[$designation]+set}" ]]; then
            designation="unlabeled"
        fi

        retired_label_bytes["$designation"]=$((
            (
                retired_label_bytes["$designation"] +
                repository_bytes
            )
        ))

        retired_label_counts["$designation"]=$((
            (
                retired_label_counts["$designation"] +
                1
            )
        ))

        printf '%s\t%s\t%s\t%s\n' \
            "$repository_bytes" \
            "$designation" \
            "$repository_name" \
            "$repository_path" \
            >> "$retired_details"
    done < <(
        find "$RETIRED_ROOT" \
            -mindepth 1 \
            -maxdepth 2 \
            -type d \
            -name '*.git' \
            -print0
    )
fi

server_code_bytes=$(
    server_without_repositories_bytes
)

active_root_bytes=$(
    directory_bytes "$ACTIVE_ROOT"
)

retired_root_bytes=$(
    directory_bytes "$RETIRED_ROOT"
)

lrs_archive_bytes=$(
    directory_bytes "$LRS_ARCHIVE_ROOT"
)

ximera_home_excluding_containers_bytes=$(
    {
        du \
            -sb \
            --exclude='containers' \
            -- "$HOME_ROOT" \
            2>/dev/null ||
            true
    } |
        awk '
            NR == 1 {
                print $1
                found = 1
            }

            END {
                if (!found) {
                    print 0
                }
            }
        '
)

podman_graph_root=$(
    podman info \
        --format '{{.Store.GraphRoot}}' \
        2>/dev/null ||
        true
)

podman_storage_bytes=0

if [[ -n "$podman_graph_root" && -d "$podman_graph_root" ]]; then
    podman_storage_bytes=$(
        {
            podman unshare \
                du -sb -- "$podman_graph_root" \
                2>/dev/null ||
                true
        } |
            awk '
                NR == 1 {
                    print $1
                    found = 1
                }

                END {
                    if (!found) {
                        print 0
                    }
                }
            '
    )
fi

ximera_home_estimated_bytes=$((
    ximera_home_excluding_containers_bytes +
    podman_storage_bytes
))

selected_total_bytes=$((
    server_code_bytes +
    active_root_bytes +
    retired_root_bytes +
    lrs_archive_bytes
))

echo "Xronos disk usage report"
echo "Generated: $(date --iso-8601=seconds)"
echo

echo "=== Filesystem capacity ==="

filesystem_paths=("$SERVER_ROOT")

if [[ -d "$RETIRED_ROOT" ]]; then
    filesystem_paths+=("$RETIRED_ROOT")
fi

if [[ -d "$LRS_ARCHIVE_ROOT" ]]; then
    filesystem_paths+=("$LRS_ARCHIVE_ROOT")
fi

df -hP -- "${filesystem_paths[@]}" |
    awk '
        NR == 1 {
            print
            next
        }

        !seen[$1]++ {
            print
        }
    '

echo
printf '%-44s %12s\n' \
    "/home/ximera excluding Podman storage" \
    "$(human_bytes "$ximera_home_excluding_containers_bytes")"

printf '%-44s %12s\n' \
    "Rootless Podman storage" \
    "$(human_bytes "$podman_storage_bytes")"

printf '%-44s %12s\n' \
    "Estimated entire /home/ximera tree" \
    "$(human_bytes "$ximera_home_estimated_bytes")"

echo
echo "Note: /home/ximera figures are informational and overlap the"
echo "Xronos categories above. They are not added to the selected total."

echo
echo "=== Podman storage summary ==="

if command -v podman >/dev/null 2>&1; then
    podman system df
else
    echo "Podman is not available."
fi

echo
echo "=== Active repositories by designation ==="

printf '%-14s %10s %14s\n' \
    "Designation" \
    "Count" \
    "Disk usage"

for designation in A K U D unlabeled; do
    printf '%-14s %10d %14s\n' \
        "$(designation_display "$designation")" \
        "${active_label_counts[$designation]}" \
        "$(human_bytes "${active_label_bytes[$designation]}")"
done

echo
echo "=== Retired repositories by designation ==="

printf '%-14s %10s %14s\n' \
    "Designation" \
    "Count" \
    "Disk usage"

for designation in D A K U unlabeled; do
    printf '%-14s %10d %14s\n' \
        "$(designation_display "$designation")" \
        "${retired_label_counts[$designation]}" \
        "$(human_bytes "${retired_label_bytes[$designation]}")"
done

echo
echo "=== Largest active repositories ==="

if [[ -s "$active_details" ]]; then
    sort \
        -t $'\t' \
        -k1,1nr \
        "$active_details" |
        head -n "$active_top_count" |
        while IFS=$'\t' read -r \
            repository_bytes \
            designation \
            repository_name \
            repository_path
        do
            printf '%12s  %-10s  %s\n' \
                "$(human_bytes "$repository_bytes")" \
                "$(designation_display "$designation")" \
                "$repository_name"
        done
else
    echo "No active *.git repository directories found."
fi

echo
echo "=== Largest retired repositories ==="

if [[ -s "$retired_details" ]]; then
    sort \
        -t $'\t' \
        -k1,1nr \
        "$retired_details" |
        head -n "$retired_top_count" |
        while IFS=$'\t' read -r \
            repository_bytes \
            designation \
            repository_name \
            repository_path
        do
            retirement_batch=$(
                basename "$(dirname "$repository_path")"
            )

            printf '%12s  %-10s  %-32s  %s\n' \
                "$(human_bytes "$repository_bytes")" \
                "$(designation_display "$designation")" \
                "$repository_name" \
                "$retirement_batch"
        done
else
    echo "No retired *.git repository directories found."
fi

echo
echo "=== Repository tree totals from individual directories ==="

active_individual_total=$(
    awk -F '\t' '
        {
            total += $1
        }

        END {
            print total + 0
        }
    ' "$active_details"
)

retired_individual_total=$(
    awk -F '\t' '
        {
            total += $1
        }

        END {
            print total + 0
        }
    ' "$retired_details"
)

printf '%-44s %12s\n' \
    "Active *.git directories" \
    "$(human_bytes "$active_individual_total")"

printf '%-44s %12s\n' \
    "Retired *.git directories" \
    "$(human_bytes "$retired_individual_total")"

printf '%-44s %12s\n' \
    "All active + retired *.git directories" \
    "$(human_bytes "$(
        (
            active_individual_total +
            retired_individual_total
        )
    )")"

echo
echo "The tree totals can be slightly larger than the sum of individual"
echo "*.git directories because manifests, README files, and other files"
echo "may also exist alongside the repositories."

echo "=== Main Xronos storage categories ==="

printf '%-44s %12s\n' \
    "Server code/configuration, excluding repositories" \
    "$(human_bytes "$server_code_bytes")"

printf '%-44s %12s\n' \
    "Active repositories tree" \
    "$(human_bytes "$active_root_bytes")"

printf '%-44s %12s\n' \
    "Retired repositories tree" \
    "$(human_bytes "$retired_root_bytes")"

printf '%-44s %12s\n' \
    "External LRS archives" \
    "$(human_bytes "$lrs_archive_bytes")"

printf '%-44s %12s\n' \
    "Selected non-overlapping total" \
    "$(human_bytes "$selected_total_bytes")"

echo
