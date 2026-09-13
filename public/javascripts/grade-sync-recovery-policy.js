'use strict';

function launchPrimary(diagnostics) {
    return diagnostics &&
        diagnostics.launchMatch &&
        diagnostics.launchMatch.primary
            ? diagnostics.launchMatch.primary
            : null;
}

function recovery(gradeSync, diagnostics) {
    gradeSync = gradeSync || {};

    var state = gradeSync.state || 'unknown';
    var reason = gradeSync.reason || null;
    var primary = launchPrimary(diagnostics);

    if (
        state === 'synced' ||
        state === 'pending' ||
        state === 'ready' ||
        state === 'syncing' ||
        reason === 'passback-accepted' ||
        reason === 'passback-pending' ||
        reason === 'passback-ready' ||
        reason === 'active-passback' ||
        gradeSync.hasActiveGradePassback
    ) {
        return {
            kind: 'none',
            canSelfRecover: false,
            title: 'Grade sync is connected',
            message:
                'No recovery action is needed for this Canvas assignment.'
        };
    }

    if (reason === 'grade-passback-closed') {
        return {
            kind: 'contact-support',
            canSelfRecover: false,
            title: 'The Canvas grade-sync window is closed',
            message:
                'Reopening this assignment from Canvas will not reopen a closed grade-passback window. Contact your instructor or course support if you believe the assignment should still accept grades.'
        };
    }

    if (
        state === 'error' ||
        state === 'unavailable' ||
        gradeSync.queueStatusAvailable === false
    ) {
        return {
            kind: 'recheck-status',
            canSelfRecover: true,
            title: 'Try checking the connection again',
            message:
                'Xronos could not verify the current grade-sync status. Rechecking reads the current Xronos/Canvas connection state without resubmitting your grade.'
        };
    }

    if (
        primary === 'same-context-different-assignment' ||
        primary === 'same-page-different-context' ||
        primary === 'current-launch-reference-unavailable' ||
        primary === 'no-matching-bridge' ||
        primary === 'missing-launch-metadata' ||
        reason === 'no-bridge' ||
        reason === 'missing-passback-fields'
    ) {
        return {
            kind: 'relaunch-from-canvas',
            canSelfRecover: true,
            title: 'Reopen this assignment from Canvas',
            message:
                'Return to the Canvas assignment and open Xronos from that assignment link. A fresh Canvas launch is what creates or refreshes the assignment-specific grade-sync connection.'
        };
    }

    return {
        kind: 'recheck-status',
        canSelfRecover: true,
        title: 'Check the grade-sync connection again',
        message:
            'Xronos does not currently see a usable grade-sync connection. Recheck the status; if it remains disconnected, reopen the assignment from Canvas and send a diagnostic report if the problem continues.'
    };
}

exports.launchPrimary = launchPrimary;
exports.recovery = recovery;
