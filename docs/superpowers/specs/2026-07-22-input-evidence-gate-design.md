# 洵心台输入证据硬门设计

## 目标

在用户消息持久化、研究分流或 Bun 引擎写入前，确保请求声称携带的附件确实形成了可用证据。硬门阻止“只有图片占位文本却没有图像字节”以及“附件声明存在但源缺失”的请求继续进入模型。

## 选择

不使用自然语言意图分类器，也不猜测用户是否“想让模型看图”。硬门只依据结构化请求与事实证据账本：请求含真实附件声明时，每个附件都必须产生 `available` 证据；消息含产品保留的图片占位格式时，至少要有一条 `available/model_image`。普通文本中自然出现“图片”“截图”等词不触发。

## 接口

新增 `electron/input-evidence-gate.cjs`：

- `validateInputEvidence({ message, attachments, evidence })`
- 成功返回冻结的 `{ ok: true }`。
- 失败返回冻结的 `{ ok: false, code, message, details }`，其中 details 只含计数和稳定原因码，不含正文、文件名、路径或附件内容。

稳定错误码：

- `INPUT_ATTACHMENT_EVIDENCE_MISSING`：结构化附件没有对应 available 证据。
- `INPUT_IMAGE_EVIDENCE_REQUIRED`：保留图片占位存在，但没有 model_image。
- `INPUT_EVIDENCE_INCONSISTENT`：附件数量与证据条目不一致或出现未知证据状态。

保留占位仅匹配整段或独立行的 `[image]`、`[image #N]`、`[图片]`、`[图片 #N]`（大小写不敏感、N 为 1–3 位十进制）。不匹配代码片段或句中普通文本。

## 数据流与原子性

bridge 先构建账本并处理附件，但不写用户消息、不调用研究管线、不查找/启动引擎。随后调用硬门。失败时清除本请求加入的 `pendingImageBlocks`，对本请求新复制到工作区的文件做所有权安全回滚，并以 HTTP 422/SSE 稳定错误结束；不得留下消息、engine stdin 写入或研究调用。成功才生成同一账本 snapshot、持久化并继续现有路径。

## 测试与边界

聚焦测试覆盖普通文本放行、占位无图拒绝、占位有 model_image 放行、附件缺失/复制失败拒绝、多附件计数一致、错误脱敏，以及失败时消息/研究/engine 三条副作用均未发生。保留现有可查看推理内容能力，不改其采集或表述。

范围外：不做 OCR、视觉能力探测、前端弹窗、Windows 凭据、检查点 API 或桌宠。
