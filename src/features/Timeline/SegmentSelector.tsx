import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Lock, Unlock } from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import { useProjectStore } from '../../store/projectStore';

interface SegmentSelectorProps {
    clipId: string;
    onScrub?: (frame: number) => void;
}

export const SegmentSelector: React.FC<SegmentSelectorProps> = ({ clipId, onScrub }) => {
    const { clips, selectedSegment, selectSegment } = useClipStore();
    const { settings } = useProjectStore();
    const clip = clips.find((c) => c.id === clipId);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState<'start' | 'end' | 'body' | null>(null);
    const [dragStartX, setDragStartX] = useState(0); // ClientX
    const [dragStartFrame, setDragStartFrame] = useState(0); // Frame at start of drag
    const [dragStartSegmentDuration, setDragStartSegmentDuration] = useState(0);

    const [isZoomed, setIsZoomed] = useState(false);
    const [isDurationLocked, setIsDurationLocked] = useState(false);

    // Derived values
    const fps = settings.fps;

    if (!clip) return null;

    const isSelected = selectedSegment?.clipId === clipId;
    // CRITICAL FIX: Use Trim frames (Source) not Timeline frames
    const segmentStart = isSelected ? selectedSegment.startFrame : (clip.trimStartFrame ?? 0);
    const segmentEnd = isSelected ? selectedSegment.endFrame : (clip.trimEndFrame ?? (clip.sourceDurationFrames || 0));
    const sourceDuration = clip.sourceDurationFrames || 1;
    const segmentDuration = segmentEnd - segmentStart;

    // View Window calculations (for local zoom)
    const zoomMargin = Math.max(fps * 2, segmentDuration); // e.g. 2 sec padding
    let viewStart = isZoomed ? Math.max(0, segmentStart - zoomMargin) : 0;
    let viewEnd = isZoomed ? Math.min(sourceDuration, segmentEnd + zoomMargin) : sourceDuration;

    // CRITICAL: Freeze view window during drag to prevent UI feedback loops where scaling shifts the mouse coordinates
    const viewRef = useRef({ start: viewStart, end: viewEnd, duration: viewEnd - viewStart });
    if (!isDragging) {
        viewRef.current = { start: viewStart, end: viewEnd, duration: viewEnd - viewStart };
    }
    viewStart = viewRef.current.start;
    viewEnd = viewRef.current.end;
    const viewDuration = viewRef.current.duration;

    const startPercent = Math.max(0, ((segmentStart - viewStart) / viewDuration) * 100);
    const endPercent = Math.min(100, ((segmentEnd - viewStart) / viewDuration) * 100);
    const widthPercent = endPercent - startPercent;

    const { updateClipSource } = useClipStore();

    const handleMouseDown = (e: React.MouseEvent, type: 'start' | 'end' | 'body') => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(type);
        setDragStartX(e.clientX);
        setDragStartFrame(type === 'start' ? segmentStart : type === 'end' ? segmentEnd : segmentStart);
        setDragStartSegmentDuration(segmentDuration);

        if (!isSelected) {
            // Select the segment (visual only)
            selectSegment(clipId, segmentStart, segmentEnd);
        }
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging || !containerRef.current) return;

            const rect = containerRef.current.getBoundingClientRect();
            const deltaX = e.clientX - dragStartX;
            const deltaFrames = Math.round((deltaX / rect.width) * viewDuration);
            let rawTarget = dragStartFrame + deltaFrames;

            // Snap Helper
            const snapToBeat = (frame: number) => {
                if (!clip.beatMarkers || clip.beatMarkers.length === 0) return frame;
                const time = frame / fps;
                const threshold = 0.1; // Snap threshold (seconds)
                const closest = clip.beatMarkers.reduce((prev, curr) =>
                    Math.abs(curr.time - time) < Math.abs(prev.time - time) ? curr : prev
                );
                return Math.abs(closest.time - time) < threshold ? Math.round(closest.time * fps) : frame;
            };

            if (isDurationLocked) {
                const maxStart = sourceDuration - dragStartSegmentDuration;
                let newStart;
                if (isDragging === 'end') {
                    // rawTarget is the new END frame
                    const newEnd = Math.max(dragStartSegmentDuration, Math.min(sourceDuration, snapToBeat(rawTarget)));
                    newStart = newEnd - dragStartSegmentDuration;
                } else {
                    // start or body => rawTarget is the new START frame
                    newStart = Math.max(0, Math.min(maxStart, snapToBeat(rawTarget)));
                }
                updateClipSource(clipId, newStart, newStart + dragStartSegmentDuration);
                if (onScrub) onScrub(isDragging === 'end' ? newStart + dragStartSegmentDuration - 1 : newStart);
                return;
            }

            if (isDragging === 'start') {
                const snapped = snapToBeat(rawTarget);
                const newStart = Math.max(0, Math.min(segmentEnd - 1, snapped));
                updateClipSource(clipId, newStart, segmentEnd);
                if (onScrub) onScrub(newStart);
            } else if (isDragging === 'end') {
                const snapped = snapToBeat(rawTarget);
                const newEnd = Math.max(segmentStart + 1, Math.min(sourceDuration, snapped));
                updateClipSource(clipId, segmentStart, newEnd);
                if (onScrub) onScrub(newEnd - 1); // Scrub to the frame right before the end
            } else if (isDragging === 'body') {
                const maxStart = sourceDuration - dragStartSegmentDuration;
                const snappedStart = snapToBeat(rawTarget);
                const newStart = Math.max(0, Math.min(maxStart, snappedStart));
                updateClipSource(clipId, newStart, newStart + dragStartSegmentDuration);
                if (onScrub) onScrub(newStart);
            }
        };

        const handleMouseUp = () => {
            setIsDragging(null);
        };

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragStartX, dragStartFrame, dragStartSegmentDuration, segmentStart, segmentEnd, sourceDuration, viewDuration, clipId, updateClipSource, fps, clip.beatMarkers, onScrub, isDurationLocked]);

    const shiftSegmentBackward = () => {
        if (!clip) return;
        const newStart = Math.max(0, segmentStart - segmentDuration);
        updateClipSource(clipId, newStart, newStart + segmentDuration);
    };

    const shiftSegmentForward = () => {
        if (!clip) return;
        const maxStart = sourceDuration - segmentDuration;
        const newStart = Math.min(maxStart, segmentStart + segmentDuration);
        updateClipSource(clipId, newStart, newStart + segmentDuration);
    };

    return (
        <div className="px-3 py-2 bg-surface-dark/30 border-t border-white/5">
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-white/40 flex items-center gap-2">
                    Source Range
                    <div className="flex items-center gap-1 bg-black/20 rounded border border-white/5 px-1 py-0.5">
                        <button onClick={shiftSegmentBackward} title="Shift segment backward by duration" className="hover:bg-white/10 rounded p-0.5 text-white/50 hover:text-white">
                            <ChevronLeft size={12} />
                        </button>
                        <button onClick={shiftSegmentForward} title="Shift segment forward by duration" className="hover:bg-white/10 rounded p-0.5 text-white/50 hover:text-white">
                            <ChevronRight size={12} />
                        </button>
                        <div className="w-px h-3 bg-white/10 mx-0.5" />
                        <button
                            onClick={() => setIsZoomed(!isZoomed)}
                            title={isZoomed ? "Zoom Out to Full Clip" : "Zoom In to Selection"}
                            className={`hover:bg-white/10 rounded p-0.5 ${isZoomed ? 'text-accent' : 'text-white/50 hover:text-white'}`}
                        >
                            {isZoomed ? <ZoomOut size={12} /> : <ZoomIn size={12} />}
                        </button>
                        <button
                            onClick={() => setIsDurationLocked(!isDurationLocked)}
                            title={isDurationLocked ? "Unlock Duration" : "Freeze Segment Duration"}
                            className={`hover:bg-white/10 rounded p-0.5 ${isDurationLocked ? 'text-amber-500' : 'text-white/50 hover:text-white'}`}
                        >
                            {isDurationLocked ? <Lock size={12} /> : <Unlock size={12} />}
                        </button>
                    </div>
                </span>
                <span className="text-xs text-white/60">
                    {segmentStart} - {segmentEnd} ({segmentDuration} frames)
                </span>
            </div>

            <div
                ref={containerRef}
                className="relative h-8 bg-white/5 rounded overflow-hidden cursor-pointer"
                onClick={(e) => {
                    if (isDragging) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const clickPercent = clickX / rect.width;
                    const clickFrame = Math.round(clickPercent * viewDuration) + viewStart;

                    const newStart = Math.max(0, Math.min(sourceDuration - segmentDuration, clickFrame - segmentDuration / 2));
                    updateClipSource(clipId, newStart, newStart + segmentDuration);
                    if (onScrub) onScrub(clickFrame);
                }}
            >
                {/* Full waveform visualization (placeholder) */}
                <div className="absolute inset-0 bg-gradient-to-r from-white/5 via-white/10 to-white/5" />

                {/* Beat Markers */}
                {clip.beatMarkers && clip.beatMarkers.map((m, i) => {
                    const markerFrame = m.time * fps;
                    if (markerFrame < viewStart || markerFrame > viewEnd) return null;
                    return (
                        <div
                            key={i}
                            className="absolute top-0 bottom-0 w-px bg-green-500/50 pointer-events-none z-0"
                            style={{ left: `${((markerFrame - viewStart) / viewDuration) * 100}%` }}
                        />
                    );
                })}

                {/* Selected segment */}
                <div
                    className="absolute top-0 bottom-0 bg-accent/30 border-l-2 border-r-2 border-accent cursor-move shadow-[0_0_10px_rgba(6,182,212,0.5)] min-w-[8px]"
                    style={{
                        left: `${startPercent}%`,
                        width: `${Math.max(widthPercent, 0.5)}%`, // Minimum visual width
                    }}
                    onMouseDown={(e) => handleMouseDown(e, 'body')}
                >
                    {/* Start handle (larger invisible hit area) */}
                    <div
                        className="absolute -left-3 top-0 bottom-0 w-6 cursor-ew-resize flex justify-center group"
                        onMouseDown={(e) => handleMouseDown(e, 'start')}
                    >
                        <div className="w-1 h-full bg-transparent group-hover:bg-accent/50 transition-colors" />
                    </div>

                    {/* End handle (larger invisible hit area) */}
                    <div
                        className="absolute -right-3 top-0 bottom-0 w-6 cursor-ew-resize flex justify-center group"
                        onMouseDown={(e) => handleMouseDown(e, 'end')}
                    >
                        <div className="w-1 h-full bg-transparent group-hover:bg-accent/50 transition-colors" />
                    </div>
                </div>
            </div>
        </div>
    );
};
