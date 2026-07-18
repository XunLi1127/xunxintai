const path = require('node:path');
const { inspectMediaBuffer } = require('./signatures.cjs');
const LIMITS = require('./constants.cjs');

function parseJson(files, name) {
  const file = files.find(item => item.path.toLowerCase() === name.toLowerCase());
  if (!file) return null;
  try { return JSON.parse(file.buffer.toString('utf8')); } catch (_) { throw new Error(`Invalid ${name}`); }
}

function inspection(format, displayName, files, sourceLicense = null) {
  return { format, displayName, files: files.map(file => ({ path: file.path, mediaType: file.mediaType || 'application/json', bytes: file.buffer.length })), missingStates: [], warnings: [], sourceLicense };
}

function detectThemeFormat(files) {
  const manifest = parseJson(files, 'manifest.json');
  if (manifest?.format === 'xunxintai-theme') return inspection('xun', String(manifest.name || '洵心台主题'), files, manifest.license || null);
  const clawd = parseJson(files, 'theme.json');
  if (clawd?.name && (clawd.states || clawd.assets)) return inspection('clawd', String(clawd.name), files, clawd.license || null);
  if (files.length === 1 && /\.(?:png|apng)$/i.test(files[0].path)) {
    const media = inspectMediaBuffer(files[0].path, files[0].buffer);
    files[0].mediaType = media.mediaType;
    if (media.width === LIMITS.CODEX_PET_WIDTH && media.height === LIMITS.CODEX_PET_HEIGHT) return inspection('codex-pet', path.parse(files[0].path).name, files);
    if (/^(?:pet|codex-pet|sprite(?:sheet)?)\.(?:png|apng)$/i.test(path.basename(files[0].path))) throw new Error('Codex Pet atlas dimensions must be exactly 1536x1872');
  }
  const palette = parseJson(files, 'base24.json') || parseJson(files, 'base16.json');
  if (palette?.scheme && palette.base00 && palette.base0F) return inspection(palette.base10 ? 'base24' : 'base16', String(palette.scheme), files);
  if (files.length === 1) {
    const media = inspectMediaBuffer(files[0].path, files[0].buffer);
    files[0].mediaType = media.mediaType;
    return inspection('media', path.parse(files[0].path).name, files);
  }
  throw new Error('Unable to safely recognize import');
}

module.exports = { detectThemeFormat };
