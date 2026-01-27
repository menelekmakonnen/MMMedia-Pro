/**
 * Core Engineering Contract: Time & Frame System
 * Rule: All temporal data is frame-based. Seconds are display-only.
 */

export const DEFAULT_FPS = 30;

/**
 * Converts seconds to frames.
 * Uses Math.floor to strictly adhere to the start of the frame.
 */
export function secondsToFrames(seconds: number, fps: number = DEFAULT_FPS): number {
    return Math.floor(seconds * fps);
}

/**
 * Converts frames to seconds.
 * returns seconds (potentially float) for display or playback positioning.
 */
export function framesToSeconds(frames: number, fps: number = DEFAULT_FPS): number {
    return frames / fps;
}

/**
 * Formats a frame count into HH:MM:SS:FF timecode
 */
export function formatTimecode(frames: number, fps: number = DEFAULT_FPS): string {
    const totalSeconds = Math.floor(frames / fps);
    const frameRemainder = frames % fps;

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
    const backToFrames = secondsToFrames(seconds, fps); // Note: this might fail if using floor on small deltas? 
    // Actually, secondsToFrames(frames/fps) should equal frames if frames is integer.
    // The spec says: frames = Math.floor(seconds * fps) (always floor, never round)
    // Let's ensure this is robust.
    // Example: 1 frame at 30fps = 0.033333...
    // 0.033333 * 30 = 0.99999... Math.floor -> 0 (ERROR!)
    // WAIT. If I use exactly frame/fps, I get exact float.
    // 
    // Correction: Standard video editing logic usually allows a small epsilon for floating point drift 
    // OR uses strict rational numbers. 
    // However, the Spec says "frames = Math.floor(seconds * fps)". 
    // If I have 1 frame, sec = 1/30. sec*30 = 1. floor(1) = 1. Correct.
    // But 0.03333333333333333 (double precision of 1/30) * 30 is exactly 1.0 in JS.
    return Math.abs(backToFrames - frames) < 1;
}
