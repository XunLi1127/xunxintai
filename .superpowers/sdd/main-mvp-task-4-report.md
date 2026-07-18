# 主程序 MVP 任务 4 报告

## 完成内容

- 固定 Bun `1.3.14` 官方 Windows x64 资产：URL、`38366737` 字节和 SHA-256 `0a0620930b6675d7ba440e81f4e0e00d3cfbe096c4b140d3fff02205e9e18922`。
- `prepare-runtime.cjs` 对缓存和下载逐次校验大小与 SHA，仅接受 ZIP 中精确的 `bun-windows-x64/bun.exe`，原子写入后核验版本，并用 bundled Bun 执行 `install --frozen-lockfile --production`。
- `check-runtime.cjs` 检查 Bun、engine 入口、preload、锁文件、生产依赖与关键包，并审计 `.env.defaults` 和 `extraResources`。
- electron-builder `beforePack` 仅运行检查，不联网、不修复；Windows 构建顺序为 prepare、check、Vite、builder。
- 删除受跟踪的 `engine/.env`，改用仅含公开配置的 `.env.defaults`；运行时二进制、缓存、生产依赖和本地 `.env` 均被 Git 忽略。
- 打包态仅接受 bundled Bun；开发态保留用户安装和 PATH 回退。Git Bash 缺失返回 `ENGINE_GIT_BASH_MISSING` 与简体中文提示，不输出 PATH、完整环境或密钥值。

## 本机准备与验证

- 官方 ZIP：大小和 SHA-256 精确匹配清单。
- Bundled Bun：`1.3.14`。
- engine：冻结生产依赖安装成功，运行时检查通过。
- 聚焦测试：9/9 通过。
- Electron 测试：52/52 通过。
- 前端测试：9 个文件、63/63 通过。
- Vite 生产构建通过；`git diff --check` 通过（仅有既有代码分块体积警告）。
- 按任务边界未运行 NSIS 打包。

## 仍有边界

当前测试版不捆绑 Git for Windows。部署验收对象仍需预装 Git for Windows；后续若要求真正零前置，需要单独完成 portable Git 的许可证与体积评估。
