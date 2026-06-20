/**
 * Music Video Generator — structure-driven, frame-accurate edit planner
 * ════════════════════════════════════════════════════════════════════════════
 * Sibling of the Trailer Generator. Where the trailer targets a short hype cut,
 * the music-video engine edits the WHOLE song: it reads the detected song
 * structure (intro / verse / buildup / drop / chorus / breakdown / bridge /
 * outro) from the Beat Intelligence Engine and gives each section its own pacing,
 * anchoring every cut to a downbeat (or beat). It auto-assembles a fast-cut intro
 * (pulling shots of people who appear later in the video) and a shrink-to-corner
 * outro with a credit-safe zone and a BTS slot.
 *
 * The core `planMusicVideo` is PURE and frame-accurate (no uuid / store / DOM),
 * so it is fully unit-testable. `buildMusicVideoClips` is the thin adapter that
 * turns the plan into real Clip objects.
 */

import type { SegmentType } from './audioAnalysisCore';

// ─── Pool / analysis shapes (minimal, decoupled) ─────────────────────────────

export interface MvPoolItem {
    /** Total usable source length in frames. */
    sourceDurationFrames: number;
    type?: 'video' | 'audio' | 'image';
    /** Tags used by intro person-pull and tag-targeted selection. */
    tags?: { people?: string[]; scene?: string; location?: string; color?: string };
}

export interface MvSegment { type: SegmentType; start: number; end: number; }
export interface MvAnalysis {
    duration: number;        // seconds
    bpm: number;
    gridBeats: number[];     // seconds
    downbeats: number[];     // seconds
    beatsPerBar?: 3 | 4;
    segments: MvSegment[];
}

export type EffectIntensity = 'none' | 'subtle' | 'medium' | 'heavy';

export interface MvPacingProfile {
    /** Min/max shot length in SECONDS for this section. */
    minShotS: number;
    maxShotS: number;
    /** Base playback speed for the section. */
    speed: number;
    /** Whether the section favors rapid cutting. */
    fastCut: boolean;
    /** Suggested effect intensity for the section. */
    effect: EffectIntensity;
}

/** Per-section pacing — the editorial "feel" of each part of the song. */
export const MV_SECTION_PACING: Record<SegmentType, MvPacingProfile> = {
    intro:     { minShotS: 0.25, maxShotS: 0.6,  speed: 1.0, fastCut: true,  effect: 'subtle' },
    verse:     { minShotS: 0.9,  maxShotS: 2.0,  speed: 1.0, fastCut: false, effect: 'subtle' },
    buildup:   { minShotS: 0.35, maxShotS: 0.9,  speed: 1.05, fastCut: true, effect: 'medium' },
    drop:      { minShotS: 0.2,  maxShotS: 0.5,  speed: 1.1, fastCut: true,  effect: 'heavy' },
    chorus:    { minShotS: 0.4,  maxShotS: 1.0,  speed: 1.0, fastCut: true,  effect: 'medium' },
    breakdown: { minShotS: 1.2,  maxShotS: 3.0,  speed: 0.85, fastCut: false, effect: 'subtle' },
    bridge:    { minShotS: 1.0,  maxShotS: 2.2,  speed: 0.9, fastCut: false, effect: 'subtle' },
    outro:     { minShotS: 1.5,  maxShotS: 3.5,  speed: 0.8, fastCut: false, effect: 'none' },
};

export interface MusicVideoSettings {
    fps: number;
    /** Anchor cuts to downbeats (musical) or every beat (denser). */
    beatAnchor: 'downbeat' | 'beat';
    /** Build a fast-cut intro on the detected intro section. */
    introEnabled: boolean;
    /** Build a shrink-to-corner outro on the detected outro section. */
    outroEnabled: boolean;
    /** Reserve the final shot as a behind-the-scenes slot. */
    btsSlot: boolean;
    /** Outro corner scale (e.g. 0.4 = 40%) and credit-safe side. */
    outroCornerScale: number;
    /** Random seed for deterministic selection. */
    seed: number;
}

export const DEFAULT_MV_SETTINGS: MusicVideoSettings = {
    fps: 30,
    beatAnchor: 'downbeat',
    introEnabled: true,
    outroEnabled: true,
    btsSlot: true,
    outroCornerScale: 0.4,
    seed: 1,
};

export type ClipRole = 'main' | 'broll' | 'credit' | 'bts';

export interface ClipPlan {
    /** Index into the pool array. */
    fileIndex: number;
    /** Timeline placement (frames). */
    startFrame: number;
    endFrame: number;
    /** Source trim (frames). */
    trimStartFrame: number;
    trimEndFrame: number;
    speed: number;
    section: SegmentType;
    role: ClipRole;
    effect: EffectIntensity;
    /** Shrink-to-corner outro motion. */
    zoomStart?: number;
    zoomEnd?: number;
    zoomOrigin?: 'center' | 'top' | 'bottom' | 'left' | 'right';
}

export interface MvReport {
    sectionCounts: Record<string, number>;
    introClips: number;
    outroClips: number;
    totalClips: number;
    anchoredTo: 'downbeat' | 'beat';
}

// ─── Deterministic RNG (mulberry32) ──────────────────────────────────────────
function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ─── Tag helpers (intro person-pull) ─────────────────────────────────────────

/** Set of people who appear anywhere in the pool (used to seed the intro). */
export function peopleInPool(pool: MvPoolItem[]): string[] {
    const set = new Set<string>();
    for (const f of pool) for (const p of f.tags?.people ?? []) set.add(p);
    return [...set];
}

/** First pool index featuring each given person (one introducing shot each). */
export function introShotsForPeople(pool: MvPoolItem[], people: string[]): number[] {
    const out: number[] = [];
    for (const person of people) {
        const idx = pool.findIndex(f => (f.tags?.people ?? []).includes(person));
        if (idx >= 0 && !out.includes(idx)) out.push(idx);
    }
    return out;
}

// ─── Core planner ────────────────────────────────────────────────────────────

function secToFrame(sec: number, fps: number): number { return Math.round(sec * fps); }

/** Pick a source trim window of `lengthFrames` for a file, varied by RNG. */
function pickTrim(srcFrames: number, lengthFrames: number, rand: () => number): [number, number] {
    const len = Math.min(lengthFrames, Math.max(2, srcFrames));
    const maxStart = Math.max(0, srcFrames - len);
    const start = Math.floor(rand() * (maxStart + 1));
    return [start, start + len];
}

/**
 * Plan a full music-video edit. Pure + frame-accurate.
 */
export function planMusicVideo(
    pool: MvPoolItem[],
    analysis: MvAnalysis,
    settings: MusicVideoSettings = DEFAULT_MV_SETTINGS,
): { plan: ClipPlan[]; report: MvReport } {
    const fps = settings.fps;
    const videoPool = pool.filter(f => f.type !== 'audio');
    const plan: ClipPlan[] = [];
    const sectionCounts: Record<string, number> = {};
    if (videoPool.length === 0 || analysis.segments.length === 0) {
        return { plan, report: { sectionCounts, introClips: 0, outroClips: 0, totalClips: 0, anchoredTo: settings.beatAnchor } };
    }
    const poolIndexOf = (item: MvPoolItem) => pool.indexOf(item);

    // Anchor grid: downbeats (musical) or every beat (denser).
    const usingDownbeats = settings.beatAnchor === 'downbeat' && analysis.downbeats && analysis.downbeats.length > 1;
    const anchors = (usingDownbeats ? analysis.downbeats : analysis.gridBeats).slice().sort((a, b) => a - b);
    const rand = rng(settings.seed || 1);

    // Pre-compute the intro person-pull order (shots that introduce each person).
    const introOrder = settings.introEnabled
        ? introShotsForPeople(pool, peopleInPool(pool))
        : [];
    let introCursor = 0;
    let poolCursor = 0;
    const nextPoolIndex = (): number => {
        const item = videoPool[poolCursor % videoPool.length];
        poolCursor++;
        return poolIndexOf(item);
    };

    let introClips = 0, outroClips = 0;

    for (const seg of analysis.segments) {
        const pacing = MV_SECTION_PACING[seg.type] ?? MV_SECTION_PACING.verse;
        const isIntro = seg.type === 'intro' && settings.introEnabled;
        const isOutro = seg.type === 'outro' && settings.outroEnabled;

        // Anchors inside this section.
        const segAnchors = anchors.filter(t => t >= seg.start - 1e-6 && t < seg.end - 1e-6);
        // Always have at least the section's start as an anchor.
        if (segAnchors.length === 0 || segAnchors[0] > seg.start + 1e-6) segAnchors.unshift(seg.start);

        let lastCutEnd = -Infinity;
        for (let i = 0; i < segAnchors.length; i++) {
            const t = segAnchors[i];
            const nextT = i + 1 < segAnchors.length ? segAnchors[i + 1] : seg.end;
            // Enforce per-section minimum shot length (skip anchors that are too soon).
            if (t - lastCutEnd < pacing.minShotS - 1e-6 && plan.length > 0) continue;
            const rawLenS = Math.min(nextT - t, pacing.maxShotS);
            if (rawLenS <= 0) continue;
            const startFrame = secToFrame(t, fps);
            const endFrame = secToFrame(Math.min(t + rawLenS, seg.end), fps);
            if (endFrame - startFrame < 2) continue;

            // File selection: intro pulls "people who appear later"; else round-robin.
            let fileIndex: number;
            let role: ClipRole = 'main';
            if (isIntro && introCursor < introOrder.length) {
                fileIndex = introOrder[introCursor++];
                role = 'broll';
            } else {
                fileIndex = nextPoolIndex();
                if (isIntro) role = 'broll';
            }

            const speed = pacing.speed;
            const timelineLen = endFrame - startFrame;
            const sourceNeeded = Math.max(2, Math.round(timelineLen * speed));
            const [trimStart, trimEnd] = pickTrim(pool[fileIndex].sourceDurationFrames || sourceNeeded, sourceNeeded, rand);

            const cp: ClipPlan = {
                fileIndex, startFrame, endFrame,
                trimStartFrame: trimStart, trimEndFrame: trimEnd,
                speed, section: seg.type, role, effect: pacing.effect,
            };

            // Shrink-to-corner outro: progressively pull the picture into a corner,
            // leaving a credit-safe zone. Last clip becomes the BTS/credit slot.
            if (isOutro) {
                cp.role = 'main';
                const scalePct = Math.round(Math.max(0.2, Math.min(0.9, settings.outroCornerScale)) * 100);
                cp.zoomStart = 100;
                cp.zoomEnd = scalePct;     // shrink
                cp.zoomOrigin = 'top';     // keep lower-third clear for rolling credits
                outroClips++;
            }
            if (isIntro) introClips++;

            plan.push(cp);
            sectionCounts[seg.type] = (sectionCounts[seg.type] || 0) + 1;
            lastCutEnd = t;
        }
    }

    // Reserve a BTS slot as the final clip (tag 'bts' if available, else last shot).
    if (settings.btsSlot && plan.length > 0) {
        const btsIdx = pool.findIndex(f => f.tags?.scene === 'bts' || f.tags?.scene === 'behind-the-scenes');
        const last = plan[plan.length - 1];
        last.role = 'bts';
        if (btsIdx >= 0) {
            last.fileIndex = btsIdx;
            const len = last.endFrame - last.startFrame;
            const need = Math.max(2, Math.round(len * last.speed));
            const [ts, te] = pickTrim(pool[btsIdx].sourceDurationFrames || need, need, rand);
            last.trimStartFrame = ts; last.trimEndFrame = te;
        }
    }

    return {
        plan,
        report: {
            sectionCounts,
            introClips,
            outroClips,
            totalClips: plan.length,
            anchoredTo: usingDownbeats ? 'downbeat' : 'beat',
        },
    };
}
