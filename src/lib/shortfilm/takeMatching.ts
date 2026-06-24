// ══════════════════════════════════════════════════════════════════════════════
// takeMatching.ts — Assign recorded takes to shotlist entries.
//
// On set, footage arrives as TAKES — clips slated like "S1-SH2-T3" or just named
// after a scene/shot/shot-type. `matchTakes(shotlist, takes)` resolves which takes
// belong to which shot and ranks them best-first using a deterministic priority:
//
//   1. SLATE / FILENAME identity — an explicit slate (or filename token) that names
//      the shot's scene+shot index, or the shot id, is the strongest signal.
//   2. SHOT-TYPE match — the take's coverage matching the shot's required coverage.
//   3. QUALITY — qualityScore (0..1, higher better) breaks remaining ties.
//
// A take may be a candidate for several shots; it is awarded to its single best
// shot (highest match score; ties broken by quality then duration fit) so footage
// is never double-counted. Shots with no take land in `unmatchedShots`.
//
// PURE: no React / IPC / FFmpeg. Deterministic. Returns plain data.
// ══════════════════════════════════════════════════════════════════════════════

import { normalizeShotType } from './storyboard';
import type { StoryboardShotType } from './storyboard';
import type { Shotlist, ShotlistEntry } from './shotlist';

export interface Take {
    id: string;
    path: string;
    filename: string;
    durationFrames: number;
    /** Explicit slate, e.g. "S1-SH2-T3" or "scene-1/shot-2". Optional. */
    slate?: string;
    /** Recorded coverage type (free-form; normalized internally). */
    shotType?: string;
    /** 0..1, higher is better. Defaults to 0.5 when absent. */
    qualityScore?: number;
}

/** How a take was bound to a shot, in descending strength. */
export type MatchReason = 'slate' | 'filename' | 'shot-type' | 'fallback';

export interface RankedTake {
    take: Take;
    /** Composite match score (higher is better). */
    score: number;
    reason: MatchReason;
    shotTypeMatch: boolean;
    qualityScore: number;
}

export interface ShotMatch {
    entry: ShotlistEntry;
    /** Best-first ranked takes for this shot (may be empty). */
    takes: RankedTake[];
    /** Convenience: the top-ranked take, if any. */
    best?: RankedTake;
}

export interface MatchResult {
    matches: ShotMatch[];
    /** Shots that received no take at all. */
    unmatchedShots: ShotlistEntry[];
    /** Takes not awarded to any shot. */
    unusedTakes: Take[];
}

// ─── Slate / filename parsing ────────────────────────────────────────────────

/** Pull {scene, shot, take} ordinals from a slate/filename string, if present. */
function parseSlateOrdinals(s: string): { scene?: number; shot?: number; take?: number } {
    const lower = s.toLowerCase();
    const out: { scene?: number; shot?: number; take?: number } = {};
    // S1, SC1, scene1, scene-1
    let m = lower.match(/s(?:c|cene)?[\s_-]?(\d+)/);
    if (m) out.scene = parseInt(m[1], 10);
    // SH2, shot2, shot-2
    m = lower.match(/sh(?:ot)?[\s_-]?(\d+)/);
    if (m) out.shot = parseInt(m[1], 10);
    // T3, take3, take-3
    m = lower.match(/t(?:ake)?[\s_-]?(\d+)/);
    if (m) out.take = parseInt(m[1], 10);
    return out;
}

/** Score how strongly a take's identity strings name a given shot entry. */
function identityMatch(take: Take, entry: ShotlistEntry): { reason: MatchReason; strength: number } | null {
    const slateStr = take.slate ?? '';
    const fileStr = take.filename ?? '';

    // Direct shot-id token (strongest).
    const idToken = entry.shotId.toLowerCase();
    if (idToken && (slateStr.toLowerCase().includes(idToken) || fileStr.toLowerCase().includes(idToken))) {
        return { reason: slateStr ? 'slate' : 'filename', strength: 1 };
    }

    // Ordinal slate (1-based on set; entries are 0-based) from slate first, then filename.
    const wantScene = entry.sceneIndex + 1;
    const wantShot = entry.shotIndex + 1;
    for (const [src, reason] of [[slateStr, 'slate'], [fileStr, 'filename']] as const) {
        if (!src) continue;
        const ord = parseSlateOrdinals(src);
        if (ord.scene === wantScene && ord.shot === wantShot) return { reason, strength: 0.95 };
        // Filename may carry only a global shot number; match against global index+1.
        if (ord.scene == null && ord.shot === entry.index + 1) return { reason, strength: 0.6 };
    }
    return null;
}

// ─── Scoring weights (priority order is encoded here) ─────────────────────────

const W_IDENTITY = 100; // slate/filename identity dominates
const W_SHOT_TYPE = 10;  // shot-type agreement next
const W_QUALITY = 1;    // quality (0..1) is the finest tie-breaker

function shotTypeOf(take: Take): StoryboardShotType | null {
    return take.shotType ? normalizeShotType(take.shotType) : null;
}

function scoreCandidate(take: Take, entry: ShotlistEntry): RankedTake {
    const id = identityMatch(take, entry);
    const tType = shotTypeOf(take);
    const typeMatch = tType != null && tType === entry.requiredCoverage;
    const q = take.qualityScore != null ? Math.max(0, Math.min(1, take.qualityScore)) : 0.5;

    let score = 0;
    let reason: MatchReason = 'fallback';
    if (id) { score += W_IDENTITY * id.strength; reason = id.reason; }
    if (typeMatch) { score += W_SHOT_TYPE; if (!id) reason = 'shot-type'; }
    score += W_QUALITY * q;

    return { take, score, reason, shotTypeMatch: typeMatch, qualityScore: q };
}

/**
 * Match takes to a shotlist. Each take is awarded to the single shot it scores
 * highest for (so it is never reused); per shot, candidate takes are ranked
 * best-first. Shots with no candidates are reported in `unmatchedShots`.
 */
export function matchTakes(shotlist: Shotlist, takes: Take[]): MatchResult {
    const entries = shotlist.entries;

    // For each take, find its best shot (the one it scores highest for).
    // A take only becomes a real candidate when it has *some* positive signal:
    // an identity hit OR a shot-type agreement. Pure quality alone is not enough
    // to bind a stray take to an arbitrary shot.
    const awardedTo = new Map<string, number>(); // takeId -> entry index
    const candidatesByEntry = new Map<number, RankedTake[]>();

    for (const take of takes) {
        let bestIdx = -1;
        let bestRanked: RankedTake | null = null;
        for (const entry of entries) {
            const ranked = scoreCandidate(take, entry);
            const hasSignal = ranked.reason !== 'fallback';
            if (!hasSignal) continue;
            if (
                !bestRanked ||
                ranked.score > bestRanked.score ||
                (ranked.score === bestRanked.score && betterFit(ranked, entry, bestRanked, entries[bestIdx]))
            ) {
                bestRanked = ranked;
                bestIdx = entry.index;
            }
        }
        if (bestRanked && bestIdx >= 0) {
            awardedTo.set(take.id, bestIdx);
            const list = candidatesByEntry.get(bestIdx) ?? [];
            list.push(bestRanked);
            candidatesByEntry.set(bestIdx, list);
        }
    }

    const matches: ShotMatch[] = [];
    const unmatchedShots: ShotlistEntry[] = [];

    for (const entry of entries) {
        const list = (candidatesByEntry.get(entry.index) ?? []).slice();
        // Best-first: score desc, then quality desc, then closest duration fit, then id.
        list.sort((a, b) =>
            b.score - a.score ||
            b.qualityScore - a.qualityScore ||
            durationFit(a.take, entry) - durationFit(b.take, entry) ||
            a.take.id.localeCompare(b.take.id),
        );
        if (list.length === 0) {
            unmatchedShots.push(entry);
            matches.push({ entry, takes: [] });
        } else {
            matches.push({ entry, takes: list, best: list[0] });
        }
    }

    const unusedTakes = takes.filter(t => !awardedTo.has(t.id));
    return { matches, unmatchedShots, unusedTakes };
}

/** Lower is a better duration fit: how far a take falls short of the target. */
function durationFit(take: Take, entry: ShotlistEntry): number {
    const deficit = entry.targetFrames - take.durationFrames; // positive => too short
    return deficit > 0 ? deficit : Math.abs(deficit) * 0.1; // overshoot lightly penalized
}

/** Tie-break between two equal-score awards: prefer better quality then duration fit. */
function betterFit(a: RankedTake, ea: ShotlistEntry, b: RankedTake, eb: ShotlistEntry): boolean {
    if (a.qualityScore !== b.qualityScore) return a.qualityScore > b.qualityScore;
    return durationFit(a.take, ea) < durationFit(b.take, eb);
}
