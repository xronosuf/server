#!/usr/bin/env node
"use strict";

var fs = require("fs");
var path = require("path");
var snappy = require("snappy");
var buffer24 = require("buffer24");
var crc32 = require("fast-crc32c");
var uint32 = require("uint32");
var config = require("../config");

var STREAM_IDENTIFIER = Buffer.from([
    0xff, 0x06, 0x00, 0x00, 0x73, 0x4e, 0x61, 0x50, 0x70, 0x59
]);

function usage() {
    console.log([
        "",
        "Usage:",
        "  ./archiveOldLRS.sh --course REPOSITORY [options]",
        "",
        "Required:",
        "  --course NAME             Repository name without .git.",
        "",
        "Options:",
        "  --before YYYY-MM-DD       Archive records stored before this UTC date.",
        "  --years NUMBER            Calendar years to retain; default 2.",
        "  --execute                 Perform archival and pruning.",
        "                            Currently safety-locked pending dry-run review.",
        "  --help                    Show this help.",
        "",
        "Examples:",
        "  ./archiveOldLRS.sh --course mac2233limits",
        "  ./archiveOldLRS.sh --course mac2233limits --before 2024-07-11",
        "  ./archiveOldLRS.sh --course mac2233limits --execute",
        ""
    ].join("\n"));
}

function parsePositiveInteger(value, optionName) {
    var result = Number(value);

    if (!Number.isInteger(result) || result < 1) {
        throw new Error(optionName + " must be a positive integer.");
    }

    return result;
}

function parseBeforeDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error("--before must use YYYY-MM-DD.");
    }

    var date = new Date(value + "T00:00:00.000Z");

    if (isNaN(date.getTime())) {
        throw new Error("Invalid --before date: " + value);
    }

    return date;
}

function defaultCutoff(years) {
    var now = new Date();
    var cutoff = new Date(Date.UTC(
        now.getUTCFullYear() - years,
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0,
        0
    ));

    return cutoff;
}

function parseArguments(argv) {
    var options = {
        course: null,
        years: 2,
        before: null,
        execute: false
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

            options.course = String(argv[index]).replace(/\.git$/, "");

            if (!/^[A-Za-z0-9._-]+$/.test(options.course)) {
                throw new Error(
                    "Repository names may contain only letters, numbers, ., _, and -."
                );
            }
        } else if (argument === "--before") {
            index += 1;

            if (index >= argv.length) {
                throw new Error("--before requires YYYY-MM-DD.");
            }

            options.before = parseBeforeDate(argv[index]);
        } else if (argument === "--years") {
            index += 1;

            if (index >= argv.length) {
                throw new Error("--years requires a value.");
            }

            options.years = parsePositiveInteger(argv[index], "--years");
        } else if (argument === "--execute") {
            options.execute = true;
        } else if (argument === "--help" || argument === "-h") {
            usage();
            process.exit(0);
        } else {
            throw new Error("Unknown argument: " + argument);
        }
    }

    if (!options.course) {
        throw new Error("--course is required.");
    }

    if (!options.before) {
        options.before = defaultCutoff(options.years);
    }

    return options;
}

function humanBytes(bytes) {
    var units = ["B", "KiB", "MiB", "GiB", "TiB"];
    var value = bytes;
    var unit = 0;

    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }

    return value.toFixed(2) + " " + units[unit];
}

function readExactly(fd, buffer, offset, length, position) {
    return new Promise(function(resolve, reject) {
        fs.read(
            fd,
            buffer,
            offset,
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

function statFile(filename) {
    return new Promise(function(resolve, reject) {
        fs.stat(filename, function(error, stat) {
            if (error) {
                reject(error);
                return;
            }

            resolve(stat);
        });
    });
}

function listRepositories(root) {
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

function editDistance(left, right) {
    var previous = [];
    var current = [];
    var i;
    var j;

    for (j = 0; j <= right.length; j += 1) {
        previous[j] = j;
    }

    for (i = 1; i <= left.length; i += 1) {
        current[0] = i;

        for (j = 1; j <= right.length; j += 1) {
            current[j] = Math.min(
                current[j - 1] + 1,
                previous[j] + 1,
                previous[j - 1] +
                    (left[i - 1] === right[j - 1] ? 0 : 1)
            );
        }

        previous = current.slice();
    }

    return previous[right.length];
}

function closeMatches(value, repositories) {
    return repositories
        .map(function(repository) {
            return {
                repository: repository,
                distance: editDistance(
                    value.toLowerCase(),
                    repository.toLowerCase()
                )
            };
        })
        .sort(function(left, right) {
            if (left.distance !== right.distance) {
                return left.distance - right.distance;
            }

            return left.repository.localeCompare(right.repository);
        })
        .slice(0, 5)
        .map(function(item) {
            return item.repository;
        });
}

function validateRepository(course) {
    var root = config.repositories.root;
    var repositories = listRepositories(root);
    var directory = path.join(root, course + ".git");
    var lrsFilename = path.join(directory, "learning-record-store");

    if (!fs.existsSync(directory) ||
        !fs.statSync(directory).isDirectory()) {
        var matches = closeMatches(course, repositories);

        throw new Error(
            "Repository directory does not exist: " + directory +
            (matches.length
                ? "\nClosest repository names:\n  " +
                    matches.join("\n  ")
                : "")
        );
    }

    if (!fs.existsSync(lrsFilename) ||
        !fs.statSync(lrsFilename).isFile()) {
        throw new Error(
            "Repository exists but has no learning-record-store file: " +
            lrsFilename
        );
    }

    return {
        directory: directory,
        lrsFilename: lrsFilename
    };
}

function uncompress(payload) {
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

function verifyChecksum(payload, original) {
    var checksum = crc32.calculate(original, 0);
    var maskedChecksum = uint32.addMod32(
        uint32.rotateRight(checksum, 15),
        0xa282ead8
    );
    var recordedChecksum = payload.readUInt32LE(0);

    return maskedChecksum === recordedChecksum;
}

function updateDateRange(summary, date) {
    var iso = date.toISOString();

    if (!summary.oldestStored || iso < summary.oldestStored) {
        summary.oldestStored = iso;
    }

    if (!summary.newestStored || iso > summary.newestStored) {
        summary.newestStored = iso;
    }
}

async function scanLrs(filename, cutoff) {
    var initialStat = await statFile(filename);
    var snapshotSize = initialStat.size;
    var fd = await openFile(filename);
    var position = 0;

    var result = {
        snapshotSize: snapshotSize,
        processedBytes: 0,
        trailingBytesAtSnapshot: 0,

        totalChunks: 0,
        streamIdentifierChunks: 0,
        compressedDataChunks: 0,
        skippableChunks: 0,

        totalStatements: 0,
        archiveStatements: 0,
        retainStatements: 0,

        archiveFramedBytes: STREAM_IDENTIFIER.length,
        retainFramedBytes: STREAM_IDENTIFIER.length,

        invalidJson: 0,
        invalidStoredDate: 0,
        checksumFailures: 0,
        decompressionFailures: 0,

        all: {
            oldestStored: null,
            newestStored: null
        },
        archive: {
            oldestStored: null,
            newestStored: null
        },
        retain: {
            oldestStored: null,
            newestStored: null
        }
    };

    try {
        while (position + 4 <= snapshotSize) {
            var header = Buffer.alloc(4);
            var headerBytes = await readExactly(
                fd,
                header,
                0,
                4,
                position
            );

            if (headerBytes !== 4) {
                break;
            }

            var kind = header.readUInt8(0);
            var length = header.readUInt24LE(1);
            var chunkBytes = 4 + length;

            if (position + chunkBytes > snapshotSize) {
                break;
            }

            var payload = Buffer.alloc(length);
            var payloadBytes = await readExactly(
                fd,
                payload,
                0,
                length,
                position + 4
            );

            if (payloadBytes !== length) {
                break;
            }

            result.totalChunks += 1;

            if (kind === 0xff) {
                result.streamIdentifierChunks += 1;
                position += chunkBytes;
                continue;
            }

            if (kind !== 0x00) {
                result.skippableChunks += 1;

                /*
                 * Preserve non-data chunks in both future streams because
                 * they may carry framing metadata unknown to this utility.
                 */
                result.archiveFramedBytes += chunkBytes;
                result.retainFramedBytes += chunkBytes;

                position += chunkBytes;
                continue;
            }

            result.compressedDataChunks += 1;

            var original;

            try {
                original = await uncompress(payload);
            } catch (error) {
                result.decompressionFailures += 1;
                throw new Error(
                    "Snappy decompression failed at byte " + position +
                    ": " + error.message
                );
            }

            if (!verifyChecksum(payload, original)) {
                result.checksumFailures += 1;
                throw new Error(
                    "Checksum failure at byte " + position
                );
            }

            var statement;

            try {
                statement = JSON.parse(original);
            } catch (error) {
                result.invalidJson += 1;
                throw new Error(
                    "Invalid JSON at byte " + position +
                    ": " + error.message
                );
            }

            var stored = new Date(statement.stored);

            if (!statement.stored || isNaN(stored.getTime())) {
                result.invalidStoredDate += 1;
                throw new Error(
                    "Missing or invalid server stored date at byte " +
                    position
                );
            }

            result.totalStatements += 1;
            updateDateRange(result.all, stored);

            if (stored < cutoff) {
                result.archiveStatements += 1;
                result.archiveFramedBytes += chunkBytes;
                updateDateRange(result.archive, stored);
            } else {
                result.retainStatements += 1;
                result.retainFramedBytes += chunkBytes;
                updateDateRange(result.retain, stored);
            }

            if (result.totalStatements % 100000 === 0) {
                console.log(
                    "Validated " +
                    result.totalStatements.toLocaleString() +
                    " statements; position=" +
                    humanBytes(position + chunkBytes)
                );
            }

            position += chunkBytes;
        }
    } finally {
        await closeFile(fd);
    }

    result.processedBytes = position;
    result.trailingBytesAtSnapshot = snapshotSize - position;

    var finalStat = await statFile(filename);
    result.finalObservedSize = finalStat.size;
    result.bytesAppendedDuringScan =
        Math.max(0, finalStat.size - snapshotSize);

    return result;
}

function printResult(options, repository, result) {
    console.log("");
    console.log("LRS archival dry run");
    console.log("====================");
    console.log("Repository:              " + options.course);
    console.log("Repository directory:    " + repository.directory);
    console.log("LRS file:                " + repository.lrsFilename);
    console.log("Cutoff (UTC):             " + options.before.toISOString());
    console.log("");

    console.log("Input validation:");
    console.log("  Snapshot size:          " + humanBytes(result.snapshotSize));
    console.log("  Processed bytes:        " + humanBytes(result.processedBytes));
    console.log(
        "  Trailing snapshot bytes:" +
        " " + result.trailingBytesAtSnapshot.toLocaleString()
    );
    console.log(
        "  Appended during scan:   " +
        humanBytes(result.bytesAppendedDuringScan)
    );
    console.log("  Total chunks:           " + result.totalChunks.toLocaleString());
    console.log(
        "  Data chunks:            " +
        result.compressedDataChunks.toLocaleString()
    );
    console.log(
        "  Stream identifiers:     " +
        result.streamIdentifierChunks.toLocaleString()
    );
    console.log(
        "  Other/skippable chunks: " +
        result.skippableChunks.toLocaleString()
    );
    console.log("");

    console.log("Statement split:");
    console.log(
        "  Total statements:       " +
        result.totalStatements.toLocaleString()
    );
    console.log(
        "  Archive statements:     " +
        result.archiveStatements.toLocaleString()
    );
    console.log(
        "  Retained statements:    " +
        result.retainStatements.toLocaleString()
    );
    console.log("");

    console.log("Native Snappy-framed sizes before outer gzip:");
    console.log(
        "  Historical archive:     " +
        humanBytes(result.archiveFramedBytes)
    );
    console.log(
        "  Retained active LRS:     " +
        humanBytes(result.retainFramedBytes)
    );
    console.log("");

    console.log("Stored-date ranges:");
    console.log(
        "  All:                     " +
        (result.all.oldestStored || "none") +
        " through " +
        (result.all.newestStored || "none")
    );
    console.log(
        "  Archive:                 " +
        (result.archive.oldestStored || "none") +
        " through " +
        (result.archive.newestStored || "none")
    );
    console.log(
        "  Retain:                  " +
        (result.retain.oldestStored || "none") +
        " through " +
        (result.retain.newestStored || "none")
    );
    console.log("");

    console.log("Integrity failures:");
    console.log("  Decompression:           " + result.decompressionFailures);
    console.log("  Checksums:               " + result.checksumFailures);
    console.log("  JSON:                    " + result.invalidJson);
    console.log("  Stored dates:            " + result.invalidStoredDate);
    console.log("");

    if (result.trailingBytesAtSnapshot !== 0) {
        console.log(
            "WARNING: the scan snapshot ended in an incomplete chunk. " +
            "This can happen when Xronos appends during the scan."
        );
    }

    if (result.bytesAppendedDuringScan !== 0) {
        console.log(
            "NOTICE: Xronos appended records during the scan. " +
            "The execution phase will account for the final tail while stopped."
        );
    }

    console.log("DRY RUN ONLY: no files were changed.");
}

async function main() {
    var options = parseArguments(process.argv.slice(2));
    var repository = validateRepository(options.course);

    if (options.execute) {
        throw new Error(
            "--execute is safety-locked until the first dry-run split " +
            "has been reviewed. Run without --execute."
        );
    }

    console.log("Scanning " + repository.lrsFilename);
    console.log("No files will be changed.");

    var result = await scanLrs(
        repository.lrsFilename,
        options.before
    );

    printResult(options, repository, result);

    if (result.trailingBytesAtSnapshot !== 0) {
        process.exitCode = 2;
    }
}

main().catch(function(error) {
    console.error("");
    console.error("archiveOldLRS failed:");
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
