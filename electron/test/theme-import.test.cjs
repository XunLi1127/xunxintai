const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { finished } = require('node:stream/promises');
const archiver = require('archiver');
const sharp = require('sharp');
const extractPngChunks = require('png-chunks-extract');
const encodePngChunks = require('png-chunks-encode');

const LIMITS = require('../theme-import/constants.cjs');
const { validateArchiveEntries, inspectAndExtractZip } = require('../theme-import/archive.cjs');
const { inspectMediaBuffer } = require('../theme-import/signatures.cjs');
const { assertSafeSvg } = require('../theme-import/svg-safety.cjs');
const { detectThemeFormat } = require('../theme-import/detect-format.cjs');
const { installTheme, removeInstalled } = require('../theme-import/install-theme.cjs');
const { createThemeImportService } = require('../theme-import/service.cjs');

const VALID_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

async function zipAt(filePath, entries) {
  const output = require('node:fs').createWriteStream(filePath);
  const archive = archiver('zip');
  archive.pipe(output);
  for (const entry of entries) archive.append(entry.buffer, { name: entry.path });
  await archive.finalize(); await finished(output);
}

test('archive validation rejects traversal and absolute path variants', () => {
  for (const fileName of ['../evil.png', 'safe/../evil.png', '/evil.png', 'C:/evil.png', '\\\\server\\share\\evil.png', 'safe\\..\\evil.png']) {
    assert.throws(() => validateArchiveEntries([{ fileName, uncompressedSize: 1 }]), /path/i, fileName);
  }
});

test('archive validation rejects link entries', () => {
  assert.throws(() => validateArchiveEntries([{ fileName: 'link', uncompressedSize: 1, externalFileAttributes: 0o120777 << 16 }]), /link/i);
});

test('archive validation enforces count and declared byte limits', () => {
  assert.throws(() => validateArchiveEntries(Array.from({ length: LIMITS.MAX_FILE_COUNT + 1 }, (_, i) => ({ fileName: `${i}.png`, uncompressedSize: 1 }))), /count/i);
  assert.throws(() => validateArchiveEntries([{ fileName: 'large.png', uncompressedSize: LIMITS.MAX_SINGLE_FILE_BYTES + 1 }]), /single file/i);
  assert.throws(() => validateArchiveEntries(Array.from({ length: 5 }, (_, i) => ({ fileName: `${i}.png`, uncompressedSize: 21 * 1024 * 1024 }))), /total/i);
});

test('media inspection rejects extension mismatch, corrupt images, and excessive pixels', async () => {
  await assert.rejects(() => inspectMediaBuffer('image.jpg', VALID_PNG), /extension|signature/i);
  await assert.rejects(() => inspectMediaBuffer('image.png', Buffer.from('not an image')), /recognize|image/i);
  const corrupt = Buffer.from(VALID_PNG); const idat = corrupt.indexOf(Buffer.from('IDAT')); const idatLength = corrupt.readUInt32BE(idat - 4); corrupt[idat + 4 + idatLength] ^= 1;
  await assert.rejects(() => inspectMediaBuffer('image.png', corrupt), /decode|corrupt|image/i);
  const huge = await sharp({ create: { width: 8000, height: 5000, channels: 3, background: '#000' } }).png().toBuffer();
  await assert.rejects(() => inspectMediaBuffer('huge.png', huge), /pixel|decode/i);
});

test('APNG acceptance requires real animation control chunks, not marker bytes', async () => {
  const chunks = extractPngChunks(VALID_PNG);
  const acTL = { name: 'acTL', data: Buffer.from('0000000100000000', 'hex') };
  const fcTLData = Buffer.alloc(26); fcTLData.writeUInt32BE(1, 4); fcTLData.writeUInt32BE(1, 8); fcTLData.writeUInt16BE(1, 20); fcTLData.writeUInt16BE(10, 22);
  const animated = Buffer.from(encodePngChunks([chunks[0], acTL, { name: 'fcTL', data: fcTLData }, ...chunks.slice(1)]));
  assert.equal((await inspectMediaBuffer('one.apng', animated)).animated, true);
  const fake = Buffer.from(encodePngChunks([chunks[0], { name: 'tEXt', data: Buffer.from('acTL') }, ...chunks.slice(1)]));
  await assert.rejects(() => inspectMediaBuffer('fake.apng', fake), /signature|animation|apng/i);
});

test('SVG safety rejects active content including case, whitespace, and entity bypasses', () => {
  const unsafe = [
    '<svg><ScRiPt/></svg>', '<svg><foreignObject/></svg>', '<svg onload="alert(1)"/>',
    '<svg><a href=" javascript:alert(1)"/></svg>', '<svg><image xlink:href="https://example.com/a.png"/></svg>',
    '<svg><a href="java&#x73;cript:alert(1)"/></svg>',
  ];
  for (const source of unsafe) assert.throws(() => assertSafeSvg(Buffer.from(source)), /unsafe svg/i, source);
});

test('SVG safety rejects stylesheets and every CSS external resource channel', () => {
  for (const source of ['<?xml-stylesheet href="https://x/a.css"?><svg/>', '<svg><style>@import "https://x"</style></svg>', '<svg style="background:url(https://x/a)"></svg>', '<svg><style>.x{fill:url(https://x/a)}</style></svg>']) {
    assert.throws(() => assertSafeSvg(Buffer.from(source)), /unsafe svg/i);
  }
});

test('SVG safety rejects namespace-prefixed script and foreignObject elements', () => {
  assert.throws(() => assertSafeSvg(Buffer.from('<svg xmlns:x="urn:x"><x:script/></svg>')), /unsafe svg/i);
  assert.throws(() => assertSafeSvg(Buffer.from('<svg xmlns:x="urn:x"><x:foreignObject/></svg>')), /unsafe svg/i);
});

test('pixel limit is enforced from metadata before PNG CRC/full decode allocation', async () => {
  const huge = await sharp({ create: { width: 8000, height: 5000, channels: 3, background: '#000' } }).png().toBuffer();
  const { PNG } = require('pngjs'); const original = PNG.sync.read;
  PNG.sync.read = () => { throw new Error('full decoder reached'); };
  try { await assert.rejects(() => inspectMediaBuffer('huge.png', huge), /pixel/i); }
  finally { PNG.sync.read = original; }
});

test('manifest markers cannot bypass per-file allowlist and media validation', async () => {
  await assert.rejects(() => detectThemeFormat([{ path: 'manifest.json', buffer: Buffer.from('{"format":"xunxintai-theme","name":"x"}') }, { path: 'run.exe', buffer: Buffer.from('MZ') }]), /file|extension/i);
  await assert.rejects(() => detectThemeFormat([{ path: 'theme.json', buffer: Buffer.from('{"name":"x","assets":{}}') }, { path: 'bad.png', buffer: Buffer.from('broken') }]), /image/i);
});

test('Codex Pet classification uses fully valid images and exact dimensions', async () => {
  const exact = await sharp({ create: { width: 1536, height: 1872, channels: 3, background: '#000' } }).png().toBuffer();
  const wrong = await sharp({ create: { width: 1535, height: 1872, channels: 3, background: '#000' } }).png().toBuffer();
  assert.equal((await detectThemeFormat([{ path: 'pet.png', buffer: exact }])).format, 'codex-pet');
  await assert.rejects(() => detectThemeFormat([{ path: 'pet.png', buffer: wrong }]), /codex pet|dimension/i);
});

test('atomic install cleans staging and preserves an existing theme on rename failure', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'theme-install-test-'));
  const themesRoot = path.join(root, 'themes');
  const existing = path.join(themesRoot, 'existing-theme');
  await fs.mkdir(existing, { recursive: true });
  await fs.writeFile(path.join(existing, 'sentinel'), 'untouched');
  await assert.rejects(() => installTheme({
    inspection: { format: 'media', displayName: 'Existing theme', files: [{ path: 'image.png', mediaType: 'image/png', bytes: 33 }], missingStates: [], warnings: [], sourceLicense: null },
    files: [{ path: 'image.png', buffer: VALID_PNG }], themesRoot,
    themeIdFactory: () => 'existing-theme',
  }), /exists/i);
  assert.equal(await fs.readFile(path.join(existing, 'sentinel'), 'utf8'), 'untouched');
  assert.deepEqual(await fs.readdir(path.join(themesRoot, '.staging')), []);
  await fs.rm(root, { recursive: true, force: true });
});

test('remove only deletes owned regular theme directories with matching manifest id', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'theme-remove-test-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [id, manifest] of [['foreign', { id: 'foreign' }], ['mismatch', { id: 'other', ownership: 'xunxintai-theme-import-v1' }]]) {
    await fs.mkdir(path.join(root, id)); await fs.writeFile(path.join(root, id, 'manifest.json'), JSON.stringify(manifest));
    await assert.rejects(() => removeInstalled(root, id), /owned|manifest/i);
  }
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-theme-')); t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.symlink(outside, path.join(root, 'linked'), 'junction');
  await assert.rejects(() => removeInstalled(root, 'linked'), /link|directory/i);
  await fs.mkdir(path.join(root, 'owned')); await fs.writeFile(path.join(root, 'owned', 'manifest.json'), JSON.stringify({ id: 'owned', ownership: 'xunxintai-theme-import-v1' }));
  assert.equal(await removeInstalled(root, 'owned'), true);
});

test('expired inspection tokens release extracted temp resources', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'theme-expiry-test-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const archive = path.join(root, 'theme.zip'); await zipAt(archive, [{ path: 'one.png', buffer: VALID_PNG }]);
  let time = 1000; let calls = 0;
  const service = createThemeImportService({ dialog: { showOpenDialog: async () => calls++ ? ({ canceled: true, filePaths: [] }) : ({ canceled: false, filePaths: [archive] }) }, windowProvider: () => null, tempRoot: root, themesRoot: path.join(root, 'themes'), now: () => time, ttlMs: 10, maxPending: 1 });
  const selected = await service.selectImport(); await service.inspectImport(selected.selectionId);
  assert.equal((await fs.readdir(path.join(root, 'xunxintai-theme-import'))).length, 1);
  time += 11; await service.selectImport();
  assert.deepEqual(await fs.readdir(path.join(root, 'xunxintai-theme-import')), []);
});

test('install revalidates actual staged media and cleans write-stage failures', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'theme-stage-test-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const inspection = { format: 'xun', displayName: 'x', files: [], missingStates: [], warnings: [], sourceLicense: null };
  await assert.rejects(() => installTheme({ inspection, files: [{ path: 'manifest.json', buffer: Buffer.from('{"format":"xunxintai-theme","name":"x"}') }, { path: 'bad.png', buffer: Buffer.from('bad') }], themesRoot: root }), /image/i);
  await assert.rejects(() => installTheme({ inspection, files: [{ path: 'one.png', buffer: VALID_PNG }, { path: 'one.png', buffer: VALID_PNG }], themesRoot: root }), /exist/i);
  assert.deepEqual(await fs.readdir(path.join(root, '.staging')), []);
});

test('selection tokens are one-time and cannot become arbitrary paths', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'theme-service-test-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const image = path.join(root, 'one.png'); await fs.writeFile(image, VALID_PNG);
  const service = createThemeImportService({ dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [image] }) }, windowProvider: () => null, tempRoot: root, themesRoot: path.join(root, 'themes') });
  const selected = await service.selectImport();
  await service.inspectImport(selected.selectionId);
  await assert.rejects(() => service.inspectImport(selected.selectionId), /unknown/i);
  await assert.rejects(() => service.inspectImport(image), /invalid|unknown/i);
});

test('inspection token is atomically consumed before concurrent installs await', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'theme-concurrent-test-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const image = path.join(root, 'one.png'); await fs.writeFile(image, VALID_PNG);
  const service = createThemeImportService({ dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [image] }) }, windowProvider: () => null, tempRoot: root, themesRoot: path.join(root, 'themes') });
  const selected = await service.selectImport(); const inspected = await service.inspectImport(selected.selectionId);
  const results = await Promise.allSettled([service.installImport(inspected.inspectionId), service.installImport(inspected.inspectionId)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected');
  assert.match(rejected.reason.message, /unknown inspection/i);
});

test('zip is centrally checked before extraction and corrupt size cleans isolation directory', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'theme-zip-test-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const good = path.join(root, 'good.zip'); await zipAt(good, [{ path: 'one.png', buffer: VALID_PNG }]);
  const extracted = await inspectAndExtractZip(good, root); assert.deepEqual(extracted.files.map(file => file.path), ['one.png']);
  await fs.rm(extracted.destination, { recursive: true, force: true });
  const bad = path.join(root, 'bad.zip'); const bytes = await fs.readFile(good); const central = bytes.indexOf(Buffer.from('504b0102', 'hex')); bytes.writeUInt32LE(VALID_PNG.length + 1, central + 24); await fs.writeFile(bad, bytes);
  await assert.rejects(() => inspectAndExtractZip(bad, root), /size|zip|invalid|bytes/i);
  const isolation = path.join(root, 'xunxintai-theme-import');
  assert.deepEqual(await fs.readdir(isolation).catch(() => []), []);
  const traversal = path.join(root, 'traversal.zip'); const traversalBytes = await fs.readFile(good);
  for (let at = traversalBytes.indexOf(Buffer.from('one.png')); at >= 0; at = traversalBytes.indexOf(Buffer.from('one.png'), at + 1)) Buffer.from('../xpng').copy(traversalBytes, at);
  await fs.writeFile(traversal, traversalBytes);
  await assert.rejects(() => inspectAndExtractZip(traversal, root), /path/i);
  assert.deepEqual(await fs.readdir(isolation).catch(() => []), []);
});
