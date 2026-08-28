#!/bin/bash
set -euo pipefail

APP_CONTAINER=${APP_CONTAINER:-devximserver}
MONGO_CONTAINER=${XRONOS_MONGO_BRIDGE_CONTAINER:-xronos-mongo5-bridge}
SOURCE_DB=${XRONOS_MONGO_SOURCE_DB:-ximera}
DEST_DB=${XRONOS_MONGO_DEST_DB:-ximera}

usage() {
    cat <<'USAGE'
Usage: scripts/modernization/migrate-mongo3-to-mongo5-bridge.sh [--check|--migrate|--migrate-quiesced]

--check             Verify source/destination availability and show collection
                    counts. Makes no database changes.
--migrate           Stream BSON documents from the bundled MongoDB 3.x database
                    into an EMPTY external MongoDB 5 bridge database. Historical
                    collection options and indexes are NOT restored.
--migrate-quiesced  Make an exact test-server snapshot. This mode temporarily
                    SIGSTOPs the running `node app.js` process, disables the
                    source MongoDB TTL monitor, DROPS the bridge destination
                    database, performs the document-only migration, verifies all
                    collection counts, and then resumes Node and restores the TTL
                    monitor. The source MongoDB itself remains running throughout.

Neither migration mode switches Xronos to the external database. The quiesced
mode intentionally replaces only the disposable bridge destination database.
USAGE
}

mode=${1:---check}
case "$mode" in
    --check|--migrate|--migrate-quiesced) ;;
    *) usage; exit 2 ;;
esac

podman container exists "$APP_CONTAINER" || {
    echo "ERROR: application container '$APP_CONTAINER' does not exist." >&2
    exit 1
}

podman container exists "$MONGO_CONTAINER" || {
    echo "ERROR: MongoDB bridge container '$MONGO_CONTAINER' does not exist." >&2
    exit 1
}

if [[ "$(podman inspect "$MONGO_CONTAINER" --format '{{.State.Running}}')" != "true" ]]; then
    echo "ERROR: MongoDB bridge container '$MONGO_CONTAINER' is not running." >&2
    exit 1
fi

source_counts() {
    podman exec "$APP_CONTAINER" mongo "$SOURCE_DB" --quiet --eval '
        db.getCollectionNames().sort().forEach(function(name) {
            print(name + "\t" + db.getCollection(name).count());
        });
    '
}

destination_counts() {
    podman exec "$MONGO_CONTAINER" mongo "$DEST_DB" --quiet --eval '
        db.getCollectionNames().sort().forEach(function(name) {
            print(name + "\t" + db.getCollection(name).count());
        });
    '
}

destination_object_count() {
    podman exec "$MONGO_CONTAINER" mongo "$DEST_DB" --quiet --eval '
        var total = 0;
        db.getCollectionNames().forEach(function(name) {
            total += db.getCollection(name).count();
        });
        print(total);
    ' | tail -n 1 | tr -d "[:space:]"
}

source_version=$(podman exec "$APP_CONTAINER" mongo --quiet --eval 'print(db.version())' | tail -n 1 | tr -d '[:space:]')
dest_version=$(podman exec "$MONGO_CONTAINER" mongo --quiet --eval 'print(db.version())' | tail -n 1 | tr -d '[:space:]')

echo "SOURCE_CONTAINER=$APP_CONTAINER"
echo "SOURCE_DB=$SOURCE_DB"
echo "DEST_CONTAINER=$MONGO_CONTAINER"
echo "DEST_DB=$DEST_DB"
echo
echo "Source MongoDB:"
echo "$source_version"
echo "Destination MongoDB:"
echo "$dest_version"

echo
echo "Source collection counts:"
source_counts

echo
echo "Destination collection counts:"
destination_counts

if [[ "$mode" == "--check" ]]; then
    exit 0
fi

if [[ "$mode" == "--migrate" ]]; then
    dest_objects=$(destination_object_count)
    if [[ ! "$dest_objects" =~ ^[0-9]+$ ]]; then
        echo "ERROR: could not determine destination object count: '$dest_objects'" >&2
        exit 1
    fi

    if [[ "$dest_objects" != "0" ]]; then
        echo "ERROR: destination database '$DEST_DB' is not empty ($dest_objects objects)." >&2
        echo "Refusing to overwrite or merge existing destination data." >&2
        exit 1
    fi
fi

source_before=$(mktemp)
source_after=$(mktemp)
dest_after=$(mktemp)
NODE_PID=""
TTL_WAS_ENABLED=""
QUIESCED=0

cleanup() {
    rc=$?
    set +e

    if [[ "$QUIESCED" == "1" ]]; then
        if [[ -n "$TTL_WAS_ENABLED" ]]; then
            echo
            echo "Restoring source MongoDB TTL monitor to $TTL_WAS_ENABLED..."
            podman exec "$APP_CONTAINER" mongo admin --quiet --eval \
                "printjson(db.adminCommand({setParameter:1,ttlMonitorEnabled:${TTL_WAS_ENABLED}}))" \
                >/dev/null 2>&1 || echo "WARNING: failed to restore TTL monitor automatically." >&2
        fi

        if [[ -n "$NODE_PID" ]]; then
            echo "Resuming Xronos node app (PID $NODE_PID)..."
            podman exec "$APP_CONTAINER" kill -CONT "$NODE_PID" \
                >/dev/null 2>&1 || echo "WARNING: failed to resume node app automatically." >&2
        fi
    fi

    rm -f "$source_before" "$source_after" "$dest_after"
    exit "$rc"
}
trap cleanup EXIT INT TERM

if [[ "$mode" == "--migrate-quiesced" ]]; then
    echo
    echo "Preparing quiesced source snapshot..."

    mapfile -t node_pids < <(
        podman exec "$APP_CONTAINER" sh -c \
            "ps -eo pid=,args= | awk '\$2 == \"node\" && \$3 == \"app.js\" {print \$1}'"
    )

    if [[ "${#node_pids[@]}" -ne 1 ]]; then
        echo "ERROR: expected exactly one running 'node app.js' process; found ${#node_pids[@]}." >&2
        printf 'PIDs: %s\n' "${node_pids[*]:-none}" >&2
        exit 1
    fi
    NODE_PID=${node_pids[0]}

    TTL_WAS_ENABLED=$(podman exec "$APP_CONTAINER" mongo admin --quiet --eval '
        var result = db.adminCommand({getParameter:1, ttlMonitorEnabled:1});
        if (!result.ok) { printjson(result); quit(2); }
        print(result.ttlMonitorEnabled ? "true" : "false");
    ' | tail -n 1 | tr -d '[:space:]')

    if [[ "$TTL_WAS_ENABLED" != "true" && "$TTL_WAS_ENABLED" != "false" ]]; then
        echo "ERROR: could not determine source ttlMonitorEnabled state: '$TTL_WAS_ENABLED'" >&2
        exit 1
    fi

    echo "Disabling source MongoDB TTL monitor (was $TTL_WAS_ENABLED)..."
    podman exec "$APP_CONTAINER" mongo admin --quiet --eval \
        'var r=db.adminCommand({setParameter:1,ttlMonitorEnabled:false}); if(!r.ok){printjson(r);quit(2);}' \
        >/dev/null

    echo "Pausing Xronos node app (PID $NODE_PID)..."
    podman exec "$APP_CONTAINER" kill -STOP "$NODE_PID"
    QUIESCED=1

    # Give any database operation already handed to mongod a moment to finish.
    sleep 1

    echo "Dropping disposable bridge database '$DEST_DB' before exact copy..."
    podman exec "$MONGO_CONTAINER" mongo "$DEST_DB" --quiet --eval '
        var r=db.dropDatabase();
        if (!r.ok) { printjson(r); quit(2); }
        printjson(r);
    '
fi

source_counts > "$source_before"

echo
echo "Streaming BSON data to external MongoDB bridge..."
echo "Indexes and collection options are intentionally not restored."

podman exec "$APP_CONTAINER" \
    mongodump --db "$SOURCE_DB" --archive \
  | podman exec -i "$MONGO_CONTAINER" \
    mongorestore \
        --archive \
        --nsFrom="${SOURCE_DB}.*" \
        --nsTo="${DEST_DB}.*" \
        --noIndexRestore \
        --noOptionsRestore

echo
echo "Re-reading counts after migration..."
source_counts > "$source_after"
destination_counts > "$dest_after"

echo
echo "Source counts captured before dump:"
cat "$source_before"

echo
echo "Source counts after restore completed:"
cat "$source_after"

echo
echo "Destination counts after restore:"
cat "$dest_after"

if ! cmp -s "$source_before" "$source_after"; then
    echo >&2
    echo "ERROR: source collection counts changed during migration." >&2
    echo "The destination must not be used for cutover." >&2
    exit 1
fi

if ! cmp -s "$source_before" "$dest_after"; then
    echo >&2
    echo "ERROR: destination collection counts do not match the source snapshot." >&2
    echo "Do not use the destination for cutover." >&2
    exit 1
fi

echo
echo "MONGO DATA MIGRATION VERIFIED"
echo "All collection counts match the quiesced source snapshot."
echo "Xronos has NOT yet been switched to the external database."
