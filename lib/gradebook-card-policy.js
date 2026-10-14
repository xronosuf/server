"use strict";

function finiteNumber(value) {
    var number = Number(value);
    return isFinite(number) ? number : null;
}

function identity(card, index) {
    var repositoryName = card && card.repositoryName;
    var activityPath = card && card.activityPath;

    if (repositoryName && activityPath) {
        return String(repositoryName) + "/" + String(activityPath);
    }

    return "__unkeyed__/" + String(index);
}

function aggregate(cards) {
    var byIdentity = {};
    var order = [];
    var duplicateKeys = [];
    var weightConflicts = [];
    var weightedCardCount = 0;

    (cards || []).forEach(function(card, index) {
        var weight = finiteNumber(card && card.weight);
        var completion = finiteNumber(card && card.completion);
        var key;
        var existing;

        if (weight === null) {
            return;
        }

        weightedCardCount += 1;
        key = identity(card, index);
        existing = byIdentity[key];

        if (!existing) {
            byIdentity[key] = {
                key: key,
                repositoryName: card && card.repositoryName || null,
                activityPath: card && card.activityPath || null,
                weight: weight,
                completion: completion,
                occurrences: 1
            };
            order.push(key);
            return;
        }

        existing.occurrences += 1;

        if (duplicateKeys.indexOf(key) === -1) {
            duplicateKeys.push(key);
        }

        if (existing.weight !== weight && weightConflicts.indexOf(key) === -1) {
            weightConflicts.push(key);
        }

        /*
         * Duplicate DOM representations of one activity must never earn the
         * activity twice. Preserve the most favorable valid completion because
         * activity completion is historical maximum credit.
         */
        if (
            completion !== null &&
            (existing.completion === null || completion > existing.completion)
        ) {
            existing.completion = completion;
        }
    });

    var contributions = order.map(function(key) {
        return byIdentity[key];
    });
    var pointsEarned = 0;
    var pointsPossibleFromCards = 0;

    contributions.forEach(function(card) {
        if (card.weight > 0) {
            pointsPossibleFromCards += card.weight;
        }

        if (card.completion !== null) {
            pointsEarned += card.weight * card.completion;
        }
    });

    return {
        pointsEarned: pointsEarned,
        pointsPossibleFromCards: pointsPossibleFromCards,
        domCardCount: (cards || []).length,
        weightedCardCount: weightedCardCount,
        uniqueActivityCount: contributions.length,
        duplicateActivityCount: duplicateKeys.length,
        duplicateKeys: duplicateKeys,
        weightConflictKeys: weightConflicts,
        contributions: contributions
    };
}

exports.aggregate = aggregate;
