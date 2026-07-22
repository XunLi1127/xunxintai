'use strict';

const KNOWN = Object.freeze({
    kind: new Set(['user_text', 'attachment', 'github_workspace']),
    status: new Set(['available', 'unavailable']),
    access: new Set(['text_supplied', 'workspace_file', 'model_image', 'metadata_only', 'none']),
});
const PLACEHOLDER = /^\s*\[(?:image|图片)(?:\s+#(\d+))?\]\s*$/i;

function frozenFailure(code, message, details) {
    return Object.freeze({ ok: false, code, message, details: Object.freeze(details) });
}

function parseReservedPlaceholders(message) {
    let fence = null;
    const placeholders = [];
    for (const line of String(message || '').split(/\r\n|\n|\r/)) {
        if (fence) {
            const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
            if (close && close[1][0] === fence.char && close[1].length >= fence.length) fence = null;
            continue;
        }
        const open = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
        if (open) {
            fence = { char: open[1][0], length: open[1].length };
            continue;
        }
        if (/^(?: {4}|\t)/.test(line)) continue;
        const match = line.match(PLACEHOLDER);
        if (!match) continue;
        if (match[1] === undefined) placeholders.push(null);
        else {
            const index = Number(match[1]);
            placeholders.push(match[1].length <= 3 && Number.isInteger(index) && index >= 1 && index <= 999 ? index : 'invalid');
        }
    }
    return placeholders;
}

function isVirtualGithub(attachment) {
    return !!attachment && (attachment.source === 'github' || attachment.fileType === 'github');
}

function validateInputEvidence(input = {}) {
    if (Object.hasOwn(input, 'attachments') && !Array.isArray(input.attachments)
        || Object.hasOwn(input, 'evidence') && !Array.isArray(input.evidence)) {
        return frozenFailure('INPUT_EVIDENCE_INCONSISTENT', 'Input evidence is inconsistent.', {
            attachmentCount: 0, attachmentEvidenceCount: 0, reason: 'invalid_collection_type',
        });
    }
    const attachments = Array.isArray(input.attachments) ? input.attachments : [];
    const entries = Array.isArray(input.evidence) ? input.evidence : [];
    const requiredIndices = attachments.flatMap((attachment, index) => isVirtualGithub(attachment) ? [] : [index]);
    const requiredSet = new Set(requiredIndices);
    const attachmentEntries = entries.filter(entry => entry && entry.kind === 'attachment');
    const unknown = entries.some(entry => {
        if (!entry || typeof entry !== 'object' || !KNOWN.kind.has(entry.kind)
            || !KNOWN.status.has(entry.status) || !KNOWN.access.has(entry.access)) return true;
        if (entry.kind === 'attachment') {
            if (!Number.isInteger(entry.attachment_index) || entry.attachment_index < 0) return true;
            return entry.status === 'available'
                ? !['workspace_file', 'model_image'].includes(entry.access)
                : entry.access !== 'none';
        }
        if (entry.kind === 'user_text') return entry.status !== 'available' || entry.access !== 'text_supplied';
        return entry.status === 'available' ? entry.access !== 'workspace_file' : entry.access !== 'none';
    });
    const seen = new Set();
    const badIndex = attachmentEntries.some(entry => {
        if (!requiredSet.has(entry.attachment_index) || seen.has(entry.attachment_index)) return true;
        seen.add(entry.attachment_index);
        return false;
    });
    if (unknown || badIndex) {
        return frozenFailure('INPUT_EVIDENCE_INCONSISTENT', 'Input evidence is inconsistent.', {
            attachmentCount: requiredIndices.length,
            attachmentEvidenceCount: attachmentEntries.length,
            reason: unknown ? 'unknown_evidence_state' : 'attachment_index_mismatch',
        });
    }
    const availableByIndex = new Set(attachmentEntries.filter(entry => entry.status === 'available').map(entry => entry.attachment_index));
    if (requiredIndices.some(index => !availableByIndex.has(index))) {
        return frozenFailure('INPUT_ATTACHMENT_EVIDENCE_MISSING', 'Attachment evidence is unavailable.', {
            attachmentCount: requiredIndices.length,
            availableAttachmentCount: availableByIndex.size,
            reason: 'attachment_evidence_missing',
        });
    }

    const placeholders = parseReservedPlaceholders(input.message);
    const modelImageCount = attachmentEntries.filter(entry => entry.status === 'available' && entry.access === 'model_image').length;
    if (placeholders.includes('invalid')) {
        return frozenFailure('INPUT_EVIDENCE_INCONSISTENT', 'Input evidence is inconsistent.', {
            placeholderCount: placeholders.length, modelImageCount, reason: 'invalid_placeholder_index',
        });
    }
    const numbered = placeholders.filter(Number.isInteger);
    const uniqueNumbered = new Set(numbered);
    const anonymousCount = placeholders.length - numbered.length;
    if (numbered.some(index => index > modelImageCount) || anonymousCount > modelImageCount - uniqueNumbered.size) {
        return frozenFailure('INPUT_IMAGE_EVIDENCE_REQUIRED', 'Image evidence is required.', {
            placeholderCount: placeholders.length, modelImageCount, reason: 'model_image_missing',
        });
    }
    return Object.freeze({ ok: true });
}

module.exports = { validateInputEvidence };
