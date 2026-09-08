'use strict';

var messages = {
    checking:
        'Xronos is checking Canvas grade-sync status for this assignment.',
    synced:
        'Canvas accepted the most recently queued best grade for this assignment.',
    pending:
        'Xronos has a Canvas grade-sync connection and a grade update is waiting to be sent or retried.',
    ready:
        'Xronos has a Canvas grade-sync connection for this assignment, but there is not yet evidence that the current best grade has been accepted by Canvas.',
    notSyncing:
        'Xronos does not currently have an active Canvas grade-sync path for this page. Your work may still be saved in Xronos. If this is a graded assignment, open it from Canvas before continuing.',
    closed:
        'Xronos has Canvas grade-sync information for this assignment, but the recorded passback window is closed.',
    error:
        'Xronos could not verify Canvas grade-sync status. Your work may still be saved in Xronos; reopen the assignment from Canvas if this message persists.'
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

    if (state === 'synced' || reason === 'passback-accepted') {
        return {
            state: 'synced',
            cssState: 'syncing',
            label: 'Grade synced',
            message: messages.synced
        };
    }

    if (state === 'pending' || reason === 'passback-pending') {
        return {
            state: 'pending',
            cssState: 'error',
            label: 'Grade sync pending',
            message: messages.pending
        };
    }

    if (state === 'ready' || reason === 'passback-ready') {
        return {
            state: 'ready',
            cssState: 'checking',
            label: 'Grade sync connected',
            message: messages.ready
        };
    }

    if (state === 'error') {
        return {
            state: 'error',
            cssState: 'error',
            label: 'Grade sync unknown',
            message: messages.error
        };
    }

    if (reason === 'grade-passback-closed') {
        return {
            state: 'not-syncing',
            cssState: 'not-syncing',
            label: 'Grade sync closed',
            message: messages.closed
        };
    }

    /*
     * Compatibility with the pre-Stage-2 server response.  The old server
     * called a merely passback-capable bridge `syncing`; do not turn that
     * weaker fact into the new `synced` claim.  Present it conservatively as
     * connected/ready until the server provides accepted-passback evidence.
     */
    if (state === 'syncing' || gradeSync.hasActiveGradePassback) {
        return {
            state: 'ready',
            cssState: 'checking',
            label: 'Grade sync connected',
            message: messages.ready
        };
    }

    return {
        state: 'not-syncing',
        cssState: 'not-syncing',
        label: 'Grade not syncing',
        message: messages.notSyncing
    };
}

exports.messages = messages;
exports.presentation = presentation;
