const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const yauzl = require('yauzl');
const defaultManifest = require('./runtime-manifest.json');

function verify(buffer, spec) {
  if (buffer.length !== spec.size) throw new Error(`Bun 压缩包大小校验失败：${buffer.length}`);
  const actual = crypto.createHash('sha256').update(buffer).digest('hex');
  if (actual !== spec.sha256) throw new Error(`Bun 压缩包 SHA-256 校验失败：${actual}`);
}

function atomicWrite(target, buffer, fsImpl = fs) {
  const tmp = `${target}.${process.pid}.tmp`;
  try { fsImpl.writeFileSync(tmp, buffer); fsImpl.renameSync(tmp, target); }
  finally { fsImpl.rmSync(tmp, { force: true }); }
}

function download(url, maxBytes, options = {}) {
  const redirects = options.redirects || 0;
  const request = options.request || https.get;
  const timeoutMs = options.timeoutMs || 30000;
  return new Promise((resolve, reject) => {
    const req = request(url, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.resume();
        if (redirects >= 5) return reject(new Error('Bun 下载重定向次数过多'));
        const next = new URL(res.headers.location, url);
        if (next.protocol !== 'https:') return reject(new Error('Bun 下载拒绝非 HTTPS 重定向'));
        return download(next.href, maxBytes, { ...options, redirects: redirects + 1 }).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`Bun 下载失败：HTTP ${res.statusCode}`)); }
      const declared = Number(res.headers['content-length']);
      if (Number.isFinite(declared) && declared > maxBytes) { res.resume(); return reject(new Error('Bun 下载 Content-Length 超过大小上限')); }
      const chunks = []; let length = 0;
      res.on('data', chunk => { length += chunk.length; if (length > maxBytes) res.destroy(new Error('Bun 下载超过大小上限')); else chunks.push(chunk); });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Bun 下载超时')));
    req.on('error', reject);
  });
}

function extractExpectedBun(buffer) {
  return new Promise((resolve, reject) => yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
    if (err) return reject(new Error(`Bun ZIP 无效：${err.message}`));
    let found = null; let count = 0;
    zip.readEntry();
    zip.on('entry', entry => {
      const normalized = entry.fileName.replace(/\\/g, '/');
      if (normalized.includes('../') || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) { zip.close(); return reject(new Error('Bun ZIP 包含不安全路径')); }
      if (normalized === 'bun-windows-x64/bun.exe') {
        if (entry.uncompressedSize > 150 * 1024 * 1024) { zip.close(); return reject(new Error('bun.exe 解压大小超过上限')); }
        count++;
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr) return reject(streamErr);
          const chunks = [];
          let bytes = 0;
          stream.on('data', c => { bytes += c.length; if (bytes > 150 * 1024 * 1024) stream.destroy(new Error('bun.exe 解压大小超过上限')); else chunks.push(c); });
          stream.on('end', () => { found = Buffer.concat(chunks); zip.readEntry(); });
          stream.on('error', reject);
        });
      } else zip.readEntry();
    });
    zip.on('end', () => count === 1 && found ? resolve(found) : reject(new Error('Bun ZIP 必须且只能包含预期层级的 bun.exe')));
    zip.on('error', reject);
  }));
}

async function prepareRuntime(options = {}) {
  const rootDir = options.rootDir || path.join(__dirname, '..');
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  if (platform !== 'win32' || arch !== 'x64') throw new Error(`不支持的运行时平台：${platform}/${arch}`);
  const spec = (options.manifest || defaultManifest).bun;
  const cacheDir = process.env.XUNXINTAI_RUNTIME_CACHE || path.join(rootDir, '.cache', 'runtime');
  const cacheFile = path.join(cacheDir, spec.asset);
  let archive = options.archiveBuffer;
  if (!archive && fs.existsSync(cacheFile)) {
    archive = fs.readFileSync(cacheFile);
    try { verify(archive, spec); } catch (_) { fs.rmSync(cacheFile, { force: true }); archive = null; }
  }
  if (!archive) {
    if (options.offline) throw new Error('离线模式下缺少已校验的 Bun 运行时缓存');
    archive = await (options.download || download)(spec.url, spec.size + 1);
  }
  verify(archive, spec);
  if (!options.archiveBuffer && !fs.existsSync(cacheFile)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    atomicWrite(cacheFile, archive);
  }
  const exe = await (options.extract || extractExpectedBun)(archive);
  const binDir = path.join(rootDir, 'engine', 'bin'); fs.mkdirSync(binDir, { recursive: true });
  const target = path.join(binDir, 'bun.exe'); const tmpExe = `${target}.${process.pid}.tmp`;
  const run = options.run || ((command, args, cwd) => spawnSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  try {
    fs.writeFileSync(tmpExe, exe);
    const version = run(tmpExe, ['--version'], rootDir);
    if (version.status !== 0 || version.stdout.trim() !== spec.version) throw new Error(`Bundled Bun 版本校验失败，期望 ${spec.version}`);
    fs.renameSync(tmpExe, target);
  } finally { fs.rmSync(tmpExe, { force: true }); }
  const install = run(target, ['install', '--frozen-lockfile', '--production'], path.join(rootDir, 'engine'));
  if (install.status !== 0) throw new Error(`engine 生产依赖安装失败（退出码 ${install.status}）`);
  return { version: spec.version, sha256: spec.sha256, cacheFile, target };
}

module.exports = { prepareRuntime, verify, atomicWrite, extractExpectedBun, download };
if (require.main === module) prepareRuntime({ platform: process.argv[process.argv.indexOf('--platform') + 1] || process.platform, arch: process.argv[process.argv.indexOf('--arch') + 1] || process.arch }).then(r => console.log(`Bun ${r.version} 与 engine 生产依赖已准备`), e => { console.error(e.message); process.exitCode = 1; });
