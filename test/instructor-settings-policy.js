'use strict';

var assert = require('assert');
var instructorSettings = require('../lib/instructor-settings');
var lateGradePolicy = require('../lib/late-grade-policy');

function validBridge(overrides) {
    return Object.assign({
        _id: 'bridge-id',
        ltiId: 'user-context',
        oauthConsumerKey: 'registered-key',
        toolConsumerInstanceGuid: 'canvas.example.edu',
        contextId: 'course-123',
        repository: 'mac1140',
        path: 'xourse'
    }, overrides || {});
}

describe('instructor settings policy', function() {
    it('requires a persisted authoritative LTI bridge identity', function() {
        assert.strictEqual(
            instructorSettings.bridgeHasAuthoritativeLtiContext(validBridge()),
            true
        );

        ['_id', 'ltiId', 'oauthConsumerKey', 'toolConsumerInstanceGuid', 'contextId']
            .forEach(function(field) {
                var bridge = validBridge();
                bridge[field] = null;
                assert.strictEqual(
                    instructorSettings.bridgeHasAuthoritativeLtiContext(bridge),
                    false,
                    'expected missing ' + field + ' to reject the bridge'
                );
            });
    });

    it('keys shell identity by LMS installation and course context, not instructor', function() {
        assert.deepStrictEqual(
            instructorSettings.shellIdentityFromBridge(validBridge({user: 'instructor-a'})),
            {
                toolConsumerInstanceGuid: 'canvas.example.edu',
                contextId: 'course-123'
            }
        );

        assert.deepStrictEqual(
            instructorSettings.shellIdentityFromBridge(validBridge({user: 'instructor-b'})),
            {
                toolConsumerInstanceGuid: 'canvas.example.edu',
                contextId: 'course-123'
            }
        );
    });

    it('creates a fixed 130-day fallback from shell settings creation time', function() {
        var createdAt = new Date('2026-08-24T12:00:00Z');
        var values = instructorSettings.defaultGlobalValues(createdAt);

        assert.strictEqual(
            values.settings.gradeSyncCutoff,
            instructorSettings.GRADE_SYNC_LATE_POLICY
        );
        assert.strictEqual(values.createdAt.getTime(), createdAt.getTime());
        assert.strictEqual(
            values.fallbackGradeSyncEndAt.getTime(),
            createdAt.getTime() + instructorSettings.FALLBACK_DAYS * 24 * 60 * 60 * 1000
        );
    });

    it('declares grade sync cutoff as global-only', function() {
        assert.deepStrictEqual(
            instructorSettings.DEFINITIONS.gradeSyncCutoff.scopes,
            [instructorSettings.GLOBAL_SCOPE]
        );
    });

    it('uses Canvas Until under the default late policy', function() {
        var bridge = validBridge({
            gradeSyncCutoff: 'late-policy',
            dueDate: new Date('2026-09-01T00:00:00Z'),
            untilDate: new Date('2026-09-10T00:00:00Z'),
            fallbackGradeSyncEndAt: new Date('2026-12-31T00:00:00Z')
        });
        var end = lateGradePolicy.passbackWindowEnd(bridge);

        assert.strictEqual(end.source, 'canvas-until');
        assert.strictEqual(end.time, bridge.untilDate.getTime());
    });

    it('uses the fixed shell fallback when late policy has no Canvas Until', function() {
        var bridge = validBridge({
            gradeSyncCutoff: 'late-policy',
            dueDate: new Date('2026-09-01T00:00:00Z'),
            untilDate: null,
            fallbackGradeSyncEndAt: new Date('2026-12-31T00:00:00Z')
        });
        var end = lateGradePolicy.passbackWindowEnd(bridge);

        assert.strictEqual(end.source, 'shell-fallback');
        assert.strictEqual(end.time, bridge.fallbackGradeSyncEndAt.getTime());
    });

    it('uses Canvas due date when due-date cutoff is selected', function() {
        var bridge = validBridge({
            gradeSyncCutoff: 'due-date',
            dueDate: new Date('2026-09-01T00:00:00Z'),
            untilDate: new Date('2026-09-10T00:00:00Z'),
            fallbackGradeSyncEndAt: new Date('2026-12-31T00:00:00Z')
        });
        var end = lateGradePolicy.passbackWindowEnd(bridge);

        assert.strictEqual(end.source, 'xronos-due-date-setting');
        assert.strictEqual(end.time, bridge.dueDate.getTime());
    });

    it('falls back to the fixed shell horizon if due-date cutoff has no due date', function() {
        var bridge = validBridge({
            gradeSyncCutoff: 'due-date',
            dueDate: null,
            untilDate: new Date('2026-09-10T00:00:00Z'),
            fallbackGradeSyncEndAt: new Date('2026-12-31T00:00:00Z')
        });
        var end = lateGradePolicy.passbackWindowEnd(bridge);

        assert.strictEqual(end.source, 'shell-fallback');
        assert.strictEqual(end.time, bridge.fallbackGradeSyncEndAt.getTime());
    });

    it('keeps legacy window behavior only for bridges not yet materialized', function() {
        var bridge = validBridge({
            gradeSyncCutoff: undefined,
            fallbackGradeSyncEndAt: undefined,
            dueDate: new Date('2026-09-01T00:00:00Z'),
            untilDate: null
        });
        var end = lateGradePolicy.passbackWindowEnd(bridge);

        assert.strictEqual(end.source, 'fallback-after-due');
        assert.strictEqual(
            end.time,
            bridge.dueDate.getTime() + 130 * 24 * 60 * 60 * 1000
        );
    });
});
