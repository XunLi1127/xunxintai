'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Writable } = require('node:stream');

let subject = {};
try { subject = require('../input-request-transaction.cjs'); } catch (_) {}

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'input-transaction-'));
    const existing = path.join(root, 'existing.txt');
    const created = path.join(root, 'created.txt');
    fs.writeFileSync(existing, 'keep');
    fs.writeFileSync(created, 'request');
    const ownBlock = { id: 'own' };
    const otherBlock = { id: 'other' };
    const pending = new Map([['conv', [otherBlock, ownBlock]]]);
    const db = { messages: [], conversations: [] };
    const conv = { id: 'conv', model: 'old', provider_id: 'old-provider' };
    const saves = [];
    const tx = subject.createInputRequestTransaction({ db, conv, conversationId: 'conv', pendingImageBlocks: pending, fileSystem: fs, saveDb: () => saves.push(JSON.stringify(db)) });
    return { root, existing, created, ownBlock, otherBlock, pending, db, conv, saves, tx };
}

test('exports the bridge input transaction', () => assert.equal(typeof subject.createInputRequestTransaction, 'function'));

test('writeEngineInput commits only after callback success and treats false as backpressure', async () => {
    let committed = false;
    const stream = new Writable({ write(_chunk, _encoding, callback) { setImmediate(callback); } });
    const originalWrite = stream.write.bind(stream);
    stream.write = (...args) => { originalWrite(...args); return false; };
    await subject.writeEngineInput(stream, 'payload');
    committed = true;
    assert.equal(committed, true);
});

test('writeEngineInput rejects synchronous throws and real Writable callback errors', async () => {
    await assert.rejects(subject.writeEngineInput({ write() { throw new Error('sync'); } }, 'x'), /sync/);
    const stream = new Writable({ write(_chunk, _encoding, callback) { setImmediate(() => callback(new Error('async'))); } });
    await assert.rejects(subject.writeEngineInput(stream, 'x'), /async/);
});

test('research resolves and runs before commit, rolls back failures, and always finishes request images', async () => {
    for (const failure of ['resolve', 'run']) {
        const events = [];
        const transaction = { commit() { events.push('commit'); }, rollback() { events.push('rollback'); } };
        await assert.rejects(subject.runResearchTransaction({
            transaction,
            resolveConfig() { events.push('resolve'); if (failure === 'resolve') throw new Error('resolve'); return {}; },
            async runResearch() { events.push('run'); if (failure === 'run') throw new Error('run'); return 'result'; },
            finishPending() { events.push('finish'); },
        }), new RegExp(failure));
        assert.deepEqual(events, failure === 'resolve' ? ['resolve', 'rollback', 'finish'] : ['resolve', 'run', 'rollback', 'finish']);
    }
    const events = [];
    const result = await subject.runResearchTransaction({
        transaction: { commit() { events.push('commit'); }, rollback() { events.push('rollback'); } },
        resolveConfig() { events.push('resolve'); return {}; },
        async runResearch() { events.push('run'); return 'ok'; },
        finishPending() { events.push('finish'); },
    });
    assert.equal(result, 'ok');
    assert.deepEqual(events, ['resolve', 'run', 'commit', 'finish']);
});

test('evidence rejection rolls back and sends one JSON 422 response without SSE', () => {
    const f = fixture();
    f.tx.trackCreatedFile(f.created);
    f.tx.stageConversationConfig({ model: 'rejected', providerPresent: true, providerId: 'rejected' });
    const calls = [];
    const res = {
        status(code) { calls.push(['status', code]); return this; },
        type(value) { calls.push(['type', value]); return this; },
        json(value) { calls.push(['json', value]); return this; },
        write() { calls.push(['write']); },
        flushHeaders() { calls.push(['flush']); },
    };
    const validation = { ok: false, code: 'INPUT_IMAGE_EVIDENCE_REQUIRED', message: 'Image evidence is required.', details: {} };
    subject.rejectInputEvidence({ res, validation, transaction: f.tx });
    assert.deepEqual(calls, [['status', 422], ['type', 'application/json'], ['json', validation]]);
    assert.equal(fs.existsSync(f.created), false);
    assert.equal(f.conv.model, 'old');
    assert.equal(f.conv.provider_id, 'old-provider');
    assert.deepEqual(f.db.messages, []);
    assert.equal(f.saves.length, 0);
    fs.rmSync(f.root, { recursive: true, force: true });
});

test('pre-gate and post-gate failures rollback only request-owned effects and staged database state', () => {
    for (const phase of ['pre-gate', 'spawn-failed', 'stdin-failed']) {
        const f = fixture();
        f.tx.trackCreatedFile(f.created);
        f.tx.trackPendingImageBlock(f.ownBlock);
        f.tx.stageConversationConfig({ model: 'new', providerPresent: true, providerId: 'new-provider' });
        f.tx.applyStagedConversationConfig();
        const row = { id: phase };
        f.tx.stageUserMessage(row);
        f.db.messages.push(row);
        f.tx.rollback();
        assert.deepEqual(f.db.messages, []);
        assert.equal(f.conv.model, 'old');
        assert.equal(f.conv.provider_id, 'old-provider');
        assert.deepEqual(f.pending.get('conv'), [f.otherBlock]);
        assert.equal(fs.existsSync(f.created), false);
        assert.equal(fs.readFileSync(f.existing, 'utf8'), 'keep');
        fs.rmSync(f.root, { recursive: true, force: true });
    }
});

test('commit persists staged config and exact message, then makes later rollback a no-op', () => {
    const f = fixture();
    f.tx.trackCreatedFile(f.created);
    f.tx.trackPendingImageBlock(f.ownBlock);
    f.tx.stageConversationConfig({ model: 'new', providerPresent: true, providerId: '' });
    f.tx.applyStagedConversationConfig();
    const row = { id: 'user' };
    f.tx.stageUserMessage(row);
    f.tx.commit();
    f.tx.rollback();
    assert.deepEqual(f.db.messages, [row]);
    assert.equal(f.conv.model, 'new');
    assert.equal('provider_id' in f.conv, false);
    assert.equal(fs.existsSync(f.created), true);
    assert.equal(f.saves.length, 1);
    fs.rmSync(f.root, { recursive: true, force: true });
});

test('persist is reversible until stdin acceptance commits the request', () => {
    const f = fixture();
    f.tx.stageConversationConfig({ model: 'new', providerPresent: true, providerId: 'new-provider' });
    f.tx.stageUserMessage({ id: 'user' });
    f.tx.persist();
    assert.equal(f.db.messages.length, 1);
    assert.equal(f.saves.length, 1);
    f.tx.rollback();
    assert.deepEqual(f.db.messages, []);
    assert.equal(f.conv.model, 'old');
    assert.equal(f.conv.provider_id, 'old-provider');
    assert.equal(f.saves.length, 2, 'rollback is persisted after a pre-commit failure');
    fs.rmSync(f.root, { recursive: true, force: true });
});

test('rollback does not clobber concurrent pending blocks or later conversation changes', () => {
    const f = fixture();
    f.tx.trackPendingImageBlock(f.ownBlock);
    f.tx.stageConversationConfig({ model: 'new', providerPresent: false });
    f.tx.applyStagedConversationConfig();
    const concurrent = { id: 'concurrent' };
    f.pending.get('conv').push(concurrent);
    f.conv.model = 'newer-concurrent';
    f.tx.rollback();
    assert.deepEqual(f.pending.get('conv'), [f.otherBlock, concurrent]);
    assert.equal(f.conv.model, 'newer-concurrent');
    fs.rmSync(f.root, { recursive: true, force: true });
});

test('configuration ownership stack restores interleaved failures and preserves successful owners', () => {
    const f = fixture();
    const make = () => subject.createInputRequestTransaction({ db: f.db, conv: f.conv, conversationId: 'conv', pendingImageBlocks: f.pending, fileSystem: fs, saveDb: () => {} });
    const a = make(); const b = make();
    a.stageConversationConfig({ model: 'A', providerPresent: false }); a.applyStagedConversationConfig();
    b.stageConversationConfig({ model: 'B', providerPresent: false }); b.applyStagedConversationConfig();
    a.rollback(); assert.equal(f.conv.model, 'B');
    b.rollback(); assert.equal(f.conv.model, 'old');

    const c = make(); const d = make();
    c.stageConversationConfig({ model: 'C', providerPresent: false }); c.applyStagedConversationConfig();
    d.stageConversationConfig({ model: 'D', providerPresent: false }); d.applyStagedConversationConfig();
    c.commit(); d.rollback();
    assert.equal(f.conv.model, 'C');
    fs.rmSync(f.root, { recursive: true, force: true });
});

test('configuration rollback is field-owned and preserves unrelated external model/provider/profile changes', () => {
    const scenarios = [
        { external: conv => { conv.provider_id = 'external-provider'; }, expected: { model: 'old', provider_id: 'external-provider', credentialProfile: 'old-profile' } },
        { external: conv => { conv.model = 'external-model'; }, expected: { model: 'external-model', provider_id: 'old-provider', credentialProfile: 'old-profile' } },
        { external: conv => { conv.credentialProfile = 'external-profile'; }, expected: { model: 'old', provider_id: 'old-provider', credentialProfile: 'external-profile' } },
    ];
    for (const { external, expected } of scenarios) {
        const f = fixture(); f.conv.credentialProfile = 'old-profile';
        const tx = subject.createInputRequestTransaction({ db: f.db, conv: f.conv, conversationId: 'conv', pendingImageBlocks: f.pending, fileSystem: fs, saveDb: () => {} });
        tx.stageConversationConfig({ model: 'owned-model', providerPresent: true, providerId: 'owned-provider', credentialProfile: 'owned-profile' });
        tx.applyStagedConversationConfig();
        external(f.conv);
        tx.rollback();
        assert.deepEqual({ model: f.conv.model, provider_id: f.conv.provider_id, credentialProfile: f.conv.credentialProfile }, expected);
        fs.rmSync(f.root, { recursive: true, force: true });
    }
});

test('unlink failures are best effort and do not prevent later file or database rollback', () => {
    const f = fixture();
    const second = path.join(f.root, 'second.txt'); fs.writeFileSync(second, 'second');
    const row = { id: 'row' };
    const fakeFs = { unlinkSync(file) { if (file === f.created) { const error = new Error('denied'); error.code = 'EACCES'; throw error; } fs.unlinkSync(file); } };
    const tx = subject.createInputRequestTransaction({ db: f.db, conv: f.conv, conversationId: 'conv', pendingImageBlocks: f.pending, fileSystem: fakeFs, saveDb: () => f.saves.push('save') });
    tx.trackCreatedFile(f.created); tx.trackCreatedFile(second);
    tx.stageConversationConfig({ model: 'new', providerPresent: false }); tx.stageUserMessage(row); tx.persist(); tx.rollback();
    assert.equal(fs.existsSync(f.created), true);
    assert.equal(fs.existsSync(second), false);
    assert.deepEqual(f.db.messages, []);
    assert.equal(f.conv.model, 'old');
    assert.equal(f.saves.length, 2);
    fs.rmSync(f.root, { recursive: true, force: true });
});

test('rollback observes files appended by attachment processing even when processing throws before returning', () => {
    const f = fixture();
    const createdFiles = [];
    const tx = subject.createInputRequestTransaction({
        db: f.db, conv: f.conv, conversationId: 'conv', pendingImageBlocks: f.pending,
        fileSystem: fs, saveDb: () => {}, createdFiles,
    });
    createdFiles.push(f.created);
    tx.rollback();
    assert.equal(fs.existsSync(f.created), false);
    assert.equal(fs.readFileSync(f.existing, 'utf8'), 'keep');
    fs.rmSync(f.root, { recursive: true, force: true });
});

test('failed persistence removes the exact staged row, restores config, and persists rollback best-effort', () => {
    const f = fixture();
    let calls = 0;
    const tx = subject.createInputRequestTransaction({
        db: f.db, conv: f.conv, conversationId: 'conv', pendingImageBlocks: f.pending, fileSystem: fs,
        saveDb: () => { calls += 1; if (calls === 1) throw new Error('disk'); },
    });
    tx.stageConversationConfig({ model: 'new', providerPresent: false });
    tx.stageUserMessage({ id: 'user' });
    assert.throws(() => tx.commit(), /disk/);
    assert.deepEqual(f.db.messages, []);
    assert.equal(f.conv.model, 'old');
    assert.equal(calls, 2);
    fs.rmSync(f.root, { recursive: true, force: true });
});
