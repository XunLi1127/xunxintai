const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const picomatch = require('picomatch');
const manifest = require('./runtime-manifest.json');

const REQUIRED_RESOURCES = ['engine/src', 'engine/bin', 'engine/preload.ts', 'engine/bunfig.toml', 'engine/package.json', 'engine/tsconfig.json', 'engine/stubs', 'engine/node_modules', 'engine/vision-helper.ts', 'engine/bun.lock', 'engine/.env.defaults'];
function checkPackageConfig(rootDir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const mappings = (pkg.build && pkg.build.extraResources || []).map(x => {
    const raw = typeof x === 'string' ? { from: x, to: x } : x;
    if (!raw || typeof raw.from !== 'string' || typeof raw.to !== 'string') throw new Error('extraResources 映射必须包含 from 和 to');
    const source = path.resolve(rootDir, raw.from); const destination = path.resolve(rootDir, raw.to);
    const sourceRel = path.relative(rootDir, source); const destinationRel = path.relative(rootDir, destination);
    if (sourceRel.startsWith('..' + path.sep) || path.isAbsolute(sourceRel) || destinationRel.startsWith('..' + path.sep) || path.isAbsolute(destinationRel)) throw new Error('extraResources 路径越界');
    return { ...raw, source, sourceRel: sourceRel.replace(/\\/g, '/'), destinationRel: destinationRel.replace(/\\/g, '/') };
  });
  const requiredFiles = { 'engine/src': 'entrypoints/cli.tsx', 'engine/bin': 'bun.exe', 'engine/node_modules': 'zod/package.json' };
  for (const required of REQUIRED_RESOURCES) {
    const requiredSource = path.resolve(rootDir, required);
    const mapping = mappings.find(x => x.source === requiredSource);
    if (!mapping) throw new Error(`extraResources 缺少 ${required}`);
    if (mapping.destinationRel !== required) throw new Error(`extraResources ${required} 目的地必须精确为 ${required}`);
    if (mapping.filter && requiredFiles[required]) {
      const rel = requiredFiles[required]; const positive = mapping.filter.filter(x => !x.startsWith('!'));
      const included = (positive.length === 0 || positive.some(x => picomatch.isMatch(rel, x, { dot: true }))) && !mapping.filter.filter(x => x.startsWith('!')).some(x => picomatch.isMatch(rel, x.slice(1), { dot: true }));
      if (!included) throw new Error(`extraResources ${required} filter 排除了必需文件 ${rel}`);
    }
  }
  function mappingIncludes(mapping, candidatePath) {
    const candidate = path.resolve(rootDir, candidatePath);
    const relative = path.relative(mapping.source, candidate);
    if (relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return false;
    const rel = (relative || path.basename(candidate)).replace(/\\/g, '/');
    const filters = mapping.filter || []; const positive = filters.filter(x => !x.startsWith('!'));
    return (positive.length === 0 || positive.some(x => picomatch.isMatch(rel, x, { dot: true }))) && !filters.filter(x => x.startsWith('!')).some(x => picomatch.isMatch(rel, x.slice(1), { dot: true }));
  }
  if (mappings.some(x => mappingIncludes(x, 'engine/.env'))) throw new Error('extraResources 禁止包含 engine/.env');
  return mappings;
}
function checkConfigFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  const secretKey = /(?:^|[_-])(?:API[_-]?KEY|ACCESS[_-]?KEY(?:[_-]ID)?|TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY|CREDENTIALS?|AUTH|DATABASE[_-]?URL)(?:$|[_-])/i;
  const publicValuePattern = /^(?:true|false|0|1|null|undefined)$/i;
  let structuredJson = false;
  if (path.extname(file).toLowerCase() === '.json') {
    try {
      const parsed = JSON.parse(content); structuredJson = true; const dependencySections = new Set(['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']);
      const visit = (value, parentKey = '') => {
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
          if (dependencySections.has(parentKey)) continue;
          if (typeof child === 'string' && child && !publicValuePattern.test(child) && secretKey.test(key)) throw new Error(`${path.basename(file)} 含有秘密配置`);
          visit(child, key);
        }
      };
      visit(parsed);
    } catch (error) { if (/含有秘密配置/.test(error.message)) throw error; }
  }
  let dependencyIndent = null;
  for (const raw of structuredJson ? [] : content.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    const indent = raw.length - raw.trimStart().length;
    if (/^(?:dependencies|devDependencies|optionalDependencies|peerDependencies)\s*:\s*$/i.test(line)) { dependencyIndent = indent; continue; }
    if (dependencyIndent !== null && indent > dependencyIndent) continue;
    dependencyIndent = null;
    const match = line.match(/^([^=:#]+)\s*[=:]\s*(.*)$/); if (!match) continue;
    const key = match[1].trim().replace(/^['"]|['"]$/g, '');
    const value = match[2].trim().replace(/[,'"]+$/g, '').replace(/^['"]/, '');
    if (value && !publicValuePattern.test(value) && secretKey.test(key)) throw new Error(`${path.basename(file)} 含有秘密配置`);
  }
  if (/-----BEGIN [A-Z ]*(?:PRIVATE KEY|CERTIFICATE)-----/i.test(content)) throw new Error(`${path.basename(file)} 含有 PEM 秘密材料`);
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
  const mappings = checkPackageConfig(rootDir);
  const candidates = [];
  const isConfigCandidate = name => name.startsWith('.env') || /\.(?:json|toml|ya?ml|ini|conf)$/i.test(name);
  function collect(current) {
    const stat = fs.statSync(current);
    if (stat.isFile()) { if (isConfigCandidate(path.basename(current))) candidates.push(current); return; }
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      collect(path.join(current, entry.name));
    }
  }
  for (const mapping of mappings) {
    if (mapping.from === 'engine/bin' || mapping.from === 'engine/node_modules') continue;
    const source = mapping.source; if (fs.existsSync(source)) collect(source);
  }
  for (const rel of ['.env.defaults', 'bunfig.toml', 'package.json', 'tsconfig.json']) { const file = path.join(engine, rel); if (fs.existsSync(file) && !candidates.includes(file)) candidates.push(file); }
  for (const file of candidates) checkConfigFile(file);
  return { version: manifest.bun.version };
}
module.exports = { REQUIRED_RESOURCES, checkPackageConfig, checkConfigFile, checkRuntime };
if (require.main === module) { try { const r = checkRuntime(); console.log(`运行时检查通过：Bun ${r.version}`); } catch (e) { console.error(e.message); process.exitCode = 1; } }
