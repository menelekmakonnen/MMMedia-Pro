import React, { useCallback, useRef, useState } from 'react';
import { useTimelineStore } from './timeline/useTimelineStore';
import clsx from 'clsx';

interface Props {
    containerWidth: number;
    containerHeight: number;
}

export const ProgramMonitorGuides: React.FC<Props> = ({ containerWidth, containerHeight }) => {
    const { guides, showGuides, addGuide, removeGuide, updateGuidePosition } = useTimelineStore();
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    if (!showGuides) return null;

    const handleRulerDrag = useCallback((axis: 'h' | 'v', e: React.MouseEvent) => {
        e.preventDefault();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const pos = axis === 'h'
            ? ((e.clientY - rect.top) / rect.height) * 100
            : ((e.clientX - rect.left) / rect.width) * 100;
        addGuide(axis, Math.max(0, Math.min(100, pos)));
    }, [addGuide]);

    const handleGuideDrag = useCallback((id: string, axis: 'h' | 'v', e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setDraggingId(id);

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const handleMove = (me: PointerEvent) => {
            const pos = axis === 'h'
                ? ((me.clientY - rect.top) / rect.height) * 100
                : ((me.clientX - rect.left) / rect.width) * 100;
            updateGuidePosition(id, Math.max(0, Math.min(100, pos)));
        };
        const handleUp = () => {
            setDraggingId(null);
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
        };
        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);
    }, [updateGuidePosition]);

    return (
        <div ref={containerRef} className="absolute inset-0 z-40 pointer-events-none" style={{ overflow: 'hidden' }}>
            {/* Horizontal ruler (top edge) */}
            <div
                className="absolute top-0 left-4 right-0 h-4 cursor-s-resize pointer-events-auto"
                style={{ background: 'linear-gradient(to bottom, rgba(99,102,241,0.15), transparent)' }}
                onMouseDown={(e) => handleRulerDrag('h', e)}
            >
                {/* Ruler tick marks */}
                {Array.from({ length: 10 }, (_, i) => (
                    <div key={i} className="absolute top-0 w-px h-2 bg-indigo-400/30" style={{ left: `${(i + 1) * 10}%` }} />
                ))}
            </div>

            {/* Vertical ruler (left edge) */}
            <div
                className="absolute top-4 left-0 bottom-0 w-4 cursor-e-resize pointer-events-auto"
                style={{ background: 'linear-gradient(to right, rgba(99,102,241,0.15), transparent)' }}
                onMouseDown={(e) => handleRulerDrag('v', e)}
            >
                {Array.from({ length: 10 }, (_, i) => (
                    <div key={i} className="absolute left-0 h-px w-2 bg-indigo-400/30" style={{ top: `${(i + 1) * 10}%` }} />
                ))}
            </div>

            {/* Guide lines */}
            {guides.map(g => (
                <div
                    key={g.id}
                    className={clsx(
                        'absolute pointer-events-auto',
                        g.axis === 'h' ? 'left-0 right-0 h-px cursor-ns-resize' : 'top-0 bottom-0 w-px cursor-ew-resize',
                        draggingId === g.id ? 'z-50' : 'z-40'
                    )}
                    style={{
                        ...(g.axis === 'h' ? { top: `${g.position}%` } : { left: `${g.position}%` }),
                        background: 'rgba(99, 211, 245, 0.7)',
                        boxShadow: '0 0 4px rgba(99, 211, 245, 0.4)',
                    }}
                    onPointerDown={(e) => handleGuideDrag(g.id, g.axis, e)}
                    onDoubleClick={() => removeGuide(g.id)}
                >
                    {/* Guide label */}
                    <span
                        className="absolute text-[8px] font-mono text-cyan-300/80 bg-black/60 px-1 rounded"
                        style={g.axis === 'h' ? { right: 4, top: 2 } : { top: 4, left: 4 }}
                    >
                        {Math.round(g.position)}%
                    </span>
                </div>
            ))}

            {/* Crosshair intersection markers */}
            {guides.filter(g => g.axis === 'h').flatMap(hg =>
                guides.filter(g => g.axis === 'v').map(vg => (
                    <div
                        key={`cross-${hg.id}-${vg.id}`}
                        className="absolute w-3 h-3 border border-cyan-400/60 rounded-full pointer-events-none"
                        style={{
                            top: `calc(${hg.position}% - 6px)`,
                            left: `calc(${vg.position}% - 6px)`,
                            boxShadow: '0 0 6px rgba(99, 211, 245, 0.5)',
                        }}
                    />
                ))
            )}
        </div>
    );
};
