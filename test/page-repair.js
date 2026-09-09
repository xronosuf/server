'use strict';

var assert = require('assert');
var pageRepair = require('../public/javascripts/page-repair');

describe('page repair browser helper', function() {
    it('builds a one-shot same-page recovery URL', function() {
        var url = pageRepair.recoveryUrl(
            {
                pathname: '/course/xourse/activity',
                hash: '#answer'
            },
            'xr-test-token-123456'
        );

        assert.strictEqual(
            url,
            '/course/xourse/activity?xronosRepair=xr-test-token-123456#answer'
        );
    });

    it('cleans legacy caches before navigating to the recovery URL', async function() {
        var assigned = null;
        var registrationsUnregistered = 0;
        var cacheDeleted = 0;
        var windowObject = {
            location: {
                pathname: '/course/xourse/activity',
                hash: '',
                assign: function(url) {
                    assigned = url;
                }
            },
            navigator: {
                serviceWorker: {
                    getRegistrations: function() {
                        return Promise.resolve([
                            {
                                unregister: function() {
                                    registrationsUnregistered += 1;
                                    return Promise.resolve(true);
                                }
                            }
                        ]);
                    }
                }
            },
            caches: {
                keys: function() {
                    return Promise.resolve(['old-xronos-cache']);
                },
                delete: function() {
                    cacheDeleted += 1;
                    return Promise.resolve(true);
                }
            },
            crypto: {
                getRandomValues: function(values) {
                    values[0] = 1;
                    values[1] = 2;
                    values[2] = 3;
                    values[3] = 4;
                    return values;
                }
            }
        };

        var result = await pageRepair.repairCurrentPage({window: windowObject});

        assert.strictEqual(registrationsUnregistered, 1);
        assert.strictEqual(cacheDeleted, 1);
        assert.ok(/^xr-/.test(result.token));
        assert.strictEqual(assigned, result.url);
        assert.ok(assigned.indexOf('?xronosRepair=') !== -1);
    });
});
