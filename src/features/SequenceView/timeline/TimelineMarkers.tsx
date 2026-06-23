import React, { useCallback, useState, useRef, memo } from 'react';
import clsx from 'clsx';
import { useTimelineStore } from './useTimelineStore';
import type { TimelineMarker } from './types';

/**
 * TimelineMarkers — coloured triangles on the ruler area with
 * thin vertical guideline. Draggable, tooltip on hover, click to jump.
 */
export const TimelineMarkers: React.FC = memo(() => {
  const markers = useTimelineStore((s) => s.markers);
  const ppf = useTimelineStore((s) => s.pixelsPerFrame);
  const scrollX = useTimelineStore((s) => s.scrollX);
  const setPlayheadFrame = useTimelineStore((s) => s.setPlayheadFrame);
  const updateMarker = useTimelineStore((s) => s.updateMarker);
  const removeMarker = useTimelineStore((s) => s.removeMarker);

  return (
    <>
      {markers.map((m) => (
        <MarkerItem
          key={m.id}
          marker={m}
          ppf={ppf}
          scrollX={scrollX}
          onJump={setPlayheadFrame}
          onUpdate={updateMarker}
          onRemove={removeMarker}
        />
      ))}
    </>
  );
});
TimelineMarkers.displayName = 'TimelineMarkers';

// ── Individual marker ──────────────────────────────────────────────────────

interface MarkerItemProps {
  marker: TimelineMarker;
  ppf: number;
  scrollX: number;
  onJump: (frame: number) => void;
  onUpdate: (id: string, updates: Partial<TimelineMarker>) => void;
  onRemove: (id: string) => void;
}

const MarkerItem: React.FC<MarkerItemProps> = memo(({
  marker,
  ppf,
  scrollX,
  onJump,
  onUpdate,
  onRemove,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startFrameRef = useRef(0);

  const x = 200 + (marker.frame - scrollX) * ppf;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onJump(marker.frame);
    },
    [marker.frame, onJump],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Simple confirm dialog as placeholder — a proper context menu comes later
      if (window.confirm(`Delete marker "${marker.label}"?`)) {
        onRemove(marker.id);
      }
    },
    [marker.id, marker.label, onRemove],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      isDraggingRef.current = true;
      startXRef.current = e.clientX;
      startFrameRef.current = marker.frame;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [marker.frame],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - startXRef.current;
      const df = Math.round(dx / ppf);
      const newFrame = Math.max(0, startFrameRef.current + df);
      onUpdate(marker.id, { frame: newFrame });
    },
    [marker.id, ppf, onUpdate],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  return (
    <div
      className="absolute top-0 bottom-0 pointer-events-none z-20"
      style={{ left: x }}
    >
      {/* Vertical guideline */}
      <div
        className="w-px h-full opacity-40"
        style={{ backgroundColor: marker.color }}
      />

      {/* Triangle head — interactive */}
      <div
        className={clsx(
          'absolute -top-0.5 -left-[5px] w-0 h-0 cursor-pointer pointer-events-auto',
          'border-l-[5px] border-r-[5px] border-t-[7px]',
          'border-l-transparent border-r-transparent',
        )}
        style={{ borderTopColor: marker.color }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      />

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-black/90 text-[9px] text-white/80 rounded whitespace-nowrap pointer-events-none z-50 shadow-lg">
          {marker.label}
        </div>
      )}
    </div>
  );
});
MarkerItem.displayName = 'MarkerItem';
