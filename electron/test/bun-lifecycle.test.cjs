const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const {
  createEngineLifecycle,
  createBridgeShutdown,
  createQuitCoordinator,
} = require('../engine-lifecycle.cjs');

function fakeChild() {
  const child = new EventEmitter();
  child.stdin = { endCalls: 0, end() { this.endCalls++; } };
  child.killCalls = 0;
  child.kill = () => { child.killCalls++; };
  return child;
}

test('a replaced engine survives delayed close and error cleanup from the old child', () => {
  const enginePool = new Map();
  const activeChildren = new Map();
  const lifecycle = createEngineLifecycle({ enginePool, activeChildren });
  const oldChild = fakeChild();
  const oldEngine = { child: oldChild };
  const newChild = fakeChild();
  const newEngine = { child: newChild };

  lifecycle.register('same-conversation', oldEngine);
  lifecycle.remove('same-conversation', oldEngine);
  lifecycle.register('same-conversation', newEngine);

  lifecycle.remove('same-conversation', oldEngine); // delayed close
  lifecycle.remove('same-conversation', oldEngine); // delayed error

  assert.equal(enginePool.get('same-conversation'), newEngine);
  assert.equal(activeChildren.get('same-conversation'), newChild);
});

test('application shutdown drains requests then kills Bun registered while server is closing', async () => {
  const enginePool = new Map();
  const activeChildren = new Map();
  const lifecycle = createEngineLifecycle({ enginePool, activeChildren });
  const firstChild = fakeChild();
  const secondChild = fakeChild();
  const firstEngine = { child: firstChild };
  const secondEngine = { child: secondChild };
  lifecycle.register('first', firstEngine);
  lifecycle.register('second', secondEngine);

  let closeCalls = 0;
  let finishClose;
  const server = { close(callback) { closeCalls++; finishClose = callback; } };
  const shutdown = createBridgeShutdown({ server, shutdownEngines: lifecycle.shutdown });
  const pending = shutdown();
  const replacementChild = fakeChild();
  const replacementEngine = { child: replacementChild };
  lifecycle.register('late', replacementEngine);
  finishClose();
  await pending;
  await shutdown();

  assert.equal(closeCalls, 1);
  assert.equal(firstChild.stdin.endCalls, 1);
  assert.equal(firstChild.killCalls, 1);
  assert.equal(secondChild.stdin.endCalls, 1);
  assert.equal(secondChild.killCalls, 1);
  assert.equal(replacementChild.killCalls, 1);
  assert.equal(enginePool.size, 0);
  assert.equal(activeChildren.size, 0);
});

test('server close errors still reclaim all Bun and repeated shutdown stays idempotent', async () => {
  const enginePool = new Map();
  const activeChildren = new Map();
  const lifecycle = createEngineLifecycle({ enginePool, activeChildren });
  const child = fakeChild();
  lifecycle.register('conversation', { child });
  let closeCalls = 0;
  const shutdown = createBridgeShutdown({
    server: { close(callback) { closeCalls++; callback(new Error('close failed')); } },
    shutdownEngines: lifecycle.shutdown,
  });

  await assert.rejects(shutdown(), /close failed/);
  await assert.rejects(shutdown(), /close failed/);

  assert.equal(closeCalls, 1);
  assert.equal(child.killCalls, 1);
  assert.equal(enginePool.size, 0);
  assert.equal(activeChildren.size, 0);
});

test('server close synchronous throws still reclaim Bun and reuse the same rejected promise', async () => {
  const enginePool = new Map();
  const activeChildren = new Map();
  const lifecycle = createEngineLifecycle({ enginePool, activeChildren });
  const child = fakeChild();
  lifecycle.register('conversation', { child });
  const shutdown = createBridgeShutdown({
    server: { close() { throw new Error('sync close failed'); } },
    shutdownEngines: lifecycle.shutdown,
  });

  const first = shutdown();
  const second = shutdown();
  assert.equal(second, first);
  await assert.rejects(first, /sync close failed/);
  assert.equal(child.killCalls, 1);
  assert.equal(enginePool.size, 0);
  assert.equal(activeChildren.size, 0);
});

test('before-quit waits for shutdown then re-quits once without blocking the guarded event', async () => {
  let resolveShutdown;
  const shutdown = () => new Promise(resolve => { resolveShutdown = resolve; });
  let quitCalls = 0;
  const onBeforeQuit = createQuitCoordinator({ shutdown, quit: () => { quitCalls++; } });
  const firstEvent = { prevented: 0, preventDefault() { this.prevented++; } };

  onBeforeQuit(firstEvent);
  assert.equal(firstEvent.prevented, 1);
  assert.equal(quitCalls, 0);

  await Promise.resolve();
  resolveShutdown();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(quitCalls, 1);

  const guardedEvent = { prevented: 0, preventDefault() { this.prevented++; } };
  onBeforeQuit(guardedEvent);
  assert.equal(guardedEvent.prevented, 0);
  assert.equal(quitCalls, 1);
});

test('before-quit logs shutdown rejection and still performs the guarded quit', async () => {
  const errors = [];
  let quitCalls = 0;
  const onBeforeQuit = createQuitCoordinator({
    shutdown: () => Promise.reject(new Error('shutdown failed')),
    quit: () => { quitCalls++; },
    logError: error => errors.push(error.message),
  });
  const event = { prevented: 0, preventDefault() { this.prevented++; } };

  onBeforeQuit(event);
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(event.prevented, 1);
  assert.deepEqual(errors, ['shutdown failed']);
  assert.equal(quitCalls, 1);
});
