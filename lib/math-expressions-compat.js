/*
 * Compatibility adapter for math-expressions 2.0.0-alpha94.
 *
 * Xronos historically consumes math-expressions as:
 *
 *     require('math-expressions').fromText(...)
 *
 * Alpha94 exposes the legacy API as the default export of its modern
 * package build. Browserify 13 also predates package "exports" support.
 * Load the official alpha94 UMD artifact directly and normalize its module
 * shape back to the legacy Xronos API.
 */

var mathExpressions = require(
    '../node_modules/math-expressions/build/math-expressions_umd.js'
);

if (
    mathExpressions &&
    mathExpressions.default &&
    typeof mathExpressions.fromText !== 'function'
) {
    mathExpressions = mathExpressions.default;
}

module.exports = mathExpressions;
