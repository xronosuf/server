'use strict';

var bridgeDiagnostics = require('./lti-bridge-diagnostics');

function summarizeStatus(status) {
    status = status || {};

    return {
        state: status.state || 'unknown',
        reason: status.reason || 'unknown',
        bridgeCount: Number(status.bridgeCount) || 0,
        gradePassbackBridgeCount:
            Number(status.gradePassbackBridgeCount) || 0,
        activeGradePassbackBridgeCount:
            Number(status.activeGradePassbackBridgeCount) || 0,
        queuedGradePassbackCount:
            Number(status.queuedGradePassbackCount) || 0,
        acceptedGradePassbackCount:
            Number(status.acceptedGradePassbackCount) || 0,
        unresolvedActiveGradePassbackCount:
            Number(status.unresolvedActiveGradePassbackCount) || 0,
        queueStatusAvailable: status.queueStatusAvailable !== false
    };
}

function launchMatch(reference, allUserBridges, page) {
    if (!reference) {
        return {
            primary: 'current-launch-reference-unavailable',
            message:
                'No current LTI launch reference is recorded for this browser session.',
            categories: ['current-launch-reference-unavailable'],
            bridgeCount: allUserBridges.length,
            pageBridgeCount: (allUserBridges || []).filter(function(bridge) {
                return bridgeDiagnostics.pageMatches(bridge, page);
            }).length,
            exactCount: 0,
            sameContextDifferentAssignmentCount: 0,
            samePageDifferentContextCount: 0,
            missingMetadataCount: (allUserBridges || []).filter(function(bridge) {
                return bridgeDiagnostics.missingMetadata(bridge);
            }).length
        };
    }

    return bridgeDiagnostics.classify(
        reference,
        allUserBridges,
        page
    );
}

function build(options) {
    options = options || {};

    var allUserBridges = options.allUserBridges || [];
    var page = options.page || null;
    var reference = options.reference || null;
    var runtime = options.runtime || {};
    var match = launchMatch(reference, allUserBridges, page);

    return {
        version: 1,
        page: page ? {
            repository: page.repository || null,
            path: page.path || null
        } : null,
        launchReferenceRecorded: !!reference,
        launchMatch: {
            primary: match.primary,
            message: match.message,
            categories: match.categories,
            bridgeCount: match.bridgeCount,
            pageBridgeCount: match.pageBridgeCount,
            exactCount: match.exactCount,
            sameContextDifferentAssignmentCount:
                match.sameContextDifferentAssignmentCount,
            samePageDifferentContextCount:
                match.samePageDifferentContextCount,
            missingMetadataCount: match.missingMetadataCount
        },
        passback: summarizeStatus(runtime.status),
        bridges:
            runtime.diagnostics && Array.isArray(runtime.diagnostics.bridges)
                ? runtime.diagnostics.bridges
                : []
    };
}

exports.build = build;
exports.launchMatch = launchMatch;
exports.summarizeStatus = summarizeStatus;
