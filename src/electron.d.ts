export interface ElectronAPI {\r
    selectFiles: (type?: 'video' | 'audio' | 'folder') => Promise<{ success?: boolean; files?: Array<{ path: string; filename: string; size: number; type: string }>; canceled?: boolean }>;\r
    saveProject: (content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;\r
    loadProject: () => Promise<{ success?: boolean; content?: string; filePath?: string; error?: string; canceled?: boolean }>;\r
    exportManifest: (content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;\r
    importManifest: () => Promise<{ success?: boolean; content?: string; filePath?: string; error?: string; canceled?: boolean }>;\r
    saveManifest: (content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;\r
    send: (channel: string, ...args: any[]) => void;\r
    on: (channel: string, listener: (...args: any[]) => void) => void;\r
    off: (channel: string, listener: (...args: any[]) => void) => void;\r
    invoke: (channel: string, ...args: any[]) => Promise<any>;\r
\r
    // Export API\r
    showExportDialog: (options: any) => Promise<{ canceled: boolean; filePath?: string }>;\r
    exportProject: (args: { filePath: string; clips: any[]; settings: any; isIntermediate?: boolean }) => Promise<{ success: boolean; error?: string }>;\r
    openInAME: (filePath: string) => Promise<{ success: boolean; error?: string }>;\r
    onExportProgress: (callback: (progress: number) => void) => () => void;\r
\r
    // Bridge API — Darkroom ↔ Pro WebSocket events\r
    onBridgeClientConnected: (callback: (data: { address: string; clientCount: number }) => void) => () => void;\r
    onBridgeClientDisconnected: (callback: (data: { clientCount: number }) => void) => () => void;\r
    onBridgeReceiveClips: (callback: (clips: any[]) => void) => () => void;\r
    onBridgeReceiveMedia: (callback: (files: any[]) => void) => () => void;\r
    onBridgeReceiveProject: (callback: (content: string) => void) => () => void;\r
    onBridgeReceiveFolder: (callback: (data: { folderPath: string; files: Array<{ name: string; path: string; type: string; size: number; duration?: number; width?: number; height?: number }> }) => void) => () => void;\r
}\r
\r
declare global {\r
    interface Window {\r
        ipcRenderer: ElectronAPI;\r
    }\r
}\r
