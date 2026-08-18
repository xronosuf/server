#!/usr/bin/env node
"use strict";

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var zlib = require("zlib");
var stream = require("stream");
var childProcess = require("child_process");

var snappy = require("snappy");
var buffer24 = require("buffer24");
var crc32 = require("fast-crc32c");
var uint32 = require("uint32");

function usage() {
    console.log([
        "",
        "Usage:",
        "  node scripts/finalize-lrs-archive.js \\",
        "    --course REPOSITORY \\",
        "    --before YYYY-MM-DD \\",
        "    --run-directory /lrs-archives/.../prepare-...",
        ""
    ].join("\n"));
}

function parseArguments(argv) {
    var options = {
        course: null,
        before: null,
        runDirectory: null
    };

    for (var index = 0; index < argv.length; index += 1) {
        var argument = argv[index];

        if (argument === "--course") {
            index += 1;
            options.course = argv[index];
        } else if (argument === "--before") {
            index += 1;
            options.before = argv[index];
        } else if (argument === "--run-directory") {
            index += 1;
            options.runDirectory = argv[index];
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

    if (!/^[A-Za-z0-9._-]+$/.test(options.course)) {
        throw new Error("Invalid repository name.");
    }

    if (!options.before || !/^\d{4}-\d{2}-\d{2}$/.test(options.before)) {
        throw new Error("--before must use YYYY-MM-DD.");
    }

    if (!options.runDirectory) {
        throw new Error("--run-directory is required.");
    }

    return options;
}

function finished(target) {
    return new Promise(function(resolve, reject) {
        stream.finished(target, function(error) {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

function writeBuffer(target, buffer) {
    return new Promise(function(resolve, reject) {
        var accepted;

        function cleanup() {
            target.removeListener("drain", onDrain);
            target.removeListener("error", onError);
        }

        function onDrain() {
            cleanup();
            resolve();
        }

        function onError(error) {
            cleanup();
            reject(error);
        }

        try {
            accepted = target.write(buffer);
        } catch (error) {
            reject(error);
            return;
        }

        if (accepted) {
            resolve();
            return;
        }

        target.once("drain", onDrain);
        target.once("error", onError);
    });
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
                } else {
                    resolve(bytesRead);
                }
            }
        );
    });
}

function openRead(filename) {
    return new Promise(function(resolve, reject) {
        fs.open(filename, fs.constants.O_RDONLY, function(error, fd) {
            if (error) {
                reject(error);
            } else {
                resolve(fd);
            }
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
        fs.stat(filename, function(error, result) {
            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        });
    });
}

function uncompress(payload) {
    return new Promise(function(resolve, reject) {
        snappy.uncompress(
            payload.slice(4),
            { asBuffer: false },
            function(error, original) {
                if (error) {
                    reject(error);
                } else {
                    resolve(original);
                }
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

    return maskedChecksum === payload.readUInt32LE(0);
}

function sha256File(filename) {
    return new Promise(function(resolve, reject) {
        var hash = crypto.createHash("sha256");
        var input = fs.createReadStream(filename);

        input.on("error", reject);

        input.on("data", function(chunk) {
            hash.update(chunk);
        });

        input.on("end", function() {
            resolve(hash.digest("hex"));
        });
    });
}

function copyFile(source, destination) {
    fs.copyFileSync(
        source,
        destination,
        fs.constants.COPYFILE_EXCL
    );
}

function updateRange(range, date) {
    var value = date.toISOString();

    if (!range.oldest || value < range.oldest) {
        range.oldest = value;
    }

    if (!range.newest || value > range.newest) {
        range.newest = value;
    }
}

async function processTail(options) {
    var runDirectory = options.runDirectory;
    var repositoryDirectory = path.join(
        "/usr/var/server/repositories",
        options.course + ".git"
    );

    var sourceFilename = path.join(
        repositoryDirectory,
        "learning-record-store"
    );

    var manifestFilename = path.join(
        runDirectory,
        "manifest.json"
    );

    var manifest = JSON.parse(
        fs.readFileSync(manifestFilename, "utf8")
    );

    if (manifest.repository !== options.course) {
        throw new Error(
            "Manifest repository does not match --course."
        );
    }

    if (manifest.cutoff.slice(0, 10) !== options.before) {
        throw new Error(
            "Manifest cutoff does not match --before."
        );
    }

    var preparedArchive = manifest.files.historicalArchive;
    var preparedRetained = manifest.files.retainedLrs;

    if (!fs.existsSync(preparedArchive)) {
        throw new Error(
            "Prepared historical archive is missing: " +
            preparedArchive
        );
    }

    if (!fs.existsSync(preparedRetained)) {
        throw new Error(
            "Prepared retained LRS is missing: " +
            preparedRetained
        );
    }

    var preparedArchiveHash =
        await sha256File(preparedArchive);
    var preparedRetainedHash =
        await sha256File(preparedRetained);

    if (
        preparedArchiveHash !==
        manifest.sha256.historicalArchive
    ) {
        throw new Error(
            "Prepared historical archive checksum mismatch."
        );
    }

    if (
        preparedRetainedHash !==
        manifest.sha256.retainedLrs
    ) {
        throw new Error(
            "Prepared retained LRS checksum mismatch."
        );
    }

    var sourceStat = await statFile(sourceFilename);

    if (sourceStat.size < manifest.snapshotBytes) {
        throw new Error(
            "Current LRS is shorter than the prepared snapshot."
        );
    }

    var temporaryArchive =
        preparedArchive + ".finalizing";

    var temporaryRetained =
        preparedRetained + ".finalizing";

    if (
        fs.existsSync(temporaryArchive) ||
        fs.existsSync(temporaryRetained)
    ) {
        throw new Error(
            "Temporary finalization files already exist. " +
            "Inspect or remove them before retrying."
        );
    }

    copyFile(preparedArchive, temporaryArchive);
    copyFile(preparedRetained, temporaryRetained);

    fs.chmodSync(temporaryArchive, 0o660);
    fs.chmodSync(temporaryRetained, 0o660);

    var retainedOutput = fs.createWriteStream(
        temporaryRetained,
        { flags: "a", mode: 0o660 }
    );

    var archiveFileOutput = fs.createWriteStream(
        temporaryArchive,
        { flags: "a", mode: 0o660 }
    );

    /*
     * Concatenated gzip members are valid gzip streams. Appending another
     * member allows tail archive chunks to be added without recompressing
     * the already-prepared historical archive.
     */
    var gzip = zlib.createGzip({ level: 6 });
    gzip.pipe(archiveFileOutput);

    var cutoff = new Date(
        options.before + "T00:00:00.000Z"
    );

    var sourceFd = await openRead(sourceFilename);
    var position = manifest.snapshotBytes;

    var tail = {
        startPosition: manifest.snapshotBytes,
        finalSourceBytes: sourceStat.size,
        statements: 0,
        archiveStatements: 0,
        retainStatements: 0,
        archiveNativeBytes: 0,
        retainNativeBytes: 0,
        storedRange: {
            oldest: null,
            newest: null
        }
    };

    try {
        while (position < sourceStat.size) {
            if (position + 4 > sourceStat.size) {
                throw new Error(
                    "Stopped LRS ends inside a chunk header at byte " +
                    position
                );
            }

            var header = Buffer.alloc(4);
            var headerBytes = await readExactly(
                sourceFd,
                header,
                0,
                4,
                position
            );

            if (headerBytes !== 4) {
                throw new Error(
                    "Short tail header read at byte " + position
                );
            }

            var kind = header.readUInt8(0);
            var length = header.readUInt24LE(1);
            var chunkBytes = 4 + length;

            if (position + chunkBytes > sourceStat.size) {
                throw new Error(
                    "Stopped LRS ends inside a chunk at byte " +
                    position
                );
            }

            var payload = Buffer.alloc(length);
            var payloadBytes = await readExactly(
                sourceFd,
                payload,
                0,
                length,
                position + 4
            );

            if (payloadBytes !== length) {
                throw new Error(
                    "Short tail payload read at byte " + position
                );
            }

            var framedChunk = Buffer.concat([
                header,
                payload
            ]);

            if (kind === 0xff) {
                throw new Error(
                    "Unexpected stream identifier in appended tail at byte " +
                    position
                );
            }

            if (kind !== 0x00) {
                /*
                 * Preserve unknown skippable chunks in both streams.
                 */
                await writeBuffer(
                    retainedOutput,
                    framedChunk
                );

                await writeBuffer(
                    gzip,
                    framedChunk
                );

                tail.archiveNativeBytes += chunkBytes;
                tail.retainNativeBytes += chunkBytes;

                position += chunkBytes;
                continue;
            }

            var original = await uncompress(payload);

            if (!verifyChecksum(payload, original)) {
                throw new Error(
                    "Tail checksum failure at byte " + position
                );
            }

            var statement = JSON.parse(original);
            var stored = new Date(statement.stored);

            if (!statement.stored || isNaN(stored.getTime())) {
                throw new Error(
                    "Invalid tail stored date at byte " +
                    position
                );
            }

            tail.statements += 1;
            updateRange(tail.storedRange, stored);

            if (stored < cutoff) {
                await writeBuffer(gzip, framedChunk);
                tail.archiveStatements += 1;
                tail.archiveNativeBytes += chunkBytes;
            } else {
                await writeBuffer(
                    retainedOutput,
                    framedChunk
                );

                tail.retainStatements += 1;
                tail.retainNativeBytes += chunkBytes;
            }

            position += chunkBytes;
        }
    } catch (error) {
        retainedOutput.destroy();
        gzip.destroy();
        archiveFileOutput.destroy();
        throw error;
    } finally {
        await closeFile(sourceFd);
    }

    retainedOutput.end();
    gzip.end();

    await finished(retainedOutput);
    await finished(archiveFileOutput);

    if (position !== sourceStat.size) {
        throw new Error(
            "Tail processing stopped at " +
            position +
            " of " +
            sourceStat.size +
            " bytes."
        );
    }

    childProcess.execFileSync(
        "gzip",
        ["-t", temporaryArchive],
        { stdio: "inherit" }
    );

    var finalArchiveHash =
        await sha256File(temporaryArchive);

    var finalRetainedHash =
        await sha256File(temporaryRetained);

    var finalArchiveStat =
        await statFile(temporaryArchive);

    var finalRetainedStat =
        await statFile(temporaryRetained);

    manifest.finalization = {
        completedAt: new Date().toISOString(),
        stoppedSourceBytes: sourceStat.size,
        tail: tail,
        finalHistoricalArchiveBytes:
            finalArchiveStat.size,
        finalRetainedLrsBytes:
            finalRetainedStat.size,
        finalSha256: {
            historicalArchive: finalArchiveHash,
            retainedLrs: finalRetainedHash
        }
    };

    fs.renameSync(
        temporaryArchive,
        preparedArchive
    );

    fs.renameSync(
        temporaryRetained,
        preparedRetained
    );

    manifest.sha256.historicalArchive =
        finalArchiveHash;

    manifest.sha256.retainedLrs =
        finalRetainedHash;

    fs.writeFileSync(
        manifestFilename,
        JSON.stringify(manifest, null, 2) + "\n",
        { mode: 0o660 }
    );

    var checksumsFilename = path.join(
        runDirectory,
        "checksums.sha256"
    );

    fs.writeFileSync(
        checksumsFilename,
        finalArchiveHash +
            "  " +
            path.basename(preparedArchive) +
            "\n" +
            finalRetainedHash +
            "  " +
            path.basename(preparedRetained) +
            "\n",
        { mode: 0o660 }
    );

    return {
        repositoryDirectory: repositoryDirectory,
        sourceFilename: sourceFilename,
        retainedFilename: preparedRetained,
        manifest: manifest
    };
}

function performSwap(options, result) {
    var repositoryDirectory =
        result.repositoryDirectory;

    var sourceFilename =
        result.sourceFilename;

    var rollbackTag =
        "pre-archive-" + options.before;

    var rollbackLrs = path.join(
        repositoryDirectory,
        "learning-record-store." + rollbackTag
    );

    var rollbackAttempts = path.join(
        repositoryDirectory,
        "answer-attempt-summary.json." +
            rollbackTag
    );

    if (fs.existsSync(rollbackLrs)) {
        throw new Error(
            "Rollback LRS already exists: " + rollbackLrs
        );
    }

    if (!fs.existsSync(sourceFilename)) {
        throw new Error("Active LRS is missing.");
    }

    var stagedFilename = path.join(
        repositoryDirectory,
        "learning-record-store.archive-staged"
    );

    if (fs.existsSync(stagedFilename)) {
        throw new Error(
            "Staged LRS already exists: " + stagedFilename
        );
    }

    copyFile(
        result.retainedFilename,
        stagedFilename
    );

    fs.chmodSync(stagedFilename, 0o660);

    fs.renameSync(
        sourceFilename,
        rollbackLrs
    );

    fs.renameSync(
        stagedFilename,
        sourceFilename
    );

    var attemptsFilename = path.join(
        repositoryDirectory,
        "answer-attempt-summary.json"
    );

    if (fs.existsSync(attemptsFilename)) {
        fs.renameSync(
            attemptsFilename,
            rollbackAttempts
        );
    }

    result.manifest.swap = {
        completedAt: new Date().toISOString(),
        activeLrs: sourceFilename,
        rollbackLrs: rollbackLrs,
        rollbackAnswerAttemptSummary:
            fs.existsSync(rollbackAttempts)
                ? rollbackAttempts
                : null
    };

    fs.writeFileSync(
        path.join(
            options.runDirectory,
            "manifest.json"
        ),
        JSON.stringify(result.manifest, null, 2) + "\n",
        { mode: 0o660 }
    );

    console.log("");
    console.log("LRS finalization and swap completed.");
    console.log("Active LRS:   " + sourceFilename);
    console.log("Rollback LRS: " + rollbackLrs);
    console.log(
        "Tail statements: " +
        result.manifest.finalization.tail.statements
    );
}

function preflightSwap(options) {
    var repositoryDirectory = path.join(
        "/usr/var/server/repositories",
        options.course + ".git"
    );

    var activeLrs = path.join(
        repositoryDirectory,
        "learning-record-store"
    );

    var rollbackLrs = path.join(
        repositoryDirectory,
        "learning-record-store.pre-archive-" +
            options.before
    );

    var stagedLrs = path.join(
        repositoryDirectory,
        "learning-record-store.archive-staged"
    );

    if (!fs.existsSync(repositoryDirectory)) {
        throw new Error(
            "Repository directory is missing: " +
            repositoryDirectory
        );
    }

    if (!fs.existsSync(activeLrs)) {
        throw new Error(
            "Active LRS is missing: " + activeLrs
        );
    }

    if (fs.existsSync(rollbackLrs)) {
        throw new Error(
            "Rollback LRS already exists: " +
            rollbackLrs
        );
    }

    if (fs.existsSync(stagedLrs)) {
        throw new Error(
            "Staged LRS already exists: " +
            stagedLrs
        );
    }
}

async function main() {
    var options = parseArguments(
        process.argv.slice(2)
    );

    preflightSwap(options);

    var result = await processTail(options);

    performSwap(options, result);
}

main().catch(function(error) {
    console.error("");
    console.error("LRS finalization failed:");
    console.error(
        error && error.stack ? error.stack : error
    );
    process.exit(1);
});
