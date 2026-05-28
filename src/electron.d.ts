export interface ElectronAPI {
    selectFiles: (type?: 'video' | 'audio' | 'folder') => Promise<{ success?: boolean; files?: Array<{ path: string; filename: string; size: number; type: string }>; canceled?: boolean }>;
    saveProject: (content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    loadProject: () => Promise<{ success?: boolean; content?: string; filePath?: string; error?: string; canceled?: boolean }>;
    exportManifest: (content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    importManifest: () => Promise<{ success?: boolean; content?: string; filePath?: string; error?: string; canceled?: boolean }>;
    saveManifest: (content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    send: (channel: string, ...args: any[]) => void;
    on: (channel: string, listener: (...args: any[]) => void) => void;
    off: (channel: string, listener: (...args: any[]) => void) => void;
    invoke: (channel: string, ...args: any[]) => Promise<any>;

    // Export API
    showExportDialog: (options: any) => Promise<{ canceled: boolean; filePath?: string }>;
    exportProject: (args: { filePath: string; clips: any[]; settings: any; isIntermediate?: boolean }) => Promise<{ success: boolean; error?: string }>;
    exportProjectMonolithic: (args: { filePath: string; clips: any[]; settings: any; isIntermediate?: boolean }) => Promise<{ success: boolean; error?: string }>;
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
}

declare global {
    interface Window {
        ipcRenderer: ElectronAPI;
    }
}
