import type { ThemeDefinition } from './types';

const CATPPUCCIN_SOURCE = {
  name: 'Catppuccin Palette',
  url: 'https://github.com/catppuccin/palette',
  license: 'MIT',
  revision: '07d02aa110ef9eb7e7427afca5c73ba9cf7f8ebd',
} as const;

const TINTED_SOURCE = {
  name: 'Tinted Theming Schemes',
  url: 'https://github.com/tinted-theming/schemes',
  license: 'MIT',
  revision: '010185535336bf94d815b900cd63bb0fc204e216',
} as const;

export const BUILTIN_THEMES: readonly ThemeDefinition[] = [
  {
    id: 'catppuccin-latte', displayName: 'Catppuccin Latte', mode: 'light', source: CATPPUCCIN_SOURCE,
    tokens: {
      canvas: '#eff1f5', panel: '#e6e9ef', overlay: '#ccd0da', textPrimary: '#4c4f69',
      textSecondary: '#5c5f77', textMuted: '#6c6f85', textInverse: '#eff1f5', border: '#bcc0cc',
      focus: '#8839ef', accent: '#8839ef', success: '#40a02b', warning: '#df8e1d', error: '#d20f39',
      info: '#1e66f5', codeBackground: '#dce0e8', codeText: '#4c4f69', selection: '#7287fd66', link: '#1e66f5',
    },
  },
  {
    id: 'catppuccin-mocha', displayName: 'Catppuccin Mocha', mode: 'dark', source: CATPPUCCIN_SOURCE,
    tokens: {
      canvas: '#1e1e2e', panel: '#181825', overlay: '#313244', textPrimary: '#cdd6f4',
      textSecondary: '#bac2de', textMuted: '#a6adc8', textInverse: '#1e1e2e', border: '#45475a',
      focus: '#cba6f7', accent: '#cba6f7', success: '#a6e3a1', warning: '#f9e2af', error: '#f38ba8',
      info: '#89b4fa', codeBackground: '#11111b', codeText: '#cdd6f4', selection: '#b4befe66', link: '#89b4fa',
    },
  },
  {
    id: 'tinted-default-light', displayName: 'Tinted Default Light', mode: 'light', source: TINTED_SOURCE,
    tokens: {
      canvas: '#f8f8f8', panel: '#e8e8e8', overlay: '#e8e8e8', textPrimary: '#383838',
      textSecondary: '#585858', textMuted: '#585858', textInverse: '#f8f8f8', border: '#d8d8d8',
      focus: '#7cafc2', accent: '#7cafc2', success: '#a1b56c', warning: '#dc9656', error: '#ab4642',
      info: '#7cafc2', codeBackground: '#e8e8e8', codeText: '#383838', selection: '#7cafc266', link: '#7cafc2',
    },
  },
  {
    id: 'tinted-default-dark', displayName: 'Tinted Default Dark', mode: 'dark', source: TINTED_SOURCE,
    tokens: {
      canvas: '#181818', panel: '#282828', overlay: '#383838', textPrimary: '#d8d8d8',
      textSecondary: '#b8b8b8', textMuted: '#b8b8b8', textInverse: '#181818', border: '#585858',
      focus: '#7cafc2', accent: '#7cafc2', success: '#a1b56c', warning: '#f7ca88', error: '#ab4642',
      info: '#7cafc2', codeBackground: '#282828', codeText: '#d8d8d8', selection: '#7cafc266', link: '#7cafc2',
    },
  },
  {
    id: 'xun-high-contrast', displayName: '洵心台高对比', mode: 'high-contrast',
    source: { name: '洵心台', url: 'local://xunxintai', license: 'Project', revision: '1' },
    tokens: {
      canvas: '#000000', panel: '#101010', overlay: '#1c1c1c', textPrimary: '#ffffff',
      textSecondary: '#f2f2f2', textMuted: '#d0d0d0', textInverse: '#000000', border: '#ffffff',
      focus: '#00ffff', accent: '#00ffff', success: '#00ff66', warning: '#ffdf00', error: '#ff6688',
      info: '#66ccff', codeBackground: '#000000', codeText: '#ffffff', selection: '#00ffff66', link: '#66ccff',
    },
  },
];

export function findBuiltinTheme(id: string): ThemeDefinition | undefined {
  return BUILTIN_THEMES.find(theme => theme.id === id);
}
