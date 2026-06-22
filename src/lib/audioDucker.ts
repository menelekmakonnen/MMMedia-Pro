/**
 * Audio Ducker — Generates volume keyframes for background music ducking.
 * ════════════════════════════════════════════════════════════════════════════
 * Analyzes speech regions and generates volume automation keyframes
 * to reduce background music under speech.
 */

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface DuckingConfig {
    /** Volume during speech (0-100, default 15) */
    duckedVolume: number;
    /** Volume during silence (0-100, default 100) */
    normalVolume: number;
    /** Fade-down time in seconds (default 0.2) */
    attackTime: number;
    /** Fade-up time in seconds (default 0.5) */
    releaseTime: number;
    /** Minimum speech region duration to trigger ducking (seconds) */
    minSpeechDuration: number;  // default 0.3
}

export const DEFAULT_DUCKING: DuckingConfig = {
    duckedVolume: 15,
    normalVolume: 100,
    attackTime: 0.2,
    releaseTime: 0.5,
    minSpeechDuration: 0.3,
};

export interface VolumeKeyframe {
    time: number;   // seconds
    volume: number; // 0-100
}

// ─── Keyframe generation ─────────────────────────────────────────────────────

/**
 * Generate volume keyframes for a background music track
 * based on detected speech regions in the narration.
 *
 * For each speech region that exceeds `minSpeechDuration`, four keyframes
 * are emitted:
 *   1. Normal volume at `region.start - attackTime`
 *   2. Ducked volume at `region.start`
 *   3. Ducked volume at `region.end`
 *   4. Normal volume at `region.end + releaseTime`
 */
export function generateDuckingKeyframes(
    speechRegions: Array<{ start: number; end: number }>,
    totalDuration: number,
    config?: Partial<DuckingConfig>,
): VolumeKeyframe[] {
    const cfg: DuckingConfig = { ...DEFAULT_DUCKING, ...config };
    const keyframes: VolumeKeyframe[] = [];

    // Filter out regions shorter than minimum speech duration
    const regions = speechRegions
        .filter(r => (r.end - r.start) >= cfg.minSpeechDuration)
        .sort((a, b) => a.start - b.start);

    if (regions.length === 0) {
        // No speech — constant normal volume
        keyframes.push({ time: 0, volume: cfg.normalVolume });
        keyframes.push({ time: totalDuration, volume: cfg.normalVolume });
        return keyframes;
    }

    // Start at normal volume
    const firstAttackStart = Math.max(0, regions[0].start - cfg.attackTime);
    if (firstAttackStart > 0) {
        keyframes.push({ time: 0, volume: cfg.normalVolume });
    }

    for (let i = 0; i < regions.length; i++) {
        const region = regions[i];
        const attackStart = Math.max(0, region.start - cfg.attackTime);
        const releaseEnd = Math.min(totalDuration, region.end + cfg.releaseTime);

        // Check for overlap with previous region's release
        if (keyframes.length > 0) {
            const lastKf = keyframes[keyframes.length - 1];
            // If attack starts before or at last keyframe time, skip the normal-volume ramp-up
            // (we're already ducked or overlapping)
            if (attackStart <= lastKf.time) {
                // Just extend the ducked region
                keyframes.push({ time: region.end, volume: cfg.duckedVolume });
            } else {
                // Ramp down: normal → ducked
                keyframes.push({ time: attackStart, volume: cfg.normalVolume });
                keyframes.push({ time: region.start, volume: cfg.duckedVolume });
                // Hold ducked
                keyframes.push({ time: region.end, volume: cfg.duckedVolume });
            }
        } else {
            // First region
            keyframes.push({ time: attackStart, volume: cfg.normalVolume });
            keyframes.push({ time: region.start, volume: cfg.duckedVolume });
            keyframes.push({ time: region.end, volume: cfg.duckedVolume });
        }

        // Ramp back up to normal after speech
        const nextRegion = i + 1 < regions.length ? regions[i + 1] : null;
        const nextAttack = nextRegion ? Math.max(0, nextRegion.start - cfg.attackTime) : Infinity;

        if (releaseEnd < nextAttack) {
            keyframes.push({ time: releaseEnd, volume: cfg.normalVolume });
        }
    }

    // Ensure we end at normal volume
    const lastKf = keyframes[keyframes.length - 1];
    if (lastKf.time < totalDuration) {
        keyframes.push({ time: totalDuration, volume: cfg.normalVolume });
    }

    return keyframes;
}

// ─── Silence → Speech inversion ──────────────────────────────────────────────

/**
 * Detect speech regions from silence analysis results.
 * Takes silence periods and inverts them to get speech regions.
 */
export function invertSilenceToSpeech(
    silencePeriods: Array<{ start: number; end: number }>,
    totalDuration: number,
): Array<{ start: number; end: number }> {
    if (totalDuration <= 0) return [];

    const sorted = [...silencePeriods].sort((a, b) => a.start - b.start);
    const speech: Array<{ start: number; end: number }> = [];
    let cursor = 0;

    for (const silence of sorted) {
        const silStart = Math.max(0, silence.start);
        const silEnd = Math.min(totalDuration, silence.end);

        if (silStart > cursor) {
            speech.push({ start: cursor, end: silStart });
        }
        cursor = Math.max(cursor, silEnd);
    }

    if (cursor < totalDuration) {
        speech.push({ start: cursor, end: totalDuration });
    }

    return speech.filter(r => r.end - r.start > 0.001);
}

// ─── FFmpeg filter generation ────────────────────────────────────────────────

/**
 * Convert volume keyframes to FFmpeg volume filter expression.
 * Returns a chain of `volume=enable='between(t,...)':volume=...` segments
 * that can be used in FFmpeg's `-af` filter chain.
 *
 * Each pair of adjacent keyframes defines a segment. For linear interpolation
 * between keyframes, we approximate with a piecewise constant volume at the
 * average of the two levels (FFmpeg's `volume` filter doesn't natively
 * interpolate). For exact ramps, `afade` would be needed; this is a pragmatic
 * approximation.
 */
export function duckingToFFmpegFilter(
    keyframes: VolumeKeyframe[],
    totalDuration: number,
): string {
    if (keyframes.length === 0) return 'volume=1.0';
    if (keyframes.length === 1) {
        return `volume=${(keyframes[0].volume / 100).toFixed(2)}`;
    }

    const parts: string[] = [];

    for (let i = 0; i < keyframes.length - 1; i++) {
        const kf = keyframes[i];
        const next = keyframes[i + 1];
        const t0 = kf.time.toFixed(3);
        const t1 = next.time.toFixed(3);
        const vol = (kf.volume / 100).toFixed(2);

        // Skip zero-length segments
        if (Math.abs(next.time - kf.time) < 0.001) continue;

        parts.push(`volume=enable='between(t,${t0},${t1})':volume=${vol}`);
    }

    if (parts.length === 0) {
        return `volume=${(keyframes[0].volume / 100).toFixed(2)}`;
    }

    return parts.join(',');
}
