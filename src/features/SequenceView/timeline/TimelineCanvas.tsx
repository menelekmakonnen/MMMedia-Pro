import React, { useMemo, useRef, useCallback, useEffect, useState, memo } from 'react';
import clsx from 'clsx';
import { useTimelineStore } from './useTimelineStore';
import { useClipStore, type Clip } from '../../../store/clipStore';
import { TimelineRuler } from './TimelineRuler';
import { TimelinePlayhead } from './TimelinePlayhead';
import { TimelineTrack } from './TimelineTrack';
import { TimelineMarkers } from './TimelineMarkers';
import { useTimelineZoom } from '../hooks/useTimelineZoom';
import { useSnapCalculator } from '../hooks/useSnapCalculator';
import { useDeriveTracks } from '../hooks/useDeriveTracks';
import { useContextMenu } from '../../../components/ContextMenu';
import { buildClipMenu, buildTrackMenu } from '../menus/contextMenus';
import { Film, Music, Zap } from 'lucide-react';
import type { Track } from './types';

interface TimelineCanvasProps {
  fps: number;
}

/**
 * TimelineCanvas — the main orchestrating component that composes
 * the ruler, playhead, tracks, markers, and handles scroll/zoom/marquee.
 */
export const TimelineCanvas: React.FC<TimelineCanvasProps> = memo(({ fps }) => {
  const clips = useClipStore((s) => s.clips);
  const tracks = useTimelineStore((s) => s.tracks);
  const ppf = useTimelineStore((s) => s.pixelsPerFrame);
  const scrollX = useTimelineStore((s) => s.scrollX);
  const setScrollX = useTimelineStore((s) => s.setScrollX);
  const setSelectedItemIds = useTimelineStore((s) => s.setSelectedItemIds);
  const selectedItemIds = useTimelineStore((s) => s.selectedItemIds);
  const addTrack = useTimelineStore((s) => s.addTrack);
  const prerenderEnabled = useTimelineStore((s) => s.prerenderEnabled);
  const prerenderCache = useTimelineStore((s) => s.prerenderCache);
  const setPrerenderEnabled = useTimelineStore((s) => s.setPrerenderEnabled);
  const requestPrerender = useTimelineStore((s) => s.requestPrerender);

  // Keep timeline tracks in sync with the clips that exist.
  useDeriveTracks();

  const { handleWheel } = useTimelineZoom();
  const { showContextMenu, ContextMenuPortal } = useContextMenu();
  const { findNearestSnap, findNearestSnapForRange } = useSnapCalculator();

  const snapRange = useCallback(
    (startFrame: number, durationFrames: number) => {
      const r = findNearestSnapForRange(startFrame, durationFrames);
      return { snappedFrame: r.snappedFrame, didSnap: r.didSnap };
    },
    [findNearestSnapForRange],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const trackAreaRef = useRef<HTMLDivElement>(null);

  // ── Marquee state ─────────────────────────────────────────────────
  const [marquee, setMarquee] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // ── Map clips → tracks (with viewport culling for long sequences) ──
  const trackClipMap = useMemo(() => {
    const map = new Map<number, Clip[]>();
    for (const t of tracks) {
      map.set(t.id, []);
    }
    // Visible frame window + one screen of buffer on each side. Clips fully
    // outside this range are not rendered (virtualization for long timelines).
    const laneWidthPx = (typeof window !== 'undefined' ? window.innerWidth : 1920) - 200;
    const visibleFrames = laneWidthPx / Math.max(ppf, 0.001);
    const windowStart = scrollX - visibleFrames;
    const windowEnd = scrollX + visibleFrames * 2;

    for (const clip of clips as Clip[]) {
      if (clip.endFrame < windowStart || clip.startFrame > windowEnd) continue;
      const trackId = clip.track ?? 1;
      const arr = map.get(trackId);
      if (arr) {
        arr.push(clip);
      }
    }
    // Sort each track's clips by start frame
    for (const arr of map.values()) {
      arr.sort((a, b) => a.startFrame - b.startFrame);
    }
    return map;
  }, [clips, tracks, ppf, scrollX]);

  // ── Scroll handling (shift+wheel = horizontal scroll) ─────────────
  const handleWheelEvent = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (e.ctrlKey || e.metaKey) {
        // Zoom
        handleWheel(e.nativeEvent);
        e.preventDefault();
      } else if (e.shiftKey) {
        // Horizontal scroll
        e.preventDefault();
        setScrollX(scrollX + e.deltaY / ppf);
      }
    },
    [handleWheel, scrollX, ppf, setScrollX],
  );

  // ── Clip selection (mirrors into clipStore so the action library + inspector see it) ──
  const syncClipStoreSelection = useCallback((ids: Set<string>) => {
    useClipStore.setState({ selectedClipIds: Array.from(ids) });
  }, []);

  const handleClipSelect = useCallback(
    (clipId: string, additive: boolean) => {
      let next: Set<string>;
      if (additive) {
        next = new Set(selectedItemIds);
        if (next.has(clipId)) next.delete(clipId);
        else next.add(clipId);
      } else {
        next = new Set([clipId]);
      }
      setSelectedItemIds(next);
      syncClipStoreSelection(next);
    },
    [selectedItemIds, setSelectedItemIds, syncClipStoreSelection],
  );

  // ── Context menus ─────────────────────────────────────────────────
  const handleClipContextMenu = useCallback(
    (e: React.MouseEvent, clip: Clip) => {
      // Ensure the right-clicked clip is part of the selection so actions target it.
      let ids = selectedItemIds;
      if (!ids.has(clip.id)) {
        ids = new Set([clip.id]);
        setSelectedItemIds(ids);
        syncClipStoreSelection(ids);
      } else {
        syncClipStoreSelection(ids);
      }
      showContextMenu(e, buildClipMenu(clip, Array.from(ids)));
    },
    [selectedItemIds, setSelectedItemIds, syncClipStoreSelection, showContextMenu],
  );

  const handleHeaderContextMenu = useCallback(
    (e: React.MouseEvent, track: Track, index: number, total: number) => {
      showContextMenu(e, buildTrackMenu(track, index, total));
    },
    [showContextMenu],
  );

  // ── Pre-render / proxy ─────────────────────────────────────────────
  // Video clips currently in the rendered map (already culled to viewport).
  const visibleVideoClips = useMemo(
    () =>
      Array.from(trackClipMap.values())
        .flat()
        .filter((c) => c.type === 'video' || c.type === 'grid'),
    [trackClipMap],
  );

  const handleTogglePrerender = useCallback(() => {
    const next = !prerenderEnabled;
    setPrerenderEnabled(next);
    if (next) {
      // Kick off proxy generation for any visible video clip not yet cached.
      for (const c of visibleVideoClips) {
        if (!prerenderCache[c.id]) requestPrerender(c.id);
      }
    }
  }, [prerenderEnabled, setPrerenderEnabled, visibleVideoClips, prerenderCache, requestPrerender]);

  // ── Trim handlers ─────────────────────────────────────────────────
  const updateClip = useClipStore((s) => s.updateClip);

  const handleTrimStart = useCallback(
    (clipId: string, deltaFrames: number) => {
      const clip = (clips as Clip[]).find((c) => c.id === clipId);
      if (!clip) return;
      const speed = clip.speed || 1;
      let newStart = Math.max(0, clip.startFrame + deltaFrames);
      const snap = findNearestSnap(newStart);
      if (snap.didSnap) newStart = Math.max(0, snap.snappedFrame);
      if (newStart >= clip.endFrame) return; // can't cross the out-point
      const appliedDelta = newStart - clip.startFrame;
      // Source frames advance by timeline-frames × speed, and must stay within
      // [0, trimEnd-1] so we never read past the in/out of the source media.
      const srcDelta = Math.round(appliedDelta * speed);
      const trimEnd = clip.trimEndFrame ?? clip.sourceDurationFrames ?? 0;
      let newTrimStart = (clip.trimStartFrame ?? 0) + srcDelta;
      newTrimStart = Math.max(0, Math.min(newTrimStart, Math.max(0, trimEnd - 1)));
      updateClip(clipId, {
        startFrame: newStart,
        trimStartFrame: newTrimStart,
      });
    },
    [clips, updateClip, findNearestSnap],
  );

  const handleTrimEnd = useCallback(
    (clipId: string, deltaFrames: number) => {
      const clip = (clips as Clip[]).find((c) => c.id === clipId);
      if (!clip) return;
      const speed = clip.speed || 1;
      let newEnd = clip.endFrame + deltaFrames;
      const snap = findNearestSnap(newEnd);
      if (snap.didSnap) newEnd = snap.snappedFrame;
      if (newEnd <= clip.startFrame) return; // can't cross the in-point
      const appliedDelta = newEnd - clip.endFrame;
      const srcDelta = Math.round(appliedDelta * speed);
      const srcMax = clip.sourceDurationFrames && clip.sourceDurationFrames > 0
        ? clip.sourceDurationFrames
        : Number.MAX_SAFE_INTEGER;
      const trimStart = clip.trimStartFrame ?? 0;
      let newTrimEnd = (clip.trimEndFrame ?? clip.sourceDurationFrames ?? 0) + srcDelta;
      newTrimEnd = Math.min(Math.max(newTrimEnd, trimStart + 1), srcMax);
      updateClip(clipId, {
        endFrame: newEnd,
        trimEndFrame: newTrimEnd,
      });
    },
    [clips, updateClip, findNearestSnap],
  );

  // ── Marquee (empty area drag) ─────────────────────────────────────
  const handleBackgroundPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only start marquee on the background (not on clips)
      if ((e.target as HTMLElement) !== e.currentTarget) return;
      setMarquee({
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
      });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [],
  );

  const handleBackgroundPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!marquee) return;
      setMarquee((m) => (m ? { ...m, currentX: e.clientX, currentY: e.clientY } : null));
    },
    [marquee],
  );

  const handleBackgroundPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (marquee) {
        // Hit-test every clip element against the marquee rect (screen coords).
        const mLeft = Math.min(marquee.startX, marquee.currentX);
        const mRight = Math.max(marquee.startX, marquee.currentX);
        const mTop = Math.min(marquee.startY, marquee.currentY);
        const mBottom = Math.max(marquee.startY, marquee.currentY);
        const dragged = Math.abs(mRight - mLeft) > 3 || Math.abs(mBottom - mTop) > 3;

        if (dragged && trackAreaRef.current) {
          const hits = new Set<string>();
          const els = trackAreaRef.current.querySelectorAll<HTMLElement>('[data-clip-id]');
          els.forEach((el) => {
            const r = el.getBoundingClientRect();
            const intersects = !(r.right < mLeft || r.left > mRight || r.bottom < mTop || r.top > mBottom);
            if (intersects) {
              const id = el.getAttribute('data-clip-id');
              if (id) hits.add(id);
            }
          });
          setSelectedItemIds(hits);
          useClipStore.setState({ selectedClipIds: Array.from(hits) });
        } else {
          setSelectedItemIds(new Set());
          useClipStore.setState({ selectedClipIds: [] });
        }
        setMarquee(null);
      } else if ((e.target as HTMLElement) === e.currentTarget) {
        // Click on empty space clears selection.
        setSelectedItemIds(new Set());
        useClipStore.setState({ selectedClipIds: [] });
      }
      try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
    },
    [marquee, setSelectedItemIds],
  );

  // Marquee rect (absolute screen coords → CSS)
  const marqueeRect = marquee
    ? {
        left: Math.min(marquee.startX, marquee.currentX),
        top: Math.min(marquee.startY, marquee.currentY),
        width: Math.abs(marquee.currentX - marquee.startX),
        height: Math.abs(marquee.currentY - marquee.startY),
      }
    : null;

  return (
    <div
      ref={containerRef}
      className="flex-1 flex flex-col overflow-hidden relative bg-[#0a0a15]"
      onWheel={handleWheelEvent}
    >
      {/* ── Top: Ruler (left 200px spacer holds the Add-Track buttons) ─── */}
      <div className="flex flex-shrink-0">
        <div className="w-[200px] flex-shrink-0 h-7 bg-[#0d0d1a] border-b border-white/10 border-r border-r-white/[0.04] flex items-center justify-between px-2">
          <span className="text-[9px] font-bold text-white/30 tracking-widest uppercase">Tracks</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => addTrack({ id: 10 + tracks.filter((t) => t.type === 'video').length, type: 'video', name: `V${10 + tracks.filter((t) => t.type === 'video').length}`, height: 60, locked: false, muted: false, solo: false, visible: true, color: '#6366f1', volume: 100 })}
              className="p-0.5 rounded text-white/30 hover:text-indigo-300 hover:bg-white/5 transition-colors"
              title="Add Video Track"
            >
              <Film size={11} />
            </button>
            <button
              onClick={() => addTrack({ id: 200 + tracks.filter((t) => t.type === 'audio').length, type: 'audio', name: `A${200 + tracks.filter((t) => t.type === 'audio').length - 100 + 1}`, height: 48, locked: false, muted: false, solo: false, visible: true, color: '#ec4899', volume: 100 })}
              className="p-0.5 rounded text-white/30 hover:text-pink-300 hover:bg-white/5 transition-colors"
              title="Add Audio Track"
            >
              <Music size={11} />
            </button>
            <button
              onClick={handleTogglePrerender}
              className={clsx('p-0.5 rounded transition-colors', prerenderEnabled ? 'text-emerald-400 bg-emerald-500/10' : 'text-white/30 hover:text-emerald-300 hover:bg-white/5')}
              title={prerenderEnabled ? 'Pre-render on — generating proxies' : 'Enable pre-render (proxy) for smooth playback'}
            >
              <Zap size={11} />
            </button>
          </div>
        </div>
        <div className="flex-1 relative overflow-hidden">
          <TimelineRuler fps={fps} />
        </div>
      </div>

      {/* ── Render-status bar (green = pre-rendered/proxied) ── */}
      {prerenderEnabled && (
        <div className="flex flex-shrink-0 h-1.5 bg-[#06060f]">
          <div className="w-[200px] flex-shrink-0" />
          <div className="flex-1 relative overflow-hidden">
            {visibleVideoClips.map((c) => {
              const cached = !!prerenderCache[c.id];
              return (
                <div
                  key={c.id}
                  className={clsx('absolute top-0 bottom-0', cached ? 'bg-emerald-500/70' : 'bg-amber-400/30')}
                  style={{ left: (c.startFrame - scrollX) * ppf, width: Math.max((c.endFrame - c.startFrame) * ppf, 2) }}
                  title={cached ? 'Pre-rendered' : 'Rendering…'}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Body: tracks area (each TimelineTrack renders its own header) ── */}
      <div className="flex-1 flex min-h-0 overflow-y-auto relative">
        <div
          ref={trackAreaRef}
          className="flex-1 flex flex-col min-w-0 relative"
          onPointerDown={handleBackgroundPointerDown}
          onPointerMove={handleBackgroundPointerMove}
          onPointerUp={handleBackgroundPointerUp}
        >
          {tracks.map((track, idx) => (
            <TimelineTrack
              key={track.id}
              track={track}
              clips={trackClipMap.get(track.id) ?? []}
              trackIndex={idx}
              totalTracks={tracks.length}
              onClipSelect={handleClipSelect}
              onTrimStart={handleTrimStart}
              onTrimEnd={handleTrimEnd}
              onClipContextMenu={handleClipContextMenu}
              onHeaderContextMenu={handleHeaderContextMenu}
              snapRange={snapRange}
            />
          ))}

          {/* ── Overlays ── */}
          <TimelinePlayhead />
          <TimelineMarkers />
        </div>
      </div>

      {/* ── Right-click context menu portal ── */}
      <ContextMenuPortal />

      {/* ── Marquee overlay (fixed to viewport) ── */}
      {marqueeRect && marqueeRect.width > 3 && (
        <div
          className="fixed border border-purple-400/50 bg-purple-400/10 pointer-events-none z-50"
          style={marqueeRect}
        />
      )}
    </div>
  );
});

TimelineCanvas.displayName = 'TimelineCanvas';
