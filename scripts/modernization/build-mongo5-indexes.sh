#!/bin/bash
set -euo pipefail

APP_CONTAINER=${APP_CONTAINER:-devximserver}
MONGO_CONTAINER=${XRONOS_MONGO_BRIDGE_CONTAINER:-xronos-mongo5-bridge}
SOURCE_DB=${XRONOS_MONGO_SOURCE_DB:-ximera}
DEST_DB=${XRONOS_MONGO_DEST_DB:-ximera}
MONGO_URI=${XRONOS_MONGO_BRIDGE_URI:-mongodb://${MONGO_CONTAINER}:27017/${DEST_DB}}

usage() {
    cat <<'USAGE'
Usage: scripts/modernization/build-mongo5-indexes.sh [--check|--build]

--check  Show source and destination index inventories without changing them.
--build  Use the current Xronos Mongoose 5 schemas to build application indexes
         natively on MongoDB 5, create the connect-mongo session TTL index, and
         show the resulting inventories. No application cutover is performed.
USAGE
}

mode=${1:---check}
case "$mode" in
    --check|--build) ;;
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

index_inventory() {
    local container=$1
    local database=$2

    podman exec "$container" mongo "$database" --quiet --eval '
        db.getCollectionNames().sort().forEach(function(name) {
            print("### " + name);
            db.getCollection(name).getIndexes().forEach(function(index) {
                var out = {
                    name: index.name,
                    key: index.key
                };
                if (index.unique !== undefined) out.unique = index.unique;
                if (index.sparse !== undefined) out.sparse = index.sparse;
                if (index.expireAfterSeconds !== undefined) out.expireAfterSeconds = index.expireAfterSeconds;
                printjson(out);
            });
        });
    '
}

echo "SOURCE_CONTAINER=$APP_CONTAINER"
echo "SOURCE_DB=$SOURCE_DB"
echo "DEST_CONTAINER=$MONGO_CONTAINER"
echo "DEST_DB=$DEST_DB"
echo "DEST_URI=$MONGO_URI"

echo
echo "============================================================"
echo "SOURCE INDEX INVENTORY"
echo "============================================================"
index_inventory "$APP_CONTAINER" "$SOURCE_DB"

echo
echo "============================================================"
echo "DESTINATION INDEX INVENTORY BEFORE BUILD"
echo "============================================================"
index_inventory "$MONGO_CONTAINER" "$DEST_DB"

if [[ "$mode" == "--check" ]]; then
    exit 0
fi

echo
echo "============================================================"
echo "BUILD MONGOOSE SCHEMA INDEXES ON MONGO 5"
echo "============================================================"

podman exec -i \
    -e XIMERA_MONGO_URI="$MONGO_URI" \
    "$APP_CONTAINER" \
    node - <<'NODEBUILD'
var mdb = require('./mdb');

function fail(err) {
    console.error('INDEX BUILD FAILED');
    console.error(err && err.stack ? err.stack : err);
    try {
        mdb.mongoose.disconnect(function() { process.exit(1); });
    } catch (ignored) {
        process.exit(1);
    }
}

mdb.initialize(function(err) {
    if (err) return fail(err);

    var models = Object.keys(mdb)
        .map(function(name) { return { name: name, value: mdb[name] }; })
        .filter(function(entry) {
            return entry.value &&
                typeof entry.value.ensureIndexes === 'function' &&
                entry.value.modelName;
        });

    console.log('Connected to:', mdb.url);
    console.log('Models with schema indexes:', models.map(function(x) { return x.value.modelName; }).join(', '));

    var index = 0;
    function next() {
        if (index >= models.length) {
            return mdb.mongoose.disconnect(function(disconnectErr) {
                if (disconnectErr) return fail(disconnectErr);
                console.log('MONGOOSE INDEX BUILD COMPLETE');
                process.exit(0);
            });
        }

        var entry = models[index++];
        var model = entry.value;
        model.ensureIndexes(function(indexErr) {
            if (indexErr) return fail(indexErr);
            console.log('indexes ensured:', model.collection.name);
            next();
        });
    }

    next();
});
NODEBUILD

echo
echo "============================================================"
echo "BUILD CONNECT-MONGO SESSION TTL INDEX"
echo "============================================================"

podman exec "$MONGO_CONTAINER" mongo "$DEST_DB" --quiet --eval '
var result = db.sessions.createIndex(
    { expires: 1 },
    { name: "expires_1", expireAfterSeconds: 0 }
);
print(result);
'

echo
echo "============================================================"
echo "DESTINATION INDEX INVENTORY AFTER BUILD"
echo "============================================================"
index_inventory "$MONGO_CONTAINER" "$DEST_DB"

echo
echo "INDEX BUILD COMPLETE"
echo "No Xronos application process was restarted or switched to MongoDB 5."
