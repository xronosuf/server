"use strict";

function callMatchesEntry(traceEntry, entry) {
    return !!(
        traceEntry &&
        entry &&
        traceEntry.expression === entry.expression &&
        traceEntry.latexify === entry.latexify
    );
}

function uniqueReplayEntry(expressionEntries, traceEntry) {
    var matches = expressionEntries.filter(function(entry) {
        return callMatchesEntry(traceEntry, entry);
    });

    if (matches.length === 1) {
        return matches[0];
    }

    var answerKeyMatches = matches.filter(function(entry) {
        return entry.consumer === "answer-key";
    });

    if (answerKeyMatches.length === 1) {
        return answerKeyMatches[0];
    }

    /*
     * Completed math answers replace their answer-key TeX with static
     * submitted-answer text while display-side Sage in the same original
     * equation can remain and be reprocessed. If that Sage expression is
     * duplicated elsewhere, immutable scriptIndex provenance identifies the
     * original equation only when exactly one matching display entry shares
     * its source script with an answer-key entry.
     *
     * Ambiguity remains a canonical invariant failure.
     */
    var completedAnswerDisplayMatches =
        matches.filter(function(entry) {
            if (
                entry.consumer !== "display" ||
                typeof entry.scriptIndex !== "number"
            ) {
                return false;
            }

            return expressionEntries.some(function(candidate) {
                return (
                    candidate &&
                    candidate.consumer === "answer-key" &&
                    candidate.scriptIndex === entry.scriptIndex
                );
            });
        });

    return completedAnswerDisplayMatches.length === 1
        ? completedAnswerDisplayMatches[0]
        : null;
}

module.exports = {
    uniqueReplayEntry: uniqueReplayEntry
};
