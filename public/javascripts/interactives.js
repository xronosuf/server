var $ = require('jquery');
var _ = require('underscore');
var async = require('async');
var TinCan = require('./tincan');
var Desmos = require('./desmos');
var Javascript = require('./javascript');
var pageRuntime = require('./page-runtime');

var OPTIONAL_LIBRARY_TIMEOUT = 10000;

var libraries = {
    jquery: $,
    underscore: _,
    tincan: TinCan
};

function dependencyError(name, message) {
    var error = new Error(message);
    error.xronosDependency = name;
    return error;
}

function asynchronousLibrary(dependencies, name, url, object) {
    return function(callback) {
        if (
            libraries[name] !== undefined ||
            !dependencies.some(function(dependency) {
                return dependency === name;
            })
        ) {
            callback(null);
            return;
        }

        var settled = false;
        var request;

        function settle(err) {
            if (settled)
                return;

            settled = true;
            window.clearTimeout(timer);
            callback(err || null);
        }

        var timer = window.setTimeout(function() {
            if (request && request.abort)
                request.abort();

            settle(
                dependencyError(
                    name,
                    'Timed out while loading optional interactive library ' + name + '.'
                )
            );
        }, OPTIONAL_LIBRARY_TIMEOUT);

        request = $.getScript(url, function() {
            if (window[object] === undefined) {
                settle(
                    dependencyError(
                        name,
                        'Optional interactive library ' + name + ' loaded without exposing ' + object + '.'
                    )
                );
                return;
            }

            libraries[name] = window[object];
            settle(null);
        });

        if (request && request.fail) {
            request.fail(function(jqXHR, textStatus, errorThrown) {
                var detail = errorThrown || textStatus || 'request failed';

                settle(
                    dependencyError(
                        name,
                        'Unable to load optional interactive library ' + name + ': ' + detail
                    )
                );
            });
        }
    };
}

// Connected to 'db'
function createProxiedPersistentDataObject(element) {
    var handler = {
        get: function(target, prop, receiver) {
            return element.persistentData(prop);
        },
        set: function(target, prop, value, receiver) {
            element.persistentData(prop, value);
            Javascript.reevaluate(element);
            return true;
        }
    };

    var p = new Proxy(function(callback) {
        element.persistentData(callback);
    }, handler);

    return p;
}

// Connected to 'reset'
function createResetButton(element) {
    var button = $('<button class="btn btn-danger" type="button"><i class="fa fa-eraser"></i>Reset</button>');
    button.insertAfter(element);

    return function(callback) {
        $(button).click(callback);
    };
}

// TODO reset button
// TODO checkwork
// TODO includeinteractive needs to be access the parameters that it is passed
// basically as an "parameters" object
function parseParameters(parameters) {
    if (parameters === null)
        return {};

    var pairs = parameters.split(',').map(function(x) { return x.trim(); });
    var hash = {};
    pairs.forEach(function(pair) {
        var left = pair.split('=')[0];
        var right = pair.split('=')[1];

        hash[left] = right;
    });

    return hash;
}

exports.connectInteractives = function() {
    if (window.interactives) {
        window.interactives.forEach(function(interactive) {
            var dependencies = interactive.dependencies;
            var code = interactive.callback;
            var parameters = interactive.parameters;

            var variableName = parseParameters(parameters)['id'];

            var targetId = interactive.targetId;
            var target = $('#' + targetId);

            async.series(
                [
                    // Additional asynchronously loaded scripts could be placed here
                    function(callback) {
                        if (dependencies.some(function(dependency) { return dependency === 'desmos'; })) {
                            Desmos.loadAsynchronously();

                            Desmos.onReady(
                                function(DesmosLibrary) {
                                    libraries['desmos'] = DesmosLibrary;
                                    callback(null);
                                },
                                function(err) {
                                    if (!(err instanceof Error))
                                        err = new Error(String(err));

                                    err.xronosDependency = 'desmos';
                                    callback(err);
                                }
                            );
                        } else {
                            callback(null);
                        }
                    },

                    asynchronousLibrary(dependencies, 'three', 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r81/three.min.js', 'THREE'),
                    asynchronousLibrary(dependencies, 'jsxgraph', 'https://cdnjs.cloudflare.com/ajax/libs/jsxgraph/0.99.5/jsxgraphcore.js', 'JXG'),
                    asynchronousLibrary(dependencies, 'numeric', 'https://cdnjs.cloudflare.com/ajax/libs/numeric/1.2.6/numeric.min.js', 'numeric')

                ], function(err) {
                    if (err) {
                        target.attr('data-xronos-interactive-state', 'failed');

                        pageRuntime.operation(
                            'optional-interactive',
                            'failed',
                            {
                                targetId: targetId || null,
                                dependency: err.xronosDependency || null,
                                message: err.message || String(err)
                            }
                        );

                        if (window.console && window.console.error)
                            window.console.error('Optional interactive unavailable:', err);

                        return;
                    }

                    target.attr('data-xronos-interactive-state', 'ready');

                    code.apply(target, dependencies.map(function(name) {
                        if (name === 'db') {
                            var proxy = createProxiedPersistentDataObject(target);

                            if (variableName)
                                window[variableName] = proxy;

                            return proxy;
                        } else if (name === 'reset')
                            return createResetButton(target);
                        else if (name === 'parameters')
                            return parseParameters(parameters);
                        else
                            return libraries[name];
                    }));
                }
            );
        });
    }
};
