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
    basic:       { label: 'Basic',       transitions: ['cut', 'fade', 'fadewhite', 'fadeblack', 'dissolve', 'pip'] },
    directional: { label: 'Directional', transitions: ['wipeleft', 'wiperight', 'wipeup', 'wipedown', 'slideleft', 'slideright', 'slideup', 'slidedown'] },
    geometric:   { label: 'Geometric',   transitions: ['circlecrop', 'circleopen', 'circleclose', 'radial', 'pixelize'] },
    smooth:      { label: 'Smooth',      transitions: ['smoothleft', 'smoothright', 'smoothup', 'smoothdown'] },
    diagonal:    { label: 'Diagonal',    transitions: ['diagtl', 'diagtr', 'diagbl', 'diagbr'] },
    squeeze:     { label: 'Squeeze',     transitions: ['squeezeh', 'squeezev'] },
    blur:        { label: 'Blur',        transitions: ['hblur'] },
    impact:      { label: 'Impact',      transitions: ['flash', 'glitch', 'rgb-split', 'zoom-through', 'spin', 'film-burn', 'whip', 'boomerang', 'double-exposure', 'triple-exposure', 'vhs'] },
    intelligent: { label: 'Intelligent', transitions: ['match-cut', 'seamless'] },
    motion:      { label: 'Motion',      transitions: ['motion-tween'] },
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
    'match-cut', 'seamless', 'pip', 'boomerang', 'double-exposure', 'triple-exposure', 'vhs',
    'motion-tween',
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
    fadewhite:    { label: 'Fade to White',  icon: '/W',  isCustom: true,  description: 'Dip to solid white overlay between clips' },
    fadeblack:    { label: 'Fade to Black',  icon: '/B',  isCustom: true,  description: 'Dip to solid black overlay between clips' },
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

    // ── Intelligent (Smart Engine-driven) ──
    'match-cut':  { label: 'Match Cut',       icon: '≈',   isCustom: true, description: 'Cuts at visually similar frames — matched by shape, colour, or composition' },
    seamless:     { label: 'Seamless',        icon: '∞',   isCustom: true, description: 'Imperceptible transition — pattern, colour, and motion direction match so closely the cut is invisible' },

    // ── Picture-in-Picture ──
    pip:          { label: 'PiP',             icon: '🖼',  isCustom: true, description: 'Picture-in-Picture: outgoing clip shrinks to corner overlay' },

    // ── Effect-as-Transition (mirrors existing effects) ──
    boomerang:           { label: 'Boomerang',        icon: '↩',   isCustom: true, description: 'Clip A plays forward-reverse then cuts to B' },
    'double-exposure':   { label: 'Double Exposure',  icon: '⊕',   isCustom: true, description: 'A+B blend in screen/overlay exposure' },
    'triple-exposure':   { label: 'Triple Exposure',  icon: '⫿',   isCustom: true, description: '3-layer blend transition' },
    vhs:                 { label: 'VHS',              icon: '▤',   isCustom: true, description: 'Analog VHS tracking distortion between clips' },

    // ── Cinematic Pro Transitions ──
    'white-flash':       { label: 'White Flash',      icon: '✦',   isCustom: true, description: 'Cinematic white flash with overlay blend mode' },
    'subject-mask':      { label: 'Subject Mask',     icon: '🎭',  isCustom: true, description: 'Subject isolation mask reveal transition' },

    // ── Motion ──
    'motion-tween':      { label: 'Motion Tween',     icon: '↝',   isCustom: true, description: 'Auto-animates position/scale/rotation between two clip states for a smooth interpolated transition' },
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
    intro:     ['fade', 'dissolve', 'seamless'],
    verse:     ['cut', 'dissolve', 'smoothleft', 'match-cut', 'seamless'],
    buildup:   ['wipeup', 'slideup', 'radial', 'match-cut'],
    drop:      ['flash', 'glitch', 'zoom-through', 'cut'],
    chorus:    ['cut', 'slideleft', 'circleopen', 'match-cut'],
    breakdown: ['dissolve', 'fadeblack', 'hblur', 'seamless'],
    bridge:    ['fade', 'diagtl', 'squeezeh', 'seamless'],
    outro:     ['fadeblack', 'dissolve', 'seamless'],
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
    fade: 'fade', fadewhite: 'custom', fadeblack: 'custom', dissolve: 'dissolve',
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
    // ── Intelligent (rendered as near-invisible cuts/dissolves) ──
    'match-cut': null,          // match cuts are hard cuts placed at visually similar frames
    seamless: 'dissolve',       // ultra-short dissolve disguised by visual similarity
    // ── Picture-in-Picture ──
    pip: 'custom',              // custom PiP overlay rendering
    // ── Effect-as-Transition (approximated) ──
    boomerang: 'fade',          // boomerang reverse-play approximated as fade
    'double-exposure': 'dissolve', // exposure blend approximated as dissolve
    'triple-exposure': 'dissolve', // triple exposure blend approximated as dissolve
    vhs: 'hblur',               // VHS tracking distortion approximated as blur
    // ── Cinematic Pro Transitions ──
    'white-flash': 'custom',    // custom white flash with animated opacity overlay
    'subject-mask': 'circleopen', // subject mask approximated as circle-open reveal
    // ── Motion ──
    'motion-tween': 'custom',   // position/scale/rotation keyframe interpolation via overlay
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

/**
 * Returns a custom FFmpeg xfade expression string for transitions that use
 * `transition=custom`. Returns `null` for transitions that use a named
 * built-in xfade. Currently used by `fadeblack` and `fadewhite` to render
 * a proper **dip-to-color** (solid opaque overlay) instead of FFmpeg's
 * default linear multiply which darkens/lightens the video content and
 * makes white elements (teeth, clothes) look grey and ugly.
 *
 * The expression uses `clip()` to create a fast ramp where:
 *   - First 40%: A fades under a solid colour overlay
 *   - Middle 20%: Solid colour (fully opaque)
 *   - Last 40%: B fades in from the solid colour
 *
 * This ensures the colour COVERS the video rather than blending with it.
 */
export function getCustomXfadeExpr(type: TransitionType): string | null {
    switch (type) {
        // Dip-to-black: black covers A, then reveals B from black
        // A * clip(1 - P*2.5, 0, 1) → A visible for first 40%, fades to solid black
        // B * clip(P*2.5 - 1.5, 0, 1) → B emerges from black in last 40%
        case 'fadeblack':
            return "if(lt(P\\,0.5)\\,A*clip(1-P*2.5\\,0\\,1)\\,B*clip(P*2.5-1.5\\,0\\,1))";
        // Dip-to-white: white covers A, then reveals B from white
        // Similar but adding (1-factor) * 255 for the white overlay
        case 'fadewhite':
            return "if(lt(P\\,0.5)\\,A*clip(1-P*2.5\\,0\\,1)+255*clip(P*2.5\\,0\\,1)\\,B*clip(P*2.5-1.5\\,0\\,1)+255*(1-clip(P*2.5-1.5\\,0\\,1)))";
        default:
            return null;
    }
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
