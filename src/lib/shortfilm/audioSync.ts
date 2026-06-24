// ══════════════════════════════════════════════════════════════════════════════
// audioSync.ts — Pure cross-correlation aligner for dual-system sound.
//
// A separately-recorded mic (lav / boom into a field recorder) drifts from the
// camera's scratch audio by an unknown offset. `findAudioOffset` recovers that
// offset by NORMALIZED cross-correlation: it slides the mic signal against the
// reference across a bounded lag window and finds the lag that maximizes the
// energy-normalized correlation coefficient (Pearson-style, in [-1, 1]).
//
// A positive `offsetSamples` means the mic lags the reference (mic content
// appears `offsetSamples` later), so to align you advance the mic by that many
// samples. `confidence` is the peak normalized correlation, clamped to [0, 1].
//
// Strategy: COARSE-TO-FINE. Downsample both signals by an integer factor, search
// the full lag window cheaply, then refine around the coarse peak at full rate.
// Energy normalization makes it robust to level differences between the two
// recordings. Dependency-free, O(window · length) at the refine stage.
//
// PURE: numeric only. No React / IPC / FFmpeg.
// ══════════════════════════════════════════════════════════════════════════════

export interface AudioOffsetResult {
    /** Lag in samples (reference rate). Positive => mic lags reference. */
    offsetSamples: number;
    /** Same offset expressed in seconds. */
    offsetSec: number;
    /** Peak normalized cross-correlation at the chosen lag, clamped to [0, 1]. */
    confidence: number;
}

type Samples = Float32Array | number[];

function toFloat32(s: Samples): Float32Array {
    return s instanceof Float32Array ? s : Float32Array.from(s);
}

/** Subtract mean in-place-free; returns a zero-mean copy. */
function zeroMean(x: Float32Array): Float32Array {
    let mean = 0;
    for (let i = 0; i < x.length; i++) mean += x[i];
    mean /= Math.max(1, x.length);
    const out = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) out[i] = x[i] - mean;
    return out;
}

/** Average-pool downsample by integer factor (anti-aliases enough for coarse search). */
function downsample(x: Float32Array, factor: number): Float32Array {
    if (factor <= 1) return x;
    const n = Math.floor(x.length / factor);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        let acc = 0;
        const base = i * factor;
        for (let j = 0; j < factor; j++) acc += x[base + j];
        out[i] = acc / factor;
    }
    return out;
}

/**
 * Normalized cross-correlation at a single lag.
 * ref and mic are zero-mean. Lag is applied to mic: we compare ref[i] with
 * mic[i - lag]. Returns Pearson coefficient over the overlapping region, [-1, 1].
 */
function nccAtLag(ref: Float32Array, mic: Float32Array, lag: number): number {
    // Overlap: i ranges where both ref[i] and mic[i - lag] exist.
    const start = Math.max(0, lag);
    const end = Math.min(ref.length, mic.length + lag);
    const count = end - start;
    if (count < 2) return 0;

    let dot = 0, eRef = 0, eMic = 0;
    for (let i = start; i < end; i++) {
        const a = ref[i];
        const b = mic[i - lag];
        dot += a * b;
        eRef += a * a;
        eMic += b * b;
    }
    const denom = Math.sqrt(eRef * eMic);
    if (denom <= 1e-12) return 0;
    // Scale by overlap fraction so tiny-overlap lags can't fake a high score.
    const overlapFrac = count / Math.max(ref.length, mic.length);
    return (dot / denom) * Math.min(1, overlapFrac + 0.15);
}

/** Search the integer lag window [lo, hi] for the peak NCC. */
function searchPeak(ref: Float32Array, mic: Float32Array, lo: number, hi: number): { lag: number; score: number } {
    let bestLag = 0;
    let bestScore = -Infinity;
    for (let lag = lo; lag <= hi; lag++) {
        const s = nccAtLag(ref, mic, lag);
        if (s > bestScore) { bestScore = s; bestLag = lag; }
    }
    return { lag: bestLag, score: bestScore };
}

/**
 * Recover the sample offset that aligns `micSamples` to `refSamples`.
 *
 * @param refSamples   camera scratch audio (reference)
 * @param micSamples   separately-recorded mic to align
 * @param sampleRate   samples per second (both assumed equal rate)
 * @param maxOffsetSec maximum |offset| to search, in seconds
 */
export function findAudioOffset(
    refSamples: Samples,
    micSamples: Samples,
    sampleRate: number,
    maxOffsetSec: number,
): AudioOffsetResult {
    const ref0 = zeroMean(toFloat32(refSamples));
    const mic0 = zeroMean(toFloat32(micSamples));

    if (ref0.length < 2 || mic0.length < 2 || sampleRate <= 0) {
        return { offsetSamples: 0, offsetSec: 0, confidence: 0 };
    }

    const maxLag = Math.max(1, Math.floor(maxOffsetSec * sampleRate));

    // ── COARSE: downsample, search whole window cheaply. ──────────────────────
    // Pick a factor that keeps the coarse window modest (~<= 4000 lags).
    const coarseFactor = Math.max(1, Math.floor(maxLag / 2000));
    const refC = downsample(ref0, coarseFactor);
    const micC = downsample(mic0, coarseFactor);
    const coarseMaxLag = Math.max(1, Math.floor(maxLag / coarseFactor));

    const coarse = searchPeak(refC, micC, -coarseMaxLag, coarseMaxLag);
    const coarseCenter = coarse.lag * coarseFactor;

    // ── FINE: refine at full rate within ± one coarse step around the peak. ───
    const refineRadius = coarseFactor + 2;
    const lo = Math.max(-maxLag, coarseCenter - refineRadius);
    const hi = Math.min(maxLag, coarseCenter + refineRadius);
    const fine = searchPeak(ref0, mic0, lo, hi);

    const offsetSamples = fine.lag;
    const confidence = Math.max(0, Math.min(1, fine.score));

    return {
        offsetSamples,
        offsetSec: offsetSamples / sampleRate,
        confidence,
    };
}
