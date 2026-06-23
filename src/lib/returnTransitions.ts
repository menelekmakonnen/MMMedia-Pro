// ══════════════════════════════════════════════════════════════════════════════
// returnTransitions.ts — "A → B → A" return-transition pass.
//
// When a boundary uses a directional transition (e.g. slideleft), the NEXT
// boundary can mirror it with the REVERSE (slideright), so the edit visually
// goes out and comes back — like a camera move that returns to where it started.
// Symmetric transitions (fade, dissolve, …) reverse to themselves, so a return
// pair simply repeats them.
//
// Pure & deterministic given a seed. Unit-tested independently of the app.
// ══════════════════════════════════════════════════════════════════════════════

import type { TransitionType, ClipTransition } from '../types';

/** Directional transitions and their mirror. Anything absent is symmetric and
 *  reverses to itself. */
export const REVERSE_TRANSITION: Partial<Record<TransitionType, TransitionType>> = {
    wipeleft: 'wiperight', wiperight: 'wipeleft', wipeup: 'wipedown', wipedown: 'wipeup',
    slideleft: 'slideright', slideright: 'slideleft', slideup: 'slidedown', slidedown: 'slideup',
    smoothleft: 'smoothright', smoothright: 'smoothleft', smoothup: 'smoothdown', smoothdown: 'smoothup',
    diagtl: 'diagbr', diagbr: 'diagtl', diagtr: 'diagbl', diagbl: 'diagtr',
    circleopen: 'circleclose', circleclose: 'circleopen',
    squeezeh: 'squeezeh', squeezev: 'squeezev',
};

/** The reverse of a transition. Directional transitions mirror; symmetric ones
 *  (fade, dissolve, pixelize, …) reverse to themselves. */
export function reverseTransition(t: TransitionType): TransitionType {
    return REVERSE_TRANSITION[t] ?? t;
}

export interface ReturnTransitionOptions {
    /** 0–100. Chance that a given forward transition gets a return leg. */
    frequency?: number;
    seed?: number | string;
}

interface HasTransition { transition?: ClipTransition }

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

/**
 * Mutate `clips` in place, adding return (reverse) transitions.
 *
 * A clip's `.transition` describes the boundary AFTER it. So if clip[i] has a
 * forward transition T (the "A → B" leg), we make clip[i+1]'s boundary the
 * reverse of T (the "B → A" leg) — provided clip[i+1] is not the last clip
 * (it needs a clip[i+2] to transition into). After placing a return we skip the
 * paired boundary so returns never chain into each other.
 *
 * Returns the same array for convenience.
 */
export function applyReturnTransitions<T extends HasTransition>(clips: T[], opts: ReturnTransitionOptions = {}): T[] {
    if (clips.length < 3) return clips;
    const freq = Math.max(0, Math.min(1, (opts.frequency ?? 100) / 100));
    if (freq <= 0) return clips;
    const rand = mulberry32(seedToInt(opts.seed));

    let i = 0;
    while (i < clips.length - 2) {
        const a = clips[i];
        const fwd = a.transition;
        // Need a real forward transition on A, and a B that can transition into C.
        if (!fwd || fwd.type === 'cut') { i++; continue; }
        if (rand() >= freq) { i++; continue; }

        const b = clips[i + 1];
        b.transition = {
            type: reverseTransition(fwd.type),
            durationFrames: fwd.durationFrames,
            params: { ...(fwd.params ?? {}), _return: 1 },
        };
        i += 2; // skip the boundary we just set so returns don't chain
    }
    return clips;
}
