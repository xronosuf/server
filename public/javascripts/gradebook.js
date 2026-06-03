var $ = require('jquery');
var _ = require('underscore');

var xronosGradeSyncMessages = {
    syncing: 'Xronos currently sees a Canvas grade-sync connection for this assignment.',
    notSyncing: 'Xronos does not currently see a Canvas grade-sync connection for this page. Your work may be saved in Xronos, but it may not be sent to the Canvas gradebook. If this is a graded assignment, please open it from Canvas before continuing.',
    checking: 'Xronos is checking whether this assignment has an active Canvas grade-sync connection.',
    error: 'Xronos could not verify Canvas grade-sync status. Your work may be saved in Xronos, but you should reopen the assignment from Canvas if this message persists.'
};

var xronosEnsureGradeSyncIndicator = function() {
    var indicator;
    var target;
    var label;
    var help;

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
            '<span class="xronos-grade-sync-label">Checking grade sync</span>' +
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
                var message = indicator.getAttribute('data-grade-sync-message') || xronosGradeSyncMessages.checking;
                event.preventDefault();
                event.stopPropagation();
                window.alert(message);
            });
        }
    }

    label = indicator.querySelector('.xronos-grade-sync-label');

    if (label && !label.textContent) {
        label.textContent = 'Checking grade sync';
    }

    return indicator;
};

var xronosUpdateGradeSyncStatus = function(gradeSync) {
    var indicator = xronosEnsureGradeSyncIndicator();
    var label;
    var message;
    var state;

    if (!indicator) {
        return;
    }

    label = indicator.querySelector('.xronos-grade-sync-label');

    indicator.classList.remove(
        'xronos-grade-sync-checking',
        'xronos-grade-sync-syncing',
        'xronos-grade-sync-not-syncing',
        'xronos-grade-sync-error'
    );

    if (!gradeSync) {
        state = 'checking';
        message = xronosGradeSyncMessages.checking;
        indicator.classList.add('xronos-grade-sync-checking');
        if (label) label.textContent = 'Checking grade sync';
    } else if (gradeSync.state === 'syncing' || gradeSync.hasActiveGradePassback) {
        state = 'syncing';
        message = xronosGradeSyncMessages.syncing;
        indicator.classList.add('xronos-grade-sync-syncing');
        if (label) label.textContent = 'Grade syncing';
    } else if (gradeSync.state === 'error') {
        state = 'error';
        message = xronosGradeSyncMessages.error;
        indicator.classList.add('xronos-grade-sync-error');
        if (label) label.textContent = 'Grade sync unknown';
    } else {
        state = 'not-syncing';
        message = xronosGradeSyncMessages.notSyncing;
        indicator.classList.add('xronos-grade-sync-not-syncing');
        if (label) label.textContent = 'Grade not syncing';
    }

    indicator.setAttribute('data-grade-sync-state', state);
    indicator.setAttribute('data-grade-sync-message', message);
    indicator.setAttribute('title', message);
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

    var pointsPossible = $("main").attr( 'data-points' );
    var xourseUrl = $("main").attr( 'data-xourse-url' );

    var payload = {
	pointsEarned: pointsEarned,
	pointsPossible: pointsPossible	
    };

    $(".progress.completion-meter").attr('title', 'Submitting grade...' );
    
    $.ajax({
	url: window.toValidPath('/' + xourseUrl + '/gradebook'),
	type: 'PUT',
	data: JSON.stringify(payload),
	contentType: 'application/json',	
	success: function( result ) {
	    console.log( "Recorded gradebook",payload );
	    xronosUpdateGradeSyncStatus(result && result.gradeSync);
	    xronosDispatchGradebookRecorded(payload, result);
	    $('.progress-bar', ".progress.completion-meter").removeClass( 'bg-danger' );
	    $('.progress-bar', ".progress.completion-meter").addClass( 'bg-success' );
	    $(".progress.completion-meter").attr('title', 'Grade submitted at '  + (new Date()).toLocaleTimeString() );
	},
	error: function(jqXHR, err, exception) {
	    xronosUpdateGradeSyncStatus({state: 'error'});
	    $(".progress.completion-meter").attr('title', 'Could not submit grade.' );
	    $('.progress-bar', ".progress.completion-meter").removeClass( 'bg-success' );
	    $('.progress-bar', ".progress.completion-meter").addClass( 'bg-danger' );
	    window.setTimeout( exports.update, 1000 );
	}
    });
    
}, 300 );
