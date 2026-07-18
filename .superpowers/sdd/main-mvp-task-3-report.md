# 主程序 MVP 任务 3 报告

## 完成范围

- `electron/main.cjs`：确认托盘显示/隐藏、退出及最小化通知均为可读中文；修复同文件两处损坏注释，未改功能逻辑。
- `src/components/Sidebar.tsx`：中文模式补齐“最近使用”、显示/隐藏、下载更新、更新完成与重启文案；英文模式保留原文。
- `src/components/ArtifactsPage.tsx`：中文模式补齐“复制提示词/已复制”，并修复“查看完整聊天”“Artifacts 指南”两处真实乱码；英文模式保留原文。
- `electron/system-prompt.txt`：将旧 Claude Desktop 长身份块收缩为非空、有效 UTF-8 的洵心台 legacy 兼容提示；提示加载器的 primary 优先逻辑未改。
- `src/components/appearance/AppearancePetSettings.tsx`：核对主题画廊仍可用，桌宠仅表述为后续可安装且当前不会探测或启动；无需改动。

## TDD 证据

- 新增 `test/chinese-main-path.test.ts`，覆盖 Electron 托盘/通知、Sidebar 中英分支、Artifacts 中英分支、legacy prompt 及 dormant 桌宠入口。
- RED：首次聚焦运行结果为 4 failed / 1 passed，失败点与上述缺失文案和旧 fallback 一致。
- GREEN：修复后聚焦运行结果为 5 passed / 5 tests。

## 验证

- `npm.cmd test`：9 个测试文件、63 个测试全部通过。
- `npm.cmd run test:electron`：43 个测试全部通过。
- `npm.cmd run build`：成功；仅有原有动态/静态导入与大 chunk 警告。
- `node --check electron/main.cjs`：通过。
- `git diff --check`：通过。

## 自审

- 未引入依赖或 i18n 框架，未改 API、协议字段、路径、主题内核、推理展示、运行时准备或桌宠协议。
- 修改只覆盖用户主路径具体文案与 legacy fallback；未进行全仓翻译。
- primary 提示存在时不组合 legacy fallback 的既有行为由 Electron 提示加载测试继续覆盖。

## 复审补充

- 修复导出工作空间保存对话框的用户可见乱码标题，现显示“导出模型对话工作空间”；同时修正紧邻的两条乱码归档注释，不改导出行为。
- 先追加标题精确断言和旧乱码禁止断言，确认聚焦测试 RED（1 failed / 4 passed），再修复并确认 GREEN（5 passed / 5 tests）。
