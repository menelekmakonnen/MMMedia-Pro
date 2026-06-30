import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMediaStore } from '../../store/mediaStore';
import { useClipStore } from '../../store/clipStore';
import { TrailerSettings, DEFAULT_TRAILER_SETTINGS, generateTrailerSequence } from '../../lib/trailerGenerator';
import { Wand2, Clock, Zap, Video, Scissors, PlayCircle, Music, Upload, Play, Pause, Trash2, Loader2, Sparkles, Smartphone, Monitor, Square, ArrowLeftRight, Layers, ChevronDown, Eye, Palette, Repeat, Search, Activity, FolderOpen, History, ChevronRight, AlertTriangle, PictureInPicture2, RotateCw, Flame, Grid3X3, MoveHorizontal } from 'lucide-react';
import { analyzeAudio, AudioAnalysisResult, SegmentType as _SegmentType } from '../../lib/audioAnalysis';
import { TRANSITION_CATEGORIES, TRANSITION_META } from '../../lib/transitions';
import type { TransitionType, SpeedCurvePreset, ShakeType, ShakePolicy, BeatDropIntensity, TransitionStyle, BoomerangPresetId, ZoomSpeed, EffectApplyPolicy, Clip } from '../../types';
import { TrailerSmartPanel } from './EditSmartPanel';
import { SmartChoicesStrip } from './SmartChoicesStrip';
import { runSmartAnalysis } from '../../lib/smartEngine';
import { SpeedCurveVisualizer } from './SpeedCurveVisualizer';
import { ShakePreview } from './ShakePreview';
// BeatSensitivityGraph and InteractiveWaveform superseded by UnifiedBeatVisualizer
import { UnifiedBeatVisualizer } from './UnifiedBeatVisualizer';
import type { UnifiedBeatVisualizerHandle } from './UnifiedBeatVisualizer';
import { usePresetUsageStore } from '../../store/presetUsageStore';
import { useAudioAnalysisCache } from '../../store/audioAnalysisCache';
import { useExportSettingsStore } from '../../store/exportSettingsStore';
import { TransitionCard } from './TransitionCard';
import { DEFAULT_COLOR_GRADING } from '../../lib/colorGrading';
import { VisualFXCard } from './VisualFXCard';
import { NarrationIntelligence } from './NarrationIntelligence';
import { useNarrationStore } from '../../store/narrationStore';
import { analyzeNarration } from '../../lib/narrationAnalysis';
import type { MergeStrategy } from '../../lib/intelligenceMerger';

import clsx from 'clsx';
import { EditLogicSidebar } from './EditLogicSidebar';
import { useEditLogicStore } from '../../store/editLogicStore';
import { extractDecisions, type ClipDecision } from '../../types/ClipDecision';

import { useProjectStore } from '../../store/projectStore';
import { getSubcategories } from '../../lib/generatorModeConfig';
import { useSavedEditsStore, SavedEdit } from '../../store/savedEditsStore';
import { useViewStore } from '../../store/viewStore';
import { useGodModeStore } from '../../store/godModeStore';

import { getPresetById, getPresetsByCategory, resolveSequencePresetIds } from './sequencePresets';
import type { PresetCategory } from './sequencePresets';
import { PreviewBubble } from '../../components/PreviewBubble';
import { DurationPresetPreview, SpeedCurvePreview, BoomerangPreview, ZoomValuePreview, ZoomSpeedPreview, BeatDropPreview, ShakePolicyPreview, ShakeTypePreview, DoubleExposurePreview, MotionBlurPreview, GlowPreview, VibrationFlashPreview, SlowmoPreview, RgbSplitPreview, HueCyclePreview, VhsPreview, DoubleExposurePolicyPreview, MotionBlurPolicyPreview, GlowPolicyPreview, VibrationFlashPolicyPreview, SlowmoPolicyPreview, RgbSplitPolicyPreview, HueCyclePolicyPreview, VhsPolicyPreview, DoubleExposureShapePreview } from '../../components/EffectPreviews';
import { DOUBLE_EXPOSURE_GRADIENTS, gradientToCss } from '../../lib/doubleExposureGradients';
import { EditorialAssist } from '../SequenceView/EditorialAssist';

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

// ── Advanced edit-effect application policy control ──────────────────────────
const EFFECT_POLICIES: { id: EffectApplyPolicy; label: string }[] = [
    { id: 'off', label: 'Off' },
    { id: 'sparingly', label: 'Sparingly' },
    { id: 'per-beat', label: 'Per Beat' },
    { id: 'every-clip', label: 'Every Clip' },
];

/** Canonical ids for the advanced trending effects (used for recommendations). */
export const ADV_EFFECT_LABELS: Record<string, string> = {
    doubleExposure: 'Double Exposure',
    tripleExposure: 'Triple Exposure',
    motionBlur: 'Motion Blur',
    glow: 'Glow',
    vibrationFlash: 'Vibration Flash',
    smoothSlowmo: 'Optical-Flow Slow-Mo',
    rgbSplit: 'RGB Split',
    hueCycle: 'Hue Cycle',
    vhs: 'VHS',
    pip: 'Picture-in-Picture',
    spin: 'Spin',
    filmBurn: 'Film Burn',
    pixelize: 'Pixelize',
    whipBlur: 'Whip Blur',
};

/** One-click quick configuration applied when a recommended chip is tapped. */
const QUICK_EFFECT_PATCH: Record<string, Partial<TrailerSettings>> = {
    doubleExposure: { doubleExposurePolicy: 'sparingly' },
    tripleExposure: { tripleExposurePolicy: 'sparingly' },
    motionBlur: { motionBlurPolicy: 'per-beat' },
    glow: { glowPolicy: 'sparingly' },
    vibrationFlash: { vibrationFlashPolicy: 'sparingly' },
    smoothSlowmo: { smoothSlowmoPolicy: 'sparingly' },
    rgbSplit: { rgbSplitPolicy: 'sparingly' },
    hueCycle: { hueCyclePolicy: 'sparingly' },
    vhs: { vhsPolicy: 'sparingly' },
    pip: { pipPolicy: 'sparingly' },
    spin: { spinPolicy: 'sparingly' },
    filmBurn: { filmBurnPolicy: 'sparingly' },
    pixelize: { pixelizePolicy: 'sparingly' },
    whipBlur: { whipBlurPolicy: 'sparingly' },
};

const POLICY_DESCS: Record<string, string> = {
    'off': 'Effect disabled',
    'sparingly': 'Applied only on high-impact moments',
    'per-beat': 'Triggered on every detected beat',
    'every-clip': 'Applied to every single clip',
};

const EffectPolicyControl: React.FC<{
    label: string;
    policy: EffectApplyPolicy;
    onPolicy: (p: EffectApplyPolicy) => void;
    /** Render a policy-specific preview for this effect. If omitted, shows label only. */
    renderPreview?: (policy: EffectApplyPolicy) => React.ReactNode;
    /** When true, children (sub-options) are always visible even when policy is 'off'. */
    alwaysShowChildren?: boolean;
    children?: React.ReactNode;
}> = ({ label, policy, onPolicy, renderPreview, alwaysShowChildren, children }) => (
    <div className="space-y-1.5">
        {label && <span className="text-[9px] font-bold uppercase text-white/30 tracking-wider">{label}</span>}
        <div className="flex flex-wrap gap-1.5">
            {EFFECT_POLICIES.map(opt => (
                <PreviewBubble key={opt.id}
                    preview={renderPreview ? renderPreview(opt.id) : null}
                    description={POLICY_DESCS[opt.id]}
                    width={renderPreview ? 200 : 160}>
                    <button onClick={() => onPolicy(opt.id)}
                        className={clsx("px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition-all border",
                            (policy ?? 'off') === opt.id
                                ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-200 shadow-[0_0_8px_rgba(99,102,241,0.15)]"
                                : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10")}>
                        {opt.label}
                    </button>
                </PreviewBubble>
            ))}
        </div>
        {(alwaysShowChildren || (policy ?? 'off') !== 'off') && children && <div className="space-y-3 pl-1">{children}</div>}
    </div>
);

/** Dual-handle range slider for min/max controls. */
const DualRangeSlider: React.FC<{
    label: string; icon: React.ElementType;
    min: number; max: number; step: number;
    value: [number, number];
    onChange: (v: [number, number]) => void;
    unit?: string; disabled?: boolean;
}> = ({ label, icon: Icon, min, max, step, value, onChange, unit = '', disabled }) => (
    <div className={clsx("flex flex-col gap-2", disabled && "opacity-50 pointer-events-none")}>
        <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-white/70">
            <span className="flex items-center gap-1.5"><Icon size={12} /> {label}</span>
            <span className="text-primary font-mono">{value[0].toFixed(1)}{unit} — {value[1].toFixed(1)}{unit}</span>
        </div>
        <div className="relative h-6 flex items-center">
            <div className="absolute inset-x-0 h-1.5 bg-white/10 rounded-full" />
            <div className="absolute h-1.5 bg-purple-500/50 rounded-full" style={{ left: `${((value[0] - min) / (max - min)) * 100}%`, right: `${100 - ((value[1] - min) / (max - min)) * 100}%` }} />
            <input type="range" min={min} max={max} step={step} value={value[0]}
                onChange={(e) => { const v = parseFloat(e.target.value); if (v <= value[1]) onChange([v, value[1]]); }}
                className="pointer-events-none absolute w-full appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-purple-200 [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
            <input type="range" min={min} max={max} step={step} value={value[1]}
                onChange={(e) => { const v = parseFloat(e.target.value); if (v >= value[0]) onChange([value[0], v]); }}
                className="pointer-events-none absolute w-full appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-400 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-200 [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
        </div>
        <div className="flex justify-between text-[10px] text-white/30 font-mono">
            <span>{min}{unit}</span><span>{max}{unit}</span>
        </div>
    </div>
);

/** Collapsible section wrapper matching the existing glassmorphism style. */
const CollapsibleSection: React.FC<{
    title: string; icon: React.ElementType; iconColor?: string;
    isOpen: boolean; onToggle: () => void;
    badge?: string; badgeColor?: string;
    children: React.ReactNode;
}> = ({ title, icon: Icon, iconColor = 'text-purple-400', isOpen, onToggle, badge, badgeColor = 'bg-purple-500/20 text-purple-300', children }) => (
    <div className="border border-white/5 rounded-xl bg-black/20 overflow-hidden">
        <button onClick={onToggle} className="w-full flex items-center gap-2 p-4 hover:bg-white/5 transition-colors">
            <Icon size={14} className={iconColor} />
            <span className="text-sm font-bold text-white">{title}</span>
            {badge && <span className={clsx("text-[10px] px-2 py-0.5 rounded-full font-bold ml-auto mr-2", badgeColor)}>{badge}</span>}
            <ChevronDown size={14} className={clsx("text-white/40 transition-transform ml-auto", isOpen && "rotate-180")} />
        </button>
        <AnimatePresence initial={false}>
            {isOpen && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="overflow-hidden"
                >
                    <div className="px-4 pb-4 space-y-4">
                        {children}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    </div>
);

const PRESET_CATEGORY_UI: Record<PresetCategory, { label: string; icon: React.ElementType; active: string; idle: string }> = {
    structure: { label: 'Sequence Structure', icon: Layers, active: 'border-cyan-400/50 bg-cyan-500/15 text-cyan-100', idle: 'hover:border-cyan-500/25 hover:bg-cyan-500/[0.06]' },
    pacing: { label: 'Pacing Pattern', icon: Clock, active: 'border-blue-400/50 bg-blue-500/15 text-blue-100', idle: 'hover:border-blue-500/25 hover:bg-blue-500/[0.06]' },
    audio: { label: 'Audio Edit Pattern', icon: Music, active: 'border-purple-400/50 bg-purple-500/15 text-purple-100', idle: 'hover:border-purple-500/25 hover:bg-purple-500/[0.06]' },
    effects: { label: 'Effects Pattern', icon: Sparkles, active: 'border-amber-400/50 bg-amber-500/15 text-amber-100', idle: 'hover:border-amber-500/25 hover:bg-amber-500/[0.06]' },
    advanced: { label: 'Advanced Edit Pattern', icon: Activity, active: 'border-rose-400/50 bg-rose-500/15 text-rose-100', idle: 'hover:border-rose-500/25 hover:bg-rose-500/[0.06]' },
};

const SequencePresetPicker: React.FC<{
    category: PresetCategory;
    settings: TrailerSettings;
    update: (patch: Partial<TrailerSettings>) => void;
    stackable?: boolean;
    embedded?: boolean;
}> = ({ category, settings, update, stackable = false, embedded = false }) => {
    const meta = PRESET_CATEGORY_UI[category];
    const Icon = meta.icon;
    const presets = getPresetsByCategory(category);
    const selectedIds = resolveSequencePresetIds(settings);
    const selected = presets.filter(preset => selectedIds.includes(preset.id));

    const togglePreset = (presetId: string) => {
        const active = selectedIds.includes(presetId);
        let next: string[];
        if (active) {
            next = selectedIds.filter(id => id !== presetId);
        } else if (stackable) {
            next = [...selectedIds, presetId];
        } else {
            next = [
                ...selectedIds.filter(id => getPresetById(id)?.category !== category),
                presetId,
            ];
        }
        update({ sequencePresetIds: next, sequencePresetId: undefined });
    };

    return (
        <div className={clsx('space-y-2', !embedded && 'pt-3 border-t border-white/5')}>
            {!embedded && <div className="flex items-center gap-2">
                <Icon size={12} className="text-white/50" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white/45">{meta.label}</span>
                <span className="ml-auto text-[9px] text-white/25">{stackable ? 'Combine any patterns' : 'One pattern at a time'}</span>
            </div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5" role="group" aria-label={meta.label}>
                {presets.map(preset => {
                    const active = selectedIds.includes(preset.id);
                    return (
                        <button
                            key={preset.id}
                            type="button"
                            aria-pressed={active}
                            title={preset.description}
                            onClick={() => togglePreset(preset.id)}
                            className={clsx(
                                'min-h-[52px] flex items-start gap-2 p-2 rounded-md border text-left transition-colors',
                                active ? meta.active : `border-white/5 bg-white/[0.025] text-white/60 ${meta.idle}`,
                            )}
                        >
                            <span className={clsx('mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border flex items-center justify-center', active ? 'border-current' : 'border-white/20')}>
                                {active && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                            </span>
                            <span className="min-w-0">
                                <span className="block text-[10px] font-bold leading-tight">{preset.name}</span>
                                <span className="block mt-0.5 text-[9px] leading-tight text-white/35 line-clamp-2">{preset.description}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
            {!embedded && selected.length > 0 && (
                <div className="text-[9px] text-white/35">
                    Active: <span className="font-bold text-white/65">{selected.map(preset => preset.name).join(' + ')}</span>. Click any active pattern to remove it.
                </div>
            )}
        </div>
    );
};

interface WizardProps {
    onGenerate: (settings: TrailerSettings) => void;
    onModeChange?: (mode: string) => void;
    activeMode?: string;
}

export const EditWizard: React.FC<WizardProps> = ({ onGenerate, onModeChange, activeMode }) => {
    // ── Scoped store selectors (prevents re-renders from unrelated store changes) ──
    const files = useMediaStore(s => s.files);
    const orientationFilter = useMediaStore(s => s.orientationFilter);
    const setOrientationFilter = useMediaStore(s => s.setOrientationFilter);
    const selectedFileIds = useMediaStore(s => s.selectedFileIds);
    const preloadedAudioPath = useMediaStore(s => s.preloadedAudioPath);
    const preloadedAudioName = useMediaStore(s => s.preloadedAudioName);
    const setPreloadedAudio = useMediaStore(s => s.setPreloadedAudio);
    const isExporting = useExportSettingsStore(s => s.isExporting);

    const audioCacheGetCached = useAudioAnalysisCache(s => s.getCached);
    const audioCacheStore = useAudioAnalysisCache(s => s.store);

    const narrationFile = useNarrationStore(s => s.narrationFile);
    const narrationName = useNarrationStore(s => s.narrationName);
    const narrationUrl = useNarrationStore(s => s.narrationUrl);
    const narrationTranscript = useNarrationStore(s => s.transcript);
    const narrationAnalysis = useNarrationStore(s => s.analysis);
    const narrationIsAnalyzing = useNarrationStore(s => s.isAnalyzing);

    // Sync activeMode from router with local generator mode
    useEffect(() => {
        if (activeMode && activeMode !== settings.generatorMode) {
            update({ generatorMode: activeMode as any });
        }
    }, [activeMode]);

    // Auto-kick the Smart Engine as soon as the Edit Generator opens with video
    // sources present, so its choices are ready (and challengeable) without a
    // manual "analyze" click. runSmartAnalysis no-ops if already running/cached.
    useEffect(() => {
        if (files.some((f) => f.type === 'video')) void runSmartAnalysis().catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Subcategory multi-select state ──
    const [activeSubcats, setActiveSubcats] = useState<string[]>([]);

    // Sync subcategories to settings whenever they change
    useEffect(() => {
        update({ activeSubcategories: activeSubcats } as any);
    }, [activeSubcats]);

    const toggleSubcat = (id: string) => {
        setActiveSubcats(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
    };

    // Previous projects dropdown state
    const [showProjectsDropdown, setShowProjectsDropdown] = useState(false);
    const savedEdits = useSavedEditsStore(s => s.savedEdits);

    const [mergeStrategy, setMergeStrategy] = useState<MergeStrategy>('balanced');



    const [settings, setSettings] = useState<TrailerSettings>(() => {
        try {
            const saved = localStorage.getItem('mmm_trailer_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                delete parsed.audioAnalysis;
                delete parsed.seed; // never restore a pinned seed (forces fresh variations)
                const restored = { ...DEFAULT_TRAILER_SETTINGS, ...parsed } as TrailerSettings;
                // Pacing is now expressed directly through duration/rhythm controls,
                // so remove legacy hidden pacing post-processors from saved settings.
                restored.sequencePresetIds = resolveSequencePresetIds(restored)
                    .filter(id => getPresetById(id)?.category !== 'pacing');
                restored.sequencePresetId = undefined;
                return restored;
            }
        } catch {}
        return { ...DEFAULT_TRAILER_SETTINGS };
    });

    const [_audioFile, setAudioFile] = useState<File | null>(null);
    const [audioPlaying, setAudioPlaying] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [audioTrimStart, setAudioTrimStart] = useState<number>(0);
    const [audioTrimEnd, setAudioTrimEnd] = useState<number>(30);
    const [audioAnalysis, setAudioAnalysis] = useState<AudioAnalysisResult | null>(null);

    const audioRef = useRef<HTMLAudioElement>(null);
    const _audioInputRef = useRef<HTMLInputElement>(null);
    const waveformRef = useRef<HTMLCanvasElement>(null);
    const bestSegmentCycleRef = useRef<Record<number, number>>({});

    const [audioHistory, setAudioHistory] = useState<Array<{name: string; path: string}>>(() => {
        try {
            const saved = localStorage.getItem('mmm_audio_history');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
    const [showAudioHistory, setShowAudioHistory] = useState(false);
    const audioHistoryRef = useRef<HTMLDivElement>(null);

    const [isDragging, setIsDragging] = useState<'start' | 'end' | 'move' | null>(null);
    const [focusedLayer, setFocusedLayer] = useState<'waveform' | 'beat-sensitivity' | 'shake' | 'beat-drop' | 'vibration-flash' | null>(null);
    const [dragStartPos, setDragStartPos] = useState<number>(0);
    // ── Perf: audioCurrentTime as ref (not state) to avoid 60fps re-renders ──
    const audioCurrentTimeRef = useRef<number>(0);
    const [audioDisplayTime, setAudioDisplayTime] = useState<number>(0);
    const bieVizRef = useRef<UnifiedBeatVisualizerHandle>(null);
    const displayTimeRafRef = useRef<number>(0);
    const [analysisToast, setAnalysisToast] = useState<boolean>(false);
    const waveformWrapperRef = useRef<HTMLDivElement>(null);

    const [customSpeedEnabled, setCustomSpeedEnabled] = useState(false);

    // Collapsible section states
    const [effectsOpen, setEffectsOpen] = useState(true);
    const [transitionsOpen, setTransitionsOpen] = useState(true);
    const [colorOpen, setColorOpen] = useState(true);

    // ── Edit Generator colour: only Vibrance, Desaturation, Noir. Each maps to
    //    the Sequence-page colour-grade model (ColorGrading), stored as the
    //    sequence-wide globalColorGrading so the render never invents colours. ──
    const colorState = {
        v: { on: !!(settings as any).colorVibranceEnabled, amt: (settings as any).colorVibranceAmt ?? 0.5 },
        d: { on: !!(settings as any).colorDesatEnabled, amt: (settings as any).colorDesatAmt ?? 0.5 },
        n: { on: !!(settings as any).colorNoirEnabled, amt: (settings as any).colorNoirAmt ?? 0.5 },
    };
    const buildColorGrade = (st: typeof colorState) => {
        if (!st.v.on && !st.d.on && !st.n.on) return undefined;
        const g: any = { ...DEFAULT_COLOR_GRADING };
        if (st.v.on) g.vibrance = 1 + st.v.amt;                  // 1 → 2 (more vibrant)
        if (st.d.on) g.saturation = Math.max(0, 1 - st.d.amt);   // 1 → 0 (desaturate)
        if (st.n.on) { g.saturation = 0; g.contrast = 1 + st.n.amt * 0.6; } // B&W + contrast
        return g;
    };
    const setColor = (patch: Partial<typeof colorState>) => {
        const st = {
            v: { ...colorState.v, ...(patch.v || {}) },
            d: { ...colorState.d, ...(patch.d || {}) },
            n: { ...colorState.n, ...(patch.n || {}) },
        };
        update({
            colorVibranceEnabled: st.v.on, colorVibranceAmt: st.v.amt,
            colorDesatEnabled: st.d.on, colorDesatAmt: st.d.amt,
            colorNoirEnabled: st.n.on, colorNoirAmt: st.n.amt,
            globalColorGrading: buildColorGrade(st),
        } as any);
    };
    const COLOR_OPTS = [
        { k: 'v' as const, label: 'Vibrance', desc: 'Boost colour intensity' },
        { k: 'd' as const, label: 'Desaturation', desc: 'Pull colour toward grey' },
        { k: 'n' as const, label: 'Noir', desc: 'High-contrast black & white' },
    ];

    // Restore persisted audio URL on mount
    const audioRestoredRef = useRef(false);
    useEffect(() => {
        if (audioRestoredRef.current) return;
        if (settings.audioUrl && settings.useAudioGuide && !audioUrl) {
            audioRestoredRef.current = true;
            setAudioUrl(settings.audioUrl);
            setAudioTrimStart(settings.audioTrimStart ?? 0);
            setAudioTrimEnd(settings.audioTrimEnd ?? 30);
        }
    }, []);

    useEffect(() => {
        if (!showAudioHistory) return;
        const handler = (e: MouseEvent) => {
            if (audioHistoryRef.current && !audioHistoryRef.current.contains(e.target as Node)) setShowAudioHistory(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showAudioHistory]);




    const preloadConsumedRef = useRef(false);
    useEffect(() => {
        if (preloadConsumedRef.current) return;
        if (!preloadedAudioPath || settings.useAudioGuide) return;
        preloadConsumedRef.current = true;

        const url = `file://${preloadedAudioPath}`;
        setAudioUrl(url);
        setAudioTrimStart(0);
        setAudioTrimEnd(30);
        update({
            audioFile: preloadedAudioName || 'Audio',
            audioUrl: url,
            audioFilePath: preloadedAudioPath,
            useAudioGuide: true,
            audioTrimStart: 0,
            audioTrimEnd: 30,
        });
        addToAudioHistory(preloadedAudioName || 'Audio', preloadedAudioPath);

        // Auto-load cached analysis so graph appears without clicking Analyze
        const sensitivity = settings.beatSensitivity ?? 0.5;
        const cached = audioCacheGetCached(preloadedAudioPath, sensitivity);
        if (cached) {
            setAudioAnalysis(cached);
            update({ audioAnalysis: cached });
        }

        setPreloadedAudio(null, null);
    }, [preloadedAudioPath]);

    // 'seed' is intentionally transient: persisting it would pin every future
    // generation to the same selection. A fresh seed is minted on each Generate.
    const TRANSIENT_KEYS = new Set(['audioAnalysis', 'narrationAnalysis', 'seed']);
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
        update({ audioFile: picked.filename, audioUrl: url, audioFilePath: filePath, useAudioGuide: true });
        addToAudioHistory(picked.filename, filePath);

        // Auto-load cached analysis so graph appears without clicking Analyze
        const sensitivity = settings.beatSensitivity ?? 0.5;
        const cached = audioCacheGetCached(filePath, sensitivity);
        if (cached) {
            setAudioAnalysis(cached);
            update({ audioAnalysis: cached });
        }
    };

    const handleAudioLoaded = () => {
        const dur = audioRef.current?.duration || 0;
        // Don't overwrite trim if we restored from persisted settings
        if (audioRestoredRef.current && settings.audioTrimStart != null && settings.audioTrimEnd != null && settings.audioTrimEnd > 0) {
            // Already restored — only update duration ceiling
            audioRestoredRef.current = false; // consume the flag
            return;
        }
        setAudioTrimEnd(dur);
        update({ audioTrimStart: 0, audioTrimEnd: dur });
    };

    const addToAudioHistory = (name: string, path: string) => {
        setAudioHistory(prev => {
            const filtered = prev.filter(h => h.path !== path);
            const next = [{ name, path }, ...filtered].slice(0, 10);
            try { localStorage.setItem('mmm_audio_history', JSON.stringify(next)); } catch {}
            return next;
        });
    };

    const handleRemoveAudio = () => {
        if (audioUrl && audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
        setAudioFile(null); setAudioUrl(null); setAudioAnalysis(null);
        setAudioTrimStart(0); setAudioTrimEnd(30);
        update({ audioUrl: null, audioFile: null, audioFilePath: undefined, useAudioGuide: false, audioAnalysis: null, audioTrimStart: undefined, audioTrimEnd: undefined });
        // Purge any stale auto-generated audio clips from the timeline so they
        // don't accidentally survive into the next generation or export.
        const clipState = useClipStore.getState();
        const cleaned = clipState.clips.filter(
            (c: Clip) => !(c.type === 'audio' && c.origin === 'auto' && c.track === 101)
        );
        if (cleaned.length !== clipState.clips.length) {
            clipState.setClips(cleaned);
        }
        // Also clear GodMode store audio state so it doesn't persist
        try {
            const gmState = useGodModeStore.getState();
            if (gmState.audioUrl || gmState.useAudioGuide) {
                gmState.setAudioGuide({ useAudioGuide: false, audioFile: null, audioUrl: null, audioAnalysis: null, audioTrimStart: 0, audioTrimEnd: 30, audioFilePath: undefined });
            }
        } catch {}
    };

    const handleRandomizeBeat = async (forceRescan = false) => {
        if (!audioUrl) return;

        // --- Cache lookup (skip heavy DSP if we already have results) ---
        const cacheKey = preloadedAudioPath || settings.audioFilePath || settings.audioUrl || '';
        const sensitivity = settings.beatSensitivity ?? 0.5;
        if (!forceRescan && cacheKey) {
            const cached = audioCacheGetCached(cacheKey, sensitivity);
            if (cached) {
                console.log('[EditWizard] Using cached audio analysis for:', cacheKey);
                setAudioAnalysis(cached);
                update({ audioAnalysis: cached });

                const dropSeg = cached.segments.find(s => s.type === 'drop');
                if (dropSeg) {
                    const start = Math.max(0, dropSeg.start - (Math.random() * 2));
                    const end = Math.min(start + settings.targetDuration, cached.duration);
                    setAudioTrimStart(start);
                    setAudioTrimEnd(end);
                    update({ audioTrimStart: start, audioTrimEnd: end });
                }

                setAnalysisToast(true);
                setTimeout(() => setAnalysisToast(false), 2000);
                return;
            }
        }

        setIsAnalyzing(true);
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            let arrayBuffer: ArrayBuffer;
            if (audioUrl.startsWith('file:')) {
                // file:// URLs can't be fetched in Electron renderer — use IPC
                // Handle all variants: file:///C:/..., file://C:\..., file:/C:\...
                const filePath = decodeURIComponent(audioUrl.replace(/^file:\/{0,3}/, ''));
                const result = await window.ipcRenderer.readFileBuffer(filePath);
                if (!result?.success || !result.buffer) {
                    throw new Error(`Failed to read audio file: ${result?.error || 'unknown error'}`);
                }
                // IPC structured clone delivers Node Buffer as Uint8Array — get its underlying ArrayBuffer
                const raw = result.buffer;
                arrayBuffer = raw.buffer instanceof ArrayBuffer
                    ? raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
                    : new Uint8Array(raw).buffer;
            } else {
                const response = await fetch(audioUrl);
                arrayBuffer = await response.arrayBuffer();
            }
            const decoded = await ctx.decodeAudioData(arrayBuffer);
            const result = await analyzeAudio(decoded, sensitivity);
            setAudioAnalysis(result);
            update({ audioAnalysis: result });

            // --- Store in cache for future loads ---
            if (cacheKey) {
                audioCacheStore(cacheKey, result, sensitivity);
            }
            
            const dropSeg = result.segments.find(s => s.type === 'drop');
            if (dropSeg) {
                const start = Math.max(0, dropSeg.start - (Math.random() * 2));
                const end = Math.min(start + settings.targetDuration, result.duration);
                setAudioTrimStart(start);
                setAudioTrimEnd(end);
                update({ audioTrimStart: start, audioTrimEnd: end });
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
        audioCurrentTimeRef.current = audioTrimStart;
        setAudioDisplayTime(audioTrimStart);
        bieVizRef.current?.updatePlayhead(audioTrimStart);
        setAudioPlaying(false);
    };

    useEffect(() => {
        if (!audioRef.current || !audioPlaying) return;
        let raf: number;
        let lastDisplayUpdate = 0;
        const loop = () => {
            if (audioRef.current) {
                const ct = audioRef.current.currentTime;
                audioCurrentTimeRef.current = ct;
                // Update BIE playhead via imperative ref (no React re-render)
                bieVizRef.current?.updatePlayhead(ct);
                // Throttle display time update to ~4fps for the time label
                const now = performance.now();
                if (now - lastDisplayUpdate > 250) {
                    setAudioDisplayTime(ct);
                    lastDisplayUpdate = now;
                }
                if (ct >= audioTrimEnd) {
                    audioRef.current.pause();
                    audioRef.current.currentTime = audioTrimStart;
                    audioCurrentTimeRef.current = audioTrimStart;
                    setAudioDisplayTime(audioTrimStart);
                    bieVizRef.current?.updatePlayhead(audioTrimStart);
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

    // ── Waveform Canvas Drawing ──────────────────────────────────────────────
    useEffect(() => {
        const canvas = waveformRef.current;
        const wrapper = waveformWrapperRef.current;
        if (!canvas || !wrapper || !audioAnalysis) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // HiDPI setup — match canvas bitmap size to physical pixels
        const dpr = window.devicePixelRatio || 1;
        const rect = wrapper.getBoundingClientRect();
        const w = rect.width;
        const h = 80; // matches the h-20 (5rem = 80px) CSS height
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        ctx.scale(dpr, dpr);

        const { waveformData, beats, energyContour, duration } = audioAnalysis;

        // ── Background ──────────────────────────────────────────────────────
        ctx.clearRect(0, 0, w, h);
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, 'rgba(10, 5, 20, 0.9)');
        bgGrad.addColorStop(1, 'rgba(5, 2, 15, 0.95)');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // ── 1. Waveform amplitude bars ──────────────────────────────────────
        if (waveformData && waveformData.length > 0) {
            const barCount = waveformData.length;
            const barWidth = w / barCount;
            const barGap = Math.max(0.5, barWidth * 0.15);

            for (let i = 0; i < barCount; i++) {
                const amp = waveformData[i];
                const barH = Math.max(1, amp * (h * 0.85));
                const x = i * barWidth;
                const y = h - barH;

                // Gradient fill: dark purple at base → bright purple at peaks
                const grad = ctx.createLinearGradient(x, h, x, y);
                grad.addColorStop(0, 'rgba(88, 28, 135, 0.6)');   // dark purple base
                grad.addColorStop(0.5, 'rgba(147, 51, 234, 0.8)'); // mid purple
                grad.addColorStop(1, 'rgba(192, 132, 252, 1)');    // bright purple peak

                ctx.fillStyle = grad;
                ctx.fillRect(x + barGap / 2, y, Math.max(0.5, barWidth - barGap), barH);
            }

            // Glow pass — redraw with blur for bloom effect
            ctx.save();
            ctx.globalAlpha = 0.3;
            ctx.shadowBlur = 3;
            ctx.shadowColor = 'rgba(168, 85, 247, 0.6)';
            for (let i = 0; i < barCount; i++) {
                const amp = waveformData[i];
                const barH = Math.max(1, amp * (h * 0.85));
                const x = i * barWidth;
                const y = h - barH;
                ctx.fillStyle = 'rgba(168, 85, 247, 0.6)';
                ctx.fillRect(x + barGap / 2, y, Math.max(0.5, barWidth - barGap), barH);
            }
            ctx.restore();
        }

        // ── 2. Beat markers ────────────────────────────────────────────────
        if (beats && beats.length > 0) {
            const beatColors: Record<string, string> = {
                kick: '#ef4444',
                snare: '#f97316',
                hat: '#06b6d4',
                bass: '#a855f7',
                transient: '#ffffff',
            };

            for (const beat of beats) {
                const x = (beat.time / duration) * w;
                const color = beatColors[beat.type] || '#ffffff';
                const lineH = Math.max(8, beat.energy * h * 0.7);

                // Vertical line
                ctx.beginPath();
                ctx.moveTo(x, h);
                ctx.lineTo(x, h - lineH);
                ctx.strokeStyle = color;
                ctx.globalAlpha = 0.55;
                ctx.lineWidth = 1.2;
                ctx.stroke();

                // Glow behind the line
                ctx.beginPath();
                ctx.moveTo(x, h);
                ctx.lineTo(x, h - lineH);
                ctx.strokeStyle = color;
                ctx.globalAlpha = 0.15;
                ctx.lineWidth = 4;
                ctx.stroke();

                // Dot at the top
                ctx.beginPath();
                ctx.arc(x, h - lineH, 2, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.8;
                ctx.fill();

                ctx.globalAlpha = 1;
            }
        }

        // ── 3. Energy contour line ─────────────────────────────────────────
        if (energyContour && energyContour.length > 1) {
            ctx.save();
            ctx.globalAlpha = 0.45;
            ctx.strokeStyle = 'rgba(52, 211, 153, 0.8)'; // emerald-400
            ctx.lineWidth = 1.5;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            ctx.beginPath();
            for (let i = 0; i < energyContour.length; i++) {
                const pt = energyContour[i];
                const x = (pt.time / duration) * w;
                const y = h - (pt.energy * h * 0.8);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Subtle glow for the energy line
            ctx.globalAlpha = 0.15;
            ctx.lineWidth = 5;
            ctx.shadowBlur = 2;
            ctx.shadowColor = 'rgba(52, 211, 153, 0.8)';
            ctx.beginPath();
            for (let i = 0; i < energyContour.length; i++) {
                const pt = energyContour[i];
                const x = (pt.time / duration) * w;
                const y = h - (pt.energy * h * 0.8);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.restore();
        }

        // ── 4. Trim region dimming ─────────────────────────────────────────
        //    Dim areas outside the active trim region with a dark overlay
        const trimLeftX = (audioTrimStart / duration) * w;
        const trimRightX = (audioTrimEnd / duration) * w;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        // Left dimmed region
        if (trimLeftX > 0) {
            ctx.fillRect(0, 0, trimLeftX, h);
        }
        // Right dimmed region
        if (trimRightX < w) {
            ctx.fillRect(trimRightX, 0, w - trimRightX, h);
        }

        // Subtle bright edge glow at trim boundaries
        const edgeGlow = ctx.createLinearGradient(trimLeftX - 4, 0, trimLeftX + 4, 0);
        edgeGlow.addColorStop(0, 'rgba(96, 165, 250, 0)');
        edgeGlow.addColorStop(0.5, 'rgba(96, 165, 250, 0.15)');
        edgeGlow.addColorStop(1, 'rgba(96, 165, 250, 0)');
        ctx.fillStyle = edgeGlow;
        ctx.fillRect(trimLeftX - 4, 0, 8, h);

        const edgeGlowR = ctx.createLinearGradient(trimRightX - 4, 0, trimRightX + 4, 0);
        edgeGlowR.addColorStop(0, 'rgba(96, 165, 250, 0)');
        edgeGlowR.addColorStop(0.5, 'rgba(96, 165, 250, 0.15)');
        edgeGlowR.addColorStop(1, 'rgba(96, 165, 250, 0)');
        ctx.fillStyle = edgeGlowR;
        ctx.fillRect(trimRightX - 4, 0, 8, h);

    }, [audioAnalysis, audioTrimStart, audioTrimEnd]);

    const autoSelectBestSegment = (targetDur: number) => {
        if (!audioAnalysis || audioAnalysis.segments.length === 0) return;
        const segs = audioAnalysis.segments;
        const dur = audioAnalysis.duration;
        const beats = audioAnalysis.beats || [];

        // ── REBALANCED PRIORITIES ──
        // Choruses are the catchiest, most recognizable part of a song → #1.
        // Drops are exciting but can be chaotic without melody → #2.
        // Buildups create anticipation (great lead-ins) → #3.
        // Verses/bridges carry melody and narrative → solid mid-tier.
        // Intros can be atmospheric but are often sparse → lower.
        // Outros are wind-downs → lowest.
        const priority: Record<string, number> = {
            chorus: 10, drop: 9, buildup: 8, bridge: 7,
            verse: 6, breakdown: 5, intro: 4, outro: 2,
        };

        // ── HELPER: Count how many segments a time window covers ──
        const countCoveredTypes = (start: number, end: number): Set<string> => {
            const types = new Set<string>();
            for (const s of segs) {
                // Segment overlaps with [start, end] if it starts before end AND ends after start
                if (s.start < end && s.end > start) types.add(s.type);
            }
            return types;
        };

        // ── HELPER: Score beat alignment (does the start/end land on a beat?) ──
        const beatAlignScore = (time: number): number => {
            if (beats.length === 0) return 0;
            let minDist = Infinity;
            for (const b of beats) {
                const d = Math.abs(b.time - time);
                if (d < minDist) minDist = d;
                if (d > 2) break; // beats are sorted, no need to check further
            }
            // +2 if within 0.1s of a beat, tapering to 0 at 0.5s
            return minDist < 0.1 ? 2 : minDist < 0.3 ? 1 : minDist < 0.5 ? 0.5 : 0;
        };

        // ── HELPER: Compute dynamic range within a window ──
        const windowDynamicRange = (start: number, end: number): number => {
            let minE = 1, maxE = 0;
            for (const s of segs) {
                if (s.start < end && s.end > start) {
                    if (s.avgEnergy < minE) minE = s.avgEnergy;
                    if (s.avgEnergy > maxE) maxE = s.avgEnergy;
                }
            }
            return maxE - minE; // 0 to 1 — higher = more dynamic
        };

        // ── GENERATE CANDIDATES ──
        const candidates: { start: number; score: number; label: string }[] = [];
        segs.forEach((sg, i) => {
            const prev = segs[i - 1];
            const next = segs[i + 1];
            const rise = prev ? Math.max(0, sg.avgEnergy - prev.avgEnergy) : 0;
            const base = (priority[sg.type] || 1) * (0.5 + sg.avgEnergy)
                       + (sg.peakEnergy || 0) * 1.5
                       + rise * 2;

            // A) Section onset — the natural starting point
            candidates.push({ start: sg.start, score: base * 1.0, label: `${sg.type}@start` });

            // B) Lead-in: start ~2s early for anticipation
            if (['drop', 'chorus', 'buildup'].includes(sg.type) && sg.start > 2) {
                candidates.push({ start: sg.start - 2, score: base * 0.95, label: `${sg.type}@lead-in` });
            }

            // C) Cross-boundary: BOOSTED — musical journeys are the best segments
            if (next && sg.type !== 'outro') {
                const boundary = sg.end;
                const crossStart = Math.max(0, boundary - targetDur * 0.4);
                const nextBase = (priority[next.type] || 1) * (0.5 + (next.avgEnergy || 0));
                const crossScore = (base + nextBase) / 2;
                // Boost cross-boundary by 10% — these capture transitions
                candidates.push({ start: crossStart, score: crossScore * 1.1, label: `${sg.type}→${next.type}` });
            }

            // D) Mid-section entry for long sections
            const segLen = sg.end - sg.start;
            if (segLen > targetDur * 1.2) {
                candidates.push({ start: (sg.start + sg.end) / 2 - targetDur / 4, score: base * 0.85, label: `${sg.type}@mid` });
            }

            // E) Late entry
            if (segLen > targetDur * 0.8) {
                const lateStart = Math.max(sg.start, sg.end - targetDur * 0.8);
                candidates.push({ start: lateStart, score: base * 0.80, label: `${sg.type}@late` });
            }

            // F) Verse/bridge with offset for variety
            if (['verse', 'bridge', 'breakdown'].includes(sg.type) && segLen > 4) {
                const jittered = sg.start + Math.min(segLen * 0.3, 3);
                candidates.push({ start: jittered, score: base * 0.75, label: `${sg.type}@offset` });
            }
        });

        // G) "Golden section" candidates — ~60-75% of the song is typically
        // where the climax or chorus reprise sits in pop/R&B structures
        const goldenStart = dur * 0.6;
        const goldenEnd = dur * 0.75;
        if (goldenEnd - goldenStart >= targetDur * 0.5) {
            // Find the highest-energy segment in the golden zone
            const goldenSegs = segs.filter(s => s.start >= goldenStart * 0.9 && s.start <= goldenEnd);
            if (goldenSegs.length > 0) {
                const best = goldenSegs.reduce((a, b) => (priority[a.type] || 1) * a.avgEnergy > (priority[b.type] || 1) * b.avgEnergy ? a : b);
                const goldenScore = (priority[best.type] || 1) * (0.5 + best.avgEnergy) + best.peakEnergy * 1.5;
                candidates.push({ start: best.start, score: goldenScore * 1.05, label: `golden@${best.type}` });
            }
        }

        // ── SCORE, FILTER, SORT ──
        const maxStart = Math.max(0, dur - targetDur);
        const lastStart = audioTrimStart;
        const usable = candidates
            .map(c => {
                const clamped = Math.max(0, Math.min(c.start, maxStart));
                const windowEnd = Math.min(clamped + targetDur, dur);

                // Window coverage bonus: more segment types = more musical variety
                const covered = countCoveredTypes(clamped, windowEnd);
                const varietyBonus = (covered.size - 1) * 2.5; // +2.5 per additional type

                // Beat alignment: prefer landing on beats
                const beatStart = beatAlignScore(clamped);
                const beatEnd = beatAlignScore(windowEnd);

                // Dynamic range: windows with contrast are more engaging
                const dynRange = windowDynamicRange(clamped, windowEnd) * 3;

                // Novelty: multiplicative boost for distant candidates (up to 1.4x)
                const dist = Math.abs(clamped - lastStart);
                const noveltyMult = 1 + Math.min(dist / dur, 0.5) * 0.8; // 1.0 to 1.4

                const finalScore = (c.score + varietyBonus + beatStart + beatEnd + dynRange) * noveltyMult;
                return { ...c, start: clamped, score: finalScore };
            })
            .filter((c, i, arr) => arr.findIndex(o => Math.abs(o.start - c.start) < 0.5) === i)
            .sort((a, b) => b.score - a.score);
        if (usable.length === 0) return;

        // Rotate through top 15 candidates for wide variety
        const top = usable.slice(0, Math.min(usable.length, 15));
        const cycleKey = targetDur;
        const idx = ((bestSegmentCycleRef.current[cycleKey] ?? -1) + 1) % top.length;
        bestSegmentCycleRef.current[cycleKey] = idx;
        const start = top[idx].start;
        const end = Math.min(start + targetDur, dur);
        setAudioTrimStart(start);
        setAudioTrimEnd(end);
        update({ audioTrimStart: start, audioTrimEnd: end });
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

    // Effect-usage recommendations (most-used effects surface as quick-config chips).
    const recordEffectStack = usePresetUsageStore(s => s.recordEffectStack);
    const effectUsage = usePresetUsageStore(s => s.effectUsage);
    const recommendedEffects = React.useMemo(
        () => Object.entries(effectUsage)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([id]) => id)
            .filter(id => ADV_EFFECT_LABELS[id]),
        [effectUsage],
    );

    const handleNarrationUpload = async (file: File) => {
        const url = URL.createObjectURL(file);
        useNarrationStore.getState().setNarrationFile(file.name, file.name);
        useNarrationStore.getState().setNarrationUrl(url);
    };

    const handleNarrationAnalyze = async () => {
        if (!narrationUrl) return;
        useNarrationStore.getState().setAnalyzing(true);
        try {
            const response = await fetch(narrationUrl);
            const arrayBuffer = await response.arrayBuffer();
            const audioCtx = new AudioContext();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            const result = await analyzeNarration(audioBuffer, narrationTranscript ?? undefined);
            useNarrationStore.getState().setAnalysis(result);
        } catch (err) {
            console.error('[EditWizard] Narration analysis failed:', err);
        } finally {
            useNarrationStore.getState().setAnalyzing(false);
        }
    };

    const handleNarrationRemove = () => {
        useNarrationStore.getState().clear();
    };

    const handleTranscriptChange = (text: string) => {
        useNarrationStore.getState().setTranscript(text);
    };

    const handleGenerate = () => {
        const finalSettings: TrailerSettings = {
            ...settings,
            audioTrimStart, audioTrimEnd,
            narrationFile: narrationFile,
            narrationUrl: narrationUrl,
            narrationAnalysis: narrationAnalysis,
            transcript: narrationTranscript,
            mergeStrategy: mergeStrategy,
        } as any;

        // Record which advanced effects were used together for future suggestions.
        const usedEffects: string[] = [];
        if ((settings.doubleExposurePolicy ?? 'off') !== 'off') usedEffects.push('doubleExposure');
        if ((settings.tripleExposurePolicy ?? 'off') !== 'off') usedEffects.push('tripleExposure');
        if ((settings.motionBlurPolicy ?? 'off') !== 'off') usedEffects.push('motionBlur');
        if ((settings.glowPolicy ?? 'off') !== 'off') usedEffects.push('glow');
        if ((settings.vibrationFlashPolicy ?? 'off') !== 'off') usedEffects.push('vibrationFlash');
        if ((settings.smoothSlowmoPolicy ?? 'off') !== 'off') usedEffects.push('smoothSlowmo');
        if (usedEffects.length > 0) recordEffectStack(usedEffects);

        onGenerate(finalSettings);
    };

    // ── Edit Logic Sidebar: debounced preview generation ─────────────────
    const sidebarVisible = useEditLogicStore(s => s.sidebarVisible);
    const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fps = useProjectStore(s => s.settings?.fps) || 30;

    // Pool for preview (same logic as EditRouter's pool)
    const previewPool = useMemo(() => {
        const pool = selectedFileIds.length > 0
            ? files.filter(f => selectedFileIds.includes(f.id))
            : files;
        return pool.filter(f => f.type === 'video');
    }, [files, selectedFileIds]);

    // Debounced preview: regenerate decisions after settings change
    // First run is instant (0ms), subsequent runs debounce at 400ms
    const hasGeneratedOnceRef = useRef(false);
    useEffect(() => {
        if (previewPool.length === 0) {
            useEditLogicStore.getState().setDecisions([]);
            return;
        }

        if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
        useEditLogicStore.getState().setGenerating(true);

        const delay = hasGeneratedOnceRef.current ? 400 : 0;
        previewTimerRef.current = setTimeout(() => {
            let decisions: ClipDecision[] = [];
            try {
                const previewClips = generateTrailerSequence(previewPool, {
                    ...settings,
                    fps,
                    targetDuration: settings.targetDuration || 30,
                });
                decisions = extractDecisions(previewClips, fps);
            } catch (err) {
                console.warn('[EditWizard] Preview generation failed, building fallback:', err);
            }

            // Fallback: if generator failed or produced nothing, build
            // decisions directly from the pool so the sidebar is never empty
            if (decisions.length === 0 && previewPool.length > 0) {
                const targetSec = settings.targetDuration || 30;
                const clipDur = Math.max(0.3, Math.min(targetSec / previewPool.length, settings.longestClip || 2));
                const txTypes = Array.isArray(settings.transitionTypes) && settings.transitionTypes.length > 0
                    ? settings.transitionTypes : ['fade'];
                decisions = previewPool.map((file, i) => ({
                    clipId: file.id,
                    sourceFilename: file.filename || file.path?.split(/[/\\]/).pop() || `Clip ${i + 1}`,
                    sourcePath: file.path || '',
                    durationSec: Math.round(clipDur * 100) / 100,
                    trimRange: [0, Math.min(clipDur, file.duration || clipDur)] as [number, number],
                    transitionType: i < previewPool.length - 1 ? txTypes[i % txTypes.length] : null,
                    transitionDurationMs: settings.transitionDurationMs || 300,
                    effects: [],
                    speed: 1,
                    reason: 'pool-order',
                    order: i,
                }));
            }

            useEditLogicStore.getState().setDecisions(decisions);
            hasGeneratedOnceRef.current = true;
        }, delay);

        return () => {
            if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        settings.targetDuration, settings.shortestClip, settings.longestClip,
        settings.transitionTypes, settings.transitionDurationMs, settings.transitionStyle,
        settings.slowmoPolicy, settings.speedCurvePreset,
        settings.doubleExposurePolicy, settings.motionBlurPolicy, settings.glowPolicy,
        settings.vibrationFlashPolicy, settings.rgbSplitPolicy,
        settings.beatDropImpact, settings.shakePolicy,
        settings.generatorMode, settings.activeSubcategories,
        settings.boomerangFrequency, settings.zoomEnabled,
        previewPool.length, fps,
    ]);

    return (
        <div className="w-full h-full flex">
        {/* Main settings panel */}
        <div className={clsx('flex-1 min-w-0 overflow-y-auto custom-scrollbar', sidebarVisible && 'mr-0')}>
            <div className="max-w-4xl mx-auto p-8 flex flex-col gap-8">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg shadow-lg">
                        <Wand2 size={20} className="text-white drop-shadow-md" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                            Edit Engine <span className="text-[10px] uppercase bg-white/10 px-1.5 py-0.5 rounded text-purple-300">Beta</span>
                        </h2>
                        <p className="text-xs text-white/50">Procedurally generate rapid-cut sequences from your media library.</p>
                    </div>
                </div>

                {/* ── Generator Mode (top selector) ── */}
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-purple-600/15 via-black/30 to-blue-600/15 p-4 shadow-[0_0_30px_rgba(124,58,237,0.15)]">
                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-purple-500/20 blur-[60px] pointer-events-none rounded-full" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Generator Mode</span>
                    <div className="flex flex-nowrap gap-1.5 mt-2 overflow-x-auto">
                        {([
                            { m: 'trailer' as const, label: 'Trailer', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/><line x1="7" y1="4" x2="7" y2="20" stroke="currentColor" strokeWidth="1" opacity="0.5"/><line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" strokeWidth="1.5"/><line x1="17" y1="4" x2="17" y2="20" stroke="currentColor" strokeWidth="1" opacity="0.5"/><polygon points="10,9 10,15 14,12" fill="currentColor" opacity="0.7"/></svg> },
                            { m: 'music-video' as const, label: 'Music Video', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 12h2l2-4 2 8 2-6 2 4 2-2h2l2-3 2 6h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="18" cy="16" r="2" stroke="currentColor" strokeWidth="1.5"/><line x1="20" y1="8" x2="20" y2="16" stroke="currentColor" strokeWidth="1.5"/></svg> },
                            { m: 'social-media' as const, label: 'Social Media', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="6" y="2" width="12" height="20" rx="2" stroke="currentColor" strokeWidth="1.5"/><polygon points="10,9 10,15 15,12" fill="currentColor" opacity="0.7"/><path d="M17 6l2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/></svg> },
                            { m: 'bts' as const, label: 'BTS', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="2" y="9" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M17 13l4-2.5v7L17 15" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><circle cx="9" cy="14.5" r="2.5" stroke="currentColor" strokeWidth="1" opacity="0.4"/></svg> },
                        ]).map(({ m, label, icon }) => (
                            <button key={m} onClick={() => { update({ generatorMode: m }); onModeChange?.(m); setActiveSubcats([]); }}
                                title={label}
                                className={clsx("px-3 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider border transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap",
                                    (settings.generatorMode ?? 'trailer') === m
                                        ? "bg-gradient-to-br from-purple-600/40 to-blue-600/40 border-primary/50 text-white shadow-[0_0_18px_rgba(168,85,247,0.35)]"
                                        : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10")}>
                                <span className="shrink-0 opacity-80">{icon}</span>
                                <span className="hidden min-[900px]:inline">{label}</span>
                            </button>
                        ))}
                    </div>

                    {/* ── Subcategory pills (shown for ALL modes) ── */}
                    {(() => {
                        const currentMode = settings.generatorMode ?? 'trailer';
                        const subs = getSubcategories(currentMode);
                        if (subs.length === 0) return null;
                        return (
                            <div className="mt-3 pt-3 border-t border-white/5">
                                <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/30 mb-1.5 block">
                                    Subcategory — stacks with mode
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                    {subs.map(sub => {
                                        const isActive = activeSubcats.includes(sub.id);
                                        return (
                                            <button
                                                key={sub.id}
                                                onClick={() => toggleSubcat(sub.id)}
                                                title={sub.summary}
                                                className={clsx(
                                                    "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border transition-all",
                                                    isActive
                                                        ? "bg-purple-600/25 border-purple-500/40 text-purple-200 shadow-[0_0_8px_rgba(168,85,247,0.2)]"
                                                        : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:text-white/60"
                                                )}
                                            >
                                                {sub.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })()}

                    {/* 30° rule (shot diversity) — triple toggle: off / partial / all */}
                    <div className="flex items-center gap-2 pt-3 border-t border-white/5 mt-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">30° Rule</span>
                        <div className="flex rounded-lg overflow-hidden border border-white/10">
                            {(['off', 'partial', 'all'] as const).map((m) => {
                                const cur = ((settings as any).shotDiversityMode as 'off' | 'partial' | 'all' | undefined)
                                    ?? ((settings as any).shotDiversityEnabled ? 'all' : 'off');
                                return (
                                    <button key={m} onClick={() => update({ shotDiversityMode: m, shotDiversityEnabled: m !== 'off' } as any)}
                                        className={clsx('px-3 py-1 text-[10px] font-bold uppercase transition-colors',
                                            cur === m ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10')}>
                                        {m}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>


                {/* ── Editorial Intelligence (moved from Sequence page) ── */}
                <div className="rounded-xl border border-white/5 bg-black/30 overflow-hidden">
                    <EditorialAssist />
                </div>

                <div className="bg-black/40 rounded-xl border border-white/5 p-4 relative overflow-hidden space-y-4">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 blur-[50px] pointer-events-none rounded-full" />
                    <div className="flex items-start justify-between gap-4">
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

                        {/* ── Quick-load: folder + previous projects ── */}
                        <div className="flex items-center gap-1.5 shrink-0 relative">
                            {videoCount === 0 && (
                                <button
                                    onClick={async () => {
                                        try {
                                            const w = window as any;
                                            if (w.electronAPI?.selectFolder) {
                                                const folderPath = await w.electronAPI.selectFolder();
                                                if (folderPath) {
                                                    // Load files into import and auto-select all
                                                    if (w.electronAPI.loadMediaFromFolder) {
                                                        await w.electronAPI.loadMediaFromFolder(folderPath);
                                                    }
                                                }
                                            } else {
                                                // Web fallback: trigger file input
                                                const input = document.createElement('input');
                                                input.type = 'file';
                                                input.webkitdirectory = true;
                                                input.multiple = true;
                                                input.accept = 'video/*,audio/*';
                                                input.onchange = () => {
                                                    if (input.files && input.files.length > 0) {
                                                        const mediaStore = useMediaStore.getState();
                                                        mediaStore.addFiles(Array.from(input.files) as any);
                                                    }
                                                };
                                                input.click();
                                            }
                                        } catch (e) {
                                            console.warn('[EditWizard] Folder select failed:', e);
                                        }
                                    }}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase border border-purple-500/30 bg-purple-600/20 text-purple-200 hover:bg-purple-600/30 transition-all"
                                >
                                    <FolderOpen size={14} />
                                    Load Media
                                </button>
                            )}

                            <div className="relative">
                                <button
                                    onClick={() => setShowProjectsDropdown(!showProjectsDropdown)}
                                    title="Load from previous project"
                                    className={clsx(
                                        "flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[10px] font-bold uppercase border transition-all",
                                        showProjectsDropdown
                                            ? "border-amber-500/40 bg-amber-600/20 text-amber-200"
                                            : "border-white/10 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60"
                                    )}
                                >
                                    <History size={13} />
                                    <span className="hidden min-[700px]:inline">Projects</span>
                                    <ChevronDown size={10} className={clsx("transition-transform", showProjectsDropdown && "rotate-180")} />
                                </button>

                                {showProjectsDropdown && (
                                    <div className="absolute right-0 top-full mt-1 w-72 max-h-80 overflow-y-auto bg-[#0c0c18] border border-white/10 rounded-xl shadow-2xl z-50 custom-scrollbar">
                                        {savedEdits.length === 0 ? (
                                            <div className="p-4 text-center text-white/30 text-xs">No saved projects yet</div>
                                        ) : (
                                            savedEdits.slice(0, 20).map((edit: SavedEdit) => (
                                                <button
                                                    key={edit.id}
                                                    onClick={() => {
                                                        // Load clips from saved edit into the import + generator
                                                        const mediaStore = useMediaStore.getState();
                                                        // Restore source folders if available
                                                        if (edit.sourceFolders && edit.sourceFolders.length > 0) {
                                                            const w = window as any;
                                                            if (w.electronAPI?.loadMediaFromFolder) {
                                                                edit.sourceFolders.forEach((f: string) => w.electronAPI.loadMediaFromFolder(f));
                                                            }
                                                        }
                                                        // Restore audio if available
                                                        if (edit.audioFilePath) {
                                                            mediaStore.setPreloadedAudio(edit.audioFilePath, edit.audioFileName || 'Audio');
                                                        }
                                                        // Restore settings if available
                                                        if (edit.settingsSnapshot) {
                                                            Object.entries(edit.settingsSnapshot).forEach(([k, v]) => {
                                                                update({ [k]: v } as any);
                                                            });
                                                        }
                                                        // Restore clips into the timeline — this is the key missing step
                                                        if (edit.clips && edit.clips.length > 0) {
                                                            useClipStore.getState().setClips(edit.clips);
                                                            // Navigate to the Sequence tab to show the restored timeline
                                                            useViewStore.getState().setActiveTab('sequence');
                                                        }
                                                        setShowProjectsDropdown(false);
                                                        useSavedEditsStore.getState().updateEditLastOpened(edit.id);
                                                    }}
                                                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors border-b border-white/5 last:border-b-0 text-left"
                                                >
                                                    {/* Thumbnail — uses <video> since thumbnailPath is a video file */}
                                                    <div className="w-12 h-8 rounded bg-gradient-to-br from-purple-900/40 to-blue-900/40 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                                                        {edit.thumbnailPath ? (
                                                            <video
                                                                src={`file://${edit.thumbnailPath}`}
                                                                preload="metadata"
                                                                muted
                                                                className="w-full h-full object-cover rounded"
                                                                onLoadedData={(e) => {
                                                                    // Seek to 1s for a meaningful poster frame
                                                                    const v = e.target as HTMLVideoElement;
                                                                    v.currentTime = Math.min(1, v.duration * 0.1);
                                                                }}
                                                            />
                                                        ) : (
                                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.3"/><polygon points="10,9 10,15 14,12" fill="currentColor" opacity="0.3"/></svg>
                                                        )}
                                                    </div>
                                                    {/* Info */}
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-[11px] font-bold text-white/80 truncate">{edit.name}</div>
                                                        <div className="text-[9px] text-white/30">
                                                            {edit.clipCount} clips · {Math.round(edit.duration)}s
                                                            {edit.godModeVibe && <span className="ml-1 text-purple-400">✦ {edit.godModeVibe}</span>}
                                                        </div>
                                                    </div>
                                                    <ChevronRight size={12} className="text-white/20 shrink-0" />
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
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

                    {/* Edit Structure — compact icon-based clip ordering */}
                    {videoCount > 0 && (
                        <div className="space-y-1.5 pt-3 border-t border-white/5">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Edit Structure</span>
                            <div className="flex gap-1.5">
                                {([
                                    { id: 'none', label: 'Default', desc: 'Engine decides the best clip order',
                                      icon: <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2"/><circle cx="10" cy="10" r="2" fill="currentColor"/></svg> },
                                    { id: 'sequential', label: 'Sequential', desc: 'Clips in chronological / name order',
                                      icon: <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10h12M13 7l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> },
                                    { id: 'sequential-randomized', label: 'Seq Shuffle', desc: 'Chronological clips, shuffled segments within each',
                                      icon: <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10h5M11 10h5M13 7l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M8 7v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="1.5 1.5"/></svg> },
                                    { id: 'randomized-sequential', label: 'Shuf Keep', desc: 'Shuffled clip order, segments stay in source order',
                                      icon: <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 7h4M4 13h4M12 7h4M12 13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M8 7l4 6M8 13l4-6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5"/></svg> },
                                    { id: 'randomize', label: 'Random', desc: 'Fully random — clips and segments interleaved',
                                      icon: <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 7h3l6 6h3M4 13h3l6-6h3M15 5l2 2-2 2M15 11l2 2-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> },
                                ]).map(o => (
                                    <PreviewBubble key={o.id}
                                        preview={
                                            <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <div style={{ color: (settings.clipOrderMode ?? 'none') === o.id ? '#a78bfa' : 'rgba(255,255,255,0.5)', transform: 'scale(2)' }}>{o.icon}</div>
                                            </div>
                                        }
                                        description={o.desc}
                                        width={180}>
                                        <button onClick={() => update({ clipOrderMode: o.id as any })}
                                            className={clsx("flex-1 flex items-center justify-center gap-1.5 py-1.5 px-1 rounded-lg border transition-all min-w-0",
                                                (settings.clipOrderMode ?? 'none') === o.id
                                                    ? "bg-purple-600/20 border-purple-500/40 text-purple-200"
                                                    : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:text-white/60")}>
                                            <span className="shrink-0">{o.icon}</span>
                                            <span className="text-[9px] font-bold uppercase truncate hidden sm:inline">{o.label}</span>
                                        </button>
                                    </PreviewBubble>
                                ))}
                            </div>
                            {/* Order By — stackable multi-select with date variants */}
                            {(settings.clipOrderMode === 'sequential' || settings.clipOrderMode === 'sequential-randomized') && (
                                <div className="flex flex-wrap gap-1 items-center">
                                    <span className="text-[9px] font-bold uppercase text-white/30 mr-1">Order by</span>
                                    {([
                                        { id: 'filename', label: 'Filename' },
                                        { id: 'date-modified', label: 'Modified' },
                                        { id: 'date-created', label: 'Created' },
                                    ]).map(o => {
                                        const active = (Array.isArray(settings.sequentialBy) ? settings.sequentialBy : [settings.sequentialBy ?? 'date-modified']).includes(o.id as import('../../lib/clipOrdering').SequentialBy);
                                        return (
                                            <button key={o.id} onClick={() => {
                                                const cur = Array.isArray(settings.sequentialBy) ? settings.sequentialBy : [settings.sequentialBy ?? 'date-modified'];
                                                const next = active ? cur.filter((x) => x !== o.id) : [...cur, o.id as import('../../lib/clipOrdering').SequentialBy];
                                                update({ sequentialBy: next.length > 0 ? next as import('../../lib/clipOrdering').SequentialBy[] : ['date-modified'] });
                                            }}
                                                className={clsx("px-2 py-0.5 rounded text-[9px] font-bold uppercase border transition-all",
                                                    active
                                                        ? "bg-purple-600/20 border-purple-500/40 text-purple-200"
                                                        : "bg-white/5 border-white/5 text-white/30 hover:bg-white/10")}>
                                                {o.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}


                </div>

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
                        <div className="relative" ref={audioHistoryRef}>
                            <div className="w-full flex items-center gap-0">
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                    onClick={handleAudioUpload}
                                    className={clsx(
                                        "flex-1 flex justify-center items-center gap-2 py-3 border border-dashed border-white/20 hover:border-purple-500/50 hover:bg-purple-500/10 text-white/50 hover:text-white transition-colors text-xs font-bold",
                                        audioHistory.length > 0 ? "rounded-l-lg border-r-0" : "rounded-lg"
                                    )}>
                                    <Upload size={14} /> Select Audio / Song
                                </motion.button>
                                {audioHistory.length > 0 && (
                                    <button
                                        onClick={() => setShowAudioHistory(!showAudioHistory)}
                                        className={clsx(
                                            "px-3 py-3 rounded-r-lg border border-dashed border-white/20 hover:border-purple-500/50 hover:bg-purple-500/10 text-white/40 hover:text-white transition-all",
                                            showAudioHistory && "bg-purple-500/10 border-purple-500/40 text-purple-300"
                                        )}>
                                        <Clock size={13} className={clsx("transition-transform", showAudioHistory && "text-purple-300")} />
                                    </button>
                                )}
                            </div>
                            {showAudioHistory && audioHistory.length > 0 && (
                                <div className="absolute z-50 top-full mt-1 left-0 right-0 min-w-[240px] bg-black/95 border border-white/10 rounded-lg shadow-2xl backdrop-blur-xl overflow-hidden">
                                    <div className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-white/30 border-b border-white/5">Recent Audio</div>
                                    <div className="max-h-[200px] overflow-y-auto custom-scrollbar">
                                        {audioHistory.map((h, i) => (
                                            <div key={i} className="group flex items-center hover:bg-white/10 transition-colors">
                                                <button
                                                    onClick={() => {
                                                        const url = `file://${h.path}`;
                                                        if (audioUrl && audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
                                                        setAudioFile(null);
                                                        setAudioUrl(url);
                                                        update({ audioFile: h.name, audioUrl: url, audioFilePath: h.path, useAudioGuide: true });
                                                        setShowAudioHistory(false);
                                                        // Auto-load cached analysis
                                                        const sensitivity = settings.beatSensitivity ?? 0.5;
                                                        const cached = audioCacheGetCached(h.path, sensitivity);
                                                        if (cached) {
                                                            setAudioAnalysis(cached);
                                                            update({ audioAnalysis: cached });
                                                        } else {
                                                            setAudioAnalysis(null);
                                                        }
                                                    }}
                                                    className="flex-1 px-3 py-2 text-left text-xs text-white/70 hover:text-white transition-colors flex items-center gap-2 truncate min-w-0">
                                                    <Music size={11} className="text-purple-400 flex-shrink-0" />
                                                    <span className="truncate">{h.name}</span>
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setAudioHistory(prev => {
                                                            const next = prev.filter((_, idx) => idx !== i);
                                                            try { localStorage.setItem('mmm_audio_history', JSON.stringify(next)); } catch {}
                                                            return next;
                                                        });
                                                    }}
                                                    className="opacity-0 group-hover:opacity-100 p-1.5 mr-1 hover:bg-red-500/20 rounded text-white/20 hover:text-red-400 transition-all flex-shrink-0"
                                                    title="Remove from history">
                                                    <Trash2 size={11} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => {
                                            setAudioHistory([]);
                                            try { localStorage.removeItem('mmm_audio_history'); } catch {}
                                            setShowAudioHistory(false);
                                        }}
                                        className="w-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-red-400/50 hover:text-red-400 hover:bg-red-500/10 border-t border-white/5 transition-colors">
                                        Clear All
                                    </button>
                                </div>
                            )}
                        </div>
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
                                        <span className="text-[10px] text-white/40 font-mono">{audioDisplayTime.toFixed(1)}s / {audioAnalysis?.duration.toFixed(1) || '0.0'}s</span>
                                    </div>
                                </div>
                                <div className="flex gap-2 z-0">
                                    <button onClick={() => { const dur = audioAnalysis ? audioAnalysis.duration : 0; setAudioTrimStart(0); setAudioTrimEnd(dur); update({ audioTrimStart: 0, audioTrimEnd: dur, targetDuration: Math.round(dur) || 30 }); }}
                                        className="p-2 bg-blue-500/20 hover:bg-blue-500/40 rounded transition-colors text-blue-300 flex items-center gap-1 text-[10px] font-bold">
                                        <ArrowLeftRight size={14} /> Full Audio
                                    </button>
                                    <button onClick={() => handleRandomizeBeat(false)} disabled={isAnalyzing}
                                        className="p-2 bg-purple-500/20 hover:bg-purple-500/40 rounded transition-colors text-purple-300 flex items-center gap-1 text-[10px] font-bold">
                                        {isAnalyzing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                                        Analyze
                                    </button>
                                    {audioAnalysis && (
                                        <button onClick={() => handleRandomizeBeat(true)} disabled={isAnalyzing}
                                            title="Force re-analysis (bypass cache)"
                                            className="p-2 bg-amber-500/20 hover:bg-amber-500/40 rounded transition-colors text-amber-300 flex items-center gap-1 text-[10px] font-bold">
                                            <Repeat size={14} />
                                            Re-Analyze
                                        </button>
                                    )}
                                    <button onClick={handleRemoveAudio} className="p-2 bg-red-500/20 hover:bg-red-500/40 rounded text-red-400"><Trash2 size={14} /></button>
                                </div>
                            </div>

                            {/* ── Unified Beat Visualizer ── */}
                            {audioAnalysis && (
                                <UnifiedBeatVisualizer
                                    ref={bieVizRef}
                                    audioAnalysis={audioAnalysis}
                                    audioTrimStart={audioTrimStart}
                                    audioTrimEnd={audioTrimEnd}
                                    onTrimChange={(start, end) => {
                                        setAudioTrimStart(start);
                                        setAudioTrimEnd(end);
                                        update({ audioTrimStart: start, audioTrimEnd: end });
                                    }}
                                    onSeek={(time) => {
                                        if (audioRef.current) {
                                            audioRef.current.currentTime = time;
                                            audioCurrentTimeRef.current = time;
                                            setAudioDisplayTime(time);
                                            bieVizRef.current?.updatePlayhead(time);
                                        }
                                    }}
                                    beatSensitivity={settings.beatSensitivity || 0.5}
                                    shakePolicy={settings.shakePolicy ?? 'off'}
                                    shakeType={settings.shakeType ?? 'impact'}
                                    shakeIntensity={settings.shakeIntensity ?? 50}
                                    beatDropImpact={settings.beatDropImpact ?? 'off'}
                                    vibrationFlashPolicy={settings.vibrationFlashPolicy ?? 'sparingly'}
                                    focusedLayer={focusedLayer}
                                />
                            )}

                            {/* ── Stats strip ── */}
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

                            {/* ── Trim inputs ── */}
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

                            {/* ── Segment selector ── */}
                            {audioAnalysis && audioAnalysis.segments.length > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Select Segments</span>
                                        <div className="flex items-center gap-1 flex-wrap">
                                            {[15, 30, 60].map(val => (
                                                <button key={`first-${val}`}
                                                    onClick={() => { setAudioTrimStart(0); setAudioTrimEnd(val); update({ audioTrimStart: 0, audioTrimEnd: Math.min(val, audioAnalysis.duration), targetDuration: val }); }}
                                                    className="px-1.5 py-0.5 rounded bg-white/5 text-white/40 hover:bg-white/15 hover:text-white/70 transition-colors text-[9px] font-bold border border-white/5">
                                                    First {val}s
                                                </button>
                                            ))}
                                            <span className="w-px h-3 bg-white/10" />
                                            {[10, 15, 30, 60].map(val => (
                                                <button key={`best-${val}`} onClick={() => { autoSelectBestSegment(val); update({ targetDuration: val }); }}
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
                                        Selected range: {audioTrimStart.toFixed(1)}s — {audioTrimEnd.toFixed(1)}s ({(audioTrimEnd - audioTrimStart).toFixed(1)}s)
                                    </div>
                                </div>
                            )}

                            {/* ── Two-Column: Beat Sensitivity | Beat Drop Impact ── */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-white/5"
                                 >
                                {/* Column 1: Beat Sensitivity */}
                                <div className="space-y-2"
                                     onMouseEnter={() => setFocusedLayer('beat-sensitivity')}
                                     onMouseLeave={() => setFocusedLayer(null)}>
                                    <SliderControl label="Beat Sensitivity" icon={Zap} value={settings.beatSensitivity || 0.5}
                                        min={0} max={1} step={0.1} unit="" onChange={(v) => update({ beatSensitivity: v })} />
                                    {audioAnalysis && (() => {
                                        const threshold = 1 - (settings.beatSensitivity || 0.5);
                                        const activeCount = audioAnalysis.beats.filter(b => b.energy >= threshold).length;
                                        return (
                                            <div className="flex items-center gap-2 text-[9px] text-white/30">
                                                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                                <span>{activeCount} / {audioAnalysis.beats.length} beats active</span>
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Column 2: Beat Drop Impact */}
                                <div className="space-y-1.5"
                                     onMouseEnter={() => setFocusedLayer('beat-drop')}
                                     onMouseLeave={() => setFocusedLayer(null)}>
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-white/70 flex items-center gap-2">
                                        <Zap size={14} /> Beat Drop Impact
                                    </span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {([
                                            { id: 'off' as BeatDropIntensity, label: 'Off', desc: 'No impact effects on drops' },
                                            { id: 'subtle' as BeatDropIntensity, label: 'Subtle', desc: 'Gentle pulse on heavy drops' },
                                            { id: 'medium' as BeatDropIntensity, label: 'Medium', desc: 'Noticeable flash + zoom hit' },
                                            { id: 'heavy' as BeatDropIntensity, label: 'Heavy', desc: 'Strong multi-layer impact' },
                                            { id: 'maximum' as BeatDropIntensity, label: 'Maximum', desc: 'Full aggression — flash, shake, zoom' },
                                        ]).map(opt => (
                                            <PreviewBubble key={opt.id}
                                                preview={<BeatDropPreview intensity={opt.id} />}
                                                description={opt.desc}
                                                width={170}>
                                                <button onClick={() => update({ beatDropImpact: opt.id })}
                                                    className={clsx("px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition-all border capitalize",
                                                        (settings.beatDropImpact ?? 'off') === opt.id
                                                            ? "bg-orange-600/20 border-orange-500/40 text-orange-200 shadow-[0_0_8px_rgba(249,115,22,0.15)]"
                                                            : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10")}>
                                                    {opt.label}
                                                </button>
                                            </PreviewBubble>
                                        ))}
                                    </div>
                                    {(settings.beatDropImpact ?? 'off') !== 'off' && audioAnalysis && (
                                        (() => {
                                            const hasDropOrChorus = audioAnalysis.segments.some((s: any) => s.type === 'drop' || s.type === 'chorus');
                                            return !hasDropOrChorus ? (
                                                <div className="flex items-start gap-2 mt-1.5 px-2 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                                    <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
                                                    <span className="text-[9px] text-amber-300/80 leading-relaxed">
                                                        No <strong>drop</strong> or <strong>chorus</strong> segments detected — beat drop effects only fire on those sections.
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-[8px] text-emerald-400/50 flex items-center gap-1 mt-0.5">
                                                    <Zap size={9} /> {audioAnalysis.segments.filter((s: any) => s.type === 'drop' || s.type === 'chorus').length} drop/chorus segments — effects will apply
                                                </span>
                                            );
                                        })()
                                    )}
                                </div>
                            </div>

                            {/* ── Shake ── */}
                            <div className="space-y-2 pt-3 border-t border-white/5"
                                 onMouseEnter={() => setFocusedLayer('shake')}
                                 onMouseLeave={() => setFocusedLayer(null)}>
                                <span className="text-[11px] font-bold uppercase tracking-wider text-white/70 flex items-center gap-2">
                                    <Activity size={14} /> Shake
                                </span>
                                <div className="space-y-1">
                                    <span className="text-[9px] font-bold uppercase text-white/30 tracking-wider">Shake Policy</span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {([
                                            { id: 'off' as ShakePolicy, label: 'Off', desc: 'No camera shake applied' },
                                            { id: 'sparingly' as ShakePolicy, label: 'Sparingly', desc: 'Only on high-impact moments' },
                                            { id: 'heavy-beats-only' as ShakePolicy, label: 'Heavy Beats', desc: 'Targets the hardest drops' },
                                            { id: 'on-every-beat' as ShakePolicy, label: 'Every Beat', desc: 'Shake on every detected beat' },
                                        ]).map(opt => (
                                            <PreviewBubble key={opt.id}
                                                preview={<ShakePolicyPreview policy={opt.id} />}
                                                description={opt.desc}
                                                width={180}>
                                                <button onClick={() => update({ shakePolicy: opt.id })}
                                                    className={clsx("px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition-all border",
                                                        (settings.shakePolicy ?? 'off') === opt.id
                                                            ? "bg-red-600/20 border-red-500/40 text-red-200 shadow-[0_0_8px_rgba(239,68,68,0.15)]"
                                                            : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10")}>
                                                    {opt.label}
                                                </button>
                                            </PreviewBubble>
                                        ))}
                                    </div>
                                </div>
                                {(settings.shakePolicy ?? 'off') !== 'off' && (
                                    <div className="space-y-3 pl-5">
                                        <div className="space-y-1">
                                            <span className="text-[9px] font-bold uppercase text-white/30 tracking-wider">Shake Type</span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {([
                                                    { id: 'impact', label: 'Impact', desc: 'Single sharp directional jolt' },
                                                    { id: 'handheld', label: 'Handheld', desc: 'Subtle organic camera wobble' },
                                                    { id: 'earthquake', label: 'Earthquake', desc: 'Aggressive multi-axis shaking' },
                                                    { id: 'vibration', label: 'Vibration', desc: 'Rapid small-amplitude oscillation' },
                                                    { id: 'whip', label: 'Whip', desc: 'Fast horizontal snap and recoil' },
                                                    { id: 'all', label: 'All', desc: 'Randomly cycles through all types' },
                                                ] as { id: ShakeType | 'all'; label: string; desc: string }[]).map(opt => (
                                                    <PreviewBubble key={opt.id}
                                                        preview={<ShakeTypePreview type={opt.id} />}
                                                        description={opt.desc}
                                                        width={180}>
                                                        <button onClick={() => update({ shakeType: opt.id })}
                                                            className={clsx("px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition-all border",
                                                                (settings.shakeType ?? 'impact') === opt.id
                                                                    ? "bg-red-600/20 border-red-500/40 text-red-200"
                                                                    : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10")}>
                                                            {opt.label}
                                                        </button>
                                                    </PreviewBubble>
                                                ))}
                                            </div>
                                        </div>
                                        <SliderControl label="Intensity" icon={Zap} value={settings.shakeIntensity ?? 50}
                                            min={0} max={100} step={5} unit="%" onChange={(v) => update({ shakeIntensity: v })} />
                                    </div>
                                )}
                            </div>

                            {/* ── Vibration Flash ── */}
                            <div className="space-y-2 pt-3 border-t border-white/5"
                                 onMouseEnter={() => setFocusedLayer('vibration-flash')}
                                 onMouseLeave={() => setFocusedLayer(null)}>
                                <span className="text-[11px] font-bold uppercase tracking-wider text-white/70 flex items-center gap-2">
                                    <Zap size={14} className="text-rose-300" /> Vibration Flash
                                    <span className="text-[9px] text-white/30 font-normal">Punchy beat-synced jolt</span>
                                </span>
                                <EffectPolicyControl label=""
                                    policy={settings.vibrationFlashPolicy ?? 'sparingly'}
                                    onPolicy={(p) => update({ vibrationFlashPolicy: p })}
                                    renderPreview={(p) => <VibrationFlashPolicyPreview policy={p} />}>
                                    <SliderControl label="Intensity" icon={Zap} value={settings.vibrationFlashIntensity ?? 70}
                                        min={0} max={100} step={5} unit="%" onChange={(v) => update({ vibrationFlashIntensity: v })} />
                                </EffectPolicyControl>
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-black/20 p-5 rounded-xl border border-white/5 mt-6 space-y-5">
                    {/* Two-column layout: Duration + Clip Range */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        {/* Column 1: Target Duration + Presets */}
                        <div className="space-y-3">
                            <SliderControl label="Target Duration" icon={Clock} value={settings.targetDuration}
                                min={5} max={Math.max(300, Math.ceil(audioAnalysis?.duration || 0))} step={settings.targetDuration > 180 ? 1 : 5} unit="s" onChange={(v) => {
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
                                        <button onClick={() => {
                                            const dur = Math.round(audioAnalysis.duration);
                                            setAudioTrimStart(0);
                                            setAudioTrimEnd(audioAnalysis.duration);
                                            update({ targetDuration: dur, audioTrimStart: 0, audioTrimEnd: audioAnalysis.duration });
                                        }}
                                            className={clsx("px-2 py-1.5 rounded-md text-[10px] font-bold transition-all border whitespace-nowrap",
                                                settings.targetDuration === Math.round(audioAnalysis.duration)
                                                    ? "bg-primary text-white border-primary shadow-lg"
                                                    : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10")}>
                                            Full Audio
                                        </button>
                                    </>
                                )}
                            </div>
                            {/* Presets */}
                            <div className="space-y-1.5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Presets</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {[
                                        { label: 'Dynamic', shortest: 0.1, longest: 2.0, rhythm: 'random-walk', desc: 'Full spectrum — hype to hold' },
                                        { label: 'Montage', shortest: 0.2, longest: 0.5, rhythm: 'staccato-legato', desc: 'Fast travel / recap' },
                                        { label: 'Beat Sync', shortest: 0.2, longest: 0.8, rhythm: 'pulse-2-1-2', desc: 'Locked to rhythm' },
                                        { label: 'Action', shortest: 0.3, longest: 1.0, rhythm: 'heartbeat', desc: 'Fight / chase' },
                                        { label: 'Music Video', shortest: 0.3, longest: 1.2, rhythm: 'wave', desc: 'Performance cuts' },
                                        { label: 'Standard', shortest: 0.5, longest: 2.0, rhythm: 'breathing', desc: 'General editing' },
                                        { label: 'Drama', shortest: 1.0, longest: 3.0, rhythm: 'call-response', desc: 'Dialogue / tension' },
                                        { label: 'Cinematic', shortest: 1.5, longest: 4.0, rhythm: 'fibonacci', desc: 'Slow reveals' },
                                        { label: 'Wide Mix', shortest: 0.2, longest: 5.0, rhythm: 'random', desc: 'Maximum range — everything goes' },
                                        { label: 'Showreel', shortest: 0.8, longest: 2.5, rhythm: 'climax-arc', desc: 'Portfolio highlights' },
                                        { label: 'Rapid Montage', shortest: 0.3, longest: 0.8, rhythm: 'staccato-legato', desc: 'Rapid cuts' },
                                        { label: 'Slow Build', shortest: 0.5, longest: 5.0, rhythm: 'accelerando', desc: 'Long to tight' },
                                        { label: 'Crescendo', shortest: 0.3, longest: 4.0, rhythm: 'climax-arc', desc: 'Build to hero hold' },
                                        { label: 'Breathing', shortest: 0.5, longest: 3.0, rhythm: 'breathing', desc: 'Expand / compact' },
                                    ].map(p => (
                                        <PreviewBubble key={p.label}
                                            preview={<DurationPresetPreview shortest={p.shortest} longest={p.longest} />}
                                            description={p.desc}
                                            width={180}>
                                            <button
                                                onClick={() => update({ shortestClip: p.shortest, longestClip: p.longest, rhythmPattern: p.rhythm as any })}
                                                className={clsx("px-2 py-1 rounded-full text-[10px] font-bold transition-all border",
                                                    settings.shortestClip === p.shortest && settings.longestClip === p.longest && settings.rhythmPattern === p.rhythm
                                                        ? "bg-purple-600/20 border-purple-500/40 text-purple-200 shadow-[0_0_8px_rgba(168,85,247,0.15)]"
                                                        : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:text-white/60")}>
                                                {p.label}
                                            </button>
                                        </PreviewBubble>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Column 2: Clip Range dual-handle slider */}
                        <div className="space-y-3">
                            <DualRangeSlider label="Clip Range" icon={Scissors}
                                min={0.1} max={10} step={0.1} unit="s"
                                value={[settings.shortestClip, settings.longestClip]}
                                onChange={([shortest, longest]) => update({ shortestClip: shortest, longestClip: longest })} />
                            <div className="flex gap-3 text-[9px] text-white/30">
                                <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-purple-400" /> Shortest
                                </span>
                                <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-blue-400" /> Longest
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Narration Intelligence (folded by default; opens on upload) ─── */}
                <NarrationIntelligence
                    narrationFile={narrationFile}
                    narrationName={narrationName}
                    narrationUrl={narrationUrl}
                    transcript={narrationTranscript}
                    analysis={narrationAnalysis}
                    isAnalyzing={narrationIsAnalyzing}
                    onUpload={handleNarrationUpload}
                    onTranscriptChange={handleTranscriptChange}
                    onAnalyze={handleNarrationAnalyze}
                    onRemove={handleNarrationRemove}
                    mergeStrategy={mergeStrategy}
                    onMergeStrategyChange={setMergeStrategy}
                    hasBeatIntelligence={!!settings.audioAnalysis}
                    settings={settings}
                    update={update}
                />

                <TrailerSmartPanel settings={settings} update={update} />

                <SmartChoicesStrip />





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
                        <Clock size={12} className="text-blue-400" /> Cinematic Speed <span className="text-white/25 normal-case font-normal">(select one or more)</span>
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { id: 'none', label: 'Normal', speed: '1x', desc: 'No speed modification' },
                            { id: 'slowmo', label: 'Slow-Mo', speed: '0.5x', desc: 'All clips at half speed' },
                            { id: 'fast', label: 'Fast', speed: '1.5x', desc: 'All clips at 1.5x' },
                            { id: 'hyper', label: 'Hyper', speed: '4x', desc: 'All clips at 4x speed' },
                        ].map(opt => (
                            <button key={opt.id} onClick={() => {
                                    const cur = settings.slowmoPolicies ?? [];
                                    const next = cur.includes(opt.id as any) ? cur.filter(x => x !== opt.id) : [...cur, opt.id as any];
                                    update({ slowmoPolicies: next });
                                    setCustomSpeedEnabled(false);
                                }}
                                className={clsx("p-2.5 rounded-lg border text-left transition-all",
                                    (settings.slowmoPolicies ?? []).includes(opt.id as any) && !customSpeedEnabled
                                        ? "bg-blue-600/20 border-blue-500/40 shadow-[0_0_12px_rgba(59,130,246,0.15)]"
                                        : "bg-white/5 border-white/5 hover:bg-white/10")}>
                                <div className={clsx("text-[10px] font-black uppercase", (settings.slowmoPolicies ?? []).includes(opt.id as any) && !customSpeedEnabled ? "text-blue-200" : "text-white/70")}>{opt.label} ({opt.speed})</div>
                                <div className="text-[9px] text-white/30">{opt.desc}</div>
                            </button>
                        ))}
                    </div>
                    <div className="space-y-2">
                        <button onClick={() => {
                            setCustomSpeedEnabled(!customSpeedEnabled);
                            if (!customSpeedEnabled) {
                                update({ slowmoPolicy: 'custom' as any, customSpeed: settings.customSpeed ?? 1.0 });
                            }
                        }}
                            className={clsx("px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase transition-all",
                                customSpeedEnabled
                                    ? "bg-blue-600/20 border-blue-500/40 text-blue-200"
                                    : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10")}>
                            Custom Speed
                        </button>
                        {customSpeedEnabled && (
                            <div className="space-y-3 pl-2 border-l-2 border-blue-500/20 ml-1">
                                {/* Custom Range Toggle */}
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <span className="text-[10px] font-bold uppercase text-white/50">Custom Range</span>
                                    <div className="relative ml-auto">
                                        <input type="checkbox" className="sr-only" checked={settings.customSpeedRangeEnabled ?? false}
                                            onChange={(e) => update({ customSpeedRangeEnabled: e.target.checked })} />
                                        <div className={clsx("w-8 h-4 rounded-full transition-colors", settings.customSpeedRangeEnabled ? "bg-blue-500" : "bg-black border border-white/20")}>
                                            <div className={clsx("w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform", settings.customSpeedRangeEnabled ? "translate-x-4" : "translate-x-0.5")} />
                                        </div>
                                    </div>
                                </label>

                                {settings.customSpeedRangeEnabled ? (
                                    <DualRangeSlider label="Speed Range" icon={Zap}
                                        min={0.25} max={8} step={0.25} unit="x"
                                        value={settings.customSpeedRange ?? [0.5, 2.0]}
                                        onChange={(v) => update({ customSpeedRange: v, slowmoPolicy: 'custom' as any })} />
                                ) : (
                                    <SliderControl label="Custom Speed" icon={Clock} value={settings.customSpeed ?? 1.0}
                                        min={0.25} max={8} step={0.25} unit="x"
                                        onChange={(v) => update({ customSpeed: v, slowmoPolicy: 'custom' as any })} />
                                )}
                            </div>
                        )}
                    </div>

                    {/* Speed Curve Presets (multi-select) */}
                    <div className="space-y-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Speed Curve <span className="text-white/25 normal-case font-normal">(select one or more)</span></span>
                        <div className="flex flex-wrap gap-1.5">
                            {([
                                { id: 'constant', label: 'Constant', desc: 'Uniform speed throughout the clip' },
                                { id: 'ramp-up', label: 'Ramp Up', desc: 'Starts slow, accelerates to the end' },
                                { id: 'ramp-down', label: 'Ramp Down', desc: 'Starts fast, decelerates to a stop' },
                                { id: 's-curve', label: 'S-Curve', desc: 'Speeds up in the middle, slow at edges' },
                                { id: 'ramp-freeze', label: 'Ramp-Freeze', desc: 'Accelerates then freezes at peak' },
                                { id: 'burst-landing', label: 'Burst-Landing', desc: 'Quick burst then gentle landing' },
                                { id: 'oscillating', label: 'Oscillating', desc: 'Rhythmic speed pulses' },
                            ] as { id: SpeedCurvePreset; label: string; desc: string }[]).map(opt => {
                                const selected = (settings.speedCurvePresets ?? [settings.speedCurvePreset ?? 'constant']);
                                const isActive = selected.includes(opt.id);
                                return (
                                    <PreviewBubble key={opt.id}
                                        preview={<SpeedCurvePreview preset={opt.id} />}
                                        description={opt.desc}
                                        width={180}>
                                        <button onClick={() => {
                                            const cur = settings.speedCurvePresets ?? [settings.speedCurvePreset ?? 'constant'];
                                            const next = isActive ? cur.filter(x => x !== opt.id) : [...cur, opt.id];
                                            update({ speedCurvePresets: next.length > 0 ? next : ['constant'], speedCurvePreset: (next.length > 0 ? next[next.length - 1] : 'constant') });
                                        }}
                                            className={clsx("px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition-all border",
                                                isActive
                                                    ? "bg-blue-600/20 border-blue-500/40 text-blue-200 shadow-[0_0_8px_rgba(59,130,246,0.15)]"
                                                    : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:text-white/60")}>
                                            {opt.label}
                                        </button>
                                    </PreviewBubble>
                                );
                            })}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                            <SpeedCurveVisualizer preset={settings.speedCurvePreset ?? (settings.speedCurvePresets?.[settings.speedCurvePresets.length - 1]) ?? 'constant'} width={120} height={60} />
                            <div className="flex-1">
                                <SliderControl label="Curve Frequency" icon={Zap} value={settings.speedCurveFrequency ?? 50}
                                    min={0} max={100} step={5} unit="%"
                                    onChange={(v) => update({ speedCurveFrequency: v })} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* ═══════════════════════════ EFFECTS ═══════════════════════════ */}
                <CollapsibleSection title="Effects" icon={Sparkles} iconColor="text-cyan-400" isOpen={effectsOpen} onToggle={() => setEffectsOpen(!effectsOpen)}
                    badge={[settings.boomerangAll && 'Boom', settings.zoomEnabled && 'Zoom'].filter(Boolean).join(' · ') || undefined}
                    badgeColor="bg-cyan-500/20 text-cyan-300">


                    {/* ── Boomerang ── */}
                    <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Repeat size={13} className="text-cyan-400" />
                                <span className="text-[11px] font-bold uppercase tracking-wider text-white/70">Boomerang</span>
                                <span className="text-[9px] text-white/30">Forward ↔ Reverse</span>
                            </div>
                            <button onClick={() => update({ boomerangAll: !settings.boomerangAll })}
                                className={clsx("px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all border",
                                    settings.boomerangAll
                                        ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-200 shadow-[0_0_8px_rgba(6,182,212,0.2)]"
                                        : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10")}>
                                {settings.boomerangAll ? 'All Clips' : 'Selective'}
                            </button>
                        </div>
                        {!settings.boomerangAll && (
                            <div className="pl-5">
                                <SliderControl label="Frequency" icon={Repeat} value={settings.boomerangFrequency ?? 0}
                                    min={0} max={100} step={5} unit="%" onChange={(v) => update({ boomerangFrequency: v })} />
                            </div>
                        )}
                        <div className="space-y-1 pl-5">
                            <span className="text-[9px] font-bold uppercase text-white/30 tracking-wider">Presets — pick any (rotated per clip)</span>
                            <div className="flex flex-wrap gap-1.5">
                                {(([['classic', 'Classic', 'Smooth forward + reverse loop'], ['slowmo', 'Slow-Mo', 'Buttery slow back-and-forth'], ['echo', 'Echo', 'Ghosted trail following motion'], ['duo', 'Duo', 'Double-dip bounce'], ['stutter', 'Stutter', 'Rapid micro-reversals'], ['whiplash', 'Whiplash', 'Fast snap and elastic recoil']]) as [BoomerangPresetId, string, string][]).map(([id, name, desc]) => {
                                    const active = (settings.boomerangPresets ?? []).includes(id);
                                    return (
                                        <PreviewBubble key={id}
                                            preview={<BoomerangPreview preset={id} />}
                                            description={desc}
                                            width={180}>
                                            <button onClick={() => { const cur = settings.boomerangPresets ?? []; update({ boomerangPresets: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] }); }}
                                                className={clsx("px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition-all border",
                                                    active
                                                        ? "bg-cyan-600/20 border-cyan-500/40 text-cyan-200 shadow-[0_0_8px_rgba(6,182,212,0.2)]"
                                                        : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10")}>
                                                {name}
                                            </button>
                                        </PreviewBubble>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-white/5" />

                    {/* ── Zoom ── */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-white/70 flex items-center gap-2">
                                <Search size={14} /> Zoom
                            </span>
                            <button onClick={() => update({ zoomEnabled: !settings.zoomEnabled })}
                                className={clsx("px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all border",
                                    settings.zoomEnabled
                                        ? "bg-purple-500/20 border-purple-500/40 text-purple-200"
                                        : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10")}>
                                {settings.zoomEnabled ? 'ON' : 'OFF'}
                            </button>
                        </div>
                        {settings.zoomEnabled && (
                            <div className="space-y-3 pl-5">
                                {/* Zoom value chips */}
                                <div className="space-y-1">
                                    <span className="text-[9px] font-bold uppercase text-white/30 tracking-wider">Zoom Values</span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {[100, 125, 150, 175, 200].map(val => {
                                            const isActive = (settings.zoomValues ?? [100, 125, 150, 175, 200]).includes(val);
                                            return (
                                                <PreviewBubble key={val}
                                                    preview={<ZoomValuePreview value={val} />}
                                                    description={val === 100 ? 'No zoom — full frame visible' : `${val}% zoom — ${Math.round(10000/val)}% of frame visible`}
                                                    width={160}>
                                                    <button onClick={() => {
                                                        const current = settings.zoomValues ?? [100, 125, 150, 175, 200];
                                                        const next = isActive ? current.filter(v => v !== val) : [...current, val].sort((a, b) => a - b);
                                                        if (next.length > 0) update({ zoomValues: next });
                                                    }}
                                                        className={clsx("px-2.5 py-1 rounded-full text-[10px] font-bold transition-all border",
                                                            isActive
                                                                ? "bg-purple-600/20 border-purple-500/40 text-purple-200"
                                                                : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10")}>
                                                        {val}%
                                                    </button>
                                                </PreviewBubble>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Custom Range toggle */}
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <span className="text-[10px] font-bold uppercase text-white/50">Custom Range</span>
                                    <div className="relative ml-auto">
                                        <input type="checkbox" className="sr-only" checked={settings.zoomCustomRangeEnabled ?? false}
                                            onChange={(e) => update({ zoomCustomRangeEnabled: e.target.checked })} />
                                        <div className={clsx("w-8 h-4 rounded-full transition-colors", settings.zoomCustomRangeEnabled ? "bg-purple-500" : "bg-black border border-white/20")}>
                                            <div className={clsx("w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform", settings.zoomCustomRangeEnabled ? "translate-x-4" : "translate-x-0.5")} />
                                        </div>
                                    </div>
                                </label>
                                {settings.zoomCustomRangeEnabled && (
                                    <DualRangeSlider label="Zoom Range" icon={Eye}
                                        min={100} max={200} step={5} unit="%"
                                        value={settings.zoomCustomRange ?? [100, 200]}
                                        onChange={(v) => update({ zoomCustomRange: v })} />
                                )}

                                {/* Zoom Speed */}
                                <div className="space-y-1">
                                    <span className="text-[9px] font-bold uppercase text-white/30 tracking-wider">Zoom Speed</span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(['instant', 'fast', 'slow', 'all'] as const).map(id => {
                                            const descs: Record<string, string> = { instant: 'Snaps to zoom level immediately', fast: 'Quick smooth zoom transition', slow: 'Gradual cinematic zoom', all: 'Randomizes between all speeds' };
                                            const labels: Record<string, string> = { instant: 'Instant', fast: 'Fast', slow: 'Slow', all: 'All' };
                                            return (
                                                <PreviewBubble key={id}
                                                    preview={<ZoomSpeedPreview speed={id} />}
                                                    description={descs[id]}
                                                    width={170}>
                                                    <button onClick={() => update({ zoomSpeed: id })}
                                                        className={clsx("px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition-all border capitalize",
                                                            (settings.zoomSpeed ?? 'all') === id
                                                                ? "bg-purple-600/20 border-purple-500/40 text-purple-200"
                                                                : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10")}>
                                                        {labels[id]}
                                                    </button>
                                                </PreviewBubble>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Beat Sync toggle */}
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <span className="text-[10px] font-bold uppercase text-white/50">Beat Sync</span>
                                    <div className="relative ml-auto">
                                        <input type="checkbox" className="sr-only" checked={settings.zoomBeatSync ?? false}
                                            onChange={(e) => update({ zoomBeatSync: e.target.checked })} />
                                        <div className={clsx("w-8 h-4 rounded-full transition-colors", settings.zoomBeatSync ? "bg-emerald-500" : "bg-black border border-white/20")}>
                                            <div className={clsx("w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform", settings.zoomBeatSync ? "translate-x-4" : "translate-x-0.5")} />
                                        </div>
                                    </div>
                                </label>
                            </div>
                        )}
                    </div>

                    {/* ── All Effects (individual cards) ── */}
                    <motion.div layout className="flex flex-wrap gap-2.5">
                            {/* Double Exposure */}
                            <motion.div layout transition={{ layout: { duration: 0.3 } }} className={clsx("relative overflow-hidden rounded-xl border p-3.5 space-y-2.5 transition-all bg-gradient-to-br from-indigo-600/10 via-white/5 to-purple-600/10",
                                (settings.doubleExposurePolicy ?? 'off') !== 'off' ? "w-full border-indigo-400/40 shadow-[0_0_18px_rgba(99,102,241,0.2)]" : "w-full sm:w-[calc(50%-5px)] border-white/10")}>
                                <div className="absolute -top-8 -right-8 w-24 h-24 bg-indigo-500/20 blur-[40px] pointer-events-none rounded-full" />
                                <PreviewBubble
                                    preview={<DoubleExposurePreview />}
                                    description="Dreamy two-layer blend — two overlapping frames create a ghostly composite"
                                    width={200}>
                                    <div className="flex items-center gap-2 relative">
                                        <Layers size={14} className="text-indigo-300" />
                                        <div className="flex flex-col">
                                            <span className="text-xs font-black text-white leading-none">Double Exposure</span>
                                            <span className="text-[9px] text-white/40">Dreamy two-layer blend</span>
                                        </div>
                                    </div>
                                </PreviewBubble>
                                <EffectPolicyControl label=""
                                    policy={settings.doubleExposurePolicy ?? 'off'}
                                    onPolicy={(p) => update({ doubleExposurePolicy: p })}
                                    renderPreview={(p) => <DoubleExposurePolicyPreview policy={p} />}>
                                    <SliderControl label="Opacity" icon={Layers} value={settings.doubleExposureOpacity ?? 45}
                                        min={0} max={100} step={5} unit="%" onChange={(v) => update({ doubleExposureOpacity: v })} />
                                    <div className="space-y-1">
                                        <span className="text-[9px] font-bold uppercase text-white/30 tracking-wider">Shape</span>
                                        <div className="flex gap-1.5">
                                            {(([['full', 'Full', 'Full-frame overlap — both layers cover the entire frame'], ['shaped', 'Shaped', 'Masked blend — second layer is soft-edged oval or vignette'], ['mix', 'Mix', 'Alternates between full and shaped per clip']]) as ['full' | 'shaped' | 'mix', string, string][]).map(([mode, label, desc]) => (
                                                <PreviewBubble key={mode}
                                                    preview={<DoubleExposureShapePreview mode={mode} />}
                                                    description={desc}
                                                    width={180}>
                                                    <button onClick={() => update({ doubleExposureShapeMode: mode })}
                                                        className={clsx("flex-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase transition-all border",
                                                            (settings.doubleExposureShapeMode ?? 'full') === mode
                                                                ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-200"
                                                                : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10")}>
                                                        {label}
                                                    </button>
                                                </PreviewBubble>
                                            ))}
                                        </div>
                                    </div>
                                    {/* Gradient overlay — pick one */}
                                    <div className="space-y-1.5">
                                        <span className="text-[9px] font-bold uppercase text-white/30 tracking-wider">Gradient Overlay</span>
                                        <div className="flex gap-2">
                                            {DOUBLE_EXPOSURE_GRADIENTS.map((g) => {
                                                const sel = (settings.doubleExposureGradientIds ?? []).includes(g.id);
                                                return (
                                                    <button key={g.id}
                                                        onClick={() => {
                                                            // Single-select: toggle this one, deselect others
                                                            update({ doubleExposureGradientIds: sel ? [] : [g.id] });
                                                        }}
                                                        className={clsx('flex-1 flex flex-col items-center gap-1.5 py-2 px-2 rounded-lg border transition-all',
                                                            sel ? 'border-white/40 ring-1 ring-white/30 bg-white/5' : 'border-white/10 hover:border-white/25 bg-black/20 hover:bg-white/5')}>
                                                        <div className="w-full h-8 rounded-md overflow-hidden"
                                                            style={{ background: gradientToCss(g.colors) }} />
                                                        <span className={clsx('text-[9px] font-bold uppercase tracking-wider',
                                                            sel ? 'text-white/80' : 'text-white/35')}>{g.name}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <span className="text-[8px] text-white/30">
                                            {(settings.doubleExposureGradientIds ?? []).length === 0
                                                ? 'None selected — uses a second clip as the overlay.'
                                                : `${DOUBLE_EXPOSURE_GRADIENTS.find(g => g.id === (settings.doubleExposureGradientIds ?? [])[0])?.name ?? 'Gradient'} overlay active`}
                                        </span>
                                    </div>
                                </EffectPolicyControl>
                            </motion.div>

                            {/* Triple Exposure */}
                            <motion.div layout transition={{ layout: { duration: 0.3 } }} className={clsx("relative overflow-hidden rounded-xl border p-3.5 space-y-2.5 transition-all bg-gradient-to-br from-amber-600/10 via-white/5 to-yellow-600/10",
                                (settings.tripleExposurePolicy ?? 'off') !== 'off' ? "w-full border-amber-400/40 shadow-[0_0_18px_rgba(245,158,11,0.2)]" : "w-full sm:w-[calc(50%-5px)] border-white/10")}>
                                <div className="absolute -top-8 -right-8 w-24 h-24 bg-amber-500/20 blur-[40px] pointer-events-none rounded-full" />
                                <div className="flex items-center gap-2 relative">
                                    <Layers size={14} className="text-amber-300" />
                                    <div className="flex flex-col">
                                        <span className="text-xs font-black text-white leading-none">Triple Exposure</span>
                                        <span className="text-[9px] text-white/40">3-layer blend for richer, denser composites</span>
                                    </div>
                                </div>
                                <EffectPolicyControl label=""
                                    policy={settings.tripleExposurePolicy ?? 'off'}
                                    onPolicy={(p) => update({ tripleExposurePolicy: p })}>
                                    <SliderControl label="Opacity" icon={Layers} value={settings.tripleExposureOpacity ?? 35}
                                        min={0} max={100} step={5} unit="%" onChange={(v) => update({ tripleExposureOpacity: v })} />
                                    <div className="space-y-1">
                                        <span className="text-[9px] font-bold uppercase text-white/30 tracking-wider">Blend Mode</span>
                                        <div className="flex gap-1.5 flex-wrap">
                                            {(['screen', 'lighten', 'overlay', 'add', 'softlight', 'multiply'] as const).map((mode) => (
                                                <button key={mode} onClick={() => update({ tripleExposureBlend: mode })}
                                                    className={clsx("px-2 py-1 rounded-full text-[10px] font-bold uppercase transition-all border",
                                                        (settings.tripleExposureBlend ?? 'screen') === mode
                                                            ? "bg-amber-600/20 border-amber-500/40 text-amber-200"
                                                            : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10")}>
                                                    {mode}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {/* Gradient overlay — pick one */}
                                    <div className="space-y-1.5">
                                        <span className="text-[9px] font-bold uppercase text-white/30 tracking-wider">Gradient Overlay</span>
                                        <div className="flex gap-2">
                                            {DOUBLE_EXPOSURE_GRADIENTS.map((g) => {
                                                const sel = (settings.tripleExposureGradientIds ?? []).includes(g.id);
                                                return (
                                                    <button key={g.id}
                                                        onClick={() => {
                                                            update({ tripleExposureGradientIds: sel ? [] : [g.id] });
                                                        }}
                                                        className={clsx('flex-1 flex flex-col items-center gap-1.5 py-2 px-2 rounded-lg border transition-all',
                                                            sel ? 'border-white/40 ring-1 ring-white/30 bg-white/5' : 'border-white/10 hover:border-white/25 bg-black/20 hover:bg-white/5')}>
                                                        <div className="w-full h-8 rounded-md overflow-hidden"
                                                            style={{ background: gradientToCss(g.colors) }} />
                                                        <span className={clsx('text-[9px] font-bold uppercase tracking-wider',
                                                            sel ? 'text-white/80' : 'text-white/35')}>{g.name}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <span className="text-[8px] text-white/30">
                                            {(settings.tripleExposureGradientIds ?? []).length === 0
                                                ? 'None selected — uses clips as all three layers.'
                                                : `${DOUBLE_EXPOSURE_GRADIENTS.find(g => g.id === (settings.tripleExposureGradientIds ?? [])[0])?.name ?? 'Gradient'} overlay active`}
                                        </span>
                                    </div>
                                </EffectPolicyControl>
                            </motion.div>

                            {/* Motion Blur */}
                            <motion.div layout transition={{ layout: { duration: 0.3 } }} className={clsx("relative overflow-hidden rounded-xl border p-3.5 space-y-2.5 transition-all bg-gradient-to-br from-sky-600/10 via-white/5 to-blue-600/10",
                                "w-full sm:w-[calc(50%-5px)]",
                                (settings.motionBlurPolicy ?? 'off') !== 'off' ? "border-sky-400/40 shadow-[0_0_18px_rgba(56,189,248,0.2)]" : "border-white/10")}>
                                <div className="absolute -top-8 -right-8 w-24 h-24 bg-sky-500/20 blur-[40px] pointer-events-none rounded-full" />
                                <PreviewBubble
                                    preview={<MotionBlurPreview />}
                                    description="Cinematic smear on fast motion — adds velocity feel"
                                    width={200}>
                                    <div className="flex items-center gap-2 relative">
                                        <Zap size={14} className="text-sky-300" />
                                        <div className="flex flex-col">
                                            <span className="text-xs font-black text-white leading-none">Motion Blur</span>
                                            <span className="text-[9px] text-white/40">Smear the fast moments</span>
                                        </div>
                                    </div>
                                </PreviewBubble>
                                <EffectPolicyControl label=""
                                    policy={settings.motionBlurPolicy ?? 'off'}
                                    onPolicy={(p) => update({ motionBlurPolicy: p })}
                                    renderPreview={(p) => <MotionBlurPolicyPreview policy={p} />}>
                                    <SliderControl label="Amount" icon={Zap} value={settings.motionBlurAmount ?? 50}
                                        min={0} max={100} step={5} unit="%" onChange={(v) => update({ motionBlurAmount: v })} />
                                </EffectPolicyControl>
                            </motion.div>

                            {/* Glow */}
                            <motion.div layout transition={{ layout: { duration: 0.3 } }} className={clsx("relative overflow-hidden rounded-xl border p-3.5 space-y-2.5 transition-all bg-gradient-to-br from-amber-600/10 via-white/5 to-pink-600/10",
                                "w-full sm:w-[calc(50%-5px)]",
                                (settings.glowPolicy ?? 'off') !== 'off' ? "border-amber-400/40 shadow-[0_0_18px_rgba(251,191,36,0.2)]" : "border-white/10")}>
                                <div className="absolute -top-8 -right-8 w-24 h-24 bg-amber-500/20 blur-[40px] pointer-events-none rounded-full" />
                                <PreviewBubble
                                    preview={<GlowPreview />}
                                    description="Soft bloom around highlights — dreamy cinematic look"
                                    width={200}>
                                    <div className="flex items-center gap-2 relative">
                                        <Sparkles size={14} className="text-amber-300" />
                                        <div className="flex flex-col">
                                            <span className="text-xs font-black text-white leading-none">Glow</span>
                                            <span className="text-[9px] text-white/40">Soft cinematic bloom</span>
                                        </div>
                                    </div>
                                </PreviewBubble>
                                <EffectPolicyControl label=""
                                    policy={settings.glowPolicy ?? 'off'}
                                    onPolicy={(p) => update({ glowPolicy: p })}
                                    renderPreview={(p) => <GlowPolicyPreview policy={p} />}>
                                    <SliderControl label="Intensity" icon={Sparkles} value={settings.glowIntensity ?? 55}
                                        min={0} max={100} step={5} unit="%" onChange={(v) => update({ glowIntensity: v })} />
                                    <SliderControl label="Radius" icon={Sparkles} value={settings.glowRadius ?? 50}
                                        min={0} max={100} step={5} unit="%" onChange={(v) => update({ glowRadius: v })} />
                                </EffectPolicyControl>
                            </motion.div>

                            {/* Vibration Flash — moved to Beat Intelligence Engine section */}

                            {/* Optical-Flow Slow-Mo */}
                            <motion.div layout transition={{ layout: { duration: 0.3 } }} className={clsx("relative overflow-hidden rounded-xl border p-3.5 space-y-2.5 transition-all bg-gradient-to-br from-teal-600/10 via-white/5 to-emerald-600/10",
                                (settings.smoothSlowmoPolicy ?? 'off') !== 'off' ? "w-full border-teal-400/40 shadow-[0_0_18px_rgba(20,184,166,0.2)]" : "w-full sm:w-[calc(50%-5px)] border-white/10")}>
                                <div className="absolute -top-8 -right-8 w-24 h-24 bg-teal-500/20 blur-[40px] pointer-events-none rounded-full" />
                                <PreviewBubble
                                    preview={<SlowmoPreview />}
                                    description="AI-interpolated frames for buttery smooth slow motion"
                                    width={200}>
                                    <div className="flex items-center gap-2 relative">
                                        <Clock size={14} className="text-teal-300" />
                                        <div className="flex flex-col">
                                            <span className="text-xs font-black text-white leading-none">Optical-Flow Slow-Mo</span>
                                            <span className="text-[9px] text-white/40">Buttery interpolated slow motion</span>
                                        </div>
                                    </div>
                                </PreviewBubble>
                                <EffectPolicyControl label=""
                                    policy={settings.smoothSlowmoPolicy ?? 'off'}
                                    onPolicy={(p) => update({ smoothSlowmoPolicy: p })}
                                    renderPreview={(p) => <SlowmoPolicyPreview policy={p} />} />
                            </motion.div>

                            {/* RGB Split */}
                            <motion.div layout transition={{ layout: { duration: 0.3 } }} className={clsx("relative overflow-hidden rounded-xl border p-3.5 space-y-2.5 transition-all bg-gradient-to-br from-fuchsia-600/10 via-white/5 to-cyan-600/10",
                                "w-full sm:w-[calc(50%-5px)]",
                                (settings.rgbSplitPolicy ?? 'off') !== 'off' ? "border-fuchsia-400/40 shadow-[0_0_18px_rgba(217,70,239,0.2)]" : "border-white/10")}>
                                <div className="absolute -top-8 -right-8 w-24 h-24 bg-fuchsia-500/20 blur-[40px] pointer-events-none rounded-full" />
                                <PreviewBubble
                                    preview={<RgbSplitPreview />}
                                    description="Chromatic channel separation — glitchy RGB offset"
                                    width={200}>
                                    <div className="flex items-center gap-2 relative">
                                        <Palette size={14} className="text-fuchsia-300" />
                                        <div className="flex flex-col">
                                            <span className="text-xs font-black text-white leading-none">RGB Split</span>
                                            <span className="text-[9px] text-white/40">Chromatic separation</span>
                                        </div>
                                    </div>
                                </PreviewBubble>
                                <EffectPolicyControl label=""
                                    policy={settings.rgbSplitPolicy ?? 'off'}
                                    onPolicy={(p) => update({ rgbSplitPolicy: p })}
                                    renderPreview={(p) => <RgbSplitPolicyPreview policy={p} />}>
                                    <SliderControl label="Intensity" icon={Palette} value={settings.rgbSplitAmount ?? 50}
                                        min={0} max={100} step={5} unit="%" onChange={(v) => update({ rgbSplitAmount: v })} />
                                </EffectPolicyControl>
                            </motion.div>

                            {/* Hue Cycle */}
                            <motion.div layout transition={{ layout: { duration: 0.3 } }} className={clsx("relative overflow-hidden rounded-xl border p-3.5 space-y-2.5 transition-all bg-gradient-to-br from-violet-600/10 via-white/5 to-green-600/10",
                                "w-full sm:w-[calc(50%-5px)]",
                                (settings.hueCyclePolicy ?? 'off') !== 'off' ? "border-violet-400/40 shadow-[0_0_18px_rgba(139,92,246,0.2)]" : "border-white/10")}>
                                <div className="absolute -top-8 -right-8 w-24 h-24 bg-violet-500/20 blur-[40px] pointer-events-none rounded-full" />
                                <PreviewBubble
                                    preview={<HueCyclePreview />}
                                    description="Psychedelic colour rotation cycling through the spectrum"
                                    width={200}>
                                    <div className="flex items-center gap-2 relative">
                                        <Repeat size={14} className="text-violet-300" />
                                        <div className="flex flex-col">
                                            <span className="text-xs font-black text-white leading-none">Hue Cycle</span>
                                            <span className="text-[9px] text-white/40">Psychedelic colour rotation</span>
                                        </div>
                                    </div>
                                </PreviewBubble>
                                <EffectPolicyControl label=""
                                    policy={settings.hueCyclePolicy ?? 'off'}
                                    onPolicy={(p) => update({ hueCyclePolicy: p })}
                                    renderPreview={(p) => <HueCyclePolicyPreview policy={p} />}>
                                    <SliderControl label="Speed" icon={Repeat} value={settings.hueCycleSpeed ?? 50}
                                        min={0} max={100} step={5} unit="%" onChange={(v) => update({ hueCycleSpeed: v })} />
                                </EffectPolicyControl>
                            </motion.div>

                            {/* VHS / Retro */}
                            <motion.div layout transition={{ layout: { duration: 0.3 } }} className={clsx("relative overflow-hidden rounded-xl border p-3.5 space-y-2.5 transition-all bg-gradient-to-br from-orange-600/10 via-white/5 to-purple-600/10",
                                (settings.vhsPolicy ?? 'off') !== 'off' ? "w-full border-orange-400/40 shadow-[0_0_18px_rgba(249,115,22,0.2)]" : "w-full sm:w-[calc(50%-5px)] border-white/10")}>
                                <div className="absolute -top-8 -right-8 w-24 h-24 bg-orange-500/20 blur-[40px] pointer-events-none rounded-full" />
                                <PreviewBubble
                                    preview={<VhsPreview />}
                                    description="Retro scan lines + chromatic jitter + tape grain"
                                    width={200}>
                                    <div className="flex items-center gap-2 relative">
                                        <Video size={14} className="text-orange-300" />
                                        <div className="flex flex-col">
                                            <span className="text-xs font-black text-white leading-none">VHS / Retro</span>
                                            <span className="text-[9px] text-white/40">Retro chroma + grain</span>
                                        </div>
                                    </div>
                                </PreviewBubble>
                                <EffectPolicyControl label=""
                                    policy={settings.vhsPolicy ?? 'off'}
                                    onPolicy={(p) => update({ vhsPolicy: p })}
                                    renderPreview={(p) => <VhsPolicyPreview policy={p} />}>
                                    <SliderControl label="Amount" icon={Video} value={settings.vhsAmount ?? 50}
                                        min={0} max={100} step={5} unit="%" onChange={(v) => update({ vhsAmount: v })} />
                                </EffectPolicyControl>
                            </motion.div>

                            {/* Picture-in-Picture */}
                            <motion.div layout transition={{ layout: { duration: 0.3 } }} className={clsx("relative overflow-hidden rounded-xl border p-3.5 space-y-2.5 transition-all bg-gradient-to-br from-cyan-600/10 via-white/5 to-teal-600/10",
                                (settings.pipPolicy ?? 'off') !== 'off' ? "w-full border-cyan-400/40 shadow-[0_0_18px_rgba(6,182,212,0.2)]" : "w-full sm:w-[calc(50%-5px)] border-white/10")}>
                                <div className="absolute -top-8 -right-8 w-24 h-24 bg-cyan-500/20 blur-[40px] pointer-events-none rounded-full" />
                                <div className="flex items-center gap-2 relative">
                                    <PictureInPicture2 size={14} className="text-cyan-300" />
                                    <div className="flex flex-col">
                                        <span className="text-xs font-black text-white leading-none">Picture-in-Picture</span>
                                        <span className="text-[9px] text-white/40">Shrink clip to corner overlay</span>
                                    </div>
                                </div>
                                <EffectPolicyControl label=""
                                    policy={settings.pipPolicy ?? 'off'}
                                    onPolicy={(p) => update({ pipPolicy: p })}
                                    alwaysShowChildren>

                                    {/* Shape Selector */}
                                    <div className="space-y-1">
                                        <span className="text-[9px] font-bold uppercase text-white/30 tracking-wider">Shape</span>
                                        <div className="flex gap-1.5">
                                            {([
                                                { id: 'square' as const, label: '■', desc: 'Square (1:1)' },
                                                { id: 'vertical' as const, label: '▮', desc: 'Vertical (9:16)' },
                                                { id: 'horizontal' as const, label: '▬', desc: 'Horizontal (16:9)' },
                                            ]).map(s => (
                                                <button key={s.id} onClick={() => update({ pipShape: s.id })}
                                                    title={s.desc}
                                                    className={clsx("flex-1 py-1.5 rounded-lg text-sm font-bold border transition-all",
                                                        (settings.pipShape ?? 'square') === s.id
                                                            ? "bg-cyan-600/30 border-cyan-400/50 text-cyan-200"
                                                            : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10")}>
                                                    {s.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 3×3 Position Grid */}
                                    <div className="space-y-1">
                                        <span className="text-[9px] font-bold uppercase text-white/30 tracking-wider">
                                            {(settings.pipMovement ?? 'static') === 'static' ? 'Position' : 'Start Position'}
                                        </span>
                                        <div className="grid grid-cols-3 gap-1 w-fit">
                                            {([{p:1,l:'TL'},{p:2,l:'TC'},{p:3,l:'TR'},{p:4,l:'ML'},{p:5,l:'MC'},{p:6,l:'MR'},{p:7,l:'BL'},{p:8,l:'BC'},{p:9,l:'BR'}] as const).map(({p,l}) => {
                                                const movement = settings.pipMovement ?? 'static';
                                                const currentPath = settings.pipMovementPath ?? [];
                                                const isStart = (settings.pipPosition ?? 9) === p;
                                                const isOnPath = movement !== 'static' && currentPath.includes(p);
                                                return (
                                                    <button key={p} onClick={() => {
                                                        const upd: Partial<TrailerSettings> = { pipPosition: p as TrailerSettings['pipPosition'] };
                                                        // Auto-compute movement path when position changes
                                                        if (movement !== 'static') {
                                                            const paths: Record<string, Record<number, number[]>> = {
                                                                horizontal: { 1:[1,2,3], 2:[1,2,3], 3:[1,2,3], 4:[4,5,6], 5:[4,5,6], 6:[4,5,6], 7:[7,8,9], 8:[7,8,9], 9:[7,8,9] },
                                                                vertical:   { 1:[1,4,7], 2:[2,5,8], 3:[3,6,9], 4:[1,4,7], 5:[2,5,8], 6:[3,6,9], 7:[1,4,7], 8:[2,5,8], 9:[3,6,9] },
                                                                diagonal:   { 1:[1,5,9], 2:[1,5,9], 3:[3,5,7], 4:[1,5,9], 5:[1,5,9], 6:[3,5,7], 7:[3,5,7], 8:[3,5,7], 9:[1,5,9] },
                                                                random:     {},
                                                            };
                                                            const pathMap = paths[movement] || {};
                                                            upd.pipMovementPath = (pathMap[p] || [p]) as TrailerSettings['pipMovementPath'];
                                                        }
                                                        update(upd);
                                                    }}
                                                        className={clsx("w-7 h-7 rounded text-[8px] font-bold uppercase transition-all border",
                                                            isStart
                                                                ? "bg-cyan-600/30 border-cyan-400/50 text-cyan-200 shadow-[0_0_6px_rgba(6,182,212,0.3)]"
                                                                : isOnPath
                                                                    ? "bg-cyan-600/15 border-cyan-400/25 text-cyan-300/60"
                                                                    : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10")}>
                                                        {isOnPath && !isStart ? '•' : l}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Movement Mode */}
                                    <div className="space-y-1">
                                        <span className="text-[9px] font-bold uppercase text-white/30 tracking-wider">Movement (beat-synced)</span>
                                        <div className="flex flex-wrap gap-1">
                                            {([
                                                { id: 'static' as const, label: 'Static', icon: '▪' },
                                                { id: 'horizontal' as const, label: 'H-Line', icon: '↔' },
                                                { id: 'vertical' as const, label: 'V-Line', icon: '↕' },
                                                { id: 'diagonal' as const, label: 'Diagonal', icon: '⤢' },
                                                { id: 'random' as const, label: 'Random', icon: '⁕' },
                                            ]).map(m => (
                                                <button key={m.id} onClick={() => {
                                                    const pos = settings.pipPosition ?? 9;
                                                    const paths: Record<string, Record<number, number[]>> = {
                                                        horizontal: { 1:[1,2,3], 2:[1,2,3], 3:[1,2,3], 4:[4,5,6], 5:[4,5,6], 6:[4,5,6], 7:[7,8,9], 8:[7,8,9], 9:[7,8,9] },
                                                        vertical:   { 1:[1,4,7], 2:[2,5,8], 3:[3,6,9], 4:[1,4,7], 5:[2,5,8], 6:[3,6,9], 7:[1,4,7], 8:[2,5,8], 9:[3,6,9] },
                                                        diagonal:   { 1:[1,5,9], 2:[1,5,9], 3:[3,5,7], 4:[1,5,9], 5:[1,5,9], 6:[3,5,7], 7:[3,5,7], 8:[3,5,7], 9:[1,5,9] },
                                                    };
                                                    const pathMap = paths[m.id] || {};
                                                    update({
                                                        pipMovement: m.id,
                                                        pipMovementPath: m.id === 'static' ? [] : (pathMap[pos] || []) as TrailerSettings['pipMovementPath'],
                                                    });
                                                }}
                                                    className={clsx("px-2 py-1 rounded-lg text-[9px] font-bold border transition-all flex items-center gap-1",
                                                        (settings.pipMovement ?? 'static') === m.id
                                                            ? "bg-cyan-600/30 border-cyan-400/50 text-cyan-200"
                                                            : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10")}>
                                                    <span>{m.icon}</span> {m.label}
                                                </button>
                                            ))}
                                        </div>
                                        {(settings.pipMovement ?? 'static') !== 'static' && (
                                            <p className="text-[9px] text-cyan-300/50 italic">
                                                PIP moves along {settings.pipMovement === 'random' ? 'random positions' : `a ${settings.pipMovement} line`} on each beat
                                            </p>
                                        )}
                                    </div>

                                    <SliderControl label="Scale" icon={Layers} value={settings.pipScale ?? 30}
                                        min={20} max={50} step={1} unit="%" onChange={(v) => update({ pipScale: v })} />
                                    <SliderControl label="Border Radius" icon={Square} value={settings.pipBorderRadius ?? 8}
                                        min={0} max={20} step={1} unit="px" onChange={(v) => update({ pipBorderRadius: v })} />
                                </EffectPolicyControl>
                            </motion.div>

                            {/* Spin Effect */}
                            <motion.div layout transition={{ layout: { duration: 0.3 } }} className={clsx("relative overflow-hidden rounded-xl border p-3.5 space-y-2.5 transition-all bg-gradient-to-br from-pink-600/10 via-white/5 to-rose-600/10",
                                (settings.spinPolicy ?? 'off') !== 'off' ? "w-full border-pink-400/40 shadow-[0_0_18px_rgba(236,72,153,0.2)]" : "w-full sm:w-[calc(50%-5px)] border-white/10")}>
                                <div className="absolute -top-8 -right-8 w-24 h-24 bg-pink-500/20 blur-[40px] pointer-events-none rounded-full" />
                                <div className="flex items-center gap-2 relative">
                                    <RotateCw size={14} className="text-pink-300" />
                                    <div className="flex flex-col">
                                        <span className="text-xs font-black text-white leading-none">Spin</span>
                                        <span className="text-[9px] text-white/40">Rotational motion on clip</span>
                                    </div>
                                </div>
                                <EffectPolicyControl label=""
                                    policy={settings.spinPolicy ?? 'off'}
                                    onPolicy={(p) => update({ spinPolicy: p })}>
                                    <SliderControl label="Speed" icon={RotateCw} value={settings.spinSpeed ?? 50}
                                        min={0} max={100} step={5} unit="%" onChange={(v) => update({ spinSpeed: v })} />
                                </EffectPolicyControl>
                            </motion.div>

                            {/* Film Burn Effect */}
                            <motion.div layout transition={{ layout: { duration: 0.3 } }} className={clsx("relative overflow-hidden rounded-xl border p-3.5 space-y-2.5 transition-all bg-gradient-to-br from-red-600/10 via-white/5 to-orange-600/10",
                                (settings.filmBurnPolicy ?? 'off') !== 'off' ? "w-full border-red-400/40 shadow-[0_0_18px_rgba(239,68,68,0.2)]" : "w-full sm:w-[calc(50%-5px)] border-white/10")}>
                                <div className="absolute -top-8 -right-8 w-24 h-24 bg-red-500/20 blur-[40px] pointer-events-none rounded-full" />
                                <div className="flex items-center gap-2 relative">
                                    <Flame size={14} className="text-red-300" />
                                    <div className="flex flex-col">
                                        <span className="text-xs font-black text-white leading-none">Film Burn</span>
                                        <span className="text-[9px] text-white/40">Analog light leak overlay</span>
                                    </div>
                                </div>
                                <EffectPolicyControl label=""
                                    policy={settings.filmBurnPolicy ?? 'off'}
                                    onPolicy={(p) => update({ filmBurnPolicy: p })}>
                                    <SliderControl label="Intensity" icon={Flame} value={settings.filmBurnIntensity ?? 50}
                                        min={0} max={100} step={5} unit="%" onChange={(v) => update({ filmBurnIntensity: v })} />
                                </EffectPolicyControl>
                            </motion.div>

                            {/* Pixelize Effect */}
                            <motion.div layout transition={{ layout: { duration: 0.3 } }} className={clsx("relative overflow-hidden rounded-xl border p-3.5 space-y-2.5 transition-all bg-gradient-to-br from-lime-600/10 via-white/5 to-green-600/10",
                                (settings.pixelizePolicy ?? 'off') !== 'off' ? "w-full border-lime-400/40 shadow-[0_0_18px_rgba(132,204,22,0.2)]" : "w-full sm:w-[calc(50%-5px)] border-white/10")}>
                                <div className="absolute -top-8 -right-8 w-24 h-24 bg-lime-500/20 blur-[40px] pointer-events-none rounded-full" />
                                <div className="flex items-center gap-2 relative">
                                    <Grid3X3 size={14} className="text-lime-300" />
                                    <div className="flex flex-col">
                                        <span className="text-xs font-black text-white leading-none">Pixelize</span>
                                        <span className="text-[9px] text-white/40">Mosaic block pixelation</span>
                                    </div>
                                </div>
                                <EffectPolicyControl label=""
                                    policy={settings.pixelizePolicy ?? 'off'}
                                    onPolicy={(p) => update({ pixelizePolicy: p })}>
                                    <SliderControl label="Amount" icon={Grid3X3} value={settings.pixelizeAmount ?? 50}
                                        min={0} max={100} step={5} unit="%" onChange={(v) => update({ pixelizeAmount: v })} />
                                </EffectPolicyControl>
                            </motion.div>

                            {/* Whip Blur Effect */}
                            <motion.div layout transition={{ layout: { duration: 0.3 } }} className={clsx("relative overflow-hidden rounded-xl border p-3.5 space-y-2.5 transition-all bg-gradient-to-br from-sky-600/10 via-white/5 to-blue-600/10",
                                (settings.whipBlurPolicy ?? 'off') !== 'off' ? "w-full border-sky-400/40 shadow-[0_0_18px_rgba(14,165,233,0.2)]" : "w-full sm:w-[calc(50%-5px)] border-white/10")}>
                                <div className="absolute -top-8 -right-8 w-24 h-24 bg-sky-500/20 blur-[40px] pointer-events-none rounded-full" />
                                <div className="flex items-center gap-2 relative">
                                    <MoveHorizontal size={14} className="text-sky-300" />
                                    <div className="flex flex-col">
                                        <span className="text-xs font-black text-white leading-none">Whip Blur</span>
                                        <span className="text-[9px] text-white/40">Directional motion streak</span>
                                    </div>
                                </div>
                                <EffectPolicyControl label=""
                                    policy={settings.whipBlurPolicy ?? 'off'}
                                    onPolicy={(p) => update({ whipBlurPolicy: p })}>
                                    <SliderControl label="Amount" icon={MoveHorizontal} value={settings.whipBlurAmount ?? 50}
                                        min={0} max={100} step={5} unit="%" onChange={(v) => update({ whipBlurAmount: v })} />
                                </EffectPolicyControl>
                            </motion.div>

                            {/* Deflicker Effect */}
                            <motion.div layout transition={{ layout: { duration: 0.3 } }} className={clsx("relative overflow-hidden rounded-xl border p-3.5 space-y-2.5 transition-all bg-gradient-to-br from-yellow-600/10 via-white/5 to-amber-600/10",
                                (settings.deflickerPolicy ?? 'off') !== 'off' ? "w-full border-yellow-400/40 shadow-[0_0_18px_rgba(234,179,8,0.2)]" : "w-full sm:w-[calc(50%-5px)] border-white/10")}>
                                <div className="absolute -top-8 -right-8 w-24 h-24 bg-yellow-500/20 blur-[40px] pointer-events-none rounded-full" />
                                <div className="flex items-center gap-2 relative">
                                    <Zap size={14} className="text-yellow-300" />
                                    <div className="flex flex-col">
                                        <span className="text-xs font-black text-white leading-none">Deflicker</span>
                                        <span className="text-[9px] text-white/40">Remove LED/fluorescent flicker</span>
                                    </div>
                                </div>
                                <EffectPolicyControl label=""
                                    policy={settings.deflickerPolicy ?? 'off'}
                                    onPolicy={(p) => update({ deflickerPolicy: p })}>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-white/50">Layers</span>
                                        <div className="flex gap-1">
                                            {([3, 5] as const).map((v) => (
                                                <button key={v}
                                                    className={clsx("px-2 py-0.5 rounded text-[10px] font-bold transition-all",
                                                        (settings.deflickerLayers ?? 3) === v
                                                            ? "bg-yellow-500/30 text-yellow-200 border border-yellow-400/40"
                                                            : "bg-white/5 text-white/40 border border-white/10 hover:bg-white/10")}
                                                    onClick={() => update({ deflickerLayers: v })}>{v}</button>
                                            ))}
                                        </div>
                                    </div>
                                </EffectPolicyControl>
                            </motion.div>
                        </motion.div>


                </CollapsibleSection>

                {/* ═══════════════════════════ TRANSITIONS ═══════════════════════════ */}
                <CollapsibleSection title="Transitions" icon={Scissors} iconColor="text-amber-400" isOpen={transitionsOpen} onToggle={() => setTransitionsOpen(!transitionsOpen)}
                    badge={settings.transitionStyle !== 'cuts-only' ? (settings.transitionStyle ?? 'cuts-only') : undefined}
                    badgeColor="bg-amber-500/20 text-amber-300">

                    {/* Transition Style */}
                    <div className="space-y-1.5">
                        <span className="text-[9px] font-bold uppercase text-white/30 tracking-wider">Style</span>
                        <div className="flex gap-1.5">
                            {([
                                { id: 'cuts-only' as TransitionStyle, label: 'Cuts Only' },
                                { id: 'mixed' as TransitionStyle, label: 'Mixed' },
                                { id: 'transitions-only' as TransitionStyle, label: 'Transitions Only' },
                            ]).map(opt => (
                                <button key={opt.id} onClick={() => update({ transitionStyle: opt.id })}
                                    className={clsx("flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all border text-center",
                                        (settings.transitionStyle ?? 'cuts-only') === opt.id
                                            ? "bg-amber-600/20 border-amber-500/40 text-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.15)]"
                                            : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10")}>
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {(settings.transitionStyle ?? 'cuts-only') !== 'cuts-only' && (
                        <div className="space-y-4">
                            {/* Transition Duration */}
                            <SliderControl label="Transition Duration" icon={Clock} value={settings.transitionDurationMs ?? 200}
                                min={50} max={1000} step={25} unit="ms" onChange={(v) => update({ transitionDurationMs: v })} />

                            {/* Per-transition return info */}
                            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-amber-500/5 border border-amber-500/10">
                                <Repeat className="h-3 w-3 text-amber-400/60" />
                                <span className="text-[9px] text-white/40">
                                    Use the <strong className="text-amber-300/60">↩</strong> toggle on each transition card to enable return transitions (A → B → A) per type.
                                </span>
                            </div>

                            {/* Transition Type Grid by Category */}
                            <div className="space-y-4">
                                <span className="text-[9px] font-bold uppercase text-white/30 tracking-wider">Transition Types</span>
                                <div className="max-h-[400px] overflow-y-auto custom-scrollbar space-y-5 pr-1">
                                    {Object.entries(TRANSITION_CATEGORIES).map(([catKey, cat]) => {
                                        const allInCat = cat.transitions.every(t => (settings.transitionTypes ?? []).includes(t));
                                        return (
                                            <div key={catKey} className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[9px] font-bold uppercase text-white/20 tracking-widest">{cat.label}</span>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => {
                                                            const current = settings.transitionTypes ?? [];
                                                            const next = Array.from(new Set([...current, ...cat.transitions]));
                                                            update({ transitionTypes: next });
                                                        }} className="text-[8px] font-bold text-purple-400/60 hover:text-purple-300 transition-colors uppercase tracking-wider">Select All</button>
                                                        <button onClick={() => {
                                                            const current = settings.transitionTypes ?? [];
                                                            const next = current.filter(t => !cat.transitions.includes(t));
                                                            update({ transitionTypes: next });
                                                        }} className="text-[8px] font-bold text-white/20 hover:text-white/40 transition-colors uppercase tracking-wider">Clear</button>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-4 gap-2">
                                                    {cat.transitions.map(t => {
                                                        const isActive = (settings.transitionTypes ?? []).includes(t);
                                                        const returnMap = settings.returnTransitionMap ?? {};
                                                        const returnEntry = returnMap[t];
                                                        return (
                                                            <TransitionCard
                                                                key={t}
                                                                type={t}
                                                                selected={isActive}
                                                                onToggle={() => {
                                                                    const current = settings.transitionTypes ?? [];
                                                                    const next = isActive ? current.filter(x => x !== t) : [...current, t];
                                                                    update({ transitionTypes: next });
                                                                }}
                                                                returnEnabled={isActive ? (returnEntry?.enabled ?? false) : undefined}
                                                                returnFrequency={returnEntry?.frequency ?? 100}
                                                                onReturnToggle={() => {
                                                                    const map = { ...(settings.returnTransitionMap ?? {}) };
                                                                    const current = map[t];
                                                                    map[t] = { enabled: !(current?.enabled ?? false), frequency: current?.frequency ?? 100 };
                                                                    update({ returnTransitionMap: map });
                                                                }}
                                                                onReturnFrequency={(freq) => {
                                                                    const map = { ...(settings.returnTransitionMap ?? {}) };
                                                                    map[t] = { enabled: map[t]?.enabled ?? true, frequency: freq };
                                                                    update({ returnTransitionMap: map });
                                                                }}
                                                                transitionParams={settings.transitionParams?.[t]}
                                                                onParamsChange={(newParams) => {
                                                                    update({
                                                                        transitionParams: {
                                                                            ...(settings.transitionParams ?? {}),
                                                                            [t]: newParams,
                                                                        },
                                                                    });
                                                                }}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {(settings.transitionTypes?.length ?? 0) > 0 && (
                                    <button onClick={() => update({ transitionTypes: [] })}
                                        className="text-[9px] font-bold text-amber-400/50 hover:text-amber-300 transition-colors uppercase tracking-wider">
                                        Clear All ({settings.transitionTypes?.length} selected)
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </CollapsibleSection>

                {/* ═══════════════════════════ COLOR ═══════════════════════════ */}
                <CollapsibleSection title="Color" icon={Palette} iconColor="text-pink-400" isOpen={colorOpen} onToggle={() => setColorOpen(!colorOpen)}
                    badge={(() => {
                        const n = [colorState.v.on, colorState.d.on, colorState.n.on].filter(Boolean).length;
                        return n > 0 ? `${n} active` : undefined;
                    })()}
                    badgeColor="bg-pink-500/20 text-pink-300">

                    <p className="text-[10px] text-white/35 mb-2">Vibrance, Desaturation and Noir only — each maps to the Sequence page colour grade.</p>
                    <div className="space-y-2">
                        {COLOR_OPTS.map((opt) => {
                            const st = colorState[opt.k];
                            return (
                                <div key={opt.k} className={clsx('rounded-lg border p-2.5 transition-colors', st.on ? 'border-pink-500/40 bg-pink-500/[0.07]' : 'border-white/5 bg-white/[0.02]')}>
                                    <button onClick={() => setColor({ [opt.k]: { on: !st.on, amt: st.amt } } as any)} className="w-full flex items-center justify-between">
                                        <span className="text-left">
                                            <span className="block text-[11px] font-bold text-white/80">{opt.label}</span>
                                            <span className="block text-[9px] text-white/35">{opt.desc}</span>
                                        </span>
                                        <span className={clsx('w-9 h-5 rounded-full relative transition-colors flex-shrink-0', st.on ? 'bg-pink-500' : 'bg-black border border-white/20')}>
                                            <span className={clsx('w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform', st.on ? 'translate-x-4' : 'translate-x-0.5')} />
                                        </span>
                                    </button>
                                    {st.on && (
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className="text-[9px] text-white/40 w-10">Amount</span>
                                            <input type="range" min={0} max={1} step={0.05} value={st.amt}
                                                onChange={(e) => setColor({ [opt.k]: { on: true, amt: parseFloat(e.target.value) } } as any)}
                                                className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-pink-500" />
                                            <span className="text-[9px] font-mono text-white/45 w-8 text-right">{Math.round(st.amt * 100)}%</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </CollapsibleSection>




                {/* ── Visual FX (bottom, final styling pass) ── */}
                <div className="border border-white/5 rounded-xl bg-black/20 p-5 space-y-3">
                    <span className="text-sm font-bold text-white flex items-center gap-2">
                        <Eye size={14} className="text-indigo-400" /> Visual FX
                    </span>
                    <div className="grid grid-cols-4 gap-2">
                        {([
                            { id: 'filmGrainAmount', label: 'Film Grain', icon: 'film', description: 'Analog film texture overlay', min: 0, max: 25, step: 1 },
                            { id: 'vignetteAmount', label: 'Vignette', icon: 'aperture', description: 'Edge darkening for focus', min: 0, max: 100, step: 5, unit: '%' },
                            { id: 'chromaticAmount', label: 'Chromatic', icon: 'scan', description: 'RGB edge fringing', min: 0, max: 20, step: 1, unit: 'px' },
                            { id: 'letterbox', label: 'Letterbox', icon: 'monitor', description: 'Cinematic 2.39:1 bars', min: 0, max: 1, step: 1 },
                        ] as const).map(opt => (
                            <VisualFXCard
                                key={opt.id}
                                id={opt.id}
                                label={opt.label}
                                icon={opt.icon}
                                description={opt.description}
                                value={
                                    opt.id === 'letterbox'
                                        ? (settings.letterboxEnabled ? 1 : 0)
                                        : ((settings as any)[opt.id] ?? 0)
                                }
                                min={opt.min}
                                max={opt.max}
                                step={opt.step}
                                unit={'unit' in opt ? opt.unit : undefined}
                                onChange={(v) => {
                                    if (opt.id === 'letterbox') {
                                        update({ letterboxEnabled: v === 1 });
                                    } else {
                                        update({ [opt.id]: v });
                                    }
                                }}
                            />
                        ))}
                    </div>
                </div>



                {/* Generate Button */}
                <div className="flex justify-end pt-4 border-t border-white/5">
                    <motion.button 
                        onClick={handleGenerate} 
                        disabled={videoCount === 0}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={`px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:shadow-[0_0_30px_rgba(168,85,247,0.6)] flex items-center gap-2 disabled:opacity-50 disabled:grayscale ${isExporting ? 'bg-gradient-to-r from-amber-600 to-purple-600' : 'bg-gradient-to-r from-purple-600 to-blue-600'}`}>
                        {isExporting ? (
                            <><Layers size={16} /> Add to Queue</>
                        ) : (
                            <><PlayCircle size={16} /> Generate Edit</>
                        )}
                    </motion.button>
                </div>
            </div>
        </div>
        {/* Edit Logic Sidebar */}
        <EditLogicSidebar mode="settings" />
        </div>
    );
};
