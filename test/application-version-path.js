'use strict';

var assert = require('assert');
var pathHelper = require('../public/javascripts/application-version-path');

describe('application version paths', function() {
    it('reads the rendered application version from the page meta tag', function() {
        var documentObject = {
            querySelector: function(selector) {
                assert.strictEqual(
                    selector,
                    'meta[name="xronos-application-version"]'
                );

                return {
                    getAttribute: function(name) {
                        assert.strictEqual(name, 'content');
                        return 'abc123';
                    }
                };
            }
        };

        assert.strictEqual(
            pathHelper.pageApplicationVersion(documentObject, 'fallback'),
            'abc123'
        );
    });

    it('falls back when no application-version meta tag exists', function() {
        var documentObject = {
            querySelector: function() {
                return null;
            }
        };

        assert.strictEqual(
            pathHelper.pageApplicationVersion(documentObject, 'fallback'),
            'fallback'
        );
    });

    it('constructs a versioned node_modules path', function() {
        assert.strictEqual(
            pathHelper.versionedNodeModulesPath(
                'abc123',
                '/mathjax/'
            ),
            '/node_modules/vabc123/mathjax/'
        );
    });
});
