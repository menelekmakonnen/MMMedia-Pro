import React from 'react';
import { motion } from 'framer-motion';
import {
    MousePointer2, Scissors, Hand, Magnet, SkipBack, SkipForward, Play, Pause, Square,
    Repeat, Volume2, VolumeX, ZoomIn, ZoomOut, MonitorSmartphone, Clipboard
} from 'lucide-react';
import clsx from 'clsx';
import { formatTimecode } from '../../lib/time';

export type SequenceTool = 'select' | 'razor' | 'hand';

interface SequenceToolbarProps {
    activeTool: SequenceTool;
    onToolChange: (tool: SequenceTool) => void;
    snapEnabled: boolean;
    onSnapToggle: () => void;
    isPlaying: boolean;
    onPlayPause: () => void;
    onStop: () => void;
    onSkipPrev: () => void;
    onSkipNext: () => void;
    currentFrame: number;
    maxFrame: number;
    fps: number;
    scale: number;
    onScaleChange: (scale: number) => void;
    isLooping: boolean;
    onLoopToggle: () => void;
    clipboardCount: number;
    onPaste: () => void;
    aspectRatio: string;
    onAspectCycle: () => void;
    onMagnetize: () => void;
}

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
                ? 'bg-primary/25 text-primary ring-1 ring-primary/40 shadow-[0_0_8px_rgba(74,158,224,0.15)]'
                : 'text-white/40 hover:text-white/70 hover:bg-white/5'
        )}
    >
        {children}
    </motion.button>
);

export const SequenceToolbar: React.FC<SequenceToolbarProps> = ({
    activeTool,
    onToolChange,
    snapEnabled,
    onSnapToggle,
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
    clipboardCount,
    onPaste,
    aspectRatio,
    onAspectCycle,
    onMagnetize,
}) => {
    const timecode = formatTimecode(currentFrame, fps);
    const totalTimecode = formatTimecode(maxFrame, fps);

    return (
        <div className="h-9 flex items-center justify-between px-2 bg-[#111122]/90 backdrop-blur-sm border-b border-white/[0.06] flex-shrink-0 select-none z-30">
            {/* ── Left: Tool Selection ── */}
            <div className="flex items-center gap-0.5">
                {/* Tool radio group */}
                <div className="flex items-center gap-0.5 bg-[#0a0a18]/60 rounded-md p-0.5 border border-white/[0.04]">
                    <ToolButton
                        active={activeTool === 'select'}
                        onClick={() => onToolChange('select')}
                        title="Selection Tool"
                        shortcut="V"
                    >
                        <MousePointer2 size={13} />
                    </ToolButton>
                    <ToolButton
                        active={activeTool === 'razor'}
                        onClick={() => onToolChange('razor')}
                        title="Razor Tool"
                        shortcut="C"
                    >
                        <Scissors size={13} />
                    </ToolButton>
                    <ToolButton
                        active={activeTool === 'hand'}
                        onClick={() => onToolChange('hand')}
                        title="Hand Tool"
                        shortcut="H"
                    >
                        <Hand size={13} />
                    </ToolButton>
                </div>

                {/* Divider */}
                <div className="w-px h-5 bg-white/[0.06] mx-1.5" />

                {/* Snap + Magnetize */}
                <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={onSnapToggle}
                    title={snapEnabled ? 'Snap Enabled (S)' : 'Snap Disabled (S)'}
                    className={clsx(
                        'p-1.5 rounded transition-all duration-150',
                        snapEnabled
                            ? 'text-amber-400 bg-amber-400/10'
                            : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                    )}
                >
                    <Magnet size={13} />
                </motion.button>

                <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={onMagnetize}
                    title="Magnetize (Remove Gaps)"
                    className="p-1.5 rounded text-white/30 hover:text-accent hover:bg-white/5 transition-all duration-150"
                >
                    <Magnet size={13} className="rotate-180" />
                </motion.button>

                {/* Paste */}
                <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={onPaste}
                    disabled={clipboardCount === 0}
                    title={`Paste (${clipboardCount} clip${clipboardCount !== 1 ? 's' : ''})`}
                    className={clsx(
                        'p-1.5 rounded transition-all duration-150',
                        clipboardCount > 0
                            ? 'text-white/50 hover:text-white hover:bg-white/5'
                            : 'text-white/10 cursor-not-allowed'
                    )}
                >
                    <Clipboard size={13} />
                </motion.button>

                {activeTool === 'razor' && (
                    <span className="text-[9px] text-red-400 font-bold animate-pulse ml-2 tracking-wide">
                        ✂ RAZOR
                    </span>
                )}
            </div>

            {/* ── Center: Transport + Timecode ── */}
            <div className="flex items-center gap-3">
                {/* Transport Buttons */}
                <div className="flex items-center gap-0.5 bg-[#0a0a18]/60 rounded-md p-0.5 border border-white/[0.04]">
                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={onSkipPrev}
                        className="p-1.5 text-white/50 hover:text-white hover:bg-white/5 rounded transition-colors"
                        title="Previous Edit (↑)"
                    >
                        <SkipBack size={12} />
                    </motion.button>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={onStop}
                        className="p-1.5 text-white/50 hover:text-red-400 hover:bg-white/5 rounded transition-colors"
                        title="Stop"
                    >
                        <Square size={10} fill="currentColor" />
                    </motion.button>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={onPlayPause}
                        className={clsx(
                            'p-1.5 rounded transition-all duration-150',
                            isPlaying
                                ? 'text-primary bg-primary/15'
                                : 'text-white/60 hover:text-white hover:bg-white/5'
                        )}
                        title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                    >
                        {isPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                    </motion.button>
                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={onSkipNext}
                        className="p-1.5 text-white/50 hover:text-white hover:bg-white/5 rounded transition-colors"
                        title="Next Edit (↓)"
                    >
                        <SkipForward size={12} />
                    </motion.button>
                </div>

                {/* Timecode Display */}
                <div className="flex items-center gap-1.5 bg-[#080810]/80 rounded px-2.5 py-1 border border-white/[0.06] font-mono">
                    <span className="text-[11px] text-primary font-semibold tracking-wider">{timecode}</span>
                    <span className="text-[9px] text-white/20">/</span>
                    <span className="text-[10px] text-white/30 tracking-wider">{totalTimecode}</span>
                </div>

                {/* Loop toggle */}
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
            </div>

            {/* ── Right: Zoom + Aspect ── */}
            <div className="flex items-center gap-2">
                {/* Zoom Slider */}
                <div className="flex items-center gap-1.5">
                    <ZoomOut size={11} className="text-white/25" />
                    <input
                        type="range"
                        min="0.05"
                        max="3"
                        step="0.05"
                        value={scale}
                        onChange={(e) => onScaleChange(parseFloat(e.target.value))}
                        className="w-16 h-0.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary/80 [&::-webkit-slider-thumb]:hover:bg-primary"
                        title={`Timeline Zoom: ${Math.round(scale * 100)}%`}
                    />
                    <ZoomIn size={11} className="text-white/25" />
                </div>

                <div className="w-px h-4 bg-white/[0.06]" />

                {/* Aspect Ratio */}
                <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={onAspectCycle}
                    title={`Aspect: ${aspectRatio}`}
                    className="p-1.5 rounded text-white/30 hover:text-white/70 hover:bg-white/5 transition-all"
                >
                    <MonitorSmartphone size={13} />
                </motion.button>

                <span className="text-[9px] font-mono text-white/20 tracking-wide">{aspectRatio}</span>
            </div>
        </div>
    );
};
