var assert = require('assert');
var report = require('../scripts/grade-sync-recovery-report');

describe('grade sync recovery history report', function() {
    it('requires a bounded event or user lookup and parses optional filters', function() {
        var options = report.parseArgs([
            '--user', '507f1f77bcf86cd799439011',
            '--repository', 'testsuite',
            '--path', 'test-suite-xourse',
            '--limit', '7'
        ]);

        assert.strictEqual(options.userId, '507f1f77bcf86cd799439011');
        assert.strictEqual(options.repository, 'testsuite');
        assert.strictEqual(options.path, 'test-suite-xourse');
        assert.strictEqual(options.limit, 7);
        assert.throws(function() {
            report.parseArgs([]);
        }, /Specify --event or --user/);
        assert.throws(function() {
            report.parseArgs(['--event', 'abc', '--limit', '101']);
        }, /--limit must be an integer/);
    });

    it('normalizes only the bounded recovery event fields', function() {
        var normalized = report.normalizeDocument({
            eventId: 'event-1',
            user: '507f1f77bcf86cd799439011',
            repository: 'testsuite',
            path: 'test-suite-xourse',
            action: 'recheck-status',
            observedAt: new Date('2026-09-09T20:30:00.000Z'),
            expiresAt: new Date('2026-12-08T20:30:00.000Z'),
            gradeSyncState: 'ready',
            gradeSyncReason: 'passback-ready',
            launchPrimary: 'exact',
            launchReferenceRecorded: true,
            bridgeCount: 1,
            activeGradePassbackBridgeCount: 1,
            queueStatusAvailable: true,
            currentLaunchBridgeId: 'bridge-1',
            lisResultSourcedid: 'SECRET',
            oauthConsumerKey: 'SECRET',
            outcomeUrl: 'SECRET',
            cookie: 'SECRET'
        });

        assert.strictEqual(normalized.eventId, 'event-1');
        assert.strictEqual(normalized.action, 'recheck-status');
        assert.strictEqual(normalized.observedAt, '2026-09-09T20:30:00.000Z');
        assert.strictEqual(normalized.launchPrimary, 'exact');

        var serialized = JSON.stringify(normalized);
        assert.strictEqual(serialized.indexOf('SECRET'), -1);
        assert.strictEqual(serialized.indexOf('sourcedid'), -1);
        assert.strictEqual(serialized.indexOf('oauth'), -1);
        assert.strictEqual(serialized.indexOf('outcome'), -1);
        assert.strictEqual(serialized.indexOf('cookie'), -1);
    });
});
