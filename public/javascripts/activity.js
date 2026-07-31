var $ = require('jquery');
var _ = require('underscore');
var MathJax = require('mathjax');
var TinCan = require('./tincan');
var ProgressBar = require('./progress-bar');

var activityCard = require('./activity-card');
var problem = require('./problem');
var theorem = require('./theorem');
var question = require('./question');
var mathAnswer = require('./math-answer');
var multipleChoice = require('./multiple-choice');
var selectAll = require('./select-all');
var wordChoice = require('./word-choice');
var hint = require('./hint');
var foldable = require('./foldable');
var youtube = require('./youtube');

var freeResponse = require('./free-response');
var coding = require('./coding');
var shuffle = require('./shuffle');
var feedback = require('./feedback');
var validator = require('./validator');
var javascript = require('./javascript');

var connectInteractives = require('./interactives').connectInteractives;

var database = require('./database');
var pageRuntime = require('./page-runtime');

var annotator = require('./annotator');
var pageRuntime = require('./page-runtime');

var installLegacyAccordionHints = function(activity) {
    var HINT_WAIT_SECONDS = 10;
    var groups = [];
    var convertedCount = 0;
    var secondsRemaining = HINT_WAIT_SECONDS;
    var timer;

    var findGroup = function(problem) {
        var i;

        for (i = 0; i < groups.length; i += 1) {
            if (groups[i].problem[0] === problem[0]) {
                return groups[i];
            }
        }

        groups.push({ problem: problem, hints: [] });
        return groups[groups.length - 1];
    };

    var makeButton = function(total) {
        return $(
            '<button class="btn btn-info btn-reveal-hint xronos-legacy-hint-button" type="button" data-toggle="tooltip" data-placement="top" title="Hints unlock after a short wait.">' +
            '<i class="fa fa-life-ring"></i>&nbsp; ' +
            '<span class="hint-text">Show hint</span>' +
            '<span class="counter"> (<span class="count">1</span> of <span class="total">' + total + '</span>)</span>' +
            '<span class="hint-locked"> (<i class="fa fa-lock"></i> <span class="seconds-remaining">' + HINT_WAIT_SECONDS + '</span>)</span>' +
            '<span class="hint-unlocked"> <i class="fa fa-unlock"></i></span>' +
            '</button>'
        );
    };

    var convertAccordionToHint = function(accordion) {
        var header = accordion.children('h3.xmhint, .xmhint').first();
        var panel = $();
        var panelId;
        var hint;

        if (header.length === 0) {
            return undefined;
        }

        panelId = header.attr('aria-controls');

        if (panelId) {
            panel = $(document.getElementById(panelId));
        }

        if (panel.length === 0) {
            panel = accordion.children('.xmhint-content, .accordion-item').first();
        }

        if (panel.length === 0) {
            return undefined;
        }

        hint = $('<div class="xronos-legacy-hint"></div>');
        hint.append(panel.contents());

        accordion.replaceWith(hint);

        return hint;
    };

    $('.problem-environment .accordion', activity).each(function() {
        var accordion = $(this);
        var problem = accordion.closest('.problem-environment');
        var hint;
        var group;

        if (problem.length === 0) {
            return;
        }

        hint = convertAccordionToHint(accordion);

        if (!hint) {
            return;
        }

        group = findGroup(problem);
        group.hints.push(hint);
        convertedCount += 1;
    });

    if (convertedCount === 0) {
        return;
    }

    timer = window.setInterval(function() {
        secondsRemaining -= 1;

        $('.xronos-legacy-hint-button .seconds-remaining', activity).each(function() {
            $(this).text(Math.max(secondsRemaining, 0).toString());
        });

        if (secondsRemaining <= 0) {
            window.clearInterval(timer);

            $('.xronos-legacy-hint-button', activity).each(function() {
                $(this)
                    .addClass('xronos-hints-unlocked')
                    .attr('title', 'Show the next hint.');
            });
        }
    }, 1000);

    groups.forEach(function(group) {
        var button = makeButton(group.hints.length);
        var revealed = 0;

        group.hints.forEach(function(hint) {
            hint.hide();
        });

        /*
         * Preserve author-controlled vertical placement:
         * the button replaces the first authored hint position, rather than
         * being moved to the top of the problem.
         */
        group.hints[0].before(button);

        button.click(function(event) {
            event.preventDefault();

            if (secondsRemaining > 0) {
                button.attr('title', 'Hints unlock in ' + secondsRemaining + ' seconds.');
                button.find('.hint-locked').show();
                return false;
            }

            if (revealed >= group.hints.length) {
                button.hide();
                return false;
            }

            var hintIndex = revealed;
            var problemId =
                group.problem.attr('id') || null;

            pageRuntime.operation(
                'legacy-hint-reveal',
                'requested',
                {
                    problemId: problemId,
                    hintIndex: hintIndex,
                    totalHints: group.hints.length
                }
            );

            group.hints[hintIndex].show();
            revealed += 1;

            pageRuntime.operation(
                'legacy-hint-reveal',
                'displayed',
                {
                    problemId: problemId,
                    hintIndex: hintIndex,
                    revealedHints: revealed,
                    totalHints: group.hints.length
                }
            );

            button.find('.counter').show();
            button.find('.count').text(Math.min(revealed + 1, group.hints.length).toString());

            if (revealed >= group.hints.length) {
                button.hide();
            }

            if (MathJax && MathJax.Hub) {
                pageRuntime.operation(
                    'legacy-hint-rerender',
                    'queued',
                    {
                        problemId: problemId,
                        hintIndex: hintIndex
                    }
                );

                MathJax.Hub.Queue(
                    [
                        "Rerender",
                        MathJax.Hub,
                        group.problem[0]
                    ],
                    function() {
                        pageRuntime.operation(
                            'legacy-hint-rerender',
                            'completed',
                            {
                                problemId: problemId,
                                hintIndex: hintIndex
                            }
                        );
                    }
                );
            } else {
                pageRuntime.operation(
                    'legacy-hint-rerender',
                    'not-required',
                    {
                        problemId: problemId,
                        hintIndex: hintIndex,
                        reason: 'mathjax-unavailable'
                    }
                );
            }

            return false;
        });
    });

    console.log('Converted accordion hints to legacy hint buttons:', convertedCount);
};


var createActivity = function() {
	var activity = $(this);

    pageRuntime.component(
        "activity",
        "waiting-for-initial-state",
        {
            path: activity.attr("data-path"),
            hashAvailable:
                activity.attr("data-hash") !== undefined
        }
    );
	
	$(".foldable", activity).foldable();
	$(".accordion", activity).addClass('hidden-out-of-view')

    //$('.activity-body', this).annotator();
    
    activity.fetchData( function() {
        pageRuntime.component(
            "activity",
            "initializing",
            {
                path: activity.attr("data-path")
            }
        );

	activity.persistentData( function() {
	    if (!(activity.persistentData( 'experienced' ))) {
		TinCan.experience(activity);
		activity.persistentData( 'experienced', true );
	    }
	});

	ProgressBar.monitorActivity( activity );


		installLegacyAccordionHints(activity);
	// Number theorems
	["theorem", "axiom", "conjecture", "corollary", "proposition", "lemma", "claim", "condition", "idea", "definition", "conclusion", "summary", "warning", "paradox", "example", "observation", "fact", "remark", "algorithm", "notation", "criterion", "exercise", "problem", "explanation", "exploration", "model","formula","procedure","template"].forEach(function(t){
		$("."+t, activity).numberTheorem();
	})


	$(".question", activity).numberQuestion();

	$(".problem-environment", activity).problemEnvironment();
	$(".multiple-choice", activity).multipleChoice();
	$(".select-all", activity).selectAll();
	$(".word-choice", activity).wordChoice();
	$(".hint", activity).hint();
	
	$(".free-response", activity).freeResponse();
	$(".javascript-code", activity).coding();	
	
	$(".shuffle", activity).shuffle();
	$(".feedback", activity).feedback();
        var validatorCount =
            $(".validator", activity).length;

        pageRuntime.component(
            "validators",
            "initializing",
            {
                count: validatorCount
            }
        );

	$(".validator", activity).validator();

        pageRuntime.component(
            "validators",
            "initialized",
            {
                count: validatorCount
            }
        );
	var inlineJavascriptCount =
	    $(".inline-javascript", activity).length;

	pageRuntime.component(
	    "author-inline-javascript",
	    "initializing",
	    {
		count: inlineJavascriptCount,
		initialStateAvailable: true
	    }
	);

	$(".inline-javascript", activity).javascript();

	pageRuntime.component(
	    "author-inline-javascript",
	    inlineJavascriptCount > 0
		? "initialized"
		: "not-required",
	    {
		count: inlineJavascriptCount,
		initialStateAvailable: true
	    }
	);

	$('.youtube-player', activity).youtube();
	
	connectInteractives();
	
	$('.activity-card').activityCard();

        pageRuntime.component(
            "activity",
            "initialized",
            {
                path: activity.attr("data-path")
            }
        );
    }, "activity");
};

$.fn.extend({
    activity: function() {
	return this.each( createActivity );
    },

    recordCompletion: function(proportionComplete) {
	var hash = $(this).activityHash();

	if (hash != undefined) {
	    var repositoryName = $(this).repositoryName();
	    var activityPath = $(this).activityPath();

	    database.setCompletion( repositoryName, activityPath, proportionComplete );
	}

	return;
    }
});

/* === Xronos contained activity topbar layout === */
function xronosContainedTopbarText(el) {
    return (el && el.textContent ? el.textContent : "").replace(/\s+/g, " ").trim();
}

function xronosContainedTopbarIsSlot(el) {
    return el && el.classList && (
        el.classList.contains("xronos-contained-search-slot") ||
        el.classList.contains("xronos-contained-title-slot") ||
        el.classList.contains("xronos-contained-grade-slot") ||
        el.classList.contains("xronos-contained-action-slot") ||
        el.classList.contains("xronos-contained-activity-slot")
    );
}

function xronosContainedTopbarDirectChildMatching(mainTitle, predicate) {
    var children = Array.prototype.slice.call(mainTitle.children);

    return children.find(function(el) {
        if (xronosContainedTopbarIsSlot(el)) {
            return false;
        }

        return predicate(el);
    });
}

function xronosContainedTopbarMoveLateControls(mainTitle) {
    var gradeSlot = mainTitle.querySelector(".xronos-contained-grade-slot");
    var actionSlot = mainTitle.querySelector(".xronos-contained-action-slot");

    if (!gradeSlot || !actionSlot) {
        return;
    }

    function directChildIn(container, predicate) {
        var children = Array.prototype.slice.call(container.children || []);

        return children.find(function(el) {
            return predicate(el);
        });
    }

    function gradeSyncPredicate(el) {
        var text = xronosContainedTopbarText(el);
        return /grade/i.test(text) && /sync/i.test(text);
    }

    var gradeSync = xronosContainedTopbarDirectChildMatching(mainTitle, gradeSyncPredicate);

    /*
     * The grade-sync pill is inserted by another script.  Depending on timing,
     * it may be inserted relative to the Another/Math-Editor controls after
     * those controls have already been moved into the action slot.  Rescue it
     * from the action slot and move it back to the grade slot.
     */
    if (!gradeSync) {
        gradeSync = directChildIn(actionSlot, gradeSyncPredicate);
    }

    var another = xronosContainedTopbarDirectChildMatching(mainTitle, function(el) {
        return xronosContainedTopbarText(el).indexOf("Another") !== -1;
    });

    var mathEditor = xronosContainedTopbarDirectChildMatching(mainTitle, function(el) {
        return el.id === "math-edit-button";
    });

    if (gradeSync && gradeSync.parentNode !== gradeSlot) {
        gradeSlot.appendChild(gradeSync);
    }

    if (another && another.parentNode !== actionSlot) {
        actionSlot.appendChild(another);
    }

    if (mathEditor && mathEditor.parentNode !== actionSlot) {
        actionSlot.appendChild(mathEditor);
    }

    /*
     * Keep the action controls in the intended order:
     *   Another, then Math Editor.
     *
     * Late-arriving controls can otherwise appear in DOM insertion order,
     * which may put Math Editor before Another.
     */
    if (another && mathEditor &&
            another.parentNode === actionSlot &&
            mathEditor.parentNode === actionSlot &&
            another.nextSibling !== mathEditor) {
        actionSlot.insertBefore(mathEditor, another.nextSibling);
    }
}

function xronosContainedActivityTopbarLayout() {
    var mainTitle = document.querySelector(".main-title");
    var tocSearch = document.querySelector(".toc-search");
    var activityTitle = document.querySelector(".activity-title");
    var titleNode;

    if (!mainTitle || !tocSearch || !activityTitle) {
        return;
    }

    if (!mainTitle.classList.contains("xronos-contained-topbar-ready")) {
        titleNode = mainTitle.querySelector(".title-xourse") || mainTitle.querySelector(".title-activity");

        if (!titleNode) {
            return;
        }

        var searchSlot = document.createElement("div");
        var titleSlot = document.createElement("div");
        var gradeSlot = document.createElement("div");
        var actionSlot = document.createElement("div");
        var activitySlot = document.createElement("div");

        searchSlot.className = "xronos-contained-search-slot";
        titleSlot.className = "xronos-contained-title-slot";
        gradeSlot.className = "xronos-contained-grade-slot";
        actionSlot.className = "xronos-contained-action-slot";
        activitySlot.className = "xronos-contained-activity-slot";

        searchSlot.appendChild(tocSearch);
        titleSlot.appendChild(titleNode);
        activitySlot.appendChild(activityTitle);

        mainTitle.appendChild(searchSlot);
        mainTitle.appendChild(titleSlot);
        mainTitle.appendChild(gradeSlot);
        mainTitle.appendChild(actionSlot);
        mainTitle.appendChild(activitySlot);

        var settings = mainTitle.querySelector(".xmsettings");
        if (settings) {
            mainTitle.appendChild(settings);
        }

        mainTitle.classList.add("xronos-contained-topbar-ready");
    }

    xronosContainedTopbarMoveLateControls(mainTitle);

    if (!mainTitle.xronosContainedTopbarObserver) {
        mainTitle.xronosContainedTopbarObserver = new MutationObserver(function() {
            xronosContainedTopbarMoveLateControls(mainTitle);
        });

        mainTitle.xronosContainedTopbarObserver.observe(mainTitle, {
            childList: true
        });
    }

    /*
     * Some controls, especially grade-sync status, may be inserted after the
     * initial DOMContentLoaded pass.  Run a few delayed passes so we do not
     * depend entirely on mutation timing.
     */
    [250, 750, 1500, 3000].forEach(function(delay) {
        window.setTimeout(function() {
            xronosContainedTopbarMoveLateControls(mainTitle);
        }, delay);
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", xronosContainedActivityTopbarLayout);
} else {
    xronosContainedActivityTopbarLayout();
}
/* === /Xronos contained activity topbar layout === */
