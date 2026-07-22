'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let subject = {};
try { subject = require('../proxy-context-registry.cjs'); } catch (_) {}

test('per-engine proxy routes keep credentials and request images isolated when A arrives after B updates', () => {
    const registry = subject.createProxyContextRegistry({ randomId: (() => { let n = 0; return () => `route${++n}`; })() });
    const a = registry.register({ apiKey: 'secret-A', baseUrl: 'https://a.invalid', model: 'A' });
    const b = registry.register({ apiKey: 'secret-B', baseUrl: 'https://b.invalid', model: 'B' });
    a.context.inputRequestId = 'request-A';
    b.context.inputRequestId = 'request-B';
    assert.equal(registry.resolve(`/engine/${b.routeId}/v1/messages`).inputRequestId, 'request-B');
    const lateA = registry.resolve(`/engine/${a.routeId}/v1/messages`);
    assert.equal(lateA.inputRequestId, 'request-A');
    assert.equal(lateA.apiKey, 'secret-A');
    assert.equal(lateA.baseUrl, 'https://a.invalid');
    assert.doesNotMatch(a.path, /secret|invalid|request/);
});

test('bridge resolves proxy target from its unique engine route and has no global last-writer target', () => {
    const bridge = fs.readFileSync(path.join(__dirname, '..', 'bridge-server.cjs'), 'utf8');
    assert.match(bridge, /proxyContexts\.resolve\(req\.url\)/);
    assert.match(bridge, /engine\.proxyContext\.inputRequestId\s*=\s*userMsgUuid/);
    assert.doesNotMatch(bridge, /let proxyTarget\s*=|proxyTarget\s*=/);
});
