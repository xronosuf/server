'use strict';

var spawn = require('child_process').spawn;

/*
 * Minimal GPG wrapper for the server-side repository-claim workflow.
 *
 * node-gpg 0.6.0 writes directly to the child process stdin without
 * installing an error handler on that stream. If gpg exits before all input
 * is written, Node can emit an unhandled EPIPE on stdin and terminate the
 * entire Xronos process.
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
    var stdinError = null;

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
     * GPG can legitimately finish a read-only operation such as --fingerprint
     * before Node finishes closing the unused stdin pipe. In that case Node
     * may report EPIPE even though GPG exits successfully. Record the stdin
     * error and let the child exit status decide whether the operation failed.
     *
     * For a non-zero GPG exit, retain the stdin error as a final fallback when
     * GPG itself produced no useful stderr/stdout diagnostic.
     */
    child.stdin.on('error', function(err) {
        stdinError = err;
    });

    child.on('close', function(code) {
        var output = Buffer.concat(stdout, stdoutLength);

        if (code !== 0) {
            done(
                new Error(
                    stderr ||
                    output.toString() ||
                    (stdinError && stdinError.message) ||
                    ('gpg exited with code ' + code)
                )
            );
            return;
        }

        done(null, output, stderr);
    });

    try {
        child.stdin.end(input);
    } catch (err) {
        stdinError = err;
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
