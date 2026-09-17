'use strict';

var assert = require('assert');
var visibilityDeadline = require('../public/javascripts/visibility-deadline');

function fakeEnvironment() {
    var now = 0;
    var nextTimerId = 1;
    var timers = {};
    var listeners = {};

    var windowObject = {
        setTimeout: function(callback, delay) {
            var id = nextTimerId++;
            timers[id] = {
                callback: callback,
                dueAt: now + Number(delay)
            };
            return id;
        },
        clearTimeout: function(id) {
            delete timers[id];
        }
    };

    var documentObject = {
        hidden: false,
        visibilityState: 'visible',
        addEventListener: function(name, callback) {
            listeners[name] = callback;
        }
    };

    function advance(milliseconds) {
        now += milliseconds;

        var due = Object.keys(timers)
            .map(Number)
            .filter(function(id) {
                return timers[id] && timers[id].dueAt <= now;
            });

        due.forEach(function(id) {
            var timer = timers[id];
            delete timers[id];
            timer.callback();
        });
    }

    function setHidden(hidden) {
        documentObject.hidden = hidden;
        documentObject.visibilityState = hidden ? 'hidden' : 'visible';
        listeners.visibilitychange();
    }

    return {
        windowObject: windowObject,
        documentObject: documentObject,
        now: function() { return now; },
        advance: advance,
        setHidden: setHidden
    };
}

describe('visibility-aware deadline', function() {
    it('does not count time spent in a hidden tab', function() {
        var env = fakeEnvironment();
        var fired = 0;
        var deadline = visibilityDeadline.create(
            env.windowObject,
            env.documentObject,
            {
                now: env.now,
                schedulerSlackMilliseconds: 100
            }
        );

        deadline.setTimeout(function() {
            fired += 1;
        }, 15000);

        env.advance(5000);
        env.setHidden(true);
        env.advance(60000);

        assert.strictEqual(fired, 0);

        env.setHidden(false);
        env.advance(9999);
        assert.strictEqual(fired, 0);

        env.advance(1);
        assert.strictEqual(fired, 1);
    });

    it('does not treat a heavily delayed scheduler callback as a timeout', function() {
        var env = fakeEnvironment();
        var fired = 0;
        var deadline = visibilityDeadline.create(
            env.windowObject,
            env.documentObject,
            {
                now: env.now,
                schedulerSlackMilliseconds: 100
            }
        );

        deadline.setTimeout(function() {
            fired += 1;
        }, 15000);

        env.advance(60000);
        assert.strictEqual(fired, 0);

        env.advance(15000);
        assert.strictEqual(fired, 1);
    });

    it('can cancel a paused deadline', function() {
        var env = fakeEnvironment();
        var fired = 0;
        var deadline = visibilityDeadline.create(
            env.windowObject,
            env.documentObject,
            {now: env.now}
        );
        var id = deadline.setTimeout(function() {
            fired += 1;
        }, 15000);

        env.advance(1000);
        env.setHidden(true);
        deadline.clearTimeout(id);
        env.setHidden(false);
        env.advance(60000);

        assert.strictEqual(fired, 0);
    });
});
