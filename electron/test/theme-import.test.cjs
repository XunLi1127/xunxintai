const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const LIMITS = require('../theme-import/constants.cjs');
const { validateArchiveEntries } = require('../theme-import/archive.cjs');
const { inspectMediaBuffer } = require('../theme-import/signatures.cjs');
const { assertSafeSvg } = require('../theme-import/svg-safety.cjs');
const { detectThemeFormat } = require('../theme-import/detect-format.cjs');
const { installTheme } = require('../theme-import/install-theme.cjs');

function png(width, height) {
  const buffer = Buffer.alloc(33);
  Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(buffer);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = 6;
  return buffer;
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

test('media inspection rejects extension mismatch, corrupt images, and excessive pixels', () => {
  assert.throws(() => inspectMediaBuffer('image.jpg', png(1, 1)), /extension|signature/i);
  assert.throws(() => inspectMediaBuffer('image.png', Buffer.from('not an image')), /recognize|image/i);
  assert.throws(() => inspectMediaBuffer('image.png', png(8000, 5000)), /pixel/i);
});

test('APNG uses the PNG signature and is reported as animated media', () => {
  const sample = Buffer.concat([png(2, 2), Buffer.from('acTL')]);
  const result = inspectMediaBuffer('animation.apng', sample);
  assert.equal(result.mediaType, 'image/png');
  assert.equal(result.animated, true);
});

test('SVG safety rejects active content including case, whitespace, and entity bypasses', () => {
  const unsafe = [
    '<svg><ScRiPt/></svg>', '<svg><foreignObject/></svg>', '<svg onload="alert(1)"/>',
    '<svg><a href=" javascript:alert(1)"/></svg>', '<svg><image xlink:href="https://example.com/a.png"/></svg>',
    '<svg><a href="java&#x73;cript:alert(1)"/></svg>',
  ];
  for (const source of unsafe) assert.throws(() => assertSafeSvg(Buffer.from(source)), /unsafe svg/i, source);
});

test('Codex Pet atlas requires the exact public dimensions', () => {
  assert.throws(() => detectThemeFormat([{ path: 'pet.png', buffer: png(1535, 1872) }]), /recognize|codex pet/i);
  assert.equal(detectThemeFormat([{ path: 'pet.png', buffer: png(1536, 1872) }]).format, 'codex-pet');
});

test('atomic install cleans staging and preserves an existing theme on rename failure', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'theme-install-test-'));
  const themesRoot = path.join(root, 'themes');
  const existing = path.join(themesRoot, 'existing-theme');
  await fs.mkdir(existing, { recursive: true });
  await fs.writeFile(path.join(existing, 'sentinel'), 'untouched');
  await assert.rejects(() => installTheme({
    inspection: { format: 'media', displayName: 'Existing theme', files: [{ path: 'image.png', mediaType: 'image/png', bytes: 33 }], missingStates: [], warnings: [], sourceLicense: null },
    files: [{ path: 'image.png', buffer: png(1, 1) }], themesRoot,
    themeIdFactory: () => 'existing-theme',
  }), /exists/i);
  assert.equal(await fs.readFile(path.join(existing, 'sentinel'), 'utf8'), 'untouched');
  assert.deepEqual(await fs.readdir(path.join(themesRoot, '.staging')), []);
  await fs.rm(root, { recursive: true, force: true });
});
