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
    var expiresAt = new Date(
        createdAt.getTime() +
        expirationHours(hours) * 60 * 60 * 1000
    );

    var auditToken = new mdb.AuditToken({
        tokenHash: hash,
        user: bridge.user,
        repository: bridge.repository,
        path: bridge.path,

        bridge: bridge._id,
        toolConsumerInstanceGuid:
            bridge.toolConsumerInstanceGuid,
        contextId: bridge.contextId,
        resourceLinkId: bridge.resourceLinkId,

        createdAt: createdAt,
        expiresAt: expiresAt
    });

    auditToken
        .save()
        .then(function(saved) {
            callback(null, token, saved);
        })
        .catch(function(err) {
            if (err && err.code === 11000) {
                createTokenForBridge(
                    bridge,
                    hours,
                    callback
                );
                return;
            }

            callback(err, token);
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

    mdb.ProgressMilestone.findOne(
        Object.assign({}, baseQuery, {
            observedAt: {
                $lte: asOf
            }
        })
    )
        .sort({ observedAt: -1 })
        .lean()
        .exec()
        .then(function(milestone) {
            return mdb.ProgressMilestone.findOne(
                Object.assign({}, baseQuery, {
                    observedAt: {
                        $gt: asOf
                    }
                })
            )
                .sort({ observedAt: 1 })
                .lean()
                .exec()
                .then(function(earliestAfter) {
                    callback(
                        null,
                        milestone,
                        earliestAfter
                    );
                });
        })
        .catch(function(err) {
            callback(err);
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
        .exec()
        .then(function(bridge) {
            callback(null, bridge);
        })
        .catch(function(err) {
            callback(err);
        });
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



function hasInstructorRole(bridge) {
    return (bridge.roles || []).some(function(role) {
        return role.match(/Instructor/) ||
            role.match(/Administrator/) ||
            role.match(/TeachingAssistant/) ||
            role.match(/Grader/);
    });
}

function currentUserCanRedeemToken(req, auditToken, callback) {
    var query;

    if (!req.user || req.user.isGuest) {
        callback(null, false);
        return;
    }

    query = {
        user: req.user._id,
        repository: auditToken.repository
    };

    if (auditToken.toolConsumerInstanceGuid) {
        query.toolConsumerInstanceGuid = auditToken.toolConsumerInstanceGuid;
    }

    if (auditToken.contextId) {
        query.contextId = auditToken.contextId;
    }

    mdb.LtiBridge.find(query)
        .lean()
        .exec(function(err, bridges) {
            if (err) {
                callback(err, false);
                return;
            }

            callback(null, bridges.some(hasInstructorRole));
        });
}

function pad2(value) {
    value = String(value);
    return value.length < 2 ? '0' + value : value;
}

function timeZoneWallParts(value) {
    var formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: REPORT_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    });
    var parts = {};

    formatter.formatToParts(new Date(value)).forEach(function(part) {
        if (part.type !== 'literal') {
            parts[part.type] = part.value;
        }
    });

    return parts;
}

function newYorkWallTimeToDate(year, month, day, hour24, minute) {
    var targetWall = Date.UTC(year, month - 1, day, hour24, minute, 0);
    var guess = targetWall;
    var i;
    var parts;
    var guessWall;

    /*
     * Convert an America/New_York wall-clock time into a UTC Date without
     * assuming the server's local timezone.  Iterate so DST offsets are handled
     * by Intl rather than by hard-coded -04/-05 offsets.
     */
    for (i = 0; i < 3; i += 1) {
        parts = timeZoneWallParts(new Date(guess));
        guessWall = Date.UTC(
            parseInt(parts.year, 10),
            parseInt(parts.month, 10) - 1,
            parseInt(parts.day, 10),
            parseInt(parts.hour, 10),
            parseInt(parts.minute, 10),
            parseInt(parts.second, 10)
        );

        guess += targetWall - guessWall;
    }

    return new Date(guess);
}

function defaultAsOfParts() {
    var parts = timeZoneWallParts(new Date());

    return {
        asOfDate: parts.year + '-' + parts.month + '-' + parts.day,
        asOfHour: '11',
        asOfMinute: '59',
        asOfAmPm: 'PM'
    };
}

function asOfPartsFromBody(body) {
    return {
        asOfDate: ((body && body.asOfDate) || '').trim(),
        asOfHour: ((body && body.asOfHour) || '').trim(),
        asOfMinute: ((body && body.asOfMinute) || '').trim(),
        asOfAmPm: ((body && body.asOfAmPm) || '').trim().toUpperCase()
    };
}

function parseAsOfParts(parts) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(parts.asOfDate || '');
    var hour = parseInt(parts.asOfHour, 10);
    var minute = parseInt(parts.asOfMinute, 10);
    var hour24;

    if (!match) {
        return null;
    }

    if (isNaN(hour) || hour < 1 || hour > 12) {
        return null;
    }

    if (isNaN(minute) || minute < 0 || minute > 59) {
        return null;
    }

    if (parts.asOfAmPm !== 'AM' && parts.asOfAmPm !== 'PM') {
        return null;
    }

    hour24 = hour % 12;
    if (parts.asOfAmPm === 'PM') {
        hour24 += 12;
    }

    return newYorkWallTimeToDate(
        parseInt(match[1], 10),
        parseInt(match[2], 10),
        parseInt(match[3], 10),
        hour24,
        minute
    );
}

function renderRedeemPage(req, res, data) {
    var defaults = defaultAsOfParts();

    data = data || {};
    data.asOfDate = data.asOfDate || defaults.asOfDate;
    data.asOfHour = data.asOfHour || defaults.asOfHour;
    data.asOfMinute = data.asOfMinute || defaults.asOfMinute;
    data.asOfAmPm = data.asOfAmPm || defaults.asOfAmPm;

    res.render('progress-audit/redeem', data);
}

function redeemForm(req, res) {
    renderRedeemPage(req, res);
}

function redeemToken(req, res) {
    var rawToken = ((req.body && req.body.token) || '').trim();
    var asOfParts = asOfPartsFromBody(req.body);
    var asOf = parseAsOfParts(asOfParts);

    if (!rawToken) {
        renderRedeemPage(req, res, Object.assign({
            error: 'Enter a progress audit token.',
            token: rawToken
        }, asOfParts));
        return;
    }

    if (!asOf) {
        renderRedeemPage(req, res, Object.assign({
            error: 'Enter a valid as-of date and time.',
            token: rawToken
        }, asOfParts));
        return;
    }

    mdb.AuditToken.findOne({ tokenHash: tokenHash(rawToken) })
        .lean()
        .exec(function(err, auditToken) {
            var unusable;

            if (err) {
                renderRedeemPage(req, res, Object.assign({
                    error: 'There was a problem looking up the progress audit token.',
                    token: rawToken
                }, asOfParts));
                return;
            }

            unusable = tokenIsUsable(auditToken);

            if (unusable) {
                renderRedeemPage(req, res, Object.assign({
                    error: unusable,
                    token: rawToken
                }, asOfParts));
                return;
            }

            currentUserCanRedeemToken(req, auditToken, function(err, allowed) {
                if (err) {
                    renderRedeemPage(req, res, Object.assign({
                        error: 'There was a problem checking your instructor authorization.',
                        token: rawToken
                    }, asOfParts));
                    return;
                }

                if (!allowed) {
                    renderRedeemPage(req, res, Object.assign({
                        error: 'You do not have instructor access for the Canvas course/repository associated with this token.',
                        token: rawToken
                    }, asOfParts));
                    return;
                }

                findMilestones(auditToken, asOf, function(err, milestone, earliestAfter) {
                    if (err) {
                        renderRedeemPage(req, res, Object.assign({
                            error: 'There was a problem reading progress milestones for this token.',
                            token: rawToken
                        }, asOfParts));
                        return;
                    }

                    mdb.AuditToken.updateOne(
                        { _id: auditToken._id },
                        { $set: { usedAt: new Date() } },
                        function(updateErr) {
                            if (updateErr) {
                                console.log('Error recording progress audit token use');
                                console.log(updateErr);
                            }
                        }
                    );

                    findCurrentMilestone(auditToken, function(err, currentMilestone) {
                        if (err) {
                            renderRedeemPage(req, res, Object.assign({
                                error: 'There was a problem reading the current progress milestone for this token.',
                                token: rawToken
                            }, asOfParts));
                            return;
                        }

                        renderRedeemPage(req, res, Object.assign({
                            token: rawToken,
                            report: auditReportViewModel(auditToken, asOf, milestone, currentMilestone),
                            reportLines: tokenReportLines(auditToken, asOf, milestone, earliestAfter)
                        }, asOfParts));
                    });
                });
            });
        });
}



function milestoneViewModel(milestone) {
    if (!milestone) {
        return null;
    }

    return {
        observedAt: humanTime(milestone.observedAt),
        observedAtUtc: iso(milestone.observedAt),
        windowStartedAt: humanTime(milestone.windowStartedAt),
        windowStartedAtUtc: iso(milestone.windowStartedAt),
        progress: percent(milestone.score),
        xronosPoints: points(milestone.pointsEarned) + ' / ' + points(milestone.pointsPossible),
        canvasPoints: points(milestone.canvasScore) + ' / ' + points(milestone.canvasPointsPossible),
        source: milestone.source || 'unknown',
        id: milestone._id
    };
}


function findCurrentMilestone(scope, callback) {
    mdb.ProgressMilestone.findOne(baseMilestoneQuery(scope))
        .sort({ observedAt: -1 })
        .lean()
        .exec(callback);
}

function auditReportViewModel(auditToken, asOf, milestone, currentMilestone) {
    return {
        scope: {
            repository: auditToken.repository,
            path: auditToken.path,
            contextId: auditToken.contextId || 'unknown',
            resourceLinkId: auditToken.resourceLinkId || 'unknown',
            created: humanTime(auditToken.createdAt),
            expires: humanTime(auditToken.expiresAt)
        },
        requested: {
            human: humanTime(asOf),
            utc: iso(asOf)
        },
        asOfMilestone: milestoneViewModel(milestone),
        currentMilestone: milestoneViewModel(currentMilestone)
    };
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
exports.redeemForm = redeemForm;
exports.redeemToken = redeemToken;

exports.baseMilestoneQuery = baseMilestoneQuery;
exports.findMilestones = findMilestones;

exports.humanTime = humanTime;
exports.iso = iso;
exports.percent = percent;
exports.points = points;

exports.tokenReportLines = tokenReportLines;
exports.bridgeReportLines = bridgeReportLines;
