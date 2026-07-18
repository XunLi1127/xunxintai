import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/components/ClaudeLogo', () => ({ default: () => <div data-testid="claude-logo" /> }));

import Onboarding from '../../src/components/Onboarding';
import { initializeThemeController } from '../../src/theme/runtime';
import { THEME_STORAGE_KEY } from '../../src/theme/themeStorage';

class TestMedia implements Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener'> {
  matches = false;
  addEventListener(): void {}
  removeEventListener(): void {}
}

describe('Onboarding theme selection', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('class');
    document.documentElement.removeAttribute('style');
    document.documentElement.removeAttribute('data-theme-id');
    document.documentElement.removeAttribute('data-theme-mode');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({}) }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each([
    { label: '跟随系统', preference: 'system', activeId: 'catppuccin-latte' },
    { label: '浅色', preference: 'catppuccin-latte', activeId: 'catppuccin-latte' },
    { label: '深色', preference: 'catppuccin-mocha', activeId: 'catppuccin-mocha' },
  ])('commits $label through the shared theme controller', ({ label, preference, activeId }) => {
    const controller = initializeThemeController({
      root: document.documentElement,
      storage: localStorage,
      media: new TestMedia(),
    });

    render(<Onboarding onComplete={() => {}} />);
    fireEvent.click(screen.getByText(label).closest('button')!);

    expect(controller.getPreference()).toBe(preference);
    expect(controller.getActiveTheme().id).toBe(activeId);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(preference);
    expect(localStorage.getItem('theme')).toBeNull();
    expect(document.documentElement.dataset.themeId).toBe(activeId);
  });
});
