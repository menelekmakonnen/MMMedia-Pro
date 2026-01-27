import React, { useState, useRef, useEffect } from 'react';
import { useClipStore } from '../../store/clipStore';

interface SegmentSelectorProps {
    clipId: string;
}

export const SegmentSelector: React.FC<SegmentSelectorProps> = ({ clipId }) => {
    const { clips, selectedSegment, selectSegment, moveSegment } = useClipStore();
    const clip = clips.find((c) => c.id === clipId);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState<'start' | 'end' | 'body' | null>(null);
    const [dragStartX, setDragStartX] = useState(0);
    const [dragStartFrame, setDragStartFrame] = useState(0);

    if (!clip) return null;

    const isSelected = selectedSegment?.clipId === clipId;
    const segmentStart = isSelected ? selectedSegment.startFrame : clip.startFrame;
    const segmentEnd = isSelected ? selectedSegment.endFrame : clip.endFrame;
    const sourceDuration = clip.sourceDurationFrames || 1;

    const startPercent = (segmentStart / sourceDuration) * 100;
    const endPercent = (segmentEnd / sourceDuration) * 100;
    const widthPercent = endPercent - startPercent;

    const handleMouseDown = (e: React.MouseEvent, type: 'start' | 'end' | 'body') => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(type);
        setDragStartX(e.clientX);
        setDragStartFrame(type === 'start' ? segmentStart : type === 'end' ? segmentEnd : segmentStart);

        if (!isSelected) {
            selectSegment(clipId, clip.startFrame, clip.endFrame);
        }
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging || !containerRef.current) return;

            const rect = containerRef.current.getBoundingClientRect();
            const deltaX = e.clientX - dragStartX;
            const deltaFrames = Math.round((deltaX / rect.width) * sourceDuration);

            if (isDragging === 'start') {
                const newStart = Math.max(0, Math.min(segmentEnd - 1, dragStartFrame + deltaFrames));
                selectSegment(clipId, newStart, segmentEnd);
            } else if (isDragging === 'end') {
                const newEnd = Math.max(segmentStart + 1, Math.min(sourceDuration, dragStartFrame + deltaFrames));
                selectSegment(clipId, segmentStart, newEnd);
            } else if (isDragging === 'body') {
                const newStart = dragStartFrame + deltaFrames;
                moveSegment(clipId, newStart);
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
    }, [isDragging, dragStartX, dragStartFrame, segmentStart, segmentEnd, sourceDuration, clipId, selectSegment, moveSegment]);

    return (
        <div className="px-3 py-2 bg-surface-dark/30 border-t border-white/5">
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-white/40">Segment</span>
                <span className="text-xs text-white/60">
                    {segmentStart} - {segmentEnd} ({segmentEnd - segmentStart} frames)
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
                    const clickFrame = Math.round(clickPercent * sourceDuration);

                    const segmentDuration = segmentEnd - segmentStart;
                    const newStart = Math.max(0, Math.min(sourceDuration - segmentDuration, clickFrame - segmentDuration / 2));
                    selectSegment(clipId, newStart, newStart + segmentDuration);
                }}
            >
                {/* Full waveform visualization (placeholder) */}
                <div className="absolute inset-0 bg-gradient-to-r from-white/5 via-white/10 to-white/5" />

                {/* Selected segment */}
                <div
                    className="absolute top-0 bottom-0 bg-accent/30 border-l-2 border-r-2 border-accent cursor-move"
                    style={{
                        left: `${startPercent}%`,
                        width: `${widthPercent}%`,
                    }}
                    onMouseDown={(e) => handleMouseDown(e, 'body')}
                >
                    {/* Start handle */}
                    <div
                        className="absolute left-0 top-0 bottom-0 w-2 bg-accent cursor-ew-resize hover:bg-accent-hover"
                        onMouseDown={(e) => handleMouseDown(e, 'start')}
                    />

                    {/* End handle */}
                    <div
                        className="absolute right-0 top-0 bottom-0 w-2 bg-accent cursor-ew-resize hover:bg-accent-hover"
                        onMouseDown={(e) => handleMouseDown(e, 'end')}
                    />
                </div>
            </div>
        </div>
    );
};
