var assert = require('assert');
var gradebook = require('../routes/gradebook');

describe('gradebook payload validation', function() {
    var validate = gradebook.validateGradebookPayload;

    it('accepts finite numeric values', function() {
        var result = validate({
            pointsEarned: 2,
            pointsPossible: 3
        });

        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.pointsEarned, 2);
        assert.strictEqual(result.pointsPossible, 3);
        assert.strictEqual(result.normalizedScore, 2 / 3);
    });

    it('accepts numeric strings from legacy requests', function() {
        var result = validate({
            pointsEarned: '2.5',
            pointsPossible: '10'
        });

        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.pointsEarned, 2.5);
        assert.strictEqual(result.pointsPossible, 10);
        assert.strictEqual(result.normalizedScore, 0.25);
    });

    it('rejects a missing pointsEarned value', function() {
        var result = validate({
            pointsPossible: 10
        });

        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.field, 'pointsEarned');
    });

    it('rejects a missing pointsPossible value', function() {
        var result = validate({
            pointsEarned: 2
        });

        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.field, 'pointsPossible');
    });

    it('rejects a zero denominator', function() {
        var result = validate({
            pointsEarned: 2,
            pointsPossible: 0
        });

        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.field, 'pointsPossible');
    });

    it('rejects a negative denominator', function() {
        var result = validate({
            pointsEarned: 2,
            pointsPossible: -1
        });

        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.field, 'pointsPossible');
    });

    it('rejects nonnumeric values', function() {
        var earnedResult = validate({
            pointsEarned: 'not-a-number',
            pointsPossible: 10
        });
        var possibleResult = validate({
            pointsEarned: 2,
            pointsPossible: 'not-a-number'
        });

        assert.strictEqual(earnedResult.valid, false);
        assert.strictEqual(earnedResult.field, 'pointsEarned');
        assert.strictEqual(possibleResult.valid, false);
        assert.strictEqual(possibleResult.field, 'pointsPossible');
    });

    it('rejects empty strings and boolean values', function() {
        var emptyResult = validate({
            pointsEarned: '',
            pointsPossible: 10
        });
        var booleanResult = validate({
            pointsEarned: 2,
            pointsPossible: true
        });

        assert.strictEqual(emptyResult.valid, false);
        assert.strictEqual(emptyResult.field, 'pointsEarned');
        assert.strictEqual(booleanResult.valid, false);
        assert.strictEqual(booleanResult.field, 'pointsPossible');
    });

    it('rejects infinite values', function() {
        var result = validate({
            pointsEarned: Infinity,
            pointsPossible: 10
        });

        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.field, 'pointsEarned');
    });
});
