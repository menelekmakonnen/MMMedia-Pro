/**
 * Boomerang Effect — Damped-Bounce Clip Expansion
 * 
 * A boomerang is NOT a simple forward→reverse. It's a damped oscillation:
 * each successive bounce reaches less far into the clip and plays slightly faster,
 * mimicking a rubber band or spring settling to rest.
 * 
 * Physics: A(t) = amplitude × sin(freq × t) / e^(decay × t)
 * 
 * Given a source clip from frame S to frame E:
 *   Bounce 1: Forward  S→E        at 1.0×  (full swing)
 *   Bounce 2: Reverse  E→S        at 1.0×  (full return)
 *   Bounce 3: Forward  S→S+65%    at 1.15× (shorter, faster)
 *   Bounce 4: Reverse  S+65%→S    at 1.15× (shorter, faster)
 *   Bounce 5: Forward  S→S+35%    at 1.3×  (quick settle)  [optional]
 *   Bounce 6: Reverse  S+35%→S    at 1.3×  (quick settle)  [optional]
 */

import type { Clip } from '../types';

// ─── Configuration ────────────────────────────────────────

export interface BoomerangConfig {
    /** Number of bounce cycles (1 = fwd+rev, 2 = +shorter fwd+rev, 3 = +tiny fwd+rev) */
    bounces: 1 | 2 | 3;
    /** How quickly amplitude decays per bounce (0.3 = gentle, 0.5 = standard, 0.7 = snappy) */
    decay: number;
    /** Speed increase per bounce tier (1.15 = subtle, 1.3 = noticeable) */
    speedRamp: number;
}

export const BOOMERANG_PRESETS: Record<string, BoomerangConfig> = {
    classic: { bounces: 1, decay: 0, speedRamp: 1.0 },
};

export const DEFAULT_BOOMERANG: BoomerangConfig = BOOMERANG_PRESETS.classic;

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

    const minSubDuration = Math.max(2, Math.round(fps * 0.066)); // ~2 frames min

    const subClips: BoomerangSubClip[] = [];
    let bounceIndex = 0;

    for (let cycle = 0; cycle < config.bounces; cycle++) {
        // Amplitude decay: each cycle reaches less far into the clip
        const amplitude = cycle === 0 ? 1.0 : Math.pow(1 - config.decay, cycle);
        
        // Speed ramp: each cycle plays slightly faster
        const cycleSpeed = baseSpeed * Math.pow(config.speedRamp, cycle);

        // Compute sub-clip trim range
        const reachFrames = Math.max(minSubDuration, Math.round(sourceDuration * amplitude));
        const subTrimEnd = trimStart + reachFrames;
        const actualTrimEnd = Math.min(subTrimEnd, trimEnd);

        // Raw duration in source frames
        const rawDuration = actualTrimEnd - trimStart;
        if (rawDuration < minSubDuration) break; // Too short to be useful

        // Timeline duration after speed adjustment
        const timelineDuration = Math.max(minSubDuration, Math.round(rawDuration / cycleSpeed));

        // Forward pass
        subClips.push({
            trimStartFrame: trimStart,
            trimEndFrame: actualTrimEnd,
            speed: cycleSpeed,
            reversed: false,
            timelineDuration,
            bounceIndex: bounceIndex++,
        });

        // Reverse pass
        subClips.push({
            trimStartFrame: trimStart,
            trimEndFrame: actualTrimEnd,
            speed: cycleSpeed,
            reversed: true,
            timelineDuration,
            bounceIndex: bounceIndex++,
        });
    }

    return subClips;
}

/**
 * Expand a Clip with boomerang enabled into multiple timeline-ready Clip objects.
 * Each sub-clip gets a unique ID and sequential timeline positioning.
 * 
 * @param clip       Source clip with boomerang: true
 * @param config     Boomerang configuration
 * @param fps        Frames per second
 * @returns Array of Clip objects ready for timeline insertion
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
    }));
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
