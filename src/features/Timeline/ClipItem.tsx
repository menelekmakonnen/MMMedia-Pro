import React, { memo } from 'react';
import { ChevronDown, ChevronUp, Bot, Hand, Lock, Pin, Eye, EyeOff } from 'lucide-react';
import { Clip, useClipStore } from '../../store/clipStore';
import { ClipControls } from './ClipControls';
import { SegmentSelector } from './SegmentSelector';
import { TimelineWaveform } from './TimelineWaveform';

interface ClipItemProps {
    clip: Clip;
    isSelected: boolean;
    onSelect: (id: string) => void;
}

export const ClipItem: React.FC<ClipItemProps> = memo(({ clip, isSelected, onSelect }) => {
    const { setClipFolded, updateClip, detectBeats } = useClipStore();
    const isFolded = clip.isFolded || false;

    return (
        <div
            className={`bg-surface-dark rounded-lg border transition-colors ${isSelected
                ? 'border-accent shadow-[0_0_0_1px_rgba(139,92,246,0.5)]'
                : 'border-white/10 hover:border-white/20'
                } ${clip.disabled ? 'opacity-50 grayscale' : ''} overflow-hidden flex flex-col relative`}
            onClick={(e) => {
                e.stopPropagation();
                onSelect(clip.id);
            }}
        >
            {/* Waveform Background (for non-folded video/audio) */}
            {!isFolded && !clip.disabled && (clip.type === 'video' || clip.type === 'audio') && (
                <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
                    <TimelineWaveform
                        path={clip.path}
                        width={300} // Approximate rendering width
                        height={100}
                        color={isSelected ? '#8b5cf6' : '#ffffff'}
                        beatMarkers={clip.beatMarkers}
                        onAudioLoaded={(buffer) => {
                            if (!clip.beatMarkers) {
                                detectBeats(clip.id, buffer);
                            }
                        }}
                    />
                </div>
            )}

            {/* Clip Header */}
            <div className="p-3 relative z-10">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1 mt-1">
                        {/* Fold Toggle */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setClipFolded(clip.id, !isFolded);
                            }}
                            className="p-1 hover:bg-white/10 rounded transition-colors text-white/40 hover:text-white/80"
                            title={isFolded ? "Unfold" : "Fold"}
                        >
                            {isFolded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                        </button>

                        {/* Disable Toggle */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                updateClip(clip.id, { disabled: !clip.disabled });
                            }}
                            className={`p-1 hover:bg-white/10 rounded transition-colors ${clip.disabled ? 'text-white' : 'text-white/40 hover:text-white/80'}`}
                            title={clip.disabled ? "Enable Clip" : "Disable Clip"}
                        >
                            {clip.disabled ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                    </div>

                    {/* Thumbnail */}
                    <div className="h-12 w-20 bg-black/50 rounded overflow-hidden flex-shrink-0 border border-white/10">
                        <video
                            src={clip.path}
                            className="h-full w-full object-cover"
                            onLoadedMetadata={(e) => {
                                e.currentTarget.currentTime = (clip.trimStartFrame ?? 0) / 30; // Assuming 30fps
                            }}
                            // Update time if startFrame changes (e.g. via Flux)
                            ref={(el) => {
                                if (el) el.currentTime = (clip.trimStartFrame ?? 0) / 30;
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

                                {clip.origin === 'auto' && (
                                    <>
                                        <span>•</span>
                                        <span className="text-blue-400 flex items-center gap-1" title="Auto-generated">
                                            <Bot size={12} /> Auto
                                        </span>
                                    </>
                                )}

                                {clip.origin === 'manual' && (
                                    <>
                                        <span>•</span>
                                        <span className="text-green-400 flex items-center gap-1" title="Manually added">
                                            <Hand size={12} /> Manual
                                        </span>
                                    </>
                                )}

                                {clip.locked && (
                                    <>
                                        <span>•</span>
                                        <span className="text-yellow-500 flex items-center gap-1" title="Locked (Protected)">
                                            <Lock size={12} /> Locked
                                        </span>
                                    </>
                                )}

                                {clip.origin === 'manual' && (
                                    <>
                                        <span>•</span>
                                        <span className="text-green-400 flex items-center gap-1" title="Manually added">
                                            <Hand size={12} /> Manual
                                        </span>
                                    </>
                                )}

                                {clip.locked && (
                                    <>
                                        <span>•</span>
                                        <span className="text-yellow-500 flex items-center gap-1" title="Locked (Protected)">
                                            <Lock size={12} /> Locked
                                        </span>
                                    </>
                                )}

                                {clip.isPinned && (
                                    <>
                                        <span>•</span>
                                        <span className="text-accent flex items-center gap-1" title="Pinned">
                                            <Pin size={12} /> Pinned
                                        </span>
                                    </>
                                )}
                            </div>
                        )}
                        {/* Always show status if folded */}
                        {isFolded && (
                            <div className="flex gap-2 mt-0.5">
                                {clip.origin === 'auto' && <div title="Auto"><Bot size={12} className="text-blue-400" /></div>}
                                {clip.origin === 'manual' && <div title="Manual"><Hand size={12} className="text-green-400" /></div>}
                                {clip.locked && <div title="Locked"><Lock size={12} className="text-yellow-500" /></div>}
                                {clip.isPinned && <div title="Pinned"><Pin size={12} className="text-accent" /></div>}
                            </div>
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
