// ══════════════════════════════════════════════════════════════════════════════
// ege/styleRecipes.ts — The "infinity backbone": declarative style recipes.
//
// Each output type (trailer, music-video, showreel, …) is described as DATA, not
// hardcoded branching logic. A StyleRecipe captures the high-level intent of an
// edit — pacing curve, transition palette + frequency, color mood, effect
// frequencies, caption style, aspect/orientation, audio policy, and clip-ordering
// defaults — and `applyRecipeToSettings()` projects that intent onto the REAL
// `TrailerSettings` knobs the generator already consumes.
//
// Fields that have a direct settings equivalent (transitionStyle, beatSyncStrategy,
// effect policies, orientationFilter, audioMixStrategy, clipOrderMode, …) are
// mapped. Fields with NO settings home yet (loudness target in LUFS, caption
// styling, pacing-curve shape, ducking depth) are KEPT on the recipe object so the
// engine layer can consume them later without inventing conflicting settings keys.
//
// PURE: no React, no IPC, no filesystem. Deterministic. Unit-testable in isolation.
// ══════════════════════════════════════════════════════════════════════════════

import { DEFAULT_FPS } from '../time';
import type { TrailerSettings } from '../trailerGenerator';
import type {
    TransitionType,
    TransitionStyle,
    EffectApplyPolicy,
    ShakePolicy,
    BoomerangPresetId,
    BeatDropIntensity,
} from '../../types';
import type { ClipOrderMode } from '../clipOrdering';

// ── Identity ──────────────────────────────────────────────────────────────────

/** The full set of declarative output styles the engine can produce. */
export type StyleId =
    | 'trailer'
    | 'music-video'
    | 'showreel'
    | 'video-essay'
    | 'short-film'
    // Social sub-styles — short-form vertical recipes with distinct intents.
    | 'social-hook'
    | 'social-beatcut'
    | 'social-reframe'
    | 'social-quote'
    | 'social-list';

// ── Recipe sub-shapes ───────────────────────────────────────────────────────

/**
 * Pacing curve: how clip length evolves across the edit. `shape` describes the
 * envelope; `[shortest, longest]` are the clip-duration bounds in SECONDS that
 * map onto `shortestClip` / `longestClip`. `rhythmPattern` ties into the existing
 * rhythm engine, `beatDivisor` is a hint for beat-synced pacing.
 */
export interface PacingCurve {
    /** Envelope of clip length over the timeline. */
    shape: 'accelerate' | 'decelerate' | 'wave' | 'steady' | 'pulse' | 'build-drop';
    /** Clip-duration bounds in seconds → shortestClip / longestClip. */
    clipSeconds: [number, number];
    /** Rhythm pattern id consumed by RHYTHM_PATTERNS (rhythmPattern setting). */
    rhythmPattern: TrailerSettings['rhythmPattern'];
    /** Beat subdivision hint (engine-side; no direct settings field). */
    beatDivisor: number;
}

/**
 * Transition palette + how often transitions (vs. hard cuts) fire.
 * `palette` maps onto `transitionTypes`, `style` onto `transitionStyle`.
 * `frequency` (0–1) is the recipe's notion of "how busy" the boundaries are; it
 * is projected onto transitionStyle + returnTransitionFrequency.
 */
export interface TransitionPalette {
    style: TransitionStyle;
    palette: TransitionType[];
    /** 0–1: share of boundaries that should carry a transition. */
    frequency: number;
    /** Default transition length → transitionDurationMs. */
    durationMs: number;
    /** Whether A→B→A return legs are on-brand for this style. */
    returns: boolean;
}

/**
 * Color mood. `temperature`/`saturation`/`contrast` are normalized -1..1 (warm/
 * cool, flat/punchy) intents. `colorPerSection` maps onto the real setting; the
 * fine-grained numbers are engine-side hints (no per-recipe colorGrading field on
 * TrailerSettings to avoid conflicting with globalColorGrading).
 */
export interface ColorMood {
    name: string;
    /** -1 (cool) .. 1 (warm) */
    temperature: number;
    /** -1 (desaturated) .. 1 (vivid) */
    saturation: number;
    /** -1 (flat) .. 1 (high contrast) */
    contrast: number;
    /** Drive per-section color shifts (colorPerSection setting). */
    perSection: boolean;
    /** Fade toward B&W on buildups (desaturationBuildup setting). */
    desaturationBuildup: boolean;
}

/**
 * Effect frequencies. Each is an EffectApplyPolicy that maps 1:1 onto the
 * matching `*Policy` setting. `beatDropImpact` and `shake` map onto their knobs.
 */
export interface EffectFrequencies {
    motionBlur: EffectApplyPolicy;
    glow: EffectApplyPolicy;
    rgbSplit: EffectApplyPolicy;
    hueCycle: EffectApplyPolicy;
    vhs: EffectApplyPolicy;
    vibrationFlash: EffectApplyPolicy;
    doubleExposure: EffectApplyPolicy;
    shake: ShakePolicy;
    beatDropImpact: BeatDropIntensity;
    /** 0–25 film grain → filmGrainAmount. */
    filmGrain: number;
    /** 0–100 vignette → vignetteAmount. */
    vignette: number;
}

/**
 * Caption styling. No TrailerSettings home today — kept entirely on the recipe
 * for the kinetic-caption engine to consume later.
 */
export interface CaptionStyle {
    enabled: boolean;
    kind: 'none' | 'kinetic' | 'lower-third' | 'karaoke' | 'subtitle' | 'big-quote';
    position: 'top' | 'center' | 'bottom' | 'dynamic';
    emphasis: 'word' | 'line' | 'phrase';
    /** Relative font scale (1 = default). */
    scale: number;
}

/** Aspect / orientation intent. `orientation` maps onto orientationFilter. */
export interface AspectPolicy {
    aspect: '16:9' | '9:16' | '1:1' | '4:5' | '2.39:1';
    orientation: NonNullable<TrailerSettings['orientationFilter']>;
    /** Black bars / cinemascope framing → letterboxEnabled. */
    letterbox: boolean;
}

/**
 * Audio policy. `mix` maps onto audioMixStrategy. `loudnessLUFS` and `ducking`
 * (depth + whether enabled) have no settings home and stay on the recipe for the
 * loudness/ducking engine.
 */
export interface AudioPolicy {
    mix: TrailerSettings['audioMixStrategy'];
    /** Integrated loudness target in LUFS (engine-side). */
    loudnessLUFS: number;
    ducking: {
        enabled: boolean;
        /** dB of gain reduction applied to the bed under foreground audio. */
        depthDb: number;
    };
    /** Sync clips to the audio grid when a guide track is present. */
    beatSyncStrategy: TrailerSettings['beatSyncStrategy'];
}

/** Clip-ordering defaults → clipOrderMode / sequentialBy. */
export interface ClipOrderDefaults {
    mode: ClipOrderMode;
    sequentialBy: NonNullable<TrailerSettings['sequentialBy']>;
}

// ── The recipe ─────────────────────────────────────────────────────────────

export interface StyleRecipe {
    id: StyleId;
    label: string;
    /** Maps onto generatorMode for the five top-level engines; social variants
     *  ride on the trailer/music-video engine as noted. */
    generatorMode: NonNullable<TrailerSettings['generatorMode']>;
    pacing: PacingCurve;
    transitions: TransitionPalette;
    color: ColorMood;
    effects: EffectFrequencies;
    caption: CaptionStyle;
    aspect: AspectPolicy;
    audio: AudioPolicy;
    clipOrder: ClipOrderDefaults;
}

// ── Shared building blocks ───────────────────────────────────────────────────

const NEUTRAL_COLOR = (over: Partial<ColorMood> = {}): ColorMood => ({
    name: 'neutral',
    temperature: 0,
    saturation: 0,
    contrast: 0,
    perSection: false,
    desaturationBuildup: false,
    ...over,
});

const NO_CAPTIONS: CaptionStyle = {
    enabled: false,
    kind: 'none',
    position: 'bottom',
    emphasis: 'line',
    scale: 1,
};

const CINEMA_EFFECTS = (over: Partial<EffectFrequencies> = {}): EffectFrequencies => ({
    motionBlur: 'off',
    glow: 'off',
    rgbSplit: 'off',
    hueCycle: 'off',
    vhs: 'off',
    vibrationFlash: 'off',
    doubleExposure: 'off',
    shake: 'off',
    beatDropImpact: 'off',
    filmGrain: 0,
    vignette: 0,
    ...over,
});

// ── The registry ─────────────────────────────────────────────────────────────

export const RECIPES: Record<StyleId, StyleRecipe> = {
    // ── TRAILER ── punchy build toward a drop; cinematic; cuts with sparing FX.
    trailer: {
        id: 'trailer',
        label: 'Cinematic Trailer',
        generatorMode: 'trailer',
        pacing: {
            shape: 'build-drop',
            clipSeconds: [0.25, 1.4],
            rhythmPattern: 'breathing',
            beatDivisor: 1,
        },
        transitions: {
            style: 'mixed',
            palette: ['fade', 'fadeblack', 'fadewhite', 'dissolve', 'flash', 'zoom-through'],
            frequency: 0.35,
            durationMs: 220,
            returns: false,
        },
        color: NEUTRAL_COLOR({ name: 'teal-orange', temperature: 0.15, saturation: 0.2, contrast: 0.5, perSection: true, desaturationBuildup: true }),
        effects: CINEMA_EFFECTS({ glow: 'sparingly', vibrationFlash: 'sparingly', shake: 'heavy-beats-only', beatDropImpact: 'heavy', filmGrain: 6, vignette: 35 }),
        caption: { enabled: true, kind: 'big-quote', position: 'center', emphasis: 'phrase', scale: 1.3 },
        aspect: { aspect: '2.39:1', orientation: 'horizontal', letterbox: true },
        audio: { mix: 'ducking', loudnessLUFS: -14, ducking: { enabled: true, depthDb: 9 }, beatSyncStrategy: 'effect-on-drop' },
        clipOrder: { mode: 'none', sequentialBy: 'date-modified' },
    },

    // ── MUSIC VIDEO ── beat-locked, vivid, busy transitions, energetic FX.
    'music-video': {
        id: 'music-video',
        label: 'Music Video',
        generatorMode: 'music-video',
        pacing: {
            shape: 'pulse',
            clipSeconds: [0.18, 0.8],
            rhythmPattern: 'staccato-legato',
            beatDivisor: 2,
        },
        transitions: {
            style: 'mixed',
            palette: ['flash', 'rgb-split', 'glitch', 'zoom-through', 'whip', 'spin', 'circleopen'],
            frequency: 0.6,
            durationMs: 140,
            returns: true,
        },
        color: NEUTRAL_COLOR({ name: 'vivid-pop', temperature: 0.1, saturation: 0.6, contrast: 0.4, perSection: true }),
        effects: CINEMA_EFFECTS({ rgbSplit: 'per-beat', hueCycle: 'sparingly', glow: 'sparingly', vibrationFlash: 'per-beat', shake: 'on-every-beat', beatDropImpact: 'maximum', vignette: 15 }),
        caption: { enabled: true, kind: 'kinetic', position: 'dynamic', emphasis: 'word', scale: 1.2 },
        aspect: { aspect: '16:9', orientation: 'horizontal', letterbox: false },
        audio: { mix: 'original', loudnessLUFS: -9, ducking: { enabled: false, depthDb: 0 }, beatSyncStrategy: 'cut-on-beat' },
        clipOrder: { mode: 'randomize', sequentialBy: 'date-modified' },
    },

    // ── SHOWREEL ── steady, premium, clean cuts, restrained color, no captions.
    showreel: {
        id: 'showreel',
        label: 'Showreel',
        generatorMode: 'showreel',
        pacing: {
            shape: 'steady',
            clipSeconds: [0.6, 2.0],
            rhythmPattern: 'flat',
            beatDivisor: 1,
        },
        transitions: {
            style: 'mixed',
            palette: ['dissolve', 'fade', 'smoothleft', 'smoothright', 'circlecrop'],
            frequency: 0.3,
            durationMs: 300,
            returns: false,
        },
        color: NEUTRAL_COLOR({ name: 'clean-premium', temperature: 0.05, saturation: 0.25, contrast: 0.3 }),
        effects: CINEMA_EFFECTS({ glow: 'sparingly', filmGrain: 3, vignette: 20 }),
        caption: { enabled: false, kind: 'lower-third', position: 'bottom', emphasis: 'line', scale: 1 },
        aspect: { aspect: '16:9', orientation: 'horizontal', letterbox: false },
        audio: { mix: 'subtle', loudnessLUFS: -16, ducking: { enabled: true, depthDb: 6 }, beatSyncStrategy: 'groove-ride' },
        clipOrder: { mode: 'sequential', sequentialBy: 'date-created' },
    },

    // ── VIDEO ESSAY ── slow, narration-first, minimal FX, readable captions.
    'video-essay': {
        id: 'video-essay',
        label: 'Video Essay',
        generatorMode: 'video-essay',
        pacing: {
            shape: 'decelerate',
            clipSeconds: [1.5, 5.0],
            rhythmPattern: 'flat',
            beatDivisor: 1,
        },
        transitions: {
            style: 'mixed',
            palette: ['fade', 'dissolve'],
            frequency: 0.2,
            durationMs: 400,
            returns: false,
        },
        color: NEUTRAL_COLOR({ name: 'documentary', temperature: -0.05, saturation: 0.0, contrast: 0.15 }),
        effects: CINEMA_EFFECTS({ vignette: 10 }),
        caption: { enabled: true, kind: 'subtitle', position: 'bottom', emphasis: 'line', scale: 1 },
        aspect: { aspect: '16:9', orientation: 'horizontal', letterbox: false },
        audio: { mix: 'ducking', loudnessLUFS: -16, ducking: { enabled: true, depthDb: 12 }, beatSyncStrategy: 'auto' },
        clipOrder: { mode: 'sequential', sequentialBy: 'filename' },
    },

    // ── SHORT FILM ── slowest, narrative, very clean, cinematic letterbox.
    'short-film': {
        id: 'short-film',
        label: 'Short Film',
        generatorMode: 'short-film',
        pacing: {
            shape: 'wave',
            clipSeconds: [2.0, 8.0],
            rhythmPattern: 'breathing',
            beatDivisor: 1,
        },
        transitions: {
            style: 'mixed',
            palette: ['fade', 'fadeblack', 'dissolve', 'match-cut', 'seamless'],
            frequency: 0.18,
            durationMs: 500,
            returns: false,
        },
        color: NEUTRAL_COLOR({ name: 'filmic', temperature: 0.1, saturation: -0.1, contrast: 0.4, perSection: true }),
        effects: CINEMA_EFFECTS({ filmGrain: 8, vignette: 30 }),
        caption: NO_CAPTIONS,
        aspect: { aspect: '2.39:1', orientation: 'horizontal', letterbox: true },
        audio: { mix: 'original', loudnessLUFS: -18, ducking: { enabled: true, depthDb: 10 }, beatSyncStrategy: 'auto' },
        clipOrder: { mode: 'sequential', sequentialBy: 'date-created' },
    },

    // ── SOCIAL: HOOK ── front-loaded punch, vertical, big captions, fast open.
    'social-hook': {
        id: 'social-hook',
        label: 'Social — Hook',
        generatorMode: 'trailer',
        pacing: {
            shape: 'accelerate',
            clipSeconds: [0.25, 1.0],
            rhythmPattern: 'staccato-legato',
            beatDivisor: 2,
        },
        transitions: {
            style: 'mixed',
            palette: ['flash', 'zoom-through', 'whip', 'rgb-split'],
            frequency: 0.45,
            durationMs: 120,
            returns: false,
        },
        color: NEUTRAL_COLOR({ name: 'punchy-social', temperature: 0.1, saturation: 0.5, contrast: 0.5 }),
        effects: CINEMA_EFFECTS({ rgbSplit: 'sparingly', vibrationFlash: 'sparingly', shake: 'heavy-beats-only', beatDropImpact: 'heavy', vignette: 10 }),
        caption: { enabled: true, kind: 'kinetic', position: 'center', emphasis: 'word', scale: 1.5 },
        aspect: { aspect: '9:16', orientation: 'vertical', letterbox: false },
        audio: { mix: 'original', loudnessLUFS: -10, ducking: { enabled: true, depthDb: 8 }, beatSyncStrategy: 'cut-on-beat' },
        clipOrder: { mode: 'none', sequentialBy: 'date-modified' },
    },

    // ── SOCIAL: BEATCUT ── relentless beat-locked vertical cuts.
    'social-beatcut': {
        id: 'social-beatcut',
        label: 'Social — Beat Cut',
        generatorMode: 'music-video',
        pacing: {
            shape: 'pulse',
            clipSeconds: [0.15, 0.6],
            rhythmPattern: 'staccato-legato',
            beatDivisor: 2,
        },
        transitions: {
            style: 'mixed',
            palette: ['flash', 'glitch', 'rgb-split', 'zoom-through'],
            frequency: 0.55,
            durationMs: 110,
            returns: true,
        },
        color: NEUTRAL_COLOR({ name: 'club-vivid', temperature: -0.05, saturation: 0.6, contrast: 0.45, perSection: true }),
        effects: CINEMA_EFFECTS({ rgbSplit: 'per-beat', hueCycle: 'sparingly', vibrationFlash: 'per-beat', shake: 'on-every-beat', beatDropImpact: 'maximum' }),
        caption: { enabled: true, kind: 'kinetic', position: 'dynamic', emphasis: 'word', scale: 1.3 },
        aspect: { aspect: '9:16', orientation: 'vertical', letterbox: false },
        audio: { mix: 'original', loudnessLUFS: -9, ducking: { enabled: false, depthDb: 0 }, beatSyncStrategy: 'cut-on-beat' },
        clipOrder: { mode: 'randomize', sequentialBy: 'date-modified' },
    },

    // ── SOCIAL: REFRAME ── steadier vertical, reframed wide footage, gentle FX.
    'social-reframe': {
        id: 'social-reframe',
        label: 'Social — Reframe',
        generatorMode: 'showreel',
        pacing: {
            shape: 'steady',
            clipSeconds: [0.8, 2.5],
            rhythmPattern: 'breathing',
            beatDivisor: 1,
        },
        transitions: {
            style: 'mixed',
            palette: ['fade', 'dissolve', 'smoothup', 'smoothdown'],
            frequency: 0.3,
            durationMs: 220,
            returns: false,
        },
        color: NEUTRAL_COLOR({ name: 'clean-vertical', temperature: 0.05, saturation: 0.3, contrast: 0.25 }),
        effects: CINEMA_EFFECTS({ glow: 'sparingly', vignette: 12 }),
        caption: { enabled: true, kind: 'lower-third', position: 'bottom', emphasis: 'line', scale: 1.1 },
        aspect: { aspect: '9:16', orientation: 'vertical', letterbox: false },
        audio: { mix: 'ducking', loudnessLUFS: -14, ducking: { enabled: true, depthDb: 9 }, beatSyncStrategy: 'groove-ride' },
        clipOrder: { mode: 'sequential', sequentialBy: 'date-created' },
    },

    // ── SOCIAL: QUOTE ── single big quote, slow, minimal cuts, center text.
    'social-quote': {
        id: 'social-quote',
        label: 'Social — Quote',
        generatorMode: 'video-essay',
        pacing: {
            shape: 'decelerate',
            clipSeconds: [2.0, 5.0],
            rhythmPattern: 'flat',
            beatDivisor: 1,
        },
        transitions: {
            style: 'mixed',
            palette: ['fade', 'dissolve'],
            frequency: 0.15,
            durationMs: 350,
            returns: false,
        },
        color: NEUTRAL_COLOR({ name: 'moody-quote', temperature: -0.1, saturation: -0.2, contrast: 0.35 }),
        effects: CINEMA_EFFECTS({ filmGrain: 5, vignette: 40 }),
        caption: { enabled: true, kind: 'big-quote', position: 'center', emphasis: 'phrase', scale: 1.6 },
        aspect: { aspect: '4:5', orientation: 'vertical', letterbox: false },
        audio: { mix: 'subtle', loudnessLUFS: -16, ducking: { enabled: true, depthDb: 10 }, beatSyncStrategy: 'auto' },
        clipOrder: { mode: 'sequential', sequentialBy: 'filename' },
    },

    // ── SOCIAL: LIST ── enumerated beats, sequential, snappy lower-thirds.
    'social-list': {
        id: 'social-list',
        label: 'Social — List',
        generatorMode: 'trailer',
        pacing: {
            shape: 'steady',
            clipSeconds: [0.7, 2.0],
            rhythmPattern: 'breathing',
            beatDivisor: 1,
        },
        transitions: {
            style: 'mixed',
            palette: ['slideup', 'slidedown', 'wipeleft', 'flash'],
            frequency: 0.4,
            durationMs: 160,
            returns: false,
        },
        color: NEUTRAL_COLOR({ name: 'bright-list', temperature: 0.05, saturation: 0.4, contrast: 0.35 }),
        effects: CINEMA_EFFECTS({ vibrationFlash: 'sparingly', vignette: 8 }),
        caption: { enabled: true, kind: 'lower-third', position: 'bottom', emphasis: 'line', scale: 1.25 },
        aspect: { aspect: '9:16', orientation: 'vertical', letterbox: false },
        audio: { mix: 'ducking', loudnessLUFS: -13, ducking: { enabled: true, depthDb: 8 }, beatSyncStrategy: 'cut-on-beat' },
        clipOrder: { mode: 'sequential', sequentialBy: 'filename' },
    },
};

/** Stable ordered list of every style id (useful for UIs and tests). */
export const STYLE_IDS = Object.keys(RECIPES) as StyleId[];

/** Resolve a recipe by id. Throws on an unknown id so callers fail loudly. */
export function getRecipe(id: StyleId): StyleRecipe {
    const recipe = RECIPES[id];
    if (!recipe) throw new Error(`[styleRecipes] Unknown StyleId: ${String(id)}`);
    return recipe;
}

// ── Projection onto real TrailerSettings ─────────────────────────────────────

/** Translate a 0–1 transition frequency into the engine's transitionStyle +
 *  return-leg frequency. Very busy → transitions-only; quiet → mostly cuts. */
function transitionStyleFor(freq: number, base: TransitionStyle): TransitionStyle {
    if (freq >= 0.55) return 'transitions-only';
    if (freq <= 0.05) return 'cuts-only';
    return base; // 'mixed' for the broad middle band
}

/** Map normalized contrast/grain intents to a film-grain amount the engine reads. */
function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

/**
 * Project a StyleRecipe onto the REAL TrailerSettings knobs. Returns a
 * `Partial<TrailerSettings>` the generator merges over its defaults. Recipe
 * fields without a settings equivalent (loudnessLUFS, ducking depth, caption
 * styling, pacing-curve shape, color fine numbers) are intentionally NOT placed
 * on the returned object — they stay on the recipe for the engine layer.
 *
 * `baseSettings` lets a caller pass through any explicit user overrides; recipe
 * values fill the gaps but never clobber a base value the caller already set.
 */
export function applyRecipeToSettings(
    recipe: StyleRecipe,
    baseSettings: Partial<TrailerSettings> = {},
): Partial<TrailerSettings> {
    const { pacing, transitions, color, effects, aspect, audio, clipOrder } = recipe;

    // Clip-duration bounds from the pacing curve (seconds → settings seconds).
    const [shortest, longest] = pacing.clipSeconds;
    // Guard: at least one frame between the two, and ≥ the renderable floor.
    const minSec = Math.max(6 / DEFAULT_FPS, shortest);
    const maxSec = Math.max(minSec + 1 / DEFAULT_FPS, longest);

    const projected: Partial<TrailerSettings> = {
        generatorMode: recipe.generatorMode,

        // ── Pacing ──
        shortestClip: minSec,
        longestClip: maxSec,
        rhythmPattern: pacing.rhythmPattern,

        // ── Transitions ──
        transitionStyle: transitionStyleFor(transitions.frequency, transitions.style),
        transitionTypes: [...transitions.palette],
        transitionDurationMs: transitions.durationMs,
        returnTransitions: transitions.returns,
        returnTransitionFrequency: clamp(Math.round(transitions.frequency * 100), 0, 100),

        // ── Color ──
        colorPerSection: color.perSection,
        desaturationBuildup: color.desaturationBuildup,

        // ── Effects (policies map 1:1) ──
        motionBlurPolicy: effects.motionBlur,
        glowPolicy: effects.glow,
        rgbSplitPolicy: effects.rgbSplit,
        hueCyclePolicy: effects.hueCycle,
        vhsPolicy: effects.vhs,
        vibrationFlashPolicy: effects.vibrationFlash,
        doubleExposurePolicy: effects.doubleExposure,
        shakePolicy: effects.shake,
        beatDropImpact: effects.beatDropImpact,
        filmGrainAmount: clamp(Math.round(effects.filmGrain), 0, 25),
        vignetteAmount: clamp(Math.round(effects.vignette), 0, 100),

        // Enable the shake subsystem when the policy is anything but 'off'.
        shakeEnabled: effects.shake !== 'off',

        // ── Aspect / orientation ──
        orientationFilter: aspect.orientation,
        letterboxEnabled: aspect.letterbox,

        // ── Audio ──
        audioMixStrategy: audio.mix,
        beatSyncStrategy: audio.beatSyncStrategy,

        // ── Clip ordering ──
        clipOrderMode: clipOrder.mode,
        sequentialBy: clipOrder.sequentialBy,
    };

    // Recipe fills gaps; an explicit base value always wins.
    const merged: Record<string, unknown> = { ...projected };
    for (const [key, value] of Object.entries(baseSettings)) {
        if (value !== undefined) merged[key] = value;
    }
    return merged as Partial<TrailerSettings>;
}
