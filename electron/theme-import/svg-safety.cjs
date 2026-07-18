function decodeEntities(value) {
  return value.replace(/&#(?:x([0-9a-f]+)|([0-9]+));?/gi, (_, hex, dec) => String.fromCodePoint(parseInt(hex || dec, hex ? 16 : 10)));
}

function assertSafeSvg(buffer) {
  const source = decodeEntities(buffer.toString('utf8'));
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(source)) throw new Error('Unsafe SVG: invalid root');
  if (/<!DOCTYPE|<!ENTITY|<\?(?!xml\s)|<\s*(?:script|foreignObject|style)\b/i.test(source)) throw new Error('Unsafe SVG: active element');
  if (/\son[a-z0-9_-]+\s*=/i.test(source)) throw new Error('Unsafe SVG: event attribute');
  if (/\sstyle\s*=|@import\b|url\s*\(|\s(?:src|poster)\s*=/i.test(source)) throw new Error('Unsafe SVG: external style or resource');
  for (const match of source.matchAll(/\b(?:href|xlink:href)\s*=\s*(["'])(.*?)\1/gis)) {
    const target = match[2].replace(/[\u0000-\u0020]+/g, '').toLowerCase();
    if (!target.startsWith('#') && target !== '') throw new Error('Unsafe SVG: external reference');
  }
  if (/javascript\s*:/i.test(source)) throw new Error('Unsafe SVG: javascript URI');
  return true;
}

module.exports = { assertSafeSvg };
