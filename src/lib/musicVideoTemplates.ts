/**
 * Music Video Templates — pre-built editorial personalities
 * ════════════════════════════════════════════════════════════════════════════
 * Each template encapsulates a creative direction for a music video: how shots
 * are distributed (performance / b-roll / establishing), which transitions and
 * effects are used, per-section pacing overrides, and the overall color mood.
 *
 * Templates are intentionally data-only — they feed into `planMusicVideo` and
 * the upcoming `buildMusicVideoClips` layer without importing any DOM / store /
 * Electron code, so they remain fully unit-testable.
 */

import type { SegmentType } from './audioAnalysisCore';
import type { TransitionType } from '../types';
import type { MvPacingProfile, EffectIntensity } from './musicVideo';
import { MV_SECTION_PACING } from './musicVideo';

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export type MvTemplateId =
    | 'performance'
    | 'narrative'
    | 'concept'
    | 'lyric-video'
    | 'cinematic'
    | 'retro'
    | 'hype';

export interface MvTemplate {
    /** Unique template identifier. */
    id: MvTemplateId;
    /** Human-readable display name. */
    name: string;
    /** Short description of the editorial personality. */
    description: string;
    /**
     * Shot-type distribution as percentages (should sum to 100).
     * - `performance` — artist / band / vocalist footage
     * - `broll`       — cutaways, detail shots, narrative footage
     * - `establishing`— wide / location / environment shots
     */
    shotDistribution: { performance: number; broll: number; establishing: number };
    /**
     * Per-section pacing overrides. Fields not specified here fall back to the
     * global `MV_SECTION_PACING` defaults from `musicVideo.ts`.
     */
    pacingOverrides: Partial<Record<SegmentType, Partial<MvPacingProfile>>>;
    /** Allowed transitions for this template style. */
    transitionVocabulary: TransitionType[];
    /**
     * Per-section effect intensity overrides. Sections not listed fall back to
     * the default pacing effect for that section.
     */
    effectPalette: Partial<Record<SegmentType, EffectIntensity>>;
    /** Overall color grading mood. */
    colorMood: 'warm' | 'cool' | 'neutral' | 'desaturated' | 'high-contrast' | 'vintage';
    /** If true, reuse the same clip index for recurring musical motifs. */
    motifRepetition: boolean;
    /**
     * If true, interleave performance and narrative/b-roll clips within each
     * section rather than grouping them in blocks.
     */
    interleavePerformanceNarrative: boolean;
    /** Optional pool tag hints for clip selection (e.g. 'band', 'crowd'). */
    preferTags?: string[];
}

// ═══════════════════════════════════════════════════════
//  TEMPLATES
// ═══════════════════════════════════════════════════════

/** Classic stage/studio performance — fast cuts, warm tones, recurring motifs. */
const PERFORMANCE: MvTemplate = {
    id: 'performance',
    name: 'Performance',
    description: 'Classic performance video — cuts-heavy, warm colors, recurring motifs synced to the beat.',
    shotDistribution: { performance: 70, broll: 20, establishing: 10 },
    pacingOverrides: {
        chorus: { minShotS: 0.3, maxShotS: 0.8, fastCut: true },
        drop:   { minShotS: 0.15, maxShotS: 0.4, fastCut: true },
    },
    transitionVocabulary: ['cut', 'wipeleft', 'wiperight', 'slideleft', 'slideright'],
    effectPalette: {
        chorus: 'medium',
        drop:   'medium',
    },
    colorMood: 'warm',
    motifRepetition: true,
    interleavePerformanceNarrative: true,
    preferTags: ['band', 'vocalist', 'stage', 'crowd'],
};

/** Story-driven — dissolves, fades, subtle effects, no motif recycling. */
const NARRATIVE: MvTemplate = {
    id: 'narrative',
    name: 'Narrative',
    description: 'Story-driven video — slow dissolves and fades, neutral palette, no motif recycling.',
    shotDistribution: { performance: 0, broll: 80, establishing: 20 },
    pacingOverrides: {
        verse:     { minShotS: 1.5, maxShotS: 3.0, fastCut: false },
        chorus:    { minShotS: 1.0, maxShotS: 2.0, fastCut: false },
        breakdown: { minShotS: 2.0, maxShotS: 4.0, fastCut: false },
    },
    transitionVocabulary: ['dissolve', 'fade', 'fadeblack', 'fadewhite'],
    effectPalette: {
        intro:     'subtle',
        verse:     'subtle',
        chorus:    'subtle',
        buildup:   'subtle',
        drop:      'subtle',
        breakdown: 'subtle',
        bridge:    'subtle',
        outro:     'subtle',
    },
    colorMood: 'neutral',
    motifRepetition: false,
    interleavePerformanceNarrative: false,
    preferTags: ['story', 'character', 'location'],
};

/** Abstract / art-directed — geometric transitions, heavy effects, cool tones. */
const CONCEPT: MvTemplate = {
    id: 'concept',
    name: 'Concept',
    description: 'Art-directed concept video — geometric transitions, heavy effects, cool palette.',
    shotDistribution: { performance: 30, broll: 50, establishing: 20 },
    pacingOverrides: {
        buildup: { minShotS: 0.25, maxShotS: 0.7, speed: 1.1, fastCut: true },
        drop:    { minShotS: 0.15, maxShotS: 0.35, speed: 1.15, fastCut: true },
    },
    transitionVocabulary: ['circlecrop', 'circleopen', 'circleclose', 'radial', 'pixelize'],
    effectPalette: {
        intro:   'medium',
        buildup: 'heavy',
        drop:    'heavy',
        chorus:  'heavy',
    },
    colorMood: 'cool',
    motifRepetition: false,
    interleavePerformanceNarrative: false,
    preferTags: ['abstract', 'art', 'visual-effect'],
};

/** Lyrics front-and-center — minimal transitions, no effects, neutral. */
const LYRIC_VIDEO: MvTemplate = {
    id: 'lyric-video',
    name: 'Lyric Video',
    description: 'Lyric-focused — minimal cuts and dissolves, no effects, neutral palette.',
    shotDistribution: { performance: 10, broll: 70, establishing: 20 },
    pacingOverrides: {
        verse:  { minShotS: 2.0, maxShotS: 4.0, fastCut: false },
        chorus: { minShotS: 1.5, maxShotS: 3.0, fastCut: false },
    },
    transitionVocabulary: ['cut', 'dissolve'],
    effectPalette: {
        intro:     'none',
        verse:     'none',
        chorus:    'none',
        buildup:   'none',
        drop:      'none',
        breakdown: 'none',
        bridge:    'none',
        outro:     'none',
    },
    colorMood: 'neutral',
    motifRepetition: false,
    interleavePerformanceNarrative: false,
    preferTags: ['typography', 'background', 'texture'],
};

/** Cinematic / short-film feel — fades, slow pacing, desaturated. */
const CINEMATIC: MvTemplate = {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Cinematic — slow fades and dissolves, desaturated palette, wide establishing shots.',
    shotDistribution: { performance: 20, broll: 40, establishing: 40 },
    pacingOverrides: {
        intro:     { minShotS: 1.5, maxShotS: 3.5, speed: 0.95, fastCut: false },
        verse:     { minShotS: 1.5, maxShotS: 3.5, speed: 0.95, fastCut: false },
        chorus:    { minShotS: 1.0, maxShotS: 2.5, speed: 1.0,  fastCut: false },
        breakdown: { minShotS: 2.0, maxShotS: 5.0, speed: 0.8,  fastCut: false },
        outro:     { minShotS: 2.5, maxShotS: 5.0, speed: 0.75, fastCut: false },
    },
    transitionVocabulary: ['fade', 'fadeblack', 'dissolve'],
    effectPalette: {
        intro:     'subtle',
        verse:     'subtle',
        chorus:    'subtle',
        buildup:   'subtle',
        drop:      'subtle',
        breakdown: 'subtle',
        bridge:    'subtle',
        outro:     'subtle',
    },
    colorMood: 'desaturated',
    motifRepetition: false,
    interleavePerformanceNarrative: true,
    preferTags: ['landscape', 'wide', 'drone', 'slow-mo'],
};

/** Retro / VHS aesthetic — glitch and film-burn transitions, heavy VHS effects, vintage. */
const RETRO: MvTemplate = {
    id: 'retro',
    name: 'Retro',
    description: 'Retro / VHS aesthetic — glitch and film-burn transitions, heavy VHS effects, vintage palette.',
    shotDistribution: { performance: 50, broll: 30, establishing: 20 },
    pacingOverrides: {
        verse:  { minShotS: 0.7, maxShotS: 1.8, speed: 1.0, fastCut: false },
        chorus: { minShotS: 0.3, maxShotS: 0.9, speed: 1.0, fastCut: true },
        drop:   { minShotS: 0.2, maxShotS: 0.5, speed: 1.05, fastCut: true },
    },
    transitionVocabulary: ['glitch', 'film-burn', 'pixelize', 'rgb-split', 'cut'],
    effectPalette: {
        intro:   'medium',
        verse:   'medium',
        buildup: 'heavy',
        drop:    'heavy',
        chorus:  'heavy',
        bridge:  'medium',
        outro:   'medium',
    },
    colorMood: 'vintage',
    motifRepetition: true,
    interleavePerformanceNarrative: true,
    preferTags: ['retro', 'vhs', 'analog', 'grain'],
};

/** Hype / energy edit — flash, glitch, zoom-through, whip; heavy everything, high-contrast. */
const HYPE: MvTemplate = {
    id: 'hype',
    name: 'Hype',
    description: 'Maximum energy — flash/glitch/zoom/whip transitions, heavy effects, high-contrast palette.',
    shotDistribution: { performance: 60, broll: 30, establishing: 10 },
    pacingOverrides: {
        intro:   { minShotS: 0.15, maxShotS: 0.4, speed: 1.1, fastCut: true },
        verse:   { minShotS: 0.5,  maxShotS: 1.2, speed: 1.05, fastCut: true },
        buildup: { minShotS: 0.2,  maxShotS: 0.5, speed: 1.15, fastCut: true },
        drop:    { minShotS: 0.1,  maxShotS: 0.3, speed: 1.2,  fastCut: true },
        chorus:  { minShotS: 0.2,  maxShotS: 0.6, speed: 1.1,  fastCut: true },
    },
    transitionVocabulary: ['flash', 'glitch', 'zoom-through', 'whip', 'rgb-split', 'cut'],
    effectPalette: {
        intro:     'heavy',
        verse:     'medium',
        buildup:   'heavy',
        drop:      'heavy',
        chorus:    'heavy',
        breakdown: 'medium',
        bridge:    'medium',
        outro:     'medium',
    },
    colorMood: 'high-contrast',
    motifRepetition: true,
    interleavePerformanceNarrative: true,
    preferTags: ['action', 'crowd', 'energy', 'hype'],
};

// ═══════════════════════════════════════════════════════
//  REGISTRY
// ═══════════════════════════════════════════════════════

/** All available music-video templates, keyed by id. */
export const MV_TEMPLATES: Record<MvTemplateId, MvTemplate> = {
    'performance':  PERFORMANCE,
    'narrative':    NARRATIVE,
    'concept':      CONCEPT,
    'lyric-video':  LYRIC_VIDEO,
    'cinematic':    CINEMATIC,
    'retro':        RETRO,
    'hype':         HYPE,
};

// ═══════════════════════════════════════════════════════
//  ACCESSORS
// ═══════════════════════════════════════════════════════

/**
 * Retrieve a template by id.
 * @throws if `id` is not a known template.
 */
export function getMvTemplate(id: MvTemplateId): MvTemplate {
    const tpl = MV_TEMPLATES[id];
    if (!tpl) throw new Error(`Unknown music-video template: "${id}"`);
    return tpl;
}

/**
 * Resolve the effective pacing profile for a given template and segment type.
 *
 * Any fields overridden in the template's `pacingOverrides` for that segment
 * are merged on top of the global `MV_SECTION_PACING` defaults; unspecified
 * fields fall through to the defaults.
 *
 * If the template's `effectPalette` overrides the effect for this segment that
 * value takes precedence over both the pacing-override effect and the default.
 */
export function getMvTemplatePacing(
    templateId: MvTemplateId,
    segmentType: SegmentType,
): MvPacingProfile {
    const tpl = getMvTemplate(templateId);
    const base = MV_SECTION_PACING[segmentType] ?? MV_SECTION_PACING.verse;
    const override = tpl.pacingOverrides[segmentType];

    const merged: MvPacingProfile = {
        ...base,
        ...(override ?? {}),
    };

    // Effect-palette entry takes final precedence.
    const paletteEffect = tpl.effectPalette[segmentType];
    if (paletteEffect !== undefined) {
        merged.effect = paletteEffect;
    }

    return merged;
}
