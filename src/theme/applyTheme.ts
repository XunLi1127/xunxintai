import type { SemanticColorTokens, ThemeDefinition } from './types';
import { validateTheme } from './validateTheme';

function cssTokenName(tokenName: keyof SemanticColorTokens): string {
  return `--xun-${tokenName.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
}

export function applyTheme(theme: ThemeDefinition, root: HTMLElement): void {
  const errors = validateTheme(theme);
  if (errors.length > 0) throw new Error(`Invalid theme "${theme.id}": ${errors.join('; ')}`);

  for (const [tokenName, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(cssTokenName(tokenName as keyof SemanticColorTokens), value);
  }
  root.dataset.themeId = theme.id;
  root.dataset.themeMode = theme.mode;
  root.classList.toggle('dark', theme.mode !== 'light');
  if (root.classList.length === 0) root.removeAttribute('class');
}
