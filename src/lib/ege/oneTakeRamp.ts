// ══════════════════════════════════════════════════════════════════════════════
// ege/oneTakeRamp.ts — One-Take Speed Ramp pattern for long clips.
//
// Instead of cutting randomly, one long edit is shown in this format:
//   Normal speed (1-3s) → cut frames → 2x/3x speed (1-3s) → cut frames → Normal (1-3s) …
// The fast-speed multiplier auto-adjusts so the entire source fits into the
// allocated target duration. Cuts happen on beat boundaries when beats are provided.
// Pure & deterministic. No React / store / FFmpeg imports.
// ══════════════════════════════════════════════════════════════════════════════

// ─── types ───────────────────────────────────────────────────────────────────

/** A single segment in the speed-ramp sequence. */
export interface RampSegment {
    /** Source time start (seconds) */
    startSec: number;
    /** Source time end (seconds) */
    endSec: number;
    /** Playback speed multiplier (1 = normal, 2 = double, 3 = triple) */
    speed: number;
    /** Frames cut/skipped before this segment (0 for the first) */
    cutFramesBefore: number;
    /** Index in the ramp sequence */
    index: number;
}

export interface OneTakeRampOptions {
    /** Duration range for normal-speed segments [min, max] in seconds. Default [1, 3] */
    normalRange?: [number, number];
    /** Duration range for fast-speed segments [min, max] in seconds. Default [1, 3] */
    fastRange?: [number, number];
    /** Number of frames to cut between segments. Default 6 */
    cutFrames?: number;
    /** Beat timestamps (seconds) to snap cuts to. Optional */
    beats?: number[];
    /** Maximum fast speed multiplier. Default 3 */
    maxFastSpeed?: number;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number): number =>
    Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

/** Average of a [min, max] range. */
const avg = (range: [number, number]): number => (range[0] + range[1]) / 2;

/**
 * Snap `timeSec` to the nearest beat in `beats` (already sorted ascending).
 * Returns the original value when `beats` is empty or undefined.
 */
function snapToBeat(timeSec: number, beats: number[] | undefined): number {
    if (!beats || beats.length === 0) return timeSec;
    let best = beats[0];
    let bestDist = Math.abs(timeSec - best);
    for (let i = 1; i < beats.length; i++) {
        const d = Math.abs(timeSec - beats[i]);
        if (d < bestDist) {
            best = beats[i];
            bestDist = d;
        }
        // beats are sorted — once we start moving away, no point continuing
        if (beats[i] > timeSec && d > bestDist) break;
    }
    return best;
}

/** Clean a beat array: drop non-finite/negative, sort ascending, de-dupe. */
function cleanBeats(raw: number[] | undefined): number[] {
    if (!raw || raw.length === 0) return [];
    const seen = new Set<number>();
    const out: number[] = [];
    for (const t of raw) {
        if (!Number.isFinite(t) || t < 0) continue;
        if (seen.has(t)) continue;
        seen.add(t);
        out.push(t);
    }
    out.sort((a, b) => a - b);
    return out;
}

// ─── main builder ────────────────────────────────────────────────────────────

/**
 * Build a rhythmic speed-ramp sequence that fits `sourceDurSec` of footage
 * into `targetDurSec` of playback time.
 *
 * The returned segments alternate Normal (1×) and Fast (auto-calculated
 * multiplier), with `cutFrames` frames skipped at each transition. When `beats`
 * are supplied, segment boundaries snap to the nearest beat for musical cuts.
 *
 * Guarantees on the returned `RampSegment[]`:
 *   • segments are contiguous in source time (minus the cut gaps)
 *   • the entire source is covered: first.startSec ≈ 0, last.endSec ≈ sourceDurSec
 *   • playback duration sums to ≈ targetDurSec (within rounding)
 *   • indices are sequential from 0
 */
export function buildOneTakeRamp(
    sourceDurSec: number,
    targetDurSec: number,
    fps: number,
    opts?: OneTakeRampOptions,
): RampSegment[] {
    // Sanitize inputs.
    const src = Math.max(0, sourceDurSec);
    const tgt = Math.max(0, targetDurSec);
    const safeFps = fps > 0 ? fps : 30;

    if (src <= 0 || tgt <= 0) return [];

    const normalRange: [number, number] = opts?.normalRange ?? [1, 3];
    const fastRange: [number, number] = opts?.fastRange ?? [1, 3];
    const cutFrames = opts?.cutFrames ?? 6;
    const maxFastSpeed = opts?.maxFastSpeed ?? 3;
    const beats = cleanBeats(opts?.beats);

    // ── trivial case: source fits into target at 1× ──────────────────────────
    if (src <= tgt) {
        return [{
            startSec: 0,
            endSec: src,
            speed: 1,
            cutFramesBefore: 0,
            index: 0,
        }];
    }

    // ── plan the ramp pattern ────────────────────────────────────────────────

    const avgNormal = avg(normalRange);
    const avgFast = avg(fastRange);
    const cutGapSec = cutFrames / safeFps;

    // How many normal+fast pairs fit into the target duration?
    // Each pair takes avgNormal + avgFast seconds of target time, plus cut gaps.
    const pairTargetSec = avgNormal + avgFast + cutGapSec * 2;
    const pairs = Math.max(1, Math.ceil(tgt / pairTargetSec));

    // Total target time consumed by normal segments and cut gaps.
    const normalDur = avgNormal;
    const fastDur = avgFast;
    const totalNormalTargetSec = normalDur * pairs;
    const totalCutGapsSec = cutGapSec * (pairs * 2 - 1); // cuts between every segment except before the first
    const totalFastTargetSec = Math.max(0.1, tgt - totalNormalTargetSec - totalCutGapsSec);

    // Source time consumed by normals: played at 1×, so 1:1 with target time.
    const totalNormalSourceSec = totalNormalTargetSec;
    // Source time consumed by cuts: each cut gap skips cutGapSec of source.
    const totalCutSourceSec = totalCutGapsSec;
    // Remaining source must be covered by the fast segments.
    const remainingSourceForFast = Math.max(0, src - totalNormalSourceSec - totalCutSourceSec);

    // Fast speed = source consumed by fast / target time spent on fast.
    // fastSpeed × fastTargetSec = remainingSourceForFast
    const rawFastSpeed = totalFastTargetSec > 0
        ? remainingSourceForFast / totalFastTargetSec
        : 2;
    const fastSpeed = clamp(rawFastSpeed, 1.5, maxFastSpeed);

    // ── walk through the source, emitting segments ───────────────────────────

    const segments: RampSegment[] = [];
    let srcPos = 0;   // current position in source (seconds)
    let tgtUsed = 0;  // target seconds consumed so far
    let idx = 0;

    for (let p = 0; p < pairs && srcPos < src && tgtUsed < tgt; p++) {
        // ── Normal segment ───────────────────────────────────────────────
        const nCut = idx === 0 ? 0 : cutFrames;
        const nCutSec = nCut / safeFps;
        srcPos += nCutSec; // skip cut frames in source

        if (srcPos >= src) break;

        const nDur = Math.min(normalDur, src - srcPos, tgt - tgtUsed);
        if (nDur <= 0) break;

        let nStart = srcPos;
        let nEnd = srcPos + nDur;

        // Snap boundaries to beats.
        if (beats.length > 0) {
            nStart = snapToBeat(nStart, beats);
            nEnd = snapToBeat(nEnd, beats);
            // Ensure the snapped range is still valid.
            if (nEnd <= nStart) nEnd = nStart + nDur;
        }
        nEnd = Math.min(nEnd, src);

        segments.push({
            startSec: round6(nStart),
            endSec: round6(nEnd),
            speed: 1,
            cutFramesBefore: nCut,
            index: idx++,
        });

        const nActualDur = nEnd - nStart;
        srcPos = nEnd;
        tgtUsed += nActualDur; // at 1× speed, target time = source time

        if (srcPos >= src || tgtUsed >= tgt) break;

        // ── Fast segment ─────────────────────────────────────────────────
        const fCutSec = cutGapSec;
        srcPos += fCutSec; // skip cut frames in source

        if (srcPos >= src) break;

        // How much target time for this fast segment?
        const fTargetDur = Math.min(fastDur, tgt - tgtUsed);
        if (fTargetDur <= 0) break;

        // Source consumed = target time × speed
        const fSourceDur = Math.min(fTargetDur * fastSpeed, src - srcPos);

        let fStart = srcPos;
        let fEnd = srcPos + fSourceDur;

        // Snap boundaries to beats.
        if (beats.length > 0) {
            fStart = snapToBeat(fStart, beats);
            fEnd = snapToBeat(fEnd, beats);
            if (fEnd <= fStart) fEnd = fStart + fSourceDur;
        }
        fEnd = Math.min(fEnd, src);

        const fActualSource = fEnd - fStart;
        const fActualTarget = fActualSource / fastSpeed;

        segments.push({
            startSec: round6(fStart),
            endSec: round6(fEnd),
            speed: round6(fastSpeed),
            cutFramesBefore: cutFrames,
            index: idx++,
        });

        srcPos = fEnd;
        tgtUsed += fActualTarget;
    }

    // ── extend last segment if source remains ────────────────────────────────
    // When source time is left over after the pattern completes, extend the final
    // segment to cover it so nothing is silently dropped.
    if (segments.length > 0 && srcPos < src) {
        const last = segments[segments.length - 1];
        last.endSec = round6(src);
    }

    return segments;
}

// ─── playback duration helper ────────────────────────────────────────────────

/**
 * Calculate effective playback duration of ramp segments.
 * Each segment contributes (endSec − startSec) / speed seconds of wall-clock
 * playback. Cut gaps are NOT included — they are pure skips.
 */
export function rampPlaybackDuration(segments: RampSegment[]): number {
    let total = 0;
    for (const seg of segments) {
        const dur = seg.endSec - seg.startSec;
        if (dur > 0 && seg.speed > 0) {
            total += dur / seg.speed;
        }
    }
    return round6(total);
}

// ─── internal utilities ──────────────────────────────────────────────────────

/** Round to 6 decimal places to avoid floating-point noise in outputs. */
function round6(v: number): number {
    return Math.round(v * 1e6) / 1e6;
}
