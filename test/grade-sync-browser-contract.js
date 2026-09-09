var assert = require('assert');
var fs = require('fs');
var path = require('path');

var source = fs.readFileSync(
    path.join(__dirname, '../public/javascripts/gradebook.js'),
    'utf8'
);

describe('grade sync browser integration', function() {
    it('uses the shared grade-sync presentation policy', function() {
        assert.ok(
            source.indexOf("require('./grade-sync-presentation')") !== -1
        );
        assert.ok(
            source.indexOf('gradeSyncPresentation.presentation(gradeSync)') !== -1
        );
    });

    it('does not retain the obsolete Grade syncing labels', function() {
        assert.strictEqual(source.indexOf("label.textContent = 'Grade syncing'"), -1);
        assert.strictEqual(source.indexOf("label.textContent = 'Grade not syncing'"), -1);
        assert.strictEqual(source.indexOf("label.textContent = 'Grade sync unknown'"), -1);
    });
});
