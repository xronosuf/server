/*
 * Compatibility adapter for math-expressions 2.0.0-alpha94.
 *
 * Xronos historically consumes math-expressions as:
 *
 *     require('math-expressions').fromText(...)
 *
 * Alpha94 is loaded as a standalone browser UMD script before main.min.js.
 * The page bootstrap normalizes alpha94's full default-export API onto the
 * stable global window.MathExpressions. Browserified Xronos modules continue
 * to use require('math-expressions'), which Aliasify redirects here.
 *
 * Historical Xronos answer validation also passes MathJax's toMathML() output
 * to fromLatex() first, relying on older math-expressions versions to throw so
 * that math-answer.js can fall back to fromMml(). Alpha94 is more permissive:
 * it can parse MathML markup as nonsensical LaTeX without throwing. Preserve
 * the legacy intent by recognizing markup at this single compatibility
 * boundary and trying fromMml() first, while retaining the original fromLatex
 * behavior as a fallback for unusual historical content.
 */

var root =
    typeof window !== 'undefined' ? window :
    typeof globalThis !== 'undefined' ? globalThis :
    this;

if (!root || !root.MathExpressions) {
    throw new Error(
        'MathExpressions global is unavailable; ' +
        'math-expressions must load before main.min.js'
    );
}

var mathExpressions = root.MathExpressions;

function decodeXmlText(text) {
    return String(text)
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

function textOnlyMathMl(input) {
    var text = typeof input === 'string' ? input.trim() : '';
    var match;

    /*
     * Sage string answers are normalized to a single MathML mtext token at
     * the MathJax boundary.  When that token later reaches ordinary expression
     * validation, alpha94's MathML parser does not preserve the intended text
     * reliably.  Recover the token and parse the same text a student types.
     *
     * Keep this deliberately narrow: only a complete <math><mtext>...</mtext>
     * (or bare <mtext>) value is treated as textual canonical input. Mixed
     * mathematical MathML continues through the library's normal parser.
     */
    match = text.match(
        /^(?:<math(?:\s[^>]*)?>\s*)?<mtext(?:\s[^>]*)?>([\s\S]*?)<\/mtext>\s*(?:<\/math>)?$/i
    );

    if (!match || /<[^>]+>/.test(match[1])) {
        return null;
    }

    return decodeXmlText(match[1]);
}

if (
    !mathExpressions.__xronosMathMlLatexCompatibility &&
    typeof mathExpressions.fromLatex === 'function' &&
    typeof mathExpressions.fromMml === 'function'
) {
    var originalFromLatex = mathExpressions.fromLatex;
    var originalFromMml = mathExpressions.fromMml;

    mathExpressions.fromMml = function(input) {
        var canonicalText = textOnlyMathMl(input);

        if (
            canonicalText !== null &&
            typeof mathExpressions.fromText === 'function'
        ) {
            return mathExpressions.fromText(canonicalText);
        }

        return originalFromMml.call(mathExpressions, input);
    };

    mathExpressions.fromLatex = function(input) {
        var text = typeof input === 'string' ? input.trim() : '';

        // MathJax's answer.toMathML() output is XML/MathML.  Older Xronos
        // code nevertheless sends it through fromLatex() before falling back
        // to fromMml().  Alpha94 no longer reliably throws for that misuse,
        // so dispatch obvious markup to the MathML parser first.
        if (text.charAt(0) === '<') {
            try {
                var parsedMathMl = mathExpressions.fromMml(input);

                if (parsedMathMl) {
                    return parsedMathMl;
                }
            } catch (err) {
                // Preserve the historical fallback below.
            }
        }

        return originalFromLatex.call(mathExpressions, input);
    };

    mathExpressions.__xronosMathMlLatexCompatibility = true;
}

module.exports = mathExpressions;
