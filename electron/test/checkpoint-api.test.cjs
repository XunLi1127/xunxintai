const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createCheckpointPage, registerCheckpointRoute } = require('../checkpoint-api.cjs');

const conversation = {
  id: '11111111-1111-4111-8111-111111111111', model: 'sk-secret-looking-model', created_at: '2026-07-23T01:00:00.000Z',
  claude_session_id: 'sk-secret-session-id', workspace_path: 'C:\\private', provider_id: 'private-provider',
};
const messages = [
  { id: '22222222-2222-4222-8222-222222222222', conversation_id: conversation.id, role: 'user', created_at: '2026-07-23T01:01:00.000Z', content: 'private prompt', thinking: 'private reasoning' },
  { id: '33333333-3333-4333-8333-333333333333', conversation_id: conversation.id, role: 'assistant', created_at: '2026-07-23T01:02:00.000Z', content: 'private answer', toolCalls: [{ input: 'private tool body' }], engineUuidSynced: true },
  { id: '44444444-4444-4444-8444-444444444444', conversation_id: conversation.id, role: 'system', created_at: '2026-07-23T01:03:00.000Z', content: 'private compact summary', is_compact_boundary: true },
];

test('检查点只投影恢复所需的固定结构化元数据', () => {
  const page = createCheckpointPage({ conversation, messages, limit: '2' });
  assert.deepEqual(page.conversation, { createdAt: '2026-07-23T01:00:00.000Z', hasEngineSession: true });
  assert.deepEqual(page.checkpoints.map(item => [item.role, item.createdAt, item.kind, item.engineSynchronized]), [
    ['system', '2026-07-23T01:03:00.000Z', 'compact_boundary', false],
    ['assistant', '2026-07-23T01:02:00.000Z', 'message', true],
  ]);
  assert.match(page.checkpoints[0].token, /^[a-f0-9]{32}$/);
  assert.deepEqual(page.page, { limit: 2, nextCursor: page.page.nextCursor, hasMore: true });
  assert.match(page.page.nextCursor, /^[A-Za-z0-9_-]+$/);
  assert.doesNotMatch(JSON.stringify(page), /private|secret|sk-|content|thinking|tool|workspace|provider|session.?id|api.?key|credential|11111111|22222222|33333333|44444444/i);
});

test('分页严格限制在 1 到 50 且游标必须为合法不透明 keyset', () => {
  for (const limit of ['0', '51', '-1', '1.5', 'x']) assert.throws(() => createCheckpointPage({ conversation, messages, limit }), error => error.code === 'CHECKPOINT_INVALID_PAGINATION');
  for (const cursor of ['-1', 'x', Buffer.from('{}').toString('base64url')]) assert.throws(() => createCheckpointPage({ conversation, messages, cursor }), error => error.code === 'CHECKPOINT_INVALID_PAGINATION');
  assert.equal(createCheckpointPage({ conversation, messages }).page.limit, 20);
});

test('keyset 分页在头部插入新消息后不重复或跳过旧页，且同时间稳定排序', () => {
  const sameTime = { ...messages[1], id: '55555555-5555-4555-8555-555555555555', role: 'user' };
  const first = createCheckpointPage({ conversation, messages: [...messages, sameTime], limit: '2' });
  const inserted = { ...messages[2], id: '66666666-6666-4666-8666-666666666666', created_at: '2026-07-23T01:04:00.000Z' };
  const second = createCheckpointPage({ conversation, messages: [...messages, sameTime, inserted], limit: '2', cursor: first.page.nextCursor });
  const all = [...first.checkpoints, ...second.checkpoints].map(item => item.token);
  assert.equal(new Set(all).size, all.length);
  assert.equal(all.length, 4);
  assert.doesNotMatch(JSON.stringify(second), /66666666/);
});

test('损坏的会话或消息返回稳定损坏错误', () => {
  for (const input of [
    { conversation: { ...conversation, id: '' }, messages },
    { conversation, messages: [{ ...messages[0], content: 'private', created_at: 'bad-date' }] },
    { conversation, messages: [{ ...messages[0], role: 'tool' }] },
    { conversation, messages: null },
  ]) assert.throws(() => createCheckpointPage(input), error => error.code === 'CHECKPOINT_DATA_CORRUPT' && !/private/i.test(error.message));
});

function response() {
  return { statusCode: 200, contentType: null, body: null, status(code) { this.statusCode = code; return this; }, type(value) { this.contentType = value; return this; }, json(value) { this.body = value; return this; } };
}

test('受控 HTTP 入口可达并稳定区分成功、不存在与损坏', () => {
  let route;
  const server = { get(pathname, handler) { route = { pathname, handler }; } };
  const state = { conversation, messages };
  registerCheckpointRoute(server, { getConversation: id => id === conversation.id ? state.conversation : null, getMessages: () => state.messages });
  assert.equal(route.pathname, '/api/conversations/:id/checkpoints');
  const ok = response(); route.handler({ params: { id: conversation.id }, query: { limit: '1' } }, ok);
  assert.equal(ok.statusCode, 200); assert.equal(ok.contentType, 'application/json'); assert.equal(ok.body.checkpoints.length, 1);
  const missing = response(); route.handler({ params: { id: 'missing' }, query: {} }, missing);
  assert.deepEqual([missing.statusCode, missing.body.code], [404, 'CHECKPOINT_CONVERSATION_NOT_FOUND']);
  state.messages = null;
  const corrupt = response(); route.handler({ params: { id: conversation.id }, query: {} }, corrupt);
  assert.deepEqual([corrupt.statusCode, corrupt.body.code], [500, 'CHECKPOINT_DATA_CORRUPT']);
  assert.doesNotMatch(JSON.stringify(corrupt.body), /private|content|thinking|tool|path|session/i);
});

test('bridge 注册检查点入口且不直接返回 db', () => {
  const bridge = fs.readFileSync(path.join(__dirname, '..', 'bridge-server.cjs'), 'utf8');
  assert.match(bridge, /registerCheckpointRoute\(server/);
  assert.doesNotMatch(bridge, /checkpoints[^\n]{0,200}res\.json\(db/i);
});
