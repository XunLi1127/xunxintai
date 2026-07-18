const { detectThemeFormat } = require('./detect-format.cjs');

async function validateThemeFiles(files) {
  if (!Array.isArray(files) || files.length === 0) throw new Error('Import contains no files');
  return await detectThemeFormat(files);
}

module.exports = { validateThemeFiles };
