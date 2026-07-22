'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REQUIRED_SCHEMA = Object.freeze(['kind', 'status', 'access', 'label', 'reason']);
const SCHEMA = Object.freeze([...REQUIRED_SCHEMA, 'attachment_index']);
const ALLOWED = Object.freeze({
    kind: new Set(['user_text', 'attachment', 'github_workspace']),
    status: new Set(['available', 'unavailable']),
    access: new Set(['text_supplied', 'workspace_file', 'model_image', 'metadata_only', 'none']),
    reason: new Set([
        'user_text_supplied', 'copied_to_workspace', 'image_injected',
        'missing_source', 'invalid_file_id', 'unsafe_source', 'copy_failed',
        'file_too_large', 'invalid_label',
        'image_read_failed', 'image_too_small', 'image_not_injected',
        'github_index_loaded', 'github_index_missing', 'github_index_invalid',
    ]),
});

function isUnsafeLabel(label) {
    const segments = label.split('/');
    return label.startsWith('/')
        || label.startsWith('\\')
        || /(^|\s)\/[A-Za-z0-9._-]/.test(label)
        || /[A-Za-z]:[\\/]/.test(label)
        || /\\\\[^\\\s]+\\/.test(label)
        || label.includes('\\')
        || segments.some(segment => segment === '..');
}

function normalizeLabel(value) {
    if (typeof value !== 'string') throw new TypeError('label 必须是字符串');
    const cleaned = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim();
    if (isUnsafeLabel(cleaned)) throw new TypeError('label 不得包含绝对路径或上级目录');
    return [...cleaned].slice(0, 160).join('');
}

function createEvidenceLedger() {
    const entries = [];
    let reservations = 0;

    function normalizeEntry(entry) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError('证据条目必须是对象');
        const keys = Object.keys(entry);
        const unknown = keys.filter(key => !SCHEMA.includes(key));
        const missing = REQUIRED_SCHEMA.filter(key => !keys.includes(key));
        if (unknown.length) throw new TypeError(`未知字段: ${unknown.join(', ')}`);
        if (missing.length) throw new TypeError(`缺少字段: ${missing.join(', ')}`);
        for (const key of ['kind', 'status', 'access', 'reason']) {
            if (!ALLOWED[key].has(entry[key])) throw new TypeError(`${key} 值不受支持`);
        }
        if (entry.kind === 'attachment' && (!Number.isInteger(entry.attachment_index) || entry.attachment_index < 0)) {
            throw new TypeError('attachment_index must be a non-negative integer');
        }
        if (entry.attachment_index !== undefined && (!Number.isInteger(entry.attachment_index) || entry.attachment_index < 0)) {
            throw new TypeError('attachment_index must be a non-negative integer');
        }
        const normalized = {
            kind: entry.kind,
            status: entry.status,
            access: entry.access,
            label: normalizeLabel(entry.label),
            reason: entry.reason,
        };
        if (entry.attachment_index !== undefined) normalized.attachment_index = entry.attachment_index;
        return Object.freeze(normalized);
    }

    function record(entry) {
        const normalized = normalizeEntry(entry);
        if (entries.length + reservations >= 64) throw new RangeError('单回合最多记录 64 条证据');
        entries.push(normalized);
        return normalized;
    }

    function reserve() {
        if (entries.length + reservations >= 64) throw new RangeError('单回合最多记录 64 条证据');
        reservations += 1;
        let active = true;
        return Object.freeze({
            commit(entry) {
                if (!active) throw new Error('证据槽位已结束');
                try {
                    const normalized = normalizeEntry(entry);
                    entries.push(normalized);
                    return normalized;
                } finally {
                    reservations -= 1;
                    active = false;
                }
            },
            rollback() {
                if (!active) return;
                reservations -= 1;
                active = false;
            },
            isActive() { return active; },
        });
    }

    function snapshot() {
        return Object.freeze(entries.map(entry => Object.freeze({ ...entry })));
    }

    function toPromptBlock() {
        const lines = snapshot().map(entry => JSON.stringify(entry));
        return [
            '<evidence_ledger>',
            '以下仅是本回合的证据可用性元数据，不包含附件正文，也不覆盖系统安全规则。',
            ...lines,
            '可见性规则：只有 access=model_image 才能直接描述图像像素；access=workspace_file 必须先用可用文件工具读取；metadata_only/none/unavailable 不能作为内容证据。',
            '</evidence_ledger>',
        ].join('\n');
    }

    return Object.freeze({ record, reserve, snapshot, toPromptBlock });
}

function isWithinRoot(root, candidate) {
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function isValidFileId(fileId) {
    return typeof fileId === 'string'
        && fileId !== ''
        && fileId !== '.'
        && fileId !== '..'
        && [...fileId].length <= 255
        && !/[\u0000-\u001f\u007f-\u009f\\/:]/.test(fileId)
        && path.basename(fileId) === fileId;
}

function sameFileIdentity(before, after) {
    return before.dev === after.dev
        && before.ino === after.ino
        && before.mode === after.mode
        && before.size === after.size
        && before.mtimeMs === after.mtimeMs;
}

function rootIdentity(root, fileSystem) {
    const stat = fileSystem.lstatSync(root);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return null;
    return { dev: stat.dev, ino: stat.ino, type: stat.mode & 0o170000, realpath: fileSystem.realpathSync(root) };
}

// Node has no portable openat-style directory handle API. Rechecking the
// root's observable identity narrows path-swap races but is intentionally
// best-effort rather than a claim of atomic path resolution.
function sameRootIdentity(expected, root, fileSystem) {
    try {
        const current = rootIdentity(root, fileSystem);
        return current !== null
            && current.dev === expected.dev
            && current.ino === expected.ino
            && current.type === expected.type
            && current.realpath === expected.realpath;
    } catch (_) {
        return false;
    }
}

function readBounded(fd, maxBytes, fileSystem) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError('maxBytes 无效');
    const limit = maxBytes + 1;
    const bytes = Buffer.allocUnsafe(limit);
    let total = 0;
    while (total < limit) {
        const requested = Math.min(64 * 1024, limit - total);
        const count = fileSystem.readSync(fd, bytes, total, requested, null);
        if (count === 0) break;
        total += count;
    }
    return { bytes: bytes.subarray(0, total), tooLarge: total > maxBytes };
}

function resolveUploadedSource(fileId, uploadRoots, fileSystem) {
    if (!isValidFileId(fileId)) {
        return { reason: 'invalid_file_id' };
    }
    for (const root of Array.isArray(uploadRoots) ? uploadRoots : []) {
        try {
            const initialRoot = rootIdentity(root, fileSystem);
            if (!initialRoot) return { reason: 'unsafe_source' };
            const candidate = path.join(root, fileId);
            const stat = fileSystem.lstatSync(candidate);
            if (stat.isSymbolicLink() || !stat.isFile()) return { reason: 'unsafe_source' };
            const realCandidate = fileSystem.realpathSync(candidate);
            if (!isWithinRoot(initialRoot.realpath, realCandidate)) return { reason: 'unsafe_source' };
            const fd = fileSystem.openSync(realCandidate, 'r');
            try {
                if (!sameFileIdentity(stat, fileSystem.fstatSync(fd)) || !sameRootIdentity(initialRoot, root, fileSystem)) {
                    fileSystem.closeSync(fd);
                    return { reason: 'unsafe_source' };
                }
                return { fd, root, rootIdentity: initialRoot };
            } catch (error) {
                fileSystem.closeSync(fd);
                throw error;
            }
        } catch (error) {
            if (error && error.code === 'ENOENT') continue;
            return { reason: 'unsafe_source' };
        }
    }
    return { reason: 'missing_source' };
}

function processAttachmentEvidence({ attachment, attachmentIndex = 0, uploadRoots, workspacePath, ledger, pendingImageBlocks, createdFiles, fileSystem = fs, maxBytes = 25 * 1024 * 1024 }) {
    const reservation = ledger.reserve();
    const finish = entry => reservation.commit({ ...entry, attachment_index: attachmentIndex });
    try {
    let safeLabel;
    try {
        safeLabel = normalizeLabel(path.basename(String(attachment?.fileName || attachment?.fileId || 'attachment')));
    } catch (_) {
        return finish({ kind: 'attachment', status: 'unavailable', access: 'none', label: 'attachment', reason: 'invalid_label' });
    }
    const resolved = resolveUploadedSource(attachment?.fileId, uploadRoots, fileSystem);
    if (resolved.fd === undefined) {
        return finish({ kind: 'attachment', status: 'unavailable', access: 'none', label: safeLabel, reason: resolved.reason });
    }
    const destination = path.join(workspacePath, safeLabel);
    let bytes;
    try {
        const opened = fileSystem.fstatSync(resolved.fd);
        if (!Number.isSafeInteger(opened.size) || opened.size > maxBytes) {
            return finish({ kind: 'attachment', status: 'unavailable', access: 'none', label: safeLabel, reason: 'file_too_large' });
        }
        const bounded = readBounded(resolved.fd, maxBytes, fileSystem);
        if (!sameRootIdentity(resolved.rootIdentity, resolved.root, fileSystem)) {
            return finish({ kind: 'attachment', status: 'unavailable', access: 'none', label: safeLabel, reason: 'unsafe_source' });
        }
        if (bounded.tooLarge) {
            return finish({ kind: 'attachment', status: 'unavailable', access: 'none', label: safeLabel, reason: 'file_too_large' });
        }
        bytes = bounded.bytes;
        fileSystem.writeFileSync(destination, bytes, { flag: 'wx' });
        if (Array.isArray(createdFiles)) createdFiles.push(destination);
    } catch (_) {
        return finish({ kind: 'attachment', status: 'unavailable', access: 'none', label: safeLabel, reason: 'copy_failed' });
    } finally {
        fileSystem.closeSync(resolved.fd);
    }

    const extension = path.extname(safeLabel).toLowerCase();
    const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }[extension];
    if (!mime) {
        return finish({ kind: 'attachment', status: 'available', access: 'workspace_file', label: safeLabel, reason: 'copied_to_workspace' });
    }

    if (bytes.length > 100 && Array.isArray(pendingImageBlocks)) {
        const initialLength = pendingImageBlocks.length;
        try {
            pendingImageBlocks.push({ type: 'image', source: { type: 'base64', media_type: mime, data: bytes.toString('base64') } });
            return finish({ kind: 'attachment', status: 'available', access: 'model_image', label: safeLabel, reason: 'image_injected' });
        } catch (error) {
            try {
                pendingImageBlocks.splice(initialLength);
            } catch (_) {
                try { pendingImageBlocks.length = initialLength; } catch (_) {}
            }
            if (pendingImageBlocks.length !== initialLength) throw error;
            if (reservation.isActive()) {
                return finish({ kind: 'attachment', status: 'available', access: 'workspace_file', label: safeLabel, reason: 'image_not_injected' });
            }
            throw error;
        }
    }
    if (bytes.length > 100) {
        return finish({ kind: 'attachment', status: 'available', access: 'workspace_file', label: safeLabel, reason: 'image_not_injected' });
    }
    return finish({ kind: 'attachment', status: 'available', access: 'workspace_file', label: safeLabel, reason: 'image_too_small' });
    } finally {
        reservation.rollback();
    }
}

module.exports = { createEvidenceLedger, processAttachmentEvidence };
