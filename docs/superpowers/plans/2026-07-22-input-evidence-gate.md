# 洵心台输入证据硬门 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在任何消息持久化、研究调用或 Bun 输入前拦截缺失附件证据和无图图片占位。

**Architecture:** 独立纯函数模块只读取结构化 evidence snapshot；bridge 在附件处理后、所有模型与消息副作用前调用，并在拒绝时回滚本请求附件副作用。

**Tech Stack:** Node.js CommonJS、Node test runner、现有 Express bridge。

## Global Constraints

- 错误只含稳定码和计数，不含正文、文件名、绝对路径、Base64、密钥、工具正文或推理文本。
- 只有 `available/model_image` 满足保留图片占位。
- 结构化附件每项必须对应一条 `kind=attachment,status=available` 的证据。
- 失败发生于消息持久化、研究调用、Bun spawn/stdin 之前，并回滚本请求副作用。
- 不改变现有可查看推理内容功能及其准确表述。

---

### Task 1: 输入证据硬门与 bridge 原子接入

**Files:**
- Create: `electron/input-evidence-gate.cjs`
- Create: `electron/test/input-evidence-gate.test.cjs`
- Modify: `electron/bridge-server.cjs`
- Modify: `electron/evidence-ledger.cjs`（仅在需要暴露本请求安全回滚句柄时）

**Interfaces:**
- Produces: `validateInputEvidence({ message, attachments, evidence })`

- [ ] **Step 1: 写并运行行为 RED**

Run: `node --test electron/test/input-evidence-gate.test.cjs`

测试普通文本、四种保留占位、代码/句中非占位、多附件、缺失/失败 evidence、未知状态、错误脱敏与 bridge 副作用顺序。必须因行为缺失失败，不能只以模块加载失败作为全部 RED。

- [ ] **Step 2: 最小 GREEN**

实现纯验证器；bridge 在 evidence snapshot 后、消息写库和 research/engine 前调用。拒绝时返回 422/SSE 错误并回滚该请求的 pending image 与新建文件；不改变成功路径。

- [ ] **Step 3: 完整验证与复审**

运行聚焦测试、`npm test`、`npm run test:electron`、`npm run build`、两个相关 CJS `node --check` 和 `git diff --check`。独立复审必须检查误拦截、绕过、回滚所有权与副作用顺序。

- [ ] **Step 4: 提交推送**

提交 `feat(electron): enforce input evidence gate`，复审批准后推送 `agent/theme-pet-phase-1`。
