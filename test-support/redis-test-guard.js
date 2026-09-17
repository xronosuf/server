'use strict';

/*
 * The legacy server creates several ioredis clients at module-load time.
 * Loading app.js during the Mocha suite therefore used to start multiple
 * reconnect loops even when a test did not exercise Redis at all.  When the
 * test container had no Redis on 127.0.0.1:6379, those clients could continue
 * retrying indefinitely after Mocha had already printed its results.
 *
 * This preload module is used only by `npm test`.  It replaces the exported
 * ioredis constructor in Node's module cache with a constructor that preserves
 * normal Redis semantics except for connection lifecycle:
 *
 *   - do not connect merely because a module was required;
 *   - do not maintain an offline command queue;
 *   - do not retry/reconnect after a failed test connection;
 *   - fail a Redis-dependent test promptly when no test Redis exists.
 *
 * Production/server startup never loads this file and therefore keeps the
 * ordinary ioredis retry behavior.
 */

var Redis = require('ioredis');
var redisModulePath = require.resolve('ioredis');

function guardedOptions(options) {
    return Object.assign({}, options || {}, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 0,
        retryStrategy: function() {
            return null;
        }
    });
}

function guardedArguments(args) {
    args = Array.prototype.slice.call(args);

    if (args.length === 0) {
        return [guardedOptions({})];
    }

    if (
        args[0] &&
        typeof args[0] === 'object' &&
        !Array.isArray(args[0])
    ) {
        args[0] = guardedOptions(args[0]);
        return args;
    }

    /*
     * ioredis also supports (port, host, options) and (url, options).
     * Preserve those legacy forms while adding the test lifecycle options.
     */
    var lastIndex = args.length - 1;
    var last = args[lastIndex];

    if (
        last &&
        typeof last === 'object' &&
        !Array.isArray(last)
    ) {
        args[lastIndex] = guardedOptions(last);
    } else if (typeof args[0] === 'string') {
        args.push(guardedOptions({}));
    } else {
        while (args.length < 2) {
            args.push(undefined);
        }
        args.push(guardedOptions({}));
    }

    return args;
}

function TestSafeRedis() {
    var client = new (Function.prototype.bind.apply(
        Redis,
        [null].concat(guardedArguments(arguments))
    ))();

    /*
     * Some legacy clients have no error listener of their own.  A no-op test
     * listener prevents an intentionally unavailable Redis endpoint from
     * becoming an uncaught EventEmitter error.  Modules that attach their own
     * listeners still receive the same error event.
     */
    client.on('error', function() {});

    return client;
}

Object.keys(Redis).forEach(function(key) {
    TestSafeRedis[key] = Redis[key];
});
Object.setPrototypeOf(TestSafeRedis, Redis);
TestSafeRedis.prototype = Redis.prototype;

require.cache[redisModulePath].exports = TestSafeRedis;

exports.guardedArguments = guardedArguments;
exports.guardedOptions = guardedOptions;
exports.TestSafeRedis = TestSafeRedis;
