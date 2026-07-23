const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildConversationTimeContext } = require('../conversation-time-context.cjs');

test('两小时后回来时提供自然时间差且不复制消息正文', () => {
  const snapshot = buildConversationTimeContext({
    now: new Date('2026-07-23T19:00:00+08:00'),
    timeZone: 'Asia/Shanghai',
    messages: [
      {
        role: 'user',
        created_at: '2026-07-23T17:00:00+08:00',
        content: '我要去打游戏',
        thinking: 'private thinking',
        toolCalls: [{ secret: 'private tool output' }],
      },
      {
        role: 'assistant',
        created_at: '2026-07-23T17:01:00+08:00',
        content: '好呀',
      },
    ],
  });

  assert.match(snapshot.promptBlock, /当前本地时间：2026年7月23日星期四 19:00（晚上）/);
  assert.match(snapshot.promptBlock, /距上一条用户消息：约 2 小时/);
  assert.match(snapshot.promptBlock, /距上一条助手消息：约 2 小时/);
  assert.doesNotMatch(snapshot.promptBlock, /我要去打游戏|好呀|private thinking|private tool output/);
  assert.ok(Object.isFrozen(snapshot));
});

test('短间隔、跨日与最近六条时间线稳定格式化', () => {
  const messages = Array.from({ length: 8 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    created_at: new Date(Date.parse('2026-07-22T23:50:00+08:00') + index * 2 * 60_000).toISOString(),
  }));
  const snapshot = buildConversationTimeContext({
    now: new Date('2026-07-23T00:06:00+08:00'),
    timeZone: 'Asia/Shanghai',
    messages,
  });

  assert.match(snapshot.promptBlock, /当前本地时间：2026年7月23日星期四 00:06（凌晨）/);
  assert.match(snapshot.promptBlock, /距上一条助手消息：约 2 分钟/);
  assert.equal((snapshot.promptBlock.match(/^- (用户|助手)：/gm) || []).length, 6);
  assert.doesNotMatch(snapshot.promptBlock, /23:50|23:52/);
  assert.match(snapshot.promptBlock, /7月22日 23:54/);
});

test('未来、无效时间戳和未知角色被忽略且不阻断生成', () => {
  const snapshot = buildConversationTimeContext({
    now: new Date('2026-07-23T12:00:00+08:00'),
    timeZone: 'Invalid/Zone',
    messages: [
      { role: 'user', created_at: 'not-a-date', content: 'secret-a' },
      { role: 'assistant', created_at: '2027-01-01T00:00:00Z', content: 'secret-b' },
      { role: 'tool', created_at: '2026-07-23T11:00:00+08:00', content: 'secret-c' },
    ],
  });

  assert.equal(snapshot.promptBlock, '');
  assert.doesNotMatch(JSON.stringify(snapshot), /secret-a|secret-b|secret-c/);
});

test('新会话没有历史消息时仍提供当前本地时间', () => {
  const snapshot = buildConversationTimeContext({
    now: new Date('2026-07-23T08:30:00+08:00'),
    timeZone: 'Asia/Shanghai',
    messages: [],
  });

  assert.match(snapshot.promptBlock, /2026年7月23日星期四 08:30（上午）/);
  assert.doesNotMatch(snapshot.promptBlock, /距上一条|最近消息时间线/);
});

test('即使只快于当前时间三十秒也严格忽略未来消息', () => {
  const snapshot = buildConversationTimeContext({
    now: new Date('2026-07-23T08:30:00+08:00'),
    timeZone: 'Asia/Shanghai',
    messages: [
      { role: 'user', created_at: '2026-07-23T08:30:30+08:00', content: 'future secret' },
    ],
  });

  assert.doesNotMatch(snapshot.promptBlock, /距上一条|最近消息时间线|future secret/);
});

test('bridge 对普通聊天与 research 共用同一份时间背景', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'bridge-server.cjs'), 'utf8');

  assert.match(source, /buildConversationTimeContext/);
  assert.match(source, /const timeContext = buildConversationTimeContext\(/);
  assert.match(source, /finalPrompt \+= `\\n\\n\$\{timeContext\.promptBlock\}`/);
  const contextIndex = source.indexOf('const timeContext = buildConversationTimeContext(');
  const researchIndex = source.indexOf('if (conv.research_mode && shouldRunResearch(message))', contextIndex);
  assert.ok(contextIndex >= 0 && researchIndex > contextIndex, '时间背景必须在 research 分流前生成并进入共用 finalPrompt');
  assert.equal((source.match(/buildConversationTimeContext\(\{/g) || []).length, 1);
});
