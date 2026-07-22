'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let subject = {};
try { subject = require('../input-evidence-gate.cjs'); } catch (_) {}

const availableAttachment = (attachment_index = 0, access = 'workspace_file') => ({
    kind: 'attachment', status: 'available', access,
    label: 'safe', reason: access === 'model_image' ? 'image_injected' : 'copied_to_workspace',
    attachment_index,
});

test('exports a pure input evidence validator', () => {
    assert.equal(typeof subject.validateInputEvidence, 'function');
});

test('ordinary text and placeholder-like prose or code are allowed', () => {
    const messages = [
        '请帮我解释这张图片是什么意思',
        '句中出现 [image] 不属于保留占位符。',
        '`[image]`',
        '```md\n[image]\n```',
        '```md\n~~~\n[image]\n~~~\n```',
        '````md\n```\n[image]\n``` trailing\n````',
        '~~~md\r[image]\r~~~',
        '    [image]',
        'before [图片 #2] after',
    ];
    for (const message of messages) {
        assert.deepEqual(subject.validateInputEvidence({ message, attachments: [], evidence: [] }), { ok: true });
    }
});

test('four reserved placeholder forms on an independent line require model image evidence', () => {
    for (const message of ['[image]', '[IMAGE #12]', '[图片]', '前文\n  [图片 #2]  \n后文']) {
        const result = subject.validateInputEvidence({ message, attachments: [], evidence: [] });
        assert.equal(result.ok, false);
        assert.equal(result.code, 'INPUT_IMAGE_EVIDENCE_REQUIRED');
        assert.deepEqual(result.details, { placeholderCount: 1, modelImageCount: 0, reason: 'model_image_missing' });
    }
    assert.deepEqual(
        subject.validateInputEvidence({ message: '[image]', attachments: [{ fileId: 'image' }], evidence: [availableAttachment(0, 'model_image')] }),
        { ok: true },
    );
});

test('placeholder mapping enforces image bounds, invalid reserved indices, and distinct anonymous slots', () => {
    const images = [availableAttachment(0, 'model_image'), availableAttachment(1, 'model_image')];
    const attachments = [{ fileId: 'a' }, { fileId: 'b' }];
    assert.deepEqual(subject.validateInputEvidence({ message: '[image #2]\n[image]', attachments, evidence: images }), { ok: true });
    assert.deepEqual(subject.validateInputEvidence({ message: '[image #1]\n[image #1]', attachments: [attachments[0]], evidence: [images[0]] }), { ok: true }, 'numbered references may repeat');
    for (const message of ['[image]\n[image]', '[image #2]', '[image #1]\n[image]']) {
        const result = subject.validateInputEvidence({ message, attachments: [attachments[0]], evidence: [images[0]] });
        assert.equal(result.code, 'INPUT_IMAGE_EVIDENCE_REQUIRED');
    }
    for (const message of ['[image #0]', '[image #0001]', '[图片 #0000]', '[image #1000]']) {
        const result = subject.validateInputEvidence({ message, attachments: [], evidence: [] });
        assert.equal(result.code, 'INPUT_EVIDENCE_INCONSISTENT');
        assert.equal(result.details.reason, 'invalid_placeholder_index');
    }
});

test('every structured attachment requires one available attachment evidence entry', () => {
    assert.deepEqual(subject.validateInputEvidence({
        message: 'two files', attachments: [{ fileId: 'a' }, { fileId: 'b' }],
        evidence: [availableAttachment(0), availableAttachment(1, 'model_image')],
    }), { ok: true });

    const result = subject.validateInputEvidence({
        message: 'missing file', attachments: [{ fileId: 'secret-name.txt' }],
        evidence: [{ ...availableAttachment(0), status: 'unavailable', access: 'none', reason: 'missing_source', label: 'secret-name.txt' }],
    });
    assert.equal(result.code, 'INPUT_ATTACHMENT_EVIDENCE_MISSING');
    assert.deepEqual(result.details, { attachmentCount: 1, availableAttachmentCount: 0, reason: 'attachment_evidence_missing' });
    assert.doesNotMatch(JSON.stringify(result), /secret-name|missing_source|workspace|\\|\//);
});

test('unknown evidence states and count mismatches are rejected with redacted stable details', () => {
    for (const evidence of [
        [{ ...availableAttachment(0), status: 'pending', label: 'private.txt' }],
        [{ ...availableAttachment(0), access: 'none', label: 'private.txt' }],
        [availableAttachment(0), availableAttachment(0)],
        [availableAttachment(1)],
    ]) {
        const result = subject.validateInputEvidence({ message: 'one', attachments: [{ fileId: 'one' }], evidence });
        assert.equal(result.code, 'INPUT_EVIDENCE_INCONSISTENT');
        assert.ok(Object.isFrozen(result));
        assert.ok(Object.isFrozen(result.details));
        assert.doesNotMatch(JSON.stringify(result), /private|pending|one|fileId/);
    }
});

test('attachment identity uses original structured indices and skips virtual github entries', () => {
    const attachments = [{ source: 'github' }, { fileId: 'real' }];
    assert.deepEqual(subject.validateInputEvidence({ message: 'ok', attachments, evidence: [availableAttachment(1)] }), { ok: true });
    for (const evidence of [[availableAttachment(0)], [availableAttachment(1), availableAttachment(1)]]) {
        assert.equal(subject.validateInputEvidence({ message: 'bad', attachments, evidence }).code, 'INPUT_EVIDENCE_INCONSISTENT');
    }
});

test('present attachments and evidence fields must be arrays', () => {
    assert.equal(subject.validateInputEvidence({ message: 'x', attachments: {}, evidence: [] }).code, 'INPUT_EVIDENCE_INCONSISTENT');
    assert.equal(subject.validateInputEvidence({ message: 'x', attachments: [], evidence: {} }).code, 'INPUT_EVIDENCE_INCONSISTENT');
});

test('bridge validates before persistence, research, engine spawn, or stdin and rolls back only request-owned effects', () => {
    const bridge = fs.readFileSync(path.join(__dirname, '..', 'bridge-server.cjs'), 'utf8');
    const start = bridge.indexOf("server.post('/api/chat'");
    const gate = bridge.indexOf('validateInputEvidence({', start);
    assert.ok(gate > start);
    for (const marker of ['db.messages.push({', 'runResearchPipeline({', 'spawnPersistentEngine(', 'writeEngineInput(engine.child.stdin']) {
        assert.ok(gate < bridge.indexOf(marker, gate), `${marker} must happen after the gate`);
    }
    assert.match(bridge.slice(start), /createInputRequestTransaction/);
    assert.match(bridge.slice(start), /trackPendingImageBlock/);
    assert.match(bridge.slice(start), /requestCreatedFiles/);
    assert.match(bridge.slice(start), /rejectInputEvidence/);
    assert.ok(bridge.indexOf('validateInputEvidence({', start) < bridge.indexOf('res.flushHeaders()', start));
    assert.ok(gate < bridge.indexOf('inputTransaction.applyStagedConversationConfig()', gate));
    const stdin = bridge.indexOf('writeEngineInput(engine.child.stdin', gate);
    const persist = bridge.indexOf('inputTransaction.persist()', gate);
    assert.ok(persist > gate && persist < stdin);
    assert.ok(stdin < bridge.indexOf('inputTransaction.commit()', stdin));
    assert.ok(bridge.indexOf('inputTransaction.rollback()', stdin) > stdin);
});
