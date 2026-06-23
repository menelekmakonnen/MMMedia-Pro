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

/** Clears all look presets, returning clips to a clean slate. */
export function clearLooks(): number {
  return mapVideoClips((c) => {
    c.letterbox = false;
    c.filmGrain = 0;
    c.vignette = 0;
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
  { id: 'hard-cuts', label: 'Hard Cuts', description: 'Reset to clean hard cuts.', icon: 'Scissors', accent: 'text-rose-400', apply: applyHardCuts },
  { id: 'clear', label: 'Clear Looks', description: 'Remove all preset looks.', icon: 'Eraser', accent: 'text-white/50', apply: clearLooks },
];
