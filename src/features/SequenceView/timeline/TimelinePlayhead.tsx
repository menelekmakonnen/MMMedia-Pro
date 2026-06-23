import React, { useRef, useCallback, useEffect, memo } from 'react';
import { useTimelineStore } from './useTimelineStore';

/** Width of each track's left header; lane content (and overlays) start after it. */
const TRACK_HEADER_W = 200;

/**
 * TimelinePlayhead — a red vertical line spanning the full timeline height
 * with a diamond head at the top. Draggable via pointer events.
 * Uses RAF for smooth motion during playback.
 */
export const TimelinePlayhead: React.FC = memo(() => {
  const playheadFrame = useTimelineStore((s) => s.playheadFrame);
  const ppf = useTimelineStore((s) => s.pixelsPerFrame);
  const scrollX = useTimelineStore((s) => s.scrollX);
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const setPlayheadFrame = useTimelineStore((s) => s.setPlayheadFrame);

  const lineRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const rafRef = useRef<number>(0);

  const xPos = TRACK_HEADER_W + (playheadFrame - scrollX) * ppf;

  // Smooth position update via RAF during playback
  useEffect(() => {
    if (!isPlaying || !lineRef.current) return;

    const update = () => {
      const frame = useTimelineStore.getState().playheadFrame;
      const sx = useTimelineStore.getState().scrollX;
      const px = useTimelineStore.getState().pixelsPerFrame;
      if (lineRef.current) {
        lineRef.current.style.left = `${TRACK_HEADER_W + (frame - sx) * px}px`;
      }
      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  // Scrub handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isDraggingRef.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return;
      const parentRect = lineRef.current?.parentElement?.getBoundingClientRect();
      if (!parentRect) return;
      const x = e.clientX - parentRect.left - TRACK_HEADER_W;
      const frame = Math.max(0, Math.round(scrollX + x / ppf));
      setPlayheadFrame(frame);
    },
    [scrollX, ppf, setPlayheadFrame],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  return (
    <div
      ref={lineRef}
      className="absolute top-0 bottom-0 z-30 pointer-events-none"
      style={{ left: xPos }}
    >
      {/* Diamond head — interactive */}
      <div
        className="absolute -top-0.5 -left-[5px] w-[10px] h-[10px] bg-red-500 rotate-45 rounded-sm shadow-[0_0_6px_rgba(239,68,68,0.5)] cursor-pointer pointer-events-auto z-40"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      {/* Vertical line */}
      <div className="w-px h-full bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.3)]" />
    </div>
  );
});

TimelinePlayhead.displayName = 'TimelinePlayhead';
