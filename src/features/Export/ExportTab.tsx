import React, { useState, useEffect, useMemo } from 'react';
import { FileJson, FileCode, CheckCircle, Film, MonitorUp, Share, Smartphone, Square, RectangleHorizontal, RotateCcw, Share2, Zap, HardDrive } from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import { useProjectStore } from '../../store/projectStore';
import { generateManifest } from '../../lib/manifestBridge';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { toast } from '../../components/Toast';
import {
    EXPORT_PRESETS, PRESET_CATEGORIES, FPS_OPTIONS,
    getOutputDimensions, aspectRatioToOrientation, estimateFileSize,
    type ExportPreset, type ExportOrientation, type ExportQuality
} from '../../lib/exportPresets';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
    'share-2': <Share2 size={12} />,
    'film': <Film size={12} />,
    'zap': <Zap size={12} />,
    'smartphone': <Smartphone size={12} />,
};

/*
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                  MMMedia Pro — Export Tab                               ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║                                                                        ║
 * ║  EXPORT PIPELINE ARCHITECTURE                                          ║
 * ║                                                                        ║
 * ║  This component is the UI entry point for rendering the final video.   ║
 * ║  It sends ALL clips (video + audio) to the main process via IPC.       ║
 * ║                                                                        ║
 * ║  Data Flow:                                                            ║
 * ║  ┌──────────────┐    IPC invoke     ┌──────────────────────────┐       ║
 * ║  │  ExportTab   │ ──────────────→   │  main.ts: export-project │       ║
 * ║  │  (renderer)  │  clips[], settings│  (main process)          │       ║
 * ║  └──────────────┘                   └───────┬──────────────────┘       ║
 * ║                                             │                          ║
 * ║                                    ┌────────▼───────────┐              ║
 * ║                                    │  FFmpeg            │              ║
 * ║                                    │  filter_complex    │              ║
 * ║                                    │  script file       │              ║
 * ║                                    └────────┬───────────┘              ║
 * ║                                             │                          ║
 * ║                              ┌──────────────┴──────────────┐          ║
 * ║                              │                             │          ║
 * ║                     ┌────────▼────────┐        ┌───────────▼───┐      ║
 * ║                     │ Video clips     │        │ Audio clips   │      ║
 * ║                     │ → concat filter │        │ → amix with   │      ║
 * ║                     │ [concat_v]      │        │   concat_a    │      ║
 * ║                     │ [concat_a]      │        │ [final_a]     │      ║
 * ║                     └─────────────────┘        └───────────────┘      ║
 * ║                                                                        ║
 * ║  KEY CONSIDERATIONS:                                                   ║
 * ║  • The `clips` array passed here includes BOTH video AND audio clips.  ║
 * ║    Audio clips (type='audio', track=2) are background music tracks     ║
 * ║    created by the Trailer Generator when "Keep Edit" is pressed.       ║
 * ║  • Video clips may have volume=0 / isMuted=true when the trailer      ║
 * ║    generator used audioMixStrategy='muted'. This is intentional.       ║
 * ║  • Audio clip paths must be raw filesystem paths, NOT file:// URLs.    ║
 * ║  • Changes to clip structure or filtering logic here directly affect   ║
 * ║    what the export handler receives. Never filter out audio clips.     ║
 * ║                                                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
export const ExportTab: React.FC = () => {
    const { clips } = useClipStore();
    const { settings } = useProjectStore();
    const [isExporting, setIsExporting] = useState(false);
    const [lastExportPath, setLastExportPath] = useState<string | null>(null);
    const [isExportingAME, setIsExportingAME] = useState(false);
    const [ameProgress, setAmeProgress] = useState(0);
    const [isExportingDirect, setIsExportingDirect] = useState(false);
    const [directProgress, setDirectProgress] = useState(0);

    // Default orientation from project aspect ratio, FPS from project settings
    const [selectedPresetId, setSelectedPresetId] = useState('hd_1080');
    const [exportQuality, setExportQuality] = useState<ExportQuality>('standard');
    const [orientation, setOrientation] = useState<ExportOrientation>(() => aspectRatioToOrientation(settings.aspectRatio || '16:9'));
    const [selectedFps, setSelectedFps] = useState(settings.fps || 30);

    const selectedPreset = useMemo(() =>
        EXPORT_PRESETS.find(p => p.id === selectedPresetId) || EXPORT_PRESETS.find(p => p.id === 'hd_1080')!,
        [selectedPresetId]
    );

    const outputDims = useMemo(() =>
        getOutputDimensions(selectedPreset, orientation),
        [selectedPreset, orientation]
    );

    // Total timeline duration in seconds
    const totalDuration = useMemo(() => {
        const fps = settings.fps || 30;
        const videoClips = clips.filter(c => c.type !== 'audio');
        if (videoClips.length === 0) return 0;
        const maxFrame = Math.max(...videoClips.map(c => c.endFrame));
        return maxFrame / fps;
    }, [clips, settings.fps]);

    const estimatedSize = useMemo(() =>
        estimateFileSize(selectedPreset, exportQuality, totalDuration),
        [selectedPreset, exportQuality, totalDuration]
    );

    // Sync orientation with project settings when they change
    useEffect(() => {
        setOrientation(aspectRatioToOrientation(settings.aspectRatio || '16:9'));
    }, [settings.aspectRatio]);

    useEffect(() => {
        if (settings.fps) setSelectedFps(settings.fps);
    }, [settings.fps]);

    useEffect(() => {
        const cleanup = window.ipcRenderer.onExportProgress((progress) => {
            if (isExportingAME) setAmeProgress(progress);
            if (isExportingDirect) setDirectProgress(progress);
        });
        return cleanup;
    }, [isExportingAME, isExportingDirect]);

    const handleExportDirect = async () => {
        if (clips.length === 0) { toast.warning('Timeline is empty!'); return; }
        try {
            setIsExportingDirect(true); setDirectProgress(0);
            const safeProjectName = settings.name?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'mmmedia_project';
            const { canceled, filePath } = await window.ipcRenderer.showExportDialog({
                defaultPath: `${safeProjectName}_Final.${selectedPreset.ext}`,
                filters: [{ name: `${selectedPreset.codec === 'libx265' ? 'HEVC' : 'H.264'} Video`, extensions: [selectedPreset.ext] }]
            });
            if (canceled || !filePath) { setIsExportingDirect(false); return; }
            const result = await window.ipcRenderer.exportProject({
                filePath,
                clips,
                settings: {
                    ...settings,
                    exportQuality,
                    exportPresetId: selectedPresetId,
                    exportOrientation: orientation,
                    exportFps: selectedFps,
                    outputWidth: outputDims.w,
                    outputHeight: outputDims.h,
                    outputCodec: selectedPreset.codec,
                    outputBitrate: selectedPreset.bitrate,
                    outputAudioBitrate: selectedPreset.audioBitrate,
                },
                isIntermediate: false
            });
            if (result.success) {
                setLastExportPath(filePath);
            } else { toast.error(`Export Failed: ${result.error || 'Unknown error'}`); }
        } catch (error) { console.error('Export error:', error); toast.error('An unexpected error occurred during export.'); }
        finally { setIsExportingDirect(false); }
    };

    const handleExportAME = async () => {
        if (clips.length === 0) { toast.warning('Timeline is empty!'); return; }
        try {
            setIsExportingAME(true); setAmeProgress(0);
            const safeProjectName = settings.name?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'mmmedia_project';
            const { canceled, filePath } = await window.ipcRenderer.showExportDialog({
                defaultPath: `${safeProjectName}_AME_Export.mp4`,
                filters: [{ name: 'High Quality MP4', extensions: ['mp4'] }]
            });
            if (canceled || !filePath) { setIsExportingAME(false); return; }
            const result = await window.ipcRenderer.exportProject({
                filePath, clips, settings: {
                    ...settings,
                    outputWidth: outputDims.w,
                    outputHeight: outputDims.h,
                    outputCodec: 'libx264',
                    outputBitrate: 0,
                    outputAudioBitrate: 320,
                },
                isIntermediate: true
            });
            if (result.success) {
                setLastExportPath(filePath);
                const ameResult = await window.ipcRenderer.openInAME(filePath);
                if (!ameResult.success) toast.warning(`Saved to ${filePath}, but couldn't open Adobe Media Encoder: ${ameResult.error}`);
            } else { toast.error(`Export Failed: ${result.error || 'Unknown error'}`); }
        } catch (error) { console.error('Export error:', error); toast.error('An unexpected error occurred during export.'); }
        finally { setIsExportingAME(false); }
    };

    const handleExportManifest = async () => {
        if (clips.length === 0) { toast.warning('Timeline is empty!'); return; }
        try {
            setIsExporting(true);
            const manifest = generateManifest();
            const result = await window.ipcRenderer.saveManifest(JSON.stringify(manifest, null, 2));
            if (result.success) { setLastExportPath(result.filePath || 'manifest.json'); } else { toast.error(`Export Failed: ${result.error}`); }
        } catch (error) { console.error('Export error:', error); toast.error('An unexpected error occurred during export.'); }
        finally { setIsExporting(false); }
    };

    const orientationOptions: { key: ExportOrientation; icon: React.ReactNode; label: string }[] = [
        { key: 'landscape', icon: <RectangleHorizontal size={14} />, label: '16:9' },
        { key: 'portrait', icon: <Smartphone size={14} />, label: '9:16' },
        { key: 'square', icon: <Square size={14} />, label: '1:1' },
        { key: 'auto', icon: <RotateCcw size={14} />, label: 'Auto' },
    ];

    const groupedPresets = useMemo(() => {
        return PRESET_CATEGORIES.map(cat => ({
            ...cat,
            presets: EXPORT_PRESETS.filter(p => p.category === cat.id),
        }));
    }, []);

    // Render animation SVG
    const RenderAnimation = ({ progress }: { progress: number }) => (
        <div className="flex flex-col items-center gap-4 py-4">
            <svg width="200" height="120" viewBox="0 0 200 120" className="drop-shadow-2xl">
                {/* Film strip base */}
                <rect x="10" y="25" width="180" height="70" rx="6" fill="#1a1a2e" stroke="#6366f1" strokeWidth="1.5" opacity="0.8" />
                {/* Sprocket holes */}
                {[0,1,2,3,4,5,6,7].map(i => (
                    <React.Fragment key={i}>
                        <rect x={20 + i * 22} y="29" width="8" height="8" rx="1.5" fill="#0d0d1a" stroke="#6366f1" strokeWidth="0.5" opacity="0.6" />
                        <rect x={20 + i * 22} y="83" width="8" height="8" rx="1.5" fill="#0d0d1a" stroke="#6366f1" strokeWidth="0.5" opacity="0.6" />
                    </React.Fragment>
                ))}
                {/* Progress fill */}
                <rect x="12" y="40" width={Math.max(0, (176 * progress) / 100)} height="40" rx="3" fill="url(#renderGrad)" opacity="0.9">
                    <animate attributeName="opacity" values="0.7;1;0.7" dur="2s" repeatCount="indefinite" />
                </rect>
                {/* Frame markers */}
                {[0,1,2,3,4,5,6].map(i => {
                    const x = 18 + i * 25;
                    const isRendered = (i / 7) * 100 < progress;
                    return (
                        <rect key={i} x={x} y="42" width="18" height="36" rx="2"
                            fill={isRendered ? 'none' : '#0d0d1a'} stroke={isRendered ? '#a78bfa' : '#333'} strokeWidth="1" opacity={isRendered ? 0.3 : 0.5} />
                    );
                })}
                {/* Scan line */}
                <line x1={12 + (176 * progress) / 100} y1="27" x2={12 + (176 * progress) / 100} y2="93" stroke="#a78bfa" strokeWidth="2" opacity="0.9">
                    <animate attributeName="opacity" values="0.5;1;0.5" dur="0.8s" repeatCount="indefinite" />
                </line>
                <defs>
                    <linearGradient id="renderGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="var(--color-primary)" />
                        <stop offset="50%" stopColor="var(--color-primary-300, #a78bfa)" />
                        <stop offset="100%" stopColor="var(--color-secondary)" />
                    </linearGradient>
                </defs>
            </svg>
            <div className="flex items-center gap-3 text-xs">
                <span className="text-white/50 font-mono">Encoding {selectedPreset.name}</span>
                <span className="text-primary-300 font-black text-lg font-mono">{progress}%</span>
            </div>
            <div className="w-full bg-black/30 h-2 rounded-full overflow-hidden">
                <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-primary via-primary-300 to-secondary"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                />
            </div>
        </div>
    );

    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto p-8 flex flex-col gap-8">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-primary to-secondary rounded-lg shadow-lg">
                        <Share size={20} className="text-white drop-shadow-md" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">Export Project</h2>
                        <p className="text-xs text-white/50">Export your timeline to professional editing software or social media.</p>
                    </div>
                </div>

                {/* ═══════ Direct Video Export (Main) ═══════ */}
                <div className="border border-white/5 rounded-xl bg-black/20 p-5 space-y-5 relative overflow-hidden group hover:border-primary/30 transition-colors">
                    <div className="absolute -top-16 -right-16 w-48 h-48 bg-primary/10 rounded-full blur-[60px] pointer-events-none" />
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary-300 border border-primary/20 flex-shrink-0"><Film size={24} /></div>
                        <div>
                            <h3 className="text-sm font-bold text-white">Direct Video Render</h3>
                            <p className="text-[10px] text-white/40">Render a final, fully processed video using the built-in FFmpeg engine.</p>
                        </div>
                    </div>

                    {/* Render Animation (shown during export) */}
                    {isExportingDirect && (
                        <div className="relative z-10">
                            <RenderAnimation progress={directProgress} />
                        </div>
                    )}

                    {/* Preset Selector (hidden during export) */}
                    {!isExportingDirect && (
                        <div className="bg-black/40 rounded-lg p-4 space-y-4 border border-white/5 relative z-10">
                            {/* Preset Dropdown */}
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] text-white/50 font-mono uppercase tracking-wider">Preset</span>
                                <select
                                    value={selectedPresetId}
                                    onChange={(e) => setSelectedPresetId(e.target.value)}
                                    className="bg-black/60 text-white text-xs font-bold border border-white/10 rounded-lg px-3 py-1.5 min-w-[240px] focus:outline-none focus:border-primary/50 cursor-pointer"
                                >
                                    {groupedPresets.map(group => (
                                        <optgroup key={group.id} label={`${group.label}`}>
                                            {group.presets.map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                            </div>

                            {/* Orientation Toggle */}
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] text-white/50 font-mono uppercase tracking-wider">Orientation</span>
                                <div className="flex bg-black/40 rounded-lg border border-white/10 p-0.5 gap-0.5">
                                    {orientationOptions.map(o => (
                                        <button key={o.key} onClick={() => setOrientation(o.key)}
                                            className={clsx(
                                                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-all text-[10px] font-bold uppercase",
                                                orientation === o.key
                                                    ? "bg-primary/80 text-white shadow-lg shadow-primary/20"
                                                    : "hover:bg-white/5 text-white/40"
                                            )}>
                                            {o.icon} {o.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Quality Tier */}
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] text-white/50 font-mono uppercase tracking-wider">Quality</span>
                                <div className="flex bg-black/40 rounded-lg border border-white/10 p-0.5 gap-0.5">
                                    {(["draft", "standard", "master"] as const).map(q => (
                                        <button key={q} onClick={() => setExportQuality(q)}
                                            className={clsx("px-3 py-1.5 rounded-md transition-all text-[10px] uppercase font-bold",
                                                exportQuality === q ? "bg-primary/80 text-white shadow-lg shadow-primary/20" : "hover:bg-white/5 text-white/40")}>
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* FPS Selector */}
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] text-white/50 font-mono uppercase tracking-wider">Frame Rate</span>
                                <select
                                    value={selectedFps}
                                    onChange={(e) => setSelectedFps(Number(e.target.value))}
                                    className="bg-black/60 text-white text-xs font-bold border border-white/10 rounded-lg px-3 py-1.5 focus:outline-none focus:border-primary/50 cursor-pointer"
                                >
                                    {FPS_OPTIONS.map(f => (
                                        <option key={f.value} value={f.value}>{f.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Live Preview Summary */}
                            <div className="border-t border-white/5 pt-3 mt-2 grid grid-cols-2 gap-x-8 gap-y-1.5 text-[10px] font-mono">
                                <div className="flex justify-between"><span className="text-white/30">Resolution</span><span className="text-white font-bold">{outputDims.w} × {outputDims.h}</span></div>
                                <div className="flex justify-between"><span className="text-white/30">Codec</span><span className="text-white font-bold">{selectedPreset.codec === 'libx265' ? 'HEVC (H.265)' : 'H.264'}</span></div>
                                <div className="flex justify-between"><span className="text-white/30">Bitrate</span><span className="text-white font-bold">{selectedPreset.bitrate > 0 ? `${(selectedPreset.bitrate / 1000).toFixed(1)} Mbps` : 'Variable (CRF)'}</span></div>
                                <div className="flex justify-between"><span className="text-white/30">Audio</span><span className="text-white font-bold">AAC {selectedPreset.audioBitrate}k</span></div>
                                <div className="flex justify-between"><span className="text-white/30">Duration</span><span className="text-white font-bold">{totalDuration > 0 ? `${Math.floor(totalDuration / 60)}:${String(Math.floor(totalDuration % 60)).padStart(2, '0')}` : '—'}</span></div>
                                <div className="flex justify-between items-center">
                                    <span className="text-white/30 flex items-center gap-1"><HardDrive size={10} /> Est. Size</span>
                                    <span className="text-primary-300 font-bold">{estimatedSize > 1024 ? `~${(estimatedSize / 1024).toFixed(1)} GB` : `~${Math.round(estimatedSize)} MB`}</span>
                                </div>
                                <div className="col-span-2 flex justify-between"><span className="text-white/30">Description</span><span className="text-primary-300/80">{selectedPreset.description}</span></div>
                            </div>
                        </div>
                    )}

                    {/* Render Button */}
                    <motion.button onClick={handleExportDirect} disabled={clips.length === 0 || isExporting || isExportingAME || isExportingDirect} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        className={clsx("w-full py-3 rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale transition-shadow relative z-10",
                            isExportingDirect ? "bg-primary/30 text-white border border-primary/30 cursor-wait" : "text-white bg-gradient-to-r from-primary to-secondary shadow-[0_0_20px_rgba(var(--color-primary),0.3)]")}>
                        {isExportingDirect ? (
                            <span className="text-white/60">Rendering in progress...</span>
                        ) : <><Film size={16} /> Render {selectedPreset.name}</>}
                    </motion.button>
                </div>

                {/* ═══════ Manifest Export ═══════ */}
                <div className="border border-white/5 rounded-xl bg-black/20 p-5 space-y-5 relative overflow-hidden group hover:border-primary/30 transition-colors">
                    <div className="absolute -top-16 -right-16 w-48 h-48 bg-primary/10 rounded-full blur-[60px] pointer-events-none" />
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary border border-primary/20 flex-shrink-0"><FileCode size={24} /></div>
                        <div>
                            <h3 className="text-sm font-bold text-white">Manifest for Premiere Pro</h3>
                            <p className="text-[10px] text-white/40">Export the raw timeline data payload for the MMMedia Premiere Pro Extension.</p>
                        </div>
                    </div>
                    <div className="bg-black/40 rounded-lg p-4 text-[10px] text-white/50 space-y-2 font-mono border border-white/5 relative z-10">
                        <div className="flex justify-between border-b border-white/5 pb-2"><span>Format</span><span className="text-white font-bold">Native JSON payload</span></div>
                        <div className="flex justify-between"><span>Integration</span><span className="text-white font-bold">MMMedia Premiere Panel Extension</span></div>
                    </div>
                    <motion.button onClick={handleExportManifest} disabled={clips.length === 0 || isExporting} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        className="w-full py-3 rounded-lg text-xs font-black uppercase tracking-wider text-white bg-gradient-to-r from-primary to-blue-600 shadow-[0_0_20px_rgba(var(--color-primary),0.3)] hover:shadow-[0_0_30px_rgba(var(--color-primary),0.5)] flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale transition-shadow relative z-10">
                        {isExporting ? 'Saving Payload...' : <><FileJson size={16} /> Export Manifest for Premiere</>}
                    </motion.button>
                </div>

                {/* ═══════ AME Export ═══════ */}
                <div className="border border-white/5 rounded-xl bg-black/20 p-5 space-y-5 relative overflow-hidden group hover:border-accent/30 transition-colors">
                    <div className="absolute -top-16 -right-16 w-48 h-48 bg-accent/10 rounded-full blur-[60px] pointer-events-none" />
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="h-12 w-12 rounded-xl bg-accent/20 flex items-center justify-center text-accent border border-accent/20 flex-shrink-0"><MonitorUp size={24} /></div>
                        <div>
                            <h3 className="text-sm font-bold text-white">Adobe Media Encoder</h3>
                            <p className="text-[10px] text-white/40">Render a high-quality intermediate and open automatically in Adobe Media Encoder.</p>
                        </div>
                    </div>
                    <div className="bg-black/40 rounded-lg p-4 text-[10px] text-white/50 space-y-2 font-mono border border-white/5 relative z-10">
                        <div className="flex justify-between border-b border-white/5 pb-2"><span>Format</span><span className="text-white font-bold">High Quality MP4 (Lossless H.264)</span></div>
                        <div className="flex justify-between text-accent/80"><span>Integration</span><span className="font-bold">Launches AME with right dimensions</span></div>
                    </div>
                    <motion.button onClick={handleExportAME} disabled={clips.length === 0 || isExporting || isExportingAME} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        className={clsx("w-full py-3 rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale transition-shadow relative z-10",
                            isExportingAME ? "bg-accent/30 text-white border border-accent/30" : "text-white bg-gradient-to-r from-accent to-emerald-600 shadow-[0_0_20px_rgba(0,200,150,0.3)]")}>
                        {isExportingAME ? (
                            <div className="flex items-center gap-3 w-full px-4">
                                <span className="flex-1 text-left">Rendering...</span>
                                <span className="text-white/80 font-mono">{ameProgress}%</span>
                                <div className="w-1/4 bg-black/30 h-1.5 rounded-full overflow-hidden"><div className="bg-white h-full transition-all duration-300 rounded-full" style={{ width: `${ameProgress}%` }} /></div>
                            </div>
                        ) : <><Film size={16} /> Export via Adobe Media Encoder</>}
                    </motion.button>
                </div>

                {/* Last Export Path */}
                {lastExportPath && (
                    <div className="flex items-center gap-2 text-green-400 text-[10px] bg-green-900/20 p-3 rounded-lg justify-center border border-green-500/20 font-bold">
                        <CheckCircle size={12} /><span className="truncate max-w-md">Saved to: {lastExportPath}</span>
                    </div>
                )}
            </div>
        </div>
    );
};
