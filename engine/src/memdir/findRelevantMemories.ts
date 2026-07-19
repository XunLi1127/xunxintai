import { feature } from 'bun:bundle'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'
import { getDefaultSonnetModel } from '../utils/model/model.js'
import { sideQuery } from '../utils/sideQuery.js'
import { jsonParse } from '../utils/slowOperations.js'
import {
  formatMemoryManifest,
  type MemoryHeader,
  scanMemoryFiles,
} from './memoryScan.js'

export type RelevantMemory = {
  path: string
  mtimeMs: number
}

// 洵心台：以下提示词已汉化
const SELECT_MEMORIES_SYSTEM_PROMPT = `你正在为洵心台选择对处理用户查询有用的记忆文件。你将收到用户的查询，以及一份可用记忆文件列表（含文件名和描述）。

返回一份对处理该查询明确有用的记忆文件名列表（最多 5 个）。只包含你确信会有所帮助的记忆。
- 如果不确定某条记忆是否有用，就不要包含它。保持筛选和辨别。
- 如果列表中没有明显有用的记忆，可以返回空列表。
- 如果提供了最近使用的工具列表，不要选择这些工具的使用参考或 API 文档类记忆（洵心台已经在使用这些工具了）。但仍需选择包含这些工具的警告、踩坑记录或已知问题的记忆——正在使用时恰恰最需要这些信息。
`

/**
 * 扫描记忆文件头信息，通过 Sonnet 选择与查询最相关的记忆。
 *
 * 返回最相关记忆的绝对路径 + 修改时间（最多 5 个）。
 * 排除 MEMORY.md（已加载在系统提示中）。
 * mtime 传给调用方，使其无需二次 stat 即可展示记忆新鲜度。
 *
 * `alreadySurfaced` 在 Sonnet 调用前过滤已在之前轮次展示过的路径，
 * 让选择器将 5 个名额用于新候选者，而非重复挑选会被调用方丢弃的文件。
 */
export async function findRelevantMemories(
  query: string,
  memoryDir: string,
  signal: AbortSignal,
  recentTools: readonly string[] = [],
  alreadySurfaced: ReadonlySet<string> = new Set(),
): Promise<RelevantMemory[]> {
  const memories = (await scanMemoryFiles(memoryDir, signal)).filter(
    m => !alreadySurfaced.has(m.filePath),
  )
  if (memories.length === 0) {
    return []
  }

  const selectedFilenames = await selectRelevantMemories(
    query,
    memories,
    signal,
    recentTools,
  )
  const byFilename = new Map(memories.map(m => [m.filename, m]))
  const selected = selectedFilenames
    .map(filename => byFilename.get(filename))
    .filter((m): m is MemoryHeader => m !== undefined)

  // 即使空选择也触发：选择率需要分母，-1 龄期可区分"运行过但没选到"和"从未运行"
  if (feature('MEMORY_SHAPE_TELEMETRY')) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { logMemoryRecallShape } =
      require('./memoryShapeTelemetry.js') as typeof import('./memoryShapeTelemetry.js')
    /* eslint-enable @typescript-eslint/no-require-imports */
    logMemoryRecallShape(memories, selected)
  }

  return selected.map(m => ({ path: m.filePath, mtimeMs: m.mtimeMs }))
}

async function selectRelevantMemories(
  query: string,
  memories: MemoryHeader[],
  signal: AbortSignal,
  recentTools: readonly string[],
): Promise<string[]> {
  const validFilenames = new Set(memories.map(m => m.filename))

  const manifest = formatMemoryManifest(memories)

  // 当洵心台正在使用某个工具时，提供该工具的参考文档是噪音——对话中已有可用的用法。
  // 选择器否则会基于关键词重叠误匹配。
  const toolsSection =
    recentTools.length > 0
      ? `\n\n最近使用的工具：${recentTools.join(', ')}`
      : ''

  try {
    const result = await sideQuery({
      model: getDefaultSonnetModel(),
      system: SELECT_MEMORIES_SYSTEM_PROMPT,
      skipSystemPromptPrefix: true,
      messages: [
        {
          role: 'user',
          content: `查询：${query}\n\n可用记忆：\n${manifest}${toolsSection}`,
        },
      ],
      max_tokens: 256,
      output_format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            selected_memories: { type: 'array', items: { type: 'string' } },
          },
          required: ['selected_memories'],
          additionalProperties: false,
        },
      },
      signal,
      querySource: 'memdir_relevance',
    })

    const textBlock = result.content.find(block => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return []
    }

    const parsed: { selected_memories: string[] } = jsonParse(textBlock.text)
    return parsed.selected_memories.filter(f => validFilenames.has(f))
  } catch (e) {
    if (signal.aborted) {
      return []
    }
    logForDebugging(
      `[memdir] selectRelevantMemories 失败：${errorMessage(e)}`,
      { level: 'warn' },
    )
    return []
  }
}
