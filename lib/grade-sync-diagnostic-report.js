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

function build(options) {
    options = options || {};

    var allUserBridges = options.allUserBridges || [];
    var page = options.page || null;
    var reference = options.reference || null;
    var runtime = options.runtime || {};
    var match = bridgeDiagnostics.classify(
        reference,
        allUserBridges,
        page
    );

    return {
        version: 1,
        page: page ? {
            repository: page.repository || null,
            path: page.path || null
        } : null,
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
exports.summarizeStatus = summarizeStatus;
