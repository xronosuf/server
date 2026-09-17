'use strict';

/*
 * Instructor settings are configuration values managed by instructional staff
 * for the current LMS course context (for example, a specific Canvas course
 * shell or Blackboard course shell).  At present, instructional authority and
 * context identity come from validated LTI launches.  The storage/resolution
 * layer should not assume Canvas must forever be the only LMS or that LTI must
 * forever be the only way instructional authority is established.
 *
 * These settings apply only to real LMS-backed contexts represented by a
 * persisted, validated LtiBridge.  Ordinary Xronos users who are not arriving
 * through such an LTI context must not create settings documents merely because
 * they have user/session fields that resemble LMS identifiers.
 *
 * Settings belong to the LMS shell, not to an individual instructor.  An
 * instructor is an authorized editor; updatedBy is audit metadata only and is
 * never part of settings identity or resolution.
 */

var mdb = require('../mdb');

var DAY_MS = 24 * 60 * 60 * 1000;
var FALLBACK_DAYS = 130;
var COLLECTION_NAME = 'instructorSettings';
var GLOBAL_SCOPE = 'global';
var LOCAL_SCOPE = 'local';
var GRADE_SYNC_LATE_POLICY = 'late-policy';
var GRADE_SYNC_DUE_DATE = 'due-date';
var DEFAULT_GRADE_SYNC_CUTOFF = GRADE_SYNC_LATE_POLICY;
var InstructorSetting = null;

var DEFINITIONS = {
    gradeSyncCutoff: {
        scopes: [GLOBAL_SCOPE],
        defaultValue: DEFAULT_GRADE_SYNC_CUTOFF,
        allowedValues: [GRADE_SYNC_LATE_POLICY, GRADE_SYNC_DUE_DATE]
    }
};

function text(value) {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    return value.toString();
}

function settingModel() {
    if (InstructorSetting) {
        return InstructorSetting;
    }

    if (mdb.mongoose.models.InstructorSetting) {
        InstructorSetting = mdb.mongoose.models.InstructorSetting;
        return InstructorSetting;
    }

    var Schema = mdb.mongoose.Schema;
    var ObjectId = Schema.ObjectId;
    var Mixed = Schema.Types.Mixed;
    var schema = new Schema({
        toolConsumerInstanceGuid: {type: String, index: true, required: true},
        contextId: {type: String, index: true, required: true},
        scope: {type: String, index: true, required: true},
        repository: {type: String, index: true, default: null},
        path: {type: String, index: true, default: null},
        /*
         * Keep this sparse and definition-driven.  A future local-only setting
         * document must not acquire defaults for unrelated global-only settings.
         */
        settings: {type: Mixed, default: function() { return {}; }},
        fallbackGradeSyncEndAt: Date,
        createdAt: {type: Date, index: true},
        updatedAt: {type: Date, index: true},
        updatedBy: {type: ObjectId, index: true, ref: 'User', default: null}
    }, {
        collection: COLLECTION_NAME,
        minimize: false
    });

    schema.index({
        toolConsumerInstanceGuid: 1,
        contextId: 1,
        scope: 1,
        repository: 1,
        path: 1
    }, {unique: true});

    InstructorSetting = mdb.mongoose.model('InstructorSetting', schema);
    return InstructorSetting;
}

function bridgeHasAuthoritativeLtiContext(bridge) {
    return !!(
        bridge &&
        bridge._id &&
        text(bridge.ltiId) &&
        text(bridge.oauthConsumerKey) &&
        text(bridge.toolConsumerInstanceGuid) &&
        text(bridge.contextId)
    );
}

function shellIdentityFromBridge(bridge) {
    if (!bridgeHasAuthoritativeLtiContext(bridge)) {
        return null;
    }

    return {
        toolConsumerInstanceGuid: text(bridge.toolConsumerInstanceGuid),
        contextId: text(bridge.contextId)
    };
}

function globalQuery(identity) {
    return {
        toolConsumerInstanceGuid: identity.toolConsumerInstanceGuid,
        contextId: identity.contextId,
        scope: GLOBAL_SCOPE,
        repository: null,
        path: null
    };
}

function defaultGlobalValues(now) {
    now = now instanceof Date ? now : new Date(now || Date.now());

    return {
        settings: {
            gradeSyncCutoff: DEFAULT_GRADE_SYNC_CUTOFF
        },
        fallbackGradeSyncEndAt: new Date(
            now.getTime() + FALLBACK_DAYS * DAY_MS
        ),
        createdAt: now,
        updatedAt: now,
        updatedBy: null
    };
}

function policyFromDocument(document) {
    var cutoff = document && document.settings &&
        document.settings.gradeSyncCutoff;

    if (DEFINITIONS.gradeSyncCutoff.allowedValues.indexOf(cutoff) < 0) {
        cutoff = DEFAULT_GRADE_SYNC_CUTOFF;
    }

    return {
        gradeSyncCutoff: cutoff,
        fallbackGradeSyncEndAt:
            document && document.fallbackGradeSyncEndAt || null
    };
}

function applyPolicyToBridgeObject(bridge, document) {
    if (!bridge) {
        return bridge;
    }

    var policy = policyFromDocument(document);
    bridge.gradeSyncCutoff = policy.gradeSyncCutoff;
    bridge.fallbackGradeSyncEndAt = policy.fallbackGradeSyncEndAt;
    return bridge;
}

function runtimePolicyUpdate(document) {
    var policy = policyFromDocument(document);

    return {
        gradeSyncCutoff: policy.gradeSyncCutoff,
        fallbackGradeSyncEndAt: policy.fallbackGradeSyncEndAt
    };
}

function syncContextRuntimePolicy(identity, document) {
    return mdb.LtiBridge.updateMany(
        {
            toolConsumerInstanceGuid: identity.toolConsumerInstanceGuid,
            contextId: identity.contextId
        },
        {$set: runtimePolicyUpdate(document)}
    ).exec();
}

function syncBridgeRuntimePolicy(bridge, document) {
    applyPolicyToBridgeObject(bridge, document);
    return bridge.save();
}

function ensureGlobalForBridge(bridge, now) {
    var identity = shellIdentityFromBridge(bridge);

    if (!identity) {
        return Promise.resolve(null);
    }

    var Model = settingModel();
    var query = globalQuery(identity);

    return Model.findOne(query).exec()
        .then(function(existing) {
            if (existing) {
                return syncBridgeRuntimePolicy(bridge, existing)
                    .then(function() {
                        return existing;
                    });
            }

            var values = defaultGlobalValues(now);
            var document = new Model(Object.assign({}, query, values));

            return document.save()
                .then(function(saved) {
                    /*
                     * The first encounter with a shell may be a student launch.
                     * Populate every pre-existing bridge in that shell once so
                     * queued/background grade work also receives the same
                     * materialized runtime policy.
                     */
                    return syncContextRuntimePolicy(identity, saved)
                        .then(function() {
                            applyPolicyToBridgeObject(bridge, saved);
                            return saved;
                        });
                })
                .catch(function(err) {
                    /*
                     * Concurrent first launches may race on the unique shell
                     * index.  If another request won, load its document and
                     * synchronize only this bridge.
                     */
                    if (!err || err.code !== 11000) {
                        throw err;
                    }

                    return Model.findOne(query).exec()
                        .then(function(racedDocument) {
                            if (!racedDocument) {
                                throw err;
                            }

                            return syncBridgeRuntimePolicy(
                                bridge,
                                racedDocument
                            ).then(function() {
                                return racedDocument;
                            });
                        });
                });
        });
}

function getGlobalForBridge(bridge) {
    var identity = shellIdentityFromBridge(bridge);

    if (!identity) {
        return Promise.resolve(null);
    }

    return settingModel().findOne(globalQuery(identity)).exec();
}

function validSettingValue(key, value) {
    var definition = DEFINITIONS[key];

    return !!(
        definition &&
        definition.allowedValues &&
        definition.allowedValues.indexOf(value) >= 0
    );
}

function updateGlobalSetting(bridge, key, value, updatedBy, now) {
    var identity = shellIdentityFromBridge(bridge);

    if (!identity) {
        return Promise.reject(new Error('authoritative-lti-context-required'));
    }

    var definition = DEFINITIONS[key];

    if (!definition || definition.scopes.indexOf(GLOBAL_SCOPE) < 0) {
        return Promise.reject(new Error('setting-not-available-at-global-scope'));
    }

    if (!validSettingValue(key, value)) {
        return Promise.reject(new Error('invalid-setting-value'));
    }

    now = now instanceof Date ? now : new Date(now || Date.now());

    return ensureGlobalForBridge(bridge, now)
        .then(function(document) {
            document.settings = document.settings || {};
            document.settings[key] = value;
            document.markModified('settings');
            document.updatedAt = now;
            document.updatedBy = updatedBy || null;

            return document.save();
        })
        .then(function(saved) {
            return syncContextRuntimePolicy(identity, saved)
                .then(function() {
                    applyPolicyToBridgeObject(bridge, saved);
                    return saved;
                });
        });
}

function serializeGlobal(document) {
    if (!document) {
        return null;
    }

    var policy = policyFromDocument(document);

    return {
        scope: GLOBAL_SCOPE,
        settings: {
            gradeSyncCutoff: policy.gradeSyncCutoff
        },
        fallbackGradeSyncEndAt:
            policy.fallbackGradeSyncEndAt instanceof Date
                ? policy.fallbackGradeSyncEndAt.toISOString()
                : policy.fallbackGradeSyncEndAt,
        createdAt: document.createdAt instanceof Date
            ? document.createdAt.toISOString()
            : document.createdAt,
        updatedAt: document.updatedAt instanceof Date
            ? document.updatedAt.toISOString()
            : document.updatedAt,
        updatedBy: document.updatedBy ? document.updatedBy.toString() : null
    };
}

exports.COLLECTION_NAME = COLLECTION_NAME;
exports.DEFAULT_GRADE_SYNC_CUTOFF = DEFAULT_GRADE_SYNC_CUTOFF;
exports.DEFINITIONS = DEFINITIONS;
exports.FALLBACK_DAYS = FALLBACK_DAYS;
exports.GLOBAL_SCOPE = GLOBAL_SCOPE;
exports.GRADE_SYNC_DUE_DATE = GRADE_SYNC_DUE_DATE;
exports.GRADE_SYNC_LATE_POLICY = GRADE_SYNC_LATE_POLICY;
exports.LOCAL_SCOPE = LOCAL_SCOPE;
exports.applyPolicyToBridgeObject = applyPolicyToBridgeObject;
exports.bridgeHasAuthoritativeLtiContext = bridgeHasAuthoritativeLtiContext;
exports.defaultGlobalValues = defaultGlobalValues;
exports.ensureGlobalForBridge = ensureGlobalForBridge;
exports.getGlobalForBridge = getGlobalForBridge;
exports.globalQuery = globalQuery;
exports.policyFromDocument = policyFromDocument;
exports.serializeGlobal = serializeGlobal;
exports.settingModel = settingModel;
exports.shellIdentityFromBridge = shellIdentityFromBridge;
exports.syncContextRuntimePolicy = syncContextRuntimePolicy;
exports.updateGlobalSetting = updateGlobalSetting;
exports.validSettingValue = validSettingValue;
