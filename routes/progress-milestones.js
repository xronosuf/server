var mdb = require('../mdb');
var gradeBoundaryPolicy = require('../lib/grade-boundary-policy');

var MIN_SCORE_DELTA = 0.001;
var MIN_MILESTONE_INTERVAL_MS = 1000 * 60 * 5;

function numberOrUndefined(value) {
    var n = parseFloat(value);

    if (isNaN(n)) {
        return undefined;
    }

    return n;
}

function positiveNumber(value) {
    var n = numberOrUndefined(value);

    if (n === undefined || n <= 0) {
        return undefined;
    }

    return n;
}

function normalizedScore(pointsEarned, pointsPossible) {
    if (pointsEarned === undefined || pointsPossible === undefined || pointsPossible <= 0) {
        return undefined;
    }

    return pointsEarned / pointsPossible;
}

function canvasScore(score, canvasPointsPossible) {
    if (score === undefined || canvasPointsPossible === undefined) {
        return undefined;
    }

    return score * canvasPointsPossible;
}

function bridgeFields(bridge) {
    if (!bridge) {
        return {};
    }

    return {
        bridge: bridge._id,
        canvasPointsPossible: numberOrUndefined(bridge.pointsPossible),
        toolConsumerInstanceGuid: bridge.toolConsumerInstanceGuid,
        contextId: bridge.contextId,
        resourceLinkId: bridge.resourceLinkId
    };
}

function scoreImproved(previous, score) {
    if (!previous) {
        return true;
    }

    if (score === undefined) {
        return false;
    }

    return score > (previous.score || 0) + MIN_SCORE_DELTA;
}

function shouldStartNewMilestone(previous, now) {
    var windowStartedAt;

    if (!previous) {
        return true;
    }

    windowStartedAt = previous.windowStartedAt || previous.observedAt;

    if (!windowStartedAt) {
        return true;
    }

    return now.getTime() - new Date(windowStartedAt).getTime() >= MIN_MILESTONE_INTERVAL_MS;
}

function applyMilestoneValues(milestone, options, pointsEarned, pointsPossible, score, bridgeData, now) {
    milestone.user = options.user;
    milestone.repository = options.repository;
    milestone.path = options.path;

    milestone.pointsEarned = pointsEarned;
    milestone.pointsPossible = pointsPossible;
    milestone.score = score;

    milestone.canvasPointsPossible = bridgeData.canvasPointsPossible;
    milestone.canvasScore = canvasScore(score, bridgeData.canvasPointsPossible);

    milestone.source = options.source || 'gradebook';

    milestone.bridge = bridgeData.bridge;
    milestone.toolConsumerInstanceGuid = bridgeData.toolConsumerInstanceGuid;
    milestone.contextId = bridgeData.contextId;
    milestone.resourceLinkId = bridgeData.resourceLinkId;

    milestone.activityHash = options.activityHash;
    milestone.expiresAt = options.expiresAt;

    if (!milestone.windowStartedAt) {
        milestone.windowStartedAt = now;
    }

    /*
     * observedAt is the time this score was actually observed. When we collapse
     * noisy updates inside a five-minute window, we keep one row and move its
     * observedAt forward to the latest improved score in that window.
     * windowStartedAt stays fixed so continuous work eventually starts a new
     * milestone bucket.
     */
    milestone.observedAt = now;
}

exports.record = function recordProgressMilestone(options, callback) {
    var pointsEarned = numberOrUndefined(options.pointsEarned);
    var pointsPossible = positiveNumber(options.pointsPossible);
    var score = normalizedScore(pointsEarned, pointsPossible);
    var bridge = options.bridge;
    var bridgeData = bridgeFields(bridge);
    var now = options.observedAt || new Date();
    var query;

    callback = callback || function() {};

    if (!options.user || !options.repository || !options.path) {
        callback(null);
        return;
    }

    if (score === undefined) {
        callback(null);
        return;
    }

    query = {
        user: options.user,
        repository: options.repository,
        path: options.path,
        source: {
            $nin: [
                gradeBoundaryPolicy.DUE_SOURCE,
                gradeBoundaryPolicy.UNTIL_SOURCE
            ]
        }
    };

    if (bridge && bridge.contextId) {
        query.contextId = bridge.contextId;
    }

    if (bridge && bridge.resourceLinkId) {
        query.resourceLinkId = bridge.resourceLinkId;
    }

    mdb.ProgressMilestone.findOne(query)
        .sort({ observedAt: -1 })
        .exec()
        .then(function(previous) {
            var milestone;

            if (!scoreImproved(previous, score)) {
                callback(null);
                return;
            }

            if (shouldStartNewMilestone(previous, now)) {
                milestone = new mdb.ProgressMilestone();
            } else {
                milestone = previous;
            }

            applyMilestoneValues(
                milestone,
                options,
                pointsEarned,
                pointsPossible,
                score,
                bridgeData,
                now
            );

            milestone
                .save()
                .then(function() {
                    callback(null);
                })
                .catch(function(err) {
                    callback(err);
                });
        })
        .catch(function(err) {
            callback(err);
        });
};


function boundaryKey(bridge, type, boundaryAt) {
    return [
        bridge._id.toString(),
        type,
        new Date(boundaryAt).toISOString()
    ].join(':');
}

function boundaryDocument(bridge, type, boundaryAt, observation, evidence) {
    var source = gradeBoundaryPolicy.boundarySource(type);
    var document = {
        user: bridge.user,
        repository: bridge.repository,
        path: bridge.path,
        canvasPointsPossible: numberOrUndefined(bridge.pointsPossible),
        source: source,
        boundaryKey: boundaryKey(bridge, type, boundaryAt),
        boundaryAt: new Date(boundaryAt),
        boundaryEvidence: evidence,
        bridge: bridge._id,
        toolConsumerInstanceGuid: bridge.toolConsumerInstanceGuid,
        contextId: bridge.contextId,
        resourceLinkId: bridge.resourceLinkId
    };

    if (observation) {
        document.score = observation.resultScore;
        document.canvasScore = observation.resultTotalScore;
        document.observedAt = new Date(observation.observedAt);
        document.qualifyingObservedAt = new Date(observation.observedAt);
        document.windowStartedAt = new Date(observation.observedAt);

        if (observation.pointsEarned !== null) {
            document.pointsEarned = observation.pointsEarned;
        }

        if (observation.pointsPossible !== null) {
            document.pointsPossible = observation.pointsPossible;
        }
    } else {
        /*
         * An inferred zero means Xronos has no trusted score observation at or
         * before the boundary. It is useful instructor-facing grade evidence,
         * but qualifyingObservedAt remains absent so it cannot masquerade as a
         * recorded student submission time.
         */
        document.score = 0;
        document.canvasScore = 0;
        document.pointsEarned = 0;
        document.observedAt = new Date(boundaryAt);
        document.windowStartedAt = new Date(boundaryAt);
    }

    return document;
}

function findExistingBoundary(bridge, type, boundaryAt) {
    return mdb.ProgressMilestone.findOne({
        boundaryKey: boundaryKey(bridge, type, boundaryAt)
    })
        .lean()
        .exec();
}

function createBoundarySnapshot(bridge, type, boundaryAt, observation, evidence, callback) {
    var document = boundaryDocument(
        bridge,
        type,
        boundaryAt,
        observation,
        evidence
    );

    mdb.ProgressMilestone.findOneAndUpdate(
        {
            boundaryKey: document.boundaryKey
        },
        {
            $setOnInsert: document
        },
        {
            upsert: true,
            new: true
        }
    )
        .lean()
        .exec()
        .then(function(saved) {
            callback(null, saved);
        })
        .catch(function(err) {
            if (err && err.code === 11000) {
                findExistingBoundary(
                    bridge,
                    type,
                    boundaryAt
                )
                    .then(function(existing) {
                        callback(null, existing);
                    })
                    .catch(callback);
                return;
            }

            callback(err);
        });
}

/*
 * Finalize a boundary only after it has passed. If Xronos knew the Canvas date
 * before the boundary, a trusted bridge observation can produce an
 * authoritative snapshot. If the student first appears after the boundary and
 * there is no earlier observation, record the instructor-facing inferred zero.
 *
 * A date moved retroactively into the past while earlier progress exists is
 * deliberately not converted into an authoritative snapshot. The audit route
 * reconstructs that case from ordinary milestone history and labels it
 * approximate.
 */
exports.ensureBoundary = function ensureBoundary(bridge, type, now, callback) {
    var descriptor = gradeBoundaryPolicy.boundaryDescriptor(bridge, type);
    var nowTime = new Date(now || new Date()).getTime();

    callback = callback || function() {};

    if (!descriptor) {
        callback(null, null, 'no-boundary');
        return;
    }

    if (descriptor.boundaryAt.getTime() > nowTime) {
        callback(null, null, 'boundary-not-reached');
        return;
    }

    findExistingBoundary(
        bridge,
        type,
        descriptor.boundaryAt
    )
        .then(function(existing) {
            if (existing) {
                callback(null, existing, 'existing');
                return;
            }

            var observation =
                gradeBoundaryPolicy.bestObservationAtOrBefore(
                    bridge,
                    descriptor.boundaryAt
                );

            if (observation && !descriptor.knownBeforeBoundary) {
                callback(
                    null,
                    null,
                    'retroactive-boundary-requires-reconstruction'
                );
                return;
            }

            createBoundarySnapshot(
                bridge,
                type,
                descriptor.boundaryAt,
                observation,
                observation
                    ? 'authoritative'
                    : 'inferred-zero-no-prior-observation',
                function(err, saved) {
                    callback(
                        err,
                        saved,
                        observation
                            ? 'created-authoritative'
                            : 'created-inferred-zero'
                    );
                }
            );
        })
        .catch(callback);
};

exports.findBoundary = function findBoundary(bridge, type, boundaryAt, callback) {
    callback = callback || function() {};

    findExistingBoundary(bridge, type, boundaryAt)
        .then(function(document) {
            callback(null, document);
        })
        .catch(callback);
};

exports.MIN_MILESTONE_INTERVAL_MS = MIN_MILESTONE_INTERVAL_MS;
