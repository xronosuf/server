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

module.exports = root.MathExpressions;
