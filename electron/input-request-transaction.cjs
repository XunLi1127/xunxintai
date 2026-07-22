'use strict';

const CONFIG_OWNERS = new WeakMap();
const CONFIG_FIELDS = Object.freeze(['model', 'provider_id', 'credentialProfile']);

function snapshotField(conv, field) {
    return { present: Object.hasOwn(conv, field), value: conv[field] };
}

function sameField(left, right) {
    return left.present === right.present && left.value === right.value;
}

function writeField(conv, field, value) {
    if (value.present) conv[field] = value.value;
    else delete conv[field];
}

function configPatches(config) {
    const patches = {};
    if (config.model) patches.model = { present: true, value: config.model };
    if (config.providerPresent) patches.provider_id = { present: !!config.providerId, value: config.providerId || undefined };
    if (Object.hasOwn(config, 'credentialProfile')) patches.credentialProfile = {
        present: config.credentialProfile !== undefined,
        value: config.credentialProfile,
    };
    return patches;
}

function recomputeConfig(conv, state) {
    for (const field of CONFIG_FIELDS) {
        let value = state.fields[field].base;
        for (const entry of state.entries) if (entry.patches[field]) value = entry.patches[field];
        writeField(conv, field, value);
        state.fields[field].lastWritten = snapshotField(conv, field);
    }
}

function settleConfigEntry(conv, entry, committed) {
    const state = CONFIG_OWNERS.get(conv);
    if (!state || !entry) return;
    for (const field of CONFIG_FIELDS) {
        const current = snapshotField(conv, field);
        const owned = state.fields[field];
        if (owned.lastWritten && !sameField(current, owned.lastWritten)) owned.base = current;
    }
    if (committed) entry.committed = true;
    else state.entries = state.entries.filter(candidate => candidate !== entry);
    while (state.entries[0]?.committed) {
        const settled = state.entries[0];
        for (const field of CONFIG_FIELDS) if (settled.patches[field]) state.fields[field].base = settled.patches[field];
        state.entries.shift();
    }
    recomputeConfig(conv, state);
    if (state.entries.length === 0) CONFIG_OWNERS.delete(conv);
}

function createInputRequestTransaction({ db, conv, conversationId, pendingRequestId = conversationId, pendingImageBlocks, fileSystem, saveDb, createdFiles: observedCreatedFiles = [] }) {
    const createdFiles = new Set();
    const ownedBlocks = new Set();
    let stagedConfig = null;
    let stagedMessage = null;
    let configApplied = false;
    let configEntry = null;
    let persisted = false;
    let persistenceAttempted = false;
    let committed = false;
    let rolledBack = false;

    function stageConversationConfig(config) { stagedConfig = { ...config }; }
    function applyStagedConversationConfig() {
        if (!stagedConfig || configApplied) return;
        let state = CONFIG_OWNERS.get(conv);
        if (!state) {
            state = {
                fields: Object.fromEntries(CONFIG_FIELDS.map(field => [field, { base: snapshotField(conv, field), lastWritten: null }])),
                entries: [],
            };
            CONFIG_OWNERS.set(conv, state);
        }
        configEntry = { patches: configPatches(stagedConfig), committed: false };
        state.entries.push(configEntry);
        recomputeConfig(conv, state);
        configApplied = true;
    }
    function stageUserMessage(message) { stagedMessage = message; }
    function trackCreatedFile(filePath) { createdFiles.add(filePath); }
    function trackPendingImageBlock(block) { ownedBlocks.add(block); }
    function removeOwnedEffects() {
        const pending = pendingImageBlocks.get(pendingRequestId);
        if (Array.isArray(pending)) {
            for (let index = pending.length - 1; index >= 0; index -= 1) {
                if (ownedBlocks.has(pending[index])) pending.splice(index, 1);
            }
            if (pending.length === 0) {
                if (typeof pendingImageBlocks.finish === 'function') pendingImageBlocks.finish(pendingRequestId);
                else pendingImageBlocks.delete(pendingRequestId);
            }
        }
        for (const filePath of new Set([...createdFiles, ...observedCreatedFiles])) {
            try { fileSystem.unlinkSync(filePath); } catch (_) {}
        }
    }
    function rollback() {
        if (committed || rolledBack) return;
        rolledBack = true;
        if (stagedMessage) {
            const index = db.messages.indexOf(stagedMessage);
            if (index >= 0) db.messages.splice(index, 1);
        }
        if (configApplied) settleConfigEntry(conv, configEntry, false);
        removeOwnedEffects();
        if (persistenceAttempted) {
            try { saveDb(); } catch (_) {}
        }
    }
    function persist() {
        if (committed || rolledBack) throw new Error('Input transaction is closed');
        if (persisted) return;
        applyStagedConversationConfig();
        if (stagedMessage && !db.messages.includes(stagedMessage)) db.messages.push(stagedMessage);
        persistenceAttempted = true;
        try {
            saveDb();
            persisted = true;
        } catch (error) {
            rollback();
            throw error;
        }
    }
    function commit() {
        if (committed || rolledBack) throw new Error('Input transaction is closed');
        persist();
        settleConfigEntry(conv, configEntry, true);
        committed = true;
    }
    return Object.freeze({
        stageConversationConfig, applyStagedConversationConfig, stageUserMessage,
        trackCreatedFile, trackPendingImageBlock, rollback, persist, commit,
        isCommitted: () => committed,
    });
}

function writeEngineInput(stream, payload) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error, keepErrorListener = false) => {
            if (settled) return;
            settled = true;
            if (!keepErrorListener && typeof stream.removeListener === 'function') stream.removeListener('error', onError);
            else if (keepErrorListener && typeof stream.removeListener === 'function') setImmediate(() => stream.removeListener('error', onError));
            if (error) reject(error); else resolve();
        };
        const onError = error => finish(error);
        if (typeof stream.once === 'function') stream.once('error', onError);
        try {
            stream.write(payload, error => finish(error, !!error));
        } catch (error) {
            finish(error);
        }
    });
}

async function runResearchTransaction({ transaction, resolveConfig, runResearch, finishPending }) {
    try {
        const config = resolveConfig();
        const result = await runResearch(config);
        transaction.commit();
        return result;
    } catch (error) {
        transaction.rollback();
        throw error;
    } finally {
        finishPending();
    }
}

function rejectInputEvidence({ res, validation, transaction }) {
    transaction.rollback();
    return res.status(422).type('application/json').json(validation);
}

module.exports = { createInputRequestTransaction, rejectInputEvidence, writeEngineInput, runResearchTransaction };
