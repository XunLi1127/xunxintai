# 主程序 MVP 任务 5 报告

## 构建产物

- 安装包：`release/Xunxintai-Setup-1.6.31-x64.exe`
- 大小：215,063,120 字节
- SHA-256：`38FD8D975C065FD26871EFCF6B24E7DB9AC32224B87535A4053F8DE5990CC2CC`
- Windows 解包主程序：222,730,240 字节，SHA-256 `747E8244A41910355BDC490E36F3C10BEA20D67E7D4E0E4D6305CDE00A863B4F`
- 身份：appId `com.xunxintai.desktop`，productName/PE ProductName/FileDescription 为“洵心台”，artifactName 为 `Xunxintai-Setup-${version}-${arch}.${ext}`。
- Authenticode：安装包与主程序均为 `NotSigned`，符合未签名测试版边界。

## 品牌资产

- `assets/brand/xunxintai-mark.svg` 是无文字、无 Claude/Anthropic 图形的确定性母版。
- `scripts/generate-brand-icons.cjs` 使用 sharp 生成 16/32/48/64/128/256/512/1024 PNG，并封装 16/32/48/64/128/256 六帧 ICO。
- 连续两次生成的 ICO SHA-256 均为 `305DD846F41FA0492CF77B1AF37003341204475013041CEA4E6693C9098F22BD`。
- BrowserWindow、tray、favicon、Windows/macOS/Linux build icon 与 README 顶部均已切换为洵心台资产。

## 资源硬验收

- `electron:build:win` 实际通过 runtime prepare/check、Vite build、beforePack、Electron packaging 与 NSIS。
- `win-unpacked/resources/engine/bin/bun.exe --version` 为 `1.3.14`；SHA-256 为 `0187F68D843F825A72ADA4A7ECA60DB896ED753759A7F8252EDCD31AC1BF1B9C`。
- resources 含 engine/node_modules、engine/src、engine/preload.ts；app.asar 含 `electron/小洵.md`。
- 对 release 与安装目录的文件名扫描均未发现 `engine/.env`、runtime cache、真实 `secrets.json`、PEM/KEY 私钥文件；未读取任何用户凭据内容。
- 安装包 7-Zip 完整性测试通过：23,589 文件，解压数据 832,856,416 字节。

## 本机部署与烟测

- 安装目录：`C:\Users\13477\AppData\Local\Programs\XunxintaiTest`
- 已安装 `洵心台.exe` SHA-256 与 win-unpacked 主程序一致。
- 已安装 Bun 版本 `1.3.14`，engine/node_modules、engine/src、preload 与新品牌图标均存在。
- 启动后 12 秒主进程仍存活，并观察到 GPU、utility、renderer 子进程。
- `main-process.log` 记录新 `xunxintai-256.png` 托盘图标、renderer `did-finish-load` 与窗口 `ready-to-show`；没有 ENOENT 或替换字符乱码。
- bridge `GET /api/system-status` 返回 `platform=win32`、`gitBash.required=true`、`gitBash.found=true`，路径为 `C:\Program Files\Git\bin\bash.exe`。
- 没有填写、读取或迁移 API 密钥，没有调用聊天接口或发出真实模型请求，没有启动桌宠，也没有修改/卸载旧 Claude Desktop CN。

## 环境问题记录

首次构建在解压官方 `winCodeSign-2.6.0.7z` 时因当前 Windows 会话没有符号链接权限而 exit 2，仅失败于 macOS 的 `libcrypto.dylib` 与 `libssl.dylib`。归档中的实际目标文件完整，最小处理是将两个链接目标复制为等价普通文件并建立 electron-builder 约定缓存；原构建命令随后完整通过，未绕过 beforePack 或运行时校验。

首次执行安装包仅带 `/S` 时 exit `0xC0000005`，WER 指向临时 `System.dll` 偏移 `0x1581`；安装包完整性测试通过。无 `/S` 的安装器初始化保持运行，`/S /D=<ASCII 当前用户目录>` 完整写入 23,590 文件、832,996,810 字节并创建卸载项，故障被隔离到 NSIS 默认目录/既有安装发现分支。本次测试部署使用显式 `/D`，旧 Claude 安装与数据未改动。

## 验证结果

- `npm test`：10 个文件、66 个测试通过。
- `npm run test:electron`：62 个测试通过。
- `npm.cmd run build`：通过。
- `npm run electron:build:win`：通过。
- 图标生成脚本 Node 语法检查：通过。
- `git diff --check`：交付前重新执行。
