import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import fs from 'fs'

process.env.DIST = join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : join(process.env.DIST, '../public')

let win: BrowserWindow | null
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
    win = new BrowserWindow({
        icon: join(process.env.VITE_PUBLIC, 'logo.png'),
        frame: false,
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 700,
        backgroundColor: '#050510',
        webPreferences: {
            preload: join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            webSecurity: false,
        },
    })

    // Window controls IPC
    ipcMain.on('window-control', (_event, action: string) => {
        if (!win) return;
        switch (action) {
            case 'minimize': win.minimize(); break;
            case 'maximize':
                if (win.isMaximized()) { win.unmaximize(); }
                else { win.maximize(); }
                break;
            case 'close': win.close(); break;
        }
    });

    win.webContents.on('console-message', (_event, _level, message, line, sourceId) => {
        console.log(`[Renderer] ${message} (${sourceId}:${line})`);
    });

    win.webContents.openDevTools();

    win.webContents.on('did-finish-load', () => {
        win?.webContents.send('main-process-message', (new Date).toLocaleString())
    })

    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
        console.error(`[Main] Failed to load URL: ${validatedURL} with error: ${errorDescription} (${errorCode})`);
    });

    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL)
    } else {
        win.loadFile(join(process.env.DIST, 'index.html'))
    }
}

// File Selection IPC
ipcMain.handle('select-files', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'Media Files', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'jpg', 'png', 'gif'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    })

    if (canceled) return { canceled: true }

    const files = await Promise.all(filePaths.map(async (path) => {
        const stats = await fs.promises.stat(path)
        return {
            path,
            filename: path.split(/[/\\]/).pop() || path,
            size: stats.size,
            type: getMediaType(path)
        }
    }))
    return { success: true, files }
})

// File Helper
ipcMain.handle('read-file-buffer', async (_event, path: string) => {
    try {
        const stats = await fs.promises.stat(path)
        const MAX_BUFFER_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
        if (stats.size > MAX_BUFFER_SIZE) {
            return { success: false, error: 'File too large', isTooLarge: true }
        }
        const buffer = await fs.promises.readFile(path)
        return { success: true, buffer }
    } catch (e) {
        return { success: false, error: String(e) }
    }
})

function getMediaType(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase()
    if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext || '')) return 'video'
    if (['mp3', 'wav', 'aac', 'flac'].includes(ext || '')) return 'audio'
    return 'image'
}

// Project Persistence
ipcMain.handle('save-project', async (_event, content: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog(win!, {
        filters: [{ name: 'MMM Project', extensions: ['mmm'] }]
    })
    if (canceled || !filePath) return { success: false }
    try {
        await fs.promises.writeFile(filePath, content, 'utf-8')
        return { success: true, filePath }
    } catch (e) {
        return { success: false, error: String(e) }
    }
})

ipcMain.handle('load-project', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
        properties: ['openFile'],
        filters: [{ name: 'MMM Project', extensions: ['mmm'] }]
    })
    if (canceled || filePaths.length === 0) return { canceled: true }
    try {
        const content = await fs.promises.readFile(filePaths[0], 'utf-8')
        return { success: true, content, filePath: filePaths[0] }
    } catch (e) {
        return { success: false, error: String(e) }
    }
})

// Manifest Handlers
ipcMain.handle('export-manifest', async (_event, content: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog(win!, {
        defaultPath: 'manifest.json',
        filters: [{ name: 'JSON Manifest', extensions: ['json'] }]
    })
    if (canceled || !filePath) return { success: false }
    try {
        await fs.promises.writeFile(filePath, content, 'utf-8')
        return { success: true, filePath }
    } catch (e) {
        return { success: false, error: String(e) }
    }
})

ipcMain.handle('import-manifest', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
        properties: ['openFile'],
        filters: [{ name: 'JSON Manifest', extensions: ['json'] }]
    })
    if (canceled || filePaths.length === 0) return { canceled: true }
    try {
        const content = await fs.promises.readFile(filePaths[0], 'utf-8')
        return { success: true, content, filePath: filePaths[0] }
    } catch (e) {
        return { success: false, error: String(e) }
    }
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') { app.quit() }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) { createWindow() }
})

app.whenReady().then(createWindow)
