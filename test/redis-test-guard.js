'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var guard = require('../test-support/redis-test-guard');
var Redis = require('ioredis');

describe('Redis test lifecycle guard', function() {
    it('makes Redis clients lazy and disables reconnect loops during tests', function() {
        var client = new Redis({
            host: '127.0.0.1',
            port: 1
        });

        assert.strictEqual(client.options.lazyConnect, true);
        assert.strictEqual(client.options.enableOfflineQueue, false);
        assert.strictEqual(client.options.maxRetriesPerRequest, 0);
        assert.strictEqual(
            client.options.retryStrategy(1),
            null
        );
        assert.strictEqual(client.status, 'wait');

        client.disconnect();
    });

    it('preserves caller Redis options while adding test lifecycle controls', function() {
        var options = guard.guardedOptions({
            host: 'redis.example.test',
            port: 6380,
            db: 4
        });

        assert.strictEqual(options.host, 'redis.example.test');
        assert.strictEqual(options.port, 6380);
        assert.strictEqual(options.db, 4);
        assert.strictEqual(options.lazyConnect, true);
        assert.strictEqual(options.enableOfflineQueue, false);
        assert.strictEqual(options.maxRetriesPerRequest, 0);
        assert.strictEqual(options.retryStrategy(99), null);
    });

    it('keeps npm test explicitly guarded and bounded', function() {
        var packageJson = JSON.parse(
            fs.readFileSync(
                path.join(__dirname, '..', 'package.json'),
                'utf8'
            )
        );
        var command = packageJson.scripts.test;

        assert.ok(command.indexOf('NODE_ENV=test') >= 0);
        assert.ok(
            command.indexOf(
                '--require ./test-support/redis-test-guard.js'
            ) >= 0
        );
        assert.ok(command.indexOf('--exit') >= 0);
    });
});
