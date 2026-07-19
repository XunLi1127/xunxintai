import { readFile } from 'fs/promises'
import { join } from 'path'
import { roughTokenCountEstimation } from '../../services/tokenEstimation.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { getErrnoCode, toError } from '../../utils/errors.js'
import { logError } from '../../utils/log.js'

const MAX_SECTION_LENGTH = 2000
const MAX_TOTAL_SESSION_MEMORY_TOKENS = 12000

// 洵心台：会话笔记模板已汉化
export const DEFAULT_SESSION_MEMORY_TEMPLATE = `
# 会话标题
_简短而有辨识度的 5-10 字描述性标题。信息密度高，不加废话_

# 当前状态
_当前正在做什么？尚未完成的待办事项。下一步立即要做的事。_

# 任务说明
_用户要求构建什么？有哪些设计决策或其他说明性上下文_

# 文件与函数
_哪些文件是重要的？简要说明它们包含什么以及为什么相关_

# 工作流程
_通常运行哪些 bash 命令，按什么顺序？如果输出不直观，如何解读_

# 错误与修正
_遇到了哪些错误，如何修复的。用户纠正了什么？哪些方法失败了，不应该再试_

# 代码库与系统文档
_重要的系统组件有哪些？它们如何工作/配合_

# 经验教训
_哪些做得好？哪些不好？应该避免什么？不要与其他部分重复_

# 关键结果
_如果用户要求了特定输出（如问题的答案、表格或其他文档），在此重复确切结果_

# 工作日志
_逐步记录尝试了什么、做了什么。每步极简摘要_
`

// 洵心台：会话笔记更新提示词已汉化
function getDefaultUpdatePrompt(): string {
  return `重要提示：本消息和这些指令不是用户实际对话的一部分。不要在笔记内容中提及"记笔记""会话笔记提取"或这些更新指令。

根据上方用户对话（排除本记笔记指令消息、系统提示词、CLAUDE.md 条目以及任何过去的会话摘要），更新会话笔记文件。

文件 {{notesPath}} 已为你读取。以下是其当前内容：
<current_notes_content>
{{currentNotes}}
</current_notes_content>

你唯一的任务是使用 Edit 工具更新笔记文件，然后停止。你可以进行多次编辑（根据需要更新每个部分）——在单条消息中并行发出所有 Edit 工具调用。不要调用任何其他工具。

编辑的关键规则：
- 文件必须保持其精确结构，所有部分、标题和斜体描述保持完整
-- 绝不修改、删除或添加部分标题（以 # 开头的行，如 # 任务说明）
-- 绝不修改或删除斜体 _部分描述_ 行（紧接每个标题下方的斜体行——以 _ 开头和结尾）
-- 斜体 _部分描述_ 是模板指令，必须原样保留——它们指导每个部分应包含什么内容
-- 只更新每个已有部分中 _部分描述_ 下方的内容
-- 不要在现有结构外添加新部分、摘要或信息
- 绝不在笔记中引用此记笔记过程或指令
- 如果某个部分没有实质性的新见解，可以跳过。不要添加"暂无信息"之类的填充内容，适当时留空即可
- 为每个部分写详细、信息密集的内容——包含文件路径、函数名、错误消息、确切命令、技术细节等
- 对于"关键结果"，包含用户要求的完整、确切的输出（如完整表格、完整答案等）
- 不要包含 CLAUDE.md 文件中已有的信息
- 每个部分保持在 ~${MAX_SECTION_LENGTH} tokens/词以内——如果接近此限制，通过循环淘汰次要细节、保留最关键信息来精简
- 聚焦于可操作、具体的信息，能帮助理解或重现对话中讨论的工作
- 重要：始终更新"当前状态"以反映最近的工作——这对压缩后的连续性至关重要

使用 Edit 工具，file_path: {{notesPath}}

结构保持提醒：
每个部分有两部分必须保持与文件中当前出现的内容完全一致：
1. 部分标题（以 # 开头的行）
2. 斜体描述行（标题后紧接的 _斜体文本_ ——这是模板指令）

你只更新这两行保留内容之后的内容。以下划线开头和结尾的斜体描述行是模板结构的一部分，不是要编辑或删除的内容。

记住：并行使用 Edit 工具然后停止。编辑完成后不要继续。只包含用户实际对话中的见解，绝不要来自这些记笔记指令。不要删除或更改部分标题或斜体 _部分描述_。`
}

/**
 * 从文件加载自定义会话笔记模板（如存在）
 */
export async function loadSessionMemoryTemplate(): Promise<string> {
  const templatePath = join(
    getClaudeConfigHomeDir(),
    'session-memory',
    'config',
    'template.md',
  )

  try {
    return await readFile(templatePath, { encoding: 'utf-8' })
  } catch (e: unknown) {
    const code = getErrnoCode(e)
    if (code === 'ENOENT') {
      return DEFAULT_SESSION_MEMORY_TEMPLATE
    }
    logError(toError(e))
    return DEFAULT_SESSION_MEMORY_TEMPLATE
  }
}

/**
 * 从文件加载自定义会话笔记更新提示词（如存在）
 * 自定义提示词可放在 ~/.claude/session-memory/prompt.md
 * 使用 {{变量名}} 语法进行变量替换（如 {{currentNotes}}、{{notesPath}}）
 */
export async function loadSessionMemoryPrompt(): Promise<string> {
  const promptPath = join(
    getClaudeConfigHomeDir(),
    'session-memory',
    'config',
    'prompt.md',
  )

  try {
    return await readFile(promptPath, { encoding: 'utf-8' })
  } catch (e: unknown) {
    const code = getErrnoCode(e)
    if (code === 'ENOENT') {
      return getDefaultUpdatePrompt()
    }
    logError(toError(e))
    return getDefaultUpdatePrompt()
  }
}

/**
 * 解析会话笔记文件并分析各部分大小
 */
function analyzeSectionSizes(content: string): Record<string, number> {
  const sections: Record<string, number> = {}
  const lines = content.split('\n')
  let currentSection = ''
  let currentContent: string[] = []

  for (const line of lines) {
    if (line.startsWith('# ')) {
      if (currentSection && currentContent.length > 0) {
        const sectionContent = currentContent.join('\n').trim()
        sections[currentSection] = roughTokenCountEstimation(sectionContent)
      }
      currentSection = line
      currentContent = []
    } else {
      currentContent.push(line)
    }
  }

  if (currentSection && currentContent.length > 0) {
    const sectionContent = currentContent.join('\n').trim()
    sections[currentSection] = roughTokenCountEstimation(sectionContent)
  }

  return sections
}

/**
 * 为过长的部分生成提醒
 */
function generateSectionReminders(
  sectionSizes: Record<string, number>,
  totalTokens: number,
): string {
  const overBudget = totalTokens > MAX_TOTAL_SESSION_MEMORY_TOKENS
  const oversizedSections = Object.entries(sectionSizes)
    .filter(([_, tokens]) => tokens > MAX_SECTION_LENGTH)
    .sort(([, a], [, b]) => b - a)
    .map(
      ([section, tokens]) =>
        `- "${section}" 约 ${tokens} tokens（限制：${MAX_SECTION_LENGTH}）`,
    )

  if (oversizedSections.length === 0 && !overBudget) {
    return ''
  }

  const parts: string[] = []

  if (overBudget) {
    parts.push(
      `\n\n严重警告：会话笔记文件当前约 ${totalTokens} tokens，超过最大值 ${MAX_TOTAL_SESSION_MEMORY_TOKENS} tokens。你必须精简文件以适应此预算。积极缩短过大部分，删除次要细节，合并相关条目，总结旧记录。优先保持"当前状态"和"错误与修正"准确详细。`,
    )
  }

  if (oversizedSections.length > 0) {
    parts.push(
      `\n\n${overBudget ? '需要精简的过大部分' : '重要：以下部分超出每部分限制，必须精简'}：\n${oversizedSections.join('\n')}`,
    )
  }

  return parts.join('')
}

/**
 * 使用 {{变量}} 语法替换提示词模板中的变量
 */
function substituteVariables(
  template: string,
  variables: Record<string, string>,
): string {
  // 单次替换避免两个 bug：(1) $ 反向引用损坏（替换函数将 $ 按字面处理），
  // (2) 用户内容碰巧包含 {{变量名}} 匹配后续变量时的双重替换。
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key)
      ? variables[key]!
      : match,
  )
}

/**
 * 检查会话笔记内容是否基本为空（与模板一致）。
 * 用于检测是否尚未提取任何实际内容，若是则应回退到旧版压缩行为。
 */
export async function isSessionMemoryEmpty(content: string): Promise<boolean> {
  const template = await loadSessionMemoryTemplate()
  return content.trim() === template.trim()
}

export async function buildSessionMemoryUpdatePrompt(
  currentNotes: string,
  notesPath: string,
): Promise<string> {
  const promptTemplate = await loadSessionMemoryPrompt()

  const sectionSizes = analyzeSectionSizes(currentNotes)
  const totalTokens = roughTokenCountEstimation(currentNotes)
  const sectionReminders = generateSectionReminders(sectionSizes, totalTokens)

  const variables = {
    currentNotes,
    notesPath,
  }

  const basePrompt = substituteVariables(promptTemplate, variables)
  return basePrompt + sectionReminders
}

/**
 * 截断超出每部分 token 限制的会话笔记部分。
 * 用于将会话笔记插入压缩消息时，防止过大的会话笔记消耗全部压缩后 token 预算。
 *
 * 返回截断后的内容和是否发生了截断。
 */
export function truncateSessionMemoryForCompact(content: string): {
  truncatedContent: string
  wasTruncated: boolean
} {
  const lines = content.split('\n')
  const maxCharsPerSection = MAX_SECTION_LENGTH * 4
  const outputLines: string[] = []
  let currentSectionLines: string[] = []
  let currentSectionHeader = ''
  let wasTruncated = false

  for (const line of lines) {
    if (line.startsWith('# ')) {
      const result = flushSessionSection(
        currentSectionHeader,
        currentSectionLines,
        maxCharsPerSection,
      )
      outputLines.push(...result.lines)
      wasTruncated = wasTruncated || result.wasTruncated
      currentSectionHeader = line
      currentSectionLines = []
    } else {
      currentSectionLines.push(line)
    }
  }

  const result = flushSessionSection(
    currentSectionHeader,
    currentSectionLines,
    maxCharsPerSection,
  )
  outputLines.push(...result.lines)
  wasTruncated = wasTruncated || result.wasTruncated

  return {
    truncatedContent: outputLines.join('\n'),
    wasTruncated,
  }
}

function flushSessionSection(
  sectionHeader: string,
  sectionLines: string[],
  maxCharsPerSection: number,
): { lines: string[]; wasTruncated: boolean } {
  if (!sectionHeader) {
    return { lines: sectionLines, wasTruncated: false }
  }

  const sectionContent = sectionLines.join('\n')
  if (sectionContent.length <= maxCharsPerSection) {
    return { lines: [sectionHeader, ...sectionLines], wasTruncated: false }
  }

  let charCount = 0
  const keptLines: string[] = [sectionHeader]
  for (const line of sectionLines) {
    if (charCount + line.length + 1 > maxCharsPerSection) {
      break
    }
    keptLines.push(line)
    charCount += line.length + 1
  }
  keptLines.push('\n[... 部分因长度截断 ...]')
  return { lines: keptLines, wasTruncated: true }
}
