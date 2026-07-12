#!/usr/bin/env node
"use strict";

/*
 * Read-only Xronos repository activity census.
 *
 * This utility examines Git repository metadata and Snappy-framed xAPI
 * learning-record-store files. It never edits, moves, archives, truncates,
 * or deletes repository data.
 */

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var childProcess = require("child_process");
var snappy = require("snappy");
var crc32 = require("fast-crc32c");
var uint32 = require("uint32");
var config = require("../config");

var ANSWERED_VERB =
    "http://adlnet.gov/expapi/verbs/answered";

var ACTIVITY_ID_RE =
    /\/activities\/([0-9a-f]{40})(?:\/|$)/i;

var CALIBRATION_REPOSITORIES = [
    "mac2311keeran",
    "mac2313ufo",
    "mac2233limits",
    "culinarypractice",
    "gittester",
    "testingrepo",
    "demoexamples",
    "examples",
    "validatorexamples"
];

function usage() {
    console.log([
        "",
        "Xronos dormant-repository census",
        "",
        "Usage:",
        "  ./findDormantRepositories.sh [options]",
        "",
        "Purpose:",
        "  Produce a read-only activity census that helps a maintainer",
        "  identify repositories that may be dormant. This command never",
        "  moves, archives, truncates, deletes, or otherwise changes a",
        "  repository or its learning-record-store.",
        "",
        "Administrative labels:",
        "  A  Known or strongly presumed active course repository.",
        "  D  Known dormant/dead repository.",
        "  K  Keep regardless of ordinary activity evidence.",
        "  U  Unknown; evaluate using the generated census.",
        "",
        "  A K label always suppresses retirement recommendations.",
        "  A D label is calibration evidence, not permission to delete.",
        "",
        "Options:",
        "  --course NAME            Analyze one repository. May be repeated.",
        "  --repo NAME              Alias for --course.",
        "  --calibration            Analyze the built-in A/D/K calibration set.",
        "  --labels FILE            Administrative label file.",
        "                           Default: repository-activity-labels.tsv",
        "  --years NUMBER           Retained activity window in calendar years.",
        "                           Default: 3.",
        "  --before YYYY-MM-DD      Use an explicit UTC window start instead",
        "                           of --years.",
        "  --statement-limit N      Diagnostic prefix scan: stop after N",
        "                           decoded statements per repository.",
        "                           Partial results are never classified.",
        "                           Default: 0, meaning scan the whole LRS.",
        "  --format FORMAT          table, tsv, or json. Default: table.",
        "  --output FILE            Write the report to FILE instead of stdout.",
        "  --no-git-map             Do not map activity hashes to HTML paths.",
        "  --help, -h               Show this help.",
        "",
        "Examples:",
        "  ./findDormantRepositories.sh --calibration",
        "",
        "  ./findDormantRepositories.sh --course mac2311keeran",
        "",
        "  ./findDormantRepositories.sh --course mac1105summer2019 \\",
        "      --years 3 --format json",
        "",
        "  ./findDormantRepositories.sh --statement-limit 100000 \\",
        "      --format tsv --output repository-census.tsv",
        "",
        "Interpretation cautions:",
        "  * Public content can receive occasional traffic even when unused.",
        "  * A recent Git commit is not required for a currently used course.",
        "  * LTI launches are not required for zero-point direct-link practice.",
        "  * Previously archived LRS data may make retained totals look smaller.",
        "  * Legacy statements may store actor as a 24-character string.",
        "  * Modern statements may store actor as an xAPI Agent object.",
        "  * Append-only growth during a full scan is accepted as a valid",
        "    captured-prefix snapshot when the same file is read completely.",
        "  * Local malformed regions may be skipped only when a later frame",
        "    independently passes decompression, checksum, and JSON checks.",
        "  * Every recovered byte range is reported; recovery never edits LRS.",
        "  * Replacement, shrinkage, unrecovered corruption, or incomplete",
        "    reads are marked unstable or partial and require review.",
        "",
        "The output is evidence for human review. It is not an automated",
        "retirement or deletion decision.",
        ""
    ].join("\n"));
}

function positiveInteger(value, optionName, allowZero) {
    var result = Number(value);

    if (!Number.isInteger(result) ||
        result < (allowZero ? 0 : 1)) {
        throw new Error(
            optionName +
            (allowZero
                ? " must be a nonnegative integer."
                : " must be a positive integer.")
        );
    }

    return result;
}

function parseDate(value, optionName) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error(optionName + " must use YYYY-MM-DD.");
    }

    var result = new Date(value + "T00:00:00.000Z");

    if (isNaN(result.getTime())) {
        throw new Error("Invalid date for " + optionName + ": " + value);
    }

    return result;
}

function calendarYearsAgo(years) {
    var now = new Date();
    var result = new Date(Date.UTC(
        now.getUTCFullYear() - years,
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0,
        0
    ));

    return result;
}

function normalizeRepositoryName(value) {
    var result = String(value).replace(/\.git$/, "");

    if (!/^[A-Za-z0-9._-]+$/.test(result)) {
        throw new Error("Invalid repository name: " + value);
    }

    return result;
}

function parseArguments(argv) {
    var options = {
        courses: [],
        calibration: false,
        labelsFile: path.join(
            process.cwd(),
            "repository-activity-labels.tsv"
        ),
        years: 3,
        before: null,
        statementLimit: 0,
        format: "table",
        output: null,
        gitMap: true
    };

    for (var index = 0; index < argv.length; index += 1) {
        var argument = argv[index];

        if (argument === "--course" ||
            argument === "--repo" ||
            argument === "-r") {
            index += 1;

            if (index >= argv.length) {
                throw new Error(argument + " requires a repository name.");
            }

            options.courses.push(
                normalizeRepositoryName(argv[index])
            );
        } else if (argument === "--calibration") {
            options.calibration = true;
        } else if (argument === "--labels") {
            index += 1;

            if (index >= argv.length) {
                throw new Error("--labels requires a filename.");
            }

            options.labelsFile = path.resolve(argv[index]);
        } else if (argument === "--years") {
            index += 1;

            if (index >= argv.length) {
                throw new Error("--years requires a value.");
            }

            options.years =
                positiveInteger(argv[index], "--years", false);
        } else if (argument === "--before") {
            index += 1;

            if (index >= argv.length) {
                throw new Error("--before requires YYYY-MM-DD.");
            }

            options.before =
                parseDate(argv[index], "--before");
        } else if (argument === "--statement-limit") {
            index += 1;

            if (index >= argv.length) {
                throw new Error(
                    "--statement-limit requires a value."
                );
            }

            options.statementLimit =
                positiveInteger(
                    argv[index],
                    "--statement-limit",
                    true
                );
        } else if (argument === "--format") {
            index += 1;

            if (index >= argv.length) {
                throw new Error("--format requires a value.");
            }

            options.format = argv[index];

            if (!["table", "tsv", "json"].includes(options.format)) {
                throw new Error(
                    "--format must be table, tsv, or json."
                );
            }
        } else if (argument === "--output") {
            index += 1;

            if (index >= argv.length) {
                throw new Error("--output requires a filename.");
            }

            options.output = path.resolve(argv[index]);
        } else if (argument === "--no-git-map") {
            options.gitMap = false;
        } else if (argument === "--help" || argument === "-h") {
            usage();
            process.exit(0);
        } else {
            throw new Error("Unknown argument: " + argument);
        }
    }

    if (!options.before) {
        options.before = calendarYearsAgo(options.years);
    }

    return options;
}

function readLabels(filename) {
    var labels = {};

    if (!fs.existsSync(filename)) {
        throw new Error("Label file does not exist: " + filename);
    }

    fs.readFileSync(filename, "utf8")
        .split(/\r?\n/)
        .forEach(function(line, zeroBasedLine) {
            var trimmed = line.trim();

            if (!trimmed || trimmed.charAt(0) === "#") {
                return;
            }

            var fields = trimmed.split(/\s+/);

            if (fields.length !== 2 ||
                !/^[ADKU]$/.test(fields[1])) {
                throw new Error(
                    "Invalid label line " +
                    (zeroBasedLine + 1) +
                    " in " +
                    filename +
                    ": " +
                    line
                );
            }

            if (labels[fields[0]]) {
                throw new Error(
                    "Duplicate repository label: " + fields[0]
                );
            }

            labels[fields[0]] = fields[1];
        });

    return labels;
}

function allRepositoryNames(root) {
    return fs.readdirSync(root)
        .filter(function(name) {
            return /\.git$/.test(name) &&
                fs.statSync(path.join(root, name)).isDirectory();
        })
        .map(function(name) {
            return name.replace(/\.git$/, "");
        })
        .sort();
}

function selectedRepositories(options, labels) {
    var selected;

    if (options.courses.length > 0) {
        selected = options.courses.slice();
    } else if (options.calibration) {
        selected = CALIBRATION_REPOSITORIES.slice();
    } else {
        selected = Object.keys(labels).sort();
    }

    return Array.from(new Set(selected));
}

function shortHash(value) {
    return crypto
        .createHash("sha256")
        .update(String(value))
        .digest("hex")
        .slice(0, 24);
}

function actorKey(statement) {
    var actor = statement.actor;

    if (typeof actor === "string" && actor.length > 0) {
        return {
            key: "legacy:" + shortHash(actor),
            format: "legacy-string"
        };
    }

    if (actor && typeof actor === "object") {
        var account = actor.account || {};

        if (account.name || account.homePage) {
            return {
                key: "account:" + shortHash(
                    String(account.homePage || "") +
                    "|" +
                    String(account.name || "")
                ),
                format: "xapi-account"
            };
        }

        if (actor.mbox) {
            return {
                key: "mbox:" + shortHash(actor.mbox),
                format: "xapi-mbox"
            };
        }

        if (actor.openid) {
            return {
                key: "openid:" + shortHash(actor.openid),
                format: "xapi-openid"
            };
        }

        if (actor.name) {
            return {
                key: "name:" + shortHash(actor.name),
                format: "xapi-name-only"
            };
        }
    }

    return {
        key: "unknown",
        format: "unknown"
    };
}

function statementDate(statement) {
    var value = statement.stored || statement.timestamp;
    var date = value && new Date(value);

    if (!date || isNaN(date.getTime())) {
        return null;
    }

    return date;
}

function isoWeekKey(date) {
    var copy = new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate()
    ));

    var day = copy.getUTCDay() || 7;
    copy.setUTCDate(copy.getUTCDate() + 4 - day);

    var yearStart =
        new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));

    var week = Math.ceil(
        (((copy - yearStart) / 86400000) + 1) / 7
    );

    return copy.getUTCFullYear() +
        "-W" +
        String(week).padStart(2, "0");
}

function utcDayKey(date) {
    return date.toISOString().slice(0, 10);
}

function activityHash(statement) {
    var objectId =
        statement.object &&
        statement.object.id;

    var matches =
        typeof objectId === "string" &&
        objectId.match(ACTIVITY_ID_RE);

    return matches ? matches[1].toLowerCase() : null;
}

function decodeChunk(payload) {
    return new Promise(function(resolve, reject) {
        snappy.uncompress(
            payload.slice(4),
            { asBuffer: false },
            function(error, original) {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(original);
            }
        );
    });
}

function checksumValid(payload, original) {
    var checksum = crc32.calculate(original, 0);
    var masked = uint32.addMod32(
        uint32.rotateRight(checksum, 15),
        0xa282ead8
    );

    return masked === payload.readUInt32LE(0);
}

function readExactly(fd, buffer, length, position) {
    return new Promise(function(resolve, reject) {
        fs.read(
            fd,
            buffer,
            0,
            length,
            position,
            function(error, bytesRead) {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(bytesRead);
            }
        );
    });
}

function openFile(filename) {
    return new Promise(function(resolve, reject) {
        fs.open(filename, fs.constants.O_RDONLY, function(error, fd) {
            if (error) {
                reject(error);
                return;
            }

            resolve(fd);
        });
    });
}

function closeFile(fd) {
    return new Promise(function(resolve) {
        fs.close(fd, function() {
            resolve();
        });
    });
}

function emptyMetrics() {
    return {
        statementsDecoded: 0,
        statementsInWindow: 0,
        answeredStatements: 0,
        firstStored: null,
        lastStored: null,
        actors: {},
        actorFormats: {},
        activities: {},
        weeks: {},
        dailyActorActivities: {},
        parseError: null,
        partial: false,
        recoveredCorruptRegions: [],
        recoveredBytesSkipped: 0,
        recoveredFrames: 0
    };
}

function recordStatement(metrics, statement, cutoff) {
    metrics.statementsDecoded += 1;

    var date = statementDate(statement);

    if (!date || date < cutoff) {
        return;
    }

    metrics.statementsInWindow += 1;

    if (!metrics.firstStored ||
        date < metrics.firstStored) {
        metrics.firstStored = date;
    }

    if (!metrics.lastStored ||
        date > metrics.lastStored) {
        metrics.lastStored = date;
    }

    metrics.weeks[isoWeekKey(date)] = true;

    var actor = actorKey(statement);
    var hash = activityHash(statement);

    metrics.actorFormats[actor.format] =
        (metrics.actorFormats[actor.format] || 0) + 1;

    if (!metrics.actors[actor.key]) {
        metrics.actors[actor.key] = {
            activities: {},
            statements: 0
        };
    }

    metrics.actors[actor.key].statements += 1;

    var dayKey = utcDayKey(date);

    if (!metrics.dailyActorActivities[dayKey]) {
        metrics.dailyActorActivities[dayKey] = {};
    }

    if (!metrics.dailyActorActivities[dayKey][actor.key]) {
        metrics.dailyActorActivities[dayKey][actor.key] = {};
    }

    if (hash) {
        metrics.activities[hash] = true;
        metrics.actors[actor.key].activities[hash] = true;
        metrics.dailyActorActivities[dayKey][actor.key][hash] = true;
    }

    if (statement.verb &&
        statement.verb.id === ANSWERED_VERB) {
        metrics.answeredStatements += 1;
    }
}

async function findNextValidStatementFrame(
    fd,
    searchStart,
    capturedSize,
    maximumSearchBytes
) {
    var searchLimit = Math.min(
        capturedSize - 4,
        searchStart + maximumSearchBytes
    );

    for (
        var candidate = searchStart;
        candidate <= searchLimit;
        candidate += 1
    ) {
        var header = Buffer.alloc(4);
        var headerBytes =
            await readExactly(fd, header, 4, candidate);

        if (headerBytes !== 4) {
            return null;
        }

        var kind = header.readUInt8(0);

        /*
         * The current Xronos LRS writer uses compressed data chunks.
         * Restrict recovery to that known format rather than guessing
         * at skippable or uncompressed frame contents.
         */
        if (kind !== 0x00) {
            continue;
        }

        var length = header.readUIntLE(1, 3);

        /*
         * Four checksum bytes are required. The upper bound prevents a
         * corrupt header from causing an excessive allocation.
         */
        if (length < 4 || length > 1024 * 1024) {
            continue;
        }

        var frameEnd = candidate + 4 + length;

        if (frameEnd > capturedSize) {
            continue;
        }

        var payload = Buffer.alloc(length);
        var payloadBytes = await readExactly(
            fd,
            payload,
            length,
            candidate + 4
        );

        if (payloadBytes !== length) {
            continue;
        }

        try {
            var original = await decodeChunk(payload);

            if (!checksumValid(payload, original)) {
                continue;
            }

            var statement = JSON.parse(original);

            if (!statement ||
                typeof statement !== "object" ||
                Array.isArray(statement)) {
                continue;
            }

            return {
                frameStart: candidate,
                frameEnd: frameEnd,
                payloadLength: length
            };
        } catch (error) {
            /*
             * This byte offset is not the start of an independently
             * valid statement frame. Continue searching.
             */
        }
    }

    return null;
}

async function scanLrs(
    filename,
    cutoff,
    statementLimit,
    repository
) {
    var beforeStat = fs.statSync(filename);
    var metrics = emptyMetrics();
    var fd = await openFile(filename);
    var position = 0;
    var scanStartedAt = Date.now();
    var lastProgressAt = scanStartedAt;

    try {
        while (position + 4 <= beforeStat.size) {
            var now = Date.now();

            if (now - lastProgressAt >= 10000) {
                var percent = beforeStat.size > 0
                    ? (100 * position / beforeStat.size).toFixed(1)
                    : "100.0";
                var elapsedSeconds =
                    Math.floor((now - scanStartedAt) / 1000);

                console.error(
                    "[read-only census] " +
                    repository +
                    ": " +
                    metrics.statementsDecoded.toLocaleString() +
                    " statements, " +
                    percent +
                    "% of captured LRS, " +
                    elapsedSeconds +
                    "s elapsed"
                );

                lastProgressAt = now;
            }

            if (statementLimit > 0 &&
                metrics.statementsDecoded >= statementLimit) {
                metrics.partial = true;
                break;
            }

            var frameStart = position;
            var header = Buffer.alloc(4);
            var headerBytes =
                await readExactly(fd, header, 4, position);

            if (headerBytes !== 4) {
                metrics.partial = true;
                break;
            }

            var kind = header.readUInt8(0);
            var length = header.readUIntLE(1, 3);
            var nextPosition = position + 4 + length;

            if (nextPosition > beforeStat.size) {
                metrics.partial = true;
                metrics.parseError =
                    "Chunk extends beyond captured EOF at byte " +
                    position;
                break;
            }

            var payload = Buffer.alloc(length);
            var payloadBytes = await readExactly(
                fd,
                payload,
                length,
                position + 4
            );

            if (payloadBytes !== length) {
                metrics.partial = true;
                metrics.parseError =
                    "Short chunk read at byte " + position;
                break;
            }

            position = nextPosition;

            if (kind === 0xff) {
                continue;
            }

            if (kind !== 0x00) {
                continue;
            }

            try {
                var original = await decodeChunk(payload);

                if (!checksumValid(payload, original)) {
                    throw new Error("checksum mismatch");
                }

                recordStatement(
                    metrics,
                    JSON.parse(original),
                    cutoff
                );
            } catch (error) {
                var recovery = await findNextValidStatementFrame(
                    fd,
                    frameStart + 1,
                    beforeStat.size,
                    64 * 1024 * 1024
                );

                if (!recovery) {
                    metrics.partial = true;
                    metrics.parseError =
                        "Unable to decode chunk beginning at byte " +
                        frameStart +
                        " and no valid statement frame was found " +
                        "within 64 MiB: " +
                        error.message;
                    break;
                }

                var skippedBytes =
                    recovery.frameStart - frameStart;

                metrics.recoveredCorruptRegions.push({
                    corruptFrameStart: frameStart,
                    corruptFrameEnd: position,
                    recoveredFrameStart:
                        recovery.frameStart,
                    recoveredFrameEnd:
                        recovery.frameEnd,
                    skippedBytes: skippedBytes,
                    originalError: error.message
                });

                metrics.recoveredBytesSkipped += skippedBytes;
                metrics.recoveredFrames += 1;

                console.error(
                    "[read-only census] " +
                    repository +
                    ": recovered after malformed LRS data; " +
                    "skipped bytes " +
                    frameStart +
                    "-" +
                    (recovery.frameStart - 1) +
                    " (" +
                    skippedBytes.toLocaleString() +
                    " bytes)"
                );

                /*
                 * Reprocess the recovered frame normally on the next
                 * loop iteration so its statement is counted exactly
                 * once and receives the usual checksum validation.
                 */
                position = recovery.frameStart;
            }
        }
    } finally {
        await closeFile(fd);
    }

    var afterStat = fs.statSync(filename);

    metrics.bytesCaptured = beforeStat.size;
    metrics.bytesRead = position;

    metrics.sameFileDuringScan =
        beforeStat.dev === afterStat.dev &&
        beforeStat.ino === afterStat.ino;

    metrics.safeAppendDuringScan =
        statementLimit === 0 &&
        metrics.sameFileDuringScan &&
        afterStat.size >= beforeStat.size &&
        position === beforeStat.size &&
        !metrics.parseError;

    metrics.lrsChangedDuringScan =
        beforeStat.size !== afterStat.size ||
        beforeStat.mtimeMs !== afterStat.mtimeMs ||
        !metrics.sameFileDuringScan;

    metrics.unsafeChangeDuringScan =
        metrics.lrsChangedDuringScan &&
        !metrics.safeAppendDuringScan;

    metrics.lrsSizeBefore = beforeStat.size;
    metrics.lrsSizeAfter = afterStat.size;
    metrics.lrsMtimeBefore = beforeStat.mtime.toISOString();
    metrics.lrsMtimeAfter = afterStat.mtime.toISOString();
    metrics.lrsDeviceBefore = beforeStat.dev;
    metrics.lrsDeviceAfter = afterStat.dev;
    metrics.lrsInodeBefore = beforeStat.ino;
    metrics.lrsInodeAfter = afterStat.ino;

    if (metrics.unsafeChangeDuringScan) {
        metrics.partial = true;
    }

    return metrics;
}

function gitOutput(repositoryDirectory, args) {
    return childProcess.execFileSync(
        "git",
        ["--git-dir=" + repositoryDirectory].concat(args),
        {
            encoding: "utf8",
            maxBuffer: 256 * 1024 * 1024,
            stdio: ["ignore", "pipe", "ignore"]
        }
    );
}

function mapActivityHashes(repositoryDirectory, observedHashes) {
    var wanted = observedHashes;
    var mapping = {};

    if (Object.keys(wanted).length === 0) {
        return mapping;
    }

    var output = gitOutput(
        repositoryDirectory,
        ["rev-list", "--objects", "--all"]
    );

    output.split(/\r?\n/).forEach(function(line) {
        var match = line.match(
            /^([0-9a-f]{40})\s+(.+\.html)$/i
        );

        if (!match) {
            return;
        }

        var hash = match[1].toLowerCase();

        if (!wanted[hash]) {
            return;
        }

        mapping[hash] = mapping[hash] || [];

        if (!mapping[hash].includes(match[2])) {
            mapping[hash].push(match[2]);
        }
    });

    return mapping;
}

function assignmentRoot(activityPath) {
    if (!activityPath) {
        return null;
    }

    var pieces = activityPath.split("/");

    if (pieces.length <= 1) {
        return activityPath.replace(/\.html$/, "");
    }

    return pieces[0];
}

function summarizeActors(actorMap, activityMapping) {
    var actorKeys = Object.keys(actorMap);
    var counts = [];
    var assignmentCounts = [];

    actorKeys.forEach(function(actorKeyValue) {
        var activities =
            Object.keys(actorMap[actorKeyValue].activities);

        counts.push(activities.length);

        var assignments = {};

        activities.forEach(function(hash) {
            var paths = activityMapping[hash] || [];

            paths.forEach(function(activityPath) {
                var root = assignmentRoot(activityPath);

                if (root) {
                    assignments[root] = true;
                }
            });
        });

        assignmentCounts.push(Object.keys(assignments).length);
    });

    counts.sort(function(a, b) {
        return a - b;
    });

    assignmentCounts.sort(function(a, b) {
        return a - b;
    });

    function atLeast(values, threshold) {
        return values.filter(function(value) {
            return value >= threshold;
        }).length;
    }

    function median(values) {
        if (values.length === 0) {
            return null;
        }

        var middle = Math.floor(values.length / 2);

        if (values.length % 2 === 1) {
            return values[middle];
        }

        return (values[middle - 1] + values[middle]) / 2;
    }

    return {
        distinctActors: actorKeys.length,
        actorsWith2Activities: atLeast(counts, 2),
        actorsWith3Activities: atLeast(counts, 3),
        actorsWith5Activities: atLeast(counts, 5),
        medianActivitiesPerActor: median(counts),
        actorsWith2Assignments: atLeast(assignmentCounts, 2),
        actorsWith3Assignments: atLeast(assignmentCounts, 3),
        actorsWith5Assignments: atLeast(assignmentCounts, 5),
        medianAssignmentsPerActor: median(assignmentCounts)
    };
}

function summarizeRolling150(
    dailyActorActivities,
    activityMapping
) {
    var DAY_MS = 24 * 60 * 60 * 1000;
    var WINDOW_DAYS = 150;

    var days = Object.keys(dailyActorActivities)
        .sort()
        .map(function(dayKey) {
            var actors = {};

            Object.keys(
                dailyActorActivities[dayKey]
            ).forEach(function(actorKeyValue) {
                var assignments = {};

                Object.keys(
                    dailyActorActivities[dayKey][actorKeyValue]
                ).forEach(function(hash) {
                    var paths = activityMapping[hash] || [];

                    paths.forEach(function(activityPath) {
                        var root = assignmentRoot(activityPath);

                        if (root) {
                            assignments[root] = true;
                        }
                    });
                });

                actors[actorKeyValue] = assignments;
            });

            return {
                key: dayKey,
                time: Date.parse(dayKey + "T00:00:00.000Z"),
                week: isoWeekKey(
                    new Date(dayKey + "T00:00:00.000Z")
                ),
                actors: actors
            };
        });

    if (days.length === 0) {
        return {
            rolling150Start: null,
            rolling150End: null,
            rolling150DistinctActors: 0,
            rolling150DistinctAssignments: 0,
            rolling150ActorsWith2Assignments: 0,
            rolling150ActorsWith3Assignments: 0,
            rolling150ActorsWith5Assignments: 0,
            rolling150MedianAssignmentsPerActor: null,
            rolling150ActiveWeeks: 0
        };
    }

    var actorDayCounts = {};
    var actorAssignmentCounts = {};
    var assignmentCounts = {};
    var weekCounts = {};
    var left = 0;
    var best = null;

    function addDay(day) {
        weekCounts[day.week] =
            (weekCounts[day.week] || 0) + 1;

        Object.keys(day.actors).forEach(function(actorKeyValue) {
            actorDayCounts[actorKeyValue] =
                (actorDayCounts[actorKeyValue] || 0) + 1;

            if (!actorAssignmentCounts[actorKeyValue]) {
                actorAssignmentCounts[actorKeyValue] = {};
            }

            Object.keys(day.actors[actorKeyValue])
                .forEach(function(assignment) {
                    actorAssignmentCounts[actorKeyValue][assignment] =
                        (
                            actorAssignmentCounts[
                                actorKeyValue
                            ][assignment] || 0
                        ) + 1;

                    assignmentCounts[assignment] =
                        (assignmentCounts[assignment] || 0) + 1;
                });
        });
    }

    function removeDay(day) {
        weekCounts[day.week] -= 1;

        if (weekCounts[day.week] === 0) {
            delete weekCounts[day.week];
        }

        Object.keys(day.actors).forEach(function(actorKeyValue) {
            actorDayCounts[actorKeyValue] -= 1;

            if (actorDayCounts[actorKeyValue] === 0) {
                delete actorDayCounts[actorKeyValue];
            }

            Object.keys(day.actors[actorKeyValue])
                .forEach(function(assignment) {
                    actorAssignmentCounts[
                        actorKeyValue
                    ][assignment] -= 1;

                    if (
                        actorAssignmentCounts[
                            actorKeyValue
                        ][assignment] === 0
                    ) {
                        delete actorAssignmentCounts[
                            actorKeyValue
                        ][assignment];
                    }

                    assignmentCounts[assignment] -= 1;

                    if (assignmentCounts[assignment] === 0) {
                        delete assignmentCounts[assignment];
                    }
                });

            if (
                Object.keys(
                    actorAssignmentCounts[actorKeyValue]
                ).length === 0 &&
                !actorDayCounts[actorKeyValue]
            ) {
                delete actorAssignmentCounts[actorKeyValue];
            }
        });
    }

    function snapshot(startDay, endDay) {
        var actorKeys = Object.keys(actorDayCounts);
        var assignmentTotals = actorKeys.map(function(actorKeyValue) {
            return Object.keys(
                actorAssignmentCounts[actorKeyValue] || {}
            ).length;
        }).sort(function(a, b) {
            return a - b;
        });

        function atLeast(threshold) {
            return assignmentTotals.filter(function(value) {
                return value >= threshold;
            }).length;
        }

        var median = null;

        if (assignmentTotals.length > 0) {
            var middle =
                Math.floor(assignmentTotals.length / 2);

            median = assignmentTotals.length % 2 === 1
                ? assignmentTotals[middle]
                : (
                    assignmentTotals[middle - 1] +
                    assignmentTotals[middle]
                ) / 2;
        }

        return {
            rolling150Start: startDay.key,
            rolling150End: endDay.key,
            rolling150DistinctActors: actorKeys.length,
            rolling150DistinctAssignments:
                Object.keys(assignmentCounts).length,
            rolling150ActorsWith2Assignments: atLeast(2),
            rolling150ActorsWith3Assignments: atLeast(3),
            rolling150ActorsWith5Assignments: atLeast(5),
            rolling150MedianAssignmentsPerActor: median,
            rolling150ActiveWeeks:
                Object.keys(weekCounts).length
        };
    }

    function stronger(candidate, incumbent) {
        if (!incumbent) {
            return true;
        }

        var fields = [
            "rolling150DistinctActors",
            "rolling150ActorsWith5Assignments",
            "rolling150ActorsWith3Assignments",
            "rolling150DistinctAssignments",
            "rolling150ActiveWeeks"
        ];

        for (var index = 0; index < fields.length; index += 1) {
            if (candidate[fields[index]] !== incumbent[fields[index]]) {
                return candidate[fields[index]] >
                    incumbent[fields[index]];
            }
        }

        return candidate.rolling150End >
            incumbent.rolling150End;
    }

    days.forEach(function(day, right) {
        addDay(day);

        while (
            day.time - days[left].time >=
                WINDOW_DAYS * DAY_MS
        ) {
            removeDay(days[left]);
            left += 1;
        }

        var candidate = snapshot(days[left], day);

        if (stronger(candidate, best)) {
            best = candidate;
        }
    });

    return best;
}

function classify(label, summary) {
    var evidence;

    var courseActors =
        summary.rolling150DistinctActors !== undefined
            ? summary.rolling150DistinctActors
            : summary.distinctActors;

    var courseAssignments =
        summary.rolling150DistinctAssignments !== undefined
            ? summary.rolling150DistinctAssignments
            : summary.distinctAssignments;

    var courseActorsWith3 =
        summary.rolling150ActorsWith3Assignments !== undefined
            ? summary.rolling150ActorsWith3Assignments
            : summary.actorsWith3Assignments;

    var courseActorsWith5 =
        summary.rolling150ActorsWith5Assignments !== undefined
            ? summary.rolling150ActorsWith5Assignments
            : summary.actorsWith5Assignments;

    var courseWeeks =
        summary.rolling150ActiveWeeks !== undefined
            ? summary.rolling150ActiveWeeks
            : summary.activeWeeks;

    if (summary.status !== "ok") {
        evidence = "insufficient";
    } else if (
        courseActors >= 30 &&
        courseAssignments >= 10 &&
        courseActorsWith5 >= 15 &&
        courseWeeks >= 8
    ) {
        evidence = "very-strong-course-pattern";
    } else if (
        courseActors >= 15 &&
        courseAssignments >= 5 &&
        courseActorsWith3 >= 5 &&
        courseWeeks >= 4
    ) {
        evidence = "strong-course-pattern";
    } else if (
        courseActors >= 5 &&
        courseAssignments >= 2 &&
        courseWeeks >= 2
    ) {
        evidence = "limited-or-ambiguous-activity";
    } else {
        evidence = "little-course-pattern";
    }

    if (summary.unstable) {
        return {
            evidence: "incomplete",
            suggestion: "rerun-unstable-scan"
        };
    }

    if (summary.partial) {
        return {
            evidence: "incomplete",
            suggestion: "rerun-full-scan"
        };
    }

    if (label === "K") {
        return {
            evidence: evidence,
            suggestion: "keep-protected"
        };
    }

    if (label === "A") {
        return {
            evidence: evidence,
            suggestion:
                evidence === "little-course-pattern"
                    ? "review-unexpected-low-evidence"
                    : "retain-known-active"
        };
    }

    if (label === "D") {
        return {
            evidence: evidence,
            suggestion:
                evidence === "strong-course-pattern" ||
                evidence === "very-strong-course-pattern"
                    ? "review-known-dormant-with-activity"
                    : "dormant-calibration-consistent"
        };
    }

    if (evidence === "very-strong-course-pattern" ||
        evidence === "strong-course-pattern") {
        return {
            evidence: evidence,
            suggestion: "likely-active-review"
        };
    }

    if (evidence === "little-course-pattern") {
        return {
            evidence: evidence,
            suggestion: "possible-dormant-manual-review"
        };
    }

    return {
        evidence: evidence,
        suggestion: "manual-review"
    };
}

function newestGitCommit(repositoryDirectory) {
    try {
        return gitOutput(
            repositoryDirectory,
            ["log", "-1", "--format=%cI", "--all"]
        ).trim() || null;
    } catch (error) {
        return null;
    }
}

async function analyzeRepository(
    repository,
    label,
    options
) {
    var repositoryDirectory = path.join(
        config.repositories.root,
        repository + ".git"
    );

    var result = {
        repository: repository,
        label: label || "U",
        status: "ok",
        cutoff: options.before.toISOString(),
        newestGitCommit: null
    };

    if (!fs.existsSync(repositoryDirectory)) {
        result.status = "missing-repository";
        result.partial = true;
        result.unstable = false;

        return Object.assign(
            result,
            classify(result.label, result)
        );
    }

    result.newestGitCommit =
        newestGitCommit(repositoryDirectory);

    var lrsFilename = path.join(
        repositoryDirectory,
        "learning-record-store"
    );

    if (!fs.existsSync(lrsFilename)) {
        result.status = "missing-lrs";
        result.partial = false;
        result.unstable = false;
        result.statementsDecoded = 0;
        result.statementsInWindow = 0;
        result.distinctActors = 0;
        result.distinctActivities = 0;
        result.distinctAssignments = 0;
        result.activeWeeks = 0;
        result.actorsWith2Assignments = 0;
        result.actorsWith3Assignments = 0;
        result.actorsWith5Assignments = 0;
        result.medianAssignmentsPerActor = null;
        result.rolling150Start = null;
        result.rolling150End = null;
        result.rolling150DistinctActors = 0;
        result.rolling150DistinctAssignments = 0;
        result.rolling150ActorsWith2Assignments = 0;
        result.rolling150ActorsWith3Assignments = 0;
        result.rolling150ActorsWith5Assignments = 0;
        result.rolling150MedianAssignmentsPerActor = null;
        result.rolling150ActiveWeeks = 0;
        result.actorFormats = {};
        result.recoveredCorruptRegions = [];
        result.recoveredBytesSkipped = 0;
        result.recoveredFrames = 0;

        return Object.assign(
            result,
            classify(result.label, result)
        );
    }

    var metrics = await scanLrs(
        lrsFilename,
        options.before,
        options.statementLimit,
        repository
    );

    var activityMapping = {};

    if (options.gitMap) {
        try {
            activityMapping = mapActivityHashes(
                repositoryDirectory,
                metrics.activities
            );
        } catch (error) {
            result.gitMapError = error.message;
        }
    }

    var actorSummary =
        summarizeActors(metrics.actors, activityMapping);

    var rolling150Summary = summarizeRolling150(
        metrics.dailyActorActivities,
        activityMapping
    );

    var assignments = {};
    var mappedActivities = 0;

    Object.keys(metrics.activities).forEach(function(hash) {
        var paths = activityMapping[hash] || [];

        if (paths.length > 0) {
            mappedActivities += 1;
        }

        paths.forEach(function(activityPath) {
            var root = assignmentRoot(activityPath);

            if (root) {
                assignments[root] = true;
            }
        });
    });

    Object.assign(result, {
        status: "ok",
        partial: metrics.partial,
        unstable: metrics.unsafeChangeDuringScan,
        changedDuringScan: metrics.lrsChangedDuringScan,
        safeAppendDuringScan: metrics.safeAppendDuringScan,
        sameFileDuringScan: metrics.sameFileDuringScan,
        parseError: metrics.parseError,
        recoveredCorruptRegions:
            metrics.recoveredCorruptRegions,
        recoveredBytesSkipped:
            metrics.recoveredBytesSkipped,
        recoveredFrames:
            metrics.recoveredFrames,
        statementsDecoded: metrics.statementsDecoded,
        statementsInWindow: metrics.statementsInWindow,
        answeredStatements: metrics.answeredStatements,
        firstStored:
            metrics.firstStored
                ? metrics.firstStored.toISOString()
                : null,
        lastStored:
            metrics.lastStored
                ? metrics.lastStored.toISOString()
                : null,
        distinctActivities:
            Object.keys(metrics.activities).length,
        mappedActivities: mappedActivities,
        distinctAssignments:
            Object.keys(assignments).length,
        activeWeeks:
            Object.keys(metrics.weeks).length,
        actorFormats: metrics.actorFormats,
        bytesCaptured: metrics.bytesCaptured,
        bytesRead: metrics.bytesRead,
        lrsSizeBefore: metrics.lrsSizeBefore,
        lrsSizeAfter: metrics.lrsSizeAfter,
        lrsMtimeBefore: metrics.lrsMtimeBefore,
        lrsMtimeAfter: metrics.lrsMtimeAfter,
        lrsDeviceBefore: metrics.lrsDeviceBefore,
        lrsDeviceAfter: metrics.lrsDeviceAfter,
        lrsInodeBefore: metrics.lrsInodeBefore,
        lrsInodeAfter: metrics.lrsInodeAfter
    });

    Object.assign(result, actorSummary);
    Object.assign(result, rolling150Summary);

    return Object.assign(
        result,
        classify(result.label, result)
    );
}

function plain(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value);
}

var COLUMN_DEFINITIONS = [
    ["repository", "Repository"],
    ["label", "Label"],
    ["status", "Status"],
    ["evidence", "Evidence"],
    ["suggestion", "Suggestion"],
    ["distinctActors", "Actors"],
    ["distinctAssignments", "Assignments"],
    ["actorsWith3Assignments", "Actors3+"],
    ["actorsWith5Assignments", "Actors5+"],
    ["activeWeeks", "Weeks"],
    ["rolling150DistinctActors", "150d actors"],
    ["rolling150DistinctAssignments", "150d assignments"],
    ["rolling150ActorsWith2Assignments", "150d actors2+"],
    ["rolling150ActorsWith3Assignments", "150d actors3+"],
    ["rolling150ActorsWith5Assignments", "150d actors5+"],
    ["rolling150MedianAssignmentsPerActor", "150d median"],
    ["rolling150ActiveWeeks", "150d weeks"],
    ["rolling150Start", "150d start"],
    ["rolling150End", "150d end"],
    ["statementsInWindow", "Statements"],
    ["lastStored", "Last activity"],
    ["partial", "Partial"],
    ["unstable", "Unstable"],
    ["safeAppendDuringScan", "Safe append"],
    ["recoveredFrames", "Recovered gaps"],
    ["recoveredBytesSkipped", "Skipped bytes"]
];

function tsv(results) {
    var lines = [
        COLUMN_DEFINITIONS.map(function(column) {
            return column[0];
        }).join("\t")
    ];

    results.forEach(function(result) {
        lines.push(
            COLUMN_DEFINITIONS.map(function(column) {
                return plain(result[column[0]])
                    .replace(/\t/g, " ")
                    .replace(/\r?\n/g, " ");
            }).join("\t")
        );
    });

    return lines.join("\n") + "\n";
}

function table(results) {
    var widths = COLUMN_DEFINITIONS.map(function(column) {
        return column[1].length;
    });

    results.forEach(function(result) {
        COLUMN_DEFINITIONS.forEach(function(column, index) {
            var value = plain(result[column[0]]);

            if (column[0] === "lastStored" && value) {
                value = value.slice(0, 10);
            }

            widths[index] = Math.min(
                Math.max(widths[index], value.length),
                column[0] === "suggestion" ||
                column[0] === "evidence"
                    ? 34
                    : 24
            );
        });
    });

    function row(values) {
        return values.map(function(value, index) {
            var text = plain(value);

            if (text.length > widths[index]) {
                text =
                    text.slice(0, Math.max(0, widths[index] - 1)) +
                    "…";
            }

            return text.padEnd(widths[index], " ");
        }).join("  ");
    }

    var lines = [];

    lines.push(row(
        COLUMN_DEFINITIONS.map(function(column) {
            return column[1];
        })
    ));

    lines.push(
        widths.map(function(width) {
            return "-".repeat(width);
        }).join("  ")
    );

    results.forEach(function(result) {
        lines.push(row(
            COLUMN_DEFINITIONS.map(function(column) {
                var value = result[column[0]];

                if (column[0] === "lastStored" && value) {
                    return value.slice(0, 10);
                }

                return value;
            })
        ));
    });

    lines.push("");
    lines.push(
        "Read-only census. K repositories are protected from " +
        "retirement suggestions."
    );
    lines.push(
        "Partial or unstable scans must be rerun before use."
    );

    return lines.join("\n") + "\n";
}

async function main() {
    var options = parseArguments(process.argv.slice(2));
    var labels = readLabels(options.labelsFile);
    var repositories =
        selectedRepositories(options, labels);
    var results = [];

    for (var index = 0;
        index < repositories.length;
        index += 1) {
        var repository = repositories[index];

        console.error(
            "Scanning " +
            repository +
            " (" +
            (index + 1) +
            "/" +
            repositories.length +
            "; read-only)..."
        );

        try {
            results.push(
                await analyzeRepository(
                    repository,
                    labels[repository] || "U",
                    options
                )
            );
        } catch (error) {
            var failed = {
                repository: repository,
                label: labels[repository] || "U",
                status: "failed",
                partial: true,
                unstable: false,
                error: error.message
            };

            Object.assign(
                failed,
                classify(failed.label, failed)
            );

            results.push(failed);
        }
    }

    var report;

    if (options.format === "json") {
        report = JSON.stringify({
            generatedAt: new Date().toISOString(),
            readOnly: true,
            cutoff: options.before.toISOString(),
            statementLimit: options.statementLimit,
            labelsFile: options.labelsFile,
            results: results
        }, null, 2) + "\n";
    } else if (options.format === "tsv") {
        report = tsv(results);
    } else {
        report = table(results);
    }

    if (options.output) {
        fs.writeFileSync(options.output, report);
        console.log("Wrote report: " + options.output);
    } else {
        process.stdout.write(report);
    }
}

main().catch(function(error) {
    console.error("Error: " + error.message);
    process.exit(1);
});
