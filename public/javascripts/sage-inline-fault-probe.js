"use strict";


var STORAGE_KEY =
    "xronosSageInlineFault";


var FAULT_TYPES = {
    "missing-input-id":
        true,
    "missing-placeholder":
        true,
    "stale-attempt":
        true,
    "page-result-error":
        true
};


function normalizeNonnegativeInteger(
    value,
    defaultValue
) {
    var normalized =
        parseInt(
            value,
            10
        );

    if (
        !isFinite(normalized) ||
        normalized < 0
    ) {
        return defaultValue;
    }

    return normalized;
}


function normalizeDelayMilliseconds(value) {
    var normalized =
        parseInt(
            value,
            10
        );

    if (
        !isFinite(normalized) ||
        normalized < 1000
    ) {
        return 6000;
    }

    if (normalized > 30000) {
        return 30000;
    }

    return normalized;
}


function normalizeRequest(value) {
    if (
        !value ||
        !FAULT_TYPES[
            value.faultType
        ]
    ) {
        return null;
    }

    return {
        faultType:
            value.faultType,

        callIndex:
            normalizeNonnegativeInteger(
                value.callIndex,
                0
            ),

        delayMilliseconds:
            value.faultType ===
                "stale-attempt"
                ? normalizeDelayMilliseconds(
                    value.delayMilliseconds
                )
                : 0
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
     * Consume before parsing or injecting. A malformed request, controlled
     * failure, or later reload must never repeat the development fault.
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
        "sage-inline-fault-probe-armed",
        {
            faultType:
                probe.faultType,
            callIndex:
                probe.callIndex,
            delayMilliseconds:
                probe.delayMilliseconds,
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
                    typeof details.callIndex !==
                        "number" ||
                    details.callIndex !==
                        probe.callIndex
                ) {
                    return false;
                }

                injected = true;

                emit(
                    "sage-inline-fault-probe-injected",
                    {
                        faultType:
                            probe.faultType,
                        callIndex:
                            probe.callIndex,
                        delayMilliseconds:
                            probe.delayMilliseconds,
                        placeholderId:
                            details.placeholderId ||
                            null,
                        attempt:
                            typeof details.attempt ===
                                "number"
                                ? details.attempt
                                : null
                    }
                );

                emit(
                    "sage-inline-fault-probe-consumed",
                    {
                        faultType:
                            probe.faultType,
                        callIndex:
                            probe.callIndex,
                        oneShot:
                            true
                    }
                );

                return {
                    faultType:
                        probe.faultType,
                    callIndex:
                        probe.callIndex,
                    delayMilliseconds:
                        probe.delayMilliseconds
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
