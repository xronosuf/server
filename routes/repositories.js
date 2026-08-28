/* Accessing the repositories stored on the filesystem through nodegit
 * is tragically slow.  This module, by acting as an intermediary to
 * everything nodegit, provides us with an opportunity to cache its
 * output (and invalidate that cache whenever we receive a push). 
 */

var nodegit = require('nodegit');
var path = require('path');
var fse = require("fs-extra");
var fs = require("fs");
var crypto = require('crypto');
var page = require('./page');
var backend = require('git-http-backend');
var spawn = require('child_process').spawn;
var debug = require('debug')('repositories')
var gitCli = require('../scripts/modernization/git-cli-read');

var config = require('../config');
var gitRepositoriesRoot = config.repositories.root;

////////////////////////////////////////////////////////////////
// We use both cachify (to simplify some caching) and also a
// connection to redis (to handle expiry)
var cachify = require('./cachify');
const Redis = require("ioredis");
var state = require('./state');

// create a new redis client and connect to our local redis instance
var client = new Redis ({ host: config.redis.url, port: config.redis.port });

// if an error occurs, print it to the console
client.on('error', function (err) {
    console.log("Error " + err);
});

var repositoryCache = {};

exports.normalizeName = function( req, res, next ) {
    if (req.params.repository)
	req.params.repository = req.params.repository.replace( /[^0-9A-Za-z-\*]/, '' ).toLowerCase();
    next();
}

function invalidateRepositoryCache(repositoryName) {
    delete repositoryCache[repositoryName];

    client.smembers("activities:" + repositoryName, 
		  function (err, items) {
		      if (err) {
		      } else {
			  // BADBAD: it'd be better if this were not blocking
			  if (items.length > 0)
			      client.del(items);
			  
			  client.del("activities:" + repositoryName);

			  state.push( repositoryName );
		      }
		  });
};

function openRepository(repositoryName) {
    var repositoryPath = path.resolve(gitRepositoriesRoot, repositoryName + '.git');

    return new Promise( function(resolve,reject) {
	if (repositoryName in repositoryCache) {
	    resolve( repositoryCache[repositoryName] );
	} else {
	    fs.stat(repositoryPath, function (err, stats){
		if (err || !stats.isDirectory()) {
		    if (err)
			reject(err);
		    else
			reject('The repository is not a directory.');
		} else {
		    repositoryCache[repositoryName] = nodegit.Repository.openBare(repositoryPath);
		    resolve( repositoryCache[repositoryName] );
		}
	    });
	}
    });
};

// BADBAD: should normalize repositoryname here
exports.git = function(req, res) {
    var repositoryName = req.params.repository;
    var dir = path.join(gitRepositoriesRoot, repositoryName + '.git');

    if ((req.query) && (req.query.service == 'git-upload-pack')) {
	req.query = {};
	req.url = req.url.replace( /\?.*/, '' );
    }
    
    // If they didn't ask for a service, just provide the dumb protocol
    if ((Object.keys(req.query).length == 0) && (req.method == 'GET')) {
	if (req.url.match(/^\/objects\/[0-9a-f]{2}\/[0-9a-f]{38}$/) ||
	    req.url.match(/^\/objects\/pack\/pack-[0-9a-f]{40}.(pack|idx)$/) ||
	    req.url.match(/^\/objects\/info\/packs$/) ||
	    req.url.match(/^\/HEAD$/) ||
	    req.url.match(/^\/info\/refs$/)) {
	    res.sendFile(path.join(dir + req.url));
	    return;
	}

	if (req.url.match(/objects\/info\/http-alternates/)) {
	    res.status(200).send('');
	    return;
	}

	res.sendStatus(500);
	
	return;
    }
    
    req.pipe(backend(req.url, function(err, service) {
	if (err) {
	    res.statusCode = 500;
	    res.end(err + '\n');
	    return;
	}
	
	res.setHeader('content-type', service.type);

	// If the request is to modify our repository in some form...
	if (service.cmd !== 'git-upload-pack') {
	    // Only then do we require that a bearer token be presented
	    page.authorization( req, res, function(err) {
		if (err) {
		    res.status(500).send(err);
		} else {
		    var ps = spawn(service.cmd, service.args.concat(dir));
		    ps.stdout.pipe(service.createStream()).pipe(ps.stdin);

		    ps.on('close', (code) => {
			// After we've recevied data, we should create the info files
			spawn("git",
			      ["update-server-info"],
			      { cwd: dir });

			// And tell the user that they should reload
			invalidateRepositoryCache( repositoryName );
		    });
		}
	    });
	} else {
	    var ps = spawn(service.cmd, service.args.concat(dir));
	    ps.stdout.pipe(service.createStream()).pipe(ps.stdin);
	}
    })).pipe(res);
};

exports.readRepositoryToken = function( repositoryName ) {
    var repositoryPath = path.resolve(gitRepositoriesRoot, repositoryName + '.git');

    return new Promise( function(resolve, reject) {
	nodegit.Repository.openBare(repositoryPath).then(function(repository) {
	    repository.config().then(function(config) {
		config.getStringBuf('ximera.token').then(function(buf) {
		    resolve(buf);
		}).catch(function(e) {
		    reject('Repository ' + repositoryName + '.git is missing a Ximera token.');
		});
	    });
	}).catch(function(e) {
	    reject('Repository ' + repositoryName + '.git not found.');
	});
    });
};

function makeTokenForKey( repository, keyid ) {
    return new Promise( function(resolve, reject) {
	repository.config().then(function(config) {
	    // Use config
	    crypto.randomBytes(48, function(err, buffer) {
		var token = buffer.toString('base64');
		config.setString ('ximera.keyid', keyid).
		    then(function(result) {
			config.setString ('ximera.token', token);
			resolve(token);
		    });
	    });
	}).catch(function(e) {
	    reject('Could not save token.');
	});
    });
}

exports.create = function(repositoryName, givenKeyid) {
    var repositoryPath = path.resolve(gitRepositoriesRoot, repositoryName + '.git');

    return new Promise( function(resolve, reject) {
	nodegit.Repository.open(repositoryPath).then(function(repository) {
	    // Repository already exists.
	    repository.config().then(function(config) {
		config.getStringBuf('ximera.keyid').then(function(keyid) {
		    if (keyid == givenKeyid)
			resolve(makeTokenForKey( repository, keyid ));
		    else
			reject('You do not own the repository.'); // 403
		}).catch(function(e) {
		    reject('Repository ' + repositoryName + '.git is missing a GPG key fingerprint.'); // 404
		});
	    });
	}).catch(function(e) {
	    fse.ensureDir(repositoryPath, function(err) {
		if (err) {
		    reject(err); // 400
		} else {
		    nodegit.Repository.init(repositoryPath, 1).then(function(repository) {
			resolve(makeTokenForKey( repository, givenKeyid ));
		    }).catch(function(e) {
			reject('Could not create repository.'); //  409
		    });
		}
	    });
	});
    });
};


// We never need to invalidate blobs, because blobs are keyed by a
// hash of their content
exports.readBlob = function(repositoryName, blobHash) {
    return new Promise(function(resolve, reject) {
        cachify.string(
            "blob:" + blobHash,
            function(callback) {
                gitCli.verifyRepository(
                    gitRepositoriesRoot,
                    repositoryName
                )
                    .then(function(repository) {
                        return gitCli.readBlob(
                            repository,
                            blobHash
                        );
                    })
                    .then(function(blob) {
                        callback(null, blob);
                    })
                    .catch(function(err) {
                        callback(err);
                    });
            },
            function(err, blob) {
                if (err)
                    reject(err);
                else
                    resolve(blob);
            }
        );
    });
};

exports.activitiesFromRecentCommitsOnMaster = function(repositoryName, pathname) {
	return exports.cachedActivitiesFromRecentCommits(repositoryName, "master", pathname);
};

exports.cachedActivitiesFromRecentCommits = function(repositoryName, branchName, pathname) {
    return new Promise( function(resolve, reject) {
	var key = "activities:" + repositoryName + ":" + branchName + "/" + pathname;
        debug("CACHE " + pathname);
    
	client.get(key, function(err, result) {
	    if (err) {
		reject(err);
	    } else {
		if (result) {
		    // console.log("CACHE GOT" +result);
		    resolve( JSON.parse(result) );
		} else {
		    exports.activitiesFromRecentCommits(repositoryName, branchName, pathname)
			.then( function(activities) {
			    client.setex(key, 31557600, JSON.stringify(activities) );
			    client.sadd("activities:" + repositoryName, key);
			    resolve(activities);
			})
			.catch( function(err) {
			    reject(err);
			});
		}
	    }
	});
    });
};

// We should be caching this somewhere, and then invalidating the
// cache whenever we push something to the given repo.
function possibleActivityPaths(pathname) {
    var parts = pathname.split('/');
    var possiblePaths = [];

    for (var i = 0; i <= parts.length; i++) {
        var partialPath =
            parts.slice(0, i).join('/');
        var remainder =
            parts.slice(i).join('/');

        debug(
            'Path ' +
            partialPath +
            " || " +
            remainder +
            '(.html)'
        );

        possiblePaths.push({
            path: partialPath + '.html',
            remainder: remainder
        });

        possiblePaths.push({
            path: partialPath + '.html',
            remainder: remainder + '.html'
        });
    }

    return possiblePaths;
}

async function activityFromPublishedCommit(
    repositoryName,
    repositoryPath,
    publication,
    pathname
) {
    var activity = {
        sha: publication.sha,
        sourceSha: publication.sourceSha
    };

    var possiblePaths =
        possibleActivityPaths(pathname);

    for (
        var i = 0;
        i < possiblePaths.length;
        i++
    ) {
        var item = possiblePaths[i];
        var treeEntry;

        try {
            treeEntry = await gitCli.treeEntry(
                repositoryPath,
                publication.sha,
                item.remainder
            );
        } catch (err) {
            continue;
        }

        if (
            !treeEntry ||
            treeEntry.type !== 'blob'
        ) {
            continue;
        }

        activity.activityHash = treeEntry.sha;
        activity.hash = treeEntry.sha;
        activity.path = treeEntry.path;

        activity.downloads =
            await exports.downloadsFromActivity(
                repositoryName,
                activity.path,
                repositoryPath,
                publication.sha
            );

        var xourseEntry;

        try {
            xourseEntry = await gitCli.treeEntry(
                repositoryPath,
                publication.sha,
                item.path
            );
        } catch (err) {
            continue;
        }

        if (
            !xourseEntry ||
            xourseEntry.type !== 'blob'
        ) {
            continue;
        }

        debug(
            'Found xourse ' +
            xourseEntry.path
        );

        activity.xourse = {
            path: xourseEntry.path,
            hash: xourseEntry.sha
        };

        activity.downloads_xourse =
            await exports.downloadsFromActivity(
                repositoryName,
                xourseEntry.path,
                repositoryPath,
                publication.sha
            );

        try {
            var metadataEntry =
                await gitCli.treeEntry(
                    repositoryPath,
                    publication.sha,
                    "metadata.json"
                );

            if (
                metadataEntry &&
                metadataEntry.type === 'blob'
            ) {
                activity.metadataHash =
                    metadataEntry.sha;
            }
        } catch (err) {
            console.log(
                "No metadata.json for " +
                activity.path
            );
        }

        break;
    }

    return activity;
}

exports.activitiesFromRecentCommits = function(
    repositoryName,
    branchName,
    pathname
) {
    return gitCli.verifyRepository(
        gitRepositoriesRoot,
        repositoryName
    )
        .then(function(repositoryPath) {
            return gitCli.recentPublishedCommits(
                repositoryPath,
                branchName,
                100
            ).then(function(publications) {
                return Promise.all(
                    publications.map(
                        function(publication) {
                            return activityFromPublishedCommit(
                                repositoryName,
                                repositoryPath,
                                publication,
                                pathname
                            );
                        }
                    )
                );
            });
        });
};

exports.downloadsFromActivity = function(
    repositoryName,
    activityPath,
    repositoryPath,
    commitSha
) {
    const activityFilePathWithoutExtension =
        activityPath
            .split('.')
            .slice(0, -1)
            .join('.');

    debug('DOWNLOADS ' + activityPath);

    return gitCli.recursiveTreeEntries(
        repositoryPath,
        commitSha,
        'ximera-downloads'
    )
        .then(function(entries) {
            return entries
                .map(function(entry) {
                    return entry.path;
                })
                .map(function(p) {
                    return {
                        p: p,
                        m: p.match(
                            new RegExp(
                                'ximera-downloads/(([^/]*)/' +
                                activityFilePathWithoutExtension +
                                '\\..*)$'
                            )
                        )
                    };
                })
                .filter(function(item) {
                    return item.m;
                })
                .map(function(item) {
                    var label = item.m[2];

                    return {
                        label: label,
                        url: config.toValidPath(
                            '/' +
                            repositoryName +
                            '/' +
                            item.p
                        )
                    };
                });
        })
        .catch(function() {
            console.log(
                "No ximera-downloads folder for " +
                activityPath
            );

            return [];
        });
};

exports.mostRecentMetadataOnBranch = function(
    repositoryName,
    branchName
) {
    return gitCli.verifyRepository(
        gitRepositoriesRoot,
        repositoryName
    )
        .then(function(repositoryPath) {
            return gitCli.recentPublishedCommits(
                repositoryPath,
                branchName,
                100
            ).then(function(commits) {
                if (!commits.length) {
                    throw new Error(
                        "No published commits found."
                    );
                }

                return gitCli.treeEntry(
                    repositoryPath,
                    commits[0].sha,
                    "metadata.json"
                ).then(function(entry) {
                    if (
                        !entry ||
                        entry.type !== 'blob'
                    ) {
                        throw new Error(
                            "metadata.json not found."
                        );
                    }

                    return gitCli.readBlob(
                        repositoryPath,
                        entry.sha
                    );
                });
            });
        });
};

function publishedCommitMetadata(
    repositoryPath,
    commitSha
) {
    return gitCli.runGitText(
        repositoryPath,
        [
            'show',
            '-s',
            '--format=%cn <%ce> %ct %cd',
            '--date=format:%z',
            commitSha
        ]
    ).then(function(lastCommitInfo) {
        return gitCli.runGitText(
            repositoryPath,
            [
                'show',
                '-s',
                '--format=%ct',
                commitSha
            ]
        ).then(function(epoch) {
            return {
                lastCommitInfo: lastCommitInfo,
                lastCommitDate:
                    new Date(
                        Number(epoch) * 1000
                    )
            };
        });
    });
}

function repositoryListEntry(repository) {
    var repositoryPath =
        gitCli.repositoryPath(
            gitRepositoriesRoot,
            repository.name
        );

    return gitCli.verifyRepository(
        gitRepositoriesRoot,
        repository.name
    )
        .then(function() {
            return gitCli.recentPublishedCommits(
                repositoryPath,
                'master',
                100
            );
        })
        .then(function(commits) {
            if (!commits.length) {
                return {
                    name: repository.name,
                    deleteable:
                        repository.deleteable,
                    lastCommitInfo: '',
                    lastCommitDate: ''
                };
            }

            return publishedCommitMetadata(
                repositoryPath,
                commits[0].sha
            ).then(function(metadata) {
                return {
                    name: repository.name,
                    deleteable:
                        repository.deleteable,
                    lastCommitInfo:
                        metadata.lastCommitInfo,
                    lastCommitDate:
                        metadata.lastCommitDate
                };
            });
        })
        .catch(function(err) {
            console.error(err);

            return {
                name: repository.name,
                deleteable:
                    repository.deleteable,
                lastCommitInfo: '',
                lastCommitDate: ''
            };
        });
}

exports.getRepositories = function() {
    var repositoriesPath =
        path.resolve(gitRepositoriesRoot);

    var repositories =
        fs.readdirSync(
            repositoriesPath,
            { withFileTypes: true }
        )
            .filter(function(entry) {
                return entry.isDirectory();
            })
            .map(function(entry) {
                return entry.name.match(
                    new RegExp('(.*)\\.git')
                );
            })
            .filter(function(match) {
                return match;
            })
            .map(function(match) {
                return {
                    name: match[1],
                    deleteable:
                        match[1].indexOf('*') > -1
                };
            });

    return Promise.all(
        repositories.map(repositoryListEntry)
    ).then(function(repos) {
        return repos.sort(function(r1, r2) {
            if (
                r1.lastCommitDate !== '' &&
                r2.lastCommitDate !== ''
            ) {
                return -r1.lastCommitDate
                    .toISOString()
                    .localeCompare(
                        r2.lastCommitDate
                            .toISOString()
                    );
            }

            if (
                r1.lastCommitDate === '' &&
                r2.lastCommitDate === ''
            ) {
                return r1.name.localeCompare(
                    r2.name
                );
            }

            if (r1.lastCommitDate === '') {
                return -1;
            }

            if (r2.lastCommitDate === '') {
                return 1;
            }

            return 0;
        });
    });
}

exports.remove = function (repo) {
	if(repo.indexOf('*') > -1){
		var repositoryPath = path.resolve(gitRepositoriesRoot, `${repo}.git`);
		invalidateRepositoryCache(repo)
		fse.removeSync(repositoryPath)
	}
}
