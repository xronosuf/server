#!/usr/bin/env node
'use strict';

var spawn = require('child_process').spawn;

var child = spawn(process.execPath, ['app.js'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit'
});

var shuttingDown = false;
var forceTimer = null;

function forwardSignal(signal) {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;
    console.log('Forwarding ' + signal + ' to Xronos node app (PID ' + child.pid + ')');

    try {
        child.kill(signal);
    } catch (err) {
        console.error('Failed to forward ' + signal + ':', err);
        process.exit(1);
    }

    forceTimer = setTimeout(function() {
        console.error('Xronos node app did not exit after signal; sending SIGKILL.');
        try {
            child.kill('SIGKILL');
        } catch (ignored) {}
    }, 8000);

    if (forceTimer.unref) {
        forceTimer.unref();
    }
}

process.on('SIGTERM', function() {
    forwardSignal('SIGTERM');
});

process.on('SIGINT', function() {
    forwardSignal('SIGINT');
});

child.on('error', function(err) {
    console.error('Unable to start Xronos node app:', err);
    process.exit(1);
});

child.on('exit', function(code, signal) {
    if (forceTimer) {
        clearTimeout(forceTimer);
    }

    if (signal) {
        console.log('Xronos node app exited from signal ' + signal);
        process.exit(0);
    }

    process.exit(code === null ? 1 : code);
});
