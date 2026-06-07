import { ipcRenderer, contextBridge, webUtils } from 'electron'

console.log('[Preload] Script starting to load...');

try {
    contextBridge.exposeInMainWorld('ipcRenderer', {

        // Window controls
        windowControl: (action: 'minimize' | 'maximize' | 'close') => ipcRenderer.send('window-control', action),
        checkFileExists: (filePath: string) => ipcRenderer.invoke('check-file-exists', filePath),

        // File operations
        selectFiles: (type?: string) => ipcRenderer.invoke('select-files', type),
        loadFolder: (folderPath: string) => ipcRenderer.invoke('load-folder', folderPath),
        readFileBuffer: (path: string) => ipcRenderer.invoke('read-file-buffer', path),

        // Persistence & Manifest API
        saveProject: (content: string) => ipcRenderer.invoke('save-project', content),
        loadProject: () => ipcRenderer.invoke('load-project'),
        exportManifest: (content: string) => ipcRenderer.invoke('export-manifest', content),
        saveManifest: (content: string) => ipcRenderer.invoke('export-manifest', content),
        importManifest: () => ipcRenderer.invoke('import-manifest'),

        // Export API
        showExportDialog: (options: any) => ipcRenderer.invoke('show-export-dialog', options),
        exportProject: (args: { filePath: string, clips: any[], settings: any, isIntermediate?: boolean }) => ipcRenderer.invoke('export-project', args),
        exportProjectMonolithic: (args: { filePath: string, clips: any[], settings: any, isIntermediate?: boolean }) => ipcRenderer.invoke('export-project-monolithic', args),
        randomRender: (args: { filePath: string, clips: any[], settings: any }) => ipcRenderer.invoke('random-render', args),
        analyzeRenderParity: (args: { clips: any[], settings: any }) => ipcRenderer.invoke('analyze-render-parity', args),
        cancelExport: () => ipcRenderer.invoke('cancel-export'),
        pauseExport: () => ipcRenderer.invoke('pause-export'),
        resumeExport: () => ipcRenderer.invoke('resume-export'),
        openInAME: (filePath: string) => ipcRenderer.invoke('open-in-ame', filePath),
        onExportProgress: (callback: (progress: number) => void) => {
            const listener = (_event: any, progress: number) => callback(progress);
            ipcRenderer.on('export-progress', listener);
            return () => ipcRenderer.removeListener('export-progress', listener);
        },
        onExportLog: (callback: (msg: string) => void) => {
            const listener = (_event: any, msg: string) => callback(msg);
            ipcRenderer.on('export-log', listener);
            return () => ipcRenderer.removeListener('export-log', listener);
        },

        // Bridge Events
        onBridgeClientConnected: (callback: (data: any) => void) => {
            const listener = (_event: any, data: any) => callback(data);
            ipcRenderer.on('bridge-client-connected', listener);
            return () => ipcRenderer.removeListener('bridge-client-connected', listener);
        },
        onBridgeClientDisconnected: (callback: (data: any) => void) => {
            const listener = (_event: any, data: any) => callback(data);
            ipcRenderer.on('bridge-client-disconnected', listener);
            return () => ipcRenderer.removeListener('bridge-client-disconnected', listener);
        },
        onBridgeReceiveClips: (callback: (clips: any[]) => void) => {
            const listener = (_event: any, clips: any[]) => callback(clips);
            ipcRenderer.on('bridge-receive-clips', listener);
            return () => ipcRenderer.removeListener('bridge-receive-clips', listener);
        },
        onBridgeReceiveMedia: (callback: (files: any[]) => void) => {
            const listener = (_event: any, files: any[]) => callback(files);
            ipcRenderer.on('bridge-receive-media', listener);
            return () => ipcRenderer.removeListener('bridge-receive-media', listener);
        },
        onBridgeReceiveProject: (callback: (content: string) => void) => {
            const listener = (_event: any, content: string) => callback(content);
            ipcRenderer.on('bridge-receive-project', listener);
            return () => ipcRenderer.removeListener('bridge-receive-project', listener);
        },
        onBridgeReceiveFolder: (callback: (data: { folderPath: string; files: any[] }) => void) => {
            const listener = (_event: any, data: any) => callback(data);
            ipcRenderer.on('bridge-receive-folder', listener);
            return () => ipcRenderer.removeListener('bridge-receive-folder', listener);
        },

        // Shell operations
        showItemInFolder: (fullPath: string) => ipcRenderer.invoke('show-item-in-folder', fullPath),
        openPath: (fullPath: string) => ipcRenderer.invoke('open-path', fullPath),

        // File path resolution (Electron 29+ — replaces deprecated File.path)
        getPathForFile: (file: File) => {
            try { return webUtils.getPathForFile(file); }
            catch { return ''; }
        },
    })

    console.log('[Preload] ✅ IPC API successfully exposed to window.ipcRenderer');
} catch (error) {
    console.error('[Preload] ❌ Failed to expose IPC API:', error);
}
