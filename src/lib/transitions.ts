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
 * Assigns random enter/exit transition types to a sequence of clips.
 * Filters by allowedTypes if provided.
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

    const pickMultiple = (count: number): TransitionType[] => {
        if (pool.length === 0) return ['none'];
        const countToPick = Math.min(count, pool.length);
        const picked = new Set<TransitionType>();
        let attempts = 0;
        while(picked.size < countToPick && attempts < 20) {
            picked.add(pool[Math.floor(Math.random() * pool.length)]);
            attempts++;
        }
        if (picked.size === 0) return ['none'];
        return Array.from(picked);
    };

    return clips.map((clip, i) => {
        const enterDirs: TransitionType[] = i === 0 ? ['none'] : pickMultiple(maxSimultaneousTransitions);
        const exitDirs: TransitionType[] = i === clips.length - 1 ? ['none'] : pickMultiple(maxSimultaneousTransitions);

        const clipDuration = clip.endFrame - clip.startFrame;
        const maxAllowedFrames = maxSimultaneousTransitions === 1
            ? Math.floor(clipDuration / 2)
            : clipDuration;

        let actualFrames = Math.min(transitionFrames, maxAllowedFrames);
        
        let finalEnter: TransitionType | TransitionType[] = enterDirs;
        let finalExit: TransitionType | TransitionType[] = exitDirs;
        if (actualFrames < 2) {
            finalEnter = 'none';
            finalExit = 'none';
        }

        return {
            ...clip,
            transitionEnter: finalEnter,
            transitionExit: finalExit,
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
