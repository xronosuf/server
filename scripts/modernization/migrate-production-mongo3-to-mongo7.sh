#!/bin/bash
set -euo pipefail

MODE=${1:---help}

EXPECTED_HOST=${XRONOS_EXPECTED_HOST:-ls-xronos01}
APP_CONTAINER=${XRONOS_APP_CONTAINER:-xronos}
SOURCE_HOST=${XRONOS_MONGO_SOURCE_HOST:-127.0.0.1}
SOURCE_PORT=${XRONOS_MONGO_SOURCE_PORT:-27017}
DB=${XRONOS_MONGO_DATABASE:-ximera}

NETWORK=${XRONOS_MODERNIZATION_NETWORK:-xronos-modernization-net}
MONGO_CONTAINER=${XRONOS_MONGO_REHEARSAL_CONTAINER:-xronos-mongo-rehearsal}
MONGO_VOLUME=${XRONOS_MONGO_REHEARSAL_VOLUME:-xronos-mongo-rehearsal-data}
REDIS_CONTAINER=${XRONOS_REDIS_REHEARSAL_CONTAINER:-xronos-redis-rehearsal}

MONGO5_IMAGE=${XRONOS_MONGO5_IMAGE:-docker.io/library/mongo:5.0.31}
MONGO6_IMAGE=${XRONOS_MONGO6_IMAGE:-docker.io/library/mongo:6.0.27}
MONGO7_IMAGE=${XRONOS_MONGO7_IMAGE:-docker.io/library/mongo:7.0.40}
REDIS_IMAGE=${XRONOS_REDIS7_IMAGE:-docker.io/library/redis:7.4.11-bookworm}
APP_IMAGE=${XRONOS_MODERN_APP_IMAGE:-localhost/xronos-server:55d59b2}

RUN_ROOT=${XRONOS_MONGO_MIGRATION_RUN_ROOT:-/home/ximera/mongo-migration-run}
DUMP_ROOT="$RUN_ROOT/dump"
DUMP_DIR="$DUMP_ROOT/$DB"
TIMING_FILE="$RUN_ROOT/timings.txt"

usage() {
    cat <<'USAGE'
Usage:
  scripts/modernization/migrate-production-mongo3-to-mongo7.sh --rehearse-live
  scripts/modernization/migrate-production-mongo3-to-mongo7.sh --cutover-quiesced

--rehearse-live
    Non-disruptive rehearsal. Production Xronos remains running. The script
    records live source counts before and after mongodump, restores the dump
    into an isolated MongoDB 5 volume, advances it through MongoDB 6 and 7,
    builds indexes with the Node 24 application image, verifies exact counts
    remain unchanged across destination upgrade stages, and runs read-only
    Node 24 model acceptance plus isolated Redis 7 acceptance.

    Because production remains writable while mongodump runs, this mode does
    NOT claim that the dump is an exact frozen source snapshot. It does prove
    that the captured dump survives restore, binary/FCV upgrades, index builds,
    and application reads without destination document loss.

--cutover-quiesced
    Future maintenance-window mode. Requires:

      XRONOS_ALLOW_PRODUCTION_QUIESCE=YES

    This mode pauses the running Xronos node application, disables the source
    MongoDB TTL monitor, proves exact source counts are unchanged across the
    dump, then performs the same isolated migration and validation pipeline.
    The source MongoDB itself is never upgraded or modified except for the
    temporary TTL-monitor setting. The node process and source TTL setting are
    restored automatically on exit.

The destination rehearsal container/volume, Redis rehearsal container, and run
root must NOT already exist or contain data. The script fails closed rather
than merging with previous rehearsal state.
USAGE
}

case "$MODE" in
    --rehearse-live|--cutover-quiesced) ;;
    --help|-h|help) usage; exit 0 ;;
    *) usage; exit 2 ;;
esac

if [[ "$MODE" == "--cutover-quiesced" ]] && \
   [[ "${XRONOS_ALLOW_PRODUCTION_QUIESCE:-NO}" != "YES" ]]; then
    echo "ERROR: quiesced mode requires XRONOS_ALLOW_PRODUCTION_QUIESCE=YES" >&2
    exit 1
fi

now_epoch() { date +%s; }

duration() {
    local seconds=$1
    printf '%02d:%02d:%02d' \
        $((seconds / 3600)) \
        $(((seconds % 3600) / 60)) \
        $((seconds % 60))
}

record_timing() {
    local label=$1
    local seconds=$2
    printf '%-40s %s\n' "$label" "$(duration "$seconds")" | tee -a "$TIMING_FILE"
}

source_mongo() {
    mongo --quiet --host "$SOURCE_HOST" --port "$SOURCE_PORT" "$@"
}

mongo_shell_name() {
    local container=$1
    if podman exec "$container" sh -lc 'command -v mongosh >/dev/null 2>&1'; then
        printf '%s\n' mongosh
    else
        printf '%s\n' mongo
    fi
}

dest_mongo() {
    local database=$1
    local javascript=$2
    local shell
    shell=$(mongo_shell_name "$MONGO_CONTAINER")
    podman exec "$MONGO_CONTAINER" "$shell" --quiet "$database" --eval "$javascript"
}

wait_for_mongo() {
    local ready=0
    for _ in $(seq 1 120); do
        if dest_mongo admin 'quit(db.adminCommand({ping:1}).ok ? 0 : 2)' >/dev/null 2>&1; then
            ready=1
            break
        fi
        sleep 1
    done
    [[ "$ready" == "1" ]]
}

capture_source_counts() {
    local output=$1
    source_mongo "$DB" --eval '
        db.getCollectionNames().sort().forEach(function(name) {
            print(name + "\t" + db.getCollection(name).find({}).itcount());
        });
    ' > "$output"
}

capture_dest_counts() {
    local output=$1
    dest_mongo "$DB" '
        db.getCollectionNames().sort().forEach(function(name) {
            print(name + "\t" + db.getCollection(name).find({}).itcount());
        });
    ' > "$output"
}

assert_counts_equal() {
    local expected=$1
    local actual=$2
    local label=$3
    if ! cmp -s "$expected" "$actual"; then
        echo "ERROR: exact collection counts differ: $label" >&2
        diff -u "$expected" "$actual" || true
        exit 1
    fi
    echo "$label: PASS"
}

show_dest_version_fcv() {
    dest_mongo admin '
        print("version=" + db.version());
        printjson(db.adminCommand({getParameter:1,featureCompatibilityVersion:1}));
    '
}

assert_dest_version_fcv() {
    local expected_version=$1
    local expected_fcv=$2
    local version fcv
    version=$(dest_mongo admin 'print(db.version())' | tail -1 | tr -d '[:space:]')
    fcv=$(dest_mongo admin '
        print(db.adminCommand({getParameter:1,featureCompatibilityVersion:1}).featureCompatibilityVersion.version);
    ' | tail -1 | tr -d '[:space:]')
    [[ "$version" == "$expected_version" ]] || {
        echo "ERROR: expected Mongo $expected_version; found $version" >&2
        exit 1
    }
    [[ "$fcv" == "$expected_fcv" ]] || {
        echo "ERROR: expected FCV $expected_fcv; found $fcv" >&2
        exit 1
    }
}

start_mongo_image() {
    local image=$1
    podman run -d \
        --name "$MONGO_CONTAINER" \
        --network "$NETWORK" \
        --volume "$MONGO_VOLUME:/data/db" \
        --entrypoint /usr/bin/mongod \
        "$image" \
        --bind_ip_all >/dev/null
    wait_for_mongo
}

replace_mongo_image() {
    local image=$1
    podman stop --time 60 "$MONGO_CONTAINER" >/dev/null
    podman rm "$MONGO_CONTAINER" >/dev/null
    start_mongo_image "$image"
}

NODE_PID=""
SOURCE_TTL_WAS=""
SOURCE_QUIESCED=0
DEST_TTL_DISABLED=0

cleanup() {
    local rc=$?
    set +e

    if [[ "$SOURCE_QUIESCED" == "1" ]]; then
        if [[ -n "$SOURCE_TTL_WAS" ]]; then
            source_mongo admin --eval \
                "var r=db.adminCommand({setParameter:1,ttlMonitorEnabled:${SOURCE_TTL_WAS}}); if(!r.ok){printjson(r);quit(2);}" \
                >/dev/null 2>&1 || echo "WARNING: failed to restore source TTL monitor." >&2
        fi
        if [[ -n "$NODE_PID" ]]; then
            podman exec "$APP_CONTAINER" kill -CONT "$NODE_PID" \
                >/dev/null 2>&1 || echo "WARNING: failed to resume production node process." >&2
        fi
    fi

    exit "$rc"
}
trap cleanup EXIT INT TERM

TOTAL_START=$(now_epoch)

mkdir -p "$RUN_ROOT"
: > "$TIMING_FILE"

echo "============================================================"
echo "XRONOS PRODUCTION MONGO 3.2 -> 7 MIGRATION"
echo "MODE=$MODE"
echo "============================================================"

[[ "$(hostname -s)" == "$EXPECTED_HOST" ]]
[[ "$(git branch --show-current)" == "podman" || "$(git branch --show-current)" == "legacy-modernization" ]]
[[ "$(podman inspect "$APP_CONTAINER" --format '{{.State.Status}}')" == "running" ]]
[[ "$(podman inspect sagecell --format '{{.State.Status}}')" == "running" ]]
[[ "$(source_mongo --eval 'print(db.version())' | tail -1 | tr -d '[:space:]')" == "3.2.22" ]]

for image in "$MONGO5_IMAGE" "$MONGO6_IMAGE" "$MONGO7_IMAGE" "$REDIS_IMAGE" "$APP_IMAGE"; do
    podman image exists "$image" || {
        echo "ERROR: required image missing: $image" >&2
        exit 1
    }
done
podman network exists "$NETWORK"

if podman container exists "$MONGO_CONTAINER"; then
    echo "ERROR: destination Mongo container already exists: $MONGO_CONTAINER" >&2
    exit 1
fi
if podman container exists "$REDIS_CONTAINER"; then
    echo "ERROR: rehearsal Redis container already exists: $REDIS_CONTAINER" >&2
    exit 1
fi

if ! podman volume exists "$MONGO_VOLUME"; then
    podman volume create "$MONGO_VOLUME" >/dev/null
fi
VOLUME_PATH=$(podman volume inspect "$MONGO_VOLUME" --format '{{.Mountpoint}}')
if find "$VOLUME_PATH" -mindepth 1 -print -quit | grep -q .; then
    echo "ERROR: destination Mongo volume is not empty: $MONGO_VOLUME" >&2
    exit 1
fi

if find "$RUN_ROOT" -mindepth 1 ! -name timings.txt -print -quit | grep -q .; then
    echo "ERROR: run root is not fresh: $RUN_ROOT" >&2
    exit 1
fi
mkdir -p "$DUMP_ROOT"

echo
if [[ "$MODE" == "--cutover-quiesced" ]]; then
    echo "Quiescing production Xronos and source TTL monitor..."
    mapfile -t node_pids < <(
        podman exec "$APP_CONTAINER" sh -c \
            "ps -eo pid=,args= | awk '\$2 == \"node\" && \$3 == \"app.js\" {print \$1}'"
    )
    [[ "${#node_pids[@]}" -eq 1 ]] || {
        echo "ERROR: expected exactly one node app.js process; found ${#node_pids[@]}" >&2
        exit 1
    }
    NODE_PID=${node_pids[0]}
    SOURCE_TTL_WAS=$(source_mongo admin --eval '
        var r=db.adminCommand({getParameter:1,ttlMonitorEnabled:1});
        if(!r.ok){printjson(r);quit(2);} print(r.ttlMonitorEnabled ? "true" : "false");
    ' | tail -1 | tr -d '[:space:]')
    [[ "$SOURCE_TTL_WAS" == "true" || "$SOURCE_TTL_WAS" == "false" ]]
    source_mongo admin --eval '
        var r=db.adminCommand({setParameter:1,ttlMonitorEnabled:false});
        if(!r.ok){printjson(r);quit(2);}
    ' >/dev/null
    podman exec "$APP_CONTAINER" kill -STOP "$NODE_PID"
    SOURCE_QUIESCED=1
    sleep 1
fi

COUNT_T0=$(now_epoch)
capture_source_counts "$RUN_ROOT/source-before.tsv"
COUNT_T1=$(now_epoch)
record_timing "Source exact count scan before dump" $((COUNT_T1-COUNT_T0))

DUMP_T0=$(now_epoch)
mongodump \
    --host "$SOURCE_HOST" \
    --port "$SOURCE_PORT" \
    --db "$DB" \
    --out "$DUMP_ROOT"
DUMP_T1=$(now_epoch)
record_timing "Mongo 3.2 logical dump" $((DUMP_T1-DUMP_T0))

COUNT_T0=$(now_epoch)
capture_source_counts "$RUN_ROOT/source-after.tsv"
COUNT_T1=$(now_epoch)
record_timing "Source exact count scan after dump" $((COUNT_T1-COUNT_T0))

if [[ "$MODE" == "--cutover-quiesced" ]]; then
    assert_counts_equal "$RUN_ROOT/source-before.tsv" "$RUN_ROOT/source-after.tsv" \
        "Frozen source unchanged across dump"
fi

M5_T0=$(now_epoch)
start_mongo_image "$MONGO5_IMAGE"
assert_dest_version_fcv 5.0.31 5.0
podman run --rm \
    --network "$NETWORK" \
    --volume "$DUMP_ROOT:/rehearsal:ro" \
    --entrypoint /usr/bin/mongorestore \
    "$MONGO5_IMAGE" \
    --host "$MONGO_CONTAINER" \
    --port 27017 \
    --db "$DB" \
    --noIndexRestore \
    --noOptionsRestore \
    "/rehearsal/$DB"
M5_T1=$(now_epoch)
record_timing "Start Mongo 5 + restore" $((M5_T1-M5_T0))

COUNT_T0=$(now_epoch)
capture_dest_counts "$RUN_ROOT/mongo5.tsv"
COUNT_T1=$(now_epoch)
record_timing "Mongo 5 exact count verification" $((COUNT_T1-COUNT_T0))

if [[ "$MODE" == "--cutover-quiesced" ]]; then
    assert_counts_equal "$RUN_ROOT/source-before.tsv" "$RUN_ROOT/mongo5.tsv" \
        "Mongo 5 matches frozen source"
fi

M6_T0=$(now_epoch)
replace_mongo_image "$MONGO6_IMAGE"
assert_dest_version_fcv 6.0.27 5.0
dest_mongo admin '
    var r=db.adminCommand({setFeatureCompatibilityVersion:"6.0"});
    printjson(r); if(!r.ok) quit(2);
' >/dev/null
assert_dest_version_fcv 6.0.27 6.0
M6_T1=$(now_epoch)
record_timing "Mongo 5 -> 6 + FCV 6.0" $((M6_T1-M6_T0))

COUNT_T0=$(now_epoch)
capture_dest_counts "$RUN_ROOT/mongo6.tsv"
COUNT_T1=$(now_epoch)
record_timing "Mongo 6 exact count verification" $((COUNT_T1-COUNT_T0))
assert_counts_equal "$RUN_ROOT/mongo5.tsv" "$RUN_ROOT/mongo6.tsv" \
    "Mongo 6 preserves Mongo 5 snapshot"

M7_T0=$(now_epoch)
replace_mongo_image "$MONGO7_IMAGE"
assert_dest_version_fcv 7.0.40 6.0
dest_mongo admin '
    var r=db.adminCommand({setFeatureCompatibilityVersion:"7.0",confirm:true});
    printjson(r); if(!r.ok) quit(2);
' >/dev/null
assert_dest_version_fcv 7.0.40 7.0
# Disable destination TTL before any TTL index can be created.
dest_mongo admin '
    var r=db.adminCommand({setParameter:1,ttlMonitorEnabled:false});
    printjson(r); if(!r.ok) quit(2);
' >/dev/null
DEST_TTL_DISABLED=1
M7_T1=$(now_epoch)
record_timing "Mongo 6 -> 7 + FCV 7.0" $((M7_T1-M7_T0))

COUNT_T0=$(now_epoch)
capture_dest_counts "$RUN_ROOT/mongo7-preindex.tsv"
COUNT_T1=$(now_epoch)
record_timing "Mongo 7 pre-index exact verification" $((COUNT_T1-COUNT_T0))
assert_counts_equal "$RUN_ROOT/mongo5.tsv" "$RUN_ROOT/mongo7-preindex.tsv" \
    "Mongo 7 preserves Mongo 5 snapshot"

INDEX_T0=$(now_epoch)
podman run --rm -i \
    --network "$NETWORK" \
    --entrypoint node \
    -e XIMERA_MONGO_URI="mongodb://${MONGO_CONTAINER}:27017/${DB}" \
    "$APP_IMAGE" - <<'NODEINDEX'
const mongoose = require('mongoose');
mongoose.set('autoIndex', false);
const mdb = require('./mdb');

function die(err) {
  console.error(err && err.stack ? err.stack : err);
  mongoose.disconnect().catch(function() {}).finally(function() { process.exit(1); });
}

mdb.initialize(async function(err) {
  if (err) return die(err);
  try {
    const models = Object.keys(mdb)
      .map(function(k) { return mdb[k]; })
      .filter(function(m) { return m && m.modelName && typeof m.createIndexes === 'function'; });
    for (const model of models) {
      console.log('BUILD INDEXES ' + model.modelName + ' collection=' + model.collection.name);
      await model.createIndexes();
    }
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    die(e);
  }
});
NODEINDEX

dest_mongo "$DB" '
    var r=db.sessions.createIndex({expires:1},{name:"expires_1",expireAfterSeconds:0});
    print(r);
' >/dev/null
INDEX_T1=$(now_epoch)
record_timing "Modern indexes + session TTL index" $((INDEX_T1-INDEX_T0))

COUNT_T0=$(now_epoch)
capture_dest_counts "$RUN_ROOT/mongo7-postindex.tsv"
COUNT_T1=$(now_epoch)
record_timing "Mongo 7 post-index exact verification" $((COUNT_T1-COUNT_T0))
assert_counts_equal "$RUN_ROOT/mongo5.tsv" "$RUN_ROOT/mongo7-postindex.tsv" \
    "Mongo 7 snapshot preserved after index build"

APPTEST_T0=$(now_epoch)
podman run --rm -i \
    --network "$NETWORK" \
    --entrypoint node \
    -e XIMERA_MONGO_URI="mongodb://${MONGO_CONTAINER}:27017/${DB}" \
    "$APP_IMAGE" - <<'NODETEST'
const mdb = require('./mdb');
function die(err) {
  console.error(err && err.stack ? err.stack : err);
  try { mdb.mongoose.disconnect().finally(function(){ process.exit(1); }); }
  catch (_) { process.exit(1); }
}
mdb.initialize(async function(err) {
  if (err) return die(err);
  try {
    if (mdb.mongoose.connection.readyState !== 1) throw new Error('Mongoose not connected');
    const required = [
      ['User', mdb.User], ['LtiBridge', mdb.LtiBridge], ['State', mdb.State],
      ['Completion', mdb.Completion], ['ProgressMilestone', mdb.ProgressMilestone],
      ['KeyAndSecret', mdb.KeyAndSecret]
    ];
    for (const pair of required) {
      const count = await pair[1].countDocuments({});
      const sample = await pair[1].findOne({}).select('_id').lean().exec();
      console.log(pair[0] + ' count=' + count + ' sample=' + (sample ? 'present' : 'empty'));
      if (count > 0 && !sample) throw new Error(pair[0] + ' sample read failed');
    }
    await mdb.mongoose.disconnect();
    process.exit(0);
  } catch (e) { die(e); }
});
NODETEST
APPTEST_T1=$(now_epoch)
record_timing "Node 24 / Mongoose data acceptance" $((APPTEST_T1-APPTEST_T0))

REDIS_T0=$(now_epoch)
podman run -d \
    --name "$REDIS_CONTAINER" \
    --network "$NETWORK" \
    --entrypoint redis-server \
    "$REDIS_IMAGE" \
    --save '' --appendonly no >/dev/null
for _ in $(seq 1 60); do
    if podman exec "$REDIS_CONTAINER" redis-cli ping 2>/dev/null | grep -Fxq PONG; then break; fi
    sleep 1
done
[[ "$(podman exec "$REDIS_CONTAINER" redis-cli ping)" == "PONG" ]]
podman run --rm -i \
    --network "$NETWORK" \
    --entrypoint node \
    -e XIMERA_REDIS_URL="$REDIS_CONTAINER" \
    -e XIMERA_REDIS_PORT=6379 \
    "$APP_IMAGE" - <<'NODEREDIS'
const Redis=require('ioredis');
const r=new Redis({host:process.env.XIMERA_REDIS_URL,port:Number(process.env.XIMERA_REDIS_PORT),lazyConnect:true});
(async function(){
  try {
    await r.connect();
    if (await r.ping() !== 'PONG') throw new Error('PING failed');
    const k='xronos-migration-test-'+Date.now();
    await r.set(k,'ok','EX',30);
    if (await r.get(k) !== 'ok') throw new Error('round trip failed');
    await r.del(k); await r.quit(); process.exit(0);
  } catch(e) { console.error(e); try{r.disconnect();}catch(_){} process.exit(1); }
})();
NODEREDIS
REDIS_T1=$(now_epoch)
record_timing "Isolated Redis 7 acceptance" $((REDIS_T1-REDIS_T0))

# Final exact gate while destination TTL remains disabled.
COUNT_T0=$(now_epoch)
capture_dest_counts "$RUN_ROOT/final.tsv"
COUNT_T1=$(now_epoch)
record_timing "FINAL exact integrity gate" $((COUNT_T1-COUNT_T0))
assert_counts_equal "$RUN_ROOT/mongo5.tsv" "$RUN_ROOT/final.tsv" \
    "FINAL migrated Mongo 7 snapshot integrity"

if [[ "$MODE" == "--cutover-quiesced" ]]; then
    assert_counts_equal "$RUN_ROOT/source-before.tsv" "$RUN_ROOT/final.tsv" \
        "FINAL Mongo 7 exactly matches frozen production source"
fi

TOTAL_END=$(now_epoch)
record_timing "TOTAL SCRIPT RUNTIME" $((TOTAL_END-TOTAL_START))

echo
echo "============================================================"
echo "MIGRATION VALIDATION COMPLETE"
echo "============================================================"
echo "Mongo binary: 7.0.40"
echo "Mongo FCV:    7.0"
echo "Destination TTL monitor: DISABLED pending explicit activation"
echo "Node24 model acceptance: PASS"
echo "Redis7 acceptance: PASS"
echo
echo "Timing summary:"
cat "$TIMING_FILE"
echo
if [[ "$MODE" == "--cutover-quiesced" ]]; then
    echo "SAFE DATA GATE: PASS — destination exactly matches frozen source snapshot."
else
    echo "LIVE REHEARSAL GATE: PASS — captured destination snapshot survived all migration stages exactly."
    echo "Production remained live, so this mode does not claim a frozen-source snapshot."
fi
echo
echo "The script does NOT start the modern Xronos web application."
echo "The script does NOT switch production traffic."
echo "The original host MongoDB is not upgraded."
