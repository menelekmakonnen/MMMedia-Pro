import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Crown, Clock, Zap, Music, Upload, Play, Pause, Trash2, Loader2, Sparkles, Film, ChevronDown, ChevronUp, Heart, Camera, Clapperboard, Podcast, Monitor, Globe, Dumbbell, Scissors, ArrowLeftRight, Flame, Video, Wand2, Settings2, Layers, SlidersHorizontal, ArrowRight } from 'lucide-react';
import { useViewStore } from '../../store/viewStore';
import { useGodModeStore } from '../../store/godModeStore';
import { useMediaStore } from '../../store/mediaStore';
import { analyzeAudio, AudioAnalysisResult } from '../../lib/audioAnalysis';
import { TrailerSettings, DEFAULT_TRAILER_SETTINGS, DEFAULT_STYLE_CONFIG, EditingStyleOption } from '../../lib/trailerGenerator';
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
    { id: 'gm-gentle-flow', name: 'Gentle Flow', icon: Camera, desc: 'Soft cinematic drifts', tier: 1 },
    { id: 'gm-wedding', name: 'Wedding Film', icon: Heart, desc: 'Slow ramps + gentle pacing', tier: 1 },
    { id: 'gm-montage-mix', name: 'Montage Mix', icon: Clapperboard, desc: 'Mixed cuts, tasteful', tier: 1 },
    { id: 'gm-travel-diary', name: 'Travel Diary', icon: Globe, desc: 'Dreamy pacing + warm tones', tier: 1 },
    { id: 'gm-golden-hour', name: 'Golden Hour', icon: Sparkles, desc: 'Sunset vibes, slow reveals', tier: 1 },
    { id: 'gm-noir', name: 'Film Noir', icon: Film, desc: 'Dark drama, slow crawl', tier: 1 },
    { id: 'gm-music-video', name: 'Music Video', icon: Music, desc: 'Beat-locked energy', tier: 2 },
    { id: 'gm-action-trailer', name: 'Action Trailer', icon: Flame, desc: 'Hard ramps + triple-shot', tier: 2 },
    { id: 'gm-instagram', name: 'Reels Banger', icon: Video, desc: 'Snappy drops + cuts', tier: 2 },
    { id: 'gm-gym-pump', name: 'Gym Pump', icon: Dumbbell, desc: 'Athletic ramps + punches', tier: 2 },
    { id: 'gm-concert', name: 'Concert Edit', icon: Music, desc: 'Beat-locked + boomerangs', tier: 2 },
    { id: 'gm-beat-bounce', name: 'Beat Bounce', icon: ArrowLeftRight, desc: 'Viral IG bounce — shot swap on beats', tier: 2 },
    { id: 'gm-tiktok', name: 'TikTok Viral', icon: Zap, desc: 'Full chaos, every effect', tier: 3 },
    { id: 'gm-whiplash', name: 'Whiplash', icon: Flame, desc: 'Extreme speed contrast', tier: 3 },
    { id: 'gm-stutter-storm', name: 'Stutter Storm', icon: Sparkles, desc: 'Rapid micro-boomerangs', tier: 3 },
    { id: 'gm-sensory-overload', name: 'Sensory Overload', icon: Zap, desc: 'All effects stacked', tier: 3 },
    { id: 'gm-glitch-out', name: 'Glitch Out', icon: Flame, desc: 'Stutter + whiplash chaos', tier: 3 },
];

const TRANSITION_PRESETS = ['cinematic', 'buttery', 'kinetic', 'whip-pan', 'snap-cut', 'viral', 'dramatic', 'all'];

// ── PACING TEMPLATES (mirror of TrailerWizard's TEMPLATES) ──
const PACING_MAP: Record<string, { shortestClip: number; longestClip: number; allowDuplicates: boolean }> = {
    social: { shortestClip: 0.1, longestClip: 0.5, allowDuplicates: true },
    kinetic: { shortestClip: 0.08, longestClip: 0.25, allowDuplicates: true },
    epic: { shortestClip: 0.5, longestClip: 2.5, allowDuplicates: false },
    gym: { shortestClip: 0.15, longestClip: 0.6, allowDuplicates: true },
    wedding: { shortestClip: 1.0, longestClip: 4.0, allowDuplicates: false },
    hyperlapse: { shortestClip: 0.1, longestClip: 0.35, allowDuplicates: true },
    filmscore: { shortestClip: 2.0, longestClip: 5.0, allowDuplicates: false },
    montage: { shortestClip: 0.3, longestClip: 1.5, allowDuplicates: true },
    vlog: { shortestClip: 0.8, longestClip: 2.5, allowDuplicates: false },
    dynamic: { shortestClip: 0.2, longestClip: 2.0, allowDuplicates: true },
};

// ── STYLE TEMPLATES (mirror of TrailerWizard's STYLE_TEMPLATES) ──
const STYLE_MAP: Record<string, { mix: 'none' | 'light' | 'heavy' | 'every'; styles: EditingStyleOption[]; config: typeof DEFAULT_STYLE_CONFIG }> = {
    'none': { mix: 'none', styles: [], config: DEFAULT_STYLE_CONFIG },
    'music-video': { mix: 'heavy', styles: ['rubber-band-standard', 'multi-boomerang', 'rubber-band-speed'], config: { ...DEFAULT_STYLE_CONFIG, rampSlowSpeed: 0.2, boomerangSlices: 4, reversalChance: 0.95, burstMode: 'short' } },
    'action-reel': { mix: 'heavy', styles: ['rubber-band-standard', 'triple-shot', 'rubber-band-speed'], config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 3.5, rampSlowSpeed: 0.15, fastPortion: 0.1, slowPortion: 0.4, reversalChance: 1.0, burstMode: 'short' } },
    'cinematic': { mix: 'light', styles: ['rubber-band-standard'], config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 1.8, rampSlowSpeed: 0.4, fastPortion: 0.2, slowPortion: 0.5, reversalChance: 0.7, burstMode: 'long' } },
    'instagram': { mix: 'every', styles: ['multi-boomerang', 'rubber-band-standard'], config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 3.0, rampSlowSpeed: 0.3, boomerangSlices: 4, reversalChance: 0.9, burstMode: 'short' } },
    'whiplash': { mix: 'every', styles: ['rubber-band-standard', 'rubber-band-speed', 'triple-shot'], config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 4.0, rampSlowSpeed: 0.1, fastPortion: 0.08, slowPortion: 0.45, reversalChance: 1.0, burstMode: 'short' } },
    'dreamy': { mix: 'heavy', styles: ['rubber-band-standard'], config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 1.5, rampSlowSpeed: 0.15, fastPortion: 0.25, slowPortion: 0.5, reversalChance: 1.0, burstMode: 'long' } },
    'film-noir': { mix: 'light', styles: ['rubber-band-standard'], config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 1.3, rampSlowSpeed: 0.2, fastPortion: 0.3, slowPortion: 0.5, reversalChance: 0.5, burstMode: 'long' } },
    'pulse-drop': { mix: 'heavy', styles: ['rubber-band-speed', 'rubber-band-standard', 'multi-boomerang'], config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 3.0, rampSlowSpeed: 0.1, fastPortion: 0.12, slowPortion: 0.35, reversalChance: 0.85, burstMode: 'short' } },
    'stutter-cut': { mix: 'every', styles: ['multi-boomerang', 'triple-shot'], config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 2.5, rampSlowSpeed: 0.3, boomerangSlices: 4, reversalChance: 1.0, burstMode: 'short' } },
    'tiktok': { mix: 'every', styles: ['multi-boomerang', 'rubber-band-speed', 'triple-shot', 'rubber-band-standard'], config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 3.8, rampSlowSpeed: 0.15, fastPortion: 0.1, slowPortion: 0.3, boomerangSlices: 4, reversalChance: 1.0, burstMode: 'short' } },
    'sports-hype': { mix: 'heavy', styles: ['rubber-band-speed', 'triple-shot'], config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 3.5, rampSlowSpeed: 0.2, fastPortion: 0.15, slowPortion: 0.35, reversalChance: 0.95, burstMode: 'short' } },
    'concert-live': { mix: 'every', styles: ['rubber-band-speed', 'multi-boomerang'], config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 3.2, rampSlowSpeed: 0.25, fastPortion: 0.12, slowPortion: 0.3, boomerangSlices: 4, reversalChance: 0.9, burstMode: 'short' } },
    'beat-bounce': { mix: 'every', styles: ['beat-bounce'], config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 1.0, rampSlowSpeed: 0.4, fastPortion: 0.05, slowPortion: 0.15, boomerangSlices: 4, reversalChance: 1.0, burstMode: 'short' } },
    'horror-tension': { mix: 'heavy', styles: ['rubber-band-standard', 'triple-shot', 'multi-boomerang'], config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 3.0, rampSlowSpeed: 0.12, fastPortion: 0.08, slowPortion: 0.5, boomerangSlices: 3, reversalChance: 1.0, burstMode: 'short' } },
    'viral-hook': { mix: 'every', styles: ['snap-burst', 'pattern-interrupt', 'hyper-cut'], config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 3.5, rampSlowSpeed: 0.15, boomerangSlices: 4, reversalChance: 0.9, burstMode: 'short' } },
    'retention-max': { mix: 'every', styles: ['pattern-interrupt', 'snap-burst', 'multi-boomerang', 'hyper-cut'], config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 3.8, rampSlowSpeed: 0.1, boomerangSlices: 4, reversalChance: 1.0, burstMode: 'short' } },
};

// ── VIBE → SETTINGS MAP (mirrors TrailerWizard's VIBE_MAP) ──
const VIBE_MAP: Record<string, { pacing: string; style: string; hook: 'none' | 'snap-speed' | 'pattern-interrupt' | 'speed-freeze' | 'auto'; retention: boolean; loop: boolean; texture: 'none' | 'grain' | 'vintage' | 'chromatic' | 'motion-blur'; transitionsEnabled: boolean; transitionPreset: string; rhythmPattern: string }> = {
    'clean': { pacing: 'montage', style: 'none', hook: 'none', retention: false, loop: false, texture: 'none', transitionsEnabled: false, transitionPreset: 'hard-cuts', rhythmPattern: 'wave' },
    'cinematic': { pacing: 'filmscore', style: 'cinematic', hook: 'speed-freeze', retention: false, loop: false, texture: 'grain', transitionsEnabled: true, transitionPreset: 'cinematic', rhythmPattern: 'fibonacci' },
    'high-energy': { pacing: 'social', style: 'music-video', hook: 'speed-freeze', retention: false, loop: false, texture: 'none', transitionsEnabled: true, transitionPreset: 'whip-pan', rhythmPattern: 'breathing' },
    'chaos': { pacing: 'kinetic', style: 'retention-max', hook: 'pattern-interrupt', retention: true, loop: true, texture: 'chromatic', transitionsEnabled: true, transitionPreset: 'viral', rhythmPattern: 'staccato-legato' },
    'viral': { pacing: 'social', style: 'viral-hook', hook: 'auto', retention: true, loop: true, texture: 'none', transitionsEnabled: true, transitionPreset: 'snap-cut', rhythmPattern: 'heartbeat' },
};

// Preset IDs → pacing/style mapping (mirrors TrailerWizard's GODMODE_PRESETS)
const PRESET_PACING_STYLE: Record<string, { pacing: string; style: string; duration: number }> = {
    'gm-clean-cut': { pacing: 'montage', style: 'none', duration: 30 },
    'gm-slideshow': { pacing: 'filmscore', style: 'none', duration: 60 },
    'gm-soft-story': { pacing: 'vlog', style: 'none', duration: 45 },
    'gm-quick-recap': { pacing: 'social', style: 'none', duration: 15 },
    'gm-dynamic-intro': { pacing: 'dynamic', style: 'none', duration: 20 },
    'gm-gentle-flow': { pacing: 'filmscore', style: 'cinematic', duration: 60 },
    'gm-wedding': { pacing: 'wedding', style: 'cinematic', duration: 45 },
    'gm-montage-mix': { pacing: 'montage', style: 'cinematic', duration: 30 },
    'gm-travel-diary': { pacing: 'vlog', style: 'dreamy', duration: 30 },
    'gm-golden-hour': { pacing: 'filmscore', style: 'dreamy', duration: 45 },
    'gm-noir': { pacing: 'filmscore', style: 'film-noir', duration: 90 },
    'gm-music-video': { pacing: 'social', style: 'music-video', duration: 30 },
    'gm-action-trailer': { pacing: 'epic', style: 'action-reel', duration: 60 },
    'gm-instagram': { pacing: 'social', style: 'instagram', duration: 15 },
    'gm-hyperlapse': { pacing: 'hyperlapse', style: 'pulse-drop', duration: 20 },
    'gm-gym-pump': { pacing: 'gym', style: 'sports-hype', duration: 20 },
    'gm-concert': { pacing: 'kinetic', style: 'concert-live', duration: 30 },
    'gm-beat-bounce': { pacing: 'social', style: 'beat-bounce', duration: 15 },
    'gm-sports': { pacing: 'social', style: 'sports-hype', duration: 15 },
    'gm-tiktok': { pacing: 'kinetic', style: 'tiktok', duration: 10 },
    'gm-whiplash': { pacing: 'kinetic', style: 'whiplash', duration: 15 },
    'gm-stutter-storm': { pacing: 'kinetic', style: 'stutter-cut', duration: 10 },
    'gm-sensory-overload': { pacing: 'hyperlapse', style: 'tiktok', duration: 15 },
    'gm-glitch-out': { pacing: 'kinetic', style: 'horror-tension', duration: 12 },
};

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
    };

    const toggleAudio = () => {
        if (!audioRef.current) return;
        if (audioPlaying) { audioRef.current.pause(); setAudioPlaying(false); }
        else { audioRef.current.currentTime = gm.audioTrimStart; audioRef.current.play().catch(() => {}); setAudioPlaying(true); }
    };

    // ── Helper: resolve full TrailerSettings from pacing/style keys ──
    const resolveSettings = (pacingKey: string, styleKey: string, duration: number, overrides?: Partial<TrailerSettings>): TrailerSettings => {
        const pacing = PACING_MAP[pacingKey] || PACING_MAP['montage'];
        const style = STYLE_MAP[styleKey] || STYLE_MAP['none'];
        return {
            ...DEFAULT_TRAILER_SETTINGS,
            ...pacing,
            targetDuration: duration,
            editingStyleMix: style.mix,
            editingStyles: style.styles,
            styleConfig: style.config,
            transitionsEnabled: gm.transitionsEnabled,
            transitionPreset: gm.transitionPreset,
            allowDuplicates: true,
            useAllClips: true,
            ...(gm.useAudioGuide && gm.audioUrl ? {
                useAudioGuide: true,
                audioFile: gm.audioFile,
                audioUrl: gm.audioUrl,
                audioFilePath: gm.audioFilePath || undefined,
                audioAnalysis: gm.audioAnalysis,
                audioTrimStart: gm.audioTrimStart,
                audioTrimEnd: gm.audioTrimEnd,
            } : {}),
            ...overrides,
        };
    };

    const handleGoToTrailer = () => {
        if (!gm.vibe) return;
        const vibe = VIBE_MAP[gm.vibe];
        if (!vibe) return;
        const effectiveDuration = gm.useAudioGuide
            ? Math.round(gm.audioTrimEnd - gm.audioTrimStart)
            : gm.duration;
        const settings = resolveSettings(vibe.pacing, vibe.style, effectiveDuration, {
            hookStyle: vibe.hook,
            retentionInterrupts: vibe.retention,
            loopMode: vibe.loop,
            visualTexture: vibe.texture,
            transitionsEnabled: gm.transitionsEnabled ?? vibe.transitionsEnabled,
            transitionPreset: gm.transitionPreset || vibe.transitionPreset,
            rhythmPattern: vibe.rhythmPattern as any,
        });
        gm.setAutoGenerate(settings);
        setActiveTab('trailer');
    };

    const handlePresetGenerate = (presetId: string) => {
        const ref = PRESET_PACING_STYLE[presetId];
        if (!ref) return;
        const effectiveDuration = gm.useAudioGuide
            ? Math.round(gm.audioTrimEnd - gm.audioTrimStart)
            : ref.duration;
        const settings = resolveSettings(ref.pacing, ref.style, effectiveDuration);
        gm.setPresetRef({ presetId });
        gm.setAutoGenerate(settings);
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
