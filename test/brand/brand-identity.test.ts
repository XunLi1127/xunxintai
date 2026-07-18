import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('Xunxintai brand identity', () => {
  it('uses the canonical package and Windows installer identity', () => {
    const pkg = JSON.parse(read('package.json'));
    const lock = JSON.parse(read('package-lock.json'));

    expect(pkg.name).toBe('xunxintai');
    expect(pkg.description).toContain('洵心台');
    expect(pkg.repository.url).toBe('https://github.com/XunLi1127/xunxintai.git');
    expect(pkg.build.appId).toBe('com.xunxintai.desktop');
    expect(pkg.build.productName).toBe('洵心台');
    expect(pkg.build.publish).toMatchObject({ owner: 'XunLi1127', repo: 'xunxintai' });
    expect(pkg.build.win.artifactName).toBe('Xunxintai-Setup-${version}-${arch}.${ext}');
    expect(lock.name).toBe('xunxintai');
    expect(lock.packages[''].name).toBe('xunxintai');
  });

  it('uses the canonical browser and metadata identity', () => {
    expect(read('index.html')).toContain('<title>洵心台</title>');
    expect(JSON.parse(read('metadata.json')).name).toBe('洵心台');
  });

  it('shows the canonical product name in the Settings about card', () => {
    const settings = read('src/components/SettingsPage.tsx');
    expect(settings).toContain('>洵心台</div>');
    expect(settings).not.toContain('>claude-desktop-cn</div>');
  });

  it('uses the canonical Electron and MCP client identity', () => {
    const main = read('electron/main.cjs');
    expect(main).toContain("tray.setToolTip('洵心台')");
    expect(main).toContain("title: '洵心台'");
    expect(main).toContain("app.setAppUserModelId('com.xunxintai.desktop')");
    expect(read('electron/bridge-server.cjs')).toContain("clientInfo: { name: '洵心台', version: 'local' }");
  });

  it('presents Xunxintai as the current product and credits its upstream', () => {
    const readmeTop = read('README.md').split(/^## /m, 1)[0];
    expect(readmeTop).toContain('# 洵心台');
    expect(readmeTop).not.toContain('# Claude Desktop CN');
    expect(readmeTop).toMatch(/派生.*Claude Desktop CN|Claude Desktop CN.*派生/);
  });
});
