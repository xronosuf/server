var $ = require('jquery');

function announce( hash, answers ) {
    var selector = function(hash, problem, answerable) {
return "[data-hash='" + hash + "'] " + "#" + problem + " #" + answerable;
    };

    Object.keys(answers).forEach( function(problem) {
if (problem.charAt(0) === '_') {
    return;
}

Object.keys(answers[problem]).forEach( function(answerable) {
    var element = $(selector(hash, problem, answerable));
    var statistics = answers[problem][answerable];

    element.trigger( "ximera:statistics:answers", [statistics.responses, statistics] );
    element.trigger( "ximera:statistics:successes", statistics.successes );
});
    });
}

function statisticsLink() {
    return $("#instructor-view-statistics");
}

function statisticsLinkIsEnabledForThisUser() {
    var link = statisticsLink();

    return link.length > 0 && link.css('display') !== 'none';
}

function statisticsUrlFromLink(link) {
    var url = link.attr('data-activity-url');
    var hash = link.attr('data-activity-hash');
    var statisticsUrl;

    if (!url || !hash) {
return null;
    }

    statisticsUrl = '/statistics/' + url + '/' + hash;

    if (window.toValidPath) {
statisticsUrl = window.toValidPath(statisticsUrl);
    }

    return statisticsUrl;
}

function fetchActivityStatistics(callback) {
    var link = statisticsLink();
    var statisticsUrl = statisticsUrlFromLink(link);

    if (!statisticsUrl) {
callback(null);
return;
    }

    $.ajax({
url: statisticsUrl,
type: 'GET',
success: function(result) {
    callback(result);
},
error: function() {
    callback(null);
}
    });
}

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

function formatPercent(count, total) {
    var percent;

    if (!total) {
return '0%';
    }

    percent = Math.round((count / total) * 1000) / 10;

    if (percent % 1 === 0) {
percent = percent.toFixed(0);
    } else {
percent = percent.toFixed(1);
    }

    return percent + '%';
}

function studentCountWithPercent(count, total) {
    return count + ' ' + plural('student', count) + ' (' + formatPercent(count, total) + ')';
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

function tryAnotherStatistics(result) {
    if (!result || !result._activityStats || !result._activityStats.tryAnother) {
return null;
    }

    return result._activityStats.tryAnother;
}

function versionsWithNoObservedAnswers(tryAnother) {
    var versions = tryAnother.versions || {};

    return Object.keys(versions)
.map(function(key) {
    return versions[key];
})
.filter(function(version) {
    return asNumber(version.studentsWithAnyAnswer) === 0;
})
.map(function(version) {
    return asNumber(version.version);
});
}

function addSummaryRow(tableBody, label, value) {
    var row = $('<tr/>');

    row.append($('<th/>', {
scope: 'row'
    }).text(label));

    row.append($('<td/>').text(value));

    tableBody.append(row);
}

function buildTryAnotherStatisticsBody(result) {
    var tryAnother = tryAnotherStatistics(result);
    var body = $('<div/>');
    var observedStudents;
    var totalGeneratedVersions;
    var table;
    var tableBody;
    var noAnswerVersions;
    var noAnswerVersionLabel;

    if (!tryAnother) {
body.append($('<p/>').text('No Try Another statistics were found for this activity yet.'));
return body;
    }

    observedStudents = asNumber(tryAnother.observedStudents);
    totalGeneratedVersions = asNumber(tryAnother.totalGeneratedVersions);

    table = $('<table/>', {
'class': 'table table-striped'
    });

    table.append(
$('<thead/>').append(
    $('<tr/>')
.append($('<th/>').text('Measure'))
.append($('<th/>').text('Value'))
)
    );

    tableBody = $('<tbody/>');

    addSummaryRow(tableBody, 'Observed students', observedStudents + ' ' + plural('student', observedStudents));
    addSummaryRow(tableBody, 'Did not click Try Another', studentCountWithPercent(asNumber(tryAnother.studentsGeneratedZeroVersions), observedStudents));
    addSummaryRow(tableBody, 'Used Try Another at least once', studentCountWithPercent(asNumber(tryAnother.studentsGeneratedAtLeastOneVersion), observedStudents));
    addSummaryRow(tableBody, 'Used Try Another at least twice', studentCountWithPercent(asNumber(tryAnother.studentsGeneratedAtLeastTwoVersions), observedStudents));
    addSummaryRow(tableBody, 'Used Try Another at least three times', studentCountWithPercent(asNumber(tryAnother.studentsGeneratedAtLeastThreeVersions), observedStudents));
    addSummaryRow(tableBody, 'Generated versions total', totalGeneratedVersions + ' ' + plural('version', totalGeneratedVersions));

    table.append(tableBody);
    body.append(table);

    noAnswerVersions = versionsWithNoObservedAnswers(tryAnother);

    if (noAnswerVersions.length > 0) {
noAnswerVersionLabel = noAnswerVersions.length === 1 ? 'version' : 'versions';

body.append($('<p/>').text(
    'No answer attempts were observed on generated ' +
    noAnswerVersionLabel + ' ' +
    compressedRanges(noAnswerVersions) +
    '.'
));
    }

    body.append($('<p/>', {
'class': 'text-muted',
style: 'font-size: 0.875rem; margin-bottom: 0;'
    }).text('Observed students are learners represented in the current activity statistics summary. Canvas-context filtering is not yet applied in this display.'));

    return body;
}

function showTryAnotherStatisticsModal(result) {
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

    var closeButton = $('<button/>', {
type: 'button',
'class': 'close',
'data-dismiss': 'modal',
'aria-label': 'Close'
    }).append($('<span/>', {
'aria-hidden': 'true'
    }).html('&times;'));

    var title = $('<h4/>', {
'class': 'modal-title'
    }).text('Try Another Statistics');

    var modalBody = $('<div/>', {
'class': 'modal-body'
    }).append(buildTryAnotherStatisticsBody(result));

    var footer = $('<div/>', {
'class': 'modal-footer'
    }).append($('<button/>', {
type: 'button',
'class': 'btn btn-default',
'data-dismiss': 'modal'
    }).text('Close'));

    header.append(closeButton);
    header.append(title);

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

    modal.modal('show');
}

function ensureTryAnotherStatisticsButton() {
    var anotherButton = $("#show-me-another-button");
    var button = $("#xronos-try-another-statistics-button");

    if (!statisticsLinkIsEnabledForThisUser() || anotherButton.length === 0) {
button.hide();
return;
    }

    if (button.length === 0) {
button = $('<button/>', {
    type: 'button',
    id: 'xronos-try-another-statistics-button',
    'class': 'xmanother',
    role: 'button',
    title: 'View Try Another statistics',
    'aria-label': 'View Try Another statistics',
    style: 'display: none; margin-left: 0.25rem;'
});

button.append($('<i/>', {
    'class': 'fa fa-bar-chart',
    'aria-hidden': 'true'
}));

anotherButton.after(button);
    }

    if (anotherButton.is(':visible')) {
button.show();
    } else {
button.hide();
    }
}

function watchForTryAnotherButton() {
    var attempts = 0;
    var interval;

    ensureTryAnotherStatisticsButton();

    interval = window.setInterval(function() {
attempts += 1;
ensureTryAnotherStatisticsButton();

if (attempts >= 40 || $("#xronos-try-another-statistics-button").is(':visible')) {
    window.clearInterval(interval);
}
    }, 250);
}

$(function() {
    $("#instructor-view-statistics").click( function(event) {
event.preventDefault();
$("#instructor-view-statistics").hide();

fetchActivityStatistics(function(result) {
    var hash = statisticsLink().attr('data-activity-hash');

    if (result && hash) {
announce( hash, result );
    }
});
    });

    $(document)
.off("click.xronosTryAnotherStatistics", "#xronos-try-another-statistics-button")
.on("click.xronosTryAnotherStatistics", "#xronos-try-another-statistics-button", function(event) {
    var button = $(this);

    event.preventDefault();

    button.prop('disabled', true);

    fetchActivityStatistics(function(result) {
button.prop('disabled', false);
showTryAnotherStatisticsModal(result);
    });
});

    watchForTryAnotherButton();
});
