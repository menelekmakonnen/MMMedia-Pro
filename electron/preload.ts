import { ipcRenderer, contextBridge } from 'electron'

console.log('[Preload] Script starting to load...');

try {
    contextBridge.exposeInMainWorld('ipcRenderer', {
        on(...args: Parameters<typeof ipcRenderer.on>) {
            const [channel, listener] = args
            return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
        },
        off(...args: Parameters<typeof ipcRenderer.off>) {
            const [channel, ...omit] = args
            return ipcRenderer.off(channel, ...omit)
        },
        send(...args: Parameters<typeof ipcRenderer.send>) {
            const [channel, ...omit] = args
            return ipcRenderer.send(channel, ...omit)
        },
        invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
            const [channel, ...omit] = args
            return ipcRenderer.invoke(channel, ...omit)
        },

        // File operations
        selectFiles: () => ipcRenderer.invoke('select-files'),
        readFileBuffer: (path: string) => ipcRenderer.invoke('read-file-buffer', path),

        // Persistence & Manifest API
        saveProject: (content: string) => ipcRenderer.invoke('save-project', content),
        loadProject: () => ipcRenderer.invoke('load-project'),
        exportManifest: (content: string) => ipcRenderer.invoke('export-manifest', content),
        importManifest: () => ipcRenderer.invoke('import-manifest'),
    })

    console.log('[Preload] ✅ IPC API successfully exposed to window.ipcRenderer');
} catch (error) {
    console.error('[Preload] ❌ Failed to expose IPC API:', error);
}
