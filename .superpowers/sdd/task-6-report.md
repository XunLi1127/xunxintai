# 任务 6 报告

- RED：先新增协议与管道客户端测试；首次运行因 `protocol.cjs`、`pipe-client.cjs` 不存在而失败（0 通过，2 个测试文件失败）。补充 manager 测试时也先因模块不存在失败；补充 settings 协议白名单测试时先因未知字段未拒绝而失败。
- GREEN：聚焦测试 13/13 通过；Electron 全量 31/31 通过；Vitest 53/53 通过。
- 构建：`npm.cmd run build` 退出码 0；仅有既有的动态/静态导入与大 chunk 警告。
- 协议安全：固定 1.0 协议、16 KiB NDJSON 上限、消息和字段白名单、递归敏感字段拒绝、握手前禁发状态、session/seq 单调校验、一次性令牌仅 stdin 首行、随机命名管道、心跳/退避/停止清理、诊断脱敏。
- IPC：只暴露固定 pet API；启动不接收渲染进程可执行命令；当前 sidecar 未安装时返回稳定 `PET_SIDECAR_NOT_INSTALLED` 状态。
- 已知顾虑：本任务不包含 sidecar 服务端、安装发现、下载更新或 UI；因此主进程 manager 当前保持未安装状态，后续任务需用主进程可信配置接入实际 sidecar。
