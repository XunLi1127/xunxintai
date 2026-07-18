import { contrastRatio, isHexColor } from './color';
import type { SemanticColorTokens, ThemeDefinition } from './types';

const TOKEN_NAMES: readonly (keyof SemanticColorTokens)[] = [
  'canvas', 'panel', 'overlay', 'textPrimary', 'textSecondary', 'textMuted', 'textInverse',
  'border', 'focus', 'accent', 'success', 'warning', 'error', 'info', 'codeBackground',
  'codeText', 'selection', 'link',
];

export function validateTheme(theme: ThemeDefinition): string[] {
  const errors: string[] = [];
  for (const tokenName of TOKEN_NAMES) {
    if (!isHexColor(theme.tokens?.[tokenName])) errors.push(`Invalid color token: ${tokenName}`);
  }
  if (errors.length > 0) return errors;
  if (contrastRatio(theme.tokens.textPrimary, theme.tokens.canvas) < 4.5) {
    errors.push('textPrimary must have at least 4.5:1 contrast against canvas');
  }
  if (contrastRatio(theme.tokens.codeText, theme.tokens.codeBackground) < 4.5) {
    errors.push('codeText must have at least 4.5:1 contrast against codeBackground');
  }
  if (theme.mode === 'high-contrast' && contrastRatio(theme.tokens.textPrimary, theme.tokens.canvas) < 7) {
    errors.push('High contrast textPrimary must have at least 7:1 contrast against canvas');
  }
  if (theme.mode === 'high-contrast' && theme.tokens.focus.toLowerCase() === theme.tokens.canvas.toLowerCase()) {
    errors.push('High contrast focus must differ from canvas');
  }
  return errors;
}
