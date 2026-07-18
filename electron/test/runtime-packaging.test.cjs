const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const archiver = require('archiver');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

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

test('extraResources requires exact destinations and filters that keep required files', () => {
  const dir = tempProject(); const pkgPath = path.join(dir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath));
  pkg.build.extraResources.find(x => x.from === 'engine/bin').to = 'wrong/bin';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg));
  assert.throws(() => check.checkPackageConfig(dir), /目的地/);
  pkg.build.extraResources.find(x => x.from === 'engine/bin').to = 'engine/bin';
  pkg.build.extraResources.find(x => x.from === 'engine/src').filter = ['**/*.js'];
  fs.writeFileSync(pkgPath, JSON.stringify(pkg));
  assert.throws(() => check.checkPackageConfig(dir), /filter/);
});

test('broad engine mappings that would include .env are rejected', () => {
  const dir = tempProject(); const pkgPath = path.join(dir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath));
  pkg.build.extraResources.push({ from: 'engine', to: 'engine' });
  fs.writeFileSync(pkgPath, JSON.stringify(pkg));
  assert.throws(() => check.checkPackageConfig(dir), /\.env/);
});

test('resolved broad and traversal-equivalent mappings cannot bypass .env guard', () => {
  for (const mapping of [{ from: '.', to: '.' }, { from: 'engine/..', to: '.' }, { from: 'engine/src/..', to: 'engine' }]) {
    const dir = tempProject(); const pkgPath = path.join(dir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath)); pkg.build.extraResources.push(mapping); fs.writeFileSync(pkgPath, JSON.stringify(pkg));
    assert.throws(() => check.checkPackageConfig(dir), /\.env|越界|广义/);
  }
});

test('secret scan covers credential and PEM-like values but permits public booleans and blanks', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xun-secrets-')); const file = path.join(dir, 'config.toml');
  fs.writeFileSync(file, 'DISABLE_TELEMETRY=1\nAUTH=\n'); assert.doesNotThrow(() => check.checkConfigFile(file));
  for (const line of ['ACCESS_KEY=abc', 'CREDENTIAL=abc', 'AUTH=Bearer-abc', 'DATABASE_URL=postgres://u:p@h/db', 'CERT="-----BEGIN PRIVATE KEY-----"']) {
    fs.writeFileSync(file, line); assert.throws(() => check.checkConfigFile(file), /秘密/);
  }
});

test('hyphenated secret keys are rejected before package-name noise suppression', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xun-hyphen-secret-')); const file = path.join(dir, 'config.yaml');
  for (const line of ['api-key: abc', 'access-key: abc', 'private-key: abc']) {
    fs.writeFileSync(file, line); assert.throws(() => check.checkConfigFile(file), /秘密/);
  }
  fs.writeFileSync(file, 'dependencies:\n  google-auth-library: 10.6.2\n');
  assert.doesNotThrow(() => check.checkConfigFile(file));
});

test('runtime check scans every packaged engine config candidate', () => {
  const dir = tempProject(); fs.mkdirSync(path.join(dir, 'engine', 'stubs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'engine', 'stubs', 'runtime-config.json'), 'DATABASE_URL=postgres://secret');
  assert.throws(() => check.checkRuntime({ rootDir: dir, run: () => ({ status: 0, stdout: '1.3.14\n' }) }), /秘密/);
});

test('bad cache is deleted, verified download is atomically cached, and failed download leaves no temp', async () => {
  const dir = tempProject(); const cacheDir = path.join(dir, 'cache'); process.env.XUNXINTAI_RUNTIME_CACHE = cacheDir;
  fs.mkdirSync(cacheDir); fs.writeFileSync(path.join(cacheDir, manifest.bun.asset), 'bad');
  const archive = Buffer.from('verified'); const localManifest = { bun: { ...manifest.bun, size: archive.length, sha256: require('node:crypto').createHash('sha256').update(archive).digest('hex') } };
  let calls = 0;
  await prep.prepareRuntime({ rootDir: dir, platform: 'win32', arch: 'x64', manifest: localManifest, download: async () => { calls++; return archive; }, extract: async () => Buffer.from('newbun'), run: (_c, args) => args[0] === '--version' ? { status: 0, stdout: '1.3.14\n' } : { status: 0, stdout: '' } });
  assert.equal(calls, 1); assert.deepEqual(fs.readFileSync(path.join(cacheDir, manifest.bun.asset)), archive);
  fs.rmSync(path.join(cacheDir, manifest.bun.asset));
  await assert.rejects(() => prep.prepareRuntime({ rootDir: dir, platform: 'win32', arch: 'x64', manifest: localManifest, download: async () => { throw new Error('network'); } }), /network/);
  assert.deepEqual(fs.readdirSync(cacheDir), []); delete process.env.XUNXINTAI_RUNTIME_CACHE;
});

test('atomic cache write removes temp file when replacement fails', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xun-atomic-')); const target = path.join(dir, 'cache.zip');
  const fakeFs = { ...fs, renameSync() { throw new Error('rename failed'); } };
  assert.throws(() => prep.atomicWrite(target, Buffer.from('data'), fakeFs), /rename failed/);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('download enforces HTTPS redirects, content length, stream limit, and timeout', async () => {
  function requester(sequence) { return (_url, cb) => { const req = new EventEmitter(); req.destroy = e => req.emit('error', e); req.setTimeout = (_ms, fn) => { req.timeout = fn; }; queueMicrotask(() => { const item = sequence.shift(); if (item.timeout) return req.timeout(); const res = new PassThrough(); Object.assign(res, { statusCode: item.statusCode || 200, headers: item.headers || {} }); res.resume = PassThrough.prototype.resume.bind(res); cb(res); if (item.body) res.end(item.body); }); return req; }; }
  await assert.rejects(() => prep.download('https://a.test/x', 3, { request: requester([{ statusCode: 302, headers: { location: 'http://bad.test/x' } }]) }), /HTTPS/);
  await assert.rejects(() => prep.download('https://a.test/x', 3, { request: requester([{ headers: { 'content-length': '4' }, body: 'xxxx' }]) }), /Content-Length/);
  await assert.rejects(() => prep.download('https://a.test/x', 3, { request: requester([{ body: 'xxxx' }]) }), /大小上限/);
  await assert.rejects(() => prep.download('https://a.test/x', 3, { request: requester([{ timeout: true }]), timeoutMs: 1 }), /超时/);
});

test('bad Bun version never replaces an existing verified target and temp is cleaned', async () => {
  const dir = tempProject(); const old = path.join(dir, 'engine', 'bin', 'bun.exe'); fs.writeFileSync(old, 'verified-old');
  const archive = Buffer.from('a'); const localManifest = { bun: { ...manifest.bun, size: 1, sha256: require('node:crypto').createHash('sha256').update(archive).digest('hex') } };
  await assert.rejects(() => prep.prepareRuntime({ rootDir: dir, platform: 'win32', arch: 'x64', archiveBuffer: archive, manifest: localManifest, extract: async () => Buffer.from('bad-new'), run: () => ({ status: 0, stdout: '9.9.9\n' }) }), /版本/);
  assert.equal(fs.readFileSync(old, 'utf8'), 'verified-old');
  assert.deepEqual(fs.readdirSync(path.dirname(old)).filter(x => x.includes('.tmp')), []);
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
