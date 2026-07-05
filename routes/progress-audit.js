var crypto = require('crypto');
var mdb = require('../mdb');

var REPORT_TIME_ZONE = 'America/New_York';
var REPORT_TIME_ZONE_LABEL = 'ET';
var DEFAULT_EXPIRATION_HOURS = 168;
var MAX_EXPIRATION_HOURS = 2160;

function tokenHash(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function randomToken() {
    return crypto.randomBytes(32)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function expirationHours(value) {
    var hours = parseInt(value || DEFAULT_EXPIRATION_HOURS, 10);

    if (isNaN(hours) || hours < 1) {
        return DEFAULT_EXPIRATION_HOURS;
    }

    if (hours > MAX_EXPIRATION_HOURS) {
        return MAX_EXPIRATION_HOURS;
    }

    return hours;
}

function createTokenForBridge(bridge, hours, callback) {
    var token = randomToken();
    var hash = tokenHash(token);
    var createdAt = new Date();
    var expiresAt = new Date(createdAt.getTime() + expirationHours(hours) * 60 * 60 * 1000);

    var auditToken = new mdb.AuditToken({
        tokenHash: hash,
        user: bridge.user,
        repository: bridge.repository,
        path: bridge.path,

        bridge: bridge._id,
        toolConsumerInstanceGuid: bridge.toolConsumerInstanceGuid,
        contextId: bridge.contextId,
        resourceLinkId: bridge.resourceLinkId,

        createdAt: createdAt,
        expiresAt: expiresAt
    });

    auditToken.save(function(err, saved) {
        if (err && err.code === 11000) {
            createTokenForBridge(bridge, hours, callback);
            return;
        }

        callback(err, token, saved);
    });
}

function tokenIsUsable(auditToken, now) {
    now = now || new Date();

    if (!auditToken) {
        return 'Token not found.';
    }

    if (auditToken.revokedAt) {
        return 'Token has been revoked.';
    }

    if (auditToken.expiresAt && new Date(auditToken.expiresAt).getTime() < now.getTime()) {
        return 'Token has expired.';
    }

    return null;
}

function baseMilestoneQuery(scope) {
    var query = {
        bridge: scope.bridge,
        user: scope.user,
        repository: scope.repository,
        path: scope.path
    };

    if (scope.contextId) {
        query.contextId = scope.contextId;
    }

    if (scope.resourceLinkId) {
        query.resourceLinkId = scope.resourceLinkId;
    }

    return query;
}

function findMilestones(scope, asOf, callback) {
    var baseQuery = baseMilestoneQuery(scope);

    mdb.ProgressMilestone.findOne(Object.assign({}, baseQuery, {
        observedAt: { $lte: asOf }
    }))
        .sort({ observedAt: -1 })
        .lean()
        .exec(function(err, milestone) {
            if (err) {
                callback(err);
                return;
            }

            mdb.ProgressMilestone.findOne(Object.assign({}, baseQuery, {
                observedAt: { $gt: asOf }
            }))
                .sort({ observedAt: 1 })
                .lean()
                .exec(function(err, earliestAfter) {
                    if (err) {
                        callback(err);
                        return;
                    }

                    callback(null, milestone, earliestAfter);
                });
        });
}

function timeParts(value) {
    var formatter;
    var parts;
    var result = {};

    if (!value) {
        return null;
    }

    formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: REPORT_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    parts = formatter.formatToParts(new Date(value));

    parts.forEach(function(part) {
        if (part.type !== 'literal') {
            result[part.type] = part.value;
        }
    });

    return result;
}

function humanTime(value) {
    var parts = timeParts(value);
    var dayPeriod;

    if (!parts) {
        return 'unknown';
    }

    dayPeriod = (parts.dayPeriod || '').toLowerCase();

    return parts.hour + ':' + parts.minute + dayPeriod + ' ' +
        REPORT_TIME_ZONE_LABEL + ', ' +
        parts.month + '/' + parts.day + '/' + parts.year;
}

function iso(value) {
    if (!value) {
        return 'unknown';
    }

    return new Date(value).toISOString();
}

function percent(value) {
    if (value === undefined || value === null || isNaN(value)) {
        return 'unknown';
    }

    return (Math.round(value * 10000) / 100).toString() + '%';
}

function points(value) {
    if (value === undefined || value === null || isNaN(value)) {
        return 'unknown';
    }

    return (Math.round(value * 100) / 100).toString();
}

function reportScopeLines(scope, label) {
    return [
        label || 'Token scope',
        '-----------',
        'Repository:       ' + scope.repository,
        'Path:             ' + scope.path,
        'Canvas context:   ' + (scope.contextId || 'unknown'),
        'Canvas resource:  ' + (scope.resourceLinkId || 'unknown'),
        'Bridge ID:        ' + scope.bridge,
        'User ID:          ' + scope.user
    ];
}

function tokenMetadataLines(auditToken) {
    return [
        'Created:          ' + humanTime(auditToken.createdAt),
        'Created UTC:      ' + iso(auditToken.createdAt),
        'Expires:          ' + humanTime(auditToken.expiresAt),
        'Expires UTC:      ' + iso(auditToken.expiresAt)
    ];
}

function requestedTimeLines(asOf) {
    return [
        'Requested time',
        '--------------',
        'As of:           ' + humanTime(asOf),
        'As of UTC:       ' + asOf.toISOString()
    ];
}

function resultLines(milestone, earliestAfter) {
    var lines = [
        'Result',
        '------'
    ];

    if (!milestone) {
        lines.push('No recorded progress milestone existed at or before the requested time.');

        if (earliestAfter) {
            lines = lines.concat([
                '',
                'First later milestone',
                '---------------------',
                'Observed at:      ' + humanTime(earliestAfter.observedAt),
                'Observed UTC:     ' + iso(earliestAfter.observedAt),
                'Progress:         ' + percent(earliestAfter.score),
                'Xronos points:    ' + points(earliestAfter.pointsEarned) + ' / ' + points(earliestAfter.pointsPossible),
                'Canvas points:    ' + points(earliestAfter.canvasScore) + ' / ' + points(earliestAfter.canvasPointsPossible)
            ]);
        }

        return lines;
    }

    return lines.concat([
        'Latest milestone: ' + humanTime(milestone.observedAt),
        'Latest UTC:       ' + iso(milestone.observedAt),
        'Window started:   ' + humanTime(milestone.windowStartedAt),
        'Window UTC:       ' + iso(milestone.windowStartedAt),
        'Progress:         ' + percent(milestone.score),
        'Xronos points:    ' + points(milestone.pointsEarned) + ' / ' + points(milestone.pointsPossible),
        'Canvas points:    ' + points(milestone.canvasScore) + ' / ' + points(milestone.canvasPointsPossible),
        'Source:           ' + (milestone.source || 'unknown'),
        'Milestone ID:     ' + milestone._id
    ]);
}

function tokenReportLines(auditToken, asOf, milestone, earliestAfter) {
    return [
        '',
        'Xronos Progress Audit Token Report',
        '==================================',
        ''
    ]
        .concat(reportScopeLines(auditToken, 'Token scope'))
        .concat(tokenMetadataLines(auditToken))
        .concat([
            ''
        ])
        .concat(requestedTimeLines(asOf))
        .concat([
            ''
        ])
        .concat(resultLines(milestone, earliestAfter))
        .concat([
            ''
        ]);
}

function bridgeReportLines(bridge, asOf, milestone, earliestAfter) {
    return [
        '',
        'Xronos Progress Audit Prototype',
        '================================',
        ''
    ]
        .concat(reportScopeLines(bridge, 'Assignment'))
        .concat([
            ''
        ])
        .concat(requestedTimeLines(asOf))
        .concat([
            ''
        ])
        .concat(resultLines(milestone, earliestAfter))
        .concat([
            ''
        ]);
}


function assignmentUrl(req) {
    return req.app.locals.toValidPath('/' + req.params.repository + '/' + req.params.path);
}

function currentUserAssignmentBridge(req, callback) {
    var query;

    if (!req.user || req.user.isGuest) {
        callback(null, null);
        return;
    }

    query = {
        user: req.user._id,
        repository: req.params.repository,
        path: req.params.path
    };

    mdb.LtiBridge.findOne(query)
        .sort({ _id: -1 })
        .lean()
        .exec(callback);
}

function renderTokenPage(req, res, data) {
    data = data || {};
    data.returnUrl = assignmentUrl(req);
    res.render('progress-audit/token', data);
}

function tokenForm(req, res) {
    currentUserAssignmentBridge(req, function(err, bridge) {
        if (err) {
            renderTokenPage(req, res, {
                error: 'There was a problem looking up your Canvas/Xronos assignment connection.'
            });
            return;
        }

        if (!bridge) {
            renderTokenPage(req, res, {
                error: 'No Canvas/Xronos assignment connection was found for your account on this assignment. Launch this assignment from Canvas first, then try again.'
            });
            return;
        }

        renderTokenPage(req, res);
    });
}

function createToken(req, res) {
    currentUserAssignmentBridge(req, function(err, bridge) {
        if (err) {
            renderTokenPage(req, res, {
                error: 'There was a problem looking up your Canvas/Xronos assignment connection.'
            });
            return;
        }

        if (!bridge) {
            renderTokenPage(req, res, {
                error: 'No Canvas/Xronos assignment connection was found for your account on this assignment. Launch this assignment from Canvas first, then try again.'
            });
            return;
        }

        createTokenForBridge(bridge, DEFAULT_EXPIRATION_HOURS, function(err, token, auditToken) {
            if (err) {
                renderTokenPage(req, res, {
                    error: 'There was a problem creating your progress audit token.'
                });
                return;
            }

            renderTokenPage(req, res, {
                token: token,
                auditToken: auditToken,
                created: humanTime(auditToken.createdAt),
                expires: humanTime(auditToken.expiresAt)
            });
        });
    });
}


exports.REPORT_TIME_ZONE = REPORT_TIME_ZONE;
exports.REPORT_TIME_ZONE_LABEL = REPORT_TIME_ZONE_LABEL;

exports.randomToken = randomToken;
exports.tokenHash = tokenHash;
exports.expirationHours = expirationHours;
exports.createTokenForBridge = createTokenForBridge;
exports.tokenIsUsable = tokenIsUsable;

exports.tokenForm = tokenForm;
exports.createToken = createToken;

exports.baseMilestoneQuery = baseMilestoneQuery;
exports.findMilestones = findMilestones;

exports.humanTime = humanTime;
exports.iso = iso;
exports.percent = percent;
exports.points = points;

exports.tokenReportLines = tokenReportLines;
exports.bridgeReportLines = bridgeReportLines;
