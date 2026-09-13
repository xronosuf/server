"use strict";

/*
 * Reset disposable Xronos data for one learner identity.
 *
 * Dry-run by default. The default target is the single user whose name or
 * displayName is exactly "Test Student" (case-insensitive). Use --user with a
 * Mongo ObjectId to target a different learner. Non-default targets require
 * both --confirm-non-test and --execute before any mutation occurs.
 *
 * The User document itself is preserved. This intentionally removes only the
 * disposable state surrounding that identity so a later LTI launch can reuse
 * the same Xronos user and recreate clean bridge state.
 *
 * Canvas late-policy observations are context-wide evidence, not ordinary
 * per-student state. They are preserved by default even when their originating
 * bridge belongs to the reset learner. Use --purge-policy-evidence only when
 * intentionally erasing those experimental observations as well.
 */

var mdb = require("../mdb");
var Redis = require("ioredis");
var config = require("../config");

var TEST_STUDENT_NAME = "Test Student";

function usage() {
    console.log([
        "",
        "Usage:",
        "  node scripts/reset-student-data.js [options]",
        "",
        "Options:",
        "  --execute                 Perform the reset. Dry-run is the default.",
        "  --dry-run                 Preview only; this is the default.",
        "  --user OBJECT_ID          Reset this Xronos User ObjectId instead of Test Student.",
        "  --confirm-non-test        Required with --execute when --user is supplied.",
        "  --purge-policy-evidence   Also delete late-policy observations from removed bridges.",
        "  --help                    Show this help.",
        "",
        "Examples:",
        "  node scripts/reset-student-data.js",
        "  node scripts/reset-student-data.js --execute",
        "  node scripts/reset-student-data.js --execute --purge-policy-evidence",
        "  node scripts/reset-student-data.js --user 0123456789abcdef01234567",
        "  node scripts/reset-student-data.js --user 0123456789abcdef01234567 --confirm-non-test --execute",
        ""
    ].join("\n"));
}

function parseArguments(argv) {
    var options = {
        execute: false,
        userId: null,
        confirmNonTest: false,
        purgePolicyEvidence: false
    };

    for (var index = 0; index < argv.length; index += 1) {
        var argument = argv[index];

        if (argument === "--execute") {
            options.execute = true;
        } else if (argument === "--dry-run") {
            options.execute = false;
        } else if (argument === "--user") {
            index += 1;
            if (index >= argv.length) {
                throw new Error("--user requires a Mongo ObjectId.");
            }
            options.userId = String(argv[index]).trim();
            if (!/^[0-9a-fA-F]{24}$/.test(options.userId)) {
                throw new Error("--user must be a 24-character Mongo ObjectId.");
            }
        } else if (argument === "--confirm-non-test") {
            options.confirmNonTest = true;
        } else if (argument === "--purge-policy-evidence") {
            options.purgePolicyEvidence = true;
        } else if (argument === "--help" || argument === "-h") {
            usage();
            process.exit(0);
        } else {
            throw new Error("Unknown argument: " + argument);
        }
    }

    if (options.execute && options.userId && !options.confirmNonTest) {
        throw new Error(
            "Refusing non-default reset: --execute with --user also requires --confirm-non-test."
        );
    }

    return options;
}

function initializeMongo() {
    return new Promise(function(resolve, reject) {
        mdb.initialize(function(error) {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}

function disconnectMongo() {
    return mdb.mongoose.disconnect();
}

async function resolveUser(options) {
    if (options.userId) {
        return mdb.User.findOne({
            _id: new mdb.ObjectId(options.userId)
        }).lean().exec();
    }

    var expression = new RegExp("^" + TEST_STUDENT_NAME + "$", "i");
    var matches = await mdb.User.find({
        $or: [
            {name: expression},
            {displayName: expression}
        ]
    }).sort({_id: 1}).lean().exec();

    if (matches.length === 0) {
        throw new Error(
            "Could not find a Xronos user named exactly \"" +
            TEST_STUDENT_NAME +
            "\". Use --user OBJECT_ID to select explicitly."
        );
    }

    if (matches.length > 1) {
        console.error("Ambiguous Test Student matches:");
        matches.forEach(function(user) {
            console.error(
                "  " + user._id +
                " name=" + JSON.stringify(user.name || null) +
                " displayName=" + JSON.stringify(user.displayName || null) +
                " ltiUserId=" + JSON.stringify(user.ltiUserId || null)
            );
        });
        throw new Error(
            "Multiple Test Student users exist. Re-run with --user OBJECT_ID."
        );
    }

    return matches[0];
}

async function gatherPlan(user) {
    var userId = user._id;
    var bridges = await mdb.LtiBridge.find({user: userId})
        .sort({repository: 1, path: 1, _id: 1})
        .lean()
        .exec();
    var bridgeIds = bridges.map(function(bridge) {
        return bridge._id;
    });

    var observationQuery = bridgeIds.length
        ? {bridge: {$in: bridgeIds}}
        : {_id: {$in: []}};

    var counts = await Promise.all([
        mdb.State.countDocuments({user: userId}).exec(),
        mdb.Completion.countDocuments({user: userId}).exec(),
        mdb.ProgressMilestone.countDocuments({user: userId}).exec(),
        mdb.AuditToken.countDocuments({user: userId}).exec(),
        mdb.LateGradePolicyObservation.countDocuments(observationQuery).exec()
    ]);

    return {
        user: user,
        bridges: bridges,
        bridgeIds: bridgeIds,
        observationQuery: observationQuery,
        counts: {
            states: counts[0],
            completions: counts[1],
            progressMilestones: counts[2],
            auditTokens: counts[3],
            latePolicyObservations: counts[4],
            ltiBridges: bridges.length
        }
    };
}

function printPlan(plan, options) {
    var user = plan.user;
    var counts = plan.counts;

    console.log("Xronos student data reset");
    console.log("=========================");
    console.log("Mode:              " + (options.execute ? "EXECUTE" : "DRY RUN"));
    console.log("Target selection:  " + (options.userId ? "explicit --user" : "default Test Student"));
    console.log("User ObjectId:     " + user._id);
    console.log("Name:              " + (user.name || "<none>"));
    console.log("Display name:      " + (user.displayName || "<none>"));
    console.log("LTI user id:       " + (user.ltiUserId || "<none>"));
    console.log("");
    console.log("Disposable records:");
    console.log("  State:                     " + counts.states);
    console.log("  Completion:                " + counts.completions);
    console.log("  ProgressMilestone:         " + counts.progressMilestones);
    console.log("  AuditToken:                " + counts.auditTokens);
    console.log("  LtiBridge:                 " + counts.ltiBridges);
    console.log("  LateGradePolicyObservation:" + " " + counts.latePolicyObservations +
        (options.purgePolicyEvidence ? " (WILL DELETE)" : " (PRESERVED)"));
    console.log("");

    if (plan.bridges.length) {
        console.log("Bridges to remove / dequeue:");
        plan.bridges.forEach(function(bridge) {
            console.log(
                "  " + bridge._id +
                " " + (bridge.repository || "<repo>") +
                "/" + (bridge.path || "<path>") +
                " context=" + (bridge.contextId || "<none>")
            );
        });
        console.log("");
    }

    console.log("User document: PRESERVED");
}

async function removeQueuedBridges(bridgeIds) {
    if (!bridgeIds.length) {
        return 0;
    }

    var client = new Redis({
        host: config.redis.url,
        port: config.redis.port
    });

    try {
        var stringIds = bridgeIds.map(function(id) {
            return String(id);
        });
        return await client.zrem.apply(client, ["gradebook"].concat(stringIds));
    } finally {
        await client.quit();
    }
}

async function executePlan(plan, options) {
    var userId = plan.user._id;
    var bridgeIds = plan.bridgeIds;

    /*
     * Remove queued passback work first so a bridge cannot be processed while
     * its Mongo records are being removed. The gradebook worker ignores absent
     * queue members after zrem.
     */
    var dequeued = await removeQueuedBridges(bridgeIds);

    var results = {};
    results.latePolicyObservations = 0;
    if (options.purgePolicyEvidence) {
        results.latePolicyObservations =
            (await mdb.LateGradePolicyObservation.deleteMany(plan.observationQuery).exec()).deletedCount || 0;
    }
    results.auditTokens =
        (await mdb.AuditToken.deleteMany({user: userId}).exec()).deletedCount || 0;
    results.progressMilestones =
        (await mdb.ProgressMilestone.deleteMany({user: userId}).exec()).deletedCount || 0;
    results.completions =
        (await mdb.Completion.deleteMany({user: userId}).exec()).deletedCount || 0;
    results.states =
        (await mdb.State.deleteMany({user: userId}).exec()).deletedCount || 0;
    results.ltiBridges =
        (await mdb.LtiBridge.deleteMany({user: userId}).exec()).deletedCount || 0;
    results.redisGradebookMembers = dequeued;

    return results;
}

function printResults(results, options) {
    console.log("");
    console.log("Deleted / dequeued:");
    console.log("  State:                     " + results.states);
    console.log("  Completion:                " + results.completions);
    console.log("  ProgressMilestone:         " + results.progressMilestones);
    console.log("  AuditToken:                " + results.auditTokens);
    console.log("  LtiBridge:                 " + results.ltiBridges);
    console.log("  LateGradePolicyObservation:" + " " + results.latePolicyObservations +
        (options.purgePolicyEvidence ? " deleted" : " deleted (preserved by policy)"));
    console.log("  Redis gradebook members:   " + results.redisGradebookMembers);
}

async function main() {
    var options = parseArguments(process.argv.slice(2));

    await initializeMongo();

    try {
        var user = await resolveUser(options);
        if (!user) {
            throw new Error("Selected user does not exist.");
        }

        var plan = await gatherPlan(user);
        printPlan(plan, options);

        if (!options.execute) {
            console.log("");
            console.log("DRY RUN ONLY: no MongoDB or Redis records were changed.");
            console.log("Run again with --execute after reviewing the target and counts.");
            return;
        }

        console.log("");
        console.log("Executing reset...");
        var results = await executePlan(plan, options);
        printResults(results, options);
        console.log("");
        console.log("RESET COMPLETE; USER IDENTITY PRESERVED");
    } finally {
        await disconnectMongo();
    }
}

if (require.main === module) {
    main().catch(function(error) {
        console.error("ERROR: " + (error && error.message ? error.message : error));
        process.exitCode = 1;
    });
}

exports.parseArguments = parseArguments;
