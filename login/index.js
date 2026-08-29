var LtiStrategy = require("./passport-lti").Strategy,
  OAuth2Strategy = require("passport-oauth2").Strategy,
  async = require("async"),
  mdb = require("../mdb"),
  config = require("../config"),
  githubApi = require("github"),
  moment = require("moment"),
  path = require("path");
var gradebook = require("../routes/gradebook");

module.exports.githubStrategy = function (rootUrl) {
  return new OAuth2Strategy(
    {
      authorizationURL: "https://github.com/login/oauth/authorize",
      tokenURL: "https://github.com/login/oauth/access_token",
      clientID: config.github.clientID,
      clientSecret: config.github.clientSecret,
      scope: "repo:status,public_repo,repo_deployment,write:repo_hook",
      callbackURL: rootUrl + "/auth/github/callback",
      passReqToCallback: true,
    },
    function (req, accessToken, refreshToken, profile, done) {
      // Load the github user id
      var github = new githubApi({ version: "3.0.0" });
      github.authenticate({
        type: "oauth",
        token: accessToken,
      });

      github.user.get({}, function (err, user) {
        // TODO: save the entire user object here?

        // Login using the github user id
        addUserAccount(req, "githubId", user.id, null, null, null, function () {
          // Save the github access token
          req.user.githubAccessToken = accessToken;
          req.user
            .save()
            .then(function (savedUser) {
              done(null, savedUser);
            })
            .catch(function (err) {
              done(err);
            });
        });
      });
    }
  );
};

module.exports.lmsStrategy = function (rootUrl) {
  return new LtiStrategy(
    {
      returnURL: config.toValidPath("/just-logged-in"),
    },
    function (req, identifier, profile, done) {
      addLmsAccount(req, identifier, profile, done);
    }
  );
};

function addUserAccount(req, authField, authId, name, email, course, done) {
  var searchFields = {};
  searchFields[authField] = authId;

  if (req.user.isGuest) {
    // Save this to the users collection if we haven't already
    mdb.User.findOneAndUpdate(
      searchFields,
      {
        name: name,
        email: email,
        course: course,
      },
      {
        new: true,
      }
    )
      .exec()
      .then(function (user) {
        if (!user) {
          // New user, modify current user account instead.
          req.user.name = name;
          req.user.email = email;
          req.user.course = course;
          req.user[authField] = authId;
          req.user.isGuest = false;
          req.user
            .save()
            .then(function () {
              done(null, req.user);
            })
            .catch(function (err) {
              done(err, req.user);
            });
        } else {
          // BADBAD: it might be nice to copy over the guest
          // data to the existing user account, but I'm so
          // terrified of merging users.
          done(null, user);
        }
      })
      .catch(function (err) {
        done(err, null);
      });
  } else {
    // Add account to existing user; remove account from other users.

    // If user already has account, we're done.
    if (req.user[authField] == authId) {
      req.user.name = name;
      req.user.email = email;
      req.user.course = course;
      req.user[authField] = authId;
      req.user
        .save()
        .then(function () {
          done(null, req.user);
        })
        .catch(function (err) {
          done(err, req.user);
        });
    } else {
      // Merge any existing accounts

      // Find any OTHER accounts (but there can be at most one)
      mdb.User.findOne(searchFields)
        .exec()
        .then(function (user) {
          async.series(
            [
              function (callback) {
                if (user) {
                  user.replacedBy = req.user._id;

                  // Copy over OTHER login details (without clobbering any existing details)
                  user[authField] = undefined;

                  var authFields = [
                    "googleOpenId",
                    "courseraOAuthId",
                    "twitterOAuthId",
                    "ltiId",
                    "githubId",
                  ];
                  authFields.forEach(function (authField) {
                    if (user[authField] && !req.user[authField]) {
                      req.user[authField] = user[authField];
                      user[authField] = undefined;
                    }
                  });

                  // Copy over xake credentials
                  if (user.isAuthor) {
                    req.user.isAuthor = true;
                  }
                  if (!req.user.apiKey) {
                    req.user.apiKey = user.apiKey;
                    user.apiKey = undefined;
                  }
                  if (!req.user.apiSecret) {
                    req.user.apiSecret = user.apiSecret;
                    user.apiSecret = undefined;
                  }

                  user
                    .save()
                    .then(function (savedUser) {
                      callback(null, savedUser);
                    })
                    .catch(function (err) {
                      callback(err);
                    });
                } else {
                  callback(null);
                }
              },

              function (callback) {
                // Update user data
                req.user.name = name;
                req.user.email = email;
                req.user.course = course;
                req.user[authField] = authId;

                req.user
                  .save()
                  .then(function (savedUser) {
                    callback(null, savedUser);
                  })
                  .catch(function (err) {
                    callback(err);
                  });
              },

              function (callback) {
                if (user && user._id) {
                  mdb.State.updateMany(
                    { user: user._id },
                    { $set: { user: req.user._id } }
                  )
                    .exec()
                    .then(function (result) {
                      callback(null, result);
                    })
                    .catch(function (err) {
                      callback(err);
                    });
                } else {
                  callback(null);
                }
              },

              function (callback) {
                if (user && user._id) {
                  mdb.Completion.updateMany(
                    { user: user._id },
                    { $set: { user: req.user._id } }
                  )
                    .exec()
                    .then(function (result) {
                      callback(null, result);
                    })
                    .catch(function (err) {
                      callback(err);
                    });
                } else {
                  callback(null);
                }
              },
            ],
            function (err, results) {
              done(err, req.user);
            }
          );
        })
        .catch(function (err) {
          done(err, null);
        });
    }
  }
}

function normalizeRepositoryName(name) {
  return name.replace(/[^0-9A-Za-z-]/, "").toLowerCase();
}


function validCanvasCustomDate(value) {
  if (!value) return false;

  /*
   * Canvas may leave substitution variables such as
   * $Canvas.assignment.dueAt.iso8601 unexpanded. Do not pass those
   * placeholders to moment, since they are not real dates and trigger
   * noisy fallback warnings.
   */
  if (typeof value === "string" && value.charAt(0) === "$") return false;

  return moment(value).isValid();
}

function bridgeHasNoRecordedScore(bridge) {
  return (
    bridge &&
    (bridge.resultScore === undefined || bridge.resultScore === null) &&
    (bridge.resultTotalScore === undefined || bridge.resultTotalScore === null)
  );
}

function shouldInitializeZeroGradePassback(bridge) {
  return !!(
    bridge &&
    !bridge.instructionalStaff &&
    bridgeHasNoRecordedScore(bridge) &&
    gradebook.bridgeHasGradePassback(bridge) &&
    gradebook.bridgeIsOpen(bridge)
  );
}

function initializeZeroGradePassback(bridge, callback) {
  if (!shouldInitializeZeroGradePassback(bridge)) {
    callback(null);
    return;
  }

  bridge.resultScore = 0;
  bridge.resultTotalScore = 0;
  bridge.submittedScore = false;

  bridge
    .save()
    .then(function () {
      gradebook.queueBridge(bridge, function (err) {
        if (!err) {
          console.log(
            "Queued initial zero grade passback for bridge " +
              bridge._id +
              " (" +
              bridge.repository +
              "/" +
              bridge.path +
              ")"
          );
        }

        callback(err);
      });
    })
    .catch(function (err) {
      callback(err);
    });
}

// Test this with  http://lti.tools/test/tc.php
function addLmsAccount(req, identifier, profile, done) {
  //console.log("Add Lms Account:");

  // Nowadays we set the custom parameters just via the launch URL
  if (req.params.repository) profile.custom_repository = req.params.repository;
  if (req.params.path) profile.custom_xourse = req.params.path;

  if (profile.custom_repository)
    profile.custom_repository = normalizeRepositoryName(
      profile.custom_repository
    );

  // BADBAD: should match ltiId since that is a user+context to
  // ensure that we aren't merging different humans

  async.waterfall(
    [
      // Assuming that ltiId's are globally unique (!), see if a
      // user for this ltiId has already logged in
      function (callback) {
        mdb.LtiBridge.findOne({ ltiId: identifier })
          .exec()
          .then(function (bridge) {
            callback(null, bridge);
          })
          .catch(function (err) {
            callback(err);
          });
      },

      // Load the associated user (or use the current one, if there
      // isn't already a bridge associated with anyone)
      function (bridge, callback) {
        if (bridge) {
          if (bridge.user == req.user._id) {
            callback(null, req.user);
          } else {
            mdb.User.findOne({ _id: bridge.user })
              .exec()
              .then(function (user) {
                callback(null, user);
              })
              .catch(function (err) {
                callback(err);
              });
          }
        } else {
          callback(null, req.user);
        }
      },

      // See if we have already logged in with this narrow context
      function (user, callback) {
        // It is possible that the user has changed, so we need to
        // replace our old user with the new user
        req.user = user;

        // console.log("Looking up bridge for ltiId = ", identifier);

        var hash = {
          ltiId: identifier,
          repository: profile.custom_repository,
          path: profile.custom_xourse,
        };

        if (profile.tool_consumer_instance_guid)
          hash.toolConsumerInstanceGuid = profile.tool_consumer_instance_guid;

        if (profile.context_id) hash.contextId = profile.context_id;

        if (profile.resource_link_id)
          hash.resourceLinkId = profile.resource_link_id;

        mdb.LtiBridge.findOne(hash)
          .exec()
          .then(function (bridge) {
            callback(null, bridge);
          })
          .catch(function (err) {
            callback(err);
          });
      },

      // Update the bridge, or create a bridge if there isn't
      // already a specific enough one
      function (bridge, callback) {
        // Find roles
        var roles = [];
        var instructionalStaff = false;
        if (profile.ext_roles) {
          roles = profile.ext_roles.split(",");
          if (
            profile.ext_roles.match(/Instructor/) ||
            profile.ext_roles.match(/TeachingAssistant/)
          )
            instructionalStaff = true;
        } else {
          if (profile.roles) {
            roles = profile.roles.split(",");
            if (
              profile.roles.match(/Instructor/) ||
              profile.roles.match(/TeachingAssistant/)
            )
              instructionalStaff = true;
          }
        }

        if (bridge) {
          //console.log("Found bridge:");
          // update the bridge, roles, etc.
          if (roles) bridge.roles = roles;
          if (validCanvasCustomDate(profile.custom_due_at))
            bridge.dueDate = profile.custom_due_at;
          if (profile.custom_canvas_assignment_points_possible)
            bridge.pointsPossible =
              profile.custom_canvas_assignment_points_possible;
          if (
            validCanvasCustomDate(profile.custom_lock_at)
          )
            bridge.untilDate = profile.custom_lock_at;
          if (profile.lis_result_sourcedid)
            bridge.lisResultSourcedid = profile.lis_result_sourcedid;
          if (profile.oauth_consumer_key)
            bridge.oauthConsumerKey = profile.oauth_consumer_key;
          if (profile.lis_outcome_service_url)
            bridge.lisOutcomeServiceUrl = profile.lis_outcome_service_url;
        } else {
          // console.log("Creating bridge:");
          // make a new bridge
          var hash = {
            ltiId: identifier,

            toolConsumerInstanceGuid: profile.tool_consumer_instance_guid,
            toolConsumerInstanceName: profile.tool_consumer_instance_name,
            contextId: profile.context_id,
            contextLabel: profile.context_label,
            contextTitle: profile.context_title,

            resourceLinkId: profile.resource_link_id,

            oauthConsumerKey: profile.oauth_consumer_key,
            oauthSignatureMethod: profile.oauth_signature_method,
            lisOutcomeServiceUrl: profile.lis_outcome_service_url,

            instructionalStaff: instructionalStaff,

            repository: profile.custom_repository,
            path: profile.custom_xourse,

            user: req.user._id,
          };

          if (roles) hash.roles = roles;
          if (validCanvasCustomDate(profile.custom_due_at))
            hash.dueDate = profile.custom_due_at;
          if (profile.custom_canvas_assignment_points_possible)
            hash.pointsPossible =
              profile.custom_canvas_assignment_points_possible;
          if (
            validCanvasCustomDate(profile.custom_lock_at)
          )
            hash.untilDate = profile.custom_lock_at;
          if (profile.lis_result_sourcedid)
            hash.lisResultSourcedid = profile.lis_result_sourcedid;
          bridge = new mdb.LtiBridge(hash);
        }
        // console.log(bridge);

        bridge
          .save()
          .then(function () {
            initializeZeroGradePassback(bridge, function (err) {
              if (err) {
                /*
                 * A zero-grade initialization failure should not block the
                 * student's LTI launch.  Log it and allow the login flow to
                 * continue; later progress updates can still queue passback.
                 */
                console.log("Error queueing initial zero grade passback");
                console.log(err);
              }

              callback(null, bridge);
            });
          })
          .catch(function (err) {
            console.log("Error saving bridge");
            console.log(err);
            callback(err);
          });
      },

      // Update the current user object
      function (bridge, callback) {
        var updates = { isGuest: false };

        if ("lis_person_name_full" in profile)
          updates.name = profile.lis_person_name_full;

        if ("lis_person_contact_email_primary" in profile)
          updates.email = profile.lis_person_contact_email_primary;

        if ("custom_repository" in profile && "custom_xourse" in profile)
          updates.course =
            "/" + profile.custom_repository + "/" + profile.custom_xourse;

        if ("user_image" in profile) updates.imageUrl = profile.user_image;

        updates.ltiUserId = profile.lis_person_sourcedid || profile.user_id;

        // Some denormalization is desirable in the user object
        // since we often have to determine whether or not someone
        // is an instructor in a course
        mdb.LtiBridge.find({ user: bridge.user })
          .exec()
          .then(function (bridges) {
            updates.instructorRepositoryPaths = [];

            bridges.forEach(function (b) {
              b.roles.forEach(function (role) {
                var isInstructor = false;
                if (role.match(/Instructor/)) isInstructor = true;
                if (role.match(/TeachingAssistant/)) isInstructor = true;
                if (role.match(/Administrator/)) isInstructor = true;
                if (role.match(/ContentDeveloper/)) isInstructor = true;

                if (isInstructor) {
                  var url = b.repository + "/" + b.path;
                  // Add it if we haven't already
                  if (updates.instructorRepositoryPaths.indexOf(url) < 0)
                    updates.instructorRepositoryPaths.unshift(url);
                }
              });
            });
          })
          .catch(function () {
            // Preserve legacy behavior: this lookup failure did not block
            // updating the user; it only skipped rebuilding instructor paths.
          })
          .then(function () {
            return mdb.User.findOneAndUpdate(
              { _id: bridge.user },
              updates,
              { new: true }
            ).exec();
          })
          .then(function (user) {
            callback(null, user);
          })
          .catch(function (err) {
            callback(err);
          });
      },
    ],
    function (err, result) {
      if (err) {
        console.log(err);
        done(err, null);
      } else {
        //console.log(result)
        //console.log("lms with user._id =", result._id);

        done(null, result);
      }
    }
  );
}
