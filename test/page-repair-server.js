'use strict';

var assert = require('assert');
var pageRepair = require('../lib/page-repair');

describe('page repair server policy', function() {
    it('rejects malformed recovery tokens', function() {
        assert.strictEqual(pageRepair.normalizeToken('short'), null);
        assert.strictEqual(pageRepair.normalizeToken('bad token with spaces'), null);
        assert.strictEqual(pageRepair.normalizeToken(['one', 'two']), null);
    });

    it('adds the recovery token to versioned asset URLs', function() {
        assert.strictEqual(
            pageRepair.appendToken('/public/vabc/main.js', 'xr-token-123456789'),
            '/public/vabc/main.js?xronosRepair=xr-token-123456789'
        );
        assert.strictEqual(
            pageRepair.appendToken('/node_modules/vabc/mathjax/', 'xr-token-123456789'),
            '/node_modules/vabc/mathjax/?xronosRepair=xr-token-123456789'
        );
    });

    it('applies cache-only Clear-Site-Data without touching storage or cookies', function() {
        var headers = {};
        var res = {
            locals: {},
            set: function(name, value) {
                headers[name] = value;
            }
        };
        var req = {
            query: {
                xronosRepair: 'xr-token-123456789'
            }
        };
        var token = pageRepair.applyRecoveryResponse(
            req,
            res,
            function(url) {
                return '/public/vabc/' + url.replace(/^\/+/, '');
            }
        );

        assert.strictEqual(token, 'xr-token-123456789');
        assert.strictEqual(headers['Clear-Site-Data'], '"cache"');
        assert.ok(headers['Cache-Control'].indexOf('no-store') !== -1);
        assert.strictEqual(headers['Clear-Site-Data'].indexOf('cookies'), -1);
        assert.strictEqual(headers['Clear-Site-Data'].indexOf('storage'), -1);
        assert.strictEqual(res.locals.xronosRepairToken, token);
        assert.strictEqual(
            res.locals.versionPath('/javascripts/main.min.js'),
            '/public/vabc/javascripts/main.min.js?xronosRepair=xr-token-123456789'
        );
    });

    it('leaves ordinary responses unchanged', function() {
        var res = {
            locals: {},
            set: function() {
                throw new Error('ordinary response should not set repair headers');
            }
        };

        assert.strictEqual(
            pageRepair.applyRecoveryResponse({query: {}}, res, function(url) { return url; }),
            null
        );
        assert.deepStrictEqual(res.locals, {});
    });
});
