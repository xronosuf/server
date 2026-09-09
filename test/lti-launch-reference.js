var assert = require('assert');
var launchReference = require('../lib/lti-launch-reference');

function bridge() {
    return {
        _id: 'bridge-1',
        toolConsumerInstanceGuid: 'canvas.example.edu',
        contextId: 'course-1',
        resourceLinkId: 'assignment-1',
        repository: 'testsuite',
        path: 'test-suite-xourse',
        oauthConsumerKey: 'do-not-store',
        lisResultSourcedid: 'do-not-store-either'
    };
}

describe('LTI launch session reference', function() {
    it('builds only the privacy-safe bridge identity needed by diagnostics', function() {
        var value = launchReference.fromBridge(
            bridge(),
            '2026-09-09T18:30:00.000Z'
        );
        var serialized = JSON.stringify(value);

        assert.strictEqual(value.bridgeId, 'bridge-1');
        assert.strictEqual(value.contextId, 'course-1');
        assert.strictEqual(value.resourceLinkId, 'assignment-1');
        assert.strictEqual(value.repository, 'testsuite');
        assert.strictEqual(value.path, 'test-suite-xourse');
        assert.strictEqual(value.observedAt, '2026-09-09T18:30:00.000Z');
        assert.strictEqual(serialized.indexOf('do-not-store'), -1);
    });

    it('records and reads the current launch reference through the session', function() {
        var req = {session: {}};

        launchReference.record(
            req,
            bridge(),
            '2026-09-09T18:30:00.000Z'
        );

        assert.deepStrictEqual(
            launchReference.read(req),
            {
                bridgeId: 'bridge-1',
                toolConsumerInstanceGuid: 'canvas.example.edu',
                contextId: 'course-1',
                resourceLinkId: 'assignment-1',
                repository: 'testsuite',
                path: 'test-suite-xourse',
                observedAt: '2026-09-09T18:30:00.000Z'
            }
        );
    });

    it('does nothing when no session exists', function() {
        assert.strictEqual(
            launchReference.record({}, bridge()),
            null
        );
        assert.strictEqual(launchReference.read({}), null);
    });
});
