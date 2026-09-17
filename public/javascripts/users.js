var $ = require('jquery');
var _ = require('underscore');
var moment = require('moment');

exports.get = _.memoize( function(userId) {
    return $.ajax({
	url: window.toValidPath("/users/" + userId),
	headers: {Accept: "application/json;charset=utf-8"},
    });
});

function me() {
    return exports.get('me');
};

exports.me = me;

var instructorSettingsState = {
    loaded: false,
    response: null,
    desiredGradeSyncCutoff: null,
    saveTimer: null,
    saveSequence: 0
};

function instructorSettingsUrl() {
    return window.toValidPath('/instructor-settings/current');
}

function setInstructorSettingsStatus(text, className) {
    var status = $('#instructor-settings-save-status');
    status.removeClass('is-error is-saved');
    if (className) status.addClass(className);
    status.text(text || '');
}

function renderGradeSyncCutoff(value) {
    $('#grade-sync-cutoff-switch .instructor-setting-choice').each(function() {
        var button = $(this);
        var pressed = button.attr('data-setting-value') === value;
        button.attr('aria-pressed', pressed ? 'true' : 'false');
    });
}

function renderInstructorSettings(response) {
    var global = response && response.global;
    var settings = global && global.settings || {};
    var cutoff = settings.gradeSyncCutoff || 'late-policy';

    instructorSettingsState.response = response;
    instructorSettingsState.desiredGradeSyncCutoff = cutoff;
    renderGradeSyncCutoff(cutoff);

    if (global && global.fallbackGradeSyncEndAt) {
        var fallback = moment(global.fallbackGradeSyncEndAt);
        if (fallback.isValid()) {
            $('#instructor-settings-fallback-note').text(
                'Fallback grade-sync horizon for this LMS shell: ' +
                fallback.format('LLLL') + '.'
            );
        }
    }

    $('#instructor-settings-loading').hide();
    $('#instructor-settings-error').hide();
    $('#instructor-settings-content').show();
}

function showInstructorSettingsLoadError() {
    $('#instructor-settings-loading').hide();
    $('#instructor-settings-content').hide();
    $('#instructor-settings-error')
        .text('The Canvas integration settings could not be loaded. Close this window and try again.')
        .show();
}

function loadInstructorSettings(options) {
    options = options || {};

    if (options.showLoading) {
        $('#instructor-settings-loading').show();
        $('#instructor-settings-content').hide();
        $('#instructor-settings-error').hide();
    }

    return $.ajax({
        url: instructorSettingsUrl(),
        method: 'GET',
        headers: {Accept: 'application/json;charset=utf-8'}
    }).then(function(response) {
        instructorSettingsState.loaded = true;
        renderInstructorSettings(response);
        $('#instructor-settings-link').show();
        return response;
    });
}

function saveGradeSyncCutoff(value, sequence) {
    setInstructorSettingsStatus('Saving…');

    return $.ajax({
        url: instructorSettingsUrl(),
        method: 'PUT',
        contentType: 'application/json; charset=utf-8',
        dataType: 'json',
        data: JSON.stringify({
            scope: 'global',
            key: 'gradeSyncCutoff',
            value: value
        })
    }).then(function(response) {
        if (sequence !== instructorSettingsState.saveSequence) return;
        if (value !== instructorSettingsState.desiredGradeSyncCutoff) return;

        renderInstructorSettings(response);
        setInstructorSettingsStatus('Saved', 'is-saved');
    }, function() {
        if (sequence !== instructorSettingsState.saveSequence) return;
        if (value !== instructorSettingsState.desiredGradeSyncCutoff) return;

        setInstructorSettingsStatus(
            'Could not save this change. Select the setting again to retry.',
            'is-error'
        );
    });
}

function queueGradeSyncCutoffSave(value) {
    instructorSettingsState.desiredGradeSyncCutoff = value;
    renderGradeSyncCutoff(value);
    setInstructorSettingsStatus('Change pending…');

    if (instructorSettingsState.saveTimer) {
        window.clearTimeout(instructorSettingsState.saveTimer);
    }

    instructorSettingsState.saveTimer = window.setTimeout(function() {
        instructorSettingsState.saveTimer = null;
        instructorSettingsState.saveSequence += 1;
        saveGradeSyncCutoff(
            instructorSettingsState.desiredGradeSyncCutoff,
            instructorSettingsState.saveSequence
        );
    }, 1000);
}

function installInstructorSettingsUi(user) {
    if (!$('#instructorSettingsModal').length) return;

    $('.instructor-settings-help').tooltip({trigger: 'hover focus'});

    $('#instructor-settings-link').on('click', function() {
        setInstructorSettingsStatus('');
        loadInstructorSettings({showLoading: true}).fail(function(xhr) {
            if (xhr && xhr.status === 403) {
                $('#instructor-settings-link').hide();
            }
            showInstructorSettingsLoadError();
        });
    });

    $('#grade-sync-cutoff-switch').on('click', '.instructor-setting-choice', function(event) {
        event.preventDefault();
        queueGradeSyncCutoffSave($(this).attr('data-setting-value'));
    });

    /*
     * Avoid probing every ordinary Xronos user.  The legacy instructor path
     * list is only a cheap client-side prefilter; the settings endpoint itself
     * authorizes exclusively from the current validated LTI launch reference.
     */
    if (user && user.instructorRepositoryPaths && user.instructorRepositoryPaths.length) {
        loadInstructorSettings().fail(function() {
            $('#instructor-settings-link').hide();
        });
    }
}

$(document).ready(function() {
    me().then( function(user) {
	if (user.isGuest === false) {
	    $('#loginUser').show();

	    if (user.name.split(' ')[0])
			$('#userFirstName').text(user.name.split(' ')[0]);
	} else {
			$('#loginGuest').show();  // If enabled in the server !
	}

	// Instructors should see instructor-only menu items.
	if (user.instructorRepositoryPaths) {
	    $('#progress-audit-redeem-link').show();
	    
	    user.instructorRepositoryPaths.forEach( function(p) {
		if (window.location.pathname.startsWith(window.toValidPath(p)))
		    $('#instructor-view-statistics').show();
		if (window.location.pathname.startsWith(window.toValidPath('/' + p)))
		    $('#instructor-view-statistics').show();		    
	    });
	}

	// If there's git content loaded...
	var repositoryName = $('main').attr('data-repository-name');
	var xourse = $('main').attr('data-xourse-path');

	if (xourse && repositoryName) {
	    $('#progress-audit-token-link')
		.attr('href', window.toValidPath('/' + repositoryName + '/' + xourse + '/progress-audit/token'))
		.show();
	}

	if (xourse && repositoryName) {
	    if (user.bridges) {
		var assignment = undefined;
		user.bridges.forEach( function(bridge) {
		    if ((bridge.path == xourse) && (bridge.repository == repositoryName)) {
			assignment = bridge;
		    }
		});

		if (assignment) {
		    var dueDate = moment(Date.parse(assignment.dueDate));
		    if (dueDate.isValid()) {
			$('#dueDateCountdown').text( dueDate.fromNow() );
			$('#dueDate').attr('title', "Due at " + dueDate.format('LLLL') );
			$('#dueDate').show();		    
			$('#dueDate').tooltip();
			
			window.setInterval( function() {
			    $('#dueDateCountdown').text( dueDate.fromNow() );
			}, 1000);
		    }
		}
	    }
	}

        installInstructorSettingsUi(user);
    });
});
