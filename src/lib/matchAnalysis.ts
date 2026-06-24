/**
 * matchAnalysis.ts — Match-cut & seamless transition analysis.
 *
 * Uses perceptual hashing, colour histograms, and motion direction data
 * from the Smart Engine to identify pairs of clips that can be joined with
 * match-cut or seamless transitions.
 *
 * - **Match cut**: clips where the end frame of clip A is visually similar
 *   to the start frame of clip B (shape, composition, colour).
 * - **Seamless**: clips whose boundary frames are so close in pattern,
 *   colour, and motion direction that the cut is imperceptible until the
 *   new content starts diverging.
 *
 * Deeply connected to: trailerSmartStore (analysis results), smartEngine (producer),
 *                       trailerGenerator (consumer for transition placement).
 */

import type { ClipAnalysisResult } from '../store/trailerSmartStore';

// ── Perceptual hash distance ──────────────────────────────────────────────────

/**
 * Hamming distance between two hex-encoded perceptual hashes.
 * Lower = more similar. Returns Infinity if hashes are different lengths or missing.
 */
export function hammingDistance(a?: string, b?: string): number {
    if (!a || !b || a.length !== b.length) return Infinity;
    let dist = 0;
    for (let i = 0; i < a.length; i++) {
        const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
        // Count bits set in XOR result (4 bits per hex digit)
        dist += ((xor >> 3) & 1) + ((xor >> 2) & 1) + ((xor >> 1) & 1) + (xor & 1);
    }
    return dist;
}

// ── Histogram similarity ─────────────────────────────────────────────────────

/**
 * Cosine similarity between two normalised histograms. Returns 0..1 (1 = identical).
 */
export function histogramSimilarity(h1?: number[], h2?: number[]): number {
    if (!h1 || !h2 || h1.length !== h2.length || h1.length === 0) return 0;
    let dot = 0, mag1 = 0, mag2 = 0;
    for (let i = 0; i < h1.length; i++) {
        dot += h1[i] * h2[i];
        mag1 += h1[i] * h1[i];
        mag2 += h2[i] * h2[i];
    }
    const denom = Math.sqrt(mag1) * Math.sqrt(mag2);
    return denom > 0 ? dot / denom : 0;
}

// ── Motion direction delta ───────────────────────────────────────────────────

/**
 * Angular distance between two motion directions (0–360°). Returns 0..180.
 */
export function motionDirectionDelta(d1?: number, d2?: number): number {
    if (d1 == null || d2 == null) return 180; // unknown = maximum mismatch
    const diff = Math.abs(d1 - d2) % 360;
    return diff > 180 ? 360 - diff : diff;
}

// ── Match-cut pair finding ───────────────────────────────────────────────────

export interface MatchPair {
    /** ID of the outgoing clip (its end frame is the match point). */
    fromId: string;
    /** ID of the incoming clip (its start frame is the match point). */
    toId: string;
    /** Hamming distance between end-frame and start-frame perceptual hashes. */
    hashDistance: number;
    /** Type of match: 'match-cut' for visual similarity, 'seamless' for imperceptible. */
    type: 'match-cut' | 'seamless';
    /** Overall confidence score 0..1. */
    confidence: number;
}

/**
 * Find pairs of clips suitable for match-cut transitions.
 * A match cut requires that the end frame of clip A looks visually similar to
 * the start frame of clip B (low hamming distance between perceptual hashes).
 *
 * @param results  Per-clip analysis results keyed by file ID.
 * @param threshold  Maximum hamming distance to consider a match (default 8).
 */
export function findMatchCutPairs(
    results: Record<string, ClipAnalysisResult>,
    threshold = 8,
): MatchPair[] {
    const pairs: MatchPair[] = [];
    const ids = Object.keys(results).filter(id => {
        const r = results[id];
        return r.analyzed && r.endFrameSignature && r.startFrameSignature;
    });

    for (const fromId of ids) {
        const fromEnd = results[fromId].endFrameSignature!;
        for (const toId of ids) {
            if (fromId === toId) continue;
            const toStart = results[toId].startFrameSignature!;
            const dist = hammingDistance(fromEnd, toStart);
            if (dist <= threshold) {
                // Confidence: 1 at distance 0, 0 at threshold
                const confidence = 1 - (dist / threshold);
                pairs.push({ fromId, toId, hashDistance: dist, type: 'match-cut', confidence });
            }
        }
    }

    // Sort by confidence descending
    pairs.sort((a, b) => b.confidence - a.confidence);
    return pairs;
}

/**
 * Find pairs of clips suitable for seamless transitions.
 * A seamless transition requires:
 * 1. High colour histogram similarity (> 0.85 cosine similarity)
 * 2. Similar motion direction (< 30° angular delta)
 * 3. Reasonable perceptual hash proximity (< 12 hamming distance)
 *
 * The combination of all three makes the transition imperceptible.
 */
export function findSeamlessTransitionPairs(
    results: Record<string, ClipAnalysisResult>,
    opts: { histThreshold?: number; motionThreshold?: number; hashThreshold?: number } = {},
): MatchPair[] {
    const {
        histThreshold = 0.85,
        motionThreshold = 30,
        hashThreshold = 12,
    } = opts;

    const pairs: MatchPair[] = [];
    const ids = Object.keys(results).filter(id => {
        const r = results[id];
        return r.analyzed && r.colorHistogram && r.dominantMotionDirection != null;
    });

    for (const fromId of ids) {
        const from = results[fromId];
        for (const toId of ids) {
            if (fromId === toId) continue;
            const to = results[toId];

            const histSim = histogramSimilarity(from.colorHistogram, to.colorHistogram);
            const motionDelta = motionDirectionDelta(from.dominantMotionDirection, to.dominantMotionDirection);
            const hashDist = hammingDistance(from.endFrameSignature, to.startFrameSignature);

            if (histSim >= histThreshold && motionDelta <= motionThreshold && hashDist <= hashThreshold) {
                // Weighted confidence: histogram 40%, motion 30%, hash 30%
                const histConf = (histSim - histThreshold) / (1 - histThreshold);
                const motionConf = 1 - (motionDelta / motionThreshold);
                const hashConf = hashDist <= hashThreshold ? 1 - (hashDist / hashThreshold) : 0;
                const confidence = histConf * 0.4 + motionConf * 0.3 + hashConf * 0.3;

                pairs.push({
                    fromId,
                    toId,
                    hashDistance: hashDist,
                    type: 'seamless',
                    confidence: Math.max(0, Math.min(1, confidence)),
                });
            }
        }
    }

    pairs.sort((a, b) => b.confidence - a.confidence);
    return pairs;
}

/**
 * Get all match pairs (both match-cut and seamless) sorted by confidence.
 */
export function findAllMatchPairs(
    results: Record<string, ClipAnalysisResult>,
): MatchPair[] {
    const matchCuts = findMatchCutPairs(results);
    const seamless = findSeamlessTransitionPairs(results);
    const all = [...matchCuts, ...seamless];
    all.sort((a, b) => b.confidence - a.confidence);
    return all;
}
