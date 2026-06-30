/**
 * BTS Generator — Dedicated Behind-The-Scenes edit assembly.
 * ════════════════════════════════════════════════════════════════════════════
 * Builds a structured BTS edit following a natural production narrative arc:
 *   1. Arrival    (10%) — establishing shots, location, setup beginning
 *   2. Preparation (15%) — gear setup, rehearsals, blocking, makeup
 *   3. Action     (40%) — the main activity being documented
 *   4. Result     (20%) — finished product, reveals, reactions
 *   5. Wrap       (15%) — pack-down, celebrations, bloopers, goodbyes
 *
 * PURE: no React, no IPC, no filesystem, no FFmpeg.
 * Deterministic: identical seed + inputs ⇒ identical edit.
 */

import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_FPS, secondsToFrames } from './time';
import type { Clip, ClipTransition } from '../types';
import type { MediaFile } from '../store/mediaStore';

// ─── Public Types ────────────────────────────────────────────────────────────

export type BtsPhase = 'arrival' | 'preparation' | 'action' | 'result' | 'wrap';

export interface BtsSettings {
    targetDuration: number; // seconds
    fps?: number;
    seed?: string | number;
    beatTimestamps?: number[] | null;
    /** Override phase ratios (must sum to 1.0) */
    phaseRatios?: Record<BtsPhase, number>;
    /** Enable timelapse for setup/wrap phases */
    enableTimelapse?: boolean;
    /** Subcategory hint (e.g. 'film-bts', 'music-video-bts') */
    subcategory?: string;
}

export interface BtsPhaseInfo {
    phase: BtsPhase;
    startFrame: number;
    endFrame: number;
    clipCount: number;
}

export interface BtsResult {
    clips: Clip[];
    phases: BtsPhaseInfo[];
    report: string;
}

// ─── Phase Defaults ──────────────────────────────────────────────────────────

const DEFAULT_PHASE_RATIOS: Record<BtsPhase, number> = {
    arrival:     0.10,
    preparation: 0.15,
    action:      0.40,
    result:      0.20,
    wrap:        0.15,
};

const PHASE_ORDER: BtsPhase[] = ['arrival', 'preparation', 'action', 'result', 'wrap'];

// ─── Per-Phase Clip Duration Ranges (seconds) ────────────────────────────────

interface PhaseBehaviour {
    minClipSec: number;
    maxClipSec: number;
    baseSpeed: number;
}

const PHASE_BEHAVIOUR: Record<BtsPhase, PhaseBehaviour> = {
    arrival:     { minClipSec: 3, maxClipSec: 5, baseSpeed: 1.0 },
    preparation: { minClipSec: 2, maxClipSec: 3, baseSpeed: 1.0 },
    action:      { minClipSec: 1, maxClipSec: 4, baseSpeed: 1.0 },
    result:      { minClipSec: 3, maxClipSec: 6, baseSpeed: 0.8 },
    wrap:        { minClipSec: 2, maxClipSec: 3, baseSpeed: 1.0 },
};

// ─── Deterministic RNG (mulberry32) ──────────────────────────────────────────

function seedToInt(seed: string | number | undefined): number {
    if (seed === undefined || seed === null) return 1;
    if (typeof seed === 'number') return seed >>> 0;
    // Hash string seed to 32-bit integer
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
        h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
    }
    return h >>> 0;
}

function mulberry32(a: number) {
    let state = a >>> 0;
    return (): number => {
        state |= 0; state = (state + 0x6D2B79F5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ─── Transition Helpers ──────────────────────────────────────────────────────

/**
 * Determine the transition to apply at a phase boundary or within a phase.
 *
 * Boundary rules:
 *   arrival → preparation : dissolve (45f)
 *   preparation → action  : hard cut (no transition object)
 *   action → result       : dissolve (60f)
 *   result → wrap         : dissolve (45f, crossfade-style)
 *
 * Intra-phase rules:
 *   Within action: mix of hard cuts and whip transitions
 *   Within other phases: dissolve (30f)
 */
function pickTransition(
    prevPhase: BtsPhase,
    curPhase: BtsPhase,
    isBoundary: boolean,
    actionClipIndex: number,
    rand: () => number,
): ClipTransition | undefined {
    if (isBoundary) {
        if (prevPhase === 'arrival' && curPhase === 'preparation') {
            return { type: 'dissolve', durationFrames: 45 };
        }
        if (prevPhase === 'preparation' && curPhase === 'action') {
            return undefined; // hard cut
        }
        if (prevPhase === 'action' && curPhase === 'result') {
            return { type: 'dissolve', durationFrames: 60 };
        }
        if (prevPhase === 'result' && curPhase === 'wrap') {
            return { type: 'dissolve', durationFrames: 45 };
        }
        // Fallback for any other unexpected boundary
        return { type: 'dissolve', durationFrames: 30 };
    }

    // Intra-phase
    if (curPhase === 'action') {
        // Mix of hard cuts and whip transitions within action
        return rand() < 0.6 ? undefined : { type: 'whip', durationFrames: 15 };
    }

    // Default intra-phase: gentle dissolve
    return { type: 'dissolve', durationFrames: 30 };
}

// ─── Pool Selection (coverage-first, no adjacent repeats) ────────────────────

/**
 * Select pool indices for a phase. Guarantees:
 * 1. Coverage-first — every pool source is used before recycling.
 * 2. No two adjacent clips share the same source.
 */
function selectPoolIndices(
    count: number,
    poolSize: number,
    usedGlobal: Set<number>,
    rand: () => number,
): number[] {
    if (poolSize === 0 || count === 0) return [];

    const result: number[] = [];

    // Build priority list: unused sources first, then all sources
    const allIndices = Array.from({ length: poolSize }, (_, i) => i);

    for (let i = 0; i < count; i++) {
        // Prefer unused sources
        const unused = allIndices.filter(idx => !usedGlobal.has(idx));
        const candidates = unused.length > 0 ? unused : allIndices;

        // Filter out the previous source to avoid adjacency
        const prevIdx = result.length > 0 ? result[result.length - 1] : -1;
        let filtered = candidates.filter(idx => idx !== prevIdx);
        if (filtered.length === 0) filtered = candidates; // allow repeat if only 1 source

        // Pick randomly
        const pick = filtered[Math.floor(rand() * filtered.length)];
        result.push(pick);
        usedGlobal.add(pick);
    }

    return result;
}

// ─── Main Generator ──────────────────────────────────────────────────────────

export function generateBtsEdit(pool: MediaFile[], settings: BtsSettings): BtsResult {
    const fps = settings.fps ?? DEFAULT_FPS;
    const rand = mulberry32(seedToInt(settings.seed));
    const totalFrames = secondsToFrames(settings.targetDuration, fps);

    // ── 1. Phase allocation ──────────────────────────────────────────────────

    const ratios = settings.phaseRatios ?? DEFAULT_PHASE_RATIOS;
    const phaseFrameBudgets: Record<BtsPhase, number> = {
        arrival: 0, preparation: 0, action: 0, result: 0, wrap: 0,
    };

    // Distribute frames proportionally; round down, give remainder to 'action'
    let allocated = 0;
    for (const phase of PHASE_ORDER) {
        phaseFrameBudgets[phase] = Math.floor(totalFrames * ratios[phase]);
        allocated += phaseFrameBudgets[phase];
    }
    phaseFrameBudgets.action += totalFrames - allocated; // absorb rounding remainder

    // ── 2. Determine clip counts per phase ───────────────────────────────────

    const phaseClipCounts: Record<BtsPhase, number> = {
        arrival: 0, preparation: 0, action: 0, result: 0, wrap: 0,
    };

    for (const phase of PHASE_ORDER) {
        const beh = PHASE_BEHAVIOUR[phase];
        const avgClipFrames = secondsToFrames((beh.minClipSec + beh.maxClipSec) / 2, fps);
        if (avgClipFrames > 0) {
            phaseClipCounts[phase] = Math.max(1, Math.round(phaseFrameBudgets[phase] / avgClipFrames));
        }
    }

    // ── 3. Select pool sources per phase (coverage-first) ────────────────────

    const usedGlobal = new Set<number>();
    const phaseSourceIndices: Record<BtsPhase, number[]> = {
        arrival: [], preparation: [], action: [], result: [], wrap: [],
    };

    for (const phase of PHASE_ORDER) {
        phaseSourceIndices[phase] = selectPoolIndices(
            phaseClipCounts[phase],
            pool.length,
            usedGlobal,
            rand,
        );
    }

    // ── 4. Build clips per phase ─────────────────────────────────────────────

    const allClips: Clip[] = [];
    const phaseInfos: BtsPhaseInfo[] = [];
    let timelineCursor = 0; // frames
    let prevPhase: BtsPhase | null = null;

    for (const phase of PHASE_ORDER) {
        const indices = phaseSourceIndices[phase];
        const budget = phaseFrameBudgets[phase];
        const beh = PHASE_BEHAVIOUR[phase];
        const phaseStartFrame = timelineCursor;
        let phaseClipCount = 0;

        if (indices.length === 0 || budget <= 0) {
            phaseInfos.push({
                phase,
                startFrame: phaseStartFrame,
                endFrame: phaseStartFrame,
                clipCount: 0,
            });
            prevPhase = phase;
            continue;
        }

        // Distribute budget across clips in this phase
        const clipFrames = distributeFrames(budget, indices.length, beh, fps, rand);

        for (let ci = 0; ci < indices.length; ci++) {
            const poolIdx = indices[ci];
            const media = pool[poolIdx];
            if (!media) continue;

            const clipDurFrames = clipFrames[ci];
            if (clipDurFrames <= 0) continue;

            const srcDurFrames = secondsToFrames(media.duration, fps);

            // Determine speed for this clip
            let speed = beh.baseSpeed;
            if (phase === 'action' && ci > 0 && ci % 4 === 0) {
                speed = 0.7; // every 4th action clip gets slow-mo emphasis
            }

            // Timelapse: first clip of preparation, last clip of wrap
            if (settings.enableTimelapse) {
                if (phase === 'preparation' && ci === 0) speed = 4.0;
                if (phase === 'wrap' && ci === indices.length - 1) speed = 4.0;
            }

            // Compute trim window
            // Effective source frames at this speed
            const effectiveSrcFrames = Math.max(1, Math.floor(srcDurFrames / speed));
            const trimLen = Math.min(clipDurFrames, Math.max(2, effectiveSrcFrames));
            const maxTrimStart = Math.max(0, effectiveSrcFrames - trimLen);
            const trimStart = Math.floor(rand() * (maxTrimStart + 1));
            const trimEnd = trimStart + trimLen;

            // Transition
            const isBoundary = prevPhase !== null && prevPhase !== phase && phaseClipCount === 0;
            const transition = allClips.length === 0
                ? undefined
                : pickTransition(
                    prevPhase ?? phase,
                    phase,
                    isBoundary,
                    ci,
                    rand,
                );

            const clip: Clip = {
                id: uuidv4(),
                type: media.type === 'image' ? 'image' : 'video',
                path: media.path,
                filename: media.filename,
                startFrame: timelineCursor,
                endFrame: timelineCursor + clipDurFrames,
                sourceDurationFrames: srcDurFrames,
                trimStartFrame: trimStart,
                trimEndFrame: trimEnd,
                track: 1,
                speed,
                volume: 100,
                reversed: false,
                locked: false,
                origin: 'auto',
            };

            if (transition) {
                clip.transition = transition;
            }

            allClips.push(clip);
            timelineCursor += clipDurFrames;
            phaseClipCount++;
        }

        phaseInfos.push({
            phase,
            startFrame: phaseStartFrame,
            endFrame: timelineCursor,
            clipCount: phaseClipCount,
        });
        prevPhase = phase;
    }

    // ── 5. Build report ──────────────────────────────────────────────────────

    const report = buildReport(allClips, phaseInfos, pool.length, fps, settings);

    return { clips: allClips, phases: phaseInfos, report };
}

// ─── Frame Distribution ──────────────────────────────────────────────────────

/**
 * Distribute a total frame budget across `count` clips, respecting the phase's
 * min/max clip duration. Uses randomised distribution with clamping.
 */
function distributeFrames(
    totalFrames: number,
    count: number,
    beh: PhaseBehaviour,
    fps: number,
    rand: () => number,
): number[] {
    const minF = secondsToFrames(beh.minClipSec, fps);
    const maxF = secondsToFrames(beh.maxClipSec, fps);

    // Generate random weights
    const weights: number[] = [];
    let wSum = 0;
    for (let i = 0; i < count; i++) {
        const w = 0.5 + rand(); // 0.5-1.5 range for moderate variance
        weights.push(w);
        wSum += w;
    }

    // Proportional allocation
    const result: number[] = [];
    let used = 0;
    for (let i = 0; i < count; i++) {
        let f = Math.round((weights[i] / wSum) * totalFrames);
        // Clamp to min/max
        f = Math.max(minF, Math.min(maxF, f));
        result.push(f);
        used += f;
    }

    // Redistribute surplus/deficit into the clips
    let diff = totalFrames - used;
    let iter = 0;
    while (diff !== 0 && iter < count * 3) {
        const idx = iter % count;
        if (diff > 0) {
            const room = maxF - result[idx];
            if (room > 0) {
                const add = Math.min(diff, room);
                result[idx] += add;
                diff -= add;
            }
        } else {
            const room = result[idx] - minF;
            if (room > 0) {
                const sub = Math.min(-diff, room);
                result[idx] -= sub;
                diff += sub;
            }
        }
        iter++;
    }

    return result;
}

// ─── Report Builder ──────────────────────────────────────────────────────────

function buildReport(
    clips: Clip[],
    phases: BtsPhaseInfo[],
    poolSize: number,
    fps: number,
    settings: BtsSettings,
): string {
    const lines: string[] = [];
    const totalFrames = clips.length > 0
        ? clips[clips.length - 1].endFrame - clips[0].startFrame
        : 0;
    const totalSec = (totalFrames / fps).toFixed(1);

    lines.push('═══ BTS Edit Report ═══');
    lines.push(`Target: ${settings.targetDuration}s @ ${fps}fps`);
    lines.push(`Actual: ${totalSec}s (${totalFrames} frames)`);
    lines.push(`Pool: ${poolSize} source(s) → ${clips.length} clip(s)`);
    if (settings.subcategory) {
        lines.push(`Subcategory: ${settings.subcategory}`);
    }
    if (settings.enableTimelapse) {
        lines.push('Timelapse: enabled (preparation intro + wrap outro)');
    }
    lines.push('');
    lines.push('── Phase Breakdown ──');
    for (const p of phases) {
        const dur = ((p.endFrame - p.startFrame) / fps).toFixed(1);
        lines.push(`  ${p.phase.padEnd(12)} ${dur}s  (${p.clipCount} clips)`);
    }
    lines.push('');

    // Unique sources used
    const uniqueSources = new Set(clips.map(c => c.path));
    const coverage = poolSize > 0
        ? ((uniqueSources.size / poolSize) * 100).toFixed(0)
        : '0';
    lines.push(`Coverage: ${uniqueSources.size}/${poolSize} sources used (${coverage}%)`);

    // Speed summary
    const slowMoClips = clips.filter(c => c.speed < 1.0);
    const timelapseClips = clips.filter(c => c.speed > 1.0);
    if (slowMoClips.length > 0) {
        lines.push(`Slow-mo clips: ${slowMoClips.length}`);
    }
    if (timelapseClips.length > 0) {
        lines.push(`Timelapse clips: ${timelapseClips.length}`);
    }

    return lines.join('\n');
}
