'use strict';

var MAX_BRIDGES = 10;
var MAX_CATEGORIES = 10;

function finiteNumber(value) {
    return typeof value === 'number' && isFinite(value) ? value : null;
}

function text(value) {
    return typeof value === 'string' ? value : null;
}

function boolean(value) {
    return typeof value === 'boolean' ? value : null;
}

function copyWindow(windowValue) {
    if (!windowValue || typeof windowValue !== 'object') {
        return null;
    }

    return {
        dueDate: text(windowValue.dueDate),
        untilDate: text(windowValue.untilDate),
        end: text(windowValue.end),
        source: text(windowValue.source)
    };
}

function copyBridge(bridge) {
    bridge = bridge || {};

    return {
        bridgeId: text(bridge.bridgeId),
        state: text(bridge.state),
        repository: text(bridge.repository),
        path: text(bridge.path),
        hasPassback: boolean(bridge.hasPassback),
        passbackOpen: boolean(bridge.passbackOpen),
        queued: boolean(bridge.queued),
        accepted: boolean(bridge.accepted),
        submittedScore: boolean(bridge.submittedScore),
        hasLastAcceptedScore: boolean(bridge.hasLastAcceptedScore),
        passbackWindow: copyWindow(bridge.passbackWindow)
    };
}

function copyLaunchMatch(match) {
    match = match || {};

    return {
        primary: text(match.primary),
        message: text(match.message),
        categories: Array.isArray(match.categories)
            ? match.categories.slice(0, MAX_CATEGORIES).map(text)
            : [],
        bridgeCount: finiteNumber(match.bridgeCount),
        pageBridgeCount: finiteNumber(match.pageBridgeCount),
        exactCount: finiteNumber(match.exactCount),
        sameContextDifferentAssignmentCount:
            finiteNumber(match.sameContextDifferentAssignmentCount),
        samePageDifferentContextCount:
            finiteNumber(match.samePageDifferentContextCount),
        missingMetadataCount: finiteNumber(match.missingMetadataCount)
    };
}

function copyPassback(passback) {
    passback = passback || {};

    return {
        state: text(passback.state),
        reason: text(passback.reason),
        bridgeCount: finiteNumber(passback.bridgeCount),
        gradePassbackBridgeCount:
            finiteNumber(passback.gradePassbackBridgeCount),
        activeGradePassbackBridgeCount:
            finiteNumber(passback.activeGradePassbackBridgeCount),
        queuedGradePassbackCount:
            finiteNumber(passback.queuedGradePassbackCount),
        acceptedGradePassbackCount:
            finiteNumber(passback.acceptedGradePassbackCount),
        unresolvedActiveGradePassbackCount:
            finiteNumber(passback.unresolvedActiveGradePassbackCount),
        queueStatusAvailable: boolean(passback.queueStatusAvailable)
    };
}

function copyDiagnostics(diagnostics) {
    var bridges;

    if (!diagnostics || typeof diagnostics !== 'object') {
        return null;
    }

    bridges = Array.isArray(diagnostics.bridges)
        ? diagnostics.bridges.slice(0, MAX_BRIDGES).map(copyBridge)
        : [];

    return {
        version: finiteNumber(diagnostics.version),
        page: diagnostics.page && typeof diagnostics.page === 'object'
            ? {
                repository: text(diagnostics.page.repository),
                path: text(diagnostics.page.path)
            }
            : null,
        launchReferenceRecorded: boolean(diagnostics.launchReferenceRecorded),
        launchMatch: copyLaunchMatch(diagnostics.launchMatch),
        passback: copyPassback(diagnostics.passback),
        bridges: bridges,
        bridgesTruncated:
            Array.isArray(diagnostics.bridges) &&
            diagnostics.bridges.length > MAX_BRIDGES
    };
}

function copyGradeSync(gradeSync) {
    gradeSync = gradeSync || {};

    return {
        state: text(gradeSync.state),
        reason: text(gradeSync.reason),
        bridgeCount: finiteNumber(gradeSync.bridgeCount),
        gradePassbackBridgeCount:
            finiteNumber(gradeSync.gradePassbackBridgeCount),
        activeGradePassbackBridgeCount:
            finiteNumber(gradeSync.activeGradePassbackBridgeCount),
        queuedGradePassbackCount:
            finiteNumber(gradeSync.queuedGradePassbackCount),
        acceptedGradePassbackCount:
            finiteNumber(gradeSync.acceptedGradePassbackCount),
        unresolvedActiveGradePassbackCount:
            finiteNumber(gradeSync.unresolvedActiveGradePassbackCount),
        hasGradePassback: boolean(gradeSync.hasGradePassback),
        hasActiveGradePassback: boolean(gradeSync.hasActiveGradePassback),
        queuedGradePassback: boolean(gradeSync.queuedGradePassback),
        hasAcceptedGradePassback: boolean(gradeSync.hasAcceptedGradePassback),
        queueStatusAvailable: boolean(gradeSync.queueStatusAvailable)
    };
}

function copyRecovery(recovery) {
    if (!recovery || typeof recovery !== 'object') {
        return null;
    }

    return {
        eventId: text(recovery.eventId),
        action: text(recovery.action),
        recorded: boolean(recovery.recorded),
        observedAt: text(recovery.observedAt)
    };
}

function copyEnvironment(environment) {
    environment = environment || {};

    return {
        userAgent: text(environment.userAgent),
        platform: text(environment.platform),
        language: text(environment.language),
        timezone: text(environment.timezone),
        online: boolean(environment.online)
    };
}

function build(options) {
    options = options || {};

    return {
        reportType: 'xronos-grade-sync-report',
        schemaVersion: 2,
        generatedAt: text(options.generatedAt),
        applicationVersion: text(options.applicationVersion),
        path: text(options.path),
        gradeSync: copyGradeSync(options.gradeSync),
        gradeSyncDiagnostics: copyDiagnostics(options.gradeSyncDiagnostics),
        recovery: copyRecovery(options.recovery),
        environment: copyEnvironment(options.environment)
    };
}

function format(report) {
    return JSON.stringify(report, null, 2);
}

exports.build = build;
exports.format = format;
exports.MAX_BRIDGES = MAX_BRIDGES;
