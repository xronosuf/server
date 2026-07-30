/*
 * Passive page-runtime diagnostics.
 *
 * This module must not control startup behavior. It records what the existing
 * runtime does so support and later coordinator work can inspect lifecycle
 * ordering without changing successful or failed outcomes.
 */

var MAX_EVENTS = 250;
var nextSequence = 1;

function nowMonotonic() {
    if (
        window.performance &&
        typeof window.performance.now === "function"
    ) {
        return window.performance.now();
    }

    return Date.now();
}

function makeSessionId() {
    return (
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 10)
    );
}

function copyValue(value) {
    if (value === undefined)
        return undefined;

    try {
        return JSON.parse(JSON.stringify(value));
    } catch (err) {
        return {
            serializationError:
                err && err.message
                    ? err.message
                    : String(err)
        };
    }
}

var runtime = {
    schemaVersion: 1,
    sessionId: makeSessionId(),
    startedAt: new Date().toISOString(),
    startedAtMonotonic: nowMonotonic(),
    events: [],
    services: {},
    operations: {},
    components: {}
};

function elapsedMs() {
    return (
        Math.round(
            (
                nowMonotonic() -
                runtime.startedAtMonotonic
            ) * 1000
        ) / 1000
    );
}

function record(type, name, state, details) {
    var event = {
        sequence: nextSequence,
        at: new Date().toISOString(),
        elapsedMs: elapsedMs(),
        type: type,
        name: name
    };

    if (state !== undefined)
        event.state = state;

    if (details !== undefined)
        event.details = copyValue(details);

    nextSequence += 1;
    runtime.events.push(event);

    if (runtime.events.length > MAX_EVENTS)
        runtime.events.shift();

    return event;
}

function transition(collectionName, name, state, details) {
    var collection = runtime[collectionName];
    var value = {
        state: state,
        updatedAt: new Date().toISOString(),
        elapsedMs: elapsedMs()
    };

    if (details !== undefined)
        value.details = copyValue(details);

    collection[name] = value;

    record(
        collectionName.slice(0, -1),
        name,
        state,
        details
    );

    return value;
}

function event(name, details) {
    return record("event", name, undefined, details);
}

function service(name, state, details) {
    return transition("services", name, state, details);
}

function operation(name, state, details) {
    return transition("operations", name, state, details);
}

function component(name, state, details) {
    return transition("components", name, state, details);
}

function inspect() {
    return copyValue(runtime);
}

var api = {
    event: event,
    service: service,
    operation: operation,
    component: component,
    inspect: inspect
};

window.xronosPageRuntime = api;
window.xronosRuntimeEvent = event;
window.xronosInspectPageRuntime = inspect;

module.exports = api;
