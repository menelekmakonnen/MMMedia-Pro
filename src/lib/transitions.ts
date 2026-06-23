/**
 * Transitions System
 * Maps transition types to categories, metadata, and segment-aware selection logic.
 * Provides deterministic, style-aware transition picking for the Super Editing Engine.
 */

import type { TransitionType, TransitionStyle } from '../types';
import type { SegmentType } from './audioAnalysisCore';
import { SeededRandom } from './random';

// ═══════════════════════════════════════════════════════
//  1. TRANSITION CATEGORIES
// ═══════════════════════════════════════════════════════

/** All transition types grouped by visual category for UI presentation. */
export const TRANSITION_CATEGORIES: Record<string, { label: string; transitions: TransitionType[] }> = {
    basic:       { label: 'Basic',       transitions: ['cut', 'fade', 'fadewhite', 'fadeblack', 'dissolve'] },
    directional: { label: 'Directional', transitions: ['wipeleft', 'wiperight', 'wipeup', 'wipedown', 'slideleft', 'slideright', 'slideup', 'slidedown'] },
    geometric:   { label: 'Geometric',   transitions: ['circlecrop', 'circleopen', 'circleclose', 'radial', 'pixelize'] },
    smooth:      { label: 'Smooth',      transitions: ['smoothleft', 'smoothright', 'smoothup', 'smoothdown'] },
    diagonal:    { label: 'Diagonal',    transitions: ['diagtl', 'diagtr', 'diagbl', 'diagbr'] },
    squeeze:     { label: 'Squeeze',     transitions: ['squeezeh', 'squeezev'] },
    blur:        { label: 'Blur',        transitions: ['hblur'] },
    impact:      { label: 'Impact',      transitions: ['flash', 'glitch', 'rgb-split', 'zoom-through', 'spin', 'film-burn', 'whip'] },
};

// ═══════════════════════════════════════════════════════
//  2. TRANSITION METADATA
// ═══════════════════════════════════════════════════════

/**
 * The "impact" transitions. These have no identically-named FFmpeg xfade
 * transition, so on export each is rendered via the closest native xfade look
 * (see TRANSITION_XFADE_MAP). Tracked here so the render-parity check can tell
 * the user their transition is approximated rather than pixel-exact.
 */
const CUSTOM_TRANSITIONS: ReadonlySet<TransitionType> = new Set([
    'flash', 'glitch', 'rgb-split', 'zoom-through', 'spin', 'film-burn', 'whip',
]);

/**
 * Metadata for every transition type.
 * - `label`:       Human-readable display name
 * - `icon`:        Emoji for quick visual identification
 * - `isCustom`:    `true` when the transition uses a custom filter chain,
 *                  `false` when it maps to FFmpeg's built-in `xfade` filter
 * - `description`: Short tooltip text describing the visual effect
 */
export const TRANSITION_META: Record<TransitionType, { label: string; icon: string; isCustom: boolean; description: string }> = {
    // ── Basic ──
    cut:          { label: 'Cut',            icon: '--',  isCustom: false, description: 'Instant switch between clips' },
    fade:         { label: 'Fade',           icon: '//',  isCustom: false, description: 'Gradual opacity crossfade' },
    fadewhite:    { label: 'Fade to White',  icon: '/W',  isCustom: false, description: 'Fade through white between clips' },
    fadeblack:    { label: 'Fade to Black',  icon: '/B',  isCustom: false, description: 'Fade through black between clips' },
    dissolve:     { label: 'Dissolve',       icon: ':.',  isCustom: false, description: 'Pixel-level random dissolve blend' },

    // ── Directional ──
    wipeleft:     { label: 'Wipe Left',      icon: '|',   isCustom: false, description: 'Hard edge reveals new clip from right to left' },
    wiperight:    { label: 'Wipe Right',      icon: '|',   isCustom: false, description: 'Hard edge reveals new clip from left to right' },
    wipeup:       { label: 'Wipe Up',        icon: '|',   isCustom: false, description: 'Hard edge reveals new clip from bottom to top' },
    wipedown:     { label: 'Wipe Down',      icon: '|',   isCustom: false, description: 'Hard edge reveals new clip from top to bottom' },
    slideleft:    { label: 'Slide Left',     icon: '>>',  isCustom: false, description: 'Both clips push together to the left' },
    slideright:   { label: 'Slide Right',    icon: '>>',  isCustom: false, description: 'Both clips push together to the right' },
    slideup:      { label: 'Slide Up',       icon: '>>',  isCustom: false, description: 'Both clips push together upward' },
    slidedown:    { label: 'Slide Down',     icon: '>>',  isCustom: false, description: 'Both clips push together downward' },

    // ── Geometric ──
    circlecrop:   { label: 'Circle Crop',    icon: 'O',   isCustom: false, description: 'Circular reveal cropping outward' },
    circleopen:   { label: 'Circle Open',    icon: 'O+',  isCustom: false, description: 'Circle iris opens to reveal new clip' },
    circleclose:  { label: 'Circle Close',   icon: 'O-',  isCustom: false, description: 'Circle iris closes over current clip' },
    radial:       { label: 'Radial',         icon: 'R',   isCustom: false, description: 'Clockwise radial sweep reveal' },
    pixelize:     { label: 'Pixelize',       icon: '#',   isCustom: false, description: 'Mosaic pixelation crossfade' },

    // ── Smooth ──
    smoothleft:   { label: 'Smooth Left',    icon: '~',   isCustom: false, description: 'Soft-edged eased slide to the left' },
    smoothright:  { label: 'Smooth Right',   icon: '~',   isCustom: false, description: 'Soft-edged eased slide to the right' },
    smoothup:     { label: 'Smooth Up',      icon: '~',   isCustom: false, description: 'Soft-edged eased slide upward' },
    smoothdown:   { label: 'Smooth Down',    icon: '~',   isCustom: false, description: 'Soft-edged eased slide downward' },

    // ── Diagonal ──
    diagtl:       { label: 'Diagonal TL',    icon: '\\',  isCustom: false, description: 'Diagonal wipe toward top-left' },
    diagtr:       { label: 'Diagonal TR',    icon: '/',   isCustom: false, description: 'Diagonal wipe toward top-right' },
    diagbl:       { label: 'Diagonal BL',    icon: '/',   isCustom: false, description: 'Diagonal wipe toward bottom-left' },
    diagbr:       { label: 'Diagonal BR',    icon: '\\',  isCustom: false, description: 'Diagonal wipe toward bottom-right' },

    // ── Squeeze ──
    squeezeh:     { label: 'Squeeze H',      icon: '<>', isCustom: false, description: 'Horizontal squeeze compression' },
    squeezev:     { label: 'Squeeze V',      icon: 'v^',  isCustom: false, description: 'Vertical squeeze compression' },

    // ── Blur ──
    hblur:        { label: 'Horizontal Blur', icon: '~~', isCustom: false, description: 'Motion blur sweep transition' },

    // ── Impact (Custom filter chains) ──
    flash:        { label: 'Flash',           icon: '*',   isCustom: true, description: 'Bright flash impact transition' },
    glitch:       { label: 'Glitch',          icon: '%',   isCustom: true, description: 'Digital glitch distortion' },
    'rgb-split':  { label: 'RGB Split',       icon: '|||', isCustom: true, description: 'RGB channel separation shift' },
    'zoom-through': { label: 'Zoom Through',  icon: '(+)', isCustom: true, description: 'Zoom punch through to next clip' },
    spin:         { label: 'Spin',            icon: '@',   isCustom: true, description: 'Rotational spin transition' },
    'film-burn':  { label: 'Film Burn',       icon: '***', isCustom: true, description: 'Analog film burn light leak' },
    whip:         { label: 'Whip',            icon: '->',  isCustom: true, description: 'Fast whip pan blur' },
};

// ═══════════════════════════════════════════════════════
//  3. SEGMENT → TRANSITION MAP
// ═══════════════════════════════════════════════════════

/**
 * Recommended transitions for each song segment type.
 * The first entry in each list is the "safest" default;
 * higher-indexed entries are progressively more dramatic.
 */
export const SEGMENT_TRANSITION_MAP: Record<SegmentType, TransitionType[]> = {
    intro:     ['fade', 'dissolve'],
    verse:     ['cut', 'dissolve', 'smoothleft'],
    buildup:   ['wipeup', 'slideup', 'radial'],
    drop:      ['flash', 'glitch', 'zoom-through', 'cut'],
    chorus:    ['cut', 'slideleft', 'circleopen'],
    breakdown: ['dissolve', 'fadeblack', 'hblur'],
    bridge:    ['fade', 'diagtl', 'squeezeh'],
    outro:     ['fadeblack', 'dissolve'],
};

// ═══════════════════════════════════════════════════════
//  4. selectTransition()
// ═══════════════════════════════════════════════════════

/**
 * Selects a transition based on the current song segment, user preferences,
 * and a seeded RNG for deterministic output.
 *
 * @param segmentType        The detected segment of the song at this edit point.
 * @param allowedTransitions User's allowed set (empty / undefined = all allowed).
 * @param style              User's transition style preference.
 * @param rng                Seeded random number generator for deterministic picks.
 * @returns                  The selected `TransitionType`.
 */
export function selectTransition(
    segmentType: SegmentType,
    allowedTransitions: TransitionType[] | undefined,
    style: TransitionStyle,
    rng: SeededRandom,
): TransitionType {
    // ── Fast-path: cuts-only ──
    if (style === 'cuts-only') {
        return 'cut';
    }

    // ── Build candidate list from segment map ──
    let candidates = [...SEGMENT_TRANSITION_MAP[segmentType]];

    // ── Filter by user's allowed list (if provided and non-empty) ──
    if (allowedTransitions && allowedTransitions.length > 0) {
        candidates = candidates.filter(t => allowedTransitions.includes(t));
    }

    // ── Apply style constraint ──
    if (style === 'transitions-only') {
        candidates = candidates.filter(t => t !== 'cut');
    }

    // ── Fallback: if filtering removed all candidates ──
    if (candidates.length === 0) {
        if (style === 'transitions-only') {
            // Pick from allowed transitions that aren't 'cut', or fall back to 'dissolve'
            const pool = allowedTransitions?.filter(t => t !== 'cut');
            if (pool && pool.length > 0) {
                return rng.choice(pool) as TransitionType;
            }
            return 'dissolve';
        }
        // mixed: pick from allowed list or fall back to segment default
        if (allowedTransitions && allowedTransitions.length > 0) {
            return rng.choice(allowedTransitions) as TransitionType;
        }
        return SEGMENT_TRANSITION_MAP[segmentType][0];
    }

    // ── Deterministic weighted selection ──
    return rng.choice(candidates) as TransitionType;
}

// ═══════════════════════════════════════════════════════
//  5. getTransitionFFmpegName()
// ═══════════════════════════════════════════════════════

/**
 * SINGLE SOURCE OF TRUTH for transition → FFmpeg rendering.
 *
 * Every transition type maps to a real FFmpeg `xfade` built-in. Native xfade
 * transitions map 1:1. The 7 "impact" transitions have no native xfade
 * equivalent, so each maps to the closest built-in that preserves its character
 * (e.g. flash → fadewhite, zoom-through → zoomin). Only `cut` returns null,
 * because a cut is a direct splice rather than an xfade.
 *
 * Because this is a `Record<TransitionType, ...>`, TypeScript forces every
 * transition type to have an entry — a new transition cannot be added without
 * deciding how it renders. transitions.test.ts further asserts that every
 * non-`cut` entry is a valid xfade name, so a transition can NEVER silently
 * degrade to a hard cut on export again.
 */
export const TRANSITION_XFADE_MAP: Record<TransitionType, string | null> = {
    // ── Direct splice ──
    cut: null,
    // ── Basic (native) ──
    fade: 'fade', fadewhite: 'fadewhite', fadeblack: 'fadeblack', dissolve: 'dissolve',
    // ── Directional (native) ──
    wipeleft: 'wipeleft', wiperight: 'wiperight', wipeup: 'wipeup', wipedown: 'wipedown',
    slideleft: 'slideleft', slideright: 'slideright', slideup: 'slideup', slidedown: 'slidedown',
    // ── Geometric (native) ──
    circlecrop: 'circlecrop', circleopen: 'circleopen', circleclose: 'circleclose',
    radial: 'radial', pixelize: 'pixelize',
    // ── Smooth (native) ──
    smoothleft: 'smoothleft', smoothright: 'smoothright', smoothup: 'smoothup', smoothdown: 'smoothdown',
    // ── Diagonal (native) ──
    diagtl: 'diagtl', diagtr: 'diagtr', diagbl: 'diagbl', diagbr: 'diagbr',
    // ── Squeeze (native) ──
    squeezeh: 'squeezeh', squeezev: 'squeezev',
    // ── Blur (native) ──
    hblur: 'hblur',
    // ── Impact (approximated to the closest native xfade look) ──
    flash: 'fadewhite',        // white flash dissolve
    glitch: 'pixelize',        // blocky digital break-up
    'rgb-split': 'hblur',      // smeary chromatic blur
    'zoom-through': 'zoomin',  // native push-in zoom
    spin: 'radial',            // rotational clock sweep
    'film-burn': 'fadewhite',  // burn-to-white
    whip: 'smoothleft',        // fast directional smear (whip pan)
};

/**
 * Returns the FFmpeg `xfade` transition name for a given transition type, or
 * `null` for `cut` (a direct splice). See {@link TRANSITION_XFADE_MAP}.
 */
export function getTransitionFFmpegName(type: TransitionType): string | null {
    return TRANSITION_XFADE_MAP[type] ?? null;
}

/**
 * Whether a transition is rendered via an approximation rather than a native
 * xfade of the same name (the 7 "impact" transitions). Used by the render-parity
 * check to inform the user their flashy transition is mapped to a close cousin.
 */
export function isApproximatedTransition(type: TransitionType): boolean {
    return CUSTOM_TRANSITIONS.has(type);
}

// ═══════════════════════════════════════════════════════
//  BACKWARD-COMPATIBLE EXPORTS (for SettingsTab.tsx)
// ═══════════════════════════════════════════════════════

/** Category key type for the old SettingsTab transition picker */
export type TransitionCategory = keyof typeof TRANSITION_CATEGORIES;

/** Display labels for each category */
export const CATEGORY_LABELS: Record<TransitionCategory, string> = Object.fromEntries(
    Object.entries(TRANSITION_CATEGORIES).map(([key, val]) => [key, val.label])
) as Record<TransitionCategory, string>;

/** Transition definition object for the old API */
export interface TransitionDef {
    id: string;
    name: string;
    description: string;
    category: TransitionCategory;
}

/** Get all transitions grouped by category (old API) */
export function getTransitionsByCategory(): Record<TransitionCategory, TransitionDef[]> {
    const result: Record<string, TransitionDef[]> = {};
    for (const [catKey, catDef] of Object.entries(TRANSITION_CATEGORIES)) {
        result[catKey] = catDef.transitions.map(t => ({
            id: t,
            name: TRANSITION_META[t]?.label ?? t,
            description: `${TRANSITION_META[t]?.icon ?? ''} ${TRANSITION_META[t]?.label ?? t} transition`,
            category: catKey as TransitionCategory,
        }));
    }
    return result as Record<TransitionCategory, TransitionDef[]>;
}

/** Get a single transition definition by ID (old API) */
export function getTransitionById(id: string): TransitionDef | undefined {
    for (const [catKey, catDef] of Object.entries(TRANSITION_CATEGORIES)) {
        const t = catDef.transitions.find(tr => tr === id);
        if (t) {
            return {
                id: t,
                name: TRANSITION_META[t as TransitionType]?.label ?? t,
                description: `${TRANSITION_META[t as TransitionType]?.icon ?? ''} ${TRANSITION_META[t as TransitionType]?.label ?? t} transition`,
                category: catKey as TransitionCategory,
            };
        }
    }
    // Fallback for any string ID (e.g. 'cut' which may exist as a transition strategy)
    if (id === 'cut') {
        return { id: 'cut', name: 'Cut', description: '✂️ Cut transition', category: 'basic' };
    }
    return undefined;
}
