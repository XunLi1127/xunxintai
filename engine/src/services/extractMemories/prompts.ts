/**
 * 后台记忆提取代理的提示词模板。
 *
 * 提取代理作为主对话的完整 fork 运行——相同的系统提示词、相同的消息前缀。
 * 主代理的系统提示词始终包含完整的保存指令；当主代理自行写入记忆时，
 * extractMemories.ts 会跳过该轮（hasMemoryWritesSince）。
 * 此提示词仅在主代理未写入时触发，因此此处的保存条件与系统提示词有重叠但不冲突。
 */

import { feature } from 'bun:bundle'
import {
  MEMORY_FRONTMATTER_EXAMPLE,
  TYPES_SECTION_COMBINED,
  TYPES_SECTION_INDIVIDUAL,
  WHAT_NOT_TO_SAVE_SECTION,
} from '../../memdir/memoryTypes.js'
import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js'
import { FILE_EDIT_TOOL_NAME } from '../../tools/FileEditTool/constants.js'
import { FILE_READ_TOOL_NAME } from '../../tools/FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../../tools/FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '../../tools/GlobTool/prompt.js'
import { GREP_TOOL_NAME } from '../../tools/GrepTool/prompt.js'

/**
 * 两种提取提示词变体的共享开头。
 * 洵心台：以下提示词已汉化
 */
function opener(newMessageCount: number, existingMemories: string): string {
  const manifest =
    existingMemories.length > 0
      ? `\n\n## 已有记忆文件\n\n${existingMemories}\n\n写入前先检查此列表——优先更新已有文件，避免创建重复。`
      : ''
  return [
    `你现在作为记忆提取子代理运行。分析上方最近约 ${newMessageCount} 条消息，并用它们更新持久记忆系统。`,
    '',
    `可用工具：${FILE_READ_TOOL_NAME}、${GREP_TOOL_NAME}、${GLOB_TOOL_NAME}、只读 ${BASH_TOOL_NAME}（ls/find/cat/stat/wc/head/tail 等），以及 ${FILE_EDIT_TOOL_NAME}/${FILE_WRITE_TOOL_NAME}（仅限记忆目录内的路径）。不允许 ${BASH_TOOL_NAME} rm。其他所有工具——MCP、Agent、可写入的 ${BASH_TOOL_NAME} 等——将被拒绝。`,
    '',
    `你只有有限的轮次预算。${FILE_EDIT_TOOL_NAME} 需要先对该文件执行 ${FILE_READ_TOOL_NAME}，因此高效策略是：第 1 轮——并行为每个可能更新的文件发出所有 ${FILE_READ_TOOL_NAME} 调用；第 2 轮——并行为每个文件发出所有 ${FILE_WRITE_TOOL_NAME}/${FILE_EDIT_TOOL_NAME} 调用。不要跨轮交替读写。`,
    '',
    `你必须仅使用最近约 ${newMessageCount} 条消息的内容来更新持久记忆。不要浪费任何轮次去进一步调查或验证这些内容——不要搜索源文件、不要阅读代码来确认某个模式、不要执行 git 命令。` +
      manifest,
  ].join('\n')
}

/**
 * 构建仅自动记忆（无团队记忆）的提取提示词。
 * 四种类型分类，无范围指引（单目录）。
 * 洵心台：提示词已汉化
 */
export function buildExtractAutoOnlyPrompt(
  newMessageCount: number,
  existingMemories: string,
  skipIndex = false,
): string {
  const howToSave = skipIndex
    ? [
        '## 如何保存记忆',
        '',
        '将每条记忆写入独立文件（如 `用户角色.md`、`反馈测试.md`），使用以下 frontmatter 格式：',
        '',
        ...MEMORY_FRONTMATTER_EXAMPLE,
        '',
        '- 按主题而非时间顺序组织记忆',
        '- 发现错误的记忆应及时更新或删除',
        '- 不要写入重复记忆。写入前先检查是否可以更新已有文件。',
      ]
    : [
        '## 如何保存记忆',
        '',
        '保存记忆是一个两步过程：',
        '',
        '**第一步**——将记忆写入自己的文件（如 `用户角色.md`、`反馈测试.md`），使用以下 frontmatter 格式：',
        '',
        ...MEMORY_FRONTMATTER_EXAMPLE,
        '',
        '**第二步**——在 `MEMORY.md` 中添加指向该文件的条目。`MEMORY.md` 是索引而非记忆——每条一行，约 150 字符以内：`- [标题](文件.md) —— 一句话摘要`。它没有 frontmatter。绝不要将记忆内容直接写入 `MEMORY.md`。',
        '',
        '- `MEMORY.md` 始终加载在系统提示中——200 行之后会被截断，因此保持索引精简',
        '- 按主题而非时间顺序组织记忆',
        '- 发现错误的记忆应及时更新或删除',
        '- 不要写入重复记忆。写入前先检查是否可以更新已有文件。',
      ]

  return [
    opener(newMessageCount, existingMemories),
    '',
    '如果用户明确要求你记住某件事，立即以最合适的类型保存。如果要求你忘记某事，找到并删除相关条目。',
    '',
    ...TYPES_SECTION_INDIVIDUAL,
    ...WHAT_NOT_TO_SAVE_SECTION,
    '',
    ...howToSave,
  ].join('\n')
}

/**
 * 构建自动记忆 + 团队记忆的提取提示词。
 * 四种类型分类，每种类型带有 <scope> 指引（目录选择嵌入每个类型块，无需单独的路由部分）。
 * 洵心台：提示词已汉化
 */
export function buildExtractCombinedPrompt(
  newMessageCount: number,
  existingMemories: string,
  skipIndex = false,
): string {
  if (!feature('TEAMMEM')) {
    return buildExtractAutoOnlyPrompt(
      newMessageCount,
      existingMemories,
      skipIndex,
    )
  }

  const howToSave = skipIndex
    ? [
        '## 如何保存记忆',
        '',
        '将每条记忆写入所选目录中的独立文件（私有或团队，按类型范围指引），使用以下 frontmatter 格式：',
        '',
        ...MEMORY_FRONTMATTER_EXAMPLE,
        '',
        '- 按主题而非时间顺序组织记忆',
        '- 发现错误的记忆应及时更新或删除',
        '- 不要写入重复记忆。写入前先检查是否可以更新已有文件。',
      ]
    : [
        '## 如何保存记忆',
        '',
        '保存记忆是一个两步过程：',
        '',
        '**第一步**——将每条记忆写入所选目录中的独立文件（私有或团队，按类型的范围指引），使用以下 frontmatter 格式：',
        '',
        ...MEMORY_FRONTMATTER_EXAMPLE,
        '',
        '**第二步**——在同目录的 `MEMORY.md` 中添加指向该文件的条目。每个目录（私有和团队）都有自己的 `MEMORY.md` 索引——每条一行，约 150 字符以内：`- [标题](文件.md) —— 一句话摘要`。它们没有 frontmatter。绝不要将记忆内容直接写入 `MEMORY.md`。',
        '',
        '- 两个 `MEMORY.md` 索引都加载在系统提示中——200 行之后会被截断，因此保持精简',
        '- 按主题而非时间顺序组织记忆',
        '- 发现错误的记忆应及时更新或删除',
        '- 不要写入重复记忆。写入前先检查是否可以更新已有文件。',
      ]

  return [
    opener(newMessageCount, existingMemories),
    '',
    '如果用户明确要求你记住某件事，立即以最合适的类型保存。如果要求你忘记某事，找到并删除相关条目。',
    '',
    ...TYPES_SECTION_COMBINED,
    ...WHAT_NOT_TO_SAVE_SECTION,
    '- 你必须避免在共享的团队记忆中保存敏感数据。例如，绝不要保存 API 密钥或用户凭证。',
    '',
    ...howToSave,
  ].join('\n')
}
