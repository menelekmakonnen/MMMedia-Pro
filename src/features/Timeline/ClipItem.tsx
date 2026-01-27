import React, { memo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Clip, useClipStore } from '../../store/clipStore';
import { ClipControls } from './ClipControls';
import { SegmentSelector } from './SegmentSelector';

interface ClipItemProps {
    clip: Clip;
    isSelected: boolean;
    onSelect: (id: string) => void;
}

export const ClipItem: React.FC<ClipItemProps> = memo(({ clip, isSelected, onSelect }) => {
    const { setClipFolded } = useClipStore();
    const isFolded = clip.isFolded || false;

    return (
        <div
            className={`bg-surface-dark rounded-lg border transition-colors ${isSelected
                ? 'border-accent shadow-lg shadow-accent/20'
                : 'border-white/10 hover:border-white/20'
                }`}
            onClick={() => onSelect(clip.id)}
        >
            {/* Clip Header */}
            <div className="p-3">
                <div className="flex items-start justify-between gap-3">
                    {/* Fold Toggle */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setClipFolded(clip.id, !isFolded);
                        }}
                        className="mt-1 p-1 hover:bg-white/10 rounded transition-colors text-white/40 hover:text-white/80"
                        title={isFolded ? "Unfold" : "Fold"}
                    >
                        {isFolded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </button>

                    {/* Thumbnail */}
                    <div className="h-12 w-20 bg-black/50 rounded overflow-hidden flex-shrink-0 border border-white/10">
                        <video
                            src={clip.path}
                            className="h-full w-full object-cover"
                            onLoadedMetadata={(e) => {
                                e.currentTarget.currentTime = clip.startFrame / 30; // Assuming 30fps
                            }}
                            // Update time if startFrame changes (e.g. via Flux)
                            ref={(el) => {
                                if (el) el.currentTime = clip.startFrame / 30;
                            }}
                            muted
                            preload="metadata"
                            onError={(e) => console.error("Thumbnail load error for:", clip.path, e.currentTarget.error)}
                        />
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white/90 truncate">
                            {clip.filename}
                        </div>
                        {!isFolded && (
                            <div className="text-xs text-white/40 mt-1 flex items-center gap-2">
                                <span className="capitalize">{clip.type}</span>
                                <span>•</span>
                                <span>{clip.endFrame - clip.startFrame} frames</span>
                                {clip.isPinned && (
                                    <>
                                        <span>•</span>
                                        <span className="text-accent">📌 Pinned</span>
                                    </>
                                )}
                            </div>
                        )}
                        {/* Always show pinned status if folded */}
                        {isFolded && clip.isPinned && (
                            <div className="text-xs text-accent mt-0.5">📌 Pinned</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Clip Controls */}
            <ClipControls clipId={clip.id} />

            {/* Segment Selector - Hide when folded */}
            {!isFolded && <SegmentSelector clipId={clip.id} />}
        </div>
    );
});

ClipItem.displayName = 'ClipItem';
