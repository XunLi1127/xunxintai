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
