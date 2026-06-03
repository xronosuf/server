var $ = require('jquery');
var _ = require('underscore');
var MathJax = require('mathjax');
var database = require('./database');

var seeded = false;
var seedCallbacks = [];
var seed = null;
var currentSeedCode = "";

var executedSageSilents = false;
var sageSilentCode = "";

var visibleSageOutputsStarted = false;

// Browser-side exact-code cache and queue.
// This avoids duplicate network calls from the same page load and prevents
// a page from stampeding the local SageCell service with many simultaneous
// requests during MathJax/Xronos startup.
var sageRequestCache = {};
var sageRequestInFlight = {};
var sageQueue = Promise.resolve();

// Browser-side batching for expression-style Sage requests.
// Many Xronos pages ask for many display values after one large common setup.
// We batch those display expressions into one SageCell request when possible.
var sageBatchItems = [];
var sageBatchTimer = null;
var sageBatchDelay = 75;
var sageBatchMaxItems = 8;
var sageBatchMaxEstimatedChars = 65000;
var sageBatchNextId = 0;



var reprocessMathjax = _.debounce(function() {
    MathJax.Hub.Queue(["Reprocess", MathJax.Hub]);
}, 250);

var stopSpinning = _.debounce(function() {
    $("#show-me-another-button i").css('animation-play-state', 'paused');
}, 250);

MathJax.Hub.signal.Interest(function (message) {
    if (message[0] == "End Reprocess") {
stopSpinning();
    }
    if (message[0] == "End Rerender") {
stopSpinning();
    }
});

var setSeed = function(callback) {
    if (seeded) {
callback();
    } else {
seedCallbacks.push(callback);
getSeed();
    }
};

var sendSeed = function(newSeed) {
    if ((seed == newSeed) && (seed !== null)) {
return;
    }

    seed = newSeed;

    if (newSeed !== undefined) {
currentSeedCode = "set_random_seed(" + newSeed + ")";
    } else {
currentSeedCode = "";

if ($('main.activity').length > 0) {
    var activityPath = $('main.activity').attr('data-path');
    var currfilebase = activityPath.split('/').slice(-1)[0];

    var code = 'jobname="' + currfilebase + '"' + "\n";
    code = code + "import hashlib\n";
    code = code + "set_random_seed(int(hashlib.sha256(jobname.encode('utf-8')).hexdigest(), 16))";
    currentSeedCode = code;
}
    }
};

var getSeed = _.once(function() {
    var seedDiv;

    if ($("#seed").length > 0) {
seedDiv = $("#seed").first();
    } else {
seedDiv = $('<div id="seed" style="display: none;"></div>');
$('main.activity').append(seedDiv);
    }

    seedDiv.fetchData(function() {
seeded = true;

var storedSeed = seedDiv.persistentData('seed');
sendSeed(storedSeed);

seedDiv.persistentData(function() {
    var newSeed = seedDiv.persistentData('seed');
    if (newSeed == seed) {
return;
    }

    sendSeed(newSeed);

    executedSageSilents = false;
    executeSageSilents();

    // Recompute any visible autoevaluated Sage output when the seed changes.
    processVisibleSageOutputs(true);

    reprocessMathjax();
});

seedCallbacks.forEach(function(callback) {
    callback();
});
seedCallbacks = [];
    });
});

$(function() {
    $("#show-me-another-button").click(function() {
	$("i", this).addClass("fa-spin");
	$("#show-me-another-button i").css('animation-play-state', 'running');
	xronosShowMeAnotherSage();
    });
});

var stripCDATA = function(code) {
    return code.replace(/[\s\S]*#<!\[CDATA\[\s*\n((.|\n)*)\s*#\]\]>/m, "$1");
};

var executeSageSilents = function() {
    if (executedSageSilents == false) {
executedSageSilents = true;
sageSilentCode = "";

// Collect any sagesilent blocks.  In the old SageCell-kernel path,
// these were executed once into a persistent kernel.  In the local
// /service path, every Sage request is stateless, so we replay these
// blocks as setup code for each request.
$('script[type="text/sagemath"]').each(function() {
    var code = stripCDATA($(this).text());

    // The snippet "rand" is enough to trigger the "Another..." button
    if (code.match('rand')) {
$("#show-me-another-button").show();
    }

    if ($.trim(code).length > 0) {
sageSilentCode = sageSilentCode + "\n\n" + code;
    }
});
    }
};

var fullSageRequest = function(code) {
    executeSageSilents();

    var pieces = [];

    if ($.trim(currentSeedCode).length > 0) {
pieces.push(currentSeedCode);
    }

    if ($.trim(sageSilentCode).length > 0) {
pieces.push(sageSilentCode);
    }

    pieces.push(code);

    return pieces.join("\n\n");
};

var processVisibleSageOutputs = function(force) {
    if (visibleSageOutputsStarted && !force) {
return;
    }

    visibleSageOutputsStarted = true;

    $(".sageOutput").each(function() {
var output = $(this);

var code = output.data("xronos-sage-code");
if (code === undefined) {
    code = output.text();
    output.data("xronos-sage-code", code);
}

code = stripCDATA(code);

if ($.trim(code).length == 0) {
    return;
}

output.addClass("sagecell-computing");

exports.sage(code).then(
    function(result) {
output.removeClass("sagecell-computing");
output.text(result);
reprocessMathjax();
    },
    function(err) {
output.removeClass("sagecell-computing");
console.log("sageOutput error=", err);
    }
);
    });
};

exports.createKernel = _.once(function() {
    // Compatibility shim.  Older code expects createKernel() to return a
    // promise for something kernel-like, but the local /service path does
    // not keep a persistent browser-visible kernel.
    return new Promise(function(resolve, reject) {
setSeed(function() {
    executeSageSilents();
    processVisibleSageOutputs(false);

    resolve({
execute: function(code, callbacks, options) {
    exports.sage(code).then(
function(result) {
    if (callbacks &&
callbacks.iopub &&
callbacks.iopub.output) {
callbacks.iopub.output({
    msg_type: "execute_result",
    content: {
data: {
    "text/plain": result
}
    }
});
    }
},
function(err) {
    if (callbacks &&
callbacks.iopub &&
callbacks.iopub.output) {
callbacks.iopub.output({
    msg_type: "error",
    content: err
});
    }
}
    );
}
    });
});
    });
});

function canBatchSageExpression(code) {
    var trimmed = $.trim(code);

    if (trimmed.length == 0) {
return false;
    }

    // Keep batching conservative: expression-style calls only.
    if (trimmed.indexOf("\n") >= 0 || trimmed.indexOf(";") >= 0) {
return false;
    }

    if (/^(if|for|while|def|class|import|from|try|with|return|print)\b/.test(trimmed)) {
return false;
    }

    // Avoid obvious assignment statements, but allow comparisons like ==, <=, >=, !=.
    if (/(^|[^!<>=])=([^=]|$)/.test(trimmed)) {
return false;
    }

    return true;
}

function postSageRaw(requestCode) {
    return new Promise(function(resolve, reject) {
$.ajax({
    type: "POST",
    url: "/sagecell/service",
    data: {
code: requestCode
    },
    dataType: "json",
    timeout: 60000
}).done(function(response) {
    if (typeof response === "string") {
response = JSON.parse(response);
    }

    if (!response.success) {
reject(response);
return;
    }

    resolve(response);
}).fail(function(xhr, status, error) {
    reject({
ename: "SageCellRequestError",
evalue: error || status,
status: status,
responseText: xhr.responseText
    });
});
    });
}

function responseToResult(response) {
    if (response.execute_result !== undefined) {
return response.execute_result;
    }

    if (response.stdout !== undefined) {
return response.stdout;
    }

    return "";
}

function sageSetupRequest() {
    // fullSageRequest("") gives the current seed plus all collected silent Sage
    // setup blocks, without adding a meaningful final expression.
    return fullSageRequest("");
}

function estimateCurrentSageBatchChars(extraCode) {
    var setupLength = sageSetupRequest().length;
    var exprLength = 0;

    sageBatchItems.forEach(function(item) {
// This estimates the compact payload after the batch-key fix below.
exprLength += item.code.length + 80;
    });

    if (extraCode !== undefined && extraCode !== null) {
exprLength += extraCode.length + 80;
    }

    // Add overhead for wrapper Sage code, JSON syntax, markers, and urlencoding.
    return setupLength + exprLength + 6000;
}

function flushSageBatch() {
    var batch = sageBatchItems;
    sageBatchItems = [];
    sageBatchTimer = null;

    if (batch.length == 0) {
return;
    }

    var seen = {};
    var unique = [];

    batch.forEach(function(item) {
if (!seen[item.requestKey]) {
    item.batchKey = "b" + (sageBatchNextId++);
    seen[item.requestKey] = item;
    unique.push(item);
} else {
    item.batchKey = seen[item.requestKey].batchKey;
}
    });

    // Important: use compact batch keys in the Sage payload, not requestKey.
    // requestKey contains the entire setup + expression and would bloat the
    // request body dramatically.
    var requestPairs = unique.map(function(item) {
return [item.batchKey, item.code];
    });

    var batchCode = sageSetupRequest() + "\n\n" +
"import json as _xronos_json\n" +
"try:\n" +
"    from sage.misc.sage_eval import sage_eval as _xronos_sage_eval\n" +
"except Exception:\n" +
"    _xronos_sage_eval = sage_eval\n" +
"_xronos_requests = " + JSON.stringify(requestPairs) + "\n" +
"_xronos_results = {}\n" +
"for _xronos_key, _xronos_expr in _xronos_requests:\n" +
"    try:\n" +
"        _xronos_value = _xronos_sage_eval(_xronos_expr, locals=globals())\n" +
"        _xronos_results[_xronos_key] = {'ok': True, 'result': str(_xronos_value)}\n" +
"    except Exception as _xronos_e:\n" +
"        _xronos_results[_xronos_key] = {'ok': False, 'error': repr(_xronos_e)}\n" +
"print('__XRONOS_BATCH_RESULTS_START__')\n" +
"print(_xronos_json.dumps(_xronos_results))\n" +
"print('__XRONOS_BATCH_RESULTS_END__')\n";

    postSageRaw(batchCode).then(
function(response) {
    var stdout = response.stdout || response.execute_result || "";
    var match = stdout.match(/__XRONOS_BATCH_RESULTS_START__\s*([\s\S]*?)\s*__XRONOS_BATCH_RESULTS_END__/);

    if (!match) {
batch.forEach(function(item) {
    delete sageRequestInFlight[item.requestKey];
    item.reject({
ename: "SageBatchParseError",
evalue: "Could not find batch result markers.",
stdout: stdout
    });
});
return;
    }

    var results = JSON.parse(match[1]);

    batch.forEach(function(item) {
delete sageRequestInFlight[item.requestKey];

var entry = results[item.batchKey];

if (!entry) {
    item.reject({
ename: "SageBatchMissingResult",
evalue: "No batch result for request."
    });
    return;
}

if (!entry.ok) {
    item.reject({
ename: "SageBatchExpressionError",
evalue: entry.error
    });
    return;
}

sageRequestCache[item.requestKey] = entry.result;
item.resolve(entry.result);
    });
},
function(err) {
    batch.forEach(function(item) {
delete sageRequestInFlight[item.requestKey];
item.reject(err);
    });
}
    );
}


function clearSageClientCaches() {
    sageRequestCache = {};
    sageRequestInFlight = {};
    sageBatchItems = [];

    if (sageBatchTimer !== null) {
window.clearTimeout(sageBatchTimer);
sageBatchTimer = null;
    }

    sageQueue = Promise.resolve();
}

function xronosShowMeAnotherSage() {
    var oldSeed = $("#seed").persistentData('seed');

    seed = undefined;
    clearSageClientCaches();

    if (typeof database !== "undefined" && database.resetWork) {
database.resetWork();
    }

    if (oldSeed !== undefined) {
$("#seed").persistentData('seed', oldSeed + 1);
    } else {
$("#seed").persistentData('seed', 0);
    }

    return $("#seed").persistentData('seed');
}

// Temporary/debug hook. This lets us test the production "Another" behavior
// even if the test layout is missing or hiding the button.
window.xronosShowMeAnotherSage = xronosShowMeAnotherSage;

function scheduleSageBatchFlush() {
    if (sageBatchTimer === null) {
sageBatchTimer = window.setTimeout(flushSageBatch, sageBatchDelay);
    }
}

exports.sage = function(code) {
    return new Promise(function(resolve, reject) {
setSeed(function() {
    var requestKey = fullSageRequest(code);

    if (sageRequestCache[requestKey] !== undefined) {
resolve(sageRequestCache[requestKey]);
return;
    }

    if (sageRequestInFlight[requestKey] !== undefined) {
sageRequestInFlight[requestKey].then(resolve, reject);
return;
    }

    if (canBatchSageExpression(code)) {
if (sageBatchItems.length > 0 &&
    estimateCurrentSageBatchChars(code) >= sageBatchMaxEstimatedChars) {
    if (sageBatchTimer !== null) {
window.clearTimeout(sageBatchTimer);
sageBatchTimer = null;
    }
    flushSageBatch();
}

var batchPromise = new Promise(function(innerResolve, innerReject) {
    sageBatchItems.push({
code: $.trim(code),
requestKey: requestKey,
resolve: innerResolve,
reject: innerReject
    });
});

sageRequestInFlight[requestKey] = batchPromise;

if (sageBatchItems.length >= sageBatchMaxItems) {
    if (sageBatchTimer !== null) {
window.clearTimeout(sageBatchTimer);
sageBatchTimer = null;
    }
    flushSageBatch();
} else {
    scheduleSageBatchFlush();
}

batchPromise.then(resolve, reject);
return;
    }

    // Fallback path for statement-like or multiline Sage code.
    var directPromise = sageQueue.then(
function() {
    return postSageRaw(requestKey).then(responseToResult);
},
function() {
    return postSageRaw(requestKey).then(responseToResult);
}
    );

    sageRequestInFlight[requestKey] = directPromise;

    sageQueue = directPromise.then(
function() {},
function() {}
    );

    directPromise.then(
function(result) {
    delete sageRequestInFlight[requestKey];
    sageRequestCache[requestKey] = result;
    resolve(result);
},
function(err) {
    delete sageRequestInFlight[requestKey];
    reject(err);
}
    );
});
    });
};


window.sage = function(code) {
    exports.sage(code).then(
function(result) { console.log(result); },
function(err) { console.log("err=", err); }
    );
};

$(function() {
    // If there are any Sage blocks on the page, initialize the local
    // service-backed Sage compatibility layer.
    if (($( ".sage" ).length > 0) ||
($( ".sageOutput" ).length > 0) ||
($('script[type="text/sagemath"]').length > 0)) {
exports.createKernel();
    }
});
