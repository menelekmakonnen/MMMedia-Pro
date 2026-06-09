export interface ElectronAPI {
    selectFiles: (type?: 'video' | 'audio' | 'folder') => Promise<{ success?: boolean; files?: Array<{ path: string; filename: string; size: number; type: string }>; canceled?: boolean }>;
    saveProject: (content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    loadProject: () => Promise<{ success?: boolean; content?: string; filePath?: string; error?: string; canceled?: boolean }>;
    exportManifest: (content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    importManifest: () => Promise<{ success?: boolean; content?: string; filePath?: string; error?: string; canceled?: boolean }>;
    saveManifest: (content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    // Window controls
    windowControl: (action: 'minimize' | 'maximize' | 'close') => void;
    checkFileExists: (filePath: string) => Promise<{ exists: boolean }>;

    // Export API
    showExportDialog: (options: any) => Promise<{ canceled: boolean; filePath?: string }>;
    exportProject: (args: { filePath: string; clips: any[]; settings: any; isIntermediate?: boolean }) => Promise<{ success: boolean; error?: string }>;
    exportProjectMonolithic: (args: { filePath: string; clips: any[]; settings: any; isIntermediate?: boolean }) => Promise<{ success: boolean; error?: string }>;
    exportProjectSegment: (args: { filePath: string; clips: any[]; settings: any }) => Promise<{ success: boolean; error?: string }>;
    analyzeRenderParity: (args: { clips: any[]; settings: any }) => Promise<{ ok: boolean; warnings: { level: 'warning' | 'info'; message: string }[] }>;
    cancelExport: () => Promise<{ success: boolean; error?: string }>;
    pauseExport: () => Promise<{ success: boolean; error?: string }>;
    resumeExport: () => Promise<{ success: boolean; error?: string }>;
    openInAME: (filePath: string) => Promise<{ success: boolean; error?: string }>;
    onExportProgress: (callback: (progress: number) => void) => () => void;
    onExportLog: (callback: (msg: string) => void) => () => void;

    // Bridge API
    onBridgeClientConnected: (callback: (data: { address: string; clientCount: number }) => void) => () => void;
    onBridgeClientDisconnected: (callback: (data: { clientCount: number }) => void) => () => void;
    onBridgeReceiveClips: (callback: (clips: any[]) => void) => () => void;
    onBridgeReceiveMedia: (callback: (files: any[]) => void) => () => void;
    onBridgeReceiveProject: (callback: (content: string) => void) => () => void;
    onBridgeReceiveFolder: (callback: (data: { folderPath: string; files: Array<{ name: string; path: string; type: string; size: number; duration?: number; width?: number; height?: number }> }) => void) => () => void;

    // Shell operations
    showItemInFolder: (fullPath: string) => Promise<{ success: boolean; error?: string }>;
    openPath: (fullPath: string) => Promise<{ success: boolean; error?: string }>;

    // File path resolution
    getPathForFile: (file: File) => string;

    // File reading (binary buffer for audio/waveform analysis)
    readFileBuffer: (filePath: string) => Promise<{ success: boolean; buffer?: Uint8Array; error?: string }>;
}

declare global {
    interface Window {
        ipcRenderer: ElectronAPI;
    }
}
