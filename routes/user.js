
/*
 * GET users listing.
 */

var crypto = require('crypto');
var uuid = require('node-uuid');
var validator = require('validator');
var moment = require('moment');
var async = require('async');
var mdb = require('../mdb');
var config = require('../config');   // for toValidPath ...

function hasPermissionToView( viewer, viewee ) {
    if (viewer._id.equals(viewee._id))
	return "this is you.";

    if ((viewee.visibility == "users") && (!(viewer.isGuest)))
	return "this profile is being shared with other learners";

    if (viewee.visibility == "everyone")
	return "this profile is visible to everyone";

    if (viewer.superuser)
	return "you are a superuser";
    
    return false;
}

function hasPermissionToEdit( viewer, viewee ) {
    if ( ! hasPermissionToView( viewer, viewee ))
	return false;

    if (viewer._id.equals(viewee._id))
	return "this is you.";	

    if (viewer.superuser)
	return "you are a superuser";	

    return false;
}



exports.getCurrent = async function(req, res, next){
    if (req.accepts('html')) {
        res.redirect(
            302,
            config.toValidPath(
                '/users/' + req.user._id
            )
        );
        return;
    }

    if (!req.user) {
        res.json(0);
        return;
    }

    var user =
        Object.assign(
            {},
            req.user.toObject()
        );

    if (user.email) {
        user.gravatar = crypto
            .createHash('md5')
            .update(user.email)
            .digest("hex");
    }

    if (user.googleOpenId)
        user.googleOpenId = "token";

    if (user.courseraOAuthId)
        user.courseraOAuthId = "token";

    if (user.githubId)
        user.githubId = "token";

    if (user.twitterOAuthId)
        user.twitterOAuthId = "token";

    user.apiKey = "";
    user.apiSecret = "";
    user.password = "";

    try {
        user.bridges =
            await mdb.LtiBridge.find({
                user:
                    new mdb.ObjectId(
                        user._id
                    )
            }).exec();

        res.json(user);
    } catch (err) {
        next(err);
    }
};

exports.currentProfile = function(req, res){
    var editable = true;
    res.render('user', { userId: '', user: req.user, editable: editable, title: req.user.name } );
};

exports.profile = function(req, res){
    var id = req.params.id;
    var editable = ('user' in req) && (req.user.superuser || (req.user._id === id));
    res.render('user', { userId: req.params.id, user: req.user, editable: editable, title: 'Profile' } );
};

exports.putSecret = async function(req, res, next){
    var id = req.params.id;

    if (!req.user) {
        res.send(401);
        return;
    }

    // BADBAD: should include more nuanced security here
    if (req.user._id.toString() != id) {
        res.status(500);
        next(
            new Error(
                'No permission to access other users.'
            )
        );
        return;
    }

    var hash = {};

    hash.apiKey = uuid.v4();

    hash.apiSecret = crypto
        .createHash('sha256')
        .update(uuid.v4())
        .update(
            crypto.randomBytes(256)
        )
        .digest('hex');

    try {
        await mdb.User.updateOne(
            {
                _id: new mdb.ObjectId(id)
            },
            {
                $set: hash
            }
        );

        res.status(200).json(hash);
    } catch (err) {
        res.status(500);
        next(err);
    }
};

////////////////////////////////////////////////////////////////
// delete an account, unless it is the last linked account
exports.deleteLinkedAccount = async function(req, res, next, account){
    var id = req.params.id;

    if (!req.user) {
        res.send(401);
        return;
    }

    // BADBAD: should include more nuanced security here
    if (req.user._id.toString() != id) {
        res.status(500).send(
            'No permission to access other users.'
        );
        return;
    }

    var accountHash = {};

    var present = {
        $exists: true
    };

    var otherAccounts = {
        googleOpenId: present,
        twitterOAuthId: present,
        courseraOAuthId: present,
        githubId: present
    };

    if (account == 'google') {
        accountHash['googleOpenId'] = "";
        delete otherAccounts['googleOpenId'];
    }

    if (account == 'twitter') {
        accountHash['twitterOAuthId'] = "";
        delete otherAccounts['twitterOAuthId'];
    }

    if (account == 'coursera') {
        accountHash['courseraOAuthId'] = "";
        delete otherAccounts['courseraOAuthId'];
    }

    if (account == 'github') {
        accountHash['githubId'] = "";
        delete otherAccounts['githubId'];
    }

    // Need an array instead of a hash for mongodb $or
    otherAccounts =
        Object.keys(
            otherAccounts
        ).map(function(x) {
            var pair = {};

            pair[x] =
                otherAccounts[x];

            return pair;
        });

    try {
        var result =
            await mdb.User.updateOne(
                {
                    _id:
                        new mdb.ObjectId(
                            id
                        ),
                    $or:
                        otherAccounts
                },
                {
                    $unset:
                        accountHash
                }
            );

        /*
         * Mongoose 5 exposes the matched count as result.n.
         * Mongoose 6+ exposes matchedCount. Preserve the
         * existing route semantics across both runtimes.
         */
        var matchedCount =
            result.matchedCount !== undefined ?
                result.matchedCount :
                result.n;

        if (matchedCount <= 0) {
            res.status(404);
            next(
                new Error(
                    "No other account available; " +
                    "you cannot delete the only linked account."
                )
            );
            return;
        }

        res.status(200).send(
            "Successfully removed " +
            account
        );
    } catch (err) {
        next(err);
    }

    return;
};

////////////////////////////////////////////////////////////////
// Delete the LTI bridge
exports.deleteBridge = async function(req, res, next){
    var id = req.params.id;
    var bridgeId = req.params.bridge;

    if (!req.user) {
        res.send(401);
        return;
    }

    try {
        var user = await mdb.User.findOne({
            _id: new mdb.ObjectId(id)
        });

        if (!hasPermissionToEdit(req.user, user)) {
            next(new Error("You are not permited to edit this user."));
            return;
        }

        var bridge = await mdb.LtiBridge.findOne({
            _id: new mdb.ObjectId(bridgeId)
        });

        if (!bridge) {
            next(new Error("That LTI bridge does not exist."));
            return;
        }

        if (bridge.user != id) {
            next(new Error("That bridge does not belong to the given user."));
            return;
        }

        await bridge.deleteOne();

        res.status(200).send("Removed " + bridge._id);
    } catch (err) {
        next(err);
    }

    return;
};

exports.get = async function(req, res, next){
    var id = req.params.id;

    if (!req.user) {
        res.send(401);
        return;
    }

    try {
        var results = await Promise.all([
            mdb.User.findOne({
                _id: new mdb.ObjectId(id)
            }).exec(),
            mdb.LtiBridge.find({
                user: new mdb.ObjectId(id)
            }).exec()
        ]);

        var document = results[0];
        var bridges = results[1];

        if (!document) {
            res.status(404).render('404', {
                status: 404,
                url: req.url
            });
            return;
        }

        var viewerPermission =
            hasPermissionToView(req.user, document);

        if (!viewerPermission) {
            next(
                new Error(
                    'No permission to access other users.'
                )
            );
            return;
        }

        // Add one view to the count of profileViews
        // Preserve the historical fire-and-forget behavior.
        mdb.User.updateOne(
            { _id: new mdb.ObjectId(id) },
            { $inc: { profileViews: 1 } }
        ).catch(function(err) {
            console.log(
                'Unable to increment profileViews'
            );
            console.log(err);
        });

        if (document.email) {
            document.gravatar = crypto
                .createHash('md5')
                .update(
                    validator.normalizeEmail(
                        document.email
                    )
                )
                .digest("hex");
        }

        if (document.birthday) {
            document.formattedBirthday =
                moment(
                    new Date(document.birthday)
                ).format('MMMM D, YYYY');
        }

        if (req.user._id.equals(document._id))
            document.pronouned = "me";
        else
            document.pronouned = document.name;

        if (!hasPermissionToEdit(req.user, document)) {
            document.googleOpenId = undefined;
            document.courseraOAuthId = undefined;
            document.githubId = undefined;
            document.twitterOAuthId = undefined;
            document.apiKey = "";
            document.apiSecret = "";
            document.password = "";
        }

        res.format({
            html: function(){
                res.render(
                    'user/profile',
                    {
                        userId: req.params.id,
                        user: req.user,
                        script: "user/profile",
                        person: document,
                        bridges: bridges,
                        whyVisible:
                            "Visible to you because " +
                            viewerPermission,
                        editable:
                            hasPermissionToEdit(
                                req.user,
                                document
                            ),
                        title: 'Profile'
                    }
                );
            },

            json: function(){
                res.json(document);
            }
        });
    } catch (err) {
        next(err);
    }
};

exports.edit = async function(req, res, next){
    var id = req.params.id;

    if (!req.user) {
        res.send(401);
        return;
    }

    try {
        var results = await Promise.all([
            mdb.User.findOne({
                _id: new mdb.ObjectId(id)
            }).exec(),
            mdb.LtiBridge.find({
                user: new mdb.ObjectId(id)
            }).exec()
        ]);

        var document = results[0];
        var bridges = results[1];

        if (!document) {
            res.status(404).json({});
            return;
        }

        if (!hasPermissionToEdit(req.user, document)) {
            res.status(500);
            next(
                new Error(
                    'No permission to edit that user.'
                )
            );
            return;
        }

        if (document.email) {
            document.gravatar = crypto
                .createHash('md5')
                .update(
                    validator.normalizeEmail(
                        document.email
                    )
                )
                .digest("hex");
        }

        if (req.user._id.equals(document._id))
            document.pronouned = "me";
        else
            document.pronouned = document.name;

        if (document.birthday) {
            document.formattedBirthday =
                moment(
                    new Date(document.birthday)
                ).format('MMMM D, YYYY');
        }

        res.format({
            html: function(){
                console.log(
                    'Edit user document for: ' +
                    req.params.id
                );
                console.log(document);

                res.render(
                    'user/edit',
                    {
                        userId: req.params.id,
                        user: req.user,
                        bridges: bridges,
                        script: "user/profile",
                        person: document,
                        whyVisible:
                            "Visible to you because " +
                            hasPermissionToView(
                                req.user,
                                document
                            ),
                        editable:
                            hasPermissionToEdit(
                                req.user,
                                document
                            ),
                        title: 'Profile'
                    }
                );
            }
        });
    } catch (err) {
        next(err);
    }
};

exports.update = async function(req, res, next){
    var id = req.params.id;

    if (!req.user) {
        res.send(401);
        return;
    }

    try {
        var results = await Promise.all([
            mdb.User.findOne({
                _id: new mdb.ObjectId(id)
            }).exec(),
            mdb.LtiBridge.find({
                user: new mdb.ObjectId(id)
            }).exec()
        ]);

        var document = results[0];
        var bridges = results[1];

        if (!document) {
            res.status(404).json({});
            return;
        }

        if (!hasPermissionToEdit(req.user, document)) {
            res.status(403);
            next(
                new Error(
                    'No permission to access other users.'
                )
            );
            return;
        }

        if (req.user._id.toString() == id)
            document.pronouned = "me";
        else
            document.pronouned = document.name;

        var hash = {};

        if (req.body.displayName)
            document.displayName =
                hash.displayName =
                validator.toString(
                    req.body.displayName
                );
        else
            document.displayName =
                hash.displayName = '';

        if (req.body.visibility) {
            if (
                validator.isIn(
                    req.body.visibility,
                    ["none", "users", "everyone"]
                )
            ) {
                document.visibility =
                    hash.visibility =
                    req.body.visibility;
            }
        }

        if (
            req.body.email &&
            validator.isEmail(req.body.email)
        ) {
            document.email =
                hash.email =
                validator.normalizeEmail(
                    req.body.email
                );
        } else {
            document.email =
                hash.email = '';
        }

        if (
            req.body.website &&
            validator.isURL(req.body.website)
        ) {
            document.website =
                hash.website =
                req.body.website;
        } else {
            document.website =
                hash.website = '';
        }

        if (req.body.birthday) {
            document.birthday =
                hash.birthday =
                validator.toDate(
                    req.body.birthday
                );
        } else {
            document.birthday = '';
        }

        if (document.birthday) {
            document.formattedBirthday =
                moment(
                    new Date(document.birthday)
                ).format('MMMM D, YYYY');
        }

        if (req.body.biography) {
            document.biography =
                hash.biography =
                validator.toString(
                    req.body.biography
                );
        } else {
            document.biography =
                hash.biography = '';
        }

        if (req.body.location) {
            document.location =
                hash.location =
                validator.toString(
                    req.body.location
                );
        }

        if (document.email) {
            document.gravatar = crypto
                .createHash('md5')
                .update(
                    validator.normalizeEmail(
                        document.email
                    )
                )
                .digest("hex");
        }

        // Only superusers can edit flags
        if (req.user.superuser) {
            if (req.body.isInstructor)
                document.isInstructor =
                    hash.isInstructor = true;
            else
                document.isInstructor =
                    hash.isInstructor = false;

            if (req.body.isAuthor)
                document.isAuthor =
                    hash.isAuthor = true;
            else
                document.isAuthor =
                    hash.isAuthor = false;

            if (req.body.isGuest)
                document.isGuest =
                    hash.isGuest = true;
            else
                document.isGuest =
                    hash.isGuest = false;

            if (req.body.superuser)
                document.superuser =
                    hash.superuser = true;
            else
                document.superuser =
                    hash.superuser = false;
        }

        await mdb.User.updateOne(
            {
                _id: new mdb.ObjectId(id)
            },
            {
                $set: hash
            }
        );

        res.render(
            'user/profile',
            {
                userId: req.params.id,
                user: req.user,
                updated: true,
                bridges: bridges,
                script: "user/profile",
                person: document,
                editable: true,
                title: 'Profile'
            }
        );
    } catch (err) {
        /*
         * Preserve the historical behavior of treating a
         * failed profile write as a server error.
         */
        if (!res.headersSent) {
            res.status(500);
        }

        next(err);
    }
};

exports.index = async function(req, res, next) {
    var page = req.params.page;
    var pageSize = 100;
    var pageCount = 5;

    if (!(('user' in req) && (req.user.superuser))) {
        res.status(403);
        next(new Error('You are not a superuser.'));
        //.render('fail', { title: "Users not visible", message: "You are not a superuser." });
        return;
    }

    try {
        var userCount = await mdb.User.countDocuments();

        pageCount = Math.ceil(userCount / pageSize);

        var users = await mdb.User.find()
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .sort('-lastSeen')
            .exec();

        users.forEach(function(user) {
            if (user.email)
                user.gravatar = crypto.createHash('md5').update(validator.normalizeEmail(user.email)).digest("hex");
        });

        res.render('user/index', {
            users: users,
            page: page,
            pageCount: pageCount
        });
    } catch (err) {
        next(err);
    }
};
