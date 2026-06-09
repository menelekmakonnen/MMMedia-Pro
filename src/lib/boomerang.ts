/**
 * Boomerang Effect — Damped-Bounce Clip Expansion
 * 
 * A boomerang is NOT a simple forward→reverse. It's a damped oscillation:
 * each successive bounce reaches less far into the clip and plays slightly faster,
 * mimicking a rubber band or spring settling to rest.
 * 
 * Physics: A(t) = amplitude × sin(freq × t) / e^(decay × t)
 * 
 * Supported styles (Instagram-inspired):
 *   classic:   Simple forward→reverse (standard boomerang)
 *   slowmo:    Slow dreamy forward→reverse at 0.6x speed
 *   echo:      Forward→reverse with motion trail ghosting (2 bounces)
 *   duo:       Glitchy fast rewind effect (2 bounces, accelerating)
 *   stutter:   Rapid micro-bounces — full forward, then 3 tiny bounces
 *   whiplash:  Fast forward (1.5x), slow snap reverse (0.7x)
 */

import type { Clip, BoomerangPresetId } from '../types';

// ─── Configuration ────────────────────────────────────────

export interface BoomerangConfig {
    /** Number of bounce cycles (1 = fwd+rev, 2 = +shorter fwd+rev, 3 = +tiny fwd+rev) */
    bounces: 1 | 2 | 3;
    /** How quickly amplitude decays per bounce (0 = none, 0.3 = gentle, 0.5 = standard, 0.7 = snappy) */
    decay: number;
    /** Speed increase per bounce tier (1.0 = same, 1.15 = subtle, 1.3 = noticeable) */
    speedRamp: number;
    /** Style of boomerang generation */
    style: 'forward-reverse' | 'rapid-glitch' | 'micro-bounce' | 'forward-snap-reverse';
    /** Optional: forward speed override (for whiplash) */
    forwardSpeed?: number;
    /** Optional: reverse speed override (for whiplash) */
    reverseSpeed?: number;
    /** Optional: enable ghosting effect (for echo) */
    ghosting?: boolean;
}

export const BOOMERANG_PRESETS: Record<BoomerangPresetId, BoomerangConfig> = {
    classic:   { bounces: 1, decay: 0,   speedRamp: 1.0, style: 'forward-reverse' },
    slowmo:    { bounces: 1, decay: 0,   speedRamp: 1.0, style: 'forward-reverse', forwardSpeed: 0.6, reverseSpeed: 0.6 },
    echo:      { bounces: 2, decay: 0.3, speedRamp: 1.0, style: 'forward-reverse', ghosting: true },
    duo:       { bounces: 2, decay: 0.4, speedRamp: 1.3, style: 'rapid-glitch' },
    stutter:   { bounces: 3, decay: 0.5, speedRamp: 1.2, style: 'micro-bounce' },
    whiplash:  { bounces: 1, decay: 0,   speedRamp: 1.0, style: 'forward-snap-reverse', forwardSpeed: 1.5, reverseSpeed: 0.7 },
};

export const DEFAULT_BOOMERANG: BoomerangConfig = BOOMERANG_PRESETS.classic;

/** Duration limits for boomerang first clip (seconds) */
export const BOOMERANG_MIN_DURATION_S = 0.25;
export const BOOMERANG_MAX_DURATION_S = 2.5;

// ─── Core Expansion ───────────────────────────────────────

export interface BoomerangSubClip {
    /** Source trim start (frames) */
    trimStartFrame: number;
    /** Source trim end (frames) */
    trimEndFrame: number;
    /** Playback speed multiplier */
    speed: number;
    /** Whether this sub-clip plays in reverse */
    reversed: boolean;
    /** Duration on timeline (frames, after speed adjustment) */
    timelineDuration: number;
    /** Bounce index (0-based) for debugging/labeling */
    bounceIndex: number;
    /** Style hint for filter builder (e.g. 'ghosting' for echo preset) */
    styleHint?: string;
}

/**
 * Expand a clip into boomerang sub-clips.
 * 
 * @param trimStart  Source in-point (frames)
 * @param trimEnd    Source out-point (frames)
 * @param baseSpeed  Original clip speed
 * @param config     Boomerang configuration
 * @param fps        Frames per second (for minimum duration guard)
 * @returns Array of sub-clips in playback order
 */
export function expandBoomerang(
    trimStart: number,
    trimEnd: number,
    baseSpeed: number = 1.0,
    config: BoomerangConfig = DEFAULT_BOOMERANG,
    fps: number = 30,
): BoomerangSubClip[] {
    const sourceDuration = trimEnd - trimStart;
    if (sourceDuration <= 0) return [];

    // Enforce duration caps: first forward clip should be 0.25s-2.5s of source
    const minFrames = Math.round(BOOMERANG_MIN_DURATION_S * fps);
    const maxFrames = Math.round(BOOMERANG_MAX_DURATION_S * fps);
    const clampedDuration = Math.max(minFrames, Math.min(maxFrames, sourceDuration));
    const effectiveTrimEnd = trimStart + clampedDuration;

    const minSubDuration = Math.max(2, Math.round(fps * 0.066)); // ~2 frames min

    // Dispatch to style-specific generator
    switch (config.style) {
        case 'rapid-glitch':
            return generateRapidGlitch(trimStart, effectiveTrimEnd, baseSpeed, config, fps, minSubDuration);
        case 'micro-bounce':
            return generateMicroBounce(trimStart, effectiveTrimEnd, baseSpeed, config, fps, minSubDuration);
        case 'forward-snap-reverse':
            return generateForwardSnapReverse(trimStart, effectiveTrimEnd, baseSpeed, config, fps, minSubDuration);
        case 'forward-reverse':
        default:
            return generateForwardReverse(trimStart, effectiveTrimEnd, baseSpeed, config, fps, minSubDuration);
    }
}

// ─── Style Generators ─────────────────────────────────────

/** Classic forward→reverse with optional multi-bounce decay */
function generateForwardReverse(
    trimStart: number, trimEnd: number, baseSpeed: number,
    config: BoomerangConfig, fps: number, minSubDuration: number,
): BoomerangSubClip[] {
    const sourceDuration = trimEnd - trimStart;
    const subClips: BoomerangSubClip[] = [];
    let bounceIndex = 0;

    for (let cycle = 0; cycle < config.bounces; cycle++) {
        const amplitude = cycle === 0 ? 1.0 : Math.pow(1 - config.decay, cycle);
        const cycleSpeed = (cycle === 0 && config.forwardSpeed)
            ? config.forwardSpeed
            : baseSpeed * Math.pow(config.speedRamp, cycle);
        const revSpeed = (cycle === 0 && config.reverseSpeed)
            ? config.reverseSpeed
            : cycleSpeed;

        const reachFrames = Math.max(minSubDuration, Math.round(sourceDuration * amplitude));
        const actualTrimEnd = Math.min(trimStart + reachFrames, trimEnd);
        const rawDuration = actualTrimEnd - trimStart;
        if (rawDuration < minSubDuration) break;

        const fwdTimelineDuration = Math.max(minSubDuration, Math.round(rawDuration / cycleSpeed));
        const revTimelineDuration = Math.max(minSubDuration, Math.round(rawDuration / revSpeed));

        // Forward pass
        subClips.push({
            trimStartFrame: trimStart, trimEndFrame: actualTrimEnd,
            speed: cycleSpeed, reversed: false,
            timelineDuration: fwdTimelineDuration,
            bounceIndex: bounceIndex++,
            styleHint: config.ghosting ? 'ghosting' : undefined,
        });

        // Reverse pass
        subClips.push({
            trimStartFrame: trimStart, trimEndFrame: actualTrimEnd,
            speed: revSpeed, reversed: true,
            timelineDuration: revTimelineDuration,
            bounceIndex: bounceIndex++,
            styleHint: config.ghosting ? 'ghosting' : undefined,
        });
    }

    return subClips;
}

/** Duo: Glitchy fast-rewind with accelerating bounces */
function generateRapidGlitch(
    trimStart: number, trimEnd: number, baseSpeed: number,
    config: BoomerangConfig, fps: number, minSubDuration: number,
): BoomerangSubClip[] {
    const sourceDuration = trimEnd - trimStart;
    const subClips: BoomerangSubClip[] = [];
    let bounceIndex = 0;

    // Full forward play
    const fwdDuration = Math.round(sourceDuration / baseSpeed);
    subClips.push({
        trimStartFrame: trimStart, trimEndFrame: trimEnd,
        speed: baseSpeed, reversed: false,
        timelineDuration: Math.max(minSubDuration, fwdDuration),
        bounceIndex: bounceIndex++,
    });

    // Rapid reverse bounces with increasing speed and decreasing reach
    for (let cycle = 0; cycle < config.bounces; cycle++) {
        const amplitude = Math.pow(1 - config.decay, cycle);
        const cycleSpeed = baseSpeed * Math.pow(config.speedRamp, cycle + 1);
        const reachFrames = Math.max(minSubDuration, Math.round(sourceDuration * amplitude));
        const actualTrimEnd = Math.min(trimStart + reachFrames, trimEnd);
        const rawDuration = actualTrimEnd - trimStart;
        if (rawDuration < minSubDuration) break;

        const timelineDuration = Math.max(minSubDuration, Math.round(rawDuration / cycleSpeed));

        // Quick reverse
        subClips.push({
            trimStartFrame: trimStart, trimEndFrame: actualTrimEnd,
            speed: cycleSpeed, reversed: true,
            timelineDuration,
            bounceIndex: bounceIndex++,
            styleHint: 'glitch',
        });

        // Quick forward snap-back (shorter)
        const snapDuration = Math.max(minSubDuration, Math.round(timelineDuration * 0.6));
        subClips.push({
            trimStartFrame: trimStart, trimEndFrame: actualTrimEnd,
            speed: cycleSpeed * 1.2, reversed: false,
            timelineDuration: snapDuration,
            bounceIndex: bounceIndex++,
            styleHint: 'glitch',
        });
    }

    return subClips;
}

/** Stutter: Full forward, then rapid micro-bounces at decreasing amplitude */
function generateMicroBounce(
    trimStart: number, trimEnd: number, baseSpeed: number,
    config: BoomerangConfig, fps: number, minSubDuration: number,
): BoomerangSubClip[] {
    const sourceDuration = trimEnd - trimStart;
    const subClips: BoomerangSubClip[] = [];
    let bounceIndex = 0;

    // Full forward play at normal speed
    const fwdDuration = Math.max(minSubDuration, Math.round(sourceDuration / baseSpeed));
    subClips.push({
        trimStartFrame: trimStart, trimEndFrame: trimEnd,
        speed: baseSpeed, reversed: false,
        timelineDuration: fwdDuration,
        bounceIndex: bounceIndex++,
    });

    // Micro-bounces: each cycle is shorter and faster
    for (let cycle = 0; cycle < config.bounces; cycle++) {
        const amplitude = Math.pow(1 - config.decay, cycle + 1); // Start decayed
        const cycleSpeed = baseSpeed * Math.pow(config.speedRamp, cycle + 1);

        // Only use the END portion of the clip for micro-bounces
        const bounceFrames = Math.max(minSubDuration, Math.round(sourceDuration * amplitude * 0.3));
        const bounceStart = Math.max(trimStart, trimEnd - bounceFrames);
        const rawDuration = trimEnd - bounceStart;
        if (rawDuration < minSubDuration) break;

        const timelineDuration = Math.max(minSubDuration, Math.round(rawDuration / cycleSpeed));

        // Reverse micro-bounce
        subClips.push({
            trimStartFrame: bounceStart, trimEndFrame: trimEnd,
            speed: cycleSpeed, reversed: true,
            timelineDuration,
            bounceIndex: bounceIndex++,
        });

        // Forward micro-bounce
        subClips.push({
            trimStartFrame: bounceStart, trimEndFrame: trimEnd,
            speed: cycleSpeed, reversed: false,
            timelineDuration,
            bounceIndex: bounceIndex++,
        });
    }

    return subClips;
}

/** Whiplash: Fast forward, slow snap reverse */
function generateForwardSnapReverse(
    trimStart: number, trimEnd: number, baseSpeed: number,
    config: BoomerangConfig, fps: number, minSubDuration: number,
): BoomerangSubClip[] {
    const sourceDuration = trimEnd - trimStart;
    const subClips: BoomerangSubClip[] = [];

    const fwdSpeed = config.forwardSpeed ?? baseSpeed * 1.5;
    const revSpeed = config.reverseSpeed ?? baseSpeed * 0.7;

    const fwdDuration = Math.max(minSubDuration, Math.round(sourceDuration / fwdSpeed));
    const revDuration = Math.max(minSubDuration, Math.round(sourceDuration / revSpeed));

    // Fast forward
    subClips.push({
        trimStartFrame: trimStart, trimEndFrame: trimEnd,
        speed: fwdSpeed, reversed: false,
        timelineDuration: fwdDuration,
        bounceIndex: 0,
    });

    // Slow reverse
    subClips.push({
        trimStartFrame: trimStart, trimEndFrame: trimEnd,
        speed: revSpeed, reversed: true,
        timelineDuration: revDuration,
        bounceIndex: 1,
    });

    return subClips;
}

// ─── Clip Expansion ───────────────────────────────────────

/**
 * Expand a Clip with boomerang enabled into multiple timeline-ready Clip objects.
 * Each sub-clip gets a unique ID and sequential timeline positioning.
 */
export function expandClipToBoomerang(
    clip: Clip,
    config: BoomerangConfig = DEFAULT_BOOMERANG,
    fps: number = 30,
): Clip[] {
    const subClips = expandBoomerang(
        clip.trimStartFrame,
        clip.trimEndFrame,
        clip.speed,
        config,
        fps,
    );

    if (subClips.length === 0) return [clip]; // Fallback: return original

    let timelineHead = clip.startFrame;

    return subClips.map((sub, i) => ({
        ...clip,
        id: `${clip.id}_boom_${i}`,
        // Source trim for this bounce
        trimStartFrame: sub.trimStartFrame,
        trimEndFrame: sub.trimEndFrame,
        // Timeline position: sequential
        startFrame: timelineHead,
        endFrame: (timelineHead += sub.timelineDuration),
        // Playback overrides
        speed: sub.speed,
        reversed: sub.reversed,
        // Mark as auto-generated sub-clip
        origin: 'auto' as const,
        // Preserve parent's effects but remove boomerang flag (prevent recursion)
        boomerang: false,
        // Preserve zoom — forward clips zoom in, reverse clips zoom out
        zoomStart: sub.reversed ? (clip.zoomEnd ?? clip.zoomStart) : clip.zoomStart,
        zoomEnd: sub.reversed ? (clip.zoomStart ?? clip.zoomEnd) : clip.zoomEnd,
        // Pass style hint for echo ghosting via echo effect
        echo: sub.styleHint === 'ghosting' ? { trailCount: 3, opacity: 0.4 } : clip.echo,
        // Pass chromatic hint for glitch style
        chromaticAberration: sub.styleHint === 'glitch'
            ? Math.max(clip.chromaticAberration ?? 0, 5)
            : clip.chromaticAberration,
    }));
}

/**
 * Expand a Clip with boomerang, aligning the last reverse sub-clip to end on a beat.
 * The reverse clip's duration is adjusted so its final frame lands on `targetBeatTime`.
 */
export function expandBoomerangToBeat(
    clip: Clip,
    config: BoomerangConfig,
    targetBeatTime: number,
    fps: number = 30,
): Clip[] {
    const expandedClips = expandClipToBoomerang(clip, config, fps);
    if (expandedClips.length < 2) return expandedClips;

    // Find the last reverse clip
    const lastReverse = expandedClips[expandedClips.length - 1];
    if (!lastReverse.reversed) return expandedClips; // Safety: should be reversed

    // Calculate target end frame from beat time
    const targetEndFrame = Math.round(targetBeatTime * fps);

    // Adjust the last reverse clip to end exactly on the beat
    const currentEndFrame = lastReverse.endFrame;
    const delta = targetEndFrame - currentEndFrame;

    if (Math.abs(delta) > 0) {
        // Stretch/compress the last reverse clip
        lastReverse.endFrame = targetEndFrame;
        // Recalculate speed to fit the new duration
        const newTimelineDuration = lastReverse.endFrame - lastReverse.startFrame;
        const sourceDuration = lastReverse.trimEndFrame - lastReverse.trimStartFrame;
        if (newTimelineDuration > 0 && sourceDuration > 0) {
            lastReverse.speed = sourceDuration / newTimelineDuration;
        }
    }

    return expandedClips;
}

/**
 * Calculate total timeline duration of a boomerang expansion.
 * Useful for timeline layout without actually creating clips.
 */
export function getBoomerangDuration(
    trimStart: number,
    trimEnd: number,
    baseSpeed: number = 1.0,
    config: BoomerangConfig = DEFAULT_BOOMERANG,
    fps: number = 30,
): number {
    const subClips = expandBoomerang(trimStart, trimEnd, baseSpeed, config, fps);
    return subClips.reduce((sum, sc) => sum + sc.timelineDuration, 0);
}

/** Get a boomerang config by preset ID, falling back to classic */
export function getBoomerangPreset(id?: BoomerangPresetId): BoomerangConfig {
    return BOOMERANG_PRESETS[id ?? 'classic'] ?? BOOMERANG_PRESETS.classic;
}
