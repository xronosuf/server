var assert = require('assert');
var stringAnswer = require('../public/javascripts/math-answer-string');

describe('format=string canonical MathML extraction', function() {
    it('extracts text from bare mtext', function() {
        assert.strictEqual(
            stringAnswer.fromMathMl('<math><mtext>DNE</mtext></math>'),
            'DNE'
        );
    });

    it('extracts text when MathML elements have attributes', function() {
        assert.strictEqual(
            stringAnswer.fromMathMl('<math xmlns="http://www.w3.org/1998/Math/MathML"><mtext mathvariant="monospace">DNE</mtext></math>'),
            'DNE'
        );
    });

    it('tolerates intermediate MathML wrappers', function() {
        assert.strictEqual(
            stringAnswer.fromMathMl('<math><mrow><mstyle><mtext>NONE</mtext></mstyle></mrow></math>'),
            'NONE'
        );
    });

    it('decodes escaped literal XML characters after removing markup', function() {
        assert.strictEqual(
            stringAnswer.fromMathMl('<math><mtext>A &lt; B &amp; C</mtext></math>'),
            'A < B & C'
        );
    });

    it('decodes numeric character references', function() {
        assert.strictEqual(
            stringAnswer.fromMathMl('<math><mtext>A&#95;B</mtext></math>'),
            'A_B'
        );
    });
});
