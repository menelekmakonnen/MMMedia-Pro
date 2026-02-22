import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import fs from 'fs'
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

process.env.DIST = join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : join(process.env.DIST, '../public')

let win: BrowserWindow | null
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
    win = new BrowserWindow({
        icon: join(process.env.VITE_PUBLIC || '', 'logo.png'),
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
        win.loadFile(join(process.env.DIST || '', 'index.html'))
    }
}

// File Selection IPC
ipcMain.handle('select-files', async (_event, type?: 'video' | 'audio') => {
    let filters = [
        { name: 'Media Files', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'jpg', 'png', 'gif'] },
        { name: 'All Files', extensions: ['*'] }
    ];

    if (type === 'video') {
        filters = [
            { name: 'Video Files', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] },
            { name: 'All Files', extensions: ['*'] }
        ];
    } else if (type === 'audio') {
        filters = [
            { name: 'Audio Files', extensions: ['mp3', 'wav', 'aac', 'flac'] },
            { name: 'All Files', extensions: ['*'] }
        ];
    }

    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
        properties: ['openFile', 'multiSelections'],
        filters
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

// Export Dialog
ipcMain.handle('show-export-dialog', async (_event, options) => {
    const { canceled, filePath } = await dialog.showSaveDialog(win!, {
        defaultPath: options?.defaultPath || 'output.mp4',
        filters: options?.filters || [{ name: 'Video File', extensions: ['mp4', 'mov'] }]
    })
    if (canceled || !filePath) return { canceled: true }
    return { canceled: false, filePath }
})

// FFmpeg Export Handler
ipcMain.handle('export-project', async (event, { filePath, clips, settings }) => {
    return new Promise((resolve, reject) => {
        // Set FFmpeg path
        // @ts-ignore: ffmpeg-static might differ in types
        const binaryPath = ffmpegStatic?.replace('app.asar', 'app.asar.unpacked');
        if (binaryPath) {
            ffmpeg.setFfmpegPath(binaryPath);
        } else {
            console.warn('FFmpeg static binary not found, relying on system PATH');
        }

        const command = ffmpeg();

        let filterComplex: string[] = [];
        let inputCount = 0;

        // Add inputs and build filtergraph
        clips.forEach((clip: any, index: number) => {
            command.input(clip.path);

            // Calculate trim points in seconds
            const fps = settings?.fps || 30; // Global project FPS
            const trimStart = clip.trimStartFrame / fps;
            const duration = (clip.trimEndFrame - clip.trimStartFrame) / fps;

            let speed = clip.speed || 1.0;
            // MVP: Approximate speed ramps with constant speed overrides
            if (clip.speedRampId) {
                if (clip.speedRampId.includes('slow')) speed = 0.5;
                else if (clip.speedRampId.includes('fast') || clip.speedRampId.includes('speed_up')) speed = 2.0;
                else if (clip.speedRampId.includes('bullet')) speed = 0.25;
            }

            // Input label
            const vIn = `${index}:v`;
            const aIn = `${index}:a`;

            // Output labels for this clip's segment
            const vOut = `v${index}`;
            const aOut = `a${index}`;

            // Scale Filter
            const scaleFilter = `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1`;

            // Base Filter Chain: Trim -> Reset PTS -> Scale
            let videoFilters = `trim=start=${trimStart}:duration=${duration},setpts=PTS-STARTPTS,${scaleFilter}`;

            // Add Effects
            const getEffectFilter = (id: string) => {
                switch (id) {
                    case 'fx_bw_contrast': return 'hue=s=0,eq=contrast=1.2';
                    case 'fx_vhs_glitch': return 'boxblur=2:1,eq=contrast=1.2:saturation=1.2';
                    case 'fx_warm_glow': return 'colorbalance=rs=.2:gs=-.1:bs=-.2';
                    case 'fx_cinematic_teal_v1': return 'colorbalance=rs=-0.2:gs=0:bs=0.2:rm=0:gm=0:bm=0:rh=0.2:gh=0:bh=-0.2';
                    case 'fx_vintage_film_v1': return 'noise=alls=20:allf=t,eq=saturation=0.6:contrast=1.1';
                    case 'fx_neon_glow_v1': return 'eq=saturation=2.0:contrast=1.1';
                    default: return '';
                }
            };

            if (clip.effectIds && clip.effectIds.length > 0) {
                const effects = clip.effectIds.map(getEffectFilter).filter((f: string) => f).join(',');
                if (effects) videoFilters += `,${effects}`;
            }

            // Apply Speed to Video (PTS)
            // Speed factor for video is 1/speed regarding presentation timestamp
            const ptsFilter = `setpts=${(1 / speed).toFixed(4)}*PTS`;
            videoFilters += `,${ptsFilter}`;

            filterComplex.push(
                `[${vIn}]${videoFilters}[${vOut}]`
            );

            // Audio Filter Chain
            // 1. atrim
            // 2. asetpts
            // 3. atempo (speed)
            // 4. volume

            const audioSpeed = speed;
            let atempoFilter = '';
            if (audioSpeed !== 1.0) {
                if (audioSpeed < 0.5 || audioSpeed > 2.0) {
                    // MVP Limitation: Warning or clamp handling needed for extreme speeds
                    // For now, we trust user keeps it reasonable or ffmpeg errors out
                    atempoFilter = `,atempo=${audioSpeed}`;
                } else {
                    atempoFilter = `,atempo=${audioSpeed}`;
                }
            }

            const volume = (clip.volume !== undefined ? clip.volume : 100) / 100;
            const mute = clip.isMuted ? 0 : 1;
            const finalVolume = volume * mute;

            filterComplex.push(
                `[${aIn}]atrim=start=${trimStart}:duration=${duration},asetpts=PTS-STARTPTS${atempoFilter},volume=${finalVolume}[${aOut}]`
            );

            inputCount++;
        });

        // Concat Filter
        const vInputs = Array.from({ length: inputCount }, (_, i) => `[v${i}]`).join('');
        const aInputs = Array.from({ length: inputCount }, (_, i) => `[a${i}]`).join('');

        filterComplex.push(
            `${vInputs}${aInputs}concat=n=${inputCount}:v=1:a=1[outv][outa]`
        );

        command
            .complexFilter(filterComplex)
            .outputOptions([
                '-map [outv]',
                '-map [outa]',
                '-c:v libx264',
                '-preset fast',
                '-crf 23',
                '-c:a aac',
                '-b:a 128k',
                '-pix_fmt yuv420p',
                '-movflags +faststart'
            ])
            .on('start', (cmdLine) => {
                console.log('FFmpeg command:', cmdLine);
            })
            .on('progress', (progress) => {
                if (progress.percent) {
                    event.sender.send('export-progress', Math.round(progress.percent));
                }
            })
            .on('end', () => {
                event.sender.send('export-progress', 100);
                resolve({ success: true });
            })
            .on('error', (err) => {
                console.error('Export error:', err);
                event.sender.send('export-error', err.message);
                reject({ success: false, error: err.message });
            })
            .save(filePath);
    });
});
