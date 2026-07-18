const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { inspectAndExtractZip } = require('./archive.cjs');
const { validateThemeFiles } = require('./validate-theme.cjs');
const { installTheme, listInstalled, removeInstalled } = require('./install-theme.cjs');
const LIMITS = require('./constants.cjs');

function token(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) throw new Error(`Invalid ${label}`);
  return value;
}

function createThemeImportService({ dialog, windowProvider, tempRoot, themesRoot }) {
  const selections = new Map();
  const inspections = new Map();
  return {
    async selectImport() {
      const result = await dialog.showOpenDialog(windowProvider(), { properties: ['openFile'], filters: [{ name: 'Theme and media', extensions: ['zip', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'apng', 'svg'] }] });
      if (result.canceled || result.filePaths.length !== 1) return { canceled: true };
      const filePath = result.filePaths[0];
      const stat = await fs.stat(filePath);
      if (!stat.isFile() || stat.size > LIMITS.MAX_SINGLE_FILE_BYTES && path.extname(filePath).toLowerCase() !== '.zip') throw new Error('Selected file is too large');
      const selectionId = crypto.randomUUID();
      selections.set(selectionId, filePath);
      return { canceled: false, selectionId, name: path.basename(filePath), bytes: stat.size };
    },
    async inspectImport(selectionId) {
      const selected = selections.get(token(selectionId, 'selection id'));
      if (!selected) throw new Error('Unknown selection');
      let extracted = null;
      let files;
      if (path.extname(selected).toLowerCase() === '.zip') {
        extracted = await inspectAndExtractZip(selected, tempRoot);
        files = await Promise.all(extracted.files.map(async file => ({ path: file.path, buffer: await fs.readFile(file.absolutePath) })));
      } else files = [{ path: path.basename(selected), buffer: await fs.readFile(selected) }];
      try {
        const inspection = validateThemeFiles(files);
        const inspectionId = crypto.randomUUID();
        inspections.set(inspectionId, { inspection, files, extracted });
        return { inspectionId, inspection };
      } catch (error) {
        if (extracted) await fs.rm(extracted.destination, { recursive: true, force: true }).catch(() => {});
        throw error;
      }
    },
    async installImport(inspectionId) {
      const id = token(inspectionId, 'inspection id');
      const pending = inspections.get(id);
      if (!pending) throw new Error('Unknown inspection');
      try { return await installTheme({ ...pending, themesRoot }); }
      finally {
        inspections.delete(id);
        if (pending.extracted) await fs.rm(pending.extracted.destination, { recursive: true, force: true }).catch(() => {});
      }
    },
    listInstalled: () => listInstalled(themesRoot),
    removeInstalled: themeId => removeInstalled(themesRoot, themeId),
  };
}

module.exports = { createThemeImportService };
