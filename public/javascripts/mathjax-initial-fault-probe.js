"use strict";


function decodeFragmentValue(value) {
    try {
        return decodeURIComponent(
            String(value || "")
                .replace(/\+/g, " ")
        );
    } catch (error) {
        return String(value || "");
    }
}


function parseFragment(fragment) {
    var text =
        String(fragment || "")
            .replace(/^#/, "");

    var result = {};

    if (!text) {
        return result;
    }

    text.split("&").forEach(function(part) {
        var separator =
            part.indexOf("=");

        var rawKey =
            separator === -1
                ? part
                : part.slice(0, separator);

        var rawValue =
            separator === -1
                ? ""
                : part.slice(separator + 1);

        var key =
            decodeFragmentValue(rawKey);

        if (!key) {
            return;
        }

        result[key] =
            decodeFragmentValue(rawValue);
    });

    return result;
}


function requestedProbe(fragment) {
    var parameters =
        parseFragment(fragment);

    if (
        parameters
            .xronosMathJaxInitialFault !==
        "processing-error"
    ) {
        return null;
    }

    var scriptIndex =
        parseInt(
            parameters.scriptIndex || "0",
            10
        );

    if (
        !isFinite(scriptIndex) ||
        scriptIndex < 0
    ) {
        scriptIndex = 0;
    }

    return {
        faultType:
            "processing-error",
        scriptIndex:
            scriptIndex
    };
}


function install(options) {
    options = options || {};

    var mathJax =
        options.MathJax;

    var pageRuntime =
        options.pageRuntime;

    var fragment =
        options.fragment;

    var probe =
        requestedProbe(fragment);

    if (!probe) {
        return {
            armed:
                false,
            reason:
                "not-requested"
        };
    }

    if (
        !mathJax ||
        !mathJax.InputJax ||
        !mathJax.InputJax.TeX ||
        typeof mathJax.InputJax.TeX.Process !==
            "function"
    ) {
        return {
            armed:
                false,
            reason:
                "tex-process-unavailable",
            probe:
                probe
        };
    }

    var tex =
        mathJax.InputJax.TeX;

    var originalProcess =
        tex.Process;

    var eligibleScriptIndex =
        -1;

    var restored =
        false;

    function emit(name, details) {
        if (
            pageRuntime &&
            typeof pageRuntime.event ===
                "function"
        ) {
            pageRuntime.event(
                name,
                details
            );
        }
    }

    function restore(reason) {
        if (restored) {
            return;
        }

        tex.Process =
            originalProcess;

        restored =
            true;

        emit(
            "mathjax-initial-fault-probe-restored",
            {
                faultType:
                    probe.faultType,
                scriptIndex:
                    probe.scriptIndex,
                reason:
                    reason
            }
        );
    }

    tex.Process =
        function(script, state) {
            eligibleScriptIndex += 1;

            if (
                eligibleScriptIndex ===
                    probe.scriptIndex
            ) {
                var scriptId =
                    script &&
                    script.id
                        ? script.id
                        : null;

                var scriptType =
                    script &&
                    script.type
                        ? script.type
                        : null;

                var sourceText =
                    script
                        ? String(
                            script.text ||
                            script.textContent ||
                            ""
                        )
                        : "";

                restore(
                    "before-controlled-fault"
                );

                emit(
                    "mathjax-initial-fault-probe-injected",
                    {
                        faultType:
                            probe.faultType,
                        scriptIndex:
                            probe.scriptIndex,
                        scriptId:
                            scriptId,
                        scriptType:
                            scriptType,
                        sourceLength:
                            sourceText.length,
                        stateIndex:
                            state &&
                            typeof state.i ===
                                "number"
                                ? state.i
                                : null
                    }
                );

                throw new Error(
                    "XR controlled initial MathJax processing fault"
                );
            }

            return originalProcess.apply(
                this,
                arguments
            );
        };

    emit(
        "mathjax-initial-fault-probe-armed",
        {
            faultType:
                probe.faultType,
            scriptIndex:
                probe.scriptIndex
        }
    );

    return {
        armed:
            true,
        probe:
            probe,
        restore:
            restore
    };
}


module.exports = {
    parseFragment:
        parseFragment,
    requestedProbe:
        requestedProbe,
    install:
        install
};
