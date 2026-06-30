// ══════════════════════════════════════════════════════════════════════════════
// smartSegments.ts — Smart Engine ⇄ segment-model bridge + learnable bias.
//
// Turns the Smart Engine's per-source analysis (usable region, scene cuts, energy)
// into suggested include/exclude MediaSegments the user can accept or CHALLENGE.
// Every challenge feeds a small, persistent BIAS so future suggestions move toward
// the user's taste — the "training" loop. All logic here is pure; the persisted
// bias lives in smartTrainingStore.ts and is passed in.
//
// Pure & deterministic. No React / store imports.
// ══════════════════════════════════════════════════════════════════════════════

import {
    makeSegment,
    mergeRanges,
    type MediaSegment,
    type SegmentCanvas,
} from '../mediaSegments';

/** The subset of a Smart Engine result this bridge consumes. */
export interface SmartAnalysisLike {
    /** Overall clip quality score, 0–1 (or 0–100; auto-normalized). */
    score?: number;
    energyLevel?: 'static' | 'low' | 'moderate' | 'high' | 'intense';
    /** Usable region in FRAMES (head/tail trimmed by the analyzer). */
    usableInFrames?: number;
    usableOutFrames?: number;
    /** Scene-cut positions in FRAMES, within the source. */
    sceneCutsFrames?: number[];
}

/** Learnable bias accumulated from the user challenging Smart suggestions. */
export interface SmartBias {
    /** Seconds to additionally trim off the head (user tends to start later). */
    headTrimSec: number;
    /** Seconds to additionally trim off the tail. */
    tailTrimSec: number;
    /** −1 (user keeps more) … +1 (user keeps less / tighter cuts). */
    tightness: number;
    /** How many decisions fed this bias (confidence). */
    samples: number;
}

export const NEUTRAL_BIAS: SmartBias = { headTrimSec: 0, tailTrimSec: 0, tightness: 0, samples: 0 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, isFinite(v) ? v : lo));

/** Normalize a 0–1 or 0–100 score to 0–1. */
function norm01(score: number | undefined): number {
    if (score === undefined) return 0.5;
    return score > 1 ? clamp(score / 100, 0, 1) : clamp(score, 0, 1);
}

const ENERGY_LABEL: Record<NonNullable<SmartAnalysisLike['energyLevel']>, string> = {
    static: 'static', low: 'low energy', moderate: 'moderate', high: 'high energy', intense: 'intense',
};

export interface SuggestOptions {
    /** Source frame rate for frames→seconds conversion. Default 30. */
    fps?: number;
    /** Learned bias to apply. Default neutral. */
    bias?: SmartBias;
    /** Split the usable region into per-scene include segments. Default true. */
    perScene?: boolean;
    /** Minimum scene length to keep, seconds. Default 0.6. */
    minSceneSec?: number;
}

/**
 * Build Smart-Engine-suggested segments for a source. The usable region becomes
 * one or more INCLUDE segments (split by scene cuts), nudged by the learned bias.
 * Head/tail outside the usable region are implicitly dropped (no explicit exclude
 * needed because includes already bound the kept footage).
 */
export function suggestSmartSegments(
    canvas: SegmentCanvas,
    analysis: SmartAnalysisLike,
    opts: SuggestOptions = {},
): MediaSegment[] {
    const fps = opts.fps && opts.fps > 0 ? opts.fps : 30;
    const bias = opts.bias ?? NEUTRAL_BIAS;
    const perScene = opts.perScene ?? true;
    const minScene = opts.minSceneSec ?? 0.6;
    const dur = Math.max(0, canvas.duration || 0);
    if (dur <= 0) return [];

    const f2s = (f: number) => clamp(f / fps, 0, dur);
    const score = norm01(analysis.score);

    // 1) Usable region (frames → seconds), with learned head/tail trim + tightness.
    let inSec = analysis.usableInFrames !== undefined ? f2s(analysis.usableInFrames) : 0;
    let outSec = analysis.usableOutFrames !== undefined ? f2s(analysis.usableOutFrames) : dur;
    if (outSec <= inSec) { inSec = 0; outSec = dur; }

    const span = outSec - inSec;
    const tightPad = clamp(bias.tightness, -1, 1) * 0.1 * span; // ±10% of span at full tightness
    inSec = clamp(inSec + bias.headTrimSec + Math.max(0, tightPad), 0, dur);
    outSec = clamp(outSec - bias.tailTrimSec - Math.max(0, tightPad), 0, dur);
    if (outSec - inSec < minScene) { // bias over-trimmed → fall back to the raw usable region
        inSec = analysis.usableInFrames !== undefined ? f2s(analysis.usableInFrames) : 0;
        outSec = analysis.usableOutFrames !== undefined ? f2s(analysis.usableOutFrames) : dur;
    }

    const energyLabel = analysis.energyLevel ? ENERGY_LABEL[analysis.energyLevel] : undefined;

    // 2) Optionally split into per-scene includes using scene cuts inside [in,out].
    if (perScene && analysis.sceneCutsFrames && analysis.sceneCutsFrames.length > 0) {
        const cuts = analysis.sceneCutsFrames
            .map(f2s)
            .filter((t) => t > inSec + minScene && t < outSec - minScene)
            .sort((a, b) => a - b);
        const bounds = [inSec, ...cuts, outSec];
        const segs: MediaSegment[] = [];
        for (let i = 0; i < bounds.length - 1; i++) {
            const s = bounds[i];
            const e = bounds[i + 1];
            if (e - s < minScene) continue;
            segs.push(makeSegment(s, e, 'include', 'smart', {
                label: `scene ${segs.length + 1}${energyLabel ? ` · ${energyLabel}` : ''}`,
                score,
            }));
        }
        if (segs.length > 0) return segs;
    }

    // 3) Single usable include.
    return [makeSegment(inSec, outSec, 'include', 'smart', {
        label: energyLabel ? `usable · ${energyLabel}` : 'usable',
        score,
    })];
}

// ── The training loop ─────────────────────────────────────────────────────────

/** A single user decision challenging the Smart Engine's suggestion for a file. */
export interface SmartDecision {
    /** What the user did relative to the Smart suggestion. */
    kind: 'accept' | 'tightened' | 'loosened' | 'shifted-later' | 'shifted-earlier' | 'rejected';
    /** Seconds of delta the user applied at the head (+ = started later). */
    headDeltaSec?: number;
    /** Seconds of delta at the tail (− = ended earlier). */
    tailDeltaSec?: number;
}

/**
 * Fold a new decision into the running bias (exponential-ish moving average so it
 * adapts but never lurches). Returns a NEW bias (pure).
 */
export function updateBias(bias: SmartBias, d: SmartDecision): SmartBias {
    const n = bias.samples + 1;
    const w = 1 / Math.min(n, 8); // cap the learning rate so it stays stable
    const head = (d.headDeltaSec ?? 0);
    const tail = -(d.tailDeltaSec ?? 0); // tail trim is how much earlier they ended
    let tight = 0;
    if (d.kind === 'tightened') tight = 1;
    else if (d.kind === 'loosened') tight = -1;
    else if (d.kind === 'rejected') tight = 0.5;

    return {
        headTrimSec: clamp(bias.headTrimSec * (1 - w) + Math.max(0, head) * w, 0, 5),
        tailTrimSec: clamp(bias.tailTrimSec * (1 - w) + Math.max(0, tail) * w, 0, 5),
        tightness: clamp(bias.tightness * (1 - w) + tight * w, -1, 1),
        samples: n,
    };
}

/** Infer the decision kind + deltas from before/after head/tail edits. */
export function classifyEdit(
    smart: { inSec: number; outSec: number },
    user: { inSec: number; outSec: number },
): SmartDecision {
    const headDeltaSec = user.inSec - smart.inSec;     // + = user started later
    const tailDeltaSec = user.outSec - smart.outSec;   // − = user ended earlier
    const smartSpan = Math.max(0.001, smart.outSec - smart.inSec);
    const userSpan = Math.max(0, user.outSec - user.inSec);
    const ratio = userSpan / smartSpan;
    let kind: SmartDecision['kind'] = 'accept';
    if (ratio < 0.92) kind = 'tightened';
    else if (ratio > 1.08) kind = 'loosened';
    else if (Math.abs(headDeltaSec) > 0.25 && headDeltaSec > 0) kind = 'shifted-later';
    else if (Math.abs(headDeltaSec) > 0.25 && headDeltaSec < 0) kind = 'shifted-earlier';
    return { kind, headDeltaSec, tailDeltaSec };
}
