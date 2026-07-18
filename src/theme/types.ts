export type ThemeMode = 'light' | 'dark' | 'high-contrast';

export type SemanticColorTokens = {
  canvas: string;
  panel: string;
  overlay: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  border: string;
  focus: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  codeBackground: string;
  codeText: string;
  selection: string;
  link: string;
};

export type ThemeDefinition = {
  id: string;
  displayName: string;
  mode: ThemeMode;
  source: {
    name: string;
    url: string;
    license: string;
    revision: string;
  };
  tokens: SemanticColorTokens;
};

export type ThemePreference = 'system' | string;

export type ThemeControllerOptions = {
  root: HTMLElement;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  media: Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener'>;
};

export type ThemeController = {
  getPreference(): ThemePreference;
  getActiveTheme(): ThemeDefinition;
  previewTheme(id: string): void;
  commitTheme(id: ThemePreference): void;
  cancelPreview(): void;
  dispose(): void;
};
