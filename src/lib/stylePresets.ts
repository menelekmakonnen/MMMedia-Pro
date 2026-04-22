/**
 * Style Presets Library
 * Loadable, extensible editing style configurations.
 * Users can import/export custom presets as JSON.
 */

import { EditingStyleConfig, EditingStyleOption } from './trailerGenerator';

// ═══════════════════════════════════════════════════════
//  PRESET TYPES
// ═══════════════════════════════════════════════════════

export interface StylePreset {
    id: string;
    name: string;
    description: string;
    category: 'cinematic' | 'social' | 'music-video' | 'documentary' | 'experimental' | 'custom';
    config: EditingStyleConfig;
    styles: EditingStyleOption[];
    tags: string[];
    author?: string;
    version?: number;
}

export interface StylePresetLibrary {
    presets: StylePreset[];
    version: number;
}

// ═══════════════════════════════════════════════════════
//  BUILT-IN PRESETS
// ═══════════════════════════════════════════════════════

export const BUILT_IN_PRESETS: StylePreset[] = [
    {
        id: 'default',
        name: 'Standard',
        description: 'Balanced mix of speed ramps and boomerangs',
        category: 'cinematic',
        config: {
            rampFastSpeed: 2.5,
            rampSlowSpeed: 0.25,
            fastPortion: 0.12,
            slowPortion: 0.38,
            zoomRange: 145,
            boomerangSlices: 4,
            reversalChance: 0.85,
            burstMode: 'short',
        },
        styles: ['rubber-band-standard', 'multi-boomerang'],
        tags: ['balanced', 'all-purpose'],
    },
    {
        id: 'film-trailer',
        name: 'Film Trailer',
        description: 'Deep slow-mo hero shots with aggressive speed ramps',
        category: 'cinematic',
        config: {
            rampFastSpeed: 3.5,
            rampSlowSpeed: 0.15,
            fastPortion: 0.08,
            slowPortion: 0.5,
            zoomRange: 130,
            boomerangSlices: 2,
            reversalChance: 0.4,
            burstMode: 'long',
        },
        styles: ['rubber-band-zoom-speed', 'rubber-band-standard'],
        tags: ['dramatic', 'slow-mo', 'cinematic'],
    },
    {
        id: 'tiktok-fire',
        name: 'TikTok Fire',
        description: 'Rapid-fire cuts with tight boomerang loops',
        category: 'social',
        config: {
            rampFastSpeed: 4.0,
            rampSlowSpeed: 0.4,
            fastPortion: 0.2,
            slowPortion: 0.2,
            zoomRange: 180,
            boomerangSlices: 3,
            reversalChance: 1.0,
            burstMode: 'short',
        },
        styles: ['multi-boomerang', 'triple-shot'],
        tags: ['fast', 'viral', 'social'],
    },
    {
        id: 'music-video-groove',
        name: 'Music Video Groove',
        description: 'Beat-locked speed ramps with zoom pulses',
        category: 'music-video',
        config: {
            rampFastSpeed: 3.0,
            rampSlowSpeed: 0.3,
            fastPortion: 0.15,
            slowPortion: 0.35,
            zoomRange: 160,
            boomerangSlices: 4,
            reversalChance: 0.9,
            burstMode: 'short',
        },
        styles: ['rubber-band-zoom', 'multi-boomerang', 'rubber-band-zoom-speed'],
        tags: ['rhythmic', 'energetic', 'beat-sync'],
    },
    {
        id: 'documentary-clean',
        name: 'Documentary Clean',
        description: 'Subtle speed shifts, minimal effects, professional pacing',
        category: 'documentary',
        config: {
            rampFastSpeed: 1.8,
            rampSlowSpeed: 0.6,
            fastPortion: 0.05,
            slowPortion: 0.45,
            zoomRange: 115,
            boomerangSlices: 2,
            reversalChance: 0.15,
            burstMode: 'long',
        },
        styles: ['rubber-band-standard'],
        tags: ['clean', 'professional', 'subtle'],
    },
    {
        id: 'hyperbeast',
        name: 'Hyperbeast',
        description: 'Maximum chaos — every effect at maximum intensity',
        category: 'experimental',
        config: {
            rampFastSpeed: 4.0,
            rampSlowSpeed: 0.15,
            fastPortion: 0.3,
            slowPortion: 0.2,
            zoomRange: 200,
            boomerangSlices: 4,
            reversalChance: 1.0,
            burstMode: 'short',
        },
        styles: ['rubber-band-zoom-speed', 'multi-boomerang', 'triple-shot', 'rubber-band-zoom'],
        tags: ['extreme', 'chaos', 'experimental'],
    },
    {
        id: 'wedding-dreamy',
        name: 'Wedding Dreamy',
        description: 'Soft, flowing speed shifts with gentle zoom drifts',
        category: 'cinematic',
        config: {
            rampFastSpeed: 1.5,
            rampSlowSpeed: 0.35,
            fastPortion: 0.06,
            slowPortion: 0.5,
            zoomRange: 120,
            boomerangSlices: 2,
            reversalChance: 0.3,
            burstMode: 'long',
        },
        styles: ['rubber-band-standard', 'rubber-band-zoom'],
        tags: ['romantic', 'soft', 'elegant'],
    },
    {
        id: 'action-sports',
        name: 'Action Sports',
        description: 'Punchy speed ramps with aggressive reversals',
        category: 'cinematic',
        config: {
            rampFastSpeed: 3.8,
            rampSlowSpeed: 0.2,
            fastPortion: 0.18,
            slowPortion: 0.3,
            zoomRange: 170,
            boomerangSlices: 3,
            reversalChance: 0.95,
            burstMode: 'short',
        },
        styles: ['rubber-band-zoom-speed', 'multi-boomerang', 'triple-shot'],
        tags: ['action', 'sports', 'dynamic'],
    },
];

// ═══════════════════════════════════════════════════════
//  PRESET MANAGEMENT
// ═══════════════════════════════════════════════════════

const STORAGE_KEY = 'mmm_style_presets';

/** Load all presets (built-in + user custom) */
export const loadStylePresets = (): StylePreset[] => {
    const custom = loadCustomPresets();
    return [...BUILT_IN_PRESETS, ...custom];
};

/** Load only user-created custom presets from localStorage */
export const loadCustomPresets = (): StylePreset[] => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as StylePresetLibrary;
        return parsed.presets || [];
    } catch {
        return [];
    }
};

/** Save a custom preset */
export const saveCustomPreset = (preset: StylePreset): void => {
    const existing = loadCustomPresets();
    const idx = existing.findIndex(p => p.id === preset.id);
    if (idx >= 0) existing[idx] = preset;
    else existing.push(preset);

    const lib: StylePresetLibrary = { presets: existing, version: 1 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lib));
};

/** Delete a custom preset */
export const deleteCustomPreset = (id: string): void => {
    const existing = loadCustomPresets().filter(p => p.id !== id);
    const lib: StylePresetLibrary = { presets: existing, version: 1 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lib));
};

/** Export presets to a JSON string (for file export) */
export const exportPresetsToJSON = (presets?: StylePreset[]): string => {
    const lib: StylePresetLibrary = {
        presets: presets || loadCustomPresets(),
        version: 1,
    };
    return JSON.stringify(lib, null, 2);
};

/** Import presets from a JSON string */
export const importPresetsFromJSON = (json: string): StylePreset[] => {
    try {
        const parsed = JSON.parse(json) as StylePresetLibrary;
        if (!parsed.presets || !Array.isArray(parsed.presets)) return [];

        // Validate each preset has required fields
        return parsed.presets.filter(p =>
            p.id && p.name && p.config &&
            typeof p.config.rampFastSpeed === 'number' &&
            typeof p.config.rampSlowSpeed === 'number'
        );
    } catch {
        return [];
    }
};

/** Get a preset by ID */
export const getPresetById = (id: string): StylePreset | undefined => {
    return loadStylePresets().find(p => p.id === id);
};

/** Get presets by category */
export const getPresetsByCategory = (category: StylePreset['category']): StylePreset[] => {
    return loadStylePresets().filter(p => p.category === category);
};
