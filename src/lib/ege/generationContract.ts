// ══════════════════════════════════════════════════════════════════════════════
// generationContract.ts — The Edit Generator Engine's reliability backbone.
//
// Every generator's output passes through this contract BEFORE it ever reaches
// the renderer. It answers two questions:
//   1. Is this edit structurally renderable? (validateEdit → EditInvariantReport)
//   2. If not, can we fix it without throwing away the creative intent?
//      (autoRepairEdit → non-destructive repair pass)
//
// The contract guards the invariants a healthy timeline must hold:
//   • total duration lands within ±1 frame of the requested target
//   • every clip slot is at least a minimum renderable length (FFmpeg chokes on
//     1–2 frame slivers; default 6 frames)
//   • the main video track is a contiguous chain — no overlaps, no gaps
//   • each clip's source window stays inside [0, sourceDurationFrames]
//   • an active timing-spine grid (beat/narration cut times) is preserved exactly
//   • no source is over-reused beyond a max-repeat ratio
//
// Pure & deterministic given a seed. No React / IPC / FFmpeg imports — this is a
// data-in / data-out module, unit-tested independently of the app. Mirrors the
// OrderableClip subset style of clipOrdering.ts so it can run on light clip
// shapes as well as the full Clip type.
// ══════════════════════════════════════════════════════════════════════════════

import type { Clip } from '../../types';
import { DEFAULT_FPS } from '../time';

// ─── Clip subset ──────────────────────────────────────────────────────────────
// The contract only needs the timing/identity fields. Accepting a subset (à la
// OrderableClip) keeps it testable on synthetic clips while staying assignable
// from the real Clip type.
export interface ContractClip {
    id: string;
    startFrame: number;
    endFrame: number;
    trimStartFrame: number;
    trimEndFrame: number;
    sourceDurationFrames: number;
    track: number;
    /** Stable source identity used for reuse counting. */
    mediaLibraryId?: string;
    path?: string;
    filename?: string;
    speed?: number;
}

// A pool source the repair pass can swap in to diversify over-reused content.
export interface PoolSource {
    id: string;
    sourceDurationFrames: number;
    mediaLibraryId?: string;
    path?: string;
    filename?: string;
}

export type ViolationKind =
    | 'duration-mismatch'
    | 'starved-slot'
    | 'overlap'
    | 'gap'
    | 'trim-out-of-source'
    | 'locked-slot-drift'
    | 'over-reuse';

export type ViolationSeverity = 'error' | 'warning';

export interface EditViolation {
    kind: ViolationKind;
    severity: ViolationSeverity;
    /** Index into the (start-sorted) main-track clip list, where meaningful. */
    clipIndex?: number;
    clipId?: string;
    message: string;
    /** Machine-readable specifics for the repair pass / telemetry. */
    detail?: Record<string, number | string>;
}

export interface EditInvariantReport {
    valid: boolean;
    violations: EditViolation[];
    /** Roll-up metrics so callers can log/telemeter without re-deriving them. */
    metrics: {
        totalFrames: number;
        targetFrames: number;
        clipCount: number;
        mainTrackCount: number;
        maxReuse: number;
        maxReuseRatio: number;
    };
}

export interface ContractOptions {
    /** Desired total duration of the main track, in frames. */
    targetFrames: number;
    /** Tolerance around target, in frames. Default ±1. */
    durationToleranceFrames?: number;
    /** Minimum renderable slot length, in frames. Default 6. */
    minSlotFrames?: number;
    /** The track treated as the contiguous "spine". Default 0. */
    mainTrack?: number;
    /** Active timing-spine grid. When supplied, the main-track slot boundaries
     *  must match these exactly (frame-for-frame). */
    lockedSlots?: { startFrame: number; endFrame: number }[];
    /** Max fraction of the main track a single source may occupy by slot count.
     *  e.g. 0.5 ⇒ no source fills more than half the slots. Default 0.5. */
    maxRepeatRatio?: number;
    /** Less-used sources the repair pass may swap in for de-duplication. */
    pool?: PoolSource[];
    /** Seed for deterministic repair choices. */
    seed?: number | string;
    fps?: number;
}

// ─── Seeded RNG (mirrors clipOrdering.ts / returnTransitions.ts) ──────────────
function mulberry32(a: number) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function seedToInt(seed?: number | string): number {
    if (typeof seed === 'number') return (seed >>> 0) || 1;
    const s = String(seed ?? '1');
    let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (Math.abs(h) >>> 0) || 1;
}

// Stable source-identity key for reuse counting / pool matching.
function sourceKey(c: { mediaLibraryId?: string; path?: string; filename?: string; id?: string }): string {
    return c.mediaLibraryId || c.path || c.filename || c.id || 'unknown';
}

function mainTrackClips<T extends ContractClip>(clips: T[], mainTrack: number): T[] {
    return clips.filter(c => c.track === mainTrack).sort((a, b) => a.startFrame - b.startFrame);
}

/** Source frames consumed per timeline frame for a clip (handles speed / mixed fps). */
function sourceRatio(c: ContractClip): number {
    const ownTimeline = Math.max(1, c.endFrame - c.startFrame);
    const ownSource = Math.max(1, c.trimEndFrame - c.trimStartFrame);
    return ownSource / ownTimeline;
}

// ══════════════════════════════════════════════════════════════════════════════
// validateEdit
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Check every contract invariant and return a structured report. Never throws,
 * never mutates. `valid` is true iff there are no `error`-severity violations.
 */
export function validateEdit<T extends ContractClip>(clips: T[], opts: ContractOptions): EditInvariantReport {
    const minSlot = opts.minSlotFrames ?? 6;
    const tol = opts.durationToleranceFrames ?? 1;
    const mainTrack = opts.mainTrack ?? 0;
    const maxRepeatRatio = opts.maxRepeatRatio ?? 0.5;
    const target = opts.targetFrames;

    const violations: EditViolation[] = [];
    const main = mainTrackClips(clips, mainTrack);

    // ── Total duration ──
    const totalFrames = main.length ? main[main.length - 1].endFrame - main[0].startFrame : 0;
    if (Math.abs(totalFrames - target) > tol) {
        violations.push({
            kind: 'duration-mismatch',
            severity: 'error',
            message: `Total ${totalFrames}f is ${totalFrames - target > 0 ? 'over' : 'under'} target ${target}f by ${Math.abs(totalFrames - target)}f (tol ±${tol}).`,
            detail: { totalFrames, targetFrames: target, deltaFrames: totalFrames - target },
        });
    }

    // ── Per-slot: starvation + trim-window bounds ──
    main.forEach((c, i) => {
        const slot = c.endFrame - c.startFrame;
        if (slot < minSlot) {
            violations.push({
                kind: 'starved-slot', severity: 'error', clipIndex: i, clipId: c.id,
                message: `Slot ${i} (${c.id}) is ${slot}f, below min renderable ${minSlot}f.`,
                detail: { slotFrames: slot, minSlotFrames: minSlot },
            });
        }
        const src = c.sourceDurationFrames;
        if (c.trimStartFrame < 0 || c.trimEndFrame > src || c.trimEndFrame <= c.trimStartFrame) {
            violations.push({
                kind: 'trim-out-of-source', severity: 'error', clipIndex: i, clipId: c.id,
                message: `Trim [${c.trimStartFrame}, ${c.trimEndFrame}) escapes source [0, ${src}).`,
                detail: { trimStartFrame: c.trimStartFrame, trimEndFrame: c.trimEndFrame, sourceDurationFrames: src },
            });
        }
    });

    // ── Contiguity: overlaps / gaps on the main track ──
    for (let i = 1; i < main.length; i++) {
        const prev = main[i - 1];
        const cur = main[i];
        if (cur.startFrame < prev.endFrame) {
            violations.push({
                kind: 'overlap', severity: 'error', clipIndex: i, clipId: cur.id,
                message: `Slot ${i} (${cur.id}) starts at ${cur.startFrame}f, overlapping prev end ${prev.endFrame}f.`,
                detail: { startFrame: cur.startFrame, prevEndFrame: prev.endFrame },
            });
        } else if (cur.startFrame > prev.endFrame) {
            violations.push({
                kind: 'gap', severity: 'error', clipIndex: i, clipId: cur.id,
                message: `Gap of ${cur.startFrame - prev.endFrame}f before slot ${i} (${cur.id}).`,
                detail: { startFrame: cur.startFrame, prevEndFrame: prev.endFrame, gapFrames: cur.startFrame - prev.endFrame },
            });
        }
    }

    // ── Locked timing-spine grid preserved ──
    if (opts.lockedSlots && opts.lockedSlots.length) {
        const locked = [...opts.lockedSlots].sort((a, b) => a.startFrame - b.startFrame);
        if (locked.length !== main.length) {
            violations.push({
                kind: 'locked-slot-drift', severity: 'error',
                message: `Main track has ${main.length} slots but timing spine locks ${locked.length}.`,
                detail: { mainCount: main.length, lockedCount: locked.length },
            });
        }
        const n = Math.min(locked.length, main.length);
        for (let i = 0; i < n; i++) {
            if (main[i].startFrame !== locked[i].startFrame || main[i].endFrame !== locked[i].endFrame) {
                violations.push({
                    kind: 'locked-slot-drift', severity: 'error', clipIndex: i, clipId: main[i].id,
                    message: `Slot ${i} [${main[i].startFrame}, ${main[i].endFrame}) drifted from locked [${locked[i].startFrame}, ${locked[i].endFrame}).`,
                    detail: {
                        startFrame: main[i].startFrame, endFrame: main[i].endFrame,
                        lockedStartFrame: locked[i].startFrame, lockedEndFrame: locked[i].endFrame,
                    },
                });
            }
        }
    }

    // ── Source reuse ratio ──
    const reuse = new Map<string, number>();
    for (const c of main) {
        const k = sourceKey(c);
        reuse.set(k, (reuse.get(k) ?? 0) + 1);
    }
    let maxReuse = 0;
    let worstKey = '';
    for (const [k, n] of reuse) {
        if (n > maxReuse) { maxReuse = n; worstKey = k; }
    }
    const maxReuseRatio = main.length ? maxReuse / main.length : 0;
    // Only a violation when there is genuine over-concentration (>1 use AND over ratio).
    if (main.length > 1 && maxReuse > 1 && maxReuseRatio > maxRepeatRatio) {
        violations.push({
            kind: 'over-reuse', severity: 'warning',
            message: `Source "${worstKey}" fills ${maxReuse}/${main.length} slots (${(maxReuseRatio * 100).toFixed(0)}%), over max ${(maxRepeatRatio * 100).toFixed(0)}%.`,
            detail: { maxReuse, mainTrackCount: main.length, ratio: maxReuseRatio, maxRepeatRatio },
        });
    }

    const valid = violations.every(v => v.severity !== 'error');
    return {
        valid,
        violations,
        metrics: {
            totalFrames,
            targetFrames: target,
            clipCount: clips.length,
            mainTrackCount: main.length,
            maxReuse,
            maxReuseRatio,
        },
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// autoRepairEdit
// ══════════════════════════════════════════════════════════════════════════════
export interface RepairResult<T extends ContractClip> {
    clips: T[];
    report: EditInvariantReport;
    repaired: boolean;
}

/**
 * Re-trim a clip's source window so a `slotDur`-frame slot pulls valid footage,
 * clamping to the real source length. Keeps the in-point where possible; slides
 * the window earlier if keeping it would seek past the media end. Mirrors the
 * retrimToSlot logic in clipOrdering.ts.
 */
function retrimToSlot(c: ContractClip, slotDur: number): { trimStartFrame: number; trimEndFrame: number } {
    const ratio = sourceRatio(c);
    const needed = Math.max(1, Math.round(slotDur * ratio));
    const srcLen = c.sourceDurationFrames > 0 ? c.sourceDurationFrames : needed;
    let inPoint = Math.max(0, Math.min(c.trimStartFrame, srcLen - 1));
    let outPoint = inPoint + needed;
    if (outPoint > srcLen) {
        inPoint = Math.max(0, srcLen - needed);
        outPoint = Math.min(srcLen, inPoint + needed);
    }
    if (outPoint <= inPoint) outPoint = Math.min(srcLen, inPoint + 1);
    return { trimStartFrame: inPoint, trimEndFrame: outPoint };
}

/**
 * Non-destructively repair an edit toward the contract. In priority order it:
 *   1. clamps every trim window back inside its source;
 *   2. grows starved slots up to the minimum renderable length;
 *   3. re-flows the main track so it is contiguous from the first slot's start;
 *   4. redistributes the final slot (or the only slot) to hit target ±tol;
 *   5. when a `pool` is supplied, swaps over-reused sources for less-used pool
 *      sources to diversify content.
 *
 * If `lockedSlots` is supplied the spine grid is treated as authoritative: slot
 * boundaries are snapped to the locked grid rather than re-flowed, so the
 * beat/narration cut times are preserved frame-for-frame.
 *
 * Off-main-track clips pass through untouched. Returns new clip objects (never
 * mutates the input) plus a fresh post-repair report.
 */
export function autoRepairEdit<T extends ContractClip>(clips: T[], opts: ContractOptions): RepairResult<T> {
    const minSlot = opts.minSlotFrames ?? 6;
    const tol = opts.durationToleranceFrames ?? 1;
    const mainTrack = opts.mainTrack ?? 0;
    const maxRepeatRatio = opts.maxRepeatRatio ?? 0.5;
    const target = opts.targetFrames;
    const rand = mulberry32(seedToInt(opts.seed));

    const others = clips.filter(c => c.track !== mainTrack);
    let main = mainTrackClips(clips, mainTrack).map(c => ({ ...c }));

    if (main.length === 0) {
        const report = validateEdit(clips, opts);
        return { clips, report, repaired: false };
    }

    const locked = opts.lockedSlots && opts.lockedSlots.length
        ? [...opts.lockedSlots].sort((a, b) => a.startFrame - b.startFrame)
        : null;

    // ── 1. Decide slot durations ──
    // Lock grid wins outright. Otherwise start from current slot durations and
    // raise any starved one to the minimum.
    let slotDurs: number[];
    if (locked && locked.length === main.length) {
        slotDurs = locked.map(s => s.endFrame - s.startFrame);
    } else {
        slotDurs = main.map(c => Math.max(minSlot, c.endFrame - c.startFrame));
    }

    // ── 2. Redistribute to hit target (only when NOT pinned to a locked grid) ──
    if (!locked) {
        let total = slotDurs.reduce((a, b) => a + b, 0);
        let delta = target - total;
        if (Math.abs(delta) > tol) {
            // Spread the correction across slots that have headroom above the
            // minimum (when shrinking) or across all slots (when growing),
            // largest-first so we don't create new starved slots.
            const order = slotDurs.map((d, i) => i).sort((a, b) => slotDurs[b] - slotDurs[a]);
            // Iterate until the residual is within tolerance or no slot can absorb more.
            let guard = 0;
            while (Math.abs(delta) > tol && guard++ < 10000) {
                let moved = false;
                for (const i of order) {
                    if (Math.abs(delta) <= tol) break;
                    if (delta > 0) {
                        slotDurs[i] += 1; delta -= 1; moved = true;
                    } else if (slotDurs[i] > minSlot) {
                        slotDurs[i] -= 1; delta += 1; moved = true;
                    }
                }
                if (!moved) break; // every slot at the floor; can't shrink further
            }
        }
    }

    // ── 3. Re-flow contiguously from the spine origin ──
    const origin = locked ? locked[0].startFrame : main[0].startFrame;
    let cursor = origin;
    main = main.map((c, i) => {
        const start = locked ? locked[i].startFrame : cursor;
        const dur = slotDurs[i];
        const end = locked ? locked[i].endFrame : start + dur;
        cursor = end;
        const slotDur = end - start;
        const { trimStartFrame, trimEndFrame } = retrimToSlot(c, slotDur);
        return { ...c, startFrame: start, endFrame: end, trimStartFrame, trimEndFrame };
    });

    // ── 4. Diversify over-reused sources from the pool ──
    if (opts.pool && opts.pool.length) {
        const reuse = new Map<string, number>();
        for (const c of main) reuse.set(sourceKey(c), (reuse.get(sourceKey(c)) ?? 0) + 1);
        const maxAllowed = Math.max(1, Math.floor(main.length * maxRepeatRatio));

        // Pool usage starts from how often each pool source already appears on
        // the track, so swaps prefer genuinely under-used sources.
        const poolUse = new Map<string, number>();
        for (const p of opts.pool) poolUse.set(sourceKey(p), reuse.get(sourceKey(p)) ?? 0);

        // Walk slots; once a source exceeds its budget, swap later instances for
        // the least-used pool source that isn't itself already over budget.
        const seen = new Map<string, number>();
        const shuffledPool = [...opts.pool].sort(() => rand() - 0.5);
        for (let i = 0; i < main.length; i++) {
            const k = sourceKey(main[i]);
            const count = (seen.get(k) ?? 0) + 1;
            seen.set(k, count);
            if (count <= maxAllowed) continue;
            // Need a replacement.
            const candidate = shuffledPool
                .filter(p => (poolUse.get(sourceKey(p)) ?? 0) < maxAllowed)
                .sort((a, b) => (poolUse.get(sourceKey(a)) ?? 0) - (poolUse.get(sourceKey(b)) ?? 0))[0];
            if (!candidate) continue; // no headroom anywhere; leave it
            const slotDur = main[i].endFrame - main[i].startFrame;
            const swapped: T = {
                ...main[i],
                mediaLibraryId: candidate.mediaLibraryId,
                path: candidate.path,
                filename: candidate.filename,
                sourceDurationFrames: candidate.sourceDurationFrames,
                trimStartFrame: 0,
                trimEndFrame: 0,
            };
            const { trimStartFrame, trimEndFrame } = retrimToSlot(swapped, slotDur);
            swapped.trimStartFrame = trimStartFrame;
            swapped.trimEndFrame = trimEndFrame;
            main[i] = swapped;
            // Account: this source is now used once more, the displaced one less.
            poolUse.set(sourceKey(candidate), (poolUse.get(sourceKey(candidate)) ?? 0) + 1);
            seen.set(k, count - 1);
            seen.set(sourceKey(candidate), (seen.get(sourceKey(candidate)) ?? 0) + 1);
        }
    }

    const repairedClips = [...others, ...main] as T[];
    const report = validateEdit(repairedClips, opts);
    // "repaired" = we changed something AND the result is at least as good.
    const changed = JSON.stringify(mainTrackClips(clips, mainTrack)) !== JSON.stringify(main);
    return { clips: repairedClips, report, repaired: changed };
}

// ══════════════════════════════════════════════════════════════════════════════
// assessPoolSufficiency
// ══════════════════════════════════════════════════════════════════════════════
export interface PoolSufficiencyInput {
    poolSize: number;
    targetFrames: number;
    avgClipFrames: number;
    maxRepeatRatio: number;
}
export interface PoolSufficiencyResult {
    sufficient: boolean;
    recommendedAction: 'ok' | 'widen-pool' | 'lower-reuse' | 'shorten-target';
    detail: string;
}

/**
 * Up-front feasibility check: can a pool of `poolSize` distinct sources fill a
 * `targetFrames` edit (cut into ~`avgClipFrames` slots) without any single
 * source exceeding `maxRepeatRatio` of the slots?
 *
 * slotsNeeded   = ceil(targetFrames / avgClipFrames)
 * capacity      = poolSize * floor(slotsNeeded * maxRepeatRatio)   (per-source budget × pool)
 * It is feasible iff capacity ≥ slotsNeeded. When not, it suggests the
 * single most effective lever (widen the pool, relax reuse, or shorten target),
 * choosing the one that closes the largest share of the gap.
 */
export function assessPoolSufficiency(input: PoolSufficiencyInput): PoolSufficiencyResult {
    const { poolSize, targetFrames, avgClipFrames, maxRepeatRatio } = input;
    const safeAvg = Math.max(1, avgClipFrames || DEFAULT_FPS);
    const safeRatio = Math.min(1, Math.max(0.01, maxRepeatRatio || 0.5));
    const slotsNeeded = Math.max(1, Math.ceil(targetFrames / safeAvg));
    const perSourceBudget = Math.max(1, Math.floor(slotsNeeded * safeRatio));
    const capacity = Math.max(0, poolSize) * perSourceBudget;

    if (poolSize <= 0) {
        return { sufficient: false, recommendedAction: 'widen-pool', detail: 'Pool is empty — add source media.' };
    }
    if (capacity >= slotsNeeded) {
        return {
            sufficient: true, recommendedAction: 'ok',
            detail: `Pool of ${poolSize} covers ${slotsNeeded} slots (capacity ${capacity}) within reuse limit ${(safeRatio * 100).toFixed(0)}%.`,
        };
    }

    // Infeasible — quantify each lever and pick the gentlest sufficient one.
    // 1. widen-pool: minimum extra distinct sources needed at current settings.
    const neededPool = Math.ceil(slotsNeeded / perSourceBudget);
    const extraSources = neededPool - poolSize;
    // 2. lower-reuse: the ratio that would make the current pool exactly enough.
    const neededRatio = Math.min(1, slotsNeeded / (poolSize * slotsNeeded) + (1 / slotsNeeded)); // ≈ per-source share
    const reuseShare = slotsNeeded / poolSize / slotsNeeded; // = 1/poolSize, the floor share each source must take
    // 3. shorten-target: max frames the current pool can fill at current reuse.
    const maxFrames = capacity * safeAvg;

    // Heuristic: a small pool gap → widen; otherwise relaxing reuse or trimming
    // target. Prefer widening when only a few sources are missing (cheap, keeps
    // intent); else suggest raising the per-source share (lower-reuse), unless
    // that would push a single source over 100%, in which case shorten-target.
    if (extraSources <= Math.ceil(poolSize * 0.5)) {
        return {
            sufficient: false, recommendedAction: 'widen-pool',
            detail: `Need ~${extraSources} more source(s) (pool ${poolSize} → ${neededPool}) to fill ${slotsNeeded} slots within ${(safeRatio * 100).toFixed(0)}% reuse.`,
        };
    }
    if (reuseShare <= 1) {
        const suggested = Math.ceil((1 / poolSize) * 100);
        return {
            sufficient: false, recommendedAction: 'lower-reuse',
            detail: `Raise max reuse to ≥${suggested}% (each of ${poolSize} sources must cover ~${Math.ceil(slotsNeeded / poolSize)} of ${slotsNeeded} slots), or widen the pool.`,
        };
    }
    return {
        sufficient: false, recommendedAction: 'shorten-target',
        detail: `Pool of ${poolSize} can only fill ~${maxFrames}f at ${(safeRatio * 100).toFixed(0)}% reuse; shorten target from ${targetFrames}f.`,
    };
}

/** Re-export of the type used in Clip so callers can narrow safely. */
export type { Clip };
