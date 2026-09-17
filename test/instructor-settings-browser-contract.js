'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

function source(relativePath) {
    return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

describe('instructor settings browser contract', function() {
    var modal = source('views/modals/instructor-settings.pug');
    var users = source('public/javascripts/users.js');
    var navbar = source('views/layouts/navbar/login.pug');
    var topbar = source('views/layouts/topbar/index.pug');

    it('uses the agreed modal and scope labels', function() {
        assert(modal.indexOf('Instructor Settings') >= 0);
        assert(modal.indexOf('This Page') >= 0);
        assert(modal.indexOf('All Xronos Content') >= 0);
        assert(modal.indexOf('Stop grade sync at the due date') >= 0);
    });

    it('renders the unsupported page scope as unavailable, not an inherited value', function() {
        assert(modal.indexOf('instructor-setting-unavailable') >= 0);
        assert(modal.indexOf('aria-disabled="true"') >= 0);
        assert(modal.indexOf('span Unavailable') >= 0);
    });

    it('maps the global UI choices to late-policy and due-date', function() {
        assert(modal.indexOf('data-setting-value="late-policy"') >= 0);
        assert(modal.indexOf('data-setting-value="due-date"') >= 0);
        assert(modal.indexOf(') Off') >= 0);
        assert(modal.indexOf(') On') >= 0);
    });

    it('uses a one-second debounced autosave and server-confirmed status', function() {
        assert(users.indexOf('window.setTimeout(function()') >= 0);
        assert(users.indexOf('}, 1000);') >= 0);
        assert(users.indexOf("setInstructorSettingsStatus('Saving…')") >= 0);
        assert(users.indexOf("setInstructorSettingsStatus('Saved', 'is-saved')") >= 0);
        assert(users.indexOf('saveSequence') >= 0);
    });

    it('keeps the settings entry hidden until the authorized API probe succeeds', function() {
        assert(users.indexOf("$('#instructor-settings-link').show()") >= 0);
        assert(navbar.indexOf('#instructor-settings-link') >= 0);
        assert(navbar.indexOf('Instructor Settings') >= 0);
        assert(navbar.indexOf('style="display: none;"') >= 0);
        assert(topbar.indexOf('#instructor-settings-link') >= 0);
        assert(topbar.indexOf('Instructor Settings') >= 0);
        assert(topbar.indexOf('style="display: none;"') >= 0);
    });

    it('provides explicit modal dismissal as a fallback for legacy Bootstrap behavior', function() {
        var dismiss = "onclick=\"$('#instructorSettingsModal').modal('hide');\"";
        assert(modal.indexOf(dismiss) >= 0);
        assert(modal.indexOf(dismiss) !== modal.lastIndexOf(dismiss));
    });

    it('explains that All Xronos Content is limited to the current LMS shell', function() {
        assert(modal.indexOf('specific LMS course shell') >= 0);
        assert(modal.indexOf('does not mean all Xronos content everywhere') >= 0);
    });
});
