import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useMediaStore } from '../../store/mediaStore';
import { usePresetUsageStore } from '../../store/presetUsageStore';
import { TrailerSettings, DEFAULT_TRAILER_SETTINGS, EditingStyleOption, DEFAULT_STYLE_CONFIG } from '../../lib/trailerGenerator';
import { Wand2, Clock, Zap, Settings2, Video, Flame, Scissors, Check, PlayCircle, Music, Upload, Play, Pause, Trash2, Loader2, Sparkles, Film, SlidersHorizontal, ChevronDown, ChevronUp, Crown, Heart, Camera, Clapperboard, Podcast, Smartphone, Monitor, Square, Globe, Dumbbell, Shuffle, ArrowLeftRight, Layers, Pin } from 'lucide-react';
import { TRANSITION_CATALOG, TransitionType, ALL_TRANSITION_TYPES } from '../../lib/transitions';
import { analyzeAudio, AudioAnalysisResult, SegmentType } from '../../lib/audioAnalysis';
import clsx from 'clsx';

const TEMPLATES = [
    { id: 'social', name: 'Social Snap', desc: 'Rapid 0.1s-0.5s — IG/TikTok energy', icon: Zap, settings: { shortestClip: 0.1, longestClip: 0.5, allowDuplicates: true } },
    { id: 'kinetic', name: 'Kinetic Blitz', desc: 'Machine-gun 0.08s-0.25s cuts', icon: Flame, settings: { shortestClip: 0.08, longestClip: 0.25, allowDuplicates: true } },
    { id: 'epic', name: 'Cinematic Trailer', desc: 'Dramatic 0.5s-2.5s with breathing room', icon: Wand2, settings: { shortestClip: 0.5, longestClip: 2.5, allowDuplicates: false } },
    { id: 'gym', name: 'Pump Edit', desc: 'Athletic 0.15s-0.6s rhythm', icon: Video, settings: { shortestClip: 0.15, longestClip: 0.6, allowDuplicates: true } },
    { id: 'wedding', name: 'Wedding Film', desc: 'Elegant 1.0s-4.0s holds', icon: Heart, settings: { shortestClip: 1.0, longestClip: 4.0, allowDuplicates: false } },
    { id: 'hyperlapse', name: 'Hyperlapse Rush', desc: 'Relentless 0.1s-0.35s flow', icon: Camera, settings: { shortestClip: 0.1, longestClip: 0.35, allowDuplicates: true } },
    { id: 'filmscore', name: 'Slow Burn', desc: 'Contemplative 2.0s-5.0s', icon: Film, settings: { shortestClip: 2.0, longestClip: 5.0, allowDuplicates: false } },
    { id: 'montage', name: 'Montage', desc: 'Dynamic 0.3s-1.5s mix', icon: Clapperboard, settings: { shortestClip: 0.3, longestClip: 1.5, allowDuplicates: true } },
    { id: 'vlog', name: 'Story Recap', desc: 'Narrative 0.8s-2.5s pace', icon: Podcast, settings: { shortestClip: 0.8, longestClip: 2.5, allowDuplicates: false } },
    { id: 'dynamic', name: 'Dynamic Flow', desc: 'Builds from slow to fast', icon: ArrowLeftRight, settings: { shortestClip: 0.2, longestClip: 2.0, allowDuplicates: true } },
    { id: 'custom', name: 'Custom', desc: 'Manual boundaries', icon: Settings2, settings: null }
];

const STYLE_TEMPLATES = [
    { id: 'music-video', name: 'Music Video', desc: 'Boomerangs, zoom punches, speed drops', icon: Music,
      mix: 'heavy' as const, styles: ['rubber-band-zoom', 'multi-boomerang', 'rubber-band-zoom-speed'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampSlowSpeed: 0.2, zoomRange: 160, boomerangSlices: 4, reversalChance: 0.95, burstMode: 'short' as const } },
    { id: 'action-reel', name: 'Action Reel', desc: 'Hard ramps + triple-shot intercuts', icon: Flame,
      mix: 'heavy' as const, styles: ['rubber-band-standard', 'triple-shot', 'rubber-band-zoom-speed'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 3.5, rampSlowSpeed: 0.15, fastPortion: 0.1, slowPortion: 0.4, reversalChance: 1.0, burstMode: 'short' as const } },
    { id: 'cinematic', name: 'Cinematic', desc: 'Elegant slow ramps + gentle zoom', icon: Film,
      mix: 'light' as const, styles: ['rubber-band-standard', 'rubber-band-zoom'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 1.8, rampSlowSpeed: 0.4, fastPortion: 0.2, slowPortion: 0.5, zoomRange: 125, reversalChance: 0.7, burstMode: 'long' as const } },
    { id: 'instagram', name: 'IG Reels', desc: 'Snappy boomerangs + zoom drops', icon: Video,
      mix: 'every' as const, styles: ['multi-boomerang', 'rubber-band-zoom'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 3.0, rampSlowSpeed: 0.3, zoomRange: 170, boomerangSlices: 4, reversalChance: 0.9, burstMode: 'short' as const } },
    { id: 'whiplash', name: 'Whiplash', desc: 'Extreme speed contrast on every clip', icon: Zap,
      mix: 'every' as const, styles: ['rubber-band-standard', 'rubber-band-zoom-speed', 'triple-shot'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 4.0, rampSlowSpeed: 0.1, fastPortion: 0.08, slowPortion: 0.45, zoomRange: 180, reversalChance: 1.0, burstMode: 'short' as const } },
    { id: 'dreamy', name: 'Dreamy', desc: 'Slow zooms with reversed flows', icon: Sparkles,
      mix: 'heavy' as const, styles: ['rubber-band-zoom', 'rubber-band-standard'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 1.5, rampSlowSpeed: 0.15, fastPortion: 0.25, slowPortion: 0.5, zoomRange: 130, reversalChance: 1.0, burstMode: 'long' as const } },
    { id: 'film-noir', name: 'Film Noir', desc: 'Slow reveals, dramatic zoom crawls', icon: Camera,
      mix: 'light' as const, styles: ['rubber-band-zoom', 'rubber-band-standard'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 1.3, rampSlowSpeed: 0.2, fastPortion: 0.3, slowPortion: 0.5, zoomRange: 115, reversalChance: 0.5, burstMode: 'long' as const } },
    { id: 'pulse-drop', name: 'Pulse Drop', desc: 'Beat-sync speed drops + zoom punches', icon: Heart,
      mix: 'heavy' as const, styles: ['rubber-band-zoom-speed', 'rubber-band-standard', 'multi-boomerang'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 3.0, rampSlowSpeed: 0.1, fastPortion: 0.12, slowPortion: 0.35, zoomRange: 155, reversalChance: 0.85, burstMode: 'short' as const } },
    { id: 'stutter-cut', name: 'Stutter Cut', desc: 'Rapid micro-boomerangs + hard cuts', icon: Scissors,
      mix: 'every' as const, styles: ['multi-boomerang', 'triple-shot'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 2.5, rampSlowSpeed: 0.3, boomerangSlices: 4, reversalChance: 1.0, burstMode: 'short' as const } },
    { id: 'tiktok', name: 'TikTok Chaos', desc: 'Everything at once, maximum energy', icon: Zap,
      mix: 'every' as const, styles: ['multi-boomerang', 'rubber-band-zoom-speed', 'triple-shot', 'rubber-band-zoom'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 3.8, rampSlowSpeed: 0.15, fastPortion: 0.1, slowPortion: 0.3, zoomRange: 175, boomerangSlices: 4, reversalChance: 1.0, burstMode: 'short' as const } },
    { id: 'sports-hype', name: 'Sports Hype', desc: 'Speed ramps + triple-shot energy', icon: Dumbbell,
      mix: 'heavy' as const, styles: ['rubber-band-zoom-speed', 'triple-shot'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 3.5, rampSlowSpeed: 0.2, fastPortion: 0.15, slowPortion: 0.35, zoomRange: 165, reversalChance: 0.95, burstMode: 'short' as const } },
    { id: 'retro-vhs', name: 'Retro VHS', desc: 'Loose boomerangs + slow zooms', icon: Film,
      mix: 'light' as const, styles: ['multi-boomerang', 'rubber-band-zoom'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 1.6, rampSlowSpeed: 0.4, fastPortion: 0.2, slowPortion: 0.4, zoomRange: 120, boomerangSlices: 3, reversalChance: 0.6, burstMode: 'long' as const } },
    { id: 'asmr-flow', name: 'ASMR Flow', desc: 'Ultra-slow zooms, minimal cuts', icon: Sparkles,
      mix: 'light' as const, styles: ['rubber-band-zoom'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 1.3, rampSlowSpeed: 0.15, fastPortion: 0.05, slowPortion: 0.6, zoomRange: 115, reversalChance: 0.3, burstMode: 'long' as const } },
    { id: 'concert-live', name: 'Concert Live', desc: 'Beat-locked zoom punches + boomerangs', icon: Music,
      mix: 'every' as const, styles: ['rubber-band-zoom-speed', 'multi-boomerang'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 3.2, rampSlowSpeed: 0.25, fastPortion: 0.12, slowPortion: 0.3, zoomRange: 170, boomerangSlices: 4, reversalChance: 0.9, burstMode: 'short' as const } },
    { id: 'travel-montage', name: 'Travel Montage', desc: 'Gentle ramps + dreamy zoom drifts', icon: Globe,
      mix: 'heavy' as const, styles: ['rubber-band-standard', 'rubber-band-zoom'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 1.6, rampSlowSpeed: 0.3, fastPortion: 0.1, slowPortion: 0.45, zoomRange: 125, reversalChance: 0.65, burstMode: 'long' as const } },
    { id: 'horror-tension', name: 'Horror Tension', desc: 'Hard reversals + glitch-like stutter', icon: Zap,
      mix: 'heavy' as const, styles: ['rubber-band-standard', 'triple-shot', 'multi-boomerang'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 3.0, rampSlowSpeed: 0.12, fastPortion: 0.08, slowPortion: 0.5, zoomRange: 140, boomerangSlices: 3, reversalChance: 1.0, burstMode: 'short' as const } },
    // ── 2026 VIRAL STYLES ──
    { id: 'viral-hook', name: 'Viral Hook', desc: 'Snap-zooms + pattern interrupts + hyper-cuts', icon: Zap,
      mix: 'every' as const, styles: ['snap-zoom-burst', 'pattern-interrupt', 'hyper-cut'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 3.5, rampSlowSpeed: 0.15, zoomRange: 280, boomerangSlices: 4, reversalChance: 0.9, burstMode: 'short' as const } },
    { id: 'bear-style', name: 'The Bear', desc: 'Immersive chaos — tight crops + speed variation', icon: Flame,
      mix: 'heavy' as const, styles: ['bear-chaos', 'hyper-cut', 'triple-shot'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 3.0, rampSlowSpeed: 0.2, zoomRange: 165, reversalChance: 0.8, burstMode: 'short' as const } },
    { id: 'pendulum-flow', name: 'Pendulum Flow', desc: 'Floating hover + gentle zoom sway', icon: Sparkles,
      mix: 'heavy' as const, styles: ['pendulum-sway', 'rubber-band-zoom'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 1.5, rampSlowSpeed: 0.3, zoomRange: 125, reversalChance: 0.6, burstMode: 'long' as const } },
    { id: 'retention-max', name: 'Max Retention', desc: 'Pattern interrupts + snap zooms + boomerangs', icon: Zap,
      mix: 'every' as const, styles: ['pattern-interrupt', 'snap-zoom-burst', 'multi-boomerang', 'hyper-cut'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 3.8, rampSlowSpeed: 0.1, zoomRange: 250, boomerangSlices: 4, reversalChance: 1.0, burstMode: 'short' as const } },
    { id: 'clean-viral', name: 'Clean Viral', desc: 'Minimal chaos — pendulum + light snap zooms', icon: Camera,
      mix: 'light' as const, styles: ['pendulum-sway', 'snap-zoom-burst'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 2.0, rampSlowSpeed: 0.3, zoomRange: 150, reversalChance: 0.4, burstMode: 'long' as const } },
    { id: 'none', name: 'None', desc: 'No style injection', icon: Settings2, mix: 'none' as const, styles: [] as EditingStyleOption[], config: DEFAULT_STYLE_CONFIG },
    { id: 'custom-style', name: 'Custom', desc: 'Manual config', icon: SlidersHorizontal, mix: null, styles: null, config: null },
];

const GODMODE_TIERS = [
    { label: 'Simple', color: 'text-emerald-400' },
    { label: 'Moderate', color: 'text-sky-400' },
    { label: 'High Energy', color: 'text-amber-400' },
    { label: 'Maximum Chaos', color: 'text-red-400' },
] as const;

const GODMODE_PRESETS = [
    // ── Simple / Minimal ──
    { id: 'gm-clean-cut', name: 'Clean Cut', icon: Scissors, desc: 'Precise hard cuts, no effects',
      pacing: 'montage', style: 'none', duration: 30, tier: 0 },
    { id: 'gm-slideshow', name: 'Elegant Hold', icon: Monitor, desc: 'Long cinematic holds, zero noise',
      pacing: 'filmscore', style: 'none', duration: 60, tier: 0 },
    { id: 'gm-soft-story', name: 'Story Mode', icon: Podcast, desc: 'Vlog-paced narrative, clean',
      pacing: 'vlog', style: 'none', duration: 45, tier: 0 },
    { id: 'gm-quick-recap', name: 'Quick Recap', icon: Zap, desc: 'Snappy 15s summary, no FX',
      pacing: 'social', style: 'none', duration: 15, tier: 0 },
    { id: 'gm-dynamic-intro', name: 'Dynamic Intro', icon: ArrowLeftRight, desc: 'Builds momentum, no effects',
      pacing: 'dynamic', style: 'none', duration: 20, tier: 0 },
    // ── Moderate ──
    { id: 'gm-gentle-zoom', name: 'Gentle Zoom', icon: Camera, desc: 'Soft Ken Burns zooms, slow pace',
      pacing: 'filmscore', style: 'cinematic', duration: 60, tier: 1 },
    { id: 'gm-wedding', name: 'Wedding Film', icon: Heart, desc: 'Slow zooms + gentle speed ramps',
      pacing: 'wedding', style: 'cinematic', duration: 45, tier: 1 },
    { id: 'gm-montage-mix', name: 'Montage Mix', icon: Clapperboard, desc: 'Mixed cuts, tasteful rubber-band',
      pacing: 'montage', style: 'cinematic', duration: 30, tier: 1 },
    { id: 'gm-travel-diary', name: 'Travel Diary', icon: Globe, desc: 'Dreamy zooms + warm pacing',
      pacing: 'vlog', style: 'dreamy', duration: 30, tier: 1 },
    { id: 'gm-golden-hour', name: 'Golden Hour', icon: Sparkles, desc: 'Sunset vibes, slow reveals',
      pacing: 'filmscore', style: 'dreamy', duration: 45, tier: 1 },
    { id: 'gm-noir', name: 'Film Noir', icon: Film, desc: 'Dark drama, slow crawl zooms',
      pacing: 'filmscore', style: 'film-noir', duration: 90, tier: 1 },
    // ── High Energy ──
    { id: 'gm-music-video', name: 'Music Video', icon: Music, desc: 'Beat-locked zooms + boomerangs',
      pacing: 'social', style: 'music-video', duration: 30, tier: 2 },
    { id: 'gm-action-trailer', name: 'Action Trailer', icon: Flame, desc: 'Hard ramps + triple-shot energy',
      pacing: 'epic', style: 'action-reel', duration: 60, tier: 2 },
    { id: 'gm-instagram', name: 'Reels Banger', icon: Video, desc: 'Snappy zoom drops + boomerangs',
      pacing: 'social', style: 'instagram', duration: 15, tier: 2 },
    { id: 'gm-hyperlapse', name: 'Hyperlapse Rush', icon: Camera, desc: 'Relentless flow + pulse drops',
      pacing: 'hyperlapse', style: 'pulse-drop', duration: 20, tier: 2 },
    { id: 'gm-gym-pump', name: 'Gym Pump', icon: Dumbbell, desc: 'Athletic ramps + beat punches',
      pacing: 'gym', style: 'sports-hype', duration: 20, tier: 2 },
    { id: 'gm-concert', name: 'Concert Edit', icon: Music, desc: 'Beat-locked zoom + boomerangs',
      pacing: 'kinetic', style: 'concert-live', duration: 30, tier: 2 },
    { id: 'gm-sports', name: 'Sports Hype', icon: Dumbbell, desc: 'Speed ramps + triple-shot intercuts',
      pacing: 'social', style: 'sports-hype', duration: 15, tier: 2 },
    // ── Maximum Chaos ──
    { id: 'gm-tiktok', name: 'TikTok Viral', icon: Zap, desc: 'Full chaos, every effect stacked',
      pacing: 'kinetic', style: 'tiktok', duration: 10, tier: 3 },
    { id: 'gm-whiplash', name: 'Whiplash', icon: Flame, desc: 'Extreme speed contrast, zero mercy',
      pacing: 'kinetic', style: 'whiplash', duration: 15, tier: 3 },
    { id: 'gm-stutter-storm', name: 'Stutter Storm', icon: Sparkles, desc: 'Rapid micro-boomerangs everywhere',
      pacing: 'kinetic', style: 'stutter-cut', duration: 10, tier: 3 },
    { id: 'gm-sensory-overload', name: 'Sensory Overload', icon: Zap, desc: 'All effects + hyperlapse pacing',
      pacing: 'hyperlapse', style: 'tiktok', duration: 15, tier: 3 },
    { id: 'gm-glitch-out', name: 'Glitch Out', icon: Flame, desc: 'Stutter + whiplash + reverse chaos',
      pacing: 'kinetic', style: 'horror-tension', duration: 12, tier: 3 },
];

interface SliderProps {
    label: string; icon: React.ElementType; value: number;
    min: number; max: number; step: number;
    onChange: (v: number) => void; unit?: string; disabled?: boolean;
}

const SliderControl: React.FC<SliderProps> = ({ label, icon: Icon, value, min, max, step, onChange, unit = 's', disabled }) => (
    <div className={clsx("flex flex-col gap-2", disabled && "opacity-50 pointer-events-none")}>
        <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-white/70">
            <span className="flex items-center gap-1.5"><Icon size={12} /> {label}</span>
            <span className="text-primary font-mono">{parseFloat(String(value)).toFixed(1)}{unit}</span>
        </div>
        <input type="range" min={min} max={max} step={step} value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full accent-primary h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer" />
        <div className="flex justify-between text-[10px] text-white/30 font-mono">
            <span>{min}{unit}</span><span>{max}{unit}</span>
        </div>
    </div>
);

interface WizardProps {
    onGenerate: (settings: TrailerSettings) => void;
}

export const TrailerWizard: React.FC<WizardProps> = ({ onGenerate }) => {
    const { files, orientationFilter, setOrientationFilter, selectedFileIds } = useMediaStore();
    const { incrementTemplate, incrementStyle, incrementGodMode, togglePinTemplate, togglePinStyle, togglePinGodMode, pinnedTemplates, pinnedStyles, pinnedGodModes, getTopTemplates, getTopStyles, getTopGodModes, templateUsage, styleUsage, godModeUsage } = usePresetUsageStore();

    // Smart-Preset: compute top-5 visible presets (pinned first, then by usage)
    const topTemplateIds = useMemo(() => getTopTemplates(5), [templateUsage, pinnedTemplates]);
    const topStyleIds = useMemo(() => getTopStyles(5), [styleUsage, pinnedStyles]);
    const topGodModeIds = useMemo(() => getTopGodModes(5), [godModeUsage, pinnedGodModes]);

    // Restore persisted settings from localStorage on mount
    // NOTE: Audio/music keys are excluded from persistence — they are session-only.
    const [settings, setSettings] = useState<TrailerSettings>(() => {
        try {
            const saved = localStorage.getItem('mmm_trailer_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                // Strip transient audio keys so they don't leak from a previous session
                delete parsed.audioFile;
                delete parsed.audioUrl;
                delete parsed.audioFilePath;
                delete parsed.useAudioGuide;
                delete parsed.audioTrimStart;
                delete parsed.audioTrimEnd;
                delete parsed.audioAnalysis;
                return { ...DEFAULT_TRAILER_SETTINGS, ...parsed };
            }
        } catch {}
        return { ...DEFAULT_TRAILER_SETTINGS };
    });

    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [audioPlaying, setAudioPlaying] = useState(false);
    const [audioTrimStart, setAudioTrimStart] = useState(0);
    const [audioTrimEnd, setAudioTrimEnd] = useState(30);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    // GodMode state is SESSION-ONLY — resets to defaults on every reload
    const [godMode, setGodMode] = useState(false);
    const [godModeDuration, setGodModeDuration] = useState(30);
    const [godModeVibe, setGodModeVibe] = useState<string | null>(null);
    const [godModeAdvanced, setGodModeAdvanced] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);
    const audioInputRef = useRef<HTMLInputElement>(null);
    const waveformRef = useRef<HTMLCanvasElement>(null);
    const [audioAnalysis, setAudioAnalysis] = useState<AudioAnalysisResult | null>(null);
    const bestSegmentCycleRef = useRef<Record<number, number>>({});  // tracks cycle index per targetDur

    // Audio interaction state
    const [isDragging, setIsDragging] = useState<'start' | 'end' | 'move' | null>(null);
    const [dragStartPos, setDragStartPos] = useState<number>(0);
    const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0);
    const [analysisToast, setAnalysisToast] = useState<boolean>(false);
    const waveformWrapperRef = useRef<HTMLDivElement>(null);

    // Audio state is SESSION-ONLY — no restoration from previous sessions.
    // Users must re-select audio each session for a clean workflow.

    // Persist settings to localStorage (excluding transient audio keys)
    const TRANSIENT_KEYS = new Set(['audioFile', 'audioUrl', 'audioFilePath', 'useAudioGuide', 'audioTrimStart', 'audioTrimEnd', 'audioAnalysis']);
    const update = (patch: Partial<TrailerSettings>) => setSettings(s => {
        const next = { ...s, ...patch };
        try {
            // Strip audio/music keys before persisting — they are session-only
            const persistable = { ...next };
            for (const key of TRANSIENT_KEYS) delete (persistable as any)[key];
            localStorage.setItem('mmm_trailer_settings', JSON.stringify(persistable));
        } catch {}
        return next;
    });

    // Media selection: if files are selected in the library, only count those
    const activePool = selectedFileIds.length > 0
        ? files.filter(f => selectedFileIds.includes(f.id))
        : files;
    const videoCount = activePool.filter(f => f.type === 'video').length;
    const audioCount = activePool.filter(f => f.type === 'audio').length;
    const hCount = activePool.filter(f => f.orientation === 'horizontal').length;
    const vCount = activePool.filter(f => f.orientation === 'vertical').length;
    const sqCount = activePool.filter(f => f.orientation === 'square').length;
    const hasMediaSelection = selectedFileIds.length > 0;

    // Filtered pool count (respects orientation filter)
    const filteredVideoCount = orientationFilter === 'all'
        ? videoCount
        : activePool.filter(f => f.type === 'video' && f.orientation === orientationFilter).length;

    const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (audioUrl && audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
        // In Electron, File objects have a .path property with the real filesystem path
        const filePath = (file as any).path || '';
        const url = filePath ? `file://${filePath}` : URL.createObjectURL(file);
        setAudioFile(file);
        setAudioUrl(url);
        update({ audioFile: file.name, audioUrl: url, audioFilePath: filePath || url, useAudioGuide: true });
    };

    const handleAudioLoaded = () => {
        const dur = audioRef.current?.duration || 0;
        setAudioTrimEnd(dur); // Default to full audio on load
        update({ audioTrimStart: 0, audioTrimEnd: dur });
    };

    const handleRemoveAudio = () => {
        if (audioUrl && audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
        setAudioFile(null); setAudioUrl(null); setAudioAnalysis(null);
        setAudioTrimStart(0); setAudioTrimEnd(30);
        update({ audioUrl: null, audioFile: null, audioFilePath: undefined, useAudioGuide: false, audioAnalysis: null, audioTrimStart: undefined, audioTrimEnd: undefined });
    };

    const handleRandomizeBeat = async () => {
        if (!audioFile) return;
        setIsAnalyzing(true);
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const buf = await audioFile.arrayBuffer();
            const decoded = await ctx.decodeAudioData(buf);
            const result = await analyzeAudio(decoded);
            setAudioAnalysis(result);
            update({ audioAnalysis: result });
            
            // Slightly random start to simulate re-analysis variations
            const dropSeg = result.segments.find(s => s.type === 'drop');
            if (dropSeg) {
                const start = Math.max(0, dropSeg.start - (Math.random() * 2));
                setAudioTrimStart(start);
                setAudioTrimEnd(Math.min(start + settings.targetDuration, result.duration));
            }
            
            setAnalysisToast(true);
            setTimeout(() => setAnalysisToast(false), 2000);
            await ctx.close();
        } catch (e) { console.warn(e); }
        finally { setIsAnalyzing(false); }
    };

    const toggleAudio = () => {
        if (!audioRef.current) return;
        if (audioPlaying) { audioRef.current.pause(); setAudioPlaying(false); }
        else {
            if (audioRef.current.currentTime < audioTrimStart || audioRef.current.currentTime >= audioTrimEnd) {
                audioRef.current.currentTime = audioTrimStart;
            }
            audioRef.current.play().catch(() => {});
            setAudioPlaying(true);
        }
    };

    const stopAudio = () => {
        if (!audioRef.current) return;
        audioRef.current.pause();
        audioRef.current.currentTime = audioTrimStart;
        setAudioCurrentTime(audioTrimStart);
        setAudioPlaying(false);
    };

    // Track audio time
    useEffect(() => {
        if (!audioRef.current || !audioPlaying) return;
        let raf: number;
        const loop = () => {
            if (audioRef.current) {
                const ct = audioRef.current.currentTime;
                setAudioCurrentTime(ct);
                if (ct >= audioTrimEnd) {
                    audioRef.current.pause();
                    audioRef.current.currentTime = audioTrimStart;
                    setAudioCurrentTime(audioTrimStart);
                    setAudioPlaying(false);
                } else {
                    raf = requestAnimationFrame(loop);
                }
            }
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [audioPlaying, audioTrimEnd, audioTrimStart]);

    // Global Mouse Handlers for Dragging
    useEffect(() => {
        if (!isDragging || !audioAnalysis || !waveformWrapperRef.current) return;
        
        const handleMouseMove = (e: MouseEvent) => {
            const rect = waveformWrapperRef.current!.getBoundingClientRect();
            let x = e.clientX - rect.left;
            x = Math.max(0, Math.min(x, rect.width));
            const time = (x / rect.width) * audioAnalysis.duration;
            
            if (isDragging === 'start') {
                if (time < audioTrimEnd) { setAudioTrimStart(time); update({ audioTrimStart: time }); }
            } else if (isDragging === 'end') {
                if (time > audioTrimStart) { setAudioTrimEnd(time); update({ audioTrimEnd: time }); }
            } else if (isDragging === 'move') {
                const dur = audioTrimEnd - audioTrimStart;
                let newStart = time - dragStartPos;
                if (newStart < 0) newStart = 0;
                if (newStart + dur > audioAnalysis.duration) newStart = audioAnalysis.duration - dur;
                setAudioTrimStart(newStart);
                setAudioTrimEnd(newStart + dur);
                update({ audioTrimStart: newStart, audioTrimEnd: newStart + dur });
            }
        };
        
        const handleMouseUp = () => setIsDragging(null);
        
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, audioAnalysis, audioTrimStart, audioTrimEnd, dragStartPos]);

    // Intelligent Segment Selection: auto-pick best segment matching target duration
    const autoSelectBestSegment = (targetDur: number) => {
        if (!audioAnalysis || audioAnalysis.segments.length === 0) return;
        const segs = audioAnalysis.segments;
        // Priority: drop > chorus > buildup > verse > bridge > intro > breakdown > outro
        const priority: Record<string, number> = { drop: 8, chorus: 7, buildup: 6, verse: 5, bridge: 4, intro: 3, breakdown: 2, outro: 1 };
        // Score each segment by energy * priority
        const scored = segs.map(s => ({
            ...s,
            score: (priority[s.type] || 1) * s.avgEnergy,
            dur: s.end - s.start,
        })).sort((a, b) => b.score - a.score);

        // Cycle through candidates on repeated clicks
        const cycleKey = targetDur;
        const prevIdx = bestSegmentCycleRef.current[cycleKey] ?? -1;
        const nextIdx = (prevIdx + 1) % scored.length;
        bestSegmentCycleRef.current[cycleKey] = nextIdx;

        const best = scored[nextIdx];
        if (best) {
            // Center the target duration around this segment
            const segMid = (best.start + best.end) / 2;
            const halfDur = targetDur / 2;
            const start = Math.max(0, Math.min(segMid - halfDur, audioAnalysis.duration - targetDur));
            const end = Math.min(start + targetDur, audioAnalysis.duration);
            setAudioTrimStart(start);
            setAudioTrimEnd(end);
            update({ audioTrimStart: start, audioTrimEnd: end });
        }
    };

    // Click a specific segment — additive: expand trim range to include it, or remove it
    // ── BEAT↔DURATION SYNC: segment clicks also update Target Duration ──
    const handleSegmentClick = (seg: { start: number; end: number }) => {
        // Check if segment is already within current trim range
        const isIncluded = audioTrimStart <= seg.start && audioTrimEnd >= seg.end;
        if (isIncluded) {
            // Deselect: contract range to exclude this segment (find next best bounds)
            if (!audioAnalysis) return;
            // Find all segments still selected (excluding this one)
            const remaining = audioAnalysis.segments.filter(s => {
                if (s.start === seg.start && s.end === seg.end) return false;
                return audioTrimStart <= s.start && audioTrimEnd >= s.end;
            });
            if (remaining.length === 0) {
                // Nothing left, reset
                setAudioTrimStart(0); setAudioTrimEnd(30);
                update({ audioTrimStart: 0, audioTrimEnd: 30, targetDuration: 30 });
            } else {
                const newStart = Math.min(...remaining.map(r => r.start));
                const newEnd = Math.max(...remaining.map(r => r.end));
                setAudioTrimStart(newStart); setAudioTrimEnd(newEnd);
                // Sync target duration to new selection range
                update({ audioTrimStart: newStart, audioTrimEnd: newEnd, targetDuration: Math.round(newEnd - newStart) });
            }
        } else {
            // Add: expand range to include this segment
            const newStart = Math.min(audioTrimStart, seg.start);
            const newEnd = Math.max(audioTrimEnd, seg.end);
            setAudioTrimStart(newStart); setAudioTrimEnd(newEnd);
            // Sync target duration to expanded range
            update({ audioTrimStart: newStart, audioTrimEnd: newEnd, targetDuration: Math.round(newEnd - newStart) });
        }
    };

    const handleGenerate = () => {
        const finalSettings: TrailerSettings = {
            ...settings,
            audioTrimStart, audioTrimEnd
        };

        // Smart-Preset: track which presets were used
        if (settings.templates?.length > 0) {
            settings.templates.forEach(t => incrementTemplate(t));
        }
        if (settings.editingStyleMix !== 'none') {
            const activeStyle = STYLE_TEMPLATES.find(s =>
                s.mix === settings.editingStyleMix && JSON.stringify(s.styles) === JSON.stringify(settings.editingStyles)
            );
            if (activeStyle && activeStyle.id !== 'none' && activeStyle.id !== 'custom-style') {
                incrementStyle(activeStyle.id);
            }
        }
        if (godMode && godModeVibe) {
            incrementGodMode(godModeVibe);
        }

        onGenerate(finalSettings);
    };

    const handleTemplateSelect = (tmpl: typeof TEMPLATES[0], e?: React.MouseEvent) => {
        if (e && (e.ctrlKey || e.metaKey)) {
            // Chaos mode multi-select
            let next = [...settings.templates];
            if (next.includes(tmpl.id)) {
                next = next.filter(id => id !== tmpl.id);
                if (next.length === 0) next = [tmpl.id]; // Keep at least one
            } else {
                next.push(tmpl.id);
            }
            // Update settings using the first selected template's settings, but keep all IDs
            const baseSettings = TEMPLATES.find(t => t.id === next[0])?.settings || {};
            update({ templates: next, ...baseSettings });
        } else {
            // Single select
            if (tmpl.settings) update({ templates: [tmpl.id], ...tmpl.settings });
            else update({ templates: ['custom'] });
        }
    };

    // ── VIBE → SETTINGS AUTO-DEDUCTION ENGINE ──
    const VIBE_MAP: Record<string, { pacing: string; style: string; hook: 'none' | 'snap-zoom' | 'pattern-interrupt' | 'speed-freeze' | 'auto'; retention: boolean; loop: boolean; texture: 'none' | 'grain' | 'vintage' | 'chromatic' | 'motion-blur'; transitionsEnabled: boolean; transitionPreset: string }> = {
        'clean': { pacing: 'montage', style: 'none', hook: 'none', retention: false, loop: false, texture: 'none', transitionsEnabled: false, transitionPreset: 'hard-cuts' },
        'cinematic': { pacing: 'filmscore', style: 'cinematic', hook: 'speed-freeze', retention: false, loop: false, texture: 'grain', transitionsEnabled: true, transitionPreset: 'cinematic' },
        'high-energy': { pacing: 'social', style: 'music-video', hook: 'snap-zoom', retention: false, loop: false, texture: 'none', transitionsEnabled: true, transitionPreset: 'whip-pan' },
        'chaos': { pacing: 'kinetic', style: 'retention-max', hook: 'pattern-interrupt', retention: true, loop: true, texture: 'chromatic', transitionsEnabled: true, transitionPreset: 'viral' },
        'viral': { pacing: 'social', style: 'viral-hook', hook: 'auto', retention: true, loop: true, texture: 'none', transitionsEnabled: true, transitionPreset: 'snap-cut' },
    };

    const handleVibeGenerate = () => {
        if (!godModeVibe) return;
        const vibe = VIBE_MAP[godModeVibe];
        if (!vibe) return;
        const pacingTmpl = TEMPLATES.find(t => t.id === vibe.pacing);
        const styleTmpl = STYLE_TEMPLATES.find(t => t.id === vibe.style);
        // When audio guide is active, duration MUST match the selected audio segment
        const effectiveDuration = settings.useAudioGuide
            ? Math.round(audioTrimEnd - audioTrimStart)
            : godModeDuration;
        const finalSettings: TrailerSettings = {
            ...DEFAULT_TRAILER_SETTINGS,
            orientationFilter,
            ...(pacingTmpl?.settings || {}),
            targetDuration: effectiveDuration,
            editingStyleMix: styleTmpl?.mix || 'heavy',
            editingStyles: (styleTmpl?.styles || []) as EditingStyleOption[],
            styleConfig: styleTmpl?.config || DEFAULT_STYLE_CONFIG,
            hookStyle: vibe.hook,
            retentionInterrupts: vibe.retention,
            loopMode: vibe.loop,
            visualTexture: vibe.texture,
            transitionsEnabled: settings.transitionsEnabled ?? vibe.transitionsEnabled,
            transitionPreset: settings.transitionPreset || vibe.transitionPreset,
            allowDuplicates: true,
            useAllClips: true,
            audioTrimStart, audioTrimEnd,
            ...(settings.useAudioGuide ? {
                useAudioGuide: true, audioFile: settings.audioFile, audioUrl: settings.audioUrl,
                audioAnalysis: settings.audioAnalysis,
            } : {}),
        };
        onGenerate(finalSettings);
    };

    const handleGodModeGenerate = (preset: typeof GODMODE_PRESETS[0]) => {
        const pacingTmpl = TEMPLATES.find(t => t.id === preset.pacing);
        const styleTmpl = STYLE_TEMPLATES.find(t => t.id === preset.style);
        const effectiveDuration = settings.useAudioGuide
            ? Math.round(audioTrimEnd - audioTrimStart)
            : godModeDuration;
        const finalSettings: TrailerSettings = {
            ...DEFAULT_TRAILER_SETTINGS,
            orientationFilter,
            ...(pacingTmpl?.settings || {}),
            targetDuration: effectiveDuration,
            editingStyleMix: styleTmpl?.mix || 'heavy',
            editingStyles: (styleTmpl?.styles || []) as EditingStyleOption[],
            styleConfig: styleTmpl?.config || DEFAULT_STYLE_CONFIG,
            transitionsEnabled: settings.transitionsEnabled,
            transitionPreset: settings.transitionPreset,
            allowDuplicates: true,
            useAllClips: true,
            audioTrimStart, audioTrimEnd,
            ...(settings.useAudioGuide ? {
                useAudioGuide: true, audioFile: settings.audioFile, audioUrl: settings.audioUrl,
                audioAnalysis: settings.audioAnalysis,
            } : {}),
        };
        onGenerate(finalSettings);
    };

    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto p-8 flex flex-col gap-8">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg shadow-lg">
                        <Wand2 size={20} className="text-white drop-shadow-md" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                            Trailer Generator <span className="text-[10px] uppercase bg-white/10 px-1.5 py-0.5 rounded text-purple-300">Beta</span>
                        </h2>
                        <p className="text-xs text-white/50">Procedurally generate rapid-cut sequences from your media library.</p>
                    </div>
                </div>

                {/* Pool Stats */}
                <div className="flex gap-4">
                    <div className="flex-1 bg-black/40 rounded-xl border border-white/5 p-4 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 blur-[50px] pointer-events-none rounded-full" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Media Pool</span>
                        <div className="text-2xl font-black text-white">{videoCount} <span className="text-[10px] font-bold text-white/30 uppercase">Videos</span></div>
                        {audioCount > 0 && <div className="text-xs text-pink-400">{audioCount} audio files</div>}
                        {hasMediaSelection && (
                            <div className="text-[10px] text-purple-300 font-bold mt-1">
                                ✦ {selectedFileIds.length} selected — only these will be used
                            </div>
                        )}
                    </div>
                </div>

                {/* ═══ ORIENTATION FILTER (Top Level) ═══ */}
                {videoCount > 0 && (
                    <div className="space-y-3 border border-white/5 rounded-xl bg-black/20 p-4">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
                            <Monitor size={12} className="text-teal-400" /> Video Orientation Filter
                            <span className="ml-auto text-teal-300 font-mono">{filteredVideoCount} clips active</span>
                        </label>
                        <div className="flex gap-2">
                            {([
                                { id: 'all' as const, icon: Video, label: 'All', count: videoCount },
                                { id: 'horizontal' as const, icon: Monitor, label: 'Horizontal', count: hCount },
                                { id: 'vertical' as const, icon: Smartphone, label: 'Vertical', count: vCount },
                                { id: 'square' as const, icon: Square, label: 'Square', count: sqCount },
                            ]).map(o => (
                                <button key={o.id} onClick={() => { setOrientationFilter(o.id); update({ orientationFilter: o.id }); }}
                                    className={clsx("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold uppercase border transition-all",
                                        orientationFilter === o.id
                                            ? "bg-teal-600/20 border-teal-500/40 text-teal-200"
                                            : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10")}>
                                    <o.icon size={12} />
                                    {o.label} <span className="opacity-50">({o.count})</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* ═══ BEAT INTELLIGENCE ENGINE ═══ */}
                <div className="border border-white/5 rounded-xl bg-black/20 p-5 space-y-4">
                    <div className="flex items-center gap-2">
                        <Music size={16} className={settings.useAudioGuide ? "text-purple-400" : "text-white/40"} />
                        <span className="text-sm font-bold text-white">Beat Intelligence Engine</span>
                        {settings.useAudioGuide && <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-bold ml-auto">Active</span>}
                        {audioAnalysis && <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">{audioAnalysis.bpm} BPM ({audioAnalysis.bpmConfidence}%)</span>}
                    </div>
                    <p className="text-[10px] text-white/40">Upload audio for intelligent beat-synced editing with rhythm detection, segment mapping, and drop-aware effects.</p>
                    <input type="file" ref={audioInputRef} accept="audio/*,video/*" className="hidden" onChange={handleAudioUpload} />
                    {audioUrl && <audio ref={audioRef} src={audioUrl} onLoadedMetadata={handleAudioLoaded}
                        onTimeUpdate={(e) => { if ((e.target as HTMLAudioElement).currentTime >= audioTrimEnd) { (e.target as HTMLAudioElement).pause(); setAudioPlaying(false); }}} />}

                    {!settings.useAudioGuide ? (
                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                            onClick={() => audioInputRef.current?.click()}
                            className="w-full flex justify-center items-center gap-2 py-3 border border-dashed border-white/20 rounded-lg hover:border-purple-500/50 hover:bg-purple-500/10 text-white/50 hover:text-white transition-colors text-xs font-bold">
                            <Upload size={14} /> Select Audio or Video File
                        </motion.button>
                    ) : (
                        <div className="space-y-4">
                            {/* Player Row */}
                            <div className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/10 relative overflow-hidden">
                                {analysisToast && <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center text-green-300 text-[10px] font-bold uppercase tracking-widest z-10 animate-pulse">Analysis Refreshed!</div>}
                                <div className="flex items-center gap-3 overflow-hidden z-0">
                                    <button onClick={toggleAudio} className="p-2 bg-purple-500/20 rounded-full text-white hover:text-purple-400 transition-colors">
                                        {audioPlaying ? <Pause size={14} /> : <Play size={14} />}
                                    </button>
                                    <button onClick={stopAudio} className="p-2 bg-white/5 rounded-full text-white/50 hover:text-red-400 transition-colors">
                                        <Square size={14} />
                                    </button>
                                    <div className="flex flex-col truncate">
                                        <span className="text-xs font-bold text-white truncate">{settings.audioFile}</span>
                                        <span className="text-[10px] text-white/40 font-mono">{audioCurrentTime.toFixed(1)}s / {audioAnalysis?.duration.toFixed(1) || '0.0'}s</span>
                                    </div>
                                </div>
                                <div className="flex gap-2 z-0">
                                    <button onClick={() => { setAudioTrimStart(0); setAudioTrimEnd(audioAnalysis ? audioAnalysis.duration : 0); update({ audioTrimStart: 0, audioTrimEnd: audioAnalysis ? audioAnalysis.duration : 0}); }}
                                        className="p-2 bg-blue-500/20 hover:bg-blue-500/40 rounded transition-colors text-blue-300 flex items-center gap-1 text-[10px] font-bold">
                                        <ArrowLeftRight size={14} /> Full Audio
                                    </button>
                                    <button onClick={handleRandomizeBeat} disabled={isAnalyzing}
                                        className="p-2 bg-purple-500/20 hover:bg-purple-500/40 rounded transition-colors text-purple-300 flex items-center gap-1 text-[10px] font-bold">
                                        {isAnalyzing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                                        {!audioAnalysis ? 'Analyze' : 'Re-Analyze'}
                                    </button>
                                    <button onClick={handleRemoveAudio} className="p-2 bg-red-500/20 hover:bg-red-500/40 rounded text-red-400"><Trash2 size={14} /></button>
                                </div>
                            </div>

                            {/* Interactive Waveform Canvas */}
                            {audioAnalysis && (
                                <div ref={waveformWrapperRef} className="relative group cursor-crosshair select-none"
                                     onMouseDown={(e) => {
                                         const rect = waveformWrapperRef.current!.getBoundingClientRect();
                                         const x = e.clientX - rect.left;
                                         const time = (x / rect.width) * audioAnalysis.duration;
                                         const timeTolerance = (10 / rect.width) * audioAnalysis.duration; // 10 pixels tolerance
                                         if (Math.abs(time - audioTrimStart) < timeTolerance) setIsDragging('start');
                                         else if (Math.abs(time - audioTrimEnd) < timeTolerance) setIsDragging('end');
                                         else if (time > audioTrimStart && time < audioTrimEnd) { setIsDragging('move'); setDragStartPos(time - audioTrimStart); }
                                         else if (time < audioTrimStart) { setIsDragging('start'); setAudioTrimStart(time); update({ audioTrimStart: time }); }
                                         else { setIsDragging('end'); setAudioTrimEnd(time); update({ audioTrimEnd: time }); }
                                     }}>
                                    <canvas ref={waveformRef} width={800} height={80}
                                        className="w-full h-20 rounded-lg bg-black/40 border border-white/5 pointer-events-none" />
                                    <div className="absolute inset-0 flex pointer-events-none opacity-40 group-hover:opacity-100 transition-opacity">
                                        {audioAnalysis.segments.map((seg, i) => {
                                            const left = (seg.start / audioAnalysis.duration) * 100;
                                            const width = ((seg.end - seg.start) / audioAnalysis.duration) * 100;
                                            const colors: Record<string, string> = {
                                                intro: 'bg-blue-500/20', buildup: 'bg-yellow-500/30', drop: 'bg-red-500/30',
                                                breakdown: 'bg-cyan-500/20', chorus: 'bg-pink-500/25', verse: 'bg-white/10',
                                                outro: 'bg-indigo-500/20', bridge: 'bg-emerald-500/20'
                                            };
                                            return (
                                                <div key={i} className={clsx("h-full relative transition-all border-r border-white/10", colors[seg.type] || 'bg-white/5')}
                                                    style={{ left: `${left}%`, width: `${width}%`, position: 'absolute' }}>
                                                    <span className="absolute bottom-0.5 left-1 text-[8px] font-black uppercase text-white/40 tracking-wider">{seg.type}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    
                                    {/* Selection Overlay */}
                                    <div className="absolute top-0 bottom-0 bg-blue-500/30 border-l-2 border-r-2 border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)] pointer-events-none flex items-center justify-between"
                                         style={{ left: `${(audioTrimStart / audioAnalysis.duration) * 100}%`, width: `${((audioTrimEnd - audioTrimStart) / audioAnalysis.duration) * 100}%` }}>
                                         <div className="w-1.5 h-6 bg-white rounded-r-sm -ml-0.5 shadow-md" />
                                         <div className="w-1.5 h-6 bg-white rounded-l-sm -mr-0.5 shadow-md" />
                                    </div>

                                    {/* Playhead */}
                                    <div className="absolute top-0 bottom-0 w-px bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)] pointer-events-none z-20"
                                         style={{ left: `${(audioCurrentTime / audioAnalysis.duration) * 100}%` }}>
                                         <div className="w-2 h-2 bg-red-500 rounded-full -ml-1 -top-1 absolute" />
                                    </div>
                                </div>
                            )}

                            {/* Analysis Stats */}
                            {audioAnalysis && (
                                <div className="grid grid-cols-4 gap-2">
                                    {[
                                        { label: 'BPM', value: `${audioAnalysis.bpm}`, sub: `${audioAnalysis.bpmConfidence}% conf` },
                                        { label: 'Beats', value: `${audioAnalysis.beats.length}`, sub: `${audioAnalysis.beats.filter(b => b.onGrid).length} on-grid` },
                                        { label: 'Segments', value: `${audioAnalysis.segments.length}`, sub: audioAnalysis.segments.map(s => s.type).filter((v, i, a) => a.indexOf(v) === i).join(', ') },
                                        { label: 'Duration', value: `${audioAnalysis.duration.toFixed(1)}s`, sub: `${(audioAnalysis.duration / 60).toFixed(1)} min` },
                                    ].map(stat => (
                                        <div key={stat.label} className="bg-black/40 rounded-lg p-2.5 border border-white/5">
                                            <div className="text-[9px] font-black uppercase text-white/30 tracking-widest">{stat.label}</div>
                                            <div className="text-sm font-black text-white">{stat.value}</div>
                                            <div className="text-[9px] text-white/20 truncate">{stat.sub}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Manual Trim Adjustments */}
                            {audioAnalysis && (
                                <div className="flex gap-4">
                                    <div className="flex-1 space-y-1">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Start Time (s)</label>
                                        <input type="number" step="0.1" min="0" max={audioTrimEnd - 0.1} value={audioTrimStart.toFixed(1)}
                                            onChange={(e) => { const v = parseFloat(e.target.value); setAudioTrimStart(v); update({ audioTrimStart: v }); }}
                                            className="w-full bg-black/40 border border-white/10 rounded p-1.5 text-xs text-white" />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-white/40">End Time (s)</label>
                                        <input type="number" step="0.1" min={audioTrimStart + 0.1} max={audioAnalysis.duration} value={audioTrimEnd.toFixed(1)}
                                            onChange={(e) => { const v = parseFloat(e.target.value); setAudioTrimEnd(v); update({ audioTrimEnd: v }); }}
                                            className="w-full bg-black/40 border border-white/10 rounded p-1.5 text-xs text-white" />
                                    </div>
                                </div>
                            )}

                            {/* Segment Chips — additive multi-select */}
                            {audioAnalysis && audioAnalysis.segments.length > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Select Segments</span>
                                        <div className="flex items-center gap-1">
                                            {[10, 15, 30, 60].map(val => (
                                                <button key={val} onClick={() => { autoSelectBestSegment(val); update({ targetDuration: val }); }}
                                                    className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/40 transition-colors text-[9px] font-bold">
                                                    Best {val}s
                                                </button>
                                            ))}
                                            <button onClick={() => autoSelectBestSegment(settings.targetDuration)}
                                                className="ml-2 text-[9px] font-bold text-purple-300 hover:text-purple-200 transition-colors uppercase tracking-wider flex items-center gap-1">
                                                <Sparkles size={10} /> Auto Select Best
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {audioAnalysis.segments.map((seg, i) => {
                                            const isActive = audioTrimStart <= seg.start && audioTrimEnd >= seg.end;
                                            const chipColors: Record<string, string> = {
                                                intro: 'blue', buildup: 'yellow', drop: 'red', breakdown: 'cyan',
                                                chorus: 'pink', verse: 'white', outro: 'indigo', bridge: 'emerald'
                                            };
                                            const c = chipColors[seg.type] || 'white';
                                            return (
                                                <button key={i} onClick={() => handleSegmentClick(seg)}
                                                    className={clsx("px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-all border",
                                                        isActive ? `bg-${c}-500/20 text-${c}-300 border-${c}-500/30` : "bg-black/30 text-white/20 border-white/5 hover:text-white/40")}>
                                                    {seg.type} <span className="opacity-50 font-mono">{(seg.end - seg.start).toFixed(1)}s</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className="text-[9px] text-white/25 font-mono">
                                        Selected range: {audioTrimStart.toFixed(1)}s – {audioTrimEnd.toFixed(1)}s ({(audioTrimEnd - audioTrimStart).toFixed(1)}s)
                                    </div>
                                </div>
                            )}

                            {/* Sensitivity */}
                            <SliderControl label="Beat Sensitivity" icon={Zap} value={settings.beatSensitivity || 0.5}
                                min={0} max={1} step={0.1} unit="" onChange={(v) => update({ beatSensitivity: v })} />
                        </div>
                    )}
                </div>

                {/* ═══ GOD MODE (below Beat Intelligence) ═══ */}
                <div className="border rounded-xl overflow-hidden transition-all" style={{ borderColor: godMode ? 'rgba(234,179,8,0.3)' : 'rgba(255,255,255,0.05)' }}>
                    <button onClick={() => setGodMode(!godMode)}
                        className={clsx("w-full flex items-center justify-between p-4 transition-all",
                            godMode ? "bg-gradient-to-r from-yellow-900/30 to-amber-900/20" : "bg-black/20 hover:bg-white/5")}>
                        <div className="flex items-center gap-3">
                            <Crown size={18} className={clsx(godMode ? "text-yellow-400" : "text-white/30")} />
                            <div className="text-left">
                                <div className={clsx("text-sm font-black uppercase tracking-wider", godMode ? "text-yellow-200" : "text-white/60")}>God Mode</div>
                                <div className="text-[10px] text-white/30">One-click epic edits — pick a genre and go</div>
                            </div>
                        </div>
                        <div className={clsx("w-10 h-5 rounded-full transition-colors relative", godMode ? "bg-yellow-500" : "bg-black border border-white/20")}>
                            <div className={clsx("w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform", godMode ? "translate-x-5" : "translate-x-0.5")} />
                        </div>
                    </button>

                    {godMode && (
                        <div className="p-4 space-y-4 border-t border-yellow-500/10">
                            <div className="space-y-4">
                                <SliderControl label="Target Duration" icon={Clock} value={godModeDuration}
                                    min={5} max={180} step={5} unit="s" onChange={v => setGodModeDuration(v)} />
                                <div className="flex flex-wrap gap-2">
                                    {settings.useAudioGuide && audioAnalysis ? (
                                        <>
                                            <button onClick={() => setGodModeDuration(Math.round(audioTrimEnd - audioTrimStart))}
                                                className={clsx("px-2 py-1.5 rounded-md text-[10px] font-bold transition-all border whitespace-nowrap",
                                                    godModeDuration === Math.round(audioTrimEnd - audioTrimStart)
                                                        ? "bg-yellow-500 text-black border-yellow-400 shadow-lg"
                                                        : "bg-yellow-500/20 text-yellow-200 border-yellow-500/30 hover:bg-yellow-500/30")}>
                                                Selected Segment
                                            </button>
                                            <button onClick={() => setGodModeDuration(Math.round(audioAnalysis.duration))}
                                                className={clsx("px-2 py-1.5 rounded-md text-[10px] font-bold transition-all border whitespace-nowrap",
                                                    godModeDuration === Math.round(audioAnalysis.duration)
                                                        ? "bg-yellow-500 text-black border-yellow-400 shadow-lg"
                                                        : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10")}>
                                                Full Audio
                                            </button>
                                            {[5, 10, 15, 30].map(val => (
                                                <button key={val} onClick={() => setGodModeDuration(val)}
                                                    className={clsx("flex-1 min-w-[40px] py-1.5 rounded-md text-[10px] font-bold transition-all border",
                                                        godModeDuration === val ? "bg-yellow-500 text-black border-yellow-400 shadow-lg" : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10")}>
                                                    {val}s
                                                </button>
                                            ))}
                                        </>
                                    ) : (
                                        [5, 10, 15, 30].map(val => (
                                            <button key={val} onClick={() => setGodModeDuration(val)}
                                                className={clsx("flex-1 min-w-[40px] py-1.5 rounded-md text-[10px] font-bold transition-all border",
                                                    godModeDuration === val ? "bg-yellow-500 text-black border-yellow-400 shadow-lg" : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10")}>
                                                {val}s
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* ── Music Selection (inside Godmode) ── */}
                            <div className="border border-yellow-500/10 rounded-xl bg-black/20 p-4 space-y-3">
                                <div className="flex items-center gap-2">
                                    <Music size={14} className={settings.useAudioGuide ? "text-purple-400" : "text-white/40"} />
                                    <span className="text-xs font-bold text-yellow-100">Music Selection</span>
                                    {settings.useAudioGuide && <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full font-bold ml-auto">Active</span>}
                                    {audioAnalysis && <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full font-bold">{audioAnalysis.bpm} BPM</span>}
                                </div>
                                <p className="text-[9px] text-white/30">Add music before choosing a preset for beat-synced generation.</p>
                                <input type="file" ref={audioInputRef} accept="audio/*" className="hidden" onChange={handleAudioUpload} />
                                {audioUrl && <audio ref={audioRef} src={audioUrl} onLoadedMetadata={handleAudioLoaded}
                                    onTimeUpdate={(e) => { if ((e.target as HTMLAudioElement).currentTime >= audioTrimEnd) { (e.target as HTMLAudioElement).pause(); setAudioPlaying(false); }}} />}

                                {!settings.useAudioGuide ? (
                                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                        onClick={() => audioInputRef.current?.click()}
                                        className="w-full flex justify-center items-center gap-2 py-2.5 border border-dashed border-yellow-500/20 rounded-lg hover:border-purple-500/50 hover:bg-purple-500/10 text-white/50 hover:text-white transition-colors text-[10px] font-bold">
                                        <Upload size={12} /> Select Audio File
                                    </motion.button>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between bg-white/5 p-2.5 rounded-lg border border-white/10">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <button onClick={toggleAudio} className="text-white hover:text-purple-400 transition-colors">
                                                    {audioPlaying ? <Pause size={14} /> : <Play size={14} />}
                                                </button>
                                                <div className="flex flex-col truncate">
                                                    <span className="text-[10px] font-bold text-white truncate">{settings.audioFile}</span>
                                                    <span className="text-[9px] text-white/40 font-mono">{audioTrimStart.toFixed(1)}s - {audioTrimEnd.toFixed(1)}s</span>
                                                </div>
                                            </div>
                                            <div className="flex gap-1.5">
                                                <button onClick={handleRandomizeBeat} disabled={isAnalyzing}
                                                    className="p-1.5 bg-purple-500/20 hover:bg-purple-500/40 rounded transition-colors text-purple-300 flex items-center gap-1 text-[9px] font-bold">
                                                    {isAnalyzing ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                                                    {!audioAnalysis ? 'Analyze' : 'Re-Analyze'}
                                                </button>
                                                <button onClick={handleRemoveAudio} className="p-1.5 bg-red-500/20 hover:bg-red-500/40 rounded text-red-400"><Trash2 size={12} /></button>
                                            </div>
                                        </div>
                                        {audioAnalysis && (
                                            <div className="grid grid-cols-4 gap-1.5">
                                                {[
                                                    { label: 'BPM', value: `${audioAnalysis.bpm}` },
                                                    { label: 'Beats', value: `${audioAnalysis.beats.length}` },
                                                    { label: 'Segments', value: `${audioAnalysis.segments.length}` },
                                                    { label: 'Duration', value: `${audioAnalysis.duration.toFixed(1)}s` },
                                                ].map(stat => (
                                                    <div key={stat.label} className="bg-black/40 rounded-lg p-2 border border-white/5">
                                                        <div className="text-[8px] font-black uppercase text-white/30 tracking-widest">{stat.label}</div>
                                                        <div className="text-xs font-black text-white">{stat.value}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {audioAnalysis && audioAnalysis.segments.length > 0 && (
                                            <div className="space-y-1.5">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[8px] font-black uppercase text-white/30 tracking-wider">Segments</span>
                                                    <button onClick={() => autoSelectBestSegment(godModeDuration)}
                                                        className="text-[8px] font-bold text-yellow-300 hover:text-yellow-200 transition-colors uppercase tracking-wider">
                                                        ⚡ Auto Select Best
                                                    </button>
                                                </div>
                                                <div className="flex flex-wrap gap-1">
                                                    {audioAnalysis.segments.map((seg, i) => {
                                                        const isActive = audioTrimStart <= seg.start && audioTrimEnd >= seg.end;
                                                        const chipColors: Record<string, string> = {
                                                            drop: 'red', chorus: 'pink', buildup: 'yellow', verse: 'white',
                                                            intro: 'blue', outro: 'indigo', breakdown: 'cyan', bridge: 'emerald'
                                                        };
                                                        const c = chipColors[seg.type] || 'white';
                                                        return (
                                                            <button key={i} onClick={() => handleSegmentClick(seg)}
                                                                className={clsx("px-1.5 py-0.5 rounded text-[8px] font-bold uppercase transition-all border",
                                                                    isActive
                                                                        ? `bg-${c}-500/25 text-${c}-300 border-${c}-500/40`
                                                                        : "bg-black/30 text-white/25 border-white/5 hover:text-white/50")}>
                                                                {seg.type} <span className="opacity-50 font-mono">{(seg.end - seg.start).toFixed(0)}s</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                <div className="text-[8px] text-white/20 font-mono">
                                                    Selected: {audioTrimStart.toFixed(1)}s – {audioTrimEnd.toFixed(1)}s ({(audioTrimEnd - audioTrimStart).toFixed(1)}s)
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* ── STEP 1: What's the Vibe? ── */}
                            <div className="space-y-2">
                                <div className="text-[9px] font-black uppercase tracking-widest text-yellow-300/60">Step 1 — What's the vibe?</div>
                                <div className="grid grid-cols-5 gap-2">
                                    {[
                                        { id: 'clean', emoji: '🧊', label: 'Clean', desc: 'Minimal, no effects' },
                                        { id: 'cinematic', emoji: '🎬', label: 'Cinematic', desc: 'Elegant, film-grade' },
                                        { id: 'high-energy', emoji: '⚡', label: 'High Energy', desc: 'Punchy, beat-locked' },
                                        { id: 'chaos', emoji: '🔥', label: 'Maximum', desc: 'Full chaos mode' },
                                        { id: 'viral', emoji: '📱', label: 'Viral', desc: 'Retention-optimized' },
                                    ].map(v => (
                                        <button key={v.id} onClick={() => setGodModeVibe(v.id)}
                                            className={clsx("p-3 rounded-xl border text-center transition-all",
                                                godModeVibe === v.id
                                                    ? "border-yellow-400 bg-yellow-500/20 shadow-lg shadow-yellow-500/10"
                                                    : "border-white/10 bg-black/30 hover:bg-white/5 hover:border-white/20")}>
                                            <div className="text-xl mb-1">{v.emoji}</div>
                                            <div className={clsx("text-[10px] font-black uppercase", godModeVibe === v.id ? "text-yellow-200" : "text-white/60")}>{v.label}</div>
                                            <div className="text-[8px] text-white/30 mt-0.5">{v.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* ── STEP 2: Generate Button ── */}
                            {godModeVibe && (
                                <motion.button
                                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                                    onClick={handleVibeGenerate}
                                    disabled={videoCount === 0}
                                    className="w-full py-4 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 text-black font-black uppercase tracking-wider text-sm shadow-xl shadow-yellow-500/20 hover:shadow-yellow-500/40 transition-all disabled:opacity-40 disabled:grayscale">
                                    <Crown className="inline mr-2" size={16} />
                                    Generate {godModeVibe === 'viral' ? 'Viral' : godModeVibe === 'chaos' ? 'Chaotic' : godModeVibe === 'cinematic' ? 'Cinematic' : godModeVibe === 'high-energy' ? 'Energetic' : 'Clean'} Edit — {godModeDuration}s
                                </motion.button>
                            )}

                            {/* ── Transitions (inside GodMode) ── */}
                            <div className="border border-yellow-500/10 rounded-xl bg-black/20 p-3 space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-yellow-100/60 flex items-center gap-2">
                                        <Layers size={12} className={settings.transitionsEnabled ? "text-pink-400" : "text-white/30"} /> Transitions
                                        {settings.transitionsEnabled && <span className="text-[9px] bg-pink-500/20 text-pink-300 px-1.5 py-0.5 rounded-full font-bold">On</span>}
                                    </label>
                                    <button onClick={() => update({ transitionsEnabled: !settings.transitionsEnabled })}
                                        className={clsx("w-10 h-5 rounded-full transition-colors relative", settings.transitionsEnabled ? "bg-pink-500" : "bg-black border border-white/20")}>
                                        <div className={clsx("w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform", settings.transitionsEnabled ? "translate-x-5" : "translate-x-0.5")} />
                                    </button>
                                </div>
                                {settings.transitionsEnabled && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {['cinematic', 'buttery', 'kinetic', 'whip-pan', 'snap-cut', 'viral', 'dramatic', 'all'].map(preset => (
                                            <button key={preset} onClick={() => update({ transitionPreset: preset })}
                                                className={clsx("px-2 py-1 rounded-lg text-[9px] font-bold uppercase transition-all border",
                                                    settings.transitionPreset === preset
                                                        ? "bg-pink-600/20 border-pink-500 text-pink-200"
                                                        : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
                                                )}>
                                                {preset}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* ── Advanced Toggle ── */}
                            <button onClick={() => setGodModeAdvanced(!godModeAdvanced)}
                                className="flex items-center gap-2 text-[9px] font-bold text-white/30 hover:text-white/50 transition-colors uppercase tracking-wider">
                                {godModeAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                {godModeAdvanced ? 'Hide' : 'Show'} Advanced Presets
                            </button>

                            {/* ── Preset Grid (Advanced) ── */}
                            {godModeAdvanced && GODMODE_TIERS.map((tier, tierIdx) => {
                                const tierPresets = GODMODE_PRESETS.filter(p => p.tier === tierIdx);
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
                                                    <motion.button key={preset.id}
                                                        whileHover={{ scale: 1.03, y: -2 }}
                                                        whileTap={{ scale: 0.97 }}
                                                        onClick={() => handleGodModeGenerate(preset)}
                                                        disabled={videoCount === 0}
                                                        className={clsx("p-3 rounded-xl border text-left transition-all group disabled:opacity-40 disabled:grayscale",
                                                            tierIdx <= 1
                                                                ? "border-yellow-500/15 bg-gradient-to-br from-yellow-900/10 to-amber-900/5 hover:from-yellow-800/20 hover:to-amber-800/10"
                                                                : tierIdx === 2
                                                                    ? "border-orange-500/20 bg-gradient-to-br from-orange-900/10 to-red-900/5 hover:from-orange-800/20 hover:to-red-800/10"
                                                                    : "border-red-500/25 bg-gradient-to-br from-red-900/15 to-pink-900/10 hover:from-red-800/25 hover:to-pink-800/15"
                                                        )}>
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
                        </div>
                    )}
                </div>

                {/* ═══ GOD MODE INJECTION — disables manual controls ═══ */}
                <div className={clsx(godMode && "opacity-30 pointer-events-none select-none")}>

                {/* Include Grids Selector */}
                <div className="space-y-3 border border-white/5 rounded-xl bg-black/20 p-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
                        <Layers size={12} className="text-teal-400" /> Include Grids
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {([
                            { id: 'off' as const, label: 'Off', desc: 'No grid layouts' },
                            { id: 'mixed' as const, label: 'Mixed', desc: 'Grids sprinkled in' },
                            { id: 'grids-only' as const, label: 'Grids Only', desc: 'All clips use grids' },
                        ]).map(opt => (
                            <button key={opt.id} onClick={() => update({ includeGrids: opt.id } as any)}
                                className={clsx("p-2.5 rounded-lg border text-left transition-all",
                                    (settings.includeGrids || 'off') === opt.id
                                        ? "bg-teal-600/20 border-teal-500/40 shadow-[0_0_10px_rgba(20,184,166,0.15)]"
                                        : "bg-white/5 border-white/5 hover:bg-white/10")}>
                                <div className={clsx("text-[10px] font-black uppercase", (settings.includeGrids || 'off') === opt.id ? "text-teal-200" : "text-white/70")}>{opt.label}</div>
                                <div className="text-[9px] text-white/30">{opt.desc}</div>
                            </button>
                        ))}
                    </div>
                </div>


                {/* ─── 2026 RETENTION & TEXTURE CONTROLS ─── */}
                <div className="space-y-4 border border-white/5 rounded-xl bg-black/20 p-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
                        <Zap size={12} className="text-orange-400" /> Viral Intelligence
                    </label>

                    {/* Hook Style */}
                    <div className="space-y-1.5">
                        <span className="text-[9px] font-bold text-white/50 uppercase tracking-wider">Hook (First 3s)</span>
                        <div className="grid grid-cols-5 gap-1.5">
                            {([
                                { id: 'none' as const, label: 'None' },
                                { id: 'auto' as const, label: 'Auto' },
                                { id: 'snap-zoom' as const, label: 'Snap Zoom' },
                                { id: 'speed-freeze' as const, label: 'Freeze' },
                                { id: 'pattern-interrupt' as const, label: 'Interrupt' },
                            ]).map(h => (
                                <button key={h.id} onClick={() => update({ hookStyle: h.id })}
                                    className={clsx("py-1.5 rounded-lg border text-[9px] font-bold uppercase transition-all",
                                        (settings.hookStyle || 'none') === h.id
                                            ? "bg-orange-500/20 border-orange-500/40 text-orange-200"
                                            : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10")}>
                                    {h.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Visual Texture */}
                    <div className="space-y-1.5">
                        <span className="text-[9px] font-bold text-white/50 uppercase tracking-wider">Visual Texture</span>
                        <div className="grid grid-cols-5 gap-1.5">
                            {([
                                { id: 'none' as const, label: 'None' },
                                { id: 'grain' as const, label: 'Grain' },
                                { id: 'chromatic' as const, label: 'Chromatic' },
                                { id: 'motion-blur' as const, label: 'Motion' },
                                { id: 'vintage' as const, label: 'Vintage' },
                            ]).map(t => (
                                <button key={t.id} onClick={() => update({ visualTexture: t.id })}
                                    className={clsx("py-1.5 rounded-lg border text-[9px] font-bold uppercase transition-all",
                                        (settings.visualTexture || 'none') === t.id
                                            ? "bg-amber-500/20 border-amber-500/40 text-amber-200"
                                            : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10")}>
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Toggles Row */}
                    <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <button onClick={() => update({ retentionInterrupts: !settings.retentionInterrupts })}
                                className={clsx("w-8 h-4 rounded-full transition-colors relative", settings.retentionInterrupts ? "bg-orange-500" : "bg-black border border-white/20")}>
                                <div className={clsx("w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform", settings.retentionInterrupts ? "translate-x-4" : "translate-x-0.5")} />
                            </button>
                            <span className="text-[9px] font-bold text-white/50 uppercase">Pattern Interrupts</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <button onClick={() => update({ loopMode: !settings.loopMode })}
                                className={clsx("w-8 h-4 rounded-full transition-colors relative", settings.loopMode ? "bg-purple-500" : "bg-black border border-white/20")}>
                                <div className={clsx("w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform", settings.loopMode ? "translate-x-4" : "translate-x-0.5")} />
                            </button>
                            <span className="text-[9px] font-bold text-white/50 uppercase">Loop Mode</span>
                        </label>
                    </div>
                </div>

                {/* ─── TRANSITIONS CONTROLS (shown here when GodMode is OFF) ─── */}
                {godMode ? (
                    <div className="border border-yellow-500/10 rounded-xl bg-black/10 p-3 text-center">
                        <span className="text-[9px] text-yellow-300/50 font-bold uppercase">⚡ Transitions moved to God Mode panel above</span>
                    </div>
                ) : (
                <div className="space-y-4 border border-white/5 rounded-xl bg-black/20 p-4">
                    <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
                            <Layers size={12} className={settings.transitionsEnabled ? "text-pink-400" : "text-white/30"} /> Transitions Engine
                            {settings.transitionsEnabled && <span className="text-[10px] bg-pink-500/20 text-pink-300 px-2 py-0.5 rounded-full font-bold">Active</span>}
                        </label>
                        <button onClick={() => update({ transitionsEnabled: !settings.transitionsEnabled })}
                            className={clsx("w-10 h-5 rounded-full transition-colors relative", settings.transitionsEnabled ? "bg-pink-500" : "bg-black border border-white/20")}>
                            <div className={clsx("w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform", settings.transitionsEnabled ? "translate-x-5" : "translate-x-0.5")} />
                        </button>
                    </div>

                    <div className={clsx("space-y-4 pt-2 transition-all", !settings.transitionsEnabled && "opacity-30 pointer-events-none")}>
                        <div className="flex flex-wrap gap-2">
                            {['cinematic', 'buttery', 'kinetic', 'whip', 'dramatic', 'organic', 'whip-pan', 'snap-cut', 'viral', 'all'].map(preset => (
                                <button key={preset} onClick={() => update({ transitionPreset: preset })}
                                    className={clsx("flex-1 min-w-[70px] py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all border",
                                        settings.transitionPreset === preset
                                            ? "bg-pink-600/20 border-pink-500 text-pink-200"
                                            : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10"
                                    )}>
                                    {preset}
                                </button>
                            ))}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <SliderControl label="Simultaneous FX" icon={Layers} value={settings.maxSimultaneousTransitions || 1}
                                min={1} max={5} step={1} unit="" onChange={(v) => update({ maxSimultaneousTransitions: v })} />
                            <SliderControl label="Overlap Delay" icon={Clock} value={settings.simultaneousTransitionDelay || 0.2}
                                min={0} max={1} step={0.1} unit="s" onChange={(v) => update({ simultaneousTransitionDelay: v })} />
                        </div>
                    </div>
                </div>
                )}

                {/* Pacing Templates — Smart Preset: Quick Picks + Advanced */}
                <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
                        <Zap size={12} className="text-purple-400" /> Quick Picks
                        <span className="text-white/20 font-normal normal-case tracking-normal ml-1">adapts to your usage</span>
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {(topTemplateIds.length > 0 ? TEMPLATES.filter(t => topTemplateIds.includes(t.id)) : TEMPLATES.slice(0, 5)).map(tmpl => (
                            <motion.button 
                                key={tmpl.id} 
                                onClick={(e) => handleTemplateSelect(tmpl, e)}
                                whileHover={{ scale: 1.05, y: -2 }}
                                whileTap={{ scale: 0.95 }}
                                className={clsx("flex flex-col gap-3 p-3 text-left rounded-xl transition-colors border group relative overflow-hidden",
                                    settings.templates.includes(tmpl.id) ? "bg-purple-500/10 border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.2)]" : "bg-white/5 border-white/5 hover:border-white/20")}>
                                {settings.templates.includes(tmpl.id) && <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/20 to-transparent pointer-events-none" />}
                                <div className="flex justify-between items-start">
                                    <div className={clsx("p-1.5 rounded-lg transition-colors", settings.templates.includes(tmpl.id) ? "bg-purple-500 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]" : "bg-black/50 text-white/50 group-hover:text-white/80")}>
                                        <tmpl.icon size={16} />
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); togglePinTemplate(tmpl.id); }}
                                            className={clsx("p-0.5 rounded transition-colors cursor-pointer", pinnedTemplates.includes(tmpl.id) ? "text-amber-400" : "text-white/20 hover:text-white/50")}
                                            title={pinnedTemplates.includes(tmpl.id) ? "Unpin from Quick Picks" : "Pin to Quick Picks"}>
                                            <Pin size={10} />
                                        </span>
                                        {settings.templates.includes(tmpl.id) && (
                                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}>
                                                <Check size={14} className="text-purple-400" />
                                            </motion.div>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <div className={clsx("text-xs font-bold truncate transition-colors", settings.templates.includes(tmpl.id) ? "text-purple-200" : "text-white/80")}>{tmpl.name}</div>
                                    <div className="text-[10px] text-white/40 font-mono mt-0.5">{tmpl.desc}</div>
                                </div>
                            </motion.button>
                        ))}
                    </div>

                    {/* Advanced: All Templates */}
                    <details className="group/adv">
                        <summary className="text-[10px] font-bold text-white/30 uppercase tracking-wider cursor-pointer hover:text-white/50 flex items-center gap-1 select-none list-none mt-2">
                            <ChevronDown size={10} className="group-open/adv:hidden" />
                            <ChevronUp size={10} className="hidden group-open/adv:block" />
                            All Templates ({TEMPLATES.length})
                        </summary>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2">
                            {TEMPLATES.map(tmpl => (
                                <motion.button 
                                    key={tmpl.id} 
                                    onClick={(e) => handleTemplateSelect(tmpl, e)}
                                    whileHover={{ scale: 1.03 }}
                                    whileTap={{ scale: 0.97 }}
                                    className={clsx("flex flex-col gap-2 p-2.5 text-left rounded-lg transition-colors border group relative overflow-hidden",
                                        settings.templates.includes(tmpl.id) ? "bg-purple-500/10 border-purple-500/50" : "bg-white/5 border-white/5 hover:border-white/20")}>
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-1.5">
                                            <tmpl.icon size={12} className={settings.templates.includes(tmpl.id) ? "text-purple-300" : "text-white/40"} />
                                            <span className={clsx("text-[10px] font-bold", settings.templates.includes(tmpl.id) ? "text-purple-200" : "text-white/70")}>{tmpl.name}</span>
                                        </div>
                                        <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); togglePinTemplate(tmpl.id); }}
                                            className={clsx("p-0.5 rounded transition-colors cursor-pointer", pinnedTemplates.includes(tmpl.id) ? "text-amber-400" : "text-white/15 hover:text-white/40")}
                                            title={pinnedTemplates.includes(tmpl.id) ? "Unpin" : "Pin to Quick Picks"}>
                                            <Pin size={9} />
                                        </span>
                                    </div>
                                    <span className="text-[9px] text-white/30">{tmpl.desc}</span>
                                </motion.button>
                            ))}
                        </div>
                    </details>
                </div>

                {/* Duration & Clip Boundaries */}
                <div className="grid sm:grid-cols-2 gap-8 bg-black/20 p-5 rounded-xl border border-white/5 mt-6">
                    <div className="space-y-4">
                        <SliderControl label="Target Duration" icon={Clock} value={settings.targetDuration}
                            min={5} max={180} step={5} unit="s" onChange={(v) => {
                                update({ targetDuration: v });
                                // ── BEAT↔DURATION SYNC: When duration changes with audio active,
                                // auto-reposition the audio trim region to match ──
                                if (settings.useAudioGuide && audioAnalysis) {
                                    autoSelectBestSegment(v);
                                }
                            }} />
                        <div className="flex flex-wrap gap-2">
                            {settings.useAudioGuide && audioAnalysis ? (
                                <>
                                    <button onClick={() => update({ targetDuration: Math.round(audioTrimEnd - audioTrimStart) })}
                                        className={clsx("px-2 py-1.5 rounded-md text-[10px] font-bold transition-all border whitespace-nowrap",
                                            settings.targetDuration === Math.round(audioTrimEnd - audioTrimStart)
                                                ? "bg-primary text-white border-primary shadow-lg"
                                                : "bg-purple-500/20 text-purple-200 border-purple-500/30 hover:bg-purple-500/30")}>
                                        Selected Segment
                                    </button>
                                    <button onClick={() => update({ targetDuration: Math.round(audioAnalysis.duration) })}
                                        className={clsx("px-2 py-1.5 rounded-md text-[10px] font-bold transition-all border whitespace-nowrap",
                                            settings.targetDuration === Math.round(audioAnalysis.duration)
                                                ? "bg-primary text-white border-primary shadow-lg"
                                                : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10")}>
                                        Full Audio
                                    </button>
                                    {[5, 10, 15, 30].map(val => (
                                        <button key={val} onClick={() => update({ targetDuration: val })}
                                            className={clsx("flex-1 min-w-[40px] py-1.5 rounded-md text-[10px] font-bold transition-all border",
                                                settings.targetDuration === val ? "bg-primary text-white border-primary shadow-lg" : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10")}>
                                            {val}s
                                        </button>
                                    ))}
                                </>
                            ) : (
                                [5, 10, 15, 30].map(val => (
                                    <button key={val} onClick={() => update({ targetDuration: val })}
                                        className={clsx("flex-1 min-w-[40px] py-1.5 rounded-md text-[10px] font-bold transition-all border",
                                            settings.targetDuration === val ? "bg-primary text-white border-primary shadow-lg" : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10")}>
                                        {val}s
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                    <div className="space-y-6">
                        <SliderControl label="Shortest Clip" icon={Scissors} value={settings.shortestClip}
                            min={0.1} max={5} step={0.1} unit="s"
                            onChange={(v) => update({ shortestClip: v, longestClip: Math.max(v, settings.longestClip) })} />
                        <SliderControl label="Longest Clip" icon={Scissors} value={settings.longestClip}
                            min={0.5} max={10} step={0.1} unit="s"
                            onChange={(v) => update({ longestClip: v, shortestClip: Math.min(v, settings.shortestClip) })} />
                    </div>
                </div>

                {/* Toggles */}
                <div className="flex flex-col sm:flex-row gap-4">
                    <label className="flex flex-1 items-center justify-between p-4 rounded-xl border border-white/5 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                        <div className="flex flex-col gap-1">
                            <span className="text-sm font-bold text-white">Allow Duplicate Files</span>
                            <span className="text-[10px] text-white/40">Same file can appear multiple times.</span>
                        </div>
                        <div className="relative">
                            <input type="checkbox" className="sr-only" checked={settings.allowDuplicates}
                                onChange={(e) => update({ allowDuplicates: e.target.checked })} />
                            <div className={clsx("w-10 h-5 rounded-full transition-colors", settings.allowDuplicates ? "bg-purple-500" : "bg-black border border-white/20")}>
                                <div className={clsx("w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform", settings.allowDuplicates ? "translate-x-5" : "translate-x-0.5")} />
                            </div>
                        </div>
                    </label>
                    <label className="flex flex-1 items-center justify-between p-4 rounded-xl border border-white/5 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                        <div className="flex flex-col gap-1">
                            <span className="text-sm font-bold text-white">Force All Clips</span>
                            <span className="text-[10px] text-white/40">Every file appears at least once.</span>
                        </div>
                        <div className="relative">
                            <input type="checkbox" className="sr-only" checked={settings.useAllClips}
                                onChange={(e) => update({ useAllClips: e.target.checked })} />
                            <div className={clsx("w-10 h-5 rounded-full transition-colors", settings.useAllClips ? "bg-emerald-500" : "bg-black border border-white/20")}>
                                <div className={clsx("w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform", settings.useAllClips ? "translate-x-5" : "translate-x-0.5")} />
                            </div>
                        </div>
                    </label>
                </div>

                {/* Cinematic Speed */}
                <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
                        <Clock size={12} className="text-blue-400" /> Cinematic Speed
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { id: 'none', label: 'Normal (1.0x)', desc: 'No speed modification' },
                            { id: 'slowmo', label: 'Slow-Mo (0.5x)', desc: 'All clips at half speed' },
                            { id: 'fast', label: 'Fast (1.5x)', desc: 'All clips at 1.5x' },
                            { id: 'timelapse', label: 'Time-lapse (2.5x)', desc: 'All clips at 2.5x' },
                            { id: 'hyperfast', label: 'Hyper (4.0x)', desc: 'All clips at 4x' },
                            { id: 'mixed-slow', label: 'Mixed Slow', desc: 'Random slow-mo sprinkled in' },
                            { id: 'mixed-fast', label: 'Mixed Fast', desc: 'Random speed-ups' },
                            { id: 'mixed-all', label: 'Mixed Action', desc: 'Random mix of slow/fast' },
                            { id: 'dramatic', label: 'Dramatic Build', desc: 'Start slow, accelerate' },
                            { id: 'dramatic-reverse', label: 'Reverse Build', desc: 'Start fast, decelerate' },
                            { id: 'ramped', label: 'Speed Ramp', desc: 'Fast→Slow→Fast wave' },
                            { id: 'ramped-inverse', label: 'Inverse Ramp', desc: 'Slow→Fast→Slow wave' },
                            { id: 'slowmo-fast', label: 'Slow + Bursts', desc: 'Base 0.5x + random 2x' },
                            { id: 'fast-slowmo', label: 'Fast + Drops', desc: 'Base 1.5x + random 0.3x' },
                            { id: 'pulse', label: 'Pulse', desc: 'Alternating slow-fast' },
                            { id: 'breathe', label: 'Breathe', desc: 'Gentle 0.7x–1.3x wave' },
                        ].map(opt => (
                            <button key={opt.id} onClick={() => update({ slowmoPolicy: opt.id as any })}
                                className={clsx("p-2.5 rounded-lg border text-left transition-all",
                                    settings.slowmoPolicy === opt.id
                                        ? "bg-blue-600/20 border-blue-500/40 shadow-[0_0_12px_rgba(59,130,246,0.15)]"
                                        : "bg-white/5 border-white/5 hover:bg-white/10")}>
                                <div className={clsx("text-[10px] font-black uppercase", settings.slowmoPolicy === opt.id ? "text-blue-200" : "text-white/70")}>{opt.label}</div>
                                <div className="text-[9px] text-white/30">{opt.desc}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* ─── EDITING STYLE INJECTION ─── */}
                <div className="space-y-4 border border-white/5 rounded-xl bg-black/20 p-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
                        <Sparkles size={12} className="text-indigo-400" /> Editing Style Engine
                    </label>

                    {/* Style Quick Picks */}
                    <label className="text-[10px] font-bold text-white/30 uppercase tracking-wider mt-1">Quick Picks</label>
                    <div className="grid grid-cols-5 gap-2">
                        {(topStyleIds.length > 0 ? STYLE_TEMPLATES.filter(t => topStyleIds.includes(t.id)) : STYLE_TEMPLATES.slice(0, 5)).map(tmpl => {
                            const Icon = tmpl.icon;
                            const isActive = tmpl.id === 'none' ? settings.editingStyleMix === 'none'
                                : tmpl.id === 'custom-style' ? false
                                : (tmpl.mix === settings.editingStyleMix && JSON.stringify(tmpl.styles) === JSON.stringify(settings.editingStyles));
                            return (
                                <button key={tmpl.id} onClick={(e) => {
                                    if (tmpl.mix === null) return;
                                    if (e.ctrlKey || e.metaKey) {
                                        const nextStyles = Array.from(new Set([...(settings.editingStyles || []), ...(tmpl.styles || [])]));
                                        update({ editingStyleMix: tmpl.mix, editingStyles: nextStyles as EditingStyleOption[], styleConfig: tmpl.config! });
                                    } else {
                                        update({ editingStyleMix: tmpl.mix, editingStyles: tmpl.styles!, styleConfig: tmpl.config! });
                                    }
                                }}
                                className={clsx(
                                    "p-2.5 rounded-lg border text-left transition-all group relative",
                                    isActive ? "bg-indigo-600/20 border-indigo-500/40 shadow-[0_0_12px_rgba(99,102,241,0.15)]" : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/15"
                                )}>
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1.5">
                                            <Icon size={12} className={clsx(isActive ? "text-indigo-300" : "text-white/40")} />
                                            <span className={clsx("text-[10px] font-black uppercase tracking-wider", isActive ? "text-indigo-200" : "text-white/70")}>{tmpl.name}</span>
                                        </div>
                                        <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); togglePinStyle(tmpl.id); }}
                                            className={clsx("p-0.5 rounded transition-colors cursor-pointer", pinnedStyles.includes(tmpl.id) ? "text-amber-400" : "text-white/15 hover:text-white/40")}
                                            title={pinnedStyles.includes(tmpl.id) ? "Unpin" : "Pin to Quick Picks"}>
                                            <Pin size={9} />
                                        </span>
                                    </div>
                                    <span className="text-[9px] text-white/30 leading-tight">{tmpl.desc}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Advanced: All Style Templates */}
                    <details className="group/advs">
                        <summary className="text-[10px] font-bold text-white/30 uppercase tracking-wider cursor-pointer hover:text-white/50 flex items-center gap-1 select-none list-none mt-1">
                            <ChevronDown size={10} className="group-open/advs:hidden" />
                            <ChevronUp size={10} className="hidden group-open/advs:block" />
                            All Styles ({STYLE_TEMPLATES.length})
                        </summary>
                        <div className="grid grid-cols-4 gap-2 mt-2">
                            {STYLE_TEMPLATES.map(tmpl => {
                                const Icon = tmpl.icon;
                                const isActive = tmpl.id === 'none' ? settings.editingStyleMix === 'none'
                                    : tmpl.id === 'custom-style' ? !STYLE_TEMPLATES.slice(0, -1).some(t => {
                                        if (t.id === 'none') return settings.editingStyleMix === 'none';
                                        return t.mix === settings.editingStyleMix && JSON.stringify(t.styles) === JSON.stringify(settings.editingStyles);
                                    }) : (tmpl.mix === settings.editingStyleMix && JSON.stringify(tmpl.styles) === JSON.stringify(settings.editingStyles));
                                return (
                                    <button key={tmpl.id} onClick={(e) => {
                                        if (tmpl.mix === null) return;
                                        if (e.ctrlKey || e.metaKey) {
                                            const nextStyles = Array.from(new Set([...(settings.editingStyles || []), ...(tmpl.styles || [])]));
                                            update({ editingStyleMix: tmpl.mix, editingStyles: nextStyles as EditingStyleOption[], styleConfig: tmpl.config! });
                                        } else {
                                            update({ editingStyleMix: tmpl.mix, editingStyles: tmpl.styles!, styleConfig: tmpl.config! });
                                        }
                                    }}
                                    className={clsx(
                                        "p-2.5 rounded-lg border text-left transition-all group",
                                        isActive ? "bg-indigo-600/20 border-indigo-500/40 shadow-[0_0_12px_rgba(99,102,241,0.15)]" : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/15"
                                    )}>
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-1.5">
                                                <Icon size={12} className={clsx(isActive ? "text-indigo-300" : "text-white/40")} />
                                                <span className={clsx("text-[10px] font-black uppercase tracking-wider", isActive ? "text-indigo-200" : "text-white/70")}>{tmpl.name}</span>
                                            </div>
                                            <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); togglePinStyle(tmpl.id); }}
                                                className={clsx("p-0.5 rounded transition-colors cursor-pointer", pinnedStyles.includes(tmpl.id) ? "text-amber-400" : "text-white/15 hover:text-white/40")}
                                                title={pinnedStyles.includes(tmpl.id) ? "Unpin" : "Pin to Quick Picks"}>
                                                <Pin size={9} />
                                            </span>
                                        </div>
                                        <span className="text-[9px] text-white/30 leading-tight">{tmpl.desc}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </details>

                    {settings.editingStyleMix !== 'none' && (
                        <>
                            {/* Intensity Selector */}
                            <div className="space-y-2">
                                <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Injection Density</span>
                                <div className="flex gap-1.5">
                                    {(['light', 'heavy', 'every'] as const).map(opt => (
                                        <button key={opt} onClick={() => update({ editingStyleMix: opt })}
                                            className={clsx(
                                                "flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all border capitalize",
                                                settings.editingStyleMix === opt
                                                    ? "bg-indigo-600 text-white border-indigo-500"
                                                    : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10"
                                            )}>{opt === 'every' ? 'Every Clip' : opt}</button>
                                    ))}
                                </div>
                            </div>

                            {/* Style Chips */}
                            <div className="space-y-2">
                                <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Active Styles</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {[
                                        { id: 'rubber-band-standard' as EditingStyleOption, label: 'Rubber Band', color: 'purple' },
                                        { id: 'rubber-band-zoom' as EditingStyleOption, label: 'Zoom Bounce', color: 'cyan' },
                                        { id: 'rubber-band-zoom-speed' as EditingStyleOption, label: 'Zoom + Speed', color: 'amber' },
                                        { id: 'multi-boomerang' as EditingStyleOption, label: 'Boomerang', color: 'emerald' },
                                        { id: 'triple-shot' as EditingStyleOption, label: 'Triple-Shot', color: 'rose' },
                                    ].map(style => {
                                        const active = settings.editingStyles.includes(style.id);
                                        return (
                                            <button key={style.id} onClick={() => {
                                                const next = active
                                                    ? settings.editingStyles.filter(s => s !== style.id)
                                                    : [...settings.editingStyles, style.id];
                                                update({ editingStyles: next });
                                            }}
                                            className={clsx(
                                                "px-2.5 py-1 rounded-md text-[10px] font-bold transition-all border",
                                                active
                                                    ? "bg-indigo-500/20 text-indigo-200 border-indigo-500/30 shadow-sm"
                                                    : "bg-black/30 text-white/30 border-white/5 hover:bg-white/10 hover:text-white/60"
                                            )}>{style.label}</button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Advanced Tuning (Collapsible) */}
                            <details className="group">
                                <summary className="text-[10px] font-bold text-white/30 uppercase tracking-wider cursor-pointer hover:text-white/50 flex items-center gap-1 select-none list-none">
                                    <ChevronDown size={10} className="group-open:hidden" />
                                    <ChevronUp size={10} className="hidden group-open:block" />
                                    Advanced Tuning
                                </summary>
                                <div className="mt-3 space-y-3 p-3 bg-black/30 rounded-lg border border-white/5">
                                    <div className="grid grid-cols-2 gap-3">
                                        <SliderControl label="Ramp Speed" icon={Zap} value={settings.styleConfig.rampFastSpeed}
                                            min={1.5} max={4.0} step={0.1} unit="x"
                                            onChange={v => update({ styleConfig: { ...settings.styleConfig, rampFastSpeed: v } })} />
                                        <SliderControl label="Slow-Mo" icon={Clock} value={settings.styleConfig.rampSlowSpeed}
                                            min={0.1} max={0.6} step={0.05} unit="x"
                                            onChange={v => update({ styleConfig: { ...settings.styleConfig, rampSlowSpeed: v } })} />
                                        <SliderControl label="Zoom Range" icon={Video} value={settings.styleConfig.zoomRange}
                                            min={110} max={200} step={5} unit="%"
                                            onChange={v => update({ styleConfig: { ...settings.styleConfig, zoomRange: v } })} />
                                        <SliderControl label="Boom. Slices" icon={Scissors} value={settings.styleConfig.boomerangSlices}
                                            min={2} max={4} step={1} unit=""
                                            onChange={v => update({ styleConfig: { ...settings.styleConfig, boomerangSlices: v } })} />
                                    </div>
                                    <SliderControl label="Reversal Chance" icon={Sparkles} value={Math.round(settings.styleConfig.reversalChance * 100)}
                                        min={0} max={100} step={5} unit="%"
                                        onChange={v => update({ styleConfig: { ...settings.styleConfig, reversalChance: v / 100 } })} />
                                    <div className="flex gap-2">
                                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider self-center mr-2">Burst</span>
                                        {(['short', 'long'] as const).map(m => (
                                            <button key={m} onClick={() => update({ styleConfig: { ...settings.styleConfig, burstMode: m } })}
                                                className={clsx("flex-1 py-1.5 rounded-md text-[10px] font-bold border transition-all capitalize",
                                                    settings.styleConfig.burstMode === m
                                                        ? "bg-indigo-600 text-white border-indigo-500" : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10"
                                                )}>{m === 'short' ? 'Tight Cuts' : 'Breathing Room'}</button>
                                        ))}
                                    </div>
                                </div>
                            </details>
                        </>
                    )}
                </div>

                {/* Duplicate Transition Engine Removed */}

                </div>{/* end godMode disabled wrapper */}


                {/* Generate Button */}
                <div className="flex justify-end pt-4 border-t border-white/5">
                    <motion.button 
                        onClick={handleGenerate} 
                        disabled={videoCount === 0}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider text-white bg-gradient-to-r from-purple-600 to-blue-600 shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:shadow-[0_0_30px_rgba(168,85,247,0.6)] flex items-center gap-2 disabled:opacity-50 disabled:grayscale">
                        <PlayCircle size={16} /> Generate Trailer
                    </motion.button>
                </div>
            </div>
        </div>
    );
};

