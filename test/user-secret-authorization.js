'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

describe('user API secret authorization', function() {
    var putSecret;
    var updates;

    beforeEach(function() {
        updates = [];
        var exports = {};
        var source = fs.readFileSync(
            path.join(__dirname, '../routes/user.js'),
            'utf8'
        );
        var mockMdb = {
            ObjectId: function(id) { this.value = id; },
            User: {
                updateOne: function(filter, update) {
                    updates.push({ filter: filter, update: update });
                    return Promise.resolve();
                }
            }
        };
        vm.runInNewContext(source, {
            exports: exports,
            require: function(name) {
                if (name === '../mdb') return mockMdb;
                if (name === '../config') return {};
                return require(name);
            }
        }, { filename: 'routes/user.js' });
        putSecret = exports.putSecret;
    });

    function response() {
        return {
            statusCode: 200,
            body: undefined,
            status: function(code) { this.statusCode = code; return this; },
            sendStatus: function(code) { this.statusCode = code; return this; },
            json: function(value) { this.body = value; return this; }
        };
    }

    it('rejects anonymous access with 401 without a database write', async function() {
        var res = response();
        await putSecret({ params: { id: 'other-user' } }, res, function(err) {
            throw err;
        });
        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(updates.length, 0);
    });

    it('rejects writing another user secret with 403 without crashing', async function() {
        var res = response();
        await putSecret({
            params: { id: 'other-user' },
            user: { _id: { toString: function() { return 'own-user'; } } }
        }, res, function(err) { throw err; });
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(updates.length, 0);
    });

    it('allows an authenticated user to rotate their own secret', async function() {
        var res = response();
        await putSecret({
            params: { id: 'own-user' },
            user: { _id: { toString: function() { return 'own-user'; } } }
        }, res, function(err) { throw err; });
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(updates.length, 1);
        assert.ok(res.body.apiKey);
        assert.ok(res.body.apiSecret);
        assert.strictEqual(updates[0].filter._id.value, 'own-user');
    });
});
