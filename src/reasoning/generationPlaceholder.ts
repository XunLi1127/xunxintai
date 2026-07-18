import type { ReasoningSource } from './types';

type GenerationPlaceholderInput = {
  text?: string;
  thinking?: string;
  thinkingSummary?: string;
  thinkingSource?: ReasoningSource;
  thinkingInterrupted?: boolean;
  citations?: unknown;
  searchLogs?: unknown;
};

export function createGenerationPlaceholder(state: GenerationPlaceholderInput) {
  return {
    role: 'assistant' as const,
    content: state.text || '',
    thinking: state.thinking || '',
    thinkingSummary: state.thinkingSummary,
    thinkingSource: state.thinkingSource,
    thinkingInterrupted: state.thinkingInterrupted,
    citations: state.citations,
    searchLogs: state.searchLogs,
    isThinking: !state.text && !!state.thinking,
  };
}
