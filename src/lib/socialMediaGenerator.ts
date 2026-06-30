// ══════════════════════════════════════════════════════════════════════════════
// socialMediaGenerator.ts — Dedicated Social Media Edit Generator
//
// Produces structurally distinct timelines for 5 viral edit styles instead of
// falling through to the trailer generator with settings overrides. Each style
// has its own generation algorithm that builds a purpose-built Clip[] timeline.
//
// Styles:
//   1. velocity-edit   — slow-mo/rapid speed ramp alternation
//   2. beat-sync-cut   — every cut on a beat timestamp
//   3. aura-sigma      — hero slow-mo + hard cut montage
//   4. reframe-montage — rapid zoom-reframe cycle through all sources
//   5. quote-list      — steady B-roll pacing for text overlay slots
//
// PURE & DETERMINISTIC. No React, no IPC, no filesystem, no FFmpeg imports.
// Uses mulberry32 PRNG for seeded randomness and uuid v4 for clip IDs.
// ══════════════════════════════════════════════════════════════════════════════

import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_FPS, secondsToFrames } from './time';
import type { Clip } from '../types';
import type { MediaFile } from '../store/mediaStore';

// ─── Types ───────────────────────────────────────────────────────────────────

export type SocialStyle =
    | 'velocity-edit'
    | 'beat-sync-cut'
    | 'aura-sigma'
    | 'reframe-montage'
    | 'quote-list';

export interface SocialMediaSettings {
    style: SocialStyle;
    /** Target total duration in seconds. */
    targetDuration: number;
    fps?: number;
    seed?: string | number;
    /** Beat timestamps in seconds (for beat-sync-cut). */
    beatTimestamps?: number[] | null;
    /** For quote-list style: text items to display. */
    textItems?: string[];
    /** Hook duration in seconds (first attention-grab). */
    hookDuration?: number;
    /** Whether to create a loop-friendly ending. */
    loopFriendly?: boolean;
}

export interface SocialMediaResult {
    clips: Clip[];
    style: SocialStyle;
    report: string;
}

// ─── PRNG (mulberry32) ───────────────────────────────────────────────────────

function mulberry32(a: number): () => number {
    return function () {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function seedToInt(seed?: number | string): number {
    if (typeof seed === 'number') return (seed >>> 0) || 1;
    const s = String(seed ?? '1');
    let h = 7;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (Math.abs(h) >>> 0) || 1;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Coverage-first pool selection: cycle through all sources before repeating. */
function pickSource(
    pool: MediaFile[],
    rng: () => number,
    usedSources: Set<string>,
): MediaFile {
    // Find sources not yet used in this cycle
    const unused = pool.filter(m => !usedSources.has(m.id));

    if (unused.length > 0) {
        const idx = Math.floor(rng() * unused.length);
        const picked = unused[idx];
        usedSources.add(picked.id);
        return picked;
    }

    // All sources used — reset cycle and pick fresh
    usedSources.clear();
    const idx = Math.floor(rng() * pool.length);
    const picked = pool[idx];
    usedSources.add(picked.id);
    return picked;
}

/** Pick a random trim window within a source that fits the requested duration. */
function getTrimWindow(
    source: MediaFile,
    durationFrames: number,
    rng: () => number,
    fps: number,
): { trimStartFrame: number; trimEndFrame: number } {
    const sourceTotalFrames = secondsToFrames(source.duration, fps);
    const clampedDuration = Math.min(durationFrames, Math.max(1, sourceTotalFrames));

    const maxStart = Math.max(0, sourceTotalFrames - clampedDuration);
    const trimStart = Math.floor(rng() * (maxStart + 1));
    const trimEnd = trimStart + clampedDuration;

    return { trimStartFrame: trimStart, trimEndFrame: trimEnd };
}

/** Linearly interpolate between two values. */
function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/** Build a base clip with common fields populated. */
function makeBaseClip(
    source: MediaFile,
    startFrame: number,
    endFrame: number,
    trimStartFrame: number,
    trimEndFrame: number,
    fps: number,
    speed: number = 1,
): Clip {
    return {
        id: uuidv4(),
        type: 'video',
        path: source.path,
        filename: source.filename,
        startFrame,
        endFrame,
        sourceDurationFrames: secondsToFrames(source.duration, fps),
        trimStartFrame,
        trimEndFrame,
        track: 0,
        speed,
        volume: 100,
        reversed: false,
        locked: false,
        origin: 'auto',
        mediaLibraryId: source.id,
    };
}

// ─── Style Generators ────────────────────────────────────────────────────────

/**
 * 1. VELOCITY EDIT
 * [HOOK 0.3-0.5s] → [SLOW-MO 1.5s speed:0.4] → [RAPID 0.2-0.4s each speed:1.5-2.5] → repeat
 */
function generateVelocityEdit(
    pool: MediaFile[],
    settings: SocialMediaSettings,
    rng: () => number,
    fps: number,
): Clip[] {
    const clips: Clip[] = [];
    const totalFrames = secondsToFrames(settings.targetDuration, fps);
    const usedSources: Set<string> = new Set();
    let cursor = 0;

    // ── Hook clip ──
    const hookSec = settings.hookDuration ?? lerp(0.3, 0.5, rng());
    const hookFrames = Math.max(1, secondsToFrames(hookSec, fps));
    if (cursor + hookFrames <= totalFrames) {
        const src = pickSource(pool, rng, usedSources);
        const trim = getTrimWindow(src, hookFrames, rng, fps);
        const clip = makeBaseClip(src, cursor, cursor + hookFrames, trim.trimStartFrame, trim.trimEndFrame, fps, 1.0);
        clip.speedCurvePreset = 'ramp-up';
        clip.transition = { type: 'whip', durationFrames: Math.min(6, hookFrames) };
        clips.push(clip);
        cursor += hookFrames;
    }

    // ── Alternating slow-mo / rapid-fire ──
    let phase: 'slow' | 'rapid' = 'slow';
    while (cursor < totalFrames) {
        if (phase === 'slow') {
            // Slow-mo hero moment: 1.5s at speed 0.4
            const slowSec = 1.5;
            const slowFrames = Math.min(secondsToFrames(slowSec, fps), totalFrames - cursor);
            if (slowFrames <= 0) break;

            const src = pickSource(pool, rng, usedSources);
            // Source needs more frames at 0.4x speed (clip plays slower)
            const sourceNeeded = Math.ceil(slowFrames * 0.4);
            const trim = getTrimWindow(src, sourceNeeded, rng, fps);
            const clip = makeBaseClip(src, cursor, cursor + slowFrames, trim.trimStartFrame, trim.trimEndFrame, fps, 0.4);
            clip.speedCurvePreset = 'ramp-up';
            clip.transition = { type: 'whip', durationFrames: Math.min(6, slowFrames) };
            clips.push(clip);
            cursor += slowFrames;
            phase = 'rapid';
        } else {
            // Rapid-fire burst: 3-5 clips, 0.2-0.4s each, speed 1.5-2.5
            const burstCount = 3 + Math.floor(rng() * 3);
            for (let i = 0; i < burstCount && cursor < totalFrames; i++) {
                const rapidSec = lerp(0.2, 0.4, rng());
                const rapidFrames = Math.min(
                    Math.max(1, secondsToFrames(rapidSec, fps)),
                    totalFrames - cursor,
                );
                if (rapidFrames <= 0) break;

                const speed = lerp(1.5, 2.5, rng());
                const src = pickSource(pool, rng, usedSources);
                const sourceNeeded = Math.ceil(rapidFrames * speed);
                const trim = getTrimWindow(src, sourceNeeded, rng, fps);
                const clip = makeBaseClip(src, cursor, cursor + rapidFrames, trim.trimStartFrame, trim.trimEndFrame, fps, speed);
                clip.speedCurvePreset = 'ramp-down';
                // Whip transition between rapid clips
                if (i < burstCount - 1) {
                    clip.transition = { type: 'whip', durationFrames: Math.min(4, rapidFrames) };
                }
                clips.push(clip);
                cursor += rapidFrames;
            }
            phase = 'slow';
        }
    }

    return clips;
}

/**
 * 2. BEAT SYNC CUT
 * Every cut lands exactly on a beat timestamp. Flash on every 4th, chromatic on every 8th.
 */
function generateBeatSyncCut(
    pool: MediaFile[],
    settings: SocialMediaSettings,
    rng: () => number,
    fps: number,
): Clip[] {
    const clips: Clip[] = [];
    const totalFrames = secondsToFrames(settings.targetDuration, fps);
    const usedSources: Set<string> = new Set();

    // Resolve beat timestamps — use provided or generate a 120 BPM grid
    let beats: number[];
    if (settings.beatTimestamps && settings.beatTimestamps.length >= 2) {
        beats = [...settings.beatTimestamps].sort((a, b) => a - b);
    } else {
        // 120 BPM = 0.5s per beat
        const interval = 0.5;
        beats = [];
        for (let t = interval; t < settings.targetDuration; t += interval) {
            beats.push(t);
        }
    }

    // Build clips between consecutive beats
    let prevFrame = 0;
    for (let i = 0; i < beats.length; i++) {
        const beatFrame = secondsToFrames(beats[i], fps);
        if (beatFrame <= prevFrame || beatFrame > totalFrames) continue;

        const clipFrames = beatFrame - prevFrame;
        const src = pickSource(pool, rng, usedSources);
        const trim = getTrimWindow(src, clipFrames, rng, fps);
        const clip = makeBaseClip(src, prevFrame, beatFrame, trim.trimStartFrame, trim.trimEndFrame, fps, 1.0);

        // Beat index (1-based for modulo checks)
        const beatIdx = i + 1;

        // Flash on every 4th beat (downbeat proxy)
        if (beatIdx % 4 === 0) {
            clip.vibrationFlash = {
                intensity: 80,
                durationFrames: Math.min(8, clipFrames),
            };
        }

        // Chromatic aberration spike on every 8th beat (drop proxy)
        if (beatIdx % 8 === 0) {
            clip.chromaticAberration = 12;
        }

        // Hard cuts only — no transitions
        clips.push(clip);
        prevFrame = beatFrame;
    }

    // Final segment to fill remaining duration
    if (prevFrame < totalFrames) {
        const src = pickSource(pool, rng, usedSources);
        const remaining = totalFrames - prevFrame;
        const trim = getTrimWindow(src, remaining, rng, fps);
        const clip = makeBaseClip(src, prevFrame, totalFrames, trim.trimStartFrame, trim.trimEndFrame, fps, 1.0);
        clips.push(clip);
    }

    return clips;
}

/**
 * 3. AURA / SIGMA
 * [HERO slow-mo 40% duration speed:0.5] → [HARD CUT montage 0.8-1.5s each]
 */
function generateAuraSigma(
    pool: MediaFile[],
    settings: SocialMediaSettings,
    rng: () => number,
    fps: number,
): Clip[] {
    const clips: Clip[] = [];
    const totalFrames = secondsToFrames(settings.targetDuration, fps);
    const usedSources: Set<string> = new Set();
    let cursor = 0;

    // Heavy aura color grading: high contrast, desaturated, cool temperature
    const auraGrading = {
        temperature: -40,
        tint: 0,
        exposure: 0.1,
        contrast: 1.6,
        highlights: -20,
        shadows: 30,
        saturation: 0.5,
        vibrance: 0.6,
    };

    // ── Hero clip: 40% of total duration at 0.5x speed ──
    const heroFrames = Math.max(1, Math.floor(totalFrames * 0.4));
    const heroSrc = pickSource(pool, rng, usedSources);
    const heroSourceNeeded = Math.ceil(heroFrames * 0.5);
    const heroTrim = getTrimWindow(heroSrc, heroSourceNeeded, rng, fps);
    const heroClip = makeBaseClip(heroSrc, cursor, cursor + heroFrames, heroTrim.trimStartFrame, heroTrim.trimEndFrame, fps, 0.5);
    heroClip.letterbox = true;
    heroClip.colorGrading = auraGrading;
    clips.push(heroClip);
    cursor += heroFrames;

    // ── Hard cut montage for remaining 60% ──
    while (cursor < totalFrames) {
        const montageSec = lerp(0.8, 1.5, rng());
        const montageFrames = Math.min(
            Math.max(1, secondsToFrames(montageSec, fps)),
            totalFrames - cursor,
        );
        if (montageFrames <= 0) break;

        const src = pickSource(pool, rng, usedSources);
        const trim = getTrimWindow(src, montageFrames, rng, fps);
        const clip = makeBaseClip(src, cursor, cursor + montageFrames, trim.trimStartFrame, trim.trimEndFrame, fps, 1.0);
        clip.letterbox = true;
        clip.colorGrading = auraGrading;
        // No transitions — hard cuts only
        clips.push(clip);
        cursor += montageFrames;
    }

    return clips;
}

/**
 * 4. REFRAME MONTAGE
 * Rapid cycle through all pool sources, 1-2s each, with zoom reframing.
 */
function generateReframeMontage(
    pool: MediaFile[],
    settings: SocialMediaSettings,
    rng: () => number,
    fps: number,
): Clip[] {
    const clips: Clip[] = [];
    const totalFrames = secondsToFrames(settings.targetDuration, fps);
    const usedSources: Set<string> = new Set();
    const zoomOrigins: Array<'center' | 'top' | 'bottom'> = ['center', 'top', 'bottom'];
    let cursor = 0;
    let clipIndex = 0;

    while (cursor < totalFrames) {
        const clipSec = lerp(1.0, 2.0, rng());
        const clipFrames = Math.min(
            Math.max(1, secondsToFrames(clipSec, fps)),
            totalFrames - cursor,
        );
        if (clipFrames <= 0) break;

        const src = pickSource(pool, rng, usedSources);
        const trim = getTrimWindow(src, clipFrames, rng, fps);
        const clip = makeBaseClip(src, cursor, cursor + clipFrames, trim.trimStartFrame, trim.trimEndFrame, fps, 1.0);

        // Random zoom level 130-160 to simulate reframing
        clip.zoomLevel = Math.floor(lerp(130, 160, rng()));
        // Alternate zoom origins
        clip.zoomOrigin = zoomOrigins[clipIndex % zoomOrigins.length];
        // Dissolve transitions (300ms ≈ fps * 0.3)
        const dissolveDuration = Math.min(secondsToFrames(0.3, fps), clipFrames);
        clip.transition = { type: 'dissolve', durationFrames: dissolveDuration };

        clips.push(clip);
        cursor += clipFrames;
        clipIndex++;
    }

    return clips;
}

/**
 * 5. QUOTE / LIST
 * Steady B-roll pacing for text overlay slots. Ken Burns zoom, crossfade transitions.
 */
function generateQuoteList(
    pool: MediaFile[],
    settings: SocialMediaSettings,
    rng: () => number,
    fps: number,
): Clip[] {
    const clips: Clip[] = [];
    const totalFrames = secondsToFrames(settings.targetDuration, fps);
    const usedSources: Set<string> = new Set();
    let cursor = 0;

    // Determine clip count: textItems.length if provided, otherwise fill to duration
    const textItems = settings.textItems;
    const hasTextItems = textItems && textItems.length > 0;
    const targetClipCount = hasTextItems ? textItems.length : undefined;

    let clipsMade = 0;

    while (cursor < totalFrames) {
        // Stop if we've made enough clips for the text items
        if (targetClipCount !== undefined && clipsMade >= targetClipCount) break;

        // Each clip 3-4 seconds
        const clipSec = lerp(3.0, 4.0, rng());
        let clipFrames = Math.max(1, secondsToFrames(clipSec, fps));

        // If this is the last text-item clip, extend to fill remaining timeline
        if (targetClipCount !== undefined && clipsMade === targetClipCount - 1) {
            clipFrames = totalFrames - cursor;
        } else {
            clipFrames = Math.min(clipFrames, totalFrames - cursor);
        }

        if (clipFrames <= 0) break;

        const src = pickSource(pool, rng, usedSources);
        const trim = getTrimWindow(src, clipFrames, rng, fps);
        const clip = makeBaseClip(src, cursor, cursor + clipFrames, trim.trimStartFrame, trim.trimEndFrame, fps, 1.0);

        // Slight Ken Burns zoom: 100 → 110
        clip.zoomStart = 100;
        clip.zoomEnd = 110;
        clip.zoomSpeed = 'slow';
        clip.zoomCurve = 'ease-in-out';

        // Crossfade transitions (500ms)
        const crossfadeDuration = Math.min(secondsToFrames(0.5, fps), clipFrames);
        clip.transition = { type: 'dissolve', durationFrames: crossfadeDuration };

        clips.push(clip);
        cursor += clipFrames;
        clipsMade++;
    }

    return clips;
}

// ─── Loop-Friendly Ending ────────────────────────────────────────────────────

/** Adjust the last clip to create a loop-friendly ending that mirrors the first. */
function applyLoopFriendly(clips: Clip[]): void {
    if (clips.length < 2) return;
    const last = clips[clips.length - 1];
    // Fade-to-black on last clip encourages seamless looping
    last.transition = { type: 'fadeblack', durationFrames: Math.min(15, last.endFrame - last.startFrame) };
}

// ─── Report Builder ──────────────────────────────────────────────────────────

function buildReport(
    style: SocialStyle,
    clips: Clip[],
    settings: SocialMediaSettings,
    fps: number,
): string {
    const totalFrames = clips.length > 0
        ? clips[clips.length - 1].endFrame - clips[0].startFrame
        : 0;
    const totalSec = (totalFrames / fps).toFixed(1);
    const uniqueSources = new Set(clips.map(c => c.path)).size;

    const lines: string[] = [
        `═══ Social Media Edit Report ═══`,
        `Style: ${style}`,
        `Duration: ${totalSec}s (${totalFrames} frames @ ${fps}fps)`,
        `Clips: ${clips.length}`,
        `Unique sources: ${uniqueSources}`,
        `Seed: ${settings.seed ?? 'default'}`,
    ];

    if (style === 'velocity-edit') {
        const slowCount = clips.filter(c => c.speed < 1).length;
        const fastCount = clips.filter(c => c.speed > 1).length;
        lines.push(`Speed ramps: ${slowCount} slow-mo, ${fastCount} rapid`);
    }

    if (style === 'beat-sync-cut') {
        const flashCount = clips.filter(c => c.vibrationFlash).length;
        const chromaCount = clips.filter(c => (c.chromaticAberration ?? 0) > 0).length;
        lines.push(`Beat effects: ${flashCount} flash, ${chromaCount} chromatic`);
    }

    if (style === 'aura-sigma') {
        lines.push(`Hero clip: 40% duration at 0.5x speed`);
        lines.push(`Color grade: high contrast, desaturated, cool`);
    }

    if (style === 'reframe-montage') {
        lines.push(`Zoom range: 130-160%`);
        lines.push(`Transitions: dissolve (300ms)`);
    }

    if (style === 'quote-list') {
        const textCount = settings.textItems?.length ?? 0;
        lines.push(`Text slots: ${textCount > 0 ? textCount : 'auto-filled'}`);
        lines.push(`Ken Burns: 100% → 110%`);
    }

    if (settings.loopFriendly) {
        lines.push(`Loop-friendly ending: enabled`);
    }

    return lines.join('\n');
}

// ─── Main Generator ──────────────────────────────────────────────────────────

/**
 * Generate a social media edit for the given style.
 *
 * Each style has its own structurally distinct generation algorithm that
 * produces a purpose-built Clip[] timeline rather than falling through to
 * the trailer generator with overrides.
 *
 * @param pool - Available media files to draw from. Must contain at least 1 video.
 * @param settings - Style selection and configuration.
 * @returns SocialMediaResult with clips, style identifier, and human-readable report.
 */
export function generateSocialMediaEdit(
    pool: MediaFile[],
    settings: SocialMediaSettings,
): SocialMediaResult {
    const fps = settings.fps ?? DEFAULT_FPS;
    const rng = mulberry32(seedToInt(settings.seed));

    // Filter pool to video files only
    const videoPool = pool.filter(m => m.type === 'video' && m.duration > 0);

    if (videoPool.length === 0) {
        return {
            clips: [],
            style: settings.style,
            report: `═══ Social Media Edit Report ═══\nStyle: ${settings.style}\nError: No video files in pool. At least 1 video required.`,
        };
    }

    let clips: Clip[];

    switch (settings.style) {
        case 'velocity-edit':
            clips = generateVelocityEdit(videoPool, settings, rng, fps);
            break;
        case 'beat-sync-cut':
            clips = generateBeatSyncCut(videoPool, settings, rng, fps);
            break;
        case 'aura-sigma':
            clips = generateAuraSigma(videoPool, settings, rng, fps);
            break;
        case 'reframe-montage':
            clips = generateReframeMontage(videoPool, settings, rng, fps);
            break;
        case 'quote-list':
            clips = generateQuoteList(videoPool, settings, rng, fps);
            break;
        default: {
            // Exhaustiveness check
            const _exhaustive: never = settings.style;
            throw new Error(`Unknown social style: ${_exhaustive}`);
        }
    }

    // Apply loop-friendly ending if requested
    if (settings.loopFriendly) {
        applyLoopFriendly(clips);
    }

    const report = buildReport(settings.style, clips, settings, fps);

    return { clips, style: settings.style, report };
}
