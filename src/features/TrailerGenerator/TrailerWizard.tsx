import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useMediaStore } from '../../store/mediaStore';
import { usePresetUsageStore } from '../../store/presetUsageStore';
import { TrailerSettings, DEFAULT_TRAILER_SETTINGS, EditingStyleOption, DEFAULT_STYLE_CONFIG } from '../../lib/trailerGenerator';
import { Wand2, Clock, Zap, Settings2, Video, Flame, Scissors, Check, PlayCircle, Music, Upload, Play, Pause, Trash2, Loader2, Sparkles, Film, SlidersHorizontal, ChevronDown, ChevronUp, Crown, Heart, Camera, Clapperboard, Podcast, Smartphone, Monitor, Square, Globe, Dumbbell, Shuffle, ArrowLeftRight, Layers, Pin, Activity } from 'lucide-react';
import { TRANSITION_CATALOG, TransitionType, ALL_TRANSITION_TYPES } from '../../lib/transitions';
import { analyzeAudio, AudioAnalysisResult, SegmentType } from '../../lib/audioAnalysis';
import clsx from 'clsx';
import { useGodModeStore } from '../../store/godModeStore';

const TEMPLATES = [
    { id: 'social', name: 'Social Snap', desc: 'Rapid 0.1s-0.5s â€” IG/TikTok energy', icon: Zap, settings: { shortestClip: 0.1, longestClip: 0.5, allowDuplicates: true } },
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
    { id: 'snap-viral', name: 'Snap Viral', desc: 'Retention-first: snap bursts + pattern interrupts', icon: Zap,
      mix: 'every' as const, styles: ['snap-burst', 'pattern-interrupt', 'hyper-cut'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 3.5, rampSlowSpeed: 0.15, fastPortion: 0.1, slowPortion: 0.3, boomerangSlices: 4, reversalChance: 0.9, burstMode: 'short' as const } },
    { id: 'beat-locked', name: 'Beat Locked', desc: 'Pure beat-synced bounces + speed drops', icon: Music,
      mix: 'heavy' as const, styles: ['beat-bounce', 'rubber-band-speed', 'snap-burst'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 3.0, rampSlowSpeed: 0.25, fastPortion: 0.12, slowPortion: 0.35, boomerangSlices: 4, reversalChance: 0.85, burstMode: 'short' as const } },
    { id: 'whiplash-pro', name: 'Whiplash', desc: 'Extreme speed contrast: fast↔ultra-slow', icon: Flame,
      mix: 'every' as const, styles: ['rubber-band-standard', 'rubber-band-speed', 'triple-shot'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 4.0, rampSlowSpeed: 0.1, fastPortion: 0.08, slowPortion: 0.45, reversalChance: 1.0, burstMode: 'short' as const } },
    { id: 'cinematic-ramp', name: 'Cinematic Ramp', desc: 'Elegant hero slow-mo + gentle speed ramps', icon: Film,
      mix: 'light' as const, styles: ['rubber-band-standard', 'rubber-band'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 1.8, rampSlowSpeed: 0.35, fastPortion: 0.15, slowPortion: 0.5, reversalChance: 0.5, burstMode: 'long' as const } },
    { id: 'chaos-engine', name: 'Chaos Engine', desc: 'Every style at once, maximum density', icon: Sparkles,
      mix: 'every' as const, styles: ['snap-burst', 'hyper-cut', 'multi-boomerang', 'pattern-interrupt', 'triple-shot', 'bear-chaos'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 3.8, rampSlowSpeed: 0.12, fastPortion: 0.1, slowPortion: 0.25, boomerangSlices: 4, reversalChance: 1.0, burstMode: 'short' as const } },
    { id: 'pendulum-drift', name: 'Pendulum Drift', desc: 'Floating sway + gentle boomerangs', icon: ArrowLeftRight,
      mix: 'heavy' as const, styles: ['pendulum-sway', 'rubber-band', 'multi-boomerang'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 1.5, rampSlowSpeed: 0.3, fastPortion: 0.1, slowPortion: 0.45, reversalChance: 0.6, burstMode: 'long' as const } },
    { id: 'stutter-punch', name: 'Stutter Punch', desc: 'Rapid micro-boomerangs + triple-shot intercuts', icon: Scissors,
      mix: 'every' as const, styles: ['multi-boomerang', 'triple-shot', 'hyper-cut'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 3.2, rampSlowSpeed: 0.25, fastPortion: 0.12, slowPortion: 0.3, boomerangSlices: 4, reversalChance: 1.0, burstMode: 'short' as const } },
    { id: 'bear-mode', name: 'Bear Mode', desc: 'Immersive chaos — tight crops + speed variation', icon: Camera,
      mix: 'heavy' as const, styles: ['bear-chaos', 'hyper-cut', 'rubber-band-speed'] as EditingStyleOption[],
      config: { ...DEFAULT_STYLE_CONFIG, rampFastSpeed: 3.0, rampSlowSpeed: 0.2, fastPortion: 0.15, slowPortion: 0.35, reversalChance: 0.8, burstMode: 'short' as const } },
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
    { id: 'gm-gentle-flow', name: 'Gentle Flow', icon: Camera, desc: 'Soft cinematic drifts, slow pace',
      pacing: 'filmscore', style: 'cinematic-ramp', duration: 60, tier: 1 },
    { id: 'gm-wedding', name: 'Wedding Film', icon: Heart, desc: 'Slow ramps + gentle pacing',
      pacing: 'wedding', style: 'cinematic-ramp', duration: 45, tier: 1 },
    { id: 'gm-montage-mix', name: 'Montage Mix', icon: Clapperboard, desc: 'Mixed cuts, tasteful rubber-band',
      pacing: 'montage', style: 'cinematic-ramp', duration: 30, tier: 1 },
    { id: 'gm-travel-diary', name: 'Travel Diary', icon: Globe, desc: 'Dreamy pacing + warm tones',
      pacing: 'vlog', style: 'pendulum-drift', duration: 30, tier: 1 },
    { id: 'gm-golden-hour', name: 'Golden Hour', icon: Sparkles, desc: 'Sunset vibes, slow reveals',
      pacing: 'filmscore', style: 'pendulum-drift', duration: 45, tier: 1 },
    { id: 'gm-noir', name: 'Film Noir', icon: Film, desc: 'Dark drama, slow crawl zooms',
      pacing: 'filmscore', style: 'cinematic-ramp', duration: 90, tier: 1 },
    { id: 'gm-music-video', name: 'Music Video', icon: Music, desc: 'Beat-locked energy + boomerangs',
      pacing: 'social', style: 'beat-locked', duration: 30, tier: 2 },
    { id: 'gm-action-trailer', name: 'Action Trailer', icon: Flame, desc: 'Hard ramps + triple-shot energy',
      pacing: 'epic', style: 'stutter-punch', duration: 60, tier: 2 },
    { id: 'gm-instagram', name: 'Reels Banger', icon: Video, desc: 'Snappy speed drops + boomerangs',
      pacing: 'social', style: 'beat-locked', duration: 15, tier: 2 },
    { id: 'gm-hyperlapse', name: 'Hyperlapse Rush', icon: Camera, desc: 'Relentless flow + pulse drops',
      pacing: 'hyperlapse', style: 'stutter-punch', duration: 20, tier: 2 },
    { id: 'gm-gym-pump', name: 'Gym Pump', icon: Dumbbell, desc: 'Athletic ramps + beat punches',
      pacing: 'gym', style: 'stutter-punch', duration: 20, tier: 2 },
    { id: 'gm-concert', name: 'Concert Edit', icon: Music, desc: 'Beat-locked zoom + boomerangs',
      pacing: 'kinetic', style: 'beat-locked', duration: 30, tier: 2 },
    { id: 'gm-sports', name: 'Sports Hype', icon: Dumbbell, desc: 'Speed ramps + triple-shot intercuts',
      pacing: 'social', style: 'stutter-punch', duration: 15, tier: 2 },
    { id: 'gm-beat-bounce', name: 'Beat Bounce', icon: ArrowLeftRight, desc: 'Viral IG bounce — shot swap on beats',
      pacing: 'social', style: 'beat-locked', duration: 15, tier: 2 },
    { id: 'gm-tiktok', name: 'TikTok Viral', icon: Zap, desc: 'Full chaos, every effect stacked',
      pacing: 'kinetic', style: 'chaos-engine', duration: 10, tier: 3 },
    { id: 'gm-whiplash', name: 'Whiplash', icon: Flame, desc: 'Extreme speed contrast, zero mercy',
      pacing: 'kinetic', style: 'whiplash-pro', duration: 15, tier: 3 },
    { id: 'gm-stutter-storm', name: 'Stutter Storm', icon: Sparkles, desc: 'Rapid micro-boomerangs everywhere',
      pacing: 'kinetic', style: 'stutter-punch', duration: 10, tier: 3 },
    { id: 'gm-sensory-overload', name: 'Sensory Overload', icon: Zap, desc: 'All effects + hyperlapse pacing',
      pacing: 'hyperlapse', style: 'chaos-engine', duration: 15, tier: 3 },
    { id: 'gm-glitch-out', name: 'Glitch Out', icon: Flame, desc: 'Stutter + whiplash + reverse chaos',
      pacing: 'kinetic', style: 'whiplash-pro', duration: 12, tier: 3 },
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
    const { files, orientationFilter, setOrientationFilter, selectedFileIds, preloadedAudioPath, preloadedAudioName, setPreloadedAudio } = useMediaStore();
    const { incrementTemplate, incrementStyle, incrementGodMode, togglePinTemplate, togglePinStyle, togglePinGodMode, pinnedTemplates, pinnedStyles, pinnedGodModes, getTopTemplates, getTopStyles, getTopGodModes, templateUsage, styleUsage, godModeUsage } = usePresetUsageStore();

    const topTemplateIds = useMemo(() => getTopTemplates(5), [templateUsage, pinnedTemplates]);
    const topStyleIds = useMemo(() => getTopStyles(5), [styleUsage, pinnedStyles]);
    const topGodModeIds = useMemo(() => getTopGodModes(5), [godModeUsage, pinnedGodModes]);

    const [settings, setSettings] = useState<TrailerSettings>(() => {
        try {
            const saved = localStorage.getItem('mmm_trailer_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
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
    const [audioPlaying, setAudioPlaying] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const gmStore = useGodModeStore();
    const godMode = gmStore.enabled;
    const setGodMode = (v: boolean) => gmStore.setEnabled(v);
    const godModeDuration = gmStore.duration;
    const setGodModeDuration = (v: number) => gmStore.setDuration(v);
    const godModeVibe = gmStore.vibe;
    const setGodModeVibe = (v: string | null) => gmStore.setVibe(v);
    const godModeAdvanced = gmStore.advanced;
    const setGodModeAdvanced = (v: boolean) => gmStore.setAdvanced(v);
    const audioUrl = gmStore.audioUrl;
    const setAudioUrl = (v: string | null) => gmStore.setAudioGuide({ useAudioGuide: !!v || gmStore.useAudioGuide, audioUrl: v });
    const audioTrimStart = gmStore.audioTrimStart;
    const setAudioTrimStart = (v: number) => gmStore.setAudioGuide({ useAudioGuide: gmStore.useAudioGuide, audioTrimStart: v });
    const audioTrimEnd = gmStore.audioTrimEnd;
    const setAudioTrimEnd = (v: number) => gmStore.setAudioGuide({ useAudioGuide: gmStore.useAudioGuide, audioTrimEnd: v });
    const audioAnalysis = gmStore.audioAnalysis;
    const setAudioAnalysis = (v: AudioAnalysisResult | null) => gmStore.setAudioGuide({ useAudioGuide: gmStore.useAudioGuide, audioAnalysis: v });

    const audioRef = useRef<HTMLAudioElement>(null);
    const audioInputRef = useRef<HTMLInputElement>(null);
    const waveformRef = useRef<HTMLCanvasElement>(null);
    const bestSegmentCycleRef = useRef<Record<number, number>>({});

    const [isDragging, setIsDragging] = useState<'start' | 'end' | 'move' | null>(null);
    const [dragStartPos, setDragStartPos] = useState<number>(0);
    const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0);
    const [analysisToast, setAnalysisToast] = useState<boolean>(false);
    const waveformWrapperRef = useRef<HTMLDivElement>(null);

    const mountSynced = useRef(false);
    useEffect(() => {
        if (mountSynced.current) return;
        mountSynced.current = true;
        const gm = useGodModeStore.getState();
        if (gm.useAudioGuide && gm.audioUrl) {
            update({
                useAudioGuide: true, audioFile: gm.audioFile, audioUrl: gm.audioUrl,
                audioFilePath: gm.audioFilePath || undefined, audioAnalysis: gm.audioAnalysis,
                audioTrimStart: gm.audioTrimStart, audioTrimEnd: gm.audioTrimEnd,
            });
        }
        if (gm.transitionsEnabled !== undefined) {
            update({ transitionsEnabled: gm.transitionsEnabled, transitionPreset: gm.transitionPreset });
        }
        const last = gm.lastGeneratedSettings;
        if (last) {
            const VIBE_REVERSE: Record<string, string> = {
                'montage:none': 'clean', 'filmscore:cinematic': 'cinematic',
                'social:music-video': 'high-energy', 'kinetic:retention-max': 'chaos',
                'social:viral-hook': 'viral',
            };
            const pacingId = TEMPLATES.find(t => t.settings && t.settings.shortestClip === last.shortestClip && t.settings.longestClip === last.longestClip)?.id || 'custom';
            const styleId = STYLE_TEMPLATES.find(s => s.mix === last.editingStyleMix && s.styles && last.editingStyles && s.styles.length === last.editingStyles.length && s.styles.every((st: string) => last.editingStyles.includes(st as EditingStyleOption)))?.id || 'none';
            const vibeKey = `${pacingId}:${styleId}`;
            if (!gm.vibe) gmStore.setVibe(VIBE_REVERSE[vibeKey] || null);
            if (gm.selectedPresetId) gmStore.setAdvanced(true);
            update({ ...last, templates: [pacingId] });
        }
    }, []);


    const preloadConsumedRef = useRef(false);
    useEffect(() => {
        if (preloadConsumedRef.current) return;
        if (!preloadedAudioPath || settings.useAudioGuide) return;
        preloadConsumedRef.current = true;

        const url = `file://${preloadedAudioPath}`;
        setAudioUrl(url);
        update({
            audioFile: preloadedAudioName || 'Audio',
            audioUrl: url,
            audioFilePath: preloadedAudioPath,
            useAudioGuide: true,
        });

        setPreloadedAudio(null, null);
    }, [preloadedAudioPath]);

    const TRANSIENT_KEYS = new Set(['audioFile', 'audioUrl', 'audioFilePath', 'useAudioGuide', 'audioTrimStart', 'audioTrimEnd', 'audioAnalysis']);
    const update = (patch: Partial<TrailerSettings>) => setSettings(s => {
        const next = { ...s, ...patch };
        try {
            const persistable = { ...next };
            for (const key of TRANSIENT_KEYS) delete (persistable as any)[key];
            localStorage.setItem('mmm_trailer_settings', JSON.stringify(persistable));
        } catch {}
        return next;
    });

    const activePool = selectedFileIds.length > 0
        ? files.filter(f => selectedFileIds.includes(f.id))
        : files;
    const videoCount = activePool.filter(f => f.type === 'video').length;
    const audioCount = activePool.filter(f => f.type === 'audio').length;
    const hCount = activePool.filter(f => f.orientation === 'horizontal').length;
    const vCount = activePool.filter(f => f.orientation === 'vertical').length;
    const sqCount = activePool.filter(f => f.orientation === 'square').length;
    const hasMediaSelection = selectedFileIds.length > 0;

    const filteredVideoCount = orientationFilter === 'all'
        ? videoCount
        : activePool.filter(f => f.type === 'video' && f.orientation === orientationFilter).length;

    const handleAudioUpload = async () => {
        if (!window.ipcRenderer?.selectFiles) {
            console.error('[TrailerWizard] IPC not available for audio picker');
            return;
        }
        const result = await window.ipcRenderer.selectFiles('audio');
        if (!result.success || !result.files?.length) return;

        const picked = result.files[0];
        const filePath = picked.path;
        const url = `file://${filePath}`;

        if (audioUrl && audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
        setAudioFile(null);
        setAudioUrl(url);
        (window as any).__godModeAudioFilePath = filePath;
        gmStore.setAudioGuide({ useAudioGuide: true, audioFile: picked.filename, audioUrl: url, audioFilePath: filePath });
        update({ audioFile: picked.filename, audioUrl: url, audioFilePath: filePath, useAudioGuide: true });
    };

    const handleAudioLoaded = () => {
        const dur = audioRef.current?.duration || 0;
        setAudioTrimEnd(dur);
        update({ audioTrimStart: 0, audioTrimEnd: dur });
    };

    const handleRemoveAudio = () => {
        if (audioUrl && audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
        setAudioFile(null); setAudioUrl(null); setAudioAnalysis(null);
        setAudioTrimStart(0); setAudioTrimEnd(30);
        update({ audioUrl: null, audioFile: null, audioFilePath: undefined, useAudioGuide: false, audioAnalysis: null, audioTrimStart: undefined, audioTrimEnd: undefined });
    };

    const handleRandomizeBeat = async () => {
        if (!audioUrl) return;
        setIsAnalyzing(true);
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const response = await fetch(audioUrl);
            const buf = await response.arrayBuffer();
            const decoded = await ctx.decodeAudioData(buf);
            const result = await analyzeAudio(decoded, settings.beatSensitivity ?? 0.5);
            setAudioAnalysis(result);
            update({ audioAnalysis: result });
            
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

    const autoSelectBestSegment = (targetDur: number) => {
        if (!audioAnalysis || audioAnalysis.segments.length === 0) return;
        const segs = audioAnalysis.segments;
        const priority: Record<string, number> = { drop: 8, chorus: 7, buildup: 6, verse: 5, bridge: 4, intro: 3, breakdown: 2, outro: 1 };
        const scored = segs.map(s => ({
            ...s,
            score: (priority[s.type] || 1) * s.avgEnergy,
            dur: s.end - s.start,
        })).sort((a, b) => b.score - a.score);

        const cycleKey = targetDur;
        const prevIdx = bestSegmentCycleRef.current[cycleKey] ?? -1;
        const nextIdx = (prevIdx + 1) % scored.length;
        bestSegmentCycleRef.current[cycleKey] = nextIdx;

        const best = scored[nextIdx];
        if (best) {
            const segMid = (best.start + best.end) / 2;
            const halfDur = targetDur / 2;
            const start = Math.max(0, Math.min(segMid - halfDur, audioAnalysis.duration - targetDur));
            const end = Math.min(start + targetDur, audioAnalysis.duration);
            setAudioTrimStart(start);
            setAudioTrimEnd(end);
            update({ audioTrimStart: start, audioTrimEnd: end });
        }
    };

    const handleSegmentClick = (seg: { start: number; end: number }) => {
        const isIncluded = audioTrimStart <= seg.start && audioTrimEnd >= seg.end;
        if (isIncluded) {
            if (!audioAnalysis) return;
            const remaining = audioAnalysis.segments.filter(s => {
                if (s.start === seg.start && s.end === seg.end) return false;
                return audioTrimStart <= s.start && audioTrimEnd >= s.end;
            });
            if (remaining.length === 0) {
                setAudioTrimStart(0); setAudioTrimEnd(30);
                update({ audioTrimStart: 0, audioTrimEnd: 30, targetDuration: 30 });
            } else {
                const newStart = Math.min(...remaining.map(r => r.start));
                const newEnd = Math.max(...remaining.map(r => r.end));
                setAudioTrimStart(newStart); setAudioTrimEnd(newEnd);
                update({ audioTrimStart: newStart, audioTrimEnd: newEnd, targetDuration: Math.round(newEnd - newStart) });
            }
        } else {
            const newStart = Math.min(audioTrimStart, seg.start);
            const newEnd = Math.max(audioTrimEnd, seg.end);
            setAudioTrimStart(newStart); setAudioTrimEnd(newEnd);
            update({ audioTrimStart: newStart, audioTrimEnd: newEnd, targetDuration: Math.round(newEnd - newStart) });
        }
    };

    const handleGenerate = () => {
        const finalSettings: TrailerSettings = {
            ...settings,
            audioTrimStart, audioTrimEnd
        };

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

        gmStore.setAutoGenerate(finalSettings);
        onGenerate(finalSettings);
    };

    const handleTemplateSelect = (tmpl: typeof TEMPLATES[0], e?: React.MouseEvent) => {
        if (e && (e.ctrlKey || e.metaKey)) {
            let next = [...settings.templates];
            if (next.includes(tmpl.id)) {
                next = next.filter(id => id !== tmpl.id);
                if (next.length === 0) next = [tmpl.id];
            } else {
                next.push(tmpl.id);
            }
            const baseSettings = TEMPLATES.find(t => t.id === next[0])?.settings || {};
            update({ templates: next, ...baseSettings });
        } else {
            if (tmpl.settings) update({ templates: [tmpl.id], ...tmpl.settings });
            else update({ templates: ['custom'] });
        }
    };

    const VIBE_MAP: Record<string, { pacing: string; style: string; hook: 'none' | 'snap-speed' | 'pattern-interrupt' | 'speed-freeze' | 'auto'; retention: boolean; loop: boolean; texture: 'none' | 'grain' | 'vintage' | 'chromatic' | 'motion-blur'; transitionsEnabled: boolean; transitionPreset: string }> = {
        'clean': { pacing: 'montage', style: 'none', hook: 'none', retention: false, loop: false, texture: 'none', transitionsEnabled: false, transitionPreset: 'hard-cuts' },
        'cinematic': { pacing: 'filmscore', style: 'cinematic-ramp', hook: 'speed-freeze', retention: false, loop: false, texture: 'grain', transitionsEnabled: true, transitionPreset: 'cinematic' },
        'high-energy': { pacing: 'social', style: 'beat-locked', hook: 'snap-speed', retention: false, loop: false, texture: 'none', transitionsEnabled: true, transitionPreset: 'whip-pan' },
        'chaos': { pacing: 'kinetic', style: 'chaos-engine', hook: 'pattern-interrupt', retention: true, loop: true, texture: 'chromatic', transitionsEnabled: true, transitionPreset: 'viral' },
        'viral': { pacing: 'social', style: 'snap-viral', hook: 'auto', retention: true, loop: true, texture: 'none', transitionsEnabled: true, transitionPreset: 'snap-cut' },
    };

    const handleVibeGenerate = () => {
        if (!godModeVibe) return;
        const vibe = VIBE_MAP[godModeVibe];
        if (!vibe) return;
        const pacingTmpl = TEMPLATES.find(t => t.id === vibe.pacing);
        const styleTmpl = STYLE_TEMPLATES.find(t => t.id === vibe.style);
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
        gmStore.setAutoGenerate(finalSettings);
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
        gmStore.setAutoGenerate(finalSettings);
        onGenerate(finalSettings);
    };

    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto p-8 flex flex-col gap-8">
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

                <div className="bg-black/40 rounded-xl border border-white/5 p-4 relative overflow-hidden space-y-4">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 blur-[50px] pointer-events-none rounded-full" />
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Media Pool</span>
                        <div className="text-2xl font-black text-white">{videoCount} <span className="text-[10px] font-bold text-white/30 uppercase">Videos</span></div>
                        {audioCount > 0 && <div className="text-xs text-pink-400">{audioCount} audio files</div>}
                        {hasMediaSelection && (
                            <div className="text-[10px] text-purple-300 font-bold mt-1">
                                ✦ {selectedFileIds.length} selected — only these will be used
                            </div>
                        )}
                    </div>
                    {videoCount > 0 && (
                        <div className="space-y-2 pt-3 border-t border-white/5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
                                <Monitor size={12} className="text-teal-400" /> Orientation Filter
                                <span className="ml-auto text-teal-300 font-mono">{filteredVideoCount} active</span>
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
                </div>

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

                            <div className="border border-yellow-500/10 rounded-xl bg-black/20 p-4 space-y-3">
                                <div className="flex items-center gap-2">
                                    <Music size={14} className={settings.useAudioGuide ? "text-purple-400" : "text-white/40"} />
                                    <span className="text-xs font-bold text-yellow-100">Music Selection</span>
                                    {settings.useAudioGuide && <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full font-bold ml-auto">Active</span>}
                                    {audioAnalysis && <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full font-bold">{audioAnalysis.bpm} BPM</span>}
                                </div>
                                <p className="text-[9px] text-white/30">Add music before choosing a preset for beat-synced generation.</p>
                                {audioUrl && <audio ref={audioRef} src={audioUrl} onLoadedMetadata={handleAudioLoaded}
                                    onTimeUpdate={(e) => { if ((e.target as HTMLAudioElement).currentTime >= audioTrimEnd) { (e.target as HTMLAudioElement).pause(); setAudioPlaying(false); }}} />}

                                {!settings.useAudioGuide ? (
                                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                        onClick={handleAudioUpload}
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

                            <button onClick={() => setGodModeAdvanced(!godModeAdvanced)}
                                className="flex items-center gap-2 text-[9px] font-bold text-white/30 hover:text-white/50 transition-colors uppercase tracking-wider">
                                {godModeAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                {godModeAdvanced ? 'Hide' : 'Show'} Advanced Presets
                            </button>

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
                
                <div className="border border-white/5 rounded-xl bg-black/20 p-5 space-y-4">
                    <div className="flex items-center gap-2">
                        <Music size={16} className={settings.useAudioGuide ? "text-purple-400" : "text-white/40"} />
                        <span className="text-sm font-bold text-white">Beat Intelligence Engine</span>
                        {settings.useAudioGuide && <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-bold ml-auto">Active</span>}
                        {audioAnalysis && <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">{audioAnalysis.bpm} BPM ({audioAnalysis.bpmConfidence}%)</span>}
                    </div>
                    <p className="text-[10px] text-white/40">Upload audio for intelligent beat-synced editing with rhythm detection, segment mapping, and drop-aware effects.</p>
                    {audioUrl && <audio ref={audioRef} src={audioUrl} onLoadedMetadata={handleAudioLoaded}
                        onTimeUpdate={(e) => { if ((e.target as HTMLAudioElement).currentTime >= audioTrimEnd) { (e.target as HTMLAudioElement).pause(); setAudioPlaying(false); }}} />}

                    {!settings.useAudioGuide ? (
                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                            onClick={handleAudioUpload}
                            className="w-full flex justify-center items-center gap-2 py-3 border border-dashed border-white/20 rounded-lg hover:border-purple-500/50 hover:bg-purple-500/10 text-white/50 hover:text-white transition-colors text-xs font-bold">
                            <Upload size={14} /> Select Audio or Video File
                        </motion.button>
                    ) : (
                        <div className="space-y-4">
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

                            {audioAnalysis && (
                                <div ref={waveformWrapperRef} className="relative group cursor-crosshair select-none"
                                     onMouseDown={(e) => {
                                         const rect = waveformWrapperRef.current!.getBoundingClientRect();
                                         const x = e.clientX - rect.left;
                                         const time = (x / rect.width) * audioAnalysis.duration;
                                         const timeTolerance = (10 / rect.width) * audioAnalysis.duration;
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
                                    
                                    <div className="absolute top-0 bottom-0 bg-blue-500/30 border-l-2 border-r-2 border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)] pointer-events-none flex items-center justify-between"
                                         style={{ left: `${(audioTrimStart / audioAnalysis.duration) * 100}%`, width: `${((audioTrimEnd - audioTrimStart) / audioAnalysis.duration) * 100}%` }}>
                                         <div className="w-1.5 h-6 bg-white rounded-r-sm -ml-0.5 shadow-md" />
                                         <div className="w-1.5 h-6 bg-white rounded-l-sm -mr-0.5 shadow-md" />
                                    </div>

                                    <div className="absolute top-0 bottom-0 w-px bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)] pointer-events-none z-20"
                                         style={{ left: `${(audioCurrentTime / audioAnalysis.duration) * 100}%` }}>
                                         <div className="w-2 h-2 bg-red-500 rounded-full -ml-1 -top-1 absolute" />
                                    </div>
                                </div>
                            )}

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
                                        Selected range: {audioTrimStart.toFixed(1)}s â€“ {audioTrimEnd.toFixed(1)}s ({(audioTrimEnd - audioTrimStart).toFixed(1)}s)
                                    </div>
                                </div>
                            )}

                            <SliderControl label="Beat Sensitivity" icon={Zap} value={settings.beatSensitivity || 0.5}
                                min={0} max={1} step={0.1} unit="" onChange={(v) => update({ beatSensitivity: v })} />
                        </div>
                    )}
                </div>


                <div className={clsx(godMode && "opacity-30 pointer-events-none select-none")}>

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

                <div className="space-y-4 border border-white/5 rounded-xl bg-black/20 p-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
                        <Zap size={12} className="text-orange-400" /> Viral Intelligence
                    </label>

                    <div className="space-y-1.5">
                        <span className="text-[9px] font-bold text-white/50 uppercase tracking-wider">Hook (First 3s)</span>
                        <div className="grid grid-cols-5 gap-1.5">
                            {([
                                { id: 'none' as const, label: 'None' },
                                { id: 'auto' as const, label: 'Auto' },
                                { id: 'snap-speed' as const, label: 'Snap Speed' },
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

                {godMode ? (
                    <div className="border border-yellow-500/10 rounded-xl bg-black/10 p-3 text-center">
                        <span className="text-[9px] text-yellow-300/50 font-bold uppercase">âš¡ Transitions moved to God Mode panel above</span>
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
                        <div className="flex gap-2 mb-1">
                            <button onClick={() => update({ transitionMode: 'random' })}
                                className={clsx("flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all border",
                                    (settings.transitionMode || 'random') !== 'single'
                                        ? "bg-pink-600/20 border-pink-500 text-pink-200"
                                        : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10")}>
                                Preset Groups
                            </button>
                            <button onClick={() => update({ transitionMode: 'single' })}
                                className={clsx("flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all border",
                                    settings.transitionMode === 'single'
                                        ? "bg-pink-600/20 border-pink-500 text-pink-200"
                                        : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10")}>
                                Pick Individual
                            </button>
                        </div>

                        {(settings.transitionMode || 'random') !== 'single' ? (
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
                        ) : (
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-[9px] text-white/40 font-bold uppercase tracking-wider">Select transitions to use</span>
                                    <div className="flex gap-1.5">
                                        <button onClick={() => update({ transitionTypes: ALL_TRANSITION_TYPES })}
                                            className="text-[8px] text-pink-300 hover:text-pink-200 transition-colors font-bold uppercase">All</button>
                                        <span className="text-white/20">|</span>
                                        <button onClick={() => update({ transitionTypes: [] })}
                                            className="text-[8px] text-white/40 hover:text-white/60 transition-colors font-bold uppercase">None</button>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {TRANSITION_CATALOG.map(t => {
                                        const selected = (settings.transitionTypes || []).includes(t.id);
                                        return (
                                            <button key={t.id}
                                                onClick={() => {
                                                    const current = settings.transitionTypes || [];
                                                    const next = selected
                                                        ? current.filter(x => x !== t.id)
                                                        : [...current, t.id];
                                                    update({ transitionTypes: next as TransitionType[] });
                                                }}
                                                title={t.desc}
                                                className={clsx("px-2.5 py-1.5 rounded-lg text-[9px] font-bold transition-all border",
                                                    selected
                                                        ? "bg-pink-600/20 border-pink-500/60 text-pink-200 shadow-[0_0_8px_rgba(236,72,153,0.15)]"
                                                        : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white/60")}>
                                                {t.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                {(settings.transitionTypes || []).length > 0 && (
                                    <div className="text-[9px] text-pink-300/60 font-bold">
                                        {(settings.transitionTypes || []).length} of {TRANSITION_CATALOG.length} selected
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                            <SliderControl label="Simultaneous FX" icon={Layers} value={settings.maxSimultaneousTransitions || 1}
                                min={1} max={5} step={1} unit="" onChange={(v) => update({ maxSimultaneousTransitions: v })} />
                            <SliderControl label="Overlap Delay" icon={Clock} value={settings.simultaneousTransitionDelay || 0.2}
                                min={0} max={1} step={0.1} unit="s" onChange={(v) => update({ simultaneousTransitionDelay: v })} />
                        </div>
                    </div>
                </div>
                )}

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

                <div className="grid sm:grid-cols-2 gap-8 bg-black/20 p-5 rounded-xl border border-white/5 mt-6">
                    <div className="space-y-4">
                        <SliderControl label="Target Duration" icon={Clock} value={settings.targetDuration}
                            min={5} max={180} step={5} unit="s" onChange={(v) => {
                                update({ targetDuration: v });
                                if (settings.useAudioGuide && audioAnalysis) {
                                    autoSelectBestSegment(v);
                                }
                            }} />
                        <div className="flex flex-wrap gap-2">
                            {settings.useAudioGuide && audioAnalysis && (
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
                                </>
                            )}
                            {[
                                { label: 'Social Snap', dur: 10, shortest: 0.1, longest: 0.5, desc: 'IG/TikTok energy' },
                                { label: 'Kinetic Blitz', dur: 15, shortest: 0.08, longest: 0.25, desc: 'Machine-gun micro-cuts' },
                                { label: 'Dynamic Flow', dur: 30, shortest: 0.2, longest: 2.0, desc: 'Builds from slow to fast' },
                                { label: 'Cinematic Hold', dur: 45, shortest: 0.5, longest: 2.5, desc: 'Dramatic breathing room' },
                            ].map(preset => (
                                <button key={preset.label} onClick={() => update({
                                    targetDuration: preset.dur,
                                    shortestClip: preset.shortest,
                                    longestClip: preset.longest,
                                })}
                                    className={clsx("flex-1 min-w-[100px] p-2 rounded-lg text-left transition-all border",
                                        settings.targetDuration === preset.dur
                                            ? "bg-primary/20 text-white border-primary shadow-lg"
                                            : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10")}>
                                    <div className={clsx("text-[10px] font-black uppercase", settings.targetDuration === preset.dur ? "text-purple-200" : "text-white/70")}>{preset.label}</div>
                                    <div className="text-[9px] text-white/30">{preset.dur}s • {preset.desc}</div>
                                </button>
                            ))}
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

                <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
                        <Clock size={12} className="text-blue-400" /> Cinematic Speed
                    </label>
                    <div className="grid grid-cols-5 gap-2">
                        {[
                            { id: 'none', label: 'Normal (1.0x)', desc: 'No speed modification' },
                            { id: 'dramatic', label: 'Dramatic Build', desc: 'Start slow, accelerate' },
                            { id: 'mixed-all', label: 'Mixed Action', desc: 'Random mix of slow/fast' },
                            { id: 'pulse', label: 'Pulse', desc: 'Alternating slow-fast' },
                            { id: 'random', label: 'Random', desc: 'Surprise speed policy' },
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

                <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
                        <Activity size={12} className="text-emerald-400" /> Cut Rhythm
                    </label>
                    <div className="grid grid-cols-5 gap-2">
                        {[
                            { id: 'accelerando', label: 'Accelerando', desc: 'Cuts get shorter over time' },
                            { id: 'breathing', label: 'Breathing Room', desc: '4 fast cuts + 1 breather' },
                            { id: 'cascade', label: 'Cascade', desc: 'Long → rapid descent → landing' },
                            { id: 'climax-arc', label: 'Climax Arc', desc: 'Slow → fastest at mid → slow' },
                            { id: 'random', label: 'Random', desc: 'Surprise rhythm each clip' },
                        ].map(opt => (
                            <button key={opt.id} onClick={() => update({ rhythmPattern: opt.id as any })}
                                className={clsx("p-2.5 rounded-lg border text-left transition-all",
                                    settings.rhythmPattern === opt.id
                                        ? "bg-emerald-600/20 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                                        : "bg-white/5 border-white/5 hover:bg-white/10")}>
                                <div className={clsx("text-[10px] font-black uppercase", settings.rhythmPattern === opt.id ? "text-emerald-200" : "text-white/70")}>{opt.label}</div>
                                <div className="text-[9px] text-white/30">{opt.desc}</div>
                            </button>
                        ))}
                    </div>
                </div>

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
                                        { id: 'rubber-band' as EditingStyleOption, label: 'Zoom Bounce', color: 'cyan' },
                                        { id: 'rubber-band-speed' as EditingStyleOption, label: 'Zoom + Speed', color: 'amber' },
                                        { id: 'multi-boomerang' as EditingStyleOption, label: 'Boomerang', color: 'emerald' },
                                        { id: 'triple-shot' as EditingStyleOption, label: 'Triple-Shot', color: 'rose' },
                                        { id: 'snap-burst' as EditingStyleOption, label: 'Snap Burst', color: 'orange' },
                                        { id: 'pendulum-sway' as EditingStyleOption, label: 'Pendulum Sway', color: 'sky' },
                                        { id: 'hyper-cut' as EditingStyleOption, label: 'Hyper Cut', color: 'red' },
                                        { id: 'bear-chaos' as EditingStyleOption, label: 'Bear Chaos', color: 'yellow' },
                                        { id: 'pattern-interrupt' as EditingStyleOption, label: 'Pattern Interrupt', color: 'pink' },
                                        { id: 'beat-bounce' as EditingStyleOption, label: 'Beat Bounce', color: 'violet' },
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

