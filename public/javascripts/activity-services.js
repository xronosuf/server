define(['angular', 'jquery', 'underscore'], function (angular, $, _) {
    var app = angular.module('ximeraApp.activityServices', []);

    app.factory('completionService', ["$http", function ($http) {
        var service = {};

	service.activities = {};

	service.update = function() {
            $http.get("/users/completion").
		success(function (data) {
		    console.log( data );
		    service.activities.completions = data;
		});
	};
	service.update();

	return service;
    }]);

    app.factory('logService', ["$http", "$rootScope", "$timeout", 'completionService', function ($http, $rootScope, $timeout, completions) {
        var service = {};
        var activityId = $('.activity').attr('data-activityId');

        service.createEmptyDb = function() {
            $rootScope.db.logService = {};
            $rootScope.db.logService.unloggedAnswers = [];
            $rootScope.db.logService.completionNeedsUpdate = false;
            $rootScope.db.logService.qpCompletion = {};

            $(".questionPart").each(function() {
		// Only question parts that are actually answerable and outside a hint should be counted
		if ($(".solution", this).length > 0 && $(this).parents('.hint').length == 0) {
                    $rootScope.db.logService.qpCompletion[$(this).attr("data-uuid")] = false;
                }
            });
        }

        service.initialize = function () {
	    // If this is an activity with no questions, we need to
	    // update the database to mark this as complete right away
	    if (_.keys($rootScope.db.logService.qpCompletion).length == 0)
		$rootScope.db.logService.completionNeedsUpdate = true;

	    console.log( $rootScope.db.logService.qpCompletion );

            // Begin sending unlogged answers.
            service.sendLoggedAnswers();
        }

        service.logAnswer = function (questionPartUuid, value, correct) {
            $rootScope.db.logService.unloggedAnswers.push({
                activityId: activityId,
                questionPartUuid: questionPartUuid,
                value: value,
                correct: correct
            });
            service.sendLoggedAnswers();
        }

        service.logCompletion = function(questionPartUuid, hasAnswer) {
            $rootScope.db.logService.completionNeedsUpdate = true;
            if (hasAnswer && questionPartUuid in $rootScope.db.logService.qpCompletion) {
                $rootScope.db.logService.qpCompletion[questionPartUuid] = true;
            }
            service.sendLoggedAnswers();
        }

        service.sendLoggedAnswers = _.debounce(function () {
            if ($rootScope.db.logService.completionNeedsUpdate) {
                var completeUuids = _.keys($rootScope.db.logService.qpCompletion);
                var numParts = completeUuids.length;
                var numComplete = _.filter(_.values($rootScope.db.logService.qpCompletion), function (x) { return x;}).length;
                var percentDone;
                if (numParts === 0) {
                    percentDone = 100;
                }
                else {
                    percentDone = Math.floor((numComplete / numParts) * 100);
                }
                var complete = (numParts === numComplete);

		// Some Xudos for fully completing an activity
		// TODO: should not award xudos if they have already been awarded!
		if (complete) {
		    $rootScope.$emit( 'Xudos', 2 );
		}

                $http.post("/activity/log-completion", {
                    activityId: activityId,
                    percentDone: percentDone,
		    numParts: numParts,
		    numComplete: numComplete,
                    completeUuids: completeUuids,
                    complete: complete
                }).success(function(data, status, headers, config) {
                    if (data["ok"] === true) {
                        $rootScope.db.logService.completionNeedsUpdate = false;
			completions.update();
                    }
                });
            }

            if ($rootScope.db.logService.unloggedAnswers.length > 0) {
                $http.post("/activity/log-answer",$rootScope.db.logService.unloggedAnswers[0]).
                    success(function(data, status, headers, config) {
                        if (data["ok"] === true) {
                            $rootScope.db.logService.unloggedAnswers.splice(0, 1);
                        }
                    }).
                    error(function(data, status, headers, config) {
                        // Retry
                        service.sendLoggedAnswers();
                    });
            }
        }, 1000);

        return service;
    }]);

    app.factory('stateService', function ($timeout, $rootScope, $http, $q) {
        var locals = {dataByUuid: null};
        var activityId = $('.activity').attr('data-activityId');
        var getStateDeferred = $q.defer();

        var getState = function () {
            $http.get("/angular-state/" + activityId).
                success(function (data) {
                    locals.dataByUuid = {};

                    if (data) {
                        for (var uuid in data) {
                            if (uuid in locals.dataByUuid) {
                                // Replace contents.
                                var oldData = locals.dataByUuid[uuid];
                                for (var prop in oldData) {
                                    if (oldData.hasOwnProperty(prop)) {
                                        delete oldData[prop];
                                    }
                                }
                                for (var prop in data[uuid]) {
                                    if (data[uuid].hasOwnProperty(prop)) {
                                        oldData[prop] = data[uuid][prop]
                                    }
                                }
                            }
                            else {
                                locals.dataByUuid[uuid] = data[uuid];
                            }
                        }
                        console.log( "Downloaded state ", locals.dataByUuid );
                    }
                    // Don't resolve promise until Angular has finished compiling.
                    $timeout(function () {
                        getStateDeferred.resolve();
                    });
                    // Show activity after components have had a chance to load.
                    $('.activity').show();
                }).
                error(function () {
                    // Retry until successful.
                    $timeout(getState);
                });
        }

        getState();

        // TODO: Add activityHash
        var updateState = function (callback, forceUpload) {
            if (locals.dataByUuid || forceUpload) {
                $http.put("/angular-state/" + activityId, {dataByUuid: locals.dataByUuid})
                    .success(function(data, status, headers, config) {
                        console.log("State uploaded.");
                        if (callback) {
                            callback();
                        }
                    }).error(function(data, status, headers, config) {
                        console.log("Error uploading state: ", status);
                        callback(status);
                    });
            }
        }

        var triggerUpdate = _.debounce(function () {
            updateState(function (err) {
                if (err) {
                    // Retry on error.
                    triggerUpdate();
                }
            });
        }, 47*1000);

        var stateService = {};
        // Don't bind state for the same data-uuid twice; can happen with some transclusions?
        var alreadyBound = [];
        stateService.bindState = function ($scope, uuid, initCallback) {
            if (!_.contains(alreadyBound, uuid)) {
                alreadyBound.push(uuid);
                return getStateDeferred.promise.then(function () {
                    if (uuid in locals.dataByUuid) {
                        $scope.db = locals.dataByUuid[uuid];
                    }
                    else {
                        $scope.db = {}
                        locals.dataByUuid[uuid] = $scope.db;
                        initCallback();
                    }

                    $scope.$watch("db", function () {
                        triggerUpdate();
                    }, true);
                });
            }
            else {
                // Empty "then"
                return {then: function () {}};
            }
        }

        stateService.resetPage = function () {
            locals.dataByUuid = null;
            updateState(function () {
                location.reload(true);
            }, true);
        }

        stateService.getDataByUuid = function (uuid) {
            return locals.dataByUuid[uuid];
        }

        return stateService;
    });
});
