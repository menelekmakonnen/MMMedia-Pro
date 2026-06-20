/**
 * Editorial Rules Engine — guardrails for the generators
 * ════════════════════════════════════════════════════════════════════════════
 * Encodes editorial preferences as enforceable constraints applied as a post-pass
 * over a generated sequence:
 *   • cap mask-transition density (a configurable threshold, never an outright ban)
 *   • blacklist effects/transitions outright (e.g. fisheye)
 *   • protect designated match cuts so their transition can't be overwritten/removed
 *   • flag stock-effect usage (report only — leaves the human to decide)
 *
 * Operates on a minimal structural ClipLike so it stays pure + unit-testable.
 */

export interface RuleClip {
    id: string;
    transition?: { type: string; durationFrames?: number } | null;
    effectIds?: string[];
    parametricEffects?: Array<{ effectId: string }>;
    [k: string]: unknown;
}

export interface RulesConfig {
    /** Max fraction (0–1) of clips allowed to carry a mask transition. */
    maskDensityCap: number;
    /** Transition-type substrings considered "mask" transitions. */
    maskTypes: string[];
    /** Effect ids / transition types to remove outright. */
    blacklist: string[];
    /** Clip ids whose transition is a protected match cut (never altered). */
    protectedClipIds: string[];
    /** Effect ids considered "stock" — flagged in the report, not removed. */
    stockEffectIds: string[];
}

export const DEFAULT_RULES: RulesConfig = {
    maskDensityCap: 0.33,
    maskTypes: ['mask', 'roto', 'shape'],
    blacklist: ['fisheye'],
    protectedClipIds: [],
    stockEffectIds: [],
};

export interface RulesReport {
    maskCappedClipIds: string[];
    blacklistedRemoved: Array<{ clipId: string; item: string }>;
    protectedKept: string[];
    stockFlagged: Array<{ clipId: string; item: string }>;
}

const isMask = (type: string | undefined, maskTypes: string[]) =>
    !!type && maskTypes.some(m => type.toLowerCase().includes(m));

/**
 * Apply the rules to a sequence. Returns a NEW sequence (clips are shallow-cloned
 * only when modified) plus a report describing every action taken.
 */
export function applyRules<T extends RuleClip>(
    clips: T[],
    rules: RulesConfig = DEFAULT_RULES,
): { clips: T[]; report: RulesReport } {
    const report: RulesReport = { maskCappedClipIds: [], blacklistedRemoved: [], protectedKept: [], stockFlagged: [] };
    const protectedSet = new Set(rules.protectedClipIds);
    const blacklist = rules.blacklist.map(b => b.toLowerCase());

    // Pass 1 — blacklist + stock flagging (per clip).
    let out = clips.map(c => {
        let clip = c;
        const clone = () => { if (clip === c) clip = { ...c } as T; return clip; };

        // Blacklisted transition → drop it (unless protected).
        if (clip.transition && blacklist.some(b => clip.transition!.type.toLowerCase().includes(b))) {
            if (protectedSet.has(clip.id)) {
                report.protectedKept.push(clip.id);
            } else {
                report.blacklistedRemoved.push({ clipId: clip.id, item: 'transition:' + clip.transition.type });
                clone().transition = null;
            }
        }
        // Blacklisted effect ids → strip.
        if (clip.effectIds && clip.effectIds.some(e => blacklist.some(b => e.toLowerCase().includes(b)))) {
            const kept = clip.effectIds.filter(e => !blacklist.some(b => e.toLowerCase().includes(b)));
            for (const e of clip.effectIds) if (!kept.includes(e)) report.blacklistedRemoved.push({ clipId: clip.id, item: 'effect:' + e });
            clone().effectIds = kept;
        }
        if (clip.parametricEffects && clip.parametricEffects.some(p => blacklist.some(b => p.effectId.toLowerCase().includes(b)))) {
            const kept = clip.parametricEffects.filter(p => !blacklist.some(b => p.effectId.toLowerCase().includes(b)));
            for (const p of clip.parametricEffects) if (!kept.includes(p)) report.blacklistedRemoved.push({ clipId: clip.id, item: 'parametric:' + p.effectId });
            clone().parametricEffects = kept;
        }
        // Stock-effect flagging (report only).
        for (const e of clip.effectIds ?? []) if (rules.stockEffectIds.includes(e)) report.stockFlagged.push({ clipId: clip.id, item: e });

        return clip;
    });

    // Pass 2 — cap mask-transition density. Protected match cuts are exempt and
    // counted first; excess masks beyond the cap are demoted to a hard cut.
    const maskClips = out.filter(c => isMask(c.transition?.type, rules.maskTypes));
    const allowed = Math.max(0, Math.floor(out.length * rules.maskDensityCap));
    if (maskClips.length > allowed) {
        // Keep protected masks, then earliest ones, up to `allowed`.
        const ordered = [...maskClips].sort((a, b) => {
            const pa = protectedSet.has(a.id) ? 0 : 1, pb = protectedSet.has(b.id) ? 0 : 1;
            return pa - pb;
        });
        const keep = new Set(ordered.slice(0, allowed).map(c => c.id));
        out = out.map(c => {
            if (isMask(c.transition?.type, rules.maskTypes) && !keep.has(c.id)) {
                if (protectedSet.has(c.id)) { report.protectedKept.push(c.id); return c; }
                report.maskCappedClipIds.push(c.id);
                return { ...c, transition: null } as T;
            }
            return c;
        });
    }

    return { clips: out, report };
}
