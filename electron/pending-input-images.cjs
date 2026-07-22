'use strict';

function createPendingInputImages() {
    const requests = new Map();
    return Object.freeze({
        ensure(requestId) {
            if (!requests.has(requestId)) requests.set(requestId, []);
            return requests.get(requestId);
        },
        get(requestId) { return requests.get(requestId) || []; },
        finish(requestId) { requests.delete(requestId); },
    });
}

function injectPendingInputImages({ store, requestId, messages }) {
    const blocks = store.get(requestId);
    if (!requestId || blocks.length === 0 || !Array.isArray(messages)) return false;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (!message || message.role !== 'user') continue;
        const parts = Array.isArray(message.content) ? message.content : [{ type: 'text', text: message.content }];
        if (parts.some(part => part.type === 'tool_result')) continue;
        if (parts.some(part => part.type === 'image')) return false;
        message.content = [...blocks, ...parts];
        return true;
    }
    return false;
}

module.exports = { createPendingInputImages, injectPendingInputImages };
