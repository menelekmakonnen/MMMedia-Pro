import { useCallback, useMemo } from 'react';
import { useTimelineStore } from '../timeline/useTimelineStore';
import { useClipStore, type Clip } from '../../../store/clipStore';

const MIN_PPF = 0.02;
const MAX_PPF = 5.0;
const ZOOM_FACTOR = 1.15;

/**
 * useTimelineZoom — handles all zoom interactions:
 * ctrl+wheel, keyboard +/-, fit-to-window, and exposes a 0–100 slider value.
 */
export function useTimelineZoom() {
  const ppf = useTimelineStore((s) => s.pixelsPerFrame);
  const scrollX = useTimelineStore((s) => s.scrollX);
  const setPixelsPerFrame = useTimelineStore((s) => s.setPixelsPerFrame);
  const setScrollX = useTimelineStore((s) => s.setScrollX);

  /**
   * Zoom centered on a cursor position (in client pixels relative to the timeline left).
   * cursorXPx is from the left edge of the track area (i.e. after the 200px header).
   */
  const zoomAtCursor = useCallback(
    (newPpf: number, cursorXPx: number) => {
      const clampedPpf = Math.max(MIN_PPF, Math.min(MAX_PPF, newPpf));
      // Frame under cursor before zoom
      const frameUnderCursor = scrollX + cursorXPx / ppf;
      // After zoom, that frame should still be at the same pixel
      const newScrollX = frameUnderCursor - cursorXPx / clampedPpf;
      setPixelsPerFrame(clampedPpf);
      setScrollX(Math.max(0, newScrollX));
    },
    [ppf, scrollX, setPixelsPerFrame, setScrollX],
  );

  /** Handle native WheelEvent (usually from ctrl+scroll). */
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      const delta = -e.deltaY;
      const factor = delta > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      // Determine cursor position relative to the track area.
      // We assume the track area starts 200px from the left of the timeline container.
      const container = (e.currentTarget as HTMLElement | null) ?? document.body;
      const rect = container.getBoundingClientRect();
      const cursorXPx = e.clientX - rect.left - 200;
      zoomAtCursor(ppf * factor, Math.max(0, cursorXPx));
    },
    [ppf, zoomAtCursor],
  );

  const zoomIn = useCallback(() => {
    const container = document.querySelector('[data-timeline-canvas]');
    const w = container?.clientWidth ?? 800;
    zoomAtCursor(ppf * ZOOM_FACTOR, w / 2 - 200);
  }, [ppf, zoomAtCursor]);

  const zoomOut = useCallback(() => {
    const container = document.querySelector('[data-timeline-canvas]');
    const w = container?.clientWidth ?? 800;
    zoomAtCursor(ppf / ZOOM_FACTOR, w / 2 - 200);
  }, [ppf, zoomAtCursor]);

  /** Zoom so the entire sequence fits the viewport width. */
  const fitToWindow = useCallback(() => {
    const clips = useClipStore.getState().clips as Clip[];
    if (clips.length === 0) return;
    const maxEnd = clips.reduce((m, c) => Math.max(m, c.endFrame), 0);
    if (maxEnd === 0) return;

    const container = document.querySelector('[data-timeline-canvas]');
    const viewportWidth = (container?.clientWidth ?? 800) - 200; // subtract track headers
    const idealPpf = viewportWidth / (maxEnd + 30); // small padding
    setPixelsPerFrame(Math.max(MIN_PPF, Math.min(MAX_PPF, idealPpf)));
    setScrollX(0);
  }, [setPixelsPerFrame, setScrollX]);

  /** Normalised 0–100 value for a slider UI. */
  const zoomLevel = useMemo(() => {
    // Map ppf logarithmically to 0..100
    const logMin = Math.log(MIN_PPF);
    const logMax = Math.log(MAX_PPF);
    const logCur = Math.log(ppf);
    return ((logCur - logMin) / (logMax - logMin)) * 100;
  }, [ppf]);

  /** Set zoom from a 0–100 slider value. */
  const setZoomFromSlider = useCallback(
    (value: number) => {
      const logMin = Math.log(MIN_PPF);
      const logMax = Math.log(MAX_PPF);
      const logPpf = logMin + (value / 100) * (logMax - logMin);
      setPixelsPerFrame(Math.exp(logPpf));
    },
    [setPixelsPerFrame],
  );

  return {
    handleWheel,
    zoomIn,
    zoomOut,
    fitToWindow,
    zoomLevel,
    setZoomFromSlider,
    ppf,
  };
}
