/**
 * Music Video Enhanced — lyric sync, motif repetition, interleaving, scoring
 * ════════════════════════════════════════════════════════════════════════════
 * Higher-order editing utilities that sit on top of the core planner from
 * `musicVideo.ts`. Every function here is PURE (no DOM / store / Electron)
 * and deterministic (seeded RNG where randomness is needed).
 */

import type { SegmentType } from './audioAnalysisCore';

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

/** A single line of time-coded lyrics, optionally with per-word timing. */
export interface LyricLine {
    /** Full text of the lyric line. */
    text: string;
    /** Start time in seconds. */
    startTime: number;
    /** End time in seconds. */
    endTime: number;
    /** Per-word timing for karaoke-style sync (optional). */
    words?: Array<{ word: string; start: number; end: number }>;
}

// ─── Deterministic RNG (mulberry32) ──────────────────────────────────────────
function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ═══════════════════════════════════════════════════════
//  1. LYRIC-SYNC CUT POINTS
// ═══════════════════════════════════════════════════════

/**
 * Compute cut points that align visual edits to lyric phrase boundaries.
 *
 * The algorithm walks each lyric line boundary and snaps it to the nearest beat
 * (or downbeat when `preferPhraseBreaks` is true). A minimum interval between
 * cuts prevents machine-gun edits that would overwhelm the viewer.
 *
 * @param lyrics    Timed lyric lines (must be pre-sorted by `startTime`).
 * @param beatGrid  Beat times in seconds (tempo grid from BIE).
 * @param downbeats Downbeat times in seconds (bar starts from BIE).
 * @param options   `preferPhraseBreaks`: snap to downbeats where possible.
 *                  `minCutIntervalSec`: minimum gap between consecutive cuts
 *                  (default 0.4 s).
 * @returns Sorted array of cut-point times in seconds.
 */
export function computeLyricSyncCutPoints(
    lyrics: LyricLine[],
    beatGrid: number[],
    downbeats: number[],
    options?: { preferPhraseBreaks?: boolean; minCutIntervalSec?: number },
): number[] {
    if (lyrics.length === 0) return [];

    const preferPhrase = options?.preferPhraseBreaks ?? false;
    const minInterval = options?.minCutIntervalSec ?? 0.4;

    // Pre-sort grids for binary-search snapping.
    const grid = (preferPhrase && downbeats.length > 0 ? downbeats : beatGrid).slice().sort((a, b) => a - b);

    /** Snap a time to the nearest grid point via binary search. */
    const snapToGrid = (t: number): number => {
        if (grid.length === 0) return t;
        let lo = 0;
        let hi = grid.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (grid[mid] < t) lo = mid + 1; else hi = mid;
        }
        // Compare with neighbors.
        const best = lo;
        const prev = best > 0 ? best - 1 : best;
        return Math.abs(grid[prev] - t) <= Math.abs(grid[best] - t) ? grid[prev] : grid[best];
    };

    const rawPoints: number[] = [];

    for (const line of lyrics) {
        // Place a cut at the start of each lyric line.
        rawPoints.push(snapToGrid(line.startTime));

        // If per-word timing is available and the line is long, also consider
        // mid-line phrase breaks (clauses separated by punctuation).
        if (line.words && line.words.length > 4) {
            for (const w of line.words) {
                if (/[,;—–]$/.test(w.word)) {
                    rawPoints.push(snapToGrid(w.end));
                }
            }
        }
    }

    // De-duplicate, sort, and enforce minimum interval.
    const sorted = [...new Set(rawPoints)].sort((a, b) => a - b);
    const result: number[] = [];
    let lastCut = -Infinity;
    for (const t of sorted) {
        if (t - lastCut >= minInterval - 1e-6) {
            result.push(t);
            lastCut = t;
        }
    }
    return result;
}

// ═══════════════════════════════════════════════════════
//  2. MOTIF REPETITION
// ═══════════════════════════════════════════════════════

/**
 * Build a mapping of clip indices that should be reused across recurring musical
 * sections (e.g. the same chorus footage appears every time the chorus returns).
 *
 * For each unique `SegmentType` that appears more than once, the first
 * occurrence's clip indices are recorded and then re-assigned to every
 * subsequent occurrence.
 *
 * @param segments   Song structure segments with type, start, and end.
 * @param clipCount  Total number of clips available in the pool.
 * @returns Map where the key is a segment index (0-based into `segments`) and
 *          the value is the ordered list of clip indices to use for that segment.
 *          Only segments that repeat an earlier segment type are included.
 */
export function computeMotifRepetition(
    segments: Array<{ type: SegmentType; start: number; end: number }>,
    clipCount: number,
): Map<number, number[]> {
    if (clipCount <= 0) return new Map();

    // Track the first occurrence's clip assignment for each segment type.
    const firstOccurrence = new Map<SegmentType, number[]>();
    const result = new Map<number, number[]>();
    let cursor = 0;

    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const segDuration = seg.end - seg.start;
        // Estimate how many clips this segment will consume (rough: ~1 per second).
        const estimatedClips = Math.max(1, Math.round(segDuration));

        if (firstOccurrence.has(seg.type)) {
            // Re-use the same clip indices from the first occurrence.
            const original = firstOccurrence.get(seg.type)!;
            // Truncate or repeat to match the estimated count for this segment.
            const mapped: number[] = [];
            for (let j = 0; j < estimatedClips; j++) {
                mapped.push(original[j % original.length]);
            }
            result.set(i, mapped);
        } else {
            // First occurrence — record which clip indices are assigned.
            const assigned: number[] = [];
            for (let j = 0; j < estimatedClips; j++) {
                assigned.push(cursor % clipCount);
                cursor++;
            }
            firstOccurrence.set(seg.type, assigned);
        }
    }

    return result;
}

// ═══════════════════════════════════════════════════════
//  3. PERFORMANCE / NARRATIVE INTERLEAVING
// ═══════════════════════════════════════════════════════

/**
 * Deterministically interleave performance and narrative (b-roll) clips within
 * a single section.
 *
 * Given a pool of clips (some tagged with `scene` metadata), this function
 * returns an ordered list of pool indices where performance and narrative clips
 * alternate according to the given ratio.
 *
 * @param pool               The full clip pool (only `tags.scene` is inspected).
 * @param performanceRatio   Fraction of clips that should be performance
 *                           (0.0–1.0, e.g. 0.7 for 70%).
 * @param sectionClipCount   How many clips this section needs.
 * @param seed               Deterministic RNG seed.
 * @returns Ordered array of pool indices for this section.
 */
export function interleavePerformanceNarrative(
    pool: Array<{ tags?: { scene?: string } }>,
    performanceRatio: number,
    sectionClipCount: number,
    seed: number,
): number[] {
    if (pool.length === 0 || sectionClipCount <= 0) return [];

    const rand = rng(seed);

    // Partition pool into performance and narrative indices.
    const perfIndices: number[] = [];
    const narrIndices: number[] = [];
    for (let i = 0; i < pool.length; i++) {
        const scene = pool[i].tags?.scene ?? '';
        // Anything explicitly tagged 'performance', 'stage', or 'band' is performance;
        // everything else (including untagged) is narrative / b-roll.
        if (['performance', 'stage', 'band', 'vocalist'].includes(scene)) {
            perfIndices.push(i);
        } else {
            narrIndices.push(i);
        }
    }

    // If one category is empty, fill entirely from the other.
    const hasBoth = perfIndices.length > 0 && narrIndices.length > 0;

    const result: number[] = [];
    let perfCursor = 0;
    let narrCursor = 0;

    for (let i = 0; i < sectionClipCount; i++) {
        const wantPerf = hasBoth ? rand() < performanceRatio : perfIndices.length > 0;
        if (wantPerf && perfIndices.length > 0) {
            result.push(perfIndices[perfCursor % perfIndices.length]);
            perfCursor++;
        } else if (narrIndices.length > 0) {
            result.push(narrIndices[narrCursor % narrIndices.length]);
            narrCursor++;
        } else {
            // Fallback: round-robin the entire pool.
            result.push(i % pool.length);
        }
    }

    return result;
}

// ═══════════════════════════════════════════════════════
//  4. CLIP-SECTION ENERGY SCORING
// ═══════════════════════════════════════════════════════

/**
 * Energy tiers in ascending order — used to compare clip energy against the
 * section's expected intensity.
 */
const ENERGY_RANK: Record<'calm' | 'moderate' | 'high' | 'intense', number> = {
    calm:     0,
    moderate: 1,
    high:     2,
    intense:  3,
};

/** Section-type → ideal clip energy tier. */
const SECTION_IDEAL_ENERGY: Record<SegmentType, 'calm' | 'moderate' | 'high' | 'intense'> = {
    intro:     'calm',
    verse:     'moderate',
    buildup:   'high',
    drop:      'intense',
    chorus:    'high',
    breakdown: 'calm',
    bridge:    'moderate',
    outro:     'calm',
};

/**
 * Score how well a clip's energy level fits a given song section.
 *
 * Returns a value between 0.0 (terrible fit) and 1.0 (perfect fit). The score
 * penalises distance between the clip's energy tier and the section's ideal
 * tier — e.g. a "calm" clip in a "drop" section scores low, while an "intense"
 * clip in a "drop" scores 1.0.
 *
 * @param clipEnergy  The clip's energy classification.
 * @param sectionType The target song section.
 */
export function scoreClipForSection(
    clipEnergy: 'calm' | 'moderate' | 'high' | 'intense',
    sectionType: SegmentType,
): number {
    const ideal = SECTION_IDEAL_ENERGY[sectionType] ?? 'moderate';
    const distance = Math.abs(ENERGY_RANK[clipEnergy] - ENERGY_RANK[ideal]);
    // Max possible distance is 3 (calm↔intense).
    return Math.max(0, 1 - distance / 3);
}
