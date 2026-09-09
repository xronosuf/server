var assert = require('assert');
var report = require('../public/javascripts/grade-sync-support-report');

describe('grade sync support report', function() {
    it('builds a bounded privacy-safe report from sanitized diagnostics', function() {
        var bridges = [];
        var i;

        for (i = 0; i < 12; i += 1) {
            bridges.push({
                bridgeId: 'bridge-' + i,
                state: 'passback-ready',
                repository: 'testsuite',
                path: 'test-suite-xourse',
                hasPassback: true,
                passbackOpen: true,
                queued: false,
                accepted: false,
                submittedScore: false,
                hasLastAcceptedScore: false,
                passbackWindow: {
                    dueDate: '2026-09-04T03:59:59.000Z',
                    untilDate: '2026-10-01T03:59:59.000Z',
                    end: '2026-10-01T03:59:59.000Z',
                    source: 'canvas-until',
                    outcomeUrl: 'SECRET'
                },
                lisResultSourcedid: 'SECRET',
                oauthConsumerKey: 'SECRET'
            });
        }

        var built = report.build({
            generatedAt: '2026-09-09T20:30:00.000Z',
            applicationVersion: 'abc123',
            path: '/testsuite/test-suite-xourse',
            gradeSync: {
                state: 'ready',
                reason: 'passback-ready',
                bridgeCount: 12,
                hasActiveGradePassback: true,
                secret: 'SECRET'
            },
            gradeSyncDiagnostics: {
                version: 1,
                page: {
                    repository: 'testsuite',
                    path: 'test-suite-xourse'
                },
                launchReferenceRecorded: true,
                launchMatch: {
                    primary: 'exact',
                    message: 'Exact match',
                    categories: ['exact'],
                    bridgeCount: 12,
                    pageBridgeCount: 12,
                    exactCount: 1,
                    sameContextDifferentAssignmentCount: 0,
                    samePageDifferentContextCount: 0,
                    missingMetadataCount: 0,
                    secret: 'SECRET'
                },
                passback: {
                    state: 'ready',
                    reason: 'passback-ready',
                    bridgeCount: 12,
                    queueStatusAvailable: true,
                    secret: 'SECRET'
                },
                bridges: bridges,
                lisResultSourcedid: 'SECRET',
                outcomeUrl: 'SECRET'
            },
            environment: {
                userAgent: 'browser',
                platform: 'platform',
                language: 'en-US',
                timezone: 'America/New_York',
                online: true,
                cookie: 'SECRET'
            }
        });
        var formatted = report.format(built);

        assert.strictEqual(built.reportType, 'xronos-grade-sync-report');
        assert.strictEqual(built.schemaVersion, 1);
        assert.strictEqual(built.gradeSync.state, 'ready');
        assert.strictEqual(built.gradeSyncDiagnostics.launchMatch.primary, 'exact');
        assert.strictEqual(built.gradeSyncDiagnostics.bridges.length, 10);
        assert.strictEqual(built.gradeSyncDiagnostics.bridgesTruncated, true);
        assert.strictEqual(formatted.indexOf('SECRET'), -1);
        assert.strictEqual(formatted.indexOf('lisResultSourcedid'), -1);
        assert.strictEqual(formatted.indexOf('oauthConsumerKey'), -1);
        assert.strictEqual(formatted.indexOf('outcomeUrl'), -1);
        assert.strictEqual(formatted.indexOf('cookie'), -1);
    });

    it('handles an unavailable diagnostic response without inventing evidence', function() {
        var built = report.build({
            generatedAt: '2026-09-09T20:30:00.000Z',
            path: '/testsuite/test-suite-xourse',
            gradeSync: {state: 'error'},
            gradeSyncDiagnostics: null,
            environment: {}
        });

        assert.strictEqual(built.gradeSync.state, 'error');
        assert.strictEqual(built.gradeSyncDiagnostics, null);
    });
});
