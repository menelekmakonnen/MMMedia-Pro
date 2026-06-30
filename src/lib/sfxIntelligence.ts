/**
 * SFX Intelligence Engine
 *
 * Maps editing effects (transitions, boomerangs, impacts, drops, risers) to
 * appropriate SFX audio clips with context-aware volume scaling, pitch
 * variation, and dual-track allocation so two SFX can overlap.
 *
 * Rules:
 *  - SFX volume is always subordinate to the main audio track.
 *  - The same SFX file never plays twice in a row unless it has a different pitch.
 *  - Two dedicated SFX tracks (102, 103) allow overlapping SFX playback.
 *  - Pitch shift is expressed as a speed multiplier on the clip (0.8–1.3).
 */

import { v4 as uuidv4 } from 'uuid';
import type { Clip, TransitionType, BoomerangPresetId } from '../types';

/** Cross-platform path join (avoids Node `path` import in renderer) */
const pathJoin = (...parts: string[]) => parts.join('/').replace(/\/+/g, '/').replace(/\\/g, '/');

// ── SFX TRACK IDS ──────────────────────────────────────────────────
export const SFX_TRACK_A = 102;  // Primary SFX track
export const SFX_TRACK_B = 103;  // Secondary SFX track (for overlaps)

// ── SFX Descriptors ────────────────────────────────────────────────
/** Maps each bundled SFX file to its properties */
export interface SfxDescriptor {
    /** Relative path from assets/sfx/ */
    relativePath: string;
    /** Human-readable name */
    name: string;
    /** Category for matching */
    category: 'whoosh' | 'impact' | 'riser' | 'cinematic' | 'drop';
    /** Duration in seconds */
    durationSec: number;
    /** Default volume (0–100). SFX are quieter than music. */
    defaultVolume: number;
    /** Energy level 0–1 (low = subtle, high = punchy) */
    energy: number;
}

/** Bundled SFX library — seeded with generated assets */
export const BUNDLED_SFX: SfxDescriptor[] = [
    // Transitions / Whooshes
    { relativePath: 'transitions/whoosh-fast.mp3',     name: 'Whoosh Fast',     category: 'whoosh',    durationSec: 0.15, defaultVolume: 35, energy: 0.8 },
    { relativePath: 'transitions/whoosh-medium.mp3',   name: 'Whoosh Medium',   category: 'whoosh',    durationSec: 0.35, defaultVolume: 30, energy: 0.5 },
    { relativePath: 'transitions/whoosh-slow.mp3',     name: 'Whoosh Slow',     category: 'whoosh',    durationSec: 0.8,  defaultVolume: 25, energy: 0.3 },

    // Impacts
    { relativePath: 'impacts/hit-deep.mp3',            name: 'Hit Deep',        category: 'impact',    durationSec: 0.15, defaultVolume: 40, energy: 0.9 },
    { relativePath: 'impacts/hit-punch.mp3',           name: 'Hit Punch',       category: 'impact',    durationSec: 0.1,  defaultVolume: 38, energy: 0.85 },
    { relativePath: 'impacts/bass-drop.mp3',           name: 'Bass Drop',       category: 'drop',      durationSec: 0.2,  defaultVolume: 45, energy: 1.0 },

    // Risers
    { relativePath: 'risers/riser-up.mp3',             name: 'Riser Up',        category: 'riser',     durationSec: 1.5,  defaultVolume: 25, energy: 0.4 },
    { relativePath: 'risers/riser-down.mp3',           name: 'Riser Down',      category: 'riser',     durationSec: 0.5,  defaultVolume: 25, energy: 0.4 },

    // Cinematic
    { relativePath: 'cinematic/drone-low.mp3',         name: 'Drone Low',       category: 'cinematic', durationSec: 2.0,  defaultVolume: 18, energy: 0.2 },
    { relativePath: 'cinematic/tension-riser.mp3',     name: 'Tension Riser',   category: 'cinematic', durationSec: 0.5,  defaultVolume: 22, energy: 0.5 },
    { relativePath: 'cinematic/boom-cinematic.mp3',    name: 'Boom Cinematic',  category: 'cinematic', durationSec: 0.4,  defaultVolume: 42, energy: 0.95 },
];


// ── Transition → SFX Mapping ───────────────────────────────────────
/** Which SFX categories fit each transition type */
const TRANSITION_SFX_MAP: Record<string, SfxDescriptor['category'][]> = {
    // Quick / energetic transitions → whooshes + impacts
    'flash':           ['impact'],
    'white-flash':     ['impact'],
    'glitch':          ['impact', 'whoosh'],
    'rgb-split':       ['whoosh'],
    'zoom-through':    ['whoosh'],
    'whip':            ['whoosh'],
    'spin':            ['whoosh'],
    'pixelize':        ['impact'],

    // Smooth transitions → subtle whooshes
    'dissolve':        ['whoosh'],
    'fade':            [],  // No SFX for gentle fades
    'fadeblack':       [],
    'fadewhite':       [],
    'smoothleft':      ['whoosh'],
    'smoothright':     ['whoosh'],
    'wipeleft':        ['whoosh'],
    'wiperight':       ['whoosh'],

    // Special
    'boomerang':       ['whoosh', 'impact'],
    'film-burn':       ['cinematic'],
    'double-exposure': [],  // Too subtle for SFX
    'hblur':           ['whoosh'],
    'match-cut':       ['impact'],
    'seamless':        [],
    'cut':             [],
};

/** Which SFX categories fit each boomerang preset */
const BOOMERANG_SFX_MAP: Record<string, SfxDescriptor['category'][]> = {
    'classic':    ['whoosh'],
    'slowmo':     ['riser'],
    'stutter':    ['impact', 'whoosh'],
    'whiplash':   ['whoosh', 'impact'],
    'duo':        ['whoosh'],
    'echo':       ['cinematic'],
};

// ── Effect-type → energy mapping ───────────────────────────────────
const TRANSITION_ENERGY: Partial<Record<TransitionType, number>> = {
    'flash': 0.9, 'white-flash': 0.9, 'glitch': 0.8, 'rgb-split': 0.7,
    'zoom-through': 0.7, 'whip': 0.8, 'spin': 0.6, 'pixelize': 0.5,
    'dissolve': 0.2, 'smoothleft': 0.3, 'smoothright': 0.3,
    'wipeleft': 0.4, 'wiperight': 0.4, 'boomerang': 0.6,
    'film-burn': 0.3, 'hblur': 0.3, 'match-cut': 0.5,
};


// ── SFX Intelligence Core ──────────────────────────────────────────

export interface SfxPlacement {
    clip: Clip;
    track: typeof SFX_TRACK_A | typeof SFX_TRACK_B;
}

interface SfxSelectionContext {
    /** The transition or effect type that triggered this SFX */
    effectType: string;
    /** Energy level 0–1 of the moment in the edit */
    energy: number;
    /** Frame position in the timeline */
    framePosition: number;
    /** Duration of the visual effect in frames */
    effectDurationFrames: number;
}

/**
 * Resolves the absolute path to a bundled SFX file.
 * Works in both dev (project root) and packaged (resources) contexts.
 */
export function resolveSfxPath(relativePath: string, appPath?: string): string {
    const base = appPath || (typeof process !== 'undefined' && process.env?.PORTABLE_EXECUTABLE_DIR)
        || (typeof window !== 'undefined' && (window as any).__APP_PATH__)
        || '.';
    return pathJoin(base, 'assets', 'sfx', relativePath);
}

/**
 * Select the best SFX for a given effect context.
 * Filters by category match, then ranks by energy proximity.
 * Avoids repeating the same SFX as `lastUsed` unless pitch-shifted.
 */
function selectSfx(
    ctx: SfxSelectionContext,
    pool: SfxDescriptor[],
    lastUsedPath: string | null,
    rng: () => number,
): { sfx: SfxDescriptor; pitchShift: number } | null {
    // Determine allowed categories
    let allowedCategories: SfxDescriptor['category'][] = [];

    if (ctx.effectType in TRANSITION_SFX_MAP) {
        allowedCategories = TRANSITION_SFX_MAP[ctx.effectType] || [];
    } else if (ctx.effectType in BOOMERANG_SFX_MAP) {
        allowedCategories = BOOMERANG_SFX_MAP[ctx.effectType] || [];
    }

    if (allowedCategories.length === 0) return null;

    // Filter pool
    const candidates = pool.filter(s => allowedCategories.includes(s.category));
    if (candidates.length === 0) return null;

    // Score by energy proximity (closer energy match = better fit)
    const scored = candidates.map(sfx => ({
        sfx,
        score: 1 - Math.abs(sfx.energy - ctx.energy) + rng() * 0.3, // slight randomness
    })).sort((a, b) => b.score - a.score);

    // Pick the best that isn't a same-file repeat
    let chosen = scored[0];
    let pitchShift = 1.0;

    if (chosen.sfx.relativePath === lastUsedPath) {
        // Same SFX as last time — try to pick a different one
        if (scored.length > 1) {
            chosen = scored[1];
        } else {
            // Only one candidate — pitch-shift it
            pitchShift = 0.85 + rng() * 0.3; // 0.85–1.15
        }
    }

    return { sfx: chosen.sfx, pitchShift };
}


/**
 * Compute volume for an SFX clip based on context.
 * SFX is always quiet relative to music (max ~45%).
 */
function computeSfxVolume(sfx: SfxDescriptor, energy: number): number {
    // Base volume from descriptor, modulated by energy
    const base = sfx.defaultVolume;
    const energyMod = 0.7 + energy * 0.3; // 0.7–1.0 multiplier
    return Math.round(Math.min(50, base * energyMod)); // Never exceed 50%
}


/**
 * Generate SFX clips for an entire edit sequence.
 *
 * Scans the generated clip sequence for transitions and boomerangs,
 * then places appropriate SFX on tracks 102/103.
 *
 * @param sequence - The generated clip array (video + audio clips on tracks 1, 2, 101)
 * @param fps - Project frame rate
 * @param appPath - Application root path for resolving bundled SFX files
 * @param sfxPool - SFX descriptors to choose from (defaults to BUNDLED_SFX)
 * @returns Array of SFX clips to append to the sequence
 */
export function generateSfxClips(
    sequence: Clip[],
    fps: number,
    appPath?: string,
    sfxPool: SfxDescriptor[] = BUNDLED_SFX,
): Clip[] {
    const sfxClips: Clip[] = [];
    const rng = () => Math.random(); // Could be seeded if determinism needed

    // Track allocation: round-robin between A and B to allow overlap
    let nextTrack: typeof SFX_TRACK_A | typeof SFX_TRACK_B = SFX_TRACK_A;
    const trackEndFrame: Record<number, number> = { [SFX_TRACK_A]: 0, [SFX_TRACK_B]: 0 };

    // Consecutive repeat tracking
    let lastUsedPath: string | null = null;

    // Only process video clips (not audio, not PIP overlays)
    const videoClips = sequence.filter(c =>
        c.type !== 'audio' && !c.compositeOverlay && (c.track === 1 || c.track === undefined)
    ).sort((a, b) => a.startFrame - b.startFrame);

    for (let i = 0; i < videoClips.length; i++) {
        const clip = videoClips[i];

        // Check for transition SFX
        if (clip.transition && clip.transition.type !== 'cut') {
            const transType = clip.transition.type;
            const energy = TRANSITION_ENERGY[transType] ?? 0.5;
            const effectDurFrames = clip.transition.durationFrames || Math.round(0.3 * fps);

            const ctx: SfxSelectionContext = {
                effectType: transType,
                energy,
                framePosition: clip.endFrame - effectDurFrames, // SFX starts at transition point
                effectDurationFrames: effectDurFrames,
            };

            const result = selectSfx(ctx, sfxPool, lastUsedPath, rng);
            if (result) {
                const { sfx, pitchShift } = result;
                const sfxPath = resolveSfxPath(sfx.relativePath, appPath);
                const sfxDurFrames = Math.round(sfx.durationSec * fps);
                const sfxVolume = computeSfxVolume(sfx, energy);

                // Place SFX at the transition point (slightly before the clip boundary)
                const startFrame = Math.max(0, clip.endFrame - Math.round(effectDurFrames * 0.6));
                const endFrame = startFrame + sfxDurFrames;

                // Allocate to whichever track is free (round-robin with overlap check)
                let track: number = nextTrack;
                if (trackEndFrame[track] > startFrame) {
                    // This track is busy — use the other
                    track = track === SFX_TRACK_A ? SFX_TRACK_B : SFX_TRACK_A;
                }

                const sfxClip: Clip = {
                    id: uuidv4(),
                    type: 'audio',
                    path: sfxPath,
                    filename: sfx.name.replace(/\s+/g, '-').toLowerCase() + '.mp3',
                    startFrame,
                    endFrame,
                    sourceDurationFrames: sfxDurFrames,
                    trimStartFrame: 0,
                    trimEndFrame: sfxDurFrames,
                    track,
                    speed: pitchShift,  // Pitch shift via speed change
                    volume: sfxVolume,
                    reversed: false,
                    locked: false,
                    origin: 'auto',
                    isMuted: false,
                };

                sfxClips.push(sfxClip);
                trackEndFrame[track] = endFrame;
                nextTrack = track === SFX_TRACK_A ? SFX_TRACK_B : SFX_TRACK_A;
                lastUsedPath = sfx.relativePath;
            }
        }

        // Check for boomerang SFX
        if (clip.boomerang && clip.boomerangPreset) {
            const presetId = clip.boomerangPreset;
            const energy = 0.6; // Boomerangs are mid-energy
            const effectDurFrames = clip.endFrame - clip.startFrame;

            const ctx: SfxSelectionContext = {
                effectType: presetId,
                energy,
                framePosition: clip.startFrame,
                effectDurationFrames: effectDurFrames,
            };

            const result = selectSfx(ctx, sfxPool, lastUsedPath, rng);
            if (result) {
                const { sfx, pitchShift } = result;
                const sfxPath = resolveSfxPath(sfx.relativePath, appPath);
                const sfxDurFrames = Math.round(sfx.durationSec * fps);
                const sfxVolume = computeSfxVolume(sfx, energy);

                const startFrame = clip.startFrame;
                const endFrame = startFrame + sfxDurFrames;

                let track: number = nextTrack;
                if (trackEndFrame[track] > startFrame) {
                    track = track === SFX_TRACK_A ? SFX_TRACK_B : SFX_TRACK_A;
                }

                const sfxClip: Clip = {
                    id: uuidv4(),
                    type: 'audio',
                    path: sfxPath,
                    filename: sfx.name.replace(/\s+/g, '-').toLowerCase() + '.mp3',
                    startFrame,
                    endFrame,
                    sourceDurationFrames: sfxDurFrames,
                    trimStartFrame: 0,
                    trimEndFrame: sfxDurFrames,
                    track,
                    speed: pitchShift,
                    volume: sfxVolume,
                    reversed: false,
                    locked: false,
                    origin: 'auto',
                    isMuted: false,
                };

                sfxClips.push(sfxClip);
                trackEndFrame[track] = endFrame;
                nextTrack = track === SFX_TRACK_A ? SFX_TRACK_B : SFX_TRACK_A;
                lastUsedPath = sfx.relativePath;
            }
        }
    }

    return sfxClips;
}
