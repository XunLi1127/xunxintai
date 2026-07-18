const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PET_PROTOCOL_VERSION, MAX_LINE_BYTES, createPipeName, encodeMessage, decodeLine,
} = require('../pet/protocol.cjs');
const { normalizeLifecycleEvent } = require('../pet/state-normalizer.cjs');

test('协议只接受白名单消息并执行深层隐私检查', () => {
  const hello = { type: 'hello', version: PET_PROTOCOL_VERSION, token: 'a'.repeat(32) };
  assert.deepEqual(decodeLine(encodeMessage(hello)), hello);
  for (const bad of [
    '{bad',
    JSON.stringify({ type: 'mystery' }),
    JSON.stringify({ ...hello, prompt: 'secret' }),
    JSON.stringify({ type: 'settings', sessionId: 's', seq: 1, settings: { muted: true, nested: { reasoning: 'secret' } } }),
  ]) assert.throws(() => decodeLine(bad));
});

test('拒绝超过 16 KiB 的单行', () => {
  assert.equal(MAX_LINE_BYTES, 16 * 1024);
  assert.throws(() => decodeLine(' '.repeat(MAX_LINE_BYTES + 1)), /too large/i);
});

test('协议 settings 只允许有限字段和严格类型', () => {
  const base = { type: 'settings', sessionId: 's', seq: 1 };
  assert.deepEqual(decodeLine(JSON.stringify({ ...base, settings: { muted: true, size: 64 } })).settings, { muted: true, size: 64 });
  assert.throws(() => decodeLine(JSON.stringify({ ...base, settings: { executable: 'calc.exe' } })), /setting/i);
  assert.throws(() => decodeLine(JSON.stringify({ ...base, settings: { muted: 'yes' } })), /setting/i);
});

test('管道名只使用可信 SID 的规范化形式和 128-bit 随机值', () => {
  const name = createPipeName({ sid: '../S-1-5-21 & calc', randomBytes: () => Buffer.alloc(16, 0xab) });
  assert.match(name, /^\\\\\.\\pipe\\xunxintai-pet-[a-zA-Z0-9-]+-[a-f0-9]{32}$/);
  assert.doesNotMatch(name.slice('\\\\.\\pipe\\'.length), /[.\/& ]/);
});

test('生命周期归一化只返回最小七态结果且不透传 payload', () => {
  const cases = new Map([
    ['request_started', 'thinking'], ['tool_started', 'tool_running'],
    ['permission_required', 'awaiting_confirmation'], ['completed', 'completed'],
    ['failed', 'failed'], ['do_not_disturb', 'sleeping'], ['idle', 'idle'],
  ]);
  for (const [type, state] of cases) {
    assert.deepEqual(normalizeLifecycleEvent({ type, prompt: 'secret', payload: { toolOutput: 'secret' } }), { state });
  }
  assert.equal(normalizeLifecycleEvent({ type: 'unknown', conversation: 'secret' }), null);
});
