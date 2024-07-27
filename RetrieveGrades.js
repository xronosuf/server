//Change StartDay and NumDays to modify searches

//DayLength=1000*3600*24;
//StartDay=new ISODate("2017-01-01T00:00:00.000Z").getTime();
//StartDay = new ISODate("2016-09-09T00:00:00.000Z").getTime();
//NumDays=30;
//Months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];


PathsList = [{"path":"exercisesForMath160/ExDerivs"},
			{"path":"exercisesForMath160/ExLimitsDeriv"},
			{"path":"exercisesForMath160/ExTangentLine"},
			{"path":/chainRule/},
			{"path":/definitionOfTheDerivative/},
			{"path":/derivativeAsAFunction/},
			{"path":/higherOrderDerivativesAndGraphs/},
			{"path":/implicitDifferentiation/},
			{"path":/meanValueTheorem/},
			{"path":/productAndQuotientRules/},
			{"path":/rulesOfDifferentiation/}
			]

/*PathsList = [{"path":/whatIsALimit/},
		{"path":/limitLaws/},
		{"path":/indeterminateForms/},
		{"path":/asymptotesAsLimits/},
		{"path":"exercisesForMath160/ExLimits"},
		{"path":"exercisesForMath160/ExPiecewiseLimits"},
		{"path":"exercisesForMath160/ExMoreLimits"},
		{"path":/continuity/},
		{"path":/anApplicationOfLimits/}
		]

*/
//PathsList = [{"path":"ToleranceLab/titlePage"}, {"path":"ToleranceLab/ToleranceLab"} ];
//PathsList = [{"path":/LinApproxLab/}]

var XimeraCards = {
	//"Slope of a curve"
	"definitionOfTheDerivative/breakGround": ["problem1", "answer0problem3", "answer0problem4", "problem6"],
	
	//"The definition of the derivative"
	"definitionOfTheDerivative/digInTheDerivativeViaLimits": ["answer0problem1", "answer0problem5", "answer1problem5", "answer4problem5", "answer6problem5", "answer8problem5", "problem10", "answer0problem13", "answer2problem13", "answer4problem13", "answer6problem13", "answer8problem13", "answer0problem17", "answer2problem17", "answer4problem17", "answer6problem17", "answer0problem21", "answer1problem21", "answer4problem21", "answer6problem21", "answer8problem21", "answer10problem21"],
	
	//"Definition of the Derivative"
	"exercisesForMath160/ExLimitsDeriv": ["answer0problem1", "answer0problem2", "answer0problem3", "answer0problem4", "answer0problem5", "answer0problem6"],
	
	//"Wait  for  the  right  moment"
	"derivativeAsAFunction/breakGround": ["problem2", "answer0problem3"],
	
	//"The  derivative  as  a  function"
	"derivativeAsAFunction/digInTheDerivativeAsAFunction": ["problem2", "problem4", "problem7", "word-choice10", "word-choice11", "problem13", "problem14"], 
	
	//"Differentiability  implies  continuity"
	"derivativeAsAFunction/digInDifferentiabilityImpliesContinuity": ["answer0problem2", "answer1problem2", "problem4", "problem5", "answer0problem10", "answer2problem10"],
	"Patterns  in  derivatives": ["answer0problem1", "answer0problem2", "answer0problem3", "answer0problem4"],
	
	//Patterns in derivatives
	"rulesOfDifferentiation/breakGround": ["answer0problem1", "answer0problem2", "answer0problem3", "answer0problem4"],
	
	//"Basic rules of differentiation"
	"rulesOfDifferentiation/digInBasicRulesOfDifferentiation": ["answer0problem2", "answer0problem4", "answer0problem8", "answer1problem8", "answer0problem10", "answer2problem10", "answer0problem12", "answer0problem14", "answer0problem16", "problem20", "answer0problem22", "answer0problem24", "answer0problem26"],
	
	//"The Produce rule and quotient rule"
	"productAndQuotientRules/digInProductRuleAndQuotientRule": ["answer0problem3", "answer1problem3", "answer4problem3", "answer0problem5", "answer0problem8", "answer1problem8", "answer2problem8", "answer3problem8", "answer0problem10", "answer1problem10", "answer2problem10", "answer6problem10", "answer7problem10"],
	
	//"The  derivative  of  sine  and  cosine"
	"rulesOfDifferentiation/digInTheDerivativeOfSine": ["answer0problem2", "answer1problem2", "answer0problem4", "answer1problem4", "answer0problem5", "answer0problem6", "answer0problem9", "answer1problem9"],
	
	//"Derivatives of trigonometric functions"
	"chainRule/digInDerivativesOfTrigonometricFunctions": ["answer0problem2", "answer1problem2", "answer0problem4", "answer1problem4", "answer2problem4", "answer0problem6", "answer0problem9", "answer2problem9", "answer3problem9"],
	
	//"Rates  of  rates"
	"higherOrderDerivativesAndGraphs/breakGround": ["problem2", "problem4", "problem6"],
	
	//"Higher  order  derivatives  and  graphs"
	"higherOrderDerivativesAndGraphs/digInHigherOrderDerivativesAndGraphs": ["problem3", "problem5", "word-choice8", "word-choice9", "word-choice10", "word-choice11", "word-choice14", "word-choice15", "word-choice16", "word-choice17", "answer0problem13", "answer2problem13", "answer4problem13", "answer0problem18", "answer2problem18", "answer4problem18"],
	
	//"Position,  velocity,  and  acceleration"
	"higherOrderDerivativesAndGraphs/digInPositionVelocityAndAcceleration": ["answer0problem1", "answer0problem3", "answer1problem3"],
	
	//"An unnoticed composition"
	"chainRule/breakGround": ["problem2"],
	
	//"The Chain Rule"
	"chainRule/digInChainRule": ["answer0problem3", "answer1problem3", "answer4problem3", "answer5problem3", "answer0problem8", "answer2problem8", "answer3problem8", "answer6problem8", "answer0problem10", "answer2problem10", "answer4problem10", "answer6problem10", "answer7problem10", "answer8problem10", "answer0problem12", "answer2problem12", "answer4problem12", "answer5problem12", "answer8problem12", "answer10problem12", "answer0problem14", "answer1problem14", "answer4problem14", "answer5problem14", "answer6problem14", "answer7problem14", "answer0problem15"],
	
	//"Standard  form"
	"implicitDifferentiation/breakGround": ["answer0problem1", "answer0problem3"],
	
	//"Implicit differentiation"
	"implicitDifferentiation/digInImplicitDifferentiation": ["answer0problem3", "answer2problem3", "answer4problem3", "answer0problem5", "answer0problem7"],
	
	//"Derivative  Exercises"
	"exercisesForMath160/ExDerivs": ["answer0problem1", "answer0problem3", "answer0problem5", "answer0problem6", "answer0problem7", "answer0problem8", "answer0problem9", "answer0problem10", "answer0problem11", "answer0problem12", "answer0problem13", "answer0problem14", "answer0problem15", "answer0problem16", "answer0problem17", "answer0problem19", "answer0problem20", "answer1problem20", "answer2problem20", "answer0problem21", "answer1problem21", "answer2problem21", "answer0problem22", "answer1problem22", "answer2problem22", "answer0problem23", "answer1problem23", "answer2problem23"],
	
	//"Tangent  Line  Exercises"
	"exercisesForMath160/ExTangentLine": ["answer0problem1", "answer2problem1", "answer0problem2", "answer2problem2", "answer0problem3", "answer2problem3"],
	
	//"Let's  run  to  class"
	"meanValueTheorem/breakGround": ["problem2", "problem4"],
	
	//"The  Extreme  Value  Theorem"
	"meanValueTheorem/digInExtremeValueTheorem": ["problem4"],
	
	//"The  Mean  Value  Theorem"
	"meanValueTheorem/digInMeanValueTheorem": ["answer0problem3", "answer0problem6", "problem9", "answer0problem8", "problem10", "problem12", "answer0problem22", "answer1problem22", "answer4problem22", "answer6problem22", "answer8problem22"]
}

XimeraCards.isGraded = function(path, problem) {
	ret = XimeraCards[path] && ( !problem.contains("answer") || XimeraCards[path].includes(problem) );
	//print("Problem " + problem + " is graded for " + title + ":" + ret);
	
	return ret;
}

/*
for(title in XimeraCards) {
	print(title, XimeraCards[title].length)
}
*/

var special_user_emails = ["ufl.edu"]

//Add a utility to the array prototype for making arrays filled with zeros
Array.prototype.repeat = function(def, size) {
	for( i=0; i<size; i++ ) {
		this[i]=def;
	}
	return this;
}

//Object to manage queries to the database
var query = [];
//query[0]={"result.success":true};

//We need an object that links user._id to user.email since multiple _id's may be associated with one e-mail address.
var users = {};

//Make an object to hold information about activities so we don't have to query the database so often
var activities = {};
var activityHashes = {};
var paths = [];
var titlepaths = [];
var exercisepaths = [];

//data holds objects representing students and their correct responses in ximera.
var data = {};

//Function to retrieve hashes matching CSU ximera activities
function FetchActivities() {
	db.activities.find({ $or:PathsList }).forEach( function (activity) {
		//Weed out some non-CSU activities
		if( !activity.path.contains("textbook") && !activity.path.contains("chainRuleTable") ) {
			
			activityHashes[activity.hash] = activity.path;
			if( !activities[activity.path] ) {
				activities[activity.path] = {problems:[]};
				paths.push(activity.path);
				if( activity.path.contains("title") ) {
					titlepaths.push(activity.path);
				}
				else {
					exercisepaths.push(activity.path);
				}
			}
		}
	});
}

//Fucntion for counting correct responses
function CorrectResponses(record) {
	//Make sure this is a csu user
	user = users[record.actor];
	if(user) {

		//record.object.id has the form "https://xronos.clas.ufl.edu/course/<hash>/problems/problem<x>/answers/problem<x+1> (I think??) EDITED
		activityId = record.object.id.split("/");

		//Get the activity from the database if it's not one we've run across before
		hash = activityId[4];
		problem = activityId[ activityId.length-1];

		if(activityHashes[hash]) {
			//Use the hash to get the pathname for the activity and use the pathname to get the associated activity object.
			activityPath = activityHashes[hash]
			activity = activities[activityPath];
			
			//if( record.verbId ) { print(activityPath, record.verbId, record.stored); }
			if( activityPath.contains("title") ) {
				//Title pages should only be worth one point. This is a bit of a hack to achieve that.
				problem = "titlePage";
				if( activity.problems.length == 0 ) activity.problems.push("titlePage");
				if(!data[user].activities[activityPath][problem]) {
					data[user].activities[activityPath][problem]=true;
					data[user].activities[activityPath].score += 1;
				}
			} else if (record.result &&
				record.result.success == true &&
				XimeraCards.isGraded(activityPath, problem)) {
				
				//Add to a list of problem numbers if we haven't come across it yet
				if(!activity.problems.includes(problem)) {
					activity.problems.push(problem);
					//print("Adding problem " + problem + " for " + activity.title);
				}
				
				//TODO make this object oriented and shiny!
				//Add one to student's score if we have not found a correct answer for this problem from this user yet.
				if(!data[user].activities[activityPath][problem]) {
					data[user].activities[activityPath][problem]=true;
					data[user].activities[activityPath].score += 1;
				}
			}
		}
	}
}

//Query database for activity data on a day given in ms from Unix epoch
function FetchRecords() {
	query.push( {
		"stored": {
			/*
			"$gte" : new ISODate("2016-08-22T00:00:00.000Z"),
			"$lt" : new ISODate("2017-09-22T00:00:00.000Z")
			*/
			"$gte" : new ISODate("2017-01-22T00:00:00.000Z"),
			"$lt" : new ISODate("2017-03-08T18:00:00.000Z")
			
		}
	} );

	db.learningrecords.find({ $and:query }).forEach(CorrectResponses);
}

//Grab user data
function FetchUsers() {
	//Make a query to find CSU users who have been active since the time we want to pull data from.
	var query = {"email": {"$regex": special_user_emails.join("|")}, "lastSeen": {"$gt":new ISODate("2017-01-01T00:00:00.000Z")} };
	//query.lastSeen = {"$gt": new ISODate(StartDay)};
	
	db.users.find(query).forEach( function(user) {
		//Populate users object
		if( !users[user._id] ) {
			users[user._id] = user.email;
		}
		//Instantiate data rows
		if( !data[user.email] ) {
			obj = {};
			for(path in activities) {
				obj[path] = {problems:{}, score:0};
			}
			data[user.email] = { activities: obj };
		}
	});
}

//Fetch activities from database and alphebetize the list.
FetchActivities();
paths.sort();
//print("Fetched activities...");

FetchUsers();

//print("Fetched users...");
//Fetch data from the database
FetchRecords();
//print("Fetched records...");


//Print first two lines of CSV file
//var str = paths.join(",");

//TODO not sure why this print doesn't work
print("Student, " + paths.join(",") + ", titlepages, exercises, content, Weighted Score");

var totals = [];
var exercisesTotal = 0;
var contentTotal = 0;
var titlesTotal = 0;

for( var i=0; i<paths.length; i++ ) {
	totals.push( activities[paths[i]].problems.length );
	
	//Scores are weighted differently for different types of activities
	if( paths[i].contains("exercisesForMath160") ) {
		exercisesTotal += activities[paths[i]].problems.length;
	
	} else if( paths[i].contains("title") ) {
		titlesTotal += activities[paths[i]].problems.length;
	
	} else { //Everything else is content
		contentTotal += activities[paths[i]].problems.length;
	}
}
totals.push(titlesTotal, exercisesTotal, contentTotal);
print( "," + totals.join(",") );
print(",");

for( var i=0; i<paths.length; i++ ) {
	print(paths[i] + "," + activities[paths[i]].problems.join(","))
}

//Print a row for each student
for(user in data) {
	var studentExercisesTotal = 0;
	var studentContentTotal = 0;
	var studentTitlesTotal = 0;
	
	var line = [user];
	
	//Loop through all activities in alphabetical order
	for( var i=0; i<paths.length; i++ ) {
		if( data[user].activities[paths[i]] ) {
			line.push( data[user].activities[paths[i]].score );
			
			//Scores are weighted differently for different types of activities
			if( paths[i].contains("exercisesForMath160") ) {
				studentExercisesTotal += data[user].activities[paths[i]].score;
			
			} else if( paths[i].contains("title") ) {
				studentTitlesTotal += data[user].activities[paths[i]].score;
			
			} else { //Everything else is content
				studentContentTotal += data[user].activities[paths[i]].score;
			}
		}
	}
	
	//The weighted average is titlepages: 10%, exercises: 50%, content pages: 40%
	var score = studentTitlesTotal/titlesTotal*10 + studentExercisesTotal/exercisesTotal*50 + studentContentTotal/contentTotal*40;
	
	//Append computations for titlepages, exercises and content, and the weighted average
	line.push(studentTitlesTotal, studentExercisesTotal, studentContentTotal, score)
	print(line.join(","));
}


