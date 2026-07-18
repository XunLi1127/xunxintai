import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const pkg = JSON.parse(read('package.json'));

describe('洵心台应用图标', () => {
  it('所有当前应用入口只引用洵心台品牌资产', () => {
    expect(pkg.scripts['brand:icons']).toBe('node scripts/generate-brand-icons.cjs');
    expect(pkg.build.win.icon).toBe('public/xunxintai.ico');
    expect(pkg.build.mac.icon).toBe('public/xunxintai-1024.png');
    expect(pkg.build.linux.icon).toBe('public/xunxintai-512.png');
    expect(pkg.build.extraResources).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'public/xunxintai.ico', to: 'assets/xunxintai.ico' }),
      expect.objectContaining({ from: 'public/xunxintai-256.png', to: 'assets/xunxintai-256.png' }),
    ]));

    const index = read('index.html');
    const main = read('electron/main.cjs');
    expect(index).toContain('href="/xunxintai-256.png"');
    expect(main).toContain("getRuntimeIconPath('xunxintai.ico')");
    expect(main).toContain("getRuntimeIconPath('xunxintai-256.png')");
    expect(`${index}\n${main}\n${JSON.stringify(pkg.build)}`).not.toMatch(/(?:^|[/\\])favicon\.(?:ico|png)/i);
  });

  it('母版是无文字且不含旧品牌标识的确定性 SVG', () => {
    const svg = read('assets/brand/xunxintai-mark.svg');
    expect(svg).toContain('viewBox="0 0 1024 1024"');
    expect(svg).not.toMatch(/<text\b|font-family|claude|anthropic/i);
  });

  it('生成八档 PNG 和包含六档尺寸的 Windows ICO', () => {
    for (const size of [16, 32, 48, 64, 128, 256, 512, 1024]) {
      expect(fs.existsSync(path.join(root, `public/xunxintai-${size}.png`))).toBe(true);
    }

    const ico = fs.readFileSync(path.join(root, 'public/xunxintai.ico'));
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(6);
  });
});
