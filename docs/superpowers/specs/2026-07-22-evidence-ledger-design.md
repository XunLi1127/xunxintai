# 洵心台事实证据账本设计

## 目标

为每个用户回合生成一份可追溯、最小化的证据清单，使模型明确区分“正文里提到了附件”“文件已落入工作区”“图像字节已真正送入模型”与“目前没有可读取证据”。账本只描述证据可用性，不保存附件正文、工具正文、密钥、绝对路径或推理内容。

## 方案比较与选择

1. 仅追加一段固定提示：改动最小，但无法审计每个回合实际拿到了什么，也不能为后续检查点接口提供结构化数据。
2. 在独立文件维护全局追加日志：可审计，但会复制用户活动元数据，带来额外保留和并发问题。
3. 在现有消息记录中保存每回合的最小证据清单，并把同一清单格式化进该回合提示：数据与回合天然同生命周期，没有第二套数据库，也能供后续检查点接口读取。

采用方案 3。

## 数据模型

新建 `electron/evidence-ledger.cjs`，导出：

- `createEvidenceLedger()`：返回当前回合的内存账本。
- `record(entry)`：只接受白名单字段并追加；返回规范化条目。
- `snapshot()`：返回不可变副本。
- `toPromptBlock()`：返回简体中文证据合约块。

条目仅含：

- `kind`: `user_text | attachment | github_workspace`
- `status`: `available | unavailable`
- `access`: `text_supplied | workspace_file | model_image | metadata_only | none`
- `label`: 经过长度限制和控制字符清理的相对标签；不得含绝对路径。
- `reason`: 稳定原因码，例如 `copied_to_workspace`、`image_injected`、`missing_source`、`copy_failed`、`github_index_loaded`。

不记录正文、Base64、哈希前的原始秘密、API 配置、工具输入输出或推理文本。单回合最多 64 条，标签最多 160 个 Unicode 码点；未知字段和值拒绝。

## 数据流

聊天入口创建账本并先登记用户文本。GitHub 工作区索引只有解析成功且含有效仓库时登记 `available/workspace_file`；失败只登记稳定原因码。每个普通附件只有在真实源存在并复制成功后才登记 `workspace_file`。图像只有在字节读取成功、通过最小长度检查并实际加入 `pendingImageBlocks` 后才升级为 `model_image`；否则不得声称模型能直接看到。

最终提示在用户正文之后追加账本生成的 `<evidence_ledger>` 块，明确：只有 `model_image` 才能直接描述图像像素；`workspace_file` 必须先用可用文件工具读取；`metadata_only/none/unavailable` 不能作为内容证据。该块不覆盖系统安全规则。

同一份 `snapshot()` 保存到用户消息的 `evidence` 字段，随现有消息数据库生命周期保留，不建立新日志文件。对外会话读取接口可返回这些非正文元数据，为后续检查点数据接口复用。

## 错误与隐私

- 附件缺失、复制失败或图像读取失败不吞掉事实：记录稳定 `unavailable` 条目，但不把本地错误路径写入账本或日志。
- 账本构造失败时聊天请求返回稳定中文错误，不允许退回到“看起来有附件就声称可见”的旧路径。
- 不改变 Claude Desktop CN 现有的可查看推理内容功能，也不把它描述为完整、未经处理的隐藏思维链。

## 测试

聚焦 Node 测试覆盖字段白名单、限制、不可变快照、无正文/绝对路径、提示合约，以及真实附件处理边界：缺失附件为 unavailable、复制成功为 workspace_file、图像只有成功排队后为 model_image。再运行全量 Vitest、Electron 测试、构建和 `git diff --check`。

## 范围外

本任务不实现输入硬门 UI、能力诊断、Windows 凭据迁移、检查点 API、桌宠或新的持久化数据库。
