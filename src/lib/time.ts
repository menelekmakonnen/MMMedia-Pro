/**
 * Core Engineering Contract: Time & Frame System
 * Rule: All temporal data is frame-based. Seconds are display-only.
 */

export const DEFAULT_FPS = 30;

/**
 * Converts seconds to frames.
 * Uses a small epsilon to handle floating point drift before flooring.
 * 0.033333333333 * 30 should be 1, not 0.
 */
export function secondsToFrames(seconds: number, fps: number = DEFAULT_FPS): number {
    return Math.floor(seconds * fps + 0.0001);
}

/**
 * Converts frames to seconds.
 * Returns seconds (potentially float) for display or playback positioning.
 */
export function framesToSeconds(frames: number, fps: number = DEFAULT_FPS): number {
    return frames / fps;
}

/**
 * Formats a frame count into HH:MM:SS:FF timecode
 */
export function formatTimecode(frames: number, fps: number = DEFAULT_FPS): string {
    const totalSeconds = Math.floor(frames / fps);
    const frameRemainder = Math.floor(frames % fps);

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n: number) => n.toString().padStart(2, '0');

    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frameRemainder)}`;
}

/**
 * Round-trip verification helper
 */
export function verifyFrameConsistency(frames: number, fps: number = DEFAULT_FPS): boolean {
    const seconds = framesToSeconds(frames, fps);
    const backToFrames = secondsToFrames(seconds, fps);
    return backToFrames === frames;
}
