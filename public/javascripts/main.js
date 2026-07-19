console.log("  ▀██▄   ▄██▀ ██ █████     █████ ▄███████████████████▄    ███");
console.log("    ▀██▄██▀   ██▐██ ▐██   ██▌ ██▌██                 ██▌  ██▀██");
console.log("      ███     ██▐██  ██▌ ▐██  ██▌▐█████████ ▄████████▀  ██▀ ▀██");
console.log("    ▄██▀██▄   ██▐██  ▐██ ██▌  ██▌██        ▐█▌  ▀██▄   ██▀   ▀██");
console.log("  ▄██▀   ▀██▄ ██▐██   ▀███▀   ██▌▀█████████▐█▌    ▀██▄██▀     ▀██");

var ximera_subpath = localStorage.getItem("ximera-subpath");
var http = new XMLHttpRequest();
http.onreadystatechange = function() {
	var res = http.getResponseHeader('X-Ximera-SubPath');
	if (res != null) {
		ximera_subpath = res;
		localStorage.setItem( "ximera-subpath", ximera_subpath );
	}
};
http.open('HEAD', document.location, false);
http.send();

window.toValidPath = function (uri) {
	return ximera_subpath + uri
}

require('./version');

/* Definitely not ready for a serviceworker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', {scope: '/'})
	.then(function(reg) {
	    console.log('Registered Service Worker.');

	    window.updateServiceWorker = function() {
		console.log('updating sw');
		reg.update();
	    };
	}).catch(function(error) {
	    console.log('Registration failed: ' + error);
	});
}
*/

// bootstrap is expecting a global jQuery object
var $ = window.$ = window.jQuery = require('jquery');

// jsondiffpatch expects this loaded globally
window.diff_match_patch = require('diff-match-patch');

require('./cache-bust');

var Expression = require('math-expressions');

var jqueryUI = require('jquery-ui');
var jqueryTransit = require('jquery.transit');
var tether = require('tether');
window.Tether = tether;
var bootstrap = require('bootstrap');
var kinetic = require('jquery.kinetic/jquery.kinetic.min.js');

require('./chat');

var syntaxHighlighter = require('syntaxhighlighter');
window.sh = syntaxHighlighter;
syntaxHighlighter.registerBrush(require('./brushes/shBrushLatex'));
syntaxHighlighter.registerBrush(require('brush-javascript'));
syntaxHighlighter.registerBrush( require('brush-python'));

var MathJax = require('./mathjax');

var activity = require('./activity');
var mathAnswer = require('./math-answer');
var ProgressBar = require('./progress-bar');

var userProfile = require('./profile');
var users = require('./users');
var StickyScroll = require('./sticky-scroll' );

var xourse = require('./xourse');
var imageEnvironment = require('./image-environment');

var instructor = require('./instructor');

var rowclick = require('./rowclick');
var supervision = require('./supervision');

var references = require('./references');
var Desmos = require('./desmos');

var Javascript = require('./javascript');

var sagemath = require('./sagemath');

var pencil = require('./pencil');

MathJax.Hub.Register.MessageHook("TeX Jax - parse error",function (message) {
    // do something with the error.  message[1] will contain the data about the error.
    console.log(message);
});

MathJax.Hub.Register.MessageHook("Math Processing Error",function (message) {
    //  do something with the error.  message[2] is the Error object that records the problem.
    console.log(message);
});

// Cervone says this will speed things up
MathJax.Hub.processSectionDelay = 0;
MathJax.Hub.processUpdateTime = 0;

MathJax.Hub.Register.StartupHook("End", function () {
	$(".accordion").accordion({
		active: false,
		autoHeight: false,
		collapsible: true,
		heightStyle: "content"
	});
	$(".accordion").removeClass('hidden-out-of-view')

	$("#loadingSpinner").hide() 
	//$("#theActivity").removeClass('hidden') // Currently, the hidden class is not set

	references.highlightTarget(); // Scroll to target
 });

MathJax.Hub.Register.StartupHook("TeX Jax Ready",function () {
    // Remove CDATA's from the script tags
    MathJax.InputJax.TeX.prefilterHooks.Add(function (data) {
	data.math = data.math.replace(/<!\[CDATA\[\s*((.|\n)*)\s*\]\]>/m,"$1");
    });
    
    // Replace "answer" commands with DOM elements
    var VERSION = "1.0";
    
    var TEX = MathJax.InputJax.TeX,
	TEXDEF = TEX.Definitions,
	MML = MathJax.ElementJax.mml,
	HTML = MathJax.HTML;
    
    TEXDEF.macros.answer = "answer";
    TEXDEF.macros.graph = "graph";
    TEXDEF.macros.newlabel = "newlabel";
    TEXDEF.macros.sage = "sage";
    TEXDEF.macros.sagestr = "sagestr";
    TEXDEF.macros.delimiter = "delimiter";
    
    TEXDEF.macros.js = "js";

    var calculatorCount = 0;		    
    
    /* Sometimes htlatex generates \relax's which should be ignored */
    MathJax.InputJax.TeX.Definitions.Add({
	macros: {
	    relax: ["Macro", ""],
	    ensuremath: ["Macro", ""],
	    xspace: ["Macro", ""]
	}});

    TEX.Parse.Augment({
	/* sage emits delimiter commands pretty frequently? */
	delimiter: function(name) {
	    var d = this.GetArgument(name);

	    if (d.match(/426830A/)) {
		var mml = TEX.Parse("\\langle",this.stack.env).mml();
		this.Push(mml);
		return;
	    }

	    if (d.match(/526930B/)) {
		var mml = TEX.Parse("\\rangle",this.stack.env).mml();
		this.Push(mml);
		return;
	    }	    
	},
	
	// https://stackoverflow.com/questions/38726590/replace-variable-in-mathjax-equation
	sage: function(name) {
	    return this.sagestr(name, true);
	},
	
    sagestr: function(name, latexify) {
        var rawSageCode =
            this.GetArgument(name);

        var sageCallTrace = null;

        if (
            sagemath.traceMathJaxSageCall
        ) {
            sageCallTrace =
                sagemath.traceMathJaxSageCall(
                    rawSageCode,
                    latexify,
                    this
                );
        }

        var code = rawSageCode;

        if (latexify)
            code = "latex(" + code + ")";

        var env = this.stack.env;
        var placeholderId =
            "xronos-sage-placeholder-" +
            Date.now().toString(36) +
            "-" +
            Math.random().toString(36).slice(2);

        var controller = {
            groupState: null,
            mathContainer: null,
            originalDisplay: null
        };

        var createSpinner = function() {
            return HTML.Element(
                "i",
                {
                    className: "fa fa-spinner fa-spin",
                    title: "Computing"
                }
            );
        };

        var createPlaceholderElement = function() {
            var element = HTML.Element(
                "span",
                {
                    id: placeholderId,
                    className: "xronos-sage-inline-placeholder"
                }
            );

            element.appendChild(createSpinner());
            return element;
        };

        var placeholderElement = createPlaceholderElement();
        var placeholderMml = MML["annotation-xml"](
            MML.xml(placeholderElement)
        ).With({
            encoding: "application/xhtml+xml",
            isToken: true
        });

        var placeholder = MML.none(
            MML.semantics(placeholderMml)
        );

        this.Push(placeholder);

        var rerenderPlaceholder = function() {
            var parent = placeholder;

            while (parent.parent != undefined)
                parent = parent.parent;

            if (parent.inputID) {
                MathJax.Hub.Queue([
                    "Rerender",
                    MathJax.Hub,
                    parent.inputID
                ]);
            }
        };

        var findPlaceholderElements = function() {
            var nodes = document.querySelectorAll(
                '[id="' + placeholderId + '"]'
            );

            return Array.prototype.slice.call(nodes);
        };

        var findVisiblePlaceholderElement = function() {
            var elements = findPlaceholderElements();
            var index;

            for (index = 0; index < elements.length; index += 1) {
                if (
                    $(elements[index]).closest(
                        ".MJX_Assistive_MathML"
                    ).length === 0
                ) {
                    return elements[index];
                }
            }

            return elements.length ? elements[0] : null;
        };

        var clearElement = function(element) {
            while (element.firstChild)
                element.removeChild(element.firstChild);
        };

        var findMathContainer = function(anchor) {
            return (
                $(anchor).closest(
                    "span.MathJax, div.MathJax_Display"
                )[0] ||
                anchor.parentNode ||
                anchor
            );
        };

        var findProblemContainer = function(mathContainer) {
            return (
                $(mathContainer).closest(
                    ".problem-environment"
                )[0] ||
                mathContainer.parentNode ||
                document.body
            );
        };

        var removeGroupPanel = function(state) {
            if (
                state.panel &&
                state.panel.parentNode
            ) {
                state.panel.parentNode.removeChild(
                    state.panel
                );
            }

            state.panel = null;
        };

        var getGroupState = function(problemContainer) {
            if (!problemContainer.xronosSageFailureGroup) {
                problemContainer.xronosSageFailureGroup = {
                    problemContainer: problemContainer,
                    failures: {},
                    panel: null
                };
            }

            return problemContainer.xronosSageFailureGroup;
        };

        var groupFailureEntries = function(state) {
            return Object.keys(state.failures).map(
                function(key) {
                    return state.failures[key];
                }
            );
        };

        var getPageFailureRegistry = function() {
            if (
                !window.xronosSageFailurePageRegistry
            ) {
                window.xronosSageFailurePageRegistry = [];
            }

            return window.xronosSageFailurePageRegistry;
        };

        var registerGroupState = function(state) {
            var registry = getPageFailureRegistry();

            if (registry.indexOf(state) === -1)
                registry.push(state);
        };

        var unregisterGroupState = function(state) {
            var registry = getPageFailureRegistry();
            var index;

            if (
                Object.keys(state.failures).length !== 0
            ) {
                return;
            }

            index = registry.indexOf(state);

            if (index !== -1)
                registry.splice(index, 1);
        };

        var retryAllPageFailures = function() {
            var registry =
                getPageFailureRegistry().slice();
            var retryItems = [];
            var affectedStates = [];

            registry.forEach(function(state) {
                groupFailureEntries(state).forEach(
                    function(entry) {
                        if (!entry.info.retryable)
                            return;

                        retryItems.push({
                            state: state,
                            entry: entry
                        });

                        if (
                            affectedStates.indexOf(state) === -1
                        ) {
                            affectedStates.push(state);
                        }
                    }
                );
            });

            if (!retryItems.length)
                return;

            $(
                ".xronos-sage-page-retry"
            ).prop("disabled", true);

            /*
             * Remove the retryable failures from the current
             * panels before starting the requests. Deterministic
             * failures, if any, remain registered and visible.
             */
            retryItems.forEach(function(item) {
                delete item.state.failures[
                    item.entry.id
                ];
            });

            affectedStates.forEach(function(state) {
                if (
                    Object.keys(
                        state.failures
                    ).length === 0
                ) {
                    removeGroupPanel(state);
                    unregisterGroupState(state);
                } else {
                    renderGroupPanel(state);
                }
            });

            /*
             * Restore every affected expression and show its
             * spinner before launching the page-wide retry pass.
             */
            retryItems.forEach(function(item) {
                item.entry.showSpinner();
            });

            retryItems.forEach(function(item) {
                item.entry.retry();
            });
        };

        var renderGroupPanel = function(state) {
            var entries = groupFailureEntries(state);
            var allRetryable;
            var hasAuthorization;
            var hasCode;
            var hasDisplay;
            var category;
            var messageText;
            var message;
            var button;

            if (!entries.length) {
                removeGroupPanel(state);
                unregisterGroupState(state);
                return;
            }

            allRetryable = entries.every(
                function(entry) {
                    return entry.info.retryable;
                }
            );

            hasAuthorization = entries.some(
                function(entry) {
                    return (
                        entry.info.category ===
                        "authorization"
                    );
                }
            );

            hasCode = entries.some(
                function(entry) {
                    return entry.info.category === "code";
                }
            );

            hasDisplay = entries.some(
                function(entry) {
                    return (
                        entry.info.category === "display" ||
                        entry.info.category === "unexpected"
                    );
                }
            );

            if (hasCode) {
                category = "code";
                messageText =
                    "This problem's computations encountered an error. " +
                    "Retrying is unlikely to fix it. Please report this " +
                    "page to your instructor.";
            } else if (hasDisplay || !allRetryable) {
                category = "display";
                messageText =
                    "The computations for this problem could not be " +
                    "displayed. Reload the page or report this activity.";
            } else if (hasAuthorization) {
                category = "authorization";
                messageText =
                    "The computation session for this problem could not " +
                    "be refreshed. Reload the page or try again.";
            } else {
                category = "transient";
                messageText =
                    "The computations for this problem could not be " +
                    "loaded. Check your connection and try again.";
            }

            if (!state.panel) {
                state.panel = document.createElement("div");

                state.panel.setAttribute(
                    "role",
                    "alert"
                );

                state.panel.setAttribute(
                    "aria-live",
                    "polite"
                );

                state.problemContainer.appendChild(
                    state.panel
                );
            }

            state.panel.className =
                "xronos-sage-error " +
                "xronos-sage-problem-error " +
                "xronos-sage-error-" +
                category;

            clearElement(state.panel);

            message = document.createElement("div");

            message.className =
                "xronos-sage-error-message";

            message.appendChild(
                document.createTextNode(messageText)
            );

            state.panel.appendChild(message);

            if (allRetryable) {
                button = document.createElement("button");

                button.type = "button";
                button.className =
                    "btn btn-sm btn-secondary " +
                    "xronos-sage-retry " +
                    "xronos-sage-page-retry";

                button.appendChild(
                    document.createTextNode(
                        "Retry all computations on this page"
                    )
                );

                button.addEventListener(
                    "click",
                    function(event) {
                        event.preventDefault();
                        retryAllPageFailures();
                    }
                );

                state.panel.appendChild(button);
            }
        };

        var hideMathContainer = function(mathContainer) {
            if (
                controller.originalDisplay === null
            ) {
                controller.originalDisplay =
                    mathContainer.style.display;
            }

            controller.mathContainer = mathContainer;
            mathContainer.style.display = "none";
        };

        var restoreMathContainer = function() {
            if (!controller.mathContainer)
                return;

            controller.mathContainer.style.display =
                controller.originalDisplay || "";
        };

        var showSpinner = function() {
            var elements = findPlaceholderElements();

            restoreMathContainer();

            elements.forEach(function(element) {
                clearElement(element);
                element.style.display = "";
                element.appendChild(createSpinner());
            });

            return elements.length > 0;
        };

        var clearRegisteredFailure = function() {
            var state = controller.groupState;

            if (!state)
                return;

            delete state.failures[placeholderId];

            if (
                Object.keys(state.failures).length === 0
            ) {
                removeGroupPanel(state);
                unregisterGroupState(state);
            } else {
                renderGroupPanel(state);
            }

            controller.groupState = null;
        };

        var runSage;

        var showError = function(err) {
            console.log("Inline Sage error=", err);

            MathJax.Hub.Queue([
                function() {
                    var anchor =
                        findVisiblePlaceholderElement();
                    var mathContainer;
                    var problemContainer;
                    var state;
                    var info;

                    if (!anchor) {
                        console.log(
                            "Could not locate inline Sage placeholder:",
                            placeholderId
                        );
                        return;
                    }

                    mathContainer =
                        findMathContainer(anchor);

                    problemContainer =
                        findProblemContainer(
                            mathContainer
                        );

                    state =
                        getGroupState(
                            problemContainer
                        );

                    registerGroupState(state);

                    info =
                        sagemath.describeSageError(err);

                    hideMathContainer(mathContainer);

                    controller.groupState = state;

                    state.failures[placeholderId] = {
                        id: placeholderId,
                        info: info,
                        error: err,
                        retry: runSage,
                        showSpinner: showSpinner,
                        mathContainer: mathContainer
                    };

                    renderGroupPanel(state);

                    return;
                }
            ]);
        };

        var renderResult = function(result) {
            MathJax.Hub.Queue([
                function() {
                    try {
                        clearRegisteredFailure();
                        restoreMathContainer();

                        // The SageCell server returns quoted strings.
                        if (latexify != true)
                            result = eval(result);

                        var mml = TEX.Parse(result, env).mml();

                        if (mml.inferred) {
                            mml = MML.apply(
                                MathJax.ElementJax,
                                mml.data
                            );
                        } else {
                            mml = MML(mml);
                        }

                        placeholder.data = mml.root.data;
                        rerenderPlaceholder();
                    } catch (displayError) {
                        showError({
                            ename: "XronosSageDisplayError",
                            evalue:
                                displayError &&
                                displayError.message
                                    ? displayError.message
                                    : String(displayError)
                        });
                    }

                    return;
                }
            ]);
        };

        runSage = function() {
            sagemath.resolveMathJaxSageCall(
                sageCallTrace,
                code
            ).then(
                renderResult,
                showError
            );
        };

        runSage();

        return;
    },

	/* Implements \graph{y=x^2, r = theta} and the like */
	graph: function(name) {
	    // Load Desmos asynchronously
	    Desmos.loadAsynchronously();
	    
	    var optionalArguments = this.GetBrackets(name);
	    var equations = this.GetArgument(name);

	    var keys = {};
	    if( optionalArguments ) {
	        optionalArguments.split(/,/).forEach( function(kv) {
                    kv = kv.trim().split(/=/);
		    if(kv.length > 1 ) keys[kv[0]] = kv[1];
		    else keys[kv[0]] = true;
	        } );
	    }

            var id = "calculator" + calculatorCount;
            calculatorCount = calculatorCount + 1;
	    var element = HTML.Element("div",
				       {className:"calculator",
                                        id: id,
					style: {width: "30px", height: "300px"}
				       });
	    var mml = MML["annotation-xml"](MML.xml(element)).With({encoding:"application/xhtml+xml",isToken:true});
	    this.Push(MML.semantics(mml));

            MathJax.Hub.Queue( function () {
		var element = document.getElementById(id);
                var parent = $(element).closest( 'div.MathJax_Display' );
		parent.empty();
		element = parent;

		Desmos.onReady( function(Desmos) {
		    var calculator = Desmos.Calculator(element, {
			expressionsCollapsed: !keys.panel
		    });
		    window.calculator = calculator;

		    if (equations.match( /^\(.*\)$/ ))
			calculator.setExpression({id:'graph', latex: equations});
		    else {
			equations.split(',').forEach( function(equation, index) {
			    calculator.setExpression({id:'graph' + index, latex: equation});
			});
		    }
		    if( keys.xmax !== undefined ) {
			calculator.setMathBounds({
			    left: parseFloat(keys.xmin),
			    right: parseFloat(keys.xmax),
			    top: parseFloat(keys.ymax),
			    bottom: parseFloat(keys.ymin) });
		    }
		    if( keys.polar !== undefined ) {
			calculator.setGraphSettings({polarMode:true});
		    }
		    if( keys.hideXAxis ) {
			calculator.setGraphSettings({showXAxis:false});
		    }
		    if( keys.hideYAxis ) {
			calculator.setGraphSettings({showYAxis:false});
		    }
		    if( keys.xAxisLabel ) {
			calculator.setGraphSettings({xAxisLabel:keys.xAxisLabel});
		    }
		    if( keys.yAxisLabel ) {
			calculator.setGraphSettings({yAxisLabel:keys.yAxisLabel});
		    }
		    if( keys.hideXAxisNumbers ) {
			calculator.setGraphSettings({xAxisNumbers:false});
		    }
		    if( keys.hideYAxisNumbers ) {
			calculator.setGraphSettings({yAxisNumbers:false});
		    }
		    
                    // Bart requests that projectorMode be default
	            calculator.setGraphSettings({projectorMode:true});	
		    if( keys.projectorMode ) {
			calculator.setGraphSettings({projectorMode:true});	
		    }
		    if( keys.thinMode ) {
			calculator.setGraphSettings({projectorMode:false});
		    }
		    var height = keys.height || 300;
		    $(element).height(height);
		    calculator.resize();
		});
            });
	},

	/* Implements \js{code} */
	js: function(name) {
	    var code = this.GetArgument(name);
	    var value = Javascript.evaluateLatex(code);

	    var mml = TEX.Parse(value,this.stack.env).mml();

	    this.Push(mml);

	    var watcher = HTML.Element("span",
				     {className:"mathjax-javascript",
				      style: {display: "none"}
				     });
	    
	    watcher.setAttribute("data-code", code);
	    watcher.setAttribute("data-value", value);
	    	    
	    var watcherMml = MML["annotation-xml"](MML.xml(watcher)).With({encoding:"application/xhtml+xml",isToken:true});
	    this.Push(MML.semantics(watcherMml));
	},
	
	/* Implements \answer[key=value]{text} */
	answer: function(name) {
	    var keys = this.GetBrackets(name);

	    var input = HTML.Element("form",
				     {className:"mathjaxed-input",
				      style: {marginBottom: "10px", marginTop: "10px", display: "inline-flex" },
				     });
	    input.setAttribute("xmlns","http://www.w3.org/1999/xhtml");
	    
	    // Parse key=value pairs from optional [bracket] into data- attributes
	    var options = {};
	    if (keys !== undefined) {
		keys.split(",").forEach( function(keyvalue) { 
		    var key = keyvalue.split("=")[0];
		    var value = keyvalue.split("=").slice(1).join('=');
		    if (value === undefined)
			value = true;

		    input.setAttribute("data-" + key,value);
		    
		    options[key] = value;
		});
		}
		var showAnswer = options['onlinenoinput'] === '' || options['onlineshowanswerbutton'] === ''
		var showInput = options['onlinenoinput'] !== ''
	    	    
	    var format = options['format'];
	    var answer;
	    
	    if (format == 'string') {
		answer = this.GetArgument(name);
		answer = MML.mtext(answer);
	    } else if ((format == 'integer') || (format == 'float')) {
		answer = this.GetArgument(name);
		answer = MML.mn(answer);
	    } else {
		// This actually PARSES the content of the \answer command
		// with mathjax; the result will be MathML.  If we had
		// instead used this.GetArgument(name) we could have
		// gotten the raw string passed to \answer, but by using
		// ParseArg, we can invoke \newcommand's from inside an
		// \answer.
		answer = this.ParseArg(name);
	    }
		input.style.width = (155 + ((showAnswer && showInput) ? 25 : 0)).toString() + "px";

		// Attempt to change size if we have a short answer
	    try {
		answer.parent = {inferRow: false};
		var correctAnswerMml = answer.toMathML("");	
		var correctAnswer = Expression.fromMml(correctAnswerMml).toString().toString();
		if (correctAnswer.length <= 3) {
		    input.classList.add('narrow'); // to eliminate some padding
			input.style.width = (70 + ((showAnswer && showInput) ? 25 : 0)).toString() + "px";
		}
	    } catch (err) {
	    }
	    
	    this.Push(MML.mpadded(MML.mphantom(answer)).With({height: 0, width: 0}));
		mathAnswer.createMathAnswer(input, showInput, showAnswer);

	    var xml = MML.xml(input);
	    var mml = MML["annotation-xml"](xml).With({encoding:"application/xhtml+xml",isToken:true});
	    var semantics = MML.semantics(mml);
		this.Push(semantics);
		this.Push(MML.mpadded().With({height: "30px", width: 0}));

	    return;
	}
    });
});

function searchJax(jax, spanID){
    // Sometimes the jax is null?  I don't really know why.
    if (jax === null)
	return null;
    
     if(jax.spanID == spanID){
          return jax;
     } else if (jax.data != null){
          var i;
         var result = null;
         for(i=0; result == null && i < jax.data.length; i++){
             result = searchJax(jax.data[i], spanID);
         }
         return result;
     }
     return null;
}

var answerIdBindings = {};

MathJax.Hub.signal.Interest(function (message) {    
    if (message[0] == "New Math") {
	var id = message[1];

	if (answerIdBindings[id] === undefined) {
	    answerIdBindings[id] = {};
	}

	var element = $('#' + id + "-Frame");
	var jax = MathJax.Hub.getAllJax(id);

	var internalCount = 0;
	
	$(".mathjaxed-input", element).each( function() {
	    var result = $(this);
	    
	    if (answerIdBindings[id][internalCount] === undefined) {
		// Number the answer boxes in order
		var problem = result.parents( ".problem-environment" ).first();
		var count = problem.attr( "data-answer-count" );
		if (typeof count === typeof undefined || count === false) {
		    count = 0;
		}
    
		problem.attr( "data-answer-count", parseInt(count) + 1 );
		var problemIdentifier = problem.attr( "id" );

		// Store the answer index as an id
		answerIdBindings[id][internalCount] = "answer" + count + problemIdentifier;
	    }
	    
	    result.attr('id', answerIdBindings[id][internalCount] );
	    internalCount = internalCount + 1;

	    var answerDom = result.closest('.semantics').prev('.mpadded').find('.mphantom').first();
	    var answerId = parseInt(answerDom.attr('id').replace('MathJax-Span-',''));
	    var answer = searchJax(jax[0].root, answerId);

	    mathAnswer.connectMathAnswer( result, answer );
	});
    }
});


MathJax.Hub.Configured();

$(document).ready(function() {
    // Make anchors with references from \ref actually work
	$('a.ximera-label').texLabel();
	$('a.reference').reference();
	
	// This could go in "init" above, but it needs to be after the end process hook
    /*
     * Capture the complete author-delivered activity source before MathJax
     * parsing and saved-answer restoration modify or replace source nodes.
     */
    sagemath.captureInitialSagePageManifestSnapshot();

	MathJax.Hub.Startup.onload();
    
    // BADBAD: This seems like the wrong thing---why is default here?
    syntaxHighlighter.default.highlight();

    rowclick.addClickableTableRows();

    // Scroll to correct item in (old) top card-list
    $('.kinetic').kinetic({});
    var active = $('.activity-card.active');
    if (active.length > 0) {
	var left = $('.activity-card.active').position().left;
	var cardWidth = $('.activity-card.active').width();
	var windowWidth = $('.kinetic').width();
	$('.kinetic').scrollLeft( left - windowWidth / 2 + cardWidth / 2 );
    }

    // Scroll to correct item in (new) nav menu
    $('.main-toc').kinetic({});
    var active = $('.activity-card.active');
    if (active.length > 0) {
		var top = $('.activity-card.active').position().top;
		var cardHeight = $('.activity-card.active').height();
		var windowHeight = $('.main-toc').height();
		$('.main-toc').scrollTop( top - windowHeight / 2 + cardHeight / 2 );
    }

    // This is both mouseup for desktop
    $('.activity-card a').bind( "mouseup", function(event){
	if (( $('.kinetic-moving-left').length > 0 ) || ( $('.kinetic-moving-right').length > 0 )) {
	    event.preventDefault();
	}
    });

    // This handles touchscreens; moving less than 100 pixels in less
    // than 500 ms should count as a click
    // var position = 0;
    // var distance = 0;
    // var startTime = 0;
    // $('.activity-card').on( "touchstart", function(e){
	// position = e.originalEvent.touches[0].screenX;
	// distance = 0;
	// startTime = e.originalEvent.timeStamp
    // });
    
    // $('.activity-card').on( "touchmove", function(e){
	// var newPosition = e.originalEvent.touches[0].screenX;
	// distance = distance + Math.abs( newPosition - position );
	// position = newPosition;
    // });    

    // $('.activity-card').on( "touchend", function(e){
	// var duration = e.originalEvent.timeStamp - startTime;
	// if ((distance < 100) && (duration < 500)) {
	// 	var href = $(this).children('a').attr('href');
	// 	if(href)
	//     	window.location.href = href;
	// }
    // });

    $(".dropdown-toggle").dropdown();

    $('[data-toggle="tooltip"]').tooltip();

    $(".activity").activity();
});

console.log("done.");

