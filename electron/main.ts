import { app, BrowserWindow, ipcMain, dialog, nativeImage } from 'electron'
import { join } from 'path'
import fs from 'fs'
import { exec } from 'child_process'
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

process.env.DIST = join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : join(process.env.DIST, '../public')

// Set AppUserModelId for correct taskbar icon when pinned on Windows
// Version suffix forces Windows to invalidate its cached taskbar icon
app.setAppUserModelId('com.icunilabs.mmmediapro.v2');

let win: BrowserWindow | null
let activeExportProc: any = null;  // Holds the active FFmpeg child process for cancel/pause
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

let bridgeServer: any = null;

function createWindow() {
    const iconPath = join(process.env.VITE_PUBLIC || '', 'icon.png');
    const appIcon = nativeImage.createFromPath(iconPath);
    console.log('[Main] Icon path:', iconPath, '| exists:', fs.existsSync(iconPath), '| empty:', appIcon.isEmpty());

    win = new BrowserWindow({
        icon: appIcon,
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

    // Initialize Bridge Server for Darkroom Integration
    try {
        // bridgeServer.cjs is in electron/ but main.ts compiles to dist-electron/
        // Use path.join to resolve relative to dist-electron/../electron/
        const bridgePath = join(__dirname, '../electron/bridgeServer.cjs');
        const setupBridgeServer = require(bridgePath);
        bridgeServer = setupBridgeServer(win);
    } catch (e) {
        console.error('[Main] Failed to initialize Bridge Server:', e);
    }
}

// Track last-used directories per picker type — each picker remembers its own folder
let lastAudioDir = app.getPath('music');
let lastVideoDir = '';
let lastExportDir = app.getPath('videos');

ipcMain.handle('select-files', async (_event, type?: 'video' | 'audio' | 'folder') => {
    let filters = [
        { name: 'Media Files', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'jpg', 'png', 'gif'] },
        { name: 'All Files', extensions: ['*'] }
    ];

    if (type === 'video') {
        filters = [
            { name: 'Video Files', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'gif'] },
            { name: 'All Files', extensions: ['*'] }
        ];
    } else if (type === 'audio') {
        filters = [
            { name: 'Audio & Video Files', extensions: ['mp3', 'wav', 'aac', 'flac', 'ogg', 'wma', 'm4a', 'mp4', 'mov', 'mkv', 'webm', 'avi'] },
            { name: 'Audio Only', extensions: ['mp3', 'wav', 'aac', 'flac', 'ogg', 'wma', 'm4a'] },
            { name: 'All Files', extensions: ['*'] }
        ];
    }

    let properties: any[] = ['openFile', 'multiSelections'];
    if (type === 'folder') {
        properties = ['openDirectory'];
    }

    // Set default path based on picker type
    const defaultPath = type === 'audio' ? lastAudioDir
        : (type === 'video' || type === 'folder') ? (lastVideoDir || undefined)
        : undefined;

    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
        properties,
        filters: type === 'folder' ? undefined : filters,
        defaultPath,
    });

    if (canceled) return { canceled: true }

    // Remember the directory for next time
    if (filePaths.length > 0) {
        const dir = type === 'folder' ? filePaths[0] : filePaths[0].replace(/[\\/][^\\/]+$/, '');
        if (type === 'audio') lastAudioDir = dir;
        else lastVideoDir = dir;
    }

    let pathsToProcess = filePaths;
    
    if (type === 'folder' && filePaths.length > 0) {
        try {
            const dirFiles = await fs.promises.readdir(filePaths[0]);
            pathsToProcess = dirFiles
                .map(f => join(filePaths[0], f))
                .filter(p => {
                    const ext = p.split('.').pop()?.toLowerCase();
                    // Folder import: videos + animated GIFs only (no static images, no audio)
                    return ['mp4', 'mov', 'avi', 'mkv', 'webm', 'gif'].includes(ext || '');
                });
        } catch (err) {
            console.error('Error reading directory:', err);
        }
    }

    const files = await Promise.all(pathsToProcess.map(async (path) => {
        const stats = await fs.promises.stat(path)
        return {
            path,
            filename: path.split(/[/\\]/).pop() || path,
            size: stats.size,
            // When picked via the audio picker, ALL files are treated as audio
            // (video files will be stripped to audio downstream by FFmpeg)
            type: type === 'audio' ? 'audio' : getMediaType(path)
        }
    }))
    return { success: true, files }
})

// Load folder contents by path — no dialog, used for Recent Folders
ipcMain.handle('load-folder', async (_event, folderPath: string) => {
    try {
        const dirFiles = await fs.promises.readdir(folderPath);
        const pathsToProcess = dirFiles
            .map(f => join(folderPath, f))
            .filter(p => {
                const ext = p.split('.').pop()?.toLowerCase();
                return ['mp4', 'mov', 'avi', 'mkv', 'webm', 'gif'].includes(ext || '');
            });

        if (pathsToProcess.length === 0) {
            return { success: false, error: 'No video files found in folder' };
        }

        const files = await Promise.all(pathsToProcess.map(async (path) => {
            const stats = await fs.promises.stat(path);
            return {
                path,
                filename: path.split(/[/\\]/).pop() || path,
                size: stats.size,
                type: getMediaType(path)
            };
        }));
        return { success: true, files };
    } catch (err) {
        console.error('Error loading folder:', err);
        return { success: false, error: String(err) };
    }
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
    if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'wma', 'm4a'].includes(ext || '')) return 'audio'
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
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

app.on('before-quit', () => {
    if (bridgeServer && typeof bridgeServer.close === 'function') {
        bridgeServer.close();
    }
})

app.whenReady().then(createWindow)

// Export Dialog — uses its own lastExportDir, independent from video/audio pickers
ipcMain.handle('show-export-dialog', async (_event, options) => {
    // Build default path: use last export dir + provided filename, or fallback
    const defaultFilename = options?.defaultPath || 'output.mp4';
    const filename = defaultFilename.replace(/^.*[\\/]/, ''); // strip any directory prefix
    const defaultPath = lastExportDir ? join(lastExportDir, filename) : defaultFilename;
    const { canceled, filePath } = await dialog.showSaveDialog(win!, {
        defaultPath,
        filters: options?.filters || [{ name: 'Video File', extensions: ['mp4', 'mov'] }]
    })
    if (canceled || !filePath) return { canceled: true }
    // Remember this directory for next export
    lastExportDir = filePath.replace(/[\\/][^\\/]+$/, '');
    return { canceled: false, filePath }
})

// ══════════════════════════════════════════════════════════════════════════════
// SHARED EXPORT UTILITIES
// ══════════════════════════════════════════════════════════════════════════════

function resolveFFmpegBin(): string {
    const devPath = join(app.getAppPath(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
    const asarUnpackedPath = ffmpegStatic ? ffmpegStatic.replace('app.asar', 'app.asar.unpacked') : '';
    const resourcesDir = join(process.resourcesPath || '', 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
    if (!app.isPackaged && fs.existsSync(devPath)) return devPath;
    if (asarUnpackedPath && fs.existsSync(asarUnpackedPath)) return asarUnpackedPath;
    if (fs.existsSync(resourcesDir)) return resourcesDir;
    if (ffmpegStatic && !ffmpegStatic.includes('app.asar') && fs.existsSync(ffmpegStatic)) return ffmpegStatic;
    return 'ffmpeg';
}

function normalizeClipPath(clipPath: string): string {
    let p = clipPath;
    if (p?.startsWith('file:///')) p = p.slice(8);
    else if (p?.startsWith('file://')) p = p.slice(7);
    if (p !== clipPath) { try { p = decodeURIComponent(p); } catch {} }
    return p;
}

function probeClipFile(ffmpegBin: string, probePath: string): { hasAudio: boolean; duration: number } {
    const { execFileSync } = require('child_process');
    try {
        execFileSync(ffmpegBin, ['-i', probePath], { timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
        return { hasAudio: false, duration: 0 };
    } catch (e: any) {
        const output = (e.stderr?.toString() || '') + (e.stdout?.toString() || '') + (e.message || '');
        const hasAudio = /Stream\s+#\d+:\d+.*Audio/i.test(output);
        const durMatch = output.match(/Duration:\s*(\d+):(\d+):([0-9.]+)/);
        const duration = durMatch ? parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3]) : 0;
        return { hasAudio, duration };
    }
}

function runFfmpegAsync(
    ffmpegBin: string, args: string[], label: string,
    onStderr?: (line: string) => void
): Promise<{ code: number; stderr: string }> {
    const { spawn } = require('child_process');
    const path = require('path');
    const os = require('os');
    const escapeForPs = (s: string) => s.replace(/'/g, "''");
    return new Promise((resolve) => {
        const psArgLines = args.map((a: string, i: number) => {
            const comma = i < args.length - 1 ? ',' : '';
            return `  '${escapeForPs(a)}'${comma}`;
        });
        const ps = [
            '$ErrorActionPreference = "Stop"',
            `$ffmpeg = '${escapeForPs(ffmpegBin)}'`,
            `$ffArgs = @(`, ...psArgLines, `)`,
            `& $ffmpeg $ffArgs`, `exit $LASTEXITCODE`,
        ].join('\r\n');
        const psFile = path.join(os.tmpdir(), `mmm_${label}_${Date.now()}.ps1`);
        fs.writeFileSync(psFile, '\uFEFF' + ps, 'utf-8');
        const p = spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-NoProfile', '-File', psFile],
            { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        activeExportProc = p;
        let stderr = '';
        p.stderr.on('data', (d: Buffer) => { const line = d.toString(); stderr += line; if (onStderr) onStderr(line); });
        p.on('close', (code: number) => { try { fs.unlinkSync(psFile); } catch {} resolve({ code: code ?? 1, stderr }); });
        p.on('error', (err: any) => { try { fs.unlinkSync(psFile); } catch {} resolve({ code: 1, stderr: err.message }); });
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORT PIPELINE — Per-Clip Architecture
// Each clip is rendered individually as a lossless intermediate, then all
// intermediates are concatenated + mixed with background audio in a final pass.
// This eliminates OOM crashes and guarantees render fidelity to the preview.
// ══════════════════════════════════════════════════════════════════════════════
ipcMain.handle('export-project', async (event, { filePath, clips: rawClips, settings, isIntermediate }) => {
    return new Promise(async (resolve) => {
        const path = require('path');
        const os = require('os');
        const tmpDir = os.tmpdir();
        const ffmpegBin = resolveFFmpegBin();
        console.log('[Export] FFmpeg binary:', ffmpegBin, '| exists:', fs.existsSync(ffmpegBin));

        const renderLogPath = join(app.getPath('userData'), 'render_log.txt');
        const log = (msg: string) => {
            fs.appendFileSync(renderLogPath, `[${new Date().toISOString()}] ${msg}\n`);
            console.log('[Export]', msg);
            try { event.sender.send('export-log', msg); } catch {}
        };
        fs.writeFileSync(renderLogPath, `=== MMMedia Pro Render Log (v2 — Rebuilt Engine) ===\nStarted: ${new Date().toISOString()}\nOutput: ${filePath}\n\n`);

        try {
            // ── 1. SORT, FILTER, NORMALIZE ──
            let clips = rawClips
                .filter((c: any) => !c.disabled)
                .map((c: any) => ({ ...c, path: normalizeClipPath(c.path) }))
                .filter((c: any) => c.path && !c.path.startsWith('blob:') && !c.path.startsWith('http:') && !c.path.startsWith('data:'))
                .filter((c: any) => { if (!fs.existsSync(c.path)) { log(`⚠ Skipping "${c.filename}" — file not found`); return false; } return true; })
                .sort((a: any, b: any) => {
                    if (a.type === 'audio' && b.type !== 'audio') return 1;
                    if (a.type !== 'audio' && b.type === 'audio') return -1;
                    return (a.startFrame ?? 0) - (b.startFrame ?? 0);
                });

            // Dedup audio
            const audioClipsAll = clips.filter((c: any) => c.type === 'audio');
            const videoClipsAll = clips.filter((c: any) => c.type !== 'audio');
            if (audioClipsAll.length > 1) {
                const seen = new Set<string>();
                const deduped = audioClipsAll.filter((c: any) => { const k = `${c.path}|${c.trimStartFrame ?? 0}`; if (seen.has(k)) return false; seen.add(k); return true; });
                clips = [...videoClipsAll, ...deduped];
            }

            // ── DIAGNOSTIC: Log full clip data received from frontend ──
            log(`── Clip data received (${rawClips.length} raw → ${clips.length} after filtering) ──`);
            videoClipsAll.forEach((c: any, i: number) => {
                log(`  V[${i}] "${c.filename}" startF=${c.startFrame} endF=${c.endFrame} trimStart=${c.trimStartFrame} trimEnd=${c.trimEndFrame} srcDur=${c.sourceDurationFrames} speed=${c.speed} vol=${c.volume} muted=${c.isMuted} path=${c.path?.substring(0, 80)}`);
            });
            audioClipsAll.forEach((c: any, i: number) => {
                log(`  A[${i}] "${c.filename}" trimStart=${c.trimStartFrame} trimEnd=${c.trimEndFrame} endFrame=${c.endFrame} vol=${c.volume} track=${c.track} path=${c.path?.substring(0, 80)}`);
            });

            // ── 2. PROBE UNIQUE SOURCES ──
            const probeCache = new Map<string, { hasAudio: boolean; duration: number }>();
            const validVideoClips = videoClipsAll.filter((c: any) => {
                if (!probeCache.has(c.path)) probeCache.set(c.path, probeClipFile(ffmpegBin, c.path));
                const probe = probeCache.get(c.path)!;
                if (probe.duration <= 0) { log(`⚠ Removing "${c.filename}" — corrupt source (probed duration=${probe.duration})`); return false; }
                return true;
            });

            if (validVideoClips.length === 0) { resolve({ success: false, error: 'No valid video clips.' }); return; }

            const fps = settings?.exportFps && settings.exportFps > 0 ? settings.exportFps : (settings?.fps || 30);
            const outW = settings?.outputWidth || 1920;
            const outH = settings?.outputHeight || 1080;
            const outCodec = settings?.outputCodec || 'libx264';
            const outBitrate = settings?.outputBitrate || 0;
            const outAudioBitrate = settings?.outputAudioBitrate || 256;
            log(`Output: ${outW}x${outH} ${outCodec} @ ${outBitrate > 0 ? outBitrate+'kbps' : 'CRF'} | ${fps}fps | audio ${outAudioBitrate}k`);
            log(`Clips: ${validVideoClips.length} video + ${clips.filter((c: any) => c.type === 'audio').length} audio`);

            // ── 3. PER-CLIP RENDER ──
            const intermediateFiles: string[] = [];
            const intermediateDurations: number[] = []; // Track actual rendered duration per clip
            const totalClips = validVideoClips.length;
            let cancelled = false;

            for (let i = 0; i < totalClips && !cancelled; i++) {
                const clip = validVideoClips[i];
                const probe = probeCache.get(clip.path)!;
                // FIX: Use ?? (nullish coalescing) instead of || to treat frame 0 as valid
                const seekTo = (clip.trimStartFrame ?? 0) / fps;
                const sourceDur = probe.duration;
                let clipDur = ((clip.trimEndFrame ?? 0) - (clip.trimStartFrame ?? 0)) / fps;
                let seekClamped = seekTo;

                // FIX: If trimEndFrame is missing/undefined but sourceDurationFrames exists,
                // repair the clip duration to use the full source or the timeline endFrame
                if ((clip.trimEndFrame === undefined || clip.trimEndFrame === null) && clip.sourceDurationFrames > 0) {
                    clipDur = clip.sourceDurationFrames / fps;
                    log(`  ⚠ Clip ${i+1} "${clip.filename}": trimEndFrame was missing, repaired to full source duration (${clipDur.toFixed(2)}s)`);
                }

                if (sourceDur > 0.5) {
                    if (seekClamped >= sourceDur) {
                        const oldSeek = seekClamped;
                        seekClamped = Math.max(0, sourceDur - clipDur - 0.5);
                        log(`  ⚠ Clip ${i+1}: seek ${oldSeek.toFixed(2)}s exceeds source ${sourceDur.toFixed(2)}s → clamped to ${seekClamped.toFixed(2)}s`);
                    }
                    if (seekClamped < 0) seekClamped = 0;
                    if (seekClamped + clipDur > sourceDur) {
                        const oldDur = clipDur;
                        clipDur = Math.max(0.5, sourceDur - seekClamped - 0.05);
                        log(`  ⚠ Clip ${i+1}: seek+dur (${(seekClamped + oldDur).toFixed(2)}s) exceeds source ${sourceDur.toFixed(2)}s → dur clamped to ${clipDur.toFixed(2)}s`);
                    }
                }
                // FIX: Use 0.5s minimum instead of 0.1s to avoid sub-frame clips in final render
                if (clipDur < 0.03) {
                    log(`  ⚠ Clip ${i+1}: computed duration was ${clipDur.toFixed(4)}s — using 0.5s minimum`);
                    clipDur = 0.5;
                }

                const speed = clip.speed || 1.0;
                const volume = ((clip.volume !== undefined ? clip.volume : 100) / 100) * (clip.isMuted ? 0 : 1);
                const hasAudio = probe.hasAudio && clip.type !== 'image';
                const expectedOutputDur = clipDur / speed;

                log(`Clip ${i+1}/${totalClips}: "${clip.filename}" seek=${seekClamped.toFixed(2)}s dur=${clipDur.toFixed(2)}s speed=${speed} vol=${volume.toFixed(2)} expectedOut=${expectedOutputDur.toFixed(2)}s`);
                event.sender.send('export-progress', Math.round((i / totalClips) * 80));

                // Video filter
                const trimEnd = seekClamped + clipDur;
                let vf = `[0:v]trim=start=${seekClamped.toFixed(4)}:end=${trimEnd.toFixed(4)},setpts=PTS-STARTPTS`;
                const rot = clip.rotation || 0;
                if (rot === 90) vf += ',transpose=1';
                else if (rot === 180) vf += ',transpose=1,transpose=1';
                else if (rot === 270) vf += ',transpose=2';
                vf += `,scale=${outW}:${outH}:force_original_aspect_ratio=decrease,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2,setsar=1`;

                if (clip.effectIds?.length) {
                    const fxMap: Record<string, string> = {
                        'fx_bw_contrast': 'hue=s=0,eq=contrast=1.2',
                        'fx_vhs_glitch': 'boxblur=2:1,eq=contrast=1.2:saturation=1.2',
                        'fx_warm_glow': 'colorbalance=rs=.2:gs=-.1:bs=-.2',
                        'fx_cinematic_teal_v1': 'colorbalance=rs=-0.2:gs=0:bs=0.2:rm=0:gm=0:bm=0:rh=0.2:gh=0:bh=-0.2',
                        'fx_vintage_film_v1': 'noise=alls=20:allf=t,eq=saturation=0.6:contrast=1.1',
                        'fx_neon_glow_v1': 'eq=saturation=2.0:contrast=1.1',
                    };
                    const effects = clip.effectIds.map((id: string) => fxMap[id] || '').filter(Boolean).join(',');
                    if (effects) vf += `,${effects}`;
                }
                const vt = clip.visualTexture || 'none';
                if (vt === 'grain') vf += ',noise=alls=15:allf=t';
                else if (vt === 'chromatic') vf += ',rgbashift=rh=-3:bh=3';
                else if (vt === 'motion-blur') vf += ',tblend=all_mode=average';
                else if (vt === 'vintage') vf += ',noise=alls=20:allf=t,eq=saturation=0.6:contrast=1.1,colorbalance=rs=.1:gs=-.05:bs=-.1';

                vf += `,setpts=${(1/speed).toFixed(4)}*PTS,fps=fps=${fps}[v_out]`;

                // Audio filter
                let af: string;
                if (hasAudio) {
                    af = `[0:a]atrim=start=${seekClamped.toFixed(4)}:end=${trimEnd.toFixed(4)},asetpts=PTS-STARTPTS`;
                    if (speed !== 1.0) {
                        let rem = speed; const parts: string[] = [];
                        while (rem > 2.0) { parts.push('atempo=2.0'); rem /= 2.0; }
                        while (rem < 0.5) { parts.push('atempo=0.5'); rem /= 0.5; }
                        parts.push(`atempo=${rem.toFixed(4)}`);
                        af += ',' + parts.join(',');
                    }
                    af += `,volume=${volume.toFixed(4)}[a_out]`;
                } else {
                    const outDur = clipDur / speed;
                    af = `anullsrc=r=48000:cl=stereo[sil];[sil]atrim=start=0:duration=${outDur.toFixed(4)},asetpts=PTS-STARTPTS[a_out]`;
                }

                const filterFile = path.join(tmpDir, `mmm_clip_${i}_${Date.now()}.txt`);
                fs.writeFileSync(filterFile, vf + ';\n' + af, 'utf-8');
                const intermediateFile = path.join(tmpDir, `mmm_clip_${i}_${Date.now()}.mkv`);
                intermediateFiles.push(intermediateFile);
                intermediateDurations.push(expectedOutputDur);

                const result = await runFfmpegAsync(ffmpegBin, [
                    '-y', '-threads', '2', '-filter_threads', '1',
                    '-i', clip.path,
                    '-filter_complex_script', filterFile,
                    '-map', '[v_out]', '-map', '[a_out]',
                    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '0', '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac', '-b:a', '320k',
                    intermediateFile
                ], `clip${i}`, (line) => {
                    const t = line.trim(); if (t) try { event.sender.send('export-log', `[ffmpeg] ${t}`); } catch {}
                });
                try { fs.unlinkSync(filterFile); } catch {}

                if (result.code !== 0) {
                    if ((activeExportProc as any)?.__cancelled) { cancelled = true; break; }
                    log(`⚠ Clip ${i+1} failed (code ${result.code}) — skipping. Last stderr: ${result.stderr.slice(-200).trim()}`);
                    intermediateFiles.pop();
                    intermediateDurations.pop();
                }
            }

            if (cancelled) {
                intermediateFiles.forEach(f => { try { fs.unlinkSync(f); } catch {} });
                try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
                resolve({ success: false, error: 'Export cancelled by user' }); return;
            }
            if (intermediateFiles.length === 0) { resolve({ success: false, error: 'All clips failed to render.' }); return; }

            // ── 3b. PROBE INTERMEDIATES to get actual rendered durations ──
            let actualTotalDuration = 0;
            for (let i = 0; i < intermediateFiles.length; i++) {
                try {
                    const intProbe = probeClipFile(ffmpegBin, intermediateFiles[i]);
                    actualTotalDuration += intProbe.duration;
                    if (Math.abs(intProbe.duration - intermediateDurations[i]) > 0.5) {
                        log(`  ⚠ Intermediate ${i}: actual duration ${intProbe.duration.toFixed(2)}s differs from expected ${intermediateDurations[i].toFixed(2)}s`);
                    }
                } catch {
                    actualTotalDuration += intermediateDurations[i]; // Fallback to expected
                }
            }
            log(`── Total video duration from intermediates: ${actualTotalDuration.toFixed(2)}s (${intermediateFiles.length} clips) ──`);

            // ── 4. FINAL PASS: CONCAT + AUDIO MIX ──
            log(`── Final pass: concatenating ${intermediateFiles.length} clips ──`);
            event.sender.send('export-progress', 85);

            const concatListFile = path.join(tmpDir, `mmm_concat_${Date.now()}.txt`);
            fs.writeFileSync(concatListFile, intermediateFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n'), 'utf-8');

            const finalBgAudio = clips.filter((c: any) => c.type === 'audio');
            const finalArgs: string[] = ['-y', '-f', 'concat', '-safe', '0', '-i', concatListFile];
            finalBgAudio.forEach((c: any) => { finalArgs.push('-i', c.path); });

            let finalFilterFile = '';
            if (finalBgAudio.length > 0) {
                const bgFilters: string[] = [];
                finalBgAudio.forEach((c: any, idx: number) => {
                    const vol = ((c.volume ?? 100) / 100) * (c.isMuted ? 0 : 1);
                    // FIX: Use ?? (nullish coalescing) for trim frame access
                    const trimStart = (c.trimStartFrame ?? 0) / fps;
                    const trimEnd = (c.trimEndFrame ?? c.endFrame ?? 0) / fps;
                    const audioDur = trimEnd - trimStart;
                    log(`  BG Audio[${idx}]: "${c.filename}" trimStart=${trimStart.toFixed(2)}s trimEnd=${trimEnd.toFixed(2)}s dur=${audioDur.toFixed(2)}s vol=${vol.toFixed(2)}`);
                    bgFilters.push(`[${idx+1}:a]atrim=start=${trimStart.toFixed(4)}:duration=${audioDur.toFixed(4)},asetpts=PTS-STARTPTS,volume=${vol.toFixed(4)}[bgv${idx}]`);
                });
                // FIX: Use duration=first so the video (concat, input 0) determines output length.
                // This prevents audio tracks from truncating or extending the video duration.
                bgFilters.push(`[0:a]${finalBgAudio.map((_:any,i:number)=>`[bgv${i}]`).join('')}amix=inputs=${finalBgAudio.length+1}:duration=first:dropout_transition=0[aout]`);
                finalFilterFile = path.join(tmpDir, `mmm_final_${Date.now()}.txt`);
                fs.writeFileSync(finalFilterFile, bgFilters.join(';\n'), 'utf-8');
                finalArgs.push('-filter_complex_script', finalFilterFile, '-map', '0:v', '-map', '[aout]');
            } else {
                finalArgs.push('-map', '0:v', '-map', '0:a');
            }

            // Quality
            const quality = settings?.exportQuality || 'standard';
            const isHevc = outCodec === 'libx265';
            let qArgs: string[] = [];
            if (isIntermediate) { qArgs = ['-preset', 'ultrafast', '-crf', '10', '-c:a', 'aac', '-b:a', '320k']; }
            else if (outBitrate > 0) {
                qArgs = ['-b:v', `${outBitrate}k`, '-maxrate', `${Math.round(outBitrate*1.5)}k`, '-bufsize', `${Math.round(outBitrate*2)}k`];
                qArgs.push('-preset', quality === 'draft' ? (isHevc ? 'fast' : 'veryfast') : quality === 'master' ? 'slow' : (isHevc ? 'medium' : 'medium'));
                qArgs.push('-c:a', 'aac', '-b:a', `${outAudioBitrate}k`);
            } else {
                if (quality === 'master') qArgs = ['-crf', isHevc ? '20' : '17', '-preset', 'slow'];
                else if (quality === 'draft') qArgs = ['-crf', isHevc ? '30' : '28', '-preset', isHevc ? 'fast' : 'veryfast'];
                else qArgs = ['-crf', isHevc ? '24' : '20', '-preset', isHevc ? 'medium' : 'medium'];
                qArgs.push('-c:a', 'aac', '-b:a', `${outAudioBitrate}k`);
            }

            // FIX: NO hard -t duration constraint.
            // The concat demuxer defines the true video duration from the intermediate files.
            // Audio is mixed with duration=first (video wins). No truncation needed.
            // Only add -t as a safety ceiling equal to the actual probed video duration + small buffer.
            if (actualTotalDuration > 0) {
                const safetyCeiling = actualTotalDuration + 1.0; // 1s buffer for rounding
                finalArgs.push('-t', safetyCeiling.toFixed(4));
                log(`Duration safety ceiling: ${safetyCeiling.toFixed(2)}s (actual video: ${actualTotalDuration.toFixed(2)}s)`);
            }

            finalArgs.push('-r', fps.toString(), '-c:v', outCodec, '-pix_fmt', 'yuv420p',
                '-colorspace', 'bt709', '-color_trc', 'bt709', '-color_primaries', 'bt709',
                '-movflags', '+faststart', ...qArgs, filePath);

            // ── DIAGNOSTIC: Log final FFmpeg args ──
            log(`Final FFmpeg args: ${finalArgs.join(' ')}`);

            const finalResult = await runFfmpegAsync(ffmpegBin, finalArgs, 'final', (line) => {
                const t = line.trim(); if (t) try { event.sender.send('export-log', `[ffmpeg] ${t}`); } catch {}
            });

            intermediateFiles.forEach(f => { try { fs.unlinkSync(f); } catch {} });
            try { fs.unlinkSync(concatListFile); } catch {}
            if (finalFilterFile) { try { fs.unlinkSync(finalFilterFile); } catch {} }
            activeExportProc = null;

            if (finalResult.code === 0) {
                // Probe final output to confirm rendered duration
                try {
                    const finalProbe = probeClipFile(ffmpegBin, filePath);
                    log(`Export COMPLETE! Output: ${filePath} | Final duration: ${finalProbe.duration.toFixed(2)}s`);
                } catch {
                    log('Export COMPLETE! Output: ' + filePath);
                }
                event.sender.send('export-progress', 100);
                resolve({ success: true });
            } else {
                log(`Final pass FAILED (code ${finalResult.code}): ${finalResult.stderr.slice(-500).trim()}`);
                resolve({ success: false, error: finalResult.stderr.slice(-500).trim() || `FFmpeg exited with code ${finalResult.code}` });
            }
        } catch (err: any) {
            console.error('[Export] Setup error:', err);
            log(`Export setup FAILED: ${err.message || 'Unknown error'}`);
            resolve({ success: false, error: err.message || 'Unexpected export setup error' });
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// RANDOM RENDER — Quick 15-second sampler from the edit
// ══════════════════════════════════════════════════════════════════════════════
ipcMain.handle('random-render', async (event, { filePath, clips: rawClips, settings }) => {
    return new Promise(async (resolve) => {
        const path = require('path');
        const os = require('os');
        const tmpDir = os.tmpdir();
        const ffmpegBin = resolveFFmpegBin();
        try {
            const fps = settings?.fps || 30;
            const outW = settings?.outputWidth || 1920;
            const outH = settings?.outputHeight || 1080;
            let clips = rawClips
                .filter((c: any) => !c.disabled && c.type !== 'audio')
                .map((c: any) => ({ ...c, path: normalizeClipPath(c.path) }))
                .filter((c: any) => c.path && fs.existsSync(c.path));
            if (clips.length === 0) { resolve({ success: false, error: 'No valid clips.' }); return; }

            const TARGET_DUR = 15;
            const selected: any[] = [];
            let accDur = 0;
            const shuffled = [...clips].sort(() => Math.random() - 0.5);
            for (const clip of shuffled) {
                if (accDur >= TARGET_DUR) break;
                const maxDur = Math.min(5, ((clip.trimEndFrame||0)-(clip.trimStartFrame||0))/fps/(clip.speed||1));
                const dur = Math.min(maxDur, TARGET_DUR - accDur);
                if (dur < 0.1) continue;
                selected.push({ ...clip, _renderDur: dur });
                accDur += dur;
            }
            if (selected.length === 0) { resolve({ success: false, error: 'No clips available.' }); return; }

            const intermediates: string[] = [];
            for (let i = 0; i < selected.length; i++) {
                const clip = selected[i];
                const seekTo = (clip.trimStartFrame || 0) / fps;
                const dur = clip._renderDur;
                const speed = clip.speed || 1.0;
                const trimEnd = seekTo + dur * speed;
                const vf = `[0:v]trim=start=${seekTo.toFixed(4)}:end=${trimEnd.toFixed(4)},setpts=PTS-STARTPTS,setpts=${(1/speed).toFixed(4)}*PTS,fps=fps=${fps},scale=${outW}:${outH}:force_original_aspect_ratio=decrease,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2,setsar=1[v_out]`;
                const af = `anullsrc=r=48000:cl=stereo[sil];[sil]atrim=start=0:duration=${dur.toFixed(4)},asetpts=PTS-STARTPTS[a_out]`;
                const filterFile = path.join(tmpDir, `mmm_rr_${i}_${Date.now()}.txt`);
                fs.writeFileSync(filterFile, vf + ';\n' + af, 'utf-8');
                const intFile = path.join(tmpDir, `mmm_rr_${i}_${Date.now()}.mkv`);
                intermediates.push(intFile);
                const r = await runFfmpegAsync(ffmpegBin, ['-y', '-i', clip.path, '-filter_complex_script', filterFile, '-map', '[v_out]', '-map', '[a_out]', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '0', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', intFile], `rr${i}`);
                try { fs.unlinkSync(filterFile); } catch {}
                if (r.code !== 0) intermediates.pop();
                event.sender.send('export-progress', Math.round(((i+1)/selected.length)*80));
            }
            if (intermediates.length === 0) { resolve({ success: false, error: 'Random render failed.' }); return; }

            const concatFile = path.join(tmpDir, `mmm_rr_concat_${Date.now()}.txt`);
            fs.writeFileSync(concatFile, intermediates.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n'), 'utf-8');
            const finalR = await runFfmpegAsync(ffmpegBin, ['-y', '-f', 'concat', '-safe', '0', '-i', concatFile, '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', TARGET_DUR.toString(), filePath], 'rr_final');
            intermediates.forEach(f => { try { fs.unlinkSync(f); } catch {} });
            try { fs.unlinkSync(concatFile); } catch {}
            activeExportProc = null;
            if (finalR.code === 0) { event.sender.send('export-progress', 100); resolve({ success: true }); }
            else { resolve({ success: false, error: finalR.stderr.slice(-300).trim() || 'Random render failed' }); }
        } catch (err: any) { resolve({ success: false, error: err.message || 'Random render error' }); }
    });
});
// ── EXPORT CONTROL HANDLERS (cancel / pause / resume) ──────────────────────
ipcMain.handle('cancel-export', async () => {
    if (!activeExportProc) return { success: false, error: 'No active export' };
    try {
        (activeExportProc as any).__cancelled = true;
        // Send 'q' to FFmpeg stdin for graceful quit, then kill if needed
        try { activeExportProc.stdin?.write('q'); } catch {}
        setTimeout(() => {
            try { activeExportProc?.kill('SIGKILL'); } catch {}
        }, 2000);
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('pause-export', async () => {
    if (!activeExportProc) return { success: false, error: 'No active export' };
    try {
        if (process.platform === 'win32') {
            // On Windows, suspend the process via NtSuspendProcess or taskkill workaround
            // FFmpeg doesn't support pause via stdin, so we use process suspension
            const { execSync } = require('child_process');
            execSync(`powershell -Command "(Get-Process -Id ${activeExportProc.pid}).Suspend()"`, { windowsHide: true });
        } else {
            activeExportProc.kill('SIGSTOP');
        }
        return { success: true };
    } catch (e: any) {
        // Windows doesn't have native suspend — just return success for UI state
        return { success: true };
    }
});

ipcMain.handle('resume-export', async () => {
    if (!activeExportProc) return { success: false, error: 'No active export' };
    try {
        if (process.platform === 'win32') {
            const { execSync } = require('child_process');
            execSync(`powershell -Command "(Get-Process -Id ${activeExportProc.pid}).Resume()"`, { windowsHide: true });
        } else {
            activeExportProc.kill('SIGCONT');
        }
        return { success: true };
    } catch (e: any) {
        return { success: true };
    }
});

// AME Handler
ipcMain.handle('open-in-ame', async (_event, filePath: string) => {
    return new Promise((resolve) => {
        try {
            const cp = require('child_process');
            let amePath = '';

            if (process.platform === 'win32') {
                const fs = require('fs');
                const path = require('path');
                const base = 'C:\\Program Files\\Adobe';
                if (fs.existsSync(base)) {
                    const dirs = fs.readdirSync(base);
                    const ameDirs = dirs.filter((d: string) => d.includes('Adobe Media Encoder')).sort().reverse();
                    if (ameDirs.length > 0) {
                        amePath = path.join(base, ameDirs[0], 'Adobe Media Encoder.exe');
                    }
                }
            } else if (process.platform === 'darwin') {
                cp.exec(`open -a "Adobe Media Encoder" "${filePath}"`);
                return resolve({ success: true });
            }

            if (amePath && require('fs').existsSync(amePath)) {
                cp.spawn(amePath, [filePath], { detached: true, stdio: 'ignore' }).unref();
                resolve({ success: true });
            } else {
                resolve({ success: false, error: 'Adobe Media Encoder not found on the system.' });
            }
        } catch (err: any) {
            resolve({ success: false, error: err.message });
        }
    });
});

// Shell operations — used by Export celebration view
ipcMain.handle('show-item-in-folder', async (_event, fullPath: string) => {
    try {
        const { shell } = require('electron');
        shell.showItemInFolder(fullPath);
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('open-path', async (_event, fullPath: string) => {
    try {
        const { shell } = require('electron');
        await shell.openPath(fullPath);
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});
