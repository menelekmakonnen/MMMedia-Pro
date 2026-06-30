/**
 * NLE Quick Presets — one-click "automated" versions of the manual NLE systems.
 *
 * Each preset applies a coherent look/behaviour across the clips currently on
 * the timeline, going through the Command pattern so the whole operation is a
 * single undo step. These power the "Quick Presets" strip in the Edit Generator
 * so a user can get a professional result without touching the inspector.
 *
 * Everything writes to fields that already exist on the Clip model and that the
 * preview/export pipelines already understand, so presets are non-destructive
 * and fully reversible.
 */
import { useClipStore } from '../store/clipStore';
import { useHistoryStore } from '../store/historyStore';
import { createSetClipsCommand } from './commandPattern';
import { applyPreset } from './colorGradingPresets';
import type { Clip } from '../types';

export interface NlePresetDef {
  id: string;
  label: string;
  description: string;
  /** Lucide icon name (resolved in the UI). */
  icon: string;
  /** Accent colour for the card. */
  accent: string;
  apply: () => number; // returns number of clips affected
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function clone(clips: Clip[]): Clip[] {
  return JSON.parse(JSON.stringify(clips));
}

function commit(next: Clip[], description: string): void {
  const cmd = createSetClipsCommand(
    () => useClipStore.getState(),
    (updater) => useClipStore.setState(updater(useClipStore.getState())),
    next,
    description,
  );
  useHistoryStore.getState().execute(cmd);
}

/** Apply a mutation to every video clip; returns affected count. */
function mapVideoClips(mut: (c: Clip) => void, description: string): number {
  const clips = clone(useClipStore.getState().clips);
  let n = 0;
  for (const c of clips) {
    if (c.type === 'video' || c.type === 'image') {
      mut(c);
      n++;
    }
  }
  if (n > 0) commit(clips, description);
  return n;
}

// ─── Preset implementations ─────────────────────────────────────────────────────

/** Smooth dissolves between every cut. */
export function applyAutoCrossfades(): number {
  // Global strategy drives the program-monitor opacity blend between clips.
  useClipStore.getState().setTransitionStrategy('dissolve');
  // Also stamp a per-clip transition so it survives export.
  return mapVideoClips((c) => {
    c.transition = { type: 'dissolve', durationFrames: 15 };
  }, 'Preset: Auto Crossfades');
}

/** Hard cuts everywhere (reset transitions). */
export function applyHardCuts(): number {
  useClipStore.getState().setTransitionStrategy('cut');
  return mapVideoClips((c) => {
    delete (c as Partial<Clip>).transition;
  }, 'Preset: Hard Cuts');
}

/** 2.39:1 cinematic letterbox bars on every shot. */
export function applyCinematicBars(): number {
  return mapVideoClips((c) => {
    c.letterbox = true;
  }, 'Preset: Cinematic Bars');
}

/** Subtle, slow punch-in on every shot for energy. */
export function applyPunchInZoom(): number {
  return mapVideoClips((c) => {
    c.zoomStart = 100;
    c.zoomEnd = 110;
    c.zoomOrigin = 'center';
  }, 'Preset: Punch-In Zoom');
}

/** Hollywood teal-and-orange colour grade. */
export function applyTealOrangeGrade(): number {
  const grading = applyPreset('cin-teal-orange');
  return mapVideoClips((c) => {
    c.colorGrading = JSON.parse(JSON.stringify(grading));
  }, 'Preset: Teal & Orange Grade');
}

/** Filmic texture — grain + vignette. */
export function applyFilmTexture(): number {
  return mapVideoClips((c) => {
    c.filmGrain = 12;
    c.vignette = 40;
  }, 'Preset: Film Texture');
}

/** S-curve speed ramp on every shot (slow-fast-slow). */
export function applySpeedRamp(): number {
  return mapVideoClips((c) => {
    c.speedCurvePreset = 's-curve';
  }, 'Preset: Speed Ramp');
}

// ─── Creator-hack look presets (ported from the "Premiere MD" tutorial set) ──────
// Each maps to Clip fields the preview/export pipeline already bakes, so the look
// renders identically in the players and the final video.

/** Light bloom — glowing highlights (Luma-Key + Gaussian recipe → glow effect). */
export function applyLightBloom(): number {
  return mapVideoClips((c) => {
    c.glow = { intensity: 60, radius: 50, threshold: 60 };
  }, 'Preset: Light Bloom');
}

/** Dreamy glow — softer, wider bloom with a touch of grain for a hazy look. */
export function applyDreamyGlow(): number {
  return mapVideoClips((c) => {
    c.glow = { intensity: 42, radius: 68, threshold: 42 };
    c.filmGrain = 8;
  }, 'Preset: Dreamy Glow');
}

/** Smooth zoom — a stronger eased push-in (the "Transform smooth zoom" hack). */
export function applySmoothZoom(): number {
  return mapVideoClips((c) => {
    c.zoomStart = 100;
    c.zoomEnd = 118;
    c.zoomOrigin = 'center';
  }, 'Preset: Smooth Zoom');
}

/** VHS / retro — chroma shift + grain + saturation pop. */
export function applyVhsRetro(): number {
  return mapVideoClips((c) => {
    c.vhs = { amount: 55 };
  }, 'Preset: VHS Retro');
}

/** Chromatic punch — RGB fringing for a music-video edge. */
export function applyChromaticPunch(): number {
  return mapVideoClips((c) => {
    c.chromaticAberration = 8;
  }, 'Preset: Chromatic Punch');
}

/** Handheld shake — fake an operator-held camera (the "looks handheld" hack). */
export function applyHandheldShake(): number {
  return mapVideoClips((c) => {
    c.shake = { type: 'handheld', intensity: 28, direction: 'random', decayRate: 1, durationFrames: 99999 };
  }, 'Preset: Handheld Shake');
}

/** Crisp sharpen — a clean detail pop without over-haloing. */
export function applyCrispSharpen(): number {
  return mapVideoClips((c) => {
    c.sharpen = 1.4;
  }, 'Preset: Crisp Sharpen');
}

/** Soft focus — gentle gaussian softness for a dreamy / beauty look. */
export function applySoftFocus(): number {
  return mapVideoClips((c) => {
    c.blurAmount = 3;
  }, 'Preset: Soft Focus');
}

/** Clears all look presets, returning clips to a clean slate. */
export function clearLooks(): number {
  return mapVideoClips((c) => {
    c.letterbox = false;
    c.filmGrain = 0;
    c.vignette = 0;
    c.chromaticAberration = 0;
    c.sharpen = 0;
    c.blurAmount = 0;
    delete (c as Partial<Clip>).glow;
    delete (c as Partial<Clip>).vhs;
    delete (c as Partial<Clip>).shake;
    delete (c as Partial<Clip>).zoomStart;
    delete (c as Partial<Clip>).zoomEnd;
    delete (c as Partial<Clip>).colorGrading;
    delete (c as Partial<Clip>).speedCurvePreset;
    delete (c as Partial<Clip>).transition;
  }, 'Preset: Clear Looks');
}

// ─── Registry (drives the UI strip) ─────────────────────────────────────────────

export const NLE_PRESETS: NlePresetDef[] = [
  { id: 'crossfades', label: 'Auto Crossfades', description: 'Smooth dissolves between every cut.', icon: 'Blend', accent: 'text-sky-400', apply: applyAutoCrossfades },
  { id: 'punch-in', label: 'Punch-In Zoom', description: 'Subtle slow push-in on every shot.', icon: 'ZoomIn', accent: 'text-violet-400', apply: applyPunchInZoom },
  { id: 'teal-orange', label: 'Teal & Orange', description: 'Cinematic blockbuster colour grade.', icon: 'Palette', accent: 'text-amber-400', apply: applyTealOrangeGrade },
  { id: 'cine-bars', label: 'Cinematic Bars', description: '2.39:1 widescreen letterbox.', icon: 'RectangleHorizontal', accent: 'text-zinc-300', apply: applyCinematicBars },
  { id: 'film-texture', label: 'Film Texture', description: 'Grain + vignette for an organic film feel.', icon: 'Film', accent: 'text-orange-400', apply: applyFilmTexture },
  { id: 'speed-ramp', label: 'Speed Ramp', description: 'S-curve slow-fast-slow on every shot.', icon: 'Gauge', accent: 'text-emerald-400', apply: applySpeedRamp },
  // ── Creator-hack looks ──
  { id: 'light-bloom', label: 'Light Bloom', description: 'Glowing, blooming highlights.', icon: 'Sun', accent: 'text-yellow-300', apply: applyLightBloom },
  { id: 'dreamy-glow', label: 'Dreamy Glow', description: 'Soft hazy bloom + a little grain.', icon: 'Sparkles', accent: 'text-pink-300', apply: applyDreamyGlow },
  { id: 'smooth-zoom', label: 'Smooth Zoom', description: 'Stronger eased push-in on every shot.', icon: 'ZoomIn', accent: 'text-violet-300', apply: applySmoothZoom },
  { id: 'vhs-retro', label: 'VHS Retro', description: 'Chroma shift + grain + sat pop.', icon: 'Tv', accent: 'text-fuchsia-400', apply: applyVhsRetro },
  { id: 'chromatic-punch', label: 'Chromatic Punch', description: 'RGB fringing music-video edge.', icon: 'Contrast', accent: 'text-cyan-300', apply: applyChromaticPunch },
  { id: 'handheld-shake', label: 'Handheld Shake', description: 'Fake an operator-held camera.', icon: 'Move', accent: 'text-orange-300', apply: applyHandheldShake },
  { id: 'crisp-sharpen', label: 'Crisp Sharpen', description: 'Clean detail pop.', icon: 'Aperture', accent: 'text-teal-300', apply: applyCrispSharpen },
  { id: 'soft-focus', label: 'Soft Focus', description: 'Gentle dreamy gaussian softness.', icon: 'Droplet', accent: 'text-blue-300', apply: applySoftFocus },
  { id: 'hard-cuts', label: 'Hard Cuts', description: 'Reset to clean hard cuts.', icon: 'Scissors', accent: 'text-rose-400', apply: applyHardCuts },
  { id: 'clear', label: 'Clear Looks', description: 'Remove all preset looks.', icon: 'Eraser', accent: 'text-white/50', apply: clearLooks },
];
