/*
 * Convert the MathML representation of a format=string answer back to its
 * literal canonical text.
 *
 * MathJax's toMathML() output is not guaranteed to use bare <math> and
 * <mtext> tags. Attributes and intermediate MathML wrappers are legitimate,
 * so exact string replacements are too brittle for canonical string answers.
 * Text that belongs to the answer itself is XML-escaped by MathJax; remove
 * markup first and then decode XML entities.
 */

function decodeXmlEntities(text) {
    return String(text)
        .replace(/&#x([0-9a-f]+);/gi, function(match, value) {
            return String.fromCodePoint(parseInt(value, 16));
        })
        .replace(/&#([0-9]+);/g, function(match, value) {
            return String.fromCodePoint(parseInt(value, 10));
        })
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

exports.fromMathMl = function(mathMl) {
    var text = String(mathMl || '');

    /*
     * At this point the input is generated MathML, not authored raw text.
     * Literal angle brackets in an answer value are XML-escaped, so removing
     * tags before decoding entities preserves them correctly.
     */
    text = text.replace(/<[^>]*>/g, '');

    return decodeXmlEntities(text).trim();
};
