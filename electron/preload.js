const { ipcRenderer, contextBridge } = require('electron')

console.log('[Preload] Script starting to load...');

try {
    contextBridge.exposeInMainWorld('ipcRenderer', {
        on(...args) {
            const [channel, listener] = args
            return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
        },
        off(...args) {
            const [channel, ...omit] = args
            return ipcRenderer.off(channel, ...omit)
        },
        send(...args) {
            const [channel, ...omit] = args
            return ipcRenderer.send(channel, ...omit)
        },
        invoke(...args) {
            const [channel, ...omit] = args
            return ipcRenderer.invoke(channel, ...omit)
        },

        // File operations
        selectFiles: () => ipcRenderer.invoke('select-files'),

        // Persistence & Manifest API
        saveProject: (content) => ipcRenderer.invoke('save-project', content),
        loadProject: () => ipcRenderer.invoke('load-project'),
        exportManifest: (content) => ipcRenderer.invoke('export-manifest', content),
        importManifest: () => ipcRenderer.invoke('import-manifest'),
    })

    console.log('[Preload] ✅ IPC API successfully exposed to window.ipcRenderer');
} catch (error) {
    console.error('[Preload] ❌ Failed to expose IPC API:', error);
}
