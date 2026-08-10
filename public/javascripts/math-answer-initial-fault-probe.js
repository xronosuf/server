"use strict";

var STORAGE_KEY =
    "xronosMathAnswerInitialFault";

function normalizeRequest(value) {
    if (
        !value ||
        value.faultType !==
            "missing-answer-model"
    ) {
        return null;
    }

    var authoredId =
        typeof value.authoredId ===
            "string"
            ? value.authoredId.trim()
            : "";

    if (!authoredId) {
        return null;
    }

    return {
        faultType:
            "missing-answer-model",
        authoredId:
            authoredId
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

    var pageRuntime =
        options.pageRuntime;

    var consumed =
        consumeRequest(
            options.storage
        );

    var probe =
        consumed.probe;

    var injected =
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

    function inertResult(reason) {
        return {
            armed:
                false,
            reason:
                reason,
            probe:
                probe || null,

            claim:
                function() {
                    return false;
                }
        };
    }

    if (!probe) {
        return inertResult(
            consumed.reason
        );
    }

    emit(
        "math-answer-initial-fault-probe-armed",
        {
            faultType:
                probe.faultType,
            authoredId:
                probe.authoredId,
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

        claim:
            function(
                faultType,
                details
            ) {
                if (
                    injected ||
                    faultType !==
                        probe.faultType
                ) {
                    return false;
                }

                details =
                    details || {};

                if (
                    details.initialProcessActive !==
                        true
                ) {
                    return false;
                }

                if (
                    details.authoredId !==
                        probe.authoredId
                ) {
                    return false;
                }

                injected = true;

                emit(
                    "math-answer-initial-fault-probe-injected",
                    {
                        faultType:
                            probe.faultType,
                        authoredId:
                            probe.authoredId,
                        answerId:
                            details.answerId ||
                            null,
                        mathJaxInputId:
                            details.mathJaxInputId ||
                            null
                    }
                );

                emit(
                    "math-answer-initial-fault-probe-consumed",
                    {
                        faultType:
                            probe.faultType,
                        authoredId:
                            probe.authoredId,
                        oneShot:
                            true
                    }
                );

                return {
                    faultType:
                        probe.faultType,
                    authoredId:
                        probe.authoredId
                };
            }
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
