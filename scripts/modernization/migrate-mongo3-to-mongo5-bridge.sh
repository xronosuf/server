#!/bin/bash
set -euo pipefail

APP_CONTAINER=${APP_CONTAINER:-devximserver}
MONGO_CONTAINER=${XRONOS_MONGO_BRIDGE_CONTAINER:-xronos-mongo5-bridge}
SOURCE_DB=${XRONOS_MONGO_SOURCE_DB:-ximera}
DEST_DB=${XRONOS_MONGO_DEST_DB:-ximera}

usage() {
    cat <<'USAGE'
Usage: scripts/modernization/migrate-mongo3-to-mongo5-bridge.sh [--check|--migrate]

--check    Verify source/destination availability and show collection counts.
           Makes no database changes.
--migrate  Stream BSON documents from the bundled MongoDB 3.x database into
           the external MongoDB 5 bridge. The destination must be empty.
           Historical collection options and indexes are NOT restored.

This script does not restart Xronos, stop the bundled MongoDB, or switch the
application to the external database.
USAGE
}

mode=${1:---check}
case "$mode" in
    --check|--migrate) ;;
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

echo "SOURCE_CONTAINER=$APP_CONTAINER"
echo "SOURCE_DB=$SOURCE_DB"
echo "DEST_CONTAINER=$MONGO_CONTAINER"
echo "DEST_DB=$DEST_DB"
echo

echo "Source MongoDB:"
podman exec "$APP_CONTAINER" mongo --quiet --eval 'print(db.version())'

echo "Destination MongoDB:"
podman exec "$MONGO_CONTAINER" mongo --quiet --eval 'print(db.version())'

echo
echo "Source collection counts:"
source_counts

echo
echo "Destination collection counts:"
destination_counts

if [[ "$mode" == "--check" ]]; then
    exit 0
fi

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

# Capture source counts immediately before the dump. If the live test server is
# written during migration, the final equality check may fail. That is safer
# than silently accepting an inconsistent copy.
source_before=$(mktemp)
source_after=$(mktemp)
dest_after=$(mktemp)
trap 'rm -f "$source_before" "$source_after" "$dest_after"' EXIT

source_counts > "$source_before"

echo
echo "Streaming BSON data to external MongoDB bridge..."
echo "Indexes and collection options are intentionally not restored."

# MongoDB 3.2's tools produce an archive stream that MongoDB 5's restore tool
# can consume. We restore documents only, avoiding legacy index-version and
# collection-option metadata across the major-version boundary.
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
    echo "The destination contains a test copy, but it must not be used for cutover." >&2
    echo "A quiesced migration will be required for an exact final copy." >&2
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
echo "All collection counts match and the source did not change during the copy."
echo "The running Xronos application still uses its bundled MongoDB."
