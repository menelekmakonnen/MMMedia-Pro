import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Crown, Clock, Zap, Music, Upload, Play, Pause, Trash2, Loader2, Sparkles, Film, ChevronDown, ChevronUp, Heart, Camera, Clapperboard, Podcast, Monitor, Globe, Dumbbell, Scissors, ArrowLeftRight, Flame, Video, Wand2, Settings2, Layers, SlidersHorizontal, ArrowRight } from 'lucide-react';
import { useViewStore } from '../../store/viewStore';
import { useGodModeStore } from '../../store/godModeStore';
import { useMediaStore } from '../../store/mediaStore';
import { analyzeAudio, AudioAnalysisResult } from '../../lib/audioAnalysis';
import clsx from 'clsx';

const VIBES = [
    { id: 'clean', emoji: '🧊', label: 'Clean', desc: 'Minimal, no effects' },
    { id: 'cinematic', emoji: '🎬', label: 'Cinematic', desc: 'Elegant, film-grade' },
    { id: 'high-energy', emoji: '⚡', label: 'High Energy', desc: 'Punchy, beat-locked' },
    { id: 'chaos', emoji: '🔥', label: 'Maximum', desc: 'Full chaos mode' },
    { id: 'viral', emoji: '📱', label: 'Viral', desc: 'Retention-optimized' },
];

const TIERS = [
    { label: 'Simple', color: 'text-emerald-400' },
    { label: 'Moderate', color: 'text-sky-400' },
    { label: 'High Energy', color: 'text-amber-400' },
    { label: 'Maximum Chaos', color: 'text-red-400' },
] as const;

const PRESETS = [
    { id: 'gm-clean-cut', name: 'Clean Cut', icon: Scissors, desc: 'Precise hard cuts, no effects', tier: 0 },
    { id: 'gm-slideshow', name: 'Elegant Hold', icon: Monitor, desc: 'Long cinematic holds', tier: 0 },
    { id: 'gm-soft-story', name: 'Story Mode', icon: Podcast, desc: 'Vlog-paced narrative', tier: 0 },
    { id: 'gm-quick-recap', name: 'Quick Recap', icon: Zap, desc: 'Snappy 15s summary', tier: 0 },
    { id: 'gm-dynamic-intro', name: 'Dynamic Intro', icon: ArrowLeftRight, desc: 'Builds momentum', tier: 0 },
    { id: 'gm-gentle-zoom', name: 'Gentle Zoom', icon: Camera, desc: 'Soft Ken Burns zooms', tier: 1 },
    { id: 'gm-wedding', name: 'Wedding Film', icon: Heart, desc: 'Slow zooms + gentle ramps', tier: 1 },
    { id: 'gm-montage-mix', name: 'Montage Mix', icon: Clapperboard, desc: 'Mixed cuts, tasteful', tier: 1 },
    { id: 'gm-travel-diary', name: 'Travel Diary', icon: Globe, desc: 'Dreamy zooms + warm pacing', tier: 1 },
    { id: 'gm-golden-hour', name: 'Golden Hour', icon: Sparkles, desc: 'Sunset vibes, slow reveals', tier: 1 },
    { id: 'gm-noir', name: 'Film Noir', icon: Film, desc: 'Dark drama, slow crawl', tier: 1 },
    { id: 'gm-music-video', name: 'Music Video', icon: Music, desc: 'Beat-locked zooms', tier: 2 },
    { id: 'gm-action-trailer', name: 'Action Trailer', icon: Flame, desc: 'Hard ramps + triple-shot', tier: 2 },
    { id: 'gm-instagram', name: 'Reels Banger', icon: Video, desc: 'Snappy zoom drops', tier: 2 },
    { id: 'gm-gym-pump', name: 'Gym Pump', icon: Dumbbell, desc: 'Athletic ramps + punches', tier: 2 },
    { id: 'gm-concert', name: 'Concert Edit', icon: Music, desc: 'Beat-locked + boomerangs', tier: 2 },
    { id: 'gm-tiktok', name: 'TikTok Viral', icon: Zap, desc: 'Full chaos, every effect', tier: 3 },
    { id: 'gm-whiplash', name: 'Whiplash', icon: Flame, desc: 'Extreme speed contrast', tier: 3 },
    { id: 'gm-stutter-storm', name: 'Stutter Storm', icon: Sparkles, desc: 'Rapid micro-boomerangs', tier: 3 },
    { id: 'gm-sensory-overload', name: 'Sensory Overload', icon: Zap, desc: 'All effects stacked', tier: 3 },
    { id: 'gm-glitch-out', name: 'Glitch Out', icon: Flame, desc: 'Stutter + whiplash chaos', tier: 3 },
];

const TRANSITION_PRESETS = ['cinematic', 'buttery', 'kinetic', 'whip-pan', 'snap-cut', 'viral', 'dramatic', 'all'];

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
    const [showAdvanced, setShowAdvanced] = useState(false);

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
            gm.setAudioGuide({ useAudioGuide: true, audioAnalysis: result, audioTrimEnd: Math.min(gm.duration, result.duration) });
            await ctx.close();
        } catch (err) { console.warn('Audio analysis failed:', err); }
        finally { setIsAnalyzing(false); }
    };

    const handleRemoveAudio = () => {
        if (gm.audioUrl) URL.revokeObjectURL(gm.audioUrl);
        gm.setAudioGuide({ useAudioGuide: false, audioFile: null, audioUrl: null, audioAnalysis: null, audioTrimStart: 0, audioTrimEnd: 30 });
        setAudioPlaying(false);
    };

    const toggleAudio = () => {
        if (!audioRef.current) return;
        if (audioPlaying) { audioRef.current.pause(); setAudioPlaying(false); }
        else { audioRef.current.currentTime = gm.audioTrimStart; audioRef.current.play().catch(() => {}); setAudioPlaying(true); }
    };

    const handleGoToTrailer = () => {
        gm.setEnabled(true);
        setActiveTab('trailer');
    };

    const handlePresetGenerate = (presetId: string) => {
        gm.setEnabled(true);
        gm.setVibe(presetId);
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
                <div className="border border-yellow-500/10 rounded-xl bg-black/20 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <Music size={14} className={gm.useAudioGuide ? "text-purple-400" : "text-white/40"} />
                        <span className="text-xs font-bold text-yellow-100">Music Selection</span>
                        {gm.useAudioGuide && <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full font-bold ml-auto">Active</span>}
                        {gm.audioAnalysis && <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full font-bold">{gm.audioAnalysis.bpm} BPM</span>}
                    </div>
                    <p className="text-[9px] text-white/30">Add music before choosing a vibe for beat-synced generation.</p>
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
                </div>

                {/* ── Vibe Picker ── */}
                <div className="space-y-2">
                    <div className="text-[9px] font-black uppercase tracking-widest text-yellow-300/60">What's the vibe?</div>
                    <div className="grid grid-cols-5 gap-2">
                        {VIBES.map(v => (
                            <button key={v.id} onClick={() => gm.setVibe(v.id)}
                                className={clsx("p-3 rounded-xl border text-center transition-all",
                                    gm.vibe === v.id
                                        ? "border-yellow-400 bg-yellow-500/20 shadow-lg shadow-yellow-500/10"
                                        : "border-white/10 bg-black/30 hover:bg-white/5 hover:border-white/20")}>
                                <div className="text-xl mb-1">{v.emoji}</div>
                                <div className={clsx("text-[10px] font-black uppercase", gm.vibe === v.id ? "text-yellow-200" : "text-white/60")}>{v.label}</div>
                                <div className="text-[8px] text-white/30 mt-0.5">{v.desc}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Generate Button ── */}
                {gm.vibe && (
                    <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                        onClick={handleGoToTrailer} disabled={videoCount === 0}
                        className="w-full py-4 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 text-black font-black uppercase tracking-wider text-sm shadow-xl shadow-yellow-500/20 hover:shadow-yellow-500/40 transition-all disabled:opacity-40 disabled:grayscale">
                        <Crown className="inline mr-2" size={16} />
                        Generate {gm.vibe === 'viral' ? 'Viral' : gm.vibe === 'chaos' ? 'Chaotic' : gm.vibe === 'cinematic' ? 'Cinematic' : gm.vibe === 'high-energy' ? 'Energetic' : 'Clean'} Edit — {gm.duration}s
                    </motion.button>
                )}

                {/* ── Transitions ── */}
                <div className="border border-yellow-500/10 rounded-xl bg-black/20 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black uppercase tracking-widest text-yellow-100/60 flex items-center gap-2">
                            <Layers size={12} className={gm.transitionsEnabled ? "text-pink-400" : "text-white/30"} /> Transitions
                            {gm.transitionsEnabled && <span className="text-[9px] bg-pink-500/20 text-pink-300 px-1.5 py-0.5 rounded-full font-bold">On</span>}
                        </label>
                        <button onClick={() => gm.setTransitions({ enabled: !gm.transitionsEnabled })}
                            className={clsx("w-10 h-5 rounded-full transition-colors relative", gm.transitionsEnabled ? "bg-pink-500" : "bg-black border border-white/20")}>
                            <div className={clsx("w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform", gm.transitionsEnabled ? "translate-x-5" : "translate-x-0.5")} />
                        </button>
                    </div>
                    {gm.transitionsEnabled && (
                        <div className="flex flex-wrap gap-1.5">
                            {TRANSITION_PRESETS.map(preset => (
                                <button key={preset} onClick={() => gm.setTransitions({ preset })}
                                    className={clsx("px-2 py-1 rounded-lg text-[9px] font-bold uppercase transition-all border",
                                        gm.transitionPreset === preset ? "bg-pink-600/20 border-pink-500 text-pink-200" : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10")}>
                                    {preset}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Advanced Presets ── */}
                <button onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-2 text-[9px] font-bold text-white/30 hover:text-white/50 transition-colors uppercase tracking-wider">
                    {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {showAdvanced ? 'Hide' : 'Show'} Advanced Presets
                </button>

                {showAdvanced && TIERS.map((tier, tierIdx) => {
                    const tierPresets = PRESETS.filter(p => p.tier === tierIdx);
                    if (tierPresets.length === 0) return null;
                    return (
                        <div key={tier.label} className="space-y-2">
                            <div className="flex items-center gap-2">
                                <span className={clsx("text-[9px] font-black uppercase tracking-widest", tier.color)}>{tier.label}</span>
                                <div className="flex-1 h-px bg-white/5" />
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {tierPresets.map(preset => {
                                    const Icon = preset.icon;
                                    return (
                                        <motion.button key={preset.id} whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
                                            onClick={() => handlePresetGenerate(preset.id)} disabled={videoCount === 0}
                                            className={clsx("p-3 rounded-xl border text-left transition-all group disabled:opacity-40 disabled:grayscale",
                                                tierIdx <= 1 ? "border-yellow-500/15 bg-gradient-to-br from-yellow-900/10 to-amber-900/5 hover:from-yellow-800/20"
                                                : tierIdx === 2 ? "border-orange-500/20 bg-gradient-to-br from-orange-900/10 to-red-900/5 hover:from-orange-800/20"
                                                : "border-red-500/25 bg-gradient-to-br from-red-900/15 to-pink-900/10 hover:from-red-800/25")}>
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <Icon size={14} className="text-yellow-400 group-hover:text-yellow-300" />
                                                <span className="text-[10px] font-black uppercase tracking-wider text-yellow-200">{preset.name}</span>
                                            </div>
                                            <span className="text-[9px] text-white/30 leading-tight">{preset.desc}</span>
                                        </motion.button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}

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
