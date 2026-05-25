/**
 * Comprehensive Transition Engine
 * 
 * Supports 15+ transition types:
 * - Slides: 4 cardinal directions
 * - Pushes: 2 horizontal (incoming pushes outgoing)
 * - Zooms: in/out with fade
 * - Crossfade: simple opacity blend
 * - Wipes: 4 cardinal clip-path reveals
 * - Spin: rotation + scale entry
 * - Glitch: rapid flicker hard-cut feel
 */

import type { Clip } from '../types';

export type TransitionType =
    | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down'
    | 'push-left' | 'push-right'
    | 'zoom-in' | 'zoom-out'
    | 'crossfade'
    | 'wipe-left' | 'wipe-right' | 'wipe-up' | 'wipe-down'
    | 'spin-in'
    | 'glitch-cut'
    | 'none';

// Catalog for UI enumeration — each entry has human label, category, and CSS-safety flag
export const TRANSITION_CATALOG: { id: TransitionType; label: string; category: string; desc: string }[] = [
    { id: 'slide-left',  label: 'Slide Left',   category: 'Slide',     desc: 'Card slides in from right' },
    { id: 'slide-right', label: 'Slide Right',  category: 'Slide',     desc: 'Card slides in from left' },
    { id: 'slide-up',    label: 'Slide Up',     category: 'Slide',     desc: 'Card slides in from bottom' },
    { id: 'slide-down',  label: 'Slide Down',   category: 'Slide',     desc: 'Card slides in from top' },
    { id: 'push-left',   label: 'Push Left',    category: 'Push',      desc: 'Incoming pushes outgoing left' },
    { id: 'push-right',  label: 'Push Right',   category: 'Push',      desc: 'Incoming pushes outgoing right' },
    { id: 'zoom-in',     label: 'Zoom In',      category: 'Zoom',      desc: 'Scale up with fade reveal' },
    { id: 'zoom-out',    label: 'Zoom Out',     category: 'Zoom',      desc: 'Scale down with fade reveal' },
    { id: 'crossfade',   label: 'Crossfade',    category: 'Fade',      desc: 'Simple opacity dissolve' },
    { id: 'wipe-left',   label: 'Wipe Left',    category: 'Wipe',      desc: 'Horizontal reveal left-to-right' },
    { id: 'wipe-right',  label: 'Wipe Right',   category: 'Wipe',      desc: 'Horizontal reveal right-to-left' },
    { id: 'wipe-up',     label: 'Wipe Up',      category: 'Wipe',      desc: 'Vertical reveal bottom-to-top' },
    { id: 'wipe-down',   label: 'Wipe Down',    category: 'Wipe',      desc: 'Vertical reveal top-to-bottom' },
    { id: 'spin-in',     label: 'Spin In',      category: 'Motion',    desc: 'Rotation + scale entry' },
    { id: 'glitch-cut',  label: 'Glitch Cut',   category: 'Effect',    desc: 'Rapid flicker hard cut' },
];

export const TRANSITION_PRESETS: Record<string, TransitionType[]> = {
    'all': ['slide-left', 'slide-right', 'slide-up', 'slide-down', 'push-left', 'push-right', 'zoom-in', 'zoom-out', 'crossfade', 'wipe-left', 'wipe-right', 'wipe-up', 'wipe-down', 'spin-in', 'glitch-cut'],
    'cinematic': ['crossfade', 'zoom-in', 'zoom-out'],
    'buttery': ['crossfade', 'wipe-left', 'wipe-right'],
    'kinetic': ['push-left', 'push-right', 'slide-up', 'slide-down'],
    'whip': ['slide-left', 'slide-right'],
    'dramatic': ['zoom-in', 'wipe-up', 'wipe-down'],
    'organic': ['crossfade', 'zoom-out', 'slide-down'],
    'dynamic': ['slide-left', 'slide-right', 'push-left', 'push-right', 'wipe-left', 'wipe-right'],
    'glitch': ['glitch-cut'],
    'hard-cuts': ['none'],
    'motion': ['spin-in', 'zoom-in', 'slide-up', 'slide-down'],
    // 2026 Viral presets
    'whip-pan': ['slide-left', 'slide-right', 'push-left', 'push-right'],
    'snap-cut': ['glitch-cut', 'none'],
    'viral': ['zoom-in', 'glitch-cut', 'push-left', 'push-right'],
    'retention': ['glitch-cut', 'zoom-in', 'slide-up', 'push-left'],
};

// All usable (non-none) types
export const ALL_TRANSITION_TYPES: TransitionType[] = TRANSITION_CATALOG.map(t => t.id);

// Default transition duration in frames (8 frames ≈ 0.27s at 30fps)
export const DEFAULT_TRANSITION_FRAMES = 8;

/**
 * ═══════════════════════════════════════════════════════
 *  INTELLIGENT TRANSITION ASSIGNMENT ENGINE
 * ═══════════════════════════════════════════════════════
 *
 * Instead of randomly picking one transition per clip, this engine uses
 * structured strategies inspired by professional editing:
 *
 * 1. REPEAT-THEN-SWITCH: Same transition for N clips, then a different
 *    one on the "accent" beat — like repeating a wipe-left 3× then
 *    hitting a zoom-in on the 4th for impact.
 *
 * 2. FAMILY ALTERNATION: Cycle through variants within a transition
 *    family (e.g., wipe-left → wipe-right → wipe-up → wipe-down).
 *
 * 3. ENERGY-REACTIVE: Calm segments get soft fades/dissolves, high-
 *    energy segments get kinetic motion (pushes, slides, spins).
 *
 * 4. MOTIF DEVELOPMENT: Establish one primary transition as the "motif"
 *    then introduce variations — like a musical theme.
 */

// Transition families — variants of the same visual idea
const TRANSITION_FAMILIES: Record<string, TransitionType[]> = {
    'slide': ['slide-left', 'slide-right', 'slide-up', 'slide-down'],
    'push': ['push-left', 'push-right'],
    'wipe': ['wipe-left', 'wipe-right', 'wipe-up', 'wipe-down'],
    'zoom': ['zoom-in', 'zoom-out'],
    'fade': ['crossfade'],
    'motion': ['spin-in'],
    'effect': ['glitch-cut'],
};

// Energy-based transition pools
const CALM_TRANSITIONS: TransitionType[] = ['crossfade', 'wipe-left', 'wipe-right', 'zoom-out'];
const MID_TRANSITIONS: TransitionType[] = ['slide-left', 'slide-right', 'wipe-up', 'wipe-down', 'zoom-in'];
const HIGH_ENERGY_TRANSITIONS: TransitionType[] = ['push-left', 'push-right', 'slide-up', 'slide-down', 'spin-in', 'glitch-cut'];

// Segment type → energy tier
const SEGMENT_ENERGY: Record<string, 'calm' | 'mid' | 'high'> = {
    'intro': 'calm', 'outro': 'calm', 'breakdown': 'calm',
    'verse': 'mid', 'bridge': 'mid', 'buildup': 'mid',
    'chorus': 'high', 'drop': 'high',
};

type TransitionStrategy = 'repeat-then-switch' | 'family-alternation' | 'energy-reactive' | 'motif-development';

/**
 * Pick the best strategy based on the pool and clip count
 */
const pickStrategy = (pool: TransitionType[], clipCount: number): TransitionStrategy => {
    // If we have very few clips, motif development
    if (clipCount <= 6) return 'motif-development';

    // Check if pool spans multiple families
    const familiesInPool = new Set<string>();
    for (const t of pool) {
        for (const [family, members] of Object.entries(TRANSITION_FAMILIES)) {
            if (members.includes(t)) familiesInPool.add(family);
        }
    }

    // If pool has one family, use family alternation
    if (familiesInPool.size === 1) return 'family-alternation';
    // If pool has many families, use repeat-then-switch for rhythmic variety
    if (familiesInPool.size >= 3) return 'repeat-then-switch';
    // Default
    return 'motif-development';
};

/**
 * Get the family that a transition belongs to
 */
const getFamily = (t: TransitionType): string => {
    for (const [family, members] of Object.entries(TRANSITION_FAMILIES)) {
        if (members.includes(t)) return family;
    }
    return 'unknown';
};

/**
 * Assigns intelligent, pattern-based transitions to a sequence of clips.
 * Uses segment metadata, beat effect tags, and clip duration to make
 * contextual decisions about which transition to use and when.
 */
export const assignTransitions = (
    clips: Clip[],
    transitionFrames: number = DEFAULT_TRANSITION_FRAMES,
    allowedTypes?: TransitionType[],
    maxSimultaneousTransitions: number = 1
): Clip[] => {
    if (clips.length === 0) return clips;

    const pool = allowedTypes && allowedTypes.length > 0
        ? allowedTypes.filter(t => t !== 'none')
        : ALL_TRANSITION_TYPES;

    // If pool is empty or only 'none', no transitions
    if (pool.length === 0) {
        return clips.map(c => ({
            ...c,
            transitionEnter: ['none'] as any,
            transitionExit: ['none'] as any,
            transitionDurationFrames: 0,
        }));
    }

    const strategy = pickStrategy(pool, clips.length);

    // ── Pre-compute: detect which clips have beat/segment metadata ──
    const hasSegmentData = clips.some(c => (c as any)._segType);

    // ── STRATEGY: REPEAT-THEN-SWITCH ─────────────────────────────────
    // Use the same transition for a run of 2-4 clips, then switch to a
    // contrasting one on the "accent" position. Like: AAA B AAA B.
    const repeatThenSwitch = (): TransitionType[] => {
        const result: TransitionType[] = [];
        let currentTransition = pool[Math.floor(Math.random() * pool.length)];
        let runLength = 2 + Math.floor(Math.random() * 3); // 2-4 repeats
        let runCounter = 0;

        for (let i = 0; i < clips.length; i++) {
            if (i === 0) {
                result.push('none' as TransitionType);
                continue;
            }

            const clip = clips[i] as any;
            const isBeatAccent = clip._beatEffect === true;
            const segType = clip._segType || '';
            const isHighEnergy = segType === 'drop' || segType === 'chorus';

            // On accent beats or high-energy segments, force a switch
            if (isBeatAccent || isHighEnergy || runCounter >= runLength) {
                // Pick a contrasting transition (different family)
                const currentFamily = getFamily(currentTransition);
                const contrasts = pool.filter(t => getFamily(t) !== currentFamily);
                currentTransition = contrasts.length > 0
                    ? contrasts[Math.floor(Math.random() * contrasts.length)]
                    : pool[Math.floor(Math.random() * pool.length)];
                runLength = 2 + Math.floor(Math.random() * 3);
                runCounter = 0;
            }

            result.push(currentTransition);
            runCounter++;
        }
        return result;
    };

    // ── STRATEGY: FAMILY ALTERNATION ─────────────────────────────────
    // Cycle through variants within the same family.
    // e.g., wipe-left → wipe-right → wipe-up → wipe-down → wipe-left...
    const familyAlternation = (): TransitionType[] => {
        const result: TransitionType[] = [];
        // Group pool by family, find the biggest family
        const familyMembers: Record<string, TransitionType[]> = {};
        for (const t of pool) {
            const f = getFamily(t);
            if (!familyMembers[f]) familyMembers[f] = [];
            familyMembers[f].push(t);
        }
        const families = Object.entries(familyMembers).sort((a, b) => b[1].length - a[1].length);
        const primaryFamily = families[0]?.[1] || pool;
        const accentFamily = families[1]?.[1] || families[0]?.[1] || pool;

        let familyIdx = 0;

        for (let i = 0; i < clips.length; i++) {
            if (i === 0) { result.push('none' as TransitionType); continue; }

            const clip = clips[i] as any;
            const isBeatAccent = clip._beatEffect === true;
            const segType = clip._segType || '';
            const isAccentPosition = isBeatAccent || segType === 'drop' || segType === 'chorus';

            if (isAccentPosition && accentFamily !== primaryFamily) {
                // Use accent family for impact moments
                result.push(accentFamily[i % accentFamily.length]);
            } else {
                // Cycle through primary family
                result.push(primaryFamily[familyIdx % primaryFamily.length]);
                familyIdx++;
            }
        }
        return result;
    };

    // ── STRATEGY: ENERGY-REACTIVE ────────────────────────────────────
    // Pick transitions based on the energy tier of the current segment.
    // Calm segments → fades/dissolves, high-energy → kinetic motion.
    const energyReactive = (): TransitionType[] => {
        const result: TransitionType[] = [];
        let lastTransition: TransitionType | null = null;
        let repeatCount = 0;

        for (let i = 0; i < clips.length; i++) {
            if (i === 0) { result.push('none' as TransitionType); continue; }

            const clip = clips[i] as any;
            const segType = clip._segType || '';
            const energy = SEGMENT_ENERGY[segType] || 'mid';

            // Select pool based on energy
            let tierPool: TransitionType[];
            if (energy === 'calm') tierPool = CALM_TRANSITIONS.filter(t => pool.includes(t));
            else if (energy === 'high') tierPool = HIGH_ENERGY_TRANSITIONS.filter(t => pool.includes(t));
            else tierPool = MID_TRANSITIONS.filter(t => pool.includes(t));

            // Fallback if tier pool is empty after filtering
            if (tierPool.length === 0) tierPool = pool;

            // Allow 2-3 repeats of the same transition for rhythm, then switch
            let chosen: TransitionType;
            if (lastTransition && tierPool.includes(lastTransition) && repeatCount < 2) {
                chosen = lastTransition;
                repeatCount++;
            } else {
                // Pick something new
                const different = tierPool.filter(t => t !== lastTransition);
                chosen = different.length > 0
                    ? different[Math.floor(Math.random() * different.length)]
                    : tierPool[Math.floor(Math.random() * tierPool.length)];
                repeatCount = 0;
            }

            lastTransition = chosen;
            result.push(chosen);
        }
        return result;
    };

    // ── STRATEGY: MOTIF DEVELOPMENT ──────────────────────────────────
    // Establish one primary transition as the "motif", then introduce
    // variations at key moments — like a musical theme with embellishments.
    const motifDevelopment = (): TransitionType[] => {
        const result: TransitionType[] = [];

        // Pick a primary motif and a contrast
        const motif = pool[Math.floor(Math.random() * pool.length)];
        const motifFamily = getFamily(motif);
        const contrasts = pool.filter(t => getFamily(t) !== motifFamily);
        const contrast = contrasts.length > 0
            ? contrasts[Math.floor(Math.random() * contrasts.length)]
            : pool.filter(t => t !== motif)[0] || motif;

        // Same-family variations
        const motifVariants = pool.filter(t => getFamily(t) === motifFamily);

        for (let i = 0; i < clips.length; i++) {
            if (i === 0) { result.push('none' as TransitionType); continue; }

            const clip = clips[i] as any;
            const isBeatAccent = clip._beatEffect === true;
            const segType = clip._segType || '';
            const clipDur = clip.endFrame - clip.startFrame;

            // Short clips (< 15 frames) → hard cuts feel better
            if (clipDur < 15) {
                result.push('none' as TransitionType);
                continue;
            }

            // Drop/chorus accent moments → use contrast transition
            if (isBeatAccent || segType === 'drop') {
                result.push(contrast);
                continue;
            }

            // Every 4th-5th clip → use a motif variant for development
            if (i % 4 === 0 && motifVariants.length > 1) {
                const variant = motifVariants[(Math.floor(i / 4)) % motifVariants.length];
                result.push(variant);
                continue;
            }

            // Default: use the primary motif
            result.push(motif);
        }
        return result;
    };

    // ── Execute chosen strategy ──
    let transitionSequence: TransitionType[];

    if (hasSegmentData && pool.length >= 3) {
        // With segment data, energy-reactive is best for music-driven edits
        transitionSequence = energyReactive();
    } else {
        switch (strategy) {
            case 'repeat-then-switch': transitionSequence = repeatThenSwitch(); break;
            case 'family-alternation': transitionSequence = familyAlternation(); break;
            case 'energy-reactive': transitionSequence = energyReactive(); break;
            case 'motif-development': transitionSequence = motifDevelopment(); break;
            default: transitionSequence = motifDevelopment(); break;
        }
    }

    // ── Apply to clips ──
    return clips.map((clip, i) => {
        const enterType = transitionSequence[i] || 'none';
        // Exit matches the NEXT clip's enter for visual continuity
        const exitType = (i < clips.length - 1) ? (transitionSequence[i + 1] || 'none') : 'none';

        const clipDuration = clip.endFrame - clip.startFrame;
        const maxAllowedFrames = maxSimultaneousTransitions === 1
            ? Math.floor(clipDuration / 2)
            : clipDuration;
        let actualFrames = Math.min(transitionFrames, maxAllowedFrames);

        // Scale transition duration based on clip length:
        // Very short clips get shorter transitions, long clips can have longer ones
        if (clipDuration < 20) actualFrames = Math.min(actualFrames, 4);
        else if (clipDuration < 40) actualFrames = Math.min(actualFrames, 6);
        // For drop/accent moments, slightly longer transitions for impact
        const segType = (clip as any)._segType || '';
        if (segType === 'drop' || segType === 'chorus') {
            actualFrames = Math.min(Math.ceil(actualFrames * 1.3), maxAllowedFrames);
        }

        if (actualFrames < 2) {
            return { ...clip, transitionEnter: ['none'] as any, transitionExit: ['none'] as any, transitionDurationFrames: 0 };
        }

        return {
            ...clip,
            transitionEnter: [enterType],
            transitionExit: [exitType],
            transitionDurationFrames: actualFrames,
        };
    });
};

// ═══════════════════════════════════════════════════════
//  TRANSFORM COMPUTATION
// ═══════════════════════════════════════════════════════

/** Ease out cubic */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
/** Ease in cubic */
const easeIn = (t: number) => t * t * t;

/**
 * Compute enter transition state.
 * progress: 0 = fully off-screen → 1 = fully on-screen
 */
export const getEnterTransform = (
    progress: number,
    type: TransitionType | TransitionType[]
): { transform: string; opacity: number; clipPath?: string } => {
    const types = Array.isArray(type) ? type : [type];
    if (types.length === 0 || types[0] === 'none' || progress >= 1) {
        return { transform: 'translate(0, 0)', opacity: 1 };
    }

    let combinedTransform = '';
    let minOpacity = 1;
    let firstClipPath: string | undefined = undefined;

    for (const t of types) {
        const { transform, opacity, clipPath } = computeSingleEnterTransform(progress, t);
        if (transform && transform !== 'translate(0, 0)' && transform !== 'none') {
            combinedTransform += (combinedTransform ? ' ' : '') + transform;
        }
        if (opacity < minOpacity) minOpacity = opacity;
        if (clipPath && !firstClipPath) firstClipPath = clipPath;
    }

    if (!combinedTransform) combinedTransform = 'translate(0, 0)';
    return { transform: combinedTransform, opacity: minOpacity, clipPath: firstClipPath };
};

const computeSingleEnterTransform = (
    progress: number,
    type: TransitionType
): { transform: string; opacity: number; clipPath?: string } => {
    if (type === 'none' || progress >= 1) {
        return { transform: 'translate(0, 0)', opacity: 1 };
    }

    const p = Math.min(Math.max(progress, 0), 1);
    const ep = easeOut(p);
    const remaining = 1 - ep;

    switch (type) {
        // Slides: translate from edge
        case 'slide-left':
            return { transform: `translateX(-${remaining * 100}%)`, opacity: 1 };
        case 'slide-right':
            return { transform: `translateX(${remaining * 100}%)`, opacity: 1 };
        case 'slide-up':
            return { transform: `translateY(-${remaining * 100}%)`, opacity: 1 };
        case 'slide-down':
            return { transform: `translateY(${remaining * 100}%)`, opacity: 1 };

        // Pushes: same as slide but partner exits opposite direction
        case 'push-left':
            return { transform: `translateX(${remaining * 100}%)`, opacity: 1 };
        case 'push-right':
            return { transform: `translateX(-${remaining * 100}%)`, opacity: 1 };

        // Zooms
        case 'zoom-in': {
            const scale = 0.3 + ep * 0.7; // 0.3 → 1.0
            return { transform: `scale(${scale})`, opacity: ep };
        }
        case 'zoom-out': {
            const scale = 1.8 - ep * 0.8; // 1.8 → 1.0
            return { transform: `scale(${scale})`, opacity: ep };
        }

        // Crossfade
        case 'crossfade':
            return { transform: 'translate(0, 0)', opacity: ep };

        // Wipes: clip-path polygon reveal
        case 'wipe-left':
            return { transform: 'translate(0, 0)', opacity: 1, clipPath: `inset(0 ${remaining * 100}% 0 0)` };
        case 'wipe-right':
            return { transform: 'translate(0, 0)', opacity: 1, clipPath: `inset(0 0 0 ${remaining * 100}%)` };
        case 'wipe-up':
            return { transform: 'translate(0, 0)', opacity: 1, clipPath: `inset(0 0 ${remaining * 100}% 0)` };
        case 'wipe-down':
            return { transform: 'translate(0, 0)', opacity: 1, clipPath: `inset(${remaining * 100}% 0 0 0)` };

        // Spin
        case 'spin-in': {
            const scale = 0.5 + ep * 0.5;
            const rot = (1 - ep) * 90;
            return { transform: `scale(${scale}) rotate(${rot}deg)`, opacity: ep };
        }

        // Glitch: rapid flicker via opacity stepped pattern
        case 'glitch-cut': {
            const flickerPattern = [0, 1, 0, 1, 0.5, 1, 0, 1];
            const idx = Math.floor(p * flickerPattern.length);
            const opac = idx < flickerPattern.length ? flickerPattern[idx] : 1;
            return { transform: `translateX(${(Math.random() - 0.5) * 3}%)`, opacity: opac };
        }

        default:
            return { transform: 'translate(0, 0)', opacity: 1 };
    }
};

/**
 * Compute exit transition state.
 * progress: 0 = fully on-screen → 1 = fully off-screen
 */
export const getExitTransform = (
    progress: number,
    type: TransitionType | TransitionType[]
): { transform: string; opacity: number; clipPath?: string } => {
    const types = Array.isArray(type) ? type : [type];
    if (types.length === 0 || types[0] === 'none' || progress <= 0) {
        return { transform: 'translate(0, 0)', opacity: 1 };
    }

    let combinedTransform = '';
    let minOpacity = 1;
    let firstClipPath: string | undefined = undefined;

    for (const t of types) {
        const { transform, opacity, clipPath } = computeSingleExitTransform(progress, t);
        if (transform && transform !== 'translate(0, 0)' && transform !== 'none') {
            combinedTransform += (combinedTransform ? ' ' : '') + transform;
        }
        if (opacity < minOpacity) minOpacity = opacity;
        if (clipPath && !firstClipPath) firstClipPath = clipPath;
    }

    if (!combinedTransform) combinedTransform = 'translate(0, 0)';
    return { transform: combinedTransform, opacity: minOpacity, clipPath: firstClipPath };
};

const computeSingleExitTransform = (
    progress: number,
    type: TransitionType
): { transform: string; opacity: number; clipPath?: string } => {
    if (type === 'none' || progress <= 0) {
        return { transform: 'translate(0, 0)', opacity: 1 };
    }

    const p = Math.min(Math.max(progress, 0), 1);
    const ep = easeIn(p);
    const offset = ep * 100;

    switch (type) {
        case 'slide-left':
            return { transform: `translateX(-${offset}%)`, opacity: 1 };
        case 'slide-right':
            return { transform: `translateX(${offset}%)`, opacity: 1 };
        case 'slide-up':
            return { transform: `translateY(-${offset}%)`, opacity: 1 };
        case 'slide-down':
            return { transform: `translateY(${offset}%)`, opacity: 1 };

        case 'push-left':
            return { transform: `translateX(-${offset}%)`, opacity: 1 };
        case 'push-right':
            return { transform: `translateX(${offset}%)`, opacity: 1 };

        case 'zoom-in': {
            const scale = 1 + ep * 0.8; // 1.0 → 1.8
            return { transform: `scale(${scale})`, opacity: 1 - ep };
        }
        case 'zoom-out': {
            const scale = 1 - ep * 0.7; // 1.0 → 0.3
            return { transform: `scale(${scale})`, opacity: 1 - ep };
        }

        case 'crossfade':
            return { transform: 'translate(0, 0)', opacity: 1 - ep };

        case 'wipe-left':
            return { transform: 'translate(0, 0)', opacity: 1, clipPath: `inset(0 0 0 ${offset}%)` };
        case 'wipe-right':
            return { transform: 'translate(0, 0)', opacity: 1, clipPath: `inset(0 ${offset}% 0 0)` };
        case 'wipe-up':
            return { transform: 'translate(0, 0)', opacity: 1, clipPath: `inset(${offset}% 0 0 0)` };
        case 'wipe-down':
            return { transform: 'translate(0, 0)', opacity: 1, clipPath: `inset(0 0 ${offset}% 0)` };

        case 'spin-in': {
            const scale = 1 - ep * 0.5;
            const rot = ep * 90;
            return { transform: `scale(${scale}) rotate(-${rot}deg)`, opacity: 1 - ep };
        }

        case 'glitch-cut': {
            const flickerPattern = [1, 0, 1, 0, 0.5, 0, 1, 0];
            const idx = Math.floor(p * flickerPattern.length);
            const opac = idx < flickerPattern.length ? flickerPattern[idx] : 0;
            return { transform: `translateX(${(Math.random() - 0.5) * 3}%)`, opacity: opac };
        }

        default:
            return { transform: 'translate(0, 0)', opacity: 1 };
    }
};

/**
 * Computes the full transition state for a clip at a given local frame.
 * Returns CSS properties for the clip's visual element.
 */
export const getClipTransitionStyle = (
    clip: Clip,
    localFrame: number
): { transform: string; opacity: number; zIndex: number; clipPath?: string } => {
    const dur = clip.transitionDurationFrames || DEFAULT_TRANSITION_FRAMES;
    const clipDuration = clip.endFrame - clip.startFrame;

    let transform = 'translate(0, 0)';
    let opacity = 1;
    let zIndex = 20;
    let clipPath: string | undefined;

    // Enter transition (first N frames of clip)
    const enterType = clip.transitionEnter || 'none';
    if (enterType !== 'none' && (!Array.isArray(enterType) || enterType.length > 0) && localFrame < dur) {
        const progress = localFrame / dur;
        const enter = getEnterTransform(progress, enterType as any);
        transform = enter.transform;
        opacity = enter.opacity;
        clipPath = enter.clipPath;
        zIndex = 30;
    }

    // Exit transition (last N frames of clip)
    const exitType = clip.transitionExit || 'none';
    if (exitType !== 'none' && (!Array.isArray(exitType) || exitType.length > 0) && localFrame > clipDuration - dur) {
        const framesFromEnd = clipDuration - localFrame;
        const progress = 1 - (framesFromEnd / dur);
        const exit = getExitTransform(progress, exitType as any);
        transform = exit.transform;
        opacity = exit.opacity;
        clipPath = exit.clipPath;
        zIndex = 10;
    }

    return { transform, opacity, zIndex, clipPath };
};
