var assert = require('assert');
var reset = require('../scripts/reset-student-data');

describe('student reset argument safety', function() {
    it('defaults to dry-run Test Student selection', function() {
        assert.deepStrictEqual(
            reset.parseArguments([]),
            {
                execute: false,
                userId: null,
                confirmNonTest: false
            }
        );
    });

    it('allows explicit execution for the default Test Student', function() {
        var options = reset.parseArguments(['--execute']);
        assert.strictEqual(options.execute, true);
        assert.strictEqual(options.userId, null);
    });

    it('allows previewing an explicit user without extra confirmation', function() {
        var options = reset.parseArguments([
            '--user',
            '0123456789abcdef01234567'
        ]);

        assert.strictEqual(options.execute, false);
        assert.strictEqual(options.userId, '0123456789abcdef01234567');
        assert.strictEqual(options.confirmNonTest, false);
    });

    it('rejects executing an explicit-user reset without confirmation', function() {
        assert.throws(function() {
            reset.parseArguments([
                '--user',
                '0123456789abcdef01234567',
                '--execute'
            ]);
        }, /requires --confirm-non-test/);
    });

    it('allows an explicitly confirmed non-test reset', function() {
        var options = reset.parseArguments([
            '--user',
            '0123456789abcdef01234567',
            '--confirm-non-test',
            '--execute'
        ]);

        assert.strictEqual(options.execute, true);
        assert.strictEqual(options.confirmNonTest, true);
    });

    it('rejects malformed Mongo user ids', function() {
        assert.throws(function() {
            reset.parseArguments(['--user', 'not-an-object-id']);
        }, /24-character Mongo ObjectId/);
    });
});
