import React, { memo, useRef, useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Bot, Hand, Lock, Pin, Eye, EyeOff, LayoutGrid } from 'lucide-react';
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

    // Measure container width for responsive truncation
    const containerRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [containerWidth, setContainerWidth] = useState(300);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        // Intersection observer for lazy loading
        const io = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
            { rootMargin: '200px' }
        );
        io.observe(el);

        // Resize observer for responsive truncation
        const ro = new ResizeObserver(([entry]) => {
            setContainerWidth(entry.contentRect.width);
        });
        ro.observe(el);

        return () => { io.disconnect(); ro.disconnect(); };
    }, []);

    // Responsive breakpoints
    const isNarrow = containerWidth < 220;
    const isTiny = containerWidth < 180;
    const frames = clip.endFrame - clip.startFrame;

    return (
        <div
            ref={containerRef}
            className={`bg-surface-dark rounded-lg border transition-colors ${isSelected
                ? 'border-accent shadow-[0_0_0_1px_rgba(139,92,246,0.5)]'
                : 'border-white/10 hover:border-white/20'
                } ${clip.disabled ? 'opacity-50 grayscale' : ''} overflow-hidden flex flex-col relative`}
            onClick={(e) => {
                e.stopPropagation();
                onSelect(clip.id);
            }}
        >
            {/* Waveform Background — only load when visible, unfolded, and selected */}
            {isVisible && !isFolded && !clip.disabled && isSelected && (clip.type === 'video' || clip.type === 'audio') && (
                <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
                    <TimelineWaveform
                        path={clip.path}
                        width={300}
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
            <div className="p-2 relative z-10">
                <div className="flex items-center gap-2 min-w-0">
                    {/* Fold / Disable toggles — vertical stack */}
                    <div className="flex flex-col gap-0.5 flex-shrink-0">
                        <button
                            onClick={(e) => { e.stopPropagation(); setClipFolded(clip.id, !isFolded); }}
                            className="p-0.5 hover:bg-white/10 rounded transition-colors text-white/40 hover:text-white/80"
                            title={isFolded ? "Unfold" : "Fold"}
                        >
                            {isFolded ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); updateClip(clip.id, { disabled: !clip.disabled }); }}
                            className={`p-0.5 hover:bg-white/10 rounded transition-colors ${clip.disabled ? 'text-white' : 'text-white/40 hover:text-white/80'}`}
                            title={clip.disabled ? "Enable Clip" : "Disable Clip"}
                        >
                            {clip.disabled ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                    </div>

                    {/* Thumbnail — smaller in narrow mode */}
                    <div className={`${isTiny ? 'h-9 w-14' : 'h-10 w-16'} bg-black/50 rounded overflow-hidden flex-shrink-0 border border-white/10 flex items-center justify-center text-white/30`}>
                        {clip.type === 'grid' ? (
                            <LayoutGrid size={18} />
                        ) : isVisible ? (
                            <video
                                src={clip.path}
                                className="h-full w-full object-cover"
                                onLoadedMetadata={(e) => { e.currentTarget.currentTime = (clip.trimStartFrame ?? 0) / 30; }}
                                ref={(el) => { if (el) el.currentTime = (clip.trimStartFrame ?? 0) / 30; }}
                                muted
                                preload="metadata"
                                onError={(e) => console.error("Thumbnail load error for:", clip.path, e.currentTarget.error)}
                            />
                        ) : (
                            <div className="w-full h-full bg-white/5" />
                        )}
                    </div>

                    {/* Text info — truncates responsively */}
                    <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-white/90 truncate">
                            {clip.filename}
                        </div>
                        {!isFolded && (
                            <div className="text-[10px] text-white/40 mt-0.5 flex items-center gap-1 flex-wrap overflow-hidden max-h-4">
                                {/* Type + frames — truncate in narrow */}
                                {!isTiny && <span className="capitalize">{clip.type}</span>}
                                {!isTiny && <span>•</span>}
                                <span title={`${frames} frames`}>
                                    {frames}{isNarrow ? 'f' : ' frames'}
                                </span>

                                {/* Origin badge — icon-only in narrow */}
                                {clip.origin === 'auto' && (
                                    <>
                                        <span>•</span>
                                        <span className="text-primary flex items-center gap-0.5" title="Auto-generated">
                                            <Bot size={10} />{!isNarrow && ' Auto'}
                                        </span>
                                    </>
                                )}
                                {clip.origin === 'manual' && (
                                    <>
                                        <span>•</span>
                                        <span className="text-green-400 flex items-center gap-0.5" title="Manually added">
                                            <Hand size={10} />{!isNarrow && ' Manual'}
                                        </span>
                                    </>
                                )}

                                {/* Status icons — always icon-only */}
                                {clip.locked && <span title="Locked"><Lock size={10} className="text-yellow-500 ml-0.5" /></span>}
                                {clip.isPinned && <span title="Pinned"><Pin size={10} className="text-accent ml-0.5" /></span>}
                            </div>
                        )}
                        {/* Folded status — always icons */}
                        {isFolded && (
                            <div className="flex gap-1 mt-0.5 items-center">
                                <span className="text-[10px] text-white/30">{frames}{isNarrow ? 'f' : ' frames'}</span>
                                {clip.origin === 'auto' && <span title="Auto"><Bot size={10} className="text-primary" /></span>}
                                {clip.origin === 'manual' && <span title="Manual"><Hand size={10} className="text-green-400" /></span>}
                                {clip.locked && <span title="Locked"><Lock size={10} className="text-yellow-500" /></span>}
                                {clip.isPinned && <span title="Pinned"><Pin size={10} className="text-accent" /></span>}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Clip Controls — only render when selected */}
            {isSelected && clip.type !== 'grid' && <ClipControls clipId={clip.id} />}

            {/* Segment Selector — only render when selected and not folded */}
            {isSelected && !isFolded && clip.type !== 'grid' && <SegmentSelector clipId={clip.id} />}

            {!isFolded && clip.type === 'grid' && (
                <div className="text-xs text-white/50 px-3 pb-2 italic">
                    Grid settings in Grid Editor.
                </div>
            )}
        </div>
    );
});

ClipItem.displayName = 'ClipItem';
