var $ = require('jquery');
var _ = require('underscore');
var debugLog = require('./debug-log');
var gradeSyncPresentation = require('./grade-sync-presentation');
var gradeSyncSupportReport = require('./grade-sync-support-report');
var gradeSyncRecoveryPolicy = require('./grade-sync-recovery-policy');

var xronosLatestGradeSync = null;
var xronosLatestGradeSyncDiagnostics = null;
var xronosGradeSyncRecoveries = [];

function xronosCurrentBrowserEnvironment() {
    var timezone = null;

    try {
        if (
            window.Intl &&
            typeof window.Intl.DateTimeFormat === 'function'
        ) {
            timezone = window.Intl
                .DateTimeFormat()
                .resolvedOptions()
                .timeZone || null;
        }
    } catch (err) {
        timezone = null;
    }

    return {
        userAgent:
            window.navigator && window.navigator.userAgent
                ? window.navigator.userAgent
                : null,
        platform:
            window.navigator && window.navigator.platform
                ? window.navigator.platform
                : null,
        language:
            window.navigator && window.navigator.language
                ? window.navigator.language
                : null,
        timezone: timezone,
        online:
            window.navigator &&
            typeof window.navigator.onLine === 'boolean'
                ? window.navigator.onLine
                : null
    };
}

function xronosSupportContactLead(supportEmail) {
    var email = typeof supportEmail === 'string'
        ? supportEmail.trim()
        : '';

    if (email) {
        return 'If you need help with grade sync, contact ' + email + '.';
    }

    return 'If you need help with grade sync, contact your instructor or course support.';
}

function xronosSupportContactInstructions(supportEmail) {
    var email = typeof supportEmail === 'string'
        ? supportEmail.trim()
        : '';

    if (email) {
        return 'Generate and copy the diagnostic report below, then email it to ' +
            email + '.';
    }

    return 'Generate and copy the diagnostic report below, then paste it into ' +
        'your normal email or webmail when contacting your instructor or ' +
        'course support.';
}

function xronosCopyTextToClipboardFallback(text, callback) {
    var fallback = $('<textarea/>', {
        'aria-hidden': 'true'
    }).css({
        position: 'fixed',
        left: '-9999px',
        top: '0'
    }).val(text);
    var copied = false;

    $('body').append(fallback);
    fallback[0].focus();
    fallback[0].select();

    try {
        copied = document.execCommand('copy');
    } catch (err) {
        copied = false;
    }

    fallback.remove();
    callback(copied);
}

function xronosCopyTextToClipboard(text, callback) {
    var navigatorObject = window.navigator || {};

    if (
        navigatorObject.clipboard &&
        typeof navigatorObject.clipboard.writeText === 'function'
    ) {
        navigatorObject.clipboard.writeText(text).then(
            function() {
                callback(true);
            },
            function() {
                xronosCopyTextToClipboardFallback(text, callback);
            }
        );
        return;
    }

    xronosCopyTextToClipboardFallback(text, callback);
}

function xronosRequestGradeSyncRecovery(action, callback) {
    var xourseUrl = $('main').attr('data-xourse-url');

    if (!xourseUrl) {
        callback(new Error('Missing xourse URL for grade sync recovery.'));
        return;
    }

    $.ajax({
        url: window.toValidPath('/' + xourseUrl + '/grade-sync-recovery'),
        type: 'POST',
        data: JSON.stringify({action: action}),
        contentType: 'application/json',
        success: function(result) {
            callback(null, result);
        },
        error: function(jqXHR, err, exception) {
            callback(new Error(
                'Grade sync recovery request failed: ' +
                (exception || err || (jqXHR && jqXHR.status) || 'unknown')
            ));
        }
    });
}

function xronosRememberGradeSyncRecovery(recovery) {
    if (!recovery || typeof recovery !== 'object') {
        return;
    }

    xronosGradeSyncRecoveries.unshift(recovery);
    xronosGradeSyncRecoveries = xronosGradeSyncRecoveries.slice(
        0,
        gradeSyncSupportReport.MAX_RECOVERY_EVENTS
    );
}

function xronosShowGradeSyncHelp(indicator, checking) {
    var existing = $('#xronos-grade-sync-help-modal');
    var rendered;
    var modal;
    var dialog;
    var content;
    var header;
    var body;
    var footer;
    var reportButton;
    var reportStatus;
    var reportPreview;
    var recovery;
    var recoveryButton;
    var recoveryStatus;
    var state = xronosLatestGradeSync;

    if (existing.length > 0) {
        existing.remove();
    }

    rendered = gradeSyncPresentation.presentation(state);
    recovery = gradeSyncRecoveryPolicy.recovery(
        state,
        xronosLatestGradeSyncDiagnostics
    );

    modal = $('<div/>', {
        id: 'xronos-grade-sync-help-modal',
        'class': 'modal fade',
        tabindex: '-1',
        role: 'dialog',
        'aria-labelledby': 'xronos-grade-sync-help-title'
    });

    dialog = $('<div/>', {
        'class': 'modal-dialog',
        role: 'document'
    });

    content = $('<div/>', {
        'class': 'modal-content'
    });

    header = $('<div/>', {
        'class': 'modal-header'
    }).append(
        $('<button/>', {
            type: 'button',
            'class': 'close',
            'data-dismiss': 'modal',
            'aria-label': 'Close'
        }).append(
            $('<span/>', {
                'aria-hidden': 'true'
            }).html('&times;')
        ),
        $('<h4/>', {
            id: 'xronos-grade-sync-help-title',
            'class': 'modal-title'
        }).text('Canvas grade sync')
    );

    body = $('<div/>', {
        'class': 'modal-body'
    });

    body.append(
        $('<p/>').text(
            indicator.getAttribute('data-grade-sync-message') ||
            rendered.message ||
            checking.message
        )
    );

    if (recovery.kind !== 'none') {
        body.append(
            $('<h5/>').text(recovery.title),
            $('<p/>').text(recovery.message)
        );

        recoveryStatus = $('<p/>', {
            'class': 'help-block',
            role: 'status',
            'aria-live': 'polite'
        });

        if (recovery.kind === 'recheck-status') {
            recoveryButton = $('<button/>', {
                type: 'button',
                'class': 'btn btn-default btn-sm'
            }).text('Recheck grade sync');

            recoveryButton.on('click', function(event) {
                event.preventDefault();
                recoveryButton.prop('disabled', true).text('Checking...');

                xronosRequestGradeSyncRecovery(
                    'recheck-status',
                    function(err, result) {
                        recoveryButton.prop('disabled', false).text('Recheck grade sync');

                        if (err || !result || !result.ok) {
                            recoveryStatus.text(
                                'Xronos could not recheck the grade-sync connection. You can still generate a diagnostic report below.'
                            );
                            return;
                        }

                        xronosRememberGradeSyncRecovery(result.recovery);
                        xronosLatestGradeSyncDiagnostics =
                            result.gradeSyncDiagnostics || null;
                        xronosUpdateGradeSyncStatus(result.gradeSync || null);

                        // The modal was built from the pre-recheck state.
                        // Close it after a successful recheck so reopening
                        // help rebuilds the content from the fresh status.
                        modal.modal('hide');
                    }
                );
            });

            body.append($('<p/>').append(recoveryButton));
        } else if (recovery.kind === 'relaunch-from-canvas') {
            recoveryButton = $('<button/>', {
                type: 'button',
                'class': 'btn btn-default btn-sm'
            }).text('Show Canvas reconnect steps');

            recoveryButton.on('click', function(event) {
                event.preventDefault();
                recoveryButton.prop('disabled', true);

                xronosRequestGradeSyncRecovery(
                    'view-canvas-relaunch-guidance',
                    function(err, result) {
                        recoveryButton.prop('disabled', false);

                        if (result && result.ok) {
                            xronosRememberGradeSyncRecovery(result.recovery);
                            xronosLatestGradeSyncDiagnostics =
                                result.gradeSyncDiagnostics || null;
                            xronosUpdateGradeSyncStatus(result.gradeSync || null);
                        }

                        recoveryStatus.text(
                            'Return to Canvas, open this exact assignment from its Canvas link, and use the Xronos page opened by that launch. Refreshing only this existing Xronos page does not create a new Canvas assignment launch.' +
                            (err ? ' If the problem continues, generate the diagnostic report below.' : '')
                        );
                    }
                );
            });

            body.append($('<p/>').append(recoveryButton));
        }

        body.append(recoveryStatus);
    }

    body.append(
        $('<p/>').text(
            xronosSupportContactLead(window.xronosSupportEmail)
        )
    );

    body.append(
        $('<p/>').text(
            xronosSupportContactInstructions(window.xronosSupportEmail)
        )
    );

    reportButton = $('<button/>', {
        type: 'button',
        'class': 'btn btn-primary'
    }).text('Generate & Copy Grade Sync Report');

    reportStatus = $('<p/>', {
        'class': 'help-block',
        role: 'status',
        'aria-live': 'polite'
    });

    reportPreview = $('<textarea/>', {
        'class': 'form-control',
        rows: '14',
        readonly: 'readonly',
        'aria-label': 'Generated Xronos grade sync diagnostic report'
    }).hide();

    reportButton.on('click', function(event) {
        var applicationVersion =
            typeof window.xronosApplicationVersion === 'string'
                ? window.xronosApplicationVersion
                : null;
        var report;
        var formatted;

        event.preventDefault();

        report = gradeSyncSupportReport.build({
            generatedAt: (new Date()).toISOString(),
            applicationVersion: applicationVersion,
            path: window.location.pathname,
            gradeSync: xronosLatestGradeSync,
            gradeSyncDiagnostics: xronosLatestGradeSyncDiagnostics,
            recoveries: xronosGradeSyncRecoveries,
            environment: xronosCurrentBrowserEnvironment()
        });

        formatted = gradeSyncSupportReport.format(report);

        reportPreview.val(formatted).show();

        xronosCopyTextToClipboard(formatted, function(copied) {
            var email = typeof window.xronosSupportEmail === 'string'
                ? window.xronosSupportEmail.trim()
                : '';

            if (copied && email) {
                reportStatus.text(
                    'Grade sync diagnostic report copied. Paste it into an email to ' +
                    email + '.'
                );
            } else if (copied) {
                reportStatus.text(
                    'Grade sync diagnostic report copied. Paste it into your email or webmail.'
                );
            } else {
                reportStatus.text(
                    'The report is ready below. Copy it manually and paste it into your email or webmail.'
                );
            }
        });
    });

    body.append($('<p/>').append(reportButton));
    body.append(reportStatus);
    body.append(reportPreview);

    footer = $('<div/>', {
        'class': 'modal-footer'
    }).append(
        $('<button/>', {
            type: 'button',
            'class': 'btn btn-default',
            'data-dismiss': 'modal'
        }).text('Close')
    );

    content.append(header);
    content.append(body);
    content.append(footer);
    dialog.append(content);
    modal.append(dialog);
    $('body').prepend(modal);

    modal.on('hidden.bs.modal', function() {
        modal.remove();
    });

    modal.modal('show');
}

var xronosEnsureGradeSyncIndicator = function() {
    var indicator;
    var target;
    var label;
    var help;
    var checking = gradeSyncPresentation.presentation(null);

    if (typeof document === 'undefined') {
        return null;
    }

    indicator = document.getElementById('xronos-grade-sync-status');

    if (!indicator) {
        indicator = document.createElement('span');
        indicator.id = 'xronos-grade-sync-status';
        indicator.className = 'xronos-grade-sync-status xronos-grade-sync-checking';
        indicator.setAttribute('role', 'status');
        indicator.setAttribute('aria-live', 'polite');

        indicator.innerHTML =
            '<span class="xronos-grade-sync-dot" aria-hidden="true"></span>' +
            '<span class="xronos-grade-sync-label">' + checking.label + '</span>' +
            '<button type="button" class="xronos-grade-sync-help" aria-label="More information about Canvas grade sync">?</button>';

        target = document.getElementById('show-me-another-button');

        if (target && target.parentNode) {
            target.parentNode.insertBefore(indicator, target);
        } else {
            target = document.querySelector('.main-title') ||
                     document.querySelector('main') ||
                     document.body;

            target.appendChild(indicator);
        }

        help = indicator.querySelector('.xronos-grade-sync-help');

        if (help) {
            help.addEventListener('click', function(event) {
                event.preventDefault();
                event.stopPropagation();
                xronosShowGradeSyncHelp(indicator, checking);
            });
        }
    }

    label = indicator.querySelector('.xronos-grade-sync-label');

    if (label && !label.textContent) {
        label.textContent = checking.label;
    }

    return indicator;
};

var xronosUpdateGradeSyncStatus = function(gradeSync) {
    var indicator = xronosEnsureGradeSyncIndicator();
    var label;
    var rendered;

    xronosLatestGradeSync = gradeSync || null;

    if (!indicator) {
        return;
    }

    rendered = gradeSyncPresentation.presentation(gradeSync);
    label = indicator.querySelector('.xronos-grade-sync-label');

    indicator.classList.remove(
        'xronos-grade-sync-checking',
        'xronos-grade-sync-syncing',
        'xronos-grade-sync-not-syncing',
        'xronos-grade-sync-error'
    );

    indicator.classList.add(
        'xronos-grade-sync-' + rendered.cssState
    );

    if (label) {
        label.textContent = rendered.label;
    }

    indicator.setAttribute('data-grade-sync-state', rendered.state);
    indicator.setAttribute('data-grade-sync-message', rendered.message);
    indicator.setAttribute('title', rendered.message);
};


var xronosDispatchGradebookRecorded = function(payload, result) {
    var event;

    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
        return;
    }

    try {
        if (typeof window.CustomEvent === 'function') {
            event = new window.CustomEvent('xronos:gradebookRecorded', {
                detail: {
                    payload: payload,
                    result: result
                }
            });
        } else if (typeof document !== 'undefined' && typeof document.createEvent === 'function') {
            event = document.createEvent('CustomEvent');
            event.initCustomEvent('xronos:gradebookRecorded', false, false, {
                payload: payload,
                result: result
            });
        }

        if (event) {
            window.dispatchEvent(event);
        }
    } catch (e) {
        // The gradebook submission itself succeeded; do not let a UI event
        // helper interfere with that workflow.
    }
};

exports.update = _.debounce( function() {
    var pointsEarned = 0;
    
    $(".activity-card").each( function() {
	var card = $(this);
	var weight = parseFloat(card.attr('data-weight'));
	var completion = parseFloat(card.attr('data-max-completion'));

	if (! isNaN(weight)) {
	    if (! isNaN(completion)) {	    
		var points = weight * completion;
		pointsEarned = pointsEarned + points;
	    }
	}
    });

    var pointsPossible = parseFloat(
        $("main").attr("data-points")
    );
    var xourseUrl = $("main").attr("data-xourse-url");

    /*
     * Older generated xourses provide the aggregate point total through
     * main[data-points]. Newer generated xourses may omit that aggregate
     * while retaining each activity card's data-weight. In that case, derive
     * the same xourse-level denominator by summing the valid card weights.
     */
    if (isNaN(pointsPossible) || pointsPossible <= 0) {
        pointsPossible = 0;

        $(".activity-card").each(function() {
            var weight = parseFloat(
                $(this).attr("data-weight")
            );

            if (!isNaN(weight) && weight > 0) {
                pointsPossible += weight;
            }
        });
    }

    var payload = {
        pointsEarned: pointsEarned,
        pointsPossible: pointsPossible
    };

    /*
     * A successful HTTP response only means the route handled the request.
     * Do not submit an unusable score payload that the server cannot convert
     * into a normalized grade.
     */
    if (
        !isFinite(pointsEarned) ||
        !isFinite(pointsPossible) ||
        pointsPossible <= 0
    ) {
        debugLog.log(
            "Did not send gradebook update because the xourse point total is invalid.",
            payload
        );

        $(".progress.completion-meter").attr(
            "title",
            "Could not determine the xourse point total."
        );

        return;
    }

    $(".progress.completion-meter").attr('title', 'Submitting grade...' );
    debugLog.log('Sent gradebook update to Xronos server; Canvas passback may be queued.', payload);
    
    $.ajax({
	url: window.toValidPath('/' + xourseUrl + '/gradebook'),
	type: 'PUT',
	data: JSON.stringify(payload),
	contentType: 'application/json',	
	success: function( result ) {
	    debugLog.log('Xronos server accepted gradebook update; Canvas passback may be queued.', payload);
            xronosLatestGradeSyncDiagnostics =
                result && result.gradeSyncDiagnostics
                    ? result.gradeSyncDiagnostics
                    : null;
	    xronosUpdateGradeSyncStatus(result && result.gradeSync);
	    xronosDispatchGradebookRecorded(payload, result);
	    $('.progress-bar', ".progress.completion-meter").removeClass( 'bg-danger' );
	    $('.progress-bar', ".progress.completion-meter").addClass( 'bg-success' );
	    $(".progress.completion-meter").attr('title', 'Grade submitted at '  + (new Date()).toLocaleTimeString() );
	},
	error: function(jqXHR, err, exception) {
	    debugLog.log('Xronos server did not accept gradebook update; Canvas passback was not queued from this request.', {
		status: jqXHR && jqXHR.status,
		error: err,
		exception: exception
	    });
            xronosLatestGradeSyncDiagnostics = null;
	    xronosUpdateGradeSyncStatus({state: 'error'});
	    $(".progress.completion-meter").attr('title', 'Could not submit grade.' );
	    $('.progress-bar', ".progress.completion-meter").removeClass( 'bg-success' );
	    $('.progress-bar', ".progress.completion-meter").addClass( 'bg-danger' );
	    window.setTimeout( exports.update, 1000 );
	}
    });
    
}, 300 );
