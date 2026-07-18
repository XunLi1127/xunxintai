const { detectThemeFormat } = require('./detect-format.cjs');

function validateThemeFiles(files) {
  if (!Array.isArray(files) || files.length === 0) throw new Error('Import contains no files');
  return detectThemeFormat(files);
}

module.exports = { validateThemeFiles };
