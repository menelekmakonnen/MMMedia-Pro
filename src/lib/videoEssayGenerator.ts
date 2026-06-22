/**
 * Video Essay Generator — Auto-assembles B-roll video under narration audio.
 * ════════════════════════════════════════════════════════════════════════════
 * Given a pre-recorded audio narration, this system:
 * 1. Segments the narration into topical sections (via pause detection)
 * 2. For each section, matches imported media clips based on keywords/tags
 * 3. Assembles a multi-track timeline: narration on A1, B-roll on V1
 * 4. Applies gentle transitions and Ken Burns on static images
 * 5. Auto-ducks B-roll audio under narration
 */

import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_FPS, secondsToFrames } from './time';
import type { Clip } from '../types';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface NarrationSegment {
    id: string;
    text: string;
    startTime: number;     // seconds
    endTime: number;       // seconds
    /** Key noun phrases / concepts extracted from text */
    keywords: string[];
    /** Speaker identifier (if multi-speaker) */
    speaker?: string;
}

export interface BRollMatch {
    fileIndex: number;
    score: number;          // 0-100 relevance score
    matchedKeywords: string[];
}

export interface VideoEssaySettings {
    fps: number;
    /** Minimum B-roll clip duration */
    minBRollDuration: number;    // seconds, default 3
    /** Maximum B-roll clip duration */
    maxBRollDuration: number;    // seconds, default 10
    /** Transition between B-roll clips */
    brollTransition: 'dissolve' | 'fade' | 'cut';
    /** Apply Ken Burns to static images */
    kenBurnsOnImages: boolean;
    /** Duck B-roll audio under narration */
    duckBRollAudio: boolean;
    /** Volume for B-roll audio when ducked (0-100) */
    duckedVolume: number;        // default 10
    /** Seed */
    seed: number;
}

export const DEFAULT_ESSAY_SETTINGS: VideoEssaySettings = {
    fps: 30,
    minBRollDuration: 3,
    maxBRollDuration: 10,
    brollTransition: 'dissolve',
    kenBurnsOnImages: true,
    duckBRollAudio: true,
    duckedVolume: 10,
    seed: 1,
};

export interface EssayReport {
    totalSegments: number;
    matchedSegments: number;
    unmatchedSegments: number;
    brollClipCount: number;
    coveragePercent: number;  // % of narration covered by B-roll
}

// ─── Stop words set ──────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'shall', 'would',
    'could', 'should', 'may', 'might', 'must', 'can', 'to', 'of', 'in',
    'for', 'on', 'with', 'at', 'by', 'from', 'up', 'about', 'into',
    'through', 'during', 'before', 'after', 'above', 'below', 'between',
    'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once',
    'here', 'there', 'when', 'where', 'why', 'how', 'all', 'both', 'each',
    'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only',
    'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but',
    'or', 'nor', 'yet', 'also', 'it', 'its', 'this', 'that', 'these',
    'those', 'he', 'she', 'they', 'we', 'you', 'i', 'me', 'my', 'his',
    'her', 'their', 'our', 'your',
]);

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

// ─── Segmentation ────────────────────────────────────────────────────────────

/**
 * Segment narration audio into topical sections based on pauses.
 * A pause > pauseThreshold seconds creates a section break.
 */
export function segmentNarration(
    transcription: Array<{ text: string; start: number; end: number }>,
    pauseThreshold: number = 1.5,
): NarrationSegment[] {
    if (transcription.length === 0) return [];

    const segments: NarrationSegment[] = [];
    let currentTexts: string[] = [];
    let segStart = transcription[0].start;
    let segEnd = transcription[0].end;

    for (let i = 0; i < transcription.length; i++) {
        const entry = transcription[i];
        currentTexts.push(entry.text);
        segEnd = entry.end;

        const isLast = i === transcription.length - 1;
        const gap = !isLast ? transcription[i + 1].start - entry.end : Infinity;

        if (gap > pauseThreshold || isLast) {
            const fullText = currentTexts.join(' ').trim();
            segments.push({
                id: uuidv4(),
                text: fullText,
                startTime: segStart,
                endTime: segEnd,
                keywords: extractKeywords(fullText),
            });
            currentTexts = [];
            if (!isLast) {
                segStart = transcription[i + 1].start;
            }
        }
    }

    return segments;
}

// ─── Keyword extraction ──────────────────────────────────────────────────────

/**
 * Extract key noun phrases from text (simple keyword extraction).
 * Removes stop words and returns unique significant words.
 */
export function extractKeywords(text: string): string[] {
    const words = text
        .toLowerCase()
        .replace(/[^a-z0-9\s'-]/g, '')
        .split(/\s+/)
        .map(w => w.replace(/^['-]+|['-]+$/g, ''))   // trim leading/trailing punctuation
        .filter(w => w.length > 3 && !STOP_WORDS.has(w));

    return Array.from(new Set(words));
}

// ─── B-roll matching ─────────────────────────────────────────────────────────

/**
 * Match B-roll clips to a narration segment based on keyword overlap.
 * Pool items should have tags/keywords for matching.
 */
export function matchBRoll(
    segment: NarrationSegment,
    pool: Array<{ filename: string; tags?: string[]; type?: string }>,
    usedIndices: Set<number>,
): BRollMatch[] {
    if (segment.keywords.length === 0 || pool.length === 0) return [];

    const segKw = new Set(segment.keywords.map(k => k.toLowerCase()));
    const matches: BRollMatch[] = [];

    for (let i = 0; i < pool.length; i++) {
        if (usedIndices.has(i)) continue;

        const item = pool[i];
        const matchedKeywords: string[] = [];
        let score = 0;

        // Score from tag overlaps (5 points each)
        if (item.tags) {
            for (const tag of item.tags) {
                const tagLower = tag.toLowerCase();
                if (segKw.has(tagLower)) {
                    matchedKeywords.push(tagLower);
                    score += 5;
                }
            }
        }

        // Score from filename word overlaps (3 points each)
        const filenameWords = item.filename
            .replace(/\.[^.]+$/, '')            // strip extension
            .replace(/[_\-.\s]+/g, ' ')         // normalize separators
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 3 && !STOP_WORDS.has(w));

        for (const fw of filenameWords) {
            if (segKw.has(fw)) {
                if (!matchedKeywords.includes(fw)) matchedKeywords.push(fw);
                score += 3;
            }
        }

        if (score > 0) {
            // Normalize score to 0-100 range (max ~50 raw → 100)
            const normalized = Math.min(100, Math.round((score / Math.max(1, segment.keywords.length)) * 20));
            matches.push({ fileIndex: i, score: normalized, matchedKeywords });
        }
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);
    return matches;
}

// ─── Core planner ────────────────────────────────────────────────────────────

/**
 * Plan a video essay timeline.
 * Returns clips for both narration (A1) and B-roll (V1).
 */
export function planVideoEssay(
    narrationPath: string,
    narrationDuration: number,  // seconds
    segments: NarrationSegment[],
    pool: Array<{ path: string; filename: string; type: string; sourceDurationFrames: number; tags?: string[]; orientation?: string }>,
    settings: VideoEssaySettings,
): { narrationClip: Clip; brollClips: Clip[]; report: EssayReport } {
    const fps = settings.fps || DEFAULT_FPS;
    const rand = rng(settings.seed || 1);

    // ── Narration clip on track 101 (A1) ─────────────────────────────────────
    const narrationDurationFrames = secondsToFrames(narrationDuration, fps);
    const narrationClip: Clip = {
        id: uuidv4(),
        type: 'audio',
        path: narrationPath,
        filename: narrationPath.split(/[\\/]/).pop() || 'narration',
        startFrame: 0,
        endFrame: narrationDurationFrames,
        sourceDurationFrames: narrationDurationFrames,
        trimStartFrame: 0,
        trimEndFrame: narrationDurationFrames,
        track: 101,
        speed: 1,
        volume: 100,
        reversed: false,
        locked: true,
        origin: 'auto',
    };

    // ── B-roll placement on track 1 (V1) ─────────────────────────────────────
    const videoPool = pool.filter(f => f.type === 'video' || f.type === 'image');
    const brollClips: Clip[] = [];
    const usedIndices = new Set<number>();
    let matchedSegments = 0;
    let totalBRollDuration = 0;

    for (const segment of segments) {
        const segDuration = segment.endTime - segment.startTime;
        if (segDuration <= 0) continue;

        // Find best B-roll match
        const matches = matchBRoll(
            segment,
            videoPool.map(p => ({ filename: p.filename, tags: p.tags, type: p.type })),
            usedIndices,
        );

        // Pick the best match, or fall back to round-robin from unused pool
        let fileIndex: number;
        let isMatched = false;

        if (matches.length > 0) {
            fileIndex = matches[0].fileIndex;
            isMatched = true;
        } else {
            // Round-robin fallback: pick first unused, or reuse if all used
            let fallbackIdx = -1;
            for (let i = 0; i < videoPool.length; i++) {
                if (!usedIndices.has(i)) { fallbackIdx = i; break; }
            }
            if (fallbackIdx < 0) {
                // All used — pick randomly
                fallbackIdx = Math.floor(rand() * videoPool.length);
            }
            fileIndex = fallbackIdx;
        }

        if (isMatched) matchedSegments++;
        usedIndices.add(fileIndex);

        const poolItem = videoPool[fileIndex];
        const isImage = poolItem.type === 'image';

        // Clamp B-roll duration to segment duration within min/max bounds
        const clipDuration = Math.max(
            settings.minBRollDuration,
            Math.min(settings.maxBRollDuration, segDuration),
        );
        const clipDurationFrames = secondsToFrames(clipDuration, fps);
        const startFrame = secondsToFrames(segment.startTime, fps);
        const endFrame = startFrame + clipDurationFrames;

        // Source trim: pick a window within the source media
        const srcFrames = poolItem.sourceDurationFrames || clipDurationFrames;
        const trimLen = Math.min(clipDurationFrames, Math.max(2, srcFrames));
        const maxTrimStart = Math.max(0, srcFrames - trimLen);
        const trimStart = Math.floor(rand() * (maxTrimStart + 1));
        const trimEnd = trimStart + trimLen;

        const clip: Clip = {
            id: uuidv4(),
            type: isImage ? 'image' : 'video',
            path: poolItem.path,
            filename: poolItem.filename,
            startFrame,
            endFrame,
            sourceDurationFrames: srcFrames,
            trimStartFrame: isImage ? 0 : trimStart,
            trimEndFrame: isImage ? clipDurationFrames : trimEnd,
            track: 1,
            speed: 1,
            volume: settings.duckBRollAudio ? settings.duckedVolume : 100,
            reversed: false,
            locked: false,
            origin: 'auto',
        };

        // Ken Burns on static images
        if (isImage && settings.kenBurnsOnImages) {
            clip.zoomStart = 100;
            clip.zoomEnd = 115;
            clip.zoomOrigin = 'center';
        }

        // Transition
        if (settings.brollTransition !== 'cut' && brollClips.length > 0) {
            clip.transition = {
                type: settings.brollTransition,
                durationFrames: secondsToFrames(0.5, fps),
            };
        }

        brollClips.push(clip);
        totalBRollDuration += clipDuration;
    }

    // ── Report ───────────────────────────────────────────────────────────────
    const coveragePercent = narrationDuration > 0
        ? Math.min(100, Math.round((totalBRollDuration / narrationDuration) * 100))
        : 0;

    const report: EssayReport = {
        totalSegments: segments.length,
        matchedSegments,
        unmatchedSegments: segments.length - matchedSegments,
        brollClipCount: brollClips.length,
        coveragePercent,
    };

    return { narrationClip, brollClips, report };
}
