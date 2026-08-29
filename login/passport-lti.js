var util = require("util"),
  passport = require("passport"),
  mdb = require("../mdb"),
  lti = require("ims-lti"),
  config = require("../config");

function LtiStrategy(options, verify) {
  this.name = "lti";
  this._verify = verify;
  this.returnURL = options.returnURL;
  passport.Strategy.call(this, options, verify);
}

util.inherits(LtiStrategy, passport.Strategy);

LtiStrategy.prototype.authenticate = function (req) {
  // Xronos is normally behind an HTTPS reverse proxy.  ims-lti only needs a
  // small HTTP-request-shaped object to validate the OAuth signature, so avoid
  // copying the entire Express request object: modern Express exposes several
  // enumerable accessor properties and shallow-copying the request evaluates
  // deprecated getters such as req.host.
  var protocol = "https";
  if (req.get("host") == "localhost:" + config.port) {
    protocol = "http";
  }

  var myRequest = {
    method: req.method,
    url: req.url,
    originalUrl: config.toValidPath(req.originalUrl),
    protocol: protocol,
    headers: req.headers,
    body: req.body
  };
  var self = this;

  function verified(err, user, info) {
    if (err) {
      return self.error(err);
    }
    if (!user) {
      return self.fail(info);
    }
    self.success(user, info);
  }

  var profile = req.body;

  mdb.KeyAndSecret.findOne({
    ltiKey: profile.oauth_consumer_key
  })
    .exec()
    .then(function (keyAndSecret) {
      if (!keyAndSecret) {
        self.error(
          "The LTI key has not been registered with Xronos"
        );
        return;
      }

      self.provider = new lti.Provider(
        keyAndSecret.ltiKey,
        keyAndSecret.ltiSecret
      );

      self.provider.valid_request(
        myRequest,
        function (err, isValid) {
          if (!isValid) {
            return self.error(err);
          }

          // An LTI user may end up taking a course multiple
          // times, but we want a fresh experience each time.
          var identifier =
            profile.user_id + "-" + profile.context_id;

          self._verify(
            req,
            identifier,
            profile,
            verified
          );
        }
      );
    })
    .catch(function (err) {
      self.error(err);
    });
};

module.exports.Strategy = LtiStrategy;
