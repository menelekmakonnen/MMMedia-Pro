import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Film, FileCode, MonitorUp, Share } from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import { useProjectStore } from '../../store/projectStore';
import { useExportSettingsStore } from '../../store/exportSettingsStore';
import { useGodModeStore } from '../../store/godModeStore';
import { generateManifest } from '../../lib/manifestBridge';
import clsx from 'clsx';
import { toast } from '../../components/Toast';
import { EXPORT_PRESETS, getOutputDimensions } from '../../lib/exportPresets';
import { Mp4Tab } from './Mp4Tab';
import { PremiereTab } from './PremiereTab';
import { AmeTab } from './AmeTab';
import { ExportCelebration } from './ExportCelebration';
import { QueueItem } from './Mp4Tab';
import { v4 as uuidv4 } from 'uuid';

export const ExportTab: React.FC = () => {
    const { clips, trackMutes } = useClipStore();
    const { settings } = useProjectStore();
    const {
        activeTab, setActiveTab,
        selectedPresetId, exportQuality, orientation, selectedFps,
        setLastExportPath, setIsExporting,
    } = useExportSettingsStore();

    const [isExportingDirect, setIsExportingDirect] = useState(false);
    const [directProgress, setDirectProgress] = useState(0);
    const [isExportingAME, setIsExportingAME] = useState(false);
    const [ameProgress, setAmeProgress] = useState(0);
    const [isExportingManifest, setIsExportingManifest] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const exportStartTime = useRef(0);

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
            const trackVol = trackVolumes[c.track ?? 1] ?? 100;

            // For VIDEO/IMAGE clips: the A1 track mute + volume slider is the
            // sole authority over embedded video audio. The TrailerGenerator may
            // have baked isMuted=true / volume=0 into clips (audioMixStrategy),
            // but the user's track-level controls must override that.
            // If A1 is muted → silence all embedded audio.
            // If A1 is unmuted → use the track volume slider value.
            if (c.type !== 'audio') {
                const audio1Vol = trackVolumes[2] ?? 100;
                if (audio1Muted) {
                    return { ...c, volume: 0, isMuted: true };
                }
                return { ...c, volume: audio1Vol, isMuted: false };
            }
            // For AUDIO clips on track 2 (legacy from older MediaManager imports):
            // Promote to track 101 so they don't collide with the video-audio mute flag
            if (c.type === 'audio' && c.track === 2) {
                const effectiveVol = Math.round(((c.volume ?? 100) * trackVol) / 100);
                return { ...c, track: 101, volume: effectiveVol };
            }
            // For AUDIO clips on track 101+: apply track volume
            if (c.type === 'audio') {
                const effectiveVol = Math.round(((c.volume ?? 100) * trackVol) / 100);
                return { ...c, volume: effectiveVol };
            }
            return c;
        });

        // Filter out audio clips only if their SPECIFIC track is muted (101, 102, etc.)
        // Never filter by trackMutes[2] — that's for video embedded audio only
        ec = ec.filter(c => {
            if (c.type === 'audio') {
                const audioTrackMuted = trackMutes[c.track] ?? false;
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
            if (isExportingDirect) setDirectProgress(progress);
        });
        // Subscribe to real-time export log stream from main process
        const cleanupLog = window.ipcRenderer.onExportLog?.((msg: string) => {
            const ts = new Date().toLocaleTimeString();
            setExportLog(prev => [...prev, `[${ts}] ${msg}`]);
        });
        return () => { cleanupProgress(); cleanupLog?.(); };
    }, [isExportingAME, isExportingDirect]);

    const handleExportDirect = async () => {
        if (clips.length === 0) { toast.warning('Timeline is empty!'); return; }
        try {
            setIsExportingDirect(true); setDirectProgress(0); setExportReport(null); setIsExporting(true);
            exportStartTime.current = Date.now();
            addLog(`Export started — ${selectedPreset.name} (${exportQuality})`);
            const safeName = settings.name?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'mmmedia_project';
            const { canceled, filePath } = await window.ipcRenderer.showExportDialog({
                defaultPath: `${safeName}_Final.${selectedPreset.ext}`,
                filters: [{ name: `${selectedPreset.codec === 'libx265' ? 'HEVC' : 'H.264'} Video`, extensions: [selectedPreset.ext] }]
            });
            if (canceled || !filePath) { setIsExportingDirect(false); setIsExporting(false); return; }
            let exportClips = getExportClips();

            // ── PRE-FLIGHT VALIDATION: Repair clips with bad trim data ──
            let repairCount = 0;
            exportClips = exportClips.map(c => {
                if (c.type === 'audio') return c;
                // Repair: trimEndFrame missing or zero but source duration known
                if ((!c.trimEndFrame && c.trimEndFrame !== 0) && c.sourceDurationFrames > 0) {
                    repairCount++;
                    console.warn(`[ExportTab] Pre-flight repair: "${c.filename}" trimEndFrame was ${c.trimEndFrame}, set to sourceDurationFrames=${c.sourceDurationFrames}`);
                    return { ...c, trimEndFrame: c.sourceDurationFrames };
                }
                // Repair: trimEndFrame <= trimStartFrame (invalid range)
                if (c.trimEndFrame <= (c.trimStartFrame ?? 0) && c.sourceDurationFrames > 0) {
                    repairCount++;
                    const repairedEnd = Math.min(c.sourceDurationFrames, (c.trimStartFrame ?? 0) + c.sourceDurationFrames);
                    console.warn(`[ExportTab] Pre-flight repair: "${c.filename}" trimEnd(${c.trimEndFrame}) <= trimStart(${c.trimStartFrame}), set to ${repairedEnd}`);
                    return { ...c, trimEndFrame: repairedEnd };
                }
                return c;
            });
            if (repairCount > 0) {
                addLog(`⚠ Pre-flight: repaired ${repairCount} clip(s) with invalid trim data`);
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

            const result = await window.ipcRenderer.exportProject({
                filePath, clips: exportClips,
                settings: {
                    ...settings, exportQuality, exportPresetId: selectedPresetId,
                    exportOrientation: orientation, exportFps: selectedFps,
                    outputWidth: outputDims.w, outputHeight: outputDims.h,
                    outputCodec: selectedPreset.codec, outputBitrate: selectedPreset.bitrate,
                    outputAudioBitrate: selectedPreset.audioBitrate,
                },
                isIntermediate: false
            });
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
        finally { setIsExportingDirect(false); setIsPaused(false); setIsExporting(false); }
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
                defaultPath: `${safeName}_AME_Export.mp4`,
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
        finally { setIsExportingAME(false); setIsExporting(false); }
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
            <div className="flex-shrink-0 border-b border-white/5 bg-black/30 backdrop-blur-sm">
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
                        exportLog={exportLog}
                        exportQueue={exportQueue}
                        onCancelExport={handleCancelExport}
                        onPauseExport={handlePauseExport}
                        onResumeExport={handleResumeExport}
                        isPaused={isPaused}
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
