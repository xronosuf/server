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

var annotator = require('./annotator');

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

            group.hints[revealed].show();
            revealed += 1;

            button.find('.counter').show();
            button.find('.count').text(Math.min(revealed + 1, group.hints.length).toString());

            if (revealed >= group.hints.length) {
                button.hide();
            }

            if (MathJax && MathJax.Hub) {
                MathJax.Hub.Queue(["Rerender", MathJax.Hub, group.problem[0]]);
            }

            return false;
        });
    });

    console.log('Converted accordion hints to legacy hint buttons:', convertedCount);
};


var createActivity = function() {
	var activity = $(this);
	
	$(".foldable", activity).foldable();
	$(".accordion", activity).addClass('hidden-out-of-view')

    //$('.activity-body', this).annotator();
    
    activity.fetchData( function() {
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
	$(".validator", activity).validator();
	$(".inline-javascript", activity).javascript();
	$('.youtube-player', activity).youtube();
	
	connectInteractives();
	
	$('.activity-card').activityCard();
    });
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

