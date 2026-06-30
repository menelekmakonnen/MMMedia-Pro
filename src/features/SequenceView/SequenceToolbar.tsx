import React, { useCallback, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    MousePointer2, Scissors, Hand, Magnet, SkipBack, SkipForward, Play, Pause,
    Repeat, ZoomIn, ZoomOut, Link, Link2Off, Bookmark, Download,
    ChevronsLeft, ChevronsRight, Maximize2, MoveHorizontal, GripHorizontal,
    Gauge, SlidersHorizontal, ArrowRightLeft, Columns, MousePointerClick, PenTool
} from 'lucide-react';
import clsx from 'clsx';
import { formatTimecode } from '../../lib/time';
import { computeReadiness } from '../../lib/editReadiness';
import { useClipStore } from '../../store/clipStore';
import { useTimelineStore } from './timeline/useTimelineStore';
import type { ActiveTool } from './timeline/types';

// ─── Tool Type Export ─────────────────────────────────────────────────────────

/**
 * Expanded tool set for the NLE toolbar.
 * 'select' | 'trim' | 'razor' | 'slip' | 'slide' | 'hand' | 'rate-stretch'
 *
 * Legacy consumers still see the original SequenceTool union.
 */
export type SequenceTool =
  | 'select' | 'trim' | 'razor' | 'slip' | 'slide' | 'hand' | 'rate-stretch'
  | 'ripple' | 'rolling' | 'track-select' | 'pen' | 'zoom';

// ─── Props ────────────────────────────────────────────────────────────────────

interface SequenceToolbarProps {
    // Legacy props (still accepted for SequenceViewTab compatibility).
    activeTool?: SequenceTool;
    onToolChange?: (tool: SequenceTool) => void;
    snapEnabled?: boolean;
    onSnapToggle?: () => void;
    isPlaying: boolean;
    onPlayPause: () => void;
    onStop?: () => void;
    onSkipPrev: () => void;
    onSkipNext: () => void;
    currentFrame: number;
    maxFrame: number;
    fps: number;
    scale: number;
    onScaleChange: (scale: number) => void;
    isLooping: boolean;
    onLoopToggle: () => void;
    clipboardCount?: number;
    onPaste?: () => void;
    aspectRatio?: string;
    onAspectCycle?: () => void;
    onMagnetize?: () => void;
    // New optional props
    shuttleSpeed?: number;    // JKL speed indicator (-4..4)
    linkedSelection?: boolean;
    onLinkedToggle?: () => void;
    onAddMarker?: () => void;
    onQuickExport?: () => void;
    onFitZoom?: () => void;
}

// ─── Tool Button ──────────────────────────────────────────────────────────────

const ToolButton: React.FC<{
    active: boolean;
    onClick: () => void;
    title: string;
    shortcut: string;
    children: React.ReactNode;
}> = ({ active, onClick, title, shortcut, children }) => (
    <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onClick}
        title={`${title} (${shortcut})`}
        className={clsx(
            'p-1.5 rounded transition-all duration-150',
            active
                ? 'bg-purple-500/25 text-purple-400 ring-1 ring-purple-500/40 shadow-[0_0_8px_rgba(168,85,247,0.15)]'
                : 'text-white/40 hover:text-white/70 hover:bg-white/5'
        )}
    >
        {children}
    </motion.button>
);

// ─── Transport Button ─────────────────────────────────────────────────────────

const TransportBtn: React.FC<{
    onClick: () => void;
    title: string;
    active?: boolean;
    children: React.ReactNode;
}> = ({ onClick, title, active, children }) => (
    <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={onClick}
        className={clsx(
            'p-1.5 rounded transition-colors',
            active
                ? 'text-primary bg-primary/15'
                : 'text-white/50 hover:text-white hover:bg-white/5'
        )}
        title={title}
    >
        {children}
    </motion.button>
);

// ─── Shuttle Label ────────────────────────────────────────────────────────────

function shuttleLabel(speed: number): string {
    if (speed === 0) return '';
    const dir = speed > 0 ? '▶' : '◀';
    const abs = Math.abs(speed);
    if (abs === 1) return `${dir} 1×`;
    return `${dir.repeat(Math.min(abs, 3))} ${abs}×`;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export const SequenceToolbar: React.FC<SequenceToolbarProps> = ({
    activeTool: propTool,
    onToolChange: propOnToolChange,
    snapEnabled: propSnap,
    onSnapToggle: propSnapToggle,
    isPlaying,
    onPlayPause,
    onStop,
    onSkipPrev,
    onSkipNext,
    currentFrame,
    maxFrame,
    fps,
    scale,
    onScaleChange,
    isLooping,
    onLoopToggle,
    clipboardCount = 0,
    onPaste,
    onMagnetize,
    shuttleSpeed = 0,
    linkedSelection: propLinked,
    onLinkedToggle,
    onAddMarker,
    onQuickExport,
    onFitZoom,
}) => {
    // ── Read from store (with prop fallbacks for backward compat) ──
    const storeTool = useTimelineStore((s) => s.activeTool);
    const storeSnap = useTimelineStore((s) => s.snapEnabled);
    const storeSetTool = useTimelineStore((s) => s.setActiveTool);
    const storeToggleSnap = useTimelineStore((s) => s.toggleSnapEnabled);

    const currentTool: SequenceTool = (propTool ?? storeTool) as SequenceTool;
    const snapOn = propSnap ?? storeSnap;
    const linkedOn = propLinked ?? false;

    const setTool = useCallback((tool: SequenceTool) => {
        if (propOnToolChange) propOnToolChange(tool);
        storeSetTool(tool as ActiveTool);
    }, [propOnToolChange, storeSetTool]);

    const handleSnapToggle = useCallback(() => {
        if (propSnapToggle) propSnapToggle();
        else storeToggleSnap();
    }, [propSnapToggle, storeToggleSnap]);

    const timecode = formatTimecode(currentFrame, fps);
    const totalTimecode = formatTimecode(maxFrame, fps);
    const zoomPercent = Math.round(scale * 100);

    // ── Edit Readiness ──
    const clips = useClipStore(s => s.clips);
    const readiness = useMemo(() => computeReadiness(clips), [clips]);
    const [showChecklist, setShowChecklist] = useState(false);

    const scoreColor = readiness.total >= 90 ? '#22c55e'
        : readiness.total >= 80 ? '#86efac'
        : readiness.total >= 50 ? '#f59e0b'
        : '#ef4444';

    // ── Fit-to-view handler ──
    const handleFit = useCallback(() => {
        if (onFitZoom) {
            onFitZoom();
        } else {
            // Rough heuristic: set scale so entire sequence fits in ~1200px.
            const fitScale = maxFrame > 0 ? Math.max(0.02, Math.min(5, 1200 / maxFrame)) : 1;
            onScaleChange(fitScale);
        }
    }, [onFitZoom, maxFrame, onScaleChange]);

    return (
        <div className="h-9 flex items-center justify-between px-2 bg-[#111122] border-b border-white/[0.06] flex-shrink-0 select-none z-30">
            {/* ══════ LEFT: Tool Palette ══════ */}
            <div className="flex items-center gap-0.5">
                {/* ── Tool Radio Group ── */}
                <div className="flex items-center gap-0.5 bg-[#0a0a18]/60 rounded-md p-0.5 border border-white/[0.04]">
                    <ToolButton
                        active={currentTool === 'select'}
                        onClick={() => setTool('select')}
                        title="Selection Tool"
                        shortcut="V"
                    >
                        <MousePointer2 size={13} />
                    </ToolButton>
                    <ToolButton
                        active={currentTool === 'trim'}
                        onClick={() => setTool('trim')}
                        title="Trim Tool"
                        shortcut="T"
                    >
                        <SlidersHorizontal size={13} />
                    </ToolButton>
                    <ToolButton
                        active={currentTool === 'razor'}
                        onClick={() => setTool('razor')}
                        title="Razor Tool"
                        shortcut="C"
                    >
                        <Scissors size={13} />
                    </ToolButton>
                    <ToolButton
                        active={currentTool === 'slip'}
                        onClick={() => setTool('slip')}
                        title="Slip Tool"
                        shortcut="Y"
                    >
                        <MoveHorizontal size={13} />
                    </ToolButton>
                    <ToolButton
                        active={currentTool === 'slide'}
                        onClick={() => setTool('slide')}
                        title="Slide Tool"
                        shortcut="U"
                    >
                        <GripHorizontal size={13} />
                    </ToolButton>
                    <ToolButton
                        active={currentTool === 'hand'}
                        onClick={() => setTool('hand')}
                        title="Hand Tool"
                        shortcut="H"
                    >
                        <Hand size={13} />
                    </ToolButton>
                    <ToolButton
                        active={currentTool === 'rate-stretch'}
                        onClick={() => setTool('rate-stretch')}
                        title="Rate Stretch Tool"
                        shortcut="R"
                    >
                        <Gauge size={13} />
                    </ToolButton>
                    <ToolButton
                        active={currentTool === 'ripple'}
                        onClick={() => setTool('ripple')}
                        title="Ripple Edit Tool"
                        shortcut="B"
                    >
                        <ArrowRightLeft size={13} />
                    </ToolButton>
                    <ToolButton
                        active={currentTool === 'rolling'}
                        onClick={() => setTool('rolling')}
                        title="Rolling Edit Tool"
                        shortcut="N"
                    >
                        <Columns size={13} />
                    </ToolButton>
                    <ToolButton
                        active={currentTool === 'track-select'}
                        onClick={() => setTool('track-select')}
                        title="Track Select Forward Tool"
                        shortcut="A"
                    >
                        <MousePointerClick size={13} />
                    </ToolButton>
                    <ToolButton
                        active={currentTool === 'pen'}
                        onClick={() => setTool('pen')}
                        title="Pen Tool (keyframes)"
                        shortcut="P"
                    >
                        <PenTool size={13} />
                    </ToolButton>
                    <ToolButton
                        active={currentTool === 'zoom'}
                        onClick={() => setTool('zoom')}
                        title="Zoom Tool"
                        shortcut="Z"
                    >
                        <ZoomIn size={13} />
                    </ToolButton>
                </div>

                {/* ── Divider ── */}
                <div className="w-px h-5 bg-white/[0.06] mx-1.5" />

                {/* ── Snap Toggle ── */}
                <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={handleSnapToggle}
                    title={snapOn ? 'Snap Enabled (S)' : 'Snap Disabled (S)'}
                    className={clsx(
                        'p-1.5 rounded transition-all duration-150',
                        snapOn
                            ? 'text-amber-400 bg-amber-400/10'
                            : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                    )}
                >
                    <Magnet size={13} />
                </motion.button>

                {/* ── Link Toggle ── */}
                <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={onLinkedToggle}
                    title={linkedOn ? 'Linked Selection On (Shift+L)' : 'Linked Selection Off (Shift+L)'}
                    className={clsx(
                        'p-1.5 rounded transition-all duration-150',
                        linkedOn
                            ? 'text-cyan-400 bg-cyan-400/10'
                            : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                    )}
                >
                    {linkedOn ? <Link size={13} /> : <Link2Off size={13} />}
                </motion.button>

                {/* ── Active tool label ── */}
                {currentTool === 'razor' && (
                    <span className="text-[9px] text-red-400 font-bold animate-pulse ml-2 tracking-wide">
                        ✂ RAZOR
                    </span>
                )}
                {currentTool === 'trim' && (
                    <span className="text-[9px] text-yellow-400 font-medium ml-2 tracking-wide">
                        ✂ TRIM
                    </span>
                )}
                {currentTool === 'slip' && (
                    <span className="text-[9px] text-blue-400 font-medium ml-2 tracking-wide">
                        ↔ SLIP
                    </span>
                )}
                {currentTool === 'slide' && (
                    <span className="text-[9px] text-green-400 font-medium ml-2 tracking-wide">
                        ⇔ SLIDE
                    </span>
                )}
                {currentTool === 'rate-stretch' && (
                    <span className="text-[9px] text-orange-400 font-medium ml-2 tracking-wide">
                        ⏩ RATE
                    </span>
                )}
                {currentTool === 'ripple' && (
                    <span className="text-[9px] text-rose-400 font-medium ml-2 tracking-wide">⇄ RIPPLE</span>
                )}
                {currentTool === 'rolling' && (
                    <span className="text-[9px] text-teal-400 font-medium ml-2 tracking-wide">‖ ROLLING</span>
                )}
                {currentTool === 'track-select' && (
                    <span className="text-[9px] text-fuchsia-400 font-medium ml-2 tracking-wide">➤ TRACK SELECT</span>
                )}
                {currentTool === 'pen' && (
                    <span className="text-[9px] text-lime-400 font-medium ml-2 tracking-wide">✎ PEN</span>
                )}
                {currentTool === 'zoom' && (
                    <span className="text-[9px] text-sky-400 font-medium ml-2 tracking-wide">🔍 ZOOM</span>
                )}
            </div>

            {/* ══════ CENTER: Transport + Timecode ══════ */}
            <div className="flex items-center gap-3">
                {/* ── Transport Buttons ── */}
                <div className="flex items-center gap-0.5 bg-[#0a0a18]/60 rounded-md p-0.5 border border-white/[0.04]">
                    {/* Skip to Start */}
                    <TransportBtn
                        onClick={() => onSkipPrev()}
                        title="Skip to Start (Home)"
                    >
                        <ChevronsLeft size={12} />
                    </TransportBtn>

                    {/* Previous Edit */}
                    <TransportBtn
                        onClick={onSkipPrev}
                        title="Previous Edit (↑)"
                    >
                        <SkipBack size={12} />
                    </TransportBtn>

                    {/* Play / Pause */}
                    <TransportBtn
                        onClick={onPlayPause}
                        title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                        active={isPlaying}
                    >
                        {isPlaying
                            ? <Pause size={12} fill="currentColor" />
                            : <Play size={12} fill="currentColor" />
                        }
                    </TransportBtn>

                    {/* Next Edit */}
                    <TransportBtn
                        onClick={onSkipNext}
                        title="Next Edit (↓)"
                    >
                        <SkipForward size={12} />
                    </TransportBtn>

                    {/* Skip to End */}
                    <TransportBtn
                        onClick={() => onSkipNext()}
                        title="Skip to End (End)"
                    >
                        <ChevronsRight size={12} />
                    </TransportBtn>
                </div>

                {/* ── Timecode Display ── */}
                <div className="flex items-center gap-1.5 bg-[#080810]/80 rounded px-2.5 py-1 border border-white/[0.06] font-mono">
                    <span className="text-[11px] text-primary font-semibold tracking-wider">
                        {timecode}
                    </span>
                    <span className="text-[9px] text-white/20">/</span>
                    <span className="text-[10px] text-white/30 tracking-wider">
                        {totalTimecode}
                    </span>
                </div>

                {/* ── Loop Toggle ── */}
                <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={onLoopToggle}
                    title={isLooping ? 'Loop On' : 'Loop Off'}
                    className={clsx(
                        'p-1.5 rounded transition-all duration-150',
                        isLooping
                            ? 'text-primary bg-primary/15'
                            : 'text-white/25 hover:text-white/50 hover:bg-white/5'
                    )}
                >
                    <Repeat size={12} />
                </motion.button>

                {/* ── JKL Shuttle Indicator ── */}
                {shuttleSpeed !== 0 && (
                    <div className={clsx(
                        'px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider',
                        shuttleSpeed > 0
                            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                            : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                    )}>
                        {shuttleLabel(shuttleSpeed)}
                    </div>
                )}
            </div>

            {/* ══════ RIGHT: Zoom + Markers + Export ══════ */}
            <div className="flex items-center gap-2">
                {/* ── Zoom Slider ── */}
                <div className="flex items-center gap-1.5">
                    <ZoomOut size={11} className="text-white/25" />
                    <input
                        type="range"
                        min="0.02"
                        max="5"
                        step="0.02"
                        value={scale}
                        onChange={(e) => onScaleChange(parseFloat(e.target.value))}
                        className="w-16 h-0.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary/80 [&::-webkit-slider-thumb]:hover:bg-primary"
                        title={`Timeline Zoom: ${zoomPercent}%`}
                    />
                    <ZoomIn size={11} className="text-white/25" />
                </div>

                {/* ── Fit Button ── */}
                <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={handleFit}
                    title="Fit Timeline to View (\\)"
                    className="p-1 rounded text-white/30 hover:text-white/70 hover:bg-white/5 transition-all"
                >
                    <Maximize2 size={11} />
                </motion.button>

                {/* ── Zoom Percentage ── */}
                <span className="text-[9px] font-mono text-white/20 w-7 text-right">
                    {zoomPercent}%
                </span>

                <div className="w-px h-4 bg-white/[0.06]" />

                {/* ── Add Marker ── */}
                <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={onAddMarker}
                    title="Add Marker (M)"
                    className="p-1.5 rounded text-white/30 hover:text-emerald-400 hover:bg-white/5 transition-all"
                >
                    <Bookmark size={13} />
                </motion.button>

                {/* ── Quick Export ── */}
                <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={onQuickExport}
                    title="Quick Export (Ctrl+Shift+E)"
                    className="p-1.5 rounded text-white/30 hover:text-primary hover:bg-white/5 transition-all"
                >
                    <Download size={13} />
                </motion.button>

                <div className="w-px h-4 bg-white/[0.06]" />

                {/* ── Edit Readiness Indicator ── */}
                <div className="relative ml-auto">
                    <button
                        onClick={() => setShowChecklist(prev => !prev)}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors group"
                        title={`Edit Readiness: ${readiness.total}%`}
                    >
                        {/* Circular progress ring */}
                        <svg width="24" height="24" viewBox="0 0 24 24" className="-rotate-90">
                            <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
                            <circle
                                cx="12" cy="12" r="10" fill="none"
                                stroke={scoreColor}
                                strokeWidth="2"
                                strokeDasharray={`${readiness.total * 0.628} 62.8`}
                                strokeLinecap="round"
                                className={readiness.total >= 90 ? 'animate-pulse' : ''}
                            />
                        </svg>
                        <span className="text-[10px] font-bold" style={{ color: scoreColor }}>
                            {readiness.total}%
                        </span>
                        {readiness.total >= 90 && (
                            <span className="text-[9px] text-emerald-400/80 font-medium hidden group-hover:block">
                                Ready!
                            </span>
                        )}
                    </button>

                    {/* Checklist popover */}
                    {showChecklist && (
                        <div className="absolute top-full right-0 mt-1 w-64 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl z-50 p-3 space-y-1.5">
                            <div className="text-[10px] font-bold text-white/70 uppercase tracking-wider mb-2">Edit Readiness</div>
                            {readiness.checks.map((check, i) => (
                                <div key={i} className="flex items-center gap-2 text-[10px]">
                                    <span className={check.passed ? 'text-emerald-400' : 'text-white/20'}>
                                        {check.passed ? '✓' : '○'}
                                    </span>
                                    <span className={check.passed ? 'text-white/60' : 'text-white/30'}>
                                        {check.name}
                                    </span>
                                    {!check.passed && (
                                        <span className="text-white/20 ml-auto text-[8px]">{check.tip}</span>
                                    )}
                                </div>
                            ))}
                            {readiness.total >= 90 && (
                                <div className="mt-2 pt-2 border-t border-white/5 text-[9px] text-emerald-400/70 text-center">
                                    🎬 Your edit is ready to publish!
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
