import { applyTheme } from './applyTheme';
import { findBuiltinTheme } from './builtinThemes';
import type { ThemeController, ThemeControllerOptions, ThemeDefinition, ThemePreference } from './types';

export const THEME_STORAGE_KEY = 'xun_theme_id';

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ThemeDefinition {
  if (preference === 'system') {
    return findBuiltinTheme(systemDark ? 'catppuccin-mocha' : 'catppuccin-latte')!;
  }
  const theme = findBuiltinTheme(preference);
  if (!theme) throw new Error(`Unknown theme preference: ${preference}`);
  return theme;
}

export function createThemeController(options: ThemeControllerOptions): ThemeController {
  const { root, storage, media } = options;
  const stored = storage.getItem(THEME_STORAGE_KEY);
  let preference: ThemePreference = stored ?? 'system';
  if (preference !== 'system' && !findBuiltinTheme(preference)) {
    preference = 'system';
    storage.removeItem(THEME_STORAGE_KEY);
  }

  let activeTheme = resolveTheme(preference, media.matches);
  let previewBase: ThemeDefinition | undefined;
  applyTheme(activeTheme, root);

  const onSystemThemeChange = (event: MediaQueryListEvent) => {
    if (preference !== 'system' || previewBase) return;
    activeTheme = resolveTheme('system', event.matches);
    applyTheme(activeTheme, root);
  };
  media.addEventListener('change', onSystemThemeChange);

  return {
    getPreference: () => preference,
    getActiveTheme: () => activeTheme,
    previewTheme(id) {
      const theme = resolveTheme(id, media.matches);
      if (!previewBase) previewBase = activeTheme;
      applyTheme(theme, root);
      activeTheme = theme;
    },
    commitTheme(id) {
      const theme = resolveTheme(id, media.matches);
      applyTheme(theme, root);
      storage.setItem(THEME_STORAGE_KEY, id);
      preference = id;
      activeTheme = theme;
      previewBase = undefined;
    },
    cancelPreview() {
      if (!previewBase) return;
      applyTheme(previewBase, root);
      activeTheme = previewBase;
      previewBase = undefined;
    },
    dispose() {
      media.removeEventListener('change', onSystemThemeChange);
    },
  };
}
