export interface ElectronAPI {
    selectFiles: (type?: 'video' | 'audio') => Promise<{ success?: boolean; files?: Array<{ path: string; filename: string; size: number; type: string }>; canceled?: boolean }>;
    saveProject: (content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    loadProject: () => Promise<{ success?: boolean; content?: string; filePath?: string; error?: string; canceled?: boolean }>;
    exportManifest: (content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    importManifest: () => Promise<{ success?: boolean; content?: string; filePath?: string; error?: string; canceled?: boolean }>;
    saveManifest: (content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    send: (channel: string, ...args: any[]) => void;

    // Export API
    showExportDialog: (options: any) => Promise<{ canceled: boolean; filePath?: string }>;
    exportProject: (args: { filePath: string; clips: any[]; settings: any }) => Promise<{ success: boolean; error?: string }>;
    onExportProgress: (callback: (progress: number) => void) => () => void;
}

declare global {
    interface Window {
        ipcRenderer: ElectronAPI;
    }
}
