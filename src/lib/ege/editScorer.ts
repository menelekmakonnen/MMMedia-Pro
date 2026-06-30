// ══════════════════════════════════════════════════════════════════════════════
// editScorer.ts — Multi-dimensional quality scorer for generated edits.
//
// After the EGE produces a timeline, this module grades it across six axes:
// pacing variety, visual diversity, sync tightness, hook strength, slideshow
// risk (inverse), and narrative flow. The weighted average yields an overall
// score and a human-readable verdict ("strong" / "acceptable" / "revise" /
// "fail"). Inspired by OpenMontage's slideshow-risk and delivery-promise
// concepts — an edit that merely tiles clips equally is a slideshow, not an
// edit.
//
// Each dimension returns [0, 1]. Weights sum to 1.0. Notes accumulate per
// dimension for debugging / telemetry.
//
// Pure & deterministic. No React / IPC / FFmpeg imports.
// ══════════════════════════════════════════════════════════════════════════════

import type { ContractClip } from './generationContract';
import { DEFAULT_FPS } from '../time';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface EditScore {
    /** 0-1: Are clip durations varied enough? (not all same length) */
    pacingVariety: number;
    /** 0-1: Are sources visually diverse? (not reusing same clip repeatedly) */
    visualDiversity: number;
    /** 0-1: Do cuts align with beat grid? (when beats available) */
    syncTightness: number;
    /** 0-1: Does the opening grab attention? (first 3s) */
    hookStrength: number;
    /** 0-1: Is this a real edit or glorified slideshow? (inverse risk) */
    slideshowRisk: number;
    /** 0-1: Does the pacing build/vary or stay flat? */
    narrativeFlow: number;
    /** Weighted average of all dimensions */
    overall: number;
    /** Human-readable verdict */
    verdict: 'strong' | 'acceptable' | 'revise' | 'fail';
    /** Per-dimension notes for debugging */
    notes: string[];
}

export interface EditScorerInput {
    clips: ContractClip[];
    targetDurationFrames: number;
    fps: number;
    beatTimestamps?: number[] | null;
    /** Track count hint — edits with multi-track usage score higher */
    maxTrack?: number;
}

// ─── Dimension weights ────────────────────────────────────────────────────────
const W_PACING    = 0.15;
const W_DIVERSITY = 0.20;
const W_SYNC      = 0.20;
const W_HOOK      = 0.15;
const W_SLIDESHOW = 0.15;
const W_NARRATIVE  = 0.15;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Stable source-identity key (mirrors generationContract.ts). */
function sourceKey(c: ContractClip): string {
    return c.mediaLibraryId || c.path || c.filename || c.id || 'unknown';
}

/** Clamp a value to [0, 1]. */
function clamp01(v: number): number {
    return Math.max(0, Math.min(1, v));
}

/** Standard deviation of a numeric array. */
function stdDev(values: number[]): number {
    if (values.length <= 1) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sqDiffs = values.map(v => (v - mean) ** 2);
    return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
}

/** Mean of a numeric array (returns 0 for empty). */
function mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

// ─── Dimension scorers ────────────────────────────────────────────────────────

/**
 * 1. Pacing Variety — coefficient of variation (σ/μ) of clip durations.
 * Score 0 if all identical, 1 if CoV ≥ 0.6.
 */
function scorePacingVariety(clips: ContractClip[], notes: string[]): number {
    if (clips.length <= 1) {
        notes.push('Pacing: ≤1 clip, no variety measurable.');
        return 0;
    }
    const durations = clips.map(c => c.endFrame - c.startFrame);
    const mu = mean(durations);
    if (mu <= 0) {
        notes.push('Pacing: zero mean duration.');
        return 0;
    }
    const sigma = stdDev(durations);
    const cov = sigma / mu;
    const score = clamp01(cov / 0.6);
    notes.push(`Pacing: CoV=${cov.toFixed(3)} (σ=${sigma.toFixed(1)}, μ=${mu.toFixed(1)}) → ${score.toFixed(2)}.`);
    return score;
}

/**
 * 2. Visual Diversity — unique sources, reuse penalty, adjacency penalty.
 */
function scoreVisualDiversity(clips: ContractClip[], notes: string[]): number {
    if (clips.length === 0) {
        notes.push('Diversity: no clips.');
        return 0;
    }

    // Ratio of unique sources to total clips.
    const keys = clips.map(c => sourceKey(c));
    const unique = new Set(keys).size;
    const uniqueRatio = unique / clips.length;

    // Reuse penalty: penalize any source used > 3× more than average usage.
    const counts = new Map<string, number>();
    for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
    const avgUsage = clips.length / unique;
    let reusePenalty = 0;
    counts.forEach((n) => {
        if (n > avgUsage * 3) {
            // Each over-reused source adds a proportional penalty.
            reusePenalty += (n - avgUsage * 3) / clips.length;
        }
    });
    reusePenalty = clamp01(reusePenalty);

    // Adjacency penalty: fraction of adjacent pairs that share a source.
    let adjacentDups = 0;
    for (let i = 1; i < clips.length; i++) {
        if (keys[i] === keys[i - 1]) adjacentDups++;
    }
    const adjacencyPenalty = clips.length > 1
        ? adjacentDups / (clips.length - 1)
        : 0;

    // Combine: start from uniqueRatio, subtract penalties.
    const raw = uniqueRatio - reusePenalty * 0.3 - adjacencyPenalty * 0.4;
    const score = clamp01(raw);
    notes.push(
        `Diversity: ${unique}/${clips.length} unique (${(uniqueRatio * 100).toFixed(0)}%), ` +
        `reuse penalty=${reusePenalty.toFixed(2)}, adjacency dups=${adjacentDups} → ${score.toFixed(2)}.`
    );
    return score;
}

/**
 * 3. Sync Tightness — how well clip boundaries align with beat timestamps.
 * If no beats provided, return 0.7 (neutral).
 */
function scoreSyncTightness(
    clips: ContractClip[],
    fps: number,
    beatTimestamps: number[] | null | undefined,
    notes: string[],
): number {
    if (!beatTimestamps || beatTimestamps.length === 0) {
        notes.push('Sync: no beats provided, neutral 0.70.');
        return 0.7;
    }
    if (clips.length === 0) {
        notes.push('Sync: no clips.');
        return 0;
    }

    // Collect all clip boundary frames (deduplicated).
    const boundarySet = new Set<number>();
    for (const c of clips) {
        boundarySet.add(c.startFrame);
        boundarySet.add(c.endFrame);
    }
    const boundaries = Array.from(boundarySet).sort((a, b) => a - b);

    // Convert beat timestamps (seconds) to frames.
    const beatFrames = beatTimestamps.map(t => Math.round(t * fps));

    // For each beat, find nearest boundary distance (in frames).
    let totalDist = 0;
    for (const bf of beatFrames) {
        let minDist = Infinity;
        for (const b of boundaries) {
            const d = Math.abs(bf - b);
            if (d < minDist) minDist = d;
            // Boundaries are sorted — if we've gone past, stop early.
            if (b > bf && d > minDist) break;
        }
        totalDist += minDist;
    }

    // Normalize: a boundary exactly on the beat = 0 distance. We consider
    // 3 frames (~100ms at 30fps) the tolerance for a "tight" sync. Beyond
    // ~8 frames the alignment is loose.
    const avgDist = totalDist / beatFrames.length;
    // 0 frames → 1.0, 3 frames → ~0.75, 8+ frames → ~0.0
    const score = clamp01(1 - avgDist / 8);
    notes.push(`Sync: avg beat-to-boundary distance=${avgDist.toFixed(1)}f across ${beatFrames.length} beats → ${score.toFixed(2)}.`);
    return score;
}

/**
 * 4. Hook Strength — does the opening grab attention?
 * First 3 seconds: at least 2 cuts? First clip short enough?
 */
function scoreHookStrength(clips: ContractClip[], fps: number, notes: string[]): number {
    if (clips.length === 0) {
        notes.push('Hook: no clips.');
        return 0;
    }

    const hookWindowFrames = Math.round(3 * fps); // 3 seconds
    const maxFirstClipFrames = Math.round(4 * fps); // 4 seconds

    // Sort clips by start to find the opening sequence.
    const sorted = [...clips].sort((a, b) => a.startFrame - b.startFrame);
    const editStart = sorted[0].startFrame;

    // Count clips that start within the hook window.
    const hookClips = sorted.filter(c => c.startFrame < editStart + hookWindowFrames);
    const cutCount = hookClips.length; // number of cuts = number of clips (includes the first)

    // First clip duration.
    const firstDuration = sorted[0].endFrame - sorted[0].startFrame;

    let score = 0;

    // Cuts in hook: 1 clip = 0 cuts = 0.0, 2 clips = 1 cut = 0.5, 3+ = 1.0
    const cutScore = clamp01((cutCount - 1) / 2);
    score += cutScore * 0.5;

    // First clip length: ≤ 2s → full points, 2-4s → linear drop, > 4s → 0.
    const twoSecFrames = Math.round(2 * fps);
    if (firstDuration <= twoSecFrames) {
        score += 0.5;
    } else if (firstDuration < maxFirstClipFrames) {
        const ratio = (maxFirstClipFrames - firstDuration) / (maxFirstClipFrames - twoSecFrames);
        score += clamp01(ratio) * 0.5;
    }
    // else: firstDuration >= maxFirstClipFrames → 0 points for this component.

    score = clamp01(score);
    notes.push(
        `Hook: ${cutCount} clip(s) in first 3s (${cutCount - 1} cut(s)), ` +
        `first clip ${firstDuration}f (${(firstDuration / fps).toFixed(1)}s) → ${score.toFixed(2)}.`
    );
    return score;
}

/**
 * 5. Slideshow Risk (inverse) — low score if the edit looks like a slideshow.
 * High score if varied lengths, multi-track, speed ramps.
 */
function scoreSlideshowRisk(
    clips: ContractClip[],
    fps: number,
    maxTrack: number | undefined,
    notes: string[],
): number {
    if (clips.length === 0) {
        notes.push('Slideshow: no clips.');
        return 0;
    }

    let score = 0;
    const parts: string[] = [];

    // (a) All clips > 3s? → slideshow-y. Fraction of clips ≤ 3s boosts score.
    const threeSecFrames = Math.round(3 * fps);
    const shortClips = clips.filter(c => (c.endFrame - c.startFrame) <= threeSecFrames).length;
    const shortRatio = shortClips / clips.length;
    score += shortRatio * 0.25;
    parts.push(`short-clips=${(shortRatio * 100).toFixed(0)}%`);

    // (b) Duration variance — reuse CoV from pacing, but here we only need a
    //     boolean-ish signal: is there ANY variation?
    const durations = clips.map(c => c.endFrame - c.startFrame);
    const mu = mean(durations);
    if (mu > 0) {
        const cov = stdDev(durations) / mu;
        const varScore = clamp01(cov / 0.4); // lower bar than pacing variety
        score += varScore * 0.25;
        parts.push(`dur-var=${cov.toFixed(3)}`);
    }

    // (c) Multi-track usage — single track = slideshow-ish.
    const tracksUsed = new Set(clips.map(c => c.track)).size;
    const trackHint = maxTrack ?? Math.max(...clips.map(c => c.track));
    if (tracksUsed > 1) {
        const trackScore = clamp01((tracksUsed - 1) / Math.max(1, trackHint));
        score += trackScore * 0.25;
        parts.push(`tracks=${tracksUsed}`);
    } else {
        parts.push('tracks=1(slideshow)');
    }

    // (d) Speed variation — any clip with speed != 1.0 is a good sign.
    const speedVaried = clips.some(c => c.speed !== undefined && c.speed !== 1.0);
    if (speedVaried) {
        score += 0.25;
        parts.push('speed-ramp=yes');
    } else {
        parts.push('speed-ramp=no');
    }

    score = clamp01(score);
    notes.push(`Slideshow: ${parts.join(', ')} → ${score.toFixed(2)}.`);
    return score;
}

/**
 * 6. Narrative Flow — does pacing change across the timeline?
 * Divide into 4 quarters, compute average clip duration per quarter.
 * Flat → low score. Progression (accelerando, build-drop, wave) → high.
 */
function scoreNarrativeFlow(clips: ContractClip[], notes: string[]): number {
    if (clips.length < 4) {
        notes.push(`Narrative: only ${clips.length} clip(s), insufficient for flow analysis.`);
        // With few clips, give partial credit — at least there is something.
        return clips.length >= 2 ? 0.3 : 0;
    }

    const sorted = [...clips].sort((a, b) => a.startFrame - b.startFrame);
    const editStart = sorted[0].startFrame;
    const editEnd = sorted[sorted.length - 1].endFrame;
    const totalDur = editEnd - editStart;

    if (totalDur <= 0) {
        notes.push('Narrative: zero edit duration.');
        return 0;
    }

    // Divide into 4 quarters and bucket clips by their midpoint.
    const quarterDur = totalDur / 4;
    const quarters: number[][] = [[], [], [], []];
    for (const c of sorted) {
        const mid = (c.startFrame + c.endFrame) / 2;
        const qi = Math.min(3, Math.floor((mid - editStart) / quarterDur));
        quarters[qi].push(c.endFrame - c.startFrame);
    }

    // Average duration per quarter (skip empty quarters for robustness).
    const qMeans = quarters.map(q => (q.length > 0 ? mean(q) : NaN));
    const validMeans = qMeans.filter(v => !isNaN(v));

    if (validMeans.length <= 1) {
        notes.push('Narrative: clips clustered in single quarter.');
        return 0.2;
    }

    // Compute CoV of quarter means — higher variance across quarters means
    // stronger pacing shifts (accelerando, decelerando, wave, build-drop).
    const qMu = mean(validMeans);
    if (qMu <= 0) {
        notes.push('Narrative: zero quarter mean.');
        return 0;
    }
    const qSigma = stdDev(validMeans);
    const qCov = qSigma / qMu;

    // CoV of quarter means: 0 → flat → 0.0, ≥ 0.5 → strong variation → 1.0.
    const score = clamp01(qCov / 0.5);
    const qLabel = qMeans.map((m, i) => isNaN(m) ? `Q${i + 1}:∅` : `Q${i + 1}:${m.toFixed(0)}f`).join(' ');
    notes.push(`Narrative: ${qLabel} | CoV=${qCov.toFixed(3)} → ${score.toFixed(2)}.`);
    return score;
}

// ─── Verdict thresholds ───────────────────────────────────────────────────────

function verdictFromOverall(overall: number): 'strong' | 'acceptable' | 'revise' | 'fail' {
    if (overall >= 0.75) return 'strong';
    if (overall >= 0.55) return 'acceptable';
    if (overall >= 0.35) return 'revise';
    return 'fail';
}

// ══════════════════════════════════════════════════════════════════════════════
// scoreEdit — the main entry point
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Score a generated edit across 6 quality dimensions. Returns a structured
 * score with per-dimension values, an overall weighted average, a verdict
 * string, and debugging notes.
 *
 * The function is pure: it never mutates its input or touches the filesystem.
 * Deterministic given the same input.
 */
export function scoreEdit(input: EditScorerInput): EditScore {
    const { clips, fps, beatTimestamps, maxTrack } = input;
    const notes: string[] = [];

    // Sort clips by startFrame for consistent analysis.
    const sorted = [...clips].sort((a, b) => a.startFrame - b.startFrame);

    // Score each dimension.
    const pacingVariety   = scorePacingVariety(sorted, notes);
    const visualDiversity = scoreVisualDiversity(sorted, notes);
    const syncTightness   = scoreSyncTightness(sorted, fps, beatTimestamps, notes);
    const hookStrength    = scoreHookStrength(sorted, fps, notes);
    const slideshowRisk   = scoreSlideshowRisk(sorted, fps, maxTrack, notes);
    const narrativeFlow   = scoreNarrativeFlow(sorted, notes);

    // Weighted average.
    const overall = clamp01(
        pacingVariety   * W_PACING +
        visualDiversity * W_DIVERSITY +
        syncTightness   * W_SYNC +
        hookStrength    * W_HOOK +
        slideshowRisk   * W_SLIDESHOW +
        narrativeFlow   * W_NARRATIVE
    );

    const verdict = verdictFromOverall(overall);
    notes.push(`Overall: ${overall.toFixed(3)} → "${verdict}".`);

    return {
        pacingVariety,
        visualDiversity,
        syncTightness,
        hookStrength,
        slideshowRisk,
        narrativeFlow,
        overall,
        verdict,
        notes,
    };
}
