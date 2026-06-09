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

// ─── 4. Speed Sub-Clip Generation (Option B) ──────────────────────────────────

/**
 * Definition for a single segment in a speed curve.
 */
interface SpeedSegment {
    /** Fraction of total source duration this segment occupies (0-1) */
    fraction: number;
    /** Playback speed multiplier */
    speed: number;
}

/**
 * Get the speed segments for a given curve preset.
 */
function getSpeedSegments(preset: SpeedCurvePreset, fps: number, sourceDurationFrames: number): SpeedSegment[] {
    switch (preset) {
        case 'constant':
            return [{ fraction: 1.0, speed: 1.0 }];

        case 'ramp-up':
            return [
                { fraction: 1 / 3, speed: 0.5 },
                { fraction: 1 / 3, speed: 1.0 },
                { fraction: 1 / 3, speed: 1.5 },
            ];

        case 'ramp-down':
            return [
                { fraction: 1 / 3, speed: 1.5 },
                { fraction: 1 / 3, speed: 1.0 },
                { fraction: 1 / 3, speed: 0.5 },
            ];

        case 's-curve':
            return [
                { fraction: 0.2, speed: 0.7 },
                { fraction: 0.2, speed: 1.0 },
                { fraction: 0.2, speed: 1.3 },
                { fraction: 0.2, speed: 1.0 },
                { fraction: 0.2, speed: 0.7 },
            ];

        case 'ramp-freeze': {
            // Middle segment is a near-freeze for ~0.5 seconds of real time
            const freezeSourceFrames = Math.max(2, Math.round(fps * 0.5 * 0.1)); // 0.1× speed
            const freezeFraction = Math.min(0.5, freezeSourceFrames / sourceDurationFrames);
            const remainFraction = (1 - freezeFraction) / 2;
            return [
                { fraction: remainFraction, speed: 1.0 },
                { fraction: freezeFraction, speed: 0.1 },
                { fraction: remainFraction, speed: 1.0 },
            ];
        }

        case 'burst-landing':
            return [
                { fraction: 1 / 3, speed: 2.0 },
                { fraction: 1 / 3, speed: 0.3 },
                { fraction: 1 / 3, speed: 1.0 },
            ];

        case 'oscillating':
            return [
                { fraction: 0.25, speed: 1.5 },
                { fraction: 0.25, speed: 0.5 },
                { fraction: 0.25, speed: 1.5 },
                { fraction: 0.25, speed: 0.5 },
            ];

        default:
            return [{ fraction: 1.0, speed: 1.0 }];
    }
}

/**
 * Pre-bake a speed curve into sequential sub-clips (Option B implementation).
 *
 * Mirrors `expandClipToBoomerang` — each sub-clip preserves the parent clip's
 * effects, path, metadata, etc. IDs follow `{id}_spd_{i}`.
 *
 * @param clip        Source clip
 * @param curvePreset Speed-curve preset name
 * @param fps         Frames per second
 * @returns Array of Clip objects with constant speeds approximating the curve
 */
export function generateSpeedSubClips(
    clip: Clip,
    curvePreset: SpeedCurvePreset,
    fps: number,
): Clip[] {
    if (curvePreset === 'constant') return [clip];

    const sourceDurationFrames = clip.trimEndFrame - clip.trimStartFrame;
    if (sourceDurationFrames <= 0) return [clip];

    const segments = getSpeedSegments(curvePreset, fps, sourceDurationFrames);
    const minSubDuration = Math.max(2, Math.round(fps * 0.066)); // ~2 frames min

    const subClips: Clip[] = [];
    let sourceHead = clip.trimStartFrame;
    let timelineHead = clip.startFrame;

    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];

        // How many source frames this segment covers
        const segSourceFrames = Math.max(
            minSubDuration,
            Math.round(sourceDurationFrames * seg.fraction),
        );

        // Clamp to remaining source
        const actualSourceEnd = Math.min(sourceHead + segSourceFrames, clip.trimEndFrame);
        const actualSourceFrames = actualSourceEnd - sourceHead;
        if (actualSourceFrames < 1) break;

        // Timeline duration after speed adjustment
        const timelineDuration = Math.max(
            minSubDuration,
            Math.round(actualSourceFrames / seg.speed),
        );

        subClips.push({
            ...clip,
            id: `${clip.id}_spd_${i}`,
            trimStartFrame: sourceHead,
            trimEndFrame: actualSourceEnd,
            startFrame: timelineHead,
            endFrame: timelineHead + timelineDuration,
            speed: seg.speed,
            // Preserve parent effects but clear speed-curve to prevent recursion
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
 * Energy thresholds:
 *  - > 0.7 (strong): 100% of impact preset
 *  - > 0.4 (medium):  60% of impact preset
 *  - ≤ 0.4 (weak):    30% of impact preset (or skip if preset is 'subtle')
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
        // Find the strongest beat that falls within this clip's timeline
        const clipBeats = beats.filter((beat) => {
            return beat.time >= clip.startFrame && beat.time < clip.endFrame;
        });

        if (clipBeats.length === 0) return clip;

        // Use the strongest beat in the clip's range
        const strongestBeat = clipBeats.reduce(
            (best, b) => (b.energy > best.energy ? b : best),
            clipBeats[0],
        );

        // Determine scale factor from energy
        let factor: number;
        if (strongestBeat.energy > 0.7) {
            factor = 1.0;   // Full impact
        } else if (strongestBeat.energy > 0.4) {
            factor = 0.6;   // Medium
        } else {
            factor = 0.3;   // Weak
        }

        return {
            ...clip,
            beatEffect: scalePreset(preset, factor),
        };
    });
}
