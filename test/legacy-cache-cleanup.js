var assert = require('assert');
var cleanup = require(
    '../public/javascripts/legacy-cache-cleanup'
);

describe('legacy browser cache cleanup', function() {
    it('unregisters every existing service-worker registration', function() {
        var calls = [];
        var registrations = [
            {
                unregister: function() {
                    calls.push('first');
                    return Promise.resolve(true);
                }
            },
            {
                unregister: function() {
                    calls.push('second');
                    return Promise.resolve(true);
                }
            }
        ];

        return cleanup
            .unregisterLegacyServiceWorkers({
                serviceWorker: {
                    getRegistrations: function() {
                        return Promise.resolve(registrations);
                    }
                }
            })
            .then(function() {
                assert.deepStrictEqual(
                    calls,
                    ['first', 'second']
                );
            });
    });

    it('deletes every Cache Storage entry for the Xronos origin', function() {
        var deleted = [];
        var cacheStorage = {
            keys: function() {
                return Promise.resolve([
                    '1.2.22',
                    '2.6.0',
                    'legacy-xronos'
                ]);
            },
            delete: function(name) {
                deleted.push(name);
                return Promise.resolve(true);
            }
        };

        return cleanup
            .clearLegacyCacheStorage(cacheStorage)
            .then(function() {
                assert.deepStrictEqual(
                    deleted,
                    [
                        '1.2.22',
                        '2.6.0',
                        'legacy-xronos'
                    ]
                );
            });
    });

    it('is safe when service workers and Cache Storage are unavailable', function() {
        return cleanup
            .cleanupLegacyBrowserCaches({})
            .then(function(results) {
                assert.deepStrictEqual(
                    results,
                    [[], []]
                );
            });
    });
});
