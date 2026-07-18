const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // Zoom change listener
    onZoomChanged: (callback) => ipcRenderer.on('zoom-changed', (_, factor) => callback(factor)),
    // Platform info
    getPlatform: () => ipcRenderer.invoke('get-platform'),
    getAppPath: () => ipcRenderer.invoke('get-app-path'),

    // File system
    selectDirectory: () => ipcRenderer.invoke('select-directory'),

    // Check if running in Electron
    isElectron: true,

    // Core Functions
    exportWorkspace: (workspaceId, contextMarkdown, defaultFilename) => ipcRenderer.invoke('export-workspace', workspaceId, contextMarkdown, defaultFilename),

    // File explorer: open folder containing a file, or open a folder directly
    showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
    openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
    openPathWithTarget: (targetPath, target) => ipcRenderer.invoke('open-path-with-target', targetPath, target),
    openPreviewHtml: (html, suggestedName) => ipcRenderer.invoke('open-preview-html', html, suggestedName),

    // Window resize
    resizeWindow: (width, height) => ipcRenderer.invoke('resize-window', width, height),

    // Open external URL in system browser (for OAuth flows etc.)
    openExternal: (url) => ipcRenderer.invoke('open-external', url),

    // Auto-update events
    onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_, status) => callback(status)),
    installUpdate: () => ipcRenderer.invoke('install-update'),
});

contextBridge.exposeInMainWorld('themeApi', Object.freeze({
    selectImport: () => ipcRenderer.invoke('theme:select-import'),
    inspectImport: (selectionId) => ipcRenderer.invoke('theme:inspect-import', selectionId),
    installImport: (inspectionId) => ipcRenderer.invoke('theme:install-import', inspectionId),
    listInstalled: () => ipcRenderer.invoke('theme:list-installed'),
    removeInstalled: (themeId) => ipcRenderer.invoke('theme:remove-installed', themeId),
}));

contextBridge.exposeInMainWorld('petApi', Object.freeze({
    getStatus: () => ipcRenderer.invoke('pet:get-status'),
    start: () => ipcRenderer.invoke('pet:start'),
    stop: () => ipcRenderer.invoke('pet:stop'),
    updateSettings: (settings) => ipcRenderer.invoke('pet:update-settings', settings),
    exportDiagnostics: () => ipcRenderer.invoke('pet:export-diagnostics'),
}));
