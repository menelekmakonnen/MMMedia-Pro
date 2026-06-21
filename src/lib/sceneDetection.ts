// ══════════════════════════════════════════════════════════════════════════════
// sceneDetection.ts — Content-aware scene-cut detection helpers.
// Two paths: (1) parse FFmpeg's scene-score output (production, via the main
// process), and (2) a pure histogram-difference scorer (FreeCut-style) usable
// without FFmpeg and for unit testing. Feeds the beat-synced auto-editor so cuts
// can land on BOTH musical beats and visual content changes.
// ══════════════════════════════════════════════════════════════════════════════

export interface SceneCut { time: number; score: number; }

/** Parse `pts_time:NN` values from FFmpeg showinfo output (one per selected frame). */
export function parseShowinfoPtsTimes(text: string): number[] {
    const times: number[] = [];
    const re = /pts_time:([0-9]+\.?[0-9]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const t = parseFloat(m[1]);
        if (isFinite(t)) times.push(t);
    }
    return times;
}

/** Build a normalized per-channel RGB histogram from interleaved RGB(A) bytes. */
export function rgbHistogram(pixels: ArrayLike<number>, bins = 32, channels = 3): number[] {
    const hist = new Array(bins * 3).fill(0);
    const binSize = 256 / bins;
    let count = 0;
    for (let i = 0; i + 2 < pixels.length; i += channels) {
        const r = Math.min(bins - 1, Math.floor(pixels[i] / binSize));
        const g = Math.min(bins - 1, Math.floor(pixels[i + 1] / binSize));
        const b = Math.min(bins - 1, Math.floor(pixels[i + 2] / binSize));
        hist[r]++; hist[bins + g]++; hist[2 * bins + b]++;
        count++;
    }
    if (count > 0) for (let i = 0; i < hist.length; i++) hist[i] /= count;
    return hist;
}

/** Chi-squared distance between two normalized histograms (0 = identical). */
export function chiSquaredDistance(a: number[], b: number[]): number {
    let d = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
        const s = a[i] + b[i];
        if (s > 1e-9) { const diff = a[i] - b[i]; d += (diff * diff) / s; }
    }
    return d * 0.5;
}

/** Detect cuts from a sequence of frame histograms sampled at `sampleFps`.
 *  threshold ~0.3 (chi-sq), deduped within minGapSec. Returns cut times (sec). */
export function detectCutsFromHistograms(
    hists: number[][], sampleFps: number, threshold = 0.3, minGapSec = 2
): SceneCut[] {
    const cuts: SceneCut[] = [];
    let lastCut = -Infinity;
    for (let i = 1; i < hists.length; i++) {
        const score = chiSquaredDistance(hists[i - 1], hists[i]);
        const time = i / sampleFps;
        if (score >= threshold && time - lastCut >= minGapSec) {
            cuts.push({ time, score });
            lastCut = time;
        }
    }
    return cuts;
}

/** Convert cut times into clip-relative split frames within (0, durationFrames). */
export function cutsToSplitFrames(
    cutTimes: number[], fps: number, durationFrames: number, minSegFrames = 1
): number[] {
    const frames = cutTimes
        .map(t => Math.round(t * fps))
        .filter(f => f > minSegFrames && f < durationFrames - minSegFrames)
        .sort((a, b) => a - b);
    return frames.filter((f, i) => i === 0 || f - frames[i - 1] >= minSegFrames);
}
