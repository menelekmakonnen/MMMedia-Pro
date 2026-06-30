// ══════════════════════════════════════════════════════════════════════════════
// editorialRules.ts — The editorial brain (Parker-Walbeck music-video grammar).
//
// Encodes professional cutting RULES as pure functions over signals the app
// already produces (audio Segments + EnergyContour + beats; per-clip ClipAnalysis
// shotScale / cameraMotion / motionMagnitude / face boxes). These power BOTH:
//   • the autonomous Edit/Grid Generator Engine (planning + self-critique), and
//   • the Sequence-view Editorial Assist (warnings + one-click fixes).
//
// Four rule areas:
//   1. Dynamic pacing & cut timing — longer cuts in verses, faster in choruses /
//      drops; bias cut points onto motion ("cut on action") and the beat grid.
//   2. Shot diversity / 30° rule — never cut between two shots that share BOTH
//      scale and angle (reads as a jump cut); change scale OR angle each cut.
//   3. Eye tracing — keep the subject's focus in a consistent screen region
//      across cuts via a reframe (zoom + origin), so the eye never hunts.
//   4. Transition discipline — hard cuts by default; cross-dissolves only on slow,
//      low-energy, atmospheric boundaries.
//
// Pure & deterministic. No React / IPC / FFmpeg imports.
// ══════════════════════════════════════════════════════════════════════════════

import type { SegmentType } from '../audioAnalysis';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, isFinite(v) ? v : lo));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp01(t);

// ══════════════════════════════════════════════════════════════════════════════
// 1. DYNAMIC PACING & CUT TIMING
// ══════════════════════════════════════════════════════════════════════════════

/** A musical section with its energy (0–1). Derived from audio Segments. */
export interface PacingSection {
    startSec: number;
    endSec: number;
    type: SegmentType;
    /** Mean normalized energy of the section, 0–1. */
    energy: number;
}

export interface PacingOptions {
    /** Clip-duration bounds in seconds → [fastest, slowest]. */
    clipSeconds?: [number, number];
}

/**
 * Per-section type bias on cut length. >1 = hold longer (calm), <1 = cut faster
 * (energetic). "Don't be a slave to the beat" — pacing tracks the song's arc.
 */
const SECTION_PACE: Record<SegmentType, number> = {
    intro:     1.30,
    verse:     1.20,
    breakdown: 1.25,
    bridge:    1.15,
    buildup:   0.85,
    chorus:    0.70,
    drop:      0.60,
    outro:     1.20,
};

export interface PacedSection extends PacingSection {
    /** Target average clip length for this section, in seconds. */
    targetClipSec: number;
}

export interface PacingPlan {
    sections: PacedSection[];
    clipSeconds: [number, number];
}

/**
 * Build a pacing plan: each section gets a target clip length blending its
 * energy (high energy → shorter) with a section-type bias. Choruses/drops cut
 * fast; verses/intros breathe.
 */
export function planSegmentPacing(sections: PacingSection[], opts: PacingOptions = {}): PacingPlan {
    const [fast, slow] = opts.clipSeconds ?? [0.5, 3.0];
    const lo = Math.min(fast, slow);
    const hi = Math.max(fast, slow);
    const paced: PacedSection[] = sections.map((s) => {
        // Energy maps high→fast (lo) and low→slow (hi).
        const base = lerp(hi, lo, clamp01(s.energy));
        const mult = SECTION_PACE[s.type] ?? 1;
        return { ...s, targetClipSec: clamp(base * mult, lo, hi) };
    });
    return { sections: paced, clipSeconds: [lo, hi] };
}

/** Target average clip length (seconds) at a given timeline position. */
export function targetClipSecAt(plan: PacingPlan, tSec: number): number {
    const hit = plan.sections.find((s) => tSec >= s.startSec && tSec < s.endSec);
    if (hit) return hit.targetClipSec;
    // Fall back to the nearest section, or the midpoint of the bounds.
    if (plan.sections.length === 0) return (plan.clipSeconds[0] + plan.clipSeconds[1]) / 2;
    const last = plan.sections[plan.sections.length - 1];
    return tSec >= last.endSec ? last.targetClipSec : plan.sections[0].targetClipSec;
}

// ── Cut on action ─────────────────────────────────────────────────────────────

export interface CutCandidate {
    /** Candidate cut time, seconds. */
    tSec: number;
    /** Motion magnitude at this time, 0–1 (from ClipAnalysis.motionMagnitude or
     *  per-frame optical-flow). Higher = a swing/step that hides the cut. */
    motion: number;
    /** Optional: distance to nearest beat, seconds (smaller = tighter sync). */
    beatDistanceSec?: number;
}

export interface CutOnActionOptions {
    /** How far from the ideal time we may slide a cut to land on action, seconds. */
    windowSec?: number;
    /** Weight of beat-sync vs motion when both are present, 0–1 (0 = motion only). */
    beatWeight?: number;
}

/** Score a single candidate: motion conceals cuts; beat proximity tightens sync. */
export function scoreCutCandidate(c: CutCandidate, beatWeight = 0.4): number {
    const motionScore = clamp01(c.motion);
    if (c.beatDistanceSec === undefined) return motionScore;
    const sync = clamp01(1 - c.beatDistanceSec / 0.12); // within ~120ms = tight
    return clamp01((1 - beatWeight) * motionScore + beatWeight * sync);
}

/**
 * "Cut on action": from candidate cut points near `idealSec`, pick the one that
 * best hides the cut (high motion) while staying within `windowSec` and,
 * optionally, near the beat. Returns the chosen time (falls back to `idealSec`).
 */
export function pickActionCut(
    candidates: CutCandidate[],
    idealSec: number,
    opts: CutOnActionOptions = {},
): number {
    const windowSec = opts.windowSec ?? 0.25;
    const beatWeight = opts.beatWeight ?? 0.4;
    const inWindow = candidates.filter((c) => Math.abs(c.tSec - idealSec) <= windowSec);
    if (inWindow.length === 0) return idealSec;
    let best = inWindow[0];
    let bestScore = -Infinity;
    for (const c of inWindow) {
        // Penalize distance from the ideal so we don't drift far for a tiny gain.
        const dist = Math.abs(c.tSec - idealSec) / windowSec;
        const score = scoreCutCandidate(c, beatWeight) - 0.25 * dist;
        if (score > bestScore) { bestScore = score; best = c; }
    }
    return best.tSec;
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. SHOT DIVERSITY — THE 30° RULE
// ══════════════════════════════════════════════════════════════════════════════

/** The two signals that define "angle + focal length" for jump-cut detection. */
export interface ShotGrammar {
    /** Shot scale, e.g. ClipAnalysis.shotScale ('cu','ms','ls'…). */
    shotScale?: string;
    /** Camera framing/motion, e.g. ClipAnalysis.cameraMotion. */
    cameraMotion?: string;
}

/**
 * Composite identity for the 30° rule. Two adjacent clips that share this exact
 * key changed neither scale nor angle → a jump cut. Feed this into
 * shotDiversity.deClusterShotTypes to enforce the rule with the proven
 * slot-preserving swap machinery.
 */
export function shotGrammarKey(g: ShotGrammar | undefined): string | undefined {
    if (!g) return undefined;
    const scale = g.shotScale ?? '';
    const motion = g.cameraMotion ?? '';
    if (!scale && !motion) return undefined;
    return `${scale}|${motion}`;
}

export interface AdjacencyClip {
    id: string;
    startFrame: number;
    endFrame: number;
    track: number;
}

export interface JumpCutViolation {
    aId: string;
    bId: string;
    /** The shared grammar key that makes this a jump cut. */
    sharedKey: string;
    reason: string;
}

/**
 * Detect 30°-rule violations on the main track: adjacent clips sharing BOTH scale
 * and angle. Used by the Sequence-view assist to flag jump cuts.
 */
export function detect30DegreeViolations(
    clips: AdjacencyClip[],
    grammarOf: (id: string) => ShotGrammar | undefined,
    mainTrack = 0,
): JumpCutViolation[] {
    const main = clips
        .filter((c) => c.track === mainTrack)
        .sort((a, b) => a.startFrame - b.startFrame);
    const out: JumpCutViolation[] = [];
    for (let i = 1; i < main.length; i++) {
        const a = shotGrammarKey(grammarOf(main[i - 1].id));
        const b = shotGrammarKey(grammarOf(main[i].id));
        if (a && b && a === b) {
            out.push({
                aId: main[i - 1].id,
                bId: main[i].id,
                sharedKey: a,
                reason: 'Same shot scale and angle on adjacent cut — reads as a jump cut (30° rule).',
            });
        }
    }
    return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. EYE TRACING
// ══════════════════════════════════════════════════════════════════════════════

/** Normalized subject box (0–1 of frame). cx/cy are the box centre. */
export interface SubjectBox {
    cx: number;
    cy: number;
    width: number;
    height: number;
}

export type ZoomOrigin = 'center' | 'left' | 'right' | 'top' | 'bottom';

export interface ReframePlan {
    /** Zoom level for the existing Clip.zoomLevel field (100–200). */
    zoomLevel: number;
    /** Coarse anchor for the existing Clip.zoomOrigin field. */
    zoomOrigin: ZoomOrigin;
    /** Continuous anchor (0–1) for callers that support sub-pixel reframing. */
    originX: number;
    originY: number;
    /** How far the subject sat from the target region (0–1). 0 = already placed. */
    drift: number;
}

export interface EyeTraceOptions {
    /** Where the subject's focus should sit. Default = slightly above centre
     *  (the natural "eye line"). */
    targetX?: number;
    targetY?: number;
    /** Max zoom used to recompose, percent (100 = none). */
    maxZoomPercent?: number;
    /** Don't reframe if drift is below this (already well placed). */
    deadZone?: number;
}

/**
 * Plan a reframe so the subject lands on the target region, keeping the viewer's
 * eye anchored across cuts. Returns null when no subject or drift is negligible.
 */
export function planEyeTraceReframe(
    subject: SubjectBox | undefined,
    opts: EyeTraceOptions = {},
): ReframePlan | null {
    if (!subject) return null;
    const tx = opts.targetX ?? 0.5;
    const ty = opts.targetY ?? 0.42;
    const maxZoom = opts.maxZoomPercent ?? 130;
    const deadZone = opts.deadZone ?? 0.06;

    const dx = subject.cx - tx;
    const dy = subject.cy - ty;
    const drift = Math.hypot(dx, dy);
    if (drift < deadZone) return null;

    // Zoom scales with drift so a bigger reposition has the headroom to recompose.
    const zoomLevel = Math.round(clamp(100 + drift * 120, 100, maxZoom));
    // Anchor toward the subject so the centred crop frames it.
    const originX = clamp01(subject.cx);
    const originY = clamp01(subject.cy);

    let zoomOrigin: ZoomOrigin = 'center';
    if (Math.abs(dx) >= Math.abs(dy)) {
        if (dx > deadZone) zoomOrigin = 'right';
        else if (dx < -deadZone) zoomOrigin = 'left';
    } else {
        if (dy > deadZone) zoomOrigin = 'bottom';
        else if (dy < -deadZone) zoomOrigin = 'top';
    }

    return { zoomLevel, zoomOrigin, originX, originY, drift: clamp01(drift) };
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. TRANSITION DISCIPLINE
// ══════════════════════════════════════════════════════════════════════════════

export type TransitionDecision = 'hard-cut' | 'dissolve';

/** Segments where an atmospheric dissolve is on-brand (slow, mood-setting). */
const ATMOSPHERIC: ReadonlySet<SegmentType> = new Set<SegmentType>(['intro', 'outro', 'breakdown', 'bridge']);

export interface BoundaryContext {
    /** Energy at the boundary, 0–1. */
    energy: number;
    /** Musical segment the boundary falls in. */
    segmentType?: SegmentType;
}

export interface TransitionDisciplineOptions {
    /** Only dissolve below this energy. Default 0.35. */
    energyCeiling?: number;
    /** Require an atmospheric segment for a dissolve. Default true. */
    requireAtmospheric?: boolean;
}

/**
 * Decide a single boundary: hard cut unless it's a genuinely slow, low-energy,
 * atmospheric moment. Hard cuts maintain energy and read as professional;
 * cross-dissolves are reserved, not used to paper over weak edits.
 */
export function decideTransition(
    ctx: BoundaryContext,
    opts: TransitionDisciplineOptions = {},
): TransitionDecision {
    const ceiling = opts.energyCeiling ?? 0.35;
    const requireAtmo = opts.requireAtmospheric ?? true;
    const lowEnergy = clamp01(ctx.energy) <= ceiling;
    const atmo = ctx.segmentType ? ATMOSPHERIC.has(ctx.segmentType) : !requireAtmo;
    return lowEnergy && (atmo || !requireAtmo) ? 'dissolve' : 'hard-cut';
}

export function planTransitionDiscipline(
    boundaries: BoundaryContext[],
    opts: TransitionDisciplineOptions = {},
): TransitionDecision[] {
    return boundaries.map((b) => decideTransition(b, opts));
}

// ══════════════════════════════════════════════════════════════════════════════
// EDITORIAL SELF-CRITIQUE (engine scoring)
// ══════════════════════════════════════════════════════════════════════════════

export interface EditorialScoreInput {
    clips: AdjacencyClip[];
    grammarOf: (id: string) => ShotGrammar | undefined;
    /** Per-clip subject box for eye-trace consistency (optional). */
    subjectOf?: (id: string) => SubjectBox | undefined;
    /** Boundary contexts + the transition actually used, for discipline scoring. */
    boundaries?: Array<BoundaryContext & { used: TransitionDecision }>;
    mainTrack?: number;
}

export interface EditorialScore {
    /** 0–1: adherence to the 30° rule (1 = no jump cuts). */
    shotGrammar: number;
    /** 0–1: subject stays in a consistent screen region across cuts. */
    eyeTrace: number;
    /** 0–1: transitions follow the hard-cut-by-default discipline. */
    transitionDiscipline: number;
    overall: number;
    notes: string[];
}

/** Grade an edit against the editorial rules (additive to editScorer's axes). */
export function scoreEditorial(input: EditorialScoreInput): EditorialScore {
    const notes: string[] = [];
    const mainTrack = input.mainTrack ?? 0;
    const main = input.clips
        .filter((c) => c.track === mainTrack)
        .sort((a, b) => a.startFrame - b.startFrame);

    // ── Shot grammar (30° rule) ──
    const cutCount = Math.max(0, main.length - 1);
    const violations = detect30DegreeViolations(input.clips, input.grammarOf, mainTrack);
    const shotGrammar = cutCount === 0 ? 1 : clamp01(1 - violations.length / cutCount);
    if (violations.length > 0) notes.push(`Shot grammar: ${violations.length}/${cutCount} cuts are jump cuts (30° rule).`);

    // ── Eye trace consistency: variance of subject centre across clips ──
    let eyeTrace = 1;
    if (input.subjectOf) {
        const centres = main
            .map((c) => input.subjectOf!(c.id))
            .filter((s): s is SubjectBox => !!s);
        if (centres.length >= 2) {
            const mx = centres.reduce((a, s) => a + s.cx, 0) / centres.length;
            const my = centres.reduce((a, s) => a + s.cy, 0) / centres.length;
            const meanDrift =
                centres.reduce((a, s) => a + Math.hypot(s.cx - mx, s.cy - my), 0) / centres.length;
            // 0 drift → 1.0; drift of ~0.3 of the frame → 0.0.
            eyeTrace = clamp01(1 - meanDrift / 0.3);
            if (eyeTrace < 0.6) notes.push('Eye trace: subject jumps around the frame between cuts.');
        }
    }

    // ── Transition discipline ──
    let transitionDiscipline = 1;
    if (input.boundaries && input.boundaries.length > 0) {
        let ok = 0;
        for (const b of input.boundaries) {
            if (decideTransition(b) === b.used) ok++;
        }
        transitionDiscipline = clamp01(ok / input.boundaries.length);
        if (transitionDiscipline < 0.8) notes.push('Transitions: dissolves used outside slow/atmospheric moments.');
    }

    const overall = clamp01(0.45 * shotGrammar + 0.30 * transitionDiscipline + 0.25 * eyeTrace);
    return { shotGrammar, eyeTrace, transitionDiscipline, overall, notes };
}
