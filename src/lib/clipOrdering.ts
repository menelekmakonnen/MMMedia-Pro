// ══════════════════════════════════════════════════════════════════════════════
// clipOrdering.ts — Lockable edit structures for the Edit Generator.
//
// SLOT-PRESERVING reorder. The generated sequence defines a grid of cut-time
// SLOTS (startFrame/endFrame) dictated — in priority order — by Narration, then
// Beat, then the Smart Engine, then everything else. Reordering must NEVER move
// those cut times. It only reassigns WHICH source content fills each slot, and
// re-trims that content to the slot's exact duration. The beat/narration grid is
// therefore preserved frame-for-frame; only the visual content shuffles.
//
//   none                  → current behaviour, untouched.
//   sequential            → content order by date|filename;  segments in source order.
//   sequential-randomized → content order by date|filename;  segments shuffled within clip.
//   randomized-sequential → content order random (clip-grouped); segments in source order.
//   randomize             → fully interleaved random (maximally chaotic).
//
// Segments are GROUPED by their source clip so a clip's pieces stay contiguous —
// except 'randomize', which fully interleaves. Deterministic given a seed.
// Pure: unit-tested independently of the app.
// ══════════════════════════════════════════════════════════════════════════════

export type ClipOrderMode = 'none' | 'sequential' | 'sequential-randomized' | 'randomized-sequential' | 'randomize';
export type SequentialBy = 'date' | 'filename' | 'date-modified' | 'date-created';

export interface OrderableClip {
    id: string;
    startFrame: number;
    endFrame: number;
    trimStartFrame?: number;
    trimEndFrame?: number;
    sourceDurationFrames?: number;
    mediaLibraryId?: string;
    path?: string;
    filename?: string;
}

export interface OrderFileMeta { createdAt?: number; filename?: string; }
export interface ReorderOptions { sequentialBy?: SequentialBy | SequentialBy[]; fileMeta?: Map<string, OrderFileMeta>; seed?: number | string; }

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
function shuffle<T>(arr: T[], rand: () => number): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; }
    return a;
}

/**
 * Re-trim a piece of source CONTENT so that, dropped into a slot of `slotDur`
 * timeline frames, it requests the right amount of source footage. Keeps the
 * content's in-point; flexes only the out-point. Clamps to the source's real
 * length so we never seek past the end of the media (the renderer pads the slot
 * by cloning the last frame if the content runs short).
 */
function retrimToSlot(content: OrderableClip, slotDur: number): { trimStartFrame: number; trimEndFrame: number } {
    let inPoint = content.trimStartFrame ?? 0;
    const ownTimeline = Math.max(1, content.endFrame - content.startFrame);
    const ownSource = (content.trimEndFrame ?? (inPoint + ownTimeline)) - inPoint;
    // Source frames consumed per timeline frame for THIS content (handles mixed fps).
    const ratio = ownSource > 0 ? ownSource / ownTimeline : 1;
    const needed = Math.max(1, Math.round(slotDur * ratio));
    const srcLen = content.sourceDurationFrames && content.sourceDurationFrames > 0 ? content.sourceDurationFrames : undefined;
    let outPoint = inPoint + needed;
    if (srcLen !== undefined && outPoint > srcLen) {
        // Keeping the in-point would run past the end of the media. Slide the
        // window EARLIER so a source that is long enough overall still fully
        // covers the slot with real footage. Only genuinely-too-short sources
        // fall short here — and the renderer's pad-to-slot clones the last frame
        // to fill the remainder, so the slot's duration is preserved either way.
        inPoint = Math.max(0, srcLen - needed);
        outPoint = Math.min(srcLen, inPoint + needed);
    }
    if (outPoint <= inPoint) outPoint = inPoint + 1;
    return { trimStartFrame: inPoint, trimEndFrame: outPoint };
}

/**
 * Reorder generated clips into the chosen lockable structure WITHOUT moving any
 * cut time. The original clips define the slot grid (their startFrame/endFrame).
 * Content is permuted per `mode` and zipped 1:1 back onto those fixed slots, each
 * piece re-trimmed to its slot's duration. Returns the input unchanged for 'none'.
 */
export function reorderClips<T extends OrderableClip>(clips: T[], mode: ClipOrderMode, opts: ReorderOptions = {}): T[] {
    if (mode === 'none' || clips.length <= 1) return clips;
    const rand = mulberry32(seedToInt(opts.seed));
    const meta = opts.fileMeta ?? new Map<string, OrderFileMeta>();
    const keyOf = (c: T) => c.mediaLibraryId || c.path || c.filename || 'unknown';

    // ── 1. The SLOT grid: original clips in timeline order. Positions are LOCKED. ──
    const slots = [...clips].sort((a, b) => a.startFrame - b.startFrame);

    // ── 2. The CONTENT order: permute the same clips per the chosen structure. ──
    let ordered: T[];
    if (mode === 'randomize') {
        ordered = shuffle(clips, rand); // fully interleaved, maximally chaotic
    } else {
        const groups = new Map<string, T[]>(); const order: string[] = [];
        for (const c of clips) { const k = keyOf(c); if (!groups.has(k)) { groups.set(k, []); order.push(k); } groups.get(k)!.push(c); }
        const repName = (k: string) => meta.get(k)?.filename ?? groups.get(k)![0].filename ?? k;
        const repDate = (k: string) => meta.get(k)?.createdAt;

        let fileOrder: string[];
        if (mode === 'randomized-sequential') {
            fileOrder = shuffle(order, rand);                       // clip order random
        } else {
            fileOrder = [...order].sort((a, b) => {                // clip order by date|filename
                const keys = Array.isArray(opts.sequentialBy) ? opts.sequentialBy : [opts.sequentialBy ?? 'date-modified'];
                for (const key of keys) {
                    if (key === 'date' || key === 'date-modified' || key === 'date-created') {
                        const da = repDate(a) ?? Number.POSITIVE_INFINITY, db = repDate(b) ?? Number.POSITIVE_INFINITY;
                        if (da !== db) return da - db;
                    }
                    if (key === 'filename') {
                        const cmp = repName(a).localeCompare(repName(b), undefined, { numeric: true, sensitivity: 'base' });
                        if (cmp !== 0) return cmp;
                    }
                }
                return repName(a).localeCompare(repName(b), undefined, { numeric: true, sensitivity: 'base' });
            });
        }
        ordered = [];
        for (const k of fileOrder) {
            let segs = groups.get(k)!;
            if (mode === 'sequential-randomized') segs = shuffle(segs, rand);                       // segments shuffled within clip
            else segs = [...segs].sort((a, b) => (a.trimStartFrame ?? 0) - (b.trimStartFrame ?? 0)); // segments in source order
            ordered.push(...segs);
        }
    }

    // ── 3. Zip content onto the locked slots; re-trim each piece to its slot. ──
    return slots.map((slot, i) => {
        const content = ordered[i] ?? slot;
        const slotDur = slot.endFrame - slot.startFrame;
        const { trimStartFrame, trimEndFrame } = retrimToSlot(content, slotDur);
        return {
            ...content,                       // source identity, effects, transitions travel with content
            startFrame: slot.startFrame,      // LOCKED cut time (narration/beat grid)
            endFrame: slot.endFrame,          // LOCKED cut time
            trimStartFrame,
            trimEndFrame,
        };
    });
}
