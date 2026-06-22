/**
 * Keyframe System — Comprehensive property animation with Bézier easing.
 * ════════════════════════════════════════════════════════════════════════════
 * Provides keyframed animation for any numeric clip property:
 *   • Position (x, y)
 *   • Scale (uniform or independent x/y)
 *   • Rotation (degrees)
 *   • Opacity (0-1)
 *   • Volume (0-100)
 *   • Speed (0.1-16)
 *   • Any effect parameter (blur, grain, etc.)
 *
 * Each keyframe defines a value at a specific time with a Bézier easing curve
 * for interpolation to the next keyframe.
 */

import { v4 as uuidv4 } from 'uuid';

// ─── Bézier Curve Types ──────────────────────────────────────────────────────

export interface BezierCurve {
    /** Control point 1 (x, y) — both 0-1 */
    cp1: [number, number];
    /** Control point 2 (x, y) — both 0-1 */
    cp2: [number, number];
}

/** Pre-built easing curves */
export const EASING_PRESETS: Record<string, BezierCurve> = {
    'linear':           { cp1: [0, 0],       cp2: [1, 1] },
    'ease':             { cp1: [0.25, 0.1],  cp2: [0.25, 1] },
    'ease-in':          { cp1: [0.42, 0],    cp2: [1, 1] },
    'ease-out':         { cp1: [0, 0],       cp2: [0.58, 1] },
    'ease-in-out':      { cp1: [0.42, 0],    cp2: [0.58, 1] },
    'ease-in-back':     { cp1: [0.6, -0.28], cp2: [0.735, 0.045] },
    'ease-out-back':    { cp1: [0.175, 0.885], cp2: [0.32, 1.275] },
    'ease-in-out-back': { cp1: [0.68, -0.55], cp2: [0.265, 1.55] },
    'ease-in-quad':     { cp1: [0.55, 0.085], cp2: [0.68, 0.53] },
    'ease-out-quad':    { cp1: [0.25, 0.46], cp2: [0.45, 0.94] },
    'ease-in-cubic':    { cp1: [0.55, 0.055], cp2: [0.675, 0.19] },
    'ease-out-cubic':   { cp1: [0.215, 0.61], cp2: [0.355, 1] },
    'ease-in-expo':     { cp1: [0.95, 0.05], cp2: [0.795, 0.035] },
    'ease-out-expo':    { cp1: [0.19, 1],    cp2: [0.22, 1] },
    'snap':             { cp1: [0.9, 0],     cp2: [1, 1] },
    'anticipate':       { cp1: [0.36, 0],    cp2: [0.66, -0.56] },
    'overshoot':        { cp1: [0.34, 1.56], cp2: [0.64, 1] },
    'bounce':           { cp1: [0.215, 0.61], cp2: [0.355, 1] },
    'elastic':          { cp1: [0.68, -0.55], cp2: [0.265, 1.55] },
    'spring':           { cp1: [0.175, 0.885], cp2: [0.32, 1.275] },
};

export type EasingPreset = keyof typeof EASING_PRESETS;

// ─── Keyframe Types ──────────────────────────────────────────────────────────

export interface Keyframe {
    id: string;
    /** Time position (0-1 normalized within clip duration) */
    time: number;
    /** Value at this keyframe */
    value: number;
    /** Easing curve to the NEXT keyframe */
    easing: BezierCurve;
    /** Optional: named easing preset this was derived from */
    easingPreset?: EasingPreset;
}

export interface KeyframeTrack {
    /** Property being animated */
    property: string;
    /** Display name */
    label: string;
    /** Value range for UI */
    min: number;
    max: number;
    /** Default value (when no keyframes are set) */
    defaultValue: number;
    /** Keyframes sorted by time */
    keyframes: Keyframe[];
}

export type KeyframeData = Record<string, Keyframe[]>;

// ─── Bézier Evaluation (Newton-Raphson) ──────────────────────────────────────

/** Number of Newton-Raphson iterations for solving t from x. */
const NR_ITERATIONS = 8;
/** Fallback to bisection if Newton step fails to converge within this delta. */
const NR_EPSILON = 1e-7;
/** Bisection iterations when Newton-Raphson overshoots. */
const BISECT_ITERATIONS = 20;

/**
 * Evaluate a cubic Bézier curve component at parameter t (0-1).
 * Given two control values (c1, c2) with endpoints fixed at 0 and 1:
 *   B(t) = 3(1-t)²·t·c1 + 3(1-t)·t²·c2 + t³
 */
function cubicBezierComponent(c1: number, c2: number, t: number): number {
    const mt = 1 - t;
    return 3 * mt * mt * t * c1 + 3 * mt * t * t * c2 + t * t * t;
}

/**
 * Derivative of the cubic Bézier component with respect to t.
 *   B'(t) = 3(1-t)²·c1 + 6(1-t)·t·(c2-c1) + 3t²·(1-c2)
 */
function cubicBezierDerivative(c1: number, c2: number, t: number): number {
    const mt = 1 - t;
    return 3 * mt * mt * c1 + 6 * mt * t * (c2 - c1) + 3 * t * t * (1 - c2);
}

/**
 * Solve for the parameter t that produces a given x value on the Bézier x-axis.
 * Uses Newton-Raphson with bisection fallback for robustness.
 */
function solveBezierT(x1: number, x2: number, x: number): number {
    // Quick exits for boundary values
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    // Newton-Raphson: converges fast for well-behaved curves
    let t = x; // Initial guess: identity
    for (let i = 0; i < NR_ITERATIONS; i++) {
        const currentX = cubicBezierComponent(x1, x2, t) - x;
        if (Math.abs(currentX) < NR_EPSILON) return t;

        const derivative = cubicBezierDerivative(x1, x2, t);
        if (Math.abs(derivative) < 1e-12) break; // Derivative too flat, fall through to bisection

        t -= currentX / derivative;

        // Clamp if Newton step leaves [0,1]
        if (t < 0) t = 0;
        if (t > 1) t = 1;
    }

    // Bisection fallback for degenerate curves (overshoot, elastic, etc.)
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < BISECT_ITERATIONS; i++) {
        const currentX = cubicBezierComponent(x1, x2, t);
        if (Math.abs(currentX - x) < NR_EPSILON) return t;
        if (currentX < x) {
            lo = t;
        } else {
            hi = t;
        }
        t = (lo + hi) / 2;
    }
    return t;
}

/**
 * Evaluate a cubic Bézier curve at parameter t (0-1).
 * Returns the y-value (eased progress).
 *
 * The curve has implicit endpoints P0=(0,0) and P3=(1,1), with two control
 * points cp1 and cp2 defining the shape. This mirrors CSS cubic-bezier().
 *
 * Uses Newton-Raphson to solve for the parametric t from the x-axis input,
 * then evaluates the y-axis at that t.
 */
export function evaluateBezier(curve: BezierCurve, t: number): number {
    // Clamp input
    if (t <= 0) return 0;
    if (t >= 1) return 1;

    // Linear shortcut
    const [x1, y1] = curve.cp1;
    const [x2, y2] = curve.cp2;
    if (x1 === 0 && y1 === 0 && x2 === 1 && y2 === 1) return t;

    // Solve for parametric t along x-axis, then evaluate y-axis
    const parametricT = solveBezierT(x1, x2, t);
    return cubicBezierComponent(y1, y2, parametricT);
}

// ─── Keyframe Interpolation ──────────────────────────────────────────────────

/**
 * Interpolate between two keyframes at a given normalized time.
 * Uses the outgoing keyframe's easing curve.
 *
 * @param kf1  - The keyframe at or before `time`
 * @param kf2  - The keyframe after `time`
 * @param time - Normalized time position (0-1, within clip duration)
 * @returns      Interpolated value at `time`
 */
export function interpolateKeyframes(kf1: Keyframe, kf2: Keyframe, time: number): number {
    // Degenerate: same time → return kf1's value
    if (kf2.time === kf1.time) return kf1.value;

    // Normalize time into [0, 1] between the two keyframes
    const localT = (time - kf1.time) / (kf2.time - kf1.time);
    const clampedT = Math.max(0, Math.min(1, localT));

    // Apply easing curve
    const easedT = evaluateBezier(kf1.easing, clampedT);

    // Linear value interpolation with eased progress
    return kf1.value + (kf2.value - kf1.value) * easedT;
}

/**
 * Get the interpolated value of a keyframe track at a given time.
 * Handles: before first keyframe (hold first value), after last (hold last),
 * between keyframes (Bézier interpolation).
 *
 * @param track - The keyframe track to evaluate
 * @param time  - Normalized time (0-1)
 * @returns       Interpolated value, clamped to track min/max
 */
export function getKeyframeValue(track: KeyframeTrack, time: number): number {
    const { keyframes, defaultValue, min, max } = track;

    // No keyframes → return default
    if (!keyframes || keyframes.length === 0) return defaultValue;

    // Single keyframe → hold that value
    if (keyframes.length === 1) return keyframes[0].value;

    // Before first keyframe → hold first value
    if (time <= keyframes[0].time) return keyframes[0].value;

    // After last keyframe → hold last value
    if (time >= keyframes[keyframes.length - 1].time) {
        return keyframes[keyframes.length - 1].value;
    }

    // Find surrounding keyframes (keyframes are pre-sorted by time)
    let i = 0;
    while (i < keyframes.length - 1 && keyframes[i + 1].time <= time) i++;

    const value = interpolateKeyframes(keyframes[i], keyframes[i + 1], time);

    // Clamp to track range
    return Math.max(min, Math.min(max, value));
}

// ─── Keyframe CRUD ───────────────────────────────────────────────────────────

/**
 * Create a new keyframe with a default easing.
 *
 * @param time   - Normalized time position (0-1)
 * @param value  - Value at this keyframe
 * @param easing - A BezierCurve object or an EasingPreset name (default: 'ease')
 * @returns        A new Keyframe with a unique id
 */
export function createKeyframe(
    time: number,
    value: number,
    easing?: BezierCurve | EasingPreset,
): Keyframe {
    let curve: BezierCurve;
    let presetName: EasingPreset | undefined;

    if (typeof easing === 'string') {
        // Look up the named preset
        const preset = EASING_PRESETS[easing];
        if (!preset) {
            throw new Error(`Unknown easing preset: "${easing}". Available: ${Object.keys(EASING_PRESETS).join(', ')}`);
        }
        curve = { cp1: [...preset.cp1], cp2: [...preset.cp2] };
        presetName = easing;
    } else if (easing) {
        // Use provided BezierCurve directly
        curve = { cp1: [...easing.cp1], cp2: [...easing.cp2] };
    } else {
        // Default to 'ease'
        const defaultPreset = EASING_PRESETS['ease'];
        curve = { cp1: [...defaultPreset.cp1], cp2: [...defaultPreset.cp2] };
        presetName = 'ease';
    }

    return {
        id: uuidv4(),
        time: Math.max(0, Math.min(1, time)),
        value,
        easing: curve,
        ...(presetName ? { easingPreset: presetName } : {}),
    };
}

/**
 * Add a keyframe to a track, maintaining sort order by time.
 * Returns a new KeyframeTrack (immutable update).
 *
 * @param track    - The track to add the keyframe to
 * @param keyframe - The keyframe to insert
 * @returns          A new track with the keyframe inserted in sorted position
 */
export function addKeyframeToTrack(track: KeyframeTrack, keyframe: Keyframe): KeyframeTrack {
    const newKeyframes = [...track.keyframes, keyframe].sort((a, b) => a.time - b.time);
    return { ...track, keyframes: newKeyframes };
}

/**
 * Remove a keyframe from a track by id.
 * Returns a new KeyframeTrack (immutable update).
 *
 * @param track      - The track to remove from
 * @param keyframeId - The id of the keyframe to remove
 * @returns            A new track without the specified keyframe
 */
export function removeKeyframeFromTrack(track: KeyframeTrack, keyframeId: string): KeyframeTrack {
    return {
        ...track,
        keyframes: track.keyframes.filter((kf) => kf.id !== keyframeId),
    };
}

// ─── Animatable Property Definitions ─────────────────────────────────────────

/**
 * Get all standard animatable properties with their ranges.
 * Returns empty tracks (no keyframes) for each property — ready for the UI
 * to populate or for a clip to store.
 */
export function getAnimatableProperties(): KeyframeTrack[] {
    return [
        { property: 'position_x',  label: 'Position X',  min: -100, max: 100,  defaultValue: 0,   keyframes: [] },
        { property: 'position_y',  label: 'Position Y',  min: -100, max: 100,  defaultValue: 0,   keyframes: [] },
        { property: 'scale',       label: 'Scale',       min: 10,   max: 400,  defaultValue: 100, keyframes: [] },
        { property: 'rotation',    label: 'Rotation',    min: 0,    max: 360,  defaultValue: 0,   keyframes: [] },
        { property: 'opacity',     label: 'Opacity',     min: 0,    max: 100,  defaultValue: 100, keyframes: [] },
        { property: 'volume',      label: 'Volume',      min: 0,    max: 100,  defaultValue: 100, keyframes: [] },
        { property: 'speed',       label: 'Speed',       min: 10,   max: 1600, defaultValue: 100, keyframes: [] },
        { property: 'blur',        label: 'Blur',        min: 0,    max: 20,   defaultValue: 0,   keyframes: [] },
        { property: 'grain',       label: 'Grain',       min: 0,    max: 25,   defaultValue: 0,   keyframes: [] },
        { property: 'vignette',    label: 'Vignette',    min: 0,    max: 100,  defaultValue: 0,   keyframes: [] },
        { property: 'brightness',  label: 'Brightness',  min: -100, max: 100,  defaultValue: 0,   keyframes: [] },
        { property: 'contrast',    label: 'Contrast',    min: 0,    max: 300,  defaultValue: 100, keyframes: [] },
        { property: 'saturation',  label: 'Saturation',  min: 0,    max: 300,  defaultValue: 100, keyframes: [] },
        { property: 'temperature', label: 'Temperature', min: -100, max: 100,  defaultValue: 0,   keyframes: [] },
    ];
}
