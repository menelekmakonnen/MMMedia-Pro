// ══════════════════════════════════════════════════════════════════════════════
// subcategoryResolver.ts — Turns subcategory SELECTIONS into real engine behaviour.
//
// generatorModeConfig.ts describes 57 subcategories with `engineBehavior` prose.
// That prose is documentation, not code — the generator never read it, so a
// "Product Trailer" and a "Meme Edit" produced identical output. This module is
// the missing translator: each (mode, subcategoryId) maps to a concrete, distinct
// Partial<TrailerSettings>. When the user picks one or more subcategories, the
// engine actually edits differently.
//
// Layering: EGE output-type recipe (ege/styleRecipes) → SUBCATEGORY overrides
// (here) → social genre recipe (socialMediaRecipes) → explicit user toggles.
// Multiple active subcategories stack; later ones win on conflicting keys.
//
// Type-safe: only verified enum literals and numeric/boolean knobs are used, so
// this compiles against the real TrailerSettings. Pure & dependency-light.
// ══════════════════════════════════════════════════════════════════════════════

import type { TrailerSettings } from './trailerGenerator';

type Sub = Partial<TrailerSettings>;

// ─── TRAILER ──────────────────────────────────────────────────────────────────
const trailer: Record<string, Sub> = {
    product: {
        shortestClip: 0.8, longestClip: 2.8, beatSyncStrategy: 'groove-ride',
        transitionStyle: 'mixed', transitionTypes: ['dissolve', 'zoom-through', 'fade'],
        zoomEnabled: true, zoomSpeed: 'slow', slowmoPolicy: 'slowmo',
        clipOrderMode: 'sequential', colorPerSection: true, autoFadeInOut: true,
    },
    film: {
        shortestClip: 1.0, longestClip: 4.0, beatSyncStrategy: 'transition-on-beat',
        transitionStyle: 'mixed', transitionTypes: ['dissolve', 'fade', 'fadeblack'],
        letterboxEnabled: true, colorPerSection: true, slowmoPolicy: 'slowmo',
        beatDropImpact: 'medium', autoFadeInOut: true,
    },
    'music-release': {
        shortestClip: 0.4, longestClip: 1.6, beatSyncStrategy: 'cut-on-beat',
        beatPattern: 'every', preferHighEnergy: true, transitionStyle: 'cuts-only',
        beatDropImpact: 'heavy',
    },
    brand: {
        shortestClip: 0.9, longestClip: 2.6, transitionStyle: 'mixed',
        transitionTypes: ['dissolve', 'wipeleft', 'fade'], colorPerSection: true,
        autoFadeInOut: true, beatSyncStrategy: 'groove-ride',
    },
    event: {
        shortestClip: 0.6, longestClip: 2.2, clipOrderMode: 'sequential', sequentialBy: 'date',
        beatSyncStrategy: 'groove-ride', preferHighEnergy: true, transitionStyle: 'mixed',
    },
    game: {
        shortestClip: 0.18, longestClip: 0.8, beatSyncStrategy: 'cut-on-beat', beatPattern: 'every',
        transitionStyle: 'mixed', transitionTypes: ['glitch', 'rgb-split', 'flash'],
        rgbSplitPolicy: 'per-beat', shakeEnabled: true, shakePolicy: 'on-every-beat', shakeType: 'impact',
        beatDropImpact: 'heavy', slowmoPolicy: 'hyper',
    },
    documentary: {
        shortestClip: 4.0, longestClip: 8.0, transitionStyle: 'mixed', transitionTypes: ['dissolve', 'fade'],
        beatSyncStrategy: 'groove-ride', zoomEnabled: true, zoomSpeed: 'slow',
        reframingStrategy: 'ken-burns', colorPerSection: true,
    },
    teaser: {
        targetDuration: 25, shortestClip: 0.5, longestClip: 2.0, allowDuplicates: false,
        transitionStyle: 'mixed', transitionTypes: ['fadeblack', 'fade'], beatDropImpact: 'maximum',
        autoFadeInOut: true,
    },
    recap: {
        shortestClip: 0.8, longestClip: 2.4, clipOrderMode: 'sequential', sequentialBy: 'date',
        transitionStyle: 'cuts-only', beatSyncStrategy: 'groove-ride',
    },
};

// ─── MUSIC VIDEO ──────────────────────────────────────────────────────────────
const musicVideo: Record<string, Sub> = {
    performance: {
        shortestClip: 0.3, longestClip: 1.4, beatSyncStrategy: 'cut-on-beat', beatPattern: 'downbeats',
        mvBeatAnchor: 'downbeat', preferHighEnergy: true, transitionStyle: 'cuts-only',
    },
    narrative: {
        shortestClip: 1.2, longestClip: 4.5, beatSyncStrategy: 'transition-on-beat',
        transitionStyle: 'mixed', transitionTypes: ['dissolve', 'fade'], colorPerSection: true,
    },
    'calm-spiritual': {
        shortestClip: 3.0, longestClip: 8.0, beatSyncStrategy: 'groove-ride',
        transitionStyle: 'transitions-only', transitionTypes: ['dissolve', 'fade'],
        slowmoPolicy: 'slowmo', smoothSlowmoPolicy: 'every-clip', colorPerSection: true, zoomEnabled: true, zoomSpeed: 'slow',
    },
    action: {
        shortestClip: 0.18, longestClip: 0.7, beatSyncStrategy: 'effect-on-drop', beatPattern: 'drops',
        slowmoPolicies: ['fast', 'hyper'], motionBlurPolicy: 'per-beat', shakeEnabled: true,
        shakePolicy: 'heavy-beats-only', shakeType: 'impact', beatDropImpact: 'maximum', preferHighEnergy: true,
    },
    'lyric-visual': {
        shortestClip: 1.5, longestClip: 4.0, beatSyncStrategy: 'transition-on-beat',
        captionSource: 'lyrics', captionStyle: 'karaoke', transitionStyle: 'mixed',
    },
    dance: {
        shortestClip: 0.4, longestClip: 1.8, beatSyncStrategy: 'cut-on-beat', beatPattern: 'every',
        slowmoPolicies: ['slowmo', 'fast'], speedCurvePreset: 'ramp-freeze', preferHighEnergy: true,
    },
    aesthetic: {
        shortestClip: 1.0, longestClip: 3.0, transitionStyle: 'transitions-only',
        transitionTypes: ['dissolve', 'fade'], moodMatchEnabled: true, filmGrainAmount: 12,
        colorPerSection: true, slowmoPolicy: 'slowmo',
    },
    live: {
        shortestClip: 0.6, longestClip: 2.2, beatSyncStrategy: 'cut-on-beat', preferHighEnergy: true,
        transitionStyle: 'cuts-only', shakeEnabled: true, shakePolicy: 'sparingly', shakeType: 'handheld',
    },
};

// ─── SHOWREEL ─────────────────────────────────────────────────────────────────
const showreel: Record<string, Sub> = {
    actor: { shortestClip: 1.2, longestClip: 3.5, shotDiversityEnabled: true, moodMatchEnabled: true,
        transitionStyle: 'mixed', transitionTypes: ['dissolve', 'fade'], autoFadeInOut: true },
    director: { shortestClip: 1.0, longestClip: 3.0, shotDiversityEnabled: true, sceneGrouping: true,
        colorPerSection: true, transitionStyle: 'mixed' },
    cinematographer: { shortestClip: 1.5, longestClip: 4.0, shotDiversityEnabled: true, zoomEnabled: true,
        zoomSpeed: 'smooth', colorPerSection: true, transitionStyle: 'transitions-only', transitionTypes: ['dissolve'] },
    vfx: { shortestClip: 0.8, longestClip: 2.6, transitionStyle: 'mixed', transitionTypes: ['zoom-through', 'glitch', 'dissolve'],
        beatDropImpact: 'medium' },
    editor: { shortestClip: 0.3, longestClip: 2.5, transitionStyle: 'mixed', returnTransitions: true,
        returnTransitionFrequency: 60, beatSyncStrategy: 'transition-on-beat', preferHighEnergy: true },
    model: { targetDuration: 75, shortestClip: 0.8, longestClip: 2.4, shotDiversityEnabled: true,
        transitionStyle: 'mixed', transitionTypes: ['dissolve', 'wipeleft'] },
    photographer: { shortestClip: 2.0, longestClip: 5.0, reframingStrategy: 'ken-burns', zoomEnabled: true,
        zoomSpeed: 'slow', transitionStyle: 'transitions-only', transitionTypes: ['dissolve', 'fade'] },
};

// ─── VIDEO ESSAY ──────────────────────────────────────────────────────────────
const videoEssay: Record<string, Sub> = {
    analysis: { shortestClip: 2.0, longestClip: 6.0, audioMixStrategy: 'ducking', captionSource: 'srt',
        captionStyle: 'cinematic-sub', transitionStyle: 'cuts-only' },
    commentary: { shortestClip: 1.0, longestClip: 4.0, audioMixStrategy: 'ducking', captionSource: 'srt',
        captionStyle: 'minimal', transitionStyle: 'cuts-only' },
    explainer: { shortestClip: 1.5, longestClip: 5.0, audioMixStrategy: 'ducking', captionStyle: 'minimal',
        transitionStyle: 'cuts-only', clipOrderMode: 'sequential' },
    review: { shortestClip: 1.2, longestClip: 4.0, audioMixStrategy: 'ducking', captionStyle: 'pop-stack',
        transitionStyle: 'mixed' },
    'documentary-essay': { shortestClip: 6.0, longestClip: 10.0, audioMixStrategy: 'ducking',
        reframingStrategy: 'ken-burns', transitionStyle: 'transitions-only', transitionTypes: ['dissolve', 'fade'], colorPerSection: true },
    educational: { shortestClip: 1.5, longestClip: 5.0, audioMixStrategy: 'ducking', captionStyle: 'minimal',
        clipOrderMode: 'sequential', transitionStyle: 'cuts-only' },
};

// ─── SHORT FILM ───────────────────────────────────────────────────────────────
const shortFilm: Record<string, Sub> = {
    drama: { shortestClip: 1.5, longestClip: 6.0, audioMixStrategy: 'original', transitionStyle: 'mixed',
        transitionTypes: ['dissolve', 'fade'], colorPerSection: true },
    comedy: { shortestClip: 0.6, longestClip: 3.0, audioMixStrategy: 'original', transitionStyle: 'cuts-only',
        beatSyncStrategy: 'auto' },
    horror: { shortestClip: 1.0, longestClip: 7.0, audioMixStrategy: 'original', autoTrimSilence: false,
        transitionStyle: 'mixed', transitionTypes: ['fadeblack', 'dissolve'], zoomEnabled: true, zoomSpeed: 'slow',
        desaturationBuildup: true, vignetteAmount: 40 },
    'action-film': { shortestClip: 0.2, longestClip: 1.2, transitionStyle: 'mixed', transitionTypes: ['flash', 'zoom-through'],
        slowmoPolicies: ['fast', 'hyper'], motionBlurPolicy: 'per-beat', beatDropImpact: 'heavy' },
    experimental: { shortestClip: 0.4, longestClip: 4.0, clipOrderMode: 'randomize', transitionStyle: 'mixed',
        transitionTypes: ['glitch', 'rgb-split', 'dissolve'], hueCyclePolicy: 'sparingly' },
    'music-driven': { shortestClip: 0.5, longestClip: 3.0, beatSyncStrategy: 'cut-on-beat', beatPattern: 'downbeats',
        mvBeatAnchor: 'downbeat', colorPerSection: true },
    silent: { shortestClip: 1.5, longestClip: 6.0, audioMixStrategy: 'muted', transitionStyle: 'mixed',
        transitionTypes: ['fadeblack', 'dissolve'], letterboxEnabled: true, colorPerSection: true },
};

// ─── SOCIAL MEDIA ─────────────────────────────────────────────────────────────
const socialMedia: Record<string, Sub> = {
    'talking-head': { shortestClip: 0.8, longestClip: 4.0, audioMixStrategy: 'original', autoTrimSilence: true,
        captionStyle: 'tiktok-bold', captionSource: 'srt', zoomEnabled: true, zoomSpeed: 'fast',
        reframingStrategy: 'smart-pan', outputAspectRatios: ['9:16'] },
    'viral-hook': { targetDuration: 30, shortestClip: 0.4, longestClip: 1.6, preferHighEnergy: true,
        beatSyncStrategy: 'cut-on-beat', captionStyle: 'hormozi', outputAspectRatios: ['9:16'], beatDropImpact: 'heavy' },
    boomerang: { targetDuration: 3, boomerangAll: true, boomerangFrequency: 100, speedCurvePreset: 'oscillating',
        outputAspectRatios: ['9:16'] },
    'before-after': { shortestClip: 0.8, longestClip: 3.0, transitionStyle: 'mixed', transitionTypes: ['wipeleft', 'slideleft'],
        captionStyle: 'pop-stack', outputAspectRatios: ['9:16'] },
    carousel: { shortestClip: 2.0, longestClip: 5.0, clipOrderMode: 'sequential', transitionStyle: 'mixed',
        transitionTypes: ['slideleft', 'wipeleft'], colorPerSection: true, outputAspectRatios: ['4:5'] },
    reaction: { shortestClip: 0.6, longestClip: 3.0, audioMixStrategy: 'original', zoomEnabled: true, zoomSpeed: 'fast',
        captionStyle: 'meme-impact', outputAspectRatios: ['9:16'] },
    'transition-trend': { shortestClip: 0.3, longestClip: 1.2, beatSyncStrategy: 'transition-on-beat', beatPattern: 'every',
        transitionStyle: 'transitions-only', transitionTypes: ['whip', 'zoom-through', 'slideleft'], returnTransitions: true,
        returnTransitionFrequency: 50, outputAspectRatios: ['9:16'] },
    'asmr-satisfying': { shortestClip: 3.0, longestClip: 6.0, audioMixStrategy: 'original', transitionStyle: 'transitions-only',
        transitionTypes: ['dissolve'], shakeEnabled: false, zoomEnabled: true, zoomSpeed: 'slow', outputAspectRatios: ['9:16'] },
    'day-in-life': { shortestClip: 0.8, longestClip: 2.0, clipOrderMode: 'sequential', sequentialBy: 'date',
        transitionStyle: 'mixed', transitionTypes: ['whip', 'slideleft'], preferHighEnergy: true, outputAspectRatios: ['9:16'] },
    'tutorial-short': { targetDuration: 45, shortestClip: 0.8, longestClip: 3.0, clipOrderMode: 'sequential',
        captionStyle: 'minimal', slowmoPolicy: 'fast', outputAspectRatios: ['9:16'] },
    'meme-edit': { shortestClip: 0.12, longestClip: 0.5, beatSyncStrategy: 'cut-on-beat', beatPattern: 'every',
        shakeEnabled: true, shakePolicy: 'on-every-beat', shakeType: 'impact', zoomEnabled: true, zoomBeatSync: true,
        rgbSplitPolicy: 'per-beat', slowmoPolicy: 'hyper', beatDropImpact: 'maximum', captionStyle: 'meme-impact',
        outputAspectRatios: ['9:16'] },
    'cinematic-reel': { shortestClip: 1.0, longestClip: 3.5, letterboxEnabled: true, slowmoPolicy: 'slowmo',
        smoothSlowmoPolicy: 'every-clip', filmGrainAmount: 14, colorPerSection: true,
        transitionStyle: 'transitions-only', transitionTypes: ['dissolve', 'fade'], outputAspectRatios: ['9:16'] },
};

// ─── BTS ──────────────────────────────────────────────────────────────────────
const bts: Record<string, Sub> = {
    'film-bts': { shortestClip: 0.8, longestClip: 3.0, clipOrderMode: 'sequential', audioMixStrategy: 'subtle',
        transitionStyle: 'mixed', transitionTypes: ['dissolve', 'wipeleft'] },
    'music-video-bts': { shortestClip: 0.6, longestClip: 2.5, beatSyncStrategy: 'groove-ride', audioMixStrategy: 'subtle',
        preferHighEnergy: true, transitionStyle: 'mixed' },
    'event-bts': { shortestClip: 0.7, longestClip: 2.4, clipOrderMode: 'sequential', sequentialBy: 'date',
        transitionStyle: 'mixed', preferHighEnergy: true },
    'photoshoot-bts': { shortestClip: 1.0, longestClip: 3.0, reframingStrategy: 'ken-burns', zoomEnabled: true,
        zoomSpeed: 'slow', transitionStyle: 'mixed', transitionTypes: ['dissolve', 'fade'] },
    'studio-session': { shortestClip: 1.0, longestClip: 4.0, audioMixStrategy: 'original', transitionStyle: 'cuts-only' },
    'travel-bts': { shortestClip: 0.8, longestClip: 2.6, clipOrderMode: 'sequential', sequentialBy: 'date',
        transitionStyle: 'mixed', transitionTypes: ['whip', 'slideleft'], colorPerSection: true },
    'production-diary': { shortestClip: 1.0, longestClip: 3.0, clipOrderMode: 'sequential', sequentialBy: 'date',
        captionStyle: 'minimal', transitionStyle: 'cuts-only' },
    'making-of': { shortestClip: 1.2, longestClip: 4.5, audioMixStrategy: 'ducking', transitionStyle: 'mixed',
        transitionTypes: ['dissolve', 'fade'], colorPerSection: true },
};

const BY_MODE: Record<string, Record<string, Sub>> = {
    trailer, 'music-video': musicVideo, showreel, 'video-essay': videoEssay,
    'short-film': shortFilm, 'social-media': socialMedia, bts,
};

/**
 * Resolve the active subcategories of a mode into a single merged
 * Partial<TrailerSettings>. Multiple active subcategories stack; later entries
 * win on conflicting keys. Returns {} when nothing matches, so callers can spread
 * it unconditionally.
 */
export function resolveSubcategories(mode: string | undefined, activeSubcategories: string[] | undefined): Sub {
    if (!mode || !activeSubcategories || activeSubcategories.length === 0) return {};
    const dict = BY_MODE[mode];
    if (!dict) return {};
    let merged: Sub = {};
    for (const subId of activeSubcategories) {
        const override = dict[subId];
        if (override) merged = { ...merged, ...override };
    }
    return merged;
}

/** True when a concrete override exists for this mode + subcategory. */
export function hasSubcategoryOverride(mode: string, subId: string): boolean {
    return !!BY_MODE[mode]?.[subId];
}
