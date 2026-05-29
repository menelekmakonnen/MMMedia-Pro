import React from 'react';
import { motion } from 'framer-motion';
import { Clip } from '../../store/clipStore';
import { Plus, FileVideo, FileAudio, LayoutGrid, Trash2, CheckSquare, Square as SquareIcon, RotateCw, Scissors } from 'lucide-react';

interface MediaItemProps {
    clip: Clip;
    isSelected: boolean;
    isMultiSelected: boolean;
    isTrimmed?: boolean;
    trimDurationLabel?: string;
    viewMode: 'grid' | 'list';
    onSelect: (e: React.MouseEvent) => void;
    onAdd: () => void;
    onGridAdd?: () => void;
    onRotate?: () => void;
    onDelete?: () => void;
}

export const MediaItem: React.FC<MediaItemProps> = ({ clip, isSelected, isMultiSelected, isTrimmed, trimDurationLabel, viewMode, onSelect, onAdd, onGridAdd, onRotate, onDelete }) => {
    return (
        <motion.div
            onClick={onSelect}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`
                group relative border rounded-lg overflow-hidden cursor-pointer transition-all duration-200
                ${isSelected
                    ? 'border-accent ring-1 ring-accent bg-accent/5'
                    : isMultiSelected
                        ? 'border-purple-500/60 ring-1 ring-purple-500/40 bg-purple-500/5'
                        : 'border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10'}
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
                        className="w-full h-full object-cover"
                        style={clip.rotation ? { transform: `rotate(${clip.rotation}deg)` } : undefined}
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
                    {(clip.sourceDurationFrames / 30).toFixed(1)}s
                </div>

                {/* Trim Badge */}
                {isTrimmed && (
                    <div className="absolute top-1.5 right-1.5 z-20 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-violet-600/80 text-[9px] font-bold text-white shadow-lg backdrop-blur-sm border border-violet-400/30">
                        <Scissors size={9} />
                        {trimDurationLabel && <span>{trimDurationLabel}</span>}
                    </div>
                )}

                {/* Hover Overlay — GRID VIEW ONLY */}
                {viewMode === 'grid' && (
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
                    <h4 className={`font-medium text-white/90 truncate ${isSelected ? 'text-accent' : isMultiSelected ? 'text-purple-300' : ''}`}>
                        {clip.filename}
                    </h4>
                </div>
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium px-1.5 py-0.5 bg-white/5 rounded border border-white/5">
                        {clip.type}
                    </span>
                    <span className="text-xs text-white/40 truncate font-mono">
                        {/* Placeholder resolution */}
                    </span>
                </div>
            </div>

            {/* LIST VIEW: Action Buttons in Row */}
            {viewMode === 'list' && (
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
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
                </div>
            )}

            {/* Selected Indication (List View) */}
            {viewMode === 'list' && isSelected && (
                <motion.div layoutId="listSelection" className="w-1 h-8 bg-accent rounded-full mr-2"></motion.div>
            )}
        </motion.div>
    );
};
