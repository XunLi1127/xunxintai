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

function createThemeImportService({ dialog, windowProvider, tempRoot, themesRoot, now = Date.now, ttlMs = 10 * 60 * 1000, maxPending = 4 }) {
  const selections = new Map();
  const inspections = new Map();
  async function discardInspection(id, value) {
    if (!value || inspections.get(id) !== value) return;
    inspections.delete(id);
    if (value.expiryTimer) clearTimeout(value.expiryTimer);
    if (value.extracted) await fs.rm(value.extracted.destination, { recursive: true, force: true }).catch(() => {});
  }
  async function purgeExpired() {
    const cutoff = now() - ttlMs;
    for (const [id, value] of selections) if (value.createdAt <= cutoff) selections.delete(id);
    for (const [id, value] of inspections) if (value.createdAt <= cutoff) {
      await discardInspection(id, value);
    }
  }
  async function capInspections() {
    while (inspections.size >= maxPending) {
      const [id, value] = inspections.entries().next().value;
      await discardInspection(id, value);
    }
  }
  return {
    async selectImport() {
      await purgeExpired();
      const result = await dialog.showOpenDialog(windowProvider(), { properties: ['openFile'], filters: [{ name: 'Theme and media', extensions: ['zip', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'apng', 'svg'] }] });
      if (result.canceled || result.filePaths.length !== 1) return { canceled: true };
      const filePath = result.filePaths[0];
      const stat = await fs.stat(filePath);
      if (!stat.isFile() || stat.size > LIMITS.MAX_SINGLE_FILE_BYTES && path.extname(filePath).toLowerCase() !== '.zip') throw new Error('Selected file is too large');
      const selectionId = crypto.randomUUID();
      while (selections.size >= maxPending) selections.delete(selections.keys().next().value);
      selections.set(selectionId, { filePath, createdAt: now() });
      return { canceled: false, selectionId, name: path.basename(filePath), bytes: stat.size };
    },
    async inspectImport(selectionId) {
      await purgeExpired();
      const id = token(selectionId, 'selection id');
      const selectedEntry = selections.get(id);
      selections.delete(id);
      if (!selectedEntry) throw new Error('Unknown selection');
      const selected = selectedEntry.filePath;
      let extracted = null;
      let files;
      if (path.extname(selected).toLowerCase() === '.zip') {
        extracted = await inspectAndExtractZip(selected, tempRoot);
        files = await Promise.all(extracted.files.map(async file => ({ path: file.path, buffer: await fs.readFile(file.absolutePath) })));
      } else files = [{ path: path.basename(selected), buffer: await fs.readFile(selected) }];
      try {
        const inspection = await validateThemeFiles(files);
        const inspectionId = crypto.randomUUID();
        await capInspections();
        const pending = { inspection, files, extracted, createdAt: now(), expiryTimer: null };
        inspections.set(inspectionId, pending);
        pending.expiryTimer = setTimeout(() => { discardInspection(inspectionId, pending).catch(() => {}); }, ttlMs);
        pending.expiryTimer.unref?.();
        return { inspectionId, inspection };
      } catch (error) {
        if (extracted) await fs.rm(extracted.destination, { recursive: true, force: true }).catch(() => {});
        throw error;
      }
    },
    async installImport(inspectionId) {
      await purgeExpired();
      const id = token(inspectionId, 'inspection id');
      const pending = inspections.get(id);
      if (!pending) throw new Error('Unknown inspection');
      try { return await installTheme({ ...pending, themesRoot }); }
      finally {
        inspections.delete(id);
        if (pending.expiryTimer) clearTimeout(pending.expiryTimer);
        if (pending.extracted) await fs.rm(pending.extracted.destination, { recursive: true, force: true }).catch(() => {});
      }
    },
    listInstalled: () => listInstalled(themesRoot),
    removeInstalled: themeId => removeInstalled(themesRoot, themeId),
  };
}

module.exports = { createThemeImportService };
