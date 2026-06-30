// ══════════════════════════════════════════════════════════════════════════════
// EffectControlsPanel — a 1:1 Adobe Premiere Pro "Effect Controls" panel.
//
// Left column  : the property tree (Motion ▸ Position/Scale/Rotation/Anchor Point/
//                Anti-flicker; Opacity ▸ Opacity/Blend Mode; Time Remapping ▸ Speed;
//                plus any applied video/audio effects). Each numeric property has a
//                stopwatch (enable keyframing), scrubbable "hot text" values, and
//                prev/add-remove/next keyframe navigation.
// Right column : per-property keyframe lanes with draggable diamonds, a time ruler,
//                and a playhead synced to the sequence.
//
// Source of truth is clip.effectControls (Premiere-aligned model in
// lib/premiere/effectControls). Legacy transform fields are synced on every write
// so playback + export keep working during migration.
// ══════════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  ChevronRight, ChevronDown, Clock, RotateCcw, Sparkles,
  ChevronLeft, ChevronRight as ChevronRightNav, Zap, X, Copy, ClipboardPaste, Save, Plus,
  Circle, Square, PenTool,
} from 'lucide-react';
import { useClipStore } from '../../../store/clipStore';
import { useProjectStore } from '../../../store/projectStore';
import { useTimelineStore } from '../timeline/useTimelineStore';
import { usePremiereFxStore } from '../../../store/premiereFxStore';
import { formatTimecode } from '../../../lib/time';
import type { KfPoint } from '../../../lib/keyframes';
import { effectControlsToParametric, removeComponent, componentFromEffectId, appendEffectComponent } from '../../../lib/premiere/effectLibrary';
import { makeEllipseMask, makeRectangleMask, makeFreeMask } from '../../../lib/premiere/masks';
import { EFFECT_REGISTRY } from '../../../lib/effectRegistry';
import { PasteAttributesModal } from './PasteAttributesModal';
import {
  type EffectControlsState, type EffectComponent, type EffectParam, type EffectMask,
  type ScalarParam, type Point2DParam, type BoolParam, type EnumParam,
  migrateClipToEffectControls, evalScalar, evalPoint,
  toggleParamKeyframing, setScalarValueAtFrame, setPointValueAtFrame,
  addKeyframeAtFrame, removeKeyframeAtFrame, resetParam,
  hasKeyframeAt, nextKeyframeFrame, prevKeyframeFrame,
  allParamKeyframeFrames, isKeyframeable, upsertKeyframe, removeKeyframe,
  syncEffectControlsToLegacy, setParamKeyframeInterp,
  INTERP_LABELS, type InterpKind,
} from '../../../lib/premiere/effectControls';

interface Props {
  selectedClipId: string | null;
  /** Global (sequence) playhead frame. */
  currentFrame: number;
  onJumpToFrame: (frame: number) => void;
}

// ─── Scrubbable "hot text" number (Premiere-style click-drag to change) ───────

const ScrubValue: React.FC<{
  value: number;
  onChange: (v: number) => void;
  onCommit?: () => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  decimals?: number;
  className?: string;
}> = ({ value, onChange, onCommit, step = 1, min, max, unit, decimals = 1, className }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const dragRef = useRef<{ startX: number; startVal: number; moved: boolean } | null>(null);

  const clamp = (v: number) => {
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (editing) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startVal: value, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 2) d.moved = true;
    // 1px → step (×0.1 with shift for fine, ×10 region scaling for big ranges)
    const scale = e.shiftKey ? step * 0.1 : step;
    onChange(clamp(d.startVal + dx * scale));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (d && !d.moved) {
      setDraft(value.toFixed(decimals));
      setEditing(true);
    } else if (d?.moved) {
      onCommit?.();
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = parseFloat(draft);
          if (!Number.isNaN(n)) { onChange(clamp(n)); onCommit?.(); }
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
          if (e.key === 'Escape') { setEditing(false); }
        }}
        className={clsx('w-12 bg-[#1a1a30] border border-indigo-500/40 rounded px-1 text-[10px] text-right text-indigo-200 outline-none tabular-nums', className)}
      />
    );
  }

  return (
    <span
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={clsx('cursor-ew-resize select-none text-[10px] text-indigo-300 hover:text-indigo-200 tabular-nums underline decoration-dotted decoration-indigo-500/30 underline-offset-2', className)}
      title="Drag to scrub · click to type · Shift = fine"
    >
      {value.toFixed(decimals)}{unit ?? ''}
    </span>
  );
};

// ─── Stopwatch (keyframe enable) toggle ───────────────────────────────────────

const Stopwatch: React.FC<{ on: boolean; onClick: () => void }> = ({ on, onClick }) => (
  <button
    onClick={onClick}
    className={clsx('p-0.5 rounded transition-colors', on ? 'text-indigo-400 bg-indigo-500/15' : 'text-white/25 hover:text-white/50')}
    title={on ? 'Disable keyframing (collapse to current value)' : 'Enable keyframing'}
  >
    <Clock size={11} />
  </button>
);

// ─── Keyframe nav (prev ◆ / add-remove ◆ / next ◆) ────────────────────────────

const Diamond: React.FC<{ filled: boolean; size?: number; className?: string }> = ({ filled, size = 9, className }) => (
  <svg width={size} height={size} viewBox="0 0 10 10" className={className}>
    <rect x="5" y="0.5" width="6" height="6" transform="rotate(45 5 5)" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

const KeyframeNav: React.FC<{
  visible: boolean;
  hasKf: boolean;
  onPrev: () => void;
  onToggle: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
}> = ({ visible, hasKf, onPrev, onToggle, onNext, canPrev, canNext }) => {
  if (!visible) return <div className="w-[52px]" />;
  return (
    <div className="flex items-center gap-0.5 text-white/40">
      <button onClick={onPrev} disabled={!canPrev} className="disabled:opacity-20 hover:text-indigo-300" title="Previous keyframe">
        <ChevronLeft size={11} />
      </button>
      <button onClick={onToggle} className={clsx('transition-colors', hasKf ? 'text-indigo-400' : 'text-white/35 hover:text-indigo-300')} title={hasKf ? 'Remove keyframe at playhead' : 'Add keyframe at playhead'}>
        <Diamond filled={hasKf} />
      </button>
      <button onClick={onNext} disabled={!canNext} className="disabled:opacity-20 hover:text-indigo-300" title="Next keyframe">
        <ChevronRightNav size={11} />
      </button>
    </div>
  );
};

// ─── Keyframe lane (right column) ─────────────────────────────────────────────

const KeyframeLane: React.FC<{
  frames: number[];
  duration: number;
  onMoveKeyframe: (fromFrame: number, toFrame: number) => void;
  onDeleteKeyframe: (frame: number) => void;
  onScrubPlayhead: (localFrame: number) => void;
  onSetInterp: (frame: number, kind: InterpKind) => void;
}> = ({ frames, duration, onMoveKeyframe, onDeleteKeyframe, onScrubPlayhead, onSetInterp }) => {
  const laneRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ fromFrame: number } | null>(null);
  const [menu, setMenu] = useState<{ frame: number; x: number; y: number } | null>(null);

  const pctOf = (f: number) => `${Math.max(0, Math.min(100, (f / duration) * 100))}%`;

  const frameFromX = (clientX: number) => {
    const rect = laneRef.current!.getBoundingClientRect();
    const r = (clientX - rect.left) / Math.max(1, rect.width);
    return Math.round(Math.max(0, Math.min(1, r)) * duration);
  };

  return (
    <div
      ref={laneRef}
      className="relative h-full flex-1 cursor-pointer"
      onPointerDown={(e) => {
        // Click empty lane → move playhead
        if ((e.target as HTMLElement).dataset.kf === undefined) onScrubPlayhead(frameFromX(e.clientX));
      }}
    >
      {/* baseline */}
      <div className="absolute left-0 right-0 top-1/2 h-px bg-white/[0.06]" />
      {frames.map((f) => (
        <button
          key={f}
          data-kf="1"
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-400 hover:text-indigo-200 z-10"
          style={{ left: pctOf(f) }}
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            dragRef.current = { fromFrame: f };
          }}
          onPointerMove={(e) => {
            if (!dragRef.current) return;
            const to = frameFromX(e.clientX);
            if (to !== dragRef.current.fromFrame) {
              onMoveKeyframe(dragRef.current.fromFrame, to);
              dragRef.current.fromFrame = to;
            }
          }}
          onPointerUp={(e) => { dragRef.current = null; (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); }}
          onDoubleClick={(e) => { e.stopPropagation(); onDeleteKeyframe(f); }}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ frame: f, x: e.clientX, y: e.clientY }); }}
          title="Drag to move · double-click to delete · right-click for ease"
        >
          <Diamond filled size={9} />
        </button>
      ))}

      {menu && (
        <>
          <div className="fixed inset-0 z-[150]" onPointerDown={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div className="fixed z-[151] bg-[#15152b] border border-white/10 rounded-lg shadow-2xl py-1 min-w-[140px]" style={{ left: menu.x, top: menu.y }}>
            <div className="px-2.5 py-1 text-[8px] uppercase tracking-wider text-white/30 border-b border-white/[0.06] mb-0.5">Interpolation</div>
            {(Object.keys(INTERP_LABELS) as InterpKind[]).map((k) => (
              <button
                key={k}
                onClick={() => { onSetInterp(menu.frame, k); setMenu(null); }}
                className="w-full text-left px-2.5 py-1 text-[10px] text-white/70 hover:bg-indigo-500/20 hover:text-white transition-colors"
              >
                {INTERP_LABELS[k]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ─── A single parameter row ───────────────────────────────────────────────────

const ParamRow: React.FC<{
  param: EffectParam;
  localFrame: number;
  duration: number;
  laneWidthPct: number;
  onPatch: (updater: (p: EffectParam) => EffectParam) => void;
  onScrubPlayhead: (localFrame: number) => void;
  disabled?: boolean;
}> = ({ param, localFrame, duration, laneWidthPct, onPatch, onScrubPlayhead, disabled }) => {
  const keyframeable = isKeyframeable(param);
  const kfFrames = useMemo(() => allParamKeyframeFrames(param), [param]);

  const laneFor = (which: 'keyframes' | 'keyframesX' | 'keyframesY'): KfPoint[] => {
    const anyP = param as ScalarParam & Point2DParam;
    return (anyP[which] as KfPoint[] | undefined) ?? [];
  };

  // current-frame "has keyframe?" across lanes
  const hasKfHere = keyframeable && (param as ScalarParam | Point2DParam).keyframed && (
    param.type === 'point2d'
      ? hasKeyframeAt(laneFor('keyframesX'), localFrame) || hasKeyframeAt(laneFor('keyframesY'), localFrame)
      : hasKeyframeAt(laneFor('keyframes'), localFrame)
  );

  const allFrames = useMemo(() => {
    if (param.type === 'point2d') return [...new Set([...laneFor('keyframesX'), ...laneFor('keyframesY')].map((k) => k.frame))].sort((a, b) => a - b);
    return laneFor('keyframes').map((k) => k.frame).sort((a, b) => a - b);
  }, [param]);

  const canPrev = prevKeyframeFrame(allFrames.map((f) => ({ frame: f, value: 0 })), localFrame) !== null;
  const canNext = nextKeyframeFrame(allFrames.map((f) => ({ frame: f, value: 0 })), localFrame) !== null;

  const moveKeyframe = (fromFrame: number, toFrame: number) => {
    onPatch((p) => {
      if (p.type === 'point2d') {
        const pt = p as Point2DParam;
        const moveLane = (lane: KfPoint[] | undefined): KfPoint[] => {
          const k = (lane ?? []).find((x) => Math.abs(x.frame - fromFrame) <= 0.5);
          if (!k) return lane ?? [];
          return upsertKeyframe(removeKeyframe(lane ?? [], fromFrame), toFrame, k.value, k.interp);
        };
        return { ...pt, keyframesX: moveLane(pt.keyframesX), keyframesY: moveLane(pt.keyframesY) };
      }
      const sc = p as ScalarParam;
      const k = (sc.keyframes ?? []).find((x) => Math.abs(x.frame - fromFrame) <= 0.5);
      if (!k) return sc;
      return { ...sc, keyframes: upsertKeyframe(removeKeyframe(sc.keyframes ?? [], fromFrame), toFrame, k.value, k.interp) };
    });
  };
  const deleteKeyframe = (frame: number) => {
    onPatch((p) => {
      if (p.type === 'point2d') {
        const pt = p as Point2DParam;
        return { ...pt, keyframesX: removeKeyframe(pt.keyframesX ?? [], frame), keyframesY: removeKeyframe(pt.keyframesY ?? [], frame) };
      }
      const sc = p as ScalarParam;
      return { ...sc, keyframes: removeKeyframe(sc.keyframes ?? [], frame) };
    });
  };

  // ── Value editors per type ──
  const renderValue = () => {
    if (param.type === 'bool') {
      const bp = param as BoolParam;
      return (
        <button
          onClick={() => onPatch((p) => ({ ...(p as BoolParam), value: !(p as BoolParam).value }))}
          className={clsx('w-7 h-3.5 rounded-full relative transition-colors', bp.value ? 'bg-indigo-500' : 'bg-white/15')}
        >
          <span className={clsx('absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-transform', bp.value ? 'translate-x-3.5' : 'translate-x-0.5')} />
        </button>
      );
    }
    if (param.type === 'enum') {
      const ep = param as EnumParam;
      return (
        <select
          value={ep.value}
          onChange={(e) => onPatch((p) => ({ ...(p as EnumParam), value: e.target.value }))}
          className="text-[9px] bg-[#121226] border border-white/10 rounded px-1 py-0.5 text-indigo-300 outline-none max-w-[110px]"
        >
          {ep.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (param.type === 'point2d') {
      const pt = param as Point2DParam;
      const cur = evalPoint(pt, localFrame);
      const set = (axis: 'x' | 'y', v: number) => onPatch((p) => setPointValueAtFrame(p as Point2DParam, localFrame, axis, v));
      return (
        <div className="flex items-center gap-2">
          <ScrubValue value={cur.x} onChange={(v) => set('x', v)} step={pt.step ?? 1} decimals={1} />
          <ScrubValue value={cur.y} onChange={(v) => set('y', v)} step={pt.step ?? 1} decimals={1} />
        </div>
      );
    }
    // scalar / percent / angle
    const sc = param as ScalarParam;
    const cur = evalScalar(sc, localFrame);
    return (
      <ScrubValue
        value={cur}
        onChange={(v) => onPatch((p) => setScalarValueAtFrame(p as ScalarParam, localFrame, v))}
        step={sc.step ?? 1}
        min={sc.min}
        max={sc.max}
        unit={sc.unit}
        decimals={(sc.step ?? 1) < 1 ? 2 : 1}
      />
    );
  };

  return (
    <div className={clsx('flex items-stretch border-b border-white/[0.03] hover:bg-white/[0.015] min-h-[24px]', disabled && 'opacity-40 pointer-events-none')}>
      {/* Controls cell */}
      <div className="flex items-center gap-1.5 px-2 py-1" style={{ width: `${100 - laneWidthPct}%` }}>
        {keyframeable ? (
          <Stopwatch
            on={(param as ScalarParam | Point2DParam).keyframed}
            onClick={() => onPatch((p) => toggleParamKeyframing(p, localFrame))}
          />
        ) : <div className="w-[16px]" />}
        <span className="text-[10px] text-white/55 flex-1 truncate">{param.name}</span>
        {renderValue()}
        {keyframeable && (param as ScalarParam | Point2DParam).keyframed && (
          <KeyframeNav
            visible
            hasKf={!!hasKfHere}
            canPrev={canPrev}
            canNext={canNext}
            onPrev={() => {
              const f = prevKeyframeFrame(allFrames.map((fr) => ({ frame: fr, value: 0 })), localFrame);
              if (f !== null) onScrubPlayhead(f);
            }}
            onNext={() => {
              const f = nextKeyframeFrame(allFrames.map((fr) => ({ frame: fr, value: 0 })), localFrame);
              if (f !== null) onScrubPlayhead(f);
            }}
            onToggle={() => onPatch((p) => hasKfHere ? removeKeyframeAtFrame(p, localFrame) : addKeyframeAtFrame(p, localFrame))}
          />
        )}
      </div>
      {/* Lane cell */}
      <div className="flex items-center border-l border-white/[0.04] px-1" style={{ width: `${laneWidthPct}%` }}>
        {keyframeable && (param as ScalarParam | Point2DParam).keyframed ? (
          <KeyframeLane
            frames={allFrames}
            duration={duration}
            onMoveKeyframe={moveKeyframe}
            onDeleteKeyframe={deleteKeyframe}
            onScrubPlayhead={onScrubPlayhead}
            onSetInterp={(frame, kind) => onPatch((p) => setParamKeyframeInterp(p, frame, kind))}
          />
        ) : <div className="flex-1 h-full" />}
      </div>
    </div>
  );
};

// ─── A component group (Motion / Opacity / …) ─────────────────────────────────

const ComponentGroup: React.FC<{
  comp: EffectComponent;
  localFrame: number;
  duration: number;
  laneWidthPct: number;
  seqW: number;
  seqH: number;
  onPatchComp: (updater: (c: EffectComponent) => EffectComponent) => void;
  onScrubPlayhead: (localFrame: number) => void;
  onRemove?: () => void;
}> = ({ comp, localFrame, duration, laneWidthPct, seqW, seqH, onPatchComp, onScrubPlayhead, onRemove }) => {
  const patchParam = (paramId: string, updater: (p: EffectParam) => EffectParam) =>
    onPatchComp((c) => ({ ...c, params: c.params.map((p) => p.id === paramId ? updater(p) : p) }));

  const addMask = (mode: 'ellipse' | 'rectangle' | 'free') => onPatchComp((c) => {
    const idx = (c.masks?.length ?? 0) + 1;
    const m = mode === 'ellipse' ? makeEllipseMask(seqW, seqH, idx) : mode === 'rectangle' ? makeRectangleMask(seqW, seqH, idx) : makeFreeMask(seqW, seqH, idx);
    return { ...c, masks: [...(c.masks ?? []), m] };
  });
  const patchMask = (maskId: string, updater: (m: EffectMask) => EffectMask) =>
    onPatchComp((c) => ({ ...c, masks: (c.masks ?? []).map((m) => m.id === maskId ? updater(m) : m) }));
  const removeMask = (maskId: string) =>
    onPatchComp((c) => ({ ...c, masks: (c.masks ?? []).filter((m) => m.id !== maskId) }));

  return (
    <div>
      {/* group header */}
      <div className="flex items-center border-b border-white/[0.06] bg-[#11112299]">
        <div className="flex items-center gap-1.5 px-2 py-1.5 flex-1">
          <button onClick={() => onPatchComp((c) => ({ ...c, expanded: !c.expanded }))} className="text-white/35 hover:text-white/60">
            {comp.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          {/* fx enable toggle */}
          <button
            onClick={() => onPatchComp((c) => ({ ...c, enabled: !c.enabled }))}
            className={clsx('text-[8px] font-black px-1 rounded border', comp.enabled ? 'text-indigo-300 border-indigo-500/40 bg-indigo-500/10' : 'text-white/25 border-white/10 line-through')}
            title={comp.enabled ? 'Disable effect (fx)' : 'Enable effect (fx)'}
          >
            fx
          </button>
          <span className="text-[10px] font-semibold text-white/70 flex-1">{comp.name}</span>
          {!comp.fixed && (
            <span className="text-[7px] uppercase tracking-wider text-white/20">{comp.kind}</span>
          )}
          {comp.kind === 'video' && (
            <div className="flex items-center gap-0.5 mr-0.5">
              <button onClick={() => addMask('ellipse')} className="text-white/25 hover:text-indigo-300 transition-colors" title="Add Ellipse Mask"><Circle size={10} /></button>
              <button onClick={() => addMask('rectangle')} className="text-white/25 hover:text-indigo-300 transition-colors" title="Add 4-Point Polygon Mask"><Square size={10} /></button>
              <button onClick={() => addMask('free')} className="text-white/25 hover:text-indigo-300 transition-colors" title="Add Free-Pen Mask"><PenTool size={10} /></button>
            </div>
          )}
          <button
            onClick={() => onPatchComp((c) => ({ ...c, params: c.params.map(resetParam) }))}
            className="text-white/25 hover:text-amber-300 transition-colors"
            title="Reset effect"
          >
            <RotateCcw size={11} />
          </button>
          {!comp.fixed && onRemove && (
            <button onClick={onRemove} className="text-white/25 hover:text-red-400 transition-colors" title="Remove effect">
              <X size={12} />
            </button>
          )}
        </div>
      </div>
      {comp.expanded && comp.params.map((p) => (
        <ParamRow
          key={p.id}
          param={p}
          localFrame={localFrame}
          duration={duration}
          laneWidthPct={laneWidthPct}
          onPatch={(updater) => patchParam(p.id, updater)}
          onScrubPlayhead={onScrubPlayhead}
          disabled={p.id === 'scaleWidth' && comp.params.find((x) => x.id === 'uniformScale')?.value === true}
        />
      ))}

      {comp.expanded && (comp.masks?.length ?? 0) > 0 && comp.masks!.map((m) => (
        <div key={m.id} className="border-b border-white/[0.03] bg-[#0a0a18]/40 px-2 py-1.5">
          <div className="flex items-center gap-1.5 mb-1">
            <button
              onClick={() => patchMask(m.id, (x) => ({ ...x, enabled: !x.enabled }))}
              className={clsx('w-2.5 h-2.5 rounded-sm border', m.enabled ? 'bg-indigo-500 border-indigo-400' : 'border-white/25')}
              title="Toggle mask"
            />
            <span className="text-[10px] text-white/70 flex-1">{m.name}</span>
            <span className="text-[7px] uppercase tracking-wider text-white/25">{m.mode}</span>
            <button
              onClick={() => patchMask(m.id, (x) => ({ ...x, inverted: !x.inverted }))}
              className={clsx('text-[8px] px-1 rounded border', m.inverted ? 'text-indigo-300 border-indigo-500/40' : 'text-white/30 border-white/10')}
              title="Invert mask"
            >
              inv
            </button>
            <button onClick={() => removeMask(m.id)} className="text-white/25 hover:text-red-400" title="Remove mask"><X size={11} /></button>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 pl-4">
            <div className="flex items-center justify-between"><span className="text-[8px] text-white/40 uppercase">Pos X</span><ScrubValue value={m.x} onChange={(v) => patchMask(m.id, (x) => ({ ...x, x: v }))} step={1} decimals={0} /></div>
            <div className="flex items-center justify-between"><span className="text-[8px] text-white/40 uppercase">Pos Y</span><ScrubValue value={m.y} onChange={(v) => patchMask(m.id, (x) => ({ ...x, y: v }))} step={1} decimals={0} /></div>
            <div className="flex items-center justify-between"><span className="text-[8px] text-white/40 uppercase">Feather</span><ScrubValue value={m.feather} onChange={(v) => patchMask(m.id, (x) => ({ ...x, feather: Math.max(0, v) }))} step={1} min={0} decimals={0} /></div>
            <div className="flex items-center justify-between"><span className="text-[8px] text-white/40 uppercase">Expansion</span><ScrubValue value={m.expansion} onChange={(v) => patchMask(m.id, (x) => ({ ...x, expansion: v }))} step={1} decimals={0} /></div>
            <div className="flex items-center justify-between"><span className="text-[8px] text-white/40 uppercase">Opacity</span><ScrubValue value={m.opacity} onChange={(v) => patchMask(m.id, (x) => ({ ...x, opacity: Math.max(0, Math.min(100, v)) }))} step={1} min={0} max={100} unit="%" decimals={0} /></div>
            {m.mode === 'ellipse' && (
              <>
                <div className="flex items-center justify-between"><span className="text-[8px] text-white/40 uppercase">Width</span><ScrubValue value={m.width} onChange={(v) => patchMask(m.id, (x) => ({ ...x, width: Math.max(1, v) }))} step={1} min={1} decimals={0} /></div>
                <div className="flex items-center justify-between"><span className="text-[8px] text-white/40 uppercase">Height</span><ScrubValue value={m.height} onChange={(v) => patchMask(m.id, (x) => ({ ...x, height: Math.max(1, v) }))} step={1} min={1} decimals={0} /></div>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Top time ruler over the lane column ──────────────────────────────────────

const LaneRuler: React.FC<{
  duration: number;
  localFrame: number;
  fps: number;
  laneWidthPct: number;
  onScrubPlayhead: (localFrame: number) => void;
}> = ({ duration, localFrame, fps, laneWidthPct, onScrubPlayhead }) => {
  const ref = useRef<HTMLDivElement>(null);
  const frameFromX = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    const r = (clientX - rect.left) / Math.max(1, rect.width);
    return Math.round(Math.max(0, Math.min(1, r)) * duration);
  };
  const ticks = 5;
  return (
    <div className="flex items-stretch border-b border-white/[0.06] bg-[#0c0c1a] h-6 flex-shrink-0">
      <div className="flex items-center px-2 text-[8px] uppercase tracking-wider text-white/30" style={{ width: `${100 - laneWidthPct}%` }}>
        <Sparkles size={9} className="text-indigo-400 mr-1" /> Effect Controls
      </div>
      <div
        ref={ref}
        className="relative border-l border-white/[0.06] cursor-pointer"
        style={{ width: `${laneWidthPct}%` }}
        onPointerDown={(e) => onScrubPlayhead(frameFromX(e.clientX))}
        onPointerMove={(e) => { if (e.buttons === 1) onScrubPlayhead(frameFromX(e.clientX)); }}
      >
        {Array.from({ length: ticks + 1 }).map((_, i) => {
          const f = (duration / ticks) * i;
          return (
            <div key={i} className="absolute top-0 bottom-0 flex flex-col items-center" style={{ left: `${(i / ticks) * 100}%`, transform: 'translateX(-50%)' }}>
              <div className="w-px h-1.5 bg-white/15" />
              <span className="text-[7px] text-white/25 font-mono mt-0.5">{formatTimecode(Math.round(f), fps).slice(3)}</span>
            </div>
          );
        })}
        {/* playhead */}
        <div className="absolute top-0 bottom-0 w-px bg-indigo-400 z-20 pointer-events-none" style={{ left: `${Math.max(0, Math.min(100, (localFrame / duration) * 100))}%` }}>
          <div className="absolute -top-0 -translate-x-1/2 w-1.5 h-1.5 bg-indigo-400 rotate-45" />
        </div>
      </div>
    </div>
  );
};

// ─── Panel ────────────────────────────────────────────────────────────────────

const LANE_WIDTH_PCT = 42;

export const EffectControlsPanel: React.FC<Props> = ({ selectedClipId, currentFrame, onJumpToFrame }) => {
  const clips = useClipStore((s) => s.clips);
  const updateClip = useClipStore((s) => s.updateClip);
  const settings = useProjectStore((s) => s.settings);
  const width = settings.resolution?.width ?? 1920;
  const height = settings.resolution?.height ?? 1080;
  const fps = settings.fps ?? 30;

  const selectedClipIds = useClipStore((s) => s.selectedClipIds);
  const { copyAttributes, attributeClip, addPreset } = usePremiereFxStore();
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');

  const clip = selectedClipId ? clips.find((c) => c.id === selectedClipId) : null;

  // Migrate-on-select: if the selected clip has no effectControls yet, derive one
  // from its legacy fields and persist it so this panel + preview are consistent.
  useEffect(() => {
    if (clip && !clip.effectControls) {
      const ec = migrateClipToEffectControls(clip as any, width, height);
      updateClip(clip.id, { effectControls: ec });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip?.id]);

  const ec: EffectControlsState | null = useMemo(() => {
    if (!clip) return null;
    return clip.effectControls ?? migrateClipToEffectControls(clip as any, width, height);
  }, [clip, width, height]);

  const duration = clip ? Math.max(1, clip.endFrame - clip.startFrame) : 1;
  const localFrame = clip ? Math.max(0, Math.min(duration, currentFrame - clip.startFrame)) : 0;

  const commit = useCallback((next: EffectControlsState) => {
    if (!clip) return;
    const legacy = syncEffectControlsToLegacy(next, width, height);
    const parametricEffects = effectControlsToParametric(next);
    updateClip(clip.id, { effectControls: next, parametricEffects, ...legacy } as any);
  }, [clip, width, height, updateClip]);

  const patchComp = useCallback((kind: 'video' | 'audio', compId: string, updater: (c: EffectComponent) => EffectComponent) => {
    if (!ec) return;
    const apply = (list: EffectComponent[]) => list.map((c) => c.id === compId ? updater(c) : c);
    commit({ ...ec, [kind]: apply(ec[kind]) });
  }, [ec, commit]);

  const scrub = useCallback((lf: number) => {
    if (!clip) return;
    onJumpToFrame(clip.startFrame + Math.max(0, Math.min(duration, lf)));
  }, [clip, duration, onJumpToFrame]);

  if (!clip) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center text-white/25 px-6">
        <Sparkles size={26} className="mb-2 text-indigo-400/60" />
        <p className="text-[11px] font-semibold text-white/40">Effect Controls</p>
        <p className="text-[9px] mt-1 max-w-[200px]">Select a clip in the timeline to edit its Motion, Opacity, Time Remapping and applied effects — with keyframes.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0b0b16] overflow-hidden">
      {/* Clip header */}
      <div className="flex items-center justify-between px-3 h-6 bg-[#0e0e1c] border-b border-white/[0.06] flex-shrink-0 relative">
        <span className="text-[9px] font-mono text-white/45 truncate max-w-[120px]">{clip.filename}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setPickerOpen((o) => !o); setPickerQuery(''); }}
            className="flex items-center gap-0.5 text-[9px] text-indigo-300/80 hover:text-indigo-200"
            title="Add an effect to this clip"
          >
            <Plus size={11} /> Effect
          </button>
          <span className="text-[9px] font-mono text-indigo-300/70">{formatTimecode(localFrame, fps)}</span>
        </div>
        {pickerOpen && ec && (
          <>
            <div className="fixed inset-0 z-[140]" onClick={() => setPickerOpen(false)} />
            <div className="absolute right-2 top-6 z-[141] w-[220px] bg-[#15152b] border border-white/10 rounded-lg shadow-2xl overflow-hidden">
              <input
                autoFocus
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="Search effects…"
                className="w-full px-2.5 py-1.5 bg-[#0d0d1c] text-[10px] text-white/80 outline-none border-b border-white/[0.06]"
              />
              <div className="max-h-[260px] overflow-y-auto py-1">
                {EFFECT_REGISTRY.filter((e) => e.name.toLowerCase().includes(pickerQuery.toLowerCase()))
                  .map((e) => {
                    const already = ec.video.some((c) => c.matchName === `MA.${e.id}`);
                    return (
                      <button
                        key={e.id}
                        disabled={already}
                        onClick={() => {
                          const comp = componentFromEffectId(e.id);
                          if (comp) commit(appendEffectComponent(ec, comp));
                          setPickerOpen(false);
                        }}
                        className="w-full flex items-center justify-between gap-2 px-2.5 py-1 text-left text-[10px] text-white/70 hover:bg-indigo-500/20 hover:text-white disabled:opacity-30 transition-colors"
                      >
                        <span className="truncate">{e.name}</span>
                        <span className="text-[7px] uppercase text-white/25">{e.category}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          </>
        )}
      </div>

      <LaneRuler duration={duration} localFrame={localFrame} fps={fps} laneWidthPct={LANE_WIDTH_PCT} onScrubPlayhead={scrub} />

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* Video components */}
        <div className="px-2 pt-1.5 pb-0.5 text-[8px] uppercase tracking-[0.15em] text-white/25 font-bold flex items-center gap-1">
          <Sparkles size={9} className="text-indigo-400" /> Video Effects
        </div>
        {ec?.video.map((comp) => (
          <ComponentGroup
            key={comp.id}
            comp={comp}
            localFrame={localFrame}
            duration={duration}
            laneWidthPct={LANE_WIDTH_PCT}
            seqW={width}
            seqH={height}
            onPatchComp={(u) => patchComp('video', comp.id, u)}
            onScrubPlayhead={scrub}
            onRemove={!comp.fixed && ec ? () => commit(removeComponent(ec, comp.id)) : undefined}
          />
        ))}

        {/* Audio components */}
        <div className="px-2 pt-2.5 pb-0.5 text-[8px] uppercase tracking-[0.15em] text-white/25 font-bold flex items-center gap-1">
          <Zap size={9} className="text-emerald-400" /> Audio Effects
        </div>
        {ec?.audio.map((comp) => (
          <ComponentGroup
            key={comp.id}
            comp={comp}
            localFrame={localFrame}
            duration={duration}
            laneWidthPct={LANE_WIDTH_PCT}
            seqW={width}
            seqH={height}
            onPatchComp={(u) => patchComp('audio', comp.id, u)}
            onScrubPlayhead={scrub}
          />
        ))}
        <div className="h-8" />
      </div>

      {/* Action footer: Copy / Paste Attributes, Save Preset */}
      <div className="flex items-center gap-1 px-2 h-7 bg-[#0e0e1c] border-t border-white/[0.06] flex-shrink-0">
        <button
          onClick={() => ec && copyAttributes(ec, clip.filename)}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors"
          title="Copy this clip's attributes"
        >
          <Copy size={10} /> Copy
        </button>
        <button
          onClick={() => setPasteOpen(true)}
          disabled={!attributeClip}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-30"
          title="Paste Attributes (Ctrl+Alt+V)"
        >
          <ClipboardPaste size={10} /> Paste Attrs
        </button>
        <div className="flex-1" />
        <button
          onClick={() => {
            if (!ec) return;
            const name = window.prompt('Preset name', `${clip.filename.replace(/\.[^.]+$/, '')} preset`);
            if (!name) return;
            const userFx = ec.video.filter((c) => !c.fixed);
            const comps = userFx.length > 0 ? userFx : ec.video.filter((c) => c.matchName.includes('Motion') || c.matchName.includes('Opacity'));
            addPreset(name, comps);
          }}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] text-indigo-300 hover:text-indigo-200 hover:bg-indigo-500/10 transition-colors"
          title="Save effects as a preset"
        >
          <Save size={10} /> Save Preset
        </button>
      </div>

      {pasteOpen && (
        <PasteAttributesModal
          targetClipIds={selectedClipIds.length > 0 ? selectedClipIds : [clip.id]}
          onClose={() => setPasteOpen(false)}
        />
      )}
    </div>
  );
};

export default EffectControlsPanel;
