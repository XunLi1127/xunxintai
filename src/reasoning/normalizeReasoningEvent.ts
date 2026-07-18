import type { ReasoningEvent } from './types';

const REDACTED_REASONING_TEXT = '该段推理未由模型提供商公开。';

export function normalizeReasoningEvent(input: unknown): ReasoningEvent | null {
  if (!input || typeof input !== 'object') return null;
  const event = input as Record<string, unknown>;
  const delta = event.delta;

  if (delta && typeof delta === 'object') {
    const structuredDelta = delta as Record<string, unknown>;
    if (structuredDelta.type === 'thinking_delta' && typeof structuredDelta.thinking === 'string') {
      return { kind: 'delta', text: structuredDelta.thinking, source: 'provider' };
    }
  }

  if (event.type === 'thinking_summary' && typeof event.summary === 'string') {
    return { kind: 'summary', text: event.summary, source: 'provider' };
  }

  if (event.type === 'redacted_thinking') {
    return { kind: 'redacted', text: REDACTED_REASONING_TEXT, source: 'provider' };
  }

  return null;
}
