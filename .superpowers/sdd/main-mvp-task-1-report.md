# 主程序 MVP 任务 1 报告

## RED / GREEN

- RED：新增 `test/brand/brand-identity.test.ts`，首次聚焦运行 4 项全部失败，分别命中旧 package、页面/metadata、Electron/MCP 和 README 身份。
- GREEN：最小修改后聚焦测试 4/4 通过。
- 复审补充：先为 Settings “关于”卡片增加一项真实文件断言，确认该新测试因可见的 `claude-desktop-cn` 单独 RED；仅替换该处文本后，聚焦测试 5/5 GREEN。

## 修改文件

- `package.json`、`package-lock.json`
- `index.html`、`metadata.json`
- `electron/main.cjs`、`electron/bridge-server.cjs`
- `README.md`
- `src/components/SettingsPage.tsx`
- `test/brand/brand-identity.test.ts`

## 验证

- 聚焦品牌测试：5/5 通过。
- `npm test`：58/58 通过。
- `npm run test:electron`：33/33 通过。
- `npm run build`：Vite build 成功；仅有已有的混合导入与大 chunk 警告。
- `git diff --check`：通过。

## 保留旧名称的位置与理由

- README 顶部保留“派生自 Claude Desktop CN”，用于上游归属和许可边界说明。
- `package.json` 保留原 author，不擦除上游作者信息。
- `electron/main.cjs` 保留 `claude-desktop-cn-previews` 临时目录名，它是内部兼容标识，不是用户可见产品身份。
- 历史发布文档、Claude API/CLI、`CLAUDE.md` 协议与 CSS 兼容标识均未改动。

## 提交

- 基线：`04472d0b75e100b75f92f3dc99d2abd185c1dd47`
- 任务提交：本报告所在提交（确切哈希见交付回报）。
