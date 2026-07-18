export type CompatibilityThinkingResult = {
  visibleText: string;
  reasoning: string[];
};

export function extractCompatibilityThinking(text: string): CompatibilityThinkingResult {
  const reasoning: string[] = [];
  const visibleText = text.replace(/<thinking>([\s\S]*?)<\/thinking>\s*/g, (_full, content: string) => {
    reasoning.push(content);
    return '';
  });
  return { visibleText, reasoning };
}
