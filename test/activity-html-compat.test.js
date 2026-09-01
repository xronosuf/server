var assert = require('assert');
var fixActivityHTML = require('../lib/activity-html-compat');

describe('activity HTML compatibility', function() {
    it('decodes named comparison entities inside script bodies', function() {
        var html = [
            '<div>before</div>',
            '<script type="text/javascript">',
            'for (var i = 0; i &lt; items.length; i++) {',
            '    if (items[i] &gt; 0) { keep(items[i]); }',
            '}',
            '</script>',
            '<div>after</div>'
        ].join('\n');

        var fixed = fixActivityHTML(html);

        assert.ok(fixed.indexOf('i < items.length') !== -1);
        assert.ok(fixed.indexOf('items[i] > 0') !== -1);
        assert.ok(fixed.indexOf('&lt; items.length') === -1);
        assert.ok(fixed.indexOf('&gt; 0') === -1);
    });

    it('leaves named entities in ordinary prose untouched', function() {
        var html = '<p>Use x &lt; 5 and y &gt; 2.</p>';

        assert.strictEqual(fixActivityHTML(html), html);
    });

    it('preserves the historical numeric angle-bracket repair', function() {
        var html = '<div>&#x003C;legacy&#x003E;</div>';

        assert.strictEqual(
            fixActivityHTML(html),
            '<div><legacy></div>'
        );
    });

    it('handles several script blocks without changing text between them', function() {
        var html = [
            '<script>if (a &lt; b) { first(); }</script>',
            '<p>a &lt; b</p>',
            '<script>if (c &gt; d) { second(); }</script>'
        ].join('\n');

        var fixed = fixActivityHTML(html);

        assert.ok(fixed.indexOf('if (a < b)') !== -1);
        assert.ok(fixed.indexOf('<p>a &lt; b</p>') !== -1);
        assert.ok(fixed.indexOf('if (c > d)') !== -1);
    });

    it('returns empty or missing HTML unchanged', function() {
        assert.strictEqual(fixActivityHTML(''), '');
        assert.strictEqual(fixActivityHTML(null), null);
        assert.strictEqual(fixActivityHTML(undefined), undefined);
    });
});
