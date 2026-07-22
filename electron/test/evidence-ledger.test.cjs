'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let subject = {};
try { subject = require('../evidence-ledger.cjs'); } catch (_) {}

test('exports the evidence ledger behavior', () => {
    assert.equal(typeof subject.createEvidenceLedger, 'function');
    assert.equal(typeof subject.processAttachmentEvidence, 'function');
});

test('accepts only the evidence schema and allowed enum values', () => {
    const ledger = subject.createEvidenceLedger();
    const valid = { kind: 'user_text', status: 'available', access: 'text_supplied', label: '用户消息', reason: 'user_text_supplied' };
    assert.deepEqual(ledger.record(valid), valid);
    assert.throws(() => ledger.record({ ...valid, content: 'secret' }), /未知字段/);
    assert.throws(() => ledger.record({ ...valid, access: 'raw_file' }), /access/);
    assert.throws(() => ledger.record({ ...valid, reason: 'anything' }), /reason/);
    assert.throws(() => ledger.record({ ...valid, label: 'C:\\Users\\me\\secret.txt' }), /绝对路径/);
    assert.throws(() => ledger.record({ ...valid, label: '/home/me/secret.txt' }), /绝对路径/);
    assert.throws(() => ledger.record({ ...valid, label: '附件 C:\\Users\\me\\secret.txt' }), /绝对路径/);
    assert.throws(() => ledger.record({ ...valid, label: '附件 \\\\server\\share\\secret.txt' }), /绝对路径/);
    assert.throws(() => ledger.record({ ...valid, label: '附件 /home/me/secret.txt' }), /绝对路径/);
    assert.throws(() => ledger.record({ ...valid, label: 'prefix /home/me/secret.txt' }), /绝对路径/);
    assert.throws(() => ledger.record({ ...valid, label: 'docs/../secret.txt' }), /label/);
    assert.equal(ledger.record({ ...valid, label: 'docs/report.md' }).label, 'docs/report.md');
});

test('attachment evidence requires a non-negative attachment_index while other evidence may omit it', () => {
    const ledger = subject.createEvidenceLedger();
    const base = { kind: 'attachment', status: 'available', access: 'workspace_file', label: 'safe', reason: 'copied_to_workspace' };
    assert.throws(() => ledger.record(base), /attachment_index/);
    assert.throws(() => ledger.record({ ...base, attachment_index: -1 }), /attachment_index/);
    assert.throws(() => ledger.record({ ...base, attachment_index: 1.5 }), /attachment_index/);
    assert.equal(ledger.record({ ...base, attachment_index: 3 }).attachment_index, 3);
    assert.equal(ledger.record({ kind: 'user_text', status: 'available', access: 'text_supplied', label: 'text', reason: 'user_text_supplied' }).kind, 'user_text');
});

test('attachment processing records its original structured attachment index', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-index-'));
    const uploads = path.join(root, '.uploads');
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(uploads); fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(uploads, 'doc'), 'hello');
    const ledger = subject.createEvidenceLedger();
    subject.processAttachmentEvidence({ attachment: { fileId: 'doc', fileName: 'doc.txt' }, attachmentIndex: 7, uploadRoots: [uploads], workspacePath: workspace, ledger, pendingImageBlocks: [] });
    assert.equal(ledger.snapshot()[0].attachment_index, 7);
    fs.rmSync(root, { recursive: true, force: true });
});

test('limits entries and labels by Unicode code points', () => {
    const ledger = subject.createEvidenceLedger();
    const entry = { kind: 'attachment', status: 'available', access: 'workspace_file', label: '😀'.repeat(161), reason: 'copied_to_workspace', attachment_index: 0 };
    const recorded = ledger.record(entry);
    assert.equal([...recorded.label].length, 160);
    for (let i = 1; i < 64; i += 1) ledger.record({ ...entry, label: `file-${i}` });
    assert.throws(() => ledger.record({ ...entry, label: 'overflow' }), /64/);
});

test('returns a deeply immutable detached snapshot', () => {
    const ledger = subject.createEvidenceLedger();
    ledger.record({ kind: 'user_text', status: 'available', access: 'text_supplied', label: '用户消息', reason: 'user_text_supplied' });
    const snapshot = ledger.snapshot();
    assert.ok(Object.isFrozen(snapshot));
    assert.ok(Object.isFrozen(snapshot[0]));
    assert.throws(() => snapshot[0].label = 'changed', TypeError);
    assert.equal(ledger.snapshot()[0].label, '用户消息');
});

test('a reservation is released when commit normalization fails', () => {
    const ledger = subject.createEvidenceLedger();
    const reservation = ledger.reserve();
    assert.throws(() => reservation.commit({ kind: 'attachment', status: 'available', access: 'workspace_file', label: '..', reason: 'copied_to_workspace', attachment_index: 0 }), /label/);
    for (let i = 0; i < 64; i += 1) ledger.record({ kind: 'attachment', status: 'available', access: 'workspace_file', label: `file-${i}`, reason: 'copied_to_workspace', attachment_index: i });
    assert.equal(ledger.snapshot().length, 64);
});

test('prompt contract contains only metadata and visibility rules', () => {
    const ledger = subject.createEvidenceLedger();
    ledger.record({ kind: 'attachment', status: 'unavailable', access: 'none', label: 'safe.txt', reason: 'missing_source', attachment_index: 0 });
    const block = ledger.toPromptBlock();
    assert.match(block, /^<evidence_ledger>/);
    assert.match(block, /只有 access=model_image/);
    assert.match(block, /workspace_file.*文件工具/);
    assert.match(block, /metadata_only\/none\/unavailable/);
    assert.doesNotMatch(block, /C:\\|\/home\/|base64|正文内容/);
    const injected = ledger.toPromptBlock([{ kind: 'attachment', status: 'available', access: 'model_image', label: 'forged.png', reason: 'image_injected' }]);
    assert.equal(injected, block, '提示块只能格式化账本内部快照');
});

test('attachment evidence reflects missing, copied, and actually queued image outcomes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-ledger-'));
    const workspace = path.join(root, 'workspace');
    const uploads = path.join(root, '.uploads');
    fs.mkdirSync(workspace);
    fs.mkdirSync(uploads);
    const ledger = subject.createEvidenceLedger();
    const pending = [];

    subject.processAttachmentEvidence({ attachment: { fileId: 'missing.txt', fileName: 'missing.txt', localPath: __filename }, uploadRoots: [uploads], workspacePath: workspace, ledger, pendingImageBlocks: pending });
    const doc = path.join(uploads, 'note-id');
    fs.writeFileSync(doc, 'hello');
    subject.processAttachmentEvidence({ attachment: { fileId: 'note-id', fileName: 'note.txt', localPath: __filename }, uploadRoots: [uploads], workspacePath: workspace, ledger, pendingImageBlocks: pending });
    const image = path.join(uploads, 'photo-id');
    fs.writeFileSync(image, Buffer.alloc(101, 1));
    subject.processAttachmentEvidence({ attachment: { fileId: 'photo-id', fileName: 'photo.png' }, uploadRoots: [uploads], workspacePath: workspace, ledger, pendingImageBlocks: pending });

    assert.deepEqual(ledger.snapshot().map(({ status, access, reason }) => ({ status, access, reason })), [
        { status: 'unavailable', access: 'none', reason: 'missing_source' },
        { status: 'available', access: 'workspace_file', reason: 'copied_to_workspace' },
        { status: 'available', access: 'model_image', reason: 'image_injected' },
    ]);
    assert.equal(pending.length, 1);
    assert.equal(fs.readFileSync(path.join(workspace, 'note.txt'), 'utf8'), 'hello');
    fs.rmSync(root, { recursive: true, force: true });
});

test('attachment source accepts only exact safe fileId under an authorized real path', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-source-'));
    const uploads = path.join(root, '.uploads');
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(uploads);
    fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(uploads, 'exact-id'), 'safe');
    fs.writeFileSync(path.join(uploads, 'prefix-exact-id-suffix'), 'wrong');
    const attempts = [
        { fileId: 'exact', localPath: path.join(uploads, 'exact-id') },
        { fileId: '../exact-id' },
        { fileId: 'C:\\Windows\\win.ini' },
        { fileId: '/etc/passwd' },
        { fileId: '', localPath: __filename },
    ];
    for (const attachment of attempts) {
        const ledger = subject.createEvidenceLedger();
        const result = subject.processAttachmentEvidence({ attachment: { ...attachment, fileName: 'safe.txt' }, uploadRoots: [uploads], workspacePath: workspace, ledger, pendingImageBlocks: [] });
        assert.equal(result.status, 'unavailable');
    }
    assert.equal(fs.existsSync(path.join(workspace, 'safe.txt')), false);

    const fakeFs = {
        existsSync: () => true,
        realpathSync: value => value === uploads ? uploads : path.join(root, 'escaped', 'secret'),
        lstatSync: () => ({ isSymbolicLink: () => true }),
    };
    const ledger = subject.createEvidenceLedger();
    const escaped = subject.processAttachmentEvidence({ attachment: { fileId: 'exact-id', fileName: 'safe.txt' }, uploadRoots: [uploads], workspacePath: workspace, ledger, pendingImageBlocks: [], fileSystem: fakeFs });
    assert.equal(escaped.reason, 'unsafe_source');
    fs.rmSync(root, { recursive: true, force: true });
});

test('accepts exact legacy Unicode basenames but rejects every path form', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-legacy-'));
    const uploads = path.join(root, '.uploads');
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(uploads);
    fs.mkdirSync(workspace);
    const legacy = '1720000000000-中文 报告.txt';
    fs.writeFileSync(path.join(uploads, legacy), 'legacy');
    const accepted = subject.processAttachmentEvidence({ attachment: { fileId: legacy, fileName: 'report.txt' }, uploadRoots: [uploads], workspacePath: workspace, ledger: subject.createEvidenceLedger(), pendingImageBlocks: [] });
    assert.equal(accepted.access, 'workspace_file');
    assert.equal(fs.readFileSync(path.join(workspace, 'report.txt'), 'utf8'), 'legacy');
    for (const fileId of ['', '.', '..', 'a/b', 'a\\b', 'C:secret', '/abs', '\\\\server\\share', 'bad\u0001name', '😀'.repeat(256)]) {
        const result = subject.processAttachmentEvidence({ attachment: { fileId, fileName: 'bad.txt' }, uploadRoots: [uploads], workspacePath: workspace, ledger: subject.createEvidenceLedger(), pendingImageBlocks: [] });
        assert.equal(result.reason, 'invalid_file_id', fileId);
    }
    fs.rmSync(root, { recursive: true, force: true });
});

test('rejects a symlink or junction upload root and a candidate swapped between lstat and open', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-race-'));
    const uploads = path.join(root, '.uploads');
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(uploads);
    fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(uploads, 'candidate'), 'safe');
    const reparseFs = Object.create(fs);
    reparseFs.lstatSync = value => value === uploads ? { isSymbolicLink: () => true, isDirectory: () => true } : fs.lstatSync(value);
    const reparse = subject.processAttachmentEvidence({ attachment: { fileId: 'candidate', fileName: 'out.txt' }, uploadRoots: [uploads], workspacePath: workspace, ledger: subject.createEvidenceLedger(), pendingImageBlocks: [], fileSystem: reparseFs });
    assert.equal(reparse.reason, 'unsafe_source');
    const replacement = path.join(uploads, 'replacement');
    fs.writeFileSync(replacement, 'evil');
    const racingFs = Object.create(fs);
    let closed = 0;
    racingFs.openSync = (value, flags) => {
        fs.rmSync(value);
        fs.renameSync(replacement, value);
        return fs.openSync(value, flags);
    };
    racingFs.closeSync = fd => { closed += 1; fs.closeSync(fd); };
    const raced = subject.processAttachmentEvidence({ attachment: { fileId: 'candidate', fileName: 'out.txt' }, uploadRoots: [uploads], workspacePath: workspace, ledger: subject.createEvidenceLedger(), pendingImageBlocks: [], fileSystem: racingFs });
    assert.equal(raced.reason, 'unsafe_source');
    assert.equal(closed, 1, '身份不一致时也必须关闭已打开句柄');
    assert.equal(fs.existsSync(path.join(workspace, 'out.txt')), false);
    fs.rmSync(root, { recursive: true, force: true });
});

test('rejects when the upload root identity changes after its initial lstat', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-root-race-'));
    const uploads = path.join(root, '.uploads');
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(uploads);
    fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(uploads, 'candidate'), 'safe');
    const changingFs = Object.create(fs);
    let rootChecks = 0;
    changingFs.lstatSync = value => {
        if (value === uploads && ++rootChecks > 1) return { isSymbolicLink: () => true, isDirectory: () => true };
        return fs.lstatSync(value);
    };
    const result = subject.processAttachmentEvidence({ attachment: { fileId: 'candidate', fileName: 'out.txt' }, uploadRoots: [uploads], workspacePath: workspace, ledger: subject.createEvidenceLedger(), pendingImageBlocks: [], fileSystem: changingFs });
    assert.equal(result.reason, 'unsafe_source');
    assert.equal(fs.existsSync(path.join(workspace, 'out.txt')), false);
    fs.rmSync(root, { recursive: true, force: true });
});

test('rejects when the upload root changes during the bounded read', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-root-read-race-'));
    const uploads = path.join(root, '.uploads');
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(uploads);
    fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(uploads, 'candidate'), 'safe');
    const changingFs = Object.create(fs);
    let changed = false;
    changingFs.readSync = (...args) => { changed = true; return fs.readSync(...args); };
    changingFs.lstatSync = value => {
        if (value === uploads && changed) {
            const stat = fs.lstatSync(value);
            return { ...stat, dev: stat.dev + 1, isSymbolicLink: () => false, isDirectory: () => true };
        }
        return fs.lstatSync(value);
    };
    const result = subject.processAttachmentEvidence({ attachment: { fileId: 'candidate', fileName: 'out.txt' }, uploadRoots: [uploads], workspacePath: workspace, ledger: subject.createEvidenceLedger(), pendingImageBlocks: [], fileSystem: changingFs });
    assert.equal(result.reason, 'unsafe_source');
    assert.equal(fs.existsSync(path.join(workspace, 'out.txt')), false);
    fs.rmSync(root, { recursive: true, force: true });
});

test('rejects oversized sources without copying', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-size-'));
    const uploads = path.join(root, '.uploads');
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(uploads);
    fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(uploads, 'large'), Buffer.alloc(33));
    const result = subject.processAttachmentEvidence({ attachment: { fileId: 'large', fileName: 'large.bin' }, uploadRoots: [uploads], workspacePath: workspace, ledger: subject.createEvidenceLedger(), pendingImageBlocks: [], maxBytes: 32 });
    assert.equal(result.reason, 'file_too_large');
    assert.equal(fs.existsSync(path.join(workspace, 'large.bin')), false);
    fs.rmSync(root, { recursive: true, force: true });
});

test('bounds reads to maxBytes plus one when a file grows after fstat', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-growth-'));
    const uploads = path.join(root, '.uploads');
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(uploads);
    fs.mkdirSync(workspace);
    const candidate = path.join(uploads, 'growing');
    fs.writeFileSync(candidate, Buffer.alloc(16, 1));
    const growingFs = Object.create(fs);
    let fstats = 0;
    let bytesRead = 0;
    let largestRequest = 0;
    let pathReadUsed = false;
    growingFs.fstatSync = fd => {
        const stat = fs.fstatSync(fd);
        fstats += 1;
        if (fstats === 2) fs.appendFileSync(candidate, Buffer.alloc(128, 2));
        return stat;
    };
    growingFs.readSync = (fd, buffer, offset, length, position) => {
        largestRequest = Math.max(largestRequest, length);
        const count = fs.readSync(fd, buffer, offset, length, position);
        bytesRead += count;
        return count;
    };
    growingFs.readFileSync = () => { pathReadUsed = true; throw new Error('unbounded read forbidden'); };
    const result = subject.processAttachmentEvidence({ attachment: { fileId: 'growing', fileName: 'large.bin' }, uploadRoots: [uploads], workspacePath: workspace, ledger: subject.createEvidenceLedger(), pendingImageBlocks: [], fileSystem: growingFs, maxBytes: 32 });
    assert.equal(result.reason, 'file_too_large');
    assert.equal(pathReadUsed, false);
    assert.ok(bytesRead <= 33, `read ${bytesRead} bytes`);
    assert.ok(largestRequest <= 33, `requested ${largestRequest} bytes`);
    assert.equal(fs.existsSync(path.join(workspace, 'large.bin')), false);
    fs.rmSync(root, { recursive: true, force: true });
});

test('small images stay workspace files with a truthful stable reason', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-small-'));
    const uploads = path.join(root, '.uploads');
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(uploads);
    fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(uploads, 'small-id'), Buffer.alloc(100, 1));
    const ledger = subject.createEvidenceLedger();
    const pending = [];
    const result = subject.processAttachmentEvidence({ attachment: { fileId: 'small-id', fileName: 'small.png' }, uploadRoots: [uploads], workspacePath: workspace, ledger, pendingImageBlocks: pending });
    assert.deepEqual({ status: result.status, access: result.access, reason: result.reason }, { status: 'available', access: 'workspace_file', reason: 'image_too_small' });
    assert.equal(pending.length, 0);
    fs.rmSync(root, { recursive: true, force: true });
});

test('readable images not given a queue stay workspace files as not injected', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-no-queue-'));
    const uploads = path.join(root, '.uploads');
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(uploads);
    fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(uploads, 'photo-id'), Buffer.alloc(101, 1));
    const ledger = subject.createEvidenceLedger();
    const result = subject.processAttachmentEvidence({ attachment: { fileId: 'photo-id', fileName: 'photo.png' }, uploadRoots: [uploads], workspacePath: workspace, ledger });
    assert.equal(result.reason, 'image_not_injected');
    assert.equal(result.access, 'workspace_file');
    fs.rmSync(root, { recursive: true, force: true });
});

test('image queue and ledger stay consistent when the ledger is full', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-atomic-'));
    const uploads = path.join(root, '.uploads');
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(uploads);
    fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(uploads, 'photo-id'), Buffer.alloc(101, 1));
    const ledger = subject.createEvidenceLedger();
    for (let i = 0; i < 64; i += 1) ledger.record({ kind: 'attachment', status: 'available', access: 'workspace_file', label: `file-${i}`, reason: 'copied_to_workspace', attachment_index: i });
    const pending = [];
    assert.throws(() => subject.processAttachmentEvidence({ attachment: { fileId: 'photo-id', fileName: 'photo.png' }, uploadRoots: [uploads], workspacePath: workspace, ledger, pendingImageBlocks: pending }), /64/);
    assert.equal(pending.length, 0);
    assert.equal(ledger.snapshot().length, 64);
    assert.equal(fs.existsSync(path.join(workspace, 'photo.png')), false);
    fs.rmSync(root, { recursive: true, force: true });
});

test('a full ledger rejects a regular file before creating its destination', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-full-doc-'));
    const uploads = path.join(root, '.uploads');
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(uploads);
    fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(uploads, 'doc-id'), 'hello');
    const ledger = subject.createEvidenceLedger();
    for (let i = 0; i < 64; i += 1) ledger.record({ kind: 'attachment', status: 'available', access: 'workspace_file', label: `file-${i}`, reason: 'copied_to_workspace', attachment_index: i });
    assert.throws(() => subject.processAttachmentEvidence({ attachment: { fileId: 'doc-id', fileName: 'doc.txt' }, uploadRoots: [uploads], workspacePath: workspace, ledger, pendingImageBlocks: [] }), /64/);
    assert.equal(fs.existsSync(path.join(workspace, 'doc.txt')), false);
    assert.equal(ledger.snapshot().length, 64);
    fs.rmSync(root, { recursive: true, force: true });
});

test('write and image queue failures preserve truthful ledger state without deleting existing files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-side-effects-'));
    const uploads = path.join(root, '.uploads');
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(uploads);
    fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(uploads, 'doc-id'), 'hello');
    const writeFs = Object.create(fs);
    writeFs.writeFileSync = () => { throw new Error('private path must not escape'); };
    const writeLedger = subject.createEvidenceLedger();
    const writeResult = subject.processAttachmentEvidence({ attachment: { fileId: 'doc-id', fileName: 'doc.txt' }, uploadRoots: [uploads], workspacePath: workspace, ledger: writeLedger, pendingImageBlocks: [], fileSystem: writeFs });
    assert.equal(writeResult.reason, 'copy_failed');
    assert.equal(writeLedger.snapshot().length, 1);

    fs.writeFileSync(path.join(uploads, 'photo-id'), Buffer.alloc(101, 1));
    fs.writeFileSync(path.join(workspace, 'existing.txt'), 'keep');
    const throwingQueue = [];
    throwingQueue.push = function (value) { Array.prototype.push.call(this, value); throw new Error('queue failed'); };
    const imageLedger = subject.createEvidenceLedger();
    const imageResult = subject.processAttachmentEvidence({ attachment: { fileId: 'photo-id', fileName: 'photo.png' }, uploadRoots: [uploads], workspacePath: workspace, ledger: imageLedger, pendingImageBlocks: throwingQueue });
    assert.equal(imageResult.reason, 'image_not_injected');
    assert.equal(imageResult.access, 'workspace_file');
    assert.equal(imageLedger.snapshot().length, 1);
    assert.equal(throwingQueue.length, 0);
    assert.equal(fs.readFileSync(path.join(workspace, 'existing.txt'), 'utf8'), 'keep');
    fs.rmSync(root, { recursive: true, force: true });
});

test('an invalid attachment label terminates its reservation before file side effects', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-invalid-label-'));
    const uploads = path.join(root, '.uploads');
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(uploads);
    fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(uploads, 'doc-id'), 'hello');
    const ledger = subject.createEvidenceLedger();
    const result = subject.processAttachmentEvidence({ attachment: { fileId: 'doc-id', fileName: '..' }, uploadRoots: [uploads], workspacePath: workspace, ledger, pendingImageBlocks: [] });
    assert.equal(result.reason, 'invalid_label');
    assert.equal(fs.readdirSync(workspace).length, 0);
    for (let i = 1; i < 64; i += 1) ledger.record({ kind: 'attachment', status: 'available', access: 'workspace_file', label: `file-${i}`, reason: 'copied_to_workspace', attachment_index: i });
    assert.equal(ledger.snapshot().length, 64);
    fs.rmSync(root, { recursive: true, force: true });
});

test('bridge creates the ledger inside each chat request before recording evidence', () => {
    const bridge = fs.readFileSync(path.join(__dirname, '..', 'bridge-server.cjs'), 'utf8');
    const chatStart = bridge.indexOf("server.post('/api/chat'");
    const ledgerCreation = bridge.indexOf('const evidenceLedger = createEvidenceLedger();', chatStart);
    const firstRecord = bridge.indexOf('evidenceLedger.record({', chatStart);
    assert.ok(chatStart >= 0);
    assert.ok(ledgerCreation > chatStart, '账本必须在聊天请求作用域内创建');
    assert.ok(firstRecord > ledgerCreation, '账本必须先创建再记录');
    assert.doesNotMatch(bridge, /GitHub context inject failed:', e\.message/, '失败日志不得泄露本地错误路径');
    assert.doesNotMatch(bridge, /att\.localPath|includes\(att\.fileId\)/, '桥接不得信任 localPath 或模糊匹配 fileId');
    assert.match(bridge, /filename:[\s\S]{0,160}cb\(null, uuidv4\(\)\)/, '上传端必须生成符合安全格式的服务端 fileId');
    assert.match(bridge, /query:\s*finalPrompt/, '研究分流必须接收包含证据合约的最终提示');
});
