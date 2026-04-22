import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import fs from 'fs'
import { exec } from 'child_process'
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

process.env.DIST = join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : join(process.env.DIST, '../public')

let win: BrowserWindow | null
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

let bridgeServer: any = null;

function createWindow() {
    win = new BrowserWindow({
        icon: join(process.env.VITE_PUBLIC || '', 'icon-v2.png'),
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

// File Selection IPC
ipcMain.handle('select-files', async (_event, type?: 'video' | 'audio' | 'folder') => {
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

    let properties: any[] = ['openFile', 'multiSelections'];
    if (type === 'folder') {
        properties = ['openDirectory'];
    }

    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
        properties,
        filters: type === 'folder' ? undefined : filters
    });

    if (canceled) return { canceled: true }

    let pathsToProcess = filePaths;
    
    if (type === 'folder' && filePaths.length > 0) {
        try {
            const dirFiles = await fs.promises.readdir(filePaths[0]);
            pathsToProcess = dirFiles
                .map(f => join(filePaths[0], f))
                .filter(p => {
                    const ext = p.split('.').pop()?.toLowerCase();
                    return ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'aac', 'flac', 'jpg', 'png', 'gif'].includes(ext || '');
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

// Export Dialog
ipcMain.handle('show-export-dialog', async (_event, options) => {
    const { canceled, filePath } = await dialog.showSaveDialog(win!, {
        defaultPath: options?.defaultPath || 'output.mp4',
        filters: options?.filters || [{ name: 'Video File', extensions: ['mp4', 'mov'] }]
    })
    if (canceled || !filePath) return { canceled: true }
    return { canceled: false, filePath }
})

/*
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    MMMedia Pro — Export Pipeline                       ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║                                                                        ║
 * ║  ARCHITECTURE NOTES (for future developers):                           ║
 * ║                                                                        ║
 * ║  1. CLIP TYPES: The pipeline handles two distinct clip categories:     ║
 * ║     • VIDEO clips (type !== 'audio') — processed as interleaved        ║
 * ║       [video][audio] pairs fed into a concat filter.                   ║
 * ║     • AUDIO clips (type === 'audio') — background music tracks         ║
 * ║       processed separately and mixed into the concat output via amix.  ║
 * ║                                                                        ║
 * ║  2. VOLUME BEHAVIOR: The trailer generator sets volume=0 and           ║
 * ║     isMuted=true on video clips when audioMixStrategy='muted'.         ║
 * ║     This is INTENTIONAL for preview (mutes native video audio so       ║
 * ║     background music plays cleanly). During export, we override this   ║
 * ║     to ensure the concat chain has valid audio, but keep it silent     ║
 * ║     (volume=0) so the background music dominates via amix.             ║
 * ║                                                                        ║
 * ║  3. PATH HANDLING: Clip paths may arrive as:                           ║
 * ║     • Raw filesystem paths: "D:\Music\song.mp3" (correct for FFmpeg)   ║
 * ║     • file:// URLs: "file://D:\Music\song.mp3" (must be stripped)      ║
 * ║     • blob:/http:/data: URLs (invalid — filtered out)                  ║
 * ║                                                                        ║
 * ║  4. FILTER CHAIN: Written to a temp .txt file and passed via           ║
 * ║     -filter_complex_script to avoid Windows CLI quoting issues.        ║
 * ║     Video clips → concat → [concat_v] + [concat_a]                    ║
 * ║     Audio clips → amix with [concat_a] → [final_a]                    ║
 * ║                                                                        ║
 * ║  ⚠ IMPORTANT: Any changes to clip types, volume, or path handling     ║
 * ║    MUST account for both video AND audio export paths. Test exports    ║
 * ║    with background music to verify the amix pipeline still works.      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
ipcMain.handle('export-project', async (event, { filePath, clips: rawClips, settings, isIntermediate }) => {
        let clips = rawClips;
    return new Promise(async (resolve) => {
        try {
            const { execFileSync, spawn } = require('child_process');
            const path = require('path');
            const os = require('os');

            // Resolve FFmpeg binary path
            let ffmpegBin = '';
            const devPath = join(app.getAppPath(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
            const prodPath = ffmpegStatic?.replace('app.asar', 'app.asar.unpacked') || '';
            
            if (!app.isPackaged && fs.existsSync(devPath)) {
                ffmpegBin = devPath;
            } else if (prodPath && fs.existsSync(prodPath)) {
                ffmpegBin = prodPath;
            } else if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
                ffmpegBin = ffmpegStatic;
            } else {
                ffmpegBin = 'ffmpeg'; // fallback to system PATH
            }
            console.log('[Export] FFmpeg binary:', ffmpegBin);

            // Probe using execFileSync — parse stderr from thrown error
            const probeClip = (probePath: string): { hasAudio: boolean; duration: number } => {
                try {
                    execFileSync(ffmpegBin, ['-i', probePath], 
                        { timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
                    return { hasAudio: false, duration: 0 };
                } catch (e: any) {
                    const output = (e.stderr ? e.stderr.toString() : '') + (e.stdout ? e.stdout.toString() : '') + (e.message || '');
                    const hasAudio = /Stream\s+#\d+:\d+.*Audio/i.test(output);
                    const durMatch = output.match(/Duration:\s*(\d+):(\d+):([0-9.]+)/);
                    let duration = 0;
                    if (durMatch) {
                        duration = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3]);
                    }
                    console.log(`[Export] Probe "${path.basename(probePath)}": audio=${hasAudio}, dur=${duration.toFixed(1)}s`);
                    return { hasAudio, duration };
                }
            };

            // ── PATH NORMALIZATION ──────────────────────────────────────────────
            // Strip file:// protocol prefix from paths — FFmpeg needs raw filesystem paths.
            // Audio clips from the Trailer Generator may arrive with file:// URLs
            // (set in TrailerPlayer.tsx via settings.audioUrl). This MUST be stripped
            // before passing to FFmpeg, otherwise the input will fail to open.
            clips = clips.map((clip: any) => {
                let cleanPath = clip.path;
                if (cleanPath && cleanPath.startsWith('file:///')) {
                    cleanPath = cleanPath.slice(8); // Remove 'file:///' → 'D:/Music/song.mp3'
                } else if (cleanPath && cleanPath.startsWith('file://')) {
                    cleanPath = cleanPath.slice(7); // Remove 'file://' → 'D:/Music/song.mp3'
                }
                // Decode any URL-encoded characters (e.g. %20 → space)
                if (cleanPath && cleanPath !== clip.path) {
                    try { cleanPath = decodeURIComponent(cleanPath); } catch {}
                }
                if (cleanPath !== clip.path) {
                    console.log(`[Export] Path normalized: "${clip.path?.substring(0, 60)}" → "${cleanPath}"`);
                }
                return { ...clip, path: cleanPath };
            });

            // Filter out clips with non-filesystem paths (blob:, http:, data: URLs)
            const isValidPath = (p: string) => p && !p.startsWith('blob:') && !p.startsWith('http:') && !p.startsWith('data:');
            const validClips = clips.filter((clip: any) => {
                if (!isValidPath(clip.path)) {
                    console.log(`[Export] Skipping clip "${clip.filename}" — invalid path: ${clip.path?.substring(0, 60)}`);
                    return false;
                }
                return true;
            });
            clips = validClips;

            // Log audio clips explicitly for debugging
            const audioClips = clips.filter((c: any) => c.type === 'audio');
            console.log(`[Export] Total clips: ${clips.length} | Video/Image: ${clips.length - audioClips.length} | Audio (background): ${audioClips.length}`);
            audioClips.forEach((c: any, i: number) => {
                console.log(`[Export] Audio clip ${i}: "${c.filename}" path="${c.path}" volume=${c.volume} muted=${c.isMuted}`);
            });

            // Probe all unique source files (many clips may share the same source)
            const probeCache = new Map<string, { hasAudio: boolean; duration: number }>();
            const probeResults: { hasAudio: boolean; duration: number }[] = clips.map((clip: any) => {
                if (clip.type === 'audio') return { hasAudio: true, duration: 9999 };
                if (probeCache.has(clip.path)) return probeCache.get(clip.path)!;
                const result = probeClip(clip.path);
                probeCache.set(clip.path, result);
                return result;
            });

            // Render log file
            const renderLogPath = join(app.getAppPath(), 'render_log.txt');
            const log = (msg: string) => {
                const line = `[${new Date().toISOString()}] ${msg}\n`;
                fs.appendFileSync(renderLogPath, line);
                console.log('[Export]', msg);
            };
            fs.writeFileSync(renderLogPath, `=== MMMedia Pro Render Log ===\nStarted: ${new Date().toISOString()}\nOutput: ${filePath}\nClips: ${clips.length}\n\n`);

            const fps = settings?.exportFps && settings.exportFps > 0 ? settings.exportFps : (settings?.fps || 30);
            const outW = settings?.outputWidth || 1920;
            const outH = settings?.outputHeight || 1080;
            const outCodec = settings?.outputCodec || 'libx264';
            const outBitrate = settings?.outputBitrate || 0;
            const outAudioBitrate = settings?.outputAudioBitrate || 256;
            log(`Output: ${outW}x${outH} ${outCodec} @ ${outBitrate > 0 ? outBitrate + 'kbps' : 'CRF'} | ${fps}fps | audio ${outAudioBitrate}k`);

            // Build filter_complex content
            let filterChains: string[] = [];
            let inputArgs: string[] = [];
            let videoInputCount = 0;
            // Track individual prepared video/audio streams for xfade or concat
            let preparedVideoStreams: string[] = [];
            let preparedAudioStreams: string[] = [];
            let clipDurations: number[] = []; // output duration of each video clip (after speed)
            let clipTransitions: { enter: string; durationFrames: number }[] = [];

            // ── TRANSITION TYPE MAPPING ────────────────────────────────────────
            // Maps CSS-based transition types to FFmpeg xfade transition names
            const transitionToXfade: Record<string, string> = {
                'crossfade': 'fade',
                'slide-left': 'slideleft',
                'slide-right': 'slideright',
                'slide-up': 'slideup',
                'slide-down': 'slidedown',
                'wipe-left': 'wipeleft',
                'wipe-right': 'wiperight',
                'wipe-up': 'wipeup',
                'wipe-down': 'wipedown',
                'push-left': 'slideleft',
                'push-right': 'slideright',
                'zoom-in': 'fadegrays',
                'zoom-out': 'fadeblack',
                'spin-in': 'circleopen',
                'glitch-cut': 'pixelize',
                'none': '',
            };

            clips.forEach((clip: any, index: number) => {
                // Fast-seek: -ss before -i makes FFmpeg seek by keyframes (instant)
                const seekTo = clip.trimStartFrame / fps;
                inputArgs.push('-ss', seekTo.toFixed(4), '-i', clip.path);

                const sourceDuration = probeResults[index].duration;
                
                let clipDur = (clip.trimEndFrame - clip.trimStartFrame) / fps;
                
                // Clamp seekTo to actual source duration
                let seekClamped = seekTo;
                if (sourceDuration > 0.5) {
                    if (seekClamped >= sourceDuration) {
                        log(`Clamping clip ${index}: seek ${seekClamped.toFixed(1)}s > source ${sourceDuration.toFixed(1)}s`);
                        seekClamped = Math.max(0, sourceDuration - clipDur - 0.5);
                    }
                    if (seekClamped < 0) seekClamped = 0;
                    if (seekClamped + clipDur > sourceDuration) {
                        clipDur = Math.max(0.1, sourceDuration - seekClamped - 0.05);
                    }
                    // Update the -ss arg we already pushed
                    inputArgs[inputArgs.length - 3] = seekClamped.toFixed(4);
                }
                if (clipDur < 0.03) clipDur = 0.1;

                // ── BLACK SCREEN PREVENTION (export-time) ──
                // Skip any clip that would produce less than 1 frame of output
                if (clipDur < (1 / fps)) {
                    log(`⚠ Skipping clip ${index} "${clip.filename}" — duration ${clipDur.toFixed(4)}s is sub-frame`);
                    return;  // skip in forEach
                }

                log(`Clip ${index}: ${clip.filename} | seek=${seekClamped.toFixed(2)}s dur=${clipDur.toFixed(2)}s speed=${clip.speed || 1} srcDur=${sourceDuration.toFixed(1)}s audio=${probeResults[index].hasAudio}`);

                let speed = clip.speed || 1.0;
                if (clip.speedRampId) {
                    if (clip.speedRampId.includes('slow')) speed = 0.5;
                    else if (clip.speedRampId.includes('fast') || clip.speedRampId.includes('speed_up')) speed = 2.0;
                    else if (clip.speedRampId.includes('bullet')) speed = 0.25;
                }

                // ── VOLUME CALCULATION ──────────────────────────────────────────
                // For AUDIO clips (background music): Always use their own volume.
                //   These are background music tracks that should play at the volume
                //   the user set (typically 100). They are NOT affected by the trailer
                //   generator's audioMixStrategy which only mutes VIDEO clip audio.
                //
                // For VIDEO clips: Use clip.volume and clip.isMuted as-is.
                //   When audioMixStrategy='muted', video clips have volume=0 and
                //   isMuted=true. This is correct — the video's embedded audio should
                //   be silent so the background music (via amix) dominates.
                let finalVolume: number;
                if (clip.type === 'audio') {
                    // Background music: always export at intended volume
                    finalVolume = (clip.volume !== undefined ? clip.volume : 100) / 100;
                    log(`Audio clip ${index}: "${clip.filename}" → volume=${finalVolume}`);
                } else {
                    const volume = (clip.volume !== undefined ? clip.volume : 100) / 100;
                    const mute = clip.isMuted ? 0 : 1;
                    finalVolume = volume * mute;
                }

                if (clip.type === 'audio') {
                    filterChains.push(
                        `[${index}:a]atrim=start=0:duration=${clipDur.toFixed(4)},asetpts=PTS-STARTPTS,volume=${finalVolume}[a_bg_${index}]`
                    );
                } else {
                    const vOut = `v${index}`;
                    const aOut = `a${index}`;

                    // Video chain — trim starts at 0 since -ss already seeked
                    let vf = `[${index}:v]trim=start=0:duration=${clipDur.toFixed(4)},setpts=PTS-STARTPTS`;
                    vf += `,scale=${outW}:${outH}:force_original_aspect_ratio=decrease,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2,setsar=1`;

                    // Effects
                    if (clip.effectIds && clip.effectIds.length > 0) {
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

                    // ── Visual Texture Filters ──
                    const visualTexture = (clip as any)._visualTexture || 'none';
                    if (visualTexture === 'grain') {
                        vf += ',noise=alls=15:allf=t';
                    } else if (visualTexture === 'chromatic') {
                        vf += ',rgbashift=rh=-3:bh=3';
                    } else if (visualTexture === 'motion-blur') {
                        vf += ',tblend=all_mode=average';
                    } else if (visualTexture === 'vintage') {
                        vf += ',noise=alls=20:allf=t,eq=saturation=0.6:contrast=1.1,colorbalance=rs=.1:gs=-.05:bs=-.1';
                    }

                    vf += `,setpts=${(1 / speed).toFixed(4)}*PTS[${vOut}]`;
                    filterChains.push(vf);

                    // Audio chain
                    const hasRealAudio = probeResults[index].hasAudio && clip.type !== 'image';
                    const outDur = clipDur / speed;

                    if (hasRealAudio) {
                        let atempoChain = '';
                        if (speed !== 1.0) {
                            let rem = speed;
                            const parts: string[] = [];
                            while (rem > 2.0) { parts.push('atempo=2.0'); rem /= 2.0; }
                            while (rem < 0.5) { parts.push('atempo=0.5'); rem /= 0.5; }
                            parts.push(`atempo=${rem.toFixed(4)}`);
                            atempoChain = ',' + parts.join(',');
                        }
                        filterChains.push(
                            `[${index}:a]atrim=start=0:duration=${clipDur.toFixed(4)},asetpts=PTS-STARTPTS${atempoChain},volume=${finalVolume}[${aOut}]`
                        );
                    } else {
                        filterChains.push(`anullsrc=r=44100:cl=stereo[sil_${index}]`);
                        filterChains.push(`[sil_${index}]atrim=start=0:duration=${outDur.toFixed(4)},asetpts=PTS-STARTPTS[${aOut}]`);
                    }

                    preparedVideoStreams.push(`[${vOut}]`);
                    preparedAudioStreams.push(`[${aOut}]`);
                    clipDurations.push(outDur);

                    // Extract transition metadata
                    let enterType = 'none';
                    if (clip.transitionEnter) {
                        const te = Array.isArray(clip.transitionEnter) ? clip.transitionEnter[0] : clip.transitionEnter;
                        if (te && te !== 'none') enterType = te;
                    }
                    clipTransitions.push({
                        enter: enterType,
                        durationFrames: clip.transitionDurationFrames || 0,
                    });

                    videoInputCount++;
                }
            });

            if (videoInputCount === 0) {
                resolve({ success: false, error: 'No video clips to export.' });
                return;
            }

            // ── TRANSITION-AWARE FILTER GRAPH ─────────────────────────────────
            // Determine if we should use xfade transitions or simple concat
            const hasTransitions = clipTransitions.some((t, i) => i > 0 && t.enter !== 'none' && t.durationFrames > 0);

            let finalVideoMap = '';
            let finalAudioMap = '';

            if (hasTransitions && videoInputCount > 1) {
                log(`Building xfade transition chain for ${videoInputCount} clips`);

                // ── VIDEO XFADE CHAIN ──
                // Cascading: xfade(clip0, clip1) → xfade(result, clip2) → ...
                let prevVideoLabel = preparedVideoStreams[0]; // e.g. [v0]
                let accumulatedDuration = clipDurations[0]; // running output duration

                for (let i = 1; i < videoInputCount; i++) {
                    const trans = clipTransitions[i];
                    const transType = transitionToXfade[trans.enter] || 'fade';
                    const transDurSec = Math.min(trans.durationFrames / fps, accumulatedDuration * 0.4, clipDurations[i] * 0.4);
                    const transOffset = Math.max(0, accumulatedDuration - transDurSec);

                    if (trans.enter !== 'none' && transDurSec > 0.03) {
                        const outLabel = i === videoInputCount - 1 ? '[concat_v]' : `[xf_v${i}]`;
                        filterChains.push(
                            `${prevVideoLabel}${preparedVideoStreams[i]}xfade=transition=${transType}:duration=${transDurSec.toFixed(4)}:offset=${transOffset.toFixed(4)}${outLabel}`
                        );
                        prevVideoLabel = outLabel;
                        accumulatedDuration = transOffset + clipDurations[i]; // overlap reduces total
                    } else {
                        // No transition for this pair — concat these two
                        const outLabel = i === videoInputCount - 1 ? '[concat_v]' : `[xf_v${i}]`;
                        filterChains.push(
                            `${prevVideoLabel}${preparedVideoStreams[i]}concat=n=2:v=1:a=0${outLabel}`
                        );
                        prevVideoLabel = outLabel;
                        accumulatedDuration += clipDurations[i];
                    }
                }

                // ── AUDIO CROSSFADE CHAIN ──
                // Mirror the video chain: acrossfade where xfade is used, concat elsewhere
                let prevAudioLabel = preparedAudioStreams[0];
                let accAudioDur = clipDurations[0];

                for (let i = 1; i < videoInputCount; i++) {
                    const trans = clipTransitions[i];
                    const transDurSec = Math.min(trans.durationFrames / fps, accAudioDur * 0.4, clipDurations[i] * 0.4);

                    if (trans.enter !== 'none' && transDurSec > 0.03) {
                        const outLabel = i === videoInputCount - 1 ? '[concat_a]' : `[xf_a${i}]`;
                        filterChains.push(
                            `${prevAudioLabel}${preparedAudioStreams[i]}acrossfade=d=${transDurSec.toFixed(4)}:c1=tri:c2=tri${outLabel}`
                        );
                        prevAudioLabel = outLabel;
                        accAudioDur = (accAudioDur - transDurSec) + clipDurations[i];
                    } else {
                        const outLabel = i === videoInputCount - 1 ? '[concat_a]' : `[xf_a${i}]`;
                        filterChains.push(
                            `${prevAudioLabel}${preparedAudioStreams[i]}concat=n=2:v=0:a=1${outLabel}`
                        );
                        prevAudioLabel = outLabel;
                        accAudioDur += clipDurations[i];
                    }
                }

                finalVideoMap = 'concat_v';
                finalAudioMap = 'concat_a';
                log(`Xfade chain complete: ${videoInputCount - 1} transitions applied`);
            } else {
                // ── SIMPLE CONCAT (no transitions) ────────────────────────────
                log('No transitions — using simple concat');
                const concatPairs = preparedVideoStreams.map((v, i) => `${v}${preparedAudioStreams[i]}`).join('');
                filterChains.push(
                    `${concatPairs}concat=n=${videoInputCount}:v=1:a=1[concat_v][concat_a]`
                );
                finalVideoMap = 'concat_v';
                finalAudioMap = 'concat_a';
            }

            // ── BACKGROUND AUDIO MIXING ────────────────────────────────────────
            // Audio-type clips (background music) are mixed into the concat audio
            // output via amix. The concat_a stream (video clips' embedded audio)
            // is the first input; background music streams are additional inputs.
            // duration=first ensures the output length matches the video duration.
            //
            // ⚠ If video clip audio is muted (volume=0 from trailer generator),
            //   the concat_a stream is effectively silent, and only the background
            //   music will be audible in the final output. This is the intended
            //   behavior for trailer-style edits with a music overlay.
            const audioBgOuts = clips.map((c: any, i: number) => c.type === 'audio' ? `[a_bg_${i}]` : null).filter(Boolean);

            if (audioBgOuts.length > 0) {
                log(`Mixing ${audioBgOuts.length} background audio track(s) via amix: ${audioBgOuts.join(', ')}`);
                filterChains.push(`[concat_a]${audioBgOuts.join('')}amix=inputs=${audioBgOuts.length + 1}:duration=first:dropout_transition=0[final_a]`);
                finalAudioMap = 'final_a';
            } else {
                log('No background audio tracks — using concat audio directly.');
            }

            // Write filter_complex to temp file (avoids all Windows quoting issues)
            const filterScript = filterChains.join(';\n');
            const tmpDir = os.tmpdir();
            const filterFile = path.join(tmpDir, `mmm_filter_${Date.now()}.txt`);
            fs.writeFileSync(filterFile, filterScript, 'utf-8');
            log(`Filter script (${filterChains.length} chains, ${videoInputCount} video clips) written to: ${filterFile}`);
            log(`--- FILTER SCRIPT START ---\n${filterScript}\n--- FILTER SCRIPT END ---`);

            // Quality preset args
            const quality = settings?.exportQuality || 'standard';
            const isHevc = outCodec === 'libx265';
            let qualityArgs: string[] = [];

            if (isIntermediate) {
                qualityArgs = ['-preset', 'ultrafast', '-crf', '10', '-c:a', 'aac', '-b:a', '320k'];
            } else if (outBitrate > 0) {
                // Bitrate mode (social media presets)
                qualityArgs = [
                    '-b:v', `${outBitrate}k`,
                    '-maxrate', `${Math.round(outBitrate * 1.5)}k`,
                    '-bufsize', `${Math.round(outBitrate * 2)}k`,
                ];
                if (quality === 'draft') qualityArgs.push('-preset', isHevc ? 'fast' : 'veryfast');
                else if (quality === 'master') qualityArgs.push('-preset', isHevc ? 'slow' : 'slow');
                else qualityArgs.push('-preset', isHevc ? 'medium' : 'medium');
                qualityArgs.push('-c:a', 'aac', '-b:a', `${outAudioBitrate}k`);
            } else {
                // CRF mode (professional presets)
                if (quality === 'master') qualityArgs = ['-crf', isHevc ? '20' : '17', '-preset', isHevc ? 'slow' : 'slow'];
                else if (quality === 'draft') qualityArgs = ['-crf', isHevc ? '30' : '28', '-preset', isHevc ? 'fast' : 'veryfast'];
                else qualityArgs = ['-crf', isHevc ? '24' : '20', '-preset', isHevc ? 'medium' : 'medium'];
                qualityArgs.push('-c:a', 'aac', '-b:a', `${outAudioBitrate}k`);
            }

            log(`Quality: ${quality} | codec=${outCodec} hevc=${isHevc} bitrate=${outBitrate > 0 ? outBitrate + 'k' : 'CRF'} args=[${qualityArgs.join(' ')}]`);

            // Build full FFmpeg args
            const ffmpegArgs = [
                '-y',  // overwrite output
                ...inputArgs,
                '-filter_complex_script', filterFile,
                '-map', `[${finalVideoMap}]`,
                '-map', `[${finalAudioMap}]`,
                '-c:v', outCodec,
                '-pix_fmt', 'yuv420p',
                '-colorspace', 'bt709',
                '-color_trc', 'bt709',
                '-color_primaries', 'bt709',
                '-movflags', '+faststart',
                ...qualityArgs,
                filePath
            ];

            console.log('[Export] Spawning FFmpeg with', ffmpegArgs.length, 'args');

            // Spawn FFmpeg directly
            const proc = spawn(ffmpegBin, ffmpegArgs, { windowsHide: true });
            let stderrLog = '';

            proc.stderr.on('data', (data: Buffer) => {
                const line = data.toString();
                stderrLog += line;
                // Parse progress from FFmpeg stderr
                const timeMatch = line.match(/time=(\d+):(\d+):([0-9.]+)/);
                if (timeMatch) {
                    const currentTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
                    // Estimate total duration from clips
                    const totalDur = clips.reduce((sum: number, c: any) => {
                        if (c.type === 'audio') return sum;
                        return sum + (c.endFrame - c.startFrame) / fps;
                    }, 0);
                    if (totalDur > 0) {
                        const percent = Math.min(99, Math.round((currentTime / totalDur) * 100));
                        event.sender.send('export-progress', percent);
                    }
                }
            });

            proc.on('close', (code: number) => {
                // Clean up temp file
                try { fs.unlinkSync(filterFile); } catch {}

                if (code === 0) {
                    log('Export COMPLETE! Output: ' + filePath);
                    event.sender.send('export-progress', 100);
                    resolve({ success: true });
                } else {
                    log(`Export FAILED (code ${code})`);
                    log('FFmpeg stderr (last 3000 chars):\n' + stderrLog.slice(-3000));
                    const errMsg = stderrLog.slice(-500).trim() || `FFmpeg exited with code ${code}`;
                    resolve({ success: false, error: errMsg });
                }
            });

            proc.on('error', (err: any) => {
                try { fs.unlinkSync(filterFile); } catch {}
                console.error('[Export] Spawn error:', err);
                resolve({ success: false, error: err.message || 'Failed to start FFmpeg' });
            });

        } catch (err: any) {
            console.error('[Export] Setup error:', err);
            resolve({ success: false, error: err.message || 'Unexpected export setup error' });
        }
    });
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
