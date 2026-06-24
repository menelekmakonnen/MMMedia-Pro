// ══════════════════════════════════════════════════════════════════════════════
// ege/timingSpine.ts — The unified timing spine for the Edit Generator Engine.
//
// One interface that turns ANY timing source — narration phrases, audio beats,
// storyboard shots, or a plain rhythm — into a locked grid of cut-time SLOTS the
// generator fills. The spine PRODUCES the {startFrame,endFrame} grid that
// clipOrdering.ts (and the generator) later PRESERVE frame-for-frame.
//
// Priority cascade (the user's editorial law):  Narration > Beat > Smart > else.
// Whichever highest-priority source is present DEFINES the slot boundaries; lower
// sources never move a boundary. When BOTH narration and beat exist, narration
// owns the grid and beat times that fall inside a slot surface as `label` hints —
// the narration cut times stay locked, the beats just annotate.
//
// Every boundary is converted seconds→integer frames at fps, slots are made
// contiguous and non-overlapping, snapped to whole frames, the whole target
// duration is covered, and no slot is shorter than MIN_SLOT_FRAMES (merged away).
//
// PURE & deterministic. No app imports, no I/O. Unit-tested standalone.
// ══════════════════════════════════════════════════════════════════════════════

/** Minimum slot length in frames. Anything shorter is merged into its neighbour
 *  so a cut never lands fewer than ~0.2s after the previous one (at 30fps). */
export const MIN_SLOT_FRAMES = 6;

/** A single locked cut-time slot. `source` records which spine drove the grid;
 *  `label` carries optional hints (e.g. beat times nested inside a narration
 *  slot) that downstream passes may consult but must NOT use to move the cut. */
export interface Slot {
    startFrame: number;
    endFrame: number;
    source: 'narration' | 'beat' | 'storyboard' | 'rhythm';
    label?: string;
}

/** Which spine actually drove the grid this run. */
export type PrimaryDriver = 'narration' | 'beat' | 'storyboard' | 'rhythm';

/** A plain-rhythm fallback: cut on a steady cadence between min/max seconds.
 *  `pattern`, when given, is a repeating multiplier sequence applied to a base
 *  interval (e.g. [1, 1, 0.5] = long, long, short, …) for a little human swing. */
export interface RhythmSpec {
    minSec: number;
    maxSec: number;
    pattern?: number[];
}

/** Optional storyboard shot. Only its duration matters to the spine. */
export interface StoryboardShot {
    durationSec: number;
}

/**
 * Everything the spine MIGHT receive. All timing sources are optional; the spine
 * selects the highest-priority one that is actually present and usable.
 */
export interface SpineInput {
    /** Narration phrase-boundary cut times, in seconds. Highest priority. */
    narrationCutsSec?: number[];
    /** Beat grid times, in seconds. */
    beatTimesSec?: number[];
    /** Bar-start (downbeat) times, in seconds. Preferred over plain beats when
     *  beatTimesSec is absent or too sparse. */
    downbeatTimesSec?: number[];
    /** Storyboard shot list — drives the grid by shot durations. */
    storyboardShots?: StoryboardShot[];
    /** Plain-rhythm fallback when no richer source exists. */
    rhythm?: RhythmSpec;
    /** Total timeline length to cover, in seconds. The grid spans [0, this]. */
    targetDurationSec: number;
    /** Frames per second for the seconds→frames conversion. */
    fps: number;
}

export interface SpineResult {
    slots: Slot[];
    primaryDriver: PrimaryDriver;
}

// ─── seconds → integer frames ────────────────────────────────────────────────
// Mirrors time.ts::secondsToFrames (floor with epsilon) so the spine and the rest
// of the engine agree frame-for-frame. Kept local to honour the PURE constraint.
function secToFrames(seconds: number, fps: number): number {
    return Math.floor(seconds * fps + 0.0001);
}

/** Clean a seconds array: drop non-finite/negative, sort ascending, de-dupe. */
function cleanTimes(times: number[] | undefined): number[] {
    if (!times || times.length === 0) return [];
    const seen = new Set<number>();
    const out: number[] = [];
    for (const t of times) {
        if (!Number.isFinite(t) || t < 0) continue;
        if (seen.has(t)) continue;
        seen.add(t);
        out.push(t);
    }
    out.sort((a, b) => a - b);
    return out;
}

/**
 * Turn an ascending list of boundary FRAMES into contiguous, non-overlapping
 * slots spanning [0, totalFrames]. Implicit boundaries at 0 and totalFrames are
 * always added. Each emitted slot carries `source`; `labels` (keyed by the slot's
 * start frame) inject optional hint strings. Slots shorter than MIN_SLOT_FRAMES
 * are merged FORWARD (absorbed by the next slot) — or, for the final slot,
 * BACKWARD into the previous one — so the cut count drops but coverage holds.
 */
function boundariesToSlots(
    boundaryFrames: number[],
    totalFrames: number,
    source: Slot['source'],
    labels?: Map<number, string>,
): Slot[] {
    // Collect, clamp to (0, totalFrames), snap to integers, de-dupe, sort.
    const cuts = new Set<number>();
    for (const f of boundaryFrames) {
        const snapped = Math.round(f);
        if (snapped > 0 && snapped < totalFrames) cuts.add(snapped);
    }
    const sorted = [...cuts].sort((a, b) => a - b);

    // Build raw contiguous slots across [0, totalFrames].
    const raw: Slot[] = [];
    let prev = 0;
    for (const cut of sorted) {
        raw.push({ startFrame: prev, endFrame: cut, source });
        prev = cut;
    }
    raw.push({ startFrame: prev, endFrame: totalFrames, source });

    // Attach label hints by start frame.
    if (labels) {
        for (const slot of raw) {
            const hint = labels.get(slot.startFrame);
            if (hint) slot.label = hint;
        }
    }

    return enforceMinSlot(raw, source);
}

/**
 * Merge away any slot below MIN_SLOT_FRAMES while keeping the grid contiguous and
 * fully covering [first.start, last.end]. A too-short slot is fused with its
 * neighbour (forward, except the tail which fuses backward). Labels are preserved
 * by concatenation so beat hints inside a merged region aren't lost.
 */
function enforceMinSlot(slots: Slot[], source: Slot['source']): Slot[] {
    if (slots.length <= 1) return slots;

    // Repeat until stable — a merge can create a new sub-min neighbour.
    let work = slots.map(s => ({ ...s }));
    let changed = true;
    while (changed && work.length > 1) {
        changed = false;
        for (let i = 0; i < work.length; i++) {
            const dur = work[i].endFrame - work[i].startFrame;
            if (dur >= MIN_SLOT_FRAMES) continue;

            if (i < work.length - 1) {
                // Fuse forward: this slot's start, next slot's end.
                const next = work[i + 1];
                work[i + 1] = {
                    startFrame: work[i].startFrame,
                    endFrame: next.endFrame,
                    source,
                    label: mergeLabels(work[i].label, next.label),
                };
                work.splice(i, 1);
            } else {
                // Tail slot: fuse backward into the previous slot.
                const prev = work[i - 1];
                work[i - 1] = {
                    startFrame: prev.startFrame,
                    endFrame: work[i].endFrame,
                    source,
                    label: mergeLabels(prev.label, work[i].label),
                };
                work.splice(i, 1);
            }
            changed = true;
            break; // restart scan; indices shifted
        }
    }
    return work;
}

function mergeLabels(a?: string, b?: string): string | undefined {
    if (a && b) return `${a} ${b}`;
    return a ?? b;
}

/** Project beat times (seconds) onto narration slots, producing a label-by-start
 *  map: each narration slot is annotated with the beat frames that fall inside it.
 *  The narration boundaries are NOT touched — beats only decorate. */
function beatLabelsForSlots(
    slots: Slot[],
    beatFrames: number[],
): Map<number, string> {
    const labels = new Map<number, string>();
    if (beatFrames.length === 0) return labels;
    for (const slot of slots) {
        const inside = beatFrames.filter(
            b => b > slot.startFrame && b < slot.endFrame,
        );
        if (inside.length > 0) {
            labels.set(slot.startFrame, `beats@${inside.join(',')}`);
        }
    }
    return labels;
}

/** Expand a rhythm spec into boundary frames across [0, totalFrames]. The base
 *  interval is the midpoint of [minSec, maxSec]; an optional pattern modulates
 *  each successive interval (clamped to the min/max window). */
function rhythmBoundaries(rhythm: RhythmSpec, totalFrames: number, fps: number): number[] {
    const minF = Math.max(MIN_SLOT_FRAMES, secToFrames(Math.max(0, rhythm.minSec), fps));
    const maxF = Math.max(minF, secToFrames(Math.max(rhythm.minSec, rhythm.maxSec), fps));
    const baseF = Math.round((minF + maxF) / 2);
    const pattern = rhythm.pattern && rhythm.pattern.length > 0 ? rhythm.pattern : [1];

    const boundaries: number[] = [];
    let pos = 0;
    let i = 0;
    // Guard against pathological zero-length steps.
    while (boundaries.length < 100000) {
        const mult = pattern[i % pattern.length];
        const step = Math.max(minF, Math.min(maxF, Math.round(baseF * mult)));
        pos += step;
        if (pos >= totalFrames) break;
        boundaries.push(pos);
        i++;
    }
    return boundaries;
}

/** Storyboard shot durations → cumulative boundary frames across [0,total]. */
function storyboardBoundaries(shots: StoryboardShot[], fps: number): number[] {
    const boundaries: number[] = [];
    let acc = 0;
    for (const shot of shots) {
        const d = Math.max(0, shot.durationSec);
        acc += secToFrames(d, fps);
        boundaries.push(acc);
    }
    return boundaries; // last one is the storyboard's natural end
}

/**
 * Build the timing spine.
 *
 * Picks the highest-priority usable source (Narration > Beat/Downbeat >
 * Storyboard > Rhythm), converts it to an integer-frame slot grid covering
 * [0, targetDurationSec], and returns the locked slots plus which driver won.
 *
 * Guarantees on the returned `slots`:
 *   • contiguous & non-overlapping: slot[i].endFrame === slot[i+1].startFrame
 *   • integer frames throughout
 *   • slots[0].startFrame === 0 and last.endFrame === round(target*fps)
 *   • every slot length ≥ MIN_SLOT_FRAMES (unless the whole target is shorter)
 *   • narration boundaries are never moved by beats; beats become `label` hints
 */
export function buildTimingSpine(input: SpineInput): SpineResult {
    const fps = input.fps > 0 ? input.fps : 30;
    const totalFrames = Math.max(1, secToFrames(Math.max(0, input.targetDurationSec), fps));

    const narration = cleanTimes(input.narrationCutsSec).filter(t => secToFrames(t, fps) < totalFrames);
    const beats = cleanTimes(input.beatTimesSec);
    const downbeats = cleanTimes(input.downbeatTimesSec);
    const beatSource = beats.length >= 2 ? beats : downbeats.length >= 2 ? downbeats : beats.length > 0 ? beats : downbeats;
    const storyboard = input.storyboardShots ?? [];

    // ── Priority cascade ──────────────────────────────────────────────────────

    // 1. NARRATION — phrase boundaries own the grid. Beats (if any) decorate.
    if (narration.length > 0) {
        const narrFrames = narration.map(t => secToFrames(t, fps));
        // First pass with no labels to get the locked narration grid…
        const grid = boundariesToSlots(narrFrames, totalFrames, 'narration');
        // …then project the beat times onto the locked slots as hints.
        const beatFrames = beatSource.map(t => secToFrames(t, fps));
        const labels = beatLabelsForSlots(grid, beatFrames);
        if (labels.size > 0) {
            for (const slot of grid) {
                const hint = labels.get(slot.startFrame);
                if (hint) slot.label = slot.label ? `${slot.label} ${hint}` : hint;
            }
        }
        return { slots: grid, primaryDriver: 'narration' };
    }

    // 2. BEAT / DOWNBEAT — bar grid drives the cuts.
    if (beatSource.length >= 1) {
        const beatFrames = beatSource.map(t => secToFrames(t, fps));
        const slots = boundariesToSlots(beatFrames, totalFrames, 'beat');
        return { slots, primaryDriver: 'beat' };
    }

    // 3. STORYBOARD — shot durations drive the cuts.
    if (storyboard.length > 0) {
        const sbFrames = storyboardBoundaries(storyboard, fps);
        const slots = boundariesToSlots(sbFrames, totalFrames, 'storyboard');
        return { slots, primaryDriver: 'storyboard' };
    }

    // 4. RHYTHM — steady cadence fallback. Always available as a last resort.
    const rhythm = input.rhythm ?? { minSec: 1.2, maxSec: 2.4 };
    const rhFrames = rhythmBoundaries(rhythm, totalFrames, fps);
    const slots = boundariesToSlots(rhFrames, totalFrames, 'rhythm');
    return { slots, primaryDriver: 'rhythm' };
}

/**
 * Reduce slots to the bare {startFrame,endFrame} grid that clipOrdering.ts and
 * the generator lock onto. This is the frame-for-frame contract the rest of the
 * engine preserves.
 */
export function slotsToframeGrid(slots: Slot[]): { startFrame: number; endFrame: number }[] {
    return slots.map(s => ({ startFrame: s.startFrame, endFrame: s.endFrame }));
}
