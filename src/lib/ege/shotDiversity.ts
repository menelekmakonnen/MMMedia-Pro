// ══════════════════════════════════════════════════════════════════════════════
// shotDiversity.ts — Slot-preserving shot-type de-clustering for the EGE.
//
// The Smart Engine classifies every clip's shot type (wide, close-up, aerial…).
// "Shot diversity" editing wants to avoid two of the same shot type back-to-back
// (e.g. two wide shots adjacent reads as a mistake; a showreel should vary). The
// generator picks content randomly, so clusters of the same shot type happen.
//
// This pass fixes that WITHOUT moving any cut time: it keeps the slot grid
// (startFrame/endFrame) exactly and only swaps WHICH content fills each slot —
// the same slot-preserving principle as clipOrdering.ts. When two neighbours
// share a shot type, it swaps one slot's content with a later slot whose content
// differs, re-trimming the moved content to its new slot's duration (clamped to
// the source). Beat/narration cut times are therefore untouched.
//
// Pure & deterministic. No React/IPC/FFmpeg imports.
// ══════════════════════════════════════════════════════════════════════════════

export interface DiversityClip {
    id: string;
    startFrame: number;
    endFrame: number;
    track: number;
    trimStartFrame?: number;
    trimEndFrame?: number;
    sourceDurationFrames?: number;
    mediaLibraryId?: string;
    path?: string;
    filename?: string;
}

export interface ShotDiversityOptions {
    /** Which track is the contiguous video spine. Default 0. */
    mainTrack?: number;
    /** Max swap attempts (safety bound). Default = clip count. */
    maxSwaps?: number;
}

/** Identity key used to look a clip's shot type up in the provided map. */
function keyOf(c: DiversityClip): string {
    return c.mediaLibraryId || c.path || c.filename || c.id;
}

/** Re-fit a moved content's source window to a new slot duration, clamped to the
 *  source length. Mirrors clipOrdering's retrimToSlot. */
function refit(content: DiversityClip, slotDur: number): { trimStartFrame: number; trimEndFrame: number } {
    const inPoint = content.trimStartFrame ?? 0;
    const ownTimeline = Math.max(1, content.endFrame - content.startFrame);
    const ownSource = (content.trimEndFrame ?? (inPoint + ownTimeline)) - inPoint;
    const ratio = ownSource > 0 ? ownSource / ownTimeline : 1;
    const needed = Math.max(1, Math.round(slotDur * ratio));
    let start = inPoint;
    let end = inPoint + needed;
    const srcLen = content.sourceDurationFrames && content.sourceDurationFrames > 0 ? content.sourceDurationFrames : undefined;
    if (srcLen !== undefined && end > srcLen) {
        start = Math.max(0, srcLen - needed);
        end = Math.min(srcLen, start + needed);
    }
    if (end <= start) end = start + 1;
    return { trimStartFrame: start, trimEndFrame: end };
}

/** Move `content` into `slot`, preserving the slot's timeline position + track. */
function place<T extends DiversityClip>(content: T, slot: T): T {
    const slotDur = slot.endFrame - slot.startFrame;
    const { trimStartFrame, trimEndFrame } = refit(content, slotDur);
    return { ...content, startFrame: slot.startFrame, endFrame: slot.endFrame, track: slot.track, trimStartFrame, trimEndFrame };
}

/**
 * De-cluster adjacent same-shot-type clips on the main track. `shotTypeOf` maps a
 * clip's identity (mediaLibraryId | path | filename | id) to its shot type string;
 * clips with no known shot type are left alone. Returns a new array; non-main-track
 * clips (audio, overlays) pass through untouched. Slot positions never change.
 */
export function deClusterShotTypes<T extends DiversityClip>(
    clips: T[],
    shotTypeOf: Map<string, string> | ((c: T) => string | undefined),
    opts: ShotDiversityOptions = {},
): T[] {
    if (clips.length < 3) return clips;
    const mainTrack = opts.mainTrack ?? 0;
    const lookup = (c: T): string | undefined =>
        typeof shotTypeOf === 'function' ? shotTypeOf(c) : shotTypeOf.get(keyOf(c));

    const others = clips.filter(c => c.track !== mainTrack);
    const main = clips.filter(c => c.track === mainTrack).sort((a, b) => a.startFrame - b.startFrame);
    if (main.length < 3) return clips;

    const maxSwaps = opts.maxSwaps ?? main.length;
    let swaps = 0;

    for (let i = 1; i < main.length && swaps < maxSwaps; i++) {
        const prevType = lookup(main[i - 1]);
        const curType = lookup(main[i]);
        if (!prevType || !curType || prevType !== curType) continue;

        // Find a later slot whose content differs from the previous clip and whose
        // own neighbours won't become a new clash after the swap.
        let swapped = false;
        for (let j = i + 1; j < main.length; j++) {
            const candType = lookup(main[j]);
            if (!candType || candType === prevType) continue;
            // Avoid creating a new adjacent clash at j's position.
            const jPrev = j > 0 ? lookup(main[j - 1]) : undefined;
            const jNext = j < main.length - 1 ? lookup(main[j + 1]) : undefined;
            if (curType === jPrev || curType === jNext) continue;

            const slotI = main[i];
            const slotJ = main[j];
            main[i] = place(main[j], slotI);
            main[j] = place(slotI, slotJ);
            swaps++;
            swapped = true;
            break;
        }
        if (!swapped) continue;
    }

    // Stitch the (possibly reordered-content) main track back with the others.
    return [...main, ...others];
}
