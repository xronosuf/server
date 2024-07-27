var $ = require('jquery');
var _ = require('underscore');
var database = require('./database');

var createPool = function() {
    var problemPool = $(this);

    problemPool.persistentData( function() {

	if (!(problemPool.persistentData( 'initialized' ))) {
	    problemPool.persistentData( 'initialized', true );
	    
	    var problems = problemPool.children('.problem-environment');
	    problemIds = $.makeArray( problems.map( function() {
		return $(this).attr('id');
	    }));

	    // BADBAD: this must be done deterministically, to avoid
	    // a student just clicking over and over to get a new problem
	    problemPool.persistentData( 'problemPool', _.problemPool( problemIds ) );
	    
	    var firstProblemId = shuffle.persistentData( 'shuffle' )[0];
	    var firstProblem = shuffle.children('#' + firstProblemId);
	    firstProblem.persistentData('available', true);
	}
/* THIS CODE IS USED TO DETERMINE NEXT PROBLEM?	
	if (shuffle.persistentData('available')) {
	    var order = shuffle.persistentData( 'shuffle' );
	    shuffle.children('.problem-environment').sort( function(a,b) {
		var ai = _.indexOf( order, $(a).attr('id') );
		var bi = _.indexOf( order, $(b).attr('id') );
		if (ai == bi) return 0;
		if (ai < bi) return -1;
		if (ai > bi) return 1;
	    }).each( function() {
		this.parentNode.appendChild(this);
	    });
	}
*/
    });
    
    var problems = shuffle.children('.problem-environment');
/* THIS CODE IS USED TO CHECK id AND MARK COMPLETE IF IT'S BEEN DONE TO SUPPLY NEXT?
    problems.each( function() {
	var problem = $(this);
	var problemId = problem.attr('id');
	
	problem.persistentData( function() {
	    if (problem.persistentData('complete')) {
		var nextProblem = $(this).next('.problem-environment');
		nextProblem.persistentData('available', true);
	    }
	});
    });
*/
};
*/
$.fn.extend({
    shuffle: function() {
	return this.each( createShuffle );
    }
});    

