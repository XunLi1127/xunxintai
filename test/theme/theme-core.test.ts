import { describe, expect, it } from 'vitest';

import { applyTheme } from '../../src/theme/applyTheme';
import { BUILTIN_THEMES } from '../../src/theme/builtinThemes';
import { contrastRatio } from '../../src/theme/color';
import type { SemanticColorTokens, ThemeDefinition } from '../../src/theme/types';
import { validateTheme } from '../../src/theme/validateTheme';

const TOKEN_NAMES: (keyof SemanticColorTokens)[] = [
  'canvas', 'panel', 'overlay', 'textPrimary', 'textSecondary', 'textMuted',
  'textInverse', 'border', 'focus', 'accent', 'success', 'warning', 'error',
  'info', 'codeBackground', 'codeText', 'selection', 'link',
];

const COLOR_PATTERN = /^#[0-9A-F]{6}(?:[0-9A-F]{2})?$/i;

describe('built-in semantic themes', () => {
  it('contains the five stable unique theme ids', () => {
    expect(BUILTIN_THEMES.map(theme => theme.id)).toEqual([
      'catppuccin-latte',
      'catppuccin-mocha',
      'tinted-default-light',
      'tinted-default-dark',
      'xun-high-contrast',
    ]);
    expect(new Set(BUILTIN_THEMES.map(theme => theme.id)).size).toBe(BUILTIN_THEMES.length);
  });

  it.each(BUILTIN_THEMES)('$id has all 18 valid semantic colors', theme => {
    expect(Object.keys(theme.tokens).sort()).toEqual([...TOKEN_NAMES].sort());
    expect(Object.values(theme.tokens).every(color => COLOR_PATTERN.test(color))).toBe(true);
    expect(validateTheme(theme)).toEqual([]);
  });

  it.each(BUILTIN_THEMES)('$id has readable body and code text', theme => {
    expect(contrastRatio(theme.tokens.textPrimary, theme.tokens.canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(theme.tokens.codeText, theme.tokens.codeBackground)).toBeGreaterThanOrEqual(4.5);
  });

  it('pins Catppuccin source metadata', () => {
    for (const theme of BUILTIN_THEMES.filter(item => item.id.startsWith('catppuccin-'))) {
      expect(theme.source).toEqual({
        name: 'Catppuccin Palette',
        url: 'https://github.com/catppuccin/palette',
        license: 'MIT',
        revision: '07d02aa110ef9eb7e7427afca5c73ba9cf7f8ebd',
      });
    }
  });

  it('pins Tinted source metadata', () => {
    for (const theme of BUILTIN_THEMES.filter(item => item.id.startsWith('tinted-'))) {
      expect(theme.source).toEqual({
        name: 'Tinted Theming Schemes',
        url: 'https://github.com/tinted-theming/schemes',
        license: 'MIT',
        revision: '010185535336bf94d815b900cd63bb0fc204e216',
      });
    }
  });

  it('keeps the high contrast body at 7:1 and focus distinct from canvas', () => {
    const theme = BUILTIN_THEMES.find(item => item.id === 'xun-high-contrast')!;
    expect(contrastRatio(theme.tokens.textPrimary, theme.tokens.canvas)).toBeGreaterThanOrEqual(7);
    expect(theme.tokens.focus).not.toBe(theme.tokens.canvas);
  });
});

describe('color contrast', () => {
  it('composites translucent foregrounds over the actual opaque background', () => {
    expect(contrastRatio('#ffffff40', '#000000')).toBeCloseTo(2.03, 2);
  });

  it('uses a conservative 1:1 lower bound for a background with an unknown backdrop', () => {
    expect(contrastRatio('#000000', '#ffffff80')).toBe(1);
  });
});

describe('theme validation and DOM application', () => {
  it('writes every xun token and both theme attributes', () => {
    const root = document.createElement('html');
    const theme = BUILTIN_THEMES[0];

    applyTheme(theme, root);

    for (const tokenName of TOKEN_NAMES) {
      const cssName = tokenName.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
      expect(root.style.getPropertyValue(`--xun-${cssName}`)).toBe(theme.tokens[tokenName]);
    }
    expect(root.dataset.themeId).toBe(theme.id);
    expect(root.dataset.themeMode).toBe(theme.mode);
  });

  it('rejects an invalid theme without partially changing the DOM', () => {
    const root = document.createElement('html');
    const valid = BUILTIN_THEMES[0];
    applyTheme(valid, root);
    const before = root.outerHTML;
    const invalid: ThemeDefinition = {
      ...valid,
      id: 'invalid',
      tokens: { ...valid.tokens, textPrimary: '#FFFFFF' },
    };

    expect(() => applyTheme(invalid, root)).toThrow('Invalid theme "invalid"');
    expect(root.outerHTML).toBe(before);
  });

  it('rejects a high-contrast focus color below 3:1 against canvas', () => {
    const highContrast = BUILTIN_THEMES.find(theme => theme.id === 'xun-high-contrast')!;
    const invalid: ThemeDefinition = {
      ...highContrast,
      tokens: { ...highContrast.tokens, focus: '#333333' },
    };

    expect(validateTheme(invalid)).toContain('High contrast focus must have at least 3:1 contrast against canvas');
  });
});
