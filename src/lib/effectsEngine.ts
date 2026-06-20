/**
 * Effects Engine — Core visual-effects pipeline for the Super Editing Engine
 *
 * Provides:
 *  1. IMPACT_PRESETS        – Intensity tiers for beat-drop effects
 *  2. generateShakeOffsets  – Per-frame camera-shake trajectories (5 algorithms)
 *  3. generateZoomKeyframes – Per-frame scale values (5 easing curves)
 *  4. generateSpeedSubClips – Pre-baked speed curves as sub-clip sequences (Option B)
 *  5. applyBeatEffects      – Stamps BeatEffectConfig onto clips at beat positions
 *
 * Design mirrors `boomerang.ts`: pure functions, sub-clip IDs follow `{id}_spd_{i}`,
 * and every expansion preserves the parent clip's effects / path / metadata.
 */

import type {
    Clip,
    ShakeType,
    ZoomCurve,
    SpeedCurvePreset,
    SpeedKeyframe,
    BeatEffectConfig,
    BeatDropIntensity,
} from '../types';

// ─── 1. Impact Presets ────────────────────────────────────────────────────────

export interface ImpactPreset {
    zoom: number;           // punch-in scale (1.0 = none)
    flash: number;          // 0-1 flash intensity
    shake: number;          // shake amplitude (px)
    chromatic: number;      // RGB-split offset (px)
    durationFrames: number; // how many frames the impact lasts
}

export const IMPACT_PRESETS: Record<BeatDropIntensity, ImpactPreset> = {
    off:     { zoom: 1.0,  flash: 0,   shake: 0,  chromatic: 0,  durationFrames: 0 },
    subtle:  { zoom: 1.05, flash: 0.3, shake: 5,  chromatic: 0,  durationFrames: 3 },
    medium:  { zoom: 1.10, flash: 0.6, shake: 12, chromatic: 3,  durationFrames: 4 },
    heavy:   { zoom: 1.15, flash: 0.9, shake: 20, chromatic: 6,  durationFrames: 5 },
    maximum: { zoom: 1.25, flash: 1.0, shake: 30, chromatic: 10, durationFrames: 6 },
};

// ─── 2. Shake Offset Generation ───────────────────────────────────────────────

export interface ShakeOffset {
    x: number;
    y: number;
}

/**
 * Deterministic pseudo-random seeded from frame index.
 * Produces values in [-1, 1].
 */
function seededRandom(seed: number): number {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
}

/**
 * Simplex-style smooth noise using chained sine waves.
 * Returns value in roughly [-1, 1].
 */
function smoothNoise(t: number, freq1: number = 1.3, freq2: number = 0.7): number {
    return (
        Math.sin(t * freq1) +
        Math.sin(t * freq2 * 0.7) +
        Math.sin(t * freq1 * 1.6 + 0.5)
    ) / 3;
}

/**
 * Generate per-frame camera-shake offsets.
 *
 * @param type           Shake algorithm
 * @param intensity      0-100 — linearly scales max amplitude
 * @param durationFrames Number of frames the shake lasts
 * @param fps            Frames per second (for Hz-based calculations)
 * @returns One {x, y} offset per frame
 */
export function generateShakeOffsets(
    type: ShakeType,
    intensity: number,
    durationFrames: number,
    fps: number,
): ShakeOffset[] {
    if (durationFrames <= 0 || intensity <= 0) return [];

    const clampedIntensity = Math.max(0, Math.min(100, intensity));
    const amplitude = (clampedIntensity / 100) * 30; // max 30px at intensity 100
    const offsets: ShakeOffset[] = [];

    for (let f = 0; f < durationFrames; f++) {
        const t = f / Math.max(1, durationFrames - 1); // 0→1 normalised time
        const tSec = f / fps;                          // real seconds

        let x = 0;
        let y = 0;

        switch (type) {
            // ── Impact: Exponential decay from max amplitude ──────────
            case 'impact': {
                const decayRate = 4;
                const envelope = amplitude * Math.exp(-decayRate * t);
                const angle = seededRandom(f * 7) * Math.PI * 2;
                x = Math.cos(angle) * envelope;
                y = Math.sin(angle) * envelope;
                break;
            }

            // ── Handheld: Smooth, low-amplitude organic drift ────────
            case 'handheld': {
                const handAmp = 2 + (amplitude / 30) * 6; // 2-8px range
                x = smoothNoise(tSec * 2.5, 1.3, 0.7) * handAmp;
                y = smoothNoise(tSec * 2.5 + 100, 1.1, 0.9) * handAmp;
                break;
            }

            // ── Earthquake: Low-freq sine, primarily Y-axis ──────────
            case 'earthquake': {
                const quakeFreq = 1.5 + seededRandom(f) * 1.5; // 1-3 Hz
                y = Math.sin(tSec * quakeFreq * Math.PI * 2) * amplitude;
                x = Math.sin(tSec * quakeFreq * Math.PI * 2 + 0.8) * amplitude * 0.3;
                break;
            }

            // ── Vibration: Very high frequency, very low amplitude ───
            case 'vibration': {
                const vibAmp = 1 + (amplitude / 30) * 2; // 1-3px range
                x = seededRandom(f * 13) * vibAmp;
                y = seededRandom(f * 17 + 3) * vibAmp;
                break;
            }

            // ── Whip: Single directional sweep, no decay ─────────────
            case 'whip': {
                // Sweep from -amplitude to +amplitude on X axis
                x = -amplitude + (2 * amplitude * t);
                y = 0;
                break;
            }
        }

        offsets.push({
            x: Math.round(x * 100) / 100,
            y: Math.round(y * 100) / 100,
        });
    }

    return offsets;
}

// ─── 3. Zoom Keyframe Generation ──────────────────────────────────────────────

/**
 * Apply an easing curve to a normalised time value [0, 1].
 */
function applyCurve(t: number, curve: ZoomCurve): number {
    const clamped = Math.max(0, Math.min(1, t));

    switch (curve) {
        case 'linear':
            return clamped;
        case 'ease-in':
            return clamped * clamped;
        case 'ease-out':
            return 1 - (1 - clamped) * (1 - clamped);
        case 'ease-in-out':
            return 3 * clamped * clamped - 2 * clamped * clamped * clamped; // smoothstep
        case 'snap': {
            // 90% of change in first ~20% of duration, then ease remainder
            if (clamped < 0.2) {
                return (clamped / 0.2) * 0.9;
            }
            return 0.9 + (1 - (1 - (clamped - 0.2) / 0.8) ** 2) * 0.1;
        }
        default:
            return clamped;
    }
}

/**
 * Generate per-frame scale values for a zoom animation.
 *
 * @param startScale     Initial scale (e.g. 1.0)
 * @param endScale       Target scale (e.g. 1.2)
 * @param durationFrames Number of frames
 * @param curve          Easing curve name
 * @returns Array of scale values, one per frame
 */
export function generateZoomKeyframes(
    startScale: number,
    endScale: number,
    durationFrames: number,
    curve: ZoomCurve,
): number[] {
    if (durationFrames <= 0) return [];
    if (durationFrames === 1) return [startScale];

    const keyframes: number[] = [];
    const delta = endScale - startScale;

    for (let f = 0; f < durationFrames; f++) {
        const t = f / (durationFrames - 1); // 0→1
        const eased = applyCurve(t, curve);
        keyframes.push(
            Math.round((startScale + delta * eased) * 10000) / 10000,
        );
    }

    return keyframes;
}

// ─── 4. Speed Curve Engine (Option A — true keyframed time-remap) ─────────────
//
// A speed curve is a NORMALIZED velocity SHAPE over the clip's source window
// (position u ∈ [0,1] → relative speed). At render time the shape is rescaled so
// the clip still consumes exactly its source window and fills exactly its
// timeline slot — only the *velocity* varies. This means:
//   • ramps are continuous (smooth) instead of 3–5 visible speed steps,
//   • the clip's duration / beat-alignment never drifts, and
//   • the clip's audio is unaffected (its average speed is preserved).
//
// The render path consumes `buildSpeedRemapSetpts` (a single continuous FFmpeg
// `setpts` expression). `generateSpeedSubClips` is kept as a baking fallback for
// code paths that prefer discrete clips, but now subdivides finely.

const SPEED_MIN = 0.05;
const SPEED_MAX = 16;

/** Normalized velocity shapes (source position 0→1 ⇒ relative speed). */
export const SPEED_CURVE_KEYFRAMES: Record<SpeedCurvePreset, SpeedKeyframe[]> = {
    'constant':      [{ time: 0, speed: 1.0 }, { time: 1, speed: 1.0 }],
    'ramp-up':       [{ time: 0, speed: 0.5 }, { time: 1, speed: 1.6 }],
    'ramp-down':     [{ time: 0, speed: 1.6 }, { time: 1, speed: 0.5 }],
    's-curve':       [{ time: 0, speed: 0.7 }, { time: 0.5, speed: 1.4 }, { time: 1, speed: 0.7 }],
    'ramp-freeze':   [{ time: 0, speed: 1.2 }, { time: 0.45, speed: 1.0 }, { time: 0.5, speed: 0.12 }, { time: 0.55, speed: 1.0 }, { time: 1, speed: 1.2 }],
    'burst-landing': [{ time: 0, speed: 2.4 }, { time: 0.32, speed: 0.3 }, { time: 0.55, speed: 0.5 }, { time: 1, speed: 1.0 }],
    'oscillating':   [{ time: 0, speed: 1.6 }, { time: 0.25, speed: 0.5 }, { time: 0.5, speed: 1.6 }, { time: 0.75, speed: 0.5 }, { time: 1, speed: 1.6 }],
};

/** Get the keyframe shape for a preset (falls back to constant). */
export function presetToKeyframes(preset: SpeedCurvePreset): SpeedKeyframe[] {
    return SPEED_CURVE_KEYFRAMES[preset] ?? SPEED_CURVE_KEYFRAMES.constant;
}

/** Sanitize a keyframe list: clamp speeds, sort, and guarantee 0/1 endpoints. */
export function normalizeKeyframes(curve: SpeedKeyframe[]): SpeedKeyframe[] {
    if (!curve || curve.length === 0) return [{ time: 0, speed: 1 }, { time: 1, speed: 1 }];
    const pts = curve
        .map(k => ({ time: Math.max(0, Math.min(1, k.time)), speed: Math.max(SPEED_MIN, Math.min(SPEED_MAX, k.speed)) }))
        .sort((a, b) => a.time - b.time);
    if (pts[0].time > 0) pts.unshift({ time: 0, speed: pts[0].speed });
    if (pts[pts.length - 1].time < 1) pts.push({ time: 1, speed: pts[pts.length - 1].speed });
    return pts;
}

/** Sample the (piecewise-linear) speed shape at normalized position u ∈ [0,1]. */
export function sampleSpeedAt(curve: SpeedKeyframe[], u: number): number {
    const pts = normalizeKeyframes(curve);
    const x = Math.max(0, Math.min(1, u));
    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        if (x >= a.time && x <= b.time) {
            const span = b.time - a.time;
            if (span <= 1e-9) return a.speed;
            const f = (x - a.time) / span;
            return a.speed + (b.speed - a.speed) * f;
        }
    }
    return pts[pts.length - 1].speed;
}

/** ∫₀¹ du / s(u) for the shape — used to rescale so the clip fits its slot. */
function integrateInverseShape(pts: SpeedKeyframe[]): number {
    let R = 0;
    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const du = b.time - a.time;
        if (du <= 1e-9) continue;
        const m = (b.speed - a.speed) / du;
        // ∫ du/(a + m·u') over the segment width du:
        R += Math.abs(m) > 1e-9
            ? (1 / m) * Math.log(b.speed / a.speed)
            : du / a.speed;
    }
    return R;
}

/**
 * Build a continuous FFmpeg `setpts` value implementing a true variable-speed
 * time-remap that maps the source window (0…srcDurSec) onto an output of
 * srcDurSec/avgSpeed seconds. The expression is exact for piecewise-linear
 * shapes (the integral of 1/speed), so motion ramps are perfectly smooth.
 *
 * @returns the value string to use as `setpts=<value>`, or null for constant.
 */
export function buildSpeedRemapSetpts(
    curve: SpeedKeyframe[],
    srcDurSec: number,
    avgSpeed = 1.0,
): string | null {
    const pts = normalizeKeyframes(curve);
    // Detect trivial (flat) curves → caller should use the constant path.
    const flat = pts.every(p => Math.abs(p.speed - pts[0].speed) < 1e-6);
    if (flat || srcDurSec <= 0) return null;

    const R = integrateInverseShape(pts);
    if (R <= 0) return null;
    // Scale so total output = srcDurSec / avgSpeed (clip fits its slot exactly).
    const k = R * Math.max(SPEED_MIN, avgSpeed);

    // Build per-segment data in SOURCE SECONDS with rescaled actual speeds.
    const t: number[] = pts.map(p => p.time * srcDurSec);
    const a: number[] = pts.map(p => k * p.speed);
    const C: number[] = [0]; // cumulative output seconds at each breakpoint
    for (let i = 0; i < pts.length - 1; i++) {
        const dt = t[i + 1] - t[i];
        const m = dt > 1e-9 ? (a[i + 1] - a[i]) / dt : 0;
        const seg = Math.abs(m) > 1e-9 ? (1 / m) * Math.log(a[i + 1] / a[i]) : dt / a[i];
        C.push(C[i] + seg);
    }

    const f = (n: number) => n.toFixed(6);
    // Output-seconds expression for source-time T within segment i.
    const within = (i: number): string => {
        const dt = t[i + 1] - t[i];
        const m = dt > 1e-9 ? (a[i + 1] - a[i]) / dt : 0;
        if (Math.abs(m) > 1e-9) {
            // C_i + (1/m)·ln( (a_i + m·(T - t_i)) / a_i )
            return `(${f(C[i])}+(${f(1 / m)})*log((${f(a[i])}+(${f(m)})*(T-${f(t[i])}))/${f(a[i])}))`;
        }
        // C_i + (T - t_i)/a_i
        return `(${f(C[i])}+(T-${f(t[i])})/${f(a[i])})`;
    };

    // Nested if() selecting the segment by source time T (last segment clamps).
    let expr = within(pts.length - 2);
    for (let i = pts.length - 3; i >= 0; i--) {
        expr = `if(lt(T,${f(t[i + 1])}),${within(i)},${expr})`;
    }
    // setpts expects output PTS in timebase units. CRITICAL: the expression
    // contains commas (if()/lt()), and in an FFmpeg filtergraph a bare comma ends
    // the filter — so every comma inside the expression must be escaped as "\,".
    // This escaping is honored identically by -vf, -filter_complex, and
    // -filter_complex_script.
    return `(${expr})/TB`.replace(/,/g, '\\,');
}

/** Does this preset/curve actually slow the footage below 1× anywhere? */
export function curveHasSlowdown(curve: SpeedKeyframe[]): boolean {
    return normalizeKeyframes(curve).some(p => p.speed < 0.98);
}

/**
 * Attach a speed curve to a clip for the continuous render path.
 * The clip keeps its timeline slot; only its internal velocity ramps.
 */
export function applySpeedCurve(clip: Clip, preset: SpeedCurvePreset): Clip {
    if (preset === 'constant') return { ...clip, speedCurvePreset: 'constant', speedCurve: undefined };
    return { ...clip, speedCurvePreset: preset, speedCurve: presetToKeyframes(preset) };
}

/**
 * Bake a speed curve into finely-subdivided constant-speed sub-clips.
 * Kept for code paths that prefer discrete clips; uses many small steps so the
 * ramp still reads as smooth. Preserves the clip's source window and overall
 * duration (average speed = clip.speed). IDs follow `{id}_spd_{i}`.
 */
export function generateSpeedSubClips(
    clip: Clip,
    curvePreset: SpeedCurvePreset,
    fps: number,
    steps = 16,
): Clip[] {
    if (curvePreset === 'constant') return [clip];

    const sourceDurationFrames = clip.trimEndFrame - clip.trimStartFrame;
    if (sourceDurationFrames <= 0) return [clip];

    const pts = presetToKeyframes(curvePreset);
    const R = integrateInverseShape(pts);
    if (R <= 0) return [clip];
    const baseSpeed = clip.speed || 1.0;
    const k = R * baseSpeed; // rescale so overall duration matches a constant-speed clip

    const minSubDuration = Math.max(2, Math.round(fps * 0.066));
    const n = Math.max(2, Math.min(64, steps));
    const subClips: Clip[] = [];
    let sourceHead = clip.trimStartFrame;
    let timelineHead = clip.startFrame;

    for (let i = 0; i < n; i++) {
        const u0 = i / n;
        const u1 = (i + 1) / n;
        const uMid = (u0 + u1) / 2;
        const segSpeed = Math.max(SPEED_MIN, Math.min(SPEED_MAX, k * sampleSpeedAt(pts, uMid)));

        const actualSourceEnd = i === n - 1
            ? clip.trimEndFrame
            : Math.min(clip.trimStartFrame + Math.round(sourceDurationFrames * u1), clip.trimEndFrame);
        const actualSourceFrames = actualSourceEnd - sourceHead;
        if (actualSourceFrames < 1) continue;

        const timelineDuration = Math.max(minSubDuration, Math.round(actualSourceFrames / segSpeed));

        subClips.push({
            ...clip,
            id: `${clip.id}_spd_${i}`,
            trimStartFrame: sourceHead,
            trimEndFrame: actualSourceEnd,
            startFrame: timelineHead,
            endFrame: timelineHead + timelineDuration,
            speed: Math.round(segSpeed * 1000) / 1000,
            speedCurvePreset: 'constant',
            speedCurve: undefined,
            origin: 'auto' as const,
        });

        sourceHead = actualSourceEnd;
        timelineHead += timelineDuration;
    }

    return subClips.length > 0 ? subClips : [clip];
}

// ─── 5. Beat-Reactive Effect Application ──────────────────────────────────────

/**
 * Scale an impact preset's numeric values by a factor.
 */
function scalePreset(preset: ImpactPreset, factor: number): BeatEffectConfig {
    return {
        flash: {
            intensity: Math.round(preset.flash * factor * 100) / 100,
            color: '#ffffff',
            durationFrames: preset.durationFrames,
        },
        chromatic: {
            offset: Math.round(preset.chromatic * factor * 100) / 100,
            durationFrames: preset.durationFrames,
        },
        shake: {
            type: 'impact' as const,
            intensity: Math.round(preset.shake * factor * 100) / 100,
        },
        zoom: {
            punchScale: 1 + (preset.zoom - 1) * factor,
            durationFrames: preset.durationFrames,
        },
    };
}

/**
 * Apply beat-reactive effects to a set of clips based on detected beat positions.
 *
 * For each clip, finds beats that fall within its timeline range and stamps
 * a `BeatEffectConfig` based on beat energy and the chosen impact preset.
 *
 * @param clips        Array of clips to process
 * @param beats        Beat timestamps with energy `{ time: number, energy: number }[]`
 * @param impactPreset Impact intensity tier name
 * @returns Modified clips array with `beatEffect` configs applied
 */
export function applyBeatEffects(
    clips: Clip[],
    beats: Array<{ time: number; energy: number }>,
    impactPreset: BeatDropIntensity,
): Clip[] {
    const preset = IMPACT_PRESETS[impactPreset];
    if (!preset || impactPreset === 'off') return clips;

    return clips.map((clip) => {
        const clipBeats = beats.filter((beat) => {
            return beat.time >= clip.startFrame && beat.time < clip.endFrame;
        });

        if (clipBeats.length === 0) return clip;

        const strongestBeat = clipBeats.reduce(
            (best, b) => (b.energy > best.energy ? b : best),
            clipBeats[0],
        );

        let factor: number;
        if (strongestBeat.energy > 0.7) {
            factor = 1.0;
        } else if (strongestBeat.energy > 0.4) {
            factor = 0.6;
        } else {
            factor = 0.3;
        }

        return {
            ...clip,
            beatEffect: scalePreset(preset, factor),
        };
    });
}
