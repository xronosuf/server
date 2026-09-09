var assert = require('assert');
var report = require('../lib/grade-sync-diagnostic-report');

function bridge(id, overrides) {
    var value = {
        _id: id,
        repository: 'testsuite',
        path: 'test-suite-xourse',
        toolConsumerInstanceGuid: 'canvas.example.edu',
        contextId: 'course-1',
        resourceLinkId: 'assignment-1'
    };

    Object.keys(overrides || {}).forEach(function(key) {
        value[key] = overrides[key];
    });

    return value;
}

describe('grade sync diagnostic report', function() {
    it('combines exact launch-match and passback evidence without secrets', function() {
        var bridges = [
            bridge('bridge-1', {
                oauthConsumerKey: 'do-not-expose',
                lisResultSourcedid: 'do-not-expose-either'
            })
        ];

        var value = report.build({
            reference: {
                toolConsumerInstanceGuid: 'canvas.example.edu',
                contextId: 'course-1',
                resourceLinkId: 'assignment-1'
            },
            allUserBridges: bridges,
            page: {
                repository: 'testsuite',
                path: 'test-suite-xourse'
            },
            runtime: {
                status: {
                    state: 'pending',
                    reason: 'passback-pending',
                    bridgeCount: 1,
                    gradePassbackBridgeCount: 1,
                    activeGradePassbackBridgeCount: 1,
                    queuedGradePassbackCount: 1,
                    acceptedGradePassbackCount: 0,
                    unresolvedActiveGradePassbackCount: 0,
                    queueStatusAvailable: true
                },
                diagnostics: {
                    bridges: [
                        {
                            bridgeId: 'bridge-1',
                            state: 'passback-pending',
                            repository: 'testsuite',
                            path: 'test-suite-xourse'
                        }
                    ]
                }
            }
        });

        assert.strictEqual(value.launchMatch.primary, 'exact');
        assert.strictEqual(value.passback.state, 'pending');
        assert.strictEqual(value.passback.queuedGradePassbackCount, 1);
        assert.strictEqual(value.bridges.length, 1);
        assert.strictEqual(JSON.stringify(value).indexOf('do-not-expose'), -1);
    });

    it('reports same-page different-context evidence without claiming user behavior', function() {
        var value = report.build({
            reference: {
                toolConsumerInstanceGuid: 'canvas.example.edu',
                contextId: 'course-2',
                resourceLinkId: 'assignment-2'
            },
            allUserBridges: [
                bridge('bridge-1', {
                    contextId: 'course-1',
                    resourceLinkId: 'assignment-1'
                })
            ],
            page: {
                repository: 'testsuite',
                path: 'test-suite-xourse'
            },
            runtime: {
                status: {
                    state: 'not-syncing',
                    reason: 'no-bridge',
                    queueStatusAvailable: true
                }
            }
        });

        assert.strictEqual(
            value.launchMatch.primary,
            'same-page-different-context'
        );
        assert.ok(
            value.launchMatch.message.indexOf('recorded') !== -1
        );
        assert.strictEqual(
            value.launchMatch.message.indexOf('never launched'),
            -1
        );
    });

    it('marks queue evidence unavailable without fabricating counts', function() {
        var value = report.build({
            runtime: {
                status: {
                    state: 'ready',
                    reason: 'passback-ready',
                    bridgeCount: 1,
                    queueStatusAvailable: false
                }
            }
        });

        assert.strictEqual(value.passback.queueStatusAvailable, false);
        assert.strictEqual(value.passback.queuedGradePassbackCount, 0);
        assert.strictEqual(value.passback.state, 'ready');
    });
});
