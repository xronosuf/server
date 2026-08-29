var mdb = require('../mdb');

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
        path: options.path
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
