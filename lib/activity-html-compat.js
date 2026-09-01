/*
 * Compatibility repairs for historically published activity HTML.
 *
 * Some older Ximera publications encoded JavaScript operators inside
 * authored script blocks. Browsers do not decode character references inside
 * script text, so JavaScript such as
 *
 *     for (var i = 0; i &lt; items.length; i++)
 *     if (ready &amp;&amp; valid) { ... }
 *
 * reaches the parser literally and fails with a syntax error.
 *
 * Keep the long-standing numeric-entity repair, and additionally decode the
 * named angle-bracket and ampersand entities only inside script elements.
 * Ordinary page prose must remain HTML-escaped.
 */

function fixActivityHTML(html) {
    if (!html) {
        return html;
    }

    var fixed = html
        .replace(/&#x003C;/g, '<')
        .replace(/&#x003E;/g, '>');

    return fixed.replace(
        /(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)/gi,
        function(match, openingTag, scriptBody, closingTag) {
            return openingTag +
                scriptBody
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&amp;/g, '&') +
                closingTag;
        }
    );
}

module.exports = fixActivityHTML;
