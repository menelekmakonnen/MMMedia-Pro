import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Sparkles, ArrowRight, Film, GraduationCap, RotateCcw, RotateCw, RefreshCw, X, Layers, Check, CheckSquare, Square } from 'lucide-react';
import clsx from 'clsx';
import { useMediaStore, type MediaFile } from '../../store/mediaStore';
import { useViewStore } from '../../store/viewStore';
import { useProjectStore } from '../../store/projectStore';
import { useTrailerSmartStore } from '../../store/trailerSmartStore';
import { useSmartTrainingStore } from '../../store/smartTrainingStore';
import { SegmentEditor } from './SegmentEditor';
import { keptDuration, resolveKeptRanges, type SegmentCanvas } from '../../lib/mediaSegments';
import { suggestSmartSegments, type SmartAnalysisLike } from '../../lib/ege/smartSegments';
import { runSmartAnalysis } from '../../lib/smartEngine';
import { ProjectDrawer } from '../../components/ProjectDrawer';

// ══════════════════════════════════════════════════════════════════════════════
// ImportManagerTab — the in-depth media editing hub.
//
// • Pre-selected clips (from the Import page) open straight into the editor.
// • With no pre-selection it shows ALL clips as an approval grid; the user picks
//   and approves, then the full Manager opens for that set.
// • The Smart Engine auto-kicks on approval. Decisions here (include / exclude
//   segments) are the SOURCE OF TRUTH consumed by the Edit Generator, and Smart
//   choices can be challenged to train the engine.
// ══════════════════════════════════════════════════════════════════════════════

const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
};

type Orient = 'vertical' | 'horizontal' | 'square' | 'unknown';

function orientationOf(f: MediaFile): Orient {
    if (f.orientation) return f.orientation;
    if (f.width && f.height) {
        const a = (f.rotation === 90 || f.rotation === 270) ? f.height / f.width : f.width / f.height;
        return a < 0.95 ? 'vertical' : a > 1.05 ? 'horizontal' : 'square';
    }
    return 'unknown';
}

// Deterministic pseudo-random "preview" ranges when a clip has no segments yet.
function placeholderRanges(id: string): Array<{ s: number; e: number }> {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const a = (h % 20) / 100;             // 0–0.20
    const b = 0.35 + ((h >> 4) % 20) / 100;
    const c = 0.7 + ((h >> 8) % 15) / 100;
    return [{ s: a, e: a + 0.18 }, { s: b, e: b + 0.2 }, { s: c, e: Math.min(0.98, c + 0.15) }];
}

const THUMB_H = 158; // px — big, orientation defines the width

const ManagerThumb: React.FC<{
    file: MediaFile;
    active: boolean;
    challenges: number;
    onSelect: () => void;
    onSetOrientation: (o: 'vertical' | 'horizontal' | 'square') => void;
}> = ({ file: f, active, challenges, onSelect, onSetOrientation }) => {
    const orient = orientationOf(f);
    const aspect = orient === 'vertical' ? 9 / 16 : orient === 'square' ? 1 : 16 / 9;
    const mediaH = THUMB_H - 26; // leave room for the label strip
    const width = Math.round(mediaH * aspect);

    const canvas: SegmentCanvas = { duration: f.duration, trimIn: f.trimIn, trimOut: f.trimOut };
    const kept = resolveKeptRanges(canvas, f.segments);
    const dur = f.duration || 1;
    const hasReal = (f.segments?.length ?? 0) > 0;
    const previewBars = hasReal
        ? kept.map((r) => ({ s: r.startSec / dur, e: r.endSec / dur }))
        : placeholderRanges(f.id);
    const keptSec = keptDuration(canvas, f.segments);

    return (
        <button
            onClick={onSelect}
            className={clsx('relative flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all text-left group',
                active ? 'border-primary shadow-[0_0_14px_rgba(99,102,241,0.45)]' : 'border-white/10 hover:border-white/40')}
            style={{ width }}
            title={f.filename}
        >
            <div className="bg-black/70 flex items-center justify-center overflow-hidden relative" style={{ height: mediaH }}>
                {f.type === 'video' || f.type === 'image'
                    ? <video src={`file://${f.path}`} className="w-full h-full object-cover" muted preload="metadata"
                             style={{ transform: f.rotation ? `rotate(${f.rotation}deg)` : undefined }} />
                    : <Film size={22} className="text-white/20" />}

                {/* Hover: accepted-segment preview belt */}
                <div className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-black/85 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute inset-x-1 bottom-1 h-1.5 rounded-full bg-white/15 overflow-hidden">
                        {previewBars.map((b, i) => (
                            <div key={i} className={clsx('absolute top-0 bottom-0 rounded-full', hasReal ? 'bg-emerald-400/80' : 'bg-white/40')}
                                 style={{ left: `${b.s * 100}%`, width: `${Math.max(2, (b.e - b.s) * 100)}%` }} />
                        ))}
                    </div>
                    {!hasReal && <span className="absolute right-1.5 bottom-2.5 text-[6px] text-white/40 uppercase tracking-wider">preview</span>}
                </div>

                {/* Unknown orientation → let the user set it */}
                {orient === 'unknown' && (
                    <div className="absolute top-1 inset-x-1 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[6px] text-white/60">orientation?</span>
                        {(['vertical', 'horizontal', 'square'] as const).map((o) => (
                            <button key={o} onClick={(e) => { e.stopPropagation(); onSetOrientation(o); }}
                                    className="px-1 rounded bg-black/70 text-[6px] text-white/70 hover:text-white border border-white/20">{o[0].toUpperCase()}</button>
                        ))}
                    </div>
                )}
            </div>
            <div className="px-1.5 py-1 bg-[#0d0d22]" style={{ minWidth: 92 }}>
                <div className="text-[8px] font-bold text-white/70 truncate">{f.filename}</div>
                <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[7px] font-mono text-emerald-300/80">{fmt(keptSec)}</span>
                    <div className="flex items-center gap-1">
                        <span className="text-[6px] text-white/25 uppercase">{orient !== 'unknown' ? orient[0] : '?'}</span>
                        {f.smartAnalyzed && <Sparkles size={7} className="text-violet-300" />}
                        {challenges > 0 && <span className="text-[7px] text-amber-300" title={`${challenges} challenge(s)`}>✎{challenges}</span>}
                    </div>
                </div>
            </div>
        </button>
    );
};

export const ImportManagerTab: React.FC = () => {
    const files = useMediaStore((s) => s.files);
    const selectedFileIds = useMediaStore((s) => s.selectedFileIds);
    const setFileSegments = useMediaStore((s) => s.setFileSegments);
    const updateFile = useMediaStore((s) => s.updateFile);
    const rotateFile = useMediaStore((s) => s.rotateFile);
    const rotateFileCCW = useMediaStore((s) => s.rotateFileCCW);
    const confirmRotation = useMediaStore((s) => s.confirmRotation);
    const cancelRotation = useMediaStore((s) => s.cancelRotation);
    const setFileFraming = useMediaStore((s) => s.setFileFraming);
    const resetFileFraming = useMediaStore((s) => s.resetFileFraming);
    const setFileUsageWeight = useMediaStore((s) => s.setFileUsageWeight);
    const setActiveTab = useViewStore((s) => s.setActiveTab);
    const fps = useProjectStore((s) => s.settings?.fps) || 30;
    const getSmart = useTrailerSmartStore((s) => s.getResult);
    const bias = useSmartTrainingStore((s) => s.bias);
    const challengeCountByFile = useSmartTrainingStore((s) => s.challengeCountByFile);
    const trainingSamples = useSmartTrainingStore((s) => s.bias.samples);
    const resetTraining = useSmartTrainingStore((s) => s.resetTraining);

    const allCurated = useMemo(
        () => files.filter((f) => f.type === 'video' || f.type === 'image' || f.type === 'audio'),
        [files],
    );

    // Approved set = the clips the user has committed to curating.
    const [approvedIds, setApprovedIds] = useState<string[] | null>(null);
    // Approval-grid working selection (when nothing was pre-selected).
    const [gatePick, setGatePick] = useState<Set<string>>(new Set());

    // Pre-selection from the Import page auto-approves.
    useEffect(() => {
        if (approvedIds === null && selectedFileIds.length > 0) {
            setApprovedIds(selectedFileIds.filter((id) => allCurated.some((f) => f.id === id)));
        }
    }, [approvedIds, selectedFileIds, allCurated]);

    const pool: MediaFile[] = useMemo(
        () => (approvedIds ? allCurated.filter((f) => approvedIds.includes(f.id)) : []),
        [approvedIds, allCurated],
    );

    // Smart Engine auto-kicks as soon as a set is approved/opened.
    const kickSmart = useCallback(() => { void runSmartAnalysis().catch(() => {}); }, []);
    useEffect(() => { if (pool.length > 0) kickSmart(); }, [pool.length, kickSmart]);

    const [focusId, setFocusId] = useState<string | null>(null);
    useEffect(() => {
        if (!focusId || !pool.some((f) => f.id === focusId)) setFocusId(pool[0]?.id ?? null);
    }, [pool, focusId]);
    const focus = pool.find((f) => f.id === focusId) ?? null;

    const runSmartAll = () => {
        kickSmart();
        for (const f of pool) {
            if (f.type !== 'video') continue;
            const r = getSmart(f.id);
            const canvas: SegmentCanvas = { duration: f.duration, trimIn: f.trimIn, trimOut: f.trimOut };
            const a: SmartAnalysisLike = {
                score: r?.score, energyLevel: r?.energyLevel,
                usableInFrames: r?.usableInFrames, usableOutFrames: r?.usableOutFrames,
                sceneCutsFrames: r?.sceneCutsFrames,
            };
            setFileSegments(f.id, suggestSmartSegments(canvas, a, { fps, bias, perScene: true }));
            updateFile(f.id, { smartAnalyzed: true });
        }
    };

    const totalKept = useMemo(
        () => pool.reduce((a, f) => a + keptDuration({ duration: f.duration, trimIn: f.trimIn, trimOut: f.trimOut }, f.segments), 0),
        [pool],
    );

    // ── Empty library ──
    if (allCurated.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-center text-white/30 gap-3">
                <Layers size={40} className="text-white/10" />
                <h2 className="text-sm font-bold text-white/50">No clips to manage</h2>
                <p className="text-[11px] max-w-xs">Import media first, then approve the clips you want to curate here.</p>
                <button onClick={() => setActiveTab('media')} className="px-3 py-1.5 rounded-lg bg-primary/20 text-primary text-xs font-bold hover:bg-primary/30">
                    Go to Import
                </button>
            </div>
        );
    }

    // ── Approval gate (no pre-selection) ──
    if (!approvedIds || approvedIds.length === 0) {
        const toggle = (id: string) => setGatePick((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
        const approve = () => { if (gatePick.size > 0) setApprovedIds([...gatePick]); };
        return (
            <div className="h-full flex flex-col bg-[#08080f]">
                <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
                    <div>
                        <h1 className="text-sm font-black text-white/90 flex items-center gap-2"><Film size={15} className="text-primary" /> Import Manager</h1>
                        <p className="text-[10px] text-white/35">Select the clips to curate, then approve to open the full editor.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setGatePick(new Set(allCurated.map((f) => f.id)))}
                                className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 text-[10px] font-bold hover:bg-white/10">Select all</button>
                        <button onClick={approve} disabled={gatePick.size === 0}
                                className="px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary text-xs font-bold hover:bg-primary/30 disabled:opacity-30 inline-flex items-center gap-1.5">
                            <Check size={13} /> Approve {gatePick.size > 0 ? `${gatePick.size} clip(s)` : ''}
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-5">
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                        {allCurated.map((f) => {
                            const on = gatePick.has(f.id);
                            return (
                                <button key={f.id} onClick={() => toggle(f.id)}
                                        className={clsx('relative rounded-lg overflow-hidden border-2 text-left transition-all',
                                            on ? 'border-primary shadow-[0_0_12px_rgba(99,102,241,0.4)]' : 'border-white/10 hover:border-white/30')}>
                                    <div className="aspect-video bg-black/60 flex items-center justify-center overflow-hidden">
                                        {f.type === 'video' || f.type === 'image'
                                            ? <video src={`file://${f.path}`} className="w-full h-full object-cover" muted preload="metadata" />
                                            : <Film size={20} className="text-white/20" />}
                                    </div>
                                    <div className="absolute top-1.5 left-1.5">
                                        {on ? <CheckSquare size={16} className="text-primary drop-shadow" /> : <Square size={16} className="text-white/40" />}
                                    </div>
                                    <div className="px-2 py-1 bg-[#0d0d22]">
                                        <div className="text-[9px] font-bold text-white/70 truncate">{f.filename}</div>
                                        <div className="text-[8px] text-white/30">{fmt(f.duration)}{f.orientation ? ` · ${f.orientation}` : ''}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
                <ProjectDrawer side="right" />
            </div>
        );
    }

    // ── Full Manager (approved set) ──
    return (
        <div className="h-full flex flex-col bg-[#08080f]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
                <div>
                    <h1 className="text-sm font-black text-white/90 flex items-center gap-2"><Film size={15} className="text-primary" /> Import Manager</h1>
                    <p className="text-[10px] text-white/35">
                        {pool.length} clip(s) · keeping <span className="font-mono text-emerald-300">{fmt(totalKept)}</span> · these segment choices are the source of truth for the Edit Generator
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => { setApprovedIds(null); setGatePick(new Set()); }}
                            className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/50 text-[10px] font-bold hover:bg-white/10">Change selection</button>
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-[9px] text-white/45" title="How much you've trained the Smart Engine">
                        <GraduationCap size={11} className="text-violet-300" /> Trained ×{trainingSamples}
                        {trainingSamples > 0 && <button onClick={resetTraining} className="ml-1 text-white/30 hover:text-white/70" title="Reset training"><RotateCcw size={9} /></button>}
                    </div>
                    <button onClick={runSmartAll}
                            className="px-3 py-1.5 rounded-lg bg-violet-500/20 border border-violet-500/40 text-violet-200 text-xs font-bold hover:bg-violet-500/30 inline-flex items-center gap-1.5">
                        <Sparkles size={13} /> Smart suggest all
                    </button>
                    <button onClick={() => setActiveTab('trailer')}
                            className="px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary text-xs font-bold hover:bg-primary/30 inline-flex items-center gap-1.5">
                        Send to Generator <ArrowRight size={13} />
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5">
                {focus ? (
                    <div className="max-w-3xl mx-auto">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-xs font-bold text-white/70 truncate">{focus.filename}</h2>
                            <span className="text-[9px] text-white/30 uppercase tracking-wider">{focus.type}{focus.orientation ? ` · ${focus.orientation}` : ''}</span>
                        </div>

                        {/* ── Rotation / Framing / Usage toolbar ── */}
                        <div className="mb-3 p-3 rounded-lg bg-white/[0.03] border border-white/5 space-y-3">
                            {/* Rotation */}
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] font-black text-white/50 uppercase tracking-wider mr-auto">Rotate</span>
                                <button
                                    onClick={() => rotateFileCCW(focus.id)}
                                    className="flex items-center justify-center bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 p-1.5 rounded-md transition-colors border border-blue-500/20 hover:border-blue-500/40"
                                    title="Rotate counter-clockwise"
                                >
                                    <RotateCcw size={13} />
                                </button>
                                <button
                                    onClick={() => rotateFile(focus.id)}
                                    className="flex items-center justify-center bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 p-1.5 rounded-md transition-colors border border-blue-500/20 hover:border-blue-500/40"
                                    title="Rotate clockwise"
                                >
                                    <RotateCw size={13} />
                                </button>
                                {focus.pendingRotation !== undefined && focus.pendingRotation !== (focus.rotation ?? 0) && (
                                    <>
                                        <button
                                            onClick={() => confirmRotation(focus.id)}
                                            className="flex items-center gap-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 p-1.5 rounded-md text-[9px] font-bold transition-colors border border-emerald-500/30 hover:border-emerald-500/50"
                                        >
                                            <Check size={12} strokeWidth={3} /> {focus.pendingRotation}°
                                        </button>
                                        <button
                                            onClick={() => cancelRotation(focus.id)}
                                            className="flex items-center justify-center bg-red-600/20 hover:bg-red-600/40 text-red-300 p-1.5 rounded-md transition-colors border border-red-500/30 hover:border-red-500/50"
                                        >
                                            <X size={12} strokeWidth={3} />
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* Framing */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-black text-white/50 uppercase tracking-wider">Framing</span>
                                    <button
                                        onClick={() => resetFileFraming(focus.id)}
                                        className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[8px] font-bold text-white/40 hover:text-white/70 transition-colors uppercase tracking-wider"
                                    >
                                        <RefreshCw size={8} /> Reset
                                    </button>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="space-y-0.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[8px] text-white/40">Zoom</span>
                                            <span className="text-[8px] font-mono text-white/50">{focus.sourceZoom ?? 100}%</span>
                                        </div>
                                        <input type="range" min={100} max={300} step={5}
                                            value={focus.sourceZoom ?? 100}
                                            onChange={(e) => setFileFraming(focus.id, Number(e.target.value), focus.sourcePanX ?? 0, focus.sourcePanY ?? 0)}
                                            className="w-full h-1 rounded-full appearance-none bg-white/10 accent-violet-500 cursor-pointer"
                                        />
                                    </div>
                                    <div className="space-y-0.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[8px] text-white/40">Pan X</span>
                                            <span className="text-[8px] font-mono text-white/50">{focus.sourcePanX ?? 0}</span>
                                        </div>
                                        <input type="range" min={-100} max={100} step={1}
                                            value={focus.sourcePanX ?? 0}
                                            onChange={(e) => setFileFraming(focus.id, focus.sourceZoom ?? 100, Number(e.target.value), focus.sourcePanY ?? 0)}
                                            className="w-full h-1 rounded-full appearance-none bg-white/10 accent-violet-500 cursor-pointer"
                                        />
                                    </div>
                                    <div className="space-y-0.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[8px] text-white/40">Pan Y</span>
                                            <span className="text-[8px] font-mono text-white/50">{focus.sourcePanY ?? 0}</span>
                                        </div>
                                        <input type="range" min={-100} max={100} step={1}
                                            value={focus.sourcePanY ?? 0}
                                            onChange={(e) => setFileFraming(focus.id, focus.sourceZoom ?? 100, focus.sourcePanX ?? 0, Number(e.target.value))}
                                            className="w-full h-1 rounded-full appearance-none bg-white/10 accent-violet-500 cursor-pointer"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Usage weight */}
                            <div className="space-y-1">
                                <span className="text-[9px] font-black text-white/50 uppercase tracking-wider">Usage</span>
                                <div className="flex rounded-md border border-white/10 overflow-hidden">
                                    {(['more', 'normal', 'less', 'once'] as const).map((mode) => {
                                        const active = (focus.usageMode ?? 'normal') === mode;
                                        return (
                                            <button
                                                key={mode}
                                                onClick={() => setFileUsageWeight(focus.id, mode)}
                                                className={clsx(
                                                    'flex-1 py-1 text-[9px] font-bold uppercase tracking-wider transition-colors',
                                                    active
                                                        ? 'bg-[rgba(255,255,255,0.15)] text-white/90 border-b-2 border-violet-400'
                                                        : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.08] hover:text-white/60',
                                                )}
                                            >
                                                {mode === 'more' ? 'More' : mode === 'normal' ? 'Normal' : mode === 'less' ? 'Less' : 'Once'}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <SegmentEditor file={focus} variant="full" />
                    </div>
                ) : (
                    <div className="text-white/30 text-xs text-center mt-10">Select a clip below to edit its segments.</div>
                )}
            </div>

            <div className="flex-shrink-0 border-t border-white/5 bg-[#0b0b18]/80 p-3">
                <div className="flex items-end gap-3 overflow-x-auto pb-1" style={{ minHeight: 190 }}>
                    {pool.map((f) => (
                        <ManagerThumb
                            key={f.id}
                            file={f}
                            active={f.id === focusId}
                            challenges={challengeCountByFile[f.id] ?? 0}
                            onSelect={() => setFocusId(f.id)}
                            onSetOrientation={(o) => updateFile(f.id, { orientation: o })}
                        />
                    ))}
                </div>
            </div>

            <ProjectDrawer side="right" />
        </div>
    );
};
