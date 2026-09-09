'use strict';

var messages = {
    checking:
        'Xronos is checking Canvas grade-sync status for this assignment.',
    connected:
        'Xronos has an active Canvas grade-sync connection for this assignment. Your Xronos progress can be sent to this Canvas assignment.',
    notConnected:
        'Xronos does not currently have an active Canvas grade-sync connection for this assignment. Your work may still be saved in Xronos. If this is graded work, return to Canvas and open this assignment from its Canvas link.',
    closed:
        'Xronos has Canvas grade-sync information for this assignment, but the grade-passback window currently recorded by Xronos is closed. Reopening Xronos from Canvas will not by itself reopen the assignment.',
    unavailable:
        'Xronos could not verify Canvas grade-sync status. Your work may still be saved in Xronos. If this persists, return to Canvas and reopen this assignment from its Canvas link.'
};

function presentation(gradeSync) {
    var state = gradeSync && gradeSync.state;
    var reason = gradeSync && gradeSync.reason;

    if (!gradeSync) {
        return {
            state: 'checking',
            cssState: 'checking',
            label: 'Checking grade sync',
            message: messages.checking
        };
    }

    if (state === 'error') {
        return {
            state: 'unavailable',
            cssState: 'error',
            label: 'Grade sync unavailable',
            message: messages.unavailable
        };
    }

    if (reason === 'grade-passback-closed') {
        return {
            state: 'closed',
            cssState: 'error',
            label: 'Grade sync closed',
            message: messages.closed
        };
    }

    /*
     * The student-facing pill answers one question: whether this assignment
     * currently has a usable Canvas grade-passback connection.  Detailed
     * transport states such as ready, queued/pending, and accepted belong in
     * Stage 3 diagnostics rather than in the student's primary status label.
     */
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
            state: 'connected',
            cssState: 'syncing',
            label: 'Grade sync connected',
            message: messages.connected
        };
    }

    return {
        state: 'not-connected',
        cssState: 'not-syncing',
        label: 'Grade sync not connected',
        message: messages.notConnected
    };
}

exports.messages = messages;
exports.presentation = presentation;
