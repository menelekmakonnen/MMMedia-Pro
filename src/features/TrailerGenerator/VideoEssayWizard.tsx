import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Mic, Image, Settings, Sparkles, ChevronRight, ChevronLeft,
    Upload, FileAudio, Tag, Plus, X, SlidersHorizontal, ToggleLeft,
    ToggleRight, Film, Search, Wand2,
} from 'lucide-react';
import clsx from 'clsx';
import { useMediaStore, type MediaFile } from '../../store/mediaStore';
import type {
    VideoEssaySettings,
    NarrationSegment,
} from '../../lib/videoEssayGenerator';
import { DEFAULT_ESSAY_SETTINGS } from '../../lib/videoEssayGenerator';

// ─── Constants ────────────────────────────────────────────────────────────────

const STEP_LABELS = ['Narration', 'B-Roll Pool', 'Settings', 'Generate'] as const;

const TRANSITION_OPTIONS: { id: VideoEssaySettings['brollTransition']; label: string }[] = [
    { id: 'dissolve', label: 'Dissolve' },
    { id: 'fade', label: 'Fade' },
    { id: 'cut', label: 'Cut' },
];

// ─── Slider Sub-component ────────────────────────────────────────────────────

const Slider: React.FC<{
    label: string;
    icon: React.ElementType;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
    unit?: string;
}> = ({ label, icon: Icon, value, min, max, step: stepVal, onChange, unit = '' }) => (
    <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-white/70">
            <span className="flex items-center gap-1.5"><Icon size={12} /> {label}</span>
            <span className="text-purple-400 font-mono">{value.toFixed(1)}{unit}</span>
        </div>
        <input
            type="range"
            min={min}
            max={max}
            step={stepVal}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full accent-purple-500 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-white/30 font-mono">
            <span>{min}{unit}</span><span>{max}{unit}</span>
        </div>
    </div>
);

// ─── B-Roll Thumbnail Card ───────────────────────────────────────────────────

const BRollCard: React.FC<{
    file: MediaFile;
    tags: string[];
    onAddTag: (tag: string) => void;
    onRemoveTag: (tag: string) => void;
}> = ({ file, tags, onAddTag, onRemoveTag }) => {
    const [editing, setEditing] = useState(false);
    const [inputVal, setInputVal] = useState('');

    const handleSubmit = () => {
        const trimmed = inputVal.trim().toLowerCase();
        if (trimmed && !tags.includes(trimmed)) {
            onAddTag(trimmed);
        }
        setInputVal('');
        setEditing(false);
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-lg overflow-hidden border border-white/8 hover:border-white/20 transition-all group"
        >
            {/* Thumbnail */}
            <div className="aspect-video bg-gradient-to-br from-white/5 to-white/[0.02] flex items-center justify-center relative">
                {file.type === 'image' ? (
                    <Image size={18} className="text-white/20" />
                ) : (
                    <Film size={18} className="text-white/20" />
                )}
                <span className="absolute bottom-1 right-1 text-[9px] font-mono text-white/40 bg-black/60 px-1 rounded">
                    {file.duration.toFixed(1)}s
                </span>
            </div>

            {/* Info */}
            <div className="px-2 py-1.5 bg-black/40 space-y-1.5">
                <p className="text-[10px] text-white/60 truncate font-medium">{file.filename}</p>

                {/* Tags */}
                <div className="flex flex-wrap gap-1">
                    {tags.map((tag) => (
                        <span
                            key={tag}
                            className="inline-flex items-center gap-0.5 bg-purple-600/20 text-purple-300 text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                        >
                            {tag}
                            <button
                                onClick={() => onRemoveTag(tag)}
                                className="hover:text-red-300 transition-colors"
                            >
                                <X size={7} />
                            </button>
                        </span>
                    ))}

                    {editing ? (
                        <input
                            autoFocus
                            value={inputVal}
                            onChange={(e) => setInputVal(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSubmit();
                                if (e.key === 'Escape') { setEditing(false); setInputVal(''); }
                            }}
                            onBlur={handleSubmit}
                            placeholder="keyword…"
                            className="bg-black/60 border border-white/15 rounded px-1.5 py-0.5 text-[9px] text-white w-16 outline-none focus:border-purple-500/50"
                        />
                    ) : (
                        <button
                            onClick={() => setEditing(true)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-white/10"
                        >
                            <Plus size={9} className="text-white/40" />
                        </button>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

interface VideoEssayWizardProps {
    onGenerate: (settings: VideoEssaySettings, narrationPath: string | null, transcription: string, brollTags: Record<string, string[]>) => void;
}

export const VideoEssayWizard: React.FC<VideoEssayWizardProps> = ({ onGenerate }) => {
    const { files } = useMediaStore();
    const mediaFiles = useMemo(
        () => files.filter((f) => f.type === 'video' || f.type === 'image'),
        [files],
    );

    // ── Wizard state ──
    const [step, setStep] = useState(0);

    // Step 1: Narration
    const [narrationMode, setNarrationMode] = useState<'file' | 'text'>('file');
    const [narrationPath, setNarrationPath] = useState<string | null>(null);
    const [narrationName, setNarrationName] = useState<string>('');
    const [transcription, setTranscription] = useState('');

    // Step 2: B-Roll Pool
    const [brollTags, setBrollTags] = useState<Record<string, string[]>>({});
    const [searchQuery, setSearchQuery] = useState('');

    // Step 3: Settings
    const [settings, setSettings] = useState<VideoEssaySettings>({ ...DEFAULT_ESSAY_SETTINGS });

    const update = (patch: Partial<VideoEssaySettings>) =>
        setSettings((s) => ({ ...s, ...patch }));

    // ── Handlers ──
    const handlePickNarration = async () => {
        if (!window.ipcRenderer?.selectFiles) return;
        const result = await window.ipcRenderer.selectFiles('audio');
        if (!result.success || !result.files?.length) return;
        const picked = result.files[0];
        setNarrationPath(picked.path);
        setNarrationName(picked.filename);
    };

    const handleAddTag = useCallback((fileId: string, tag: string) => {
        setBrollTags((prev) => ({
            ...prev,
            [fileId]: [...(prev[fileId] ?? []), tag],
        }));
    }, []);

    const handleRemoveTag = useCallback((fileId: string, tag: string) => {
        setBrollTags((prev) => ({
            ...prev,
            [fileId]: (prev[fileId] ?? []).filter((t) => t !== tag),
        }));
    }, []);

    const filteredMedia = useMemo(() => {
        if (!searchQuery.trim()) return mediaFiles;
        const q = searchQuery.toLowerCase();
        return mediaFiles.filter((f) => {
            if (f.filename.toLowerCase().includes(q)) return true;
            const tags = brollTags[f.id] ?? [];
            return tags.some((t) => t.includes(q));
        });
    }, [mediaFiles, searchQuery, brollTags]);

    const taggedCount = useMemo(
        () => Object.values(brollTags).filter((t) => t.length > 0).length,
        [brollTags],
    );

    const hasNarration = narrationMode === 'file' ? !!narrationPath : transcription.trim().length > 0;

    const handleGenerate = () => {
        onGenerate(
            settings,
            narrationMode === 'file' ? narrationPath : null,
            transcription,
            brollTags,
        );
    };

    // ── Render ──
    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto p-8 flex flex-col gap-8">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg shadow-lg">
                        <Film size={20} className="text-white drop-shadow-md" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                            Video Essay Generator
                            <span className="text-[10px] uppercase bg-white/10 px-1.5 py-0.5 rounded text-blue-300">Beta</span>
                        </h2>
                        <p className="text-xs text-white/50">Auto-assemble B-roll under narration with keyword matching.</p>
                    </div>
                </div>

                {/* Step indicator */}
                <div className="flex items-center gap-2">
                    {STEP_LABELS.map((label, i) => (
                        <React.Fragment key={label}>
                            {i > 0 && <div className="flex-1 h-px bg-white/10" />}
                            <button
                                onClick={() => setStep(i)}
                                className={clsx(
                                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border',
                                    step === i
                                        ? 'bg-purple-600/30 border-purple-500/50 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.2)]'
                                        : i < step
                                            ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-300'
                                            : 'bg-white/5 border-white/8 text-white/30',
                                )}
                            >
                                <span className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[9px]">
                                    {i < step ? '✓' : i + 1}
                                </span>
                                {label}
                            </button>
                        </React.Fragment>
                    ))}
                </div>

                {/* Step content */}
                <AnimatePresence mode="wait">
                    {/* ── STEP 0: Narration ── */}
                    {step === 0 && (
                        <motion.div
                            key="step-0"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.25 }}
                            className="space-y-5"
                        >
                            <div className="relative overflow-hidden rounded-xl border border-white/8 bg-gradient-to-br from-blue-600/10 via-black/30 to-purple-600/10 p-5">
                                <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-500/15 blur-[60px] pointer-events-none rounded-full" />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Step 1</span>
                                <h3 className="text-sm font-bold text-white mb-1">Narration Source</h3>
                                <p className="text-[10px] text-white/40 mb-4">
                                    Upload a narration audio file, or paste a transcription if you already have one.
                                </p>

                                {/* Mode toggle */}
                                <div className="flex gap-2 mb-5">
                                    {([
                                        { id: 'file' as const, label: 'Audio File', icon: FileAudio },
                                        { id: 'text' as const, label: 'Transcription', icon: Mic },
                                    ]).map((m) => (
                                        <button
                                            key={m.id}
                                            onClick={() => setNarrationMode(m.id)}
                                            className={clsx(
                                                'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold uppercase border transition-all',
                                                narrationMode === m.id
                                                    ? 'bg-blue-600/20 border-blue-500/40 text-blue-200'
                                                    : 'bg-white/5 border-white/8 text-white/40 hover:bg-white/10',
                                            )}
                                        >
                                            <m.icon size={14} /> {m.label}
                                        </button>
                                    ))}
                                </div>

                                {narrationMode === 'file' ? (
                                    <div className="space-y-3">
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={handlePickNarration}
                                            className="w-full flex items-center justify-center gap-2 py-4 border border-dashed border-white/20 hover:border-blue-500/50 hover:bg-blue-500/10 rounded-xl text-xs font-bold text-white/50 hover:text-white transition-all"
                                        >
                                            <Upload size={14} />
                                            {narrationPath ? 'Change Audio File' : 'Select Narration Audio'}
                                        </motion.button>

                                        {narrationPath && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="flex items-center gap-2 bg-emerald-600/10 border border-emerald-500/20 rounded-lg px-3 py-2"
                                            >
                                                <FileAudio size={14} className="text-emerald-400" />
                                                <span className="text-xs text-emerald-300 font-medium truncate flex-1">
                                                    {narrationName}
                                                </span>
                                                <button
                                                    onClick={() => { setNarrationPath(null); setNarrationName(''); }}
                                                    className="text-white/30 hover:text-red-400 transition-colors"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </motion.div>
                                        )}
                                    </div>
                                ) : (
                                    <textarea
                                        value={transcription}
                                        onChange={(e) => setTranscription(e.target.value)}
                                        placeholder="Paste or type your narration transcription here…"
                                        rows={8}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white placeholder:text-white/20 outline-none focus:border-blue-500/50 resize-none custom-scrollbar"
                                    />
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* ── STEP 1: B-Roll Pool ── */}
                    {step === 1 && (
                        <motion.div
                            key="step-1"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.25 }}
                            className="space-y-5"
                        >
                            <div className="relative overflow-hidden rounded-xl border border-white/8 bg-black/30 p-5">
                                <div className="absolute -top-10 -right-10 w-40 h-40 bg-purple-500/10 blur-[60px] pointer-events-none rounded-full" />
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Step 2</span>
                                        <h3 className="text-sm font-bold text-white">B-Roll Pool</h3>
                                        <p className="text-[10px] text-white/40">Tag your media with keywords for automatic narration matching.</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded-full">
                                            {taggedCount}/{mediaFiles.length} tagged
                                        </span>
                                    </div>
                                </div>

                                {/* Search */}
                                <div className="relative mb-4">
                                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                                    <input
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Filter by filename or tag…"
                                        className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-white/20 outline-none focus:border-purple-500/50"
                                    />
                                </div>

                                {/* Grid */}
                                <div className="grid grid-cols-4 gap-2.5 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                                    {filteredMedia.map((file) => (
                                        <BRollCard
                                            key={file.id}
                                            file={file}
                                            tags={brollTags[file.id] ?? []}
                                            onAddTag={(tag) => handleAddTag(file.id, tag)}
                                            onRemoveTag={(tag) => handleRemoveTag(file.id, tag)}
                                        />
                                    ))}
                                </div>

                                {filteredMedia.length === 0 && (
                                    <div className="text-center py-12 text-white/30 text-xs">
                                        {mediaFiles.length === 0 ? 'No media files imported.' : 'No files match your search.'}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* ── STEP 2: Settings ── */}
                    {step === 2 && (
                        <motion.div
                            key="step-2"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.25 }}
                            className="space-y-5"
                        >
                            <div className="relative overflow-hidden rounded-xl border border-white/8 bg-black/30 p-5 space-y-5">
                                <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-500/10 blur-[60px] pointer-events-none rounded-full" />
                                <div>
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Step 3</span>
                                    <h3 className="text-sm font-bold text-white mb-1">Essay Settings</h3>
                                </div>

                                {/* Pause Threshold */}
                                <Slider
                                    label="Pause Threshold"
                                    icon={SlidersHorizontal}
                                    value={settings.minBRollDuration}
                                    min={1}
                                    max={15}
                                    step={0.5}
                                    onChange={(v) => update({ minBRollDuration: v })}
                                    unit="s"
                                />

                                {/* Min B-Roll Duration — re-purposed as Max */}
                                <Slider
                                    label="Max B-Roll Duration"
                                    icon={SlidersHorizontal}
                                    value={settings.maxBRollDuration}
                                    min={3}
                                    max={30}
                                    step={1}
                                    onChange={(v) => update({ maxBRollDuration: v })}
                                    unit="s"
                                />

                                {/* Ducking Level */}
                                <Slider
                                    label="Ducking Level"
                                    icon={SlidersHorizontal}
                                    value={settings.duckedVolume}
                                    min={0}
                                    max={100}
                                    step={5}
                                    onChange={(v) => update({ duckedVolume: v })}
                                    unit="%"
                                />

                                {/* B-Roll Transition */}
                                <div className="space-y-2">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">B-Roll Transition</span>
                                    <div className="flex gap-2">
                                        {TRANSITION_OPTIONS.map((t) => (
                                            <button
                                                key={t.id}
                                                onClick={() => update({ brollTransition: t.id })}
                                                className={clsx(
                                                    'flex-1 py-2 rounded-lg text-[10px] font-bold uppercase border transition-all',
                                                    settings.brollTransition === t.id
                                                        ? 'bg-purple-600/30 border-purple-500/50 text-purple-200'
                                                        : 'bg-white/5 border-white/8 text-white/40 hover:bg-white/10',
                                                )}
                                            >
                                                {t.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Ken Burns Toggle */}
                                <div className="flex items-center justify-between py-2">
                                    <div>
                                        <span className="text-xs text-white/60 font-medium">Ken Burns on Images</span>
                                        <p className="text-[10px] text-white/30">Apply slow zoom/pan to static images</p>
                                    </div>
                                    <button
                                        onClick={() => update({ kenBurnsOnImages: !settings.kenBurnsOnImages })}
                                        className={clsx(
                                            'w-9 h-5 rounded-full transition-all relative',
                                            settings.kenBurnsOnImages ? 'bg-emerald-500' : 'bg-white/15',
                                        )}
                                    >
                                        <div
                                            className={clsx(
                                                'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
                                                settings.kenBurnsOnImages ? 'left-[18px]' : 'left-0.5',
                                            )}
                                        />
                                    </button>
                                </div>

                                {/* Duck B-Roll Audio Toggle */}
                                <div className="flex items-center justify-between py-2">
                                    <div>
                                        <span className="text-xs text-white/60 font-medium">Duck B-Roll Audio</span>
                                        <p className="text-[10px] text-white/30">Lower B-roll audio under narration</p>
                                    </div>
                                    <button
                                        onClick={() => update({ duckBRollAudio: !settings.duckBRollAudio })}
                                        className={clsx(
                                            'w-9 h-5 rounded-full transition-all relative',
                                            settings.duckBRollAudio ? 'bg-emerald-500' : 'bg-white/15',
                                        )}
                                    >
                                        <div
                                            className={clsx(
                                                'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
                                                settings.duckBRollAudio ? 'left-[18px]' : 'left-0.5',
                                            )}
                                        />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ── STEP 3: Generate ── */}
                    {step === 3 && (
                        <motion.div
                            key="step-3"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.25 }}
                            className="space-y-5"
                        >
                            <div className="relative overflow-hidden rounded-xl border border-white/8 bg-gradient-to-br from-emerald-600/10 via-black/30 to-blue-600/10 p-6">
                                <div className="absolute -top-10 -left-10 w-40 h-40 bg-emerald-500/15 blur-[60px] pointer-events-none rounded-full" />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Step 4</span>
                                <h3 className="text-sm font-bold text-white mb-4">Summary & Generate</h3>

                                {/* Stats */}
                                <div className="grid grid-cols-3 gap-3 mb-6">
                                    {[
                                        {
                                            label: 'Narration',
                                            value: narrationMode === 'file' ? (narrationPath ? '✓' : '—') : (transcription.trim() ? '✓' : '—'),
                                            sub: narrationMode === 'file' ? (narrationName || 'No file') : `${transcription.length} chars`,
                                            color: hasNarration ? 'text-emerald-400' : 'text-red-400',
                                        },
                                        {
                                            label: 'B-Roll Pool',
                                            value: `${mediaFiles.length}`,
                                            sub: `${taggedCount} tagged`,
                                            color: 'text-blue-400',
                                        },
                                        {
                                            label: 'Settings',
                                            value: settings.brollTransition,
                                            sub: `Ken Burns: ${settings.kenBurnsOnImages ? 'On' : 'Off'}`,
                                            color: 'text-purple-400',
                                        },
                                    ].map((stat) => (
                                        <div key={stat.label} className="bg-black/30 rounded-lg border border-white/5 p-4 text-center">
                                            <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold">{stat.label}</div>
                                            <div className={clsx('text-xl font-black mt-1', stat.color)}>{stat.value}</div>
                                            <div className="text-[10px] text-white/30 mt-0.5">{stat.sub}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Settings summary */}
                                <div className="bg-black/20 rounded-lg border border-white/5 p-4 space-y-2 mb-6">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">Configuration</span>
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                                        <div className="flex justify-between">
                                            <span className="text-white/40">Min B-Roll</span>
                                            <span className="text-white font-medium">{settings.minBRollDuration}s</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-white/40">Max B-Roll</span>
                                            <span className="text-white font-medium">{settings.maxBRollDuration}s</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-white/40">Transition</span>
                                            <span className="text-white font-medium capitalize">{settings.brollTransition}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-white/40">Ducked Vol.</span>
                                            <span className="text-white font-medium">{settings.duckedVolume}%</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Generate button */}
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={handleGenerate}
                                    disabled={!hasNarration}
                                    className={clsx(
                                        'w-full py-4 rounded-xl text-sm font-black uppercase tracking-wider transition-all',
                                        hasNarration
                                            ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-[0_0_30px_rgba(59,130,246,0.3)] hover:shadow-[0_0_40px_rgba(59,130,246,0.5)]'
                                            : 'bg-white/5 text-white/20 cursor-not-allowed',
                                    )}
                                >
                                    <span className="flex items-center justify-center gap-2">
                                        <Sparkles size={16} />
                                        Generate Video Essay
                                    </span>
                                </motion.button>

                                {!hasNarration && (
                                    <p className="text-[10px] text-amber-400/70 text-center mt-2">
                                        ⚠ Please add narration (Step 1) before generating.
                                    </p>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Navigation */}
                <div className="flex justify-between">
                    <button
                        onClick={() => setStep((s) => Math.max(0, s - 1))}
                        disabled={step === 0}
                        className={clsx(
                            'flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all border',
                            step > 0
                                ? 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                                : 'border-transparent text-white/20 cursor-not-allowed',
                        )}
                    >
                        <ChevronLeft size={14} /> Back
                    </button>
                    {step < 3 && (
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => setStep((s) => Math.min(3, s + 1))}
                            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold bg-purple-600/30 border border-purple-500/40 text-purple-200 hover:bg-purple-600/50 transition-all"
                        >
                            Next <ChevronRight size={14} />
                        </motion.button>
                    )}
                </div>
            </div>
        </div>
    );
};
