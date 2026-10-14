'use strict';

var assert = require('assert');
var completionPolicy = require('../lib/completion-policy');

describe('historical activity completion policy', function() {
    it('keeps the highest completion when a later attempt is lower', function() {
        assert.strictEqual(
            completionPolicy.maximum(0.8, 0.2),
            0.8
        );
    });

    it('advances completion when a later attempt is higher', function() {
        assert.strictEqual(
            completionPolicy.maximum(0.4, 0.75),
            0.75
        );
    });

    it('preserves full credit across an erased current attempt', function() {
        assert.strictEqual(
            completionPolicy.maximum(1, 0),
            1
        );
    });

    it('accepts zero as a real first completion value', function() {
        assert.strictEqual(
            completionPolicy.maximum(undefined, 0),
            0
        );
    });

    it('clamps completion to the activity-credit range', function() {
        assert.strictEqual(completionPolicy.normalize(-0.5), 0);
        assert.strictEqual(completionPolicy.normalize(1.5), 1);
    });

    it('ignores a nonnumeric incoming completion', function() {
        assert.strictEqual(
            completionPolicy.maximum(0.6, 'not-a-number'),
            0.6
        );
    });
});
