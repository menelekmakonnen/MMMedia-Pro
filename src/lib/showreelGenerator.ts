/**
 * Showreel Generator — Assembles professional actor showreels.
 * ════════════════════════════════════════════════════════════════════════════
 * Given a pool of tagged media clips with face/performance metadata, this
 * system:
 * 1. Scores every candidate clip for "showreel worthiness" via a weighted
 *    formula (face visibility, shot closeness, emotion, dialogue, stability)
 * 2. Selects a diverse, engaging subset structured as Hook → Body → Closer
 * 3. Builds a frame-accurate Clip[] timeline with uuidv4 identifiers
 *
 * Deterministic: identical seed + inputs ⇒ identical showreel.
 */

import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_FPS, secondsToFrames } from './time';
import type { Clip } from '../types';

// ─── Domain Types ────────────────────────────────────────────────────────────

export type ShotType = 'ecu' | 'cu' | 'mcu' | 'ms' | 'mls' | 'ls' | 'els';
export type PerformanceGenre = 'drama' | 'comedy' | 'action' | 'thriller' | 'romance' | 'sci-fi' | 'horror' | 'documentary';
export type EmotionType = 'happy' | 'sad' | 'angry' | 'fearful' | 'surprised' | 'neutral' | 'intense' | 'contemplative';

/**
 * Metadata describing a candidate clip's showreel-relevant attributes.
 * Produced upstream by analysis / manual tagging.
 */
export interface ShowreelClipMeta {
    /** Index into the source media pool */
    fileIndex: number;
    /** 0-1 — fraction of frames where the target actor's face is visible */
    faceVisibility: number;
    /** Predominant shot framing */
    shotType: ShotType;
    /** Dominant emotion conveyed */
    emotion: EmotionType;
    /** Performance genre/tone */
    genre: PerformanceGenre;
    /** Whether the actor has dialogue in this clip */
    hasDialogue: boolean;
    /** 0-1 — camera / footage stability */
    stabilityScore: number;
    /** Computed overall worthiness (filled by computeWorthiness) */
    worthinessScore: number;
}

/**
 * User-facing settings for showreel assembly.
 */
export interface ShowreelSettings {
    /** Target total duration in seconds */
    targetDuration: number;
    /** Actor identifier for face-matching */
    targetActor: string;
    /** Minimum face visibility (0-1) to include a clip */
    minFaceVisibility: number;
    /** Restrict to these genres, or null for all */
    genreFilter: PerformanceGenre[] | null;
    /** Minimum clip duration in seconds */
    minClipDuration: number;
    /** Maximum clip duration in seconds */
    maxClipDuration: number;
    /** 0-1 — bias towards closer shot types in scoring */
    closeUpBias: number;
    /** Whether to prepend a nameplate/title card */
    includeNamePlate: boolean;
    /** Actor display name for nameplate */
    actorName: string;
    /** Optional contact/agent info for nameplate */
    contactInfo?: string;
    /** RNG seed for deterministic assembly */
    seed: number;
    /** Project frame rate */
    fps: number;
}

export const DEFAULT_SHOWREEL_SETTINGS: ShowreelSettings = {
    targetDuration: 90,
    targetActor: '',
    minFaceVisibility: 0.3,
    genreFilter: null,
    minClipDuration: 3,
    maxClipDuration: 8,
    closeUpBias: 0.6,
    includeNamePlate: true,
    actorName: '',
    seed: 1,
    fps: DEFAULT_FPS,
};

/** Planned entry ready for Clip building */
export interface ShowreelPlanEntry {
    meta: ShowreelClipMeta;
    durationSeconds: number;
    /** Structural role in the reel */
    role: 'hook' | 'body' | 'closer';
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

// ─── Shot-type closeness map ─────────────────────────────────────────────────

/** Maps each ShotType to a 0-1 closeness value (ECU = 1.0, ELS = 0.0) */
const SHOT_CLOSENESS: Record<ShotType, number> = {
    ecu: 1.0,
    cu:  0.85,
    mcu: 0.70,
    ms:  0.50,
    mls: 0.35,
    ls:  0.20,
    els: 0.0,
};

// ─── Emotion intensity map ───────────────────────────────────────────────────

/** Maps each EmotionType to a 0-1 intensity for scoring.
 *  Higher intensity emotions make more compelling showreel moments. */
const EMOTION_INTENSITY: Record<EmotionType, number> = {
    intense:        1.0,
    angry:          0.9,
    fearful:        0.8,
    surprised:      0.75,
    sad:            0.7,
    happy:          0.6,
    contemplative:  0.5,
    neutral:        0.2,
};

// ─── Worthiness Scoring ──────────────────────────────────────────────────────

/**
 * Compute a 0-1 "showreel worthiness" score for a clip.
 *
 * Weights:
 * - 40 % face visibility   (core requirement — actor must be on screen)
 * - 20 % shot closeness     (CU bias — casting directors prefer close-ups)
 * - 15 % emotion intensity  (range shows versatility)
 * - 15 % dialogue presence  (speaking roles are gold)
 * - 10 % stability          (clean footage looks professional)
 */
export function computeWorthiness(meta: ShowreelClipMeta, closeUpBias: number): number {
    const clampedBias = Math.max(0, Math.min(1, closeUpBias));

    // Face visibility (0-1, used directly)
    const faceScore = Math.max(0, Math.min(1, meta.faceVisibility));

    // Shot closeness: blend between raw closeness and CU-biased closeness
    const rawCloseness = SHOT_CLOSENESS[meta.shotType] ?? 0.5;
    // Bias raises close shots and lowers wide shots
    const biasedCloseness = rawCloseness * (1 - clampedBias) + Math.pow(rawCloseness, 0.5) * clampedBias;
    const shotScore = Math.max(0, Math.min(1, biasedCloseness));

    // Emotion intensity (0-1 from lookup)
    const emotionScore = EMOTION_INTENSITY[meta.emotion] ?? 0.2;

    // Dialogue is binary → 1 or 0
    const dialogueScore = meta.hasDialogue ? 1 : 0;

    // Stability (0-1, used directly)
    const stabilityScoreVal = Math.max(0, Math.min(1, meta.stabilityScore));

    // Weighted sum
    const worthiness =
        0.40 * faceScore +
        0.20 * shotScore +
        0.15 * emotionScore +
        0.15 * dialogueScore +
        0.10 * stabilityScoreVal;

    return Math.max(0, Math.min(1, worthiness));
}

// ─── Plan Assembly ───────────────────────────────────────────────────────────

/**
 * Plan a showreel as a structured Hook → Body → Closer sequence.
 *
 * Strategy:
 * - **Hook** (top ~10 %): The single highest-worthiness clip opens the reel.
 *   This is the "money shot" that grabs the casting director's attention.
 * - **Body** (~80 %): Remaining clips, ordered for genre diversity and
 *   emotion variety so the reel doesn't feel monotonous.
 * - **Closer** (last ~10 %): The second-best clip ends the reel on a high
 *   note, leaving a strong final impression.
 *
 * @param clipMetas  All candidate metadata (worthinessScore should be pre-filled)
 * @param pool       Source media pool (parallel to fileIndex)
 * @param settings   Showreel assembly settings
 * @returns Ordered plan entries with durations
 */
export function planShowreel(
    clipMetas: ShowreelClipMeta[],
    pool: Array<{ path: string; filename: string; type: string; sourceDurationFrames: number }>,
    settings: ShowreelSettings,
): ShowreelPlanEntry[] {
    const rand = rng(settings.seed || 1);
    const fps = settings.fps || DEFAULT_FPS;

    // ── 1. Filter candidates ─────────────────────────────────────────────────
    let candidates = clipMetas.filter(m => {
        // Face visibility gate
        if (m.faceVisibility < settings.minFaceVisibility) return false;
        // Genre gate
        if (settings.genreFilter && settings.genreFilter.length > 0) {
            if (!settings.genreFilter.includes(m.genre)) return false;
        }
        // Source must be long enough for min clip duration
        const poolItem = pool[m.fileIndex];
        if (!poolItem) return false;
        const srcSeconds = poolItem.sourceDurationFrames / fps;
        if (srcSeconds < settings.minClipDuration) return false;
        return true;
    });

    if (candidates.length === 0) return [];

    // ── 2. Score & rank ──────────────────────────────────────────────────────
    candidates = candidates.map(m => ({
        ...m,
        worthinessScore: computeWorthiness(m, settings.closeUpBias),
    }));
    candidates.sort((a, b) => b.worthinessScore - a.worthinessScore);

    // ── 3. Select clips to fit target duration ───────────────────────────────
    const targetSec = settings.targetDuration;
    const selected: ShowreelClipMeta[] = [];
    let totalDuration = 0;

    for (const c of candidates) {
        if (totalDuration >= targetSec) break;
        selected.push(c);
        // Tentative duration (clamped later)
        const poolItem = pool[c.fileIndex];
        const srcSeconds = poolItem.sourceDurationFrames / fps;
        const dur = Math.max(
            settings.minClipDuration,
            Math.min(settings.maxClipDuration, srcSeconds),
        );
        totalDuration += dur;
    }

    if (selected.length === 0) return [];

    // ── 4. Assign roles: Hook / Closer / Body ────────────────────────────────
    // Best clip → hook (index 0 after sort)
    const hook = selected[0];
    // Second-best → closer (or same as hook if only one clip)
    const closer = selected.length > 1 ? selected[1] : selected[0];

    // Remaining → body, ordered for diversity
    const bodyPool = selected.filter(c => c !== hook && c !== closer);
    const body = orderForDiversity(bodyPool, rand);

    // ── 5. Build plan entries ────────────────────────────────────────────────
    const plan: ShowreelPlanEntry[] = [];

    const addEntry = (meta: ShowreelClipMeta, role: 'hook' | 'body' | 'closer') => {
        const poolItem = pool[meta.fileIndex];
        const srcSeconds = poolItem.sourceDurationFrames / fps;
        const dur = Math.max(
            settings.minClipDuration,
            Math.min(settings.maxClipDuration, srcSeconds),
        );
        plan.push({ meta, durationSeconds: dur, role });
    };

    addEntry(hook, 'hook');
    for (const m of body) addEntry(m, 'body');
    if (selected.length > 1) addEntry(closer, 'closer');

    return plan;
}

// ─── Diversity ordering ──────────────────────────────────────────────────────

/**
 * Reorder body clips to maximise genre and emotion diversity.
 * Uses a greedy "most-different from previous" strategy with slight
 * randomisation to avoid predictable patterns.
 */
function orderForDiversity(
    clips: ShowreelClipMeta[],
    rand: () => number,
): ShowreelClipMeta[] {
    if (clips.length <= 1) return [...clips];

    const remaining = [...clips];
    const ordered: ShowreelClipMeta[] = [];

    // Start with a random clip from the top third
    const topThirdLen = Math.max(1, Math.floor(remaining.length / 3));
    const startIdx = Math.floor(rand() * topThirdLen);
    ordered.push(remaining.splice(startIdx, 1)[0]);

    while (remaining.length > 0) {
        const prev = ordered[ordered.length - 1];

        // Score each remaining clip by how different it is from the previous
        const scored = remaining.map((c, i) => ({
            clip: c,
            index: i,
            diversityScore: computeDiversity(prev, c),
        }));
        scored.sort((a, b) => b.diversityScore - a.diversityScore);

        // Pick from top 3 candidates with slight randomisation
        const pickRange = Math.min(3, scored.length);
        const pick = Math.floor(rand() * pickRange);
        const chosen = scored[pick];

        ordered.push(chosen.clip);
        remaining.splice(chosen.index, 1);
    }

    return ordered;
}

/**
 * Compute a 0-1 diversity score between two clips.
 * Different genre + different emotion = maximum diversity.
 */
function computeDiversity(a: ShowreelClipMeta, b: ShowreelClipMeta): number {
    let score = 0;
    // Genre difference
    if (a.genre !== b.genre) score += 0.5;
    // Emotion difference
    if (a.emotion !== b.emotion) score += 0.35;
    // Shot type difference
    if (a.shotType !== b.shotType) score += 0.15;
    return score;
}

// ─── Clip Building ───────────────────────────────────────────────────────────

/**
 * Convert a showreel plan into a renderable Clip[] timeline.
 *
 * Clips are placed sequentially on track 1 with frame-accurate timing.
 * Each clip receives a fresh uuidv4 identifier.
 *
 * @param plan     Ordered plan entries from planShowreel
 * @param pool     Source media pool (parallel to fileIndex in plan entries)
 * @param settings Showreel settings (fps, etc.)
 * @returns Clip array ready for timeline insertion
 */
export function buildShowreelClips(
    plan: ShowreelPlanEntry[],
    pool: Array<{ path: string; filename: string; type: string; sourceDurationFrames: number }>,
    settings: ShowreelSettings,
): Clip[] {
    const fps = settings.fps || DEFAULT_FPS;
    const rand = rng(settings.seed || 1);
    const clips: Clip[] = [];
    let timelineCursor = 0; // frames

    for (const entry of plan) {
        const poolItem = pool[entry.meta.fileIndex];
        if (!poolItem) continue;

        const clipDurationFrames = secondsToFrames(entry.durationSeconds, fps);
        const srcFrames = poolItem.sourceDurationFrames;

        // Pick a trim window within the source
        const trimLen = Math.min(clipDurationFrames, Math.max(2, srcFrames));
        const maxTrimStart = Math.max(0, srcFrames - trimLen);
        const trimStart = Math.floor(rand() * (maxTrimStart + 1));
        const trimEnd = trimStart + trimLen;

        const clip: Clip = {
            id: uuidv4(),
            type: poolItem.type === 'image' ? 'image' : 'video',
            path: poolItem.path,
            filename: poolItem.filename,
            startFrame: timelineCursor,
            endFrame: timelineCursor + clipDurationFrames,
            sourceDurationFrames: srcFrames,
            trimStartFrame: trimStart,
            trimEndFrame: trimEnd,
            track: 1,
            speed: 1,
            volume: 100,
            reversed: false,
            locked: false,
            origin: 'auto',
        };

        // Gentle dissolve between clips (skip for the first clip)
        if (clips.length > 0) {
            clip.transition = {
                type: 'dissolve',
                durationFrames: secondsToFrames(0.5, fps),
            };
        }

        clips.push(clip);
        timelineCursor += clipDurationFrames;
    }

    return clips;
}
