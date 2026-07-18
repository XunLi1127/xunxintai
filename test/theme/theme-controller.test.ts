import { describe, expect, it } from 'vitest';

import { createThemeController, resolveTheme, THEME_STORAGE_KEY } from '../../src/theme/themeStorage';

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

class MemoryMedia implements Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener'> {
  matches = false;
  listener: ((event: MediaQueryListEvent) => void) | undefined;
  addEventListener(_type: 'change', listener: (event: MediaQueryListEvent) => void): void { this.listener = listener; }
  removeEventListener(_type: 'change', listener: (event: MediaQueryListEvent) => void): void {
    if (this.listener === listener) this.listener = undefined;
  }
  emit(matches: boolean): void {
    this.matches = matches;
    this.listener?.({ matches } as MediaQueryListEvent);
  }
}

function setup(stored?: string) {
  const root = document.createElement('html');
  const storage = new MemoryStorage();
  const media = new MemoryMedia();
  if (stored !== undefined) storage.setItem(THEME_STORAGE_KEY, stored);
  const controller = createThemeController({ root, storage, media });
  return { controller, root, storage, media };
}

describe('theme preference resolution', () => {
  it('resolves system to the Catppuccin light or dark default', () => {
    expect(resolveTheme('system', false).id).toBe('catppuccin-latte');
    expect(resolveTheme('system', true).id).toBe('catppuccin-mocha');
  });

  it('rejects unknown concrete preferences', () => {
    expect(() => resolveTheme('missing-theme', false)).toThrow('Unknown theme preference: missing-theme');
  });
});

describe('theme controller', () => {
  it('defaults to system and applies the current system theme', () => {
    const { controller, root, storage } = setup();
    expect(controller.getPreference()).toBe('system');
    expect(controller.getActiveTheme().id).toBe('catppuccin-latte');
    expect(root.dataset.themeId).toBe('catppuccin-latte');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('previews without persistence, then cancels to the exact previous theme', () => {
    const { controller, root, storage } = setup('tinted-default-light');
    const before = root.outerHTML;

    controller.previewTheme('catppuccin-mocha');
    expect(root.dataset.themeId).toBe('catppuccin-mocha');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('tinted-default-light');

    controller.cancelPreview();
    expect(root.outerHTML).toBe(before);
    expect(controller.getActiveTheme().id).toBe('tinted-default-light');
  });

  it('commits a theme and persists the preference', () => {
    const { controller, root, storage } = setup();
    controller.commitTheme('tinted-default-dark');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('tinted-default-dark');
    expect(root.dataset.themeId).toBe('tinted-default-dark');
    expect(controller.getPreference()).toBe('tinted-default-dark');
  });

  it('leaves DOM and storage unchanged when previewing an unknown theme', () => {
    const { controller, root, storage } = setup('catppuccin-latte');
    const before = root.outerHTML;
    expect(() => controller.previewTheme('unknown')).toThrow('Unknown theme preference: unknown');
    expect(root.outerHTML).toBe(before);
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('catppuccin-latte');
  });

  it('only follows media changes while preference is system', () => {
    const { controller, root, media } = setup();
    media.emit(true);
    expect(root.dataset.themeId).toBe('catppuccin-mocha');

    controller.commitTheme('tinted-default-light');
    media.emit(false);
    media.emit(true);
    expect(root.dataset.themeId).toBe('tinted-default-light');
  });

  it('cancels a system preview to the latest system theme after media changes', () => {
    const { controller, root, media } = setup();
    controller.previewTheme('tinted-default-light');

    media.emit(true);
    controller.cancelPreview();

    expect(controller.getPreference()).toBe('system');
    expect(controller.getActiveTheme().id).toBe('catppuccin-mocha');
    expect(root.dataset.themeId).toBe('catppuccin-mocha');
  });

  it('removes its media listener on dispose', () => {
    const { controller, media } = setup();
    expect(media.listener).toBeTypeOf('function');
    controller.dispose();
    expect(media.listener).toBeUndefined();
  });

  it('repairs an unknown stored id by falling back to system', () => {
    const { controller, storage } = setup('retired-theme');
    expect(controller.getPreference()).toBe('system');
    expect(controller.getActiveTheme().id).toBe('catppuccin-latte');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
});
