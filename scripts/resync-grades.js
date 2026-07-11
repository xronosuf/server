"use strict";

/*
 * Bulk Canvas grade resynchronization tool.
 *
 * Dry run by default. Use --execute to update LtiBridge records and queue
 * them through Xronos's existing Redis gradebook worker.
 */

var mdb = require("../mdb");
var mongo = require("mongodb");
var Redis = require("ioredis");
var config = require("../config");

var DEFAULT_WEEKS = 18;
var DEFAULT_DELAY_SECONDS = 10;
var DEFAULT_PREVIEW_ROWS = 25;

function usage() {
    console.log([
        "",
        "Usage:",
        "  node scripts/resync-grades.js [options]",
        "",
        "Options:",
        "  --execute                 Update bridges and queue Canvas passbacks.",
        "  --dry-run                 Preview only; this is the default.",
        "  --course NAME             Restrict to one repository/course.",
        "  --repo NAME               Alias for --course.",
        "  --context ID              Restrict to one Canvas/LTI context.",
        "  -repo NAME                Alias for --repo.",
        "  -r NAME                   Alias for --repo.",
        "  --weeks NUMBER            Bridge/milestone window; default 18.",
        "  --delay NUMBER            Queue spacing in seconds; default 10.",
        "  --limit NUMBER            Limit candidates, useful for testing.",
        "  --help                     Show this help.",
        "",
        "Examples:",
        "  ./resyncGrades.sh",
        "  ./resyncGrades.sh --course mac2233limits",
        "  ./resyncGrades.sh --course mac2233limits --execute",
        "  ./resyncGrades.sh --context CONTEXT_ID",
        "  ./resyncGrades.sh --course mac2233limits --context CONTEXT_ID --execute",
        "  ./resyncGrades.sh --weeks 18 --delay 10 --execute",
        ""
    ].join("\n"));
}

function parsePositiveNumber(value, optionName) {
    var number = Number(value);

    if (!isFinite(number) || number <= 0) {
        throw new Error(optionName + " must be a positive number.");
    }

    return number;
}

function parseArguments(argv) {
    var options = {
        execute: false,
        repository: null,
        contextId: null,
        weeks: DEFAULT_WEEKS,
        delaySeconds: DEFAULT_DELAY_SECONDS,
        limit: null
    };

    for (var index = 0; index < argv.length; index += 1) {
        var argument = argv[index];

        if (argument === "--execute") {
            options.execute = true;
        } else if (argument === "--dry-run") {
            options.execute = false;
        } else if (
            argument === "--repo" ||
            argument === "--course" ||
            argument === "-repo" ||
            argument === "-r"
        ) {
            index += 1;

            if (index >= argv.length) {
                throw new Error(argument + " requires a repository name.");
            }

            options.repository = String(argv[index]).toLowerCase();

            if (!/^[a-z0-9._-]+$/.test(options.repository)) {
                throw new Error(
                    "Repository names may contain only letters, numbers, ., _, and -."
                );
            }
        } else if (argument === "--context") {
            index += 1;

            if (index >= argv.length) {
                throw new Error("--context requires a Canvas/LTI context ID.");
            }

            options.contextId = String(argv[index]).trim();

            if (!options.contextId) {
                throw new Error("--context cannot be empty.");
            }
        } else if (argument === "--weeks") {
            index += 1;

            if (index >= argv.length) {
                throw new Error("--weeks requires a value.");
            }

            options.weeks = parsePositiveNumber(argv[index], "--weeks");
        } else if (argument === "--delay") {
            index += 1;

            if (index >= argv.length) {
                throw new Error("--delay requires a value.");
            }

            options.delaySeconds = parsePositiveNumber(argv[index], "--delay");
        } else if (argument === "--limit") {
            index += 1;

            if (index >= argv.length) {
                throw new Error("--limit requires a value.");
            }

            options.limit = Math.floor(
                parsePositiveNumber(argv[index], "--limit")
            );
        } else if (argument === "--help" || argument === "-h") {
            usage();
            process.exit(0);
        } else {
            throw new Error("Unknown argument: " + argument);
        }
    }

    return options;
}

function finiteNumber(value) {
    var number = Number(value);
    return isFinite(number) ? number : null;
}

function objectIdCreatedAt(id) {
    if (id && typeof id.getTimestamp === "function") {
        return id.getTimestamp();
    }

    return null;
}

function bridgeHasPassbackFields(bridge) {
    var pointsPossible = finiteNumber(bridge.pointsPossible);

    return !!(
        bridge &&
        bridge.lisResultSourcedid &&
        bridge.lisOutcomeServiceUrl &&
        bridge.oauthConsumerKey &&
        pointsPossible !== null &&
        pointsPossible > 0
    );
}

function saveBridge(bridge) {
    return new Promise(function(resolve, reject) {
        bridge.save(function(error) {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
}

function redisZadd(client, score, member) {
    return client.zadd("gradebook", score, member);
}

function redisQuit(client) {
    return client.quit();
}

function disconnectMongo() {
    return new Promise(function(resolve) {
        if (!mdb.mongoose || !mdb.mongoose.connection) {
            resolve();
            return;
        }

        mdb.mongoose.disconnect(function() {
            resolve();
        });
    });
}

function summarizeByRepository(rows) {
    var counts = {};

    rows.forEach(function(row) {
        var repository = row.bridge.repository || "<missing>";
        counts[repository] = (counts[repository] || 0) + 1;
    });

    return Object.keys(counts)
        .sort()
        .map(function(repository) {
            return {
                repository: repository,
                count: counts[repository]
            };
        });
}

async function main() {
    var options = parseArguments(process.argv.slice(2));
    var now = new Date();
    var cutoff = new Date(
        now.getTime() - options.weeks * 7 * 24 * 60 * 60 * 1000
    );
    var cutoffObjectId = mongo.ObjectID.createFromTime(
        Math.floor(cutoff.getTime() / 1000)
    );

    console.log("Xronos grade resynchronization");
    console.log("==============================");
    console.log("Mode:               " + (options.execute ? "EXECUTE" : "DRY RUN"));
    console.log("Window:             " + options.weeks + " weeks");
    console.log("Cutoff:             " + cutoff.toISOString());
    console.log("Repository:         " + (options.repository || "all repositories"));
    console.log("Canvas context:     " + (options.contextId || "all contexts"));
    console.log("Queue spacing:      " + options.delaySeconds + " seconds");
    console.log(
        "Candidate limit:    " +
        (options.limit === null ? "none" : options.limit)
    );
    console.log("");

    await new Promise(function(resolve, reject) {
        mdb.initialize(function(error) {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });

    /*
     * First find the highest milestone for each exact bridge in the requested
     * observation window. Ties go to the most recently observed milestone.
     */
    var milestoneMatch = {
        bridge: { $ne: null },
        observedAt: { $gte: cutoff },
        canvasScore: { $ne: null },
        canvasPointsPossible: { $gt: 0 }
    };

    if (options.repository) {
        milestoneMatch.repository = options.repository;
    }

    if (options.contextId) {
        milestoneMatch.contextId = options.contextId;
    }

    var pipeline = [
        { $match: milestoneMatch },
        {
            $sort: {
                bridge: 1,
                score: -1,
                observedAt: -1
            }
        },
        {
            $group: {
                _id: "$bridge",
                milestone: { $first: "$$ROOT" }
            }
        }
    ];

    var milestoneGroups = await mdb.ProgressMilestone
        .aggregate(pipeline)
        .exec();

    var milestoneByBridge = {};
    var bridgeIds = [];

    milestoneGroups.forEach(function(group) {
        if (!group._id || !group.milestone) {
            return;
        }

        var bridgeId = String(group._id);
        milestoneByBridge[bridgeId] = group.milestone;
        bridgeIds.push(group._id);
    });

    if (bridgeIds.length === 0) {
        console.log("No qualifying milestones were found.");
        await disconnectMongo();
        return;
    }

    var bridgeQuery = {
        _id: {
            $in: bridgeIds,
            $gte: cutoffObjectId
        }
    };

    if (options.repository) {
        bridgeQuery.repository = options.repository;
    }

    if (options.contextId) {
        bridgeQuery.contextId = options.contextId;
    }

    var bridges = await mdb.LtiBridge
        .find(bridgeQuery)
        .sort({ repository: 1, path: 1, _id: 1 })
        .exec();

    var ready = [];
    var skipped = {
        instructionalStaff: 0,
        missingMilestone: 0,
        invalidMilestone: 0,
        missingPassbackFields: 0,
        currentScoreHigher: 0,
        pointsMismatch: 0
    };

    bridges.forEach(function(bridge) {
        var bridgeId = String(bridge._id);
        var milestone = milestoneByBridge[bridgeId];

        if (bridge.instructionalStaff) {
            skipped.instructionalStaff += 1;
            return;
        }

        if (!milestone) {
            skipped.missingMilestone += 1;
            return;
        }

        if (!bridgeHasPassbackFields(bridge)) {
            skipped.missingPassbackFields += 1;
            return;
        }

        var normalizedMilestoneScore = finiteNumber(milestone.score);
        var milestoneCanvasScore = finiteNumber(milestone.canvasScore);
        var milestoneCanvasPointsPossible =
            finiteNumber(milestone.canvasPointsPossible);
        var bridgePointsPossible = finiteNumber(bridge.pointsPossible);
        var currentBridgeScore = finiteNumber(bridge.resultScore);
        var currentBridgeTotalScore =
            finiteNumber(bridge.resultTotalScore);
        var roundedNormalizedScore;
        var roundedCanvasScore;

        if (
            normalizedMilestoneScore === null ||
            milestoneCanvasScore === null ||
            milestoneCanvasPointsPossible === null ||
            milestoneCanvasPointsPossible <= 0 ||
            normalizedMilestoneScore < 0 ||
            normalizedMilestoneScore > 1 ||
            milestoneCanvasScore < 0
        ) {
            skipped.invalidMilestone += 1;
            return;
        }

        /*
         * Reproduce the exact rounding used by routes/gradebook.js.
         * Xronos rounds both normalized and Canvas-point scores upward
         * to two decimal places before saving an LTI bridge.
         */
        roundedNormalizedScore =
            Math.ceil(100 * normalizedMilestoneScore) / 100.0;
        roundedCanvasScore =
            Math.ceil(
                100 *
                normalizedMilestoneScore *
                milestoneCanvasPointsPossible
            ) / 100.0;

        /*
         * A mismatched Canvas point total usually means the assignment setup
         * changed. Do not guess in a bulk recovery operation.
         */
        if (
            bridgePointsPossible !== null &&
            Math.abs(
                bridgePointsPossible - milestoneCanvasPointsPossible
            ) > 0.000001
        ) {
            skipped.pointsMismatch += 1;
            return;
        }

        /*
         * Never lower the bridge's currently recorded score. This protects
         * bridges whose highest work predates milestone collection.
         */
        if (
            (
                currentBridgeScore !== null &&
                currentBridgeScore >
                    roundedNormalizedScore + 0.000001
            ) ||
            (
                currentBridgeTotalScore !== null &&
                currentBridgeTotalScore >
                    roundedCanvasScore + 0.000001
            )
        ) {
            skipped.currentScoreHigher += 1;
            return;
        }

        ready.push({
            bridge: bridge,
            milestone: milestone,
            normalizedScore: roundedNormalizedScore,
            canvasScore: roundedCanvasScore,
            rawNormalizedScore: normalizedMilestoneScore,
            rawCanvasScore: milestoneCanvasScore,
            canvasPointsPossible: milestoneCanvasPointsPossible,
            bridgeCreatedAt: objectIdCreatedAt(bridge._id)
        });
    });

    if (options.limit !== null) {
        ready = ready.slice(0, options.limit);
    }

    console.log("Milestone bridge groups: " + milestoneGroups.length);
    console.log("Recent matching bridges: " + bridges.length);
    console.log("Ready to queue:          " + ready.length);
    console.log("");
    console.log("Skipped:");
    console.log("  Instructional staff:       " + skipped.instructionalStaff);
    console.log("  Missing milestone:          " + skipped.missingMilestone);
    console.log("  Invalid milestone score:    " + skipped.invalidMilestone);
    console.log("  Missing Canvas fields:      " + skipped.missingPassbackFields);
    console.log("  Current score is higher:    " + skipped.currentScoreHigher);
    console.log("  Canvas points mismatch:     " + skipped.pointsMismatch);
    console.log("");

    var repositorySummary = summarizeByRepository(ready);

    console.log("Ready by repository:");

    repositorySummary.forEach(function(row) {
        console.log(
            "  " +
            row.repository +
            ": " +
            row.count
        );
    });

    if (repositorySummary.length === 0) {
        console.log("  none");
    }

    console.log("");
    console.log(
        "Previewing first " +
        Math.min(DEFAULT_PREVIEW_ROWS, ready.length) +
        " candidate(s):"
    );

    ready.slice(0, DEFAULT_PREVIEW_ROWS).forEach(function(row, index) {
        console.log(
            [
                String(index + 1) + ".",
                String(row.bridge._id),
                row.bridge.repository + "/" + row.bridge.path,
                "normalized=" + row.normalizedScore,
                "canvas=" + row.canvasScore + "/" + row.canvasPointsPossible,
                "raw=" + row.rawNormalizedScore +
                    " (" + row.rawCanvasScore + " Canvas points)",
                "milestone=" +
                    new Date(row.milestone.observedAt).toISOString(),
                "bridge-created=" +
                    (
                        row.bridgeCreatedAt
                            ? row.bridgeCreatedAt.toISOString()
                            : "<unknown>"
                    )
            ].join(" ")
        );
    });

    console.log("");

    if (!options.execute) {
        console.log("DRY RUN ONLY: no bridges were changed and nothing was queued.");
        console.log("Run again with --execute after reviewing this preview.");
        await disconnectMongo();
        return;
    }

    if (ready.length === 0) {
        console.log("Nothing to queue.");
        await disconnectMongo();
        return;
    }

    var redisClient = new Redis();
    var firstQueueTime = Date.now() + 5000;
    var queued = 0;
    var failed = 0;

    console.log("Updating bridges and creating the queue...");

    for (var readyIndex = 0; readyIndex < ready.length; readyIndex += 1) {
        var candidate = ready[readyIndex];
        var queueTime =
            firstQueueTime +
            readyIndex * options.delaySeconds * 1000;

        try {
            candidate.bridge.resultScore =
                candidate.normalizedScore;
            candidate.bridge.resultTotalScore =
                candidate.canvasScore;
            candidate.bridge.submittedScore = false;

            await saveBridge(candidate.bridge);
            await redisZadd(
                redisClient,
                queueTime,
                String(candidate.bridge._id)
            );

            queued += 1;

            if (
                queued <= DEFAULT_PREVIEW_ROWS ||
                queued % 100 === 0 ||
                queued === ready.length
            ) {
                console.log(
                    "Queued " +
                    queued +
                    "/" +
                    ready.length +
                    ": " +
                    candidate.bridge._id +
                    " " +
                    candidate.bridge.repository +
                    "/" +
                    candidate.bridge.path +
                    " " +
                    "normalized=" +
                    candidate.normalizedScore +
                    " canvas=" +
                    candidate.canvasScore +
                    "/" +
                    candidate.canvasPointsPossible +
                    " due " +
                    new Date(queueTime).toISOString()
                );
            }
        } catch (error) {
            failed += 1;
            console.error(
                "FAILED bridge " +
                candidate.bridge._id +
                ": " +
                (error && error.stack ? error.stack : error)
            );
        }
    }

    await redisQuit(redisClient);
    await disconnectMongo();

    console.log("");
    console.log("Queue creation complete.");
    console.log("Queued successfully: " + queued);
    console.log("Failed to queue:      " + failed);

    if (queued > 0) {
        var finalQueueTime =
            firstQueueTime +
            (queued - 1) * options.delaySeconds * 1000;

        console.log(
            "First scheduled item: " +
            new Date(firstQueueTime).toISOString()
        );
        console.log(
            "Last scheduled item:  " +
            new Date(finalQueueTime).toISOString()
        );
        console.log("");
        console.log(
            "The running Xronos gradebook worker will perform the actual Canvas requests."
        );
    }

    if (failed > 0) {
        process.exitCode = 2;
    }
}

main().catch(async function(error) {
    console.error(
        error && error.stack ? error.stack : error
    );

    await disconnectMongo();
    process.exit(1);
});
