/**
 * Module dependencies.
 */

var express = require('express')
  , certificate = require('./routes/certificate')
  , user = require('./routes/user')
  , gradebook = require('./routes/gradebook')
  , progressAudit = require('./routes/progress-audit')
  , statistics = require('./routes/statistics')
  , xourses = require('./routes/xourses')
  , instructors = require('./routes/instructors')
  , tincan = require('./routes/tincan')
  , http = require('http')
  , path = require('path')
  , remember = require('./remember')
  , mdb = require('./mdb')
  , config = require('./config')
  , login = require('./login')
  , guests = require('./login/guests')
  , passport = require('passport')
  , mongo = require('mongodb')
  , expressWinston    = require('express-winston')
  , winston = require('winston')
  , repositories = require('./routes/repositories')
  , page = require('./routes/page')
  , keyserver = require('./routes/gpg')
  , ltiSetup = require('./routes/lti-setup')
  , hashcash = require('./routes/hashcash')
  , supervising = require('./routes/supervising')
  , async = require('async')
  , fs = require('fs')
  , favicon = require('serve-favicon' )
  , util = require('util')
  , session = require('express-session')
  , bodyParser = require('body-parser')
  , cookieParser = require('cookie-parser')
  , logger = require('morgan')
  , rateLimit = require('express-rate-limit')
  , methodOverride = require('method-override')
  , errorHandler = require('errorhandler')
  , sendSeekable = require('send-seekable')
  , url = require('url')
  , versionator = require('versionator')
  , WebSocketServer = require("ws").Server
  , basicAuth = require('express-basic-auth')
  , request = require('request')
  , crypto = require('crypto')
  , sageReliabilityPolicy = require('./sage-reliability-policy')
  ;

require('./summarize/answer-attempt-summary').startScheduler() // Load scheduled answer-attempt summary builder

// add timestamps in front of log messages
require('console-stamp')(console, 'yyyymmdd HH:MM:ss]');

// Create Express 4 app to configure.
var app = express();
exports.app = app;

// Because I care about trailing slashes
app.enable('strict routing');

// Use Pug as our templating engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// all environments
app.set('port', config.port);

app.use(logger('ACC :remote-addr - :remote-user [:date[iso]] ":method :url HTTP/:http-version" :status :res[content-length] :req[x-forwarded-for]'));
app.use(favicon(path.join(__dirname, 'public/images/icons/favicon/favicon.ico')));

app.use(function(req, res, next) {
    res.locals.path = req.path;
    res.locals.absoluteUrl = url.resolve(config.root, req.url);
    res.header('X-Ximera-SubPath', config.subPath);
    next();
});


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false, limit: '512kb' }));
app.use(methodOverride());

app.use(cookieParser(config.session.secret));

app.enable('trust proxy')
app.set('trust proxy',1)

// Common mongodb initializer for the app server and the activity service
mdb.initialize(function (err) {
    
    // Store session data in the mongo database; this is needed if we're
    // going to have multiple web servers sharing a single db
    var MongoStore = require('connect-mongo')(session);

    var second            = 1000;
    var minute            = 60 * second;
    var hour              = 60 * minute;
    var day               = (hour * 24);
    var year              = 365*day;
    
    var theSession = session({
	secret: config.session.secret,
	resave: false,
	saveUninitialized: false,
	store: new MongoStore({ mongooseConnection: mdb.mongoose.connection }),
	cookie: { maxAge: year,
              secure: true,
              sameSite: 'none' }
    });
    
    app.use(theSession);

    console.log( "Session setup." );

    // We may have a default LTI key
    if (config.ltiAuth) {
	mdb.KeyAndSecret.update(
	    {ltiKey: config.lti.key},
	    {ltiKey: config.lti.key, ltiSecret: config.lti.secret},
	    {upsert: true},
	    function(err) {
	    });
    }
    
    if (config.logging) {
	app.use(expressWinston.logger({
	    transports: [
		new winston.transports.Console({
		    json: true,
		    colorize: true
		})	    
	    ],
	    expressFormat: true, // Use the default Express/morgan request formatting. Enabling this will override any msg if true. Will only output colors with colorize set to true
	    colorize: true, // Color the text and status code, using the Express/morgan color palette (text: gray, status: default green, 3XX cyan, 4XX yellow, 5XX red).
	}));
    }
    
passport.use(login.localStrategy(config.root));
//passport.use(login.googleStrategy(config.root));
passport.use(login.twitterStrategy(config.root));
passport.use('lms', login.lmsStrategy(config.root));    
passport.use(login.githubStrategy(config.root));

// Only store the user _id in the session
passport.serializeUser(function(user, done) {
   done(null, user._id);
});

passport.deserializeUser(function(id, done) {
   mdb.User.findOne({_id: new mongo.ObjectID(id)}, function(err,document) {
       done(err, document);
   });
});

    app.version = config.version;
    
    function redirectMasqueradesAsSelf( req, res, next ) {
	if (req.params.masqueradingUserId) {
	    if (req.user && req.user._id) {
		if (req.params.masqueradingUserId == req.user._id) {
		    var cleanUrl = req.url.replace('users/' + req.params.masqueradingUserId + '/', '' );
		    return res.redirect( 301, cleanUrl );
		}
	    }
	}
	next();
    }

    function private(req, res, next){
        if( config.privateUser !== "none" ) {
            // console.log("PRIVATE_USER = " + config.privateUser + ".");
            basicAuth({
                users: { [config.privateUser]: config.privateCred },
                challenge: true
            })(req, res, next)
        }
        else
            next()
    
    }
    
    function redirectUnnormalizeRepositoryName( req, res, next ) {
        if (req.params.repository) {
            var normalized = req.params.repository.replace( /[^0-9A-Za-z-\*]/, '' ).toLowerCase();
            if (req.params.repository != normalized) {
            var splitted = req.url.split('/');
            splitted[1] = normalized;
            res.redirect(301, splitted.join('/'));
            return;
            }
        }
        if(config.privateRepoWithStar == "1" && req.params.repository.indexOf('*') !== -1)
            private(req,res,next)
        else
            next()
    }	
    
    ////////////////////////////////////////////////////////////////
    // API endpoints for the xake tool

    var limiter = new rateLimit({
	windowMs: 15*60*1000, // 15 minutes 
	max: config.rateLimit, // limit each IP to 100 requests per windowMs 
	delayMs: 0 // disable delaying - full speed until the max limit is reached 
    });

    app.use( '/gpg/', limiter );
    app.use( '/pks/', limiter );
    app.use( '/:repository.git', repositories.normalizeName, limiter );
    
    app.get( '/gpg/token/:keyid', keyserver.token );
    app.get( '/gpg/tokens/:keyid', keyserver.token );
    app.get( '/gpg/secret/:ltiKey/:keyid', keyserver.ltiSecret );
    app.post( '/pks/add', keyserver.add );

    app.post( '/:repository.git', repositories.normalizeName, keyserver.authorization );
    app.post( '/:repository.git', repositories.normalizeName, hashcash.hashcash );
    app.post( '/:repository.git', repositories.normalizeName, page.create );

    app.use( '/:repository.git/log.sz', repositories.normalizeName, page.authorization );
    app.use( '/:repository.git/log.sz', repositories.normalizeName, sendSeekable );
    app.get( '/:repository.git/log.sz', repositories.normalizeName, tincan.get );
    
    app.use( '/:repository.git', repositories.normalizeName, repositories.git );

    ////////////////////////////////////////////////////////////////
    // Static content    

    app.get('/version', function(req, res) {
	res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
	res.header('Expires',  (new Date()).toUTCString() );
	res.send(app.version);
    });


    var sagecellProxyLogEnabled = /^(1|true|yes|on|debug)$/i.test(process.env.SAGECELL_PROXY_LOG || "");

function sagecellProxyLog() {
    if (sagecellProxyLogEnabled) {
console.log.apply(console, arguments);
    }
}

function normalizeSagecellServiceMode(mode) {
    mode = (mode || "local-with-fallback").toLowerCase();

    if (mode === "local" || mode === "local-only") {
return "local-only";
    }

    if (mode === "remote" || mode === "fallback" || mode === "remote-only") {
return "remote-only";
    }

    if (mode === "local-with-fallback" || mode === "fallback-enabled" || mode === "auto") {
return "local-with-fallback";
    }

    console.error("Unknown SAGECELL_SERVICE_MODE:", mode, "using local-with-fallback.");
    return "local-with-fallback";
}

var sagecellServiceMode = normalizeSagecellServiceMode(config.sagecellServiceMode);
var sagecellLocalUnhealthyUntil = 0;

var sagecellProxyCacheLocal = {};
var sagecellProxyCacheFallback = {};
var sagecellProxyInFlight = {};
var sagecellProxyCacheMaxEntries = 5000;

function sagecellProxyCacheSet(cache, key, value) {
    var keys;

    if (!cache[key]) {
keys = Object.keys(cache);

if (keys.length >= sagecellProxyCacheMaxEntries) {
    delete cache[keys[0]];
}
    }

    cache[key] = value;
}

function normalizeXronosSupportTrace(value) {
    if (
        typeof value !== "string" ||
        value.length < 8 ||
        value.length > 96 ||
        !/^xr-[A-Za-z0-9-]+$/.test(value)
    ) {
        return null;
    }

    return value;
}


function sagecellProxyCacheName(source) {
    return source === "fallback" ? "FALLBACK" : "LOCAL";
}

function sagecellProxySendCached(res, entry, source) {
    sagecellProxyLog("SageCell proxy cache HIT-" + sagecellProxyCacheName(source), entry.cacheKey, "len", entry.codeLength);

    res.set('X-SageCell-Proxy-Cache', 'HIT-' + sagecellProxyCacheName(source));
    res.set('X-SageCell-Proxy-Source', source);
    res.set('Content-Type', entry.contentType);
    res.status(entry.statusCode);
    res.send(entry.body);
}

function sagecellProxyContentType(response) {
    if (response && response.headers && response.headers['content-type']) {
return response.headers['content-type'];
    }

    return 'application/json; charset=UTF-8';
}

function sagecellProxyResponseIsCacheable(statusCode, body) {
    var parsed;

    if (!(statusCode >= 200 && statusCode < 300)) {
return false;
    }

    try {
parsed = JSON.parse(body);
    } catch (e) {
return false;
    }

    return parsed && parsed.success === true;
}

function sagecellProxyShouldFallback(err, response) {
    // Treat transport failure, timeout, throttling and server/gateway failures
    // as infrastructure failures. Do not fallback on normal Sage execution
    // errors, which should be returned as HTTP 200 with success:false.
    return sageReliabilityPolicy
        .sagecellProxyShouldFallback(
            err,
            response
        );
}

function sagecellProxyErrorBody(source, err) {
    var message = err && err.message ? err.message : String(err || "unknown error");

    return JSON.stringify({
success: false,
stderr: "SageCell proxy error from " + source + ": " + message
    });
}

function sagecellProxyHttpErrorBody(source, statusCode, body) {
    var bodyText = body === undefined || body === null ? "" : String(body);

    if (bodyText.length > 500) {
        bodyText = bodyText.slice(0, 500) + "...";
    }

    return JSON.stringify({
        success: false,
        stderr: "SageCell " + source + " service returned HTTP " + statusCode + ". Body: " + bodyText
    });
}

function sagecellProxyPost(
    source,
    serviceUrl,
    form,
    supportTrace,
    callback
) {
    sagecellProxyLog(
        "SageCell proxy request",
        "trace",
        supportTrace || "-",
        source,
        serviceUrl
    );

    request.post({
url: serviceUrl,
form: form,
headers: supportTrace
    ? {
        "X-Xronos-Support-Trace":
            supportTrace
    }
    : {},
timeout: 60000
    }, function(err, response, body) {
callback(err, response, body);
    });
}

function sagecellProxyFinish(waitingKey, cacheKey, codeLength, source, statusCode, contentType, body, cacheable) {
    var waiting = sagecellProxyInFlight[waitingKey] || [];

    delete sagecellProxyInFlight[waitingKey];

    if (cacheable) {
if (source === "fallback") {
    sagecellProxyCacheSet(sagecellProxyCacheFallback, cacheKey, {
cacheKey: cacheKey,
codeLength: codeLength,
statusCode: statusCode,
contentType: contentType,
body: body,
source: source,
createdAt: Date.now()
    });
} else {
    sagecellProxyCacheSet(sagecellProxyCacheLocal, cacheKey, {
cacheKey: cacheKey,
codeLength: codeLength,
statusCode: statusCode,
contentType: contentType,
body: body,
source: source,
createdAt: Date.now()
    });
}
    }

    waiting.forEach(function(waitingRes, index) {
waitingRes.set('X-SageCell-Proxy-Cache', index === 0 ? 'MISS' : 'WAIT');
waitingRes.set('X-SageCell-Proxy-Source', source);
waitingRes.status(statusCode);
waitingRes.set('Content-Type', contentType);
waitingRes.send(body);
    });
}

function sagecellProxyFinishError(waitingKey, source, err) {
    var body = sagecellProxyErrorBody(source, err);

    console.error("SageCell proxy error from", source + ":", err);

    sagecellProxyFinish(
waitingKey,
"",
0,
source,
502,
'application/json; charset=UTF-8',
body,
false
    );
}

function sagecellProxyTryFallback(
    waitingKey,
    cacheKey,
    codeLength,
    form,
    supportTrace,
    reason
) {
    sagecellProxyLog("SageCell proxy trying fallback", cacheKey, "reason", reason || "unknown");

    sagecellProxyPost(
        "fallback",
        config.sagecellFallbackService,
        form,
        supportTrace,
        function(err, response, body) {
        var statusCode;
        var contentType;
        var cacheable;

        if (err) {
            sagecellProxyFinishError(waitingKey, "fallback", err);
            return;
        }

        statusCode = response.statusCode || 200;

        if (!(statusCode >= 200 && statusCode < 300)) {
            console.error("SageCell fallback service returned HTTP", statusCode, body);

            sagecellProxyFinish(
                waitingKey,
                cacheKey,
                codeLength,
                "fallback",
                502,
                "application/json; charset=UTF-8",
                sagecellProxyHttpErrorBody("fallback", statusCode, body),
                false
            );

            return;
        }

        contentType = sagecellProxyContentType(response);
        cacheable = sagecellProxyResponseIsCacheable(statusCode, body);

        if (!cacheable) {
            sagecellProxyLog("SageCell proxy fallback response not cached", cacheKey, "status", statusCode);
        }

        sagecellProxyFinish(waitingKey, cacheKey, codeLength, "fallback", statusCode, contentType, body, cacheable);
    });
}


/*
 * Xronos SageCell page authorization.
 *
 * Raw SageCell is an internal compute service. Browser requests must go
 * through /sagecell/service and include a short-lived token issued when Xronos
 * rendered the activity page. This prevents unauthenticated direct use of the
 * Xronos SageCell proxy as a general public code-execution endpoint.
 *
 * For multi-process or multi-server deployments, set SAGECELL_PAGE_AUTH_SECRET
 * to the same long random value everywhere. If omitted, this process uses an
 * ephemeral startup secret, which is fine for a single test server but makes
 * page tokens invalid after restart.
 */
var xronosSagecellPageAuthRequired = (process.env.SAGECELL_REQUIRE_PAGE_AUTH !== "false");
var xronosSagecellPageAuthMaxAgeMs = parseInt(process.env.SAGECELL_PAGE_AUTH_MAX_AGE_MS || "43200000", 10);
var xronosSagecellPageAuthRefreshGraceMs = parseInt(process.env.SAGECELL_PAGE_AUTH_REFRESH_GRACE_MS || "604800000", 10);
var xronosSagecellPageAuthSecret =
    process.env.SAGECELL_PAGE_AUTH_SECRET ||
    process.env.SAGECELL_REQUEST_SIGNING_SECRET ||
    crypto.randomBytes(32).toString("hex");

if (!process.env.SAGECELL_PAGE_AUTH_SECRET && !process.env.SAGECELL_REQUEST_SIGNING_SECRET) {
    console.error("[WARN] SAGECELL_PAGE_AUTH_SECRET is not set; using an ephemeral per-process SageCell page-auth secret.");
}

if (!Number.isFinite(xronosSagecellPageAuthMaxAgeMs) || xronosSagecellPageAuthMaxAgeMs <= 0) {
    xronosSagecellPageAuthMaxAgeMs = 43200000;
}

if (!Number.isFinite(xronosSagecellPageAuthRefreshGraceMs) || xronosSagecellPageAuthRefreshGraceMs <= 0) {
    xronosSagecellPageAuthRefreshGraceMs = 604800000;
}

function xronosSagecellPageAuthSign(payloadString) {
    return crypto
        .createHmac("sha256", xronosSagecellPageAuthSecret)
        .update(payloadString)
        .digest("hex");
}

function xronosSagecellTimingSafeEqual(a, b) {
    var aBuffer;
    var bBuffer;

    if (typeof a !== "string" || typeof b !== "string") {
        return false;
    }

    aBuffer = Buffer.from(a, "utf8");
    bBuffer = Buffer.from(b, "utf8");

    if (aBuffer.length !== bBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function xronosSagecellPageAuthFromPayload(payload) {
    var refreshedPayload;
    var payloadString;

    if (!payload) {
        return {
            required: xronosSagecellPageAuthRequired,
            payload: null,
            token: null
        };
    }

    refreshedPayload = {
        v: 1,
        path: payload.path || "",
        hash: payload.hash || "",
        commit: payload.commit || "",
        xoursePath: payload.xoursePath || "",
        issuedAt: Date.now()
    };

    payloadString = JSON.stringify(refreshedPayload);

    return {
        required: xronosSagecellPageAuthRequired,
        payload: refreshedPayload,
        token: xronosSagecellPageAuthSign(payloadString)
    };
}

function xronosSagecellPageAuth(activity) {
    var payload;
    var payloadString;

    if (!activity) {
        return {
            required: xronosSagecellPageAuthRequired,
            payload: null,
            token: null
        };
    }

    payload = {
        v: 1,
        path: activity.path || "",
        hash: activity.hash || "",
        commit: activity.commit || "",
        xoursePath: activity.xourse && activity.xourse.path ? activity.xourse.path : "",
        issuedAt: Date.now()
    };

    payloadString = JSON.stringify(payload);

    return {
        required: xronosSagecellPageAuthRequired,
        payload: payload,
        token: xronosSagecellPageAuthSign(payloadString)
    };
}

function xronosVerifySagecellPageAuth(req, options) {
    var payloadString;
    var token;
    var expected;
    var payload;
    var age;

    options = options || {};

    if (!xronosSagecellPageAuthRequired) {
        return { ok: true, reason: "disabled" };
    }

    payloadString = req.body && req.body.xronosSagecellPayload;
    token = req.body && req.body.xronosSagecellToken;

    if (!payloadString || !token) {
        return { ok: false, reason: "missing SageCell page authorization" };
    }

    expected = xronosSagecellPageAuthSign(payloadString);

    if (!xronosSagecellTimingSafeEqual(token, expected)) {
        return { ok: false, reason: "invalid SageCell page authorization" };
    }

    try {
        payload = JSON.parse(payloadString);
    } catch (e) {
        return { ok: false, reason: "malformed SageCell page authorization" };
    }

    if (!payload || payload.v !== 1 || !payload.path || !payload.hash || !payload.issuedAt) {
        return { ok: false, reason: "incomplete SageCell page authorization" };
    }

    age = Date.now() - payload.issuedAt;

    if (age < 0) {
        return { ok: false, reason: "expired SageCell page authorization" };
    }

    if (age > xronosSagecellPageAuthMaxAgeMs) {
        if (!options.allowExpired ||
            age > xronosSagecellPageAuthMaxAgeMs + xronosSagecellPageAuthRefreshGraceMs) {
            return { ok: false, reason: "expired SageCell page authorization" };
        }
    }

    return {
        ok: true,
        reason: "ok",
        payload: payload,
        age: age,
        expired: age > xronosSagecellPageAuthMaxAgeMs
    };
}

function xronosSagecellForwardBody(body) {
    var forwardBody = {};
    var key;

    body = body || {};

    for (key in body) {
        if (Object.prototype.hasOwnProperty.call(body, key) &&
            !key.match(/^xronosSagecell/)) {
            forwardBody[key] = body[key];
        }
    }

    return forwardBody;
}

app.locals.xronosSagecellPageAuth = xronosSagecellPageAuth;

app.use(function(req, res, next) {
    res.locals.xronosSagecellPageAuth = xronosSagecellPageAuth;
    next();
});


app.post('/sagecell/auth', function(req, res) {
    var supportTrace =
        normalizeXronosSupportTrace(
            req.get(
                "X-Xronos-Support-Trace"
            )
        );

    var authCheck = xronosVerifySagecellPageAuth(req, { allowExpired: true });

    console.log(
        "XRONOS SUPPORT TRACE",
        supportTrace || "-",
        "sage-auth",
        req.path
    );

    if (!authCheck.ok) {
        console.error("Rejected SageCell page-auth refresh:", authCheck.reason);
        res.status(403).json({
            success: false,
            ename: "XronosSageCellAuthorizationError",
            evalue: authCheck.reason,
            stderr: "SageCell authorization refresh rejected: " + authCheck.reason + "\n"
        });
        return;
    }

    res.json(xronosSagecellPageAuthFromPayload(authCheck.payload));
});


app.post('/sagecell/service', function(req, res) {
    var supportTrace =
        normalizeXronosSupportTrace(
            req.get(
                "X-Xronos-Support-Trace"
            )
        );

    var authCheck = xronosVerifySagecellPageAuth(req);
    var code = (req.body && req.body.code) ? req.body.code : "";

    console.log(
        "XRONOS SUPPORT TRACE",
        supportTrace || "-",
        "sage-service",
        "codeLength",
        code.length
    );
    var sagecellForwardBody = xronosSagecellForwardBody(req.body);
    var cacheKey = crypto.createHash('sha256').update(code).digest('hex');

    if (!authCheck.ok) {
        console.error("Rejected SageCell proxy request:", authCheck.reason);
        res.status(403).json({
            success: false,
            ename: "XronosSageCellAuthorizationError",
            evalue: authCheck.reason,
            stderr: "SageCell request rejected: " + authCheck.reason + "\n"
        });
        return;
    }
    var mode = sagecellServiceMode;
    var now = Date.now();
    var localCacheEntry = sagecellProxyCacheLocal[cacheKey];
    var fallbackCacheEntry = sagecellProxyCacheFallback[cacheKey];
    var localInCooldown = now < sagecellLocalUnhealthyUntil;
    var waitingKey;

    // In normal/fallback-enabled mode, local cache is canonical.  Even during
    // a local outage, a known-good local cached response is safe to return.
    if (mode !== "remote-only" && localCacheEntry) {
sagecellProxySendCached(res, localCacheEntry, "local");
return;
    }

    if (mode === "remote-only" && fallbackCacheEntry) {
sagecellProxySendCached(res, fallbackCacheEntry, "fallback");
return;
    }

    if (mode === "local-with-fallback" && localInCooldown && fallbackCacheEntry) {
sagecellProxySendCached(res, fallbackCacheEntry, "fallback");
return;
    }

    if (mode === "remote-only") {
waitingKey = "fallback:" + cacheKey;
    } else if (mode === "local-only") {
waitingKey = "local:" + cacheKey;
    } else if (localInCooldown) {
waitingKey = "fallback:" + cacheKey;
    } else {
waitingKey = "auto:" + cacheKey;
    }

    if (sagecellProxyInFlight[waitingKey]) {
sagecellProxyLog(
    "SageCell proxy cache WAIT",
    "trace",
    supportTrace || "-",
    waitingKey,
    "len",
    code.length
);
sagecellProxyInFlight[waitingKey].push(res);
return;
    }

    sagecellProxyLog(
    "SageCell proxy cache MISS",
    "trace",
    supportTrace || "-",
    waitingKey,
    "len",
    code.length,
    "mode",
    mode
);
    sagecellProxyInFlight[waitingKey] = [res];

    if (mode === "remote-only") {
sagecellProxyTryFallback(
    waitingKey,
    cacheKey,
    code.length,
    sagecellForwardBody,
    supportTrace,
    "remote-only mode"
);
return;
    }

    if (mode === "local-with-fallback" && localInCooldown) {
sagecellProxyTryFallback(
    waitingKey,
    cacheKey,
    code.length,
    sagecellForwardBody,
    supportTrace,
    "local cooldown"
);
return;
    }

    sagecellProxyPost(
    "local",
    config.sagecellService,
    sagecellForwardBody,
    supportTrace,
    function(err, response, body) {
var statusCode;
var contentType;
var cacheable;

if (mode === "local-with-fallback" && sagecellProxyShouldFallback(err, response)) {
    sagecellLocalUnhealthyUntil = Date.now() + config.sagecellFallbackCooldownMs;
    console.error(
"SageCell local service unavailable; using fallback for",
config.sagecellFallbackCooldownMs,
"ms.",
err || (response && response.statusCode)
    );
    sagecellProxyTryFallback(
        waitingKey,
        cacheKey,
        code.length,
        sagecellForwardBody,
        supportTrace,
        err
            ? err.message
            : "HTTP " +
                (response && response.statusCode)
    );
    return;
}

if (err) {
    sagecellProxyFinishError(waitingKey, "local", err);
    return;
}

statusCode = response.statusCode || 200;
contentType = sagecellProxyContentType(response);
cacheable = sagecellProxyResponseIsCacheable(statusCode, body);

if (!cacheable) {
    sagecellProxyLog("SageCell proxy local response not cached", cacheKey, "status", statusCode);
}

sagecellProxyFinish(waitingKey, cacheKey, code.length, "local", statusCode, contentType, body, cacheable);
    });
});

app.get('/sw.js', function(req, res) {
	res.sendFile('public/javascripts/sw.min.js', { root: __dirname });
    });    
    
    versionator = versionator.createBasic('v' + app.version);
    app.locals.versionPath = function(url) {
	if (url.match(/^\/public\//)) {
	    return url.replace(/^\/public\//, '/public/v' + app.version + '/' );
	}
	if (url.match(/^\/node_modules\//)) {
	    return url.replace(/^\/node\_modules\//, '/node_modules/v' + app.version + '/' );
	}
	return url;	
    };

    app.locals.toValidPath = config.toValidPath

    app.use('/public', versionator.middleware);
    app.use('/public', express.static(path.join(__dirname, 'public'), {maxAge: '1y'}));;
    app.use('/lib/guppy', express.static(path.join(__dirname, 'node_modules/guppy-dev/lib'), {maxAge: '1y'}));
    app.use('/node_modules', versionator.middleware);    
    app.use('/node_modules', express.static(path.join(__dirname, 'node_modules'), {maxAge: '1y'}));


    app.use(passport.initialize());
    app.use(passport.session());
    
    app.use(guests.middleware);
    
    ////////////////////////////////////////////////////////////////
    // Landing page and associated routes
    
    app.get('/',
        page.defaultHomePage
    );
    
    ////////////////////////////////////////////////////////////////
    // TinCan (aka Experience) API

    app.post('/xAPI/statements', function(req,res) { res.status(200).send('ignoring statements without a repository.'); } );
    
    app.post('/:repository/xAPI/statements', repositories.normalizeName, tincan.postStatements);    
    
    ////////////////////////////////////////////////////////////////
    // User identity
    
    app.get('/users/me', user.getCurrent);
    app.get('/users/:id', user.get);
    app.get('/users/:id/edit', user.edit);
    app.post('/users/:id', user.update);

    app.get('/users/', user.index);
    app.get('/users/page/:page', user.index); // pagination in Mongo is fairly slow
    
    app.delete('/users/:id/google', function( req, res, next ) { user.deleteLinkedAccount( req, res, next, 'google' ); } );
    app.delete('/users/:id/github', function( req, res, next ) { user.deleteLinkedAccount( req, res, next, 'github' ); } );
    app.delete('/users/:id/twitter', function( req, res, next ) { user.deleteLinkedAccount( req, res, next, 'twitter' ); } );

    app.put('/users/:id/secret', function( req, res ) { user.putSecret( req, res ); } );

    app.delete('/users/:id/bridges/:bridge', function( req, res, next ) { user.deleteBridge( req, res, next ); } );    

    app.get('/progress-audit/redeem', progressAudit.redeemForm );
    app.post('/progress-audit/redeem', progressAudit.redeemToken );

    ////////////////////////////////////////////////////////////////
    // BADBAD: some permanent redirects for OSU courses from old URLs
    app.get( '/course', function( req, res ) { res.redirect('/mooculus'); });
    app.get( '/courses', function( req, res ) { res.redirect('/mooculus'); });
    app.get( '/courses/', function( req, res ) { res.redirect('/mooculus'); });
    
    app.get( '/course/mooculus/mooculus/:path(*)', function( req, res ) { 
	res.set( 'location', '/mooculus/calculus1/' + req.params.path );
	res.status(301).send();
    });
    app.get( '/course/mooculus/:path(*)', function( req, res ) { 
	res.set( 'location', '/mooculus/' + req.params.path );
	res.status(301).send();
    });
    app.get( '/course/:path(*)', function( req, res ) { 
	res.set( 'location', '/' + req.params.path );
	res.status(301).send();
    });
    app.get( '/activity/:path(*)', function( req, res ) { 
	res.set( 'location', '/' + req.params.path );
	res.status(301).send();
    });    
    // BADBAD: hard redirect zomercursus naar blik-op-wiskunde voor sommige xourses 
    app.get( '/zomercursus/zomercursusWisFys', function( req, res ) { res.redirect(config.toValidPath('/blik-op-wiskunde/zomercursusWisFys')); });
    app.get( '/zomercursus/handboekB', function( req, res ) { res.redirect(config.toValidPath('/blik-op-wiskunde/handboekB')); });
    app.get( '/zomercursus/handboekB/:path(*)', function( req, res ) { 
        res.set( 'location', config.toValidPath('/blik-op-wiskunde/handboekB/') + req.params.path );
        res.status(301).send();
        });
    app.get( '/zomercursus/zomercursusWisFys/:path(*)', function( req, res ) { 
        res.set( 'location', config.toValidPath('/blik-op-wiskunde/zomercursusWisFys/') + req.params.path );
        res.status(301).send();
        });
    
    
    app.get( '/certificate/:certificate/:signature', certificate.view );

    
    app.get( '/statistics/:repository/:path(*)/:activityHash',
	     // include some sort of authorization here -- being an LTI "instuctor" in any xourse in the repo suffices
	     repositories.normalizeName,
	     statistics.get );
    

    ////////////////////////////////////////////////////////////////
    // Logins

    // Google login.
    /*app.get('/auth/google', passport.authenticate('google-openidconnect'));
    app.get('/auth/google/callback',
        passport.authenticate('google-openidconnect', {
            successRedirect: config.toValidPath('/just-logged-in'),
							    failureRedirect: '/auth/google'}));*/

    if (config.localAuth) {
	app.post('/auth/local', 
		 passport.authenticate('local', { failureRedirect: '/' }),
		 function(req, res) {
		     res.redirect('/');
		 });
    }
    
    // Twitter login.
    if (config.twitterAuth) {
	app.get('/auth/twitter', passport.authenticate('twitter'));
	app.get('/auth/twitter/callback',
        passport.authenticate('twitter', {
            successRedirect: config.toValidPath('/just-logged-in'),
						   failureRedirect: '/auth/twitter'}));
    }

    // GitHub login.
    if (config.githubAuth) {
	app.get('/auth/github', passport.authenticate('oauth2'));
	app.get('/auth/github/callback',
        passport.authenticate('oauth2', {
            successRedirect: config.toValidPath('/just-logged-in'),
						  failureRedirect: '/',
						  failureFlash: true}));
    }

    // LTI login
    if (config.ltiAuth) {
        app.post('/lms', passport.authenticate('lms', {
            successRedirect: config.toValidPath('/just-logged-in'),
							failureRedirect: '/',
							failureFlash: true}));
        app.post('/:repository/:path(*)/lti',
                 passport.authenticate('lms', { failureRedirect: '/' }),
                 function(req, res, next) {
                     var destination = '/' + req.params.repository;

                     if (req.params.path) {
                         destination += '/' + req.params.path;
                     }

                     destination = config.toValidPath(destination);

                     if (req.session) {
                         req.session.save(function(err) {
                             if (err) {
                                 return next(err);
                             }
                             res.redirect(destination);
                         });
                     } else {
                         res.redirect(destination);
                     }
                 });
    }
    
    app.get('/logout', function (req, res) {
        req.logout();
        res.redirect('/');
    });

    app.get('/just-logged-in', function (req, res) {
        if (req.user.course) {
	        console.log( "course = ", req.user.course);
            res.redirect(config.toValidPath(req.user.course));
	    } else {
            if (req.user.lastUrlVisited && (req.user.lastUrlVisited != "/") && (!(req.user.lastUrlVisited.match(/\.svg$/)))) {
                console.log( "lastUrlVisited = ", req.user.lastUrlVisited);
                res.redirect(config.toValidPath(req.user.lastUrlVisited));
            } else
                res.redirect(config.toValidPath('/'));
        }
    });
    
    ////////////////////////////////////////////////////////////////
    // Activity page rendering

    app.get( '/:repository/:path(*)/certificate',
	     redirectUnnormalizeRepositoryName,
	     page.activitiesFromRecentCommitsOnMaster,
	     page.chooseMostRecentBlob,
	     page.parseActivity,
	     certificate.xourse );

    // BADBAD: i also need to serve pngs and pdfs and such from the repo here

    app.get( '/:repository/lti-setup',
             redirectUnnormalizeRepositoryName,
             ltiSetup.notAvailable );

    app.get( '/:repository/:path(*)/lti-setup',
             redirectUnnormalizeRepositoryName,
             page.activitiesFromRecentCommitsOnMaster,
             ltiSetup.show );

    app.get( '/:repository/:path(*)/lti.xml',
	     redirectUnnormalizeRepositoryName,
	     page.activitiesFromRecentCommitsOnMaster,
	     page.ltiConfig );    
    
    var serveContent = function( regexp, callback ) {
	// Just ignore masquerades for non-page resources
	app.get( '/users/:masqueradingUserId/:repository/:path(' + regexp + ')',
		 repositories.normalizeName,	
		 page.activitiesFromRecentCommitsOnMaster,		 
		 callback );
	
	app.get( '/:repository/:path(' + regexp + ')',
		 redirectUnnormalizeRepositoryName,
		 page.activitiesFromRecentCommitsOnMaster,
		 callback );
    };

    serveContent( '*.svg', page.serve('image/svg+xml') );
    serveContent( '*.png', page.serve('image/png') );
    serveContent( '*.pdf', page.serve('application/pdf') );
    serveContent( '*.jpg', page.serve('image/jpeg') );
    serveContent( '*.gif', page.serve('image/gif') );
    serveContent( '*.js',  page.serve('text/javascript') );
    serveContent('*.css', page.serve('text/css'));

    app.get( '/:repository/:path(*.tex)',
	     redirectUnnormalizeRepositoryName,
	     page.activitiesFromRecentCommitsOnMaster,
	     page.source );
    
    function parallel(middlewares) {
	return function (req, res, next) {
	    async.each(middlewares, function (mw, cb) {
		mw(req, res, cb);
	    }, next);
	};
    }    
        
    // SVG files will only be rendered if they are sent with content type image/svg+xml
    
    app.locals.moment = require('moment');
    app.locals._ = require('underscore');
    app.locals.config = config;
    app.locals.version = app.version;

    // Start HTTP server for fully configured express App.
    var server = http.createServer(app);

    var wss = new WebSocketServer({server: server});

    ////////////////////////////////////////////////////////////////
    // State storage    
    
    var state = require('./routes/state.js');
    
    state.wss = wss;
    
    wss.on("connection", function (ws, req) {
	cookieParser(config.session.secret)(req, null, function(err) {
	    if (err) {
		winston.error(err);
		return;
	    }
	    
	    theSession(req, {}, function(err, session) {
		if (err) {
		    winston.error(err);
		    return;		    
		} else {
		    ws.session = req.session;
		    state.connection(ws);
		}
	    });
	});
    });
    
    app.get( '/:repository/:path(*)/gradebook',
     repositories.normalizeName,
     gradebook.record );
    app.put( '/:repository/:path(*)/gradebook',
     repositories.normalizeName,
     gradebook.record );

    app.get( '/:repository/:path(*)/progress-audit/token',
     repositories.normalizeName,
     progressAudit.tokenForm );
    app.post( '/:repository/:path(*)/progress-audit/token',
     repositories.normalizeName,
     progressAudit.createToken );

    // Instructors should be based around a context instead?
    app.get( '/:repository/:path(*)/instructors',
	     redirectUnnormalizeRepositoryName,
	     page.activitiesFromRecentCommitsOnMaster,
	     page.chooseMostRecentBlob,
	     parallel([page.fetchMetadataFromActivity,
		       page.parseActivity]),	     
	     instructors.index );

    app.get( '/users/:masqueradingUserId/:repository/:path(*)',
	     redirectUnnormalizeRepositoryName,
	     redirectMasqueradesAsSelf,	     
	     supervising.masquerade,
	     page.activitiesFromRecentCommitsOnMaster,
	     page.chooseMostRecentBlob,
	     parallel([page.fetchMetadataFromActivity,
		       page.parseActivity]),
	     page.renderWithETag );        

    app.get( '/labels/:repository/:label',
	     redirectUnnormalizeRepositoryName,	     	     
	     page.mostRecentMetadata,
	     page.labels	     
	   );    
    
    app.get( '/:repository/:path(*)',
	     redirectUnnormalizeRepositoryName,
	     remember,
	     page.activitiesFromRecentCommitsOnMaster,
	     page.chooseMostRecentBlob,
	     parallel([page.fetchMetadataFromActivity,
                    page.parseActivity]),
         page.renderWithETag);
    
    app.get('/repositories', 
        private, 
        page.repositories)

    app.post('/repositories', 
        private, 
        page.repositoriesRemove, 
        page.repositories)

    app.get( '/:repository',
        //  private,
	     redirectUnnormalizeRepositoryName,	     	     
	     page.mostRecentMetadata,
         xourses.index );      
    
    if(!module.parent){
        server.listen(app.get('port'), function(stream){
	    console.log('Express server listening on port ' + app.get('port'));
    });		    
}    

// If nothing else matches, it is a 404
app.use(function(req, res, next){
    res.status(404).render('404', { status: 404, url: req.url });
});

////////////////////////////////////////////////////////////////
// Present errors to the user

if ('development' == app.get('env')) {
    // Middleware for development only, since this will dump a
	// stack trace
    console.log('Running development version ');
	errorHandler.title = 'Ximera';
    app.use(errorHandler());
}

    app.use(function(err, req, res, next){
	if (res.headersSent) {
	    return next(err);
	}

	if ((err.code) && (err.code == 'ENOENT')) {
            res.status(404).render('404',
				   { status: 404, url: req.url });	    
	} else {
	    res.status(500).render('500', {
		message: err
	    });
	}
    });
});
