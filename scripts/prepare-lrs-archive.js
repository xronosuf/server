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

var STREAM_IDENTIFIER = Buffer.from([
    0xff, 0x06, 0x00, 0x00,
    0x73, 0x4e, 0x61, 0x50, 0x70, 0x59
]);

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

function updateRange(range, date) {
    var value = date.toISOString();

    if (!range.oldest || value < range.oldest) {
        range.oldest = value;
    }

    if (!range.newest || value > range.newest) {
        range.newest = value;
    }
}

function timestampForPath() {
    return new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");
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

function gzipTest(filename) {
    childProcess.execFileSync(
        "gzip",
        ["-t", filename],
        { stdio: "inherit" }
    );
}

async function validateRetained(filename) {
    var fd = await openRead(filename);
    var stat = await statFile(filename);
    var position = 0;
    var identifiers = 0;
    var statements = 0;

    try {
        while (position + 4 <= stat.size) {
            var header = Buffer.alloc(4);
            var headerBytes = await readExactly(
                fd,
                header,
                0,
                4,
                position
            );

            if (headerBytes !== 4) {
                throw new Error(
                    "Incomplete retained header at byte " + position
                );
            }

            var kind = header.readUInt8(0);
            var length = header.readUInt24LE(1);
            var chunkBytes = 4 + length;

            if (position + chunkBytes > stat.size) {
                throw new Error(
                    "Incomplete retained chunk at byte " + position
                );
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
                throw new Error(
                    "Short retained read at byte " + position
                );
            }

            if (kind === 0xff) {
                identifiers += 1;
            } else if (kind === 0x00) {
                var original = await uncompress(payload);

                if (!verifyChecksum(payload, original)) {
                    throw new Error(
                        "Retained checksum failure at byte " + position
                    );
                }

                JSON.parse(original);
                statements += 1;
            }

            position += chunkBytes;
        }
    } finally {
        await closeFile(fd);
    }

    if (position !== stat.size) {
        throw new Error(
            "Retained validation stopped at " +
            position +
            " of " +
            stat.size +
            " bytes."
        );
    }

    if (identifiers !== 1) {
        throw new Error(
            "Retained stream has " +
            identifiers +
            " stream identifiers; expected 1."
        );
    }

    return {
        bytes: stat.size,
        statements: statements,
        streamIdentifiers: identifiers
    };
}

async function prepare(options) {
    var sourceFilename = options.lrsFilename;
    var cutoff = options.before;
    var archiveRoot = options.archiveRoot || "/lrs-archives";

    var cutoffName = cutoff.toISOString().slice(0, 10);
    var runName = "prepare-" + timestampForPath();

    var courseRoot = path.join(
        archiveRoot,
        options.course,
        cutoffName
    );

    var runDirectory = path.join(courseRoot, runName);

    if (fs.existsSync(runDirectory)) {
        throw new Error(
            "Preparation directory already exists: " + runDirectory
        );
    }

    fs.mkdirSync(runDirectory, { recursive: true });

    var historicalFilename = path.join(
        runDirectory,
        "learning-record-store.before-" +
            cutoffName +
            ".snappy.gz"
    );

    var retainedFilename = path.join(
        runDirectory,
        "learning-record-store.retained.snappy"
    );

    var manifestFilename = path.join(
        runDirectory,
        "manifest.json"
    );

    var checksumsFilename = path.join(
        runDirectory,
        "checksums.sha256"
    );

    var initialStat = await statFile(sourceFilename);
    var snapshotSize = initialStat.size;

    var sourceFd = await openRead(sourceFilename);

    var retainedOutput = fs.createWriteStream(
        retainedFilename,
        {
            flags: "wx",
            mode: 0o660
        }
    );

    var archiveFileOutput = fs.createWriteStream(
        historicalFilename,
        {
            flags: "wx",
            mode: 0o660
        }
    );

    var gzip = zlib.createGzip({ level: 6 });
    gzip.pipe(archiveFileOutput);

    var result = {
        repository: options.course,
        cutoff: cutoff.toISOString(),
        sourceFilename: sourceFilename,
        snapshotBytes: snapshotSize,
        processedBytes: 0,
        bytesAppendedDuringPreparation: 0,

        totalStatements: 0,
        archiveStatements: 0,
        retainStatements: 0,

        archiveNativeBytes: STREAM_IDENTIFIER.length,
        retainNativeBytes: STREAM_IDENTIFIER.length,

        streamIdentifierChunks: 0,
        otherChunks: 0,

        allStoredRange: {
            oldest: null,
            newest: null
        },
        archiveStoredRange: {
            oldest: null,
            newest: null
        },
        retainStoredRange: {
            oldest: null,
            newest: null
        }
    };

    await writeBuffer(retainedOutput, STREAM_IDENTIFIER);
    await writeBuffer(gzip, STREAM_IDENTIFIER);

    var position = 0;

    try {
        while (position + 4 <= snapshotSize) {
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
                    "Incomplete source header at byte " + position
                );
            }

            var kind = header.readUInt8(0);
            var length = header.readUInt24LE(1);
            var chunkBytes = 4 + length;

            if (position + chunkBytes > snapshotSize) {
                throw new Error(
                    "Snapshot ended inside a source chunk at byte " +
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
                    "Short source read at byte " + position
                );
            }

            if (kind === 0xff) {
                result.streamIdentifierChunks += 1;
                position += chunkBytes;
                continue;
            }

            var framedChunk = Buffer.concat([header, payload]);

            if (kind !== 0x00) {
                result.otherChunks += 1;

                await writeBuffer(retainedOutput, framedChunk);
                await writeBuffer(gzip, framedChunk);

                result.archiveNativeBytes += chunkBytes;
                result.retainNativeBytes += chunkBytes;

                position += chunkBytes;
                continue;
            }

            var original = await uncompress(payload);

            if (!verifyChecksum(payload, original)) {
                throw new Error(
                    "Checksum failure at source byte " + position
                );
            }

            var statement = JSON.parse(original);
            var stored = new Date(statement.stored);

            if (!statement.stored || isNaN(stored.getTime())) {
                throw new Error(
                    "Invalid stored date at source byte " + position
                );
            }

            result.totalStatements += 1;
            updateRange(result.allStoredRange, stored);

            if (stored < cutoff) {
                await writeBuffer(gzip, framedChunk);

                result.archiveStatements += 1;
                result.archiveNativeBytes += chunkBytes;
                updateRange(result.archiveStoredRange, stored);
            } else {
                await writeBuffer(retainedOutput, framedChunk);

                result.retainStatements += 1;
                result.retainNativeBytes += chunkBytes;
                updateRange(result.retainStoredRange, stored);
            }

            if (result.totalStatements % 100000 === 0) {
                console.log(
                    "Prepared " +
                    result.totalStatements.toLocaleString() +
                    " statements"
                );
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

    result.processedBytes = position;

    retainedOutput.end();
    gzip.end();

    await finished(retainedOutput);
    await finished(archiveFileOutput);

    var finalSourceStat = await statFile(sourceFilename);

    result.finalObservedSourceBytes = finalSourceStat.size;
    result.bytesAppendedDuringPreparation = Math.max(
        0,
        finalSourceStat.size - snapshotSize
    );

    console.log("Testing gzip archive...");
    gzipTest(historicalFilename);

    console.log("Validating retained LRS...");
    result.retainedValidation =
        await validateRetained(retainedFilename);

    if (
        result.archiveStatements +
        result.retainStatements !==
        result.totalStatements
    ) {
        throw new Error(
            "Statement counts do not reconcile."
        );
    }

    if (
        result.retainedValidation.statements !==
        result.retainStatements
    ) {
        throw new Error(
            "Retained validation statement count does not match."
        );
    }

    result.files = {
        historicalArchive: historicalFilename,
        retainedLrs: retainedFilename
    };

    result.sha256 = {
        historicalArchive:
            await sha256File(historicalFilename),
        retainedLrs:
            await sha256File(retainedFilename)
    };

    fs.writeFileSync(
        manifestFilename,
        JSON.stringify(result, null, 2) + "\n",
        { mode: 0o660 }
    );

    fs.writeFileSync(
        checksumsFilename,
        result.sha256.historicalArchive +
            "  " +
            path.basename(historicalFilename) +
            "\n" +
            result.sha256.retainedLrs +
            "  " +
            path.basename(retainedFilename) +
            "\n",
        { mode: 0o660 }
    );

    console.log("");
    console.log("Preparation completed successfully.");
    console.log("Run directory: " + runDirectory);
    console.log(
        "Historical statements: " +
        result.archiveStatements.toLocaleString()
    );
    console.log(
        "Retained statements:   " +
        result.retainStatements.toLocaleString()
    );
    console.log(
        "Bytes appended during preparation: " +
        result.bytesAppendedDuringPreparation.toLocaleString()
    );
    console.log("");
    console.log("NO ACTIVE LRS FILE WAS CHANGED.");

    return result;
}

module.exports = {
    prepare: prepare
};
