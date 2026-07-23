# Conversation Time Awareness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为每轮小洵对话注入轻量、脱敏且自然可用的本地时间背景。

**Architecture:** 新建纯函数模块，从请求时间和已有消息 `created_at` 生成不可变时间背景块；`bridge-server.cjs` 在普通聊天与 research 共用的 `finalPrompt` 中追加同一快照。不引入依赖、事件数据库或前端改动。

**Tech Stack:** Node.js CommonJS、现有 Electron bridge、`node:test`

## Global Constraints

- 不新增第三方依赖，不建立事件追踪器。
- 不复制消息正文、推理、工具正文、密钥、路径或隐私配置。
- 时间解析失败时降级，不阻断聊天。
- 时间只提供事实背景，不规定情绪、问候或固定台词。
- 保留现有可查看推理内容功能。

---

### Task 1: 时间背景生成并接入聊天

**Files:**
- Create: `electron/conversation-time-context.cjs`
- Create: `electron/test/conversation-time-context.test.cjs`
- Modify: `electron/bridge-server.cjs`

**Interfaces:**
- Consumes: `buildConversationTimeContext({ now, timeZone, messages })`
- Produces: 冻结的 `{ generatedAt, promptBlock }`；`promptBlock` 只含本地时间、时段和最近最多 6 条消息的角色/时间/间隔元数据。

- [ ] **Step 1: 写失败测试**

覆盖 17:00 到 19:00 显示约 2 小时、两分钟连续对话、跨日、无效/未来时间戳忽略、最多 6 条、禁止正文与敏感字段，以及 bridge 在 evidence block 后只追加一次时间快照。

```js
const snapshot = buildConversationTimeContext({
  now: new Date('2026-07-23T19:00:00+08:00'),
  timeZone: 'Asia/Shanghai',
  messages: [
    { role: 'user', created_at: '2026-07-23T17:00:00+08:00', content: '去打游戏' },
  ],
});
assert.match(snapshot.promptBlock, /约 2 小时/);
assert.doesNotMatch(snapshot.promptBlock, /去打游戏/);
```

- [ ] **Step 2: 验证 RED**

Run: `node --test electron/test/conversation-time-context.test.cjs`

Expected: FAIL，原因是 `electron/conversation-time-context.cjs` 尚不存在。

- [ ] **Step 3: 实现最小纯函数**

使用 `Intl.DateTimeFormat` 和现有 ISO 时间戳计算：

```js
function buildConversationTimeContext({ now = new Date(), timeZone, messages = [] }) {
  // 校验 now/timeZone/messages；筛选有效且不晚于 now 的最近 6 条。
  // 只投影 role/created_at，格式化当前日期、星期、时段与相对间隔。
  // 返回 Object.freeze({ generatedAt, promptBlock })。
}
```

时段固定为凌晨、早晨、上午、中午、下午、傍晚、晚上、深夜；相对间隔按分钟、小时、天做自然中文近似。

- [ ] **Step 4: 接入同一 `finalPrompt`**

在 `electron/bridge-server.cjs` 创建一次快照，并在 evidence block 后追加：

```js
const timeContext = buildConversationTimeContext({
  now: new Date(),
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  messages: db.messages.filter(item => item.conversation_id === conversation_id),
});
if (timeContext.promptBlock) finalPrompt += `\n\n${timeContext.promptBlock}`;
```

普通聊天和 research 必须继续共用这个 `finalPrompt`，不单独重新计算时间。

- [ ] **Step 5: 验证 GREEN 与回归**

Run:

```powershell
node --test electron/test/conversation-time-context.test.cjs
npm run test:electron
npm test
npm run build
node --check electron/conversation-time-context.cjs
node --check electron/bridge-server.cjs
git diff --check
```

Expected: 全部通过；构建只允许既有 chunk/dynamic-import 警告。

- [ ] **Step 6: 独立复审并提交**

复审重点：隐私投影、时区/跨日、未来时间、普通与 research 同快照、无强制人格台词。修复阻塞项后：

```powershell
git add electron/conversation-time-context.cjs electron/test/conversation-time-context.test.cjs electron/bridge-server.cjs
git commit -m "feat(electron): add conversation time awareness"
```
