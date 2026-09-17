'use strict';

var DEFAULT_RESUME_GRACE_MS = 5000;

function shouldDeferFailure(options) {
    options = options || {};

    if (options.hidden === true) {
        return true;
    }

    if (
        options.lastVisibleAt === null ||
        options.lastVisibleAt === undefined
    ) {
        return false;
    }

    return (
        Number(options.now) -
        Number(options.lastVisibleAt)
    ) < Number(
        options.resumeGraceMilliseconds === undefined
            ? DEFAULT_RESUME_GRACE_MS
            : options.resumeGraceMilliseconds
    );
}

function retryDelay(options) {
    options = options || {};

    if (options.hidden === true) {
        return null;
    }

    if (
        options.lastVisibleAt === null ||
        options.lastVisibleAt === undefined
    ) {
        return 0;
    }

    var grace = Number(
        options.resumeGraceMilliseconds === undefined
            ? DEFAULT_RESUME_GRACE_MS
            : options.resumeGraceMilliseconds
    );
    var elapsed = Math.max(
        0,
        Number(options.now) - Number(options.lastVisibleAt)
    );

    return Math.max(0, grace - elapsed);
}

module.exports = {
    DEFAULT_RESUME_GRACE_MS: DEFAULT_RESUME_GRACE_MS,
    shouldDeferFailure: shouldDeferFailure,
    retryDelay: retryDelay
};
