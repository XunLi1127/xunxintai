import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppearancePetSettings from '../../src/components/appearance/AppearancePetSettings';
import ThemeGallery from '../../src/components/appearance/ThemeGallery';
import { BUILTIN_THEMES } from '../../src/theme/builtinThemes';
import { initializeThemeController } from '../../src/theme/runtime';

const media = {
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

beforeEach(() => {
  localStorage.clear();
  initializeThemeController({ root: document.documentElement, storage: localStorage, media });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ThemeGallery', () => {
  it('点击主题卡片只预览，应用仅提交所选主题，取消只撤销预览', () => {
    const onPreview = vi.fn();
    const onApply = vi.fn();
    const onCancel = vi.fn();
    render(
      <ThemeGallery
        themes={[...BUILTIN_THEMES]}
        activeThemeId="catppuccin-latte"
        previewThemeId={null}
        onPreview={onPreview}
        onApply={onApply}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Catppuccin Mocha/ }));
    expect(onPreview).toHaveBeenCalledWith('catppuccin-mocha');
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith('catppuccin-latte');
    expect(onPreview).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('显示中文模式、真实来源与许可证，以及文本状态标识', () => {
    render(
      <ThemeGallery
        themes={[...BUILTIN_THEMES]}
        activeThemeId="catppuccin-latte"
        previewThemeId="catppuccin-mocha"
        onPreview={() => {}}
        onApply={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getAllByText('浅色').length).toBeGreaterThan(0);
    expect(screen.getAllByText('深色').length).toBeGreaterThan(0);
    expect(screen.getAllByText('高对比').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Catppuccin Palette').length).toBeGreaterThan(0);
    expect(screen.getAllByText('MIT').length).toBeGreaterThan(0);
    expect(screen.getByText('已应用')).toBeTruthy();
    expect(screen.getByText('正在预览')).toBeTruthy();
  });
});

describe('AppearancePetSettings', () => {
  it('卸载时撤销未提交预览，提交后卸载不撤销已提交主题', () => {
    const controller = initializeThemeController({ root: document.documentElement, storage: localStorage, media });
    const cancel = vi.spyOn(controller, 'cancelPreview');
    const first = render(<AppearancePetSettings />);

    fireEvent.click(screen.getByRole('button', { name: /Catppuccin Mocha/ }));
    first.unmount();
    expect(cancel).toHaveBeenCalledTimes(1);

    const second = render(<AppearancePetSettings />);
    fireEvent.click(screen.getByRole('button', { name: /Catppuccin Mocha/ }));
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    expect(localStorage.getItem('xun_theme_id')).toBe('catppuccin-mocha');
    cancel.mockClear();
    second.unmount();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('桌宠区域只显示未安装占位，不执行探测', () => {
    render(<AppearancePetSettings />);
    expect(screen.getByText('未安装')).toBeTruthy();
    expect(screen.getByText(/后续可安装独立开源桌宠组件/)).toBeTruthy();
  });
});
