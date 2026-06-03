var $ = require('jquery');
var _ = require('underscore');

var xronosDispatchGradebookRecorded = function(payload, result) {
    var event;

    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
        return;
    }

    try {
        if (typeof window.CustomEvent === 'function') {
            event = new window.CustomEvent('xronos:gradebookRecorded', {
                detail: {
                    payload: payload,
                    result: result
                }
            });
        } else if (typeof document !== 'undefined' && typeof document.createEvent === 'function') {
            event = document.createEvent('CustomEvent');
            event.initCustomEvent('xronos:gradebookRecorded', false, false, {
                payload: payload,
                result: result
            });
        }

        if (event) {
            window.dispatchEvent(event);
        }
    } catch (e) {
        // The gradebook submission itself succeeded; do not let a UI event
        // helper interfere with that workflow.
    }
};

exports.update = _.debounce( function() {
    var pointsEarned = 0;
    
    $(".activity-card").each( function() {
	var card = $(this);
	var weight = parseFloat(card.attr('data-weight'));
	var completion = parseFloat(card.attr('data-max-completion'));

	if (! isNaN(weight)) {
	    if (! isNaN(completion)) {	    
		var points = weight * completion;
		pointsEarned = pointsEarned + points;
	    }
	}
    });

    var pointsPossible = $("main").attr( 'data-points' );
    var xourseUrl = $("main").attr( 'data-xourse-url' );

    var payload = {
	pointsEarned: pointsEarned,
	pointsPossible: pointsPossible	
    };

    $(".progress.completion-meter").attr('title', 'Submitting grade...' );
    
    $.ajax({
	url: window.toValidPath('/' + xourseUrl + '/gradebook'),
	type: 'PUT',
	data: JSON.stringify(payload),
	contentType: 'application/json',	
	success: function( result ) {
	    console.log( "Recorded gradebook",payload );
	    xronosDispatchGradebookRecorded(payload, result);
	    $('.progress-bar', ".progress.completion-meter").removeClass( 'bg-danger' );
	    $('.progress-bar', ".progress.completion-meter").addClass( 'bg-success' );
	    $(".progress.completion-meter").attr('title', 'Grade submitted at '  + (new Date()).toLocaleTimeString() );
	},
	error: function(jqXHR, err, exception) {
	    $(".progress.completion-meter").attr('title', 'Could not submit grade.' );
	    $('.progress-bar', ".progress.completion-meter").removeClass( 'bg-success' );
	    $('.progress-bar', ".progress.completion-meter").addClass( 'bg-danger' );
	    window.setTimeout( exports.update, 1000 );
	}
    });
    
}, 300 );
