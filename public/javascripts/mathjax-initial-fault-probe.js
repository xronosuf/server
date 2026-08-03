"use strict";


var STORAGE_KEY =
    "xronosMathJaxInitialFault";


function normalizeRequest(value) {
    if (
        !value ||
        value.faultType !==
            "processing-error"
    ) {
        return null;
    }

    var scriptIndex =
        parseInt(
            value.scriptIndex,
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


function consumeRequest(storage) {
    if (
        !storage ||
        typeof storage.getItem !==
            "function" ||
        typeof storage.removeItem !==
            "function"
    ) {
        return {
            probe:
                null,
            reason:
                "storage-unavailable"
        };
    }

    var serialized;

    try {
        serialized =
            storage.getItem(
                STORAGE_KEY
            );
    } catch (error) {
        return {
            probe:
                null,
            reason:
                "storage-read-failed"
        };
    }

    if (serialized === null) {
        return {
            probe:
                null,
            reason:
                "not-requested"
        };
    }

    /*
     * Consume before parsing or injecting. A malformed request, processing
     * exception, or later page reload must not repeat the controlled fault.
     */
    try {
        storage.removeItem(
            STORAGE_KEY
        );
    } catch (error) {
        return {
            probe:
                null,
            reason:
                "storage-remove-failed"
        };
    }

    var parsed;

    try {
        parsed =
            JSON.parse(
                serialized
            );
    } catch (error) {
        return {
            probe:
                null,
            reason:
                "invalid-json"
        };
    }

    var probe =
        normalizeRequest(
            parsed
        );

    if (!probe) {
        return {
            probe:
                null,
            reason:
                "invalid-request"
        };
    }

    return {
        probe:
            probe,
        reason:
            "consumed"
    };
}


function install(options) {
    options = options || {};

    var mathJax =
        options.MathJax;

    var pageRuntime =
        options.pageRuntime;

    var consumed =
        consumeRequest(
            options.storage
        );

    var probe =
        consumed.probe;

    if (!probe) {
        return {
            armed:
                false,
            reason:
                consumed.reason
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
                probe.scriptIndex,
            requestSource:
                "session-storage",
            oneShot:
                true
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
    storageKey:
        STORAGE_KEY,
    normalizeRequest:
        normalizeRequest,
    consumeRequest:
        consumeRequest,
    install:
        install
};
