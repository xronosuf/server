#!/bin/bash
set -euo pipefail

APP_CONTAINER=${APP_CONTAINER:-devximserver}
MONGO_CONTAINER=${XRONOS_MONGO_BRIDGE_CONTAINER:-xronos-mongo5-bridge}
TEST_DB=${XRONOS_MONGO_BRIDGE_TEST_DB:-ximera_connectivity_test}
TEST_URI="mongodb://${MONGO_CONTAINER}:27017/${TEST_DB}"

podman container exists "$APP_CONTAINER" || {
    echo "ERROR: application container '$APP_CONTAINER' does not exist." >&2
    exit 1
}

podman container exists "$MONGO_CONTAINER" || {
    echo "ERROR: MongoDB bridge container '$MONGO_CONTAINER' does not exist." >&2
    exit 1
}

if [[ "$(podman inspect "$MONGO_CONTAINER" --format '{{.State.Running}}')" != "true" ]]; then
    echo "ERROR: MongoDB bridge container is not running." >&2
    exit 1
fi

echo "Waiting for MongoDB bridge readiness..."
ready=0
for i in $(seq 1 30); do
    if podman exec "$MONGO_CONTAINER" \
        mongo --quiet --eval 'quit(db.adminCommand({ping:1}).ok ? 0 : 1)' \
        >/dev/null 2>&1; then
        ready=1
        break
    fi
    sleep 1
done

if [[ "$ready" != "1" ]]; then
    echo "ERROR: MongoDB bridge did not become ready." >&2
    podman logs "$MONGO_CONTAINER" >&2 || true
    exit 1
fi

podman exec "$MONGO_CONTAINER" mongo --quiet --eval '
print("MongoDB bridge version: " + db.version());
printjson(db.adminCommand({ping:1}));
'

echo
podman exec \
    -e MONGO_BRIDGE_HOST="$MONGO_CONTAINER" \
    "$APP_CONTAINER" \
    node - <<'NODECHECK'
var net = require('net');
var host = process.env.MONGO_BRIDGE_HOST;
var socket = net.createConnection({host: host, port: 27017});
socket.setTimeout(5000);
socket.on('connect', function() {
    console.log('TCP connection to ' + host + ':27017: OK');
    socket.end();
});
socket.on('timeout', function() {
    console.error('TCP connection timed out');
    socket.destroy();
    process.exit(1);
});
socket.on('error', function(err) {
    console.error('TCP connection failed:', err);
    process.exit(1);
});
NODECHECK

echo
podman exec \
    -e XIMERA_MONGO_URI="$TEST_URI" \
    "$APP_CONTAINER" \
    node - <<'NODETEST'
var mdb = require('./mdb');

console.log('Node version:', process.version);
console.log('Mongoose version:', mdb.mongoose.version);
console.log('Resolved URI:', mdb.url);

var done = false;
var timer;

function finish(code, err) {
    if (done) return;
    done = true;
    if (timer) clearTimeout(timer);

    if (err) {
        console.error('MONGOOSE CONNECTIVITY TEST FAILED');
        console.error(err);
    }

    try {
        mdb.mongoose.disconnect(function() {
            process.exit(code);
        });
    } catch (disconnectErr) {
        process.exit(code);
    }
}

timer = setTimeout(function() {
    finish(1, new Error('Timed out waiting for Mongoose connectivity test'));
}, 15000);

mdb.initialize(function(err) {
    if (err) return finish(1, err);

    console.log('Mongoose connection: OK');

    var admin = mdb.mongoose.connection.db.admin();
    admin.serverInfo(function(err, info) {
        if (err) return finish(1, err);

        console.log('Connected MongoDB version:', info.version);

        mdb.mongoose.connection.db.dropDatabase(function(err) {
            if (err) return finish(1, err);

            console.log('Disposable connectivity-test database removed.');
            console.log('MONGOOSE CONNECTIVITY TEST PASSED');
            finish(0);
        });
    });
});
NODETEST

echo
podman exec "$APP_CONTAINER" mongo ximera --quiet --eval '
print("Original internal MongoDB version: " + db.version());
print("users:    " + db.users.count());
print("sessions: " + db.sessions.count());
print("states:   " + db.states.count());
'
