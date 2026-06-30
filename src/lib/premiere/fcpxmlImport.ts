// ══════════════════════════════════════════════════════════════════════════════
// fcpxmlImport.ts — FCPXML → MMMedia Pro (the inbound half of the round-trip).
//
// Parses an FCPXML document (the interchange Adobe Premiere Pro imports/exports)
// into MMMedia Pro clips + Premiere-aligned Effect Controls, so you can:
//   • pull a Premiere project in and keep editing it, and
//   • feed its structure (timing + Motion/Opacity keyframes) to the auto-edit
//     engine as a template.
//
// Mirrors fcpxmlExport.ts: adjust-transform ↔ Motion, adjust-opacity ↔ Opacity,
// keyframeAnimation ↔ per-property keyframe lanes. Dependency-free (DOMParser).
// ══════════════════════════════════════════════════════════════════════════════

import type { Clip, ClipType } from '../../types';
import type { KfPoint, Interp } from '../keyframes';
import {
  createDefaultEffectControls, MATCH,
  type EffectControlsState, type ScalarParam, type Point2DParam,
} from './effectControls';
import { componentFromEffectId, appendEffectComponent, effectControlsToParametric } from './effectLibrary';
import { EFFECT_REGISTRY } from '../effectRegistry';

export interface ImportedSequence {
  name: string;
  fps: number;
  width: number;
  height: number;
  clips: Clip[];
  warnings: string[];
}

// ─── Time parsing ─────────────────────────────────────────────────────────────

/** Parse an FCPXML rational/decimal time ("N/Ds" | "Ns") to seconds. */
function timeToSeconds(s: string | null | undefined): number {
  if (!s) return 0;
  let v = s.trim();
  if (v.endsWith('s')) v = v.slice(0, -1);
  if (v.includes('/')) {
    const [n, d] = v.split('/').map(Number);
    return d ? n / d : 0;
  }
  return Number(v) || 0;
}

function fpsFromFrameDuration(frameDuration: string | null): number {
  const dur = timeToSeconds(frameDuration);
  return dur > 0 ? Math.round(1 / dur) : 30;
}

const uid = () => { try { return crypto.randomUUID(); } catch { return `imp-${Date.now()}-${Math.random()}`; } };

const interpFromFcp = (s: string | null): Interp => (s === 'hold' ? 'constant' : s === 'smooth' || s === 'bezier' ? 'bezier' : 'linear');

// ─── Param / keyframe extraction ──────────────────────────────────────────────

/** Read a <param name=...> child: returns either a static numbers array or keyframes. */
function readParam(parent: Element, name: string): { values: number[]; keyframes?: { frame: number; value: number; interp: Interp }[] } | null {
  const param = Array.from(parent.querySelectorAll(':scope > param')).find((p) => p.getAttribute('name') === name)
    ?? Array.from(parent.getElementsByTagName('param')).find((p) => p.getAttribute('name') === name);
  if (!param) return null;

  const anim = param.querySelector('keyframeAnimation');
  if (anim) {
    const kfs = Array.from(anim.getElementsByTagName('keyframe')).map((k) => {
      const nums = (k.getAttribute('value') || '0').trim().split(/\s+/).map(Number);
      return { secs: timeToSeconds(k.getAttribute('time')), values: nums, interp: interpFromFcp(k.getAttribute('interp')) };
    });
    return { values: kfs[0]?.values ?? [0], keyframes: kfs.map((k) => ({ frame: 0, value: k.values[0], interp: k.interp, _secs: k.secs } as any)) };
  }
  const nums = (param.getAttribute('value') || '0').trim().split(/\s+/).map(Number);
  return { values: nums };
}

function setScalar(comp: ReturnType<EffectControlsState['video']['find']> | undefined, id: string, value: number) {
  const p = comp?.params.find((x) => x.id === id) as ScalarParam | undefined;
  if (p) p.value = value;
}
function setScalarKf(comp: any, id: string, kfs: KfPoint[]) {
  const p = comp?.params.find((x: any) => x.id === id) as ScalarParam | undefined;
  if (p && kfs.length) { p.keyframed = true; p.keyframes = kfs; }
}
function setPoint(comp: any, id: string, x: number, y: number) {
  const p = comp?.params.find((px: any) => px.id === id) as Point2DParam | undefined;
  if (p) p.value = { x, y };
}

// ─── Speed (timeMap) ──────────────────────────────────────────────────────────

/** Constant speed from an FCPXML <timeMap> (source-secs per timeline-secs). */
function parseSpeed(clipEl: Element): number {
  const tm = clipEl.querySelector(':scope > timeMap') ?? clipEl.querySelector('timeMap');
  if (!tm) return 1;
  const pts = Array.from(tm.getElementsByTagName('timept'));
  if (pts.length < 2) return 1;
  const t0 = timeToSeconds(pts[0].getAttribute('time')), v0 = timeToSeconds(pts[0].getAttribute('value'));
  const t1 = timeToSeconds(pts[pts.length - 1].getAttribute('time')), v1 = timeToSeconds(pts[pts.length - 1].getAttribute('value'));
  const dt = t1 - t0, dv = v1 - v0;
  if (dt <= 0) return 1;
  const speed = dv / dt;
  return speed > 0.001 ? Math.round(speed * 1000) / 1000 : 1;
}

// ─── Audio level (adjust-volume) ────────────────────────────────────────────────

/** Volume in dB from <adjust-volume amount="…dB"> or a <param name="amount">. */
function parseVolumeDb(clipEl: Element): number | null {
  const av = clipEl.querySelector(':scope > adjust-volume') ?? clipEl.querySelector('adjust-volume');
  if (!av) return null;
  let amt = av.getAttribute('amount');
  if (!amt) {
    const p = Array.from(av.getElementsByTagName('param')).find((x) => x.getAttribute('name') === 'amount');
    amt = p?.getAttribute('value') ?? null;
  }
  if (!amt) return null;
  const n = Number(amt.trim().replace(/dB$/i, ''));
  return Number.isFinite(n) ? n : null;
}

// ─── Effects (filter-video → our parametric registry, best-effort) ──────────────

const EFFECT_NAME_MAP: Record<string, string> = {
  'gaussian blur': 'gaussian_blur', 'blur': 'gaussian_blur', 'box blur': 'box_blur',
  'sharpen': 'sharpen', 'unsharp': 'sharpen', 'clarity': 'clarity',
  'vignette': 'vignette', 'film grain': 'film_grain', 'noise': 'film_grain',
  'color balance': 'color_balance', 'levels': 'levels', 'curves': 'color_curves',
  'color temperature': 'color_temperature', 'exposure': 'exposure',
  'posterize': 'posterize', 'duotone': 'duotone', 'sepia': 'sepia_advanced',
  'lens distortion': 'lens_distortion', 'chromatic aberration': 'chromatic_aberration',
  'mirror': 'mirror_h',
};

/** Resolve FCPXML <filter-video>/<effect> names to registry effect ids. */
function parseEffectIds(clipEl: Element, effectDefs: Map<string, string>, warnings: string[]): string[] {
  const ids: string[] = [];
  for (const fv of Array.from(clipEl.getElementsByTagName('filter-video'))) {
    const refName = effectDefs.get(fv.getAttribute('ref') || '') || '';
    const name = (fv.getAttribute('name') || refName || '').toLowerCase().trim();
    if (!name) continue;
    const id = EFFECT_NAME_MAP[name]
      || EFFECT_REGISTRY.find((e) => e.name.toLowerCase() === name)?.id
      || EFFECT_REGISTRY.find((e) => name.includes(e.name.toLowerCase()) || e.name.toLowerCase().includes(name))?.id;
    if (id && !ids.includes(id)) ids.push(id);
    else if (!id) warnings.push(`Effect "${name}" has no MMMedia equivalent yet; skipped.`);
  }
  return ids;
}

// ─── Effect Controls from a clip element ──────────────────────────────────────

function buildEffectControls(
  clipEl: Element, width: number, height: number, fps: number,
  effectDefs: Map<string, string>, warnings: string[],
): EffectControlsState {
  const ec = createDefaultEffectControls(width, height);
  const motion = ec.video.find((c) => c.matchName === MATCH.MOTION);
  const opacityC = ec.video.find((c) => c.matchName === MATCH.OPACITY);
  const cx = width / 2, cy = height / 2;

  const xform = clipEl.querySelector(':scope > adjust-transform') ?? clipEl.querySelector('adjust-transform');
  if (xform && motion) {
    const pos = readParam(xform, 'position');
    if (pos) setPoint(motion, 'position', cx + (pos.values[0] ?? 0), cy + (pos.values[1] ?? 0));
    const scale = readParam(xform, 'scale');
    if (scale) {
      if (scale.keyframes) {
        setScalarKf(motion, 'scale', scale.keyframes.map((k: any) => ({ frame: Math.round(k._secs * fps), value: k.value * 100, interp: k.interp })));
      } else setScalar(motion, 'scale', (scale.values[0] ?? 1) * 100);
    }
    const rot = readParam(xform, 'rotation');
    if (rot) {
      if (rot.keyframes) setScalarKf(motion, 'rotation', rot.keyframes.map((k: any) => ({ frame: Math.round(k._secs * fps), value: k.value, interp: k.interp })));
      else setScalar(motion, 'rotation', rot.values[0] ?? 0);
    }
    const anchor = readParam(xform, 'anchor');
    if (anchor) setPoint(motion, 'anchorPoint', cx + (anchor.values[0] ?? 0), cy + (anchor.values[1] ?? 0));
  }

  const opacityEl = clipEl.querySelector(':scope > adjust-opacity') ?? clipEl.querySelector('adjust-opacity');
  if (opacityEl && opacityC) {
    const amount = readParam(opacityEl, 'amount');
    if (amount) {
      if (amount.keyframes) setScalarKf(opacityC, 'opacity', amount.keyframes.map((k: any) => ({ frame: Math.round(k._secs * fps), value: k.value * 100, interp: k.interp })));
      else setScalar(opacityC, 'opacity', (amount.values[0] ?? 1) * 100);
    }
  }

  // Audio ▸ Volume level (dB) from <adjust-volume>.
  const volDb = parseVolumeDb(clipEl);
  if (volDb !== null) {
    const volume = ec.audio.find((c) => c.matchName === MATCH.VOLUME);
    setScalar(volume, 'level', Math.max(-60, Math.min(15, volDb)));
  }

  // Applied video effects (<filter-video>) → user EffectComponents.
  for (const effectId of parseEffectIds(clipEl, effectDefs, warnings)) {
    const comp = componentFromEffectId(effectId);
    if (comp) {
      const next = appendEffectComponent(ec, comp);
      ec.video = next.video;
    }
  }

  return ec;
}

// ─── Main parse ───────────────────────────────────────────────────────────────

export function parseFcpxml(xml: string): ImportedSequence {
  const warnings: string[] = [];
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Invalid FCPXML: could not parse XML.');

  const format = doc.querySelector('format');
  const fps = fpsFromFrameDuration(format?.getAttribute('frameDuration') ?? null);
  const width = Number(format?.getAttribute('width')) || 1920;
  const height = Number(format?.getAttribute('height')) || 1080;
  const secToFrame = (s: number) => Math.round(s * fps);

  // Asset table: id → { src, name, durationFrames }
  const assets = new Map<string, { src: string; name: string; durFrames: number }>();
  for (const a of Array.from(doc.getElementsByTagName('asset'))) {
    const id = a.getAttribute('id');
    if (!id) continue;
    assets.set(id, {
      src: (a.getAttribute('src') || '').replace(/^file:\/\//, ''),
      name: a.getAttribute('name') || 'clip',
      durFrames: secToFrame(timeToSeconds(a.getAttribute('duration'))),
    });
  }

  // Effect resource table: id → effect name (for <filter-video ref=…>).
  const effectDefs = new Map<string, string>();
  for (const e of Array.from(doc.getElementsByTagName('effect'))) {
    const id = e.getAttribute('id');
    if (id) effectDefs.set(id, e.getAttribute('name') || '');
  }

  const projectName = doc.querySelector('project')?.getAttribute('name')
    || doc.querySelector('event')?.getAttribute('name') || 'Imported Sequence';

  // Spine clips: asset-clip / clip / video / audio elements with an offset.
  const spine = doc.querySelector('spine') ?? doc.querySelector('sequence') ?? doc.documentElement;
  const clipEls = Array.from(spine.querySelectorAll('asset-clip, clip, video, audio'))
    .filter((el) => el.getAttribute('offset') !== null || el.getAttribute('ref') !== null);

  const clips: Clip[] = [];
  let trackGuess = 1;

  for (const el of clipEls) {
    const ref = el.getAttribute('ref') || '';
    const asset = assets.get(ref);
    const startFrame = secToFrame(timeToSeconds(el.getAttribute('offset')));
    const durFrames = Math.max(1, secToFrame(timeToSeconds(el.getAttribute('duration'))));
    const startSrc = secToFrame(timeToSeconds(el.getAttribute('start')));
    const name = el.getAttribute('name') || asset?.name || 'clip';
    const src = asset?.src || '';
    if (!src) { warnings.push(`Clip "${name}" had no resolvable media; imported as a placeholder.`); }

    // Lane attribute (FCPXML connected clips) → rough track mapping.
    const lane = Number(el.getAttribute('lane') || '0');
    const track = lane > 0 ? lane + 1 : 1;

    const ext = (src.split('.').pop() || '').toLowerCase();
    const type: ClipType = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext) ? 'image'
      : ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg'].includes(ext) ? 'audio' : 'video';

    // Speed (timeMap): source span = timeline span × speed.
    const speed = parseSpeed(el);
    const srcSpan = Math.max(1, Math.round(durFrames * speed));
    const ec = buildEffectControls(el, width, height, fps, effectDefs, warnings);

    const clip: Clip = {
      id: uid(),
      type,
      path: src,
      filename: name,
      startFrame,
      endFrame: startFrame + durFrames,
      sourceDurationFrames: asset?.durFrames || (startSrc + srcSpan),
      trimStartFrame: startSrc,
      trimEndFrame: startSrc + srcSpan,
      track,
      speed,
      volume: 100,
      reversed: false,
      locked: false,
      origin: 'manual',
      effectControls: ec,
      // Project applied effects to the legacy parametric chain so they render/export.
      parametricEffects: effectControlsToParametric(ec),
    };
    clips.push(clip);
    trackGuess = Math.max(trackGuess, track);
  }

  if (clips.length === 0) warnings.push('No clips found in the FCPXML spine.');

  return { name: projectName, fps, width, height, clips, warnings };
}
