import React, { useMemo } from 'react';
import { Sparkles, SlidersHorizontal } from 'lucide-react';
import { useMediaStore } from '../../store/mediaStore';
import { useViewStore } from '../../store/viewStore';
import { resolveKeptRanges, type SegmentCanvas } from '../../lib/mediaSegments';

// ══════════════════════════════════════════════════════════════════════════════
// SmartChoicesStrip — visualizes each source's include/exclude segment decisions
// (the Smart Engine's choices + user challenges) on the Edit Generator page, so
// they can be reviewed and challenged here too. Clicking a clip jumps to the
// Import Manager focused on it.
// ══════════════════════════════════════════════════════════════════════════════

const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
};

export const SmartChoicesStrip = React.memo(() => {
    const files = useMediaStore((s) => s.files);
    const selectedFileIds = useMediaStore((s) => s.selectedFileIds);
    const setActiveTab = useViewStore((s) => s.setActiveTab);

    const pool = useMemo(() => {
        const sel = files.filter((f) => selectedFileIds.includes(f.id));
        return (sel.length > 0 ? sel : files).filter((f) => f.type === 'video');
    }, [files, selectedFileIds]);

    const withChoices = pool.filter((f) => (f.segments && f.segments.length > 0) || f.smartAnalyzed);
    if (withChoices.length === 0) return null;

    return (
        <div className="rounded-xl border border-white/[0.05] bg-[#0d0d22]/50 p-3">
            <div className="flex items-center justify-between mb-2">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-white/55 flex items-center gap-1.5">
                    <Sparkles size={11} className="text-violet-400" /> Smart segment choices
                </h4>
                <button
                    onClick={() => setActiveTab('import-manager')}
                    className="text-[9px] font-bold text-primary hover:text-primary/80 inline-flex items-center gap-1"
                    title="Refine / challenge in the Import Manager"
                >
                    <SlidersHorizontal size={10} /> Refine
                </button>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {withChoices.map((f) => {
                    const canvas: SegmentCanvas = { duration: f.duration, trimIn: f.trimIn, trimOut: f.trimOut };
                    const kept = resolveKeptRanges(canvas, f.segments);
                    const dur = f.duration || 1;
                    const pct = (t: number) => (t / dur) * 100;
                    const keptSec = kept.reduce((a, r) => a + (r.endSec - r.startSec), 0);
                    return (
                        <button
                            key={f.id}
                            onClick={() => setActiveTab('import-manager')}
                            className="w-full text-left group"
                            title="Open in Import Manager to challenge"
                        >
                            <div className="flex items-center justify-between mb-0.5">
                                <span className="text-[8px] text-white/55 truncate max-w-[70%] group-hover:text-white/80">{f.filename}</span>
                                <span className="text-[8px] font-mono text-emerald-300/70">{fmt(keptSec)}/{fmt(dur)}</span>
                            </div>
                            <div className="relative h-2.5 rounded bg-white/[0.04] border border-white/10 overflow-hidden">
                                {/* kept ranges */}
                                {kept.map((r, i) => (
                                    <div key={`k${i}`} className="absolute top-0 bottom-0 bg-emerald-500/40"
                                         style={{ left: `${pct(r.startSec)}%`, width: `${pct(r.endSec - r.startSec)}%` }} />
                                ))}
                                {/* explicit segments overlay */}
                                {(f.segments ?? []).map((s) => (
                                    <div key={s.id}
                                         className={s.type === 'include' ? 'absolute top-0 bottom-0 border-x border-emerald-300/60' : 'absolute top-0 bottom-0 bg-red-500/40 border-x border-red-300/60'}
                                         style={{ left: `${pct(s.startSec)}%`, width: `${pct(s.endSec - s.startSec)}%` }} />
                                ))}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
});
