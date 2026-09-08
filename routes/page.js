var async = require('async');
var mdb = require('../mdb');
var winston = require("winston");
var mongoose = require('mongoose');
var path = require('path');
var url = require('url');
var fs = require('fs');
var url = require('url');
var _ = require('underscore');
var repositories = require('./repositories');
var metadata = require('./metadata');
var ETag = require('./etag');
var striptags = require('striptags');
var url = require('url');
var config = require('../config');
var crypto = require('crypto');
var fixActivityHTML = require('../lib/activity-html-compat');

function authorization(req,res,next) {
    var authorization = undefined;
    var token = undefined;
    
    if (req.headers.authorization) {
	authorization = req.headers.authorization;
    } else if (req.get('Authorization')) {
	authorization = req.get('Authorization');	
    }

    if (authorization === undefined) {
	res.statusCode = 401;
	var realm = "Authorization required";
	res.setHeader('WWW-Authenticate', 'Basic realm="' + realm + '"');
	res.end('Unauthorized');	
    } else {
	var token = "";
	var parts = authorization.split(' ');

	if (parts[0].match(/Bearer/)) {
	    token = parts.reverse()[0];
	}
	
	if (parts[0].match(/Basic/)) {
	    token = new Buffer(parts[1], 'base64').toString();
	    token = token.split(":").reverse()[0];
	}
	
	var repositoryName = req.params.repository;

	repositories.readRepositoryToken( repositoryName )
	    .then(function(buf) {
		if (buf == token) {
		    next();
		} else
		    next(new Error('Bearer token is invalid.'));
	    }).catch(function(e) {
		next(new Error(e));
	    });
    }
}

exports.authorization = authorization;

exports.create = function(req, res) {
    var repositoryName = req.params.repository;

    repositories.create( repositoryName, req.keyid )
	.then(function(token) {
	    res.json( {token:token,keyid:req.keyid} );
	})
	.catch(function(err) {
	    res.status(400).send(err);	    
	});
    
    return;
};

/*
 * Explicitly retired legacy activity-route prefixes.
 *
 * These are historical MAC2233 aliases created by an accidental publication
 * in which section xourse files were placed at the wrong level.  The actual
 * activity blobs are still required by the correctly prefixed publications,
 * so the bad public URLs cannot be removed by deleting those blobs.
 *
 * This is intentionally an explicit compatibility deny-list.  It must NOT be
 * generalized into a rule that activities require an associated xourse:
 * future publication models (including Modulus) may not preserve that
 * assumption.
 */
var retiredActivityRoutePrefixes = {
    mac2233: [
        'Limits/',
        'ApplicationsOfDerivatives/',
        'TheoryOfDerivatives/',
        'Integration/'
    ]
};

function isRetiredActivityRoute(repositoryName, pathname) {
    var repository =
        String(repositoryName || '').toLowerCase();

    var route = String(pathname || '');

    var prefixes =
        retiredActivityRoutePrefixes[repository] || [];

    return prefixes.some(function(prefix) {
        return route.indexOf(prefix) === 0;
    });
}

exports.activitiesFromRecentCommitsOnMaster = function(req, res, next) {
    var repositoryName = req.params.repository;
    req.repositoryName = req.params.repository;

    if (
        isRetiredActivityRoute(
            repositoryName,
            req.params.path
        )
    ) {
        return res.status(404).render(
            '404',
            {
                status: 404,
                url: req.url,
                repositoryName: req.repositoryName
            }
        );
    }

    repositories.activitiesFromRecentCommitsOnMaster( repositoryName, req.params.path )
	.then( function(activities) {
	    req.activities = activities;
	    next();
	})
	.catch( function(err) {
	    next(err);
	});
};


exports.parseActivity = function(req,res,next) {
    if (req.activity.hash) {
	metadata.parseActivityBlob( req.repositoryName, req.activity.path, req.activity.hash, function(err, activity) {
		req.activity = _.extend( req.activity, activity );
		req.activity.html = exports.fixHTML(req.activity);
	    next();
	});
    } else {
        res.status(404).render('404', { status: 404, url: req.url, repositoryName: req.repositoryName });
    }
};

exports.fixHTML = function (activity) {
	return fixActivityHTML(activity.html);
}


function normalizeActivityPathForBridge(path) {
    if (!path) {
return undefined;
    }

    return String(path).replace(/\.html$/, '');
}

function uniqueDefined(values) {
    var seen = {};
    var result = [];

    values.forEach(function(value) {
if (value === undefined || value === null || value === '') {
    return;
}

if (!seen[value]) {
    seen[value] = true;
    result.push(value);
}
    });

    return result;
}

function hashedRandomizationScope(scope) {
    return crypto
.createHash('sha256')
.update(scope)
.digest('hex')
.slice(0, 32);
}

function fallbackRandomizationScope(repositoryName) {
    return hashedRandomizationScope('public:' + repositoryName);
}

function randomizationScopeForActivity(req, activity, callback) {
    var repositoryName = req.repositoryName || req.params.repository;
    var fallback = fallbackRandomizationScope(repositoryName);

    if (!req.user || !req.user._id || req.user.isGuest) {
callback(null, fallback);
return;
    }

    var bridgePaths = uniqueDefined([
normalizeActivityPathForBridge(req.params.path),
normalizeActivityPathForBridge(activity && activity.path),
normalizeActivityPathForBridge(activity && activity.xourse && activity.xourse.path)
    ]);

    if (bridgePaths.length === 0) {
callback(null, fallback);
return;
    }

    mdb.LtiBridge
.findOne({
    user: req.user._id,
    repository: repositoryName,
    path: { $in: bridgePaths },
    contextId: { $exists: true, $ne: null }
})
.sort({ _id: -1 })
.exec()
.then(function(bridge) {
    if (!bridge || !bridge.contextId) {
        callback(null, fallback);
        return;
    }

    callback(
        null,
        hashedRandomizationScope(
            'canvas-context:' +
            bridge.contextId
        )
    );
})
.catch(function(err) {
    callback(err);
});
}



function scopedSageBaseSeedsEnabled() {
    if (config.scopedSageBaseSeeds) {
return true;
    }

    if (!config.scopedSageBaseSeedsAfter) {
return false;
    }

    var cutoff = Date.parse(config.scopedSageBaseSeedsAfter);

    if (isNaN(cutoff)) {
return false;
    }

    return Date.now() >= cutoff;
}


exports.renderWithETag = function(req, res, next) {
    var activity = req.activity;

    randomizationScopeForActivity(req, activity, function(err, randomizationScope) {
if (err) {
    next(err);
    return;
}

req.randomizationScope = randomizationScope;
req.scopedSageBaseSeeds = scopedSageBaseSeedsEnabled();
var etag = 'sha:' + activity.hash +
    ':application-version:' + config.version +
    ':randomization-scope:' + randomizationScope +
    ':scoped-sage-base-seeds:' + req.scopedSageBaseSeeds;

ETag.checkIfNoneMatch( req, res, etag,
       function( setETag ) {
   setETag(res);
   res.set('Cache-Control', 'private, no-cache');
   exports.render( req, res, next );
       } );
    });
};
			       
exports.render = function(req, res, next) {
	var activity = req.activity;
	// console.log("Downloads of " + req.activity.path + ": " + JSON.stringify(activity.downloads))

    if (activity.kind == 'xourse') {
	var xourse = activity;
	xourse.path = req.activity.path;
	if (xourse.path) {
	    xourse.path = xourse.path.replace(/\.html$/,'')
	}

	var logo = undefined;
	if (xourse.logo) {
	    logo = url.resolve(config.root, path.join( req.repositoryName, xourse.logo ) );
	}
	res.render('xourses/view', { xourse: xourse,
				     url: req.url,
				     logo: logo,
				     learner: req.learner,
				     user: req.user,				     
				     repositoryName: req.repositoryName });
	return;
    }
    
    activity.freshestCommit = req.activity.freshestCommit;
    activity.commit = req.activity.sourceSha;
    activity.path = req.activity.path;
    if (activity.path) {
	activity.path = activity.path.replace(/\.html$/,'')
	}
	
    if (req.activity.xourse) {
	metadata.parseXourseBlob( req.repositoryName, req.activity.path, req.activity.xourse.hash, function(err,xourse) {
	    xourse.path = req.activity.xourse.path;
	    xourse.hash = req.activity.xourse.hash;
	    
	    if (xourse.path) {
		xourse.path = xourse.path.replace(/\.html$/,'')
	    }
	    
	    activity.xourse = xourse;
	    
	    var nextActivity = null;
	    var previousActivity = null;
	    if (activity && (activity.xourse) && (activity.xourse.activityList)) {
		var list = activity.xourse.activityList.filter( function(s) { return !(s.match(/^#/) || s.match(/^http/) ); } );
		var i = list.indexOf( activity.path );
		if (i >= 0)
		    nextActivity = list[i+1];
		if (i > 0)
		    previousActivity = list[i-1];
	    }
	    
	    var xourseActivity = activity.xourse.activities[activity.path];
	    if (xourseActivity) {
		var cssClass = xourseActivity.cssClass;
		
		// If we aren't currently in a chapter..
		if ( ! (cssClass && (cssClass.match(/chapter/)))) {
		    // Find the current activity
		    var i = activity.xourse.activityList.indexOf( activity.path );
		    // Walk backwards...
		    var j;
		    for( j = i; j >= 0; j-- ) {
			// Until we find a 'chapter' activity
			if (activity.xourse.activities[activity.xourse.activityList[j]].cssClass) {
			    if (activity.xourse.activities[activity.xourse.activityList[j]].cssClass.match(/chapter/))  {
				activity.chapter = activity.xourse.activities[activity.xourse.activityList[j]];
				break;
			    }
			}
		    }
		}
	    }
	    
	    res.render('page', { activity: activity,
				 description: striptags(activity.description ? activity.description : ""),
				 repositoryName: req.repositoryName,
				 repositoryMetadata: req.repositoryMetadata,
				 nextActivity: nextActivity,
				 learner: req.learner,
				 user: req.user,		 
				 previousActivity: previousActivity,
				 randomizationScope: req.randomizationScope || fallbackRandomizationScope(req.repositoryName),
				 scopedSageBaseSeeds: req.scopedSageBaseSeeds || scopedSageBaseSeedsEnabled(),
				 url: req.url });		    
	});
    } else {
	activity.xourse = {};
	activity.xourse.activityList = [];
	res.render('page', { activity: activity,
			     description: striptags(activity.description ? activity.description : ""),			     
			     repositoryMetadata: req.repositoryMetadata,
			     repositoryName: req.repositoryName,
			     learner: req.learner,
			     user: req.user,			     
			     randomizationScope: req.randomizationScope || fallbackRandomizationScope(req.repositoryName),
			     scopedSageBaseSeeds: req.scopedSageBaseSeeds || scopedSageBaseSeedsEnabled(),
			     url: req.url });
    }
};


/*
 * Always select the newest published activity for each new page request.
 * Ximera's current publication policy favors forced updates because keeping
 * learners on several historical page generations creates confusing and hard
 * to diagnose differences in content, CSS, JavaScript, and other page assets.
 * Existing already-open tabs are deliberately left alone; the newest version
 * takes effect only on the learner's next navigation or reload, where the new
 * activity hash naturally receives fresh state while older state remains stored.
 */
exports.chooseMostRecentBlob = function(req, res, next) {
    var activities = req.activities || [];
    var activity = activities[0];

    if (activity === undefined) {
        res.status(500).send("no activity found.");
        return;
    }

    var userId = req.user._id;

    if (req.learner) {
        userId = req.learner._id;
    }

    mdb.State.updateOne(
        {
            activityHash: activity.activityHash,
            user: userId
        },
        {
            $setOnInsert: {
                data: {}
            }
        },
        {
            upsert: true
        }
    )
        .exec()
        .then(function() {
            req.activity = activity;
            next();
        })
        .catch(function(err) {
            res.status(500).send(err);
        });
};

exports.serve = function( mimetype ){
    return function(req, res, next) {    
	var file = req.activities[0];
	var etag = 'sha:' + file.hash;

	ETag.checkIfNoneMatch( req, res, etag,
			       function( setETag ) {
				   repositories.readBlob( req.repositoryName, file.hash )
				       .then( function(blob) {
					   file.data = blob;
					   res.contentType( mimetype );
					   setETag( res );	
					   res.set('Cache-Control', 'public, no-cache');	
					   res.end( blob, 'binary' );		
				       })
				       .catch( function(err) {
						   if (mimetype === 'text/css') {
						       res.contentType('text/css');
						       res.set('Cache-Control', 'no-store');
						       res.status(200).send('');
						       return;
					   }

					   res.sendStatus(404)
					   		//next(new Error(err));
				       });
			       });
    };
};

exports.source = function(req, res, next) {
    var file = req.activities[0];
    repositories.readBlob( req.repositoryName, file.hash )
	.then( function(blob) {
	    file.data = blob;
	    res.render('source', { file: file });
	})
	.catch( function(err) {
	    next(new Error(err));
	});
};

exports.ltiConfig = function(req, res) {
    var file = req.activities[0];
    var hash = {
	title: 'Ximera ' + file.path.replace(/\.html$/,''),
	description: '',
	launchUrl: config.root + '/' + req.params.repository + '/' + req.params.path + '/lti',
	domain: url.parse(config.root).hostname
    };
        
    res.render('lti/config', hash);
};


exports.fetchMetadataFromActivity = function(req, res, next) {
    if (req.activity.metadataHash) {
	repositories.readBlob( req.repositoryName, req.activity.metadataHash )
	    .then( function(blob) {
		req.repositoryMetadata = JSON.parse(blob);
		next();	    
	})
	.catch( function(err) {
		next(new Error(err));
	    });
    } else {
	next();
    }
};

exports.mostRecentMetadata = function(req, res, next) {
    var repositoryName = req.params.repository;
    req.repositoryName = req.params.repository;
    
	repositories.mostRecentMetadataOnBranch(repositoryName, "master" )
	.then( function(metadata) {
	    req.repositoryMetadata = JSON.parse(metadata);
	    next();	    
	})
	.catch( function(err) {
	    // Missing pages fall through
	    if (err.code == 'ENOENT')
		next(null);
	    else
		next(err);
	});
};


// If there is a main/index.html, use that; if not: there is a default index.pug
exports.defaultHomePage = function(req, res, next) {
	if ( ! config.homeRepo )   // The default index.pug homepage
		res.render('index', { title: 'Home', landingPage: true });
	else {
		req.params.repository = config.homeRepo;
		req.params.path = config.homeXourse + "/" + config.homeActivity;
		req.repositoryName = req.params.repository;
    	repositories.activitiesFromRecentCommitsOnMaster( req.repositoryName, req.params.path )
		.then( function(activities) {
			res.set( 'location', config.toValidPath('/'+req.repositoryName+'/' + req.params.path ));
			res.status(307).send();
	    // req.activities = activities;
	    // next();
		})
		.catch( function(err) {
			console.log("No main/index.html homepage found; use default index.pug");
			res.render('index', { title: 'Home', landingPage: true });
	    	// next(err);
	    	// next(err);
		});
	}
};

exports.repositories = function (req, res, next) {
	repositories.getRepositories().then(repos => {
		res.render('repositories', { title: 'Home', repos });
	})
};

exports.repositoriesRemove = function (req, res, next) {
	repositories.remove(req.body.repo)
	next()
};

exports.labels = function(req, res) {
    var label = req.params.label;

    if (req.repositoryMetadata) {
	if (label in req.repositoryMetadata.labels)
	    res.json( req.repositoryMetadata.labels[label] );
	else {
	    res.status(404).send("");	    		    
	}
    } else {
	res.status(500).send("");
    }
};
