# 洵心台事实证据账本 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为每个聊天回合建立不含正文和秘密的结构化证据账本，并以同一快照约束模型对附件可见性的陈述。

**Architecture:** 独立 CJS 模块负责白名单、限制、不可变快照与提示格式；`bridge-server.cjs` 只在真实处理结果发生时登记证据，将快照随用户消息保存，并将证据合约追加到该回合提示。

**Tech Stack:** Node.js CommonJS、Node test runner、现有 Express/Electron bridge。

## Global Constraints

- 必须使用简体中文，产品名“洵心台”，主提示文件“小洵.md”。
- 不保存附件正文、Base64、绝对路径、密钥、API 配置、工具输入输出或推理文本。
- 只有图像字节实际加入模型请求时才可标记 `model_image`；仅复制到工作区时只能标记 `workspace_file`。
- 保留现有“可查看推理内容”能力，不得称为完整、未经处理的隐藏思维链。
- 不做桌宠、输入硬门 UI、能力诊断、Windows 凭据或检查点 API。

---

### Task 1: 每回合证据账本与聊天接入

**Files:**
- Create: `electron/evidence-ledger.cjs`
- Create: `electron/test/evidence-ledger.test.cjs`
- Modify: `electron/bridge-server.cjs`

**Interfaces:**
- Produces: `createEvidenceLedger(): { record(entry), snapshot(), toPromptBlock() }`
- Persists: user message field `evidence: EvidenceEntry[]`

- [ ] **Step 1: 写失败测试**

测试先要求模块导出上述接口；验证允许值、未知字段拒绝、64 条/160 码点限制、快照不可被调用方改写、提示块不含正文或绝对路径。再用最小附件处理夹具锁定缺失、复制成功与图像成功排队三种证据级别。

- [ ] **Step 2: 运行 RED**

Run: `node --test electron/test/evidence-ledger.test.cjs`

Expected: 因模块或 bridge 接口尚不存在而失败，且失败来自目标行为而非测试语法。

- [ ] **Step 3: 最小实现**

实现严格枚举与字段白名单；`label` 去控制字符、拒绝绝对路径并按 Unicode 码点截断；`snapshot()` 深复制并冻结。提示块逐条只输出 kind/status/access/label/reason，并附可见性规则。bridge 在真实副作用成功后登记，失败使用稳定原因码；保存 snapshot 并将 `toPromptBlock()` 追加到 `finalPrompt`。

- [ ] **Step 4: 运行 GREEN 与完整验证**

Run: `node --test electron/test/evidence-ledger.test.cjs`

Expected: 全部通过。

随后运行：`npm test`、`npm run test:electron`、`npm run build`、`git diff --check`、`node --check electron/evidence-ledger.cjs`、`node --check electron/bridge-server.cjs`。

- [ ] **Step 5: 独立复审、提交和推送**

复审必须检查附件可见性升级条件、持久化数据最小化、错误路径与现有推理展示无回归。批准后提交：`feat(electron): add per-turn evidence ledger`，并推送 `agent/theme-pet-phase-1`。
