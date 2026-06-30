// ══════════════════════════════════════════════════════════════════════════════
// mediaSegments.ts — Per-source include/exclude segment model (the source of truth).
//
// A media file's "edit decisions" are a list of typed segments layered over the
// clip's usable canvas:
//   • include — a range the user/Smart Engine wants kept.
//   • exclude — a range to drop, layered OVER includes (e.g. cut a glitch out of
//     an otherwise-good take).
//
// Resolution: start from the usable canvas (trimIn..trimOut, else 0..duration).
// If any INCLUDE segments exist, the kept canvas is their union; otherwise the
// whole usable canvas is kept. Then every EXCLUDE is subtracted. The result is a
// set of disjoint "kept ranges" — the ONLY footage any downstream tool (Edit
// Generator, timeline, export) may pull from for that source.
//
// Pure & deterministic. No React / store / FFmpeg imports.
// ══════════════════════════════════════════════════════════════════════════════

export type SegmentType = 'include' | 'exclude' | 'show';
export type SegmentOrigin = 'smart' | 'user';

export interface MediaSegment {
    id: string;
    /** Range start, seconds from the start of the source. */
    startSec: number;
    /** Range end, seconds from the start of the source. */
    endSec: number;
    type: SegmentType;
    /** Who created it — Smart Engine suggestion vs. a user decision. */
    origin: SegmentOrigin;
    /** Optional human label (e.g. 'high energy', 'silence', 'scene 2'). */
    label?: string;
    /** Optional 0–1 confidence / energy score from the Smart Engine. */
    score?: number;
}

export interface TimeRange {
    startSec: number;
    endSec: number;
}

/** The usable canvas a file's segments are layered over. */
export interface SegmentCanvas {
    /** Total source duration, seconds. */
    duration: number;
    /** Pre-import trim start (seconds). Defaults to 0. */
    trimIn?: number;
    /** Pre-import trim end (seconds). Defaults to duration. */
    trimOut?: number;
}

const EPS = 1e-4;

const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, isFinite(v) ? v : lo));

/** A monotonic-ish id generator that doesn't depend on uuid (keeps this pure). */
let _seq = 0;
export function newSegmentId(prefix = 'seg'): string {
    _seq = (_seq + 1) % Number.MAX_SAFE_INTEGER;
    return `${prefix}_${Date.now().toString(36)}_${_seq.toString(36)}`;
}

// ── Range algebra ─────────────────────────────────────────────────────────────

/** Merge overlapping/adjacent ranges into a sorted, disjoint set. */
export function mergeRanges(ranges: TimeRange[]): TimeRange[] {
    const valid = ranges
        .map((r) => ({ startSec: Math.min(r.startSec, r.endSec), endSec: Math.max(r.startSec, r.endSec) }))
        .filter((r) => r.endSec - r.startSec > EPS)
        .sort((a, b) => a.startSec - b.startSec);
    const out: TimeRange[] = [];
    for (const r of valid) {
        const last = out[out.length - 1];
        if (last && r.startSec <= last.endSec + EPS) {
            last.endSec = Math.max(last.endSec, r.endSec);
        } else {
            out.push({ ...r });
        }
    }
    return out;
}

/** Intersect a set of ranges with a single window. */
export function clipRangesToWindow(ranges: TimeRange[], window: TimeRange): TimeRange[] {
    const lo = Math.min(window.startSec, window.endSec);
    const hi = Math.max(window.startSec, window.endSec);
    const out: TimeRange[] = [];
    for (const r of ranges) {
        const s = Math.max(r.startSec, lo);
        const e = Math.min(r.endSec, hi);
        if (e - s > EPS) out.push({ startSec: s, endSec: e });
    }
    return out;
}

/** Subtract a set of ranges (holes) from a base set. Returns disjoint remainder. */
export function subtractRanges(base: TimeRange[], holes: TimeRange[]): TimeRange[] {
    const mergedBase = mergeRanges(base);
    const mergedHoles = mergeRanges(holes);
    if (mergedHoles.length === 0) return mergedBase;
    const out: TimeRange[] = [];
    for (const b of mergedBase) {
        let cursor = b.startSec;
        for (const h of mergedHoles) {
            if (h.endSec <= cursor + EPS || h.startSec >= b.endSec - EPS) continue; // no overlap
            if (h.startSec > cursor + EPS) out.push({ startSec: cursor, endSec: Math.min(h.startSec, b.endSec) });
            cursor = Math.max(cursor, h.endSec);
            if (cursor >= b.endSec - EPS) break;
        }
        if (b.endSec - cursor > EPS) out.push({ startSec: cursor, endSec: b.endSec });
    }
    return out.filter((r) => r.endSec - r.startSec > EPS);
}

/** Total seconds covered by a set of ranges. */
export function rangesDuration(ranges: TimeRange[]): number {
    return mergeRanges(ranges).reduce((a, r) => a + (r.endSec - r.startSec), 0);
}

// ── The resolver — the heart of "source of truth" ─────────────────────────────

/** The usable canvas = trimIn..trimOut clamped to 0..duration. */
export function usableCanvas(canvas: SegmentCanvas): TimeRange {
    const dur = Math.max(0, canvas.duration || 0);
    const lo = clampN(canvas.trimIn ?? 0, 0, dur);
    const hi = clampN(canvas.trimOut ?? dur, 0, dur);
    return { startSec: Math.min(lo, hi), endSec: Math.max(lo, hi) };
}

/**
 * Resolve a file's segments into the disjoint set of KEPT ranges:
 *   kept = (union of includes ∩ canvas, or the whole canvas if no includes)
 *          − (union of excludes)
 * The returned ranges are sorted, disjoint, and clipped to the usable canvas.
 */
export function resolveKeptRanges(canvas: SegmentCanvas, segments: MediaSegment[] | undefined): TimeRange[] {
    const window = usableCanvas(canvas);
    if (window.endSec - window.startSec <= EPS) return [];
    const segs = segments ?? [];
    // 'show' segments are a superset of 'include' — they MUST be kept
    const includes = segs.filter((s) => s.type === 'include' || s.type === 'show').map((s) => ({ startSec: s.startSec, endSec: s.endSec }));
    const excludes = segs.filter((s) => s.type === 'exclude').map((s) => ({ startSec: s.startSec, endSec: s.endSec }));

    const includeBase = includes.length > 0
        ? clipRangesToWindow(mergeRanges(includes), window)
        : [window];
    const holes = clipRangesToWindow(mergeRanges(excludes), window);
    return subtractRanges(includeBase, holes);
}

/**
 * Resolve only the 'show' segments — forced full-length ranges that the
 * generator MUST place as continuous sequences (cut to the beat). Returns
 * ranges clipped to the usable canvas, sorted and disjoint.
 */
export function resolveShowRanges(canvas: SegmentCanvas, segments: MediaSegment[] | undefined): TimeRange[] {
    const window = usableCanvas(canvas);
    if (window.endSec - window.startSec <= EPS) return [];
    const shows = (segments ?? []).filter((s) => s.type === 'show').map((s) => ({ startSec: s.startSec, endSec: s.endSec }));
    return clipRangesToWindow(mergeRanges(shows), window);
}

/** Convenience: total kept seconds for a file. */
export function keptDuration(canvas: SegmentCanvas, segments: MediaSegment[] | undefined): number {
    return rangesDuration(resolveKeptRanges(canvas, segments));
}

/** Whether the file's segments effectively keep nothing (fully excluded). */
export function isFullyExcluded(canvas: SegmentCanvas, segments: MediaSegment[] | undefined): boolean {
    return keptDuration(canvas, segments) <= EPS && usableCanvas(canvas).endSec > EPS;
}

// ── Segment construction / editing helpers (pure) ─────────────────────────────

/** Clamp a segment to the usable canvas and normalize start < end. */
export function clampSegment(seg: MediaSegment, canvas: SegmentCanvas): MediaSegment {
    const w = usableCanvas(canvas);
    let s = clampN(seg.startSec, w.startSec, w.endSec);
    let e = clampN(seg.endSec, w.startSec, w.endSec);
    if (e < s) [s, e] = [e, s];
    if (e - s < EPS) e = Math.min(w.endSec, s + 0.1);
    return { ...seg, startSec: s, endSec: e };
}

/** Build a new segment over a range. */
export function makeSegment(
    startSec: number,
    endSec: number,
    type: SegmentType,
    origin: SegmentOrigin,
    extra: Partial<Pick<MediaSegment, 'label' | 'score'>> = {},
): MediaSegment {
    const s = Math.min(startSec, endSec);
    const e = Math.max(startSec, endSec);
    return { id: newSegmentId(type), startSec: s, endSec: e, type, origin, ...extra };
}

/** Add a segment, returning a new array (clamped to the canvas). */
export function addSegment(segments: MediaSegment[] | undefined, seg: MediaSegment, canvas: SegmentCanvas): MediaSegment[] {
    return [...(segments ?? []), clampSegment(seg, canvas)];
}

/** Update a segment by id. */
export function updateSegment(
    segments: MediaSegment[] | undefined,
    id: string,
    patch: Partial<MediaSegment>,
    canvas: SegmentCanvas,
): MediaSegment[] {
    return (segments ?? []).map((s) => (s.id === id ? clampSegment({ ...s, ...patch }, canvas) : s));
}

/** Remove a segment by id. */
export function removeSegment(segments: MediaSegment[] | undefined, id: string): MediaSegment[] {
    return (segments ?? []).filter((s) => s.id !== id);
}

/** Cycle a segment through include → exclude → show → include. */
export function toggleSegmentType(segments: MediaSegment[] | undefined, id: string): MediaSegment[] {
    const CYCLE: Record<SegmentType, SegmentType> = {
        include: 'exclude',
        exclude: 'show',
        show: 'include',
    };
    return (segments ?? []).map((s) =>
        s.id === id ? { ...s, type: CYCLE[s.type] ?? 'include', origin: 'user' as SegmentOrigin } : s,
    );
}
