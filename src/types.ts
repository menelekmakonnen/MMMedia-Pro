import type { TextOverlay } from './lib/textOverlay';
import type { AudioEffects } from './lib/audioEffects';
import type {
    MotionBlurConfig,
    GlowConfig,
    DoubleExposureConfig,
    VibrationFlashConfig,
    RgbSplitConfig,
    HueCycleConfig,
    VhsConfig,
} from './lib/editEffectFilters';

// Project Settings Types
export type ResolutionPreset = '9:16' | '16:9' | '1:1' | '4:3' | '21:9';
export type BackgroundFillMode = 'blur' | 'black';

export interface ProjectResolution {
    width: number;
    height: number;
    label: string;
}

export interface ProjectSettings {
    id: string;
    name: string;
    resolution: ProjectResolution;
    aspectRatio: string;
    fps: number;
    backgroundFillMode: BackgroundFillMode;
    createdAt: string;
    lastModified: string;
    targetDurationSeconds?: number;
    sequenceLoop?: boolean;

    // Contract 4: Randomization
    seed?: string;
    projectType?: 'auto' | 'god-mode' | 'manual';

    // UI Persistence
    sequenceViewSplitHeight?: number;

    // Global Color Grading & Enhancement (shared across Sequence + Generator)
    globalColorGrading?: Record<string, unknown>;
    globalEffects?: Array<{ effectId: string; params: Record<string, number> }>;
}

// Clip Types
export type ClipType = 'video' | 'image' | 'audio' | 'grid';

export interface Asset {
    id: string;
    name: string;
    type: 'effect';
    description?: string;
    thumbnail?: string;
}

export interface Effect extends Asset {
    type: 'effect';
    lumetriPreset?: string; // Lumetri LUT/preset filename
    shader?: string; // CSS filter or WebGL shader name (legacy)
    parameters: Record<string, number | string | boolean>;
}

// ─── Super Editing Engine Types ───────────────────────────────────────────────

export type TransitionType =
    | 'cut' | 'fade' | 'fadewhite' | 'fadeblack' | 'dissolve'
    | 'wipeleft' | 'wiperight' | 'wipeup' | 'wipedown'
    | 'slideleft' | 'slideright' | 'slideup' | 'slidedown'
    | 'circlecrop' | 'circleopen' | 'circleclose'
    | 'pixelize' | 'radial' | 'hblur'
    | 'smoothleft' | 'smoothright' | 'smoothup' | 'smoothdown'
    | 'diagtl' | 'diagtr' | 'diagbl' | 'diagbr'
    | 'squeezeh' | 'squeezev'
    | 'flash' | 'glitch' | 'rgb-split' | 'zoom-through'
    | 'spin' | 'film-burn' | 'whip'
    | 'match-cut' | 'seamless';

export type ShakeType = 'impact' | 'handheld' | 'earthquake' | 'vibration' | 'whip';
export type ZoomSpeed = 'instant' | 'fast' | 'slow' | 'smooth';
export type ZoomCurve = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'snap';
export type SpeedCurvePreset = 'constant' | 'ramp-up' | 'ramp-down' | 's-curve' | 'ramp-freeze' | 'burst-landing' | 'oscillating';
export type BoomerangPresetId = 'classic' | 'slowmo' | 'echo' | 'duo' | 'stutter' | 'whiplash';
export type BeatDropIntensity = 'off' | 'subtle' | 'medium' | 'heavy' | 'maximum';
export type ShakePolicy = 'off' | 'sparingly' | 'on-every-beat' | 'heavy-beats-only';
/** Generic intelligent application policy for trailer edit-effects.
 *  off = never, sparingly = high-impact moments (drops, downbeats, probabilistic),
 *  per-beat = on beat/downbeat-aligned clips, every-clip = on every clip. */
export type EffectApplyPolicy = 'off' | 'sparingly' | 'per-beat' | 'every-clip';
export type TransitionStyle = 'cuts-only' | 'mixed' | 'transitions-only';

export interface ShakeConfig {
    type: ShakeType;
    intensity: number;         // 0-100
    direction: 'horizontal' | 'vertical' | 'radial' | 'rotational' | 'random';
    decayRate: number;         // 1-10 (how fast shake diminishes)
    durationFrames: number;    // How many frames the shake lasts
}

export interface BeatEffectConfig {
    flash?: { intensity: number; color: string; durationFrames: number };
    chromatic?: { offset: number; durationFrames: number };
    shake?: { type: ShakeType; intensity: number };
    zoom?: { punchScale: number; durationFrames: number };
}

export interface AnimatedBlurConfig {
    type: 'gaussian' | 'motion' | 'radial' | 'directional';
    startSigma: number;
    endSigma: number;
    direction?: number;        // degrees, for directional blur
}

export interface ClipTransition {
    type: TransitionType;
    durationFrames: number;
    params?: Record<string, number | string>;
}

export interface SpeedKeyframe {
    time: number;   // 0-1 normalized position within clip
    speed: number;  // multiplier
}

export interface Clip {
    id: string;
    type: ClipType;
    path: string;
    filename: string;

    // Frame-based timing (Source of Truth)
    startFrame: number;      // Timeline In
    endFrame: number;        // Timeline Out
    sourceDurationFrames: number; // Total length of source media
    trimStartFrame: number;  // Source In
    trimEndFrame: number;    // Source Out

    // Metadata
    width?: number;
    height?: number;
    /** Source media's native frame rate. Converts timeline frames <-> source frames
     *  for frame-accurate trim/seek on mixed-fps projects. Falls back to project fps. */
    sourceFps?: number;

    // Playback properties
    track: number;
    speed: number;        // 1.0 = normal (Constant speed)
    volume: number;       // 0-100 (percentage)
    reversed: boolean;
    locked: boolean;
    isPinned?: boolean;   // NEW: Prevents clip from being moved
    isMuted?: boolean;    // NEW: Per-clip mute
    /** Repeat the selected source range to cover this audio clip's timeline slot. */
    loopToTimeline?: boolean;
    disabled?: boolean;   // NEW: Non-destructive deletion (hides from playback/export)
    zoomLevel?: number;   // 100 to 200 percentage (Static fallback)
    zoomStart?: number;   // Dynamic zoom start percentage
    zoomEnd?: number;     // Dynamic zoom end percentage
    zoomOrigin?: 'center' | 'top' | 'bottom' | 'left' | 'right'; // Anchor point for zoom

    // ── Zoom enhancements ──
    zoomSpeed?: ZoomSpeed;          // How quickly zoom is applied
    zoomCurve?: ZoomCurve;          // Easing curve for zoom animation

    // ── Speed system ──
    speedCurvePreset?: SpeedCurvePreset;   // Pre-baked curve shape (Option B)
    speedCurve?: SpeedKeyframe[];          // Keyframed speed (Option A — future graph editor)
    /** Keyframed brightness (-1..1) via the keyframe-everything substrate. */
    brightnessKeyframes?: import('./lib/keyframes').KfPoint[];
    /** Keyframed contrast (0..3, 1 neutral). */
    contrastKeyframes?: import('./lib/keyframes').KfPoint[];
    /** Keyframed saturation (0..3, 1 neutral). */
    saturationKeyframes?: import('./lib/keyframes').KfPoint[];

    // ── Shake system ──
    shake?: ShakeConfig;

    // ── Beat-reactive effects ──
    beatEffect?: BeatEffectConfig;

    // ── Animated blur ──
    blurAnimated?: AnimatedBlurConfig;

    // ── Visual effects ──
    filmGrain?: number;            // 0-25 grain strength
    vignette?: number;             // 0-100 vignette intensity
    letterbox?: boolean;           // Cinematic bars (2.39:1)
    chromaticAberration?: number;  // 0-20 RGB offset pixels
    strobe?: { frequency: number; durationFrames: number };
    echo?: { trailCount: number; opacity: number };

    // ── Advanced edit effects (rendered by editEffectFilters → filterBuilder) ──
    motionBlur?: MotionBlurConfig;         // shutter-style temporal blur
    glow?: GlowConfig;                     // bloom / soft aura
    doubleExposure?: DoubleExposureConfig; // ghosted double-exposure blend
    vibrationFlash?: VibrationFlashConfig; // decaying brightness/saturation punch
    smoothSlowmo?: boolean;                // optical-flow frame interpolation for slow-mo
    rgbSplit?: RgbSplitConfig;             // chromatic / RGB separation (music-video staple)
    hueCycle?: HueCycleConfig;             // continuous hue rotation over time
    vhs?: VhsConfig;                       // retro VHS look (chroma shift + grain)

    // ── Transition to next clip ──
    transition?: ClipTransition;

    // Audio Analysis
    bpm?: number;
    beatMarkers?: { time: number, energy: number }[];
    /** Clip-local beat timestamps (seconds from clip start) for beat-reactive filters */
    beatTimestamps?: number[];

    // Asset References

    effectIds?: string[]; // Applied in order

    // Metadata
    metadata?: {
        width: number;
        height: number;
        fps: number;
        format: string;
    };

    // Ownership (Contract 5)
    origin?: 'auto' | 'manual';



    // Source orientation for rendering decisions
    sourceOrientation?: 'horizontal' | 'vertical' | 'square';

    // Persistent rotation (0/90/180/270 degrees) — applied in preview AND export
    rotation?: 0 | 90 | 180 | 270;

    // Boomerang (damped-bounce forward↔reverse effect)
    boomerang?: boolean;
    boomerangPreset?: BoomerangPresetId;

    // Parametric effects (new system — each with adjustable params)
    parametricEffects?: Array<{
        effectId: string;
        params: Record<string, number | string | boolean>;
    }>;

    // Color grading
    colorGrading?: import('./lib/colorGrading').ColorGrading;

    // Quick transform tools
    flipH?: boolean;
    flipV?: boolean;
    sharpen?: number;       // 0 = off, 0.5-3.0 = strength
    blurAmount?: number;    // 0 = off, 0.5-20 = sigma

    // Chroma key (green screen removal)
    chromaKey?: {
        enabled: boolean;
        color: string;      // hex color (e.g. '#00ff00')
        similarity: number; // 0.01-1.0
        blend: number;      // 0.0-1.0
    };

    // ── Compositing transform (for PiP, Split Screen, multi-track compositing) ──
    /** Scale 0-100 as percentage of frame (100 = full frame). Defaults to 100. */
    compositeScale?: number;
    /** X position as percentage of frame (-50 to 150). 50 = centered. */
    compositeX?: number;
    /** Y position as percentage of frame (-50 to 150). 50 = centered. */
    compositeY?: number;
    /** Composite opacity 0-100. Defaults to 100. */
    compositeOpacity?: number;
    /** Border radius for the composited clip in px. */
    compositeBorderRadius?: number;
    /** Whether this clip should render as an overlay on top of lower tracks. */
    compositeOverlay?: boolean;

    // Video stabilization
    stabilize?: {
        enabled: boolean;
        smoothing: number;  // 1-60, default 10
    };

    // Linkage
    mediaLibraryId?: string; // ID of the MediaFile this clip was created from

    // Text Overlays (rendered via FFmpeg drawtext during export)
    textOverlays?: TextOverlay[];

    // Audio Effects (EQ, compression, noise reduction, etc.)
    audioEffects?: AudioEffects;
}

export interface GridCell {
    id: string; // Internal cell id
    clip: Clip | null; // Legacy — single clip for backward compatibility
    clips: Clip[]; // Mini-timeline — ordered list of clips in sequence
    x: number; // 0-1 percentage
    y: number; // 0-1 percentage
    width: number; // 0-1 percentage
    height: number; // 0-1 percentage
}

export type GridFormat = 'horizontal' | 'vertical' | 'square';

export interface GridClip extends Clip {
    type: 'grid';
    gridFormat: GridFormat;
    numCells: number; // 2 to 12
    cells: GridCell[];
    backgroundMode: BackgroundFillMode;
    // Global grid playback sync
    globalShuffle?: boolean;
    globalFlux?: boolean;
}


// ─── Canonical EditDocument Schema ────────────────────────────────────────────

export interface EffectRecipe {
    id: string;
    name: string;
    effectIds: string[];
    parametricEffects?: Array<{
        effectId: string;
        params: Record<string, number | string | boolean>;
    }>;
    colorGrading?: import('./lib/colorGrading').ColorGrading;
    filmGrain?: number;
    vignette?: number;
    chromaticAberration?: number;
    sharpen?: number;
    blurAmount?: number;
}

export interface EditDocument {
    version: string;                        // Schema version (e.g. "2.0.0")
    project: {
        name: string;
        resolution: { width: number; height: number; label?: string };
        aspectRatio: string;
        fps: number;
        seed?: string;
        backgroundFillMode: BackgroundFillMode;
        targetDurationSeconds?: number;
        sequenceLoop?: boolean;
    };
    clips: Clip[];
    transitionStrategy: string;
    trackMutes: Record<number, boolean>;
    trackVolumes: Record<number, number>;
    styleDNA?: {
        id: string;
        name: string;
        cutDensity: number;
        zoomStrategy: 'none' | 'subtle' | 'aggressive' | 'ken-burns';
        transitionAggression: number;
        colorMood: string;
        audioStrategy: 'beat-sync' | 'free' | 'rhythmic';
        effectIntensity: number;
        speedRange: [number, number];
        createdAt: string;
    };
    effectRecipes?: EffectRecipe[];
}


export type TabId = 'dashboard' | 'media' | 'trailer' | 'timeline' | 'grideditor' | 'export' | 'sequence' | 'videoplayer' | 'edits' | 'global-settings';
