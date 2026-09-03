var assert = require('assert');
var normalization = require('../public/javascripts/sage-answer-normalization');

describe('Sage canonical answer string normalization', function() {
    it('detects authored Sage macros inside string answers', function() {
        assert.strictEqual(
            normalization.containsSageMacro('\\sage{answerValue}'),
            true
        );
    });

    it('detects stable-id Sage macros inside string answers', function() {
        assert.strictEqual(
            normalization.containsSageMacro(
                '\\xronosSageById{stable-id}{answerValue}'
            ),
            true
        );
    });

    it('does not classify literal string answers as Sage', function() {
        assert.strictEqual(
            normalization.containsSageMacro('No solution'),
            false
        );
    });

    it('extracts DNE from Sage string display LaTeX', function() {
        assert.strictEqual(
            normalization.extractSageString('\\text{\\texttt{DNE}}'),
            'DNE'
        );
    });

    it('extracts arbitrary Sage string content', function() {
        assert.strictEqual(
            normalization.extractSageString('\\text{\\texttt{NONE}}'),
            'NONE'
        );
    });

    it('preserves spaces in Sage string content', function() {
        assert.strictEqual(
            normalization.extractSageString('\\text{\\texttt{No solution}}'),
            'No solution'
        );
    });

    it('decodes common TeX escapes in Sage string content', function() {
        assert.strictEqual(
            normalization.extractSageString('\\text{\\texttt{A\\_B\\%}}'),
            'A_B%'
        );
    });

    it('does not alter ordinary Sage mathematical LaTeX', function() {
        assert.strictEqual(
            normalization.extractSageString('\\frac{3}{4}'),
            null
        );
    });

    it('requires the complete Sage string wrapper', function() {
        assert.strictEqual(
            normalization.extractSageString('2+\\text{\\texttt{DNE}}'),
            null
        );
    });
});
