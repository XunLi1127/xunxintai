# 主程序 MVP 任务 2 报告

## 结果

- 新增 `electron/小洵.md`，作为 UTF-8、无 BOM、中文优先的产品身份与通用行为层。
- 新增 `electron/prompt-loader.cjs`：以模块目录为基准优先读取主提示，缺失或空白时回退旧提示，两者不可用时返回最小安全内置提示。
- 旧提示回退带结构化 `source`、`deprecated` 与稳定迁移信息；启动时只加载和提示一次。
- `bridge-server.cjs` 通过统一组合函数保持产品层在前、现有用户资料/工具权限/项目层在后。
- `CLAUDE.md` 系列仍由引擎现有加载协议处理，未重命名、删除或修改。
- `package.json` 现有 `electron/**/*` 打包规则覆盖 `electron/小洵.md`，无需扩大打包范围。

## TDD 证据

- 首次聚焦测试因 `electron/prompt-loader.cjs` 不存在而 RED。
- 自审新增“旧提示清理后不得为空”用例，先观察到断言失败，再以最小内置提示完成 GREEN。
- 聚焦测试最终 10/10 通过。

## 验证

- `npm run test:electron`：42/42 通过（加入最后一条边界测试前的完整轮；最终完整轮见提交前验证）。
- `npm test`：8 个测试文件、58 个测试通过。
- `npm.cmd run build`：成功；仅保留项目既有动态导入与大 chunk 警告。
- `git diff --check`：通过。
- `node --check electron/prompt-loader.cjs`：通过。
- `node --check electron/bridge-server.cjs`：通过。
- `electron/小洵.md`：已校验无 UTF-8 BOM 字节前缀。

## 自审

未发现 Critical 或 Important 问题。实现未触碰聊天 API、工具协议、UI、桌宠、主题、运行时下载或引擎 `CLAUDE.md` 协议。
