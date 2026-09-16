var assert = require('assert');
var fs = require('fs');

function source(path) {
    return fs.readFileSync(path, 'utf8');
}

describe('reload-sensitive runtime contracts', function() {
    it('renders the configured subpath into both page layouts', function() {
        [
            'views/layouts/main.pug',
            'views/layouts/grid.pug'
        ].forEach(function(path) {
            assert(
                source(path).indexOf(
                    'meta(name="xronos-subpath", content=toValidPath(""))'
                ) !== -1,
                path + ' should expose xronos-subpath'
            );
        });
    });

    it('does not perform a synchronous HEAD request during browser startup', function() {
        var main = source(
            'public/javascripts/main.js'
        );

        assert.strictEqual(
            main.indexOf(
                "http.open('HEAD', document.location, false)"
            ),
            -1
        );

        assert(
            main.indexOf(
                'meta[name="xronos-subpath"]'
            ) !== -1
        );
    });

    it('recycles only genuinely unanswered state WebSocket heartbeats', function() {
        var database = source(
            'public/javascripts/database.js'
        );

        /*
         * Background tabs can delay setInterval callbacks for much longer
         * than the heartbeat interval.  A delayed callback must not condemn
         * the socket merely because the previous pong is old.  Staleness is
         * measured from a ping that was actually sent and remains unanswered.
         */
        assert(
            database.indexOf(
                'var heartbeatPingSentAt = undefined;'
            ) !== -1
        );

        assert(
            database.indexOf(
                'if (heartbeatPingSentAt !== undefined)'
            ) !== -1
        );

        assert(
            database.indexOf(
                'elapsed = now - heartbeatPingSentAt;'
            ) !== -1
        );

        assert(
            database.indexOf(
                'heartbeatPingSentAt = now;'
            ) !== -1
        );

        assert(
            database.indexOf(
                'var heartbeatLastCheckAt = undefined;'
            ) !== -1
        );

        assert(
            database.indexOf(
                'reason: "scheduler-delayed"'
            ) !== -1
        );

        assert(
            database.indexOf(
                'schedulerDelay >'
            ) !== -1
        );

        assert(
            database.indexOf(
                'sentAtNumber === heartbeatPingSentAt'
            ) !== -1
        );

        assert(
            database.indexOf(
                'heartbeatPingSentAt = undefined;'
            ) !== -1
        );

        assert.strictEqual(
            database.indexOf(
                'elapsed = now - lastPongAt;'
            ),
            -1
        );

        assert(
            database.indexOf(
                'socketForHeartbeat.close('
            ) !== -1
        );

        assert(
            database.indexOf(
                '"heartbeat stale"'
            ) !== -1
        );

        assert(
            database.indexOf(
                'this.send( JSON.stringify( parameters ) );'
            ) !== -1
        );

        assert(
            database.indexOf(
                'handlers[camelCased].apply(\n' +
                '                event.currentTarget'
            ) !== -1
        );
    });

    it('does not expose the obsolete manual publication update action', function() {
        var database = source(
            'public/javascripts/database.js'
        );

        assert.strictEqual(
            database.indexOf(
                "$('#pageUpdate').show()"
            ),
            -1
        );

        assert.strictEqual(
            database.indexOf(
                "$('#update-version-button').attr"
            ),
            -1
        );

        assert(
            database.indexOf(
                '"use-latest-on-next-navigation"'
            ) !== -1
        );
    });

    it('canonicalizes old query URLs without forcing a second reload', function() {
        var cacheBust = source(
            'public/javascripts/cache-bust.js'
        );

        assert(
            cacheBust.indexOf(
                'window.history.replaceState'
            ) !== -1
        );

        assert.strictEqual(
            cacheBust.indexOf(
                'window.location.reload'
            ),
            -1
        );
    });
});
