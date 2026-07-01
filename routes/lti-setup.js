var crypto = require('crypto');
var mdb = require('../mdb');
var config = require('../config');

function makeBuffer(value, encoding) {
    if (Buffer.from)
        return Buffer.from(value, encoding);

    return new Buffer(value, encoding);
}

function base64url(buffer) {
    return buffer.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function parseBasicAuth(req) {
    var header = req.get('Authorization') || '';

    if (header.indexOf('Basic ') !== 0)
        return null;

    try {
        var decoded = makeBuffer(header.slice(6), 'base64').toString('utf8');
        var colon = decoded.indexOf(':');

        if (colon < 0)
            return null;

        return {
            username: decoded.slice(0, colon),
            password: decoded.slice(colon + 1)
        };
    } catch (e) {
        return null;
    }
}

function safeEqualStrings(a, b) {
    a = String(a || '');
    b = String(b || '');

    var abuf = makeBuffer(a);
    var bbuf = makeBuffer(b);

    if (crypto.timingSafeEqual && abuf.length === bbuf.length)
        return crypto.timingSafeEqual(abuf, bbuf);

    var diff = abuf.length ^ bbuf.length;
    var len = Math.max(abuf.length, bbuf.length);

    for (var i = 0; i < len; i++) {
        var ac = (i < abuf.length) ? abuf[i] : 0;
        var bc = (i < bbuf.length) ? bbuf[i] : 0;
        diff |= ac ^ bc;
    }

    return diff === 0;
}

function verifyPassword(password, record) {
    // Format:
    // username:pbkdf2-sha256:iterations:salt:hashBase64
    var parts = record.split(':');

    if (parts.length !== 5)
        return false;

    var algorithm = parts[1];
    var iterations = parseInt(parts[2], 10);
    var salt = parts[3];
    var expectedHash = parts[4];

    if (algorithm !== 'pbkdf2-sha256')
        return false;

    if (!iterations || iterations < 100000)
        return false;

    var actualHash = crypto.pbkdf2Sync(
        password,
        salt,
        iterations,
        32,
        'sha256'
    ).toString('base64');

    return safeEqualStrings(actualHash, expectedHash);
}

function authorized(req) {
    var users = process.env.XIMERA_LTI_SETUP_USERS;

    if (!users)
        return false;

    var auth = parseBasicAuth(req);

    if (!auth)
        return false;

    var records = users.split(',');

    for (var i = 0; i < records.length; i++) {
        var record = records[i].trim();
        var username = record.split(':')[0];

        if (username === auth.username && verifyPassword(auth.password, record)) {
            req.ltiSetupUsername = username;
            return true;
        }
    }

    return false;
}

function requireAuth(req, res) {
    if (authorized(req))
        return true;

    res.set('WWW-Authenticate', 'Basic realm="Ximera LTI Setup"');
    res.status(401).send('LTI setup authorization required.');
    return false;
}

exports.notAvailable = function(req, res) {
    var repository = req.params.repository || '';

    res.status(404);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send([
        '<!doctype html>',
        '<html>',
        '<head>',
        '<meta charset="utf-8">',
        '<title>Ximera LTI Setup Not Available</title>',
        '</head>',
        '<body>',
        '<h1>LTI setup is not available at the repository root</h1>',
        '<p>This repository root does not appear to have its own LTI configuration.</p>',
        '<p>Use the LTI setup page for a specific xourse or activity path instead, for example:</p>',
        '<pre>/' + escapeHtml(repository) + '/someXourse/lti-setup</pre>',
        '</body>',
        '</html>'
    ].join('\n'));
};

function configUrl(req) {
    var repository = req.params.repository;
    var activityPath = req.params.path;

    var u = config.root + '/' + repository;

    if (activityPath)
        u += '/' + activityPath;

    u += '/lti.xml';

    return u;
}

function setupHtml(req, keyAndSecret) {
    var repository = req.params.repository;
    var activityPath = req.params.path || '';
    var ltiKey = repository;
    var url = configUrl(req);

    return [
        '<!doctype html>',
        '<html>',
        '<head>',
        '<meta charset="utf-8">',
        '<title>Ximera LTI Setup</title>',
        '<style>',
        'body { font-family: sans-serif; max-width: 60rem; margin: 2rem auto; line-height: 1.4; }',
        'code, pre { background: #f5f5f5; padding: 0.2rem 0.35rem; }',
        'pre { padding: 1rem; overflow-x: auto; }',
        '.warning { border-left: 4px solid #b35c00; padding-left: 1rem; }',
        '</style>',
        '</head>',
        '<body>',
        '<h1>Ximera LTI Setup</h1>',
        '<p class="warning"><strong>Keep this page private.</strong> The LTI secret below allows Canvas to launch this Ximera/Xronos assignment.</p>',
        '<dl>',
        '<dt>Repository</dt>',
        '<dd><code>' + escapeHtml(repository) + '</code></dd>',
        '<dt>Path</dt>',
        '<dd><code>' + escapeHtml(activityPath || '(root)') + '</code></dd>',
        '<dt>Canvas configuration URL</dt>',
        '<dd><pre>' + escapeHtml(url) + '</pre></dd>',
        '<dt>LTI key</dt>',
        '<dd><pre>' + escapeHtml(ltiKey) + '</pre></dd>',
        '<dt>LTI secret</dt>',
        '<dd><pre>' + escapeHtml(keyAndSecret.ltiSecret) + '</pre></dd>',
        '</dl>',
        '<p>In Canvas, use <strong>Add External Tool</strong> / <strong>Configure by URL</strong>, then enter the URL, key, and secret above.</p>',
        '</body>',
        '</html>'
    ].join('\n');
}

exports.show = function(req, res) {
    if (!requireAuth(req, res))
        return;

    var ltiKey = req.params.repository;

    if (!ltiKey || !String(ltiKey).match(/^[A-Za-z0-9._-]+$/)) {
        res.status(400).send('Invalid repository/LTI key.');
        return;
    }

    mdb.KeyAndSecret.findOne({ ltiKey: ltiKey }, function(err, keyAndSecret) {
        if (err) {
            res.status(500).send('Could not look up LTI key.');
            return;
        }

        if (keyAndSecret) {
            console.log('LTI setup viewed', {
                username: req.ltiSetupUsername,
                ltiKey: ltiKey,
                remoteAddress: req.ip
            });

            res.set('Content-Type', 'text/html; charset=utf-8');
            res.send(setupHtml(req, keyAndSecret));
            return;
        }

        crypto.randomBytes(32, function(err, buffer) {
            if (err) {
                res.status(500).send('Could not generate LTI secret.');
                return;
            }

            keyAndSecret = new mdb.KeyAndSecret({
                keyid: 'web-lti-setup',
                ltiKey: ltiKey,
                ltiSecret: base64url(buffer)
            });

            keyAndSecret.save(function(err) {
                if (err) {
                    res.status(500).send('Could not save LTI secret.');
                    return;
                }

                console.log('LTI setup created secret', {
                    username: req.ltiSetupUsername,
                    ltiKey: ltiKey,
                    remoteAddress: req.ip
                });

                res.set('Content-Type', 'text/html; charset=utf-8');
                res.send(setupHtml(req, keyAndSecret));
            });
        });
    });
};
