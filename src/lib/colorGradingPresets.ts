/**
 * Color Grading Presets — Professional look libraries for instant stylization.
 * ════════════════════════════════════════════════════════════════════════════════
 * Curated presets organized by genre/mood. Each preset modifies the ColorGrading
 * parameters to achieve a specific visual feel. Designed for direct application
 * to clips or project-wide use.
 *
 * Presets are non-destructive — they produce a ColorGrading object that can be
 * applied, mixed, or further adjusted.
 */

import type { ColorGrading } from './colorGrading';
import { DEFAULT_COLOR_GRADING } from './colorGrading';

// ─── Preset Categories ───────────────────────────────────────────────────────

export type PresetCategory =
    | 'cinematic' | 'music-video' | 'retro' | 'documentary'
    | 'horror' | 'romance' | 'action' | 'sci-fi'
    | 'social-media' | 'neutral';

export interface ColorPreset {
    id: string;
    name: string;
    category: PresetCategory;
    description: string;
    /** The color grading values (merged over defaults) */
    grading: Partial<ColorGrading>;
    /** Optional LUT file reference */
    lutFile?: string;
}

// ─── Cinematic Presets ───────────────────────────────────────────────────────

const CINEMATIC_PRESETS: ColorPreset[] = [
    {
        id: 'cin-teal-orange',
        name: 'Teal & Orange',
        category: 'cinematic',
        description: 'Classic Hollywood blockbuster look with warm skin tones and cool shadows',
        grading: {
            temperature: 15,
            contrast: 1.2,
            saturation: 1.15,
            shadows: -20,
            highlights: 10,
            lift: [-0.05, 0.05, 0.1],
            gain: [0.1, 0.02, -0.05],
        },
    },
    {
        id: 'cin-desaturated',
        name: 'Desaturated Cinema',
        category: 'cinematic',
        description: 'Muted, understated look for serious drama',
        grading: {
            saturation: 0.65,
            contrast: 1.15,
            exposure: -0.1,
            shadows: -15,
            vibrance: 0.7,
        },
    },
    {
        id: 'cin-golden-hour',
        name: 'Golden Hour',
        category: 'cinematic',
        description: 'Warm, sun-drenched glow as if shot at magic hour',
        grading: {
            temperature: 35,
            exposure: 0.15,
            saturation: 1.2,
            highlights: 20,
            shadows: 10,
            vibrance: 1.3,
            gain: [0.08, 0.04, -0.03],
        },
    },
    {
        id: 'cin-bleach-bypass',
        name: 'Bleach Bypass',
        category: 'cinematic',
        description: 'High contrast, desaturated look inspired by film processing',
        grading: {
            contrast: 1.5,
            saturation: 0.5,
            exposure: -0.1,
            highlights: 30,
            shadows: -30,
        },
    },
    {
        id: 'cin-moonlight',
        name: 'Moonlight Blue',
        category: 'cinematic',
        description: 'Cool, ethereal nighttime feel',
        grading: {
            temperature: -40,
            exposure: -0.2,
            contrast: 1.1,
            saturation: 0.8,
            lift: [0, 0.02, 0.08],
            gamma: [0.95, 0.98, 1.05],
        },
    },
];

// ─── Music Video Presets ─────────────────────────────────────────────────────

const MUSIC_VIDEO_PRESETS: ColorPreset[] = [
    {
        id: 'mv-neon-pop',
        name: 'Neon Pop',
        category: 'music-video',
        description: 'Vivid, oversaturated colors for high-energy performances',
        grading: {
            saturation: 1.5,
            vibrance: 1.6,
            contrast: 1.3,
            temperature: 5,
            highlights: 20,
        },
    },
    {
        id: 'mv-moody-rnb',
        name: 'Moody R&B',
        category: 'music-video',
        description: 'Dark, intimate look with warm undertones',
        grading: {
            exposure: -0.3,
            contrast: 1.25,
            saturation: 0.85,
            temperature: 20,
            shadows: -25,
            lift: [0.03, 0, -0.02],
        },
    },
    {
        id: 'mv-pastel-dream',
        name: 'Pastel Dream',
        category: 'music-video',
        description: 'Soft, lifted look with pastel tones',
        grading: {
            exposure: 0.2,
            contrast: 0.85,
            saturation: 0.75,
            shadows: 30,
            highlights: -10,
            vibrance: 1.1,
            lift: [0.05, 0.03, 0.05],
        },
    },
    {
        id: 'mv-high-contrast-bw',
        name: 'High Contrast B&W',
        category: 'music-video',
        description: 'Dramatic black and white with deep blacks',
        grading: {
            saturation: 0,
            contrast: 1.6,
            exposure: -0.1,
            highlights: 25,
            shadows: -35,
        },
    },
];

// ─── Retro Presets ───────────────────────────────────────────────────────────

const RETRO_PRESETS: ColorPreset[] = [
    {
        id: 'ret-vhs',
        name: 'VHS Nostalgia',
        category: 'retro',
        description: 'Faded, slightly shifted colors mimicking VHS degradation',
        grading: {
            saturation: 0.7,
            contrast: 0.9,
            exposure: 0.1,
            temperature: 10,
            shadows: 15,
            lift: [0.05, 0.02, -0.02],
        },
    },
    {
        id: 'ret-70s-film',
        name: '70s Film Stock',
        category: 'retro',
        description: 'Warm, faded look of 1970s cinema',
        grading: {
            temperature: 25,
            saturation: 0.8,
            contrast: 0.95,
            highlights: -10,
            shadows: 20,
            gain: [0.06, 0.03, -0.04],
            lift: [0.04, 0.02, 0],
        },
    },
    {
        id: 'ret-polaroid',
        name: 'Polaroid',
        category: 'retro',
        description: 'Instant camera look with lifted blacks and warm tones',
        grading: {
            contrast: 0.85,
            temperature: 15,
            saturation: 0.9,
            shadows: 25,
            vibrance: 0.85,
            lift: [0.06, 0.04, 0.02],
        },
    },
    {
        id: 'ret-cross-process',
        name: 'Cross Process',
        category: 'retro',
        description: 'Film cross-processing look with unnatural color shifts',
        grading: {
            saturation: 1.3,
            contrast: 1.2,
            temperature: -15,
            tint: 15,
            lift: [-0.05, 0.05, 0.02],
            gamma: [0.9, 1.1, 0.95],
            gain: [0.05, -0.03, 0.08],
        },
    },
];

// ─── Documentary Presets ─────────────────────────────────────────────────────

const DOCUMENTARY_PRESETS: ColorPreset[] = [
    {
        id: 'doc-natural',
        name: 'Natural Documentary',
        category: 'documentary',
        description: 'Clean, honest look that preserves natural colors',
        grading: {
            contrast: 1.05,
            saturation: 0.95,
            vibrance: 1.05,
            shadows: 5,
        },
    },
    {
        id: 'doc-gritty',
        name: 'Gritty Documentary',
        category: 'documentary',
        description: 'High contrast, slightly desaturated for raw, authentic feel',
        grading: {
            contrast: 1.3,
            saturation: 0.75,
            exposure: -0.1,
            shadows: -15,
            highlights: 15,
        },
    },
];

// ─── Genre-Specific Presets ──────────────────────────────────────────────────

const GENRE_PRESETS: ColorPreset[] = [
    {
        id: 'gen-horror',
        name: 'Horror',
        category: 'horror',
        description: 'Cold, desaturated with deep shadows and green undertones',
        grading: {
            temperature: -30,
            saturation: 0.6,
            contrast: 1.35,
            exposure: -0.25,
            shadows: -30,
            tint: -15,
            lift: [-0.02, 0.03, 0],
        },
    },
    {
        id: 'gen-romance',
        name: 'Romance',
        category: 'romance',
        description: 'Warm, soft, slightly overexposed with pink undertones',
        grading: {
            temperature: 20,
            exposure: 0.15,
            contrast: 0.9,
            saturation: 1.1,
            shadows: 15,
            vibrance: 1.2,
            lift: [0.04, 0.01, 0.03],
        },
    },
    {
        id: 'gen-action',
        name: 'Action',
        category: 'action',
        description: 'High contrast, slightly cooled with punchy colors',
        grading: {
            contrast: 1.4,
            saturation: 1.1,
            temperature: -10,
            highlights: 15,
            shadows: -20,
        },
    },
    {
        id: 'gen-scifi',
        name: 'Sci-Fi',
        category: 'sci-fi',
        description: 'Cool, clinical look with cyan/blue highlights',
        grading: {
            temperature: -25,
            contrast: 1.2,
            saturation: 0.85,
            exposure: -0.1,
            lift: [0, 0.02, 0.06],
            gain: [-0.03, 0.02, 0.08],
        },
    },
];

// ─── Social Media Presets ────────────────────────────────────────────────────

const SOCIAL_PRESETS: ColorPreset[] = [
    {
        id: 'soc-instagram-warm',
        name: 'Instagram Warm',
        category: 'social-media',
        description: 'Warm, slightly faded look popular on social media',
        grading: {
            temperature: 20,
            contrast: 0.9,
            saturation: 1.1,
            shadows: 15,
            vibrance: 1.15,
        },
    },
    {
        id: 'soc-clean-bright',
        name: 'Clean & Bright',
        category: 'social-media',
        description: 'Bright, airy look for lifestyle content',
        grading: {
            exposure: 0.2,
            contrast: 0.95,
            saturation: 1.05,
            shadows: 20,
            highlights: -5,
            vibrance: 1.1,
        },
    },
];

// ─── Registry ────────────────────────────────────────────────────────────────

/** All available color presets. */
export const COLOR_PRESETS: ColorPreset[] = [
    ...CINEMATIC_PRESETS,
    ...MUSIC_VIDEO_PRESETS,
    ...RETRO_PRESETS,
    ...DOCUMENTARY_PRESETS,
    ...GENRE_PRESETS,
    ...SOCIAL_PRESETS,
];

/** Preset registry indexed by ID. */
export const PRESET_MAP: Record<string, ColorPreset> = Object.fromEntries(
    COLOR_PRESETS.map(p => [p.id, p]),
);

/**
 * Get a preset by ID.
 * @throws If preset not found.
 */
export function getColorPreset(id: string): ColorPreset {
    const preset = PRESET_MAP[id];
    if (!preset) throw new Error(`Unknown color preset: "${id}"`);
    return preset;
}

/**
 * Get all presets in a category.
 */
export function getPresetsByCategory(category: PresetCategory): ColorPreset[] {
    return COLOR_PRESETS.filter(p => p.category === category);
}

/**
 * Apply a preset to produce a full ColorGrading object.
 * Merges preset values over defaults.
 */
export function applyPreset(presetId: string): ColorGrading {
    const preset = getColorPreset(presetId);
    return { ...DEFAULT_COLOR_GRADING, ...preset.grading };
}

/**
 * Blend two ColorGrading objects by a factor.
 * factor=0 returns grading A, factor=1 returns grading B.
 */
export function blendGradings(a: ColorGrading, b: ColorGrading, factor: number): ColorGrading {
    const t = Math.max(0, Math.min(1, factor));
    const lerp = (va: number, vb: number) => va + (vb - va) * t;
    const lerpArr = (
        arrA: [number, number, number] | undefined,
        arrB: [number, number, number] | undefined,
    ): [number, number, number] | undefined => {
        if (!arrA && !arrB) return undefined;
        const a3 = arrA || [0, 0, 0];
        const b3 = arrB || [0, 0, 0];
        return [lerp(a3[0], b3[0]), lerp(a3[1], b3[1]), lerp(a3[2], b3[2])];
    };

    return {
        temperature: lerp(a.temperature, b.temperature),
        tint: lerp(a.tint, b.tint),
        exposure: lerp(a.exposure, b.exposure),
        contrast: lerp(a.contrast, b.contrast),
        highlights: lerp(a.highlights, b.highlights),
        shadows: lerp(a.shadows, b.shadows),
        saturation: lerp(a.saturation, b.saturation),
        vibrance: lerp(a.vibrance, b.vibrance),
        lift: lerpArr(a.lift, b.lift),
        gamma: lerpArr(a.gamma, b.gamma),
        gain: lerpArr(a.gain, b.gain),
        lutFile: t < 0.5 ? a.lutFile : b.lutFile,
    };
}

/**
 * Get presets recommended for a project type.
 */
export function getRecommendedPresets(
    projectType: 'trailer' | 'music-video' | 'showreel' | 'video-essay' | 'short-film',
): ColorPreset[] {
    const categoryMap: Record<string, PresetCategory[]> = {
        'trailer': ['cinematic', 'action'],
        'music-video': ['music-video', 'retro'],
        'showreel': ['cinematic', 'neutral'],
        'video-essay': ['documentary', 'social-media'],
        'short-film': ['cinematic', 'horror', 'romance', 'sci-fi'],
    };
    const cats = categoryMap[projectType] || ['cinematic'];
    return COLOR_PRESETS.filter(p => cats.includes(p.category));
}
