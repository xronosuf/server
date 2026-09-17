'use strict';

/*
 * Browser timers measure wall-clock time, but background tabs may be throttled
 * or frozen for long periods.  Startup/network deadlines should measure time
 * in which the page actually had a reasonable opportunity to make progress.
 *
 * This helper pauses a deadline while the document is hidden and also treats
 * a substantially late timer callback as scheduler suspension rather than
 * proof that the underlying operation failed.
 */

function create(windowObject, documentObject, options) {
    options = options || {};

    var now = options.now || Date.now;
    var schedulerSlackMilliseconds =
        options.schedulerSlackMilliseconds === undefined
            ? 2000
            : Number(options.schedulerSlackMilliseconds);
    var nextId = 1;
    var handles = {};

    function isHidden() {
        return !!(
            documentObject &&
            (
                documentObject.hidden === true ||
                documentObject.visibilityState === 'hidden'
            )
        );
    }

    function remove(handle) {
        if (!handle) return;

        if (handle.nativeTimer !== null) {
            windowObject.clearTimeout(handle.nativeTimer);
            handle.nativeTimer = null;
        }

        handle.cancelled = true;
        delete handles[handle.id];
    }

    function schedule(handle) {
        if (!handle || handle.cancelled || isHidden()) {
            return;
        }

        handle.startedAt = now();
        handle.scheduledDelay = handle.remainingMilliseconds;
        handle.nativeTimer = windowObject.setTimeout(
            function() {
                var firedAt = now();
                var elapsed = firedAt - handle.startedAt;

                handle.nativeTimer = null;

                if (handle.cancelled) return;

                if (isHidden()) {
                    return;
                }

                /*
                 * A callback arriving far later than its requested delay is
                 * evidence that the JavaScript scheduler itself was paused.
                 * Do not convert that scheduler gap into a service timeout.
                 */
                if (
                    elapsed >
                    handle.scheduledDelay +
                        schedulerSlackMilliseconds
                ) {
                    schedule(handle);
                    return;
                }

                handle.remainingMilliseconds = Math.max(
                    0,
                    handle.remainingMilliseconds - elapsed
                );

                if (handle.remainingMilliseconds > 0) {
                    schedule(handle);
                    return;
                }

                delete handles[handle.id];
                handle.cancelled = true;
                handle.callback();
            },
            Math.max(0, handle.remainingMilliseconds)
        );
    }

    function pauseVisibleTimers() {
        var pausedAt = now();

        Object.keys(handles).forEach(function(id) {
            var handle = handles[id];
            var elapsed;

            if (!handle || handle.nativeTimer === null) {
                return;
            }

            elapsed = Math.max(0, pausedAt - handle.startedAt);
            elapsed = Math.min(elapsed, handle.scheduledDelay);

            handle.remainingMilliseconds = Math.max(
                0,
                handle.remainingMilliseconds - elapsed
            );

            windowObject.clearTimeout(handle.nativeTimer);
            handle.nativeTimer = null;
        });
    }

    function resumeVisibleTimers() {
        Object.keys(handles).forEach(function(id) {
            schedule(handles[id]);
        });
    }

    function visibilityChanged() {
        if (isHidden()) {
            pauseVisibleTimers();
        } else {
            resumeVisibleTimers();
        }
    }

    if (
        documentObject &&
        typeof documentObject.addEventListener === 'function'
    ) {
        documentObject.addEventListener(
            'visibilitychange',
            visibilityChanged
        );
    }

    function setTimeoutVisible(callback, delayMilliseconds) {
        var handle = {
            id: nextId,
            callback: callback,
            remainingMilliseconds: Math.max(
                0,
                Number(delayMilliseconds) || 0
            ),
            startedAt: null,
            scheduledDelay: null,
            nativeTimer: null,
            cancelled: false
        };

        nextId += 1;
        handles[handle.id] = handle;
        schedule(handle);

        return handle.id;
    }

    function clearTimeoutVisible(id) {
        remove(handles[id]);
    }

    return {
        setTimeout: setTimeoutVisible,
        clearTimeout: clearTimeoutVisible,
        isHidden: isHidden
    };
}

module.exports = {
    create: create
};
