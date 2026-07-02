#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const snappy = require("snappy");
const config = require("../config");

const repository = process.argv[2];

if (!repository) {
  console.error("Usage: node scripts/xapi-summary.js <repository>");
  process.exit(1);
}

const filename = path.join(
  config.repositories.root,
  repository + ".git",
  "learning-record-store"
);

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function shortHash(value) {
  if (!value) return null;
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

function verbName(statement) {
  return statement.verb && (
    statement.verb.display && statement.verb.display["en-US"] ||
    statement.verb.id ||
    "unknown"
  );
}

function objectKind(statement) {
  const id = statement.object && statement.object.id || "unknown";

  return id
    .replace(/^.*\/activities\/[^/]+/, "activities/<hash>")
    .replace(/^https?:\/\/www\.youtube\.com\/watch\?v=.*/, "youtube-video");
}

function actorSummary(statement) {
  const actor = statement.actor || {};
  const account = actor.account || {};

  return {
    namePresent: !!actor.name,
    accountHomePage: account.homePage,
    accountNameHash: shortHash(account.name)
  };
}

function summarizeResult(statement) {
  if (!statement.result) return null;

  const response = statement.result.response;

  return {
    keys: Object.keys(statement.result),
    success: statement.result.success,
    responseType: Array.isArray(response) ? "array" : typeof response,
    responseLength: response == null ? null : JSON.stringify(response).length,
    responseHash: response == null ? null : shortHash(JSON.stringify(response))
  };
}

function parentObject(statement) {
  const parent =
    statement.context &&
    statement.context.contextActivities &&
    statement.context.contextActivities.parent;

  const id = parent && parent.id;

  if (!id) return null;

  return id.replace(/^.*\/activities\/[^/]+/, "activities/<hash>");
}

function summarizeStatement(statement) {
  const context = statement.context || {};
  const extensions = context.extensions || {};

  return {
    timestamp: statement.timestamp,
    stored: statement.stored,
    verb: verbName(statement),
    object: objectKind(statement),
    actor: actorSummary(statement),
    result: summarizeResult(statement),
    contextKeys: Object.keys(context),
    contextExtensionKeys: Object.keys(extensions),
    parentObject: parentObject(statement)
  };
}

function increment(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function topEntries(map, limit) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function decodeSnappyChunk(chunk) {
  const compressed = chunk.slice(4); // first 4 bytes are masked checksum

  return new Promise((resolve, reject) => {
    snappy.uncompress(compressed, { asBuffer: false }, function(err, result) {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

async function readStatements(buffer) {
  let offset = 0;
  let compressedDataChunks = 0;
  let skippedChunks = 0;
  let failedChunks = 0;
  const statements = [];

  while (offset + 4 <= buffer.length) {
    const chunkType = buffer[offset];
    const length = readUInt24LE(buffer, offset + 1);
    offset += 4;

    if (offset + length > buffer.length) break;

    const chunk = buffer.slice(offset, offset + length);
    offset += length;

    // Snappy stream identifier chunk.
    if (chunkType === 0xff) continue;

    // Only decode compressed data chunks.
    if (chunkType !== 0x00) {
      skippedChunks += 1;
      continue;
    }

    compressedDataChunks += 1;

    try {
      const uncompressed = await decodeSnappyChunk(chunk);
      statements.push(JSON.parse(uncompressed));
    } catch (err) {
      failedChunks += 1;
    }
  }

  return {
    compressedDataChunks,
    skippedChunks,
    failedChunks,
    statements
  };
}

fs.readFile(filename, async function(err, buffer) {
  if (err) {
    console.error(err);
    process.exit(1);
    return;
  }

  const decoded = await readStatements(buffer);
  const statements = decoded.statements;

  const verbs = {};
  const objects = {};
  const actors = {};
  let newestTimestamp = null;
  let newestStored = null;

  statements.forEach(statement => {
    const verb = verbName(statement);
    const object = objectKind(statement);
    const actorHash = actorSummary(statement).accountNameHash || "unknown";

    increment(verbs, verb);
    increment(objects, object);
    increment(actors, actorHash);

    if (statement.timestamp && (!newestTimestamp || statement.timestamp > newestTimestamp)) {
      newestTimestamp = statement.timestamp;
    }

    if (statement.stored && (!newestStored || statement.stored > newestStored)) {
      newestStored = statement.stored;
    }
  });

  const recentInterestingEvents = statements
    .filter(statement => [
      "answered",
      "completed",
      "watched",
      "skipped",
      "played",
      "paused",
      "submit"
    ].includes(verbName(statement)))
    .slice(-25)
    .map(summarizeStatement);

  console.log(JSON.stringify({
    file: filename,
    bytes: buffer.length,
    compressedDataChunks: decoded.compressedDataChunks,
    decodedStatements: statements.length,
    failedChunks: decoded.failedChunks,
    skippedChunks: decoded.skippedChunks,
    newestTimestamp,
    newestStored,
    verbs,
    uniqueActorCount: Object.keys(actors).length,
    topObjectKinds: topEntries(objects, 20),
    recentInterestingEvents
  }, null, 2));
});
