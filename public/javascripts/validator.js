var $ = require('jquery');
var _ = require('underscore');
var database = require('./database');
var pageRuntime = require('./page-runtime');

var answerHtml = '<div class="btn-group" style="vertical-align: center;">' +
	'<button  type="button" class="btn btn-success btn-ximera-correct" data-toggle="tooltip" data-placement="top" title="Correct answer!" style="display: none" aria-label="correct answer" aria-live="assertive">' +
	'<i class="fa fa-check"></i>&nbsp;Correct' +
	'</button></div>' +
	'<div class="btn-group" style="vertical-align: center;">' +
	'<button  type="button" class="btn btn-danger btn-ximera-incorrect" data-toggle="tooltip" data-placement="top" title="Incorrect.  Try again!" style="display: none" aria-label="incorrect!  try again" aria-live="assertive">' +
	'<i class="fa fa-times"></i>&nbsp;Try again' +
	'</button></div>' +
	'<div class="btn-group" style="vertical-align: center;">' +
	'<button  type="button" class="btn btn-primary btn-ximera-submit" data-toggle="tooltip" data-placement="top" title="Click to check your answer.">' +
	'<i class="fa fa-question"></i>&nbsp;Check work' +
	'</button>' +
	'</div>';

var createValidator = function() {
    var validator = $(this);
    
    $(validator).append( $(answerHtml) );

    validator.trigger( 'ximera:answer-needed' );

    validator.on( 'ximera:answers-changed', function() {
	// BADBAD: disable check work button

	// Mark it as "incorrect" if all the responses match the last attempt
	var good = true;
	validator.find('.mathjaxed-input').each( function(i,e) {
	    if (($(e).persistentData('response')) && ($(e).persistentData( 'attempt' ) != $(e).persistentData('response'))) {
		good = false;
	    }
	});
	validator.persistentData( 'incorrect', good );
    });
        
    validator.persistentData(function(event) {
	if (validator.persistentData('correct')) {
	    validator.find( '.btn-group button' ).hide();
	    validator.find( '.btn-group .btn-ximera-correct' ).show();
	} else {
	    validator.find('.btn-ximera-correct').hide();
	    validator.find('.btn-ximera-incorrect').hide();
	    validator.find('.btn-ximera-submit').hide();

	    if (validator.persistentData('incorrect'))
		validator.find('.btn-ximera-incorrect').show();
	    else	    
		validator.find('.btn-ximera-submit').show();
	}
    });

    var checkAnswer = function() {
	var validatorId = validator.attr('id');
	var correct = false;
	var validatorFunction = window[validatorId];

	/*
	 * Persistent page state must remain JSON-serializable.  A malformed
	 * grouped-validator expression can return its validator function instead
	 * of invoking it.  Storing that function as `correct` causes
	 * jsondiffpatch to reject the entire page database and prevents later
	 * student work from being saved.
	 */
	try {
	    if (typeof validatorFunction !== 'function') {
		throw new TypeError(
		    'Grouped validator function was not found.'
		);
	    }

	    correct = validatorFunction();

	    if (typeof correct !== 'boolean') {
		throw new TypeError(
		    'Grouped validator must return a Boolean; received ' +
		    typeof correct + '.'
		);
	    }
	} catch(err) {
	    console.error(err);

	    pageRuntime.operation(
		'grouped-validator',
		'failed',
		{
		    code: 'XR-VALIDATOR-RESULT-101',
		    validatorId: validatorId,
		    resultType: typeof correct,
		    errorName:
			err && err.name
			    ? err.name
			    : undefined,
		    errorMessage:
			err && err.message
			    ? err.message
			    : String(err)
		}
	    );

	    correct = false;
	}

	validator.persistentData('correct', correct );
	validator.trigger( 'ximera:attempt' );
	
	validator.find('.mathjaxed-input').each( function(i,e) {
	    $(e).persistentData( 'attempt', $(e).persistentData('response') );
	    $(e).persistentData( 'correct', validator.persistentData('correct') );
	});
	
	if (validator.persistentData('correct')) {
	    validator.trigger( 'ximera:correct' );
	}
	
	validator.trigger( 'ximera:answers-changed' );

	return false;
    };
    
    $(validator).find( ".btn-ximera-submit" ).click( checkAnswer );
    $(validator).find( ".btn-ximera-incorrect" ).click( checkAnswer );
};

$.fn.extend({
    validator: function() {
	return this.each( createValidator );
    }
});
