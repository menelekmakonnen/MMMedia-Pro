import React, { useRef, useCallback, useEffect, useMemo, memo } from 'react';
import { useTimelineStore } from './useTimelineStore';
import { formatTimecode } from '../../../lib/time';

interface TimelineRulerProps {
  fps: number;
}

/** Timecode label format: MM:SS:FF (drops HH when zero). */
function formatTC(frame: number, fps: number): string {
  const tc = formatTimecode(frame, fps);
  // formatTimecode returns HH:MM:SS:FF — strip HH if "00"
  return tc.startsWith('00:') ? tc.slice(3) : tc;
}

interface TickConfig {
  /** Frames between minor ticks */
  minor: number;
  /** Frames between major ticks */
  major: number;
  /** Frames between label ticks */
  label: number;
}

function getTickConfig(ppf: number, fps: number): TickConfig {
  // ppf = pixels per frame.  Larger ppf = more zoomed in.
  if (ppf > 2) {
    // Very zoomed in — show every frame
    return { minor: 1, major: fps, label: fps };
  }
  if (ppf > 0.5) {
    // Zoomed in — every second, subdivisions per frame
    const sub = Math.max(1, Math.round(fps / 5));
    return { minor: sub, major: fps, label: fps };
  }
  if (ppf > 0.1) {
    // Normal — every 5 seconds
    return { minor: fps, major: fps * 5, label: fps * 5 };
  }
  if (ppf > 0.05) {
    // Zoomed out — every 10 seconds
    return { minor: fps * 5, major: fps * 10, label: fps * 10 };
  }
  // Very zoomed out — every 30 seconds
  return { minor: fps * 10, major: fps * 30, label: fps * 30 };
}

export const TimelineRuler: React.FC<TimelineRulerProps> = memo(({ fps }) => {
  const ppf = useTimelineStore((s) => s.pixelsPerFrame);
  const scrollX = useTimelineStore((s) => s.scrollX);
  const playheadFrame = useTimelineStore((s) => s.playheadFrame);
  const inOutRange = useTimelineStore((s) => s.inOutRange);
  const setPlayheadFrame = useTimelineStore((s) => s.setPlayheadFrame);

  const rulerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  // Build ticks only for the visible range
  const rulerWidth = rulerRef.current?.parentElement?.clientWidth ?? 1200;
  const visibleStartFrame = Math.floor(scrollX);
  const visibleEndFrame = Math.ceil(scrollX + rulerWidth / ppf);

  const tick = useMemo(() => getTickConfig(ppf, fps), [ppf, fps]);

  const ticks = useMemo(() => {
    const arr: { frame: number; isMajor: boolean; showLabel: boolean }[] = [];
    const firstTick = Math.max(0, Math.floor(visibleStartFrame / tick.minor) * tick.minor);
    for (let f = firstTick; f <= visibleEndFrame + tick.minor; f += tick.minor) {
      if (f < 0) continue;
      const isMajor = f === 0 || f % tick.major === 0;
      const showLabel = f === 0 || f % tick.label === 0;
      arr.push({ frame: f, isMajor, showLabel });
    }
    return arr;
  }, [visibleStartFrame, visibleEndFrame, tick]);

  /** Convert mouse clientX → frame number. */
  const frameFromEvent = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      const rect = rulerRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      const x = e.clientX - rect.left;
      return Math.max(0, Math.round(scrollX + x / ppf));
    },
    [scrollX, ppf],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      isDraggingRef.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setPlayheadFrame(frameFromEvent(e));
    },
    [frameFromEvent, setPlayheadFrame],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      setPlayheadFrame(frameFromEvent(e));
    },
    [frameFromEvent, setPlayheadFrame],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  return (
    <div
      ref={rulerRef}
      className="h-7 bg-[#0d0d1a] border-b border-white/10 relative select-none overflow-hidden cursor-pointer"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Tick marks */}
      {ticks.map((t) => {
        const x = (t.frame - scrollX) * ppf;
        if (x < -20 || x > rulerWidth + 20) return null;
        return (
          <div
            key={t.frame}
            className="absolute bottom-0"
            style={{ left: x }}
          >
            <div
              className={
                t.isMajor
                  ? 'w-px h-3 bg-white/25'
                  : 'w-px h-1.5 bg-white/10'
              }
            />
            {t.showLabel && (
              <span className="absolute bottom-[14px] left-1 text-[8px] font-mono text-white/40 whitespace-nowrap pointer-events-none">
                {formatTC(t.frame, fps)}
              </span>
            )}
          </div>
        );
      })}

      {/* In/Out point triangles */}
      {inOutRange.inFrame !== null && (
        <div
          className="absolute top-0 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[7px] border-l-transparent border-r-transparent border-t-green-400"
          style={{ left: (inOutRange.inFrame - scrollX) * ppf - 5 }}
          title={`In: ${formatTC(inOutRange.inFrame, fps)}`}
        />
      )}
      {inOutRange.outFrame !== null && (
        <div
          className="absolute top-0 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[7px] border-l-transparent border-r-transparent border-t-red-400"
          style={{ left: (inOutRange.outFrame - scrollX) * ppf - 5 }}
          title={`Out: ${formatTC(inOutRange.outFrame, fps)}`}
        />
      )}
    </div>
  );
});

TimelineRuler.displayName = 'TimelineRuler';
