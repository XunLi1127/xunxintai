const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PetPipeClient, launchSidecar } = require('../pet/pipe-client.cjs');

class FakeClock {
  constructor() { this.nowValue = 0; this.jobs = []; }
  now = () => this.nowValue;
  setTimeout = (fn, ms) => { const job = { fn, at: this.nowValue + ms, live: true }; this.jobs.push(job); return job; };
  clearTimeout = job => { if (job) job.live = false; };
  tick(ms) { this.nowValue += ms; for (const j of [...this.jobs]) if (j.live && j.at <= this.nowValue) { j.live = false; j.fn(); } }
}
class FakeConnection extends EventEmitter {
  constructor() { super(); this.writes = []; this.destroyed = false; }
  write(value) { this.writes.push(JSON.parse(value)); }
  destroy() { this.destroyed = true; this.emit('close'); }
  receive(value) { this.emit('data', Buffer.from(JSON.stringify(value) + '\n')); }
}

function setup() {
  const clock = new FakeClock(); const connections = [];
  const client = new PetPipeClient({ token: 't'.repeat(32), clock, heartbeatTimeoutMs: 20,
    connect: () => { const c = new FakeConnection(); connections.push(c); return c; },
    randomId: (() => { let n = 0; return () => `session-${++n}`; })(),
  });
  return { client, clock, connections };
}

test('正常握手后才发送状态，错误令牌、主版本和握手前状态均安全关闭', () => {
  for (const response of [
    { type: 'state', sessionId: 'x', seq: 1, state: 'idle' },
    { type: 'hello_ack', version: '2.0', token: 't'.repeat(32) },
    { type: 'hello_ack', version: '1.0', token: 'bad-token-value-that-is-long-enough' },
  ]) { const { client, connections: [c] } = (() => { const s = setup(); s.client.start(); return s; })(); c.receive(response); assert.equal(c.destroyed, true); client.stop(); }
  const { client, connections } = setup(); client.setState('thinking'); client.start();
  assert.deepEqual(connections[0].writes.map(x => x.type), ['hello']);
  connections[0].receive({ type: 'hello_ack', version: '1.0', token: 't'.repeat(32) });
  assert.deepEqual(connections[0].writes.map(x => x.type), ['hello', 'state']); client.stop();
});

test('坏 JSON、超长行和嵌套敏感字段使连接安全关闭', () => {
  for (const line of ['{bad\n', `${' '.repeat(16385)}\n`, JSON.stringify({ type: 'heartbeat', sessionId: 's', seq: 1, extra: { prompt: 'x' } }) + '\n']) {
    const { client, connections } = setup(); client.start(); connections[0].emit('data', Buffer.from(line)); assert.equal(connections[0].destroyed, true); client.stop();
  }
});

test('状态消息严格递增并拒绝重复、乱序和旧 session', () => {
  const { client, connections } = setup(); client.start(); const c = connections[0];
  c.receive({ type: 'hello_ack', version: '1.0', token: 't'.repeat(32) });
  c.receive({ type: 'heartbeat', sessionId: 'session-1', seq: 2 }); assert.equal(c.destroyed, false);
  c.receive({ type: 'state', sessionId: 'session-1', seq: 2, state: 'idle' }); assert.equal(c.destroyed, true); client.stop();
});

test('握手后的首 heartbeat 使用 seq=2，并拒绝从已发 seq=1 跳到 seq=3', () => {
  const ok = setup(); ok.client.start(); const okConnection = ok.connections[0];
  okConnection.receive({ type: 'hello_ack', version: '1.0', token: 't'.repeat(32) });
  okConnection.receive({ type: 'heartbeat', sessionId: 'session-1', seq: 2 });
  assert.equal(okConnection.destroyed, false); ok.client.stop();

  const skipped = setup(); skipped.client.start(); const skippedConnection = skipped.connections[0];
  skippedConnection.receive({ type: 'hello_ack', version: '1.0', token: 't'.repeat(32) });
  skippedConnection.receive({ type: 'heartbeat', sessionId: 'session-1', seq: 3 });
  assert.equal(skippedConnection.destroyed, true); skipped.client.stop();
});

test('消费合法 NDJSON 行后按 UTF-8 字节拒绝同一 chunk 的超长未终止尾部', () => {
  const { client, connections } = setup(); client.start(); const c = connections[0];
  const ack = JSON.stringify({ type: 'hello_ack', version: '1.0', token: 't'.repeat(32) });
  c.emit('data', Buffer.from(`${ack}\n${'界'.repeat(5462)}`, 'utf8'));
  assert.equal(c.destroyed, true); client.stop();
});

test('心跳超时断线，退避 1s/3s/10s 且三次失败停止，stop 禁止重连', () => {
  const { client, clock, connections } = setup(); client.start(); const first = connections[0];
  clock.tick(21); assert.equal(first.destroyed, true); assert.equal(client.getStatus().retryDelayMs, 1000);
  clock.tick(1000); assert.equal(connections.length, 2); connections[1].destroy(); assert.equal(client.getStatus().retryDelayMs, 3000);
  clock.tick(3000); assert.equal(connections.length, 3); connections[2].destroy(); assert.equal(client.getStatus().retryDelayMs, 10000);
  clock.tick(10000); assert.equal(connections.length, 4); connections[3].destroy();
  clock.tick(10000); assert.equal(connections.length, 4);
  client.stop(); clock.tick(10000); assert.equal(connections.length, 4);
});

test('重连创建新 session 且握手后只发送当前快照', () => {
  const { client, clock, connections } = setup(); client.start(); const c1 = connections[0];
  c1.receive({ type: 'hello_ack', version: '1.0', token: 't'.repeat(32) }); client.setState('thinking'); client.setState('tool_running'); c1.destroy();
  clock.tick(1000); const c2 = connections[1]; c2.receive({ type: 'hello_ack', version: '1.0', token: 't'.repeat(32) });
  assert.deepEqual(c2.writes.map(x => x.type), ['hello', 'state']); assert.equal(c2.writes[1].state, 'tool_running'); assert.notEqual(c2.writes[1].sessionId, c1.writes[1].sessionId); client.stop();
});

test('一次性令牌仅写入 stdin 首行，不进入 argv、环境或返回值', () => {
  let captured; const child = { stdin: { end(value) { child.stdinValue = value; } } };
  const result = launchSidecar({ executable: 'pet.exe', pipeName: '\\\\.\\pipe\\safe', token: 'z'.repeat(32), spawnFn: (...args) => { captured = args; return child; } });
  assert.deepEqual(captured[1], ['\\\\.\\pipe\\safe']); assert.equal(captured[2].env, undefined);
  assert.equal(child.stdinValue, `${'z'.repeat(32)}\n`); assert.deepEqual(result, { started: true });
  assert.doesNotMatch(JSON.stringify(captured), /zzzzzzzz/); assert.doesNotMatch(JSON.stringify(result), /zzzzzzzz/);
});

test('manager 拒绝未知设置和原型污染，诊断与未安装结果不泄密', async () => {
  const { PetManager } = require('../pet/pet-manager.cjs');
  const manager = new PetManager({ now: () => 1234, sidecar: null });
  assert.deepEqual(await manager.start(), { ok: false, code: 'PET_SIDECAR_NOT_INSTALLED', message: '桌宠组件尚未安装' });
  assert.throws(() => manager.updateSettings({ muted: true, unknown: 1 }), /unknown setting/i);
  assert.throws(() => manager.updateSettings(JSON.parse('{"__proto__":{"polluted":true}}')), /unsafe setting/i);
  assert.deepEqual(manager.updateSettings({ muted: true, clickThrough: false, size: 96, position: { x: 1, y: 2 }, doNotDisturb: true }),
    { muted: true, clickThrough: false, size: 96, position: { x: 1, y: 2 }, doNotDisturb: true });
  const diagnostics = manager.exportDiagnostics();
  assert.deepEqual(Object.keys(diagnostics).sort(), ['errorCode', 'protocolVersion', 'retryCount', 'state', 'timestamp']);
  assert.doesNotMatch(JSON.stringify(diagnostics), /pipe|token|prompt|message/i);
});

test('manager 的完成定时回 idle 可取消且新生命周期覆盖旧定时器', () => {
  const { PetManager } = require('../pet/pet-manager.cjs'); const clock = new FakeClock();
  const states = []; const manager = new PetManager({ clock, client: { setState: state => states.push(state), getStatus: () => ({ retryCount: 0 }) } });
  manager.handleLifecycleEvent({ type: 'completed', toolOutput: 'secret' });
  manager.handleLifecycleEvent({ type: 'request_started', prompt: 'secret' }); clock.tick(5000);
  assert.deepEqual(states, ['completed', 'thinking']);
  manager.handleLifecycleEvent({ type: 'failed', reasoning: 'secret' }); clock.tick(5000);
  assert.deepEqual(states, ['completed', 'thinking', 'failed', 'idle']);
});
