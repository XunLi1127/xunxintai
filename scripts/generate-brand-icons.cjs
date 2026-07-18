const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'assets', 'brand', 'xunxintai-mark.svg');
const outputDir = path.join(root, 'public');
const pngSizes = [16, 32, 48, 64, 128, 256, 512, 1024];
const icoSizes = [16, 32, 48, 64, 128, 256];

function createIco(images) {
  const headerSize = 6;
  const entrySize = 16;
  const dataOffset = headerSize + images.length * entrySize;
  const header = Buffer.alloc(dataOffset);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = dataOffset;
  images.forEach(({ size, data }, index) => {
    const entry = headerSize + index * entrySize;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map(image => image.data)]);
}

async function main() {
  const svg = fs.readFileSync(source);
  fs.mkdirSync(outputDir, { recursive: true });
  const images = [];
  for (const size of pngSizes) {
    const data = await sharp(svg, { density: 192 })
      .resize(size, size, { fit: 'fill' })
      .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
      .toBuffer();
    fs.writeFileSync(path.join(outputDir, `xunxintai-${size}.png`), data);
    if (icoSizes.includes(size)) images.push({ size, data });
  }
  fs.writeFileSync(path.join(outputDir, 'xunxintai.ico'), createIco(images));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
