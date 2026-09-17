'use strict';

var assert = require('assert');
var routes = require('../routes/instructor-settings');

function bridge(overrides) {
    return Object.assign({
        _id: '64ee2f1b5b88bce99a123456',
        toolConsumerInstanceGuid: 'canvas.example.edu',
        contextId: 'course-123',
        resourceLinkId: 'assignment-456',
        repository: 'mac1140',
        path: 'xourse',
        roles: ['urn:lti:role:ims/lis/Instructor']
    }, overrides || {});
}

function reference(overrides) {
    return Object.assign({
        bridgeId: '64ee2f1b5b88bce99a123456',
        toolConsumerInstanceGuid: 'canvas.example.edu',
        contextId: 'course-123',
        resourceLinkId: 'assignment-456',
        repository: 'mac1140',
        path: 'xourse'
    }, overrides || {});
}

describe('instructor settings route authorization policy', function() {
    it('accepts a launch reference that exactly matches its persisted bridge', function() {
        assert.strictEqual(
            routes.referenceMatchesBridge(reference(), bridge()),
            true
        );
    });

    [
        'bridgeId',
        'toolConsumerInstanceGuid',
        'contextId',
        'resourceLinkId',
        'repository',
        'path'
    ].forEach(function(field) {
        it('rejects a launch reference with a mismatched ' + field, function() {
            var changed = reference();
            changed[field] = 'different-value';

            assert.strictEqual(
                routes.referenceMatchesBridge(changed, bridge()),
                false
            );
        });
    });

    it('treats matching absent resource-link ids consistently', function() {
        assert.strictEqual(
            routes.referenceMatchesBridge(
                reference({resourceLinkId: null}),
                bridge({resourceLinkId: null})
            ),
            true
        );
    });

    it('accepts a current Instructor role', function() {
        assert.strictEqual(
            routes.bridgeHasCurrentInstructionalRole(
                bridge({roles: ['urn:lti:role:ims/lis/Instructor']})
            ),
            true
        );
    });

    it('accepts a current TeachingAssistant role', function() {
        assert.strictEqual(
            routes.bridgeHasCurrentInstructionalRole(
                bridge({roles: ['urn:lti:role:ims/lis/TeachingAssistant']})
            ),
            true
        );
    });

    it('rejects a learner even if a historical instructionalStaff flag is true', function() {
        assert.strictEqual(
            routes.bridgeHasCurrentInstructionalRole(
                bridge({
                    instructionalStaff: true,
                    roles: ['urn:lti:role:ims/lis/Learner']
                })
            ),
            false
        );
    });
});
