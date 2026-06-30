import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Clock, Music, Upload, Play, Pause, Trash2, Loader2, Film, Wand2, ArrowRight, ChevronDown, ChevronUp, Sliders, ToggleLeft, ToggleRight, Repeat2 } from 'lucide-react';
import { useViewStore } from '../../store/viewStore';
import { useGodModeStore } from '../../store/godModeStore';
import { useMediaStore } from '../../store/mediaStore';
import { useClipStore } from '../../store/clipStore';
import { analyzeAudio } from '../../lib/audioAnalysis';
import { TrailerSettings, DEFAULT_TRAILER_SETTINGS } from '../../lib/trailerGenerator';
import { TEMPLATE_LIST, VIDEO_MODE_LIST, type TemplateId, type VideoMode } from '../../lib/editingModes';
import clsx from 'clsx';

export const GodModeTab: React.FC = () => {
    const { setActiveTab } = useViewStore();
    const gm = useGodModeStore();
    const { files } = useMediaStore();
    const videoCount = files.filter(f => f.type === 'video').length;

    // Local audio state
    const audioInputRef = useRef<HTMLInputElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const [audioPlaying, setAudioPlaying] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [customSpeedEnabled, setCustomSpeedEnabled] = useState(false);
    const [selectedSpeed, setSelectedSpeed] = useState<'none' | 'slowmo' | 'fast' | 'hyper'>('none');
    const [customSpeedValue, setCustomSpeedValue] = useState(1.0);

    const isShowreel = gm.videoMode === 'showreel';

    const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        gm.setAudioGuide({ useAudioGuide: true, audioFile: file.name, audioUrl: url });
        // Auto-analyze
        setIsAnalyzing(true);
        try {
            const resp = await fetch(url);
            const buf = await resp.arrayBuffer();
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const decoded = await ctx.decodeAudioData(buf);
            const result = await analyzeAudio(decoded);

            // ── INTELLIGENT SEGMENT SELECTION ──────────────────────────
            // Score each segment by type priority, energy, and beat density
            // to find the best region of the song for editing.
            const desiredDuration = gm.duration;
            let bestStart = 0;
            let bestEnd = Math.min(desiredDuration, result.duration);

            if (result.segments && result.segments.length > 1 && result.duration > desiredDuration * 1.5) {
                // Segment type priority scores (higher = more exciting for trailers)
                const TYPE_SCORE: Record<string, number> = {
                    'drop': 10, 'chorus': 8, 'buildup': 6, 'bridge': 4,
                    'verse': 3, 'breakdown': 2, 'intro': 1, 'outro': 0,
                };

                // Score every possible window position (1-second resolution)
                let bestScore = -1;
                const step = 1; // 1-second resolution
                const maxStart = Math.max(0, result.duration - desiredDuration);

                for (let windowStart = 0; windowStart <= maxStart; windowStart += step) {
                    const windowEnd = windowStart + desiredDuration;
                    let score = 0;

                    for (const seg of result.segments) {
                        // How much of this segment overlaps with our window?
                        const overlapStart = Math.max(seg.start, windowStart);
                        const overlapEnd = Math.min(seg.end, windowEnd);
                        const overlap = Math.max(0, overlapEnd - overlapStart);
                        if (overlap <= 0) continue;

                        const segDur = seg.end - seg.start;
                        const overlapRatio = segDur > 0 ? overlap / segDur : 0;

                        // Composite: type priority × energy × overlap
                        const typeWeight = TYPE_SCORE[seg.type] ?? 3;
                        const energyWeight = seg.avgEnergy * 2 + seg.peakEnergy;
                        const beatDensity = segDur > 0 ? seg.beatCount / segDur : 0;

                        score += overlapRatio * (typeWeight * 3 + energyWeight * 5 + beatDensity * 2);
                    }

                    // Small bonus for NOT starting at 0:00 (avoid intros)
                    if (windowStart > 5) score += 1;
                    // Small penalty for ending past 90% of song (often fade-outs)
                    if (windowEnd > result.duration * 0.9) score -= 2;

                    if (score > bestScore) {
                        bestScore = score;
                        bestStart = windowStart;
                        bestEnd = windowEnd;
                    }
                }

                // Snap to nearest beat for clean cut-in
                if (result.beats && result.beats.length > 0) {
                    const nearestBeat = result.beats.reduce((closest, b) =>
                        Math.abs(b.time - bestStart) < Math.abs(closest.time - bestStart) ? b : closest
                    );
                    if (Math.abs(nearestBeat.time - bestStart) < 1.5) {
                        bestStart = nearestBeat.time;
                        bestEnd = bestStart + desiredDuration;
                    }
                }

                // Final clamp
                bestEnd = Math.min(bestEnd, result.duration);
                bestStart = Math.max(0, bestEnd - desiredDuration);
            }

            gm.setAudioGuide({
                useAudioGuide: true,
                audioAnalysis: result,
                audioTrimStart: Math.round(bestStart * 100) / 100,
                audioTrimEnd: Math.round(bestEnd * 100) / 100,
            });
            await ctx.close();
        } catch (err) { console.warn('Audio analysis failed:', err); }
        finally { setIsAnalyzing(false); }
    };

    const handleRemoveAudio = () => {
        if (gm.audioUrl) URL.revokeObjectURL(gm.audioUrl);
        gm.setAudioGuide({ useAudioGuide: false, audioFile: null, audioUrl: null, audioAnalysis: null, audioTrimStart: 0, audioTrimEnd: 30 });
        setAudioPlaying(false);
        // Purge auto-generated audio clips from clip store
        const clipState = useClipStore.getState();
        const cleaned = clipState.clips.filter(
            (c: any) => !(c.type === 'audio' && c.origin === 'auto' && c.track === 101)
        );
        if (cleaned.length !== clipState.clips.length) {
            clipState.setClips(cleaned);
        }
    };

    const toggleAudio = () => {
        if (!audioRef.current) return;
        if (audioPlaying) { audioRef.current.pause(); setAudioPlaying(false); }
        else { audioRef.current.currentTime = gm.audioTrimStart; audioRef.current.play().catch(() => {}); setAudioPlaying(true); }
    };

    const handleGenerate = () => {
        const effectiveDuration = gm.useAudioGuide
            ? Math.round(gm.audioTrimEnd - gm.audioTrimStart)
            : gm.duration;

        const settings: Partial<TrailerSettings> & Record<string, any> = {
            ...DEFAULT_TRAILER_SETTINGS,
            targetDuration: effectiveDuration,
            allowDuplicates: true,
            useAllClips: gm.forceAllClips,
            templateIds: gm.selectedTemplates,
            videoMode: gm.videoMode,
            beatSensitivity: gm.beatSensitivity,
            templateCameraMotion: gm.cameraMotion,
            slowmoPolicy: customSpeedEnabled ? 'custom' : selectedSpeed,
            customSpeed: customSpeedEnabled ? customSpeedValue : undefined,
            ...(gm.useAudioGuide && gm.audioUrl ? {
                useAudioGuide: true,
                audioFile: gm.audioFile,
                audioUrl: gm.audioUrl,
                audioFilePath: gm.audioFilePath || undefined,
                audioAnalysis: gm.audioAnalysis,
                audioTrimStart: gm.audioTrimStart,
                audioTrimEnd: gm.audioTrimEnd,
            } : {}),
            // Boomerang
            boomerangAll: gm.boomerangMode === 'all',
        };

        gm.setAutoGenerate(settings as TrailerSettings);
        setActiveTab('trailer');
    };

    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto p-8 flex flex-col gap-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-yellow-500 to-amber-600 shadow-lg shadow-yellow-500/20">
                        <Crown size={24} className="text-black" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black tracking-tight text-yellow-100">God Mode</h2>
                        <p className="text-xs text-white/50">One-click epic edits — pick a genre and go.</p>
                    </div>
                    <div className="ml-auto text-xs text-white/30 font-mono">{videoCount} videos in pool</div>
                </div>

                {/* ── Video Mode Selector ── */}
                <div className="border border-yellow-500/15 rounded-xl bg-gradient-to-br from-yellow-900/10 to-amber-900/5 p-5 space-y-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-yellow-200/70">
                        What are you making?
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {VIDEO_MODE_LIST.map(mode => (
                            <motion.button
                                key={mode.id}
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.96 }}
                                onClick={() => gm.setVideoMode(mode.id as VideoMode)}
                                className={clsx(
                                    "flex items-center gap-2.5 px-3 py-3 rounded-xl text-left transition-all border backdrop-blur-sm",
                                    gm.videoMode === mode.id
                                        ? "bg-yellow-500/15 border-yellow-500/50 shadow-[0_0_20px_rgba(234,179,8,0.15)]"
                                        : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                                )}
                            >
                                <span className="text-xl">{mode.icon}</span>
                                <div>
                                    <div className={clsx("text-xs font-black uppercase tracking-wide",
                                        gm.videoMode === mode.id ? "text-yellow-200" : "text-white/70"
                                    )}>{mode.name}</div>
                                    <div className="text-[9px] text-white/30 leading-tight">{mode.description}</div>
                                </div>
                            </motion.button>
                        ))}
                    </div>
                </div>

                {/* ── Template Selector ── */}
                <div className="border border-yellow-500/15 rounded-xl bg-gradient-to-br from-purple-900/10 to-violet-900/5 p-5 space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold uppercase tracking-wider text-yellow-200/70">Templates</span>
                        <span className="text-[10px] text-white/30 italic">mix up to 3</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {TEMPLATE_LIST.map(tmpl => {
                            const isSelected = gm.selectedTemplates.includes(tmpl.id as TemplateId);
                            return (
                                <motion.button
                                    key={tmpl.id}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => gm.toggleTemplate(tmpl.id as TemplateId)}
                                    className={clsx(
                                        "flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-left transition-all border backdrop-blur-sm relative overflow-hidden",
                                        isSelected
                                            ? "bg-purple-500/15 border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.2)]"
                                            : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                                    )}
                                >
                                    {isSelected && <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/10 to-transparent pointer-events-none" />}
                                    <span className="text-lg relative z-10">{tmpl.icon}</span>
                                    <div className="relative z-10">
                                        <div className={clsx("text-[11px] font-bold",
                                            isSelected ? "text-purple-200" : "text-white/70"
                                        )}>{tmpl.name}</div>
                                        <div className="text-[9px] text-white/30">{tmpl.description}</div>
                                    </div>
                                </motion.button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Duration ── */}
                <div className="border border-yellow-500/15 rounded-xl bg-gradient-to-br from-yellow-900/10 to-amber-900/5 p-5 space-y-3">
                    <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-yellow-200/70">
                        <span className="flex items-center gap-1.5"><Clock size={12} /> Target Duration</span>
                        <span className="text-yellow-400 font-mono">{gm.duration}s</span>
                    </div>
                    <input type="range" min={5} max={180} step={5} value={gm.duration}
                        onChange={(e) => gm.setDuration(parseInt(e.target.value))}
                        className="w-full accent-yellow-500 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer" />
                    <div className="flex flex-wrap gap-2">
                        {[5, 10, 15, 30, 60, 90].map(val => (
                            <button key={val} onClick={() => gm.setDuration(val)}
                                className={clsx("flex-1 min-w-[40px] py-1.5 rounded-md text-[10px] font-bold transition-all border",
                                    gm.duration === val ? "bg-yellow-500 text-black border-yellow-400 shadow-lg" : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10")}>
                                {val}s
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Music Selection ── */}
                {isShowreel ? (
                    <div className="border border-amber-500/15 rounded-xl bg-amber-900/10 p-4 space-y-2">
                        <div className="flex items-center gap-2">
                            <Music size={14} className="text-amber-400/60" />
                            <span className="text-xs font-bold text-amber-200/60">Music</span>
                            <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full font-bold ml-auto">Disabled</span>
                        </div>
                        <p className="text-[10px] text-amber-200/40 leading-relaxed">
                            🎭 Music disabled — showreels perform best without background music.
                        </p>
                    </div>
                ) : (
                    <div className="border border-yellow-500/10 rounded-xl bg-black/20 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <Music size={14} className={gm.useAudioGuide ? "text-purple-400" : "text-white/40"} />
                            <span className="text-xs font-bold text-yellow-100">Music Selection</span>
                            {gm.useAudioGuide && <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full font-bold ml-auto">Active</span>}
                            {gm.audioAnalysis && <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full font-bold">{gm.audioAnalysis.bpm} BPM</span>}
                        </div>
                        <p className="text-[9px] text-white/30">Add music for beat-synced generation.</p>
                        <input type="file" ref={audioInputRef} accept="audio/*" className="hidden" onChange={handleAudioUpload} />
                        {gm.audioUrl && <audio ref={audioRef} src={gm.audioUrl}
                            onTimeUpdate={(e) => { if ((e.target as HTMLAudioElement).currentTime >= gm.audioTrimEnd) { (e.target as HTMLAudioElement).pause(); setAudioPlaying(false); }}} />}

                        {!gm.useAudioGuide ? (
                            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                onClick={() => audioInputRef.current?.click()}
                                className="w-full flex justify-center items-center gap-2 py-2.5 border border-dashed border-yellow-500/20 rounded-lg hover:border-purple-500/50 hover:bg-purple-500/10 text-white/50 hover:text-white transition-colors text-[10px] font-bold">
                                <Upload size={12} /> Select Audio File
                            </motion.button>
                        ) : (
                            <div className="flex items-center justify-between bg-white/5 p-2.5 rounded-lg border border-white/10">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <button onClick={toggleAudio} className="text-white hover:text-purple-400 transition-colors">
                                        {audioPlaying ? <Pause size={14} /> : <Play size={14} />}
                                    </button>
                                    <span className="text-[10px] font-bold text-white truncate">{gm.audioFile}</span>
                                    {isAnalyzing && <Loader2 size={12} className="animate-spin text-purple-400" />}
                                </div>
                                <button onClick={handleRemoveAudio} className="p-1.5 bg-red-500/20 hover:bg-red-500/40 rounded text-red-400"><Trash2 size={12} /></button>
                            </div>
                        )}
                        {gm.audioAnalysis && (
                            <div className="grid grid-cols-4 gap-1.5">
                                {[
                                    { label: 'BPM', value: `${gm.audioAnalysis.bpm}` },
                                    { label: 'Beats', value: `${gm.audioAnalysis.beats.length}` },
                                    { label: 'Segments', value: `${gm.audioAnalysis.segments.length}` },
                                    { label: 'Duration', value: `${gm.audioAnalysis.duration.toFixed(1)}s` },
                                ].map(stat => (
                                    <div key={stat.label} className="bg-black/40 rounded-lg p-2 border border-white/5">
                                        <div className="text-[8px] font-black uppercase text-white/30 tracking-widest">{stat.label}</div>
                                        <div className="text-xs font-black text-white">{stat.value}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {gm.audioAnalysis && gm.audioTrimStart > 0 && (
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[9px] bg-amber-500/20 text-amber-300 px-2 py-1 rounded-full font-bold border border-amber-500/20">
                                    ⚡ Best Segment
                                </span>
                                <span className="text-[10px] font-mono text-white/50">
                                    {Math.floor(gm.audioTrimStart / 60)}:{String(Math.floor(gm.audioTrimStart % 60)).padStart(2, '0')}
                                    {' → '}
                                    {Math.floor(gm.audioTrimEnd / 60)}:{String(Math.floor(gm.audioTrimEnd % 60)).padStart(2, '0')}
                                </span>
                                <span className="text-[9px] text-white/25">
                                    ({Math.round(gm.audioTrimEnd - gm.audioTrimStart)}s of {Math.round(gm.audioAnalysis.duration)}s)
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Generate Button ── */}
                <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                    onClick={handleGenerate} disabled={videoCount === 0}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 text-black font-black uppercase tracking-wider text-sm shadow-xl shadow-yellow-500/20 hover:shadow-yellow-500/40 transition-all disabled:opacity-40 disabled:grayscale">
                    <Crown className="inline mr-2" size={16} />
                    ⚡ Generate Edit — {gm.duration}s
                </motion.button>

                {/* ── Advanced Settings (collapsible) ── */}
                <div className="border border-white/5 rounded-xl overflow-hidden">
                    <button
                        onClick={() => setAdvancedOpen(!advancedOpen)}
                        className="w-full flex items-center justify-between p-4 bg-black/20 hover:bg-white/5 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <Sliders size={14} className="text-white/40" />
                            <span className="text-xs font-bold uppercase tracking-wider text-white/50">⚙️ Advanced</span>
                        </div>
                        {advancedOpen ? <ChevronUp size={14} className="text-white/30" /> : <ChevronDown size={14} className="text-white/30" />}
                    </button>

                    <AnimatePresence>
                        {advancedOpen && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                            >
                                <div className="p-5 space-y-5 border-t border-white/5">
                                    {/* Cinematic Speed */}
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
                                            <Clock size={12} className="text-blue-400" /> Cinematic Speed
                                        </label>
                                        <div className="grid grid-cols-4 gap-2">
                                            {[
                                                { id: 'none', label: 'Normal', speed: '1x' },
                                                { id: 'slowmo', label: 'Slow-Mo', speed: '0.5x' },
                                                { id: 'fast', label: 'Fast', speed: '1.5x' },
                                                { id: 'hyper', label: 'Hyper', speed: '4x' },
                                            ].map(opt => (
                                                <button key={opt.id} onClick={() => { setSelectedSpeed(opt.id as any); setCustomSpeedEnabled(false); }}
                                                    className={clsx("p-2 rounded-lg border text-center transition-all",
                                                        !customSpeedEnabled && selectedSpeed === opt.id
                                                            ? "bg-blue-600/20 border-blue-500/40"
                                                            : "bg-white/5 border-white/5 hover:bg-white/10")}>
                                                    <div className={clsx("text-[10px] font-black uppercase",
                                                        !customSpeedEnabled && selectedSpeed === opt.id ? "text-blue-200" : "text-white/60"
                                                    )}>{opt.label}</div>
                                                    <div className="text-[9px] text-white/30">{opt.speed}</div>
                                                </button>
                                            ))}
                                        </div>
                                        <button onClick={() => setCustomSpeedEnabled(!customSpeedEnabled)}
                                            className={clsx("px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase transition-all",
                                                customSpeedEnabled ? "bg-blue-600/20 border-blue-500/40 text-blue-200" : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10")}>
                                            Custom Speed
                                        </button>
                                        {customSpeedEnabled && (
                                            <div className="flex flex-col gap-1">
                                                <input type="range" min={0.25} max={8} step={0.25} value={customSpeedValue}
                                                    onChange={(e) => setCustomSpeedValue(parseFloat(e.target.value))}
                                                    className="w-full accent-blue-500 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer" />
                                                <div className="flex justify-between text-[9px] text-white/30 font-mono">
                                                    <span>0.25x</span><span>8x</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Beat Sensitivity */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-white/70">
                                            <span className="flex items-center gap-1.5 text-[10px]">🎵 Beat Sensitivity</span>
                                            <span className="text-purple-400 font-mono text-[10px]">{gm.beatSensitivity.toFixed(1)}</span>
                                        </div>
                                        <input type="range" min={0} max={1} step={0.05} value={gm.beatSensitivity}
                                            onChange={(e) => gm.setBeatSensitivity(parseFloat(e.target.value))}
                                            className="w-full accent-purple-500 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer" />
                                        <div className="flex justify-between text-[9px] text-white/30 font-mono">
                                            <span>Loose</span><span>Tight</span>
                                        </div>
                                    </div>

                                    {/* Camera Motion */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-white/70">
                                            <span className="flex items-center gap-1.5 text-[10px]">📷 Camera Motion</span>
                                            <span className="text-teal-400 font-mono text-[10px]">{gm.cameraMotion.toFixed(1)}</span>
                                        </div>
                                        <input type="range" min={0} max={1} step={0.05} value={gm.cameraMotion}
                                            onChange={(e) => gm.setCameraMotion(parseFloat(e.target.value))}
                                            className="w-full accent-teal-500 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer" />
                                        <div className="flex justify-between text-[9px] text-white/30 font-mono">
                                            <span>Static</span><span>Dynamic</span>
                                        </div>
                                    </div>

                                    {/* Toggles */}
                                    <div className="flex flex-col sm:flex-row gap-3">
                                        <label className="flex flex-1 items-center justify-between p-3 rounded-xl border border-white/5 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-[11px] font-bold text-white">Allow Duplicates</span>
                                                <span className="text-[9px] text-white/30">Same clip can appear multiple times</span>
                                            </div>
                                            <div className="relative">
                                                <input type="checkbox" className="sr-only" checked={true} readOnly />
                                                <div className="w-8 h-4 rounded-full bg-purple-500">
                                                    <div className="w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 translate-x-4" />
                                                </div>
                                            </div>
                                        </label>
                                        <label className="flex flex-1 items-center justify-between p-3 rounded-xl border border-white/5 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-[11px] font-bold text-white">Force All Clips</span>
                                                <span className="text-[9px] text-white/30">Every file appears at least once</span>
                                            </div>
                                            <div className="relative">
                                                <input type="checkbox" className="sr-only" checked={gm.forceAllClips}
                                                    onChange={(e) => gm.setForceAllClips(e.target.checked)} />
                                                <div className={clsx("w-8 h-4 rounded-full transition-colors", gm.forceAllClips ? "bg-emerald-500" : "bg-black border border-white/20")}>
                                                    <div className={clsx("w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-transform", gm.forceAllClips ? "translate-x-4" : "translate-x-0.5")} />
                                                </div>
                                            </div>
                                        </label>
                                    </div>

                                    {/* Boomerang */}
                                    <div className="p-4 rounded-xl border border-cyan-500/10 bg-cyan-500/5 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <Repeat2 size={14} className="text-cyan-400" />
                                            <span className="text-[11px] font-bold text-cyan-200">Boomerang Effect</span>
                                        </div>
                                        <p className="text-[9px] text-white/40 leading-relaxed">
                                            Damped-bounce forward↔reverse — clips snap back like a rubber band.
                                        </p>
                                        {/* Mode selector */}
                                        <div className="grid grid-cols-3 gap-1.5">
                                            {([['off', 'Off', '🚫'], ['drops', 'Drops Only', '🎯'], ['all', 'All Clips', '🔁']] as const).map(([mode, label, icon]) => (
                                                <button
                                                    key={mode}
                                                    onClick={() => gm.setBoomerangMode(mode)}
                                                    className={clsx(
                                                        "px-2 py-2 rounded-lg text-[10px] font-bold transition-all border text-center",
                                                        gm.boomerangMode === mode
                                                            ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.15)]"
                                                            : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10"
                                                    )}
                                                >
                                                    <span className="block text-sm mb-0.5">{icon}</span>
                                                    {label}
                                                </button>
                                            ))}
                                        </div>

                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* ── Bottom Nav ── */}
                <div className="border-t border-white/5 pt-4 flex items-center justify-between">
                    <span className="text-xs text-white/30 font-mono uppercase tracking-wider">Or go directly:</span>
                    <div className="flex gap-3">
                        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => setActiveTab('trailer')}
                            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-xs font-bold uppercase tracking-wider transition-all">
                            <Wand2 size={14} /> Trailer Wizard <ArrowRight size={14} />
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => setActiveTab('timeline')}
                            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-xs font-bold uppercase tracking-wider transition-all">
                            <Film size={14} /> Timeline <ArrowRight size={14} />
                        </motion.button>
                    </div>
                </div>
            </div>
        </div>
    );
};
