var mdb = require('../mdb');


exports.isInstructorForLearnerInRepository = function(
    repositoryName,
    supposedInstructor,
    supposedLearner,
    callback
) {
    Promise.all([
        mdb.LtiBridge.find({
            user: supposedInstructor._id
        }).exec(),

        mdb.LtiBridge.find({
            user: supposedLearner._id
        }).exec()
    ])
        .then(function(results) {
            var instructorBridges = results[0];
            var learnerBridges = results[1];

            var good = instructorBridges.some(
                function(instructorBridge) {
                    // The instructor is actually an instructor
                    // of some sort...
                    return instructorBridge.roles.some(
                        function(role) {
                            return (
                                role.match(/Instructor/) ||
                                role.match(/Administrator/) ||
                                role.match(/TeachingAssistant/) ||
                                role.match(/Grader/)
                            );
                        }
                    ) &&
                        // and the learner is actually in
                        // that course
                        learnerBridges.some(
                            function(learnerBridge) {
                                return (
                                    instructorBridge
                                        .toolConsumerInstanceGuid ==
                                        learnerBridge
                                            .toolConsumerInstanceGuid
                                ) &&
                                    (
                                        instructorBridge.contextId ==
                                        learnerBridge.contextId
                                    ) &&
                                    (
                                        instructorBridge.repository ==
                                        learnerBridge.repository
                                    ) &&
                                    (
                                        instructorBridge.repository ==
                                        repositoryName
                                    );
                            }
                        );
                }
            );

            callback(null, good);
        })
        .catch(function(err) {
            callback(err, false);
        });
};


// Used when we want to view page as another learner
exports.masquerade = async function(req, res, next) {
    var learner;

    try {
        learner = await mdb.User.findOne({
            _id: new mdb.ObjectId(
                req.params.masqueradingUserId
            )
        }).exec();
    } catch (err) {
        next(err);
        return;
    }

    if (!learner) {
        next(
            'Could not find user with id ' +
            req.params.masqueradingUserId
        );
        return;
    }

    /*
     * This helper intentionally retains its application-level
     * callback API. Only its internal Mongoose calls were
     * converted to promises.
     */
    exports.isInstructorForLearnerInRepository(
        req.params.repository,
        req.user,
        learner,
        function(err, good) {
            if (err) {
                next(err);
                return;
            }

            if (!good) {
                // Should be a different HTTP error code
                next(
                    'You do not have permission to see ' +
                    'the work of that learner.'
                );
                return;
            }

            req.learner = learner;
            next();
        }
    );
};
