// ══════════════════════════════════════════════════════════════════════════════
// effectControls.ts — Premiere-aligned effect + keyframe data model.
//
// This module restructures clip effects to natively mirror Adobe Premiere Pro's
// Effect Controls model, so edits round-trip cleanly to/from Premiere:
//
//   Clip
//    └─ EffectControlsState
//        ├─ video: EffectComponent[]   (Motion, Opacity, Time Remapping, …user FX)
//        └─ audio: EffectComponent[]   (Volume, Channel Volume, Panner, …user FX)
//
//   EffectComponent  ≈ Premiere "effect" (a row in Effect Controls)
//   EffectParam      ≈ a property (Position, Scale, Rotation, …) — each keyframeable
//
// Every numeric property is driven by the shared keyframe substrate (KfPoint /
// kfValue from ../keyframes), exactly like Premiere's per-property keyframe lanes.
// `matchName` carries Premiere's internal effect identifier so an export/import
// mapping layer can serialise these to .prproj / FCP-XML without guessing.
// ══════════════════════════════════════════════════════════════════════════════

import type { KfPoint, Interp } from '../keyframes';
import { kfValue, EASING } from '../keyframes';

// ─── Parameter model ──────────────────────────────────────────────────────────

export type ParamType =
  | 'scalar'   // a plain number
  | 'percent'  // number shown/edited as a percentage
  | 'angle'    // degrees (rotation), supports >360 for multi-turn
  | 'point2d'  // {x,y} — two independent keyframe lanes (Position, Anchor Point)
  | 'bool'     // checkbox (e.g. Uniform Scale) — not keyframeable
  | 'enum'     // dropdown (e.g. Blend Mode) — not keyframeable
  | 'color';   // hex color — not keyframeable in v1

export interface Point2D { x: number; y: number }

interface ParamCommon {
  /** Stable key within its component, e.g. 'position'. Used for round-trip + lookup. */
  id: string;
  /** Display label, e.g. 'Position'. */
  name: string;
  type: ParamType;
  /** Whether the stopwatch (keyframing) is enabled for this property. */
  keyframed: boolean;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  /** The value this property resets to (Premiere's reset button / fixed default). */
  defaultValue?: number | Point2D | boolean | string;
}

export interface ScalarParam extends ParamCommon {
  type: 'scalar' | 'percent' | 'angle';
  /** Static value used when keyframing is OFF (and as the editing baseline). */
  value: number;
  /** Keyframe lane used when keyframing is ON. */
  keyframes?: KfPoint[];
}

export interface Point2DParam extends ParamCommon {
  type: 'point2d';
  value: Point2D;
  /** Independent X/Y keyframe lanes (Premiere keys X and Y together but stores separately). */
  keyframesX?: KfPoint[];
  keyframesY?: KfPoint[];
}

export interface BoolParam extends ParamCommon {
  type: 'bool';
  value: boolean;
}

export interface EnumParam extends ParamCommon {
  type: 'enum';
  value: string;
  options: string[];
}

export interface ColorParam extends ParamCommon {
  type: 'color';
  value: string;
}

export type EffectParam =
  | ScalarParam
  | Point2DParam
  | BoolParam
  | EnumParam
  | ColorParam;

// ─── Component (effect) model ─────────────────────────────────────────────────

/** A mask attached to an effect (Premiere ▸ ellipse / 4-point / free pen). */
export interface EffectMask {
  id: string;
  name: string;                         // 'Mask (1)'
  mode: 'ellipse' | 'rectangle' | 'free';
  /** Center in sequence pixels (ellipse/rectangle). */
  x: number;
  y: number;
  width: number;                        // px (ellipse/rectangle bounding box)
  height: number;                       // px
  rotation: number;                     // deg
  feather: number;                      // px — soft edge
  expansion: number;                    // px — +expand / −contract
  opacity: number;                      // 0..100
  inverted: boolean;
  /** Polygon vertices in sequence pixels (free pen / custom rectangle). */
  points?: Point2D[];
  enabled: boolean;
}

export interface EffectComponent {
  /** Unique instance id. */
  id: string;
  /** Premiere internal identifier (e.g. 'AE.ADBE Motion') — drives round-trip. */
  matchName: string;
  /** Display name shown in the Effect Controls header (e.g. 'Motion'). */
  name: string;
  kind: 'video' | 'audio';
  /** Fixed effects (Motion/Opacity/Time Remapping/Volume/Panner) cannot be removed. */
  fixed: boolean;
  /** The fx toggle — when false the effect is bypassed. */
  enabled: boolean;
  /** UI expand/collapse state. */
  expanded: boolean;
  params: EffectParam[];
  /** Masks limiting where this effect applies. */
  masks?: EffectMask[];
}

export interface EffectControlsState {
  video: EffectComponent[];
  audio: EffectComponent[];
  /** Schema version for future migrations. */
  version: number;
}

export const EFFECT_CONTROLS_VERSION = 1;

// Premiere fixed-effect match names (stable identifiers used by Premiere/AE).
export const MATCH = {
  MOTION: 'AE.ADBE Motion',
  OPACITY: 'AE.ADBE Opacity',
  TIME_REMAP: 'AE.ADBE Time Remapping',
  VOLUME: 'AE.ADBE Volume',
  CHANNEL_VOLUME: 'AE.ADBE Channel Volume',
  PANNER: 'AE.ADBE Pan',
} as const;

/** Premiere's Opacity → Blend Mode options. */
export const BLEND_MODES = [
  'Normal', 'Dissolve', 'Darken', 'Multiply', 'Color Burn', 'Linear Burn',
  'Lighten', 'Screen', 'Color Dodge', 'Linear Dodge (Add)', 'Overlay',
  'Soft Light', 'Hard Light', 'Vivid Light', 'Linear Light', 'Pin Light',
  'Hard Mix', 'Difference', 'Exclusion', 'Subtract', 'Divide',
  'Hue', 'Saturation', 'Color', 'Luminosity',
] as const;

let _id = 0;
const uid = () => {
  try { return crypto.randomUUID(); } catch { return `ec-${Date.now()}-${_id++}`; }
};

// ─── Fixed-effect factories ───────────────────────────────────────────────────

/** Build the Motion fixed effect for a given sequence resolution. */
export function makeMotion(width: number, height: number): EffectComponent {
  const cx = width / 2;
  const cy = height / 2;
  return {
    id: uid(),
    matchName: MATCH.MOTION,
    name: 'Motion',
    kind: 'video',
    fixed: true,
    enabled: true,
    expanded: true,
    params: [
      { id: 'position', name: 'Position', type: 'point2d', keyframed: false, value: { x: cx, y: cy }, defaultValue: { x: cx, y: cy }, step: 1 },
      { id: 'scale', name: 'Scale', type: 'percent', keyframed: false, value: 100, defaultValue: 100, min: 0, max: 1000, step: 1, unit: '%' },
      { id: 'scaleWidth', name: 'Scale Width', type: 'percent', keyframed: false, value: 100, defaultValue: 100, min: 0, max: 1000, step: 1, unit: '%' },
      { id: 'uniformScale', name: 'Uniform Scale', type: 'bool', keyframed: false, value: true, defaultValue: true },
      { id: 'rotation', name: 'Rotation', type: 'angle', keyframed: false, value: 0, defaultValue: 0, step: 1, unit: '°' },
      { id: 'anchorPoint', name: 'Anchor Point', type: 'point2d', keyframed: false, value: { x: cx, y: cy }, defaultValue: { x: cx, y: cy }, step: 1 },
      { id: 'antiFlicker', name: 'Anti-flicker Filter', type: 'scalar', keyframed: false, value: 0, defaultValue: 0, min: 0, max: 1, step: 0.01 },
      { id: 'cropLeft', name: 'Crop Left', type: 'percent', keyframed: false, value: 0, defaultValue: 0, min: 0, max: 100, step: 0.1, unit: '%' },
      { id: 'cropTop', name: 'Crop Top', type: 'percent', keyframed: false, value: 0, defaultValue: 0, min: 0, max: 100, step: 0.1, unit: '%' },
      { id: 'cropRight', name: 'Crop Right', type: 'percent', keyframed: false, value: 0, defaultValue: 0, min: 0, max: 100, step: 0.1, unit: '%' },
      { id: 'cropBottom', name: 'Crop Bottom', type: 'percent', keyframed: false, value: 0, defaultValue: 0, min: 0, max: 100, step: 0.1, unit: '%' },
    ],
  };
}

export function makeOpacity(): EffectComponent {
  return {
    id: uid(),
    matchName: MATCH.OPACITY,
    name: 'Opacity',
    kind: 'video',
    fixed: true,
    enabled: true,
    expanded: true,
    params: [
      { id: 'opacity', name: 'Opacity', type: 'percent', keyframed: false, value: 100, defaultValue: 100, min: 0, max: 100, step: 1, unit: '%' },
      { id: 'blendMode', name: 'Blend Mode', type: 'enum', keyframed: false, value: 'Normal', defaultValue: 'Normal', options: [...BLEND_MODES] },
    ],
  };
}

export function makeTimeRemapping(): EffectComponent {
  return {
    id: uid(),
    matchName: MATCH.TIME_REMAP,
    name: 'Time Remapping',
    kind: 'video',
    fixed: true,
    enabled: true,
    expanded: false,
    params: [
      { id: 'speed', name: 'Speed', type: 'percent', keyframed: false, value: 100, defaultValue: 100, min: 0, max: 1000, step: 1, unit: '%' },
    ],
  };
}

export function makeVolume(): EffectComponent {
  return {
    id: uid(),
    matchName: MATCH.VOLUME,
    name: 'Volume',
    kind: 'audio',
    fixed: true,
    enabled: true,
    expanded: true,
    params: [
      { id: 'mute', name: 'Mute', type: 'bool', keyframed: false, value: false, defaultValue: false },
      { id: 'level', name: 'Level', type: 'scalar', keyframed: false, value: 0, defaultValue: 0, min: -60, max: 15, step: 0.1, unit: 'dB' },
    ],
  };
}

export function makeChannelVolume(): EffectComponent {
  return {
    id: uid(),
    matchName: MATCH.CHANNEL_VOLUME,
    name: 'Channel Volume',
    kind: 'audio',
    fixed: true,
    enabled: true,
    expanded: false,
    params: [
      { id: 'left', name: 'Left', type: 'scalar', keyframed: false, value: 0, defaultValue: 0, min: -60, max: 15, step: 0.1, unit: 'dB' },
      { id: 'right', name: 'Right', type: 'scalar', keyframed: false, value: 0, defaultValue: 0, min: -60, max: 15, step: 0.1, unit: 'dB' },
    ],
  };
}

export function makePanner(): EffectComponent {
  return {
    id: uid(),
    matchName: MATCH.PANNER,
    name: 'Panner',
    kind: 'audio',
    fixed: true,
    enabled: true,
    expanded: false,
    params: [
      { id: 'balance', name: 'Balance', type: 'scalar', keyframed: false, value: 0, defaultValue: 0, min: -100, max: 100, step: 1 },
    ],
  };
}

/** Default Effect Controls state (all fixed effects, no user effects). */
export function createDefaultEffectControls(width = 1920, height = 1080): EffectControlsState {
  return {
    video: [makeMotion(width, height), makeOpacity(), makeTimeRemapping()],
    audio: [makeVolume(), makeChannelVolume(), makePanner()],
    version: EFFECT_CONTROLS_VERSION,
  };
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

/** Evaluate a scalar param at a clip-local frame. */
export function evalScalar(p: ScalarParam, localFrame: number): number {
  if (p.keyframed && p.keyframes && p.keyframes.length > 0) return kfValue(p.keyframes, localFrame);
  return p.value;
}

/** Evaluate a point2d param at a clip-local frame. */
export function evalPoint(p: Point2DParam, localFrame: number): Point2D {
  const x = p.keyframed && p.keyframesX && p.keyframesX.length > 0 ? kfValue(p.keyframesX, localFrame) : p.value.x;
  const y = p.keyframed && p.keyframesY && p.keyframesY.length > 0 ? kfValue(p.keyframesY, localFrame) : p.value.y;
  return { x, y };
}

export interface ResolvedMotion {
  position: Point2D;
  scale: number;       // percent
  scaleWidth: number;  // percent (== scale when uniform)
  rotation: number;    // degrees
  anchor: Point2D;
  opacity: number;     // 0..100
  blendMode: string;
  /** Time Remapping speed percent (100 = realtime). */
  speed: number;
  /** Whether keyframes exist on any motion/opacity property (for preview hinting). */
  animated: boolean;
}

function findParam(c: EffectComponent | undefined, id: string): EffectParam | undefined {
  return c?.params.find((p) => p.id === id);
}

/** Resolve the full visual transform for a clip at a clip-local frame. */
export function resolveMotion(
  state: EffectControlsState | undefined,
  localFrame: number,
  width = 1920,
  height = 1080,
): ResolvedMotion {
  const cx = width / 2, cy = height / 2;
  const fallback: ResolvedMotion = {
    position: { x: cx, y: cy }, scale: 100, scaleWidth: 100, rotation: 0,
    anchor: { x: cx, y: cy }, opacity: 100, blendMode: 'Normal', speed: 100, animated: false,
  };
  if (!state) return fallback;

  const motion = state.video.find((c) => c.matchName === MATCH.MOTION);
  const opacityC = state.video.find((c) => c.matchName === MATCH.OPACITY);
  const timeC = state.video.find((c) => c.matchName === MATCH.TIME_REMAP);

  const posP = findParam(motion, 'position') as Point2DParam | undefined;
  const scaleP = findParam(motion, 'scale') as ScalarParam | undefined;
  const scaleWP = findParam(motion, 'scaleWidth') as ScalarParam | undefined;
  const uniformP = findParam(motion, 'uniformScale') as BoolParam | undefined;
  const rotP = findParam(motion, 'rotation') as ScalarParam | undefined;
  const anchorP = findParam(motion, 'anchorPoint') as Point2DParam | undefined;
  const opacityP = findParam(opacityC, 'opacity') as ScalarParam | undefined;
  const blendP = findParam(opacityC, 'blendMode') as EnumParam | undefined;
  const speedP = findParam(timeC, 'speed') as ScalarParam | undefined;

  const motionOn = motion?.enabled ?? true;
  const opacityOn = opacityC?.enabled ?? true;

  const scale = motionOn && scaleP ? evalScalar(scaleP, localFrame) : 100;
  const uniform = uniformP ? Boolean(uniformP.value) : true;

  const anyKf = [posP?.keyframed, scaleP?.keyframed, rotP?.keyframed, anchorP?.keyframed, opacityP?.keyframed]
    .some(Boolean);

  return {
    position: motionOn && posP ? evalPoint(posP, localFrame) : { x: cx, y: cy },
    scale,
    scaleWidth: !motionOn ? 100 : uniform ? scale : (scaleWP ? evalScalar(scaleWP, localFrame) : scale),
    rotation: motionOn && rotP ? evalScalar(rotP, localFrame) : 0,
    anchor: motionOn && anchorP ? evalPoint(anchorP, localFrame) : { x: cx, y: cy },
    opacity: opacityOn && opacityP ? evalScalar(opacityP, localFrame) : 100,
    blendMode: blendP ? blendP.value : 'Normal',
    speed: speedP ? evalScalar(speedP, localFrame) : 100,
    animated: anyKf,
  };
}

/**
 * Build a CSS transform + style for the program-monitor preview from a resolved
 * motion. Position/anchor are in sequence pixels; we convert to the element's
 * percentage space so it renders correctly inside the aspect-ratio container.
 */
export function motionToCssStyle(m: ResolvedMotion, width: number, height: number): {
  transform: string;
  transformOrigin: string;
  opacity: number;
} {
  const cx = width / 2, cy = height / 2;
  // Translate by the position offset from centre, expressed as a % of the frame.
  const tx = ((m.position.x - cx) / width) * 100;
  const ty = ((m.position.y - cy) / height) * 100;
  // Anchor point as a transform-origin percentage.
  const ox = (m.anchor.x / width) * 100;
  const oy = (m.anchor.y / height) * 100;
  const sx = m.scaleWidth / 100;
  const sy = m.scale / 100;
  return {
    transform: `translate(${tx.toFixed(3)}%, ${ty.toFixed(3)}%) rotate(${m.rotation.toFixed(3)}deg) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`,
    transformOrigin: `${ox.toFixed(3)}% ${oy.toFixed(3)}%`,
    opacity: Math.max(0, Math.min(1, m.opacity / 100)),
  };
}

// ─── Migration from legacy clip fields ────────────────────────────────────────

/** The subset of legacy Clip fields this migration reads. */
export interface LegacyMotionFields {
  zoomLevel?: number;
  zoomStart?: number;
  zoomEnd?: number;
  compositeScale?: number;
  compositeX?: number;       // percent, 50 = centre
  compositeY?: number;       // percent, 50 = centre
  compositeOpacity?: number; // 0..100
  rotation?: 0 | 90 | 180 | 270;
  speed?: number;            // 1.0 = realtime
  blendMode?: string;
  opacityKeyframes?: KfPoint[];   // 0..1
  scaleKeyframes?: KfPoint[];     // percent
  positionKeyframes?: { x: KfPoint[]; y: KfPoint[] };
}

/**
 * Derive a Premiere-aligned EffectControlsState from a clip's legacy fields so
 * existing edits appear correctly in the new Effect Controls panel (and preview).
 * Pure: callers persist the result onto the clip.
 */
export function migrateClipToEffectControls(
  clip: LegacyMotionFields,
  width = 1920,
  height = 1080,
): EffectControlsState {
  const state = createDefaultEffectControls(width, height);
  const motion = state.video.find((c) => c.matchName === MATCH.MOTION)!;
  const opacityC = state.video.find((c) => c.matchName === MATCH.OPACITY)!;
  const timeC = state.video.find((c) => c.matchName === MATCH.TIME_REMAP)!;

  const setScalar = (c: EffectComponent, id: string, v: number) => {
    const p = c.params.find((x) => x.id === id) as ScalarParam | undefined;
    if (p) p.value = v;
  };
  const setPoint = (c: EffectComponent, id: string, v: Point2D) => {
    const p = c.params.find((x) => x.id === id) as Point2DParam | undefined;
    if (p) p.value = v;
  };

  // Scale ← zoomLevel / compositeScale
  const baseScale = clip.zoomLevel ?? clip.compositeScale ?? 100;
  setScalar(motion, 'scale', baseScale);

  // Position ← composite X/Y percentage (50 = centre) → sequence pixels
  if (clip.compositeX !== undefined || clip.compositeY !== undefined) {
    const px = ((clip.compositeX ?? 50) / 100) * width;
    const py = ((clip.compositeY ?? 50) / 100) * height;
    setPoint(motion, 'position', { x: px, y: py });
  }

  // Rotation ← persistent rotation
  if (clip.rotation) setScalar(motion, 'rotation', clip.rotation);

  // Opacity ← compositeOpacity
  if (clip.compositeOpacity !== undefined) setScalar(opacityC, 'opacity', clip.compositeOpacity);

  // Blend mode ← legacy blendMode (best-effort label match)
  if (clip.blendMode) {
    const bp = opacityC.params.find((x) => x.id === 'blendMode') as EnumParam | undefined;
    if (bp) {
      const match = BLEND_MODES.find((m) => m.toLowerCase().startsWith(clip.blendMode!.toLowerCase()));
      bp.value = match ?? 'Normal';
    }
  }

  // Speed ← clip.speed (1.0 → 100%)
  if (clip.speed !== undefined) setScalar(timeC, 'speed', Math.round(clip.speed * 100));

  // Keyframe lanes ← legacy keyframe arrays
  const scaleP = motion.params.find((x) => x.id === 'scale') as ScalarParam;
  if (clip.scaleKeyframes && clip.scaleKeyframes.length > 0) {
    scaleP.keyframed = true;
    scaleP.keyframes = clip.scaleKeyframes.map((k) => ({ ...k }));
  } else if (clip.zoomStart !== undefined && clip.zoomEnd !== undefined) {
    scaleP.keyframed = true;
    scaleP.keyframes = [
      { frame: 0, value: clip.zoomStart, interp: 'linear' as Interp },
      { frame: 1, value: clip.zoomEnd, interp: 'linear' as Interp },
    ];
  }

  const posP = motion.params.find((x) => x.id === 'position') as Point2DParam;
  if (clip.positionKeyframes && (clip.positionKeyframes.x.length > 0 || clip.positionKeyframes.y.length > 0)) {
    posP.keyframed = true;
    // legacy position keyframes are in frame % → convert to pixels
    posP.keyframesX = clip.positionKeyframes.x.map((k) => ({ ...k, value: (k.value / 100) * width }));
    posP.keyframesY = clip.positionKeyframes.y.map((k) => ({ ...k, value: (k.value / 100) * height }));
  }

  const opacityP = opacityC.params.find((x) => x.id === 'opacity') as ScalarParam;
  if (clip.opacityKeyframes && clip.opacityKeyframes.length > 0) {
    opacityP.keyframed = true;
    // legacy opacity keyframes are 0..1 → percent
    opacityP.keyframes = clip.opacityKeyframes.map((k) => ({ ...k, value: k.value * 100 }));
  }

  return state;
}

/**
 * Sync the legacy clip fields the rest of the engine (playback + export filters)
 * still reads, from a (static) Effect Controls state. This keeps export working
 * while the renderer is migrated to read EffectControlsState directly in a later
 * phase. Returns a partial of legacy fields to merge onto the clip.
 */
export function syncEffectControlsToLegacy(
  state: EffectControlsState,
  width = 1920,
  height = 1080,
): LegacyMotionFields {
  const m = resolveMotion(state, 0, width, height);
  const out: LegacyMotionFields = {
    zoomLevel: m.scale,
    compositeScale: m.scale,
    compositeX: (m.position.x / width) * 100,
    compositeY: (m.position.y / height) * 100,
    compositeOpacity: m.opacity,
    speed: m.speed / 100,
  };
  // Persistent 90° rotation buckets only (legacy field is quantised).
  const r = ((Math.round(m.rotation) % 360) + 360) % 360;
  if (r === 0 || r === 90 || r === 180 || r === 270) out.rotation = r as 0 | 90 | 180 | 270;
  return out;
}

// ─── Keyframe editing helpers (used by the Effect Controls panel) ─────────────
//
// All operate on a single lane (KfPoint[]) and are pure-ish (return a new lane).
// The panel maps these over the param's lane(s) and writes the result back.

const EPS = 0.0001;

/** Insert or replace a keyframe at `frame` (sorted, dedup on frame). */
export function upsertKeyframe(lane: KfPoint[], frame: number, value: number, interp: Interp = 'linear'): KfPoint[] {
  const f = Math.round(frame);
  const next = lane.filter((k) => Math.abs(k.frame - f) > EPS);
  next.push({ frame: f, value, interp });
  return next.sort((a, b) => a.frame - b.frame);
}

/** Remove the keyframe at (or nearest within 0.5 frame of) `frame`. */
export function removeKeyframe(lane: KfPoint[], frame: number): KfPoint[] {
  return lane.filter((k) => Math.abs(k.frame - frame) > 0.5);
}

export function hasKeyframeAt(lane: KfPoint[] | undefined, frame: number): boolean {
  return !!lane?.some((k) => Math.abs(k.frame - frame) <= 0.5);
}

export function nextKeyframeFrame(lane: KfPoint[] | undefined, frame: number): number | null {
  const after = (lane ?? []).map((k) => k.frame).filter((f) => f > frame + 0.5).sort((a, b) => a - b);
  return after.length ? after[0] : null;
}

export function prevKeyframeFrame(lane: KfPoint[] | undefined, frame: number): number | null {
  const before = (lane ?? []).map((k) => k.frame).filter((f) => f < frame - 0.5).sort((a, b) => b - a);
  return before.length ? before[0] : null;
}

/** Lanes a param exposes for keyframing (scalar → 1, point2d → 2). */
export function paramLanes(p: EffectParam): Array<'keyframes' | 'keyframesX' | 'keyframesY'> {
  return p.type === 'point2d' ? ['keyframesX', 'keyframesY'] : p.type === 'scalar' || p.type === 'percent' || p.type === 'angle' ? ['keyframes'] : [];
}

/** True if the param is keyframeable at all. */
export function isKeyframeable(p: EffectParam): p is ScalarParam | Point2DParam {
  return p.type === 'scalar' || p.type === 'percent' || p.type === 'angle' || p.type === 'point2d';
}

/**
 * Toggle the stopwatch on a param. Turning ON seeds a keyframe at `localFrame`
 * with the current value(s); turning OFF bakes the value-at-frame into the
 * static value and clears the lanes (Premiere collapses to the current value).
 */
export function toggleParamKeyframing(p: EffectParam, localFrame: number): EffectParam {
  if (!isKeyframeable(p)) return p;
  if (p.type === 'point2d') {
    const pt = p as Point2DParam;
    if (!pt.keyframed) {
      return { ...pt, keyframed: true, keyframesX: [{ frame: Math.round(localFrame), value: pt.value.x, interp: 'linear' }], keyframesY: [{ frame: Math.round(localFrame), value: pt.value.y, interp: 'linear' }] };
    }
    const baked = evalPoint(pt, localFrame);
    return { ...pt, keyframed: false, keyframesX: [], keyframesY: [], value: baked };
  }
  const sc = p as ScalarParam;
  if (!sc.keyframed) {
    return { ...sc, keyframed: true, keyframes: [{ frame: Math.round(localFrame), value: sc.value, interp: 'linear' }] };
  }
  const baked = evalScalar(sc, localFrame);
  return { ...sc, keyframed: false, keyframes: [], value: baked };
}

/**
 * Set a scalar param's value at a frame. If keyframing is on, upserts a keyframe;
 * otherwise sets the static value. Returns a new param.
 */
export function setScalarValueAtFrame(p: ScalarParam, localFrame: number, value: number): ScalarParam {
  if (p.keyframed) return { ...p, keyframes: upsertKeyframe(p.keyframes ?? [], localFrame, value) };
  return { ...p, value };
}

/** Set one axis of a point2d param at a frame. */
export function setPointValueAtFrame(p: Point2DParam, localFrame: number, axis: 'x' | 'y', value: number): Point2DParam {
  if (p.keyframed) {
    const laneKey = axis === 'x' ? 'keyframesX' : 'keyframesY';
    return { ...p, [laneKey]: upsertKeyframe((p[laneKey] ?? []) as KfPoint[], localFrame, value) } as Point2DParam;
  }
  return { ...p, value: { ...p.value, [axis]: value } };
}

/** Add a keyframe at the current frame for a keyframed param (snapshot of current value). */
export function addKeyframeAtFrame(p: EffectParam, localFrame: number): EffectParam {
  if (p.type === 'point2d') {
    const pt = p as Point2DParam;
    if (!pt.keyframed) return pt;
    const v = evalPoint(pt, localFrame);
    return { ...pt, keyframesX: upsertKeyframe(pt.keyframesX ?? [], localFrame, v.x), keyframesY: upsertKeyframe(pt.keyframesY ?? [], localFrame, v.y) };
  }
  if (isKeyframeable(p)) {
    const sc = p as ScalarParam;
    if (!sc.keyframed) return sc;
    return { ...sc, keyframes: upsertKeyframe(sc.keyframes ?? [], localFrame, evalScalar(sc, localFrame)) };
  }
  return p;
}

/** Remove the keyframe at the current frame across all lanes of a param. */
export function removeKeyframeAtFrame(p: EffectParam, localFrame: number): EffectParam {
  if (p.type === 'point2d') {
    const pt = p as Point2DParam;
    return { ...pt, keyframesX: removeKeyframe(pt.keyframesX ?? [], localFrame), keyframesY: removeKeyframe(pt.keyframesY ?? [], localFrame) };
  }
  if (isKeyframeable(p)) {
    const sc = p as ScalarParam;
    return { ...sc, keyframes: removeKeyframe(sc.keyframes ?? [], localFrame) };
  }
  return p;
}

/** Reset a param to its default value and clear keyframes. */
export function resetParam(p: EffectParam): EffectParam {
  if (p.defaultValue === undefined) return p;
  if (p.type === 'point2d') return { ...(p as Point2DParam), keyframed: false, keyframesX: [], keyframesY: [], value: p.defaultValue as Point2D };
  if (p.type === 'bool') return { ...(p as BoolParam), value: p.defaultValue as boolean };
  if (p.type === 'enum') return { ...(p as EnumParam), value: p.defaultValue as string };
  if (p.type === 'color') return { ...(p as ColorParam), value: p.defaultValue as string };
  return { ...(p as ScalarParam), keyframed: false, keyframes: [], value: p.defaultValue as number };
}

// ─── Paste Attributes / preset application ────────────────────────────────────

export interface AttributeSelection {
  motion: boolean;
  opacity: boolean;
  timeRemap: boolean;
  effects: boolean;
  audioEffects: boolean;
  speed: boolean;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function replaceFixedParams(target: EffectComponent[], source: EffectComponent[], matchName: string): EffectComponent[] {
  const src = source.find((c) => c.matchName === matchName);
  if (!src) return target;
  return target.map((c) => c.matchName === matchName ? { ...c, enabled: src.enabled, params: clone(src.params) } : c);
}

/**
 * Premiere "Paste Attributes": copy selected attribute groups from `source` onto
 * `target`. Returns a new EffectControlsState.
 */
export function applyAttributes(
  target: EffectControlsState,
  source: EffectControlsState,
  sel: AttributeSelection,
): EffectControlsState {
  let video = [...target.video];
  let audio = [...target.audio];

  if (sel.motion) video = replaceFixedParams(video, source.video, MATCH.MOTION);
  if (sel.opacity) video = replaceFixedParams(video, source.video, MATCH.OPACITY);
  if (sel.timeRemap) {
    video = replaceFixedParams(video, source.video, MATCH.TIME_REMAP);
  } else if (sel.speed) {
    const srcTR = source.video.find((c) => c.matchName === MATCH.TIME_REMAP);
    const srcSpeed = srcTR?.params.find((p) => p.id === 'speed');
    if (srcSpeed) {
      video = video.map((c) => c.matchName === MATCH.TIME_REMAP
        ? { ...c, params: c.params.map((p) => p.id === 'speed' ? clone(srcSpeed) : p) }
        : c);
    }
  }
  if (sel.effects) {
    const userFx = source.video.filter((c) => !c.fixed).map((c) => ({ ...clone(c), id: `${c.id}-${Date.now()}` }));
    const existing = new Set(video.filter((c) => !c.fixed).map((c) => c.matchName));
    video = [...video, ...userFx.filter((c) => !existing.has(c.matchName))];
  }
  if (sel.audioEffects) {
    audio = audio.map((c) => {
      if (!c.fixed) return c;
      const src = source.audio.find((s) => s.matchName === c.matchName);
      return src ? { ...c, enabled: src.enabled, params: clone(src.params) } : c;
    });
    const userAudio = source.audio.filter((c) => !c.fixed).map((c) => ({ ...clone(c), id: `${c.id}-${Date.now()}` }));
    const existing = new Set(audio.filter((c) => !c.fixed).map((c) => c.matchName));
    audio = [...audio, ...userAudio.filter((c) => !existing.has(c.matchName))];
  }
  return { ...target, video, audio };
}

/** Apply preset components onto a clip: fixed → replace params; user → append. */
export function applyPresetComponents(target: EffectControlsState, comps: EffectComponent[]): EffectControlsState {
  let video = [...target.video];
  let audio = [...target.audio];
  for (const comp of comps) {
    const list = comp.kind === 'audio' ? audio : video;
    if (comp.fixed) {
      const next = list.map((c) => c.matchName === comp.matchName ? { ...c, params: clone(comp.params), enabled: comp.enabled } : c);
      if (comp.kind === 'audio') audio = next; else video = next;
    } else {
      const appended = [...list, { ...clone(comp), id: `${comp.id}-${Date.now()}-${Math.floor(Math.random() * 1e4)}` }];
      if (comp.kind === 'audio') audio = appended; else video = appended;
    }
  }
  return { ...target, video, audio };
}

// ─── Keyframe interpolation (Premiere temporal ease) ─────────────────────────

export type InterpKind = 'linear' | 'bezier' | 'hold' | 'easeIn' | 'easeOut' | 'easeInOut';

export const INTERP_LABELS: Record<InterpKind, string> = {
  linear: 'Linear',
  bezier: 'Bezier (Smooth)',
  hold: 'Hold',
  easeIn: 'Ease In',
  easeOut: 'Ease Out',
  easeInOut: 'Ease In / Out',
};

/** Set the interpolation of the keyframe at `frame` on a single lane. */
export function setLaneKeyframeInterp(lane: KfPoint[], frame: number, kind: InterpKind): KfPoint[] {
  const sorted = [...lane].sort((a, b) => a.frame - b.frame);
  const i = sorted.findIndex((k) => Math.abs(k.frame - frame) <= 0.5);
  if (i < 0) return lane;
  const k = { ...sorted[i] };
  const next = sorted[i + 1];
  const span = next ? next.frame - k.frame : 1;

  if (kind === 'linear') { k.interp = 'linear'; delete k.handleR; delete k.handleL; }
  else if (kind === 'hold') { k.interp = 'constant'; }
  else {
    k.interp = 'bezier';
    // Outgoing handle controls the ease toward the next keyframe.
    const e: Record<string, [number, number, number, number]> = {
      bezier: EASING['ease-in-out'], easeIn: EASING['ease-in'], easeOut: EASING['ease-out'], easeInOut: EASING['ease-in-out'],
    };
    const h = e[kind] ?? EASING['ease-in-out'];
    const nv = next ? next.value : k.value;
    k.handleR = [k.frame + h[0] * span, k.value + h[1] * (nv - k.value)];
    k.handleL = [k.frame + h[2] * span, k.value + h[3] * (nv - k.value)];
  }
  sorted[i] = k;
  return sorted;
}

/** Apply interpolation to the keyframe at `frame` across every lane of a param. */
export function setParamKeyframeInterp(p: EffectParam, frame: number, kind: InterpKind): EffectParam {
  if (p.type === 'point2d') {
    const pt = p as Point2DParam;
    return { ...pt, keyframesX: setLaneKeyframeInterp(pt.keyframesX ?? [], frame, kind), keyframesY: setLaneKeyframeInterp(pt.keyframesY ?? [], frame, kind) };
  }
  if (isKeyframeable(p)) {
    const sc = p as ScalarParam;
    return { ...sc, keyframes: setLaneKeyframeInterp(sc.keyframes ?? [], frame, kind) };
  }
  return p;
}

/** Collect every keyframe frame across a param's lanes (for the lane mini-timeline). */
export function allParamKeyframeFrames(p: EffectParam): number[] {
  if (p.type === 'point2d') {
    const pt = p as Point2DParam;
    const set = new Set<number>([...(pt.keyframesX ?? []), ...(pt.keyframesY ?? [])].map((k) => k.frame));
    return [...set].sort((a, b) => a - b);
  }
  if (isKeyframeable(p)) return ((p as ScalarParam).keyframes ?? []).map((k) => k.frame).sort((a, b) => a - b);
  return [];
}
