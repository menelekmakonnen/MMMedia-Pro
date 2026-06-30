// ══════════════════════════════════════════════════════════════════════════════
// deliveryPromise.ts — Promise classification & fulfilment checking for the EGE.
//
// Every generator mode makes an implicit promise about the KIND of output the
// user receives. A "music-video" mode promises motion-led footage; a "trailer"
// mode promises fast montage-style cuts; a "video-essay" mode promises measured,
// narrative pacing. This module:
//
//   1. Classifies a (mode, subcategory?) pair into a PromiseType — a small
//      value-set that captures the core delivery contract.
//   2. Looks up concrete thresholds for that type (minimum motion ratio, max
//      clip duration, unique-source requirement, etc.).
//   3. Checks a set of generated ContractClips against those thresholds and
//      reports violations + actionable suggestions.
//
// Inspired by OpenMontage's delivery_promise.py. Pure & deterministic — no
// React, no IPC, no FFmpeg imports. Unit-testable in isolation.
// ══════════════════════════════════════════════════════════════════════════════

import type { ContractClip } from './generationContract';
import { DEFAULT_FPS } from '../time';

// ─── Promise types ────────────────────────────────────────────────────────────

export type PromiseType =
    | 'motion-led'
    | 'montage'
    | 'narrative'
    | 'performance'
    | 'data-explainer'
    | 'compilation'
    | 'behind-scenes';

export interface DeliveryPromise {
    /** What this mode promises */
    promiseType: PromiseType;
    /** Minimum percentage of clips that should be video (not stills) */
    minMotionRatio: number;
    /** Minimum unique sources required */
    minUniqueSources: number;
    /** Whether multi-track is expected */
    expectsMultiTrack: boolean;
    /** Whether beat-sync is expected */
    expectsBeatSync: boolean;
    /** Maximum allowed clip duration (seconds) — prevents slideshow */
    maxClipDuration: number;
    /** Description for UI display */
    description: string;
}

export interface PromiseCheckResult {
    fulfilled: boolean;
    promise: DeliveryPromise;
    violations: string[];
    /** Suggested actions to fulfill the promise */
    suggestions: string[];
}

// ─── Promise presets ──────────────────────────────────────────────────────────
// Each PromiseType maps to a concrete set of thresholds. The record is frozen
// at module load so nothing can accidentally mutate it.

const PROMISE_PRESETS: Readonly<Record<PromiseType, DeliveryPromise>> = Object.freeze({
    'motion-led': Object.freeze({
        promiseType: 'motion-led' as const,
        minMotionRatio: 0.7,
        minUniqueSources: 2,
        expectsMultiTrack: false,
        expectsBeatSync: true,
        maxClipDuration: 8,
        description: 'The edit should be primarily moving footage, not stills.',
    }),
    'montage': Object.freeze({
        promiseType: 'montage' as const,
        minMotionRatio: 0.5,
        minUniqueSources: 4,
        expectsMultiTrack: false,
        expectsBeatSync: false,
        maxClipDuration: 6,
        description: 'Fast cuts across diverse sources, energy-driven.',
    }),
    'narrative': Object.freeze({
        promiseType: 'narrative' as const,
        minMotionRatio: 0.3,
        minUniqueSources: 2,
        expectsMultiTrack: false,
        expectsBeatSync: false,
        maxClipDuration: 15,
        description: 'Story-driven with intentional pacing and structure.',
    }),
    'performance': Object.freeze({
        promiseType: 'performance' as const,
        minMotionRatio: 0.6,
        minUniqueSources: 2,
        expectsMultiTrack: false,
        expectsBeatSync: false,
        maxClipDuration: 10,
        description: 'Focused on a performer/subject with featured close-ups.',
    }),
    'data-explainer': Object.freeze({
        promiseType: 'data-explainer' as const,
        minMotionRatio: 0.2,
        minUniqueSources: 1,
        expectsMultiTrack: true,
        expectsBeatSync: false,
        maxClipDuration: 12,
        description: 'Information-driven with text/graphics emphasis.',
    }),
    'compilation': Object.freeze({
        promiseType: 'compilation' as const,
        minMotionRatio: 0.5,
        minUniqueSources: 6,
        expectsMultiTrack: false,
        expectsBeatSync: false,
        maxClipDuration: 8,
        description: 'Collection of diverse clips with consistent treatment.',
    }),
    'behind-scenes': Object.freeze({
        promiseType: 'behind-scenes' as const,
        minMotionRatio: 0.4,
        minUniqueSources: 2,
        expectsMultiTrack: false,
        expectsBeatSync: false,
        maxClipDuration: 12,
        description: 'Raw/authentic footage with process-focused structure.',
    }),
});

// ─── Mode → PromiseType mapping ───────────────────────────────────────────────
// Social-media sub-categories get special treatment; everything else maps at
// the top-level mode.

const SOCIAL_SUBCATEGORY_MAP: Readonly<Record<string, PromiseType>> = Object.freeze({
    'velocity-edit': 'motion-led',
    'beat-sync': 'montage',
    'aura-sigma': 'performance',
    'quote': 'data-explainer',
    'list': 'data-explainer',
});

const MODE_MAP: Readonly<Record<string, PromiseType>> = Object.freeze({
    'trailer': 'montage',
    'music-video': 'motion-led',
    'showreel': 'performance',
    'video-essay': 'narrative',
    'short-film': 'narrative',
    'bts': 'behind-scenes',
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Stable source-identity key — mirrors generationContract.ts#sourceKey. */
function sourceKey(c: ContractClip): string {
    return c.mediaLibraryId || c.path || c.filename || c.id || 'unknown';
}

/**
 * Heuristic: a clip with sourceDurationFrames ≤ 1 is treated as a still image
 * (single-frame source). Clips imported from image files receive
 * sourceDurationFrames = 1 by convention in MMMedia Pro's media import flow.
 */
function isStillClip(c: ContractClip): boolean {
    return c.sourceDurationFrames <= 1;
}

// ══════════════════════════════════════════════════════════════════════════════
// classifyPromise
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Map a generator mode (+ optional subcategory) to a `DeliveryPromise`.
 *
 * Lookup order:
 *   1. If `mode === 'social-media'` and the subcategory has a specific mapping,
 *      use it.
 *   2. If `mode === 'social-media'` with an unknown / absent subcategory,
 *      fall back to 'montage'.
 *   3. Otherwise look up by top-level mode.
 *   4. Final fallback → 'montage' (the most common, safest default).
 */
export function classifyPromise(mode: string, subcategory?: string): DeliveryPromise {
    const normMode = mode.toLowerCase().trim();
    const normSub = subcategory?.toLowerCase().trim();

    let promiseType: PromiseType;

    if (normMode === 'social-media') {
        promiseType = (normSub && SOCIAL_SUBCATEGORY_MAP[normSub]) || 'montage';
    } else {
        promiseType = MODE_MAP[normMode] || 'montage';
    }

    return PROMISE_PRESETS[promiseType];
}

// ══════════════════════════════════════════════════════════════════════════════
// checkPromise
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Check whether a set of clips fulfills the given delivery promise.
 *
 * The check examines:
 *   • **Motion ratio** — fraction of clips that are video (not stills).
 *   • **Source diversity** — number of unique media sources.
 *   • **Max clip duration** — no single clip exceeds the allowed max seconds.
 *   • **Multi-track expectation** — whether clips span more than one track.
 *
 * Beat-sync cannot be validated from clip data alone (it requires knowledge of
 * the timing spine), so `expectsBeatSync` is noted in suggestions when true but
 * not counted as a hard violation.
 *
 * Returns a structured result with `fulfilled`, a list of `violations`, and
 * actionable `suggestions`.
 */
export function checkPromise(
    clips: ContractClip[],
    promise: DeliveryPromise,
    fps: number = DEFAULT_FPS,
): PromiseCheckResult {
    const violations: string[] = [];
    const suggestions: string[] = [];

    if (clips.length === 0) {
        violations.push('No clips provided — cannot fulfill any delivery promise.');
        return { fulfilled: false, promise, violations, suggestions: ['Add media clips to the timeline.'] };
    }

    // ── Motion ratio ──
    const motionClips = clips.filter(c => !isStillClip(c));
    const motionRatio = motionClips.length / clips.length;

    if (motionRatio < promise.minMotionRatio) {
        const pct = (motionRatio * 100).toFixed(0);
        const minPct = (promise.minMotionRatio * 100).toFixed(0);
        violations.push(
            `Motion ratio ${pct}% (${motionClips.length}/${clips.length} video clips) is below the ${minPct}% minimum for "${promise.promiseType}".`,
        );
        const needed = Math.ceil(promise.minMotionRatio * clips.length) - motionClips.length;
        suggestions.push(
            `Replace at least ${needed} still image clip(s) with video footage to reach the ${minPct}% motion target.`,
        );
    }

    // ── Source diversity ──
    const uniqueSources = new Set(clips.map(sourceKey));
    if (uniqueSources.size < promise.minUniqueSources) {
        violations.push(
            `Only ${uniqueSources.size} unique source(s) found; "${promise.promiseType}" expects at least ${promise.minUniqueSources}.`,
        );
        const needed = promise.minUniqueSources - uniqueSources.size;
        suggestions.push(
            `Add ${needed} more distinct source(s) to the media pool for adequate diversity.`,
        );
    }

    // ── Max clip duration ──
    const maxAllowedFrames = Math.round(promise.maxClipDuration * fps);
    const oversizedClips: { id: string; durationSec: number }[] = [];

    for (const c of clips) {
        const durFrames = c.endFrame - c.startFrame;
        if (durFrames > maxAllowedFrames) {
            const durSec = durFrames / fps;
            oversizedClips.push({ id: c.id, durationSec: parseFloat(durSec.toFixed(2)) });
        }
    }

    if (oversizedClips.length > 0) {
        const worst = oversizedClips.reduce((a, b) => (a.durationSec > b.durationSec ? a : b));
        violations.push(
            `${oversizedClips.length} clip(s) exceed the ${promise.maxClipDuration}s max duration for "${promise.promiseType}" (worst: "${worst.id}" at ${worst.durationSec}s).`,
        );
        suggestions.push(
            `Trim or split the ${oversizedClips.length} oversized clip(s) to keep each under ${promise.maxClipDuration}s.`,
        );
    }

    // ── Multi-track expectation ──
    if (promise.expectsMultiTrack) {
        const tracks = new Set(clips.map(c => c.track));
        if (tracks.size < 2) {
            violations.push(
                `"${promise.promiseType}" expects multi-track editing, but all clips are on a single track.`,
            );
            suggestions.push(
                'Place text overlays, graphics, or B-roll on additional tracks to create layered composition.',
            );
        }
    }

    // ── Beat-sync advisory (soft — not a hard violation) ──
    if (promise.expectsBeatSync) {
        suggestions.push(
            'This promise type expects beat-synced cuts. Verify that a timing spine aligns cut points to musical beats.',
        );
    }

    const fulfilled = violations.length === 0;

    return { fulfilled, promise, violations, suggestions };
}
