var $ = require('jquery');
var _ = require('underscore');
var MathJax = require('./mathjax');
var pageRuntime = require('./page-runtime');

$( function() {
    var anyRandomness = false;
    var setupScriptCount = 0;
    var randomSetupScriptCount = 0;

    $('.javascript script').each( function() {
	setupScriptCount += 1;

	if ($(this).html().match( /random/ )) {
	    anyRandomness = true;
	    randomSetupScriptCount += 1;
	}
    });

    pageRuntime.component(
	'author-javascript-setup',
	setupScriptCount > 0 ? 'observed' : 'not-required',
	{
	    scriptCount: setupScriptCount,
	    randomScriptCount: randomSetupScriptCount,
	    parserOwnedExecution: setupScriptCount > 0,
	    executionDirectlyObservable: false,
	    observedAtDocumentReadyState: document.readyState
	}
    );

    if (anyRandomness) {
	pageRuntime.operation(
	    'author-javascript-random-setup',
	    'waiting-for-initial-state',
	    {
		scriptCount: setupScriptCount,
		randomScriptCount: randomSetupScriptCount
	    }
	);

	$("#show-me-another-button").show();

	var seedDiv;
	if ($("#seed").length > 0) {
	    seedDiv = $("#seed").first();
	} else {
	    seedDiv = $('<div id="seed" style="display: none;"></div>');
	    $('main.activity .activity-body').append( seedDiv );
	}
	
	seedDiv.fetchData( function() {
	    pageRuntime.operation(
		'author-javascript-random-setup',
		'initial-state-available',
		{
		    scriptCount: setupScriptCount,
		    randomScriptCount: randomSetupScriptCount
		}
	    );

	    seedDiv.persistentData( function() {
		var newSeed = seedDiv.persistentData('seed');
		
		if (newSeed !== undefined) {
		    Math.seedrandom(newSeed);
		} else {
		    var activityPath = $('main.activity').attr( 'data-path' );
		    var currfilebase = activityPath.split('/').slice(-1)[0];		
		    Math.seedrandom(currfilebase);
		}
		console.log("newSeed=", newSeed);
		console.log("reevaluate",seedDiv);
		
		pageRuntime.operation(
		    'author-javascript-random-setup',
		    'evaluating',
		    {
			scriptCount: setupScriptCount,
			randomScriptCount: randomSetupScriptCount,
			seedAvailable: newSeed !== undefined
		    }
		);

		$('.javascript script').each( function() {
		    $.globalEval( $(this).html() );
		});

		pageRuntime.operation(
		    'author-javascript-random-setup',
		    'evaluated',
		    {
			scriptCount: setupScriptCount,
			randomScriptCount: randomSetupScriptCount
		    }
		);

		exports.reevaluate( seedDiv );
	    });
	}, "javascript-seed");
    }
});

var createJavascript = function() {
    var element = $(this);

    element.on( 'ximera:reevaluate', function(event) {
	var value = $('<span class="value"></span>');
	if ($('.value', element).length > 0) {
	    value = $('.value', element);
	} else {
	    element.append( value );
	}

	try {
	    value.text( window[element.attr('id')].call(this).toString() );
	} catch (err) {
	    value.html( '&#9633;' );
	};
    });

    element.trigger( 'ximera:reevaluate' );
};

$.fn.extend({
    javascript: function() {
	return this.each( createJavascript );
    }
});

var evaluateLatex = exports.evaluateLatex = function(code) {
    var value;
    
    try {
	value = eval(code);

	if (typeof value === "number") { 
	    value = value.toString();
	}
	
	if (typeof value.tex !== "undefined") { 
	    value = value.tex();
	}

	value = value.toString();
    } catch(err) {
	value = '\\square';
    }

    return value;
};

var authorJavascriptReevaluationSequence = 0;

var describeReevaluationElement = function(element) {
    var domElement =
        element && element.length > 0
            ? element[0]
            : null;

    return {
        tagName:
            domElement && domElement.tagName
                ? domElement.tagName
                : null,
        id:
            element && element.attr
                ? element.attr('id') || null
                : null,
        dataId:
            element && element.attr
                ? element.attr('data-id') || null
                : null,
        className:
            domElement &&
            typeof domElement.className === 'string'
                ? domElement.className
                : null
    };
};

var reevaluateMathjaxNow = function(request) {
    var element = request.element;
    var activity = element.closest('.activity-body');
    var watcherCount =
        $('.mathjax-javascript', activity).length;
    var ids = new Set();

    pageRuntime.operation(
        'author-javascript-mathjax-reevaluation',
        'scanning',
        {
            reevaluationId: request.reevaluationId,
            trigger: request.trigger,
            watcherCount: watcherCount
        }
    );

    $('.mathjax-javascript', activity).each(
        function(i, e) {
            var value;
            var code = $(e).attr('data-code');
            var frame = $(e).closest('.MathJax');
            var frameId = frame.attr('id');

            try {
                value = evaluateLatex(code);
            } catch (err) {
                value = '\\square';
            }

            if (value != $(e).attr('data-value')) {
                if (frameId) {
                    ids.add(
                        frameId.replace(
                            '-Frame',
                            ''
                        )
                    );
                } else {
                    pageRuntime.operation(
                        'author-javascript-mathjax-watcher',
                        'frame-missing',
                        {
                            code:
                                'XR-JS-WATCHER-101',
                            reevaluationId:
                                request.reevaluationId,
                            watcherIndex: i,
                            watcherCode:
                                code || null
                        }
                    );
                }
            }
        }
    );

    pageRuntime.operation(
        'author-javascript-mathjax-reevaluation',
        ids.size > 0
            ? 'queued'
            : 'not-required',
        {
            reevaluationId: request.reevaluationId,
            trigger: request.trigger,
            watcherCount: watcherCount,
            targetCount: ids.size,
            targetIds: Array.from(ids)
        }
    );

    ids.forEach(function(id) {
        MathJax.Hub.Queue([
            'Reprocess',
            MathJax.Hub,
            id
        ]);
    });
};

var reevaluateMathjax = _.debounce(
    reevaluateMathjaxNow,
    250
);

exports.reevaluate = function(element) {
    var activity =
        element.closest('.activity-body');
    var inlineJavascriptCount =
        $('.inline-javascript', activity).length;
    var watcherCount =
        $('.mathjax-javascript', activity).length;
    var request;

    authorJavascriptReevaluationSequence += 1;

    request = {
        reevaluationId:
            authorJavascriptReevaluationSequence,
        element: element,
        trigger:
            describeReevaluationElement(element)
    };

    pageRuntime.operation(
        'author-javascript-reevaluation',
        'requested',
        {
            reevaluationId:
                request.reevaluationId,
            trigger:
                request.trigger,
            inlineJavascriptCount:
                inlineJavascriptCount,
            watcherCount:
                watcherCount
        }
    );

    $('.inline-javascript', activity).each(
        function(i, e) {
            $(e).triggerHandler(
                'ximera:reevaluate'
            );
        }
    );

    reevaluateMathjax(request);
};


