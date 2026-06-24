import React, { useState, useMemo } from 'react';
import { Loader2, Check, Sparkles, Activity, RotateCw, Cpu, ChevronDown, ChevronRight, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { TrailerSettings } from '../../lib/trailerGenerator';
import { useTrailerSmartStore, SmartKey } from '../../store/trailerSmartStore';
import { runSmartAnalysis } from '../../lib/smartEngine';
import { findMatchCutPairs, findSeamlessTransitionPairs } from '../../lib/matchAnalysis';
import { getPresetsByCategory, resolveSequencePresetIds } from './sequencePresets';
import clsx from 'clsx';

interface Props { settings: TrailerSettings; update: (patch: Partial<TrailerSettings>) => void; }

const StatusChip: React.FC<{ k: SmartKey; on: boolean }> = ({ k, on }) => {
    const f = useTrailerSmartStore((s) => s[k]);
    if (f.status === 'running') {
        return <span className="flex items-center gap-1 text-[9px] text-amber-300"><Loader2 size={10} className="animate-spin" /> {f.done}/{f.total}</span>;
    }
    if (f.status === 'done') {
        return <span className="flex items-center gap-1 text-[9px] text-emerald-300"><Check size={10} /> {f.total} analyzed</span>;
    }
    return on ? <span className="text-[9px] text-white/30">ready</span> : null;
};

/** Colored badge for energy level counts. */
const ENERGY_COLORS: Record<string, string> = {
    intense: 'bg-red-500/20 text-red-300 border-red-500/30',
    high: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    moderate: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    low: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    static: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
};

const ENERGY_LABELS: Record<string, string> = {
    intense: 'Intense',
    high: 'High',
    moderate: 'Moderate',
    low: 'Low',
    static: 'Static',
};

/** Shows the energy classification breakdown as colored badges. */
const EnergyBreakdown: React.FC = () => {
    const results = useTrailerSmartStore(s => s.analysisResults);
    const counts: Record<string, number> = { intense: 0, high: 0, moderate: 0, low: 0, static: 0 };
    Object.values(results).forEach(r => { if (r.analyzed) counts[r.energyLevel] = (counts[r.energyLevel] || 0) + 1; });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) return null;

    return (
        <div className="flex flex-wrap gap-1.5 pt-1">
            {Object.entries(counts).filter(([, c]) => c > 0).map(([level, count]) => (
                <span key={level} className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${ENERGY_COLORS[level]}`}>
                    {count} {ENERGY_LABELS[level]}
                </span>
            ))}
        </div>
    );
};

/** Progress bar for overall analysis. */
const AnalysisProgress: React.FC = () => {
    const analyzedCount = useTrailerSmartStore(s => s.analyzedCount);
    const totalCount = useTrailerSmartStore(s => s.totalCount);
    const active = useTrailerSmartStore(s => s.active);
    const isFullyAnalyzed = useTrailerSmartStore(s => s.isFullyAnalyzed);

    if (totalCount === 0) return null;

    const pct = totalCount > 0 ? Math.round((analyzedCount / totalCount) * 100) : 0;

    return (
        <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[9px]">
                <span className="flex items-center gap-1.5">
                    {active && <Loader2 size={9} className="animate-spin text-amber-300" />}
                    {isFullyAnalyzed && <Check size={9} className="text-emerald-400" />}
                    <span className={isFullyAnalyzed ? 'text-emerald-300' : 'text-white/50'}>
                        {isFullyAnalyzed ? 'All clips analyzed' : `auto-analyzing… ${analyzedCount}/${totalCount}`}
                    </span>
                </span>
                <span className="text-white/30 font-mono">{pct}%</span>
            </div>
            <div className="w-full h-1 rounded-full bg-white/5 overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${isFullyAnalyzed ? 'bg-emerald-500' : 'bg-amber-500/80'}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
};

// ── Favorite Clips Strip ─────────────────────────────────────────────────────

/** A horizontal scrollable strip showing the smart engine's top picks for a category. */
const FavoriteClipsStrip: React.FC<{ category: string }> = ({ category }) => {
    const results = useTrailerSmartStore(s => s.analysisResults);
    const scannedFiles = useTrailerSmartStore(s => s.scannedFiles);

    const favorites = useMemo(() => {
        const entries = Object.entries(results).filter(([, r]) => r.analyzed);
        if (entries.length === 0) return [];

        switch (category) {
            case 'preferHighEnergy': {
                // Top clips sorted by energy score
                return entries
                    .filter(([, r]) => r.energyLevel === 'high' || r.energyLevel === 'intense')
                    .sort((a, b) => b[1].score - a[1].score)
                    .slice(0, 12)
                    .map(([id, r]) => ({
                        id,
                        filename: scannedFiles[id]?.filename || id.slice(0, 12),
                        score: r.score,
                        energy: r.energyLevel,
                        badge: `${r.score}`,
                    }));
            }
            case 'sceneAwareCuts': {
                // Clips with detected scene cuts
                return entries
                    .filter(([, r]) => r.sceneCutsFrames && r.sceneCutsFrames.length > 0)
                    .sort((a, b) => (b[1].sceneCutsFrames?.length || 0) - (a[1].sceneCutsFrames?.length || 0))
                    .slice(0, 12)
                    .map(([id, r]) => ({
                        id,
                        filename: scannedFiles[id]?.filename || id.slice(0, 12),
                        score: r.sceneCutsFrames?.length || 0,
                        energy: r.energyLevel,
                        badge: `${r.sceneCutsFrames?.length || 0} cuts`,
                    }));
            }
            case 'autoTrimSilence': {
                // Clips with significant silence trimming
                return entries
                    .filter(([, r]) => (r.usableInFrames ?? 0) > 5 || (r.usableOutFrames ?? 0) > 0)
                    .slice(0, 12)
                    .map(([id, r]) => ({
                        id,
                        filename: scannedFiles[id]?.filename || id.slice(0, 12),
                        score: (r.usableInFrames ?? 0),
                        energy: r.energyLevel,
                        badge: `${r.usableInFrames ?? 0}f trim`,
                    }));
            }
            case 'autoColorGrade': {
                // All clips with auto-grade computed
                return entries
                    .filter(([, r]) => r.autoGrade)
                    .slice(0, 8)
                    .map(([id, r]) => ({
                        id,
                        filename: scannedFiles[id]?.filename || id.slice(0, 12),
                        score: r.score,
                        energy: r.energyLevel,
                        badge: 'graded',
                    }));
            }
            default:
                return [];
        }
    }, [results, scannedFiles, category]);

    if (favorites.length === 0) return null;

    return (
        <div className="mt-2 space-y-1">
            <span className="text-[8px] font-bold uppercase tracking-wider text-emerald-300/50 flex items-center gap-1">
                <Eye size={8} /> Smart Engine Picks ({favorites.length})
            </span>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-white/10">
                {favorites.map(fav => (
                    <div key={fav.id} className="flex-shrink-0 w-28 bg-white/[0.04] border border-white/5 rounded-lg p-1.5 space-y-0.5">
                        <div className="text-[8px] font-bold text-white/70 truncate" title={fav.filename}>{fav.filename}</div>
                        <div className="flex items-center gap-1">
                            <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded-full border ${ENERGY_COLORS[fav.energy] || 'bg-white/5 border-white/10 text-white/40'}`}>
                                {fav.badge}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ── Visual Match Summary ─────────────────────────────────────────────────────

/** Shows match-cut and seamless pair counts from visual-match analysis. */
const VisualMatchSummary: React.FC = () => {
    const results = useTrailerSmartStore(s => s.analysisResults);
    const vmProgress = useTrailerSmartStore(s => s['visual-match']);

    const counts = useMemo(() => {
        const matchPairs = findMatchCutPairs(results);
        const seamlessPairs = findSeamlessTransitionPairs(results);
        return { matchCuts: matchPairs.length, seamless: seamlessPairs.length };
    }, [results]);

    if (vmProgress.status === 'idle' && counts.matchCuts === 0 && counts.seamless === 0) return null;

    return (
        <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.03] p-2 space-y-1">
            <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-300/70">Visual Match</span>
                <StatusChip k="visual-match" on={true} />
            </div>
            {(counts.matchCuts > 0 || counts.seamless > 0) && (
                <div className="flex gap-2">
                    {counts.matchCuts > 0 && (
                        <span className="text-[9px] px-2 py-0.5 rounded-full border bg-cyan-500/10 border-cyan-500/25 text-cyan-300">
                            {counts.matchCuts} match-cut pair{counts.matchCuts !== 1 ? 's' : ''}
                        </span>
                    )}
                    {counts.seamless > 0 && (
                        <span className="text-[9px] px-2 py-0.5 rounded-full border bg-violet-500/10 border-violet-500/25 text-violet-300">
                            {counts.seamless} seamless pair{counts.seamless !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

// ── Advanced Presets (moved from Effects section) ────────────────────────────

const AdvancedPresetsSection: React.FC<Props> = ({ settings, update }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const presets = getPresetsByCategory('advanced');
    const selectedIds = resolveSequencePresetIds(settings);
    const selected = presets.filter(p => selectedIds.includes(p.id));

    const togglePreset = (presetId: string) => {
        const active = selectedIds.includes(presetId);
        let next: string[];
        if (active) {
            next = selectedIds.filter(id => id !== presetId);
        } else {
            // Stackable — allow multiple
            next = [...selectedIds, presetId];
        }
        update({ sequencePresetIds: next, sequencePresetId: undefined });
    };

    /** Visual descriptions for hover tooltips. */
    const PRESET_VISUALS: Record<string, string> = {
        'match-cut': '🎬 Zooms from each clip\'s last frame into the next clip\'s first frame, creating a continuous visual thread. Uses the Smart Engine\'s perceptual matching to find the most similar boundary frames.',
        'parallel-edit': '🔀 Cross-cuts between two parallel timelines on V1 and V2. Even clips play on track 1, odd on track 2 — with distinct colour grading per storyline for visual separation.',
        'nested-sequence': '📂 Groups every 3 clips into self-contained subsequences. Each group becomes a compositional block that can be treated as a single entity in the timeline.',
        'speed-ramp-drama': '⚡ Alternates between 0.5× slow-motion and 2× fast-forward with ramped speed curves at each transition point. Creates an epic, action-movie intensity.',
    };

    return (
        <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.03] p-2.5 space-y-2">
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-2 w-full text-left"
            >
                <Cpu size={12} className="text-emerald-400/60" />
                <span className="text-[10px] font-bold uppercase tracking-wide text-white/60">Advanced Editing Patterns</span>
                <span className="ml-auto text-[8px] text-white/25">Stackable</span>
                {isExpanded
                    ? <ChevronDown size={10} className="text-white/30" />
                    : <ChevronRight size={10} className="text-white/30" />}
            </button>
            {selected.length > 0 && !isExpanded && (
                <div className="flex flex-wrap gap-1">
                    {selected.map(p => (
                        <span key={p.id} className="text-[8px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-300">
                            {p.name}
                        </span>
                    ))}
                </div>
            )}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                            {presets.map(preset => {
                                const active = selectedIds.includes(preset.id);
                                const visualDesc = PRESET_VISUALS[preset.id];
                                return (
                                    <div key={preset.id} className="group relative">
                                        <button
                                            type="button"
                                            aria-pressed={active}
                                            onClick={() => togglePreset(preset.id)}
                                            className={clsx(
                                                'min-h-[48px] w-full flex items-start gap-2 p-2 rounded-md border text-left transition-colors',
                                                active
                                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                                                    : 'border-white/5 bg-white/[0.025] text-white/60 hover:bg-white/[0.05]',
                                            )}
                                        >
                                            <span className={clsx(
                                                'mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border flex items-center justify-center',
                                                active ? 'border-emerald-400' : 'border-white/20',
                                            )}>
                                                {active && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block text-[10px] font-bold leading-tight">{preset.name}</span>
                                                <span className="block mt-0.5 text-[9px] leading-tight text-white/35 line-clamp-2">{preset.description}</span>
                                            </span>
                                        </button>
                                        {/* Hover preview tooltip */}
                                        {visualDesc && (
                                            <div className="absolute z-50 left-0 bottom-full mb-1 w-64 p-3 rounded-lg bg-black/95 border border-white/10 shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200">
                                                <div className="text-[9px] text-white/70 leading-relaxed">{visualDesc}</div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {selected.length > 0 && (
                            <div className="text-[9px] text-white/35 pt-1.5">
                                Active: <span className="font-bold text-emerald-300/70">{selected.map(p => p.name).join(' + ')}</span>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ── Main Smart Panel ─────────────────────────────────────────────────────────

interface Row { id: string; label: string; desc: string; on: boolean; set: (v: boolean) => void; storeKey?: SmartKey; favCategory?: string; }

export const TrailerSmartPanel: React.FC<Props> = ({ settings, update }) => {
    const smartActive = useTrailerSmartStore(s => s.active);
    const analyzedCount = useTrailerSmartStore(s => s.analyzedCount);
    const [rescanActive, setRescanActive] = useState<Record<string, boolean>>({});

    const handleRescan = async (key: SmartKey) => {
        setRescanActive(prev => ({ ...prev, [key]: true }));
        try {
            await runSmartAnalysis(key);
        } catch (err) {
            console.error('[SmartPanel] Rescan error:', err);
        } finally {
            setRescanActive(prev => ({ ...prev, [key]: false }));
        }
    };

    const rows: Row[] = [
        {
            id: 'preferHighEnergy', label: 'Prefer High-Energy Clips', storeKey: 'scoring', favCategory: 'preferHighEnergy',
            desc: 'Scores each clip by motion energy (frame-difference luminance) and front-loads the liveliest takes.',
            on: settings.preferHighEnergy ?? false, set: (v) => update({ preferHighEnergy: v }),
        },
        {
            id: 'autoColorGrade', label: 'Auto Color Grade', storeKey: 'color', favCategory: 'autoColorGrade',
            desc: 'Analyzes each clip\'s luma + saturation and applies a clip-aware cinematic grade (exposure fix, vibrance, subtle teal-orange).',
            on: settings.autoColorGrade ?? false, set: (v) => update({ autoColorGrade: v }),
        },
        {
            id: 'autoTrimSilence', label: 'Auto-Trim Silence', storeKey: 'silence', favCategory: 'autoTrimSilence',
            desc: 'Detects silent head/tail per clip (silencedetect) and restricts trims to the spoken/active range.',
            on: settings.autoTrimSilence ?? false, set: (v) => update({ autoTrimSilence: v }),
        },
        {
            id: 'sceneAwareCuts', label: 'Scene-Aware Cuts', storeKey: 'scenes', favCategory: 'sceneAwareCuts',
            desc: 'Finds visual scene changes and snaps clip in-points to those boundaries so cuts land on real content shifts.',
            on: settings.sceneAwareCuts ?? false, set: (v) => update({ sceneAwareCuts: v }),
        },
        {
            id: 'globalStabilize', label: 'Stabilize All Clips',
            desc: 'Two-pass vidstab stabilization applied to every clip at render time.',
            on: settings.globalStabilize?.enabled ?? false,
            set: (v) => update({ globalStabilize: { enabled: v, smoothing: settings.globalStabilize?.smoothing ?? 10 } }),
        },
        {
            id: 'autoFadeInOut', label: 'Auto Fade In / Out',
            desc: 'Keyframed brightness fade from/to black on the first and last clips.',
            on: settings.autoFadeInOut ?? false, set: (v) => update({ autoFadeInOut: v }),
        },
    ];

    return (
        <div className="border border-emerald-500/15 rounded-xl bg-emerald-500/[0.03] p-5 space-y-2">
            <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-emerald-400" />
                <span className="text-sm font-bold text-white">Smart Engine</span>
                <Activity size={11} className="text-emerald-400/50 ml-auto" />
            </div>
            <AnalysisProgress />
            <EnergyBreakdown />
            <div className="space-y-2">
                {rows.map((r) => (
                    <div key={r.id} className={`rounded-lg border p-2.5 transition-colors ${r.on ? 'border-emerald-500/25 bg-emerald-500/[0.04]' : 'border-white/5 bg-black/20'}`}>
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <span className="text-[11px] font-bold uppercase tracking-wide text-white/70">{r.label}</span>
                                {r.storeKey && <StatusChip k={r.storeKey} on={r.on} />}
                                {r.storeKey && analyzedCount > 0 && (
                                    <button
                                        type="button"
                                        title={`Rescan ${r.label}`}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleRescan(r.storeKey!);
                                        }}
                                        disabled={rescanActive[r.storeKey] || smartActive}
                                        className={clsx(
                                            "p-1 hover:bg-white/10 text-white/40 hover:text-white rounded transition-all cursor-pointer flex items-center justify-center",
                                            (rescanActive[r.storeKey] || smartActive) && "opacity-50 cursor-not-allowed"
                                        )}
                                    >
                                        <RotateCw size={10} className={clsx(rescanActive[r.storeKey] && "animate-spin")} />
                                    </button>
                                )}
                            </span>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={r.on}
                                aria-label={`${r.on ? 'Disable' : 'Enable'} ${r.label}`}
                                onClick={() => r.set(!r.on)}
                                className="relative shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
                            >
                                <div className={`w-10 h-5 rounded-full transition-colors ${r.on ? 'bg-emerald-500' : 'bg-black border border-white/20'}`}>
                                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${r.on ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                </div>
                            </button>
                        </div>
                        {r.on && <p className="text-[10px] text-white/40 mt-1.5 leading-snug">{r.desc}</p>}
                        {/* Favorite clips strip — shown when enabled and analysis is complete */}
                        {r.on && r.favCategory && <FavoriteClipsStrip category={r.favCategory} />}
                    </div>
                ))}
            </div>
            {/* Visual Match Analysis Summary */}
            <VisualMatchSummary />
            {/* Advanced Editing Patterns — relocated from Effects section */}
            <AdvancedPresetsSection settings={settings} update={update} />
        </div>
    );
};
