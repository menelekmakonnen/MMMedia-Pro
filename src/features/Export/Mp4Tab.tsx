import React, { useMemo, useState } from 'react';
import { Film, HardDrive, RectangleHorizontal, Smartphone, Square, RotateCcw, Trash2, Copy, Check, XCircle, Pause, Play, Sparkles, Layers, Music, Zap, Palette } from 'lucide-react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { useClipStore } from '../../store/clipStore';
import { useProjectStore } from '../../store/projectStore';
import { useExportSettingsStore } from '../../store/exportSettingsStore';
import { useGodModeStore } from '../../store/godModeStore';
import { ExportProgress } from './ExportProgress';
import { SpaceFlightBg } from './SpaceFlightBg';
import {
    EXPORT_PRESETS, PRESET_CATEGORIES, FPS_OPTIONS,
    getOutputDimensions, estimateFileSize,
    type ExportOrientation, type ExportQuality
} from '../../lib/exportPresets';

const ORIENT_OPTS: { key: ExportOrientation; icon: React.ReactNode; label: string }[] = [
    { key: 'landscape', icon: <RectangleHorizontal size={13} />, label: '16:9' },
    { key: 'portrait', icon: <Smartphone size={13} />, label: '9:16' },
    { key: 'square', icon: <Square size={13} />, label: '1:1' },
    { key: 'auto', icon: <RotateCcw size={13} />, label: 'Auto' },
];

interface Props {
    isExporting: boolean;
    progress: number;
    startTime: number;
    onExport: () => void;
    disabled: boolean;
    exportLog: string[];
    exportQueue: QueueItem[];
    onAddToQueue: () => void;
    onRemoveFromQueue: (id: string) => void;
    onClearQueue: () => void;
    onCancelExport?: () => void;
    onPauseExport?: () => void;
    onResumeExport?: () => void;
    isPaused?: boolean;
}

export interface QueueItem {
    id: string;
    presetName: string;
    orientation: string;
    quality: string;
    status: 'pending' | 'active' | 'done' | 'failed';
    progress: number;
    filePath: string | null;
}

export const Mp4Tab: React.FC<Props> = ({ isExporting, progress, startTime, onExport, disabled, exportLog, exportQueue, onAddToQueue, onRemoveFromQueue, onClearQueue, onCancelExport, onPauseExport, onResumeExport, isPaused }) => {
    const { clips } = useClipStore();
    const [logCopied, setLogCopied] = useState(false);
    const { settings } = useProjectStore();
    const {
        selectedPresetId, setSelectedPresetId,
        exportQuality, setExportQuality,
        orientation, setOrientation,
        selectedFps, setSelectedFps,
    } = useExportSettingsStore();

    const selectedPreset = useMemo(() =>
        EXPORT_PRESETS.find(p => p.id === selectedPresetId) || EXPORT_PRESETS.find(p => p.id === 'hd_1080')!,
        [selectedPresetId]);

    const outputDims = useMemo(() => getOutputDimensions(selectedPreset, orientation), [selectedPreset, orientation]);

    const totalDuration = useMemo(() => {
        const fps = settings.fps || 30;
        const vc = clips.filter(c => c.type !== 'audio');
        if (vc.length === 0) return 0;
        return Math.max(...vc.map(c => c.endFrame)) / fps;
    }, [clips, settings.fps]);

    const estimatedSize = useMemo(() => estimateFileSize(selectedPreset, exportQuality, totalDuration), [selectedPreset, exportQuality, totalDuration]);

    const grouped = useMemo(() => PRESET_CATEGORIES.map(cat => ({
        ...cat, presets: EXPORT_PRESETS.filter(p => p.category === cat.id),
    })), []);

    const handleCopyLog = () => {
        navigator.clipboard.writeText(exportLog.join('\n'));
        setLogCopied(true);
        setTimeout(() => setLogCopied(false), 2000);
    };

    const godMode = useGodModeStore();
    const exportStatus: 'active' | 'success' | 'failed' = exportLog.some(l => l.includes('FAIL')) ? 'failed' : progress >= 100 ? 'success' : 'active';

    // Collect editing details for sidebar
    const editingDetails = useMemo(() => {
        const vc = clips.filter(c => c.type !== 'audio');
        const ac = clips.filter(c => c.type === 'audio');
        const effects = new Set(vc.flatMap(c => c.effectIds || []));
        const textures = new Set(vc.map(c => c.visualTexture).filter(Boolean));
        const transitions = new Set(vc.map(c => c.transitionEnter).flat().filter(Boolean));
        const hasZoom = vc.some(c => c.zoomLevel && c.zoomLevel > 100);
        const hasRotation = vc.some(c => c.rotation && c.rotation !== 0);
        const speeds = new Set(vc.map(c => c.speed).filter(s => s !== 1));
        return { vc: vc.length, ac: ac.length, effects: [...effects], textures: [...textures], transitions: [...transitions], hasZoom, hasRotation, speeds: [...speeds] };
    }, [clips]);

    if (isExporting) {
        return (
            <div className="flex-1 flex overflow-hidden relative">
                {/* Space flight background */}
                <SpaceFlightBg progress={progress} status={exportStatus} />

                {/* Left: Editing Details Sidebar */}
                <div className="w-64 flex-shrink-0 border-r border-white/5 bg-black/60 backdrop-blur-sm overflow-y-auto custom-scrollbar z-10 relative">
                    <div className="p-4 space-y-4">
                        <div className="text-[9px] font-black uppercase tracking-widest text-white/30">Project Details</div>
                        {/* Project info */}
                        <div className="space-y-2">
                            {[
                                { icon: Film, label: 'Project', value: settings.name || 'Untitled' },
                                { icon: Layers, label: 'Video Clips', value: String(editingDetails.vc) },
                                { icon: Music, label: 'Audio Tracks', value: String(editingDetails.ac) },
                                { icon: Zap, label: 'Resolution', value: `${outputDims.w}×${outputDims.h}` },
                                { icon: HardDrive, label: 'Est. Size', value: estimatedSize > 1024 ? `~${(estimatedSize / 1024).toFixed(1)} GB` : `~${Math.round(estimatedSize)} MB` },
                            ].map(({ icon: I, label, value }) => (
                                <div key={label} className="flex items-center gap-2 text-[10px]">
                                    <I size={11} className="text-white/20 flex-shrink-0" />
                                    <span className="text-white/35 flex-1">{label}</span>
                                    <span className="text-white/70 font-bold truncate max-w-[120px]">{value}</span>
                                </div>
                            ))}
                        </div>

                        <div className="border-t border-white/5 pt-3">
                            <div className="text-[9px] font-black uppercase tracking-widest text-primary-300/40 mb-2">Generation Style</div>
                            <div className="space-y-1.5 text-[10px]">
                                {godMode.vibe && <div className="flex justify-between"><span className="text-white/30">Vibe</span><span className="text-violet-300 font-bold">{godMode.vibe}</span></div>}
                                {godMode.selectedPresetId && <div className="flex justify-between"><span className="text-white/30">Preset</span><span className="text-amber-300 font-bold">{godMode.selectedPresetId}</span></div>}
                                {godMode.pacingTemplate && <div className="flex justify-between"><span className="text-white/30">Pacing</span><span className="text-cyan-300 font-bold">{godMode.pacingTemplate}</span></div>}
                                {godMode.styleTemplate && <div className="flex justify-between"><span className="text-white/30">Style</span><span className="text-pink-300 font-bold">{godMode.styleTemplate}</span></div>}
                                <div className="flex justify-between"><span className="text-white/30">Transitions</span><span className="text-white/60 font-bold">{godMode.transitionsEnabled ? godMode.transitionPreset : 'Off'}</span></div>
                                {godMode.hookStyle !== 'none' && <div className="flex justify-between"><span className="text-white/30">Hook</span><span className="text-emerald-300 font-bold">{godMode.hookStyle}</span></div>}
                                {godMode.visualTexture !== 'none' && <div className="flex justify-between"><span className="text-white/30">Texture</span><span className="text-orange-300 font-bold">{godMode.visualTexture}</span></div>}
                            </div>
                        </div>

                        {/* Applied Effects */}
                        {editingDetails.effects.length > 0 && (
                            <div className="border-t border-white/5 pt-3">
                                <div className="text-[9px] font-black uppercase tracking-widest text-accent/40 mb-2 flex items-center gap-1"><Sparkles size={10} /> Effects</div>
                                <div className="flex flex-wrap gap-1">{editingDetails.effects.map(e => <span key={e} className="px-1.5 py-0.5 bg-accent/10 text-accent/70 rounded text-[8px] font-bold border border-accent/10">{e}</span>)}</div>
                            </div>
                        )}
                        {editingDetails.textures.length > 0 && (
                            <div className="border-t border-white/5 pt-3">
                                <div className="text-[9px] font-black uppercase tracking-widest text-orange-400/40 mb-2 flex items-center gap-1"><Palette size={10} /> Textures</div>
                                <div className="flex flex-wrap gap-1">{editingDetails.textures.map(t => <span key={t} className="px-1.5 py-0.5 bg-orange-500/10 text-orange-300/70 rounded text-[8px] font-bold border border-orange-500/10">{String(t)}</span>)}</div>
                            </div>
                        )}
                        {editingDetails.transitions.length > 0 && (
                            <div className="border-t border-white/5 pt-3">
                                <div className="text-[9px] font-black uppercase tracking-widest text-cyan-400/40 mb-2">Transitions</div>
                                <div className="flex flex-wrap gap-1">{editingDetails.transitions.map(t => <span key={String(t)} className="px-1.5 py-0.5 bg-cyan-500/10 text-cyan-300/70 rounded text-[8px] font-bold border border-cyan-500/10">{String(t)}</span>)}</div>
                            </div>
                        )}
                        {(editingDetails.hasZoom || editingDetails.hasRotation || editingDetails.speeds.length > 0) && (
                            <div className="border-t border-white/5 pt-3">
                                <div className="text-[9px] font-black uppercase tracking-widest text-white/25 mb-2">Transforms</div>
                                <div className="space-y-1 text-[10px]">
                                    {editingDetails.hasZoom && <div className="text-emerald-300/60">● Zoom applied</div>}
                                    {editingDetails.hasRotation && <div className="text-violet-300/60">● Rotation applied</div>}
                                    {editingDetails.speeds.length > 0 && <div className="text-amber-300/60">● Speed ramps: {editingDetails.speeds.map(s => `${s}x`).join(', ')}</div>}
                                </div>
                            </div>
                        )}
                        {/* Export settings */}
                        <div className="border-t border-white/5 pt-3">
                            <div className="text-[9px] font-black uppercase tracking-widest text-white/25 mb-2">Export Config</div>
                            <div className="space-y-1.5 text-[10px]">
                                <div className="flex justify-between"><span className="text-white/30">Codec</span><span className="text-white/60 font-bold">{selectedPreset.codec === 'libx265' ? 'HEVC' : 'H.264'}</span></div>
                                <div className="flex justify-between"><span className="text-white/30">FPS</span><span className="text-white/60 font-bold">{selectedFps || 'Auto'}</span></div>
                                <div className="flex justify-between"><span className="text-white/30">Quality</span><span className="text-white/60 font-bold capitalize">{exportQuality}</span></div>
                                <div className="flex justify-between"><span className="text-white/30">Audio</span><span className="text-white/60 font-bold">AAC {selectedPreset.audioBitrate}k</span></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Center: Progress + Log */}
                <div className="flex-1 flex flex-col items-center p-6 overflow-hidden relative z-10">
                    <div className="flex-shrink-0 w-full">
                        <ExportProgress progress={progress} presetName={selectedPreset.name} clips={clips} startTime={startTime}
                            projectName={settings.name} resolution={`${outputDims.w}×${outputDims.h}`} duration={totalDuration} status={exportStatus} />
                    </div>

                    {/* Live Export Log */}
                    <div className="w-full max-w-2xl mt-4 flex-1 min-h-0 flex flex-col bg-black/50 backdrop-blur-sm rounded-xl border border-white/5 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 flex-shrink-0">
                            <div className="text-[9px] font-black uppercase tracking-widest flex items-center gap-2" style={{ color: isPaused ? 'rgba(251,191,36,0.6)' : 'rgba(52,211,153,0.6)' }}>
                                <span className={clsx("w-1.5 h-1.5 rounded-full", isPaused ? "bg-amber-400" : "bg-emerald-400 animate-pulse")} />
                                {isPaused ? 'Export Paused' : 'Live Export Log'}
                                <span className="text-white/15 font-mono ml-1">({exportLog.length})</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <button onClick={handleCopyLog} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold text-white/25 hover:text-white/60 hover:bg-white/5 transition-all" title="Copy log">
                                    {logCopied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                                </button>
                                <button onClick={isPaused ? onResumeExport : onPauseExport}
                                    className={clsx("flex items-center gap-1.5 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border transition-all",
                                        isPaused ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/20" : "bg-amber-500/8 border-amber-500/15 text-amber-300/70 hover:bg-amber-500/15 hover:text-amber-300")}>
                                    {isPaused ? <><Play size={11} /> Resume</> : <><Pause size={11} /> Pause</>}
                                </button>
                                <button onClick={onCancelExport}
                                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-red-500/8 border border-red-500/15 text-red-400/70 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 transition-all">
                                    <XCircle size={11} /> Cancel
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-0.5" ref={el => { if (el) el.scrollTop = el.scrollHeight; }}>
                            {exportLog.length === 0 ? (
                                <div className="text-[10px] text-white/20 italic">Waiting for export pipeline...</div>
                            ) : exportLog.map((entry, i) => (
                                <div key={i} className={clsx("text-[9px] font-mono leading-tight break-all",
                                    entry.includes('[ffmpeg]') ? 'text-cyan-400/50' : entry.includes('FAIL') || entry.includes('⚠') ? 'text-red-400/70' :
                                    entry.includes('COMPLETE') ? 'text-emerald-400/70' : entry.includes('CANCELLED') ? 'text-orange-400/70' :
                                    entry.includes('Audio clip') ? 'text-amber-400/60' : 'text-white/35')}>{entry}</div>
                            ))}
                        </div>
                    </div>
                    <div className="pb-24" />
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col lg:flex-row gap-6 p-6 pb-24 overflow-y-auto custom-scrollbar">
            {/* Left: Preview Card */}
            <div className="lg:w-[320px] flex-shrink-0 flex flex-col gap-4">
                <div className="bg-black/40 rounded-xl border border-white/5 p-5 flex flex-col items-center gap-4">
                    <div className="w-full rounded-lg bg-black/60 border border-white/10 overflow-hidden flex items-center justify-center"
                         style={{ aspectRatio: `${outputDims.w} / ${outputDims.h}`, maxHeight: '260px' }}>
                        {clips.filter(c => c.type === 'video').length > 0 ? (
                            <video src={`file://${clips.filter(c => c.type === 'video')[0].path}`}
                                className="w-full h-full object-contain" muted preload="metadata"
                                ref={el => { if (el) el.currentTime = 1; }} />
                        ) : (
                            <Film size={32} className="text-white/10" />
                        )}
                    </div>
                    <div className="text-center">
                        <div className="text-sm font-bold text-white">{settings.name || 'Untitled Project'}</div>
                        <div className="text-[10px] text-white/40 mt-0.5">{clips.filter(c => c.type !== 'audio').length} clips · {totalDuration > 0 ? `${Math.floor(totalDuration / 60)}:${String(Math.floor(totalDuration % 60)).padStart(2, '0')}` : '0:00'}</div>
                    </div>
                </div>

                {/* Summary card */}
                <div className="bg-gradient-to-br from-primary/5 to-accent/5 rounded-xl border border-primary/10 p-4 space-y-2.5">
                    <div className="text-[9px] font-black uppercase tracking-widest text-primary-300/50">Output Summary</div>
                    {[
                        ['Resolution', `${outputDims.w} × ${outputDims.h}`],
                        ['Codec', selectedPreset.codec === 'libx265' ? 'HEVC (H.265)' : 'H.264'],
                        ['Bitrate', selectedPreset.bitrate > 0 ? `${(selectedPreset.bitrate / 1000).toFixed(1)} Mbps` : 'Variable (CRF)'],
                        ['Audio', `AAC ${selectedPreset.audioBitrate}k`],
                        ['Frame Rate', selectedFps === 0 ? 'Match Source' : `${selectedFps} fps`],
                        ['Duration', totalDuration > 0 ? `${Math.floor(totalDuration / 60)}:${String(Math.floor(totalDuration % 60)).padStart(2, '0')}` : '—'],
                    ].map(([l, v]) => (
                        <div key={l} className="flex justify-between text-[10px] font-mono">
                            <span className="text-white/30">{l}</span>
                            <span className="text-white font-bold">{v}</span>
                        </div>
                    ))}
                    <div className="border-t border-white/5 pt-2 flex justify-between text-[10px] font-mono">
                        <span className="text-white/30 flex items-center gap-1"><HardDrive size={10} /> Est. Size</span>
                        <span className="text-primary-300 font-black">{estimatedSize > 1024 ? `~${(estimatedSize / 1024).toFixed(1)} GB` : `~${Math.round(estimatedSize)} MB`}</span>
                    </div>
                </div>

                {/* Export Data Log */}
                <div className="bg-black/30 rounded-xl border border-white/5 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="text-[9px] font-black uppercase tracking-widest text-white/30">Export Log</div>
                        {exportLog.length > 0 && (
                            <button onClick={handleCopyLog}
                                className="flex items-center gap-1.5 text-[9px] font-bold text-primary-300/50 hover:text-primary-300 transition-colors uppercase tracking-wider">
                                {logCopied ? <><Check size={10} className="text-emerald-400" /> Copied</> : <><Copy size={10} /> Copy Log</>}
                            </button>
                        )}
                    </div>
                    <div className="max-h-[200px] overflow-y-auto custom-scrollbar space-y-0.5" ref={el => {
                        if (el) el.scrollTop = el.scrollHeight;
                    }}>
                        {exportLog.length === 0 ? (
                            <div className="text-[10px] text-white/20 italic">No export events yet.</div>
                        ) : (
                            exportLog.map((entry, i) => (
                                <div key={i} className={clsx(
                                    "text-[9px] font-mono leading-tight break-all",
                                    entry.includes('[ffmpeg]') ? 'text-cyan-400/50' :
                                    entry.includes('FAIL') || entry.includes('⚠') ? 'text-red-400/70' :
                                    entry.includes('COMPLETE') ? 'text-emerald-400/70' :
                                    entry.includes('Audio clip') || entry.includes('audio') ? 'text-amber-400/60' :
                                    'text-white/35'
                                )}>{entry}</div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Right: Settings */}
            <div className="flex-1 flex flex-col gap-5 min-w-0">
                {/* Preset cards */}
                <div className="space-y-3">
                    <div className="text-[9px] font-black uppercase tracking-widest text-white/30">Preset</div>
                    {grouped.map(group => (
                        <div key={group.id}>
                            <div className="text-[9px] font-bold uppercase tracking-wider text-white/20 mb-1.5">{group.label}</div>
                            <div className="grid grid-cols-2 xl:grid-cols-3 gap-1.5">
                                {group.presets.map(p => (
                                    <button key={p.id} onClick={() => setSelectedPresetId(p.id)}
                                        className={clsx('p-2.5 rounded-lg border text-left transition-all',
                                            selectedPresetId === p.id
                                                ? 'bg-primary/15 border-primary/40 shadow-lg shadow-primary/10'
                                                : 'bg-black/20 border-white/5 hover:border-white/15 hover:bg-white/5')}>
                                        <div className="text-[11px] font-bold text-white truncate">{p.name}</div>
                                        <div className="text-[9px] text-white/30 mt-0.5">{p.width}×{p.height} · {p.codec === 'libx265' ? 'HEVC' : 'H.264'}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Video settings */}
                <div className="bg-black/30 rounded-xl border border-white/5 p-4 space-y-3">
                    <div className="text-[9px] font-black uppercase tracking-widest text-white/30">Video Settings</div>
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] text-white/50 font-bold">Orientation</span>
                        <div className="flex bg-black/40 rounded-lg border border-white/10 p-0.5 gap-0.5">
                            {ORIENT_OPTS.map(o => (
                                <button key={o.key} onClick={() => setOrientation(o.key)}
                                    className={clsx('flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-all',
                                        orientation === o.key ? 'bg-primary/80 text-white shadow-lg' : 'hover:bg-white/5 text-white/40')}>
                                    {o.icon} {o.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] text-white/50 font-bold">Quality</span>
                        <div className="flex bg-black/40 rounded-lg border border-white/10 p-0.5 gap-0.5">
                            {(['draft', 'standard', 'master'] as const).map(q => (
                                <button key={q} onClick={() => setExportQuality(q)}
                                    className={clsx('px-3 py-1 rounded-md text-[10px] uppercase font-bold transition-all',
                                        exportQuality === q ? 'bg-primary/80 text-white shadow-lg' : 'hover:bg-white/5 text-white/40')}>
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] text-white/50 font-bold">Frame Rate</span>
                        <select value={selectedFps} onChange={e => setSelectedFps(Number(e.target.value))}
                            className="bg-black/60 text-white text-xs font-bold border border-white/10 rounded-lg px-3 py-1.5 focus:outline-none focus:border-primary/50 cursor-pointer">
                            {FPS_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                    </div>
                </div>

                {/* Audio settings */}
                <div className="bg-black/30 rounded-xl border border-white/5 p-4 space-y-3">
                    <div className="text-[9px] font-black uppercase tracking-widest text-white/30">Audio Settings</div>
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] text-white/50 font-bold">Codec</span>
                        <span className="text-[10px] text-white font-bold">AAC</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] text-white/50 font-bold">Bitrate</span>
                        <span className="text-[10px] text-white font-bold">{selectedPreset.audioBitrate} kbps</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] text-white/50 font-bold">Tracks</span>
                        <span className="text-[10px] text-white/60">Audio 1 (Linked) + Audio 2 (Added)</span>
                    </div>
                </div>

                <div className="flex gap-2">
                    <motion.button onClick={onExport} disabled={disabled} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                        className="flex-1 py-3.5 rounded-xl text-xs font-black uppercase tracking-wider text-white bg-gradient-to-r from-primary via-violet-600 to-secondary shadow-[0_0_30px_rgba(139,92,246,0.3)] hover:shadow-[0_0_40px_rgba(139,92,246,0.5)] flex items-center justify-center gap-2 disabled:opacity-40 disabled:grayscale transition-all">
                        <Film size={16} /> Render Now
                    </motion.button>
                    <motion.button onClick={onAddToQueue} disabled={disabled} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                        className="py-3.5 px-5 rounded-xl text-xs font-black uppercase tracking-wider text-white/70 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white flex items-center justify-center gap-2 disabled:opacity-40 disabled:grayscale transition-all">
                        + Queue
                    </motion.button>
                </div>

                {/* Export Queue */}
                {exportQueue.length > 0 && (
                    <div className="bg-black/30 rounded-xl border border-white/5 p-4 space-y-2">
                        <div className="flex justify-between items-center">
                            <div className="text-[9px] font-black uppercase tracking-widest text-white/30">Export Queue ({exportQueue.length})</div>
                            <button onClick={onClearQueue} className="text-[9px] font-bold text-red-400/60 hover:text-red-400 transition-colors uppercase">Clear All</button>
                        </div>
                        <div className="space-y-1.5">
                            {exportQueue.map(item => (
                                <div key={item.id} className="flex items-center gap-3 bg-black/40 rounded-lg p-2.5 border border-white/5">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[10px] font-bold text-white truncate">{item.presetName}</div>
                                        <div className="text-[9px] text-white/30">{item.orientation} · {item.quality}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {item.status === 'active' && (
                                            <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${item.progress}%` }} />
                                            </div>
                                        )}
                                        <span className={clsx('text-[9px] font-bold uppercase',
                                            item.status === 'pending' && 'text-white/30',
                                            item.status === 'active' && 'text-primary-300',
                                            item.status === 'done' && 'text-emerald-400',
                                            item.status === 'failed' && 'text-red-400',
                                        )}>{item.status === 'active' ? `${item.progress}%` : item.status}</span>
                                        {item.status === 'pending' && (
                                            <button onClick={() => onRemoveFromQueue(item.id)} className="text-white/20 hover:text-red-400 transition-colors">
                                                <Trash2 size={12} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
