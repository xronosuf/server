'use strict';

var spawn = require('child_process').spawn;

/*
 * Minimal GPG wrapper for the server-side repository-claim workflow.
 *
 * node-gpg 0.6.0 writes directly to the child process stdin without
 * installing an error handler on that stream. If gpg exits before all input
 * is written (for example because GNUPGHOME is unavailable), Node can emit an
 * unhandled EPIPE on stdin and terminate the entire Xronos process.
 *
 * Keep the legacy call/encrypt/importKey API used by routes/gpg.js while
 * handling child-process and stdin errors explicitly.
 */

function once(fn) {
    var called = false;

    return function() {
        if (called) {
            return;
        }

        called = true;
        fn.apply(this, arguments);
    };
}

function run(input, args, callback) {
    var done = once(callback);
    var child;
    var stdout = [];
    var stdoutLength = 0;
    var stderr = '';

    try {
        child = spawn(
            'gpg',
            ['--batch'].concat(args || [])
        );
    } catch (err) {
        done(err);
        return;
    }

    child.on('error', done);

    child.stdout.on('data', function(buffer) {
        stdout.push(buffer);
        stdoutLength += buffer.length;
    });

    child.stderr.on('data', function(buffer) {
        stderr += buffer.toString('utf8');
    });

    /*
     * This is the important difference from node-gpg 0.6.0: stdin errors are
     * consumed and returned through the callback instead of becoming an
     * unhandled EventEmitter error that can crash the Node process.
     */
    child.stdin.on('error', done);

    child.on('close', function(code) {
        var output = Buffer.concat(stdout, stdoutLength);

        if (code !== 0) {
            done(new Error(stderr || output.toString()));
            return;
        }

        done(null, output, stderr);
    });

    try {
        child.stdin.end(input);
    } catch (err) {
        done(err);
    }
}

exports.call = function(input, args, callback) {
    run(input, args, callback);
};

exports.encrypt = function(input, args, callback) {
    run(
        input,
        (args || []).concat(['--encrypt']),
        callback
    );
};

exports.importKey = function(keytext, callback) {
    run(
        keytext,
        ['--import'],
        callback
    );
};
