'use strict';

const { randomBytes } = require('node:crypto');

function createProxyContextRegistry({ randomId = () => randomBytes(18).toString('base64url') } = {}) {
    const contexts = new Map();
    return Object.freeze({
        register(target) {
            let routeId;
            do { routeId = randomId(); } while (!routeId || contexts.has(routeId));
            const context = { ...target, inputRequestId: null };
            contexts.set(routeId, context);
            return Object.freeze({ routeId, path: `/engine/${routeId}/v1`, context });
        },
        resolve(url) {
            const match = String(url || '').match(/^\/engine\/([A-Za-z0-9_-]+)(?:\/|$)/);
            return match ? contexts.get(match[1]) || null : null;
        },
        unregister(routeId) { contexts.delete(routeId); },
    });
}

module.exports = { createProxyContextRegistry };
