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
        selectFiles: (type) => ipcRenderer.invoke('select-files', type),

        // Persistence & Manifest API
        saveProject: (content) => ipcRenderer.invoke('save-project', content),
        loadProject: () => ipcRenderer.invoke('load-project'),
        exportManifest: (content) => ipcRenderer.invoke('export-manifest', content),
        importManifest: () => ipcRenderer.invoke('import-manifest'),

        // Export API
        showExportDialog: (options) => ipcRenderer.invoke('show-export-dialog', options),
        exportProject: (args) => ipcRenderer.invoke('export-project', args),
        openInAME: (filePath) => ipcRenderer.invoke('open-in-ame', filePath),
        onExportProgress: (callback) => {
            const listener = (_event, progress) => callback(progress);
            ipcRenderer.on('export-progress', listener);
            return () => ipcRenderer.removeListener('export-progress', listener);
        },

        // Bridge API — Darkroom ↔ Pro WebSocket bridge events
        onBridgeClientConnected: (callback) => {
            const listener = (_event, data) => callback(data);
            ipcRenderer.on('bridge-client-connected', listener);
            return () => ipcRenderer.removeListener('bridge-client-connected', listener);
        },
        onBridgeClientDisconnected: (callback) => {
            const listener = (_event, data) => callback(data);
            ipcRenderer.on('bridge-client-disconnected', listener);
            return () => ipcRenderer.removeListener('bridge-client-disconnected', listener);
        },
        onBridgeReceiveClips: (callback) => {
            const listener = (_event, clips) => callback(clips);
            ipcRenderer.on('bridge-receive-clips', listener);
            return () => ipcRenderer.removeListener('bridge-receive-clips', listener);
        },
        onBridgeReceiveMedia: (callback) => {
            const listener = (_event, files) => callback(files);
            ipcRenderer.on('bridge-receive-media', listener);
            return () => ipcRenderer.removeListener('bridge-receive-media', listener);
        },
        onBridgeReceiveProject: (callback) => {
            const listener = (_event, content) => callback(content);
            ipcRenderer.on('bridge-receive-project', listener);
            return () => ipcRenderer.removeListener('bridge-receive-project', listener);
        },
        onBridgeReceiveFolder: (callback) => {
            const listener = (_event, data) => callback(data);
            ipcRenderer.on('bridge-receive-folder', listener);
            return () => ipcRenderer.removeListener('bridge-receive-folder', listener);
        },
    })

    console.log('[Preload] ✅ IPC API successfully exposed to window.ipcRenderer');
} catch (error) {
    console.error('[Preload] ❌ Failed to expose IPC API:', error);
}
