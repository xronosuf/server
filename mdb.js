var Grid = require("gridfs-stream");
var mongoose = require("mongoose");
var config = require("./config");
var fs = require("fs");
var winston = require("winston");
var _ = require("underscore");

exports = module.exports;

var ObjectId = mongoose.Schema.ObjectId;
var Mixed = mongoose.Schema.Types.Mixed;

/*
 * Mongoose 6 changes strictQuery to follow the schema's strict setting.
 * Preserve the legacy Mongoose 5 query behavior during modernization.
 */
mongoose.set("strictQuery", false);

var url = config.mongodb.uri || ("mongodb://" + config.mongodb.url + "/" + config.mongodb.database);

exports.mongoose = mongoose;
exports.url = url;

// Notice this is different from Schema.ObjectId; Schema.ObjectId if for passing
// models/schemas, Types.ObjectId is for generating ObjectIds.
exports.ObjectId = mongoose.Types.ObjectId;

// TODO: Add appropriate indexes.
exports.initialize = function initialize(callback) {
  winston.info("Initializing Mongo");

  var UserSchema = new mongoose.Schema({
    googleOpenId: { type: String, index: true, unique: true, sparse: true },
    courseraOAuthId: { type: String, index: true, unique: true, sparse: true },
    twitterOAuthId: { type: String, index: true, unique: true, sparse: true },
    ltiId: { type: String, index: true, unique: true, sparse: true },
    ltiUserId: { type: String, sparse: true },
    githubId: { type: String, index: true, unique: true, sparse: true },
    githubAccessToken: { type: String },
    replacedBy: { type: ObjectId, ref: "User" },
    course: String,
    superuser: Boolean,
    username: { type: String, index: true, unique: true, sparse: true },
    password: String,
    name: String,
    email: String,
    displayName: String,
    website: String,
    location: String,
    birthday: Date,
    biography: String,
    xudos: Number,
    xarma: Number,
    imageUrl: String,
    profileViews: Number,
    userAgent: String,
    visibility: String,
    remoteAddress: String,
    isGuest: Boolean,
    isAuthor: Boolean, // BADBAD: this is just for fun -- it's not used anywhere
    instructorRepositoryPaths: [String],
    lastUrlVisited: String,
    lastSeen: Date,
    instructor: Mixed,
    apiKey: { type: String, index: true, unique: true, sparse: true },
    apiSecret: String,
  });
  UserSchema.index({ lastSeen: -1 });

  exports.User = mongoose.model("User", UserSchema);

  exports.LtiBridge = mongoose.model(
    "LtiBridge",
    new mongoose.Schema(
      {
        ltiId: { type: String, index: true },

        toolConsumerInstanceGuid: { type: String, index: true },
        toolConsumerInstanceName: String,

        contextId: { type: String, index: true },
        contextLabel: String,
        contextTitle: String,

        resourceLinkId: String,
        dueDate: Date,
        untilDate: Date,
        pointsPossible: Number,

        resultScore: Number,
        resultTotalScore: Number,
        submittedScore: Boolean,

        oauthConsumerKey: String,
        oauthSignatureMethod: String,
        lisResultSourcedid: String,
        lisOutcomeServiceUrl: String,

        instructionalStaff: { type: Boolean, index: true },

        repository: { type: String, index: true },
        path: { type: String, index: true },

        user: { type: ObjectId, index: true, ref: "User" },
        roles: [String],
      },
      {
        minimize: false,
      }
    )
  );

  exports.State = mongoose.model(
    "State",
    new mongoose.Schema(
      {
        activityHash: { type: String, index: true },
        user: { type: ObjectId, index: true, ref: "User" },
        data: Mixed,
      },
      {
        minimize: false,
      }
    )
  );

  exports.Completion = mongoose.model(
    "Completion",
    new mongoose.Schema(
      {
        // The new method for storing completions
        activityPath: { type: String, index: true },
        repositoryName: { type: String, index: true },

        // The old method for storing completions
        activityHash: { type: String, index: true },

        user: { type: ObjectId, index: true, ref: "User" },
        complete: Number,
        date: Date,
      },
      {
        minimize: false,
      }
    )
  );


  exports.ProgressMilestone = mongoose.model(
    "ProgressMilestone",
    new mongoose.Schema(
      {
        user: { type: ObjectId, index: true, ref: "User" },
        repository: { type: String, index: true },
        path: { type: String, index: true },

        pointsEarned: Number,
        pointsPossible: Number,
        score: { type: Number, index: true },

        canvasPointsPossible: Number,
        canvasScore: Number,

        observedAt: { type: Date, index: true },
        windowStartedAt: { type: Date, index: true },
        source: { type: String, index: true },

        bridge: { type: ObjectId, index: true, ref: "LtiBridge" },
        toolConsumerInstanceGuid: { type: String, index: true },
        contextId: { type: String, index: true },
        resourceLinkId: { type: String, index: true },

        activityHash: { type: String, index: true },
        expiresAt: { type: Date, index: true }
      },
      {
        minimize: false,
      }
    )
  );

  exports.AuditToken = mongoose.model(
    "AuditToken",
    new mongoose.Schema(
      {
        tokenHash: { type: String, index: true, unique: true },
        user: { type: ObjectId, index: true, ref: "User" },
        repository: { type: String, index: true },
        path: { type: String, index: true },

        bridge: { type: ObjectId, index: true, ref: "LtiBridge" },
        toolConsumerInstanceGuid: { type: String, index: true },
        contextId: { type: String, index: true },
        resourceLinkId: { type: String, index: true },

        createdAt: { type: Date, index: true },
        expiresAt: { type: Date, index: true },
        usedAt: Date,
        revokedAt: Date
      },
      {
        minimize: false,
      }
    )
  );

  exports.Label = mongoose.model(
    "Label",
    new mongoose.Schema(
      {
        activityHash: { type: String, index: true },
        commit: { type: String, index: true },
        label: { type: String, index: true },
      },
      {
        minimize: false,
      }
    )
  );

  exports.AccessToken = mongoose.model(
    "AccessToken",
    new mongoose.Schema({
      keyid: { type: String, index: true },
      token: { type: String, index: true },
    })
  );

  exports.KeyAndSecret = mongoose.model(
    "KeyAndSecret",
    new mongoose.Schema({
      keyid: { type: String, index: true },
      ltiKey: { type: String, index: true },
      ltiSecret: String,
      encryptedSecret: String,
    })
  );

  //mongoose.set('debug', true);

  /*
   * Mongoose 5 supports callback-style connect(). Mongoose 6 returns a
   * promise and is moving away from the legacy callback connection form.
   *
   * Use the returned promise when available while preserving callback
   * initialization semantics for the rest of this legacy application.
   */
  var connectionResult;

  try {
    connectionResult = mongoose.connect(url);
  } catch (err) {
    callback(err);
    return;
  }

  if (
    connectionResult &&
    typeof connectionResult.then === "function"
  ) {
    connectionResult.then(
      function () {
        callback(null);
      },
      function (err) {
        callback(err);
      }
    );
  } else {
    /*
     * Defensive fallback for unexpectedly old/non-Promise implementations.
     * Current Mongoose 5 and 6 both return thenables here.
     */
    callback(null);
  }
};
