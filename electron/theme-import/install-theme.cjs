const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { safeRelativePath } = require('./archive.cjs');
const { validateThemeFiles } = require('./validate-theme.cjs');

function slug(value) { return String(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'theme'; }
function validId(id) { return typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id); }

async function installTheme({ inspection, files, themesRoot, themeIdFactory }) {
  const themeId = themeIdFactory ? themeIdFactory() : `${slug(inspection.displayName)}-${crypto.randomBytes(4).toString('hex')}`;
  if (!validId(themeId)) throw new Error('Invalid theme id');
  const stagingRoot = path.join(themesRoot, '.staging');
  const staging = path.join(stagingRoot, crypto.randomUUID());
  const destination = path.join(themesRoot, themeId);
  await fs.mkdir(staging, { recursive: true });
  try {
    try { await fs.access(destination); throw new Error('Theme already exists'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const file of files.filter(item => item.path.toLowerCase() !== 'manifest.json')) {
      const relative = safeRelativePath(file.path);
      const target = path.join(staging, ...relative.split('/'));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, file.buffer, { flag: 'wx', mode: 0o600 });
    }
    const manifest = { id: themeId, ownership: 'xunxintai-theme-import-v1', name: inspection.displayName, format: 'xunxintai-theme', sourceFormat: inspection.format, files: inspection.files, installedAt: new Date().toISOString() };
    await fs.writeFile(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
    const rereadPaths = [...files.filter(item => item.path.toLowerCase() !== 'manifest.json').map(item => item.path), 'manifest.json'];
    const reread = await Promise.all(rereadPaths.map(async filePath => ({ path: filePath, buffer: await fs.readFile(path.join(staging, ...safeRelativePath(filePath).split('/'))) })));
    await validateThemeFiles(reread);
    await fs.rename(staging, destination);
    return { id: themeId, manifest };
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function listInstalled(themesRoot) {
  await fs.mkdir(themesRoot, { recursive: true });
  const entries = await fs.readdir(themesRoot, { withFileTypes: true });
  const result = [];
  for (const entry of entries) if (entry.isDirectory() && entry.name !== '.staging' && validId(entry.name)) {
    try { result.push(JSON.parse(await fs.readFile(path.join(themesRoot, entry.name, 'manifest.json'), 'utf8'))); } catch (_) {}
  }
  return result;
}

async function removeInstalled(themesRoot, themeId) {
  if (!validId(themeId)) throw new Error('Invalid theme id');
  const root = path.resolve(themesRoot);
  const target = path.resolve(root, themeId);
  if (path.dirname(target) !== root) throw new Error('Theme path escapes root');
  const targetStat = await fs.lstat(target);
  if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) throw new Error('Theme target must be a regular directory, not a link');
  const manifestPath = path.join(target, 'manifest.json');
  const manifestStat = await fs.lstat(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) throw new Error('Theme manifest must be a regular file');
  let manifest;
  try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')); } catch (_) { throw new Error('Invalid theme manifest'); }
  if (manifest.id !== themeId || manifest.ownership !== 'xunxintai-theme-import-v1') throw new Error('Theme is not owned by the import pipeline or manifest id mismatches');
  await fs.rm(target, { recursive: true, force: false });
  return true;
}

module.exports = { installTheme, listInstalled, removeInstalled };
