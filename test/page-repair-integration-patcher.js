'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var patcher = require('../scripts/modernization/apply-page-repair-integration');

var root = path.join(__dirname, '..');

function source(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('page repair integration patcher', function() {
    it('adds cache-only repair middleware idempotently', function() {
        var patched = patcher.patchApp(source('app.js'));

        assert.ok(patched.indexOf("require('./lib/page-repair')") !== -1);
        assert.ok(patched.indexOf('Clear-Site-Data') === -1);
        assert.ok(patched.indexOf('xronosPageRepair.applyRecoveryResponse') !== -1);
        assert.strictEqual(patcher.patchApp(patched), patched);
    });

    it('adds one recovery meta tag to both shared layouts', function() {
        ['views/layouts/main.pug', 'views/layouts/grid.pug'].forEach(function(file) {
            var patched = patcher.patchLayout(source(file));
            assert.strictEqual(
                patcher.countOccurrences(patched, 'meta(name="xronos-repair-token"'),
                1
            );
            assert.strictEqual(patcher.patchLayout(patched), patched);
        });
    });

    it('threads the repair token into dynamic MathJax URLs', function() {
        var helper = patcher.patchApplicationVersionPath(
            source('public/javascripts/application-version-path.js')
        );
        var mathjax = patcher.patchMathJax(
            source('public/javascripts/mathjax.js')
        );

        assert.ok(helper.indexOf('pageRepairToken: pageRepairToken') !== -1);
        assert.ok(helper.indexOf("'xronosRepair=' + encodeURIComponent(token)") !== -1);
        assert.ok(mathjax.indexOf('pageRepairToken(document)') !== -1);
        assert.strictEqual(patcher.patchApplicationVersionPath(helper), helper);
        assert.strictEqual(patcher.patchMathJax(mathjax), mathjax);
    });

    it('puts Repair this page before reporting and suppresses it when reload is unsafe', function() {
        var patched = patcher.patchSupportUi(
            source('public/javascripts/page-runtime-support-ui.js')
        );
        var repairIndex = patched.indexOf('"Repair this page"');
        var reportIndex = patched.indexOf('"Report this problem"', repairIndex);

        assert.ok(patched.indexOf('require("./page-repair")') !== -1);
        assert.ok(repairIndex !== -1);
        assert.ok(reportIndex > repairIndex);
        assert.ok(patched.indexOf('presentation.showPageRepair = false;') !== -1);
        assert.ok(patched.indexOf('pageRepair.repairCurrentPage()') !== -1);
        assert.ok(patched.indexOf('pageRepair.lastRepair(window)') !== -1);
        assert.strictEqual(patcher.patchSupportUi(patched), patched);
    });

    it('adds bounded page-repair context to support reports', function() {
        var patched = patcher.patchSupportReport(
            source('public/javascripts/page-runtime-support-report.js')
        );

        assert.ok(patched.indexOf('var REPORT_SCHEMA_VERSION = 2;') !== -1);
        assert.ok(patched.indexOf('function pageRepairMetadata(value)') !== -1);
        assert.ok(patched.indexOf('pageRepairMetadata(') !== -1);
        assert.strictEqual(patcher.patchSupportReport(patched), patched);
    });
});
