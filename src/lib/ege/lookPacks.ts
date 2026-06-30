// ══════════════════════════════════════════════════════════════════════════════
// lookPacks.ts — AE-derived "look packs" for the Edit/Grid Generator Engine.
//
// A look pack is a curated bundle of parametric effects (from EFFECT_REGISTRY)
// that recreates a recognisable After Effects tutorial look. Applying a pack sets
// `ProjectSettings.globalEffects`, which trailerGenerator.ts already stamps onto
// every generated clip as `parametricEffects` — so a generated edit (or grid)
// automatically carries the look end-to-end, in both the preview proxy and the
// final export.
//
// This is the AUTOMATED counterpart to the Sequence page's step-by-step
// EffectsBrowser: there a user applies effects clip-by-clip; here the engine
// applies a whole look in one shot.
//
// NOTE: globalEffects params are numeric only (Record<string, number>), so packs
// only reference effects whose parameters are numeric. Effects with a default
// toggle/select param (e.g. find_edges' `invert`) still work — the resolver fills
// the default when the param is omitted.
// ══════════════════════════════════════════════════════════════════════════════

import type { ProjectSettings } from '../../types';
import type { StyleId } from './styleRecipes';
import { getEffectById } from '../effectRegistry';

/** One effect inside a look pack. Params are numeric (globalEffects constraint). */
export interface LookPackEffect {
    effectId: string;
    params: Record<string, number>;
}

export interface LookPack {
    id: string;
    name: string;
    description: string;
    /** Output styles this look suits best (UI hint only — packs work on any edit). */
    suitedFor?: StyleId[];
    effects: LookPackEffect[];
    /** Optional companion note: typed clip FX (e.g. glow bloom) that pair well but
     *  live outside the parametric system. Surfaced in the UI, not auto-applied. */
    pairWith?: string;
}

// ── The packs ────────────────────────────────────────────────────────────────
// Each maps onto one or more of the AE techniques the effects were built from.
export const LOOK_PACKS: LookPack[] = [
    {
        id: 'glowing_outline',
        name: 'Glowing Outline',
        description: 'Find Edges → Curves → Tint: a stylised neon outline of the subject. Great for hooks and intros.',
        suitedFor: ['music-video', 'social-beatcut', 'trailer'],
        effects: [
            { effectId: 'glowing_edges', params: { intensity: 65 } },
        ],
        pairWith: 'Add a Glow (bloom) on the clip for the full "Deep Glow" finish.',
    },
    {
        id: 'cinematic_tritone',
        name: 'Cinematic Tritone',
        description: 'Teal-orange tritone grade with a light film pass — a clean, modern cinematic colour mood.',
        suitedFor: ['trailer', 'video-essay', 'showreel'],
        effects: [
            { effectId: 'tritone', params: { intensity: 65, warmth: 60 } },
            { effectId: 'film_emulation', params: { strength: 35, grain: 8 } },
        ],
    },
    {
        id: 'film_stock',
        name: 'Film Stock',
        description: 'FilmConvert-style emulation: lifted toe, rolled highlights, gentle desaturation and grain.',
        suitedFor: ['short-film', 'video-essay', 'showreel'],
        effects: [
            { effectId: 'film_emulation', params: { strength: 70, grain: 14 } },
        ],
    },
    {
        id: 'glitch_kick',
        name: 'Glitch Kick',
        description: 'Digital-damage glitch plus horizontal turbulence — high-energy distortion for drops and cuts.',
        suitedFor: ['music-video', 'social-beatcut'],
        effects: [
            { effectId: 'digital_glitch', params: { intensity: 55 } },
            { effectId: 'turbulent_displace', params: { amount: 10, scale: 7 } },
        ],
    },
    {
        id: 'dream_wobble',
        name: 'Dream Wobble',
        description: 'Gentle Wave Warp float with a soft saturation lift — a dreamy, organic drift for text or ambient B-roll.',
        suitedFor: ['social-quote', 'video-essay'],
        effects: [
            { effectId: 'wave_warp', params: { amplitude: 5, wavelength: 20, speed: 2.5 } },
            { effectId: 'hue_saturation', params: { hue: 0, sat: 1.15 } },
        ],
    },
    {
        id: 'psychedelic_shift',
        name: 'Psychedelic Shift',
        description: 'Master-hue rotation into a cool tritone — a vivid, trippy colour treatment.',
        suitedFor: ['music-video'],
        effects: [
            { effectId: 'hue_saturation', params: { hue: 40, sat: 1.4 } },
            { effectId: 'tritone', params: { intensity: 40, warmth: -40 } },
        ],
    },
    {
        id: 'xray',
        name: 'X-Ray',
        description: 'Inverted, high-contrast X-ray base with a subtle mosaic texture and tinted midtones.',
        suitedFor: ['music-video', 'social-beatcut'],
        effects: [
            { effectId: 'invert', params: {} },
            { effectId: 'brightness_contrast', params: { brightness: 0.2, contrast: 1.6 } },
            { effectId: 'mosaic', params: { size: 3 } },
            { effectId: 'tritone', params: { intensity: 45, warmth: -30 } },
        ],
        pairWith: 'Add a Glow (Threshold ~40, Radius ~45) on the clip for the luminous X-ray finish.',
    },
    {
        id: 'gritty_threshold',
        name: 'Gritty Threshold',
        description: 'Noise + hard threshold — a high-contrast, gritty two-tone treatment.',
        suitedFor: ['music-video', 'social-beatcut'],
        effects: [
            { effectId: 'threshold', params: { level: 140 } },
            { effectId: 'film_grain', params: { intensity: 18 } },
        ],
    },
    {
        id: 'turbulent_divide_warp',
        name: 'Turbulent Divide Warp',
        description: 'Horizontal turbulent displacement with an exposure rebalance — the "Turbulent Displace + Divide" warp.',
        suitedFor: ['music-video', 'trailer'],
        effects: [
            { effectId: 'turbulent_displace', params: { amount: 16, scale: 8 } },
            { effectId: 'exposure', params: { ev: -0.3 } },
        ],
    },
];

const _packById = new Map<string, LookPack>(LOOK_PACKS.map((p) => [p.id, p]));

/** Look up a single look pack by id. */
export function getLookPack(id: string): LookPack | undefined {
    return _packById.get(id);
}

/**
 * Validate that every effect referenced by every pack exists in the registry and
 * carries only numeric params. Returns the list of problems (empty = all good).
 * Useful as a guard / in tests so a typo'd effectId can't ship a silent no-op.
 */
export function validateLookPacks(packs: LookPack[] = LOOK_PACKS): string[] {
    const problems: string[] = [];
    for (const pack of packs) {
        if (pack.effects.length === 0) problems.push(`${pack.id}: no effects`);
        for (const e of pack.effects) {
            if (!getEffectById(e.effectId)) {
                problems.push(`${pack.id}: unknown effect "${e.effectId}"`);
                continue;
            }
            for (const [k, v] of Object.entries(e.params)) {
                if (typeof v !== 'number' || !isFinite(v)) {
                    problems.push(`${pack.id}.${e.effectId}: param "${k}" is not a finite number`);
                }
            }
        }
    }
    return problems;
}

/**
 * Apply a look pack to project settings — sets `globalEffects` so the engine
 * stamps the look onto every generated clip. Returns a NEW settings object
 * (pure; never mutates the input). Passing `lookId === null` clears the look.
 */
export function applyLookPack(settings: ProjectSettings, lookId: string | null): ProjectSettings {
    if (lookId === null) {
        const { globalEffects: _drop, ...rest } = settings;
        return rest;
    }
    const pack = _packById.get(lookId);
    if (!pack) return settings;
    return {
        ...settings,
        globalEffects: pack.effects.map((e) => ({ effectId: e.effectId, params: { ...e.params } })),
    };
}
