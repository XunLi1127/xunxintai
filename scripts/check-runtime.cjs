const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const manifest = require('./runtime-manifest.json');

const REQUIRED_RESOURCES = ['engine/src', 'engine/bin', 'engine/preload.ts', 'engine/bunfig.toml', 'engine/package.json', 'engine/tsconfig.json', 'engine/stubs', 'engine/node_modules', 'engine/vision-helper.ts', 'engine/bun.lock', 'engine/.env.defaults'];
function checkPackageConfig(rootDir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const sources = (pkg.build && pkg.build.extraResources || []).map(x => typeof x === 'string' ? x : x.from);
  for (const required of REQUIRED_RESOURCES) if (!sources.includes(required)) throw new Error(`extraResources 缺少 ${required}`);
  if (sources.some(x => x === 'engine/.env' || x.startsWith('engine/.env/'))) throw new Error('extraResources 禁止包含 engine/.env');
}
function checkDefaults(file) {
  const content = fs.readFileSync(file, 'utf8');
  const forbidden = /(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY)\s*=\s*\S+/i;
  if (forbidden.test(content)) throw new Error('.env.defaults 含有秘密键值');
}
function checkRuntime(options = {}) {
  const rootDir = options.rootDir || path.join(__dirname, '..');
  if ((options.platform || process.platform) !== 'win32' || (options.arch || process.arch) !== 'x64') throw new Error('仅支持 win32/x64 运行时检查');
  const engine = path.join(rootDir, 'engine'); const bun = path.join(engine, 'bin', 'bun.exe');
  const files = ['src/entrypoints/cli.tsx', 'preload.ts', 'package.json', 'bun.lock', 'node_modules', 'node_modules/zod', '.env.defaults'];
  if (!fs.existsSync(bun)) throw new Error('缺少 engine/bin/bun.exe');
  for (const file of files) if (!fs.existsSync(path.join(engine, file))) throw new Error(`缺少 engine/${file}`);
  const run = options.run || ((cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  const result = run(bun, ['--version']);
  if (result.status !== 0 || result.stdout.trim() !== manifest.bun.version) throw new Error(`Bundled Bun 版本不匹配，期望 ${manifest.bun.version}`);
  checkDefaults(path.join(engine, '.env.defaults'));
  checkPackageConfig(rootDir);
  return { version: manifest.bun.version };
}
module.exports = { REQUIRED_RESOURCES, checkPackageConfig, checkDefaults, checkRuntime };
if (require.main === module) { try { const r = checkRuntime(); console.log(`运行时检查通过：Bun ${r.version}`); } catch (e) { console.error(e.message); process.exitCode = 1; } }
