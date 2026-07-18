import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(path, 'utf8');

describe('Windows MVP 中文主路径', () => {
  it('Electron 托盘和通知保留可读中文文案', () => {
    const source = readSource('electron/main.cjs');

    expect(source).toContain("label: visible ? '隐藏窗口' : '显示窗口'");
    expect(source).toContain("label: '退出'");
    expect(source).toContain("content: '已最小化到系统托盘，右键托盘图标可以退出应用。'");
    expect(source).toContain("title: '导出模型对话工作空间'");
    expect(source).not.toContain('瀵煎嚭妯″瀷瀵硅瘽宸ヤ綔绌洪棿');
    expect(source).not.toContain('鎶婂墠娈靛綊闆嗙殑');
    expect(source).not.toContain('鎵ц寮傛 zip');
    expect(source).not.toContain('纭繚');
    expect(source).not.toContain('灏嗘暣');
  });

  it('Sidebar 根据界面语言显示最近使用和更新提示', () => {
    const source = readSource('src/components/Sidebar.tsx');

    expect(source).toContain("{isZh ? '最近使用' : 'Recents'}");
    expect(source).toContain("{isRecentsCollapsed ? (isZh ? '显示' : 'Show') : (isZh ? '隐藏' : 'Hide')}");
    expect(source).toContain("isZh ? `正在下载更新${updateStatus.percent != null ? ` ${updateStatus.percent}%` : ''}`");
    expect(source).toContain("{isZh ? `已更新至 ${updateStatus.version}` : `Updated to ${updateStatus.version}`}");
    expect(source).toContain("{isZh ? '重启后应用更新' : 'Relaunch to apply'}");
    expect(source).toContain("{isZh ? '重启' : 'Relaunch'}");
  });

  it('Artifacts 中文模式显示可读的复制与探索文案', () => {
    const source = readSource('src/components/ArtifactsPage.tsx');

    expect(source).toContain("title={copied ? (isZh ? '已复制' : 'Copied!') : (isZh ? '复制提示词' : 'Copy prompt')}");
    expect(source).toContain("{isZh ? '查看完整聊天' : 'View full chat'}");
    expect(source).toContain("{isZh ? 'Artifacts 指南' : 'Artifacts guide'}");
  });

  it('legacy system prompt 是简短、非空的 UTF-8 兼容提示', () => {
    const prompt = readSource('electron/system-prompt.txt');

    expect(prompt.trim()).not.toBe('');
    expect(prompt).toContain('洵心台');
    expect(prompt).toContain('兼容');
    expect(prompt).not.toContain('You are Claude, created by Anthropic');
    expect(prompt.length).toBeLessThan(1000);
  });

  it('外观页保留主题画廊，并将桌宠明确标为后续提供', () => {
    const source = readSource('src/components/appearance/AppearancePetSettings.tsx');

    expect(source).toContain('<ThemeGallery');
    expect(source).toContain('后续可安装独立开源桌宠组件');
    expect(source).toContain('本页当前不会联网、探测或启动进程');
    expect(source).not.toContain('立即安装桌宠');
    expect(source).not.toContain('启动桌宠');
  });
});
