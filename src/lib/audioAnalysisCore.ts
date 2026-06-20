/**
 * Beat Intelligence Engine — Pure DSP Core
 * ════════════════════════════════════════════════════════════════════════════
 * This module contains ZERO Web Audio / DOM dependencies so it can run:
 *   • inside a Web Worker (off the main thread), and
 *   • inside Node for unit testing.
 *
 * The Web-Audio shell (audioAnalysis.ts) is responsible for decoding the file
 * and band-pass filtering; it hands the raw Float32Array band signals here.
 *
 * Pipeline:
 *   1. Onset-strength envelope (multi-band spectral flux)
 *   2. Tempo estimation via autocorrelation + octave correction (BPM prior)
 *   3. Phase alignment → clean tempo GRID (gridBeats) + per-band onset beats
 *   4. Downbeat / bar detection (3 vs 4 beats-per-bar)
 *   5. Structural segmentation via a Foote-style novelty curve
 *   6. Energy contour + waveform for the UI
 */

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export type BeatType = 'kick' | 'snare' | 'hat' | 'bass' | 'transient';
export type SegmentType = 'intro' | 'buildup' | 'drop' | 'breakdown' | 'chorus' | 'verse' | 'outro' | 'bridge';
export type EnergyEvent = 'riser' | 'drop' | 'silence' | 'peak' | 'sustain' | 'steady';

export interface BeatMarker {
    time: number;       // Seconds
    energy: number;     // Normalized 0-1
    type: BeatType;     // Classification
    onGrid: boolean;    // Quantized to BPM grid
}

export interface Segment {
    start: number;      // Seconds
    end: number;
    type: SegmentType;
    avgEnergy: number;  // 0-1
    peakEnergy: number; // 0-1
    beatCount: number;
}

export interface EnergyContour {
    time: number;
    energy: number;     // 0-1
    event: EnergyEvent;
}

export interface BpmCandidate {
    bpm: number;
    score: number;      // 0-1 relative strength
}

export interface AudioAnalysisResult {
    bpm: number;
    bpmConfidence: number;        // 0-1
    bpmCandidates: BpmCandidate[]; // Ranked alternatives (octave/competing tempi)
    offset: number;               // Seconds to first grid beat (phase)
    beats: BeatMarker[];          // Detected onsets (may be denser than the grid)
    gridBeats: number[];          // Clean tempo-grid beat times (seconds)
    downbeats: number[];          // Grid beats that fall on bar starts (seconds)
    beatsPerBar: 3 | 4;           // Detected meter
    segments: Segment[];
    energyContour: EnergyContour[];
    waveformData: number[];       // Downsampled for UI (~2000 points)
    duration: number;
    peaks: BeatMarker[];          // Legacy alias for beats
}

/** Inputs handed to the pure core by the Web-Audio shell (or worker). */
export interface BandSignals {
    mono: Float32Array;   // Full-mix downmix (for contour + waveform)
    low: Float32Array;    // 20–150 Hz   (kick / bass)
    mid: Float32Array;    // 150–2000 Hz (snare / vocals)
    high: Float32Array;   // 2k–16k Hz   (hats / cymbals)
    sampleRate: number;
    duration: number;
}

// ═══════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════

const ENERGY_WINDOW_MS = 50;           // Band onset RMS window
const FLUX_HOP_MS = 10;                // Onset-strength envelope resolution
const CONTOUR_RESOLUTION_MS = 100;     // Energy-contour resolution
const FEATURE_HOP_S = 0.5;             // Structural feature-frame resolution
const MIN_BEAT_DISTANCE_S = 0.08;      // ~750 BPM cap on raw onsets
const WAVEFORM_POINTS = 2000;
const AUTOCORR_MIN_BPM = 60;
const AUTOCORR_MAX_BPM = 200;
const TEMPO_PRIOR_CENTER = 125;        // Perceptually-preferred tempo (Parncutt)
const TEMPO_PRIOR_WIDTH = 55;          // Std-dev of the log-normal-ish prior
const MIN_SEGMENT_S = 2.0;             // Minimum musical-section length (finer full-song mapping)

// ═══════════════════════════════════════════════════════
//  SAFE ARRAY REDUCERS  (no spread → no stack-overflow on long tracks)
// ═══════════════════════════════════════════════════════
// `Math.max(...arr)` throws "Maximum call stack size exceeded" once arr is
// large (≈100k+). Audio arrays are millions of samples, so we never spread.

export function arrayMax(arr: ArrayLike<number>, floor = -Infinity): number {
    let m = floor;
    for (let i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i];
    return m;
}
export function arrayMin(arr: ArrayLike<number>, ceil = Infinity): number {
    let m = ceil;
    for (let i = 0; i < arr.length; i++) if (arr[i] < m) m = arr[i];
    return m;
}
export function arraySum(arr: ArrayLike<number>): number {
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += arr[i];
    return s;
}
export function arrayMean(arr: ArrayLike<number>): number {
    return arr.length ? arraySum(arr) / arr.length : 0;
}

// ═══════════════════════════════════════════════════════
//  LOW-LEVEL DSP HELPERS
// ═══════════════════════════════════════════════════════

/** RMS energy of a window of samples. */
function rmsEnergy(data: Float32Array, start: number, length: number): number {
    let sum = 0;
    const end = Math.min(start + length, data.length);
    const n = end - start;
    if (n <= 0) return 0;
    for (let i = start; i < end; i++) sum += data[i] * data[i];
    return Math.sqrt(sum / n);
}

/**
 * Per-band onset-strength envelope (positive spectral flux proxy).
 * For each hop frame we sum the *positive* change in RMS energy across the
 * three bands. This is far more robust for tempo/phase than a binary onset
 * train because it preserves the relative strength of each pulse.
 */
function onsetStrengthEnvelope(bands: BandSignals): { osf: Float32Array; hopFrames: number } {
    const { low, mid, high, sampleRate } = bands;
    const hopFrames = Math.max(1, Math.floor((FLUX_HOP_MS / 1000) * sampleRate));
    const win = Math.max(hopFrames, Math.floor((ENERGY_WINDOW_MS / 1000) * sampleRate));
    const n = Math.floor((low.length - win) / hopFrames);
    if (n <= 0) return { osf: new Float32Array(0), hopFrames };

    const osf = new Float32Array(n);
    let pLow = 0, pMid = 0, pHigh = 0;
    for (let i = 0; i < n; i++) {
        const s = i * hopFrames;
        const eLow = rmsEnergy(low, s, win);
        const eMid = rmsEnergy(mid, s, win);
        const eHigh = rmsEnergy(high, s, win);
        // Positive flux per band, weighted toward percussive bands.
        const flux =
            Math.max(0, eLow - pLow) * 1.0 +
            Math.max(0, eMid - pMid) * 0.8 +
            Math.max(0, eHigh - pHigh) * 0.6;
        osf[i] = flux;
        pLow = eLow; pMid = eMid; pHigh = eHigh;
    }

    // Normalize 0-1.
    const mx = arrayMax(osf, 1e-9);
    if (mx > 0) for (let i = 0; i < n; i++) osf[i] /= mx;
    return { osf, hopFrames };
}

/** Detect discrete onsets in a single band via adaptive thresholding. */
function detectOnsets(
    data: Float32Array,
    sampleRate: number,
    minDistanceS: number,
    sensitivityMultiplier = 1.5,
): { time: number; energy: number }[] {
    const windowSize = Math.max(1, Math.floor((ENERGY_WINDOW_MS / 1000) * sampleRate));
    const energies: number[] = [];
    for (let i = 0; i < data.length - windowSize; i += windowSize) {
        energies.push(rmsEnergy(data, i, windowSize));
    }
    if (energies.length === 0) return [];

    const maxEnergy = arrayMax(energies, 0.001);
    const normalized = energies.map(e => e / maxEnergy);

    const rollingWindow = 8;
    const onsets: { time: number; energy: number }[] = [];
    for (let i = 0; i < normalized.length; i++) {
        const start = Math.max(0, i - rollingWindow);
        const end = Math.min(normalized.length, i + rollingWindow + 1);
        let localSum = 0;
        for (let j = start; j < end; j++) localSum += normalized[j];
        const localAvg = localSum / (end - start);
        const threshold = Math.max(localAvg * sensitivityMultiplier, 0.15);

        if (normalized[i] > threshold) {
            const time = (i * windowSize) / sampleRate;
            if (onsets.length === 0 || (time - onsets[onsets.length - 1].time) > minDistanceS) {
                onsets.push({ time, energy: normalized[i] });
            }
        }
    }
    return onsets;
}

/** Classify a beat by which band carries the most energy. */
function classifyBeat(lowEnergy: number, midEnergy: number, highEnergy: number): BeatType {
    const max = Math.max(lowEnergy, midEnergy, highEnergy);
    if (max < 0.01) return 'transient';
    if (lowEnergy === max) return lowEnergy > 0.5 ? 'kick' : 'bass';
    if (midEnergy === max) return 'snare';
    return 'hat';
}

// ═══════════════════════════════════════════════════════
//  TEMPO  (autocorrelation + octave correction)
// ═══════════════════════════════════════════════════════

/** Log-domain prior: how musically plausible a BPM is (0-1). */
function tempoPrior(bpm: number): number {
    const d = Math.log2(bpm / TEMPO_PRIOR_CENTER);
    return Math.exp(-(d * d) / (2 * Math.pow(TEMPO_PRIOR_WIDTH / TEMPO_PRIOR_CENTER, 2)));
}

/**
 * Estimate tempo from the onset-strength envelope.
 * Autocorrelation gives the raw periodicity; we then test the candidate and its
 * octave relatives (½×, 2×, ⅓×, 3×) against the musical prior to fix the
 * classic "double/half-time" octave error.
 */
export function estimateTempo(
    osf: Float32Array,
    hopFrames: number,
    sampleRate: number,
): { bpm: number; confidence: number; candidates: BpmCandidate[] } {
    const n = osf.length;
    if (n < 8) return { bpm: 120, confidence: 0, candidates: [{ bpm: 120, score: 0 }] };

    const hopSec = hopFrames / sampleRate;
    const minLag = Math.max(1, Math.floor(60 / (AUTOCORR_MAX_BPM * hopSec)));
    const maxLag = Math.min(n - 1, Math.floor(60 / (AUTOCORR_MIN_BPM * hopSec)));

    // Normalized autocorrelation across the tempo lag range.
    const acf: { lag: number; corr: number }[] = [];
    let totalCorr = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
        let corr = 0;
        const count = n - lag;
        for (let i = 0; i < count; i++) corr += osf[i] * osf[i + lag];
        const norm = count > 0 ? corr / count : 0;
        acf.push({ lag, corr: norm });
        totalCorr += norm;
    }
    if (acf.length === 0) return { bpm: 120, confidence: 0, candidates: [{ bpm: 120, score: 0 }] };
    const avgCorr = totalCorr / acf.length;

    // Find local peaks in the ACF (true periodicities, not the monotonic tail).
    const peaks: { bpm: number; corr: number }[] = [];
    for (let i = 1; i < acf.length - 1; i++) {
        if (acf[i].corr > acf[i - 1].corr && acf[i].corr >= acf[i + 1].corr && acf[i].corr > avgCorr) {
            const bpm = 60 / (acf[i].lag * hopSec);
            peaks.push({ bpm, corr: acf[i].corr });
        }
    }
    if (peaks.length === 0) {
        // Fall back to the global ACF max.
        let best = acf[0];
        for (const a of acf) if (a.corr > best.corr) best = a;
        peaks.push({ bpm: 60 / (best.lag * hopSec), corr: best.corr });
    }

    // Score each peak (and its octave relatives) by ACF strength × musical prior.
    const octaves = [1, 2, 0.5, 3, 1 / 3];
    const scored = new Map<number, number>(); // rounded bpm → score
    for (const p of peaks) {
        for (const o of octaves) {
            const bpm = p.bpm * o;
            if (bpm < AUTOCORR_MIN_BPM || bpm > AUTOCORR_MAX_BPM) continue;
            const rounded = Math.round(bpm);
            // Octave relatives inherit a fraction of the parent's ACF energy.
            const octavePenalty = o === 1 ? 1 : 0.85;
            const score = (p.corr / arrayMax(peaks.map(x => x.corr), 1e-9)) * tempoPrior(bpm) * octavePenalty;
            scored.set(rounded, Math.max(scored.get(rounded) ?? 0, score));
        }
    }

    const candidates: BpmCandidate[] = [...scored.entries()]
        .map(([bpm, score]) => ({ bpm, score: Math.round(score * 1000) / 1000 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

    const best = candidates[0] ?? { bpm: 120, score: 0 };
    // Confidence: how dominant the winner is over the runner-up, blended with raw strength.
    const runnerUp = candidates[1]?.score ?? 0;
    const dominance = best.score > 0 ? (best.score - runnerUp) / best.score : 0;
    const confidence = Math.max(0, Math.min(1, 0.5 * best.score + 0.5 * dominance));

    return { bpm: best.bpm, confidence: Math.round(confidence * 100) / 100, candidates };
}

/**
 * Find the grid phase (offset, in seconds) that best aligns a tempo grid of the
 * given BPM to the onset-strength envelope. Tries every sub-beat position.
 */
export function estimatePhase(
    osf: Float32Array,
    hopFrames: number,
    sampleRate: number,
    bpm: number,
): number {
    const n = osf.length;
    if (n === 0 || bpm <= 0) return 0;
    const hopSec = hopFrames / sampleRate;
    const periodFrames = (60 / bpm) / hopSec;
    if (periodFrames < 1) return 0;

    const steps = Math.max(1, Math.round(periodFrames));
    let bestPhase = 0;
    let bestScore = -1;
    for (let p = 0; p < steps; p++) {
        let score = 0;
        for (let pos = p; pos < n; pos += periodFrames) {
            const idx = Math.round(pos);
            if (idx < n) score += osf[idx];
        }
        if (score > bestScore) { bestScore = score; bestPhase = p; }
    }
    return (bestPhase * hopFrames) / sampleRate;
}

/** Build a clean tempo grid from BPM + phase offset. */
export function buildGrid(bpm: number, offset: number, duration: number): number[] {
    const grid: number[] = [];
    if (bpm <= 0) return grid;
    const step = 60 / bpm;
    // Back-fill so the grid starts at/near 0 even if phase is mid-bar.
    let t = offset - Math.floor(offset / step) * step;
    for (; t <= duration + 1e-6; t += step) {
        if (t >= -1e-6) grid.push(Math.round(t * 1000) / 1000);
    }
    return grid;
}

/** Sample the onset-strength envelope at an arbitrary time (nearest frame). */
function sampleOsf(osf: Float32Array, hopFrames: number, sampleRate: number, time: number): number {
    const idx = Math.round((time * sampleRate) / hopFrames);
    return idx >= 0 && idx < osf.length ? osf[idx] : 0;
}

/**
 * Detect meter (3 vs 4) and the downbeat phase by finding which bar position
 * accumulates the most onset energy across the grid.
 */
export function detectDownbeats(
    gridBeats: number[],
    osf: Float32Array,
    hopFrames: number,
    sampleRate: number,
): { downbeats: number[]; beatsPerBar: 3 | 4 } {
    if (gridBeats.length < 4) return { downbeats: gridBeats.slice(), beatsPerBar: 4 };
    const energies = gridBeats.map(t => sampleOsf(osf, hopFrames, sampleRate, t));

    let best: { bpb: 3 | 4; phase: number; contrast: number } = { bpb: 4, phase: 0, contrast: -1 };
    for (const bpb of [4, 3] as const) {
        const phaseSums = new Array(bpb).fill(0);
        const phaseCounts = new Array(bpb).fill(0);
        for (let i = 0; i < energies.length; i++) {
            phaseSums[i % bpb] += energies[i];
            phaseCounts[i % bpb]++;
        }
        const phaseAvgs = phaseSums.map((s, i) => (phaseCounts[i] ? s / phaseCounts[i] : 0));
        let phase = 0;
        for (let i = 1; i < bpb; i++) if (phaseAvgs[i] > phaseAvgs[phase]) phase = i;
        const mean = arrayMean(phaseAvgs);
        const contrast = mean > 0 ? (phaseAvgs[phase] - mean) / mean : 0;
        if (contrast > best.contrast) best = { bpb, phase, contrast };
    }

    const downbeats: number[] = [];
    for (let i = 0; i < gridBeats.length; i++) {
        if (((i - best.phase) % best.bpb + best.bpb) % best.bpb === 0) downbeats.push(gridBeats[i]);
    }
    return { downbeats, beatsPerBar: best.bpb };
}

// ═══════════════════════════════════════════════════════
//  ENERGY CONTOUR
// ═══════════════════════════════════════════════════════

function buildEnergyContour(data: Float32Array, sampleRate: number): EnergyContour[] {
    const windowSize = Math.max(1, Math.floor((CONTOUR_RESOLUTION_MS / 1000) * sampleRate));
    const contour: EnergyContour[] = [];
    for (let i = 0; i < data.length - windowSize; i += windowSize) {
        contour.push({ time: i / sampleRate, energy: rmsEnergy(data, i, windowSize), event: 'steady' });
    }
    if (contour.length === 0) return [];

    const maxE = arrayMax(contour.map(c => c.energy), 0.001);
    for (const c of contour) c.energy = c.energy / maxE;

    const smoothWindow = 5;
    for (let i = smoothWindow; i < contour.length - smoothWindow; i++) {
        let prevSum = 0, nextSum = 0;
        for (let j = i - smoothWindow; j < i; j++) prevSum += contour[j].energy;
        for (let j = i + 1; j <= i + smoothWindow; j++) nextSum += contour[j].energy;
        const prev = prevSum / smoothWindow;
        const next = nextSum / smoothWindow;
        const curr = contour[i].energy;
        const rising = next - prev;
        if (curr < 0.05) contour[i].event = 'silence';
        else if (rising > 0.15) contour[i].event = 'riser';
        else if (rising < -0.15) contour[i].event = 'drop';
        else if (curr > 0.8) contour[i].event = 'peak';
        else if (curr > 0.5) contour[i].event = 'sustain';
    }
    return contour;
}

// ═══════════════════════════════════════════════════════
//  STRUCTURAL SEGMENTATION  (Foote-style novelty)
// ═══════════════════════════════════════════════════════

/**
 * Detect section boundaries from a novelty curve over multi-band feature frames,
 * then label each section by its relative energy / trend / position. Boundaries
 * are change-points in the music — far more musical than fixed 4-second windows.
 */
export function detectSegments(
    bands: BandSignals,
    duration: number,
    gridBeats: number[],
    beatMarkers: BeatMarker[],
): Segment[] {
    const { low, mid, high, sampleRate } = bands;
    const hop = Math.max(1, Math.floor(FEATURE_HOP_S * sampleRate));
    const nFrames = Math.floor(low.length / hop);
    if (nFrames < 4) {
        return [{ start: 0, end: duration, type: 'verse', avgEnergy: 0.5, peakEnergy: 0.5, beatCount: beatMarkers.length }];
    }

    // Per-frame normalized [low, mid, high] feature vectors.
    const feats: number[][] = [];
    const energyAt: number[] = [];
    for (let i = 0; i < nFrames; i++) {
        const s = i * hop;
        const l = rmsEnergy(low, s, hop);
        const m = rmsEnergy(mid, s, hop);
        const h = rmsEnergy(high, s, hop);
        feats.push([l, m, h]);
        energyAt.push(l + m + h);
    }
    // Normalize features per band so loud bands don't dominate.
    for (let b = 0; b < 3; b++) {
        let mx = 1e-9;
        for (let i = 0; i < nFrames; i++) if (feats[i][b] > mx) mx = feats[i][b];
        for (let i = 0; i < nFrames; i++) feats[i][b] /= mx;
    }
    const eMax = arrayMax(energyAt, 1e-9);
    for (let i = 0; i < nFrames; i++) energyAt[i] /= eMax;

    // Novelty: 1 − cosine similarity between the mean of the preceding and
    // following half-kernel windows (Foote checkerboard, simplified).
    const W = Math.max(2, Math.round((MIN_SEGMENT_S / 2) / FEATURE_HOP_S));
    const novelty = new Float32Array(nFrames);
    const meanVec = (a: number, b: number): number[] => {
        const v = [0, 0, 0];
        const n = b - a;
        for (let i = a; i < b; i++) { v[0] += feats[i][0]; v[1] += feats[i][1]; v[2] += feats[i][2]; }
        return n > 0 ? [v[0] / n, v[1] / n, v[2] / n] : v;
    };
    const cosDist = (p: number[], q: number[]): number => {
        const dot = p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
        const mp = Math.hypot(p[0], p[1], p[2]);
        const mq = Math.hypot(q[0], q[1], q[2]);
        return mp > 0 && mq > 0 ? 1 - dot / (mp * mq) : 0;
    };
    // Combine TIMBRE change (cosine distance of band balance) with ENERGY-LEVEL
    // change. Most section changes (verse→chorus, breakdown→drop) are primarily
    // loudness shifts with the SAME instruments, which cosine distance alone is
    // blind to — so energy is weighted as a primary driver of novelty.
    const meanEnergy = (a: number, b: number): number => {
        let sum = 0; for (let i = a; i < b; i++) sum += energyAt[i];
        return b > a ? sum / (b - a) : 0;
    };
    for (let i = W; i < nFrames - W; i++) {
        const timbre = cosDist(meanVec(i - W, i), meanVec(i, i + W));
        const energyChange = Math.abs(meanEnergy(i, i + W) - meanEnergy(i - W, i)); // 0..1
        novelty[i] = timbre + energyChange * 2.0;
    }

    // Peak-pick novelty above an adaptive threshold, enforcing min spacing.
    const novMean = arrayMean(novelty);
    const novMax = arrayMax(novelty, 1e-9);
    const thresh = novMean + (novMax - novMean) * 0.22;
    const minSpacingFrames = Math.round(MIN_SEGMENT_S / FEATURE_HOP_S);
    const boundaries: number[] = [0];
    let lastB = 0;
    for (let i = W; i < nFrames - W; i++) {
        if (
            novelty[i] > thresh &&
            novelty[i] >= novelty[i - 1] &&
            novelty[i] > novelty[i + 1] &&
            i - lastB >= minSpacingFrames
        ) {
            boundaries.push(i);
            lastB = i;
        }
    }
    boundaries.push(nFrames);

    // Snap interior boundaries to the nearest downbeat-ish grid beat for musicality.
    const snap = (frameIdx: number): number => {
        const t = frameIdx * FEATURE_HOP_S;
        if (gridBeats.length === 0) return Math.min(duration, t);
        let nearest = gridBeats[0];
        let bestD = Math.abs(gridBeats[0] - t);
        for (const g of gridBeats) {
            const d = Math.abs(g - t);
            if (d < bestD) { bestD = d; nearest = g; }
        }
        return nearest;
    };

    // Build raw segments with energy stats.
    interface Raw { start: number; end: number; avg: number; peak: number; trend: number; }
    const raws: Raw[] = [];
    for (let b = 0; b < boundaries.length - 1; b++) {
        const f0 = boundaries[b];
        const f1 = boundaries[b + 1];
        let start = b === 0 ? 0 : snap(f0);
        let end = b === boundaries.length - 2 ? duration : snap(f1);
        if (end <= start) end = Math.min(duration, start + MIN_SEGMENT_S);
        let sum = 0, peak = 0;
        for (let i = f0; i < f1; i++) { sum += energyAt[i]; if (energyAt[i] > peak) peak = energyAt[i]; }
        const avg = f1 > f0 ? sum / (f1 - f0) : 0;
        const half = Math.floor((f0 + f1) / 2);
        let firstSum = 0, secondSum = 0;
        for (let i = f0; i < half; i++) firstSum += energyAt[i];
        for (let i = half; i < f1; i++) secondSum += energyAt[i];
        const firstAvg = half > f0 ? firstSum / (half - f0) : 0;
        const secondAvg = f1 > half ? secondSum / (f1 - half) : 0;
        raws.push({ start, end, avg, peak, trend: secondAvg - firstAvg });
    }

    // Global stats for relative labeling.
    const globalAvg = arrayMean(raws.map(r => r.avg));
    const globalMax = arrayMax(raws.map(r => r.peak), 1e-9);
    const highThresh = globalAvg + (globalMax - globalAvg) * 0.45;
    const lowThresh = globalAvg * 0.6;

    const segments: Segment[] = [];
    for (let i = 0; i < raws.length; i++) {
        const r = raws[i];
        const isFirst = i === 0;
        const isLast = i === raws.length - 1;
        let type: SegmentType;
        if (isFirst && r.avg < highThresh) type = 'intro';
        else if (isLast && r.avg < globalAvg) type = 'outro';
        else if (r.avg >= highThresh && r.peak >= globalMax * 0.7) type = 'drop';
        else if (r.trend > 0.08 && r.avg < highThresh) type = 'buildup';
        else if (r.avg < lowThresh) type = 'breakdown';
        else if (r.trend < -0.08 && r.avg < globalAvg) type = 'bridge';
        else if (r.avg >= globalAvg) type = 'chorus';
        else type = 'verse';

        const beatCount = beatMarkers.filter(b => b.time >= r.start && b.time <= r.end).length;

        // Merge consecutive identical labels.
        const prev = segments[segments.length - 1];
        if (prev && prev.type === type) {
            prev.end = r.end;
            prev.avgEnergy = (prev.avgEnergy + r.avg) / 2;
            prev.peakEnergy = Math.max(prev.peakEnergy, r.peak);
            prev.beatCount += beatCount;
        } else {
            segments.push({ start: r.start, end: r.end, type, avgEnergy: r.avg, peakEnergy: r.peak, beatCount });
        }
    }
    if (segments.length > 0) {
        segments[0].start = 0;
        segments[segments.length - 1].end = duration;
    }
    return segments;
}

// ═══════════════════════════════════════════════════════
//  WAVEFORM
// ═══════════════════════════════════════════════════════

function downsampleWaveform(mono: Float32Array, targetPoints: number): number[] {
    const blockSize = Math.max(1, Math.floor(mono.length / targetPoints));
    const result: number[] = [];
    for (let i = 0; i < targetPoints; i++) {
        const start = i * blockSize;
        let max = 0;
        for (let j = 0; j < blockSize && start + j < mono.length; j++) {
            const abs = Math.abs(mono[start + j]);
            if (abs > max) max = abs;
        }
        result.push(max);
    }
    const maxVal = arrayMax(result, 0.001);
    return result.map(v => v / maxVal);
}

// ═══════════════════════════════════════════════════════
//  MAIN PURE ENTRY  (called inline OR inside the worker)
// ═══════════════════════════════════════════════════════

export function analyzeBands(bands: BandSignals, beatSensitivity = 0.5): AudioAnalysisResult {
    const { low, mid, high, mono, sampleRate, duration } = bands;

    // 1. Onset-strength envelope (drives tempo + phase + downbeats).
    const { osf, hopFrames } = onsetStrengthEnvelope(bands);

    // 2. Per-band discrete onsets → classified beat markers.
    const sensFactor = 2.5 - (beatSensitivity * 1.7); // 0.8 (loose) … 2.5 (strict)
    const lowOnsets = detectOnsets(low, sampleRate, MIN_BEAT_DISTANCE_S, 1.4 * sensFactor);
    const midOnsets = detectOnsets(mid, sampleRate, MIN_BEAT_DISTANCE_S, 1.6 * sensFactor);
    const highOnsets = detectOnsets(high, sampleRate, MIN_BEAT_DISTANCE_S, 2.0 * sensFactor);

    const merged = new Map<number, { low: number; mid: number; high: number }>();
    const q = (t: number) => Math.round(t * 100) / 100; // 10 ms bucket
    const add = (arr: { time: number; energy: number }[], band: 'low' | 'mid' | 'high') => {
        for (const o of arr) {
            const key = q(o.time);
            const e = merged.get(key) || { low: 0, mid: 0, high: 0 };
            e[band] = Math.max(e[band], o.energy);
            merged.set(key, e);
        }
    };
    add(lowOnsets, 'low'); add(midOnsets, 'mid'); add(highOnsets, 'high');

    const sortedTimes = [...merged.keys()].sort((a, b) => a - b);
    const rawBeats = sortedTimes.map(t => {
        const b = merged.get(t)!;
        return { time: t, energy: Math.max(b.low, b.mid, b.high), type: classifyBeat(b.low, b.mid, b.high) };
    });

    // 3. Tempo (with octave correction) + phase → clean grid.
    const { bpm, confidence, candidates } = estimateTempo(osf, hopFrames, sampleRate);
    const offset = estimatePhase(osf, hopFrames, sampleRate, bpm);
    const gridBeats = buildGrid(bpm, offset, duration);

    // 4. Mark which detected onsets land on the grid (±60 ms).
    const tol = 0.06;
    const beats: BeatMarker[] = rawBeats
        .filter(b => b.time <= duration)
        .map(b => {
            let onGrid = false;
            // Binary-ish scan: grid is sorted.
            for (const g of gridBeats) {
                if (Math.abs(g - b.time) <= tol) { onGrid = true; break; }
                if (g - b.time > tol) break;
            }
            return { ...b, onGrid };
        });

    // 5. Downbeats / meter.
    const { downbeats, beatsPerBar } = detectDownbeats(gridBeats, osf, hopFrames, sampleRate);

    // 6. Energy contour (full mix).
    const energyContour = buildEnergyContour(mono, sampleRate);

    // 7. Structural segmentation.
    const segments = detectSegments(bands, duration, gridBeats, beats);

    // 8. Waveform.
    const waveformData = downsampleWaveform(mono, WAVEFORM_POINTS);

    return {
        bpm,
        bpmConfidence: confidence,
        bpmCandidates: candidates,
        offset,
        beats,
        gridBeats,
        downbeats,
        beatsPerBar,
        segments,
        energyContour,
        waveformData,
        duration,
        peaks: beats,
    };
}

// ═══════════════════════════════════════════════════════
//  RHYTHM CONSISTENCY  (pure — unchanged contract)
// ═══════════════════════════════════════════════════════

export interface RhythmProfile {
    consistency: 'locked' | 'shifting' | 'chaotic';
    tempoChanges: { time: number; fromBPM: number; toBPM: number }[];
    dominantSubdivision: 2 | 3 | 4;
}

export function analyzeRhythmConsistency(beats: BeatMarker[]): RhythmProfile {
    if (beats.length < 4) return { consistency: 'chaotic', tempoChanges: [], dominantSubdivision: 4 };

    const intervals: number[] = [];
    for (let i = 1; i < beats.length; i++) intervals.push(beats[i].time - beats[i - 1].time);

    const mean = arrayMean(intervals);
    const variance = arrayMean(intervals.map(v => (v - mean) * (v - mean)));
    const coeffOfVariation = mean > 0 ? Math.sqrt(variance) / mean : 1;

    const tempoChanges: { time: number; fromBPM: number; toBPM: number }[] = [];
    const windowSize = 8;
    for (let i = windowSize; i < intervals.length - windowSize; i++) {
        const before = intervals.slice(i - windowSize, i);
        const after = intervals.slice(i, i + windowSize);
        const bpmBefore = 60 / arrayMean(before);
        const bpmAfter = 60 / arrayMean(after);
        if (Math.abs(bpmAfter - bpmBefore) > 5) {
            const last = tempoChanges[tempoChanges.length - 1];
            if (!last || beats[i].time - last.time > 2.0) {
                tempoChanges.push({ time: beats[i].time, fromBPM: Math.round(bpmBefore), toBPM: Math.round(bpmAfter) });
            }
        }
    }

    let bestSub: 2 | 3 | 4 = 4;
    let bestScore = 0;
    for (const sub of [2, 3, 4] as const) {
        let score = 0;
        for (let i = 0; i < beats.length; i++) if (i % sub === 0) score += beats[i].energy;
        score /= Math.ceil(beats.length / sub);
        if (score > bestScore) { bestScore = score; bestSub = sub; }
    }

    return {
        consistency: coeffOfVariation < 0.05 ? 'locked' : coeffOfVariation < 0.15 ? 'shifting' : 'chaotic',
        tempoChanges,
        dominantSubdivision: bestSub,
    };
}

// ═══════════════════════════════════════════════════════
//  PHRASE DETECTION  (pure — unchanged contract)
// ═══════════════════════════════════════════════════════

export interface MusicPhrase {
    startTime: number;
    endTime: number;
    beatCount: number;
    energy: 'rising' | 'falling' | 'steady' | 'peak';
}

export function detectPhrases(beats: BeatMarker[], _bpm: number, subdivision = 4): MusicPhrase[] {
    if (beats.length < 4) return [];
    const beatsPerPhrase = subdivision * 4;
    const phrases: MusicPhrase[] = [];
    for (let i = 0; i < beats.length; i += beatsPerPhrase) {
        const pb = beats.slice(i, i + beatsPerPhrase);
        if (pb.length < 2) break;
        const start = pb[0].time;
        const end = pb[pb.length - 1].time;
        const firstHalf = pb.slice(0, Math.ceil(pb.length / 2));
        const secondHalf = pb.slice(Math.ceil(pb.length / 2));
        const firstEnergy = arrayMean(firstHalf.map(b => b.energy));
        const secondEnergy = arrayMean(secondHalf.map(b => b.energy));
        const avgEnergy = arrayMean(pb.map(b => b.energy));
        let energy: MusicPhrase['energy'];
        if (avgEnergy > 0.75) energy = 'peak';
        else if (secondEnergy - firstEnergy > 0.1) energy = 'rising';
        else if (firstEnergy - secondEnergy > 0.1) energy = 'falling';
        else energy = 'steady';
        phrases.push({ startTime: start, endTime: end, beatCount: pb.length, energy });
    }
    return phrases;
}
