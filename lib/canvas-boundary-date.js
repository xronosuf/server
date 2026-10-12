'use strict';

var moment = require('moment');
var gradeBoundaryPolicy = require('./grade-boundary-policy');

function isPlaceholder(value) {
    return (
        typeof value === 'string' &&
        value.trim().charAt(0) === '$'
    );
}

function isExplicitlyEmpty(value) {
    return (
        value === null ||
        (
            typeof value === 'string' &&
            value.trim() === ''
        )
    );
}

function validDate(value) {
    return (
        value !== undefined &&
        !isPlaceholder(value) &&
        !isExplicitlyEmpty(value) &&
        moment(value).isValid()
    );
}

function apply(bridge, type, value, observedAt, parameterPresent) {
    var field = gradeBoundaryPolicy.boundaryField(type);
    var observedField =
        gradeBoundaryPolicy.boundaryObservedField(type);
    var changed = false;
    var cleared = false;

    if (!bridge || !field || !observedField || !parameterPresent) {
        return {
            changed: false,
            cleared: false,
            reason: 'parameter-absent'
        };
    }

    if (isPlaceholder(value)) {
        return {
            changed: false,
            cleared: false,
            reason: 'placeholder'
        };
    }

    if (isExplicitlyEmpty(value)) {
        if (bridge[field] || bridge[observedField]) {
            bridge[field] = undefined;
            bridge[observedField] = undefined;
            gradeBoundaryPolicy.clearBoundaryCandidate(
                bridge,
                type
            );
            changed = true;
            cleared = true;
        }

        return {
            changed: changed,
            cleared: cleared,
            reason: cleared ? 'cleared' : 'already-empty'
        };
    }

    if (!validDate(value)) {
        return {
            changed: false,
            cleared: false,
            reason: 'invalid'
        };
    }

    var incoming = new Date(value);
    var existing = bridge[field]
        ? new Date(bridge[field]).getTime()
        : null;

    if (existing !== incoming.getTime()) {
        bridge[field] = incoming;
        bridge[observedField] = observedAt;

        gradeBoundaryPolicy.clearBoundaryCandidate(
            bridge,
            type
        );
        gradeBoundaryPolicy.refreshBoundaryCandidate(
            bridge,
            type
        );

        return {
            changed: true,
            cleared: false,
            reason: 'updated'
        };
    }

    if (!bridge[observedField]) {
        /*
         * Legacy bridge: the date is current, but Xronos cannot prove when it
         * first learned it. Stamp this launch conservatively.
         */
        bridge[observedField] = observedAt;
        gradeBoundaryPolicy.refreshBoundaryCandidate(
            bridge,
            type
        );
        changed = true;
    }

    return {
        changed: changed,
        cleared: false,
        reason: changed ? 'stamped-observed-at' : 'unchanged'
    };
}

exports.isPlaceholder = isPlaceholder;
exports.isExplicitlyEmpty = isExplicitlyEmpty;
exports.validDate = validDate;
exports.apply = apply;
