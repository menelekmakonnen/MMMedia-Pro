import { useCallback, useMemo } from 'react';
import { useTimelineStore } from '../timeline/useTimelineStore';
import { useClipStore, type Clip } from '../../../store/clipStore';
import { useMarkerStore } from '../../../store/markerStore';

const DEFAULT_THRESHOLD_PX = 8;

export interface SnapResult {
  snappedFrame: number;
  didSnap: boolean;
  /** The snap source frame we snapped to (for drawing a guideline). */
  snapSourceFrame?: number;
}

/**
 * useSnapCalculator — collects all snap-worthy frames and returns
 * a `findNearestSnap` function that checks proximity.
 *
 * Follows FreeCut's pattern: reads items imperatively on-demand
 * to avoid re-rendering every clip on every move.
 */
export function useSnapCalculator() {
  const snapEnabled = useTimelineStore((s) => s.snapEnabled);

  /** Collect all snap point frames on-demand (imperative read). */
  const collectSnapPoints = useCallback((): number[] => {
    const state = useTimelineStore.getState();
    const clips = useClipStore.getState().clips as Clip[];
    const markers = useMarkerStore.getState().markers;

    const points: number[] = [];

    // 1. All clip edges
    for (const clip of clips) {
      if (clip.disabled) continue;
      points.push(clip.startFrame, clip.endFrame);
    }

    // 2. Playhead
    points.push(state.playheadFrame);

    // 3. Markers
    for (const m of markers) {
      points.push(m.frame);
    }

    // 4. In/Out points
    if (state.inOutRange.inFrame !== null) points.push(state.inOutRange.inFrame);
    if (state.inOutRange.outFrame !== null) points.push(state.inOutRange.outFrame);

    return points;
  }, []);

  /**
   * Find the nearest snap point to `frame` within `thresholdPx` screen pixels.
   * Converts threshold from px → frames using the current ppf.
   */
  const findNearestSnap = useCallback(
    (frame: number, thresholdPx: number = DEFAULT_THRESHOLD_PX): SnapResult => {
      if (!snapEnabled) {
        return { snappedFrame: frame, didSnap: false };
      }

      const ppf = useTimelineStore.getState().pixelsPerFrame;
      const thresholdFrames = thresholdPx / ppf;
      const points = collectSnapPoints();

      let bestDist = Infinity;
      let bestFrame = frame;

      for (const p of points) {
        const dist = Math.abs(frame - p);
        if (dist < bestDist && dist <= thresholdFrames) {
          bestDist = dist;
          bestFrame = p;
        }
      }

      if (bestDist < Infinity) {
        return { snappedFrame: bestFrame, didSnap: true, snapSourceFrame: bestFrame };
      }

      return { snappedFrame: frame, didSnap: false };
    },
    [snapEnabled, collectSnapPoints],
  );

  /**
   * Snap for a range (item start + end). Picks the closest of the two edges.
   */
  const findNearestSnapForRange = useCallback(
    (startFrame: number, durationFrames: number, thresholdPx: number = DEFAULT_THRESHOLD_PX): SnapResult => {
      const startSnap = findNearestSnap(startFrame, thresholdPx);
      const endFrame = startFrame + durationFrames;
      const endSnap = findNearestSnap(endFrame, thresholdPx);

      const startDist = startSnap.didSnap ? Math.abs(startFrame - startSnap.snappedFrame) : Infinity;
      const endDist = endSnap.didSnap ? Math.abs(endFrame - endSnap.snappedFrame) : Infinity;

      if (startDist <= endDist && startSnap.didSnap) {
        return startSnap;
      }
      if (endSnap.didSnap) {
        return {
          snappedFrame: endSnap.snappedFrame - durationFrames,
          didSnap: true,
          snapSourceFrame: endSnap.snapSourceFrame,
        };
      }

      return { snappedFrame: startFrame, didSnap: false };
    },
    [findNearestSnap],
  );

  return {
    findNearestSnap,
    findNearestSnapForRange,
    snapEnabled,
  };
}
