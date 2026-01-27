export interface ElectronAPI {
    selectFiles: () => Promise<{ success?: boolean; files?: Array<{ path: string; filename: string; size: number; type: string }>; canceled?: boolean }>;
    saveProject: (content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    loadProject: () => Promise<{ success?: boolean; content?: string; filePath?: string; error?: string; canceled?: boolean }>;
    exportManifest: (content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    exportManifest: (content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    importManifest: () => Promise<{ success?: boolean; content?: string; filePath?: string; error?: string; canceled?: boolean }>;
    send: (channel: string, ...args: any[]) => void;
}

declare global {
    interface Window {
        ipcRenderer: ElectronAPI;
    }
}
