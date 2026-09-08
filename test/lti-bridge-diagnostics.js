var assert = require('assert');
var diagnostics = require('../lib/lti-bridge-diagnostics');

var page = {
    repository: 'mac1140',
    path: 'HW01/HW1'
};

var reference = {
    toolConsumerInstanceGuid: 'canvas-instance',
    contextId: 'course-2026-fall',
    resourceLinkId: 'assignment-1',
    repository: page.repository,
    path: page.path
};

function bridge(overrides) {
    var value = {
        toolConsumerInstanceGuid: reference.toolConsumerInstanceGuid,
        contextId: reference.contextId,
        resourceLinkId: reference.resourceLinkId,
        repository: reference.repository,
        path: reference.path
    };

    Object.keys(overrides || {}).forEach(function(key) {
        value[key] = overrides[key];
    });

    return value;
}

describe('LTI bridge diagnostics', function() {
    it('reports an exact Canvas context/resource match', function() {
        var result = diagnostics.classify(
            reference,
            [bridge()],
            page
        );

        assert.strictEqual(result.primary, 'exact');
        assert.strictEqual(result.exactCount, 1);
    });

    it('detects same context with a different assignment resource link', function() {
        var result = diagnostics.classify(
            reference,
            [bridge({
                resourceLinkId: 'assignment-2',
                path: 'HW02/HW2'
            })],
            page
        );

        assert.strictEqual(
            result.primary,
            'same-context-different-assignment'
        );
        assert.strictEqual(
            result.sameContextDifferentAssignmentCount,
            1
        );
    });

    it('detects the same Xronos page in a different Canvas context', function() {
        var result = diagnostics.classify(
            reference,
            [bridge({
                contextId: 'course-2027-spring',
                resourceLinkId: 'assignment-spring'
            })],
            page
        );

        assert.strictEqual(
            result.primary,
            'same-page-different-context'
        );
        assert.strictEqual(
            result.samePageDifferentContextCount,
            1
        );
    });

    it('reports missing launch metadata without guessing', function() {
        var result = diagnostics.classify(
            reference,
            [bridge({resourceLinkId: undefined})],
            page
        );

        assert.strictEqual(result.primary, 'missing-metadata');
        assert.strictEqual(result.missingMetadataCount, 1);
    });

    it('reports no bridge without claiming the user never launched', function() {
        var result = diagnostics.classify(
            reference,
            [],
            page
        );

        assert.strictEqual(result.primary, 'no-bridge');
        assert.strictEqual(
            result.message.indexOf('No matching LTI bridge creation is recorded'),
            0
        );
        assert.strictEqual(
            result.message.indexOf('never'),
            -1
        );
    });

    it('reports unrelated bridge records as no matching bridge', function() {
        var result = diagnostics.classify(
            reference,
            [bridge({
                contextId: 'other-context',
                resourceLinkId: 'other-assignment',
                repository: 'otherrepo',
                path: 'other/path'
            })],
            page
        );

        assert.strictEqual(result.primary, 'no-matching-bridge');
        assert.strictEqual(result.bridgeCount, 1);
    });

    it('preserves secondary categories for support reports', function() {
        var result = diagnostics.classify(
            reference,
            [
                bridge({
                    resourceLinkId: 'assignment-2',
                    path: 'HW02/HW2'
                }),
                bridge({
                    contextId: 'course-2027-spring',
                    resourceLinkId: 'assignment-spring'
                }),
                bridge({
                    resourceLinkId: undefined
                })
            ],
            page
        );

        assert(
            result.categories.indexOf(
                'same-context-different-assignment'
            ) !== -1
        );
        assert(
            result.categories.indexOf(
                'same-page-different-context'
            ) !== -1
        );
        assert(
            result.categories.indexOf('missing-metadata') !== -1
        );
    });
});
