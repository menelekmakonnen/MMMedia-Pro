import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    User, Film, Clock, Sparkles, ChevronRight, ChevronLeft,
    Plus, X, Tag, ScanFace, Video, Wand2, Clapperboard,
} from 'lucide-react';
import clsx from 'clsx';
import { useMediaStore, type MediaFile } from '../../store/mediaStore';
import type {
    PerformanceGenre,
    ShowreelSettings,
    ShowreelClipMeta,
    ShotType,
    EmotionType,
} from '../../lib/showreelGenerator';
import { DEFAULT_SHOWREEL_SETTINGS } from '../../lib/showreelGenerator';

// ─── Constants ────────────────────────────────────────────────────────────────

const GENRES: { id: PerformanceGenre; label: string; emoji: string }[] = [
    { id: 'drama', label: 'Drama', emoji: '🎭' },
    { id: 'comedy', label: 'Comedy', emoji: '😂' },
    { id: 'action', label: 'Action', emoji: '💥' },
    { id: 'thriller', label: 'Thriller', emoji: '🔪' },
    { id: 'romance', label: 'Romance', emoji: '💕' },
    { id: 'sci-fi', label: 'Sci-Fi', emoji: '🚀' },
    { id: 'horror', label: 'Horror', emoji: '👻' },
    { id: 'documentary', label: 'Documentary', emoji: '📹' },
];

const STEP_LABELS = ['Actor Selection', 'Genre & Style', 'Preview & Generate'] as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Clip thumbnail card with actor assignment. */
const ClipCard: React.FC<{
    file: MediaFile;
    actor: string | null;
    onAssign: (actor: string) => void;
    onRemove: () => void;
    isSelected: boolean;
    onToggle: () => void;
}> = ({ file, actor, onAssign, onRemove, isSelected, onToggle }) => {
    const [editing, setEditing] = useState(false);
    const [inputVal, setInputVal] = useState(actor ?? '');

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            className={clsx(
                'relative group rounded-lg overflow-hidden border transition-all cursor-pointer',
                isSelected
                    ? 'border-emerald-500/50 shadow-[0_0_12px_rgba(52,211,153,0.2)]'
                    : 'border-white/8 hover:border-white/20',
            )}
            onClick={onToggle}
        >
            {/* Thumbnail placeholder */}
            <div className="aspect-video bg-gradient-to-br from-white/5 to-white/[0.02] flex items-center justify-center">
                <Video size={20} className="text-white/20" />
            </div>

            {/* Filename */}
            <div className="px-2 py-1.5 bg-black/40">
                <p className="text-[10px] text-white/60 truncate font-medium">{file.filename}</p>
                <p className="text-[9px] text-white/30 font-mono">{file.duration.toFixed(1)}s</p>
            </div>

            {/* Actor tag */}
            {actor ? (
                <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-purple-600/80 backdrop-blur-sm rounded-full px-2 py-0.5">
                    <User size={9} className="text-purple-200" />
                    <span className="text-[9px] font-bold text-white">{actor}</span>
                    <button
                        onClick={(e) => { e.stopPropagation(); onRemove(); }}
                        className="ml-0.5 hover:text-red-300 transition-colors"
                    >
                        <X size={8} />
                    </button>
                </div>
            ) : editing ? (
                <div
                    className="absolute top-1.5 left-1.5 right-1.5 flex gap-1"
                    onClick={(e) => e.stopPropagation()}
                >
                    <input
                        autoFocus
                        value={inputVal}
                        onChange={(e) => setInputVal(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && inputVal.trim()) {
                                onAssign(inputVal.trim());
                                setEditing(false);
                            }
                            if (e.key === 'Escape') setEditing(false);
                        }}
                        onBlur={() => {
                            if (inputVal.trim()) onAssign(inputVal.trim());
                            setEditing(false);
                        }}
                        placeholder="Actor name…"
                        className="flex-1 min-w-0 bg-black/80 backdrop-blur-sm border border-white/20 rounded px-1.5 py-0.5 text-[10px] text-white outline-none focus:border-purple-500/60"
                    />
                </div>
            ) : (
                <button
                    onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                    className="absolute top-1.5 left-1.5 bg-black/60 backdrop-blur-sm rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity border border-white/10 hover:border-purple-500/40"
                >
                    <Tag size={10} className="text-white/60" />
                </button>
            )}

            {/* Selection indicator */}
            {isSelected && (
                <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                    <span className="text-[8px] text-white font-bold">✓</span>
                </div>
            )}
        </motion.div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

interface ShowreelWizardProps {
    onGenerate: (settings: ShowreelSettings, selectedFileIds: string[], actorAssignments: Record<string, string>) => void;
}

export const ShowreelWizard: React.FC<ShowreelWizardProps> = ({ onGenerate }) => {
    const { files } = useMediaStore();
    const videoFiles = useMemo(() => files.filter((f) => f.type === 'video'), [files]);

    // ── Wizard state ──
    const [step, setStep] = useState(0);

    // Step 1: actor assignment
    const [actorAssignments, setActorAssignments] = useState<Record<string, string>>({});
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkActor, setBulkActor] = useState('');

    // Step 2: genre & style
    const [settings, setSettings] = useState<ShowreelSettings>({ ...DEFAULT_SHOWREEL_SETTINGS });
    const [selectedGenres, setSelectedGenres] = useState<PerformanceGenre[]>([]);

    // ── Derived values ──
    const assignedClips = useMemo(
        () => videoFiles.filter((f) => actorAssignments[f.id]),
        [videoFiles, actorAssignments],
    );
    const totalFootageSeconds = useMemo(
        () => assignedClips.reduce((sum, f) => sum + f.duration, 0),
        [assignedClips],
    );
    const estimatedReelMinutes = Math.min(settings.targetDuration / 60, totalFootageSeconds / 60);

    const update = (patch: Partial<ShowreelSettings>) =>
        setSettings((s) => ({ ...s, ...patch }));

    // ── Handlers ──
    const handleAssign = (fileId: string, actor: string) =>
        setActorAssignments((p) => ({ ...p, [fileId]: actor }));

    const handleRemoveAssignment = (fileId: string) =>
        setActorAssignments((p) => {
            const next = { ...p };
            delete next[fileId];
            return next;
        });

    const handleToggleSelect = (fileId: string) =>
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(fileId)) next.delete(fileId);
            else next.add(fileId);
            return next;
        });

    const handleBulkAssign = () => {
        if (!bulkActor.trim()) return;
        setActorAssignments((prev) => {
            const next = { ...prev };
            for (const id of selectedIds) next[id] = bulkActor.trim();
            return next;
        });
        setSelectedIds(new Set());
        setBulkActor('');
    };

    const handleAutoDetect = () => {
        // Placeholder for face-detection integration
        // For now, show a toast-like indicator
    };

    const toggleGenre = (g: PerformanceGenre) => {
        setSelectedGenres((prev) => {
            const next = prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g];
            update({ genreFilter: next.length > 0 ? next : null });
            return next;
        });
    };

    const handleGenerate = () => {
        const finalSettings: ShowreelSettings = {
            ...settings,
            genreFilter: selectedGenres.length > 0 ? selectedGenres : null,
            actorName: settings.actorName || Object.values(actorAssignments)[0] || 'Actor',
            targetActor: settings.actorName || Object.values(actorAssignments)[0] || '',
        };
        onGenerate(finalSettings, assignedClips.map((f) => f.id), actorAssignments);
    };

    const canAdvance = step === 0 ? assignedClips.length > 0 : true;

    // ── Render ──
    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto p-8 flex flex-col gap-8">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg shadow-lg">
                        <Clapperboard size={20} className="text-white drop-shadow-md" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                            Showreel Generator
                            <span className="text-[10px] uppercase bg-white/10 px-1.5 py-0.5 rounded text-purple-300">Beta</span>
                        </h2>
                        <p className="text-xs text-white/50">Assemble a professional actor showreel from your media library.</p>
                    </div>
                </div>

                {/* Step indicator */}
                <div className="flex items-center gap-2">
                    {STEP_LABELS.map((label, i) => (
                        <React.Fragment key={label}>
                            {i > 0 && <div className="flex-1 h-px bg-white/10" />}
                            <button
                                onClick={() => { if (i <= step || canAdvance) setStep(i); }}
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
                    {step === 0 && (
                        <motion.div
                            key="step-0"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.25 }}
                            className="space-y-5"
                        >
                            {/* Actor Selection Header */}
                            <div className="relative overflow-hidden rounded-xl border border-white/8 bg-gradient-to-br from-purple-600/10 via-black/30 to-blue-600/10 p-5">
                                <div className="absolute -top-10 -right-10 w-40 h-40 bg-purple-500/15 blur-[60px] pointer-events-none rounded-full" />
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Step 1</span>
                                        <h3 className="text-sm font-bold text-white">Tag Clips by Actor</h3>
                                        <p className="text-[10px] text-white/40 mt-0.5">
                                            Assign actor names to clips. Select multiple + bulk assign, or click each thumbnail.
                                        </p>
                                    </div>
                                    <motion.button
                                        whileHover={{ scale: 1.04 }}
                                        whileTap={{ scale: 0.96 }}
                                        onClick={handleAutoDetect}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-purple-500/10 hover:border-purple-500/30 text-xs font-bold text-white/60 hover:text-white transition-all"
                                    >
                                        <ScanFace size={14} className="text-purple-400" />
                                        Auto-Detect Faces
                                    </motion.button>
                                </div>

                                {/* Bulk assign bar */}
                                {selectedIds.size > 0 && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        className="flex items-center gap-2 pt-3 border-t border-white/5"
                                    >
                                        <span className="text-[10px] text-purple-300 font-bold">
                                            {selectedIds.size} selected
                                        </span>
                                        <input
                                            value={bulkActor}
                                            onChange={(e) => setBulkActor(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleBulkAssign(); }}
                                            placeholder="Actor name for all…"
                                            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-purple-500/50"
                                        />
                                        <motion.button
                                            whileHover={{ scale: 1.04 }}
                                            whileTap={{ scale: 0.96 }}
                                            onClick={handleBulkAssign}
                                            disabled={!bulkActor.trim()}
                                            className="px-3 py-1.5 rounded-lg bg-purple-600/40 border border-purple-500/40 text-[10px] font-bold text-white disabled:opacity-30"
                                        >
                                            Assign All
                                        </motion.button>
                                    </motion.div>
                                )}
                            </div>

                            {/* Clip grid */}
                            <div className="grid grid-cols-4 gap-2.5">
                                <AnimatePresence>
                                    {videoFiles.map((file) => (
                                        <ClipCard
                                            key={file.id}
                                            file={file}
                                            actor={actorAssignments[file.id] ?? null}
                                            onAssign={(actor) => handleAssign(file.id, actor)}
                                            onRemove={() => handleRemoveAssignment(file.id)}
                                            isSelected={selectedIds.has(file.id)}
                                            onToggle={() => handleToggleSelect(file.id)}
                                        />
                                    ))}
                                </AnimatePresence>
                            </div>

                            {videoFiles.length === 0 && (
                                <div className="text-center py-16 text-white/30 text-sm">
                                    No video files imported. Add media to begin.
                                </div>
                            )}
                        </motion.div>
                    )}

                    {step === 1 && (
                        <motion.div
                            key="step-1"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.25 }}
                            className="space-y-5"
                        >
                            {/* Genre / Style panel */}
                            <div className="relative overflow-hidden rounded-xl border border-white/8 bg-black/30 p-5">
                                <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-500/10 blur-[60px] pointer-events-none rounded-full" />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Step 2</span>
                                <h3 className="text-sm font-bold text-white mb-1">Genre & Style</h3>
                                <p className="text-[10px] text-white/40 mb-4">
                                    Select the performance genres to emphasise. Leave empty for all genres.
                                </p>

                                <div className="flex flex-wrap gap-2 mb-6">
                                    {GENRES.map((g) => (
                                        <button
                                            key={g.id}
                                            onClick={() => toggleGenre(g.id)}
                                            className={clsx(
                                                'px-3 py-2 rounded-lg text-xs font-bold border transition-all',
                                                selectedGenres.includes(g.id)
                                                    ? 'bg-purple-600/30 border-purple-500/50 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.15)]'
                                                    : 'bg-white/5 border-white/8 text-white/40 hover:bg-white/10 hover:text-white/60',
                                            )}
                                        >
                                            {g.emoji} {g.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Actor Name */}
                                <div className="space-y-2 mb-5">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-white/50 flex items-center gap-1.5">
                                        <User size={11} /> Actor Name (for title card)
                                    </label>
                                    <input
                                        value={settings.actorName}
                                        onChange={(e) => update({ actorName: e.target.value })}
                                        placeholder="e.g. Jane Doe"
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/20 outline-none focus:border-purple-500/50"
                                    />
                                </div>

                                {/* Target Duration */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-white/70">
                                        <span className="flex items-center gap-1.5"><Clock size={12} /> Target Duration</span>
                                        <span className="text-purple-400 font-mono">
                                            {settings.targetDuration}s ({(settings.targetDuration / 60).toFixed(1)}m)
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min={30}
                                        max={180}
                                        step={5}
                                        value={settings.targetDuration}
                                        onChange={(e) => update({ targetDuration: parseInt(e.target.value) })}
                                        className="w-full accent-purple-500 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer"
                                    />
                                    <div className="flex justify-between text-[10px] text-white/30 font-mono">
                                        <span>30s</span><span>180s</span>
                                    </div>
                                </div>

                                {/* Include Name Plate */}
                                <div className="mt-5 flex items-center gap-3">
                                    <button
                                        onClick={() => update({ includeNamePlate: !settings.includeNamePlate })}
                                        className={clsx(
                                            'w-9 h-5 rounded-full transition-all relative',
                                            settings.includeNamePlate ? 'bg-emerald-500' : 'bg-white/15',
                                        )}
                                    >
                                        <div className={clsx(
                                            'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
                                            settings.includeNamePlate ? 'left-[18px]' : 'left-0.5',
                                        )} />
                                    </button>
                                    <span className="text-xs text-white/60 font-medium">Include name plate / title card</span>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div
                            key="step-2"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.25 }}
                            className="space-y-5"
                        >
                            {/* Preview & Generate */}
                            <div className="relative overflow-hidden rounded-xl border border-white/8 bg-gradient-to-br from-emerald-600/10 via-black/30 to-purple-600/10 p-6">
                                <div className="absolute -top-10 -left-10 w-40 h-40 bg-emerald-500/15 blur-[60px] pointer-events-none rounded-full" />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Step 3</span>
                                <h3 className="text-sm font-bold text-white mb-4">Preview & Generate</h3>

                                {/* Stats grid */}
                                <div className="grid grid-cols-3 gap-3 mb-6">
                                    {[
                                        {
                                            label: 'Clips Selected',
                                            value: assignedClips.length.toString(),
                                            sub: `of ${videoFiles.length} total`,
                                            color: 'text-purple-400',
                                        },
                                        {
                                            label: 'Total Footage',
                                            value: `${(totalFootageSeconds / 60).toFixed(1)}m`,
                                            sub: `${totalFootageSeconds.toFixed(0)}s`,
                                            color: 'text-blue-400',
                                        },
                                        {
                                            label: 'Est. Showreel',
                                            value: `${estimatedReelMinutes.toFixed(1)}m`,
                                            sub: `target ${(settings.targetDuration / 60).toFixed(1)}m`,
                                            color: 'text-emerald-400',
                                        },
                                    ].map((stat) => (
                                        <div key={stat.label} className="bg-black/30 rounded-lg border border-white/5 p-4 text-center">
                                            <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold">{stat.label}</div>
                                            <div className={clsx('text-2xl font-black mt-1', stat.color)}>{stat.value}</div>
                                            <div className="text-[10px] text-white/30 mt-0.5">{stat.sub}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Settings summary */}
                                <div className="bg-black/20 rounded-lg border border-white/5 p-4 space-y-2 mb-6">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">Settings Summary</span>
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                                        <div className="flex justify-between">
                                            <span className="text-white/40">Actor</span>
                                            <span className="text-white font-medium">{settings.actorName || '—'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-white/40">Duration</span>
                                            <span className="text-white font-medium">{settings.targetDuration}s</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-white/40">Genres</span>
                                            <span className="text-white font-medium">
                                                {selectedGenres.length > 0 ? selectedGenres.join(', ') : 'All'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-white/40">Name Plate</span>
                                            <span className="text-white font-medium">{settings.includeNamePlate ? 'Yes' : 'No'}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Generate button */}
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={handleGenerate}
                                    disabled={assignedClips.length === 0}
                                    className={clsx(
                                        'w-full py-4 rounded-xl text-sm font-black uppercase tracking-wider transition-all',
                                        assignedClips.length > 0
                                            ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-[0_0_30px_rgba(168,85,247,0.3)] hover:shadow-[0_0_40px_rgba(168,85,247,0.5)]'
                                            : 'bg-white/5 text-white/20 cursor-not-allowed',
                                    )}
                                >
                                    <span className="flex items-center justify-center gap-2">
                                        <Sparkles size={16} />
                                        Generate Showreel
                                    </span>
                                </motion.button>
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
                    {step < 2 && (
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => setStep((s) => Math.min(2, s + 1))}
                            disabled={!canAdvance}
                            className={clsx(
                                'flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold transition-all',
                                canAdvance
                                    ? 'bg-purple-600/30 border border-purple-500/40 text-purple-200 hover:bg-purple-600/50'
                                    : 'bg-white/5 border border-white/8 text-white/20 cursor-not-allowed',
                            )}
                        >
                            Next <ChevronRight size={14} />
                        </motion.button>
                    )}
                </div>
            </div>
        </div>
    );
};
