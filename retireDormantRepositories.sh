#!/usr/bin/env bash
set -euo pipefail

SERVER_ROOT="/home/ximera/xronosuf/server"
REPOSITORIES_ROOT="$SERVER_ROOT/repositories"
LABELS_FILE="$SERVER_ROOT/repository-activity-labels.tsv"
DEFAULT_BATCH="/home/ximera/retired-repositories/retired-2026-07-12"

execute=false
batch="$DEFAULT_BATCH"

usage() {
    cat <<'USAGE'
Usage:
  ./retireDormantRepositories.sh [--dry-run]
  ./retireDormantRepositories.sh --execute
  ./retireDormantRepositories.sh --execute --batch DIRECTORY

Purpose:
  Move entire bare repository directories labeled D from the active Xronos
  repositories directory into a dated retired-repository batch.

Safety:
  The default mode is dry run.
  --execute is required to move anything.
  Existing destinations are never overwritten.
  Only repositories labeled exactly D are eligible.
  No repository contents are deleted or modified.
USAGE
}

while (($# > 0)); do
    case "$1" in
        --dry-run)
            execute=false
            ;;
        --execute)
            execute=true
            ;;
        --batch)
            shift

            if (($# == 0)); then
                echo "Error: --batch requires a directory." >&2
                exit 2
            fi

            batch="$1"
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

if [[ ! -f "$LABELS_FILE" ]]; then
    echo "Error: label file not found: $LABELS_FILE" >&2
    exit 1
fi

mkdir -p "$batch"

manifest="$batch/retirement-manifest.tsv"

if [[ ! -f "$manifest" ]]; then
    echo "Error: retirement manifest not found: $manifest" >&2
    echo "Generate and review the manifest before executing." >&2
    exit 1
fi

declare -A manifest_sources
declare -A manifest_destinations

while IFS=$'\t' read -r \
    repository \
    original_path \
    retired_path
do
    [[ -z "$repository" ]] && continue

    manifest_sources["$repository"]="$original_path"
    manifest_destinations["$repository"]="$retired_path"
done < <(
    awk -F '\t' '
        NR > 1 {
            print $1 "\t" $6 "\t" $7
        }
    ' "$manifest"
)

planned=0
moved=0
missing=0
collisions=0
manifest_mismatches=0

while read -r repository designation; do
    [[ -z "$repository" || "$repository" == \#* ]] && continue
    [[ "$designation" == "D" ]] || continue

    source_path="$REPOSITORIES_ROOT/${repository}.git"
    destination_path="$batch/${repository}.git"

    planned=$((planned + 1))

    if [[ -z "${manifest_sources[$repository]:-}" ]]; then
        echo "ERROR  $repository: absent from manifest" >&2
        manifest_mismatches=$((manifest_mismatches + 1))
        continue
    fi

    if [[ "${manifest_sources[$repository]}" != "$source_path" ]]; then
        echo "ERROR  $repository: manifest source mismatch" >&2
        echo "       manifest: ${manifest_sources[$repository]}" >&2
        echo "       expected: $source_path" >&2
        manifest_mismatches=$((manifest_mismatches + 1))
        continue
    fi

    if [[ "${manifest_destinations[$repository]}" != "$destination_path" ]]; then
        echo "ERROR  $repository: manifest destination mismatch" >&2
        echo "       manifest: ${manifest_destinations[$repository]}" >&2
        echo "       expected: $destination_path" >&2
        manifest_mismatches=$((manifest_mismatches + 1))
        continue
    fi

    if [[ ! -d "$source_path" ]]; then
        if [[ -d "$destination_path" ]]; then
            echo "ALREADY  $repository"
        else
            echo "MISSING  $repository"
            missing=$((missing + 1))
        fi

        continue
    fi

    if [[ -e "$destination_path" ]]; then
        echo "COLLISION  $repository"
        echo "           destination exists: $destination_path" >&2
        collisions=$((collisions + 1))
        continue
    fi

    size_bytes=$(
        du -sb "$source_path" |
        awk '{print $1}'
    )

    if [[ "$execute" == true ]]; then
        mv -- "$source_path" "$destination_path"

        if [[ -e "$source_path" || ! -d "$destination_path" ]]; then
            echo "ERROR  $repository: move verification failed" >&2
            exit 1
        fi

        printf 'MOVED  %s  %s bytes\n' \
            "$repository" \
            "$size_bytes"

        moved=$((moved + 1))
    else
        printf 'WOULD-MOVE  %s  %s bytes\n' \
            "$repository" \
            "$size_bytes"
    fi
done < "$LABELS_FILE"

echo
echo "Batch:               $batch"
echo "Dormant planned:     $planned"
echo "Moved this run:      $moved"
echo "Missing sources:     $missing"
echo "Destination clashes: $collisions"
echo "Manifest mismatches: $manifest_mismatches"

if [[ "$execute" == false ]]; then
    echo
    echo "Dry run only. No repositories were moved."
fi

if ((collisions > 0 || manifest_mismatches > 0)); then
    exit 1
fi
