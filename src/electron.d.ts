export interface ElectronAPI {
    selectFiles: (type?: 'video' | 'audio' | 'folder') => Promise<{ success?: boolean; files?: Array<{ path: string; filename: string; size: number; type: string }>; canceled?: boolean }>;
    saveProject: (content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    loadProject: () => Promise<{ success?: boolean; content?: string; filePath?: string; error?: string; canceled?: boolean }>;
    exportManifest: (content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    exportIcuniEdit: (content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
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

    // Preview Proxy API
    generatePreviewProxy: (args: { clip: any; settings: any }) => Promise<{ success: boolean; proxyPath?: string; hash?: string; error?: string }>;
    detectSilence: (args: { path: string; noiseDb?: number; minSilenceSec?: number }) => Promise<{ success: boolean; duration?: number; intervals?: Array<{ start: number; end: number }>; trim?: { trimStart: number; trimEnd: number }; error?: string }>;
    detectScenes: (args: { path: string; threshold?: number }) => Promise<{ success: boolean; cuts?: number[]; error?: string }>;
    scoreClip: (args: { path: string }) => Promise<{ success: boolean; motionEnergy?: number; score?: number; error?: string }>;
    generateScopes: (args: { path: string; atSec?: number }) => Promise<{ success: boolean; scopes?: Record<string, string>; error?: string }>;
    listLuts: () => Promise<{ success: boolean; luts?: Array<{ name: string; path: string }>; error?: string }>;
    importLut: () => Promise<{ success: boolean; path?: string; name?: string; canceled?: boolean; error?: string }>;
    invalidatePreviewProxy: (args: { hash: string }) => Promise<{ success: boolean; error?: string }>;
}

declare global {
    interface Window {
        ipcRenderer: ElectronAPI;
    }
}
