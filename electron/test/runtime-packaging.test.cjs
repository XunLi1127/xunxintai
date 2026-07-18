const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const archiver = require('archiver');

const root = path.join(__dirname, '..', '..');
const manifest = require('../../scripts/runtime-manifest.json');
const prep = require('../../scripts/prepare-runtime.cjs');
const check = require('../../scripts/check-runtime.cjs');
const bridgeRuntime = require('../bridge-runtime.cjs');

function tempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xun-runtime-'));
  fs.mkdirSync(path.join(dir, 'engine', 'bin'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'engine', 'src', 'entrypoints'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'engine', 'node_modules', 'zod'), { recursive: true });
  for (const file of ['preload.ts', 'package.json', 'bun.lock', '.env.defaults']) fs.writeFileSync(path.join(dir, 'engine', file), 'DISABLE_TELEMETRY=1\n');
  fs.writeFileSync(path.join(dir, 'engine', 'src', 'entrypoints', 'cli.tsx'), '');
  fs.writeFileSync(path.join(dir, 'engine', 'bin', 'bun.exe'), 'bun');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ build: { extraResources: check.REQUIRED_RESOURCES.map(from => ({ from, to: from.replace(/^engine\//, 'engine/') })) } }));
  return dir;
}

test('runtime manifest exactly pins official Bun 1.3.14 asset', () => {
  assert.deepEqual(manifest.bun, {
    version: '1.3.14', tag: 'bun-v1.3.14', asset: 'bun-windows-x64.zip',
    url: 'https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/bun-windows-x64.zip',
    size: 38366737,
    sha256: '0a0620930b6675d7ba440e81f4e0e00d3cfbe096c4b140d3fff02205e9e18922'
  });
});

test('invalid cached or downloaded archive is rejected before engine/bin write', async () => {
  const dir = tempProject();
  const bad = Buffer.from('bad zip');
  await assert.rejects(() => prep.prepareRuntime({ rootDir: dir, platform: 'win32', arch: 'x64', archiveBuffer: bad, manifest: { bun: { ...manifest.bun, size: bad.length } }, run: () => ({ status: 0, stdout: '1.3.14\n' }) }), /SHA-256/);
  assert.equal(fs.readFileSync(path.join(dir, 'engine', 'bin', 'bun.exe'), 'utf8'), 'bun');
});

test('safe zip extraction accepts only the exact Bun asset path', async () => {
  async function zip(entries) {
    const output = new (require('node:stream').PassThrough)();
    const chunks = []; output.on('data', c => chunks.push(c));
    const done = new Promise((resolve, reject) => { output.on('end', () => resolve(Buffer.concat(chunks))); output.on('error', reject); });
    const archive = archiver('zip'); archive.on('error', e => output.destroy(e)); archive.pipe(output);
    for (const [name, value] of entries) archive.append(value, { name });
    await archive.finalize(); return done;
  }
  const good = await zip([['bun-windows-x64/bun.exe', Buffer.from('exe')], ['bun-windows-x64/README.md', 'ignored']]);
  assert.equal((await prep.extractExpectedBun(good)).toString(), 'exe');
  const disguised = await zip([['extra/bun-windows-x64/bun.exe', Buffer.from('exe')]]);
  await assert.rejects(() => prep.extractExpectedBun(disguised), /预期层级/);
});

test('check rejects missing bun, wrong version, and missing critical dependency', () => {
  const dir = tempProject();
  fs.rmSync(path.join(dir, 'engine', 'bin', 'bun.exe'));
  assert.throws(() => check.checkRuntime({ rootDir: dir, run: () => ({ status: 0, stdout: '1.3.14\n' }) }), /bun\.exe/);
  fs.writeFileSync(path.join(dir, 'engine', 'bin', 'bun.exe'), 'bun');
  assert.throws(() => check.checkRuntime({ rootDir: dir, run: () => ({ status: 0, stdout: '9.9.9\n' }) }), /版本/);
  fs.rmSync(path.join(dir, 'engine', 'node_modules', 'zod'), { recursive: true });
  assert.throws(() => check.checkRuntime({ rootDir: dir, run: () => ({ status: 0, stdout: '1.3.14\n' }) }), /zod/);
});

test('check rejects incomplete extraResources and packaged .env', () => {
  const dir = tempProject();
  const pkgPath = path.join(dir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath));
  pkg.build.extraResources = pkg.build.extraResources.filter(x => x.from !== 'engine/node_modules');
  pkg.build.extraResources.push({ from: 'engine/.env', to: 'engine/.env' });
  fs.writeFileSync(pkgPath, JSON.stringify(pkg));
  assert.throws(() => check.checkPackageConfig(dir), /node_modules|\.env/);
});

test('beforePack rejects missing runtime without repairing it', async () => {
  const dir = tempProject();
  fs.rmSync(path.join(dir, 'engine', 'bin', 'bun.exe'));
  await assert.rejects(() => require('../../scripts/before-pack.cjs')({ projectDir: dir }), /bun\.exe/);
});

test('packaged mode never falls back to user or PATH Bun', () => {
  const exists = p => p.includes('.bun');
  assert.equal(bridgeRuntime.resolveBun({ isPackaged: true, engineDir: 'E', platform: 'win32', homedir: 'H', exists }), null);
  assert.match(bridgeRuntime.resolveBun({ isPackaged: false, engineDir: 'E', platform: 'win32', homedir: 'H', exists }), /\.bun/);
  assert.equal(bridgeRuntime.resolveBun({ isPackaged: false, engineDir: 'E', platform: 'win32', homedir: 'H', exists: () => false }), 'bun');
});

test('missing Git Bash returns stable redacted Chinese diagnostic', () => {
  const result = bridgeRuntime.resolveGitBash({ platform: 'win32', env: { PATH: 'SECRET', TOKEN: 'secret' }, homedir: 'C:/Users/Private', exists: () => false });
  assert.deepEqual(result, { ok: false, code: 'ENGINE_GIT_BASH_MISSING', message: '未找到 Git Bash。请安装 Git for Windows 后重试。' });
  assert.doesNotMatch(JSON.stringify(result), /SECRET|TOKEN|Private/);
});

test('gitignore excludes all generated runtime artifacts', () => {
  const ignored = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  for (const pattern of ['engine/bin/', 'engine/node_modules/', '.cache/runtime/']) assert.match(ignored, new RegExp(pattern.replace(/[./]/g, '\\$&')));
});
