/**
 * Short Film Structure Assistant — Collaborative AI-assisted narrative editing.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Unlike trailers (fully auto-generated), Short Films require a collaborative
 * approach: AI assists with structure, coverage analysis, and pacing, but the
 * human directs. This module provides the intelligence layer.
 */

import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_FPS } from './time';
import type { Clip } from '../types';

// ─── Structure Templates ─────────────────────────────────────────────────────

export type ActStructure = 'three-act' | 'five-act' | 'nonlinear' | 'vignette';

export interface ActDefinition {
    name: string;
    description: string;
    /** Target proportion of total film (0-1) */
    proportion: number;
}

export const STRUCTURE_TEMPLATES: Record<ActStructure, { name: string; description: string; acts: ActDefinition[] }> = {
    'three-act': {
        name: 'Three-Act Structure',
        description: 'Setup → Confrontation → Resolution',
        acts: [
            { name: 'Setup', description: 'Establish characters, world, and stakes', proportion: 0.25 },
            { name: 'Confrontation', description: 'Conflict escalates, obstacles arise', proportion: 0.50 },
            { name: 'Resolution', description: 'Climax and denouement', proportion: 0.25 },
        ],
    },
    'five-act': {
        name: 'Five-Act Structure',
        description: 'Exposition → Rising Action → Climax → Falling Action → Denouement',
        acts: [
            { name: 'Exposition', description: 'Introduce characters and setting', proportion: 0.15 },
            { name: 'Rising Action', description: 'Conflict develops, tension builds', proportion: 0.25 },
            { name: 'Climax', description: 'Peak dramatic tension', proportion: 0.20 },
            { name: 'Falling Action', description: 'Consequences unfold', proportion: 0.20 },
            { name: 'Denouement', description: 'Resolution and closure', proportion: 0.20 },
        ],
    },
    'nonlinear': {
        name: 'Nonlinear',
        description: 'Flashbacks, parallel timelines, or non-chronological',
        acts: [
            { name: 'Present', description: 'The main timeline', proportion: 0.40 },
            { name: 'Past', description: 'Flashback/memory sequences', proportion: 0.35 },
            { name: 'Convergence', description: 'Timelines merge for revelation', proportion: 0.25 },
        ],
    },
    'vignette': {
        name: 'Vignette',
        description: 'Independent scenes connected by theme',
        acts: [
            { name: 'Opening', description: 'Establish the theme', proportion: 0.15 },
            { name: 'Vignettes', description: 'Self-contained scenes exploring the theme', proportion: 0.70 },
            { name: 'Closing', description: 'Thematic resolution', proportion: 0.15 },
        ],
    },
};

// ─── Scene Management ────────────────────────────────────────────────────────

export type TimeOfDay = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';
export type LocationType = 'interior' | 'exterior' | 'int-ext';

export interface SceneDefinition {
    id: string;
    act: number;           // which act this scene belongs to (index)
    order: number;         // ordering within the act
    name: string;          // "INT. KITCHEN - NIGHT"
    location: string;
    locationType: LocationType;
    timeOfDay: TimeOfDay;
    characters: string[];
    description: string;
    targetDuration: number; // seconds
    assignedClipIds: string[];
    coverageNotes?: string;
}

/**
 * Create a new scene definition with sensible defaults.
 * @param act   - Act index this scene belongs to
 * @param order - Ordering within the act
 * @param name  - Scene heading (e.g. "INT. KITCHEN - NIGHT")
 * @param targetDuration - Target duration in seconds (default 30)
 */
export function createScene(
    act: number,
    order: number,
    name: string,
    targetDuration?: number,
): SceneDefinition {
    return {
        id: uuidv4(),
        act,
        order,
        name,
        location: '',
        locationType: 'interior',
        timeOfDay: 'morning',
        characters: [],
        description: '',
        targetDuration: targetDuration ?? 30,
        assignedClipIds: [],
    };
}

// ─── Coverage Analysis ───────────────────────────────────────────────────────

export type CoverageType = 'master' | 'medium' | 'close-up' | 'cutaway' | 'reaction' | 'establishing' | 'insert';

export interface CoverageAnalysis {
    sceneId: string;
    availableCoverage: CoverageType[];
    missingCoverage: CoverageType[];
    coverageScore: number;    // 0-100
    suggestions: string[];
}

/** Canonical coverage types recognized by the analysis engine. */
const ALL_COVERAGE_TYPES: CoverageType[] = [
    'master', 'medium', 'close-up', 'cutaway', 'reaction', 'establishing', 'insert',
];

/** Required for baseline coverage. Missing any of these penalizes the score. */
const ESSENTIAL_COVERAGE: CoverageType[] = ['master', 'medium', 'close-up'];

/** Bonus coverage types that improve the score but aren't strictly required. */
const BONUS_COVERAGE: CoverageType[] = ['cutaway', 'reaction', 'establishing', 'insert'];

/**
 * Maps common shot-type strings (as stored in clip metadata) to canonical
 * CoverageType values. Case-insensitive matching with alias support.
 */
function normalizeShotType(raw: string): CoverageType | null {
    const lower = raw.toLowerCase().trim();
    const aliasMap: Record<string, CoverageType> = {
        'master':       'master',
        'wide':         'master',
        'full':         'master',
        'medium':       'medium',
        'mid':          'medium',
        'ms':           'medium',
        'close-up':     'close-up',
        'closeup':      'close-up',
        'close up':     'close-up',
        'cu':           'close-up',
        'ecu':          'close-up',
        'extreme close-up': 'close-up',
        'cutaway':      'cutaway',
        'cut-away':     'cutaway',
        'reaction':     'reaction',
        'establishing': 'establishing',
        'est':          'establishing',
        'insert':       'insert',
        'detail':       'insert',
    };
    return aliasMap[lower] ?? null;
}

/**
 * Analyze coverage for a scene based on assigned clips' shot types.
 * A well-covered scene should have at least: master, medium, close-up.
 * Returns missing coverage types and suggestions.
 */
export function analyzeSceneCoverage(
    scene: SceneDefinition,
    clipShotTypes: Map<string, string>,  // clipId -> shot type
): CoverageAnalysis {
    // Determine which canonical coverage types are present
    const present = new Set<CoverageType>();
    for (const clipId of scene.assignedClipIds) {
        const raw = clipShotTypes.get(clipId);
        if (raw) {
            const norm = normalizeShotType(raw);
            if (norm) present.add(norm);
        }
    }

    const availableCoverage = ALL_COVERAGE_TYPES.filter(t => present.has(t));
    const missingCoverage = ALL_COVERAGE_TYPES.filter(t => !present.has(t));

    // ── Score calculation ────────────────────────────────────────────────
    // Essential coverage (master, medium, close-up): 25 points each = 75 max
    // Bonus coverage (cutaway, reaction, establishing, insert): ~6.25 each = 25 max
    let score = 0;
    const essentialWeight = 25;
    const bonusWeight = 25 / BONUS_COVERAGE.length; // ≈ 6.25

    for (const type of ESSENTIAL_COVERAGE) {
        if (present.has(type)) score += essentialWeight;
    }
    for (const type of BONUS_COVERAGE) {
        if (present.has(type)) score += bonusWeight;
    }

    score = Math.round(Math.min(100, Math.max(0, score)));

    // ── Suggestions ──────────────────────────────────────────────────────
    const suggestions: string[] = [];

    if (!present.has('master')) {
        suggestions.push('Add a wide/master shot to establish spatial context for this scene.');
    }
    if (!present.has('medium')) {
        suggestions.push('Add a medium shot for character interaction and dialogue coverage.');
    }
    if (!present.has('close-up')) {
        suggestions.push('Add a close-up for emotional impact and emphasis.');
    }
    if (!present.has('establishing')) {
        suggestions.push('Consider an establishing shot to orient the audience in the location.');
    }
    if (!present.has('cutaway')) {
        suggestions.push('A cutaway could smooth transitions and add visual variety.');
    }
    if (!present.has('reaction')) {
        suggestions.push('Reaction shots add emotional depth — consider adding one.');
    }
    if (!present.has('insert')) {
        suggestions.push('Insert/detail shots can emphasize important props or actions.');
    }

    // Positive feedback when well-covered
    if (score >= 75 && suggestions.length <= 3) {
        suggestions.unshift('Good coverage! Essential shot types are present.');
    }

    return {
        sceneId: scene.id,
        availableCoverage,
        missingCoverage,
        coverageScore: score,
        suggestions,
    };
}

// ─── Pacing Analysis ─────────────────────────────────────────────────────────

export interface PacingAnalysis {
    totalDuration: number;         // seconds
    actDurations: Array<{ act: string; duration: number; targetDuration: number; variance: number }>;
    cutsPerMinute: number[];
    pacingRating: 'too-slow' | 'balanced' | 'too-fast';
    suggestions: string[];
}

/**
 * Analyze pacing across the entire film structure.
 * Compares actual act durations to target proportions.
 * Computes cuts-per-minute in sliding windows.
 */
export function analyzePacing(
    scenes: SceneDefinition[],
    clips: Clip[],
    structure: ActStructure,
    targetDuration: number,
): PacingAnalysis {
    const template = STRUCTURE_TEMPLATES[structure];
    const clipMap = new Map<string, Clip>();
    for (const c of clips) clipMap.set(c.id, c);

    // ── Compute actual act durations ─────────────────────────────────────
    // Group scenes by act index, sum assigned clip durations per act
    const actClipDurations = new Map<number, number>(); // act index -> seconds
    for (const scene of scenes) {
        let sceneDur = 0;
        for (const clipId of scene.assignedClipIds) {
            const clip = clipMap.get(clipId);
            if (clip) {
                const fps = clip.sourceFps ?? DEFAULT_FPS;
                const durationFrames = clip.endFrame - clip.startFrame;
                sceneDur += durationFrames / fps;
            }
        }
        actClipDurations.set(
            scene.act,
            (actClipDurations.get(scene.act) ?? 0) + sceneDur,
        );
    }

    const actDurations = template.acts.map((actDef, idx) => {
        const actual = actClipDurations.get(idx) ?? 0;
        const target = targetDuration * actDef.proportion;
        return {
            act: actDef.name,
            duration: Math.round(actual * 100) / 100,
            targetDuration: Math.round(target * 100) / 100,
            variance: target > 0
                ? Math.round(((actual - target) / target) * 100) / 100
                : 0,
        };
    });

    const totalDuration = actDurations.reduce((sum, a) => sum + a.duration, 0);

    // ── Cuts-per-minute via 60-second sliding windows ────────────────────
    // Flatten all clips into chronological order by startFrame
    const assignedClipIds = new Set(scenes.flatMap(s => s.assignedClipIds));
    const timelineClips = clips
        .filter(c => assignedClipIds.has(c.id))
        .sort((a, b) => a.startFrame - b.startFrame);

    const cutsPerMinute: number[] = [];
    if (timelineClips.length > 0 && totalDuration > 0) {
        const windowSeconds = 60;
        const stepSeconds = 30; // slide by 30s for overlap
        const maxTime = totalDuration;

        for (let start = 0; start < maxTime; start += stepSeconds) {
            const end = start + windowSeconds;
            // Count clips whose start falls within [start, end)
            let cuts = 0;
            for (const clip of timelineClips) {
                const fps = clip.sourceFps ?? DEFAULT_FPS;
                const clipStartSec = clip.startFrame / fps;
                if (clipStartSec >= start && clipStartSec < end) cuts++;
            }
            // Normalize to full-minute rate if the window extends past the end
            const effectiveWindow = Math.min(windowSeconds, maxTime - start);
            const rate = effectiveWindow > 0
                ? Math.round((cuts / effectiveWindow) * 60 * 10) / 10
                : 0;
            cutsPerMinute.push(rate);
        }
    }

    // ── Pacing rating ────────────────────────────────────────────────────
    // For short films: ~4-8 cuts/min is balanced, <3 is slow, >12 is fast
    const avgCpm = cutsPerMinute.length > 0
        ? cutsPerMinute.reduce((s, v) => s + v, 0) / cutsPerMinute.length
        : 0;

    let pacingRating: PacingAnalysis['pacingRating'] = 'balanced';
    if (avgCpm < 3) pacingRating = 'too-slow';
    else if (avgCpm > 12) pacingRating = 'too-fast';

    // ── Suggestions ──────────────────────────────────────────────────────
    const suggestions: string[] = [];

    // Check act variance
    for (const ad of actDurations) {
        if (Math.abs(ad.variance) > 0.30) {
            const direction = ad.variance > 0 ? 'longer' : 'shorter';
            const pct = Math.abs(Math.round(ad.variance * 100));
            suggestions.push(
                `"${ad.act}" is ${pct}% ${direction} than target. ` +
                `Consider ${ad.variance > 0 ? 'trimming' : 'adding'} material.`,
            );
        }
    }

    if (pacingRating === 'too-slow') {
        suggestions.push(
            'Overall pacing is slow. Consider shortening clips, adding cutaways, or tightening dialogue.',
        );
    } else if (pacingRating === 'too-fast') {
        suggestions.push(
            'Overall pacing is very fast. Consider letting key moments breathe with longer takes.',
        );
    }

    // Check for pacing spikes
    for (let i = 1; i < cutsPerMinute.length; i++) {
        const delta = Math.abs(cutsPerMinute[i] - cutsPerMinute[i - 1]);
        if (delta > 6) {
            suggestions.push(
                `Sudden pacing change detected around minute ${Math.round(i * 0.5)}. ` +
                'Consider smoothing the transition.',
            );
        }
    }

    if (totalDuration > 0 && Math.abs(totalDuration - targetDuration) / targetDuration > 0.20) {
        const diff = Math.round(Math.abs(totalDuration - targetDuration));
        const direction = totalDuration > targetDuration ? 'over' : 'under';
        suggestions.push(
            `Film is ${diff}s ${direction} the target duration of ${targetDuration}s.`,
        );
    }

    return {
        totalDuration: Math.round(totalDuration * 100) / 100,
        actDurations,
        cutsPerMinute,
        pacingRating,
        suggestions,
    };
}

// ─── Continuity Checker ──────────────────────────────────────────────────────

export interface ContinuityIssue {
    sceneId: string;
    type: 'lighting' | 'color-temperature' | 'audio-level' | 'screen-direction';
    severity: 'info' | 'warning' | 'error';
    description: string;
}

/**
 * Check for continuity issues within a scene.
 * Flags: different lighting conditions, color temperature shifts,
 * inconsistent audio levels between clips in the same scene.
 */
export function checkContinuity(
    scene: SceneDefinition,
    clips: Clip[],
    clipMetadata?: Map<string, { colorTemp?: string; lumaAvg?: number }>,
): ContinuityIssue[] {
    const issues: ContinuityIssue[] = [];

    // Build a set for fast clip lookup, keep only clips assigned to this scene
    const assignedSet = new Set(scene.assignedClipIds);
    const sceneClips = clips
        .filter(c => assignedSet.has(c.id))
        .sort((a, b) => a.startFrame - b.startFrame);

    if (sceneClips.length < 2) return issues;

    // ── Audio level consistency ──────────────────────────────────────────
    const volumes = sceneClips.map(c => c.volume);
    const avgVolume = volumes.reduce((s, v) => s + v, 0) / volumes.length;

    for (const clip of sceneClips) {
        const diff = Math.abs(clip.volume - avgVolume);
        if (diff > 30) {
            issues.push({
                sceneId: scene.id,
                type: 'audio-level',
                severity: 'error',
                description:
                    `Clip "${clip.filename}" volume (${clip.volume}) deviates significantly ` +
                    `from scene average (${Math.round(avgVolume)}). This may cause jarring audio jumps.`,
            });
        } else if (diff > 15) {
            issues.push({
                sceneId: scene.id,
                type: 'audio-level',
                severity: 'warning',
                description:
                    `Clip "${clip.filename}" volume (${clip.volume}) differs from ` +
                    `scene average (${Math.round(avgVolume)}) by ${Math.round(diff)}%.`,
            });
        }
    }

    // ── Color temperature consistency (requires metadata) ────────────────
    if (clipMetadata) {
        const colorTemps: string[] = [];
        for (const clip of sceneClips) {
            const meta = clipMetadata.get(clip.id);
            if (meta?.colorTemp) colorTemps.push(meta.colorTemp);
        }

        if (colorTemps.length >= 2) {
            const unique = new Set(colorTemps);
            if (unique.size > 1) {
                const tempList = Array.from(unique).join(', ');
                issues.push({
                    sceneId: scene.id,
                    type: 'color-temperature',
                    severity: 'warning',
                    description:
                        `Mixed color temperatures detected in scene: ${tempList}. ` +
                        'Apply color grading to match clips within the scene.',
                });
            }
        }

        // ── Lighting / luma consistency ──────────────────────────────────
        const lumaValues: number[] = [];
        for (const clip of sceneClips) {
            const meta = clipMetadata.get(clip.id);
            if (meta?.lumaAvg != null) lumaValues.push(meta.lumaAvg);
        }

        if (lumaValues.length >= 2) {
            const minLuma = Math.min(...lumaValues);
            const maxLuma = Math.max(...lumaValues);
            const spread = maxLuma - minLuma;

            if (spread > 80) {
                issues.push({
                    sceneId: scene.id,
                    type: 'lighting',
                    severity: 'error',
                    description:
                        `Large brightness variation (${Math.round(spread)} luma spread) ` +
                        'within the same scene. This suggests mixed lighting conditions.',
                });
            } else if (spread > 40) {
                issues.push({
                    sceneId: scene.id,
                    type: 'lighting',
                    severity: 'warning',
                    description:
                        `Moderate brightness variation (${Math.round(spread)} luma spread) ` +
                        'detected. Consider adjusting exposure to match.',
                });
            } else if (spread > 20) {
                issues.push({
                    sceneId: scene.id,
                    type: 'lighting',
                    severity: 'info',
                    description:
                        `Minor brightness variation (${Math.round(spread)} luma spread) ` +
                        'detected. Likely acceptable but worth reviewing.',
                });
            }
        }
    }

    // ── Screen direction (check for reversed clips in sequence) ──────────
    for (let i = 1; i < sceneClips.length; i++) {
        const prev = sceneClips[i - 1];
        const curr = sceneClips[i];
        // If one clip is flipped horizontally and the adjacent one isn't,
        // this could indicate a screen-direction / 180-degree rule issue
        if ((prev.flipH ?? false) !== (curr.flipH ?? false)) {
            issues.push({
                sceneId: scene.id,
                type: 'screen-direction',
                severity: 'warning',
                description:
                    `Possible 180° rule violation between "${prev.filename}" and ` +
                    `"${curr.filename}" — one is horizontally flipped. ` +
                    'Verify screen direction continuity.',
            });
        }
    }

    return issues;
}

// ─── Assembly Cut Generator ──────────────────────────────────────────────────

/**
 * Defines the preferred order of coverage types in an assembly cut.
 * Establishing shots come first, then master → medium → close-up,
 * with supplementary types interleaved after the core shots.
 */
const ASSEMBLY_COVERAGE_ORDER: CoverageType[] = [
    'establishing', 'master', 'medium', 'close-up', 'reaction', 'cutaway', 'insert',
];

/**
 * Generate an assembly cut from the scene structure.
 * Places clips in scene order, with each scene's clips
 * arranged by coverage type (establishing → master → medium → close-up).
 */
export function generateAssemblyCut(
    scenes: SceneDefinition[],
    allClips: Map<string, Clip>,
    fps: number = DEFAULT_FPS,
): Clip[] {
    // Sort scenes by act then by order within act
    const sortedScenes = [...scenes].sort((a, b) => {
        if (a.act !== b.act) return a.act - b.act;
        return a.order - b.order;
    });

    const result: Clip[] = [];
    let currentFrame = 0;

    for (const scene of sortedScenes) {
        // Gather all assigned clips for this scene
        const sceneClips: Array<{ clip: Clip; coverageIndex: number }> = [];

        for (const clipId of scene.assignedClipIds) {
            const clip = allClips.get(clipId);
            if (!clip) continue;

            // Try to determine coverage type from clip metadata or filename
            const coverageIndex = inferCoverageOrder(clip);
            sceneClips.push({ clip, coverageIndex });
        }

        // Sort by coverage order (establishing first, insert last),
        // with ties broken by original assignment order
        sceneClips.sort((a, b) => a.coverageIndex - b.coverageIndex);

        // Place clips sequentially on the timeline
        for (const { clip } of sceneClips) {
            const trimDuration = clip.trimEndFrame - clip.trimStartFrame;
            if (trimDuration <= 0) continue;

            const assembled: Clip = {
                ...clip,
                id: uuidv4(),
                startFrame: currentFrame,
                endFrame: currentFrame + trimDuration,
                track: 0,
                transition: undefined, // Clean assembly — no transitions yet
            };

            result.push(assembled);
            currentFrame += trimDuration;
        }
    }

    return result;
}

/**
 * Infer the coverage-order index for a clip based on filename heuristics.
 * Returns index into ASSEMBLY_COVERAGE_ORDER, or a high value for unknown.
 */
function inferCoverageOrder(clip: Clip): number {
    const name = clip.filename.toLowerCase();

    for (let i = 0; i < ASSEMBLY_COVERAGE_ORDER.length; i++) {
        const type = ASSEMBLY_COVERAGE_ORDER[i];
        // Check for various naming conventions
        if (name.includes(type)) return i;
    }

    // Common abbreviations / aliases
    if (name.includes('wide') || name.includes('full')) return 0; // → establishing/master
    if (name.includes('est'))  return 0;
    if (name.includes('mid'))  return 2; // → medium
    if (name.includes('cu') || name.includes('closeup')) return 3; // → close-up
    if (name.includes('detail')) return 6; // → insert

    // Unknown coverage type — place at end
    return ASSEMBLY_COVERAGE_ORDER.length;
}
