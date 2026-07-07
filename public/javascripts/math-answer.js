var $ = require('jquery');
var jqueryUI = require('jquery-ui/ui/unique-id');
var _ = require('underscore');
var MathJax = require('./mathjax');
var TinCan = require('./tincan');
var database = require('./database');
var Expression = require('math-expressions');
var ProgressBar = require('./progress-bar');
var popover = require('./popover');
var Javascript = require('./javascript');
var palette = require('./math-palette');

var buttonlessTemplate = '<input class="form-control" type="text"/>';

// add labels for screenreader
var template = '<div class="input-group" style="width:100%">' +
   	'<input class="form-control answer-input-part" aria-label="answer" type="text"/>' +
        '<span class="input-group-btn answer-input-part">' +
	'<button class="px-0 btn btn-success btn-ximera-correct" data-toggle="tooltip" data-placement="top" title="Correct!" style="display: none; z-index: 1;" aria-label="Correct" aria-live="polite">' +
	'<i class="fa fa-fw fa-check"></i>' +
	'</button>' +
	'<button class="px-0 btn btn-danger btn-ximera-incorrect" data-toggle="tooltip" data-placement="top" title="Incorrect, try again!" style="display: none; z-index: 1;" aria-label="Incorrect, try again" aria-live="polite">' +
	'<i class="fa fa-fw fa-times"></i>' +
        '</button>' +
	'<button class="px-0 btn btn-primary disabled btn-ximera-checking" aria-label="Checking" data-toggle="tooltip" data-placement="top" title="Check..." style="z-index: 1; display: none;">' +
	'<i class="fa fa-fw fa-spinner fa-spin"></i>' +
	'</button>' +
	'<button class="px-0 btn btn-primary btn-ximera-submit" aria-label="Check" data-toggle="tooltip" data-placement="top" title="Click to check your answer." style="z-index: 1;">' +
	'<i class="fa fa-fw fa-question"></i>' +
	'</button>' +
	'</span>' +
	'<span class="input-group-btn show-answer-small">' +
	'<button class="px-0 btn btn-primary btn-info btn-ximera-show-answer" style="vertical-align:baseline" aria-label="Show Answer" data-toggle="tooltip" data-placement="top" title="Click to Show Answer." style="z-index: 1;">' +
	'<i class="fa fa-fw fa-key"></i>' +
	'</button>' +
	'</span>' +
	'<span class="input-group-btn show-answer-large" style="width:100%">' +
	'<button class="px-0 btn btn-primary btn-info btn-ximera-show-answer" style="vertical-align:baseline; width:100%" aria-label="Show Answer" data-toggle="tooltip" data-placement="top" title="Click to Show Answer." style="z-index: 1;">' +
	'<i class="fa fa-fw fa-key"></i><span class="show-answer-text">Show Answer</span>' +
	'</button>' +
	'</span>' +
	'</div>';

function parseFormattedInput( format, input ) {
    if (format == 'integer')
	return parseInt(input);
    else if (format == 'float')
	return parseFloat(input);
    else if (format == 'string')
	return input;
    else {
	try {
	    return Expression.fromText( input );
	} catch (err) {
	    try {
		return Expression.fromLatex( input );
	    } catch (err) {
		return undefined;
	    }
	}
    }

    return undefined;
}


function displayTexForCorrectStudentAnswer(result, instructorAnswerTex) {
    var response = result.persistentData('response');
    var parsed;

    /*
     * Once an answer is validated as correct, show the student's submitted
     * response rather than replacing it with the instructor/canonical answer.
     *
     * Prefer a parsed LaTeX form when available so input such as 6(4)^14
     * displays with the full exponent grouped, rather than TeX interpreting
     * only the first character after ^ as the exponent.
     *
     * If no response is available, fall back to the instructor answer so older
     * saved state or unusual show-answer paths still render something useful.
     */
    if (response !== undefined && response !== null && response !== '') {
        try {
            parsed = parseFormattedInput(result.attr('data-format'), response.toString());

            if (parsed && typeof parsed.toLatex === 'function') {
                return parsed.toLatex();
            }
        } catch (err) {
            // Fall through to raw response below.
        }

        return response.toString();
    }

    return instructorAnswerTex;
}

function assignGlobalVariable( answerBox, text ) {
    var result = answerBox;
    
    if (result.attr('data-id')) {
	window[result.attr('data-id')] =
	    parseFormattedInput( result.attr('data-format'), text );

	Javascript.reevaluate(result);
    }
}

exports.createMathAnswer = function(input, showInput, showAnswerButton) {
    input = $(input);
    var width = input.width();

    var buttonless = false;
    // BADBAD: since the thing isn't in the DOM, I can't tell if it should be buttonless.
    /* TODO: removed this :)
    if (input.parents('.validator').length > 0) {
		result = $(buttonlessTemplate);
		buttonless = true;
	}
	*/

	/*if (showInput){
		if(showAnswerButton)
			input.append($(templateWithShow));
		else 
			input.append($(template))

	}
	else if (showAnswerButton) {
		input.append($(showAnswerTemplate))
	}*/

	input.append($(template))
	if(!showInput){
		input.find('.show-answer-small').hide()
		input.find('.answer-input-part').hide()
	}
	else{
		input.find('.show-answer-large').hide()
		if(!showAnswerButton){
			input.find('.show-answer-small').hide()
		}
	}

    return;
}

exports.connectMathAnswer = function(result, answer) {
    var buttonless = false;
    if (result.parents('.validator').length > 0) {
	buttonless = true;
    }
    
    // When the box changes, update the database AND any javascript variables
    var inputBox = result.find( "input.form-control" );
    
    inputBox.on( 'input', function() {
	var text = $(this).val();
	result.persistentData( 'response', text );
	assignGlobalVariable( result, text );	
    });

    // ACCESSIBILITY: unfortunately, we prevent spacebar from opening
    // a mathjax menu.  By enabling menus in mathjax, right-clicking
    // still opens the menu.
    //inputBox.on( 'keydown', function(event) {
    inputBox.on( 'keydown', function(event) {	
	if (event.keyCode == 32) {
	    event.stopPropagation();
	}
    });

    ////////////////////////////////////////////////////////////////
    // Link the "math editor" button in the toolbar to the CURRENTLY
    // FOCUSED textfield
    function updateMathEditButton() {
	if ($(document.activeElement).attr('data-input-box'))
	    $("#math-edit-button").show();
	else
	    $("#math-edit-button").hide();
    }

    /*
      If you happen to click outside a math input box, then the math
    editor will still be linked to your previous choice.
    inputBox.focusout( function() { window.setTimeout( function() {
    updateMathEditButton(); }, 100 ); });
    */
    
    inputBox.focus( function() {
	$(this).attr( 'data-input-box', true );
	updateMathEditButton();
	
	$("#math-edit-button").unbind("click");
	$("#math-edit-button").click( function() {
	    palette.launch( inputBox.val(),
			    function( err, text ) {
				inputBox.val(text),
				result.persistentData( 'response', text );
				assignGlobalVariable( result, text );
				inputBox.focus();
				inputBox.trigger('input');
			    });
	});
    });

    result.on( 'ximera:statistics:answers', function(event, answers, statistics) {
	function asNumber(value) {
	    var number = Number(value);

	    if (isNaN(number)) {
		return 0;
	    }

	    return number;
	}

	function plural(word, count) {
	    return count === 1 ? word : word + 's';
	}

	function formatStatisticValue(value) {
	    var number;

	    if (value === null || value === undefined) {
		return '\u2014';
	    }

	    number = Number(value);

	    if (isNaN(number)) {
		return String(value);
	    }

	    if (number % 1 === 0) {
		return String(number);
	    }

	    return String(Math.round(number * 10) / 10);
	}

	function countText(count, noun) {
	    count = asNumber(count);

	    return count + ' ' + plural(noun, count);
	}

	function countOfBare(count, total) {
	    return asNumber(count) + ' of ' + asNumber(total);
	}

	function countOfWithNoun(count, total, noun) {
	    count = asNumber(count);
	    total = asNumber(total);

	    return count + ' of ' + total + ' ' + plural(noun, total);
	}

	function compressedRanges(numbers) {
	    var ranges = [];
	    var start;
	    var previous;

	    numbers = numbers
		.filter(function(number) {
		    return !isNaN(number);
		})
		.sort(function(a, b) {
		    return a - b;
		});

	    numbers.forEach(function(number) {
		if (start === undefined) {
		    start = number;
		    previous = number;
		    return;
		}

		if (number === previous + 1) {
		    previous = number;
		    return;
		}

		ranges.push(start === previous ? String(start) : String(start) + '\u2013' + String(previous));
		start = number;
		previous = number;
	    });

	    if (start !== undefined) {
		ranges.push(start === previous ? String(start) : String(start) + '\u2013' + String(previous));
	    }

	    return ranges.join(', ');
	}

	function sortedSubmissions(answers) {
	    return Object.keys(answers || {}).sort(function(a, b) {
		var difference = asNumber(answers[b]) - asNumber(answers[a]);

		if (difference !== 0) {
		    return difference;
		}

		if (a < b) {
		    return -1;
		}

		if (a > b) {
		    return 1;
		}

		return 0;
	    });
	}

	function totalSubmissionCount(answers) {
	    return Object.keys(answers || {}).map(function(answer) {
		return asNumber(answers[answer]);
	    }).reduce(function(a, b) {
		return a + b;
	    }, 0);
	}

	function detailSection(title) {
	    var details = $('<details/>', {
		style: 'margin: 0.75rem 0;'
	    });

	    details.append($('<summary/>', {
		style: 'cursor: pointer; font-weight: bold;'
	    }).text(title));

	    return details;
	}

	function simpleTable() {
	    return $('<table/>', {
		'class': 'table table-striped table-sm',
		style: 'margin-top: 0.5rem;'
	    });
	}

	function addMeasureRow(tableBody, label, value) {
	    tableBody.append(
		$('<tr/>')
		    .append($('<th/>', {
			scope: 'row'
		    }).text(label))
		    .append($('<td/>').text(value))
	    );
	}

	function addSubMeasureRow(tableBody, label, value) {
	    tableBody.append(
		$('<tr/>')
		    .append($('<td/>', {
			style: 'padding-left: 2rem;'
		    }).text(label))
		    .append($('<td/>').text(value))
	    );
	}

	function addDividerRow(tableBody, label) {
	    tableBody.append(
		$('<tr/>')
		    .append($('<th/>', {
			colspan: 2,
			style: 'padding-top: 0.75rem;'
		    }).text(label))
	    );
	}

	function buildCommonSubmissionsSection(answers) {
	    var section = detailSection('Most common submissions');
	    var submissions = sortedSubmissions(answers);
	    var topSubmissions = submissions.slice(0, 5);
	    var hiddenSubmissions = submissions.slice(5);
	    var repeatedThreeOrMore = 0;
	    var repeatedTwice = 0;
	    var oneOff = 0;
	    var table = simpleTable();
	    var tbody = $('<tbody/>');
	    var hiddenSummary = $('<ul/>');

	    table.append(
		$('<thead/>').append(
		    $('<tr/>')
			.append($('<th/>').text('Submission'))
			.append($('<th/>').text('Frequency'))
		)
	    );

	    topSubmissions.forEach(function(submission) {
		tbody.append(
		    $('<tr/>')
			.append($('<td/>').text(submission))
			.append($('<td/>').text(asNumber(answers[submission])))
		);
	    });

	    if (topSubmissions.length === 0) {
		tbody.append(
		    $('<tr/>').append(
			$('<td/>', {
			    colspan: 2
			}).text('No submissions were found for this answer box.')
		    )
		);
	    }

	    table.append(tbody);
	    section.append(table);

	    hiddenSubmissions.forEach(function(submission) {
		var count = asNumber(answers[submission]);

		if (count >= 3) {
		    repeatedThreeOrMore += 1;
		} else if (count === 2) {
		    repeatedTwice += 1;
		} else if (count === 1) {
		    oneOff += 1;
		}
	    });

	    if (hiddenSubmissions.length > 0) {
		section.append($('<h6/>').text('Additional hidden submissions'));

		if (repeatedThreeOrMore > 0) {
		    hiddenSummary.append($('<li/>').text(repeatedThreeOrMore + ' of the hidden ' + plural('submission', repeatedThreeOrMore) + ' occurred at least 3 times.'));
		}

		if (repeatedTwice > 0) {
		    hiddenSummary.append($('<li/>').text(repeatedTwice + ' of the hidden ' + plural('submission', repeatedTwice) + ' occurred twice.'));
		}

		if (oneOff > 0) {
		    hiddenSummary.append($('<li/>').text(oneOff + ' one-off ' + plural('submission', oneOff) + ' hidden.'));
		}

		section.append(hiddenSummary);
	    }

	    return section;
	}

	function ordinal(number) {
	    var tens = number % 100;
	    var ones = number % 10;

	    if (tens >= 11 && tens <= 13) {
		return number + 'th';
	    }

	    if (ones === 1) {
		return number + 'st';
	    }

	    if (ones === 2) {
		return number + 'nd';
	    }

	    if (ones === 3) {
		return number + 'rd';
	    }

	    return number + 'th';
	}

	function versionTitle(versionNumber) {
	    var labels = {
		0: 'Original version',
		1: 'Second version',
		2: 'Third version',
		3: 'Fourth version',
		4: 'Fifth version',
		5: 'Sixth version',
		6: 'Seventh version',
		7: 'Eighth version',
		8: 'Ninth version',
		9: 'Tenth version'
	    };

	    if (labels[versionNumber]) {
		return labels[versionNumber];
	    }

	    return ordinal(versionNumber + 1) + ' version';
	}

	function displayedVersionNumber(versionNumber) {
	    return asNumber(versionNumber) + 1;
	}

	function versionGeneratedNextAfterCorrect(version) {
	    return Math.max(0, asNumber(version.studentsGeneratedNextVersion) - asNumber(version.studentsGeneratedNextVersionBeforeCorrect));
	}

	function buildVersionSection(version) {
	    var generatedNextAfterCorrect = versionGeneratedNextAfterCorrect(version);
	    var section = detailSection(versionTitle(asNumber(version.version)));
	    var table = simpleTable();
	    var tbody = $('<tbody/>');

	    table.append(
		$('<thead/>').append(
		    $('<tr/>')
			.append($('<th/>').text('Measure'))
			.append($('<th/>').text('Value'))
		)
	    );

	    addMeasureRow(tbody, 'Students who reached this version', countText(version.studentsReachedVersion, 'student'));
	    addMeasureRow(tbody, 'Students who attempted this answer box', countText(version.studentsAttempted, 'student'));
	    addMeasureRow(tbody, 'Counted submissions to this answer box', countText(version.totalAttempts, 'submission'));

	    if (asNumber(version.postFirstCorrectSubmissions) > 0) {
		addMeasureRow(tbody, 'Submissions omitted after first correct', countText(version.postFirstCorrectSubmissions, 'submission'));
	    }

	    addDividerRow(tbody, 'Students who were...');
	    addSubMeasureRow(tbody, 'Eventually correct', countText(version.eventuallyCorrect, 'student'));
	    addSubMeasureRow(tbody, 'Correct on first attempt', countText(version.correctOnFirstAttempt, 'student'));
	    addSubMeasureRow(tbody, 'Correct on second attempt', countText(version.correctOnSecondAttempt, 'student'));
	    addSubMeasureRow(tbody, 'Correct after 3 or more submissions', countText(version.correctAfterThreeOrMoreAttempts, 'student'));

	    addMeasureRow(tbody, 'Mean submissions until first correct', formatStatisticValue(version.meanAttemptsToFirstCorrectAmongEventuallyCorrect));

	    if (asNumber(version.studentsGeneratedNextVersion) > 0) {
		addMeasureRow(tbody, 'Students who generated another version afterward', countText(version.studentsGeneratedNextVersion, 'student'));
		addSubMeasureRow(tbody, '...after getting this answer correct', countText(generatedNextAfterCorrect, 'student'));
		addSubMeasureRow(tbody, '...before getting this answer correct', countText(version.studentsGeneratedNextVersionBeforeCorrect, 'student'));
		addSubMeasureRow(tbody, '...without attempting this answer', countText(version.studentsGeneratedNextVersionWithoutAttempt, 'student'));
	    }

	    table.append(tbody);
	    section.append(table);

	    return section;
	}

	function allVersions(episodes) {
	    var versions = episodes.versions || {};

	    return Object.keys(versions)
		.map(function(key) {
		    return versions[key];
		})
		.sort(function(a, b) {
		    return asNumber(a.version) - asNumber(b.version);
		});
	}

	function attemptedVersions(episodes) {
	    return allVersions(episodes)
		.filter(function(version) {
		    return asNumber(version.studentsAttempted) > 0;
		});
	}

	function noAttemptDisplayedVersions(episodes) {
	    return allVersions(episodes)
		.filter(function(version) {
		    return asNumber(version.studentsAttempted) === 0;
		})
		.map(function(version) {
		    return displayedVersionNumber(version.version);
		});
	}

	function totalVersionCount(episodes) {
	    return allVersions(episodes).length;
	}

	function versionsWithAttemptsCount(episodes) {
	    return attemptedVersions(episodes).length;
	}

	function eventuallyCorrectAttemptedVersionCount(episodes) {
	    return attemptedVersions(episodes).filter(function(version) {
		return asNumber(version.eventuallyCorrect) > 0;
	    }).length;
	}

	function correctOnFirstAttemptVersionCount(episodes) {
	    return attemptedVersions(episodes).filter(function(version) {
		return asNumber(version.correctOnFirstAttempt) > 0;
	    }).length;
	}

	function buildVersionSummarySection(episodes) {
	    var totalVersions = totalVersionCount(episodes);
	    var attemptedCount = versionsWithAttemptsCount(episodes);
	    var noAttemptVersions = noAttemptDisplayedVersions(episodes);
	    var section = detailSection('Version summary for this answer box');
	    var table = simpleTable();
	    var tbody = $('<tbody/>');

	    table.append(
		$('<thead/>').append(
		    $('<tr/>')
			.append($('<th/>').text('Measure'))
			.append($('<th/>').text('Value'))
		)
	    );

	    addMeasureRow(tbody, 'Number of problem versions shown for this answer box', totalVersions);
	    addMeasureRow(tbody, 'Number of versions with counted answer-box submissions', countOfBare(attemptedCount, totalVersions));
	    addMeasureRow(tbody, 'Number of versions without counted answer-box submissions', countOfBare(totalVersions - attemptedCount, totalVersions));
	    addMeasureRow(tbody, 'Attempted versions eventually correct', countOfWithNoun(eventuallyCorrectAttemptedVersionCount(episodes), attemptedCount, 'attempted version'));
	    addMeasureRow(tbody, 'Attempted versions correct on first try', countOfWithNoun(correctOnFirstAttemptVersionCount(episodes), attemptedCount, 'attempted version'));

	    if (noAttemptVersions.length > 0) {
		addMeasureRow(tbody, 'Versions without attempts', 'versions ' + compressedRanges(noAttemptVersions));
	    }

	    table.append(tbody);
	    section.append(table);

	    return section;
	}

	function appendVersionSections(modalBody, statistics) {
	    var attempts = statistics && statistics.attempts;
	    var episodes = attempts && attempts.episodes;
	    var versions;

	    if (!episodes) {
		return;
	    }

	    versions = attemptedVersions(episodes);

	    versions.forEach(function(version) {
		modalBody.append(buildVersionSection(version));
	    });

	    modalBody.append(buildVersionSummarySection(episodes));
	}

	function attemptedStudentCount(statistics) {
	    return asNumber(statistics && statistics.attempts && statistics.attempts.attemptedStudents);
	}

	function omittedPostFirstCorrectSubmissionCount(statistics) {
	    return asNumber(statistics && statistics.attempts && statistics.attempts.postFirstCorrectSubmissions);
	}

	function answerAttemptVersionSummaryText(statistics) {
	    var attempts = statistics && statistics.attempts;
	    var episodes = attempts && attempts.episodes;
	    var totalVersions;
	    var attemptedCount;

	    if (!episodes) {
		return null;
	    }

	    totalVersions = totalVersionCount(episodes);
	    attemptedCount = versionsWithAttemptsCount(episodes);

	    return 'This answer box had counted submissions on ' + attemptedCount +
		' of the ' + totalVersions + ' problem ' + plural('version', totalVersions) +
		' shown to students.';
	}

	var total = totalSubmissionCount(answers);
	var students = attemptedStudentCount(statistics);
	var versionSummaryText = answerAttemptVersionSummaryText(statistics);
	var omittedPostFirstCorrectSubmissions = omittedPostFirstCorrectSubmissionCount(statistics);
	var inputBox = result.find( "input.form-control" );
	var modal = $('<div/>', {
	    'class': 'modal fade',
	    tabindex: '-1',
	    role: 'dialog'
	});
	var dialog = $('<div/>', {
	    'class': 'modal-dialog modal-lg',
	    role: 'document'
	});
	var content = $('<div/>', {
	    'class': 'modal-content'
	});
	var header = $('<div/>', {
	    'class': 'modal-header'
	});
	var modalBody = $('<div/>', {
	    'class': 'modal-body'
	});
	var footer = $('<div/>', {
	    'class': 'modal-footer'
	});

	header.append(
	    $('<button/>', {
		type: 'button',
		'class': 'close',
		'data-dismiss': 'modal',
		'aria-label': 'Close'
	    }).append($('<span/>', {
		'aria-hidden': 'true'
	    }).html('&times;'))
	);

	header.append($('<h4/>', {
	    'class': 'modal-title'
	}).text('Answer Statistics'));

	modalBody.append($('<p/>').text(
	    total + ' counted ' + plural('submission', total) +
	    ' to this answer box' +
	    (students > 0 ? ' across ' + students + ' ' + plural('student', students) : '') +
	    '.'
	));

	if (versionSummaryText) {
	    modalBody.append($('<p/>').text(versionSummaryText));
	}

	if (omittedPostFirstCorrectSubmissions > 0) {
	    modalBody.append($('<p/>').text(
		omittedPostFirstCorrectSubmissions + ' additional ' +
		plural('submission', omittedPostFirstCorrectSubmissions) +
		' omitted from these statistics because they occurred after the same student had already submitted a correct answer for this answer box on that version.'
	    ));
	}

	modalBody.append(buildCommonSubmissionsSection(answers || {}));
	appendVersionSections(modalBody, statistics);

	footer.append($('<button/>', {
	    type: 'button',
	    'class': 'btn btn-default',
	    'data-dismiss': 'modal'
	}).text('Close'));

	content.append(header);
	content.append(modalBody);
	content.append(footer);
	dialog.append(content);
	modal.append(dialog);

	modal.uniqueId();

	$('body').prepend(modal);

	modal.on('hidden.bs.modal', function() {
	    modal.remove();
	});

	result.find('.xronos-answer-statistics-button').remove();

	result.find('span.input-group-btn').prepend(
	    $('<button class="btn btn-info xronos-answer-statistics-button" data-toggle="tooltip" data-placement="top" title="' + total + ' ' + plural('Submission', total) + '">' +
	      '<i class="fa fa-bar-chart"/>' +
	      '</button>')
	);

	result.find('button.xronos-answer-statistics-button').click( function() {
	    $('#' + modal.attr('id')).modal('show');
	    return false;
	});

	// fix the button size
	var width = result.width();
	inputBox.css( 'min-width', '2em' );
	inputBox.width( width - (138 - 70) - 45);
    });

    result.on( 'ximera:statistics:successes', function(event, successes) {
	var total = Object.keys( successes ).map( function(x) { return successes[x]; } ).reduce(function(a, b) { return a + b; });

	if (!('true' in successes)) successes['true'] = 0;
	if (!('false' in successes)) successes['false'] = 0;
	
	var correctPercent = successes['true'] * 100.0 / total;
	var incorrectPercent = successes['false'] * 100.0 / total;
	var fraction = correctPercent;
	if (fraction == 0)
	    inputBox.css('background', 'rgba(255,0,0,0.08)');
	else if (fraction == 100)
	    inputBox.css('background', 'rgba(0,0,255,0.13)');
	else
	    inputBox.css('background', 'linear-gradient(90deg, rgba(0,0,255,0.13) ' + fraction + '%, rgba(255,0,0,0.08) ' + fraction + '%)' );
    });	

    
    // Tell whoever is above us that we need an answer to proceed
    if (!buttonless)    
	result.trigger( 'ximera:answer-needed' );
    
    // When the database changes, update the box
    result.persistentData( function(event) {
		console.log("Persisting " + result.attr("id"))
	if (result.persistentData('response')) {
	    if ($(inputBox).val() != result.persistentData('response')) {
		$(inputBox).val( result.persistentData('response'));
		assignGlobalVariable( result, result.persistentData('response') );
	    }
	} else {
	    $(inputBox).val( '' );
	}

	var mjElement = result.closest('.MathJax, .MathJax_Display')
	var divElement = mjElement.parent()
	var scriptElement = (divElement.attr('class') === 'MathJax_Display') ? divElement.next() :  mjElement.next()
	var solScriptElementId = scriptElement.attr('id') + "-sol"
	var tex = scriptElement.text()
	if (scriptElement[0] && !scriptElement[0].hasAttribute("data-initial")) {
	    /*
	     * Remember the original TeX before completed-answer rendering
	     * replaces \\answer{...} with the blue submitted answer.
	     * Try Another clears answer state without a full page reload, so
	     * the non-correct branch below needs this original TeX to restore
	     * the answer box immediately.
	     */
	    scriptElement.attr("data-initial", tex);
	}
	var a = MathJax.Hub.getAllJax(scriptElement.attr('id'))[0];
	/*
	 * Historical solution-script cleanup removed the previous sibling of
	 * the solution script.  On reload, if MathJax had not successfully
	 * created a rendered replacement, that previous sibling could be the
	 * original MathJax source script.  Removing it can make the entire
	 * completed answer disappear.  We now update the existing MathJax
	 * object in place, so only remove stale solution artifacts when they
	 * are present and leave the original script/rendering alone.
	 */
	var existingSolScript = $("#" + solScriptElementId);
	if (existingSolScript.length > 0) {
	    var existingSolRender = existingSolScript.prev();

	    if (existingSolRender.length > 0 && existingSolRender[0] !== scriptElement[0]) {
		existingSolRender.remove();
	    }

	    existingSolScript.remove();
	}
	if (result.persistentData('correct')) {
	    result.find('.btn-ximera-correct').show();
	    result.find('.btn-ximera-incorrect').hide();
	    result.find('.btn-ximera-checking').hide();			    
	    result.find('.btn-ximera-submit').hide();
		
		result.find('.show-answer-small').hide();
		result.find('.show-answer-large').hide();
		
		if ((tex.match(/\\answer/g) || []).length === 1) {
			var answerRegExp = /\\answer\s*(\[[^\]]*\])?\s*{(.*)}/
			var m = tex.match(answerRegExp)
			if (m) {
				var replacementTex = tex.replace(answerRegExp, "{\\color{blue} " + displayTexForCorrectStudentAnswer(result, m[2]) + "}");

				/*
				 * Update the existing MathJax object in place instead of creating
				 * a second script and hiding the original rendering.  The old
				 * hide-and-retypeset approach is fragile across inline/display
				 * MathJax shapes and can leave completed answers invisible after
				 * reload.
				 */
				if (a) {
				    MathJax.Hub.Queue(["Text", a, replacementTex]);
				    mjElement.show();
				}
			}
		}

	    inputBox.prop( 'disabled', true );
	    // Disabled elements won't fire the blur event that would otherwise hide this
	    $(result).popover('hide');	    
	} else {
	    inputBox.prop( 'disabled', false );

	    // I'm doing "result.find('.btn').hide();" but avoiding the info button
	    result.find('.btn-ximera-correct').hide();
	    result.find('.btn-ximera-incorrect').hide();
	    result.find('.btn-ximera-checking').hide();			    	    
		result.find('.btn-ximera-submit').hide();

		if (scriptElement[0] && scriptElement[0].hasAttribute("data-initial") && scriptElement.attr("data-initial") !== tex){
			MathJax.Hub.Queue(["Text", a, scriptElement.attr("data-initial")]);
		}

		mjElement.show()
		
		var showInput = !result.is('[data-onlinenoinput]')
		var showAnswerButton = result.is('[data-onlineshowanswerbutton]')

		if (!showInput) {
			result.find('.show-answer-small').hide()
			result.find('.answer-input-part').hide()
			result.find('.show-answer-large').show()
		}
		else {
			result.find('.show-answer-large').hide()
			if (!showAnswerButton) {
				result.find('.show-answer-small').hide()
			}
			else {
				result.find('.show-answer-small').show()
			}
			result.find('.answer-input-part').show()
		}
	    
	    if ((result.persistentData('response') == result.persistentData('attempt')) &&
		(result.persistentData('response'))) {
		result.find('.btn-ximera-incorrect').show();
	    } else {
		result.find('.btn-ximera-submit').show();
	    }
	}
	
    });

    result.find( ".btn-ximera-correct" ).click( function() {
	return false;
    });

    result.find( ".btn-ximera-incorrect" ).click( function() {
	result.find( ".btn-ximera-submit" ).click();
	return false;
	});
	
	var correctAnswerText = answer.toMathML("");
	correctAnswerText = correctAnswerText.replace('<none>', '').replace('</none>', '');
	correctAnswerText = correctAnswerText.replace('<mphantom>', '<math>').replace('</mphantom>', '</math>');

	var correctAnswer;
	var format = result.attr('data-format');
	if (format === undefined) format = 'expression';

	if ((format == 'integer') || (format == 'float')) {
		correctAnswerText = correctAnswerText.replace('<math>', '').replace('</math>', '');
		correctAnswerText = correctAnswerText.replace('<mn>', '').replace('</mn>', '');
	}

	if (format == 'string') {
		correctAnswerText = correctAnswerText.replace('<math>', '').replace('</math>', '');
		correctAnswerText = correctAnswerText.replace('<mtext>', '').replace('</mtext>', '');
		correctAnswerText = correctAnswerText.trim();
	}

	if (format == 'integer') {
		correctAnswer = parseInt(correctAnswerText);
	} else if (format == 'float') {
		correctAnswer = parseFloat(correctAnswerText);
	} else if (format == 'string') {
		correctAnswer = correctAnswerText;
	} else {
		try {
			correctAnswer = Expression.fromLatex(correctAnswerText);

			if (!correctAnswer) {
				try {
					correctAnswer = Expression.fromLatex(correctAnswerText.toLowerCase());
				} catch (err) {
					correctAnswer = false;
				}
			}
		} catch (err) {
			try {
				correctAnswer = Expression.fromMml(correctAnswerText);
			} catch (err) {
				console.log("Instructor error in \\answer: " + err);
				correctAnswer = Expression.fromText("sqrt(-1)");
			}
		}
	}
    
	result.find( ".btn-ximera-submit" ).click( function() {
		// We're passing an "answer" from MathJax, as "jax"
		answer.parent = {inferRow: false};
		var studentAnswerText = inputBox.val();
		var studentAnswer = parseFormattedInput(format, studentAnswerText);
		if (studentAnswer === undefined)
			studentAnswer = Expression.fromText( "sqrt(-1)" );
		
		var tolerance = result.attr('data-tolerance');
		
		if (tolerance) {
			tolerance = parseFloat(tolerance);

			var correctAnswerFloat = correctAnswer.evaluate({});
			var studentAnswerFloat = studentAnswer.evaluate({});

			result.persistentData( 'correct',
					(Math.abs(correctAnswerFloat - studentAnswerFloat) <= tolerance) );
			result.persistentData( 'attempt', inputBox.val() );

			if (result.persistentData( 'correct' ))
			result.trigger( 'ximera:correct' );
		} else {
			var correct = false;

			if (result.attr('data-validator')) {
			var code = result.attr('data-validator');
			try {
				var f = Function('return ' + code + ';');
			
				correct = f.call(studentAnswer);
				if (typeof correct === 'function')
				correct = correct(studentAnswer, correctAnswer);
			} catch (err) {
				console.log(err);
				correct = false;
			}
			} else {
			if (format === 'string') {
				// Strings should be normalized to uppercase when
				// doing case insensitive comparison, per
				// https://msdn.microsoft.com/en-us/library/bb386042.aspx
				correct = (correctAnswer.toUpperCase() == studentAnswer.toUpperCase());
			} else {
				if (format !== 'expression') {
				console.log( "compare ", correctAnswer, " and ", studentAnswer );
				correct = (correctAnswer == studentAnswer);
				} else
				correct = studentAnswer.equals( correctAnswer );
			}
			}

			// Check if the correct answer is actually a promise to check for correctness
			if (correct.then) {
			result.find('.btn-ximera-correct').hide();
			result.find('.btn-ximera-incorrect').hide();
			result.find('.btn-ximera-checking').show();
			result.find('.btn-ximera-submit').hide();
			// Disabled elements won't fire the blur event that would otherwise hide this		
			inputBox.prop( 'disabled', true );
			
			correct.then( function(value) {
				if (value) {
				result.persistentData( 'correct', true );
				result.trigger( 'ximera:correct' );
				} else {
				result.persistentData( 'correct', false );
				result.persistentData( 'attempt', inputBox.val() );
				}
			}, function(reason) {
				result.find('.btn-ximera-correct').hide();
				result.find('.btn-ximera-incorrect').hide();
				result.find('.btn-ximera-checking').hide();
				result.find('.btn-ximera-submit').show();
				inputBox.prop( 'disabled', false );

				alert(reason);
			});
			} else {
			if (correct) {
				result.persistentData( 'correct', true );
				result.trigger( 'ximera:correct' );
			} else {
				result.persistentData( 'correct', false );
				result.persistentData( 'attempt', inputBox.val() );
			}
			}
		}

		result.trigger( 'ximera:attempt' );

		TinCan.answer( result, { response: result.persistentData('response'),
					success: result.persistentData('correct') } );
		
		return false;
	});

	result.find(".btn-ximera-show-answer").click(function(){ // TODO: log that this button has been clicked
		result.find('.show-answer-large').hide()
		result.find('.show-answer-small').hide()
		result.find('.answer-input-part').show()

		result.find('[aria-label="answer"]').val(correctAnswer)
		result.find('input.form-control').focus()
		result.find('input.form-control').trigger('input')
		
		result.find(".btn-ximera-submit").click()

		return false;
	})

    
    inputBox.keydown(function(event){
	if(event.keyCode == 13) {
	    event.preventDefault();
	    return false;
	}
    });
    
    inputBox.keyup(function(event) {
	if (buttonless)
	    result.closest('.validator').trigger( 'ximera:answers-changed' );
	
	if (event.keyCode == 13) {
	    if (!buttonless)
		result.find( ".btn-ximera-submit" ).click();
	    else {
		// Submit the validator if it is wrapped in a validator
		result.closest( '.validator' ).find( ".btn-ximera-submit" ).click();
	    }
	}

	return false;
    });
    
    popover.bindPopover( result );
};



