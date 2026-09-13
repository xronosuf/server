'use strict';

function text(value) {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }

    return value.toString();
}

function same(a, b) {
    a = text(a);
    b = text(b);

    return a !== undefined && b !== undefined && a === b;
}

function pageMatches(bridge, page) {
    return !!(
        bridge &&
        page &&
        bridge.repository === page.repository &&
        bridge.path === page.path
    );
}

function missingMetadata(bridge) {
    if (!bridge) {
        return true;
    }

    return !(
        text(bridge.toolConsumerInstanceGuid) &&
        text(bridge.contextId) &&
        text(bridge.resourceLinkId)
    );
}

function exactLaunchMatch(bridge, reference) {
    return !!(
        bridge &&
        reference &&
        same(
            bridge.toolConsumerInstanceGuid,
            reference.toolConsumerInstanceGuid
        ) &&
        same(bridge.contextId, reference.contextId) &&
        same(bridge.resourceLinkId, reference.resourceLinkId)
    );
}

function classify(reference, bridges, page) {
    bridges = bridges || [];

    var result = {
        bridgeCount: bridges.length,
        pageBridgeCount: 0,
        exactCount: 0,
        sameContextDifferentAssignmentCount: 0,
        samePageDifferentContextCount: 0,
        missingMetadataCount: 0,
        categories: [],
        primary: 'no-bridge',
        message:
            'No matching LTI bridge creation is recorded for this page.'
    };

    bridges.forEach(function(bridge) {
        var isPage = pageMatches(bridge, page);
        var isExact = exactLaunchMatch(bridge, reference);
        var metadataMissing = missingMetadata(bridge);

        if (isPage) {
            result.pageBridgeCount += 1;
        }

        if (metadataMissing) {
            result.missingMetadataCount += 1;
        }

        if (isExact) {
            result.exactCount += 1;
            return;
        }

        if (
            reference &&
            !metadataMissing &&
            same(
                bridge.toolConsumerInstanceGuid,
                reference.toolConsumerInstanceGuid
            ) &&
            same(bridge.contextId, reference.contextId) &&
            !same(bridge.resourceLinkId, reference.resourceLinkId)
        ) {
            result.sameContextDifferentAssignmentCount += 1;
        }

        if (
            reference &&
            isPage &&
            !metadataMissing &&
            same(
                bridge.toolConsumerInstanceGuid,
                reference.toolConsumerInstanceGuid
            ) &&
            !same(bridge.contextId, reference.contextId)
        ) {
            result.samePageDifferentContextCount += 1;
        }
    });

    if (result.exactCount > 0) {
        result.categories.push('exact');
    }
    if (result.sameContextDifferentAssignmentCount > 0) {
        result.categories.push('same-context-different-assignment');
    }
    if (result.samePageDifferentContextCount > 0) {
        result.categories.push('same-page-different-context');
    }
    if (result.missingMetadataCount > 0) {
        result.categories.push('missing-metadata');
    }
    if (result.bridgeCount === 0) {
        result.categories.push('no-bridge');
    }

    if (result.exactCount > 0) {
        result.primary = 'exact';
        result.message =
            'A matching LTI bridge creation is recorded for this Canvas context and assignment.';
    } else if (result.sameContextDifferentAssignmentCount > 0) {
        result.primary = 'same-context-different-assignment';
        result.message =
            'An LTI bridge is recorded for the same Canvas context but a different assignment/resource link.';
    } else if (result.samePageDifferentContextCount > 0) {
        result.primary = 'same-page-different-context';
        result.message =
            'An LTI bridge is recorded for this Xronos page in a different Canvas context.';
    } else if (result.missingMetadataCount > 0) {
        result.primary = 'missing-metadata';
        result.message =
            'An LTI bridge record exists, but it does not contain enough Canvas context/resource metadata to verify an exact assignment match.';
    } else if (result.bridgeCount > 0) {
        result.primary = 'no-matching-bridge';
        result.message =
            'LTI bridge records exist for this user, but no matching bridge creation is recorded for this page/context/assignment.';
    }

    return result;
}

exports.classify = classify;
exports.exactLaunchMatch = exactLaunchMatch;
exports.missingMetadata = missingMetadata;
exports.pageMatches = pageMatches;
