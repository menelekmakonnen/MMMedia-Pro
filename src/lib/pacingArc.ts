export type PacingArcShape =
    | 'build-to-climax'
    | 'wave'
    | 'flat-high'
    | 'slow-burn'
    | 'bookend'
    | 'chronological';

/**
 * Returns a pacing speed multiplier (0.3 to 3.0) for a given position in the timeline.
 * - multiplier < 1.0 makes clips shorter (faster pacing).
 * - multiplier > 1.0 makes clips longer (slower pacing).
 */
export function getPacingArcMultiplier(
    shape: PacingArcShape | undefined,
    normalizedPosition: number // 0.0 to 1.0 along the timeline duration
): number {
    if (!shape) return 1.0;

    const pos = Math.max(0, Math.min(1, normalizedPosition));

    switch (shape) {
        case 'build-to-climax':
            // Starts slow (1.5x longer), ends fast (0.5x shorter)
            return 1.5 - pos * 1.0; // 1.5 -> 0.5

        case 'wave':
            // Oscillates between slow and fast in a sine wave
            return 1.0 + Math.sin(pos * Math.PI * 4) * 0.5;

        case 'slow-burn':
            // Stays slow (1.6x) for 70% of the duration, then snaps to fast (0.4x)
            if (pos < 0.7) {
                return 1.6 - (pos / 0.7) * 0.2; // 1.6 -> 1.4
            } else {
                const dropPos = (pos - 0.7) / 0.3; // 0..1
                return 1.4 - dropPos * 1.0; // 1.4 -> 0.4
            }

        case 'bookend':
            // Fast at start (0.6x), slow in middle (1.6x), fast at end (0.6x)
            return 1.6 - Math.sin(pos * Math.PI) * 1.0; // 0.6 -> 1.6 -> 0.6

        case 'flat-high':
            // Consistently fast (0.5x clip duration)
            return 0.5;

        case 'chronological':
        default:
            return 1.0;
    }
}
