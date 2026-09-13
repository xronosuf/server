var $ = require('jquery');

var DesmosNeeded = false;
var DESMOS_READY_TIMEOUT = 10000;
var DESMOS_POLL_INTERVAL = 250;

exports.promise = $.Deferred();

function rejectDesmos(reason) {
    if (exports.promise.state() !== 'pending')
        return;

    if (!(reason instanceof Error))
        reason = new Error(String(reason));

    exports.promise.reject(reason);
}

exports.onReady = function(callback, failureCallback) {
    $.when(exports.promise).done(callback);

    if (failureCallback)
        $.when(exports.promise).fail(failureCallback);
};

exports.loadAsynchronously = function() {
    if (typeof window.Desmos !== 'undefined') {
        exports.promise.resolve(window.Desmos);
        return;
    }

    if (DesmosNeeded)
        return;

    DesmosNeeded = true;

    var request = $.getScript(
        'https://www.desmos.com/api/v0.7/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6',
        function() {
            var startedAt = Date.now();

            function waitForDesmos() {
                if (typeof window.Desmos !== 'undefined') {
                    exports.promise.resolve(window.Desmos);
                    return;
                }

                if (Date.now() - startedAt >= DESMOS_READY_TIMEOUT) {
                    rejectDesmos(
                        new Error(
                            'Desmos script loaded but did not expose window.Desmos within the startup timeout.'
                        )
                    );
                    return;
                }

                window.setTimeout(
                    waitForDesmos,
                    DESMOS_POLL_INTERVAL
                );
            }

            waitForDesmos();
        }
    );

    if (request && request.fail) {
        request.fail(function(jqXHR, textStatus, errorThrown) {
            var detail = errorThrown || textStatus || 'request failed';

            rejectDesmos(
                new Error(
                    'Unable to load the Desmos calculator library: ' + detail
                )
            );
        });
    }
};
