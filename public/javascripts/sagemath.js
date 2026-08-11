var $ = require('jquery');
var _ = require('underscore');
var MathJax = require('mathjax');
var database = require('./database');
var TinCan = require('./tincan');
var pageRuntime = require('./page-runtime');
var sageErrorPolicy = require('./sage-error-policy');
var sageCanonicalReplayPolicy =
    require('./sage-canonical-replay-policy');

var seeded = false;
var seedCallbacks = [];
var seed = null;
var currentSeedCode = "";


var sageAuthRefreshInFlight = null;


var sagePageManifestCompilerVersion = 4;

var initialSagePageManifestSnapshot = null;

var canonicalPageSageMaxCompiledUtf8Bytes =
    100000;

var canonicalPageSageRuntime = {
    initialPromise: null,
    permanentFailureReason: null,
    status: "idle",
    requestCount: 0,
    mappedCalls: 0,
    postInitialReplayMappedCalls: 0,
    canonicalResolutions: 0,
    canonicalRejections: 0,
    invariantFailures: 0,
    compiledCharacters: 0,
    compiledUtf8Bytes: 0,
    compiledDebugHash: null,
    requestStartedAtMilliseconds: null,
    requestCompletedAtMilliseconds: null,
    requestDurationMilliseconds: null,
    resultCount: 0,
    expressionFailureCount: 0,
    lastInvariantFailure: null,
    lastError: null
};


var canonicalPageSageNextGenerationId = 1;

var canonicalPageSageActiveGeneration = null;

var canonicalPageSagePendingAnotherSeed = null;

var canonicalPageSageAnotherBusy = false;

var canonicalPageSageIgnoredAnotherClicks = 0;

var canonicalPageSageAnotherClaimDataKey =
    "xronosCanonicalAnotherClaimed";


function setCanonicalPageSageAnotherBusy(
    busy
) {
    canonicalPageSageAnotherBusy =
        busy === true;

    var button =
        $("#show-me-another-button");

    if (button.length === 0) {
        return;
    }

    if (!canonicalPageSageAnotherBusy) {
        button.removeData(
            canonicalPageSageAnotherClaimDataKey
        );
    }

    button.prop(
        "disabled",
        canonicalPageSageAnotherBusy
    );

    button.attr(
        "aria-disabled",
        canonicalPageSageAnotherBusy
            ? "true"
            : "false"
    );

    button.attr(
        "aria-busy",
        canonicalPageSageAnotherBusy
            ? "true"
            : "false"
    );

    var icon =
        $("i", button);

    if (canonicalPageSageAnotherBusy) {
        icon.addClass("fa-spin");

        icon.css(
            "animation-play-state",
            "running"
        );
    } else {
        icon.removeClass("fa-spin");

        icon.css(
            "animation-play-state",
            "paused"
        );
    }
}


function maybeReleaseCanonicalPageSageAnother(
    generation
) {
    if (
        !generation ||
        generation !==
            canonicalPageSageActiveGeneration ||
        generation.released ||
        generation.releaseScheduled ||
        !generation.mathJaxPassComplete ||
        !generation.fullPassComplete ||
        !generation.requestSettled ||
        generation.pendingCallPromises !== 0
    ) {
        return;
    }

    generation.releaseScheduled =
        true;

    /*
     * Resolver promises settle before main.js queues each final placeholder
     * render. Defer one event-loop turn, then place the unlock behind those
     * queued render operations.
     */
    window.setTimeout(
        function() {
            generation.releaseScheduled =
                false;

            if (
                generation !==
                    canonicalPageSageActiveGeneration ||
                generation.released ||
                !generation.mathJaxPassComplete ||
                !generation.fullPassComplete ||
                !generation.requestSettled ||
                generation.pendingCallPromises !== 0
            ) {
                return;
            }

            MathJax.Hub.Queue(
                function() {
                    if (
                        generation !==
                            canonicalPageSageActiveGeneration ||
                        generation.released
                    ) {
                        return;
                    }

                    generation.released =
                        true;

                    setCanonicalPageSageAnotherBusy(
                        false
                    );
                }
            );
        },
        0
    );
}


function canonicalPageSageTrackGenerationPromise(
    generation,
    promise
) {
    generation.pendingCallPromises += 1;

    return Promise.resolve(
        promise
    ).then(
        function(value) {
            generation.pendingCallPromises -= 1;
            generation.settledCallPromises += 1;

            maybeReleaseCanonicalPageSageAnother(
                generation
            );

            return value;
        },
        function(err) {
            generation.pendingCallPromises -= 1;
            generation.settledCallPromises += 1;

            maybeReleaseCanonicalPageSageAnother(
                generation
            );

            throw err;
        }
    );
}


function canonicalPageSageSeedsEqual(
    left,
    right
) {
    if (
        left === undefined &&
        right === undefined
    ) {
        return true;
    }

    return String(left) ===
        String(right);
}


function canonicalPageSageNewGeneration(
    newSeed
) {
    var generation = {
        id:
            canonicalPageSageNextGenerationId,

        seed:
            newSeed,

        startCallIndex:
            typeof sageMathJaxCallTrace !==
                "undefined"
                ? sageMathJaxCallTrace.length
                : 0,

        status:
            "prepared",

        mathJaxPassComplete:
            false,

        requestSettled:
            false,

        pendingCallPromises:
            0,

        settledCallPromises:
            0,

        releaseScheduled:
            false,

        released:
            false,

        requestPromise:
            null,

        permanentFailureReason:
            null,

        callMappings:
            {},

        /*
         * This cursor tracks the longest currently observed prefix of the
         * immutable page manifest. Preliminary restored-answer calls may
         * occur before that complete sequence begins.
         */
        fullPassCursor:
            0,

        fullPassComplete:
            false,

        prefixRestartCount:
            0,

        preliminaryMappedCalls:
            0,

        requestCount:
            0,

        mappedCalls:
            0,

        canonicalResolutions:
            0,

        canonicalRejections:
            0,

        invariantFailures:
            0,

        compiledCharacters:
            0,

        compiledUtf8Bytes:
            0,

        compiledDebugHash:
            null,

        requestStartedAtMilliseconds:
            null,

        requestCompletedAtMilliseconds:
            null,

        requestDurationMilliseconds:
            null,

        resultCount:
            0,

        expressionFailureCount:
            0,

        lastInvariantFailure:
            null,

        lastError:
            null
    };

    canonicalPageSageNextGenerationId += 1;

    return generation;
}


function prepareCanonicalPageSageGeneration(
    newSeed
) {
    setCanonicalPageSageAnotherBusy(
        true
    );

    canonicalPageSageActiveGeneration =
        canonicalPageSageNewGeneration(
            newSeed
        );

    return canonicalPageSageActiveGeneration;
}


/*
 * Read one balanced TeX argument beginning at an opening brace.
 *
 * This is currently used only by the ordered-page manifest instrumentation.
 * It intentionally preserves the author expression exactly as written.
 */
function readBalancedTexArgument(source, openBraceIndex) {
    var depth = 0;
    var escaped = false;
    var index;
    var character;

    if (
        openBraceIndex < 0 ||
        source.charAt(openBraceIndex) !== "{"
    ) {
        return null;
    }

    for (
        index = openBraceIndex;
        index < source.length;
        index += 1
    ) {
        character = source.charAt(index);

        if (escaped) {
            escaped = false;
            continue;
        }

        if (character === "\\") {
            escaped = true;
            continue;
        }

        if (character === "{") {
            depth += 1;
            continue;
        }

        if (character === "}") {
            depth -= 1;

            if (depth === 0) {
                return {
                    value: source.slice(
                        openBraceIndex + 1,
                        index
                    ),
                    endIndex: index
                };
            }
        }
    }

    return null;
}



function readBalancedTexOptionalArgument(
    source,
    openBracketIndex
) {
    var depth = 0;
    var escaped = false;
    var index;
    var character;

    if (
        openBracketIndex < 0 ||
        source.charAt(openBracketIndex) !== "["
    ) {
        return null;
    }

    for (
        index = openBracketIndex;
        index < source.length;
        index += 1
    ) {
        character = source.charAt(index);

        if (escaped) {
            escaped = false;
            continue;
        }

        if (character === "\\") {
            escaped = true;
            continue;
        }

        if (character === "[") {
            depth += 1;
            continue;
        }

        if (character === "]") {
            depth -= 1;

            if (depth === 0) {
                return {
                    value: source.slice(
                        openBracketIndex + 1,
                        index
                    ),
                    endIndex: index
                };
            }
        }
    }

    return null;
}


/*
 * Determine whether a Sage expression is inside an \answer{...} argument.
 *
 * This lets the instrumentation distinguish ordinary display values from
 * Sage-generated answer keys without changing MathJax behavior yet.
 */
function sageExpressionConsumer(
    source,
    expressionStartIndex
) {
    var answerPattern = /\\answer\b/g;
    var match;
    var cursor;
    var optionalArgument;
    var argument;

    while (
        (
            match =
                answerPattern.exec(source)
        ) !== null
    ) {
        cursor =
            answerPattern.lastIndex;

        while (
            cursor < source.length &&
            /\s/.test(
                source.charAt(cursor)
            )
        ) {
            cursor += 1;
        }

        /*
         * Ximera answers may contain one or more optional argument groups:
         *
         * \answer[id=foo,validator=bar]{\sage{answerValue}}
         */
        while (
            source.charAt(cursor) === "["
        ) {
            optionalArgument =
                readBalancedTexOptionalArgument(
                    source,
                    cursor
                );

            if (!optionalArgument) {
                break;
            }

            cursor =
                optionalArgument.endIndex + 1;

            while (
                cursor < source.length &&
                /\s/.test(
                    source.charAt(cursor)
                )
            ) {
                cursor += 1;
            }
        }

        if (
            source.charAt(cursor) !== "{"
        ) {
            continue;
        }

        argument =
            readBalancedTexArgument(
                source,
                cursor
            );

        if (!argument) {
            break;
        }

        if (
            expressionStartIndex > cursor &&
            expressionStartIndex <
                argument.endIndex
        ) {
            return "answer-key";
        }

        answerPattern.lastIndex =
            argument.endIndex + 1;
    }

    return "display";
}


/*
 * Extract ordered \sage{...} and \sagestr{...} calls from one MathJax
 * source script. Balanced-brace parsing supports nested function calls,
 * substitutions, lists, and legacy compound expressions.
 */
function extractSageExpressionsFromTex(source) {
    var sagePattern =
        /\\(sage|sagestr)\s*\{/g;

    var expressions = [];
    var match;
    var openBraceIndex;
    var argument;

    while (
        (
            match =
                sagePattern.exec(source)
        ) !== null
    ) {
        openBraceIndex =
            match.index +
            match[0].lastIndexOf("{");

        argument = readBalancedTexArgument(
            source,
            openBraceIndex
        );

        if (!argument) {
            expressions.push({
                macro: match[1],
                expression: null,
                parseError:
                    "Unbalanced Sage TeX argument",
                sourceStartIndex: match.index
            });

            break;
        }

        expressions.push({
            macro: match[1],
            expression: argument.value,
            latexify: match[1] === "sage",
            consumer: sageExpressionConsumer(
                source,
                match.index
            ),
            sourceStartIndex: match.index,
            sourceEndIndex: argument.endIndex
        });

        sagePattern.lastIndex =
            argument.endIndex + 1;
    }

    return expressions;
}


function padSageManifestNumber(value, width) {
    var result = String(value);

    while (result.length < width) {
        result = "0" + result;
    }

    return result;
}


function sageProblemNestingDepth(problem) {
    var depth = 0;
    var current;

    if (!problem) {
        return null;
    }

    current = problem.parentNode;

    while (current) {
        if (
            current.nodeType === 1 &&
            (
                " " +
                (current.className || "") +
                " "
            ).indexOf(
                " problem-environment "
            ) !== -1
        ) {
            depth += 1;
        }

        current = current.parentNode;
    }

    return depth;
}


function findSageProblemContainer(element) {
    var current = element;

    while (current) {
        if (
            current.nodeType === 1 &&
            (
                " " +
                (current.className || "") +
                " "
            ).indexOf(
                " problem-environment "
            ) !== -1
        ) {
            return current;
        }

        current = current.parentNode;
    }

    return null;
}


/*
 * Build an ordered description of all initial Sage content currently present
 * in the activity DOM.
 *
 * This is instrumentation only. The existing batching and request behavior
 * remain unchanged until the collected ordering and sizes are validated.
 */
/*
 * Normalize htlatex's Sage CDATA wrapper before canonical manifest parsing.
 *
 * This helper is shared parsing infrastructure. It is intentionally retained
 * independently of the removed legacy browser Sage executor.
 */
var stripCDATA = function(code) {
    return code.replace(
        /[\s\S]*#<!\[CDATA\[\s*\n((.|\n)*)\s*#\]\]>/m,
        "$1"
    );
};


function buildSagePageManifestProbe(
    root,
    options
) {
    options = options || {};

    var preMathJax =
        options.preMathJax === true;

    var activity =
        root ||
        document.querySelector(
            "main.activity"
        ) ||
        document.body;

    /*
     * Before MathJax startup, TeX is still stored in the author-delivered
     * .mathjax-inline and .mathjax-block wrappers. MathJax later converts
     * those sources into script[type^="math/tex"] nodes.
     *
     * Keep the two modes separate so settled-DOM inspection does not count
     * both a wrapper and its generated script.
     */
    var selector = (
        preMathJax
            ? [
                'script[type="text/sagemath"]',
                '.mathjax-inline',
                '.mathjax-block',
                'script[type^="math/tex"]'
            ]
            : [
                'script[type="text/sagemath"]',
                'script[type^="math/tex"]'
            ]
    ).join(",");

    var scripts =
        Array.prototype.filter.call(
            activity.querySelectorAll(
                selector
            ),
            function(sourceNode) {
                var type =
                    sourceNode.getAttribute(
                        "type"
                    ) || "";

                /*
                 * Some transitional HTML may contain a generated math/tex
                 * script inside one of the raw MathJax wrapper elements.
                 * In that case the wrapper already contains the same TeX
                 * source, so retain the wrapper and omit the nested script.
                 */
                if (
                    preMathJax &&
                    type.indexOf(
                        "math/tex"
                    ) === 0 &&
                    $(sourceNode).closest(
                        ".mathjax-inline, " +
                        ".mathjax-block"
                    ).length > 0
                ) {
                    return false;
                }

                return true;
            }
        );

    var entries = [];
    var silentBlockCount = 0;
    var expressionCount = 0;
    var answerKeyCount = 0;
    var silentCharacters = 0;
    var expressionCharacters = 0;

    Array.prototype.forEach.call(
        scripts,
        function(script, scriptIndex) {
            var type =
                script.getAttribute("type") ||
                "";

            var source =
                script.textContent || "";

            var problem;
            var expressions;

            if (type === "text/sagemath") {
                source = stripCDATA(source);

                silentBlockCount += 1;
                silentCharacters +=
                    source.length;

                entries.push({
                    order: entries.length,
                    kind: "sagesilent",
                    scriptIndex: scriptIndex,
                    characters: source.length,
                    code: source
                });

                return;
            }

            expressions =
                extractSageExpressionsFromTex(
                    source
                );

            if (expressions.length === 0) {
                return;
            }

            problem =
                findSageProblemContainer(
                    script
                );

            expressions.forEach(
                function(
                    expression,
                    scriptExpressionIndex
                ) {
                    var stableId =
                        "sage-expression-" +
                        padSageManifestNumber(
                            expressionCount + 1,
                            4
                        );

                    expressionCount += 1;

                    if (
                        expression.consumer ===
                        "answer-key"
                    ) {
                        answerKeyCount += 1;
                    }

                    if (
                        expression.expression !==
                        null
                    ) {
                        expressionCharacters +=
                            expression.expression.length;
                    }

                    entries.push({
                        order: entries.length,
                        kind: "expression",
                        stableId: stableId,
                        scriptIndex: scriptIndex,
                        scriptId:
                            script.id || "",
                        scriptExpressionIndex:
                            scriptExpressionIndex,
                        problemId:
                            problem
                                ? problem.id || null
                                : null,
                        problemDepth:
                            sageProblemNestingDepth(
                                problem
                            ),
                        macro:
                            expression.macro,
                        latexify:
                            expression.latexify,
                        consumer:
                            expression.consumer ||
                            "unknown",
                        expression:
                            expression.expression,
                        parseError:
                            expression.parseError ||
                            null,
                        sourceStartIndex:
                            expression.sourceStartIndex,
                        sourceEndIndex:
                            expression.sourceEndIndex
                    });
                }
            );
        }
    );

    var estimatedCompiledCharacters =
        currentSeedCode.length +
        silentCharacters +
        expressionCharacters +
        expressionCount * 180 +
        6000;

    return {
        compilerVersion:
            sagePageManifestCompilerVersion,

        page: {
            url:
                window.location.href,
            repository:
                activity.getAttribute(
                    "data-repository-name"
                ),
            path:
                activity.getAttribute(
                    "data-path"
                ),
            commit:
                activity.getAttribute(
                    "data-commit"
                ),
            hash:
                activity.getAttribute(
                    "data-hash"
                )
        },

        summary: {
            silentBlocks:
                silentBlockCount,
            expressions:
                expressionCount,
            answerKeys:
                answerKeyCount,
            manifestEntries:
                entries.length,
            seedCharacters:
                currentSeedCode.length,
            silentCharacters:
                silentCharacters,
            expressionCharacters:
                expressionCharacters,
            estimatedCompiledCharacters:
                estimatedCompiledCharacters
        },

        entries: entries
    };
}



/*
 * Return a deterministic debugging hash for comparing compiled page programs.
 *
 * The production proxy will continue using SHA-256 over the exact submitted
 * code. This smaller browser-side hash exists only for instrumentation.
 */
function sageManifestDebugHash(value) {
    var hash = 2166136261;
    var index;

    for (
        index = 0;
        index < value.length;
        index += 1
    ) {
        hash ^= value.charCodeAt(index);

        hash +=
            (hash << 1) +
            (hash << 4) +
            (hash << 7) +
            (hash << 8) +
            (hash << 24);
    }

    return (
        "00000000" +
        (hash >>> 0).toString(16)
    ).slice(-8);
}


function sageUtf8ByteLength(value) {
    var length = 0;
    var index;
    var code;
    var next;

    for (
        index = 0;
        index < value.length;
        index += 1
    ) {
        code = value.charCodeAt(index);

        if (code <= 0x7f) {
            length += 1;
        } else if (code <= 0x7ff) {
            length += 2;
        } else if (
            code >= 0xd800 &&
            code <= 0xdbff &&
            index + 1 < value.length
        ) {
            next =
                value.charCodeAt(index + 1);

            if (
                next >= 0xdc00 &&
                next <= 0xdfff
            ) {
                length += 4;
                index += 1;
            } else {
                length += 3;
            }
        } else {
            length += 3;
        }
    }

    return length;
}


/*
 * Compile the ordered DOM manifest into one deterministic Sage program.
 *
 * Important:
 * - The page seed runs once.
 * - Silent blocks run in document order.
 * - Expressions are captured immediately at their document positions.
 * - A later silent block can therefore change values only for later outputs.
 * - Individual expression errors are returned without discarding other
 *   successfully captured outputs.
 * - Sage's preparse step is applied when executing silent block strings so
 *   author syntax such as ^ retains normal Sage semantics.
 *
 * The compiler is used by diagnostics and by the browser-local,
 * feature-gated initial-page integration. The deployed default remains the
 * existing browser batching path.
 */
function compileSagePageManifest(manifest) {
    var lines = [];
    var silentBlockNumber = 0;

    lines.push(
        "# XRONOS_PAGE_SAGE_COMPILER_VERSION=" +
        sagePageManifestCompilerVersion
    );

    lines.push(
        "import json as _xronos_json"
    );

    lines.push(
        "import traceback as _xronos_traceback"
    );

    lines.push(
        "try:"
    );

    lines.push(
        "    from sage.misc.sage_eval import " +
        "sage_eval as _xronos_sage_eval"
    );

    lines.push(
        "except Exception:"
    );

    lines.push(
        "    _xronos_sage_eval = sage_eval"
    );

    lines.push(
        "from sage.repl.preparse import " +
        "preparse as _xronos_preparse"
    );

    if (
        $.trim(currentSeedCode).length > 0
    ) {
        lines.push("");
        lines.push(currentSeedCode);
    }

    lines.push("");
    lines.push("_xronos_results = {}");
    lines.push("_xronos_setup_error = None");

    manifest.entries.forEach(
        function(entry) {
            var filename;
            var evaluationCode;

            if (entry.kind === "sagesilent") {
                silentBlockNumber += 1;

                filename =
                    "<xronos-sagesilent-" +
                    padSageManifestNumber(
                        silentBlockNumber,
                        4
                    ) +
                    ">";

                lines.push("");
                lines.push(
                    "if _xronos_setup_error is None:"
                );

                lines.push(
                    "    try:"
                );

                lines.push(
                    "        exec(" +
                    "compile(" +
                    "_xronos_preparse(" +
                    JSON.stringify(entry.code) +
                    "), " +
                    JSON.stringify(filename) +
                    ", 'exec'), globals())"
                );

                lines.push(
                    "    except Exception as _xronos_e:"
                );

                lines.push(
                    "        _xronos_setup_error = {"
                );

                lines.push(
                    "            'type': " +
                    "'sagesilent',"
                );

                /*
                 * Store compiler metadata as ordinary strings. SageCell
                 * preparses the entire submitted program, so a bare numeric
                 * literal here would become a Sage Integer rather than a
                 * Python int and would not be directly JSON serializable.
                 */
                lines.push(
                    "            'block': " +
                    JSON.stringify(
                        String(
                            silentBlockNumber
                        )
                    ) +
                    ","
                );

                lines.push(
                    "            'error': " +
                    "repr(_xronos_e),"
                );

                lines.push(
                    "            'traceback': " +
                    "_xronos_traceback.format_exc()"
                );

                lines.push(
                    "        }"
                );

                return;
            }

            if (entry.kind !== "expression") {
                return;
            }

            evaluationCode =
                entry.latexify
                    ? "latex(" +
                      entry.expression +
                      ")"
                    : entry.expression;

            lines.push("");

            lines.push(
                "if _xronos_setup_error is not None:"
            );

            lines.push(
                "    _xronos_results[" +
                JSON.stringify(entry.stableId) +
                "] = {"
            );

            lines.push(
                "        'ok': False,"
            );

            lines.push(
                "        'errorType': " +
                "'setup',"
            );

            lines.push(
                "        'error': " +
                "_xronos_setup_error"
            );

            lines.push(
                "    }"
            );

            lines.push(
                "else:"
            );

            lines.push(
                "    try:"
            );

            lines.push(
                "        _xronos_value = " +
                "_xronos_sage_eval(" +
                JSON.stringify(evaluationCode) +
                ", locals=globals())"
            );

            lines.push(
                "        _xronos_results[" +
                JSON.stringify(entry.stableId) +
                "] = {"
            );

            lines.push(
                "            'ok': True,"
            );

            lines.push(
                "            'result': " +
                "str(_xronos_value)"
            );

            lines.push(
                "        }"
            );

            lines.push(
                "    except Exception as _xronos_e:"
            );

            lines.push(
                "        _xronos_results[" +
                JSON.stringify(entry.stableId) +
                "] = {"
            );

            lines.push(
                "            'ok': False,"
            );

            lines.push(
                "            'errorType': " +
                "'expression',"
            );

            lines.push(
                "            'expression': " +
                JSON.stringify(
                    entry.expression
                ) +
                ","
            );

            lines.push(
                "            'error': " +
                "repr(_xronos_e),"
            );

            lines.push(
                "            'traceback': " +
                "_xronos_traceback.format_exc()"
            );

            lines.push(
                "        }"
            );
        }
    );

    lines.push("");

    lines.push(
        "print(" +
        JSON.stringify(
            "__XRONOS_PAGE_RESULTS__"
        ) +
        " + _xronos_json.dumps(" +
        "_xronos_results, " +
        "sort_keys=True, default=str))"
    );

    return lines.join("\n");
}


exports.compilePageSageManifest =
    compileSagePageManifest;


window.xronosCompileSagePageManifestPreview =
    function() {
        var manifest =
            preferredSagePageManifestProbe();

        var compiledCode =
            compileSagePageManifest(
                manifest
            );

        var result = {
            compilerVersion:
                sagePageManifestCompilerVersion,

            page:
                manifest.page,

            summary: {
                silentBlocks:
                    manifest.summary.silentBlocks,
                expressions:
                    manifest.summary.expressions,
                answerKeys:
                    manifest.summary.answerKeys,
                manifestEntries:
                    manifest.summary.manifestEntries,
                compiledCharacters:
                    compiledCode.length,
                compiledUtf8Bytes:
                    sageUtf8ByteLength(
                        compiledCode
                    ),
                compiledDebugHash:
                    sageManifestDebugHash(
                        compiledCode
                    )
            },

            compiledCode:
                compiledCode
        };

        /*
         * Emit exactly one object for Chrome's "Copy object" workflow.
         */
        console.log(result);

        return result;
    };


window.xronosCheckSagePageManifestDeterminism =
    function() {
        var preview =
            window
                .xronosCompileSagePageManifestPreview();

        var storageKey =
            "xronos-sage-manifest-probe:" +
            preview.page.repository +
            ":" +
            preview.page.path;

        var previousText =
            window.sessionStorage.getItem(
                storageKey
            );

        var previous =
            previousText
                ? JSON.parse(previousText)
                : null;

        var current = {
            compilerVersion:
                preview.compilerVersion,
            commit:
                preview.page.commit,
            hash:
                preview.page.hash,
            compiledCharacters:
                preview.summary
                    .compiledCharacters,
            compiledUtf8Bytes:
                preview.summary
                    .compiledUtf8Bytes,
            compiledDebugHash:
                preview.summary
                    .compiledDebugHash
        };

        window.sessionStorage.setItem(
            storageKey,
            JSON.stringify(current)
        );

        var result = {
            page:
                preview.page,
            previous:
                previous,
            current:
                current,
            matchesPrevious:
                previous !== null &&
                previous.compilerVersion ===
                    current.compilerVersion &&
                previous.commit ===
                    current.commit &&
                previous.hash ===
                    current.hash &&
                previous.compiledCharacters ===
                    current.compiledCharacters &&
                previous.compiledUtf8Bytes ===
                    current.compiledUtf8Bytes &&
                previous.compiledDebugHash ===
                    current.compiledDebugHash
        };

        /*
         * Emit one final object after the larger compiler preview object.
         * This final object is the one to copy.
         */
        console.log(result);

        return result;
    };



var sagePageResultMarker =
    "__XRONOS_PAGE_RESULTS__";


function parseSagePageManifestResponse(response) {
    var rawResult =
        responseToResult(response);

    var markerIndex;
    var jsonText;

    if (
        rawResult === undefined ||
        rawResult === null
    ) {
        rawResult = "";
    }

    rawResult = String(rawResult);

    markerIndex =
        rawResult.lastIndexOf(
            sagePageResultMarker
        );

    if (markerIndex === -1) {
        throw {
            ename:
                "XronosSagePageResultError",
            evalue:
                "Canonical Sage page result marker was not found",
            responseText:
                rawResult
        };
    }

    jsonText = $.trim(
        rawResult.slice(
            markerIndex +
            sagePageResultMarker.length
        )
    );

    try {
        return JSON.parse(jsonText);
    } catch (err) {
        throw {
            ename:
                "XronosSagePageResultError",
            evalue:
                "Canonical Sage page result JSON could not be parsed",
            parseError:
                String(err),
            responseText:
                rawResult
        };
    }
}


function executeSagePageManifestPreview(
    manifest
) {
    var compiledCode =
        compileSagePageManifest(
            manifest
        );

    return postSageRaw(
        compiledCode
    ).then(
        function(response) {
            return {
                compiledCode:
                    compiledCode,
                compiledCharacters:
                    compiledCode.length,
                compiledUtf8Bytes:
                    sageUtf8ByteLength(
                        compiledCode
                    ),
                compiledDebugHash:
                    sageManifestDebugHash(
                        compiledCode
                    ),
                results:
                    parseSagePageManifestResponse(
                        response
                    )
            };
        }
    );
}


function canonicalPageSageExpressionEntries(
    manifest
) {
    if (!manifest || !manifest.entries) {
        return [];
    }

    return manifest.entries.filter(
        function(entry) {
            return (
                entry.kind ===
                "expression"
            );
        }
    );
}


function canonicalPageSageSimpleError(err) {
    if (!err) {
        return null;
    }

    return {
        ename:
            err.ename ||
            err.name ||
            "",

        evalue:
            err.evalue ||
            err.message ||
            String(err),

        status:
            err.status ||
            "",

        httpStatus:
            err.httpStatus ||
            0
    };
}


function canonicalPageSageInvariantFailure(
    requestedCode,
    reason
) {
    /*
     * Canonical invariant boundary.
     *
     * Every live MathJax Sage call must resolve to a deterministic canonical
     * operation. Missing identity, ambiguous mapping, or invalid lifecycle
     * state is rejected explicitly and recorded for diagnostics.
     */
    canonicalPageSageRuntime
        .invariantFailures += 1;

    canonicalPageSageRuntime
        .lastInvariantFailure = reason;

    var code =
        reason &&
        reason.code
            ? reason.code
            : "canonical-unresolved-call";

    var message =
        reason &&
        reason.message
            ? reason.message
            : "Canonical Sage could not resolve this call to a valid canonical operation.";

    return Promise.reject(
        canonicalPageSageInvariantError(
            code,
            message,
            {
                reason:
                    reason || null,

                /*
                 * Record shape only. Do not expose authored Sage code in
                 * coordinator-visible diagnostics.
                 */
                requestedCodeCharacters:
                    requestedCode === undefined ||
                    requestedCode === null
                        ? 0
                        : String(
                            requestedCode
                        ).length,

                canonicalInvariant:
                    true
            }
        )
    );
}


function canonicalPageSageInvariantError(
    code,
    message,
    details
) {
    return {
        ename:
            "XronosCanonicalPageSageInvariantError",

        evalue:
            message,

        xronosCanonicalInvariant:
            true,

        invariantCode:
            code,

        details:
            details || null
    };
}


function canonicalPageSageEntryError(
    entry,
    result,
    execution
) {
    var rawError =
        result &&
        result.error !== undefined
            ? result.error
            : null;

    var message;

    if (
        rawError &&
        typeof rawError === "object"
    ) {
        try {
            message =
                JSON.stringify(rawError);
        } catch (err) {
            message =
                String(rawError);
        }
    } else {
        message =
            rawError !== null
                ? String(rawError)
                : "Canonical Sage expression failed.";
    }

    return {
        ename:
            result &&
            result.errorType === "setup"
                ? "XronosSageSetupError"
                : "XronosSageExpressionError",

        evalue:
            message,

        traceback:
            result &&
            result.traceback
                ? result.traceback
                : (
                    result &&
                    result.error &&
                    result.error.traceback
                        ? result.error.traceback
                        : null
                ),

        xronosSage: {
            pageUrl:
                window.location.href,

            compilerVersion:
                sagePageManifestCompilerVersion,

            compiledDebugHash:
                execution.compiledDebugHash,

            stableId:
                entry.stableId,

            order:
                entry.order,

            expression:
                entry.expression,

            consumer:
                entry.consumer,

            problemId:
                entry.problemId,

            problemDepth:
                entry.problemDepth,

            errorType:
                result
                    ? result.errorType || null
                    : null,

            result:
                result || null
        }
    };
}


function initialCanonicalPageSageFailureDetails(
    err
) {
    return {
        requestCount:
            canonicalPageSageRuntime
                .requestCount,
        requestDurationMilliseconds:
            canonicalPageSageRuntime
                .requestDurationMilliseconds,
        errorName:
            err && err.ename
                ? err.ename
                : null,
        invariantCode:
            err && err.invariantCode
                ? err.invariantCode
                : null
    };
}


function reportInitialCanonicalPageSageFailure(
    err
) {
    if (
        err &&
        err.xronosCanonicalInvariant
    ) {
        canonicalPageSageRuntime.status =
            "invariant-failure";
    }

    pageRuntime.component(
        "sage-initial",
        err &&
        err.xronosCanonicalInvariant
            ? "invariant-failure"
            : "failed",
        initialCanonicalPageSageFailureDetails(
            err
        )
    );
}


function executeInitialCanonicalPageSage() {
    var manifest =
        initialSagePageManifestSnapshot;

    if (
        canonicalPageSageRuntime
            .permanentFailureReason
    ) {
        reportInitialCanonicalPageSageFailure(
            canonicalPageSageRuntime
                .permanentFailureReason
        );

        return Promise.reject(
            canonicalPageSageRuntime
                .permanentFailureReason
        );
    }

    if (!manifest) {
        canonicalPageSageRuntime
            .permanentFailureReason =
                canonicalPageSageInvariantError(
                    "missing-snapshot",
                    "The pre-MathJax Sage manifest was not captured."
                );

        reportInitialCanonicalPageSageFailure(
            canonicalPageSageRuntime
                .permanentFailureReason
        );

        return Promise.reject(
            canonicalPageSageRuntime
                .permanentFailureReason
        );
    }

    if (
        canonicalPageSageRuntime
            .initialPromise
    ) {
        return canonicalPageSageRuntime
            .initialPromise;
    }

    var expressionEntries =
        canonicalPageSageExpressionEntries(
            manifest
        );

    if (expressionEntries.length === 0) {
        canonicalPageSageRuntime
            .permanentFailureReason =
                canonicalPageSageInvariantError(
                    "empty-manifest",
                    "The initial Sage manifest contains no expressions."
                );

        reportInitialCanonicalPageSageFailure(
            canonicalPageSageRuntime
                .permanentFailureReason
        );

        return Promise.reject(
            canonicalPageSageRuntime
                .permanentFailureReason
        );
    }

    var parseErrors =
        expressionEntries.filter(
            function(entry) {
                return !!entry.parseError;
            }
        );

    if (parseErrors.length > 0) {
        canonicalPageSageRuntime
            .permanentFailureReason =
                canonicalPageSageInvariantError(
                    "manifest-parse-error",
                    "The initial Sage manifest contains an expression parse error.",
                    {
                        entries:
                            parseErrors
                    }
                );

        reportInitialCanonicalPageSageFailure(
            canonicalPageSageRuntime
                .permanentFailureReason
        );

        return Promise.reject(
            canonicalPageSageRuntime
                .permanentFailureReason
        );
    }

    canonicalPageSageRuntime.status =
        "waiting-for-seed";

    pageRuntime.operation(
        "sage-initial-request",
        "waiting-for-seed",
        {
            expressions:
                expressionEntries.length
        }
    );

    var pending =
        new Promise(
            function(resolve, reject) {
                setSeed(
                    function() {
                        var compiledCode =
                            compileSagePageManifest(
                                manifest
                            );

                        var compiledUtf8Bytes =
                            sageUtf8ByteLength(
                                compiledCode
                            );

                        canonicalPageSageRuntime
                            .compiledCharacters =
                                compiledCode.length;

                        canonicalPageSageRuntime
                            .compiledUtf8Bytes =
                                compiledUtf8Bytes;

                        canonicalPageSageRuntime
                            .compiledDebugHash =
                                sageManifestDebugHash(
                                    compiledCode
                                );

                        if (
                            compiledUtf8Bytes >
                            canonicalPageSageMaxCompiledUtf8Bytes
                        ) {
                            canonicalPageSageRuntime
                                .permanentFailureReason =
                                    canonicalPageSageInvariantError(
                                        "compiled-size-limit",
                                        "The canonical Sage page program exceeds the configured request safety limit.",
                                        {
                                            compiledUtf8Bytes:
                                                compiledUtf8Bytes,

                                            maximumUtf8Bytes:
                                                canonicalPageSageMaxCompiledUtf8Bytes
                                        }
                                    );

                            reject(
                                canonicalPageSageRuntime
                                    .permanentFailureReason
                            );

                            return;
                        }

                        canonicalPageSageRuntime
                            .status =
                                "requesting";

                        canonicalPageSageRuntime
                            .requestCount += 1;

                        canonicalPageSageRuntime
                            .requestStartedAtMilliseconds =
                                Date.now();

                        canonicalPageSageRuntime
                            .requestCompletedAtMilliseconds =
                                null;

                        canonicalPageSageRuntime
                            .requestDurationMilliseconds =
                                null;

                        pageRuntime.operation(
                            "sage-initial-request",
                            "submitted",
                            {
                                request:
                                    canonicalPageSageRuntime
                                        .requestCount,
                                compiledCharacters:
                                    compiledCode.length,
                                compiledUtf8Bytes:
                                    compiledUtf8Bytes,
                                resultCountExpected:
                                    expressionEntries.length
                            }
                        );

                        postSageRaw(
                            compiledCode
                        ).then(
                            function(response) {
                                var results;

                                canonicalPageSageRuntime
                                    .requestCompletedAtMilliseconds =
                                        Date.now();

                                canonicalPageSageRuntime
                                    .requestDurationMilliseconds =
                                        canonicalPageSageRuntime
                                            .requestCompletedAtMilliseconds -
                                        canonicalPageSageRuntime
                                            .requestStartedAtMilliseconds;

                                pageRuntime.operation(
                                    "sage-initial-request",
                                    "response-received",
                                    {
                                        requestDurationMilliseconds:
                                            canonicalPageSageRuntime
                                                .requestDurationMilliseconds
                                    }
                                );

                                try {
                                    results =
                                        parseSagePageManifestResponse(
                                            response
                                        );
                                } catch (err) {
                                    reject(err);
                                    return;
                                }

                                var resultKeys =
                                    Object.keys(
                                        results
                                    );

                                canonicalPageSageRuntime
                                    .resultCount =
                                        resultKeys.length;

                                canonicalPageSageRuntime
                                    .expressionFailureCount =
                                        resultKeys.filter(
                                            function(key) {
                                                return !(
                                                    results[key] &&
                                                    results[key].ok
                                                );
                                            }
                                        ).length;

                                pageRuntime.component(
                                    "sage-initial",
                                    canonicalPageSageRuntime
                                        .expressionFailureCount > 0
                                        ? "results-degraded"
                                        : "results-available",
                                    {
                                        resultCount:
                                            canonicalPageSageRuntime
                                                .resultCount,
                                        expressionFailureCount:
                                            canonicalPageSageRuntime
                                                .expressionFailureCount,
                                        requestDurationMilliseconds:
                                            canonicalPageSageRuntime
                                                .requestDurationMilliseconds
                                    }
                                );

                                resolve({
                                    manifest:
                                        manifest,

                                    compiledCharacters:
                                        compiledCode.length,

                                    compiledUtf8Bytes:
                                        compiledUtf8Bytes,

                                    compiledDebugHash:
                                        canonicalPageSageRuntime
                                            .compiledDebugHash,

                                    results:
                                        results
                                });
                            },
                            function(err) {
                                canonicalPageSageRuntime
                                    .requestCompletedAtMilliseconds =
                                        Date.now();

                                canonicalPageSageRuntime
                                    .requestDurationMilliseconds =
                                        canonicalPageSageRuntime
                                            .requestCompletedAtMilliseconds -
                                        canonicalPageSageRuntime
                                            .requestStartedAtMilliseconds;

                                pageRuntime.operation(
                                    "sage-initial-request",
                                    "failed",
                                    {
                                        requestDurationMilliseconds:
                                            canonicalPageSageRuntime
                                                .requestDurationMilliseconds,
                                        errorName:
                                            err && err.ename
                                                ? err.ename
                                                : null
                                    }
                                );

                                reject(err);
                            }
                        );
                    }
                );
            }
        );

    canonicalPageSageRuntime.initialPromise =
        pending.then(
            function(execution) {
                canonicalPageSageRuntime.status =
                    "success";

                canonicalPageSageRuntime.lastError =
                    null;

                return execution;
            },
            function(err) {
                if (
                    err &&
                    err.xronosCanonicalInvariant
                ) {
                    canonicalPageSageRuntime.status =
                        "invariant-failure";
                } else {
                    canonicalPageSageRuntime.status =
                        "error";

                    canonicalPageSageRuntime.lastError =
                        canonicalPageSageSimpleError(
                            err
                        );
                }

                /*
                 * Network, authorization, and response parsing errors may be
                 * retried through the existing grouped Sage retry controls.
                 * Permanent eligibility failures remain cached separately.
                 */
                canonicalPageSageRuntime.initialPromise =
                    null;

                reportInitialCanonicalPageSageFailure(
                    err
                );

                throw err;
            }
        );

    return canonicalPageSageRuntime
        .initialPromise;
}



function canonicalPageSageGenerationInvariantFailure(
    generation,
    requestedCode,
    reason
) {
    if (generation) {
        generation.invariantFailures += 1;
        generation.lastInvariantFailure = reason;
    }

    return canonicalPageSageInvariantFailure(
        requestedCode,
        reason
    );
}


function canonicalPageSageCallMatchesEntry(
    traceEntry,
    entry
) {
    return !!(
        traceEntry &&
        entry &&
        traceEntry.expression ===
            entry.expression &&
        traceEntry.latexify ===
            entry.latexify
    );
}


function canonicalPageSageEntryByStableId(
    expressionEntries,
    stableId
) {
    var matches =
        expressionEntries.filter(
            function(entry) {
                return (
                    entry.stableId ===
                    stableId
                );
            }
        );

    return matches.length === 1
        ? matches[0]
        : null;
}


function canonicalPageSageUniqueMatchingEntry(
    expressionEntries,
    traceEntry
) {
    var matches =
        expressionEntries.filter(
            function(entry) {
                return (
                    canonicalPageSageCallMatchesEntry(
                        traceEntry,
                        entry
                    )
                );
            }
        );

    if (matches.length === 1) {
        return matches[0];
    }

    /*
     * Restoring a completed answer normally invokes its answer-key Sage
     * expression before the full page pass. When otherwise duplicated source
     * exists, prefer a uniquely identifiable answer-key entry.
     */
    var answerKeyMatches =
        matches.filter(
            function(entry) {
                return (
                    entry.consumer ===
                    "answer-key"
                );
            }
        );

    return answerKeyMatches.length === 1
        ? answerKeyMatches[0]
        : null;
}


function canonicalPageSageMapGenerationCall(
    generation,
    expressionEntries,
    traceEntry
) {
    var mappingKey =
        String(
            traceEntry.callIndex
        );

    var existingStableId =
        generation.callMappings[
            mappingKey
        ];

    if (existingStableId) {
        return {
            entry:
                canonicalPageSageEntryByStableId(
                    expressionEntries,
                    existingStableId
                ),

            reused:
                true,

            preliminary:
                false
        };
    }

    if (
        generation.fullPassComplete
    ) {
        return {
            entry:
                null,

            reason: {
                code:
                    "generation-after-full-pass",

                generationId:
                    generation.id,

                callIndex:
                    traceEntry.callIndex
            }
        };
    }

    var firstEntry =
        expressionEntries[0];

    var expectedEntry =
        generation.fullPassCursor <
            expressionEntries.length
            ? expressionEntries[
                generation.fullPassCursor
            ]
            : null;

    var entry = null;
    var preliminary = false;

    /*
     * Continue a currently matching full-manifest prefix.
     */
    if (
        expectedEntry &&
        canonicalPageSageCallMatchesEntry(
            traceEntry,
            expectedEntry
        )
    ) {
        entry = expectedEntry;

        generation.fullPassCursor += 1;
    } else if (
        firstEntry &&
        canonicalPageSageCallMatchesEntry(
            traceEntry,
            firstEntry
        )
    ) {
        /*
         * A restored completed equation can itself contain the first manifest
         * expression. When the actual complete page pass begins, another
         * occurrence of expression zero restarts the prefix safely.
         */
        if (
            generation.fullPassCursor > 0
        ) {
            generation.prefixRestartCount += 1;
        }

        entry = firstEntry;

        generation.fullPassCursor = 1;
    } else {
        /*
         * This is a preliminary restored-answer call or other isolated call
         * before the complete page sequence begins. Resolve it canonically
         * only when it identifies exactly one manifest result.
         */
        entry =
            canonicalPageSageUniqueMatchingEntry(
                expressionEntries,
                traceEntry
            );

        preliminary = true;

        generation.fullPassCursor = 0;

        if (entry) {
            generation
                .preliminaryMappedCalls += 1;
        }
    }

    if (!entry) {
        return {
            entry:
                null,

            reason: {
                code:
                    "generation-unmapped-call",

                generationId:
                    generation.id,

                callIndex:
                    traceEntry.callIndex,

                expression:
                    traceEntry.expression,

                latexify:
                    traceEntry.latexify,

                currentFullPassCursor:
                    generation.fullPassCursor
            }
        };
    }

    generation.callMappings[
        mappingKey
    ] = entry.stableId;

    if (
        generation.fullPassCursor ===
        expressionEntries.length
    ) {
        generation.fullPassComplete =
            true;
    }

    return {
        entry:
            entry,

        reused:
            false,

        preliminary:
            preliminary
    };
}


function canonicalPageSageResolveExecutionEntry(
    entry,
    execution,
    generation
) {
    var result =
        execution.results[
            entry.stableId
        ];

    if (!result) {
        canonicalPageSageRuntime
            .canonicalRejections += 1;

        if (generation) {
            generation
                .canonicalRejections += 1;
        }

        throw {
            ename:
                "XronosSageMissingCanonicalResult",

            evalue:
                "The canonical page response did not contain the expected expression result.",

            xronosSage: {
                stableId:
                    entry.stableId,

                expression:
                    entry.expression,

                consumer:
                    entry.consumer,

                problemId:
                    entry.problemId,

                compiledDebugHash:
                    execution
                        .compiledDebugHash,

                generationId:
                    generation
                        ? generation.id
                        : null,

                generationSeed:
                    generation
                        ? generation.seed
                        : null
            }
        };
    }

    if (!result.ok) {
        canonicalPageSageRuntime
            .canonicalRejections += 1;

        if (generation) {
            generation
                .canonicalRejections += 1;
        }

        throw canonicalPageSageEntryError(
            entry,
            result,
            execution
        );
    }

    canonicalPageSageRuntime
        .canonicalResolutions += 1;

    if (generation) {
        generation
            .canonicalResolutions += 1;
    }

    return String(
        result.result
    );
}


function executeCanonicalPageSageGeneration(
    generation
) {
    var manifest =
        initialSagePageManifestSnapshot;

    if (
        !generation ||
        generation !==
            canonicalPageSageActiveGeneration
    ) {
        return Promise.reject(
            canonicalPageSageInvariantError(
                "stale-generation",
                "The requested canonical Sage generation is no longer active."
            )
        );
    }

    if (
        generation
            .permanentFailureReason
    ) {
        return Promise.reject(
            generation
                .permanentFailureReason
        );
    }

    if (
        generation.requestPromise
    ) {
        return generation
            .requestPromise;
    }

    if (!manifest) {
        generation.permanentFailureReason =
            canonicalPageSageInvariantError(
                "missing-snapshot",
                "The pre-MathJax Sage manifest was not captured."
            );

        return Promise.reject(
            generation
                .permanentFailureReason
        );
    }

    var expressionEntries =
        canonicalPageSageExpressionEntries(
            manifest
        );

    if (
        expressionEntries.length === 0
    ) {
        generation.permanentFailureReason =
            canonicalPageSageInvariantError(
                "empty-manifest",
                "The Sage page manifest contains no expressions."
            );

        return Promise.reject(
            generation
                .permanentFailureReason
        );
    }

    var parseErrors =
        expressionEntries.filter(
            function(entry) {
                return !!entry.parseError;
            }
        );

    if (parseErrors.length > 0) {
        generation.permanentFailureReason =
            canonicalPageSageInvariantError(
                "manifest-parse-error",
                "The Sage page manifest contains an expression parse error.",
                {
                    entries:
                        parseErrors
                }
            );

        return Promise.reject(
            generation
                .permanentFailureReason
        );
    }

    var compiledCode =
        compileSagePageManifest(
            manifest
        );

    var compiledUtf8Bytes =
        sageUtf8ByteLength(
            compiledCode
        );

    generation.compiledCharacters =
        compiledCode.length;

    generation.compiledUtf8Bytes =
        compiledUtf8Bytes;

    generation.compiledDebugHash =
        sageManifestDebugHash(
            compiledCode
        );

    canonicalPageSageRuntime
        .compiledCharacters =
            generation
                .compiledCharacters;

    canonicalPageSageRuntime
        .compiledUtf8Bytes =
            generation
                .compiledUtf8Bytes;

    canonicalPageSageRuntime
        .compiledDebugHash =
            generation
                .compiledDebugHash;

    if (
        compiledUtf8Bytes >
        canonicalPageSageMaxCompiledUtf8Bytes
    ) {
        generation.permanentFailureReason =
            canonicalPageSageInvariantError(
                "compiled-size-limit",
                "The canonical Sage page program exceeds the configured request safety limit.",
                {
                    compiledUtf8Bytes:
                        compiledUtf8Bytes,

                    maximumUtf8Bytes:
                        canonicalPageSageMaxCompiledUtf8Bytes,

                    generationId:
                        generation.id,

                    generationSeed:
                        generation.seed
                }
            );

        return Promise.reject(
            generation
                .permanentFailureReason
        );
    }

    generation.status =
        "requesting";

    canonicalPageSageRuntime.status =
        "requesting";

    generation.requestCount += 1;

    canonicalPageSageRuntime
        .requestCount += 1;

    generation
        .requestStartedAtMilliseconds =
            Date.now();

    generation
        .requestCompletedAtMilliseconds =
            null;

    generation
        .requestDurationMilliseconds =
            null;

    canonicalPageSageRuntime
        .requestStartedAtMilliseconds =
            generation
                .requestStartedAtMilliseconds;

    canonicalPageSageRuntime
        .requestCompletedAtMilliseconds =
            null;

    canonicalPageSageRuntime
        .requestDurationMilliseconds =
            null;

    var pending =
        postSageRaw(
            compiledCode
        ).then(
            function(response) {
                var results;

                generation
                    .requestCompletedAtMilliseconds =
                        Date.now();

                generation
                    .requestDurationMilliseconds =
                        generation
                            .requestCompletedAtMilliseconds -
                        generation
                            .requestStartedAtMilliseconds;

                canonicalPageSageRuntime
                    .requestCompletedAtMilliseconds =
                        generation
                            .requestCompletedAtMilliseconds;

                canonicalPageSageRuntime
                    .requestDurationMilliseconds =
                        generation
                            .requestDurationMilliseconds;

                results =
                    parseSagePageManifestResponse(
                        response
                    );

                var resultKeys =
                    Object.keys(
                        results
                    );

                generation.resultCount =
                    resultKeys.length;

                generation
                    .expressionFailureCount =
                        resultKeys.filter(
                            function(key) {
                                return !(
                                    results[key] &&
                                    results[key].ok
                                );
                            }
                        ).length;

                canonicalPageSageRuntime
                    .resultCount =
                        generation
                            .resultCount;

                canonicalPageSageRuntime
                    .expressionFailureCount =
                        generation
                            .expressionFailureCount;

                return {
                    manifest:
                        manifest,

                    generationId:
                        generation.id,

                    generationSeed:
                        generation.seed,

                    compiledCharacters:
                        compiledCode.length,

                    compiledUtf8Bytes:
                        compiledUtf8Bytes,

                    compiledDebugHash:
                        generation
                            .compiledDebugHash,

                    results:
                        results
                };
            },
            function(err) {
                generation
                    .requestCompletedAtMilliseconds =
                        Date.now();

                generation
                    .requestDurationMilliseconds =
                        generation
                            .requestCompletedAtMilliseconds -
                        generation
                            .requestStartedAtMilliseconds;

                canonicalPageSageRuntime
                    .requestCompletedAtMilliseconds =
                        generation
                            .requestCompletedAtMilliseconds;

                canonicalPageSageRuntime
                    .requestDurationMilliseconds =
                        generation
                            .requestDurationMilliseconds;

                throw err;
            }
        );

    generation.requestPromise =
        pending.then(
            function(execution) {
                generation.requestSettled =
                    true;

                generation.status =
                    "success";

                generation.lastError =
                    null;

                maybeReleaseCanonicalPageSageAnother(
                    generation
                );

                canonicalPageSageRuntime.status =
                    "success";

                canonicalPageSageRuntime
                    .lastError =
                        null;

                return execution;
            },
            function(err) {
                generation.requestSettled =
                    true;

                maybeReleaseCanonicalPageSageAnother(
                    generation
                );

                if (
                    err &&
                    err.xronosCanonicalInvariant
                ) {
                    generation.status =
                        "invariant-failure";

                    canonicalPageSageRuntime.status =
                        "invariant-failure";
                } else {
                    generation.status =
                        "error";

                    generation.lastError =
                        canonicalPageSageSimpleError(
                            err
                        );

                    canonicalPageSageRuntime.status =
                        "error";

                    canonicalPageSageRuntime
                        .lastError =
                            generation
                                .lastError;
                }

                /*
                 * Network, authorization and response parsing errors remain
                 * retryable through the existing grouped Sage retry control.
                 */
                generation.requestPromise =
                    null;

                throw err;
            }
        );

    return generation.requestPromise;
}


function activateCanonicalPageSageGeneration(
    newSeed
) {
    var generation =
        canonicalPageSageActiveGeneration;

    if (
        !generation ||
        !canonicalPageSageSeedsEqual(
            generation.seed,
            newSeed
        )
    ) {
        return null;
    }

    generation.status =
        "waiting-for-calls";

    /*
     * Start immediately so restored answer keys and the complete reprocess
     * share the same in-flight page request.
     */
    executeCanonicalPageSageGeneration(
        generation
    ).catch(
        function() {
            /*
             * Individual Sage placeholders attach their own handlers. This
             * prevents a proactive request failure from becoming an unhandled
             * browser rejection before the first placeholder attaches.
             */
            return null;
        }
    );

    return generation;
}


/*
 * Describe how one live MathJax Sage call relates to the immutable initial
 * page manifest.
 *
 * This is passive runtime metadata. It does not choose the execution path or
 * change canonical resolution behavior.
 */
exports.describeMathJaxSageCall =
    function(traceEntry) {
        var manifest =
            initialSagePageManifestSnapshot;

        var expressionEntries =
            canonicalPageSageExpressionEntries(
                manifest
            );

        var callIndex =
            traceEntry &&
            typeof traceEntry.callIndex ===
                "number"
                ? traceEntry.callIndex
                : null;

        var entry =
            callIndex !== null &&
            callIndex >= 0 &&
            callIndex <
                expressionEntries.length
                ? expressionEntries[
                    callIndex
                ]
                : null;

        var matchesInitialEntry =
            !!(
                entry &&
                canonicalPageSageCallMatchesEntry(
                    traceEntry,
                    entry
                )
            );

        return {
            callIndex:
                callIndex,

            initialManifestCall:
                matchesInitialEntry,

            manifestExpressions:
                expressionEntries.length,

            stableId:
                matchesInitialEntry
                    ? entry.stableId
                    : null,

            consumer:
                matchesInitialEntry
                    ? entry.consumer
                    : null,

            problemId:
                matchesInitialEntry
                    ? entry.problemId
                    : null,

            latexify:
                traceEntry &&
                traceEntry.latexify !==
                    undefined
                    ? traceEntry.latexify
                    : null
        };
    };


/*
 * Resolve one MathJax Sage macro call.
 *
 * The initial full MathJax pass has a proven exact ordered mapping to the
 * immutable pre-MathJax manifest. Later replay and generation calls must map
 * deterministically to canonical manifest entries; unresolved calls are
 * treated as canonical invariant failures.
 */
exports.resolveMathJaxSageCall =
    function(traceEntry, requestedCode) {
        var manifest =
            initialSagePageManifestSnapshot;

        var expressionEntries =
            canonicalPageSageExpressionEntries(
                manifest
            );

        if (
            !traceEntry ||
            typeof traceEntry.callIndex !==
                "number"
        ) {
            return canonicalPageSageInvariantFailure(
                requestedCode,
                {
                    code:
                        "missing-trace-entry"
                }
            );
        }

        /*
         * Initial immutable page pass.
         */
        if (
            traceEntry.callIndex >= 0 &&
            traceEntry.callIndex <
                expressionEntries.length
        ) {
            var initialEntry =
                expressionEntries[
                    traceEntry.callIndex
                ];

            if (
                !canonicalPageSageCallMatchesEntry(
                    traceEntry,
                    initialEntry
                )
            ) {
                return canonicalPageSageInvariantFailure(
                    requestedCode,
                    {
                        code:
                            "manifest-call-mismatch",

                        callIndex:
                            traceEntry.callIndex,

                        expected:
                            initialEntry
                                ? {
                                    stableId:
                                        initialEntry.stableId,

                                    expression:
                                        initialEntry.expression,

                                    latexify:
                                        initialEntry.latexify
                                }
                                : null,

                        actual: {
                            expression:
                                traceEntry.expression,

                            latexify:
                                traceEntry.latexify
                        }
                    }
                );
            }

            canonicalPageSageRuntime
                .mappedCalls += 1;

            return executeInitialCanonicalPageSage()
                .then(
                    function(execution) {
                        return canonicalPageSageResolveExecutionEntry(
                            initialEntry,
                            execution,
                            null
                        );
                    },
                    function(err) {
                        if (
                            err &&
                            err.xronosCanonicalInvariant
                        ) {
                            return canonicalPageSageInvariantFailure(
                                requestedCode,
                                {
                                    code:
                                        err.invariantCode,

                                    message:
                                        err.evalue,

                                    details:
                                        err.details || null
                                }
                            );
                        }

                        canonicalPageSageRuntime
                            .canonicalRejections += 1;

                        throw err;
                    }
                );
        }

        /*
         * Completed-answer restoration and other MathJax replays can revisit
         * an expression after the immutable initial manifest pass has ended.
         *
         * Reuse the original page result bundle only when:
         *
         *   1. the initial canonical request already exists,
         *   2. no explicit Another generation is active, and
         *   3. expression plus latexify identifies exactly one immutable
         *      manifest entry.
         *
         * Ambiguous or unknown calls fall through to canonical invariant
         * handling below.
         */
        if (
            traceEntry.callIndex >=
                expressionEntries.length &&
            canonicalPageSageRuntime
                .initialPromise &&
            !canonicalPageSageRuntime
                .permanentFailureReason &&
            !canonicalPageSageActiveGeneration
        ) {
            var replayEntry =
                sageCanonicalReplayPolicy
                    .uniqueReplayEntry(
                        expressionEntries,
                        traceEntry
                    );

            if (replayEntry) {
                canonicalPageSageRuntime
                    .mappedCalls += 1;

                canonicalPageSageRuntime
                    .postInitialReplayMappedCalls += 1;

                return executeInitialCanonicalPageSage()
                    .then(
                        function(execution) {
                            return canonicalPageSageResolveExecutionEntry(
                                replayEntry,
                                execution,
                                null
                            );
                        },
                        function(err) {
                            if (
                                err &&
                                err.xronosCanonicalInvariant
                            ) {
                                return canonicalPageSageInvariantFailure(
                                    requestedCode,
                                    {
                                        code:
                                            err.invariantCode,

                                        message:
                                            err.evalue,

                                        details:
                                            err.details ||
                                            null,

                                        replay:
                                            true,

                                        callIndex:
                                            traceEntry.callIndex
                                    }
                                );
                            }

                            canonicalPageSageRuntime
                                .canonicalRejections += 1;

                            throw err;
                        }
                    );
            }
        }


        /*
         * Explicit Another generation. Calls before the complete manifest
         * pass—normally restored completed-answer keys—share the same
         * generation result bundle.
         */
        var generation =
            canonicalPageSageActiveGeneration;

        if (
            generation &&
            traceEntry.callIndex >=
                generation.startCallIndex
        ) {
            var mapping =
                canonicalPageSageMapGenerationCall(
                    generation,
                    expressionEntries,
                    traceEntry
                );

            if (!mapping.entry) {
                return canonicalPageSageTrackGenerationPromise(
                    generation,
                    canonicalPageSageGenerationInvariantFailure(
                        generation,
                        requestedCode,
                        mapping.reason
                    )
                );
            }

            generation.mappedCalls += 1;

            canonicalPageSageRuntime
                .mappedCalls += 1;

            var generationResolution =
                executeCanonicalPageSageGeneration(
                    generation
                ).then(
                    function(execution) {
                        return canonicalPageSageResolveExecutionEntry(
                            mapping.entry,
                            execution,
                            generation
                        );
                    },
                    function(err) {
                        if (
                            err &&
                            err.xronosCanonicalInvariant
                        ) {
                            return canonicalPageSageGenerationInvariantFailure(
                                generation,
                                requestedCode,
                                {
                                    code:
                                        err.invariantCode,

                                    message:
                                        err.evalue,

                                    details:
                                        err.details || null,

                                    generationId:
                                        generation.id,

                                    generationSeed:
                                        generation.seed
                                }
                            );
                        }

                        canonicalPageSageRuntime
                            .canonicalRejections += 1;

                        generation
                            .canonicalRejections += 1;

                        throw err;
                    }
                );

            return canonicalPageSageTrackGenerationPromise(
                generation,
                generationResolution
            );
        }

        return canonicalPageSageInvariantFailure(
            requestedCode,
            {
                code:
                    "outside-canonical-generation",

                callIndex:
                    traceEntry.callIndex,

                manifestExpressions:
                    expressionEntries.length
            }
        );
    };


window.xronosInspectCanonicalPageSageRuntime =
    function() {
        var manifest =
            initialSagePageManifestSnapshot;

        var expressionEntries =
            canonicalPageSageExpressionEntries(
                manifest
            );

        var result = {
            scope:
                "initial-pass-replays-and-explicit-another-generations",

            anotherBusy:
                canonicalPageSageAnotherBusy,

            ignoredAnotherClicks:
                canonicalPageSageIgnoredAnotherClicks,

            maximumCompiledUtf8Bytes:
                canonicalPageSageMaxCompiledUtf8Bytes,

            manifestExpressions:
                expressionEntries.length,

            answerKeys:
                expressionEntries.filter(
                    function(entry) {
                        return (
                            entry.consumer ===
                            "answer-key"
                        );
                    }
                ).length,

            status:
                canonicalPageSageRuntime.status,

            requestCount:
                canonicalPageSageRuntime
                    .requestCount,

            mappedCalls:
                canonicalPageSageRuntime
                    .mappedCalls,

            postInitialReplayMappedCalls:
                canonicalPageSageRuntime
                    .postInitialReplayMappedCalls,

            canonicalResolutions:
                canonicalPageSageRuntime
                    .canonicalResolutions,

            canonicalRejections:
                canonicalPageSageRuntime
                    .canonicalRejections,

            invariantFailures:
                canonicalPageSageRuntime
                    .invariantFailures,

            compiledCharacters:
                canonicalPageSageRuntime
                    .compiledCharacters,

            compiledUtf8Bytes:
                canonicalPageSageRuntime
                    .compiledUtf8Bytes,

            compiledDebugHash:
                canonicalPageSageRuntime
                    .compiledDebugHash,

            requestDurationMilliseconds:
                canonicalPageSageRuntime
                    .requestDurationMilliseconds,

            resultCount:
                canonicalPageSageRuntime
                    .resultCount,

            expressionFailureCount:
                canonicalPageSageRuntime
                    .expressionFailureCount,

            permanentFailure:
                canonicalPageSageRuntime
                    .permanentFailureReason
                    ? {
                        code:
                            canonicalPageSageRuntime
                                .permanentFailureReason
                                .invariantCode,

                        message:
                            canonicalPageSageRuntime
                                .permanentFailureReason
                                .evalue,

                        details:
                            canonicalPageSageRuntime
                                .permanentFailureReason
                                .details || null
                    }
                    : null,

            lastInvariantFailure:
                canonicalPageSageRuntime
                    .lastInvariantFailure,

            activeGeneration:
                canonicalPageSageActiveGeneration
                    ? {
                        id:
                            canonicalPageSageActiveGeneration.id,

                        seed:
                            canonicalPageSageActiveGeneration.seed,

                        startCallIndex:
                            canonicalPageSageActiveGeneration
                                .startCallIndex,

                        status:
                            canonicalPageSageActiveGeneration.status,

                        mathJaxPassComplete:
                            canonicalPageSageActiveGeneration
                                .mathJaxPassComplete,

                        requestSettled:
                            canonicalPageSageActiveGeneration
                                .requestSettled,

                        pendingCallPromises:
                            canonicalPageSageActiveGeneration
                                .pendingCallPromises,

                        settledCallPromises:
                            canonicalPageSageActiveGeneration
                                .settledCallPromises,

                        releaseScheduled:
                            canonicalPageSageActiveGeneration
                                .releaseScheduled,

                        released:
                            canonicalPageSageActiveGeneration
                                .released,

                        requestCount:
                            canonicalPageSageActiveGeneration
                                .requestCount,

                        mappedCalls:
                            canonicalPageSageActiveGeneration
                                .mappedCalls,

                        canonicalResolutions:
                            canonicalPageSageActiveGeneration
                                .canonicalResolutions,

                        canonicalRejections:
                            canonicalPageSageActiveGeneration
                                .canonicalRejections,

                        invariantFailures:
                            canonicalPageSageActiveGeneration
                                .invariantFailures,

                        fullPassCursor:
                            canonicalPageSageActiveGeneration
                                .fullPassCursor,

                        fullPassComplete:
                            canonicalPageSageActiveGeneration
                                .fullPassComplete,

                        prefixRestartCount:
                            canonicalPageSageActiveGeneration
                                .prefixRestartCount,

                        preliminaryMappedCalls:
                            canonicalPageSageActiveGeneration
                                .preliminaryMappedCalls,

                        compiledCharacters:
                            canonicalPageSageActiveGeneration
                                .compiledCharacters,

                        compiledUtf8Bytes:
                            canonicalPageSageActiveGeneration
                                .compiledUtf8Bytes,

                        compiledDebugHash:
                            canonicalPageSageActiveGeneration
                                .compiledDebugHash,

                        requestDurationMilliseconds:
                            canonicalPageSageActiveGeneration
                                .requestDurationMilliseconds,

                        resultCount:
                            canonicalPageSageActiveGeneration
                                .resultCount,

                        expressionFailureCount:
                            canonicalPageSageActiveGeneration
                                .expressionFailureCount,

                        permanentFailure:
                            canonicalPageSageActiveGeneration
                                .permanentFailureReason
                                ? {
                                    code:
                                        canonicalPageSageActiveGeneration
                                            .permanentFailureReason
                                            .invariantCode,

                                    message:
                                        canonicalPageSageActiveGeneration
                                            .permanentFailureReason
                                            .evalue,

                                    details:
                                        canonicalPageSageActiveGeneration
                                            .permanentFailureReason
                                            .details || null
                                }
                                : null,

                        lastInvariantFailure:
                            canonicalPageSageActiveGeneration
                                .lastInvariantFailure,

                        lastError:
                            canonicalPageSageActiveGeneration
                                .lastError
                    }
                    : null,

            lastError:
                canonicalPageSageRuntime
                    .lastError
        };

        console.log(result);

        return result;
    };



function externalSageManifestSeedCode(manifest) {
    var page =
        manifest && manifest.page
            ? manifest.page
            : {};

    var activityPath =
        page.path || "";

    var repositoryName =
        page.repository || "";

    var scoped =
        String(
            page.scopedSageBaseSeeds ||
            ""
        ) === "true";

    if (scoped) {
        var randomizationScope =
            page.randomizationScope ||
            (
                "public:" +
                repositoryName
            );

        var xoursePath =
            page.xoursePath || "";

        var seedKey = [
            randomizationScope,
            repositoryName,
            xoursePath,
            activityPath,
            "base"
        ].join("/");

        return {
            mode:
                "scoped-base",

            code:
                "xronos_seed_key=" +
                JSON.stringify(seedKey) +
                "\n" +
                "import hashlib\n" +
                "set_random_seed(int(" +
                "hashlib.sha256(" +
                "xronos_seed_key.encode('utf-8')" +
                ").hexdigest(), 16))"
        };
    }

    var currentFileBase =
        activityPath
            .split("/")
            .slice(-1)[0];

    return {
        mode:
            "legacy-base",

        code:
            "jobname=" +
            JSON.stringify(
                currentFileBase
            ) +
            "\n" +
            "import hashlib\n" +
            "set_random_seed(int(" +
            "hashlib.sha256(" +
            "jobname.encode('utf-8')" +
            ").hexdigest(), 16))"
    };
}


function measureExternalSageManifest(
    manifest
) {
    if (
        !manifest ||
        !Array.isArray(
            manifest.entries
        )
    ) {
        throw new Error(
            "The selected JSON does not contain a Sage manifest entries array."
        );
    }

    var seedInfo =
        externalSageManifestSeedCode(
            manifest
        );

    var previousSeedCode =
        currentSeedCode;

    var compiledCode;

    try {
        /*
         * Compilation is synchronous. Temporarily substitute the captured
         * page's seed source, then restore the active development page state.
         */
        currentSeedCode =
            seedInfo.code;

        compiledCode =
            compileSagePageManifest(
                manifest
            );
    } finally {
        currentSeedCode =
            previousSeedCode;
    }

    var compiledUtf8Bytes =
        sageUtf8ByteLength(
            compiledCode
        );

    var expressionEntries =
        manifest.entries.filter(
            function(entry) {
                return (
                    entry.kind ===
                    "expression"
                );
            }
        );

    return {
        page:
            manifest.page ||
            null,

        capturedSummary:
            manifest.summary ||
            null,

        compilerVersion:
            sagePageManifestCompilerVersion,

        seedMode:
            seedInfo.mode,

        seedCharacters:
            seedInfo.code.length,

        expressions:
            expressionEntries.length,

        answerKeys:
            expressionEntries.filter(
                function(entry) {
                    return (
                        entry.consumer ===
                        "answer-key"
                    );
                }
            ).length,

        compiledCharacters:
            compiledCode.length,

        compiledUtf8Bytes:
            compiledUtf8Bytes,

        compiledDebugHash:
            sageManifestDebugHash(
                compiledCode
            ),

        requestSafetyLimitUtf8Bytes:
            canonicalPageSageMaxCompiledUtf8Bytes,

        exceedsTemporaryLiveLimit:
            compiledUtf8Bytes >
            canonicalPageSageMaxCompiledUtf8Bytes,

        /*
         * No request is submitted. This inspector only compiles and measures.
         */
        executed:
            false
    };
}


window.xronosMeasureExternalSageManifest =
    function(manifest) {
        var result =
            measureExternalSageManifest(
                manifest
            );

        console.log(result);

        return result;
    };


window.xronosMeasureExternalSageManifestFile =
    function() {
        return new Promise(
            function(resolve, reject) {
                var input =
                    document.createElement(
                        "input"
                    );

                input.type =
                    "file";

                input.accept =
                    "application/json,.json";

                input.style.display =
                    "none";

                input.addEventListener(
                    "change",
                    function() {
                        var file =
                            input.files &&
                            input.files[0];

                        if (!file) {
                            input.remove();

                            reject(
                                new Error(
                                    "No manifest file was selected."
                                )
                            );

                            return;
                        }

                        var reader =
                            new FileReader();

                        reader.addEventListener(
                            "load",
                            function() {
                                try {
                                    var manifest =
                                        JSON.parse(
                                            reader.result
                                        );

                                    var result =
                                        measureExternalSageManifest(
                                            manifest
                                        );

                                    result.fileName =
                                        file.name;

                                    console.log(
                                        result
                                    );

                                    resolve(
                                        result
                                    );
                                } catch (err) {
                                    reject(err);
                                } finally {
                                    input.remove();
                                }
                            }
                        );

                        reader.addEventListener(
                            "error",
                            function() {
                                input.remove();

                                reject(
                                    reader.error ||
                                    new Error(
                                        "The manifest file could not be read."
                                    )
                                );
                            }
                        );

                        reader.readAsText(
                            file
                        );
                    }
                );

                document.body.appendChild(
                    input
                );

                input.click();
            }
        );
    };



function sagePreviewErrorSummary(err) {
    var wrapper = err || {};
    var cause =
        wrapper.xronosFixtureCause ||
        wrapper;

    var parsed =
        parseSageCellError(cause) ||
        cause ||
        {};

    var responseText =
        cause &&
        cause.responseText !== undefined
            ? String(cause.responseText)
            : "";

    return {
        fixturePhase:
            wrapper.xronosFixturePhase ||
            null,

        ename:
            parsed.ename ||
            (cause && cause.ename) ||
            (cause && cause.name) ||
            "",

        evalue:
            parsed.evalue ||
            (cause && cause.evalue) ||
            (cause && cause.message) ||
            responseText ||
            String(cause),

        status:
            cause && cause.status
                ? String(cause.status)
                : "",

        httpStatus:
            sageErrorHttpStatus(cause),

        success:
            cause &&
            cause.success !== undefined
                ? cause.success
                : null,

        executeReply:
            cause &&
            cause.execute_reply !== undefined
                ? cause.execute_reply
                : null,

        stdout:
            cause &&
            cause.stdout !== undefined
                ? cause.stdout
                : null,

        stderr:
            cause &&
            cause.stderr !== undefined
                ? cause.stderr
                : null,

        responseText:
            responseText,

        parseError:
            cause && cause.parseError
                ? String(cause.parseError)
                : null,

        objectKeys:
            cause &&
            typeof cause === "object"
                ? Object.keys(cause)
                : [],

        compiledDebugHash:
            wrapper.xronosCompiledCode
                ? sageManifestDebugHash(
                    wrapper.xronosCompiledCode
                )
                : null,

        compiledCode:
            wrapper.xronosCompiledCode ||
            null
    };
}


/*
 * Validate ordered execution and error isolation using small synthetic
 * manifests submitted through the real authenticated SageCell proxy.
 */
window.xronosTestSagePageCompilerFixtures =
    function() {
        var orderedManifest = {
            entries: [
                {
                    kind: "sagesilent",
                    code: "x = 1"
                },
                {
                    kind: "expression",
                    stableId:
                        "ordered-0001",
                    expression: "x",
                    latexify: false
                },
                {
                    kind: "sagesilent",
                    code: "x = 2"
                },
                {
                    kind: "expression",
                    stableId:
                        "ordered-0002",
                    expression: "x",
                    latexify: false
                }
            ]
        };

        var errorManifest = {
            entries: [
                {
                    kind: "sagesilent",
                    code: "fixture_value = 5"
                },
                {
                    kind: "expression",
                    stableId:
                        "error-0001",
                    expression:
                        "__xronos_missing_fixture_value__",
                    latexify: false
                },
                {
                    kind: "expression",
                    stableId:
                        "error-0002",
                    expression:
                        "fixture_value",
                    latexify: false
                },
                {
                    kind: "sagesilent",
                    code:
                        "raise ValueError(" +
                        "'intentional fixture setup failure'" +
                        ")"
                },
                {
                    kind: "expression",
                    stableId:
                        "error-0003",
                    expression:
                        "fixture_value",
                    latexify: false
                }
            ]
        };

        /*
         * Run these sequentially. Besides making the fixture easier to
         * diagnose, this avoids allowing two synthetic requests to race
         * through an expired page-authorization refresh.
         */
        return executeSagePageManifestPreview(
            orderedManifest
        ).then(
            function(orderedExecution) {
                return executeSagePageManifestPreview(
                    errorManifest
                ).then(
                    function(errorExecution) {
                        return [
                            orderedExecution,
                            errorExecution
                        ];
                    },
                    function(err) {
                        throw {
                            xronosFixturePhase:
                                "error-isolation",
                            xronosCompiledCode:
                                compileSagePageManifest(
                                    errorManifest
                                ),
                            xronosFixtureCause:
                                err
                        };
                    }
                );
            },
            function(err) {
                throw {
                    xronosFixturePhase:
                        "ordered-execution",
                    xronosCompiledCode:
                        compileSagePageManifest(
                            orderedManifest
                        ),
                    xronosFixtureCause:
                        err
                };
            }
        ).then(
            function(executions) {
                var ordered =
                    executions[0].results;

                var errors =
                    executions[1].results;

                var orderedPassed =
                    ordered["ordered-0001"] &&
                    ordered["ordered-0001"].ok &&
                    String(
                        ordered["ordered-0001"]
                            .result
                    ) === "1" &&
                    ordered["ordered-0002"] &&
                    ordered["ordered-0002"].ok &&
                    String(
                        ordered["ordered-0002"]
                            .result
                    ) === "2";

                var expressionFailureIsolated =
                    errors["error-0001"] &&
                    !errors["error-0001"].ok &&
                    errors["error-0001"]
                        .errorType ===
                        "expression" &&
                    errors["error-0002"] &&
                    errors["error-0002"].ok &&
                    String(
                        errors["error-0002"]
                            .result
                    ) === "5";

                var setupFailurePropagated =
                    errors["error-0003"] &&
                    !errors["error-0003"].ok &&
                    errors["error-0003"]
                        .errorType ===
                        "setup";

                var result = {
                    summary: {
                        orderedExecution:
                            orderedPassed,
                        expressionFailureIsolated:
                            expressionFailureIsolated,
                        setupFailurePropagated:
                            setupFailurePropagated,
                        allPassed:
                            orderedPassed &&
                            expressionFailureIsolated &&
                            setupFailurePropagated
                    },

                    orderedResults:
                        ordered,

                    errorResults:
                        errors,

                    compiled: {
                        orderedCharacters:
                            executions[0]
                                .compiledCharacters,
                        orderedDebugHash:
                            executions[0]
                                .compiledDebugHash,
                        errorCharacters:
                            executions[1]
                                .compiledCharacters,
                        errorDebugHash:
                            executions[1]
                                .compiledDebugHash
                    }
                };

                /*
                 * Emit one copyable final object.
                 */
                console.log(result);

                return result;
            },
            function(err) {
                var failure = {
                    executionError:
                        sagePreviewErrorSummary(
                            err
                        )
                };

                console.log(failure);

                return failure;
            }
        );
    };



var sageMathJaxCallTrace = [];


function sageTraceObjectKeys(value) {
    if (
        !value ||
        (
            typeof value !== "object" &&
            typeof value !== "function"
        )
    ) {
        return [];
    }

    try {
        return Object.keys(value).sort();
    } catch (err) {
        return [];
    }
}


function sageTraceNodeSummary(value) {
    if (!value) {
        return null;
    }

    if (value.nodeType === 1) {
        return {
            nodeName:
                value.nodeName || "",
            id:
                value.id || "",
            type:
                value.getAttribute
                    ? value.getAttribute("type") || ""
                    : "",
            className:
                typeof value.className === "string"
                    ? value.className
                    : ""
        };
    }

    return null;
}


/*
 * Called by the MathJax TeX macro handler whenever it encounters a live
 * \sage or \sagestr expression.
 *
 * The returned trace entry also provides the verified initial-pass index
 * used by the browser-local canonical page feature gate.
 */
exports.traceMathJaxSageCall =
    function(rawExpression, latexify, parser) {
        var stack =
            parser && parser.stack
                ? parser.stack
                : null;

        var env =
            stack && stack.env
                ? stack.env
                : null;

        var globalState =
            stack && stack.global
                ? stack.global
                : null;

        var script =
            env && env.script
                ? env.script
                : null;

        var traceEntry = {
            callIndex:
                sageMathJaxCallTrace.length,

            expression:
                rawExpression,

            latexify:
                !!latexify,

            requestedCode:
                latexify
                    ? "latex(" +
                      rawExpression +
                      ")"
                    : rawExpression,

            parserSource:
                parser &&
                typeof parser.string ===
                    "string"
                    ? parser.string
                    : null,

            parserIndex:
                parser &&
                typeof parser.i ===
                    "number"
                    ? parser.i
                    : null,

            script:
                sageTraceNodeSummary(
                    script
                ),

            scriptId:
                script && script.id
                    ? script.id
                    : null,

            parserKeys:
                sageTraceObjectKeys(
                    parser
                ),

            stackKeys:
                sageTraceObjectKeys(
                    stack
                ),

            environmentKeys:
                sageTraceObjectKeys(
                    env
                ),

            globalKeys:
                sageTraceObjectKeys(
                    globalState
                ),

            environmentDisplay:
                env &&
                env.display !== undefined
                    ? env.display
                    : null
        };

        sageMathJaxCallTrace.push(
            traceEntry
        );

        return traceEntry;
    };


window.xronosClearSageMathJaxCallTrace =
    function() {
        sageMathJaxCallTrace = [];

        var result = {
            cleared: true,
            calls: 0
        };

        console.log(result);

        return result;
    };



window.xronosInspectSageMathJaxParserSources =
    function() {
        var activity =
            document.querySelector(
                "main.activity"
            ) ||
            document.body;

        var currentMathScripts =
            Array.prototype.slice.call(
                activity.querySelectorAll(
                    'script[type^="math/tex"]'
                )
            );

        var calls =
            sageMathJaxCallTrace.map(
                function(entry) {
                    var matchingScripts =
                        currentMathScripts.filter(
                            function(script) {
                                return (
                                    (
                                        script.textContent ||
                                        ""
                                    ) ===
                                    entry.parserSource
                                );
                            }
                        );

                    return {
                        callIndex:
                            entry.callIndex,

                        expression:
                            entry.expression,

                        latexify:
                            entry.latexify,

                        parserIndex:
                            entry.parserIndex,

                        parserSource:
                            entry.parserSource,

                        parserSourceCharacters:
                            entry.parserSource
                                ? entry.parserSource.length
                                : 0,

                        extractedExpressions:
                            entry.parserSource
                                ? extractSageExpressionsFromTex(
                                    entry.parserSource
                                ).map(
                                    function(expression) {
                                        return {
                                            expression:
                                                expression.expression,
                                            latexify:
                                                expression.latexify,
                                            consumer:
                                                expression.consumer,
                                            sourceStartIndex:
                                                expression
                                                    .sourceStartIndex,
                                            sourceEndIndex:
                                                expression
                                                    .sourceEndIndex
                                        };
                                    }
                                )
                                : [],

                        currentDomMatches:
                            matchingScripts.map(
                                function(script) {
                                    return {
                                        id:
                                            script.id || "",
                                        type:
                                            script.getAttribute(
                                                "type"
                                            ) || ""
                                    };
                                }
                            )
                    };
                }
            );

        var callsWithParserSource =
            calls.filter(
                function(call) {
                    return (
                        typeof call.parserSource ===
                        "string"
                    );
                }
            ).length;

        var callsStillInCurrentDom =
            calls.filter(
                function(call) {
                    return (
                        call.currentDomMatches
                            .length > 0
                    );
                }
            ).length;

        var missingFromCurrentDom =
            calls.filter(
                function(call) {
                    return (
                        call.currentDomMatches
                            .length === 0
                    );
                }
            );

        var distinctSources = {};

        calls.forEach(
            function(call) {
                if (
                    typeof call.parserSource ===
                    "string"
                ) {
                    distinctSources[
                        call.parserSource
                    ] = true;
                }
            }
        );

        var result = {
            page: {
                url:
                    window.location.href,
                repository:
                    activity.getAttribute(
                        "data-repository-name"
                    ),
                path:
                    activity.getAttribute(
                        "data-path"
                    ),
                commit:
                    activity.getAttribute(
                        "data-commit"
                    ),
                hash:
                    activity.getAttribute(
                        "data-hash"
                    )
            },

            summary: {
                tracedCalls:
                    calls.length,

                callsWithParserSource:
                    callsWithParserSource,

                allCallsHaveParserSource:
                    calls.length > 0 &&
                    callsWithParserSource ===
                        calls.length,

                distinctParserSources:
                    Object.keys(
                        distinctSources
                    ).length,

                callsStillInCurrentDom:
                    callsStillInCurrentDom,

                callsMissingFromCurrentDom:
                    missingFromCurrentDom.length
            },

            missingFromCurrentDom:
                missingFromCurrentDom,

            calls:
                calls
        };

        /*
         * Emit one copyable object.
         */
        console.log(result);

        return result;
    };


window.xronosInspectSageMathJaxCallTrace =
    function() {
        var manifest =
            buildSagePageManifestProbe();

        var expected =
            manifest.entries.filter(
                function(entry) {
                    return (
                        entry.kind ===
                        "expression"
                    );
                }
            );

        var actual =
            sageMathJaxCallTrace.slice();

        var comparisonCount =
            Math.max(
                expected.length,
                actual.length
            );

        var comparisons = [];
        var firstMismatch = null;
        var index;

        for (
            index = 0;
            index < comparisonCount;
            index += 1
        ) {
            var expectedEntry =
                expected[index] || null;

            var actualEntry =
                actual[index] || null;

            var expressionMatches =
                !!expectedEntry &&
                !!actualEntry &&
                expectedEntry.expression ===
                    actualEntry.expression;

            var latexifyMatches =
                !!expectedEntry &&
                !!actualEntry &&
                expectedEntry.latexify ===
                    actualEntry.latexify;

            var scriptIdMatches =
                !!expectedEntry &&
                !!actualEntry &&
                expectedEntry.scriptId ===
                    actualEntry.scriptId;

            var matches =
                expressionMatches &&
                latexifyMatches &&
                scriptIdMatches;

            var comparison = {
                index:
                    index,

                expected:
                    expectedEntry
                        ? {
                            stableId:
                                expectedEntry.stableId,
                            expression:
                                expectedEntry.expression,
                            latexify:
                                expectedEntry.latexify,
                            scriptId:
                                expectedEntry.scriptId,
                            scriptExpressionIndex:
                                expectedEntry
                                    .scriptExpressionIndex
                        }
                        : null,

                actual:
                    actualEntry
                        ? {
                            expression:
                                actualEntry.expression,
                            latexify:
                                actualEntry.latexify,
                            scriptId:
                                actualEntry.scriptId
                        }
                        : null,

                expressionMatches:
                    expressionMatches,

                latexifyMatches:
                    latexifyMatches,

                scriptIdMatches:
                    scriptIdMatches,

                matches:
                    matches
            };

            comparisons.push(
                comparison
            );

            if (
                !matches &&
                firstMismatch === null
            ) {
                firstMismatch =
                    comparison;
            }
        }

        var callsWithScriptId =
            actual.filter(
                function(entry) {
                    return !!entry.scriptId;
                }
            ).length;

        var result = {
            page:
                manifest.page,

            summary: {
                manifestExpressions:
                    expected.length,

                tracedCalls:
                    actual.length,

                callsWithScriptId:
                    callsWithScriptId,

                allCallsHaveScriptId:
                    actual.length > 0 &&
                    callsWithScriptId ===
                        actual.length,

                exactOrderedMapping:
                    expected.length ===
                        actual.length &&
                    firstMismatch === null
            },

            firstMismatch:
                firstMismatch,

            firstCallContext:
                actual.length > 0
                    ? actual[0]
                    : null,

            comparisons:
                comparisons,

            calls:
                actual
        };

        console.log(result);

        return result;
    };



function freezeSageManifestSnapshot(value) {
    var key;

    if (
        !value ||
        typeof value !== "object"
    ) {
        return value;
    }

    if (Object.freeze) {
        Object.freeze(value);
    }

    Object.keys(value).forEach(
        function(key) {
            freezeSageManifestSnapshot(
                value[key]
            );
        }
    );

    return value;
}


function captureInitialSagePageManifestSnapshot() {
    var manifest;
    var snapshot;

    if (
        initialSagePageManifestSnapshot !==
        null
    ) {
        return initialSagePageManifestSnapshot;
    }

    manifest =
        buildSagePageManifestProbe(
            null,
            {
                preMathJax: true
            }
        );

    /*
     * Clone the manifest so no later DOM work or debugging mutation can
     * alter the canonical pre-MathJax source snapshot.
     */
    snapshot =
        JSON.parse(
            JSON.stringify(manifest)
        );

    snapshot.snapshotPhase =
        "pre-mathjax";

    snapshot.sourceMode =
        "pre-mathjax-source-nodes";

    initialSagePageManifestSnapshot =
        freezeSageManifestSnapshot(
            snapshot
        );

    var initialExpressionEntries =
        canonicalPageSageExpressionEntries(
            initialSagePageManifestSnapshot
        );

    pageRuntime.component(
        "sage-initial",
        initialExpressionEntries.length > 0
            ? "discovered"
            : "not-required",
        {
            expressions:
                initialExpressionEntries.length,
            answerKeys:
                initialExpressionEntries.filter(
                    function(entry) {
                        return (
                            entry.consumer ===
                            "answer-key"
                        );
                    }
                ).length,
            silentBlocks:
                initialSagePageManifestSnapshot &&
                initialSagePageManifestSnapshot
                    .summary
                    ? initialSagePageManifestSnapshot
                        .summary.silentBlocks
                    : null
        }
    );

    return initialSagePageManifestSnapshot;
}


function preferredSagePageManifestProbe() {
    return (
        initialSagePageManifestSnapshot ||
        buildSagePageManifestProbe()
    );
}


exports.captureInitialSagePageManifestSnapshot =
    captureInitialSagePageManifestSnapshot;


exports.getInitialSagePageManifestSnapshot =
    function() {
        return initialSagePageManifestSnapshot;
    };


window.xronosInspectInitialSagePageManifest =
    function() {
        var result =
            initialSagePageManifestSnapshot;

        if (!result) {
            result = {
                error:
                    "Initial Sage manifest snapshot was not captured."
            };
        }

        console.log(result);

        return result;
    };


window.xronosCompareInitialSageSnapshotToMathJaxTrace =
    function() {
        var manifest =
            initialSagePageManifestSnapshot;

        if (!manifest) {
            var missing = {
                error:
                    "Initial Sage manifest snapshot was not captured."
            };

            console.log(missing);

            return missing;
        }

        var expected =
            manifest.entries.filter(
                function(entry) {
                    return (
                        entry.kind ===
                        "expression"
                    );
                }
            );

        var actual =
            sageMathJaxCallTrace.slice();

        var comparisonCount =
            Math.max(
                expected.length,
                actual.length
            );

        var firstMismatch = null;
        var comparisons = [];
        var index;

        for (
            index = 0;
            index < comparisonCount;
            index += 1
        ) {
            var expectedEntry =
                expected[index] || null;

            var actualEntry =
                actual[index] || null;

            var expressionMatches =
                !!expectedEntry &&
                !!actualEntry &&
                expectedEntry.expression ===
                    actualEntry.expression;

            var latexifyMatches =
                !!expectedEntry &&
                !!actualEntry &&
                expectedEntry.latexify ===
                    actualEntry.latexify;

            var matches =
                expressionMatches &&
                latexifyMatches;

            var comparison = {
                index:
                    index,

                expected:
                    expectedEntry
                        ? {
                            stableId:
                                expectedEntry.stableId,
                            expression:
                                expectedEntry.expression,
                            latexify:
                                expectedEntry.latexify,
                            consumer:
                                expectedEntry.consumer,
                            problemId:
                                expectedEntry.problemId,
                            problemDepth:
                                expectedEntry.problemDepth
                        }
                        : null,

                actual:
                    actualEntry
                        ? {
                            expression:
                                actualEntry.expression,
                            latexify:
                                actualEntry.latexify,
                            parserSource:
                                actualEntry.parserSource,
                            parserIndex:
                                actualEntry.parserIndex
                        }
                        : null,

                expressionMatches:
                    expressionMatches,

                latexifyMatches:
                    latexifyMatches,

                matches:
                    matches
            };

            comparisons.push(
                comparison
            );

            if (
                !matches &&
                firstMismatch === null
            ) {
                firstMismatch =
                    comparison;
            }
        }

        var answerKeyCount =
            expected.filter(
                function(entry) {
                    return (
                        entry.consumer ===
                        "answer-key"
                    );
                }
            ).length;

        var nestedExpressionCount =
            expected.filter(
                function(entry) {
                    return (
                        entry.problemDepth !== null &&
                        entry.problemDepth > 0
                    );
                }
            ).length;

        var result = {
            page:
                manifest.page,

            summary: {
                snapshotPhase:
                    manifest.snapshotPhase,

                manifestExpressions:
                    expected.length,

                tracedCalls:
                    actual.length,

                answerKeys:
                    answerKeyCount,

                nestedExpressions:
                    nestedExpressionCount,

                exactOrderedMapping:
                    expected.length ===
                        actual.length &&
                    firstMismatch === null
            },

            firstMismatch:
                firstMismatch,

            answerKeys:
                expected.filter(
                    function(entry) {
                        return (
                            entry.consumer ===
                            "answer-key"
                        );
                    }
                ),

            comparisons:
                comparisons
        };

        console.log(result);

        return result;
    };


window.xronosTestLegacyMathTexManifestCapture =
    function() {
        var root =
            document.createElement(
                "main"
            );

        root.className =
            "activity";

        root.setAttribute(
            "data-repository-name",
            "fixture-repository"
        );

        root.setAttribute(
            "data-path",
            "fixture/legacy-math-tex"
        );

        root.setAttribute(
            "data-commit",
            "fixture-commit"
        );

        root.setAttribute(
            "data-hash",
            "fixture-hash"
        );

        root.innerHTML =
            '<script type="text/sagemath">' +
            'a = 2' +
            '<\/script>' +

            '<div class="problem-environment" ' +
            'id="legacy-problem">' +
            '<script type="math/tex; mode=display">' +
            '\\sage {a} = ' +
            '\\answer [validator=factorCheck]' +
            '{\\sage {a+1}}' +
            '<\/script>' +
            '</div>' +

            '<div class="mathjax-inline">' +
            '\\sage {a+2}' +
            '</div>' +

            /*
             * The nested script must not be counted separately from its
             * containing raw wrapper.
             */
            '<div class="mathjax-block">' +
            '<script type="math/tex; mode=display">' +
            '\\sage {a+3}' +
            '<\/script>' +
            '</div>';

        var manifest =
            buildSagePageManifestProbe(
                root,
                {
                    preMathJax:
                        true
                }
            );

        var expressions =
            manifest.entries.filter(
                function(entry) {
                    return (
                        entry.kind ===
                        "expression"
                    );
                }
            );

        var expressionValues =
            expressions.map(
                function(entry) {
                    return entry.expression;
                }
            );

        var answerKeys =
            expressions.filter(
                function(entry) {
                    return (
                        entry.consumer ===
                        "answer-key"
                    );
                }
            );

        var expectedExpressions = [
            "a",
            "a+1",
            "a+2",
            "a+3"
        ];

        var exactExpressionSequence =
            JSON.stringify(
                expressionValues
            ) ===
            JSON.stringify(
                expectedExpressions
            );

        var result = {
            compilerVersion:
                sagePageManifestCompilerVersion,

            silentBlocks:
                manifest.summary
                    .silentBlocks,

            expressions:
                manifest.summary
                    .expressions,

            answerKeys:
                manifest.summary
                    .answerKeys,

            expressionValues:
                expressionValues,

            exactExpressionSequence:
                exactExpressionSequence,

            passed:
                manifest.summary
                    .silentBlocks === 1 &&
                manifest.summary
                    .expressions === 4 &&
                manifest.summary
                    .answerKeys === 1 &&
                exactExpressionSequence &&
                answerKeys.length === 1 &&
                answerKeys[0].expression ===
                    "a+1"
        };

        console.log(result);

        return result;
    };



exports.inspectPageSageManifest =
    buildSagePageManifestProbe;

window.xronosInspectSagePageManifest =
    function() {
        var result =
            buildSagePageManifestProbe();

        /*
         * Deliberately emit one object so it can be copied from Chrome with
         * the console's "Copy object" command.
         */
        console.log(result);

        return result;
    };




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

var legacyBaseSeedCode = function() {
    var activityPath = $('main.activity').attr('data-path');
    var currfilebase = activityPath.split('/').slice(-1)[0];

    var code = 'jobname="' + currfilebase + '"' + "\n";
    code = code + "import hashlib\n";
    code = code + "set_random_seed(int(hashlib.sha256(jobname.encode('utf-8')).hexdigest(), 16))";
    return code;
};

var scopedSageBaseSeedsEnabled = function() {
    return $('main.activity').first().attr('data-scoped-sage-base-seeds') === 'true';
};

var sageSeedKey = function(newSeed) {
    var activity = $('main.activity').first();
    var randomizationScope = activity.attr('data-randomization-scope');
    var repositoryName = activity.attr('data-repository-name') || '';
    var xoursePath = activity.attr('data-xourse-path') || '';
    var activityPath = activity.attr('data-path') || '';
    var seedVersion = newSeed !== undefined ? String(newSeed) : 'base';

    if (!randomizationScope) {
randomizationScope = 'public:' + repositoryName;
    }

    return [
randomizationScope,
repositoryName,
xoursePath,
activityPath,
seedVersion
    ].join('/');
};

var scopedSeedCode = function(newSeed) {
    var seedKey = sageSeedKey(newSeed);
    var code = 'xronos_seed_key=' + JSON.stringify(seedKey) + "\n";
    code = code + "import hashlib\n";
    code = code + "set_random_seed(int(hashlib.sha256(xronos_seed_key.encode('utf-8')).hexdigest(), 16))";
    return code;
};

var sendSeed = function(newSeed) {
    if ((seed == newSeed) && (seed !== null)) {
return;
    }

    seed = newSeed;
    currentSeedCode = "";

    if ($('main.activity').length > 0) {
if (newSeed !== undefined || scopedSageBaseSeedsEnabled()) {
    currentSeedCode = scopedSeedCode(newSeed);
} else {
    currentSeedCode = legacyBaseSeedCode();
}

return;
    }

    if (newSeed !== undefined) {
currentSeedCode = "set_random_seed(" + newSeed + ")";
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

    var isPendingAnother =
        canonicalPageSagePendingAnotherSeed !==
            null &&
        canonicalPageSageSeedsEqual(
            canonicalPageSagePendingAnotherSeed,
            newSeed
        );

    sendSeed(newSeed);

    var activatedCanonicalGeneration =
        null;

    if (isPendingAnother) {
        activatedCanonicalGeneration =
            activateCanonicalPageSageGeneration(
                newSeed
            );
    }

    /*
     * Queue restoration only after the new canonical generation has started.
     * These MathJax Text operations therefore consume the same result bundle
     * as the complete page reprocess queued below.
     */
    if (isPendingAnother) {
        restoreCompletedAnswerMathJax();

        canonicalPageSagePendingAnotherSeed =
            null;
    }

    reprocessMathjax();

    if (activatedCanonicalGeneration) {
        MathJax.Hub.Queue(
            function() {
                activatedCanonicalGeneration
                    .mathJaxPassComplete =
                        true;

                maybeReleaseCanonicalPageSageAnother(
                    activatedCanonicalGeneration
                );
            }
        );
    }
});

seedCallbacks.forEach(function(callback) {
    callback();
});
seedCallbacks = [];
    }, "sage-seed");
});

function ensureShowMeAnotherButton() {
    var button = $("#show-me-another-button");

    if (button.length > 0) {
return button;
    }

    button = $('<button/>', {
type: 'button',
id: 'show-me-another-button',
'class': 'xmanother',
role: 'button',
style: 'display: none;',
title: 'Generate another version of this page',
'aria-label': 'Generate another version of this page'
    });

    button.append($('<i/>', {
'class': 'fa fa-repeat',
'aria-hidden': 'true'
    }));

    button.append($('<span/>', {
'class': 'xronos-another-label xmhidden-small hidden-md-down'
    }).html('&nbsp;Another'));

    if ($(".xmdownload").length > 0) {
	$(".xmdownload").first().before(button);
    } else if ($("#math-edit-button").length > 0) {
	$("#math-edit-button").after(button);
    } else if ($(".xmupdate").length > 0) {
	$(".xmupdate").first().before(button);
    } else {
	$("body").prepend(button);
    }

    return button;
}

$(function() {
    ensureShowMeAnotherButton();

    $(document)
.off("click.xronosAnother", "#show-me-another-button")
.on("click.xronosAnother", "#show-me-another-button", function() {
    var button =
        $(this);

    if (
        canonicalPageSageAnotherBusy ||
        button.data(
            canonicalPageSageAnotherClaimDataKey
        ) === true
    ) {
        canonicalPageSageIgnoredAnotherClicks += 1;
        return;
    }

    /*
     * Claim the UI action synchronously. Two native click events can already
     * be queued before the first handler disables the button.
     */
    button.data(
        canonicalPageSageAnotherClaimDataKey,
        true
    );

    button.prop(
        "disabled",
        true
    );

    try {
        xronosShowMeAnotherSage();
    } catch (err) {
        button.removeData(
            canonicalPageSageAnotherClaimDataKey
        );

        button.prop(
            "disabled",
            false
        );

        throw err;
    }
});
});

function revealShowMeAnotherForAuthoredSage() {
    var foundRandomSage = false;

    $('script[type="text/sagemath"]').each(function() {
        /*
         * Preserve the historical authored-content heuristic that exposes
         * Another whenever a sagesilent block contains "rand". Canonical
         * execution itself uses the immutable page manifest and does not
         * depend on this scan.
         */
        if ($(this).text().match('rand')) {
            foundRandomSage = true;
            return false;
        }
    });

    if (foundRandomSage) {
        ensureShowMeAnotherButton().show();
    }

    return foundRandomSage;
}


function sageRequestAuthData() {
    var xronosSagecellRequestData = {};
    var xronosSagecellAuth = window.xronosSagecellAuth || {};

    if (xronosSagecellAuth.payload && xronosSagecellAuth.token) {
        xronosSagecellRequestData.xronosSagecellPayload = JSON.stringify(xronosSagecellAuth.payload);
        xronosSagecellRequestData.xronosSagecellToken = xronosSagecellAuth.token;
    }

    return xronosSagecellRequestData;
}

function parseSageCellError(err) {
    if (!err) {
        return null;
    }

    if (err.responseText) {
        try {
            return JSON.parse(err.responseText);
        } catch (e) {
            // Fall through to the outer error object below.
        }
    }

    if (err.ename) {
        return err;
    }

    return null;
}

function isExpiredSageCellAuthorizationError(err) {
    var parsed = parseSageCellError(err);

    return parsed &&
        parsed.ename === "XronosSageCellAuthorizationError" &&
        parsed.evalue === "expired SageCell page authorization";
}


function sageErrorHttpStatus(err) {
    var parsed = parseSageCellError(err);

    if (err && typeof err.httpStatus === "number") {
        return err.httpStatus;
    }

    if (parsed && typeof parsed.httpStatus === "number") {
        return parsed.httpStatus;
    }

    return 0;
}

function describeSageError(err) {
    var parsed = parseSageCellError(err) || err || {};
    var ename = parsed.ename || (err && err.ename) || "";
    var ajaxStatus =
        err && typeof err.status === "string"
            ? err.status
            : "";
    var httpStatus = sageErrorHttpStatus(err);
    var transientHttpStatuses = {
        408: true,
        429: true,
        500: true,
        502: true,
        503: true,
        504: true
    };

    if (
        ename === "XronosSageCellAuthorizationError" ||
        ename === "XronosSageCellAuthorizationRefreshError" ||
        httpStatus === 401 ||
        httpStatus === 403
    ) {
        return {
            category: "authorization",
            retryable: true,
            message:
                "The computation session could not be refreshed. " +
                "Reload the page or try the computation again."
        };
    }

    if (
        sageErrorPolicy
            .isCanonicalPageResultError(
                ename
            )
    ) {
        return {
            category: "transient",
            retryable: true,
            message:
                "The computation service returned a result that could not " +
                "be read. Try the computation again."
        };
    }

    if (
        ajaxStatus === "timeout" ||
        ajaxStatus === "abort" ||
        (ajaxStatus === "error" && httpStatus === 0) ||
        transientHttpStatuses[httpStatus]
    ) {
        return {
            category: "transient",
            retryable: true,
            message:
                "The computation service could not be reached. " +
                "Check your connection and try again."
        };
    }

    if (
        ename === "XronosSageDisplayError"
    ) {
        return {
            category: "display",
            retryable: false,
            message:
                "The computation completed, but the page could not " +
                "display the result. Reload the page or report this activity."
        };
    }

    if (
        parsed.success === false
    ) {
        return {
            category: "code",
            retryable: false,
            message:
                "This activity's computation encountered an error. " +
                "Retrying is unlikely to fix it. Please report this page " +
                "to your instructor."
        };
    }

    return {
        category: "unexpected",
        retryable: false,
        message:
            "The computation could not be displayed. Reload the page " +
            "or report this activity."
    };
}

function buildSageErrorElement(err, retry) {
    var info = describeSageError(err);
    var wrapper = document.createElement("span");
    var message = document.createElement("span");

    wrapper.className =
        "xronos-sage-error " +
        "xronos-sage-error-" +
        info.category;
    wrapper.setAttribute("role", "alert");
    wrapper.setAttribute("aria-live", "polite");

    message.className = "xronos-sage-error-message";
    message.appendChild(
        document.createTextNode(info.message)
    );
    wrapper.appendChild(message);

    if (
        info.retryable &&
        typeof retry === "function"
    ) {
        var button = document.createElement("button");

        button.type = "button";
        button.className =
            "btn btn-sm btn-secondary xronos-sage-retry";
        button.appendChild(
            document.createTextNode("Retry computation")
        );

        button.addEventListener(
            "click",
            function(event) {
                event.preventDefault();
                button.disabled = true;
                retry();
            }
        );

        wrapper.appendChild(button);
    }

    return wrapper;
}

exports.describeSageError = describeSageError;
exports.buildSageErrorElement = buildSageErrorElement;

function refreshSageCellPageAuthorization() {
    var xronosSagecellAuth = window.xronosSagecellAuth || {};

    if (sageAuthRefreshInFlight) {
        return sageAuthRefreshInFlight;
    }

    if (!xronosSagecellAuth.payload || !xronosSagecellAuth.token) {
        return Promise.reject({
            ename: "XronosSageCellAuthorizationRefreshError",
            evalue: "missing current SageCell page authorization"
        });
    }

    sageAuthRefreshInFlight = new Promise(function(resolve, reject) {
        $.ajax({
            type: "POST",
            url: "/sagecell/auth",
            headers: {
                "X-Xronos-Support-Trace":
                    pageRuntime.supportTraceId()
            },
            data: sageRequestAuthData(),
            dataType: "json",
            timeout: 15000
        }).done(function(response) {
            if (typeof response === "string") {
                response = JSON.parse(response);
            }

            if (!response || !response.payload || !response.token) {
                reject({
                    ename: "XronosSageCellAuthorizationRefreshError",
                    evalue: "incomplete SageCell authorization refresh response"
                });
                return;
            }

            window.xronosSagecellAuth = response;
            resolve(response);
        }).fail(function(xhr, status, error) {
            reject({
                ename: "XronosSageCellAuthorizationRefreshError",
                evalue: error || status,
                status: status,
                httpStatus: xhr.status,
                responseText: xhr.responseText
            });
        });
    }).then(
        function(response) {
            sageAuthRefreshInFlight = null;
            return response;
        },
        function(err) {
            sageAuthRefreshInFlight = null;
            throw err;
        }
    );

    return sageAuthRefreshInFlight;
}

function postSageRawOnce(requestCode) {
    return new Promise(function(resolve, reject) {
        var xronosSagecellRequestData = sageRequestAuthData();

        xronosSagecellRequestData.code = requestCode;

        $.ajax({
            type: "POST",
            url: "/sagecell/service",
            headers: {
                "X-Xronos-Support-Trace":
                    pageRuntime.supportTraceId()
            },
            data: xronosSagecellRequestData,
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
                httpStatus: xhr.status,
                responseText: xhr.responseText
            });
        });
    });
}

function postSageRaw(requestCode) {
    return postSageRawOnce(requestCode).then(
        function(response) {
            return response;
        },
        function(err) {
            if (!isExpiredSageCellAuthorizationError(err)) {
                throw err;
            }

            return refreshSageCellPageAuthorization().then(function() {
                return postSageRawOnce(requestCode);
            });
        }
    );
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

function restoreCompletedAnswerMathJax() {
    $('script[type^="math/tex"][data-initial]').each(function() {
	var scriptElement = $(this);
	var initialTex = scriptElement.attr('data-initial');
	var currentTex = scriptElement.text();

	if (!initialTex || initialTex.indexOf('\\answer') < 0) {
	    return;
	}

	if (currentTex === initialTex) {
	    return;
	}

	var jax = MathJax.Hub.getAllJax(scriptElement.attr('id'))[0];

	if (jax) {
	    MathJax.Hub.Queue(["Text", jax, initialTex]);
	} else {
	    scriptElement.text(initialTex);
	}
    });
}

function xronosShowMeAnotherSage() {
    if (
        canonicalPageSageAnotherBusy
    ) {
        canonicalPageSageIgnoredAnotherClicks += 1;

        return $("#seed").persistentData(
            'seed'
        );
    }

    var oldSeed = $("#seed").persistentData('seed');
    var numericOldSeed = parseInt(oldSeed, 10);
    var newSeed = oldSeed !== undefined && !isNaN(numericOldSeed) ? numericOldSeed + 1 : 0;

    canonicalPageSagePendingAnotherSeed =
        newSeed;

    prepareCanonicalPageSageGeneration(
        newSeed
    );

    seed = undefined;

    if (TinCan && TinCan.generatedAnotherVersion) {
	TinCan.generatedAnotherVersion($("main.activity").first(), oldSeed, newSeed);
    }

    if (typeof database !== "undefined" && database.resetWork) {
	database.resetWork({
	    preserve: {
		seed: {
		    seed: newSeed
		}
	    }
	});
    } else {
	$("#seed").persistentData('seed', newSeed);
    }

    /*
     * Completed-answer MathJax restoration now occurs inside the observed
     * seed-change transaction, after the canonical generation request starts
     * and before the complete page reprocess is queued.
     */

    return $("#seed").persistentData('seed');
}

// Temporary/debug hook. This lets us test the production "Another" behavior
// even if the test layout is missing or hiding the button.
window.xronosShowMeAnotherSage = xronosShowMeAnotherSage;

$(function() {
    revealShowMeAnotherForAuthoredSage();
});
