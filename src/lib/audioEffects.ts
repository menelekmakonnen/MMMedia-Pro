// ══════════════════════════════════════════════════════════════════════════════
// audioEffects.ts — Audio Effects Processing
// Defines audio effect parameters and builds FFmpeg audio filter chains for
// EQ, dynamics processing, noise reduction, normalization, fades, and echo.
// ══════════════════════════════════════════════════════════════════════════════

export interface AudioEffects {
    // EQ
    eqLow: number;        // -20 to 20 dB (boost/cut at 100Hz)
    eqMid: number;        // -20 to 20 dB (boost/cut at 1kHz)
    eqHigh: number;       // -20 to 20 dB (boost/cut at 8kHz)
    // Filters
    highpassFreq: number; // 0 = off, 20-500 Hz
    lowpassFreq: number;  // 0 = off, 1000-20000 Hz
    // Dynamics
    compressor: boolean;
    compressorThreshold: number; // -50 to 0 dB
    compressorRatio: number;     // 1 to 20
    limiter: boolean;            // brickwall peak limiter (alimiter)
    limiterLevel: number;        // 0.1-1.0 ceiling (linear)
    gate: boolean;               // noise gate (agate)
    gateThreshold: number;       // -80 to 0 dB
    // Noise
    noiseReduction: number;      // 0 = off, 1-97 (afftdn nr value)
    // Normalization
    loudnessNorm: boolean;       // EBU R128 loudnorm
    loudnessTarget: number;      // integrated LUFS target (-14 YouTube, -16 podcast, -23 broadcast)
    // Fades
    fadeInDuration: number;      // seconds, 0 = off
    fadeOutDuration: number;     // seconds, 0 = off
    // Effects
    echo: boolean;
    echoDelay: number;           // ms (50-1000)
    echoDecay: number;           // 0.1-0.9
    // Pitch Shifting (for SFX variety — prevents listener fatigue)
    pitchShift: number;  // semitones: -12 to +12 (0 = no shift)
}

export const DEFAULT_AUDIO_EFFECTS: AudioEffects = {
    eqLow: 0,
    eqMid: 0,
    eqHigh: 0,
    highpassFreq: 0,
    lowpassFreq: 0,
    compressor: false,
    compressorThreshold: -20,
    compressorRatio: 4,
    limiter: false,
    limiterLevel: 0.95,
    gate: false,
    gateThreshold: -50,
    noiseReduction: 0,
    loudnessNorm: false,
    loudnessTarget: -14,
    fadeInDuration: 0,
    fadeOutDuration: 0,
    echo: false,
    echoDelay: 250,
    echoDecay: 0.4,
    pitchShift: 0,
};

// ══════════════════════════════════════════════════════════════════════════════
// FILTER CHAIN BUILDER
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Build an FFmpeg audio filter chain from audio effect settings.
 *
 * Filter order:
 *   EQ → Highpass → Lowpass → Compressor → Noise Reduction →
 *   Loudness Normalization → Fade In → Fade Out → Echo
 *
 * @param effects - Audio effects configuration
 * @param clipDurationSec - Duration of the clip in seconds (needed for fade out timing)
 * @returns Comma-separated FFmpeg filter chain, or empty string if all defaults
 */
/** Convert decibels to a linear amplitude (for filters that want 0-1 thresholds). */
function dbToLinear(db: number): number {
    return Math.pow(10, db / 20);
}

export function buildAudioEffectsFilter(effects: AudioEffects, clipDurationSec: number): string {
    const filters: string[] = [];

    // ── EQ Bands ────────────────────────────────────────────────────────────
    // 3-band parametric EQ using FFmpeg equalizer filter
    // width_type=o means octave bandwidth, width=2 gives a broad musical range

    if (effects.eqLow !== 0) {
        filters.push(`equalizer=f=100:width_type=o:width=2:g=${effects.eqLow}`);
    }
    if (effects.eqMid !== 0) {
        filters.push(`equalizer=f=1000:width_type=o:width=2:g=${effects.eqMid}`);
    }
    if (effects.eqHigh !== 0) {
        filters.push(`equalizer=f=8000:width_type=o:width=2:g=${effects.eqHigh}`);
    }

    // ── Filters ─────────────────────────────────────────────────────────────

    if (effects.highpassFreq > 0) {
        filters.push(`highpass=f=${effects.highpassFreq}`);
    }
    if (effects.lowpassFreq > 0) {
        filters.push(`lowpass=f=${effects.lowpassFreq}`);
    }

    // ── Dynamics ────────────────────────────────────────────────────────────

    if (effects.compressor) {
        filters.push(
            `acompressor=threshold=${effects.compressorThreshold}dB:ratio=${effects.compressorRatio}:attack=5:release=50`
        );
    }

    if (effects.gate) {
        const thr = effects.gateThreshold ?? -50;
        filters.push(`agate=threshold=${dbToLinear(thr).toFixed(6)}:ratio=4:attack=10:release=120`);
    }

    // ── Noise Reduction ─────────────────────────────────────────────────────

    if (effects.noiseReduction > 0) {
        filters.push(`afftdn=nr=${effects.noiseReduction}:nf=-25`);
    }

    // ── Loudness Normalization ──────────────────────────────────────────────
    // EBU R128 standard targeting -23 LUFS with 7 LRA and -2 TP

    if (effects.loudnessNorm) {
        const I = effects.loudnessTarget ?? -14;
        filters.push(`loudnorm=I=${I}:LRA=11:TP=-1.5`);
    }

    if (effects.limiter) {
        const lim = Math.max(0.05, Math.min(1.0, effects.limiterLevel ?? 0.95));
        filters.push(`alimiter=limit=${lim.toFixed(4)}:level=disabled`);
    }

    // ── Pitch Shift ─────────────────────────────────────────────────────────
    // Semitone-based, preserves duration via asetrate+atempo

    if (effects.pitchShift && effects.pitchShift !== 0) {
        const ratio = Math.pow(2, effects.pitchShift / 12);
        filters.push(`asetrate=44100*${ratio.toFixed(6)}`);
        filters.push(`aresample=44100`);
        filters.push(`atempo=${(1 / ratio).toFixed(6)}`);
    }

    // ── Fades ───────────────────────────────────────────────────────────────

    if (effects.fadeInDuration > 0) {
        filters.push(`afade=t=in:d=${effects.fadeInDuration.toFixed(4)}`);
    }
    if (effects.fadeOutDuration > 0) {
        const fadeOutStart = Math.max(0, clipDurationSec - effects.fadeOutDuration);
        filters.push(`afade=t=out:st=${fadeOutStart.toFixed(4)}:d=${effects.fadeOutDuration.toFixed(4)}`);
    }

    // ── Echo ────────────────────────────────────────────────────────────────
    // aecho=in_gain:out_gain:delays:decays

    if (effects.echo) {
        filters.push(`aecho=0.8:0.88:${effects.echoDelay}:${effects.echoDecay}`);
    }

    return filters.join(',');
}

// ══════════════════════════════════════════════════════════════════════════════
// DEFAULT CHECK
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Check if all audio effects are at their default (no-op) values.
 * Used to skip audio processing when no effects are applied.
 */
export function isDefaultAudioEffects(effects: AudioEffects): boolean {
    return (
        effects.eqLow === 0 &&
        effects.eqMid === 0 &&
        effects.eqHigh === 0 &&
        effects.highpassFreq === 0 &&
        effects.lowpassFreq === 0 &&
        !effects.compressor &&
        !effects.limiter &&
        !effects.gate &&
        effects.noiseReduction === 0 &&
        !effects.loudnessNorm &&
        effects.fadeInDuration === 0 &&
        effects.fadeOutDuration === 0 &&
        !effects.echo &&
        effects.pitchShift === 0
    );
}
