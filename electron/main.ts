import { app, BrowserWindow, ipcMain, dialog, nativeImage } from 'electron'
import { join } from 'path'
import fs from 'fs'
import { exec } from 'child_process'
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { resolveEffectFilter, getUnexportableEffects } from './effectCompiler';
import { buildAtempoChain, shouldUseIntermediateForReverse, buildVideoFilter, buildClipAudioFilter, computeClipTiming } from './filterBuilder';
import { buildDoubleExposureGraph } from '../src/lib/editEffectFilters';
import { getTransitionFFmpegName, isApproximatedTransition } from '../src/lib/transitions';
import { getGridLayout } from '../src/lib/gridTemplates';
import type { GridCellLayout } from '../src/lib/gridTemplates';

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
            webSecurity: app.isPackaged,
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

    if (process.argv.includes('--dev') || !app.isPackaged) {
        win.webContents.openDevTools();
    }

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
        // Return as plain Uint8Array — Node Buffer doesn't always survive IPC structured clone
        return { success: true, buffer: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength) }
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

// ICUNI Edit — the shared interchange consumed by Edia (ChaosEdit / Premiere bridge).
ipcMain.handle('export-icuni-edit', async (_event, content: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog(win!, {
        defaultPath: 'edit.icuni.json',
        filters: [{ name: 'ICUNI Edit', extensions: ['json'] }]
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

// Cache of FFmpeg's available encoder list (queried once per app run).
let _encoderListCache: string | null = null;
function getAvailableEncoders(ffmpegBin: string): string {
    if (_encoderListCache !== null) return _encoderListCache;
    try {
        const { execFileSync } = require('child_process');
        _encoderListCache = execFileSync(ffmpegBin, ['-hide_banner', '-encoders'], {
            timeout: 10000, windowsHide: true, encoding: 'utf-8',
        }) as string;
    } catch {
        _encoderListCache = '';
    }
    return _encoderListCache;
}

/**
 * Resolve the actual video encoder to use. When GPU encoding is requested,
 * map the CPU codec to its NVENC equivalent IF FFmpeg reports it available,
 * otherwise transparently fall back to the CPU codec.
 */
function resolveVideoEncoder(
    ffmpegBin: string,
    requestedCodec: string,
    useGpu: boolean,
    log?: (m: string) => void,
): string {
    if (!useGpu) return requestedCodec;
    const gpuMap: Record<string, string> = {
        libx264: 'h264_nvenc',
        libx265: 'hevc_nvenc',
        h264: 'h264_nvenc',
        hevc: 'hevc_nvenc',
    };
    const target = gpuMap[requestedCodec];
    if (!target) {
        log?.(`GPU requested but no NVENC mapping for "${requestedCodec}" — using CPU.`);
        return requestedCodec;
    }
    const encoders = getAvailableEncoders(ffmpegBin);
    if (encoders.includes(target)) {
        log?.(`GPU encoding enabled: ${requestedCodec} → ${target}`);
        return target;
    }
    log?.(`GPU encoder "${target}" not available on this system — falling back to ${requestedCodec}.`);
    return requestedCodec;
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
// RENDER-PARITY ANALYSIS
// Scans the timeline for anything the exporter cannot (or will not) honour and
// returns a list of human-readable warnings so the UI can show "what you see is
// what you get" issues BEFORE a long render starts.
// ══════════════════════════════════════════════════════════════════════════════
ipcMain.handle('analyze-render-parity', async (_event, { clips: rawClips, settings }) => {
    const warnings: { level: 'warning' | 'info'; message: string }[] = [];
    try {
        const fps = settings?.fps || 30;
        const clips = (rawClips || []).filter((c: any) => !c.disabled);
        const videoClips = clips.filter((c: any) => c.type !== 'audio');

        // 1. Missing / non-file media
        let missing = 0;
        for (const c of clips) {
            const p = normalizeClipPath(c.path || '');
            if (!p || p.startsWith('blob:') || p.startsWith('http:') || p.startsWith('data:')) { missing++; continue; }
            if (!fs.existsSync(p)) missing++;
        }
        if (missing > 0) warnings.push({ level: 'warning', message: `${missing} clip(s) reference missing or non-file media — they will be skipped and appear as gaps.` });

        // 2. Effects that cannot be exported
        const unexportable = new Set<string>();
        for (const c of videoClips) for (const id of (c.effectIds || [])) {
            getUnexportableEffects([id]).forEach((e) => unexportable.add(e));
        }
        if (unexportable.size > 0) warnings.push({ level: 'warning', message: `${unexportable.size} effect(s) are preview-only and won't render: ${[...unexportable].join(', ')}.` });

        // 3. Sub-frame clips (too short to produce a single output frame)
        const subFrame = videoClips.filter((c: any) => {
            const speed = c.speed || 1;
            const out = (((c.endFrame ?? 0) - (c.startFrame ?? 0)) / fps);
            return out > 0 && out < (1 / fps) / speed;
        }).length;
        if (subFrame > 0) warnings.push({ level: 'info', message: `${subFrame} clip(s) are shorter than one frame and will be dropped.` });

        // 4. Transition viability (monolithic only)
        const strategy = settings?.transitionStrategy || 'cut';
        if (strategy !== 'cut') {
            const reqDur = typeof settings?.transitionDurationSec === 'number' ? settings.transitionDurationSec : 0.5;
            const minDur = Math.min(...videoClips.map((c: any) => (((c.endFrame ?? 0) - (c.startFrame ?? 0)) / fps) / (c.speed || 1)).filter((d: number) => d > 0));
            if (isFinite(minDur) && reqDur * 0.4 > minDur * 0.4 && minDur * 0.4 < (1 / fps)) {
                warnings.push({ level: 'info', message: `Clips are too short for a ${reqDur}s ${strategy} — transitions will fall back to hard cuts.` });
            }
            warnings.push({ level: 'info', message: `Transitions (${strategy}) apply with the Segment (default) and Monolithic engines; the Per-Clip engine renders hard cuts.` });
        }

        // Per-clip "impact" transitions render via the closest native xfade look.
        const approx = new Set<string>();
        for (const c of videoClips) {
            const t = c.transition?.type;
            if (t && isApproximatedTransition(t)) approx.add(t);
        }
        if (approx.size > 0) warnings.push({ level: 'info', message: `${[...approx].join(', ')} transition(s) are rendered as their closest built-in equivalent (flash→fade-white, zoom-through→zoom-in, etc.).` });

        // 5. Long reversed clips (memory heavy in monolithic)
        const longReversed = videoClips.filter((c: any) => c.reversed && (((c.endFrame ?? 0) - (c.startFrame ?? 0)) / fps) > 5).length;
        if (longReversed > 0) warnings.push({ level: 'info', message: `${longReversed} reversed clip(s) are >5s — these use a slower two-pass reverse.` });

        return { ok: warnings.length === 0, warnings };
    } catch (err: any) {
        return { ok: false, warnings: [{ level: 'warning', message: `Parity analysis failed: ${err?.message || 'unknown error'}` }] };
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GRID CLIP COMPOSITOR
// Renders a grid clip (multiple cells, each with their own sub-clips) into a
// single composited intermediate file. Each cell is rendered independently,
// then overlaid onto a black background at the correct position.
// ══════════════════════════════════════════════════════════════════════════════

interface RenderGridOpts {
    outW: number;
    outH: number;
    fps: number;
    projectFps: number;
    es: any; // ExportSettings-like object passed to buildVideoFilter
}

async function renderGridClip(
    grid: any,
    opts: RenderGridOpts,
    ffmpegBin: string,
    tmpDir: string,
    log: (msg: string) => void
): Promise<string | null> {
    const path = require('path');
    const { outW, outH, fps, projectFps, es } = opts;
    const gridDuration = ((grid.endFrame ?? 0) - (grid.startFrame ?? 0)) / projectFps;
    if (gridDuration <= 0) { log('  ⚠ Grid has zero duration'); return null; }

    const cells: any[] = grid.cells || [];
    const layout: GridCellLayout[] = getGridLayout(grid.numCells || cells.length, grid.gridFormat || 'square');
    const cellIntermediates: { file: string; cellIdx: number; layoutCell: GridCellLayout }[] = [];
    const cellCleanup: string[] = []; // Track cell-level intermediates for cleanup

    for (let ci = 0; ci < cells.length; ci++) {
        const cell = cells[ci];
        const cellClips: any[] = (cell.clips && cell.clips.length > 0) ? cell.clips : (cell.clip ? [cell.clip] : []);
        if (cellClips.length === 0) {
            log(`  Cell ${ci}: empty — skipping`);
            continue;
        }
        // Filter out clips with invalid paths
        const validClips = cellClips.filter((c: any) => {
            const p = normalizeClipPath(c.path || '');
            if (!p || p.startsWith('blob:') || p.startsWith('http:') || p.startsWith('data:')) return false;
            if (!fs.existsSync(p)) { log(`  Cell ${ci}: skip sub-clip "${c.filename}" — file not found`); return false; }
            return true;
        }).map((c: any) => ({ ...c, path: normalizeClipPath(c.path) }));

        if (validClips.length === 0) {
            log(`  Cell ${ci}: no valid sub-clips after filtering — skipping`);
            continue;
        }

        const cellLayout = ci < layout.length ? layout[ci] : layout[layout.length - 1];
        const cellW = Math.max(2, Math.round(outW * cellLayout.width));
        const cellH = Math.max(2, Math.round(outH * cellLayout.height));
        // FFmpeg requires even dimensions
        const cellWEven = cellW % 2 === 0 ? cellW : cellW + 1;
        const cellHEven = cellH % 2 === 0 ? cellH : cellH + 1;

        // Build cell-level ExportSettings with the cell's proportional resolution
        const cellEs = { ...es, width: cellWEven, height: cellHEven };

        // Render each sub-clip in this cell
        const subIntFiles: string[] = [];
        for (let si = 0; si < validClips.length; si++) {
            const subClip = validClips[si];
            const isImage = subClip.type === 'image';
            try {
                let probeSub: { hasAudio: boolean; duration: number };
                try { probeSub = probeClipFile(ffmpegBin, subClip.path); } catch { probeSub = { hasAudio: false, duration: 0 }; }
                if (!isImage && probeSub.duration <= 0) { log(`  Cell ${ci} sub-clip ${si}: corrupt source — skipping`); continue; }

                const probeData = { width: subClip.width || cellWEven, height: subClip.height || cellHEven, duration: isImage ? 36000 : probeSub.duration };
                const timing = computeClipTiming(subClip, cellEs, probeData);
                const vf = buildVideoFilter(subClip, cellEs, probeData, { preSeeked: true });
                const af = buildClipAudioFilter(subClip, cellEs, probeData, { preSeeked: true });
                const hasAudio = probeSub.hasAudio && !isImage;
                const subIntFile = path.join(tmpDir, `mmm_grid_c${ci}_s${si}_${Date.now()}.mkv`);

                const inputs: string[] = isImage
                    ? ['-loop', '1', '-t', (timing.srcDurSec + 0.1).toFixed(4), '-i', subClip.path]
                    : ['-ss', timing.seekSec.toFixed(4), '-i', subClip.path];
                let fc: string, vmap: string, amap: string;
                if (hasAudio) {
                    fc = `[0:v]${vf}[v];[0:a]${af}[a]`; vmap = '[v]'; amap = '[a]';
                } else {
                    inputs.push('-f', 'lavfi', '-t', (timing.outDurSec + 0.25).toFixed(4), '-i', 'anullsrc=r=48000:cl=stereo');
                    fc = `[0:v]${vf}[v]`; vmap = '[v]'; amap = '1:a';
                }
                const subArgs = ['-y', ...inputs, '-filter_complex', fc, '-map', vmap, '-map', amap,
                    '-t', timing.outDurSec.toFixed(4), '-r', String(fps),
                    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '15', '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2', subIntFile];

                const r = await runFfmpegAsync(ffmpegBin, subArgs, `grid_c${ci}_s${si}`, () => {});
                if (r.code !== 0 || !fs.existsSync(subIntFile)) {
                    log(`  Cell ${ci} sub-clip ${si} "${subClip.filename}" failed: ${r.stderr.slice(-150).trim()}`);
                    continue;
                }
                subIntFiles.push(subIntFile);
                cellCleanup.push(subIntFile);
                log(`  Cell ${ci} sub-clip ${si}: "${subClip.filename}" rendered (${cellWEven}x${cellHEven})`);
            } catch (subErr: any) {
                log(`  Cell ${ci} sub-clip ${si} error: ${subErr?.message || subErr}`);
            }
        }

        if (subIntFiles.length === 0) {
            log(`  Cell ${ci}: all sub-clips failed — skipping`);
            continue;
        }

        // If a cell has multiple sub-clips, concat them together
        let cellFile: string;
        if (subIntFiles.length === 1) {
            cellFile = subIntFiles[0];
        } else {
            cellFile = path.join(tmpDir, `mmm_grid_cell${ci}_${Date.now()}.mkv`);
            const concatInputs: string[] = [];
            subIntFiles.forEach(f => { concatInputs.push('-i', f); });
            const pairs = subIntFiles.map((_: string, k: number) => `[${k}:v][${k}:a]`).join('');
            const concatFc = `${pairs}concat=n=${subIntFiles.length}:v=1:a=1[cv][ca]`;
            const concatArgs = ['-y', ...concatInputs, '-filter_complex', concatFc, '-map', '[cv]', '-map', '[ca]',
                '-t', gridDuration.toFixed(4), '-r', String(fps),
                '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '15', '-pix_fmt', 'yuv420p',
                '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2', cellFile];
            const cr = await runFfmpegAsync(ffmpegBin, concatArgs, `grid_cell${ci}_concat`, () => {});
            if (cr.code !== 0 || !fs.existsSync(cellFile)) {
                log(`  Cell ${ci}: concat failed — ${cr.stderr.slice(-150).trim()}`);
                continue;
            }
            cellCleanup.push(cellFile);
            log(`  Cell ${ci}: ${subIntFiles.length} sub-clips concatenated`);
        }

        cellIntermediates.push({ file: cellFile, cellIdx: ci, layoutCell: cellLayout });
    }

    if (cellIntermediates.length === 0) {
        log('  Grid: no cells rendered successfully');
        cellCleanup.forEach(f => { try { fs.unlinkSync(f); } catch {} });
        return null;
    }

    // ── Build final grid composite ──
    // Input 0: black background; Inputs 1..N: cell intermediates
    const gridOutFile = path.join(tmpDir, `mmm_grid_final_${Date.now()}.mkv`);
    const gridInputs: string[] = [
        '-f', 'lavfi', '-i', `color=c=black:s=${outW}x${outH}:d=${gridDuration.toFixed(4)}:r=${fps}`,
    ];
    cellIntermediates.forEach(ci => { gridInputs.push('-i', ci.file); });

    // Build the overlay chain
    const fcChains: string[] = [];
    let prevLabel = '0:v';
    for (let k = 0; k < cellIntermediates.length; k++) {
        const { layoutCell } = cellIntermediates[k];
        const inputIdx = k + 1; // 0 is the background
        const ox = Math.round(layoutCell.x * outW);
        const oy = Math.round(layoutCell.y * outH);
        const cellW2 = Math.max(2, Math.round(outW * layoutCell.width));
        const cellH2 = Math.max(2, Math.round(outH * layoutCell.height));
        const cellW2Even = cellW2 % 2 === 0 ? cellW2 : cellW2 + 1;
        const cellH2Even = cellH2 % 2 === 0 ? cellH2 : cellH2 + 1;
        const outLabel = k === cellIntermediates.length - 1 ? 'gv' : `ov${k}`;
        // Scale cell intermediate to exact cell size, then overlay at position
        fcChains.push(`[${inputIdx}:v]scale=${cellW2Even}:${cellH2Even}:force_original_aspect_ratio=decrease,pad=${cellW2Even}:${cellH2Even}:(ow-iw)/2:(oh-ih)/2,setsar=1[cs${k}]`);
        fcChains.push(`[${prevLabel}][cs${k}]overlay=x=${ox}:y=${oy}:shortest=1[${outLabel}]`);
        prevLabel = outLabel;
    }

    // Audio: mix all cell audio tracks together
    if (cellIntermediates.length === 1) {
        fcChains.push(`[1:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[ga]`);
    } else {
        const aLabels = cellIntermediates.map((_, k) => {
            fcChains.push(`[${k + 1}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[ca${k}]`);
            return `[ca${k}]`;
        });
        fcChains.push(`${aLabels.join('')}amix=inputs=${cellIntermediates.length}:duration=longest:dropout_transition=0[ga]`);
    }

    const filterScript = fcChains.join(';\n');
    const filterFile = path.join(tmpDir, `mmm_grid_fc_${Date.now()}.txt`);
    fs.writeFileSync(filterFile, filterScript, 'utf-8');

    const gridArgs = ['-y', ...gridInputs, '-filter_complex_script', filterFile,
        '-map', '[gv]', '-map', '[ga]', '-t', gridDuration.toFixed(4), '-r', String(fps),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '15', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2', gridOutFile];

    log(`  Grid: compositing ${cellIntermediates.length} cells onto ${outW}x${outH} background (dur=${gridDuration.toFixed(3)}s)`);
    const gr = await runFfmpegAsync(ffmpegBin, gridArgs, 'grid_composite', () => {});
    try { fs.unlinkSync(filterFile); } catch {}

    // Clean up cell intermediates (keep only the final grid file)
    cellCleanup.forEach(f => { try { fs.unlinkSync(f); } catch {} });

    if (gr.code !== 0 || !fs.existsSync(gridOutFile)) {
        log(`  Grid: composite failed (code ${gr.code}): ${gr.stderr.slice(-300).trim()}`);
        return null;
    }

    log(`  Grid: composite complete → ${gridOutFile}`);
    return gridOutFile;
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORT PIPELINE — SEGMENT ENGINE (DEFAULT)
// Two-stage hybrid that gets the best of both legacy engines:
//   Stage 1 — render every clip to a duration-CAPPED ("-t") normalized
//             intermediate via the shared buildVideoFilter (full effects, color
//             grading, text, parametric FX, chroma key, audio FX). The hard "-t"
//             cap makes a runaway filter (e.g. zoompan) physically unable to
//             inflate the export — the root cause of the 31-minute render.
//   Stage 2 — ONE lightweight pass over the uniform intermediates: concat for
//             cuts, per-boundary xfade/acrossfade for transitions, background
//             music mix, and GPU/CPU encode. The graph is cheap and cannot
//             explode because every input is a short, pre-bounded clip.
// ══════════════════════════════════════════════════════════════════════════════
ipcMain.handle('export-project-segment', async (event, { filePath, clips: rawClips, settings }) => {
    return new Promise(async (resolve) => {
        const path = require('path');
        const os = require('os');
        const tmpDir = os.tmpdir();
        const ffmpegBin = resolveFFmpegBin();
        const renderLogPath = join(app.getPath('userData'), 'render_log_segment.txt');
        const log = (msg: string) => {
            try { fs.appendFileSync(renderLogPath, `[${new Date().toISOString()}] ${msg}\n`); } catch {}
            console.log('[Segment]', msg);
            try { event.sender.send('export-log', `[Segment] ${msg}`); } catch {}
        };
        try { fs.writeFileSync(renderLogPath, `=== MMMedia Pro Render Log (Segment Engine) ===\nStarted: ${new Date().toISOString()}\nOutput: ${filePath}\n\n`); } catch {}

        const intermediates: string[] = [];
        const cleanup = () => { intermediates.forEach(f => { try { fs.unlinkSync(f); } catch {} }); };

        try {
            // ── Settings ──
            const exportFps = settings?.exportFps && settings.exportFps > 0 ? settings.exportFps : (settings?.fps || 30);
            const projectFps = settings?.fps || 30;
            const fps = exportFps;
            const outW = settings?.outputWidth || 1920;
            const outH = settings?.outputHeight || 1080;
            const outCodec = settings?.outputCodec || 'libx264';
            const outBitrate = settings?.outputBitrate || 0;
            const outAudioBitrate = settings?.outputAudioBitrate || 256;
            const quality = settings?.exportQuality || 'standard';
            const globalStrategy = settings?.transitionStrategy || 'cut';
            const globalTransDur = typeof settings?.transitionDurationSec === 'number' ? settings.transitionDurationSec : 0.5;
            const es: any = { width: outW, height: outH, fps, projectFps, quality, codec: outCodec === 'libx265' ? 'hevc' : 'h264' };

            // ── Normalize / filter / sort ──
            let clips = rawClips
                .filter((c: any) => !c.disabled)
                .map((c: any) => ({ ...c, path: normalizeClipPath(c.path || '') }))
                .filter((c: any) => {
                    // Grid clips have no path — always pass them through
                    if (c.type === 'grid') return true;
                    return c.path && !c.path.startsWith('blob:') && !c.path.startsWith('http:') && !c.path.startsWith('data:');
                })
                .filter((c: any) => {
                    // Grid clips don't have a file to check
                    if (c.type === 'grid') return true;
                    if (!fs.existsSync(c.path)) { log(`⚠ Skip "${c.filename}" — file not found`); return false; }
                    return true;
                })
                .sort((a: any, b: any) => {
                    if (a.type === 'audio' && b.type !== 'audio') return 1;
                    if (a.type !== 'audio' && b.type === 'audio') return -1;
                    return (a.startFrame ?? 0) - (b.startFrame ?? 0);
                });

            const audioClips = clips.filter((c: any) => c.type === 'audio');
            const videoClips = clips.filter((c: any) => c.type !== 'audio');
            if (videoClips.length === 0) { resolve({ success: false, error: 'No video clips to export.' }); return; }
            log(`Segment engine: ${videoClips.length} video + ${audioClips.length} audio | ${outW}x${outH} @ ${fps}fps (project ${projectFps}) | ${outCodec} | gpu=${!!settings?.useGpu}`);

            // ── STAGE 1: per-clip duration-capped intermediates ──
            const probeCache = new Map<string, { hasAudio: boolean; duration: number }>();
            const renderedClips: any[] = [];
            const outDurs: number[] = [];
            let cancelled = false;

            for (let i = 0; i < videoClips.length; i++) {
                if ((activeExportProc as any)?.__cancelled) { cancelled = true; break; }
                const clip = videoClips[i];

                // ── Grid clip: composite via renderGridClip ──
                if (clip.type === 'grid') {
                    try {
                        log(`Clip ${i + 1}/${videoClips.length}: "${clip.filename}" — rendering grid (${clip.numCells} cells, ${clip.gridFormat})`);
                        const gridIntFile = await renderGridClip(clip, { outW, outH, fps, projectFps, es }, ffmpegBin, tmpDir, log);
                        if (gridIntFile && fs.existsSync(gridIntFile)) {
                            const gridDur = ((clip.endFrame ?? 0) - (clip.startFrame ?? 0)) / projectFps;
                            intermediates.push(gridIntFile);
                            renderedClips.push(clip);
                            outDurs.push(gridDur);
                            log(`Clip ${i + 1}/${videoClips.length}: "${clip.filename}" grid composite done, dur=${gridDur.toFixed(3)}s`);
                        } else {
                            log(`⚠ Clip ${i + 1}/${videoClips.length} "${clip.filename}" grid render failed`);
                        }
                    } catch (gridErr: any) {
                        log(`⚠ Clip ${i + 1}/${videoClips.length} "${clip.filename}" grid error: ${gridErr?.message || gridErr}`);
                    }
                    event.sender.send('export-progress', Math.round(((i + 1) / videoClips.length) * 70));
                    continue;
                }

                // ── Normal clip (video/image) ──
                const isImage = clip.type === 'image';
                if (!probeCache.has(clip.path)) probeCache.set(clip.path, probeClipFile(ffmpegBin, clip.path));
                const probe = probeCache.get(clip.path)!;
                if (!isImage && probe.duration <= 0) { log(`⚠ Skip "${clip.filename}" — corrupt source`); continue; }

                // Images have no intrinsic duration — treat the source as effectively unbounded
                // so timing uses the timeline length without clamping.
                const probeData = { width: clip.width || outW, height: clip.height || outH, duration: isImage ? 36000 : probe.duration };
                const timing = computeClipTiming(clip, es, probeData);
                const vf = buildVideoFilter(clip, es, probeData, { preSeeked: true });
                const af = buildClipAudioFilter(clip, es, probeData, { preSeeked: true });
                const hasAudio = probe.hasAudio && !isImage;
                const intFile = path.join(tmpDir, `mmm_seg_${i}_${Date.now()}.mkv`);

                // Images must be looped into a timed stream; video fast-seeks to the IN point.
                const inputs: string[] = isImage
                    ? ['-loop', '1', '-t', (timing.srcDurSec + 0.1).toFixed(4), '-i', clip.path]
                    : ['-ss', timing.seekSec.toFixed(4), '-i', clip.path];
                let fc: string, vmap: string, amap: string;
                const de: any = (clip as any).doubleExposure;
                const hasDE = !!(de && de.overlayPath);
                if (hasDE) {
                    // True double exposure: layer a SECOND clip over this one as a
                    // two-input graph (optionally confined to a moving shape mask).
                    const ovSeek = Math.max(0, (de.overlayTrimStart || 0) / projectFps);
                    inputs.push('-ss', ovSeek.toFixed(4), '-i', de.overlayPath); // input 1 = overlay
                    const deChains = buildDoubleExposureGraph(de, { width: outW, height: outH, fps, baseLabel: 'debase', overlayLabel: '1:v', outLabel: 'v' });
                    const videoFc = `[0:v]${vf}[debase];` + deChains.join(';');
                    if (hasAudio) {
                        fc = `${videoFc};[0:a]${af}[a]`; vmap = '[v]'; amap = '[a]';
                    } else {
                        inputs.push('-f', 'lavfi', '-t', (timing.outDurSec + 0.25).toFixed(4), '-i', 'anullsrc=r=48000:cl=stereo'); // input 2 = silence
                        fc = videoFc; vmap = '[v]'; amap = '2:a';
                    }
                } else if (hasAudio) {
                    fc = `[0:v]${vf}[v];[0:a]${af}[a]`; vmap = '[v]'; amap = '[a]';
                } else {
                    inputs.push('-f', 'lavfi', '-t', (timing.outDurSec + 0.25).toFixed(4), '-i', 'anullsrc=r=48000:cl=stereo');
                    fc = `[0:v]${vf}[v]`; vmap = '[v]'; amap = '1:a';
                }
                // Intermediates are CFR, uniform, near-lossless — and HARD-CAPPED at outDurSec.
                const args = ['-y', ...inputs, '-filter_complex', fc, '-map', vmap, '-map', amap,
                    '-t', timing.outDurSec.toFixed(4), '-r', String(fps),
                    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '15', '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2', intFile];

                const r = await runFfmpegAsync(ffmpegBin, args, `seg${i}`, () => {});
                if (r.code !== 0 || !fs.existsSync(intFile)) { log(`⚠ Clip ${i + 1}/${videoClips.length} "${clip.filename}" failed: ${r.stderr.slice(-200).trim()}`); continue; }
                intermediates.push(intFile);
                renderedClips.push(clip);
                outDurs.push(timing.outDurSec);
                log(`Clip ${i + 1}/${videoClips.length}: "${clip.filename}" seek=${timing.seekSec.toFixed(2)}s out=${timing.outDurSec.toFixed(3)}s audio=${hasAudio}`);
                event.sender.send('export-progress', Math.round(((i + 1) / videoClips.length) * 70));
            }

            if (cancelled || (activeExportProc as any)?.__cancelled) { cleanup(); resolve({ success: false, error: 'Export cancelled by user' }); return; }
            if (intermediates.length === 0) { cleanup(); resolve({ success: false, error: 'All clips failed to render.' }); return; }
            const N = intermediates.length;

            // ── Per-boundary transitions (clip[i].transition → global strategy fallback) ──
            type Boundary = { name: string | null; dur: number };
            const boundaries: Boundary[] = [];
            for (let i = 0; i < N - 1; i++) {
                const ct = renderedClips[i]?.transition;
                let type: string = ct && ct.type ? ct.type
                    : globalStrategy === 'cross-dissolve' ? 'fade'      // legacy compat
                    : globalStrategy === 'fade-to-black' ? 'fadeblack'  // legacy compat
                    : globalStrategy || 'cut';                          // pass any TransitionType directly
                let durSec = ct && ct.durationFrames ? ct.durationFrames / projectFps : globalTransDur;
                if (type === 'cut') { boundaries.push({ name: null, dur: 0 }); continue; }
                const maxD = 0.4 * Math.min(outDurs[i], outDurs[i + 1]);
                const D = Math.min(durSec, maxD);
                if (D < 1 / fps) { boundaries.push({ name: null, dur: 0 }); continue; }
                const name = getTransitionFFmpegName(type as any) || 'fade';
                boundaries.push({ name, dur: parseFloat(D.toFixed(4)) });
            }
            const anyTransition = boundaries.some(b => b.name);

            // ── STAGE 2: stitch ──
            const inputs: string[] = [];
            intermediates.forEach(f => { inputs.push('-i', f); });
            const bgStart = intermediates.length;
            audioClips.forEach((c: any) => { inputs.push('-i', c.path); });

            const chains: string[] = [];
            let stitchV: string, stitchA: string;

            if (!anyTransition) {
                const pairs = intermediates.map((_, i) => `[${i}:v][${i}:a]`).join('');
                chains.push(`${pairs}concat=n=${N}:v=1:a=1[cv][ca]`);
                stitchV = 'cv'; stitchA = 'ca';
                log(`Stitching ${N} clips via concat (hard cuts)`);
            } else {
                // Normalize every clip to a common format/timebase first.
                intermediates.forEach((_, i) => {
                    chains.push(`[${i}:v]format=yuv420p,fps=${fps},settb=AVTB,setpts=PTS-STARTPTS[nv${i}]`);
                    chains.push(`[${i}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,asetpts=PTS-STARTPTS[na${i}]`);
                });

                // CRITICAL: do NOT chain an xfade per clip. A 125-deep xfade chain
                // (with 1-frame "fades" for cuts) drifts on float offsets and, on the
                // very short clips a beat-synced edit produces, freezes the timeline
                // (xfade holds the last frame once an offset outruns a 2-frame clip).
                // Instead: group consecutive CUT-joined clips into frame-exact concat
                // runs, and xfade ONLY at real transition boundaries — so the xfade
                // chain depth equals the number of real transitions, not the clip count.
                const runs: number[][] = [];
                let curRun: number[] = [0];
                for (let i = 1; i < N; i++) {
                    if (boundaries[i - 1].name) { runs.push(curRun); curRun = [i]; }
                    else curRun.push(i);
                }
                runs.push(curRun);

                const runV: string[] = []; const runA: string[] = []; const runDur: number[] = [];
                runs.forEach((idxs, r) => {
                    if (idxs.length === 1) {
                        runV.push(`[nv${idxs[0]}]`); runA.push(`[na${idxs[0]}]`);
                    } else {
                        const pv = idxs.map(i => `[nv${i}]`).join('');
                        const pa = idxs.map(i => `[na${i}]`).join('');
                        chains.push(`${pv}concat=n=${idxs.length}:v=1:a=0[rv${r}]`);
                        chains.push(`${pa}concat=n=${idxs.length}:v=0:a=1[ra${r}]`);
                        runV.push(`[rv${r}]`); runA.push(`[ra${r}]`);
                    }
                    runDur.push(idxs.reduce((a, i) => a + outDurs[i], 0));
                });

                if (runV.length === 1) {
                    stitchV = runV[0].replace(/[\[\]]/g, ''); stitchA = runA[0].replace(/[\[\]]/g, '');
                } else {
                    const transB = boundaries.filter(b => b.name); // one per run gap
                    let prevV = runV[0]; let prevA = runA[0]; let cum = runDur[0];
                    for (let r = 1; r < runV.length; r++) {
                        const b = transB[r - 1];
                        // Cap the transition against the (longer, robust) run durations.
                        const D = Math.max(1 / fps, Math.min(b.dur, 0.4 * Math.min(runDur[r - 1], runDur[r])));
                        const offset = Math.max(0, cum - D);
                        const ov = r === runV.length - 1 ? 'xv_out' : `xv${r}`;
                        const oa = r === runV.length - 1 ? 'xa_out' : `xa${r}`;
                        chains.push(`${prevV}${runV[r]}xfade=transition=${b.name}:duration=${D.toFixed(4)}:offset=${offset.toFixed(4)}[${ov}]`);
                        chains.push(`${prevA}${runA[r]}acrossfade=d=${D.toFixed(4)}:c1=qsin:c2=qsin[${oa}]`);
                        prevV = `[${ov}]`; prevA = `[${oa}]`; cum = cum + runDur[r] - D;
                    }
                    stitchV = prevV.replace(/[\[\]]/g, ''); stitchA = prevA.replace(/[\[\]]/g, '');
                }
                log(`Stitching ${N} clips → ${runs.length} concat run(s) with ${runs.length - 1} crossfade(s)`);
            }

            // ── Background music mix ──
            let finalA = stitchA;
            if (audioClips.length > 0) {
                const bgLabels: string[] = [];
                audioClips.forEach((c: any, k: number) => {
                    const idx = bgStart + k;
                    const ts = (c.trimStartFrame ?? 0) / projectFps;
                    const te = (c.trimEndFrame ?? c.endFrame ?? 0) / projectFps;
                    const vol = (c.volume ?? 100) / 100;
                    let f = `[${idx}:a]`;
                    if (te > ts) f += `atrim=start=${ts.toFixed(4)}:end=${te.toFixed(4)},`;
                    f += `asetpts=PTS-STARTPTS,volume=${vol.toFixed(4)},aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[bg${k}]`;
                    chains.push(f); bgLabels.push(`[bg${k}]`);
                });
                chains.push(`[${stitchA}]${bgLabels.join('')}amix=inputs=${bgLabels.length + 1}:duration=first:dropout_transition=0[mixa]`);
                finalA = 'mixa';
                log(`Mixing ${bgLabels.length} background track(s)`);
            }

            // ── Encode (GPU with CPU fallback) ──
            const resolvedCodec = resolveVideoEncoder(ffmpegBin, outCodec, !!settings?.useGpu, log);
            const isNvenc = resolvedCodec.includes('nvenc');
            const isHevc = resolvedCodec.includes('265') || resolvedCodec.includes('hevc');
            let qa: string[] = [];
            if (isNvenc) {
                const p = quality === 'master' ? 'p6' : quality === 'draft' ? 'p2' : 'p4';
                if (outBitrate > 0) qa = ['-preset', p, '-rc', 'vbr', '-b:v', `${outBitrate}k`, '-maxrate', `${Math.round(outBitrate * 1.5)}k`, '-bufsize', `${Math.round(outBitrate * 2)}k`];
                else { const cq = quality === 'master' ? '19' : quality === 'draft' ? '28' : '23'; qa = ['-preset', p, '-rc', 'vbr', '-cq', cq, '-b:v', '0']; }
                qa.push('-c:a', 'aac', '-b:a', `${outAudioBitrate}k`);
            } else if (outBitrate > 0) {
                qa = ['-b:v', `${outBitrate}k`, '-maxrate', `${Math.round(outBitrate * 1.5)}k`, '-bufsize', `${Math.round(outBitrate * 2)}k`, '-preset', quality === 'draft' ? 'veryfast' : quality === 'master' ? 'slow' : 'medium', '-c:a', 'aac', '-b:a', `${outAudioBitrate}k`];
            } else {
                const crf = quality === 'master' ? (isHevc ? '20' : '17') : quality === 'draft' ? (isHevc ? '30' : '28') : (isHevc ? '24' : '20');
                qa = ['-crf', crf, '-preset', quality === 'draft' ? 'veryfast' : quality === 'master' ? 'slow' : 'medium', '-c:a', 'aac', '-b:a', `${outAudioBitrate}k`];
            }

            const filterScript = chains.join(';\n');
            const filterFile = path.join(tmpDir, `mmm_seg_stitch_${Date.now()}.txt`);
            fs.writeFileSync(filterFile, filterScript, 'utf-8');

            const finalArgs = ['-y', ...inputs, '-filter_complex_script', filterFile,
                '-map', `[${stitchV}]`, '-map', `[${finalA}]`, '-r', String(fps),
                '-c:v', resolvedCodec, '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_trc', 'bt709', '-color_primaries', 'bt709',
                '-max_muxing_queue_size', '1024', '-movflags', '+faststart', ...qa, filePath];

            const totalExpected = outDurs.reduce((a, b) => a + b, 0) - boundaries.reduce((a, b) => a + (b.dur || 0), 0);
            log(`Final encode → ${resolvedCodec} | expected ~${totalExpected.toFixed(1)}s`);
            const r = await runFfmpegAsync(ffmpegBin, finalArgs, 'seg_final', (line: string) => {
                const m = line.match(/time=(\d+):(\d+):([0-9.]+)/);
                if (m && totalExpected > 0) {
                    const t = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
                    event.sender.send('export-progress', Math.min(99, 70 + Math.round((t / totalExpected) * 29)));
                }
                const tr = line.trim(); if (tr) { try { event.sender.send('export-log', `[Segment:ffmpeg] ${tr}`); } catch {} }
            });
            try { fs.unlinkSync(filterFile); } catch {}
            cleanup();

            if (r.code === 0) {
                try { const fp = probeClipFile(ffmpegBin, filePath); log(`Segment export COMPLETE → ${filePath} | Duration: ${fp.duration.toFixed(2)}s (expected ~${totalExpected.toFixed(2)}s)`); } catch { log(`Segment export COMPLETE → ${filePath}`); }
                event.sender.send('export-progress', 100);
                resolve({ success: true });
            } else {
                // Distinguish cancellation from real failure
                const wasCancelled = (activeExportProc as any)?.__cancelled || r.stderr.includes('[q] command received');
                if (wasCancelled) {
                    log('Export cancelled by user during final encode.');
                    resolve({ success: false, error: 'Export cancelled by user' });
                } else {
                    log(`Segment export FAILED (code ${r.code}): ${r.stderr.slice(-500)}`);
                    resolve({ success: false, error: r.stderr.slice(-500).trim() || `FFmpeg exited with code ${r.code}` });
                }
            }
        } catch (err: any) {
            cleanup();
            log(`Segment setup FAILED: ${err?.message || 'unknown error'}`);
            resolve({ success: false, error: err?.message || 'Unexpected export setup error' });
        }
    });
});

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

            const exportFps = settings?.exportFps && settings.exportFps > 0 ? settings.exportFps : (settings?.fps || 30);
            const projectFps = settings?.fps || 30;
            const fps = exportFps; // Output frame rate
            const outW = settings?.outputWidth || 1920;
            const outH = settings?.outputHeight || 1080;
            const outCodec = settings?.outputCodec || 'libx264';
            const outBitrate = settings?.outputBitrate || 0;
            const outAudioBitrate = settings?.outputAudioBitrate || 256;
            log(`Output: ${outW}x${outH} ${outCodec} @ ${outBitrate > 0 ? outBitrate+'kbps' : 'CRF'} | export ${exportFps}fps (project ${projectFps}fps) | audio ${outAudioBitrate}k`);
            log(`Clips: ${validVideoClips.length} video + ${clips.filter((c: any) => c.type === 'audio').length} audio`);

            // ── 3. PER-CLIP RENDER ──
            const intermediateFiles: string[] = [];
            const intermediateDurations: number[] = []; // Track actual rendered duration per clip
            const totalClips = validVideoClips.length;
            let cancelled = false;

            for (let i = 0; i < totalClips && !cancelled; i++) {
                const clip = validVideoClips[i];
                const probe = probeCache.get(clip.path)!;
                // FIX: Use projectFps for frame→second conversion (clip data is in project fps).
                // Use TIMELINE duration (endFrame-startFrame) as the canonical output duration,
                // NOT (trimEnd-trimStart) which can be shared across multiple beat-matched segments.
                const seekTo = (clip.trimStartFrame ?? 0) / projectFps;
                const sourceDur = probe.duration;
                const speed = clip.speed || 1.0;

                // Timeline duration = how long this clip should appear in the output
                let timelineDur = ((clip.endFrame ?? 0) - (clip.startFrame ?? 0)) / projectFps;
                if (timelineDur <= 0) {
                    // Fallback to trim-based if timeline data is missing
                    timelineDur = ((clip.trimEndFrame ?? 0) - (clip.trimStartFrame ?? 0)) / projectFps;
                    log(`  ⚠ Clip ${i+1} "${clip.filename}": timeline frames missing, fallback to trim-based duration`);
                }
                if (timelineDur <= 0 && clip.sourceDurationFrames > 0) {
                    timelineDur = clip.sourceDurationFrames / projectFps;
                    log(`  ⚠ Clip ${i+1} "${clip.filename}": all duration data missing, fallback to source duration`);
                }

                // Source material needed: timelineDur * speed (speed < 1 means slow-mo, need less source)
                let clipDur = timelineDur * speed;
                let seekClamped = seekTo;

                if (sourceDur > 0.5) {
                    if (seekClamped >= sourceDur) {
                        const oldSeek = seekClamped;
                        seekClamped = Math.max(0, sourceDur - clipDur - 0.5);
                        log(`  ⚠ Clip ${i+1}: seek ${oldSeek.toFixed(2)}s exceeds source ${sourceDur.toFixed(2)}s → clamped to ${seekClamped.toFixed(2)}s`);
                    }
                    if (seekClamped < 0) seekClamped = 0;
                    if (seekClamped + clipDur > sourceDur) {
                        const oldDur = clipDur;
                        clipDur = Math.max(0.04, sourceDur - seekClamped - 0.01);
                        log(`  ⚠ Clip ${i+1}: seek+dur (${(seekClamped + oldDur).toFixed(2)}s) exceeds source ${sourceDur.toFixed(2)}s → dur clamped to ${clipDur.toFixed(2)}s`);
                    }
                }
                if (clipDur < 0.01) {
                    log(`  ⚠ Clip ${i+1}: source duration too short (${clipDur.toFixed(4)}s) — using 0.04s minimum`);
                    clipDur = 0.04;
                }

                const volume = ((clip.volume !== undefined ? clip.volume : 100) / 100) * (clip.isMuted ? 0 : 1);
                const hasAudio = probe.hasAudio && clip.type !== 'image';
                const expectedOutputDur = clipDur / speed;

                log(`Clip ${i+1}/${totalClips}: "${clip.filename}" seek=${seekClamped.toFixed(2)}s srcTrim=${clipDur.toFixed(3)}s speed=${speed} → output=${expectedOutputDur.toFixed(3)}s (timeline=${timelineDur.toFixed(3)}s) vol=${volume.toFixed(2)}`);
                event.sender.send('export-progress', Math.round((i / totalClips) * 80));

                // Video filter
                const trimEnd = seekClamped + clipDur;
                let vf = `[0:v]trim=start=${seekClamped.toFixed(4)}:end=${trimEnd.toFixed(4)},setpts=PTS-STARTPTS`;
                const rot = clip.rotation || 0;
                if (rot === 90) vf += ',transpose=1';
                else if (rot === 180) vf += ',transpose=1,transpose=1';
                else if (rot === 270) vf += ',transpose=2';

                // Zoompan — applied AFTER rotation, BEFORE scale/pad
                let zoompanUsed = false;
                if (clip.zoomStart !== undefined && clip.zoomEnd !== undefined &&
                    (clip.zoomStart !== 100 || clip.zoomEnd !== 100)) {
                    const clipDurFrames = Math.round((clip.endFrame - clip.startFrame) / (clip.speed || 1));
                    const zs = (clip.zoomStart || 100) / 100;
                    const ze = (clip.zoomEnd || 100) / 100;

                    let zx = "'iw/2-(iw/zoom/2)'";
                    let zy = "'ih/2-(ih/zoom/2)'";
                    const origin = clip.zoomOrigin || 'center';
                    if (origin === 'top') { zy = "'0'"; }
                    else if (origin === 'bottom') { zy = "'ih-ih/zoom'"; }
                    else if (origin === 'left') { zx = "'0'"; }
                    else if (origin === 'right') { zx = "'iw-iw/zoom'"; }

                    // d=1: one output frame per input frame (avoids zoompan's per-input-frame
                    // duration multiplication — the cause of multi-minute exports on zoomed clips).
                    vf += `,zoompan=z='${zs}+(${ze}-${zs})*min(1,on/${clipDurFrames})':x=${zx}:y=${zy}:d=1:s=${outW}x${outH}`;
                    zoompanUsed = true;
                }

                // Scale/pad — skip if zoompan already set output resolution
                if (!zoompanUsed) {
                    vf += `,scale=${outW}:${outH}:force_original_aspect_ratio=decrease,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
                } else {
                    vf += `,setsar=1`;
                }

                // Effects — use resolveEffectFilter from effectCompiler
                if (clip.effectIds?.length) {
                    const effects = clip.effectIds.map((id: string) => resolveEffectFilter(id)).filter(Boolean).join(',');
                    if (effects) vf += `,${effects}`;
                }

                // Reverse filter — applied before speed adjustment
                let needsReversePass = false;
                if (clip.reversed) {
                    const clipDurSec = (clip.endFrame - clip.startFrame) / fps;
                    if (clipDurSec <= 5) {
                        vf += ',reverse';
                    } else {
                        needsReversePass = true;
                        log(`  ⚠ Clip ${i+1}: reversed clip is ${clipDurSec.toFixed(1)}s — will use two-pass reverse`);
                    }
                }

                vf += `,setpts=${(1/speed).toFixed(4)}*PTS,fps=fps=${fps}[v_out]`;

                // Audio filter
                let af: string;
                if (hasAudio) {
                    af = `[0:a]atrim=start=${seekClamped.toFixed(4)}:end=${trimEnd.toFixed(4)},asetpts=PTS-STARTPTS`;
                    // Reverse audio if clip is reversed (short clips only, long clips use two-pass)
                    if (clip.reversed && !needsReversePass) {
                        af += ',areverse';
                    }
                    if (speed !== 1.0) {
                        const atempoFilter = buildAtempoChain(speed);
                        if (atempoFilter) af += ',' + atempoFilter;
                    }
                    af += `,volume=${volume.toFixed(4)}[a_out]`;
                } else {
                    const outDur = clipDur / speed;
                    af = `anullsrc=r=48000:cl=stereo[sil];[sil]atrim=start=0:duration=${outDur.toFixed(4)},asetpts=PTS-STARTPTS[a_out]`;
                }

                const filterFile = path.join(tmpDir, `mmm_clip_${i}_${Date.now()}.txt`);
                fs.writeFileSync(filterFile, vf + ';\n' + af, 'utf-8');
                let intermediateFile = path.join(tmpDir, `mmm_clip_${i}_${Date.now()}.mkv`);
                intermediateFiles.push(intermediateFile);
                intermediateDurations.push(expectedOutputDur);

                const result = await runFfmpegAsync(ffmpegBin, [
                    '-y', '-threads', '2', '-filter_threads', '1',
                    '-i', clip.path,
                    '-filter_complex_script', filterFile,
                    '-map', '[v_out]', '-map', '[a_out]',
                    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '15', '-pix_fmt', 'yuv420p',
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
                    continue;
                }

                // Two-pass reverse: for long reversed clips (>5s), reverse the intermediate
                if (needsReversePass && result.code === 0) {
                    const reversedFile = path.join(tmpDir, `mmm_clip_${i}_rev_${Date.now()}.mkv`);
                    log(`  Two-pass reverse for clip ${i+1}: ${intermediateFile} → ${reversedFile}`);
                    const revResult = await runFfmpegAsync(ffmpegBin, [
                        '-y', '-i', intermediateFile,
                        '-vf', 'reverse', '-af', 'areverse',
                        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '15', '-pix_fmt', 'yuv420p',
                        '-c:a', 'aac', '-b:a', '320k',
                        reversedFile
                    ], `clip${i}_rev`, (line) => {
                        const t = line.trim(); if (t) try { event.sender.send('export-log', `[ffmpeg:rev] ${t}`); } catch {}
                    });
                    try { fs.unlinkSync(intermediateFile); } catch {}
                    if (revResult.code === 0) {
                        intermediateFiles[intermediateFiles.length - 1] = reversedFile;
                        intermediateFile = reversedFile;
                    } else {
                        log(`  ⚠ Two-pass reverse failed for clip ${i+1} (code ${revResult.code}) — using forward version`);
                    }
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
                    const trimStart = (c.trimStartFrame ?? 0) / fps;
                    let trimEnd = (c.trimEndFrame ?? 0) / fps;

                    // FIX: If trimEnd resolves to 0 or is less than trimStart, compute a real duration
                    if (trimEnd <= trimStart) {
                        // Try endFrame (timeline position)
                        const endFrameTime = (c.endFrame ?? 0) / fps;
                        if (endFrameTime > trimStart) {
                            trimEnd = endFrameTime;
                            log(`  ⚠ BG Audio[${idx}]: trimEnd was 0, using endFrame: ${trimEnd.toFixed(2)}s`);
                        } else {
                            // Probe the actual source file for its real duration
                            try {
                                const audioProbe = probeClipFile(ffmpegBin, c.path);
                                trimEnd = audioProbe.duration > 0 ? audioProbe.duration : actualTotalDuration;
                                log(`  ⚠ BG Audio[${idx}]: trimEnd was 0, probed source duration: ${trimEnd.toFixed(2)}s`);
                            } catch {
                                // Last resort: use total video duration so music spans the full render
                                trimEnd = actualTotalDuration > 0 ? actualTotalDuration : 300;
                                log(`  ⚠ BG Audio[${idx}]: trimEnd was 0, using video duration: ${trimEnd.toFixed(2)}s`);
                            }
                        }
                    }

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
            const resolvedCodec = resolveVideoEncoder(ffmpegBin, outCodec, !!settings?.useGpu, log);
            const isNvenc = resolvedCodec.includes('nvenc');
            const isHevc = resolvedCodec.includes('265') || resolvedCodec.includes('hevc');
            let qArgs: string[] = [];
            if (isNvenc) {
                const nvPreset = quality === 'master' ? 'p6' : quality === 'draft' ? 'p2' : 'p4';
                if (isIntermediate) { qArgs = ['-preset', 'p1', '-rc', 'vbr', '-cq', '12']; }
                else if (outBitrate > 0) {
                    qArgs = ['-preset', nvPreset, '-rc', 'vbr', '-b:v', `${outBitrate}k`, '-maxrate', `${Math.round(outBitrate*1.5)}k`, '-bufsize', `${Math.round(outBitrate*2)}k`];
                } else {
                    const cq = quality === 'master' ? '19' : quality === 'draft' ? '28' : '23';
                    qArgs = ['-preset', nvPreset, '-rc', 'vbr', '-cq', cq, '-b:v', '0'];
                }
                qArgs.push('-c:a', 'aac', '-b:a', `${isIntermediate ? 320 : outAudioBitrate}k`);
            }
            else if (isIntermediate) { qArgs = ['-preset', 'ultrafast', '-crf', '10', '-c:a', 'aac', '-b:a', '320k']; }
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

            finalArgs.push('-r', fps.toString(), '-c:v', resolvedCodec, '-pix_fmt', 'yuv420p',
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
// EXPORT PIPELINE — Monolithic Architecture (Single-Pass Filter Graph)
// All clips are stitched together in one FFmpeg invocation. Implements real
// xfade/acrossfade transitions (any FFmpeg xfade type from transitions registry), audio mixing,
// optional NVENC GPU encoding, and direct process spawning (no PowerShell).
// Faster for small-medium timelines. May OOM on very large projects.
// ══════════════════════════════════════════════════════════════════════════════
ipcMain.handle('export-project-monolithic', async (event, { filePath, clips: rawClips, settings, isIntermediate }) => {
    return new Promise(async (resolve) => {
        const { spawn } = require('child_process');
        const path = require('path');
        const os = require('os');
        const ffmpegBin = resolveFFmpegBin();

        const renderLogPath = join(app.getPath('userData'), 'render_log_monolithic.txt');
        const log = (msg: string) => {
            fs.appendFileSync(renderLogPath, `[${new Date().toISOString()}] ${msg}\n`);
            console.log('[Monolithic]', msg);
            try { event.sender.send('export-log', `[Monolithic] ${msg}`); } catch {}
        };
        fs.writeFileSync(renderLogPath, `=== MMMedia Pro Render Log (Monolithic Engine) ===\nStarted: ${new Date().toISOString()}\nOutput: ${filePath}\n\n`);

        try {
            // ── 1. NORMALIZE, FILTER, VALIDATE ──
            let clips = rawClips
                .filter((c: any) => !c.disabled)
                .map((c: any) => ({ ...c, path: normalizeClipPath(c.path) }))
                .filter((c: any) => {
                    if (!c.path || c.path.startsWith('blob:') || c.path.startsWith('http:') || c.path.startsWith('data:')) {
                        log(`⚠ Skipping "${c.filename}" — invalid path type`);
                        return false;
                    }
                    if (!fs.existsSync(c.path)) {
                        log(`⚠ Skipping "${c.filename}" — file not found: ${c.path?.substring(0, 80)}`);
                        return false;
                    }
                    return true;
                })
                .sort((a: any, b: any) => {
                    if (a.type === 'audio' && b.type !== 'audio') return 1;
                    if (a.type !== 'audio' && b.type === 'audio') return -1;
                    return (a.startFrame ?? 0) - (b.startFrame ?? 0);
                });

            // Dedup audio clips
            const audioClips = clips.filter((c: any) => c.type === 'audio');
            const videoClips = clips.filter((c: any) => c.type !== 'audio');
            if (audioClips.length > 1) {
                const seen = new Set<string>();
                const deduped = audioClips.filter((c: any) => {
                    const k = `${c.path}|${c.trimStartFrame ?? 0}`;
                    if (seen.has(k)) return false;
                    seen.add(k);
                    return true;
                });
                clips = [...videoClips, ...deduped];
            }

            log(`── Clip data (${rawClips.length} raw → ${clips.length} filtered) ──`);
            videoClips.forEach((c: any, i: number) => {
                log(`  V[${i}] "${c.filename}" startF=${c.startFrame} endF=${c.endFrame} trimStart=${c.trimStartFrame} trimEnd=${c.trimEndFrame} srcDur=${c.sourceDurationFrames} speed=${c.speed} vol=${c.volume} muted=${c.isMuted}`);
            });
            audioClips.forEach((c: any, i: number) => {
                log(`  A[${i}] "${c.filename}" trimStart=${c.trimStartFrame} trimEnd=${c.trimEndFrame} endFrame=${c.endFrame} vol=${c.volume} track=${c.track} path=${c.path?.substring(0, 80)}`);
            });

            // ── 2. PROBE ALL SOURCES ──
            const probeCache = new Map<string, { hasAudio: boolean; duration: number }>();
            const probeResults: { hasAudio: boolean; duration: number }[] = clips.map((clip: any) => {
                if (clip.type === 'audio') return { hasAudio: true, duration: 9999 };
                if (probeCache.has(clip.path)) return probeCache.get(clip.path)!;
                const result = probeClipFile(ffmpegBin, clip.path);
                probeCache.set(clip.path, result);
                return result;
            });

            const exportFps = settings?.exportFps && settings.exportFps > 0 ? settings.exportFps : (settings?.fps || 30);
            const projectFps = settings?.fps || 30;
            const fps = exportFps; // Output frame rate only
            const outW = settings?.outputWidth || 1920;
            const outH = settings?.outputHeight || 1080;
            const outCodec = settings?.outputCodec || 'libx264';
            const outBitrate = settings?.outputBitrate || 0;
            const outAudioBitrate = settings?.outputAudioBitrate || 256;
            log(`Output: ${outW}x${outH} ${outCodec} @ ${outBitrate > 0 ? outBitrate + 'kbps' : 'CRF'} | export ${exportFps}fps (project ${projectFps}fps) | audio ${outAudioBitrate}k`);

            // Transition strategy (from the timeline). 'cut' = hard cut (concat),
            // any other value = xfade type name passed directly to FFmpeg.
            const transitionStrategy: string = settings?.transitionStrategy || 'cut';
            const requestedTransitionDur = typeof settings?.transitionDurationSec === 'number' ? settings.transitionDurationSec : 0.5;

            // ── 3. BUILD FILTER GRAPH ──
            let filterChains: string[] = [];
            let inputArgs: string[] = [];
            let videoInputCount = 0;
            let preparedVideoStreams: string[] = [];
            let preparedAudioStreams: string[] = [];
            let clipDurations: number[] = [];


            clips.forEach((clip: any, index: number) => {
                const seekTo = (clip.trimStartFrame ?? 0) / projectFps;
                const sourceDuration = probeResults[index].duration;

                const speed = clip.speed || 1.0;

                // FIX: Use TIMELINE duration as canonical output duration
                let timelineDur = ((clip.endFrame ?? 0) - (clip.startFrame ?? 0)) / projectFps;
                if (timelineDur <= 0 && clip.type !== 'audio') {
                    // Fallback to trim-based
                    timelineDur = ((clip.trimEndFrame ?? 0) - (clip.trimStartFrame ?? 0)) / projectFps;
                }
                if (timelineDur <= 0 && clip.type !== 'audio') {
                    if (clip.sourceDurationFrames > 0) {
                        timelineDur = clip.sourceDurationFrames / projectFps;
                        log(`  ⚠ Clip ${index} "${clip.filename}": all duration data missing, using source duration`);
                    } else if (sourceDuration > 0) {
                        timelineDur = sourceDuration;
                    }
                }

                // Source material to extract: timelineDur * speed
                let clipDur = clip.type === 'audio' ? ((clip.trimEndFrame ?? 0) - (clip.trimStartFrame ?? 0)) / projectFps : timelineDur * speed;

                // Clamp seek to source bounds
                let seekClamped = seekTo;
                if (sourceDuration > 0.5 && clip.type !== 'audio') {
                    if (seekClamped >= sourceDuration) {
                        log(`  ⚠ Clip ${index}: seek ${seekClamped.toFixed(1)}s > source ${sourceDuration.toFixed(1)}s → clamped`);
                        seekClamped = Math.max(0, sourceDuration - clipDur - 0.1);
                    }
                    if (seekClamped < 0) seekClamped = 0;
                    if (seekClamped + clipDur > sourceDuration) {
                        clipDur = Math.max(0.04, sourceDuration - seekClamped - 0.01);
                    }
                }
                if (clipDur < 0.01 && clip.type !== 'audio') clipDur = 0.04;

                // Skip sub-frame clips
                if (clip.type !== 'audio' && (clipDur / speed) < (1 / fps)) {
                    log(`⚠ Skipping clip ${index} "${clip.filename}" — output duration ${(clipDur/speed).toFixed(4)}s is sub-frame`);
                    return;
                }

                // Fast-seek: -ss before -i for speed
                inputArgs.push('-ss', seekClamped.toFixed(4), '-i', clip.path);

                // Volume
                let finalVolume: number;
                if (clip.type === 'audio') {
                    finalVolume = (clip.volume !== undefined ? clip.volume : 100) / 100;
                    log(`Audio clip ${index}: "${clip.filename}" → volume=${finalVolume.toFixed(2)}`);
                } else {
                    const volume = (clip.volume !== undefined ? clip.volume : 100) / 100;
                    const mute = clip.isMuted ? 0 : 1;
                    finalVolume = volume * mute;
                }

                if (clip.type === 'audio') {
                    // Audio duration: use probed source as fallback
                    let audioDur = clipDur;
                    if (audioDur <= 0) {
                        const trimStart = (clip.trimStartFrame ?? 0) / projectFps;
                        const trimEnd = (clip.trimEndFrame ?? clip.endFrame ?? 0) / projectFps;
                        audioDur = trimEnd - trimStart;
                        if (audioDur <= 0) {
                            const audioProbe = probeClipFile(ffmpegBin, clip.path);
                            audioDur = audioProbe.duration > 0 ? audioProbe.duration : 300;
                            log(`  ⚠ Audio "${clip.filename}": trim data yielded 0s, using probed duration ${audioDur.toFixed(1)}s`);
                        }
                    }
                    filterChains.push(
                        `[${index}:a]atrim=start=0:duration=${audioDur.toFixed(4)},asetpts=PTS-STARTPTS,volume=${finalVolume.toFixed(4)}[a_bg_${index}]`
                    );
                } else {
                    const vOut = `v${index}`;
                    const aOut = `a${index}`;
                    const outDur = clipDur / speed; // Output duration after speed application

                    // Video chain — trim extracts source material, setpts applies speed
                    let vf = `[${index}:v]trim=start=0:duration=${clipDur.toFixed(4)},setpts=PTS-STARTPTS`;

                    // Rotation support
                    const rot = clip.rotation || 0;
                    if (rot === 90) vf += ',transpose=1';
                    else if (rot === 180) vf += ',transpose=1,transpose=1';
                    else if (rot === 270) vf += ',transpose=2';

                    // Zoompan — applied AFTER rotation, BEFORE scale/pad
                    let zoompanUsed = false;
                    if (clip.zoomStart !== undefined && clip.zoomEnd !== undefined &&
                        (clip.zoomStart !== 100 || clip.zoomEnd !== 100)) {
                        const clipDurFrames = Math.round((clip.endFrame - clip.startFrame) / (clip.speed || 1));
                        const zs = (clip.zoomStart || 100) / 100;
                        const ze = (clip.zoomEnd || 100) / 100;

                        let zx = "'iw/2-(iw/zoom/2)'";
                        let zy = "'ih/2-(ih/zoom/2)'";
                        const origin = clip.zoomOrigin || 'center';
                        if (origin === 'top') { zy = "'0'"; }
                        else if (origin === 'bottom') { zy = "'ih-ih/zoom'"; }
                        else if (origin === 'left') { zx = "'0'"; }
                        else if (origin === 'right') { zx = "'iw-iw/zoom'"; }

                        // d=1: one output frame per input frame (avoids zoompan's per-input-frame
                    // duration multiplication — the cause of multi-minute exports on zoomed clips).
                    vf += `,zoompan=z='${zs}+(${ze}-${zs})*min(1,on/${clipDurFrames})':x=${zx}:y=${zy}:d=1:s=${outW}x${outH}`;
                        zoompanUsed = true;
                    }

                    // Scale/pad — skip if zoompan already set output resolution
                    if (!zoompanUsed) {
                        vf += `,scale=${outW}:${outH}:force_original_aspect_ratio=decrease,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
                    } else {
                        vf += `,setsar=1`;
                    }

                    // Effects — use resolveEffectFilter from effectCompiler
                    if (clip.effectIds && clip.effectIds.length > 0) {
                        const effects = clip.effectIds.map((id: string) => resolveEffectFilter(id)).filter(Boolean).join(',');
                        if (effects) vf += `,${effects}`;
                    }

                    // Reverse filter — applied before speed adjustment
                    if (clip.reversed) {
                        const clipDurSec = (clip.endFrame - clip.startFrame) / fps;
                        if (clipDurSec > 5) {
                            console.warn(`[Export] Warning: Reversing ${clipDurSec.toFixed(1)}s clip in monolithic mode may use significant memory`);
                            log(`  ⚠ Warning: Reversing ${clipDurSec.toFixed(1)}s clip in monolithic mode may use significant memory`);
                        }
                        vf += ',reverse';
                    }

                    vf += `,setpts=${(1 / speed).toFixed(4)}*PTS[${vOut}]`;
                    filterChains.push(vf);

                    // Audio chain
                    const hasRealAudio = probeResults[index].hasAudio && clip.type !== 'image';

                    if (hasRealAudio) {
                        let audioExtra = '';
                        // Reverse audio in monolithic mode
                        if (clip.reversed) {
                            audioExtra += ',areverse';
                        }
                        if (speed !== 1.0) {
                            const atempoFilter = buildAtempoChain(speed);
                            if (atempoFilter) audioExtra += ',' + atempoFilter;
                        }
                        filterChains.push(
                            `[${index}:a]atrim=start=0:duration=${clipDur.toFixed(4)},asetpts=PTS-STARTPTS${audioExtra},volume=${finalVolume.toFixed(4)}[${aOut}]`
                        );
                    } else {
                        filterChains.push(`anullsrc=r=48000:cl=stereo[sil_${index}]`);
                        filterChains.push(`[sil_${index}]atrim=start=0:duration=${outDur.toFixed(4)},asetpts=PTS-STARTPTS[${aOut}]`);
                    }

                    preparedVideoStreams.push(`[${vOut}]`);
                    preparedAudioStreams.push(`[${aOut}]`);
                    clipDurations.push(outDur);



                    log(`Clip ${index}: ${clip.filename} | seek=${seekClamped.toFixed(2)}s srcTrim=${clipDur.toFixed(3)}s speed=${speed} → output=${outDur.toFixed(3)}s (timeline=${timelineDur.toFixed(3)}s) vol=${finalVolume.toFixed(2)} audio=${hasRealAudio}`);
                    videoInputCount++;
                }
            });

            if (videoInputCount === 0) {
                resolve({ success: false, error: 'No video clips to export.' });
                return;
            }

            // ── 4. STITCHING (cut via concat, or crossfade via xfade) ──
            let finalVideoMap: string;
            let finalAudioMap: string;

            // Decide whether transitions are viable. xfade needs >=2 clips and a
            // transition shorter than the clips it joins; clamp to 40% of the
            // shortest clip so beat-synced micro-clips never get a negative offset.
            const minClipDur = clipDurations.length ? Math.min(...clipDurations) : 0;
            const xfadeDur = Math.min(requestedTransitionDur, minClipDur * 0.4);
            const wantsTransition = transitionStrategy !== 'cut' && videoInputCount >= 2 && xfadeDur >= (1 / fps);

            if (wantsTransition) {
                const xfadeType = transitionStrategy; // The strategy IS the xfade type name directly
                const D = parseFloat(xfadeDur.toFixed(4));
                log(`Stitching with xfade=${xfadeType} (d=${D}s) across ${videoInputCount} clips`);

                // xfade is strict about input format/fps/timebase — normalize each
                // prepared video stream before feeding the transition chain.
                const normV: string[] = [];
                preparedVideoStreams.forEach((label, i) => {
                    const out = `vn${i}`;
                    filterChains.push(`${label}format=yuv420p,fps=${fps},settb=AVTB[${out}]`);
                    normV.push(`[${out}]`);
                });

                // Video xfade chain. offset = (running output length) - D.
                let prevV = normV[0];
                let cum = clipDurations[0];
                for (let i = 1; i < videoInputCount; i++) {
                    const offset = Math.max(0, cum - D);
                    const out = i === videoInputCount - 1 ? 'xf_v' : `xfv${i}`;
                    filterChains.push(`${prevV}${normV[i]}xfade=transition=${xfadeType}:duration=${D}:offset=${offset.toFixed(4)}[${out}]`);
                    prevV = `[${out}]`;
                    cum = cum + clipDurations[i] - D;
                }
                finalVideoMap = 'xf_v';

                // Audio acrossfade chain — overlaps by the same D so A/V stay aligned.
                let prevA = preparedAudioStreams[0];
                for (let i = 1; i < videoInputCount; i++) {
                    const out = i === videoInputCount - 1 ? 'xf_a' : `xfa${i}`;
                    filterChains.push(`${prevA}${preparedAudioStreams[i]}acrossfade=d=${D}:c1=qsin:c2=qsin[${out}]`);
                    prevA = `[${out}]`;
                }
                finalAudioMap = 'xf_a';
            } else {
                if (transitionStrategy !== 'cut' && videoInputCount >= 2) {
                    log(`Transition "${transitionStrategy}" requested but clips too short for ${requestedTransitionDur}s xfade — using hard cuts.`);
                }
                log('Stitching clips via concat (hard cuts)');
                const concatPairs = preparedVideoStreams.map((v, i) => `${v}${preparedAudioStreams[i]}`).join('');
                filterChains.push(
                    `${concatPairs}concat=n=${videoInputCount}:v=1:a=1[concat_v][concat_a]`
                );
                finalVideoMap = 'concat_v';
                finalAudioMap = 'concat_a';
            }

            // ── 5. BACKGROUND AUDIO MIXING ──
            const audioBgOuts = clips.map((c: any, i: number) => c.type === 'audio' ? `[a_bg_${i}]` : null).filter(Boolean);

            if (audioBgOuts.length > 0) {
                log(`Mixing ${audioBgOuts.length} background audio track(s) via amix`);
                filterChains.push(`[${finalAudioMap}]${audioBgOuts.join('')}amix=inputs=${audioBgOuts.length + 1}:duration=first:dropout_transition=0[final_a]`);
                finalAudioMap = 'final_a';
            } else {
                log('No background audio tracks — using stitched audio directly.');
            }

            // Write filter to temp file
            const filterScript = filterChains.join(';\n');
            const tmpDir = os.tmpdir();
            const filterFile = path.join(tmpDir, `mmm_mono_filter_${Date.now()}.txt`);
            fs.writeFileSync(filterFile, filterScript, 'utf-8');
            log(`Filter script (${filterChains.length} chains, ${videoInputCount} video clips) written`);

            // Quality preset args
            const quality = settings?.exportQuality || 'standard';
            // Resolve the real encoder (maps to NVENC when GPU is on + available).
            const resolvedCodec = resolveVideoEncoder(ffmpegBin, outCodec, !!settings?.useGpu, log);
            const isNvenc = resolvedCodec.includes('nvenc');
            const isHevc = resolvedCodec.includes('265') || resolvedCodec.includes('hevc');
            let qualityArgs: string[] = [];

            if (isNvenc) {
                // NVENC: presets p1 (fastest) … p7 (best); quality via -cq under -rc vbr.
                const nvPreset = quality === 'master' ? 'p6' : quality === 'draft' ? 'p2' : 'p4';
                if (isIntermediate) {
                    qualityArgs = ['-preset', 'p1', '-rc', 'vbr', '-cq', '12'];
                } else if (outBitrate > 0) {
                    qualityArgs = ['-preset', nvPreset, '-rc', 'vbr', '-b:v', `${outBitrate}k`, '-maxrate', `${Math.round(outBitrate * 1.5)}k`, '-bufsize', `${Math.round(outBitrate * 2)}k`];
                } else {
                    const cq = quality === 'master' ? '19' : quality === 'draft' ? '28' : '23';
                    qualityArgs = ['-preset', nvPreset, '-rc', 'vbr', '-cq', cq, '-b:v', '0'];
                }
                qualityArgs.push('-c:a', 'aac', '-b:a', `${isIntermediate ? 320 : outAudioBitrate}k`);
            } else if (isIntermediate) {
                qualityArgs = ['-preset', 'ultrafast', '-crf', '10', '-c:a', 'aac', '-b:a', '320k'];
            } else if (outBitrate > 0) {
                qualityArgs = ['-b:v', `${outBitrate}k`, '-maxrate', `${Math.round(outBitrate * 1.5)}k`, '-bufsize', `${Math.round(outBitrate * 2)}k`];
                if (quality === 'draft') qualityArgs.push('-preset', isHevc ? 'fast' : 'veryfast');
                else if (quality === 'master') qualityArgs.push('-preset', 'slow');
                else qualityArgs.push('-preset', isHevc ? 'medium' : 'medium');
                qualityArgs.push('-c:a', 'aac', '-b:a', `${outAudioBitrate}k`);
            } else {
                if (quality === 'master') qualityArgs = ['-crf', isHevc ? '20' : '17', '-preset', 'slow'];
                else if (quality === 'draft') qualityArgs = ['-crf', isHevc ? '30' : '28', '-preset', isHevc ? 'fast' : 'veryfast'];
                else qualityArgs = ['-crf', isHevc ? '24' : '20', '-preset', isHevc ? 'medium' : 'medium'];
                qualityArgs.push('-c:a', 'aac', '-b:a', `${outAudioBitrate}k`);
            }

            // Build full FFmpeg args
            // OOM FIX: Limit threads and filter concurrency to prevent unbounded memory usage.
            // Without these, FFmpeg decodes all inputs in parallel, exhausting RAM on complex timelines.
            const ffmpegArgs = [
                '-y',
                '-threads', '2',
                '-filter_threads', '1',
                '-filter_complex_threads', '1',
                ...inputArgs,
                '-filter_complex_script', filterFile,
                '-map', `[${finalVideoMap}]`,
                '-map', `[${finalAudioMap}]`,
                '-r', fps.toString(),
                '-c:v', resolvedCodec,
                '-pix_fmt', 'yuv420p',
                '-colorspace', 'bt709',
                '-color_trc', 'bt709',
                '-color_primaries', 'bt709',
                '-max_muxing_queue_size', '1024',
                '-movflags', '+faststart',
                ...qualityArgs,
                filePath
            ];

            log(`Spawning FFmpeg directly with ${ffmpegArgs.length} args`);

            // ── 6. SPAWN FFMPEG DIRECTLY (no PowerShell wrapper) ──
            const proc = spawn(ffmpegBin, ffmpegArgs, { windowsHide: true });
            activeExportProc = proc;
            let stderrLog = '';

            proc.stderr.on('data', (data: Buffer) => {
                const line = data.toString();
                stderrLog += line;
                try { event.sender.send('export-log', `[Monolithic:ffmpeg] ${line.trim()}`); } catch {}
                // Parse progress
                const timeMatch = line.match(/time=(\d+):(\d+):([0-9.]+)/);
                if (timeMatch) {
                    const currentTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
                    const totalDur = clips.reduce((sum: number, c: any) => {
                        if (c.type === 'audio') return sum;
                        return sum + ((c.endFrame ?? 0) - (c.startFrame ?? 0)) / fps;
                    }, 0);
                    if (totalDur > 0) {
                        const percent = Math.min(99, Math.round((currentTime / totalDur) * 100));
                        event.sender.send('export-progress', percent);
                    }
                }
            });

            proc.on('close', async (code: number) => {
                try { fs.unlinkSync(filterFile); } catch {}
                activeExportProc = null;

                if (code === 0) {
                    try {
                        const finalProbe = probeClipFile(ffmpegBin, filePath);
                        log(`Export COMPLETE! Output: ${filePath} | Duration: ${finalProbe.duration.toFixed(2)}s`);
                    } catch {
                        log('Export COMPLETE! Output: ' + filePath);
                    }
                    event.sender.send('export-progress', 100);
                    resolve({ success: true });
                } else {
                    // OOM detection: exit code -12 (ENOMEM) appears as unsigned 4294967284 on Windows
                    const isOOM = code === -12 || code === 4294967284 || stderrLog.includes('Cannot allocate memory');
                    log(`Export FAILED (code ${code})${isOOM ? ' — OUT OF MEMORY DETECTED' : ''}`);
                    log('FFmpeg stderr (last 1000 chars):\n' + stderrLog.slice(-1000));

                    if (isOOM) {
                        log('⚠ Monolithic engine ran out of memory on this project.');
                        log('  This timeline has too many inputs for a single-pass filter graph.');
                        log('  Recommendation: Switch to the Per-Clip engine in Export settings, which');
                        log('  renders each clip individually and avoids this memory limitation.');
                        try { event.sender.send('export-log', '[Monolithic] ⚠ OUT OF MEMORY — this project is too large for single-pass rendering. Switch to Per-Clip engine.'); } catch {}
                        // Clean up partial output
                        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
                        resolve({
                            success: false,
                            error: 'Out of memory: this project is too large for the Monolithic engine. Please switch to "Per-Clip" render engine in Export settings and try again.'
                        });
                    } else {
                        const errMsg = stderrLog.slice(-500).trim() || `FFmpeg exited with code ${code}`;
                        resolve({ success: false, error: errMsg });
                    }
                }
            });

            proc.on('error', (err: any) => {
                try { fs.unlinkSync(filterFile); } catch {}
                activeExportProc = null;
                console.error('[Monolithic] Spawn error:', err);
                resolve({ success: false, error: err.message || 'Failed to start FFmpeg' });
            });

        } catch (err: any) {
            console.error('[Monolithic] Setup error:', err);
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
                const r = await runFfmpegAsync(ffmpegBin, ['-y', '-i', clip.path, '-filter_complex_script', filterFile, '-map', '[v_out]', '-map', '[a_out]', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '15', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', intFile], `rr${i}`);
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

// ══════════════════════════════════════════════════════════════════════════════
// PREVIEW PROXY ENGINE
// Generates low-res FFmpeg preview proxies for clips with effects so the
// player can show exact rendered output. Uses the SAME filter builders
// (buildVideoFilter / buildClipAudioFilter) as the export engine.
// ══════════════════════════════════════════════════════════════════════════════

ipcMain.handle('generate-preview-proxy', async (_event, { clip: rawClip, settings }) => {
    const path = require('path');
    const crypto = require('crypto');
    const ffmpegBin = resolveFFmpegBin();

    try {
        // Normalize clip path
        const clip = { ...rawClip, path: normalizeClipPath(rawClip.path || '') };

        // Validate source exists
        if (!clip.path || clip.path.startsWith('blob:') || clip.path.startsWith('data:')) {
            return { success: false, error: 'Invalid source path (blob/data URL)' };
        }
        if (!fs.existsSync(clip.path)) {
            return { success: false, error: `Source not found: ${clip.path}` };
        }

        // Build a hash of all visual settings to detect changes
        const hashInput = JSON.stringify({
            path: clip.path,
            trimStartFrame: clip.trimStartFrame,
            trimEndFrame: clip.trimEndFrame,
            startFrame: clip.startFrame,
            endFrame: clip.endFrame,
            speed: clip.speed,
            reversed: clip.reversed,
            rotation: clip.rotation,
            flipH: clip.flipH,
            flipV: clip.flipV,
            zoomStart: clip.zoomStart,
            zoomEnd: clip.zoomEnd,
            zoomLevel: clip.zoomLevel,
            zoomOrigin: clip.zoomOrigin,
            effectIds: clip.effectIds,
            parametricEffects: clip.parametricEffects,
            colorGrading: clip.colorGrading,
            textOverlays: clip.textOverlays,
            shake: clip.shake,
            filmGrain: clip.filmGrain,
            vignette: clip.vignette,
            chromaticAberration: clip.chromaticAberration,
            sharpen: clip.sharpen,
            blurAmount: clip.blurAmount,
            chromaKey: clip.chromaKey,
            letterbox: clip.letterbox,
            volume: clip.volume,
            isMuted: clip.isMuted,
        });
        const hash = crypto.createHash('md5').update(hashInput).digest('hex');

        // Output path
        const proxyDir = path.join(app.getPath('userData'), 'preview_proxies');
        if (!fs.existsSync(proxyDir)) fs.mkdirSync(proxyDir, { recursive: true });
        const proxyPath = path.join(proxyDir, `${hash}.mp4`);

        // If proxy already exists, return it immediately
        if (fs.existsSync(proxyPath)) {
            return { success: true, proxyPath, hash };
        }

        // Low-res proxy settings: 640x360, 15fps, crf=28, ultrafast
        const proxyW = 640;
        const proxyH = 360;
        const proxyFps = 15;
        const projectFps = settings?.fps || 30;
        const es: any = {
            width: proxyW,
            height: proxyH,
            fps: proxyFps,
            projectFps: projectFps,
            quality: 'draft',
            codec: 'h264',
        };

        // Probe source
        const isImage = clip.type === 'image';
        const probe = probeClipFile(ffmpegBin, clip.path);
        const probeData = {
            width: clip.width || proxyW,
            height: clip.height || proxyH,
            duration: isImage ? 36000 : probe.duration,
        };

        // Compute timing
        const timing = computeClipTiming(clip, es, probeData);

        // Build filters using the same shared logic as the export engine
        const vf = buildVideoFilter(clip, es, probeData, { preSeeked: true });
        const af = buildClipAudioFilter(clip, es, probeData, { preSeeked: true });

        // Build FFmpeg args
        const inputs: string[] = isImage
            ? ['-loop', '1', '-t', (timing.srcDurSec + 0.1).toFixed(4), '-i', clip.path]
            : ['-ss', timing.seekSec.toFixed(4), '-i', clip.path];

        const args: string[] = [
            '-y',
            ...inputs,
            '-filter_complex', `[0:v]${vf}[v_out]${probe.hasAudio && !isImage ? `;[0:a]${af}[a_out]` : ''}`,
            '-map', '[v_out]',
            ...(probe.hasAudio && !isImage ? ['-map', '[a_out]'] : ['-an']),
            '-t', timing.outDurSec.toFixed(4),
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '28',
            '-r', String(proxyFps),
            ...(probe.hasAudio && !isImage ? ['-c:a', 'aac', '-b:a', '64k'] : []),
            '-movflags', '+faststart',
            proxyPath,
        ];

        console.log('[ProxyEngine] Generating proxy for', clip.filename, '→', proxyPath);

        // Run FFmpeg
        const result = await new Promise<{ code: number; stderr: string }>((resolve) => {
            const { spawn } = require('child_process');
            const p = spawn(ffmpegBin, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
            let stderr = '';
            p.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
            p.on('close', (code: number) => resolve({ code: code ?? 1, stderr }));
            p.on('error', (err: any) => resolve({ code: 1, stderr: err.message }));
        });

        if (result.code !== 0) {
            console.error('[ProxyEngine] FFmpeg failed:', result.stderr.slice(-500));
            // Clean up partial file
            try { if (fs.existsSync(proxyPath)) fs.unlinkSync(proxyPath); } catch {}
            return { success: false, error: `FFmpeg exited with code ${result.code}`, hash };
        }

        console.log('[ProxyEngine] ✅ Proxy ready:', proxyPath);
        return { success: true, proxyPath, hash };
    } catch (err: any) {
        console.error('[ProxyEngine] Error:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('invalidate-preview-proxy', async (_event, { hash }) => {
    const path = require('path');
    try {
        const proxyDir = path.join(app.getPath('userData'), 'preview_proxies');
        const proxyPath = path.join(proxyDir, `${hash}.mp4`);
        if (fs.existsSync(proxyPath)) {
            fs.unlinkSync(proxyPath);
            console.log('[ProxyEngine] Invalidated proxy:', hash);
        }
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});
