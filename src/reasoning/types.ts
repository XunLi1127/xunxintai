export type ReasoningSource = 'provider' | 'compatibility';

export type ReasoningEvent = {
  kind: 'delta' | 'summary' | 'redacted' | 'interrupted';
  text: string;
  source: ReasoningSource;
};

export function mergeReasoningSource(
  current?: ReasoningSource,
  incoming?: ReasoningSource,
): ReasoningSource {
  if (current === 'provider' || incoming === 'provider') return 'provider';
  return incoming || current || 'provider';
}
