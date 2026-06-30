import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clip } from '../../store/clipStore';
import { Plus, FileVideo, FileAudio, LayoutGrid, Trash2, CheckSquare, Square as SquareIcon, RotateCw, Scissors, Check, X } from 'lucide-react';

/** Format seconds into a human-readable duration that scales with magnitude.
 *  < 60s  → "12.3s"   |  ≥ 60s → "2:05"  |  ≥ 1h → "1:02:05"  |  ≥ 1d → "1:02:05:30" */
const formatDuration = (seconds: number): string => {
    if (!seconds || seconds < 0) return '0s';
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const pad = (n: number) => String(n).padStart(2, '0');
    if (d > 0) return `${d}:${pad(h)}:${pad(m)}:${pad(s)}`;
    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
    return `${m}:${pad(s)}`;
};

interface MediaItemProps {
    clip: Clip;
    isSelected: boolean;
    isMultiSelected: boolean;
    isTrimmed?: boolean;
    trimDurationLabel?: string;
    viewMode: 'grid' | 'list';
    hasPendingRotation?: boolean;
    onSelect: (e: React.MouseEvent) => void;
    onAdd: () => void;
    onGridAdd?: () => void;
    onRotate?: () => void;
    onConfirmRotation?: () => void;
    onCancelRotation?: () => void;
    onDelete?: () => void;
}

export const MediaItem: React.FC<MediaItemProps> = ({ clip, isSelected, isMultiSelected, isTrimmed, trimDurationLabel, viewMode, hasPendingRotation, onSelect, onAdd, onGridAdd, onRotate, onConfirmRotation, onCancelRotation, onDelete }) => {
    return (
        <motion.div
            onClick={onSelect}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`
                group relative border-2 rounded-lg overflow-hidden cursor-pointer transition-all duration-200
                ${hasPendingRotation
                    ? 'border-blue-500/70 ring-2 ring-blue-500/50 bg-blue-500/15 shadow-[0_0_12px_rgba(59,130,246,0.35)]'
                    : isMultiSelected
                        ? 'border-purple-500/80 ring-2 ring-purple-500/50 bg-purple-500/15 shadow-[0_0_12px_rgba(168,85,247,0.35)]'
                        : isSelected
                            ? 'border-accent ring-2 ring-accent/60 bg-accent/10 shadow-[0_0_12px_rgba(229,164,57,0.3)]'
                            : 'border-white/10 hover:border-white/25 bg-white/5 hover:bg-white/10'}
                ${viewMode === 'list' ? 'flex items-center gap-4 p-2' : 'p-3'}
            `}
        >
            {/* Multi-select Checkbox Indicator */}
            <div className={`
                absolute z-30 transition-all
                ${viewMode === 'grid' ? 'top-1.5 left-1.5' : 'relative top-auto left-auto flex-shrink-0'}
                ${isMultiSelected || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'}
            `}>
                {isMultiSelected ? (
                    <CheckSquare size={viewMode === 'grid' ? 16 : 14} className="text-purple-400 drop-shadow-md" />
                ) : (
                    <SquareIcon size={viewMode === 'grid' ? 16 : 14} className="text-white/50" />
                )}
            </div>

            {/* Thumbnail */}
            <div className={`
                relative bg-black/50 rounded flex items-center justify-center overflow-hidden
                ${viewMode === 'grid'
                    ? (clip.sourceOrientation === 'vertical'
                        ? 'aspect-[9/16] w-full mb-3'
                        : clip.sourceOrientation === 'square'
                            ? 'aspect-square w-full mb-3'
                            : 'aspect-[16/10] w-full mb-3')
                    : 'w-24 h-16 flex-shrink-0'}
            `}>
                {clip.type === 'video' || clip.type === 'image' ? (
                    <video
                        src={clip.path}
                        className="w-full h-full object-cover transition-transform duration-300"
                        style={clip.rotation ? {
                            // Aspect-aware fit so rotated clips (esp. portrait) fill the box by
                            // height rather than the fixed 16:9-only 0.5625 scale.
                            transform: `rotate(${clip.rotation}deg)${(clip.rotation === 90 || clip.rotation === 270)
                                ? ` scale(${(clip.width && clip.height ? (clip.width / clip.height >= 16 / 9 ? 9 / 16 : Math.min(16 / 9, clip.height / clip.width)) : 0.5625).toFixed(4)})`
                                : ''}`,
                        } : undefined}
                        muted
                        preload="metadata"
                    />
                ) : (
                    <div className="text-white/20">
                        {clip.type === 'audio' ? <FileAudio size={24} /> : <FileVideo size={24} />}
                    </div>
                )}

                {/* Duration Badge */}
                <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/80 rounded text-[10px] items-center text-white/80 font-mono">
                    {formatDuration(clip.sourceDurationFrames / 30)}
                </div>

                {/* Trim Badge */}
                {isTrimmed && (
                    <div className="absolute top-1.5 right-1.5 z-20 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-violet-600/80 text-[9px] font-bold text-white shadow-lg backdrop-blur-sm border border-violet-400/30">
                        <Scissors size={9} />
                        {trimDurationLabel && <span>{trimDurationLabel}</span>}
                    </div>
                )}

                {/* ── Pending Rotation: Approve / Decline Overlay ── */}
                <AnimatePresence>
                    {hasPendingRotation && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="absolute inset-0 z-30 flex items-end justify-center pb-2 pointer-events-none"
                        >
                            {/* Gradient scrim behind buttons */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                            {/* Rotation badge */}
                            <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-md bg-blue-600/90 text-[9px] font-bold text-white shadow-lg backdrop-blur-sm border border-blue-400/40">
                                <RotateCw size={10} className="animate-spin" style={{ animationDuration: '2s' }} />
                                {clip.rotation}°
                            </div>

                            {/* Approve / Decline buttons */}
                            <div className="relative flex items-center gap-2 pointer-events-auto">
                                {onConfirmRotation && (
                                    <motion.button
                                        whileHover={{ scale: 1.15 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onConfirmRotation();
                                        }}
                                        className="p-2 bg-emerald-500 rounded-full text-white shadow-lg shadow-emerald-500/30 border border-emerald-400/50"
                                        title="Approve rotation"
                                    >
                                        <Check size={16} strokeWidth={3} />
                                    </motion.button>
                                )}
                                {onCancelRotation && (
                                    <motion.button
                                        whileHover={{ scale: 1.15 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onCancelRotation();
                                        }}
                                        className="p-2 bg-red-500 rounded-full text-white shadow-lg shadow-red-500/30 border border-red-400/50"
                                        title="Cancel rotation"
                                    >
                                        <X size={16} strokeWidth={3} />
                                    </motion.button>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Hover Overlay — GRID VIEW ONLY (hidden when pending rotation is active) */}
                {viewMode === 'grid' && !hasPendingRotation && (
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[1px]">
                        {onGridAdd && (clip.type === 'video' || clip.type === 'image') && (
                            <motion.button
                                whileHover={{ scale: 1.2 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onGridAdd();
                                }}
                                className="p-2 bg-primary rounded-full text-white shadow-lg"
                                title="Create Grid with Item"
                            >
                                <LayoutGrid size={16} />
                            </motion.button>
                        )}
                        <motion.button
                            whileHover={{ scale: 1.2 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={(e) => {
                                e.stopPropagation();
                                onAdd();
                            }}
                            className="p-2 bg-primary rounded-full text-white shadow-lg"
                            title="Add to Timeline"
                        >
                            <Plus size={16} />
                        </motion.button>
                        {onRotate && clip.type === 'video' && (
                            <motion.button
                                whileHover={{ scale: 1.2 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRotate();
                                }}
                                className="p-2 bg-blue-600 rounded-full text-white shadow-lg"
                                title={`Rotate (${clip.rotation || 0}°)`}
                            >
                                <RotateCw size={16} />
                            </motion.button>
                        )}
                        {onDelete && (
                            <motion.button
                                whileHover={{ scale: 1.2 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete();
                                }}
                                className="p-2 bg-red-600 rounded-full text-white shadow-lg"
                                title="Remove from Library"
                            >
                                <Trash2 size={16} />
                            </motion.button>
                        )}
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                    <h4 className={`font-medium text-white/90 truncate ${hasPendingRotation ? 'text-blue-300' : isSelected ? 'text-accent' : isMultiSelected ? 'text-purple-300' : ''}`}>
                        {clip.filename}
                    </h4>
                </div>
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium px-1.5 py-0.5 bg-white/5 rounded border border-white/5">
                        {clip.type}
                    </span>
                    {hasPendingRotation && (
                        <span className="text-[10px] uppercase tracking-wider text-blue-400 font-bold px-1.5 py-0.5 bg-blue-500/10 rounded border border-blue-500/20 animate-pulse">
                            {clip.rotation}° pending
                        </span>
                    )}
                </div>
            </div>

            {/* LIST VIEW: Action Buttons in Row */}
            {viewMode === 'list' && (
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
                    {/* When pending rotation: show approve/decline inline */}
                    {hasPendingRotation ? (
                        <>
                            {onConfirmRotation && (
                                <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onConfirmRotation();
                                    }}
                                    className="p-1.5 bg-emerald-500/20 hover:bg-emerald-500/40 rounded-md text-emerald-400 transition-colors border border-emerald-500/30"
                                    title="Approve rotation"
                                >
                                    <Check size={14} strokeWidth={3} />
                                </motion.button>
                            )}
                            {onCancelRotation && (
                                <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCancelRotation();
                                    }}
                                    className="p-1.5 bg-red-500/20 hover:bg-red-500/40 rounded-md text-red-400 transition-colors border border-red-500/30"
                                    title="Cancel rotation"
                                >
                                    <X size={14} strokeWidth={3} />
                                </motion.button>
                            )}
                        </>
                    ) : (
                        <>
                            {onGridAdd && (clip.type === 'video' || clip.type === 'image') && (
                                <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onGridAdd();
                                    }}
                                    className="p-1.5 bg-white/5 hover:bg-primary/20 rounded-md text-white/40 hover:text-primary transition-colors border border-white/5 hover:border-primary/30"
                                    title="Create Grid with Item"
                                >
                                    <LayoutGrid size={14} />
                                </motion.button>
                            )}
                            {onRotate && clip.type === 'video' && (
                                <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRotate();
                                    }}
                                    className="p-1.5 bg-white/5 hover:bg-blue-500/20 rounded-md text-white/40 hover:text-blue-400 transition-colors border border-white/5 hover:border-blue-500/30"
                                    title={`Rotate (${clip.rotation || 0}°)`}
                                >
                                    <RotateCw size={14} />
                                </motion.button>
                            )}
                            <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onAdd();
                                }}
                                className="p-1.5 bg-white/5 hover:bg-primary/20 rounded-md text-white/40 hover:text-primary transition-colors border border-white/5 hover:border-primary/30"
                                title="Add to Timeline"
                            >
                                <Plus size={14} />
                            </motion.button>
                            {onDelete && (
                                <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete();
                                    }}
                                    className="p-1.5 bg-white/5 hover:bg-red-500/20 rounded-md text-white/40 hover:text-red-400 transition-colors border border-white/5 hover:border-red-500/30"
                                    title="Remove from Library"
                                >
                                    <Trash2 size={14} />
                                </motion.button>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Selected Indication (List View) */}
            {viewMode === 'list' && isSelected && (
                <motion.div layoutId="listSelection" className="w-1 h-8 bg-accent rounded-full mr-2"></motion.div>
            )}
        </motion.div>
    );
};
