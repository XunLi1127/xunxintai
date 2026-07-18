const sharp = require('sharp');
const { PNG } = require('pngjs');
const extractPngChunks = require('png-chunks-extract');
const path = require('node:path');
const LIMITS = require('./constants.cjs');
const { assertSafeSvg } = require('./svg-safety.cjs');

const TYPES = {
  png: { mediaType: 'image/png', test: b => b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) },
  apng: { mediaType: 'image/png', test: b => {
    if (!b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return false;
    try { const names = extractPngChunks(b).map(chunk => chunk.name); return names.includes('acTL') && names.includes('fcTL'); } catch (_) { return false; }
  } },
  jpg: { mediaType: 'image/jpeg', test: b => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { mediaType: 'image/jpeg', test: b => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  gif: { mediaType: 'image/gif', test: b => /^GIF8[79]a$/.test(b.subarray(0, 6).toString('ascii')) },
  webp: { mediaType: 'image/webp', test: b => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
};

async function inspectMediaBuffer(fileName, buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > LIMITS.MAX_SINGLE_FILE_BYTES) throw new Error('Invalid image bytes');
  const ext = path.extname(fileName).slice(1).toLowerCase();
  if (ext === 'svg') {
    assertSafeSvg(buffer);
    return { mediaType: 'image/svg+xml', width: null, height: null, animated: false };
  }
  const expected = TYPES[ext];
  if (!expected || !expected.test(buffer)) throw new Error('Image extension does not match signature');
  let dimensions;
  try {
    dimensions = await sharp(buffer, { animated: true, limitInputPixels: LIMITS.MAX_IMAGE_PIXELS }).metadata();
  } catch (error) {
    if (/pixel|limit/i.test(error.message)) throw new Error('Image pixel limit exceeded');
    throw new Error(`Unable to read image metadata: ${error.message}`);
  }
  if (!dimensions.width || !dimensions.height) throw new Error('Unable to recognize image dimensions');
  if (dimensions.width * dimensions.height > LIMITS.MAX_IMAGE_PIXELS) throw new Error('Image pixel limit exceeded');
  try {
    if (ext === 'png' || ext === 'apng') PNG.sync.read(buffer, { checkCRC: true });
    await sharp(buffer, { animated: true, limitInputPixels: LIMITS.MAX_IMAGE_PIXELS }).raw().toBuffer();
  } catch (error) { throw new Error(`Unable to decode image: ${error.message}`); }
  const animated = ext === 'gif' || ext === 'webp' || ext === 'apng' || (ext === 'png' && buffer.includes(Buffer.from('acTL')));
  return { mediaType: expected.mediaType, width: dimensions.width, height: dimensions.height, animated };
}

module.exports = { inspectMediaBuffer };
