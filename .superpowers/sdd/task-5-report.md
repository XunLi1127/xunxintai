# 任务 5 实现报告

## RED / GREEN

- RED 1：`npm run test:electron` 退出码 1，新增测试因 `electron/theme-import/constants.cjs` 尚不存在而失败。
- RED 2：加入 APNG 契约后 7/8 通过，APNG 因扩展名尚未受支持而按预期失败。
- GREEN：`npm run test:electron` 退出码 0，8/8 通过。

## 安全覆盖与实现

- 拒绝 `..` 路径段、绝对路径、盘符、UNC、反斜杠、符号链接和特殊 zip 条目。
- central directory 先验文件数、单文件及累计声明大小；`yauzl` 校验声明大小，流式解压再次核对实际字节，失败清理随机临时目录。
- `image-size` 配合 PNG/JPEG/GIF/WebP/APNG 魔数验证、像素上限及损坏拒绝。
- SVG 保守拒绝脚本、`foreignObject`、事件属性、JavaScript URI、外部引用及大小写/空白/数值实体绕过。
- 固定顺序归一洵心台、Clawd、Codex Pet、Base24、Base16、媒体；Codex Pet 图集必须为 1536×1872。
- 安装写入 `.staging/<uuid>`，生成并重读规范 manifest 后同卷 rename；失败清理 staging，不覆盖已有主题。删除仅接受安全主题 id 且解析后仍位于主题根。
- IPC 仅以随机 selection/inspection id 串联选择、检查和安装；渲染进程不能指定源路径、临时根或目标根。`themeApi` 只暴露五项主题能力。

## 依赖

- 新增 `yauzl@^3.4.0`、`image-size@^2.0.2`，并更新锁文件。

## 最终验证

- `npm run test:electron`：退出码 0，8/8。
- `npm test`：退出码 0，7 个测试文件、53/53。
- `npm.cmd run build`：退出码 0，3706 modules transformed，构建完成。
- `git diff --check`：退出码 0。

## 自审与已知警告

- 自审未发现范围外 sidecar、桌宠协议、联网、UI 或任意文件系统 IPC 改动；未提交构建产物或测试二进制夹具。
- 构建保留仓库既有的 clipboard 动静态混合导入和大 chunk 警告。
- `npm install` 报告依赖树中 28 个审计项（1 low、9 moderate、18 high）；本任务未做范围外 `npm audit fix`。
- 提交：`feat: 增加安全主题素材导入管线`。

## 安全复审修复

- 追加 RED：复审测试最初 5/11 通过，6 项失败分别暴露完整解码、SVG 外部样式、manifest 短路、删除 ownership、selection 复用及异常 zip 契约；APNG 结构测试随后以 14/15 触发预期 RED。
- xun/clawd 等格式在识别前统一执行根级 JSON allowlist 与逐媒体扩展名、魔数、完整解码、像素和 SVG 校验；安装后从 staging 重读实际文件并 await 同一验证链。
- 使用 `sharp` 完整解码栅格图片，`pngjs` 校验 PNG/APNG CRC，`png-chunks-extract` 验证 APNG 必须具有真实 `acTL`/`fcTL` 块；测试夹具均为真实有效 PNG/APNG。
- SVG 进一步拒绝 style 元素/属性、CSS `url()`、`@import`、非 XML 声明 PI、DOCTYPE/ENTITY 及额外外部资源属性。
- manifest 写入 pipeline ownership 标记；删除前用 `lstat` 拒绝目录/manifest 链接，并验证 manifest 为常规文件、id 匹配且 ownership 有效。
- selection token 在检查开始时一次性消费；inspection 默认 10 分钟自动到期、最多 4 项，过期/淘汰/安装均释放内存并清理临时目录。
- 真实 zip 测试确认 central directory 路径先验、声明/实际大小异常、失败隔离清理；同时修复了解压流在建立输出管道前被 data listener 提前消费的问题。
- 复审后验证：`npm run test:electron` 退出码 0，15/15；`npm test` 退出码 0，7 文件、53/53；`npm.cmd run build` 退出码 0，3706 modules；`git diff --check` 退出码 0。
- 依赖调整：移除 `image-size`，新增运行时 `sharp`、`pngjs`、`png-chunks-extract`；`png-chunks-encode` 仅为开发测试依赖。`png-chunks-extract` 的依赖树含 deprecated `sliced@1.0.1` 提示，当前无已知替代安全缺口。

## 第二轮安全复审修复

- 三项新增测试先得到 RED（15/18）：namespace 前缀 SVG、像素预检顺序、并发 inspection token 各失败 1 项；最小修复后 18/18 GREEN。
- SVG 保守拒绝任何 namespace-prefixed element，覆盖 `<x:script>` 与 `<x:foreignObject>`。
- `sharp(..., { limitInputPixels: 32_000_000 }).metadata()` 在 `pngjs` CRC 与完整像素解码之前执行；超限由 header/metadata 阶段直接拒绝，测试用 decoder sentinel 证明未进入完整 PNG 解码。
- `installImport` 在任何 `await` 前同步校验、读取并删除 inspection token，同时清除 TTL；并发 `Promise.allSettled` 验证同 token 仅一次安装成功，另一请求以 unknown inspection 拒绝。
- inspect 的 extract/read/validate 纳入统一清理 try/catch；现有真实异常 zip 测试继续验证流式失败后隔离目录无残留。
- 最终验证：Electron 18/18、Vitest 7 文件 53/53、build 退出码 0（3706 modules）、diff-check 与 3 个修改模块 node-check 均为退出码 0。
