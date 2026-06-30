import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Film, FileCode, MonitorUp, Share, Flame } from 'lucide-react';
import { sendCurrentProjectToEnder } from '../../lib/enderSend';
import { useClipStore } from '../../store/clipStore';
import { useProjectStore } from '../../store/projectStore';
import { useExportSettingsStore } from '../../store/exportSettingsStore';
import { useMediaStore } from '../../store/mediaStore';
import { useGodModeStore } from '../../store/godModeStore';
import { generateManifest } from '../../lib/manifestBridge';
import clsx from 'clsx';
import { toast } from '../../components/Toast';
import { EXPORT_PRESETS, getOutputDimensions } from '../../lib/exportPresets';
import { expandClipToBoomerang, BOOMERANG_PRESETS, getBoomerangPreset } from '../../lib/boomerang';
import { Mp4Tab } from './Mp4Tab';
import { PremiereTab } from './PremiereTab';
import { AmeTab } from './AmeTab';
import { ExportCelebration } from './ExportCelebration';
import { QueueItem } from './Mp4Tab';
import { v4 as uuidv4 } from 'uuid';

export const ExportTab: React.FC = () => {
    const { clips, trackMutes, setClips } = useClipStore();
    const { settings } = useProjectStore();
    const {
        activeTab, setActiveTab,
        selectedPresetId, exportQuality, orientation, selectedFps,
        setLastExportPath, setIsExporting, renderEngine, useGpu,
        queuedEdits, removeQueuedEdit,
    } = useExportSettingsStore();

    // Serial queue drain: when a render finishes, load the next edit that was
    // generated while we were busy, so the queue actually advances instead of
    // accumulating with no consumer. The user then exports it (one at a time).
    const drainQueue = useCallback(() => {
        const { queuedEdits: q } = useExportSettingsStore.getState();
        if (q.length === 0) return;
        const next = q[0];
        // Preserve manually-imported audio, like the generator commit does.
        const existing = useClipStore.getState().clips;
        const manualAudio = existing.filter(c => c.type === 'audio' && !(c.origin === 'auto' && c.track === 101));
        setClips([...(next.clips as any[]), ...manualAudio]);
        removeQueuedEdit(next.id);
        const remaining = q.length - 1;
        toast.success(`Loaded "${next.label}" from the render queue${remaining > 0 ? ` (${remaining} more queued)` : ''}. Ready to export.`);
    }, [setClips, removeQueuedEdit]);

    const [isExportingDirect, setIsExportingDirect] = useState(false);
    const [directProgress, setDirectProgress] = useState(0);
    const [isExportingAME, setIsExportingAME] = useState(false);
    const [ameProgress, setAmeProgress] = useState(0);
    const [isExportingManifest, setIsExportingManifest] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const exportStartTime = useRef(0);

    // Dual engine progress tracking (for 'both' mode)
    const [perClipProgress, setPerClipProgress] = useState(0);
    const [monolithicProgress, setMonolithicProgress] = useState(0);

    const [exportReport, setExportReport] = useState<{
        path: string; presetName: string; resolution: string;
        codec: string; duration: string; clipCount: number;
        elapsedSec: number; fileName: string;
    } | null>(null);

    // ── EXPORT LOG (persists across exports) ──
    const [exportLog, setExportLog] = useState<string[]>([]);
    const addLog = useCallback((msg: string) => {
        const ts = new Date().toLocaleTimeString();
        setExportLog(prev => [...prev, `[${ts}] ${msg}`]);
    }, []);

    // ── EXPORT QUEUE ──
    const [exportQueue, setExportQueue] = useState<QueueItem[]>([]);
    const queueProcessingRef = useRef(false);

    const selectedPreset = useMemo(() =>
        EXPORT_PRESETS.find(p => p.id === selectedPresetId) || EXPORT_PRESETS.find(p => p.id === 'hd_1080')!,
        [selectedPresetId]);
    const outputDims = useMemo(() => getOutputDimensions(selectedPreset, orientation), [selectedPreset, orientation]);
    const totalDuration = useMemo(() => {
        const vc = clips.filter(c => c.type !== 'audio');
        if (vc.length === 0) return 0;
        return Math.max(...vc.map(c => c.endFrame)) / (settings.fps || 30);
    }, [clips, settings.fps]);

    /** Build a unique export filename: project_FolderName_HHmmss */
    const buildExportName = useCallback(() => {
        const safeName = settings.name?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'mmmedia';
        // Include source folder suffix if media was imported via folder
        const { recentFolders } = useMediaStore.getState();
        const folderSuffix = recentFolders.length > 0
            ? `_${recentFolders[0].name.replace(/[^a-z0-9]/gi, '_')}`
            : '';
        // Exact timestamp for uniqueness
        const now = new Date();
        const ts = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
        return `${safeName}${folderSuffix}_${ts}`;
    }, [settings.name]);

    const getExportClips = () => {
        const { trackVolumes } = useClipStore.getState();
        // Track 2 mute controls embedded VIDEO audio (linked audio from the video files).
        // It must NOT affect audio-type clips (background music), which live on track 101+.
        const audio1Muted = trackMutes[2] ?? false;

        // ── DIAGNOSTIC: Log clip counts before filtering ──
        const storeAudioClips = clips.filter(c => c.type === 'audio');
        console.log(`[ExportTab] getExportClips — ${clips.length} total clips in store, ${storeAudioClips.length} are audio type`);
        storeAudioClips.forEach((c, i) => console.log(`  Audio[${i}]: track=${c.track} vol=${c.volume} path=${c.path?.substring(0,60)} muted=${trackMutes[c.track]}`));
        console.log(`[ExportTab] Track volumes:`, trackVolumes);

        let ec = clips.map(c => {
            // ── AUDIO-TYPE CLIPS: background music, SFX, etc. ──
            // These must NEVER be affected by track-2 (A1/video-audio) mute or volume.
            // Remap legacy track 2 → 101 FIRST, then apply the correct track's volume.
            if (c.type === 'audio') {
                const audioTrack = c.track === 2 ? 101 : (c.track ?? 101);
                const audioTrackVol = trackVolumes[audioTrack] ?? 100;
                const effectiveVol = Math.round(((c.volume ?? 100) * audioTrackVol) / 100);
                console.log(`[ExportTab] Audio clip "${c.filename}": track ${c.track}→${audioTrack}, clipVol=${c.volume}, trackVol=${audioTrackVol}, effectiveVol=${effectiveVol}`);
                return { ...c, track: audioTrack, volume: effectiveVol };
            }

            // ── VIDEO/IMAGE CLIPS: embedded audio controlled by A1 ──
            const audio1Vol = trackVolumes[2] ?? 100;
            if (audio1Muted) {
                return { ...c, volume: 0, isMuted: true };
            }
            return { ...c, volume: audio1Vol, isMuted: false };
        });

        // Filter out audio clips only if their SPECIFIC track is muted (101, 102, etc.)
        // Never filter by trackMutes[2] — that's for video embedded audio only
        ec = ec.filter(c => {
            if (c.type === 'audio') {
                const audioTrackMuted = trackMutes[c.track] ?? false;
                if (audioTrackMuted) {
                    console.log(`[ExportTab] Filtering out muted audio clip "${c.filename}" on track ${c.track}`);
                }
                return !audioTrackMuted;
            }
            return true;
        });

        // ── RESOLVE BLOB URLs → filesystem paths for audio clips ──
        // Blob URLs work for in-browser playback but FFmpeg can't open them.
        // Try to resolve via godModeStore or window global (set by TrailerWizard).
        ec = ec.map(c => {
            if (c.type === 'audio' && c.path?.startsWith('blob:')) {
                console.warn(`[ExportTab] Audio clip "${c.filename}" has blob URL — attempting resolution`);
                // Try godModeStore (Zustand state)
                const gmPath = useGodModeStore.getState().audioFilePath;
                if (gmPath && !gmPath.startsWith('blob:') && !gmPath.startsWith('http:')) {
                    let resolved = gmPath;
                    if (resolved.startsWith('file:///')) resolved = resolved.slice(8);
                    else if (resolved.startsWith('file://')) resolved = resolved.slice(7);
                    try { resolved = decodeURIComponent(resolved); } catch {}
                    console.log(`[ExportTab] Resolved via godModeStore: ${resolved}`);
                    return { ...c, path: resolved };
                }
                // Try window global
                const winPath = (window as any).__godModeAudioFilePath;
                if (winPath && !winPath.startsWith('blob:') && !winPath.startsWith('http:')) {
                    console.log(`[ExportTab] Resolved via window global: ${winPath}`);
                    return { ...c, path: winPath };
                }
                console.error(`[ExportTab] ⚠ Could not resolve blob URL for "${c.filename}" — audio will be missing from export`);
            }
            return c;
        });

        return ec;
    };

    useEffect(() => {
        const cleanupProgress = window.ipcRenderer.onExportProgress((progress) => {
            if (isExportingAME) setAmeProgress(progress);
            if (isExportingDirect) {
                // In 'both' mode, progress comes interleaved — we track via log prefixes
                setDirectProgress(progress);
            }
        });
        // Subscribe to real-time export log stream from main process
        const cleanupLog = window.ipcRenderer.onExportLog?.((msg: string) => {
            const ts = new Date().toLocaleTimeString();
            setExportLog(prev => [...prev, `[${ts}] ${msg}`]);
            // Track per-engine progress in 'both' mode via log prefixes
            if (renderEngine === 'both') {
                const progressMatch = msg.match(/export-progress.*?(\d+)/);
                if (msg.includes('[Per-Clip]') && progressMatch) setPerClipProgress(Number(progressMatch[1]));
                if (msg.includes('[Monolithic]') && progressMatch) setMonolithicProgress(Number(progressMatch[1]));
            }
        });
        return () => { cleanupProgress(); cleanupLog?.(); };
    }, [isExportingAME, isExportingDirect, renderEngine]);

    const [isSendingEnder, setIsSendingEnder] = useState(false);
    const handleSendToEnder = async () => {
        if (clips.length === 0) { toast.warning('Timeline is empty!'); return; }
        setIsSendingEnder(true);
        try {
            const res = await sendCurrentProjectToEnder();
            if (res.success) {
                toast.success(res.transport === 'mailbox'
                    ? 'Queued to Ender (mailbox) — open Ender to render'
                    : 'Sent to Ender — rendering in the queue');
                addLog(`Sent to Ender via ${res.transport}${res.id ? ` (job ${res.id.slice(0, 8)})` : ''}`);
            } else {
                toast.error(`Send to Ender failed: ${res.error || 'unknown error'}`);
            }
        } catch (e: any) {
            toast.error(`Send to Ender failed: ${e?.message || e}`);
        } finally {
            setIsSendingEnder(false);
        }
    };

    const handleExportDirect = async () => {
        if (clips.length === 0) { toast.warning('Timeline is empty!'); return; }
        try {
            setIsExportingDirect(true); setDirectProgress(0); setExportReport(null); setIsExporting(true);
            exportStartTime.current = Date.now();
            addLog(`Export started — ${selectedPreset.name} (${exportQuality})`);
            const safeName = settings.name?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'mmmedia_project';
            const { canceled, filePath } = await window.ipcRenderer.showExportDialog({
                defaultPath: `${buildExportName()}.${selectedPreset.ext}`,
                filters: [{ name: `${selectedPreset.codec === 'libx265' ? 'HEVC' : 'H.264'} Video`, extensions: [selectedPreset.ext] }]
            });
            if (canceled || !filePath) { setIsExportingDirect(false); setIsExporting(false); return; }
            let exportClips = getExportClips();

            // ── PRE-FLIGHT VALIDATION: Repair clips with bad trim data ──
            // The old (reliable) system sent raw clips — no repair needed.
            // We only repair truly broken data, using timeline data as source of truth.
            let repairCount = 0;
            exportClips = exportClips.map(c => {
                if (c.type === 'audio') return c;
                const trimStart = c.trimStartFrame ?? 0;
                let trimEnd = c.trimEndFrame;
                const speed = c.speed || 1.0;

                // Repair: trimEndFrame missing/undefined
                if (trimEnd === undefined || trimEnd === null) {
                    // Compute from timeline: the clip occupies (endFrame - startFrame) frames on the timeline.
                    // The source range is that * speed.
                    const timelineFrames = (c.endFrame ?? 0) - (c.startFrame ?? 0);
                    if (timelineFrames > 0) {
                        trimEnd = trimStart + Math.round(timelineFrames * speed);
                        console.warn(`[ExportTab] Pre-flight repair: "${c.filename}" trimEndFrame was missing, computed from timeline: ${trimEnd}`);
                    } else if (c.sourceDurationFrames > 0) {
                        // Last resort: use full source, but this is likely wrong
                        trimEnd = c.sourceDurationFrames;
                        console.warn(`[ExportTab] Pre-flight repair: "${c.filename}" trimEndFrame AND timeline data missing, fallback to sourceDur: ${trimEnd}`);
                    }
                    if (trimEnd !== undefined && trimEnd !== null) {
                        repairCount++;
                        return { ...c, trimEndFrame: trimEnd };
                    }
                }

                // Repair: trimEndFrame <= trimStartFrame (invalid range)
                if (trimEnd !== undefined && trimEnd <= trimStart && c.sourceDurationFrames > 0) {
                    const timelineFrames = (c.endFrame ?? 0) - (c.startFrame ?? 0);
                    const repairedEnd = timelineFrames > 0
                        ? trimStart + Math.round(timelineFrames * speed)
                        : Math.min(c.sourceDurationFrames, trimStart + c.sourceDurationFrames);
                    repairCount++;
                    console.warn(`[ExportTab] Pre-flight repair: "${c.filename}" trimEnd(${trimEnd}) <= trimStart(${trimStart}), repaired to ${repairedEnd}`);
                    return { ...c, trimEndFrame: repairedEnd };
                }
                return c;
            });
            if (repairCount > 0) {
                addLog(`⚠ Pre-flight: repaired ${repairCount} clip(s) with invalid trim data`);
            }

            // ── BOOMERANG EXPANSION: expand boomerang clips into sub-clips ──
            const preRepairCount = exportClips.length;
            exportClips = exportClips.flatMap(c => {
                if (c.type === 'audio' || !c.boomerang) return [c];
                // Honor each clip's chosen preset (classic/slowmo/echo/duo/stutter/whiplash)
                // instead of forcing classic — keeps export in sync with the new Boomerang system.
                const preset = getBoomerangPreset(c.boomerangPreset);
                const expanded = expandClipToBoomerang(c, preset, selectedFps || settings.fps || 30);
                return expanded;
            });
            if (exportClips.length !== preRepairCount) {
                addLog(`🔄 Boomerang: expanded ${preRepairCount - exportClips.filter(c => c.type === 'audio').length} video clips → ${exportClips.filter(c => c.type !== 'audio').length} (${exportClips.length - preRepairCount} sub-clips added)`);
            }

            const audioClips = exportClips.filter(c => c.type === 'audio');
            const videoClips = exportClips.filter(c => c.type !== 'audio');
            addLog(`Sending ${exportClips.length} clips → ${videoClips.length} video + ${audioClips.length} audio`);

            // ── DIAGNOSTIC: Log full clip data sent to IPC ──
            videoClips.forEach((c, i) => {
                console.log(`[ExportTab] V[${i}] "${c.filename}" startF=${c.startFrame} endF=${c.endFrame} trimStart=${c.trimStartFrame} trimEnd=${c.trimEndFrame} srcDur=${c.sourceDurationFrames} speed=${c.speed} vol=${c.volume} muted=${c.isMuted}`);
            });
            audioClips.forEach((c, i) => {
                addLog(`  Audio[${i}]: "${c.filename}" vol=${c.volume} track=${c.track} trimStart=${c.trimStartFrame} trimEnd=${c.trimEndFrame} endFrame=${c.endFrame} path=${c.path?.substring(0, 80)}`);
            });
            videoClips.filter(c => c.isMuted || c.volume === 0).length > 0 &&
                addLog(`  ⚠ ${videoClips.filter(c => c.isMuted || c.volume === 0).length} video clips have muted/zero-volume audio`);

            const exportPayload = {
                filePath, clips: exportClips,
                settings: {
                    ...settings, exportQuality, exportPresetId: selectedPresetId,
                    exportOrientation: orientation, exportFps: selectedFps,
                    outputWidth: outputDims.w, outputHeight: outputDims.h,
                    outputCodec: selectedPreset.codec, outputBitrate: selectedPreset.bitrate,
                    outputAudioBitrate: selectedPreset.audioBitrate,
                    // Transitions: honour the timeline's transition strategy on export
                    // (matches the 0.5s preview crossfade). Only the monolithic engine
                    // applies these; the per-clip engine stays hard-cut.
                    transitionStrategy: useClipStore.getState().transitionStrategy,
                    transitionDurationSec: 0.5,
                    // GPU encode (auto-falls back to libx264 if nvenc is unavailable)
                    useGpu,
                },
                isIntermediate: false
            };

            // ── RENDER-PARITY PRE-FLIGHT ──
            // Warn about anything the exporter can't honour BEFORE the long render.
            try {
                const parity = await window.ipcRenderer.analyzeRenderParity({
                    clips: exportClips, settings: exportPayload.settings,
                });
                if (parity && !parity.ok) {
                    parity.warnings.forEach(w => addLog(`${w.level === 'warning' ? '⚠' : 'ℹ'} ${w.message}`));
                    const hard = parity.warnings.filter(w => w.level === 'warning');
                    if (hard.length) toast.warning(`${hard.length} render-parity warning(s) — see export log`);
                }
            } catch { /* non-fatal — parity check is advisory only */ }

            let result: { success: boolean; error?: string };

            if (renderEngine === 'both') {
                // Dual engine: render with both simultaneously
                const ext = filePath.match(/\.[^.]+$/)?.[0] || '.mp4';
                const base = filePath.replace(/\.[^.]+$/, '');
                const perClipPath = `${base}_PerClip${ext}`;
                const monoPath = `${base}_Monolithic${ext}`;
                addLog(`Dual render: Per-Clip → ${perClipPath.split(/[\\/]/).pop()}`);
                addLog(`Dual render: Monolithic → ${monoPath.split(/[\\/]/).pop()}`);
                setPerClipProgress(0);
                setMonolithicProgress(0);

                const [perClipResult, monoResult] = await Promise.all([
                    window.ipcRenderer.exportProject({ ...exportPayload, filePath: perClipPath }),
                    window.ipcRenderer.exportProjectMonolithic({ ...exportPayload, filePath: monoPath }),
                ]);

                if (perClipResult.success && monoResult.success) {
                    result = { success: true };
                    addLog(`Both engines completed successfully`);
                } else {
                    const errors: string[] = [];
                    if (!perClipResult.success) errors.push(`Per-Clip: ${perClipResult.error}`);
                    if (!monoResult.success) errors.push(`Monolithic: ${monoResult.error}`);
                    result = { success: false, error: errors.join(' | ') };
                }
            } else if (renderEngine === 'monolithic') {
                addLog('Engine: Monolithic (single-pass filter graph)');
                result = await window.ipcRenderer.exportProjectMonolithic(exportPayload);
            } else if (renderEngine === 'per-clip') {
                addLog('Engine: Per-Clip (intermediate architecture)');
                result = await window.ipcRenderer.exportProject(exportPayload);
            } else {
                addLog('Engine: Segment (duration-capped intermediates + full effects/transitions)');
                result = await window.ipcRenderer.exportProjectSegment(exportPayload);
            }

            if (result.success) {
                const elapsed = Math.round((Date.now() - exportStartTime.current) / 1000);
                setLastExportPath(filePath);
                addLog(`Export complete — ${filePath.split(/[\\/]/).pop()} (${elapsed}s)`);
                setExportReport({
                    path: filePath, presetName: selectedPreset.name,
                    resolution: `${outputDims.w} × ${outputDims.h}`,
                    codec: selectedPreset.codec === 'libx265' ? 'HEVC (H.265)' : 'H.264',
                    duration: totalDuration > 0 ? `${Math.floor(totalDuration / 60)}:${String(Math.floor(totalDuration % 60)).padStart(2, '0')}` : '—',
                    clipCount: clips.filter(c => c.type !== 'audio').length,
                    elapsedSec: elapsed, fileName: filePath.split(/[\\/]/).pop() || 'export',
                });
            } else { addLog(`Export FAILED: ${result.error || 'Unknown'}`); toast.error(`Export Failed: ${result.error || 'Unknown error'}`); }
        } catch (e) { console.error(e); addLog('Export error (unexpected)'); toast.error('Unexpected export error.'); }
        finally { setIsExportingDirect(false); setIsPaused(false); setIsExporting(false); drainQueue(); }
    };

    const handleCancelExport = async () => {
        addLog('Cancelling export...');
        try {
            await window.ipcRenderer.cancelExport();
            toast.warning('Export cancelled.');
        } catch { addLog('Failed to cancel export'); }
    };

    const handlePauseExport = async () => {
        try {
            await window.ipcRenderer.pauseExport();
            setIsPaused(true);
            addLog('Export paused by user.');
        } catch { addLog('Failed to pause export'); }
    };

    const handleResumeExport = async () => {
        try {
            await window.ipcRenderer.resumeExport();
            setIsPaused(false);
            addLog('Export resumed.');
        } catch { addLog('Failed to resume export'); }
    };

    const handleExportAME = async () => {
        if (clips.length === 0) { toast.warning('Timeline is empty!'); return; }
        try {
            setIsExportingAME(true); setAmeProgress(0); setIsExporting(true);
            exportStartTime.current = Date.now();
            const safeName = settings.name?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'mmmedia_project';
            const { canceled, filePath } = await window.ipcRenderer.showExportDialog({
                defaultPath: `${buildExportName()}.mp4`,
                filters: [{ name: 'High Quality MP4', extensions: ['mp4'] }]
            });
            if (canceled || !filePath) { setIsExportingAME(false); return; }
            const result = await window.ipcRenderer.exportProject({
                filePath, clips: getExportClips(),
                settings: { ...settings, outputWidth: outputDims.w, outputHeight: outputDims.h, outputCodec: 'libx264', outputBitrate: 0, outputAudioBitrate: 320 },
                isIntermediate: true
            });
            if (result.success) {
                setLastExportPath(filePath);
                const ameResult = await window.ipcRenderer.openInAME(filePath);
                if (!ameResult.success) toast.warning(`Saved, but couldn't open AME: ${ameResult.error}`);
                else toast.success('Opened in Adobe Media Encoder!');
            } else { toast.error(`Export Failed: ${result.error}`); }
        } catch (e) { console.error(e); toast.error('Unexpected error.'); }
        finally { setIsExportingAME(false); setIsExporting(false); drainQueue(); }
    };

    const handleExportManifest = async () => {
        if (clips.length === 0) { toast.warning('Timeline is empty!'); return; }
        try {
            setIsExportingManifest(true);
            const manifest = generateManifest();
            const result = await window.ipcRenderer.saveManifest(JSON.stringify(manifest, null, 2));
            if (result.success) { setLastExportPath(result.filePath || null); toast.success('Manifest exported!'); }
            else { toast.error(`Export Failed: ${result.error}`); }
        } catch (e) { console.error(e); toast.error('Unexpected error.'); }
        finally { setIsExportingManifest(false); }
    };

    const anyExporting = isExportingDirect || isExportingAME || isExportingManifest;

    const tabs = [
        { id: 'mp4' as const, label: 'MP4 Render', icon: <Film size={14} />, color: 'from-violet-500 to-purple-600', activeColor: 'bg-primary/15 border-primary/40 text-primary-300' },
        { id: 'premiere' as const, label: 'Premiere Pro', icon: <FileCode size={14} />, color: 'from-blue-500 to-indigo-600', activeColor: 'bg-blue-500/15 border-blue-500/40 text-blue-300' },
        { id: 'ame' as const, label: 'Media Encoder', icon: <MonitorUp size={14} />, color: 'from-cyan-500 to-emerald-600', activeColor: 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300' },
    ];

    return (
        <div className="w-full h-full flex flex-col bg-background relative overflow-hidden">
            {/* Header + Tab Bar */}
            <div className="flex-shrink-0 border-b border-white/5 bg-[#0a0a12]">
                <div className="flex items-center gap-4 px-6 pt-5 pb-0">
                    <div className="p-2 bg-gradient-to-br from-primary to-secondary rounded-lg shadow-lg">
                        <Share size={18} className="text-white drop-shadow-md" />
                    </div>
                    <div>
                        <h2 className="text-base font-black tracking-tight text-white">Export Studio</h2>
                        <p className="text-[10px] text-white/40">Render, encode, and deliver your project.</p>
                    </div>
                </div>
                <div className="flex gap-1 px-6 mt-4">
                    {tabs.map(tab => (
                        <button key={tab.id} onClick={() => !anyExporting && setActiveTab(tab.id)}
                            className={clsx(
                                'flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-[10px] font-black uppercase tracking-wider transition-all border-t border-x',
                                activeTab === tab.id ? tab.activeColor : 'bg-transparent border-transparent text-white/30 hover:text-white/60 hover:bg-white/5',
                                anyExporting && activeTab !== tab.id && 'opacity-30 cursor-not-allowed'
                            )}>
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {activeTab === 'mp4' && (
                    <Mp4Tab isExporting={isExportingDirect} progress={directProgress} startTime={exportStartTime.current}
                        onExport={handleExportDirect} disabled={clips.length === 0 || anyExporting}
                        onSendToEnder={handleSendToEnder} isSendingEnder={isSendingEnder}
                        exportLog={exportLog}
                        exportQueue={exportQueue}
                        onCancelExport={handleCancelExport}
                        onPauseExport={handlePauseExport}
                        onResumeExport={handleResumeExport}
                        isPaused={isPaused}
                        perClipProgress={perClipProgress}
                        monolithicProgress={monolithicProgress}
                        renderEngine={renderEngine}
                        onAddToQueue={() => {
                            const item: QueueItem = {
                                id: uuidv4(),
                                presetName: selectedPreset.name,
                                orientation: orientation,
                                quality: exportQuality,
                                status: 'pending',
                                progress: 0,
                                filePath: null,
                            };
                            setExportQueue(q => [...q, item]);
                            addLog(`Queued: ${selectedPreset.name} (${orientation}, ${exportQuality})`);
                        }}
                        onRemoveFromQueue={(id) => setExportQueue(q => q.filter(i => i.id !== id))}
                        onClearQueue={() => { setExportQueue([]); addLog('Queue cleared'); }}
                    />
                )}
                {activeTab === 'premiere' && (
                    <PremiereTab isExporting={isExportingManifest} onExport={handleExportManifest}
                        disabled={clips.length === 0 || anyExporting} />
                )}
                {activeTab === 'ame' && (
                    <AmeTab isExporting={isExportingAME} progress={ameProgress} startTime={exportStartTime.current}
                        onExport={handleExportAME} disabled={clips.length === 0 || anyExporting} />
                )}
            </div>

            {/* Celebration overlay */}
            {exportReport && <ExportCelebration report={exportReport} onDismiss={() => setExportReport(null)} />}
        </div>
    );
};
