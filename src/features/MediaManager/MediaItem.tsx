import React from 'react';
import { Clip } from '../../store/clipStore';
import { Plus, FileVideo, FileAudio } from 'lucide-react';

interface MediaItemProps {
    clip: Clip;
    isSelected: boolean;
    viewMode: 'grid' | 'list';
    onSelect: () => void;
    onAdd: () => void;
}

export const MediaItem: React.FC<MediaItemProps> = ({ clip, isSelected, viewMode, onSelect, onAdd }) => {
    return (
        <div
            onClick={onSelect}
            className={`
                group relative border rounded-lg overflow-hidden cursor-pointer transition-all duration-200
                ${isSelected
                    ? 'border-accent ring-1 ring-accent bg-accent/5'
                    : 'border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10'}
                ${viewMode === 'list' ? 'flex items-center gap-4 p-2' : 'p-3'}
            `}
        >
            {/* Thumbnail */}
            <div className={`
                relative bg-black/50 rounded flex items-center justify-center overflow-hidden
                ${viewMode === 'grid' ? 'aspect-video w-full mb-3' : 'w-24 h-16 flex-shrink-0'}
            `}>
                {clip.type === 'video' || clip.type === 'image' ? (
                    <video
                        src={clip.path}
                        className="w-full h-full object-cover"
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

                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[1px]">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onAdd();
                        }}
                        className="p-2 bg-primary rounded-full text-white hover:scale-110 transition-transform shadow-lg"
                        title="Add to Timeline"
                    >
                        <Plus size={16} />
                    </button>
                    {/* <div className="p-2 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors">
                        <Play size={16} />
                    </div> */}
                </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                    <h4 className={`font-medium text-white/90 truncate ${isSelected ? 'text-accent' : ''}`}>
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

            {/* Selected Indication (List View) */}
            {viewMode === 'list' && isSelected && (
                <div className="w-1 h-8 bg-accent rounded-full mr-2"></div>
            )}
        </div>
    );
};
