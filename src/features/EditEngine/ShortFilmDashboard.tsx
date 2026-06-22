import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LayoutGrid, Film, BarChart3, Clock, Plus, Trash2, GripVertical,
    ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Info,
    MapPin, Sun, Clapperboard, ArrowUpDown, Layers,
} from 'lucide-react';
import clsx from 'clsx';
import { v4 as uuidv4 } from 'uuid';
import type {
    ActStructure,
    ActDefinition,
    SceneDefinition,
    LocationType,
    TimeOfDay,
    CoverageAnalysis,
    CoverageType,
    PacingAnalysis,
} from '../../lib/shortFilmAssistant';
import { STRUCTURE_TEMPLATES, createScene } from '../../lib/shortFilmAssistant';

// ─── Constants ────────────────────────────────────────────────────────────────

const STRUCTURE_OPTIONS: { id: ActStructure; label: string; icon: string }[] = [
    { id: 'three-act', label: 'Three-Act', icon: '③' },
    { id: 'five-act', label: 'Five-Act', icon: '⑤' },
    { id: 'nonlinear', label: 'Nonlinear', icon: '⟳' },
    { id: 'vignette', label: 'Vignette', icon: '◇' },
];

const LOCATION_TYPES: { id: LocationType; label: string }[] = [
    { id: 'interior', label: 'Interior' },
    { id: 'exterior', label: 'Exterior' },
    { id: 'int-ext', label: 'Int/Ext' },
];

const TIME_OF_DAY_OPTIONS: { id: TimeOfDay; label: string; emoji: string }[] = [
    { id: 'dawn', label: 'Dawn', emoji: '🌅' },
    { id: 'morning', label: 'Morning', emoji: '☀️' },
    { id: 'noon', label: 'Noon', emoji: '🌞' },
    { id: 'afternoon', label: 'Afternoon', emoji: '🌤' },
    { id: 'evening', label: 'Evening', emoji: '🌇' },
    { id: 'night', label: 'Night', emoji: '🌙' },
];

const COVERAGE_COLORS: Record<string, string> = {
    'master': 'bg-blue-500',
    'medium': 'bg-purple-500',
    'close-up': 'bg-pink-500',
    'cutaway': 'bg-amber-500',
    'reaction': 'bg-emerald-500',
    'establishing': 'bg-cyan-500',
    'insert': 'bg-orange-500',
};

// ─── Tab type ─────────────────────────────────────────────────────────────────

type DashboardTab = 'structure' | 'scenes' | 'coverage' | 'pacing';

// ─── Act Proportion Bar ──────────────────────────────────────────────────────

const ActProportionBar: React.FC<{ acts: ActDefinition[] }> = ({ acts }) => {
    const COLORS = [
        'bg-purple-500', 'bg-blue-500', 'bg-emerald-500',
        'bg-amber-500', 'bg-pink-500', 'bg-cyan-500', 'bg-orange-500',
    ];
    return (
        <div className="space-y-2">
            <div className="flex h-6 rounded-lg overflow-hidden border border-white/10">
                {acts.map((act, i) => (
                    <motion.div
                        key={act.name}
                        initial={{ width: 0 }}
                        animate={{ width: `${act.proportion * 100}%` }}
                        transition={{ duration: 0.5, delay: i * 0.1 }}
                        className={clsx(
                            COLORS[i % COLORS.length],
                            'flex items-center justify-center text-[8px] font-bold text-white/90 relative group',
                            i > 0 && 'border-l border-black/30',
                        )}
                    >
                        {act.proportion >= 0.15 && (
                            <span className="truncate px-1">{act.name}</span>
                        )}
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-black/90 backdrop-blur-sm border border-white/10 rounded px-2 py-1 text-[9px] text-white/80 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                            {act.name}: {(act.proportion * 100).toFixed(0)}%
                        </div>
                    </motion.div>
                ))}
            </div>
            <div className="flex justify-between text-[9px] text-white/30">
                {acts.map((act) => (
                    <span key={act.name}>{act.name} ({(act.proportion * 100).toFixed(0)}%)</span>
                ))}
            </div>
        </div>
    );
};

// ─── Scene Row ────────────────────────────────────────────────────────────────

const SceneRow: React.FC<{
    scene: SceneDefinition;
    actNames: string[];
    onUpdate: (id: string, patch: Partial<SceneDefinition>) => void;
    onRemove: (id: string) => void;
    onMoveUp: (id: string) => void;
    onMoveDown: (id: string) => void;
    isFirst: boolean;
    isLast: boolean;
}> = ({ scene, actNames, onUpdate, onRemove, onMoveUp, onMoveDown, isFirst, isLast }) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8, height: 0 }}
            className="border border-white/8 rounded-lg bg-black/20 overflow-hidden"
        >
            {/* Collapsed header */}
            <div
                className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                <GripVertical size={12} className="text-white/20 shrink-0" />

                {/* Scene name (editable inline) */}
                <input
                    value={scene.name}
                    onChange={(e) => onUpdate(scene.id, { name: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Scene name…"
                    className="flex-1 bg-transparent text-xs text-white font-medium outline-none placeholder:text-white/20 min-w-0"
                />

                {/* Act badge */}
                <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full font-bold shrink-0">
                    {actNames[scene.act] ?? `Act ${scene.act + 1}`}
                </span>

                {/* Location type badge */}
                <span className="text-[9px] bg-blue-500/15 text-blue-300 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
                    {scene.locationType}
                </span>

                {/* Duration */}
                <span className="text-[10px] text-white/40 font-mono shrink-0">{scene.targetDuration}s</span>

                {/* Clip count badge */}
                <span className={clsx(
                    'text-[9px] px-1.5 py-0.5 rounded-full font-bold shrink-0',
                    scene.assignedClipIds.length > 0
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-white/10 text-white/30',
                )}>
                    {scene.assignedClipIds.length} clips
                </span>

                {/* Reorder */}
                <div className="flex flex-col shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                        disabled={isFirst}
                        onClick={() => onMoveUp(scene.id)}
                        className="text-white/20 hover:text-white/60 disabled:opacity-20 transition-colors"
                    >
                        <ChevronUp size={10} />
                    </button>
                    <button
                        disabled={isLast}
                        onClick={() => onMoveDown(scene.id)}
                        className="text-white/20 hover:text-white/60 disabled:opacity-20 transition-colors"
                    >
                        <ChevronDown size={10} />
                    </button>
                </div>

                {/* Remove */}
                <button
                    onClick={(e) => { e.stopPropagation(); onRemove(scene.id); }}
                    className="text-white/20 hover:text-red-400 transition-colors shrink-0"
                >
                    <Trash2 size={12} />
                </button>

                <ChevronDown size={12} className={clsx('text-white/30 transition-transform shrink-0', expanded && 'rotate-180')} />
            </div>

            {/* Expanded detail */}
            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 pt-2 space-y-3 border-t border-white/5">
                            <div className="grid grid-cols-3 gap-3">
                                {/* Location type */}
                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold uppercase tracking-wider text-white/40 flex items-center gap-1">
                                        <MapPin size={9} /> Location
                                    </label>
                                    <select
                                        value={scene.locationType}
                                        onChange={(e) => onUpdate(scene.id, { locationType: e.target.value as LocationType })}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white outline-none"
                                    >
                                        {LOCATION_TYPES.map((l) => (
                                            <option key={l.id} value={l.id}>{l.label}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Time of day */}
                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold uppercase tracking-wider text-white/40 flex items-center gap-1">
                                        <Sun size={9} /> Time of Day
                                    </label>
                                    <select
                                        value={scene.timeOfDay}
                                        onChange={(e) => onUpdate(scene.id, { timeOfDay: e.target.value as TimeOfDay })}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white outline-none"
                                    >
                                        {TIME_OF_DAY_OPTIONS.map((t) => (
                                            <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Target duration slider */}
                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold uppercase tracking-wider text-white/40 flex items-center gap-1">
                                        <Clock size={9} /> Duration
                                        <span className="ml-auto text-white/60 font-mono">{scene.targetDuration}s</span>
                                    </label>
                                    <input
                                        type="range"
                                        min={5}
                                        max={300}
                                        step={5}
                                        value={scene.targetDuration}
                                        onChange={(e) => onUpdate(scene.id, { targetDuration: parseInt(e.target.value) })}
                                        className="w-full accent-purple-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                                    />
                                </div>
                            </div>

                            {/* Description */}
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold uppercase tracking-wider text-white/40">Description</label>
                                <textarea
                                    value={scene.description}
                                    onChange={(e) => onUpdate(scene.id, { description: e.target.value })}
                                    placeholder="Scene description…"
                                    rows={2}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white placeholder:text-white/20 outline-none resize-none focus:border-purple-500/40"
                                />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

// ─── Coverage Bar ─────────────────────────────────────────────────────────────

const CoverageBar: React.FC<{ score: number }> = ({ score }) => {
    const color = score >= 75 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500';
    const textColor = score >= 75 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-red-400';

    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${score}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className={clsx(color, 'h-full rounded-full')}
                />
            </div>
            <span className={clsx('text-[10px] font-bold font-mono w-8 text-right', textColor)}>
                {score}
            </span>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

interface ShortFilmDashboardProps {
    onAssemblyCut?: (scenes: SceneDefinition[], structure: ActStructure) => void;
}

export const ShortFilmDashboard: React.FC<ShortFilmDashboardProps> = ({ onAssemblyCut }) => {
    const [activeTab, setActiveTab] = useState<DashboardTab>('structure');

    // ── Structure ──
    const [structure, setStructure] = useState<ActStructure>('three-act');
    const template = STRUCTURE_TEMPLATES[structure];

    // ── Scenes ──
    const [scenes, setScenes] = useState<SceneDefinition[]>(() => [
        createScene(0, 0, 'Opening Scene', 30),
    ]);

    // ── Target duration ──
    const [targetDuration, setTargetDuration] = useState(600); // 10 min default

    // ── Derived ──
    const actNames = useMemo(() => template.acts.map((a) => a.name), [template]);

    const totalSceneDuration = useMemo(
        () => scenes.reduce((sum, s) => sum + s.targetDuration, 0),
        [scenes],
    );

    // Mock coverage analysis (in production this would come from analyzeSceneCoverage)
    const coverageData = useMemo<Record<string, CoverageAnalysis>>(() => {
        const result: Record<string, CoverageAnalysis> = {};
        for (const scene of scenes) {
            const clipCount = scene.assignedClipIds.length;
            const baseScore = Math.min(100, clipCount * 25);
            const missingTypes: CoverageType[] = [];
            const availableTypes: CoverageType[] = [];

            if (clipCount === 0) {
                missingTypes.push('master', 'medium', 'close-up', 'cutaway', 'reaction', 'establishing', 'insert');
            } else {
                if (clipCount >= 1) availableTypes.push('master');
                if (clipCount >= 2) availableTypes.push('medium');
                if (clipCount >= 3) availableTypes.push('close-up');
                const allTypes: CoverageType[] = ['master', 'medium', 'close-up', 'cutaway', 'reaction', 'establishing', 'insert'];
                for (const t of allTypes) {
                    if (!availableTypes.includes(t)) missingTypes.push(t);
                }
            }

            const suggestions: string[] = [];
            if (!availableTypes.includes('master')) suggestions.push('Add a master/wide shot.');
            if (!availableTypes.includes('medium')) suggestions.push('Add a medium shot for dialogue.');
            if (!availableTypes.includes('close-up')) suggestions.push('Add a close-up for emotional emphasis.');

            result[scene.id] = {
                sceneId: scene.id,
                availableCoverage: availableTypes,
                missingCoverage: missingTypes,
                coverageScore: baseScore,
                suggestions,
            };
        }
        return result;
    }, [scenes]);

    // Mock pacing data
    const pacingData = useMemo(() => {
        const actDurations = template.acts.map((actDef, idx) => {
            const actScenes = scenes.filter((s) => s.act === idx);
            const actual = actScenes.reduce((sum, s) => sum + s.targetDuration, 0);
            const target = targetDuration * actDef.proportion;
            return {
                act: actDef.name,
                duration: actual,
                targetDuration: Math.round(target),
                variance: target > 0 ? (actual - target) / target : 0,
            };
        });
        return actDurations;
    }, [scenes, template, targetDuration]);

    // ── Handlers ──
    const handleUpdateScene = useCallback((id: string, patch: Partial<SceneDefinition>) => {
        setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    }, []);

    const handleRemoveScene = useCallback((id: string) => {
        setScenes((prev) => prev.filter((s) => s.id !== id));
    }, []);

    const handleMoveScene = useCallback((id: string, direction: 'up' | 'down') => {
        setScenes((prev) => {
            const idx = prev.findIndex((s) => s.id === id);
            if (idx < 0) return prev;
            const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
            if (swapIdx < 0 || swapIdx >= prev.length) return prev;
            const next = [...prev];
            [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
            return next.map((s, i) => ({ ...s, order: i }));
        });
    }, []);

    const handleAddScene = (actIndex: number) => {
        const actScenes = scenes.filter((s) => s.act === actIndex);
        const newScene = createScene(actIndex, actScenes.length, '', 30);
        setScenes((prev) => [...prev, newScene]);
    };

    // ── Tabs ──
    const TABS: { id: DashboardTab; label: string; icon: React.ElementType }[] = [
        { id: 'structure', label: 'Structure', icon: LayoutGrid },
        { id: 'scenes', label: 'Scene Manager', icon: Film },
        { id: 'coverage', label: 'Coverage', icon: Layers },
        { id: 'pacing', label: 'Pacing', icon: BarChart3 },
    ];

    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto p-8 flex flex-col gap-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-emerald-500 to-blue-600 rounded-lg shadow-lg">
                        <Clapperboard size={20} className="text-white drop-shadow-md" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                            Short Film Assistant
                            <span className="text-[10px] uppercase bg-white/10 px-1.5 py-0.5 rounded text-emerald-300">AI</span>
                        </h2>
                        <p className="text-xs text-white/50">Structure, scene management, coverage analysis, and pacing tools.</p>
                    </div>
                </div>

                {/* Tab bar */}
                <div className="flex gap-1 bg-black/30 rounded-xl p-1 border border-white/5">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={clsx(
                                'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all',
                                activeTab === tab.id
                                    ? 'bg-emerald-600/20 text-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.1)]'
                                    : 'text-white/30 hover:text-white/50 hover:bg-white/5',
                            )}
                        >
                            <tab.icon size={13} /> {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                <AnimatePresence mode="wait">
                    {/* ── STRUCTURE ── */}
                    {activeTab === 'structure' && (
                        <motion.div
                            key="structure"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-5"
                        >
                            <div className="relative overflow-hidden rounded-xl border border-white/8 bg-gradient-to-br from-purple-600/10 via-black/30 to-blue-600/10 p-5">
                                <div className="absolute -top-10 -right-10 w-40 h-40 bg-purple-500/15 blur-[60px] pointer-events-none rounded-full" />

                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Act Structure</span>
                                <p className="text-[10px] text-white/40 mb-4">Select the narrative framework for your film.</p>

                                {/* Radio group */}
                                <div className="grid grid-cols-2 gap-2 mb-6">
                                    {STRUCTURE_OPTIONS.map((opt) => {
                                        const tmpl = STRUCTURE_TEMPLATES[opt.id];
                                        return (
                                            <button
                                                key={opt.id}
                                                onClick={() => setStructure(opt.id)}
                                                className={clsx(
                                                    'flex flex-col items-start p-4 rounded-xl border transition-all text-left',
                                                    structure === opt.id
                                                        ? 'bg-purple-600/20 border-purple-500/40 shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                                                        : 'bg-white/[0.03] border-white/8 hover:bg-white/5',
                                                )}
                                            >
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-lg">{opt.icon}</span>
                                                    <span className="text-xs font-bold text-white">{opt.label}</span>
                                                </div>
                                                <p className="text-[10px] text-white/40">{tmpl.description}</p>
                                                <div className="text-[9px] text-purple-300/60 mt-1">
                                                    {tmpl.acts.length} acts
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Proportion bars */}
                                <div className="space-y-3">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">Act Proportions</span>
                                    <ActProportionBar acts={template.acts} />
                                </div>

                                {/* Act descriptions */}
                                <div className="mt-5 space-y-2">
                                    {template.acts.map((act, i) => (
                                        <div key={act.name} className="flex items-start gap-3 bg-black/20 rounded-lg px-3 py-2 border border-white/5">
                                            <span className="text-[10px] font-bold text-purple-400 mt-0.5 shrink-0">
                                                Act {i + 1}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <span className="text-xs font-bold text-white">{act.name}</span>
                                                <p className="text-[10px] text-white/40">{act.description}</p>
                                            </div>
                                            <span className="text-[10px] text-white/30 font-mono shrink-0">
                                                {(act.proportion * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ── SCENE MANAGER ── */}
                    {activeTab === 'scenes' && (
                        <motion.div
                            key="scenes"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-4"
                        >
                            {/* Scene stats bar */}
                            <div className="flex items-center gap-4 bg-black/30 rounded-lg border border-white/5 px-4 py-3">
                                <div>
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">Scenes</span>
                                    <div className="text-lg font-black text-white">{scenes.length}</div>
                                </div>
                                <div className="w-px h-8 bg-white/10" />
                                <div>
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">Total Duration</span>
                                    <div className="text-lg font-black text-purple-400 font-mono">
                                        {(totalSceneDuration / 60).toFixed(1)}m
                                    </div>
                                </div>
                                <div className="w-px h-8 bg-white/10" />
                                <div>
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">Target</span>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="range"
                                            min={60}
                                            max={1800}
                                            step={30}
                                            value={targetDuration}
                                            onChange={(e) => setTargetDuration(parseInt(e.target.value))}
                                            className="w-24 accent-purple-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                                        />
                                        <span className="text-xs text-white/50 font-mono">{(targetDuration / 60).toFixed(0)}m</span>
                                    </div>
                                </div>
                            </div>

                            {/* Scenes grouped by act */}
                            {template.acts.map((actDef, actIdx) => {
                                const actScenes = scenes
                                    .filter((s) => s.act === actIdx)
                                    .sort((a, b) => a.order - b.order);

                                return (
                                    <div key={actDef.name} className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
                                                Act {actIdx + 1}: {actDef.name}
                                            </span>
                                            <button
                                                onClick={() => handleAddScene(actIdx)}
                                                className="flex items-center gap-1 text-[10px] font-bold text-white/40 hover:text-emerald-400 transition-colors"
                                            >
                                                <Plus size={11} /> Add Scene
                                            </button>
                                        </div>

                                        <AnimatePresence>
                                            {actScenes.map((scene, i) => (
                                                <SceneRow
                                                    key={scene.id}
                                                    scene={scene}
                                                    actNames={actNames}
                                                    onUpdate={handleUpdateScene}
                                                    onRemove={handleRemoveScene}
                                                    onMoveUp={(id) => handleMoveScene(id, 'up')}
                                                    onMoveDown={(id) => handleMoveScene(id, 'down')}
                                                    isFirst={i === 0}
                                                    isLast={i === actScenes.length - 1}
                                                />
                                            ))}
                                        </AnimatePresence>

                                        {actScenes.length === 0 && (
                                            <div className="text-center py-6 text-white/20 text-[10px] border border-dashed border-white/10 rounded-lg">
                                                No scenes in this act
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </motion.div>
                    )}

                    {/* ── COVERAGE ── */}
                    {activeTab === 'coverage' && (
                        <motion.div
                            key="coverage"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-4"
                        >
                            <div className="relative overflow-hidden rounded-xl border border-white/8 bg-black/30 p-5">
                                <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-500/10 blur-[60px] pointer-events-none rounded-full" />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Coverage Analysis</span>
                                <p className="text-[10px] text-white/40 mb-4">
                                    Shot coverage scores and suggestions for each scene.
                                </p>

                                <div className="space-y-3">
                                    {scenes.map((scene) => {
                                        const cov = coverageData[scene.id];
                                        if (!cov) return null;

                                        return (
                                            <div key={scene.id} className="bg-black/20 rounded-lg border border-white/5 p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-white flex-1 min-w-0 truncate">
                                                        {scene.name || 'Untitled Scene'}
                                                    </span>
                                                    <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full font-bold shrink-0">
                                                        {actNames[scene.act]}
                                                    </span>
                                                </div>

                                                {/* Coverage bar */}
                                                <CoverageBar score={cov.coverageScore} />

                                                {/* Coverage type dots */}
                                                <div className="flex gap-1.5 flex-wrap">
                                                    {(['master', 'medium', 'close-up', 'cutaway', 'reaction', 'establishing', 'insert'] as CoverageType[]).map((type) => (
                                                        <span
                                                            key={type}
                                                            className={clsx(
                                                                'text-[8px] px-1.5 py-0.5 rounded font-bold uppercase',
                                                                cov.availableCoverage.includes(type)
                                                                    ? clsx(COVERAGE_COLORS[type], 'text-white/90')
                                                                    : 'bg-white/5 text-white/20',
                                                            )}
                                                        >
                                                            {type}
                                                        </span>
                                                    ))}
                                                </div>

                                                {/* Suggestions */}
                                                {cov.suggestions.length > 0 && (
                                                    <div className="space-y-1">
                                                        {cov.suggestions.slice(0, 3).map((sug, i) => (
                                                            <div key={i} className="flex items-start gap-1.5">
                                                                {cov.coverageScore >= 75 ? (
                                                                    <CheckCircle2 size={10} className="text-emerald-400 mt-0.5 shrink-0" />
                                                                ) : (
                                                                    <Info size={10} className="text-amber-400 mt-0.5 shrink-0" />
                                                                )}
                                                                <span className="text-[10px] text-white/40">{sug}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {scenes.length === 0 && (
                                    <div className="text-center py-12 text-white/30 text-xs">
                                        Add scenes in the Scene Manager tab to see coverage analysis.
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* ── PACING ── */}
                    {activeTab === 'pacing' && (
                        <motion.div
                            key="pacing"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-5"
                        >
                            <div className="relative overflow-hidden rounded-xl border border-white/8 bg-black/30 p-5">
                                <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-500/10 blur-[60px] pointer-events-none rounded-full" />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Pacing Analysis</span>
                                <p className="text-[10px] text-white/40 mb-4">
                                    Act durations vs. targets with variance indicators.
                                </p>

                                {/* Horizontal bar chart */}
                                <div className="space-y-3">
                                    {pacingData.map((ad) => {
                                        const variancePct = Math.round(ad.variance * 100);
                                        const maxDur = Math.max(targetDuration, ...pacingData.map((d) => d.duration), ...pacingData.map((d) => d.targetDuration));
                                        const actualWidth = maxDur > 0 ? (ad.duration / maxDur) * 100 : 0;
                                        const targetWidth = maxDur > 0 ? (ad.targetDuration / maxDur) * 100 : 0;

                                        return (
                                            <div key={ad.act} className="space-y-1.5">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-bold text-white">{ad.act}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] text-white/40 font-mono">
                                                            {ad.duration}s / {ad.targetDuration}s
                                                        </span>
                                                        {Math.abs(variancePct) > 30 && (
                                                            <span className={clsx(
                                                                'text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                                                                variancePct > 0
                                                                    ? 'bg-amber-500/20 text-amber-400'
                                                                    : 'bg-blue-500/20 text-blue-400',
                                                            )}>
                                                                {variancePct > 0 ? '+' : ''}{variancePct}%
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="relative h-4 bg-white/5 rounded-full overflow-hidden">
                                                    {/* Target marker */}
                                                    <div
                                                        className="absolute top-0 h-full border-r-2 border-dashed border-white/20 z-10"
                                                        style={{ width: `${targetWidth}%` }}
                                                    />
                                                    {/* Actual bar */}
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${actualWidth}%` }}
                                                        transition={{ duration: 0.6, ease: 'easeOut' }}
                                                        className={clsx(
                                                            'h-full rounded-full',
                                                            Math.abs(ad.variance) <= 0.15
                                                                ? 'bg-emerald-500/70'
                                                                : Math.abs(ad.variance) <= 0.30
                                                                    ? 'bg-amber-500/70'
                                                                    : 'bg-red-500/70',
                                                        )}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Legend */}
                                <div className="flex items-center gap-4 mt-4 text-[9px] text-white/30">
                                    <span className="flex items-center gap-1">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> On target (±15%)
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Moderate variance
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Significant variance
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <span className="w-2 h-1 border-r border-dashed border-white/40 inline-block" /> Target
                                    </span>
                                </div>

                                {/* Variance warnings */}
                                {pacingData.some((d) => Math.abs(d.variance) > 0.3) && (
                                    <div className="mt-4 space-y-1.5">
                                        {pacingData
                                            .filter((d) => Math.abs(d.variance) > 0.3)
                                            .map((d) => (
                                                <div key={d.act} className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                                                    <AlertTriangle size={11} className="text-amber-400 mt-0.5 shrink-0" />
                                                    <span className="text-[10px] text-amber-300">
                                                        "{d.act}" is {Math.abs(Math.round(d.variance * 100))}% {d.variance > 0 ? 'longer' : 'shorter'} than target.
                                                        Consider {d.variance > 0 ? 'trimming' : 'adding'} material.
                                                    </span>
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};
