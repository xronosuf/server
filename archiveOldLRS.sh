#!/usr/bin/env bash

set -uo pipefail

SERVER_DIR="/home/ximera/xronosuf/server"
ARCHIVE_ROOT="/home/ximera/lrs-archives"
CONTAINER_NAME="xronos"
IMAGE_NAME="ghcr.io/ximeraproject/ximeraserver:v2.9"

cd "$SERVER_DIR"

course_name=""
before_date=""
years="2"
execute_mode=false
prepare_mode=false
recover_zero_gaps=false
skip_full_answer_summary=false

args=("$@")

for ((i=0; i<${#args[@]}; i++)); do
    case "${args[$i]}" in
        --course|--repo|-r)
            if (( i + 1 < ${#args[@]} )); then
                course_name="${args[$((i + 1))]}"
            fi
            ;;
        --before)
            if (( i + 1 < ${#args[@]} )); then
                before_date="${args[$((i + 1))]}"
            fi
            ;;
        --years)
            if (( i + 1 < ${#args[@]} )); then
                years="${args[$((i + 1))]}"
            fi
            ;;
        --prepare)
            prepare_mode=true
            ;;
        --execute)
            execute_mode=true
            ;;
        --recover-zero-gaps)
            recover_zero_gaps=true
            ;;
        --skip-full-answer-summary)
            skip_full_answer_summary=true
            ;;
    esac
done

print_reminder() {
    local status="$1"

    echo
    echo "============================================================"
    echo "LRS archive reminder"
    echo "============================================================"

    if [ "$status" -ne 0 ]; then
        echo "This run FAILED."
        echo "Inspect the active, rollback, staged, and archive files"
        echo "before retrying or removing anything."
    elif [ "$execute_mode" = true ]; then
        echo "This was an EXECUTION run."
    elif [ "$prepare_mode" = true ]; then
        echo "This was a PREPARATION run."
        echo "The active LRS was not changed."
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
    echo "      Validate and preview the two-year split."
    echo
    echo "  ./archiveOldLRS.sh --course mac2233limits --prepare"
    echo "      Create and validate outputs without swapping."
    echo
    echo "  ./archiveOldLRS.sh --course mac2233limits --execute"
    echo "      Prepare, stop Xronos, process the tail, swap,"
    echo "      restart, and rebuild retained-window summaries."
    echo
    echo "  ./archiveOldLRS.sh --course mac2233limits \\"
    echo "      --before 2024-07-11 --execute"
    echo "      Use an explicit UTC cutoff."
    echo
    echo "  ./archiveOldLRS.sh --course mac2311keeran \\"
    echo "      --before 2024-07-11 --recover-zero-gaps \\"
    echo "      --skip-full-answer-summary --execute"
    echo "      Recover validated zero gaps and skip an oversized"
    echo "      all-time answer-summary rebuild."
    echo
    echo "  ./archiveOldLRS.sh --help"
    echo "============================================================"
}

finish() {
    local status="$1"
    print_reminder "$status"
    exit "$status"
}

if ! podman container exists "$CONTAINER_NAME"; then
    echo "Error: container '$CONTAINER_NAME' does not exist." >&2
    finish 1
fi

if [ "$(podman inspect "$CONTAINER_NAME" --format '{{.State.Running}}')" != "true" ]; then
    echo "Error: container '$CONTAINER_NAME' is not running." >&2
    finish 1
fi

if [ "$execute_mode" = true ] && [ "$prepare_mode" = true ]; then
    echo "Error: use either --prepare or --execute, not both." >&2
    finish 1
fi

if [ "$execute_mode" != true ]; then
    if [ "$prepare_mode" = true ]; then
        podman run --rm \
          --entrypoint sh \
          -v "$SERVER_DIR:/usr/var/server" \
          -v "$ARCHIVE_ROOT:/lrs-archives" \
          "$IMAGE_NAME" \
          -lc '
            cd /usr/var/server

            set -a
            . /usr/var/server/repositories/.env
            set +a

            exec node scripts/archive-old-lrs.js "$@"
          ' sh "$@"

        finish $?
    fi

    podman exec -i "$CONTAINER_NAME" sh -lc '
        cd /usr/var/server

        set -a
        . /usr/var/server/repositories/.env
        set +a

        exec node scripts/archive-old-lrs.js "$@"
    ' sh "$@"

    finish $?
fi

if [ -z "$course_name" ]; then
    echo "Error: --course is required for --execute." >&2
    finish 1
fi

course_name="${course_name%.git}"

if [[ ! "$course_name" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo "Error: invalid repository name." >&2
    finish 1
fi

repo_dir="$SERVER_DIR/repositories/$course_name.git"
lrs_file="$repo_dir/learning-record-store"

if [ ! -d "$repo_dir" ]; then
    echo "Error: repository directory does not exist:" >&2
    echo "  $repo_dir" >&2
    finish 1
fi

if [ ! -f "$lrs_file" ]; then
    echo "Error: learning-record-store is missing:" >&2
    echo "  $lrs_file" >&2
    finish 1
fi

if [ -z "$before_date" ]; then
    before_date=$(
        python3 - "$years" <<'PY'
from datetime import datetime, timezone
import sys

years = int(sys.argv[1])
today = datetime.now(timezone.utc)

try:
    cutoff = today.replace(year=today.year - years)
except ValueError:
    cutoff = today.replace(
        year=today.year - years,
        day=28
    )

print(cutoff.strftime("%Y-%m-%d"))
PY
    )
fi

if [[ ! "$before_date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    echo "Error: --before must use YYYY-MM-DD." >&2
    finish 1
fi

rollback_lrs="$repo_dir/learning-record-store.pre-archive-$before_date"

if [ -e "$rollback_lrs" ]; then
    echo "Error: rollback LRS already exists:" >&2
    echo "  $rollback_lrs" >&2
    echo "This repository appears to have already been archived" >&2
    echo "for this cutoff." >&2
    finish 1
fi

latest_scheduler=$(
    podman logs "$CONTAINER_NAME" 2>&1 |
      grep 'Answer attempt summary scheduler' |
      tail -n 1 || true
)

case "$latest_scheduler" in
  *"scheduler is disabled."*)
    ;;
  *)
    echo "Error: answer-attempt scheduler is not confirmed disabled." >&2
    echo "Latest scheduler log:" >&2
    echo "  ${latest_scheduler:-none}" >&2
    finish 1
    ;;
esac

if [ "$skip_full_answer_summary" = true ]; then
    echo "=== Skip full answer-attempt summary rebuild ==="
    echo "The all-time answer-attempt summary rebuild was explicitly skipped."
    echo "This repository is too large for the current in-memory builder."
else
    echo "=== Build full answer-attempt summary ==="

    podman exec -i "$CONTAINER_NAME" sh -lc '
      cd /usr/var/server

      set -a
      . /usr/var/server/repositories/.env
      set +a

      course="$1"

      node - "$course" <<'"'"'NODE'"'"'
var builder = require("./summarize/answer-attempt-summary");
var course = process.argv[2];

builder.rebuildRepository(course, function(err, result) {
    if (err) {
        console.error(err);
        process.exit(1);
    }

    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
});
NODE
    ' sh "$course_name"

    if [ "$?" -ne 0 ]; then
        finish 1
    fi
fi

echo
if [ "$skip_full_answer_summary" = true ]; then
    echo "=== Preserve existing incremental summary as incomplete snapshot ==="
    echo "Current summary.json will be archived with its recorded byte position."
else
    echo "=== Wait for incremental summary to become current ==="

    summary_current=false

    for attempt in $(seq 1 40); do
        result=$(
            python3 - "$repo_dir" <<'PY'
import json
import sys
from pathlib import Path

repo = Path(sys.argv[1])
lrs = repo / "learning-record-store"
summary = repo / "summary.json"

if not summary.exists():
    print("missing")
else:
    try:
        data = json.loads(summary.read_text())
        if data.get("position") == lrs.stat().st_size:
            print("current")
        else:
            print(
                f"behind:{data.get('position')}:{lrs.stat().st_size}"
            )
    except Exception as exc:
        print(f"error:{exc}")
PY
        )

        echo "Summary status: $result"

        if [ "$result" = "current" ]; then
            summary_current=true
            break
        fi

        sleep 15
    done

    if [ "$summary_current" != true ]; then
        echo "Error: summary.json did not become current." >&2
        finish 1
    fi
fi

echo
echo "=== Prepare archive outputs while Xronos remains online ==="

prepare_args=(
  --course "$course_name"
  --before "$before_date"
  --prepare
)

if [ "$recover_zero_gaps" = true ]; then
    prepare_args+=(--recover-zero-gaps)
fi

podman run --rm \
  --entrypoint sh \
  -v "$SERVER_DIR:/usr/var/server" \
  -v "$ARCHIVE_ROOT:/lrs-archives" \
  "$IMAGE_NAME" \
  -lc '
    cd /usr/var/server

    set -a
    . /usr/var/server/repositories/.env
    set +a

    exec node scripts/archive-old-lrs.js "$@"
  ' sh "${prepare_args[@]}"

if [ "$?" -ne 0 ]; then
    finish 1
fi

run_dir=$(
    find "$ARCHIVE_ROOT/$course_name/$before_date" \
      -mindepth 1 \
      -maxdepth 1 \
      -type d \
      -name 'prepare-*' \
      | sort \
      | tail -n 1
)

if [ -z "$run_dir" ] || [ ! -d "$run_dir" ]; then
    echo "Error: could not locate preparation directory." >&2
    finish 1
fi

echo
echo "Preparation directory:"
echo "  $run_dir"

summary_snapshot_present=false
answer_summary_snapshot_present=false

if [ -f "$repo_dir/summary.json" ]; then
    cp -p \
      "$repo_dir/summary.json" \
      "$run_dir/summary.full-lrs.json"

    summary_snapshot_present=true
fi

if [ -f "$repo_dir/answer-attempt-summary.json" ]; then
    cp -p \
      "$repo_dir/answer-attempt-summary.json" \
      "$run_dir/answer-attempt-summary.full-lrs.json"

    answer_summary_snapshot_present=true
fi

: > "$run_dir/summaries.sha256"

if [ "$summary_snapshot_present" = true ]; then
    (
        cd "$run_dir" &&
        sha256sum summary.full-lrs.json
    ) >> "$run_dir/summaries.sha256"
fi

if [ "$answer_summary_snapshot_present" = true ]; then
    (
        cd "$run_dir" &&
        sha256sum answer-attempt-summary.full-lrs.json
    ) >> "$run_dir/summaries.sha256"
fi

python3 - \
  "$run_dir" \
  "$repo_dir" \
  "$skip_full_answer_summary" \
  "$summary_snapshot_present" \
  "$answer_summary_snapshot_present" <<'PY'
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

run_dir = Path(sys.argv[1])
repo_dir = Path(sys.argv[2])
skip_full = sys.argv[3] == "true"
basic_present = sys.argv[4] == "true"
answer_present = sys.argv[5] == "true"

manifest_file = run_dir / "manifest.json"
manifest = json.loads(manifest_file.read_text())

lrs = repo_dir / "learning-record-store"
observed_lrs_size = lrs.stat().st_size

snapshots = {
    "capturedAt": datetime.now(timezone.utc).isoformat(),
    "fullRebuildSkipped": skip_full,
}

if basic_present:
    summary_file = run_dir / "summary.full-lrs.json"
    summary = json.loads(summary_file.read_text())
    position = summary.get("position")

    snapshots["basicSummary"] = {
        "status": (
            "current"
            if position == observed_lrs_size
            else "incomplete"
        ),
        "filename": summary_file.name,
        "position": position,
        "exactThroughByte": position,
        "lrsSizeObservedWhenCopied": observed_lrs_size,
        "coverageNote": (
            "This summary was copied without forcing a rebuild. "
            "Its position records the exact byte through which it "
            "is valid."
            if skip_full
            else
            "This summary was required to be current before copying."
        ),
    }
else:
    snapshots["basicSummary"] = {
        "status": "missing",
        "filename": None,
        "coverageNote": (
            "No summary.json existed when the archive package "
            "was prepared."
        ),
    }

if answer_present:
    answer_file = (
        run_dir / "answer-attempt-summary.full-lrs.json"
    )

    snapshots["answerAttemptSummary"] = {
        "status": (
            "preserved-existing"
            if skip_full
            else "rebuilt"
        ),
        "filename": answer_file.name,
        "lrsSizeObservedWhenCopied": observed_lrs_size,
        "coverageNote": (
            "The existing answer-attempt summary was preserved "
            "without forcing a full rebuild. This format has no "
            "stored byte position, so exact historical coverage "
            "cannot be asserted."
            if skip_full
            else
            "The answer-attempt summary was rebuilt immediately "
            "before preparation. This format has no stored byte "
            "position."
        ),
    }
else:
    snapshots["answerAttemptSummary"] = {
        "status": "missing",
        "filename": None,
        "lrsSizeObservedWhenCopied": observed_lrs_size,
        "coverageNote": (
            "No answer-attempt-summary.json existed, and the "
            "full rebuild was explicitly skipped because the "
            "repository exceeded the current builder's practical "
            "memory capacity."
            if skip_full
            else
            "No answer-attempt-summary.json existed after the "
            "requested full rebuild."
        ),
    }

manifest["summarySnapshots"] = snapshots

manifest_file.write_text(
    json.dumps(manifest, indent=2) + "\n"
)
PY

(
    cd "$run_dir" &&
    sha256sum -c checksums.sha256 &&
    {
        if [ -s summaries.sha256 ]; then
            sha256sum -c summaries.sha256
        else
            echo "No summary snapshot files were present."
        fi
    }
)

if [ "$?" -ne 0 ]; then
    finish 1
fi

container_run_dir=$(
    python3 - "$run_dir" "$ARCHIVE_ROOT" <<'PY'
from pathlib import Path
import sys

run_dir = Path(sys.argv[1]).resolve()
archive_root = Path(sys.argv[2]).resolve()

relative = run_dir.relative_to(archive_root)
print("/lrs-archives/" + str(relative))
PY
)

echo
echo "=== Stop Xronos ==="

podman stop -t 30 "$CONTAINER_NAME"

if [ "$(podman inspect "$CONTAINER_NAME" --format '{{.State.Status}}')" != "exited" ]; then
    echo "Error: Xronos did not stop." >&2
    finish 1
fi

finalize_status=0

podman run --rm \
  --entrypoint sh \
  -v "$SERVER_DIR:/usr/var/server" \
  -v "$ARCHIVE_ROOT:/lrs-archives" \
  "$IMAGE_NAME" \
  -lc '
    cd /usr/var/server

    exec node scripts/finalize-lrs-archive.js "$@"
  ' sh \
  --course "$course_name" \
  --before "$before_date" \
  --run-directory "$container_run_dir" \
  || finalize_status=$?

echo
echo "=== Start Xronos ==="

podman start "$CONTAINER_NAME"

if [ "$finalize_status" -ne 0 ]; then
    echo "Finalization failed; Xronos was restarted." >&2
    finish "$finalize_status"
fi

healthy=false

for attempt in $(seq 1 45); do
    code=$(
        curl -sS \
          -o /dev/null \
          -w '%{http_code}' \
          http://127.0.0.1:2000/ \
          2>/dev/null || true
    )

    if [ "$code" = "200" ]; then
        echo "HTTP 200"
        healthy=true
        break
    fi

    echo "Health attempt $attempt: HTTP ${code:-unavailable}"
    sleep 2
done

if [ "$healthy" != true ]; then
    echo "Error: Xronos did not return HTTP 200." >&2
    finish 1
fi

latest_scheduler=$(
    podman logs --since 10m "$CONTAINER_NAME" 2>&1 |
      grep 'Answer attempt summary scheduler' |
      tail -n 1 || true
)

case "$latest_scheduler" in
  *"scheduler is disabled."*)
    echo "$latest_scheduler"
    ;;
  *)
    echo "Error: scheduler-disabled state was not confirmed." >&2
    echo "${latest_scheduler:-No scheduler line found}" >&2
    finish 1
    ;;
esac

echo
echo "=== Rebuild retained-window answer-attempt summary ==="
echo "Node heap limit: 4096 MiB"

podman exec -i \
  -e NODE_OPTIONS=--max-old-space-size=4096 \
  "$CONTAINER_NAME" sh -lc '
  cd /usr/var/server

  set -a
  . /usr/var/server/repositories/.env
  set +a

  course="$1"

  node - "$course" <<'"'"'NODE'"'"'
var builder = require("./summarize/answer-attempt-summary");
var course = process.argv[2];

builder.rebuildRepository(course, function(err, result) {
    if (err) {
        console.error(err);
        process.exit(1);
    }

    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
});
NODE
' sh "$course_name"

if [ "$?" -ne 0 ]; then
    finish 1
fi

echo
echo "=== Wait for retained-window summary.json ==="

summary_current=false

for attempt in $(seq 1 60); do
    result=$(
        python3 - "$repo_dir" <<'PY'
import json
import sys
from pathlib import Path

repo = Path(sys.argv[1])
lrs = repo / "learning-record-store"
summary = repo / "summary.json"

if not summary.exists():
    print("missing")
else:
    try:
        data = json.loads(summary.read_text())
        if data.get("position") == lrs.stat().st_size:
            print("current")
        else:
            print(
                f"behind:{data.get('position')}:{lrs.stat().st_size}"
            )
    except Exception as exc:
        print(f"error:{exc}")
PY
    )

    echo "Summary status: $result"

    if [ "$result" = "current" ]; then
        summary_current=true
        break
    fi

    sleep 15
done

if [ "$summary_current" != true ]; then
    echo "Error: retained-window summary did not become current." >&2
    finish 1
fi

recovery_verification_failed() {
    local reason="$1"

    echo >&2
    echo "============================================================" >&2
    echo "ARCHIVE EXECUTION COMPLETED, BUT RECOVERY VERIFICATION FAILED" >&2
    echo "============================================================" >&2
    echo >&2
    echo "Successful stages:" >&2
    echo "  - Historical archive created and validated" >&2
    echo "  - Retained LRS installed" >&2
    echo "  - Xronos restarted successfully" >&2
    echo "  - HTTP 200 confirmed" >&2
    echo "  - Retained-window summaries rebuilt" >&2
    echo >&2
    echo "Failed stage:" >&2
    echo "  - $reason" >&2
    echo >&2
    echo "Safety action:" >&2
    echo "  - Rollback LRS was NOT deleted" >&2
    echo "  - Rollback remains available at:" >&2
    echo "    $rollback_file" >&2
    echo "============================================================" >&2

    rm -f "$reconstructed_file"
    finish 1
}

echo
echo "=== Verify exact rollback recovery from archive package ==="

rollback_file="$repo_dir/learning-record-store.pre-archive-$before_date"
historical_archive="$run_dir/learning-record-store.before-$before_date.snappy.gz"
retained_archive="$run_dir/learning-record-store.retained.snappy"
reconstructed_file="$run_dir/learning-record-store.reconstructed-verification"

if [ ! -f "$rollback_file" ]; then
    recovery_verification_failed       "Rollback LRS is missing before verification."
fi

if [ ! -f "$historical_archive" ]; then
    recovery_verification_failed       "Historical archive component is missing."
fi

if [ ! -f "$retained_archive" ]; then
    recovery_verification_failed       "Retained archive component is missing."
fi

(
    cd "$run_dir" &&
    sha256sum -c checksums.sha256 &&
    gzip -t "learning-record-store.before-$before_date.snappy.gz"
)

if [ "$?" -ne 0 ]; then
    recovery_verification_failed       "Archive checksum or gzip validation failed."
fi

rm -f "$reconstructed_file"

if ! gzip -dc "$historical_archive" > "$reconstructed_file"; then
    recovery_verification_failed       "Historical archive could not be decompressed."
fi

if ! tail -c +11 "$retained_archive" >> "$reconstructed_file"; then
    recovery_verification_failed       "Retained archive component could not be appended."
fi

rollback_size=$(stat -c '%s' "$rollback_file")
reconstructed_size=$(stat -c '%s' "$reconstructed_file")

rollback_sha256=$(sha256sum "$rollback_file" | awk '{print $1}')
reconstructed_sha256=$(sha256sum "$reconstructed_file" | awk '{print $1}')

echo "Rollback size:      $rollback_size"
echo "Reconstructed size: $reconstructed_size"
echo "Rollback SHA-256:   $rollback_sha256"
echo "Recreated SHA-256:  $reconstructed_sha256"

if [ "$rollback_size" != "$reconstructed_size" ]; then
    recovery_verification_failed       "Reconstructed LRS size does not match rollback."
fi

if [ "$rollback_sha256" != "$reconstructed_sha256" ]; then
    recovery_verification_failed       "Reconstructed LRS SHA-256 does not match rollback."
fi

if ! cmp -s "$rollback_file" "$reconstructed_file"; then
    recovery_verification_failed       "Reconstructed LRS is not byte-for-byte identical."
fi

echo "PASS: archive package recreates the rollback LRS byte-for-byte."

python3 - \
  "$run_dir/manifest.json" \
  "$rollback_file" \
  "$rollback_size" \
  "$rollback_sha256" <<'PY'
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

manifest_file = Path(sys.argv[1])
rollback_file = sys.argv[2]
rollback_size = int(sys.argv[3])
rollback_sha256 = sys.argv[4]

manifest = json.loads(manifest_file.read_text())

manifest["rollbackVerification"] = {
    "verifiedAt": datetime.now(timezone.utc).isoformat(),
    "method": (
        "Historical gzip decompressed, followed by retained Snappy "
        "stream with its duplicate 10-byte stream identifier omitted."
    ),
    "byteForByteIdentical": True,
    "verifiedBytes": rollback_size,
    "sha256": rollback_sha256,
    "rollbackFile": rollback_file,
    "rollbackLrsDeletedAfterVerification": False
}

manifest_file.write_text(
    json.dumps(manifest, indent=2) + "\n"
)
PY

if [ "$?" -ne 0 ]; then
    recovery_verification_failed       "Successful verification could not be recorded in the manifest."
fi

rm -f "$reconstructed_file"

if ! rm -f "$rollback_file"; then
    echo >&2
    echo "============================================================" >&2
    echo "RECOVERY VERIFICATION PASSED, BUT CLEANUP FAILED" >&2
    echo "============================================================" >&2
    echo "The archive package recreated the original LRS exactly." >&2
    echo "The rollback file could not be deleted:" >&2
    echo "  $rollback_file" >&2
    echo "The live retained LRS and archive package are unaffected." >&2
    echo "============================================================" >&2
    finish 1
fi

if [ -e "$rollback_file" ]; then
    echo >&2
    echo "============================================================" >&2
    echo "RECOVERY VERIFICATION PASSED, BUT CLEANUP WAS INCOMPLETE" >&2
    echo "============================================================" >&2
    echo "The archive package recreated the original LRS exactly." >&2
    echo "The rollback file still exists after the deletion command:" >&2
    echo "  $rollback_file" >&2
    echo "The live retained LRS and archive package are unaffected." >&2
    echo "============================================================" >&2
    finish 1
fi

python3 - "$run_dir/manifest.json" <<'PY'
import json
import sys
from pathlib import Path

manifest_file = Path(sys.argv[1])
manifest = json.loads(manifest_file.read_text())

manifest["rollbackVerification"][
    "rollbackLrsDeletedAfterVerification"
] = True

manifest_file.write_text(
    json.dumps(manifest, indent=2) + "\n"
)
PY

if [ "$?" -ne 0 ]; then
    echo "Warning: rollback was deleted successfully, but the manifest" >&2
    echo "could not be updated to record the deletion." >&2
fi

echo "Verified rollback LRS deleted:"
echo "  $rollback_file"

echo
echo "=== Final active files ==="

stat -c '%s bytes  %y  %n' \
  "$repo_dir/learning-record-store" \
  "$repo_dir/summary.json" \
  "$repo_dir/answer-attempt-summary.json"

echo
echo "Archive package:"
echo "  $run_dir"

finish 0
