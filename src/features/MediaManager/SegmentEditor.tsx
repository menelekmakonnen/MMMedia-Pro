import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
    Sparkles, Plus, Minus, Trash2, RotateCcw, Scissors, Play, Pause,
    SkipBack, SkipForward, Volume2, VolumeX, GripHorizontal, Eye,
} from 'lucide-react';
import clsx from 'clsx';
import { useMediaStore, type MediaFile } from '../../store/mediaStore';
import { useProjectStore } from '../../store/projectStore';
import { useTrailerSmartStore } from '../../store/trailerSmartStore';
import { useSmartTrainingStore } from '../../store/smartTrainingStore';
import {
    resolveKeptRanges,
    keptDuration,
    makeSegment,
    type SegmentCanvas,
    type SegmentType,
} from '../../lib/mediaSegments';
import { suggestSmartSegments, type SmartAnalysisLike } from '../../lib/ege/smartSegments';

// ══════════════════════════════════════════════════════════════════════════════
// SegmentEditor — custom orientation-adaptive player + include/exclude belt.
//
// Shared by the Media-library sidebar and the Import Manager hub. Reads/writes
// MediaFile.segments (the source of truth), runs the Smart Engine, and records
// challenges to train it. The player is a custom transport (play/pause, frame
// step, scrub, volume, speed) rather than the browser default, and its height is
// drag-resizable so each section can be given room.
// ══════════════════════════════════════════════════════════════════════════════

const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec < 10 ? '0' : ''}${sec.toFixed(1)}`;
};

const SPEEDS = [0.25, 0.5, 1, 1.5, 2];

interface SegmentEditorProps {
    file: MediaFile;
    variant?: 'compact' | 'full';
}

export const SegmentEditor: React.FC<SegmentEditorProps> = ({ file, variant = 'compact' }) => {
    const fps = useProjectStore((s) => s.settings?.fps) || 30;
    const addFileSegment = useMediaStore((s) => s.addFileSegment);
    const updateFileSegment = useMediaStore((s) => s.updateFileSegment);
    const removeFileSegment = useMediaStore((s) => s.removeFileSegment);
    const setFileSegments = useMediaStore((s) => s.setFileSegments);
    const toggleFileSegmentType = useMediaStore((s) => s.toggleFileSegmentType);
    const updateFile = useMediaStore((s) => s.updateFile);
    const getSmart = useTrailerSmartStore((s) => s.getResult);
    const bias = useSmartTrainingStore((s) => s.bias);
    const recordEdit = useSmartTrainingStore((s) => s.recordEdit);

    const videoRef = useRef<HTMLVideoElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const scrubRef = useRef<HTMLDivElement>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [loadedDur, setLoadedDur] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);
    const [speed, setSpeed] = useState(1);
    const [aspect, setAspect] = useState<number | null>(file.width && file.height ? file.width / file.height : null);
    const [drag, setDrag] = useState<{ segId: string; edge: 'start' | 'end' } | null>(null);
    const [playerH, setPlayerH] = useState(variant === 'full' ? 380 : 190);
    const [resizing, setResizing] = useState(false);

    const duration = file.duration || loadedDur || 0;
    const segments = file.segments ?? [];
    const canvas: SegmentCanvas = useMemo(
        () => ({ duration, trimIn: file.trimIn, trimOut: file.trimOut }),
        [duration, file.trimIn, file.trimOut],
    );
    const kept = useMemo(() => resolveKeptRanges(canvas, segments), [canvas, segments]);
    const keptSec = useMemo(() => keptDuration(canvas, segments), [canvas, segments]);

    const rot = file.rotation ?? 0;
    const effAspect = useMemo(() => {
        const a = aspect ?? 16 / 9;
        return rot === 90 || rot === 270 ? 1 / a : a;
    }, [aspect, rot]);
    const isVertical = effAspect < 0.95;

    // Sync transport state to the element.
    useEffect(() => { const v = videoRef.current; if (v) v.volume = muted ? 0 : volume; }, [volume, muted, file.id]);
    useEffect(() => { const v = videoRef.current; if (v) v.playbackRate = speed; }, [speed, file.id]);
    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        const onTime = () => setCurrentTime(v.currentTime);
        const onPlay = () => setPlaying(true);
        const onPause = () => setPlaying(false);
        v.addEventListener('timeupdate', onTime);
        v.addEventListener('play', onPlay);
        v.addEventListener('pause', onPause);
        return () => { v.removeEventListener('timeupdate', onTime); v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause); };
    }, [file.id]);

    const seek = useCallback((t: number) => {
        const clamped = Math.max(0, Math.min(t, duration));
        if (videoRef.current) videoRef.current.currentTime = clamped;
        setCurrentTime(clamped);
    }, [duration]);

    const togglePlay = () => { const v = videoRef.current; if (!v) return; if (v.paused) v.play().catch(() => {}); else v.pause(); };
    const step = (frames: number) => seek(currentTime + frames / fps);

    const timeFromX = useCallback((clientX: number, el: HTMLElement | null): number => {
        if (!el || duration <= 0) return 0;
        const r = el.getBoundingClientRect();
        return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration;
    }, [duration]);

    const addSegment = (type: SegmentType) => {
        const start = Math.min(currentTime, Math.max(0, duration - 0.1));
        const end = Math.min(duration, start + Math.max(1, duration * 0.1));
        addFileSegment(file.id, makeSegment(start, end, type, 'user'));
    };

    // Drag a segment edge on the belt.
    const onTrackPointerMove = (e: React.PointerEvent) => {
        if (!drag) return;
        const t = timeFromX(e.clientX, trackRef.current);
        const seg = segments.find((s) => s.id === drag.segId);
        if (!seg) return;
        const before = { inSec: seg.startSec, outSec: seg.endSec };
        const after = drag.edge === 'start'
            ? { startSec: Math.min(t, seg.endSec - 0.1) }
            : { endSec: Math.max(t, seg.startSec + 0.1) };
        updateFileSegment(file.id, seg.id, after);
        if (seg.origin === 'smart') {
            recordEdit(file.id, before, {
                inSec: after.startSec ?? seg.startSec,
                outSec: after.endSec ?? seg.endSec,
            });
        }
    };

    // Player height resizer.
    const onResizeMove = useCallback((e: PointerEvent) => {
        setPlayerH((h) => Math.max(120, Math.min(720, h + e.movementY)));
    }, []);
    useEffect(() => {
        if (!resizing) return;
        const up = () => setResizing(false);
        window.addEventListener('pointermove', onResizeMove);
        window.addEventListener('pointerup', up);
        return () => { window.removeEventListener('pointermove', onResizeMove); window.removeEventListener('pointerup', up); };
    }, [resizing, onResizeMove]);

    // Smart Engine.
    const smart = file.type === 'video' ? getSmart(file.id) : undefined;
    const runSmart = () => {
        const a: SmartAnalysisLike = {
            score: smart?.score, energyLevel: smart?.energyLevel,
            usableInFrames: smart?.usableInFrames, usableOutFrames: smart?.usableOutFrames,
            sceneCutsFrames: smart?.sceneCutsFrames,
        };
        setFileSegments(file.id, suggestSmartSegments(canvas, a, { fps, bias, perScene: variant === 'full' }));
        updateFile(file.id, { smartAnalyzed: true });
    };

    const pct = (t: number) => (duration > 0 ? (t / duration) * 100 : 0);

    return (
        <div className="w-full flex flex-col gap-2.5">
            {/* ── Custom player ── */}
            <div className="w-full flex items-center justify-center bg-black/50 rounded-lg border border-white/10 overflow-hidden relative"
                 style={{ height: playerH }}>
                {file.type === 'video' || file.type === 'image' ? (
                    <video
                        ref={videoRef}
                        key={file.id}
                        src={`file://${file.path}`}
                        className="object-contain"
                        style={{
                            maxHeight: '100%', maxWidth: '100%',
                            aspectRatio: String(effAspect),
                            width: isVertical ? 'auto' : '100%',
                            height: isVertical ? '100%' : 'auto',
                            transform: rot ? `rotate(${rot}deg)` : undefined,
                        }}
                        onClick={togglePlay}
                        onLoadedMetadata={(e) => {
                            const v = e.currentTarget;
                            setLoadedDur(v.duration || 0);
                            v.volume = muted ? 0 : volume;
                            v.playbackRate = speed;
                            if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight);
                        }}
                    />
                ) : (
                    <div className="py-10 text-white/30 text-xs">Audio — segment its waveform below</div>
                )}
            </div>

            {/* ── Player-height resize handle ── */}
            <div
                onPointerDown={(e) => { e.preventDefault(); setResizing(true); }}
                className="h-2 -mt-1 flex items-center justify-center cursor-ns-resize text-white/20 hover:text-white/50"
                title="Drag to resize the player"
            >
                <GripHorizontal size={12} />
            </div>

            {/* ── Transport controls ── */}
            {file.type !== 'image' && (
                <div className="flex items-center gap-2">
                    <button onClick={() => step(-1)} className="text-white/60 hover:text-white" title="Previous frame"><SkipBack size={14} /></button>
                    <button onClick={togglePlay} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white">
                        {playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                    </button>
                    <button onClick={() => step(1)} className="text-white/60 hover:text-white" title="Next frame"><SkipForward size={14} /></button>

                    {/* scrubber */}
                    <div ref={scrubRef}
                         className="relative flex-1 h-2 rounded-full bg-white/10 cursor-pointer"
                         onClick={(e) => seek(timeFromX(e.clientX, scrubRef.current))}>
                        <div className="absolute top-0 bottom-0 left-0 rounded-full bg-primary/70" style={{ width: `${pct(currentTime)}%` }} />
                        <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow" style={{ left: `calc(${pct(currentTime)}% - 5px)` }} />
                    </div>

                    <span className="text-[9px] font-mono text-white/50 tabular-nums whitespace-nowrap">{fmt(currentTime)} / {fmt(duration)}</span>

                    {/* volume */}
                    <button onClick={() => setMuted((m) => !m)} className="text-white/50 hover:text-white">
                        {muted || volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
                    </button>
                    <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
                           onChange={(e) => { setVolume(parseFloat(e.target.value)); setMuted(false); }}
                           className="w-12 h-1 accent-primary cursor-pointer" />

                    {/* speed */}
                    <select value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))}
                            className="text-[9px] bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white/70 outline-none cursor-pointer">
                        {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
                    </select>
                </div>
            )}

            {/* ── Kept readout ── */}
            <div className="flex items-center justify-between text-[10px]">
                <span className="text-white/40">
                    Kept <span className="font-mono font-bold text-emerald-300">{fmt(keptSec)}</span> of {fmt(duration)}
                    {kept.length > 1 && <span className="text-white/30"> · {kept.length} ranges</span>}
                </span>
                <span className="text-white/30">{segments.filter(s => s.type === 'include').length} include · {segments.filter(s => s.type === 'exclude').length} exclude · {segments.filter(s => s.type === 'show').length} show</span>
            </div>

            {/* ── Segment belt ── */}
            <div
                ref={trackRef}
                className="relative h-12 rounded-lg bg-white/[0.03] border border-white/10 overflow-hidden cursor-pointer select-none touch-none"
                onPointerMove={onTrackPointerMove}
                onPointerUp={() => setDrag(null)}
                onPointerLeave={() => setDrag(null)}
                onClick={(e) => { if (!drag) seek(timeFromX(e.clientX, trackRef.current)); }}
            >
                {kept.map((r, i) => (
                    <div key={`k${i}`} className="absolute top-0 bottom-0 bg-emerald-500/15 border-x border-emerald-400/30 pointer-events-none"
                         style={{ left: `${pct(r.startSec)}%`, width: `${pct(r.endSec - r.startSec)}%` }} />
                ))}
                {segments.map((seg) => (
                    <div
                        key={seg.id}
                        className={clsx('absolute top-1 bottom-1 rounded border flex items-center justify-center group',
                            seg.type === 'include' ? 'bg-emerald-500/25 border-emerald-400/50'
                            : seg.type === 'show' ? 'bg-amber-500/25 border-amber-400/50'
                            : 'bg-red-500/25 border-red-400/50')}
                        style={{ left: `${pct(seg.startSec)}%`, width: `${pct(seg.endSec - seg.startSec)}%` }}
                        title={`${seg.label ?? seg.type}${seg.origin === 'smart' ? ' (Smart)' : ''}`}
                    >
                        <div onPointerDown={(e) => { e.stopPropagation(); (e.target as HTMLElement).setPointerCapture(e.pointerId); setDrag({ segId: seg.id, edge: 'start' }); }}
                             className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/30 hover:bg-white/70" />
                        <div onPointerDown={(e) => { e.stopPropagation(); (e.target as HTMLElement).setPointerCapture(e.pointerId); setDrag({ segId: seg.id, edge: 'end' }); }}
                             className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/30 hover:bg-white/70" />
                        {seg.origin === 'smart' && <Sparkles size={9} className="text-white/70 absolute top-0.5 left-2" />}
                        <span className="text-[7px] font-bold text-white/80 truncate px-2 pointer-events-none">{seg.label ?? seg.type}</span>
                        <div className="absolute top-0 right-1 hidden group-hover:flex items-center gap-0.5 z-10">
                            <button onClick={(e) => { e.stopPropagation(); toggleFileSegmentType(file.id, seg.id); }}
                                    className="bg-black/70 rounded p-0.5 text-white/70 hover:text-white" title="Cycle: include → exclude → show">
                                {seg.type === 'include' ? <Minus size={8} /> : seg.type === 'show' ? <Eye size={8} /> : <Plus size={8} />}
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); if (seg.origin === 'smart') recordEdit(file.id, { inSec: seg.startSec, outSec: seg.endSec }, { inSec: seg.startSec, outSec: seg.startSec }); removeFileSegment(file.id, seg.id); }}
                                    className="bg-black/70 rounded p-0.5 text-white/70 hover:text-red-400" title="Delete">
                                <Trash2 size={8} />
                            </button>
                        </div>
                    </div>
                ))}
                <div className="absolute top-0 bottom-0 w-0.5 bg-white/80 z-[5] pointer-events-none" style={{ left: `${pct(currentTime)}%` }} />
            </div>

            {/* ── Controls ── */}
            <div className="flex flex-wrap items-center gap-1.5">
                <button onClick={() => addSegment('include')}
                        className="px-2 py-1 rounded text-[9px] font-bold border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 inline-flex items-center gap-1">
                    <Plus size={9} /> Include
                </button>
                <button onClick={() => addSegment('exclude')}
                        className="px-2 py-1 rounded text-[9px] font-bold border border-red-500/30 text-red-300 hover:bg-red-500/10 inline-flex items-center gap-1">
                    <Scissors size={9} /> Never include
                </button>
                <button onClick={() => addSegment('show')}
                        className="px-2 py-1 rounded text-[9px] font-bold border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 inline-flex items-center gap-1">
                    <Eye size={9} /> Show this
                </button>
                {file.type === 'video' && (
                    <button onClick={runSmart}
                            className="px-2 py-1 rounded text-[9px] font-bold border border-violet-500/40 text-violet-300 hover:bg-violet-500/10 inline-flex items-center gap-1"
                            title={smart ? 'Use Smart Engine suggestions' : 'Smart Engine still analyzing — suggestions improve once done'}>
                        <Sparkles size={9} /> Smart suggest
                    </button>
                )}
                {segments.length > 0 && (
                    <button onClick={() => setFileSegments(file.id, [])}
                            className="px-2 py-1 rounded text-[9px] font-bold border border-white/10 text-white/50 hover:bg-white/5 inline-flex items-center gap-1 ml-auto">
                        <RotateCcw size={9} /> Clear
                    </button>
                )}
            </div>
            <p className="text-[8px] text-white/30">
                <span className="text-emerald-300/70">Include</span> marks usable ranges. <span className="text-red-300/70">Never include</span> drops footage. <span className="text-amber-300/70">Show this</span> forces the full segment into the edit (speed-ramped if long).
                {file.smartAnalyzed && ' Drag or delete Smart segments to challenge and train the engine.'}
            </p>
        </div>
    );
};
