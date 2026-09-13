var assert = require('assert');
var recovery = require('../routes/grade-sync-recovery');

describe('grade sync recovery event contract', function() {
    it('accepts only the bounded student recovery actions', function() {
        assert.strictEqual(
            recovery.allowedAction('recheck-status'),
            'recheck-status'
        );
        assert.strictEqual(
            recovery.allowedAction('view-canvas-relaunch-guidance'),
            'view-canvas-relaunch-guidance'
        );
        assert.strictEqual(recovery.allowedAction('delete-bridge'), null);
        assert.strictEqual(recovery.allowedAction('SECRET'), null);
    });

    it('builds a bounded recovery record from server diagnostics', function() {
        var observedAt = new Date('2026-09-09T20:30:00.000Z');
        var event = recovery.recoveryEvent({
            eventId: 'recovery-event-1',
            user: 'user-id',
            repository: 'testsuite',
            path: 'test-suite-xourse',
            action: 'recheck-status',
            observedAt: observedAt,
            reference: {
                bridgeId: 'bridge-current',
                oauthConsumerKey: 'SECRET'
            },
            diagnostics: {
                launchReferenceRecorded: true,
                launchMatch: {
                    primary: 'exact',
                    message: 'Exact match',
                    secret: 'SECRET'
                },
                passback: {
                    state: 'pending',
                    reason: 'passback-pending',
                    bridgeCount: 1,
                    activeGradePassbackBridgeCount: 1,
                    queueStatusAvailable: true,
                    sourcedid: 'SECRET'
                },
                bridges: [{
                    bridgeId: 'bridge-current',
                    outcomeUrl: 'SECRET'
                }]
            }
        });

        assert.strictEqual(event.eventId, 'recovery-event-1');
        assert.strictEqual(event.action, 'recheck-status');
        assert.strictEqual(event.gradeSyncState, 'pending');
        assert.strictEqual(event.gradeSyncReason, 'passback-pending');
        assert.strictEqual(event.launchPrimary, 'exact');
        assert.strictEqual(event.launchReferenceRecorded, true);
        assert.strictEqual(event.bridgeCount, 1);
        assert.strictEqual(event.activeGradePassbackBridgeCount, 1);
        assert.strictEqual(event.queueStatusAvailable, true);
        assert.strictEqual(event.currentLaunchBridgeId, 'bridge-current');
        assert.strictEqual(
            event.expiresAt.getTime() - event.observedAt.getTime(),
            recovery.RETENTION_DAYS * 24 * 60 * 60 * 1000
        );

        var serialized = JSON.stringify(event);
        assert.strictEqual(serialized.indexOf('SECRET'), -1);
        assert.strictEqual(serialized.indexOf('oauthConsumerKey'), -1);
        assert.strictEqual(serialized.indexOf('sourcedid'), -1);
        assert.strictEqual(serialized.indexOf('outcomeUrl'), -1);
    });

    it('does not trust an arbitrary action while building an event', function() {
        var event = recovery.recoveryEvent({
            action: 'delete-everything',
            diagnostics: {}
        });

        assert.strictEqual(event.action, null);
    });
});
