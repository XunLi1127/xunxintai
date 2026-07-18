const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const yauzl = require('yauzl');
const LIMITS = require('./constants.cjs');

function safeRelativePath(fileName) {
  if (typeof fileName !== 'string' || !fileName || fileName.includes('\\') || fileName.includes('\0')) throw new Error('Unsafe archive path');
  if (fileName.startsWith('/') || fileName.startsWith('//') || /^[a-z]:/i.test(fileName)) throw new Error('Unsafe archive path');
  if (fileName.split('/').some(segment => segment === '..' || segment === '.')) throw new Error('Unsafe archive path');
  const normalized = path.posix.normalize(fileName);
  if (normalized === '..' || normalized.startsWith('../') || normalized.startsWith('/')) throw new Error('Unsafe archive path');
  return normalized.replace(/\/$/, '');
}

function isUnsafeType(entry) {
  const unixType = ((entry.externalFileAttributes || 0) >>> 16) & 0o170000;
  return unixType !== 0 && unixType !== 0o100000 && unixType !== 0o040000;
}

function validateArchiveEntries(entries) {
  const files = entries.filter(entry => !String(entry.fileName).endsWith('/'));
  if (files.length > LIMITS.MAX_FILE_COUNT) throw new Error('Archive file count limit exceeded');
  let total = 0;
  for (const entry of entries) {
    safeRelativePath(entry.fileName);
    if (isUnsafeType(entry)) throw new Error('Archive link or special entries are forbidden');
    if (entry.uncompressedSize > LIMITS.MAX_SINGLE_FILE_BYTES) throw new Error('Archive single file limit exceeded');
    if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0) throw new Error('Invalid declared size');
    total += entry.uncompressedSize;
    if (total > LIMITS.MAX_TOTAL_BYTES) throw new Error('Archive total byte limit exceeded');
  }
  return files;
}

function openZip(zipPath) {
  return new Promise((resolve, reject) => yauzl.open(zipPath, { lazyEntries: true, validateEntrySizes: true, decodeStrings: true }, (err, zip) => err ? reject(err) : resolve(zip)));
}

async function inspectAndExtractZip(zipPath, tempRoot) {
  const zip = await openZip(zipPath);
  const entries = [];
  await new Promise((resolve, reject) => {
    zip.on('entry', entry => { entries.push(entry); zip.readEntry(); });
    zip.once('end', resolve); zip.once('error', reject); zip.readEntry();
  });
  validateArchiveEntries(entries);
  zip.close();
  const destination = path.join(tempRoot, 'xunxintai-theme-import', crypto.randomUUID());
  await fsp.mkdir(destination, { recursive: true });
  const extracted = [];
  try {
    const reader = await openZip(zipPath);
    await new Promise((resolve, reject) => {
      reader.on('entry', entry => {
        if (entry.fileName.endsWith('/')) { reader.readEntry(); return; }
        reader.openReadStream(entry, async (err, stream) => {
          if (err) return reject(err);
          const relative = safeRelativePath(entry.fileName);
          const target = path.join(destination, ...relative.split('/'));
          let actual = 0;
          stream.on('data', chunk => { actual += chunk.length; if (actual > entry.uncompressedSize) stream.destroy(new Error('Extracted size mismatch')); });
          stream.once('error', reject);
          try { await fsp.mkdir(path.dirname(target), { recursive: true }); } catch (error) { reject(error); return; }
          const output = fs.createWriteStream(target, { flags: 'wx', mode: 0o600 });
          output.once('error', reject);
          output.once('finish', () => {
            if (actual !== entry.uncompressedSize) return reject(new Error('Extracted size mismatch'));
            extracted.push({ path: relative, absolutePath: target, bytes: actual }); reader.readEntry();
          });
          stream.pipe(output);
        });
      });
      reader.once('end', resolve); reader.once('error', reject); reader.readEntry();
    });
    return { destination, files: extracted };
  } catch (error) {
    await fsp.rm(destination, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

module.exports = { safeRelativePath, validateArchiveEntries, inspectAndExtractZip };
