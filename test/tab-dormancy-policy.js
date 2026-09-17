'use strict';

var assert = require('assert');
var policy = require('../public/javascripts/tab-dormancy-policy');

describe('tab dormancy policy', function() {
    it('defers transport failures while hidden', function() {
        assert.strictEqual(policy.shouldDeferFailure({hidden: true, now: 10000}), true);
    });

    it('defers failures immediately after resume', function() {
        assert.strictEqual(policy.shouldDeferFailure({
            hidden: false,
            lastVisibleAt: 10000,
            now: 13000
        }), true);
    });

    it('allows a foreground failure after the resume grace period', function() {
        assert.strictEqual(policy.shouldDeferFailure({
            hidden: false,
            lastVisibleAt: 10000,
            now: 16000
        }), false);
    });

    it('returns the remaining grace period for a visible retry', function() {
        assert.strictEqual(policy.retryDelay({
            hidden: false,
            lastVisibleAt: 10000,
            now: 12500
        }), 2500);
    });
});
