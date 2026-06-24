import React, { useState } from 'react';
import { Loader2, Check, Sparkles, Activity, RotateCw } from 'lucide-react';
import type { TrailerSettings } from '../../lib/trailerGenerator';
import { useTrailerSmartStore, SmartKey } from '../../store/trailerSmartStore';
import { runSmartAnalysis } from '../../lib/smartEngine';
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

interface Row { id: string; label: string; desc: string; on: boolean; set: (v: boolean) => void; storeKey?: SmartKey; }

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
            id: 'preferHighEnergy', label: 'Prefer High-Energy Clips', storeKey: 'scoring',
            desc: 'Scores each clip by motion energy (frame-difference luminance) and front-loads the liveliest takes.',
            on: settings.preferHighEnergy ?? false, set: (v) => update({ preferHighEnergy: v }),
        },
        {
            id: 'autoColorGrade', label: 'Auto Color Grade', storeKey: 'color',
            desc: 'Analyzes each clip\'s luma + saturation and applies a clip-aware cinematic grade (exposure fix, vibrance, subtle teal-orange).',
            on: settings.autoColorGrade ?? false, set: (v) => update({ autoColorGrade: v }),
        },
        {
            id: 'autoTrimSilence', label: 'Auto-Trim Silence', storeKey: 'silence',
            desc: 'Detects silent head/tail per clip (silencedetect) and restricts trims to the spoken/active range.',
            on: settings.autoTrimSilence ?? false, set: (v) => update({ autoTrimSilence: v }),
        },
        {
            id: 'sceneAwareCuts', label: 'Scene-Aware Cuts', storeKey: 'scenes',
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
                    </div>
                ))}
            </div>
        </div>
    );
};
