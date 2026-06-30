import React, { useRef, useCallback, memo } from 'react';
import { Lock } from 'lucide-react';
import clsx from 'clsx';
import { useTimelineStore } from './useTimelineStore';
import { useClipStore } from '../../../store/clipStore';
import { useHistoryStore } from '../../../store/historyStore';
import { createSetClipsCommand } from '../../../lib/commandPattern';
import { rippleTrimClipEdge, rollTrim, slipClip, slideClip, rateStretchClip } from '../actions';
import type { Track } from './types';
import type { Clip } from '../../../store/clipStore';

export interface SnapFn {
  (startFrame: number, durationFrames: number): { snappedFrame: number; didSnap: boolean };
}

interface TimelineClipProps {
  clip: Clip;
  track: Track;
  isSelected: boolean;
  onSelect: (clipId: string, additive: boolean) => void;
  onTrimStart: (clipId: string, deltaFrames: number) => void;
  onTrimEnd: (clipId: string, deltaFrames: number) => void;
  onContextMenu?: (e: React.MouseEvent, clip: Clip) => void;
  /** Snap a candidate (start,duration) to nearby edges; identity when snap off. */
  snapRange?: SnapFn;
}

const DRAG_THRESHOLD_PX = 3;

function cloneClips(clips: Clip[]): Clip[] {
  return JSON.parse(JSON.stringify(clips));
}

function trackCategory(type: string): 'video' | 'audio' {
  return type === 'audio' ? 'audio' : 'video';
}

/** Color scheme by clip type. */
const CLIP_STYLES: Record<string, string> = {
  video: 'bg-indigo-900/50 border-l-4 border-l-indigo-400 border-y-indigo-400/20 border-r-indigo-400/20',
  audio: 'bg-pink-900/50 border-l-4 border-l-pink-400 border-y-pink-400/20 border-r-pink-400/20',
  image: 'bg-amber-900/50 border-l-4 border-l-amber-400 border-y-amber-400/20 border-r-amber-400/20',
  grid: 'bg-purple-900/50 border-l-4 border-l-purple-400 border-y-purple-400/20 border-r-purple-400/20',
};

const CLIP_TEXT_COLOR: Record<string, string> = {
  video: 'text-indigo-200/80',
  audio: 'text-pink-200/80',
  image: 'text-amber-200/80',
  grid: 'text-purple-200/80',
};

export const TimelineClip: React.FC<TimelineClipProps> = memo(({
  clip,
  track,
  isSelected,
  onSelect,
  onTrimStart,
  onTrimEnd,
  onContextMenu,
  snapRange,
}) => {
  const ppf = useTimelineStore((s) => s.pixelsPerFrame);
  const scrollX = useTimelineStore((s) => s.scrollX);
  const activeTool = useTimelineStore((s) => s.activeTool);

  const trimRef = useRef<{ edge: 'left' | 'right'; startX: number } | null>(null);

  // ── Body drag (move along time + across tracks) ───────────────────
  const dragRef = useRef<{
    startX: number;
    origStart: number;
    duration: number;
    before: Clip[];
    moved: boolean;
    lastTotal: number;
  } | null>(null);

  const handleBodyPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Ignore right-click, locked clips, and trim-handle origins.
      if (e.button !== 0) return;
      if (track.locked || clip.locked || clip.disabled) return;
      if ((e.target as HTMLElement).dataset.trimHandle === 'true') return;
      e.stopPropagation();
      dragRef.current = {
        startX: e.clientX,
        origStart: clip.startFrame,
        duration: clip.endFrame - clip.startFrame,
        before: cloneClips(useClipStore.getState().clips),
        moved: false,
        lastTotal: 0,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [track.locked, clip.locked, clip.disabled, clip.startFrame, clip.endFrame],
  );

  const handleBodyPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      if (Math.abs(dx) >= DRAG_THRESHOLD_PX) d.moved = true;
      const totalFrames = Math.round(dx / ppf);

      // Slip / Slide tools act on the clip body (incremental delta).
      if (activeTool === 'slip' || activeTool === 'slide') {
        const delta = totalFrames - d.lastTotal;
        if (delta !== 0) {
          d.lastTotal = totalFrames;
          if (activeTool === 'slip') slipClip(clip.id, delta);
          else slideClip(clip.id, delta);
        }
        return;
      }

      // Default: move the clip along time.
      let newStart = Math.max(0, d.origStart + totalFrames);
      if (snapRange) {
        const r = snapRange(newStart, d.duration);
        if (r.didSnap) newStart = Math.max(0, r.snappedFrame);
      }
      useClipStore.getState().updateClip(clip.id, {
        startFrame: newStart,
        endFrame: newStart + d.duration,
      });
    },
    [ppf, snapRange, clip.id, activeTool],
  );

  const handleBodyPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
      if (!d) return;
      // Slip/Slide already committed their own undoable steps during the drag.
      if (activeTool === 'slip' || activeTool === 'slide') return;
      if (!d.moved) return; // treat as a click — selection handled elsewhere

      // Resolve the track under the cursor (cross-track move). Briefly disable
      // pointer-events on the dragged clip so it can't shadow the target lane.
      const self = e.currentTarget as HTMLElement;
      const prevPE = self.style.pointerEvents;
      self.style.pointerEvents = 'none';
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      self.style.pointerEvents = prevPE;
      const laneEl = el?.closest('[data-track-id]') as HTMLElement | null;
      if (laneEl) {
        const targetId = Number(laneEl.getAttribute('data-track-id'));
        const targetCat = laneEl.getAttribute('data-track-type');
        if (
          !Number.isNaN(targetId) &&
          targetId !== clip.track &&
          targetCat === trackCategory(clip.type)
        ) {
          useClipStore.getState().updateClip(clip.id, { track: targetId });
        }
      }

      // Commit as a single undo step: restore pre-drag, then push the final state.
      const after = cloneClips(useClipStore.getState().clips);
      useClipStore.setState({ clips: d.before });
      const cmd = createSetClipsCommand(
        () => useClipStore.getState(),
        (updater) => useClipStore.setState(updater(useClipStore.getState())),
        after,
        `Move "${clip.filename}"`,
      );
      useHistoryStore.getState().execute(cmd);
    },
    [clip.id, clip.track, clip.type, clip.filename],
  );

  const durationFrames = clip.endFrame - clip.startFrame;
  const left = (clip.startFrame - scrollX) * ppf;
  const width = durationFrames * ppf;

  // ── Click handler ─────────────────────────────────────────────────
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect(clip.id, e.shiftKey || e.ctrlKey || e.metaKey);
    },
    [clip.id, onSelect],
  );

  // ── Context menu ──────────────────────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu?.(e, clip);
  }, [onContextMenu, clip]);

  // ── Trim handle helpers ───────────────────────────────────────────
  const startTrim = useCallback(
    (edge: 'left' | 'right', e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      trimRef.current = { edge, startX: e.clientX };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [],
  );

  const moveTrim = useCallback(
    (e: React.PointerEvent) => {
      if (!trimRef.current) return;
      const dx = e.clientX - trimRef.current.startX;
      const deltaFrames = Math.round(dx / ppf);
      if (deltaFrames === 0) return;
      trimRef.current.startX = e.clientX;

      const edge = trimRef.current.edge;
      const startOrEnd = edge === 'left' ? 'start' : 'end';

      // Ripple Edit: trim + close/open the gap downstream.
      if (activeTool === 'ripple') { rippleTrimClipEdge(clip.id, startOrEnd, deltaFrames); return; }
      // Rate Stretch: dragging an edge rescales speed.
      if (activeTool === 'rate-stretch') { rateStretchClip(clip.id, startOrEnd, deltaFrames); return; }
      // Rolling Edit: move the shared edit point with the adjacent clip.
      if (activeTool === 'rolling') {
        const lane = useClipStore.getState().clips
          .filter((c) => c.track === clip.track && c.id !== clip.id)
          .sort((a, b) => a.startFrame - b.startFrame);
        if (edge === 'left') {
          const prev = lane.filter((c) => c.endFrame <= clip.startFrame).pop();
          if (prev) { rollTrim(prev.id, clip.id, deltaFrames); return; }
        } else {
          const next = lane.find((c) => c.startFrame >= clip.endFrame);
          if (next) { rollTrim(clip.id, next.id, deltaFrames); return; }
        }
        // no adjacent clip → fall through to a normal trim
      }

      // Normal trim (Selection / Trim tools).
      if (edge === 'left') onTrimStart(clip.id, deltaFrames);
      else onTrimEnd(clip.id, deltaFrames);
    },
    [clip.id, clip.track, clip.startFrame, clip.endFrame, ppf, onTrimStart, onTrimEnd, activeTool],
  );

  const endTrim = useCallback((e: React.PointerEvent) => {
    trimRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  const isLocked = track.locked || clip.locked;
  const isDisabled = !!clip.disabled;
  const showSpeed = clip.speed !== 1;

  const isAdjustment = !!(clip as { isAdjustmentLayer?: boolean }).isAdjustmentLayer;
  const clipStyle = isAdjustment
    ? 'bg-violet-600/25 border-l-4 border-l-violet-300 border-y-violet-300/30 border-r-violet-300/30'
    : (CLIP_STYLES[clip.type] ?? 'bg-gray-800/40 border-l-4 border-l-gray-400');
  const textColor = isAdjustment ? 'text-violet-100/90' : (CLIP_TEXT_COLOR[clip.type] ?? 'text-gray-200/80');

  return (
    <div
      data-clip-id={clip.id}
      className={clsx(
        'absolute top-1 bottom-1 rounded border text-xs flex flex-col justify-between overflow-hidden transition-colors',
        clipStyle,
        textColor,
        isSelected && 'ring-2 ring-purple-400/70 shadow-[0_0_8px_rgba(168,85,247,0.3)]',
        !isSelected && clip.deflicker?.enabled && 'ring-1 ring-amber-500/30',
        isDisabled && 'opacity-30 grayscale border-dashed',
        isLocked && 'cursor-not-allowed',
        !isLocked && !isDisabled && 'hover:brightness-110 cursor-pointer',
      )}
      style={{
        left,
        width: Math.max(width, 4),
        touchAction: 'none',
        backgroundImage: isDisabled
          ? 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.03) 4px, rgba(255,255,255,0.03) 8px)'
          : undefined,
      }}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onPointerDown={handleBodyPointerDown}
      onPointerMove={handleBodyPointerMove}
      onPointerUp={handleBodyPointerUp}
      title={`${clip.filename} (${durationFrames}f)`}
    >
      {/* ── Deflicker nested-sequence visualization ── */}
      {clip.deflicker?.enabled && (
        <>
          {/* Layer offset indicators — stacked layers suggest nested sequence */}
          <div
            className="absolute inset-0 border border-amber-500/20 rounded"
            style={{ transform: 'translate(2px, -2px)', zIndex: -1 }}
          />
          <div
            className="absolute inset-0 border border-amber-500/10 rounded"
            style={{ transform: 'translate(4px, -4px)', zIndex: -2 }}
          />
        </>
      )}
      {/* ── Left trim handle ── */}
      {!isLocked && !isDisabled && (
        <div
          data-trim-handle="true"
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 group/trim hover:bg-yellow-400/20"
          onPointerDown={(e) => startTrim('left', e)}
          onPointerMove={moveTrim}
          onPointerUp={endTrim}
        >
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-yellow-400/0 group-hover/trim:bg-yellow-400 rounded-r transition-colors" />
        </div>
      )}

      {/* ── Right trim handle ── */}
      {!isLocked && !isDisabled && (
        <div
          data-trim-handle="true"
          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 group/trim hover:bg-yellow-400/20"
          onPointerDown={(e) => startTrim('right', e)}
          onPointerMove={moveTrim}
          onPointerUp={endTrim}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-yellow-400/0 group-hover/trim:bg-yellow-400 rounded-l transition-colors" />
        </div>
      )}

      {/* ── Content ── */}
      <div className="px-1.5 pt-1 truncate">
        <span className="font-semibold text-[10px] truncate flex items-center gap-1">
          {isLocked && <Lock size={8} className="text-red-400/70 flex-shrink-0" />}
          {clip.filename}
        </span>
      </div>

      {/* ── Filmstrip / Waveform placeholder ── */}
      {clip.type === 'video' && width > 60 && (
        <div className="flex-1 flex items-center justify-center opacity-20">
          <div className="flex gap-px">
            {Array.from({ length: Math.min(Math.floor(width / 30), 8) }).map((_, i) => (
              <div key={i} className="w-5 h-3 bg-white/10 rounded-[1px]" />
            ))}
          </div>
        </div>
      )}
      {clip.type === 'audio' && width > 40 && (
        <div className="flex-1 flex items-end justify-center gap-px px-1 pb-0.5 opacity-30">
          {Array.from({ length: Math.min(Math.floor(width / 3), 40) }).map((_, i) => (
            <div
              key={i}
              className="w-0.5 bg-pink-400/60 rounded-t"
              style={{ height: `${20 + Math.random() * 60}%` }}
            />
          ))}
        </div>
      )}

      {/* ── Bottom info bar ── */}
      <div className="flex items-center justify-between px-1.5 pb-0.5">
        {clip.deflicker?.enabled && (
          <span className="text-[8px] font-bold text-amber-400/80 bg-amber-500/15 px-1 rounded">
            ⚡ DF
          </span>
        )}
        {(clip.parametricEffects?.length ?? 0) > 0 && (
          <span className="text-[8px] font-bold text-purple-400/80 bg-purple-500/15 px-1 rounded">
            ✦ {clip.parametricEffects!.length}FX
          </span>
        )}
        {clip.shake && (
          <span className="text-[8px] font-bold text-orange-400/80 bg-orange-500/15 px-1 rounded">
            ↯
          </span>
        )}
        {clip.audioEffects?.limiter && (
          <span className="text-[8px] font-bold text-cyan-400/80 bg-cyan-500/15 px-1 rounded">
            🔊
          </span>
        )}
        {clip.audioEffects?.ringOut && (
          <span className="text-[8px] font-bold text-pink-400/80 bg-pink-500/15 px-1 rounded">
            🎵
          </span>
        )}
        {showSpeed && (
          <span className="text-[9px] font-mono bg-black/30 px-1 rounded">
            {clip.speed}×
          </span>
        )}
        <span className="text-[9px] opacity-40 ml-auto font-mono">
          {durationFrames}f
        </span>
      </div>
    </div>
  );
});

TimelineClip.displayName = 'TimelineClip';
