/**
 * socialMediaRecipes.ts — Named edit style recipes for viral social media content.
 *
 * Each recipe is a combination of TrailerSettings overrides + text/caption config +
 * aspect ratio + pacing rules that produces a specific viral edit style.
 *
 * Deeply connected to: trailerGenerator.ts (settings consumer), captionStyles.ts (text config),
 *                       editingModes.ts (templates), sequencePresets.ts (NLE presets),
 *                       EditWizard.tsx (Recipe Browser UI)
 */

import type { TrailerSettings } from './trailerGenerator';
import type { CaptionStyleId } from './captionStyles';
import type { TransitionType, EffectApplyPolicy, SpeedCurvePreset, ShakeType, ShakePolicy } from '../types';

// ── Types ────────────────────────────────────────────────────────────────────

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5' | '4:3' | '21:9';

export type RecipeId =
    | 'velocity-edit'
    | 'beat-sync'
    | 'aura-sigma'
    | 'cinematic-broll'
    | 'whip-montage'
    | 'pov-edit'
    | 'talking-head'
    | 'photo-montage'
    | 'product-showcase'
    | 'travel-vlog'
    | 'day-in-life'
    | 'recap-highlights'
    | 'lyric-video'
    | 'meme-edit'
    | 'phonk-edit';

export type RecipeCategory = 'trending' | 'cinematic' | 'content' | 'music' | 'comedy';

export interface SocialMediaRecipe {
    id: RecipeId;
    name: string;
    description: string;
    category: RecipeCategory;
    /** Emoji icon for UI display */
    icon: string;
    /** Recommended aspect ratios (first = default) */
    aspectRatios: AspectRatio[];
    /** Recommended duration range in seconds */
    durationRange: [number, number];
    /** TrailerSettings overrides that define this style */
    settings: Partial<TrailerSettings>;
    /** Caption style to auto-apply (user can override) */
    captionStyle?: CaptionStyleId;
    /** Whether captions are essential to the style (vs. optional) */
    captionsRequired?: boolean;
    /** Tags for search/filter in the Recipe Browser */
    tags: string[];
    /** Visual description shown on hover in the Recipe Browser */
    visualDescription: string;
    /** Difficulty level for UI display */
    complexity: 'simple' | 'intermediate' | 'advanced';
}

// ── Recipe Definitions ───────────────────────────────────────────────────────

const VELOCITY_EDIT: SocialMediaRecipe = {
    id: 'velocity-edit',
    name: 'Velocity Edit',
    description: 'Speed ramps synced to bass drops. Alternates between dramatic slow-mo and lightning-fast motion.',
    category: 'trending',
    icon: '⚡',
    aspectRatios: ['9:16', '1:1', '16:9'],
    durationRange: [15, 60],
    settings: {
        shortestClip: 0.3,
        longestClip: 2.5,
        slowmoPolicy: 'custom',
        customSpeedRange: [0.3, 3.0],
        customSpeedRangeEnabled: true,
        speedCurvePreset: 'burst-landing',
        speedCurvePresets: ['burst-landing', 'ramp-up', 'ramp-down', 's-curve'],
        speedCurveFrequency: 80,
        beatSyncStrategy: 'effect-on-drop',
        beatPattern: 'drops',
        enhancedBeatSync: true,
        motionBlurPolicy: 'per-beat' as EffectApplyPolicy,
        motionBlurAmount: 70,
        transitionStyle: 'cuts-only',
        zoomEnabled: true,
        zoomValues: [100, 130, 160],
        zoomBeatSync: true,
        filmGrainAmount: 3,
        preferHighEnergy: true,
        rhythmPattern: 'staccato-legato',
    },
    captionStyle: 'tiktok-bold',
    tags: ['speed-ramp', 'velocity', 'trending', 'tiktok', 'reels', 'bass-drop'],
    visualDescription: 'Clips accelerate and decelerate with the music — slow-motion lingers on impact moments, then snaps to fast-forward. Motion blur bleeds between speed changes. Best with bass-heavy tracks.',
    complexity: 'intermediate',
};

const BEAT_SYNC: SocialMediaRecipe = {
    id: 'beat-sync',
    name: 'Beat Sync Edit',
    description: 'Every cut lands exactly on a beat. Fast cuts on drops, breathable holds on verses.',
    category: 'trending',
    icon: '🎵',
    aspectRatios: ['9:16', '16:9', '1:1'],
    durationRange: [15, 90],
    settings: {
        shortestClip: 0.2,
        longestClip: 2.0,
        useAudioGuide: true,
        beatSyncStrategy: 'cut-on-beat',
        beatPattern: 'every',
        enhancedBeatSync: true,
        beatOffset: -1,
        transitionStyle: 'cuts-only',
        preferHighEnergy: true,
        rhythmPattern: 'breathing',
        beatDropImpact: 'medium',
    },
    tags: ['beat-sync', 'rhythm', 'music', 'trending', 'satisfying'],
    visualDescription: 'Clean, precise cuts that land on every beat. The rhythm of the music drives the visual pacing — you feel the music through the cuts. Drops get flash-zoom impacts.',
    complexity: 'simple',
};

const AURA_SIGMA: SocialMediaRecipe = {
    id: 'aura-sigma',
    name: 'Aura / Sigma Edit',
    description: 'Slow-mo + zoom + grain + vignette + bold text. The iconic "dark aura" aesthetic.',
    category: 'trending',
    icon: '🔮',
    aspectRatios: ['9:16', '1:1'],
    durationRange: [10, 30],
    settings: {
        shortestClip: 1.0,
        longestClip: 4.0,
        slowmoPolicy: 'slowmo',
        customSpeed: 0.5,
        transitionStyle: 'cuts-only',
        filmGrainAmount: 8,
        vignetteAmount: 60,
        chromaticAmount: 4,
        zoomEnabled: true,
        zoomValues: [100, 110, 120],
        zoomSpeed: 'slow',
        shakeEnabled: true,
        shakePolicy: 'sparingly' as ShakePolicy,
        shakeType: 'handheld' as ShakeType,
        shakeIntensity: 25,
        colorPerSection: false,
        preferHighEnergy: false,
        rhythmPattern: 'flat',
    },
    captionStyle: 'tiktok-bold',
    captionsRequired: true,
    tags: ['aura', 'sigma', 'dark', 'aesthetic', 'phonk', 'grindset', 'slow-mo'],
    visualDescription: 'Dark, moody slow-motion with heavy grain and vignette. Zooms slowly into the subject. Bold Impact text with motivational/character quotes. Phonk or dark bass music.',
    complexity: 'simple',
};

const CINEMATIC_BROLL: SocialMediaRecipe = {
    id: 'cinematic-broll',
    name: 'Cinematic B-Roll',
    description: 'Smooth gimbal-style movement, colour graded, music-driven. Professional filmmaker aesthetic.',
    category: 'cinematic',
    icon: '🎬',
    aspectRatios: ['16:9', '21:9', '9:16'],
    durationRange: [30, 120],
    settings: {
        shortestClip: 1.5,
        longestClip: 5.0,
        transitionStyle: 'transitions-only',
        transitionTypes: ['dissolve', 'seamless', 'fade'] as TransitionType[],
        transitionDurationMs: 400,
        autoColorGrade: true,
        globalStabilize: { enabled: true, smoothing: 15 },
        slowmoPolicy: 'slowmo',
        customSpeed: 0.8,
        filmGrainAmount: 2,
        letterboxEnabled: true,
        rhythmPattern: 'wave',
        preferHighEnergy: false,
    },
    tags: ['cinematic', 'b-roll', 'smooth', 'professional', 'filmmaker', 'gimbal'],
    visualDescription: 'Slow, deliberate camera movements with warm colour grading. Seamless dissolves between clips. Letterbox bars for a widescreen cinema look. No text overlays — the footage speaks.',
    complexity: 'simple',
};

const WHIP_MONTAGE: SocialMediaRecipe = {
    id: 'whip-montage',
    name: 'Whip Pan Montage',
    description: 'Every transition is a whip pan. Ultra-fast cuts, maximum energy.',
    category: 'trending',
    icon: '💨',
    aspectRatios: ['9:16', '16:9'],
    durationRange: [10, 45],
    settings: {
        shortestClip: 0.3,
        longestClip: 1.2,
        transitionStyle: 'transitions-only',
        transitionTypes: ['whip'] as TransitionType[],
        transitionDurationMs: 150,
        preferHighEnergy: true,
        beatSyncStrategy: 'cut-on-beat',
        beatPattern: 'every',
        enhancedBeatSync: true,
        rhythmPattern: 'pulse-2-1-2',
        motionBlurPolicy: 'every-clip' as EffectApplyPolicy,
        motionBlurAmount: 60,
    },
    tags: ['whip-pan', 'fast', 'energy', 'montage', 'dynamic'],
    visualDescription: 'Every single cut whips the camera sideways — creating a breathless, unstoppable montage. The motion blur between clips makes them feel connected. Best with high-BPM music.',
    complexity: 'simple',
};

const POV_EDIT: SocialMediaRecipe = {
    id: 'pov-edit',
    name: 'POV / First-Person',
    description: 'Shaky cam feel, speed ramps, text reactions. Immersive first-person storytelling.',
    category: 'content',
    icon: '👁️',
    aspectRatios: ['9:16', '16:9'],
    durationRange: [15, 60],
    settings: {
        shortestClip: 0.5,
        longestClip: 3.0,
        shakeEnabled: true,
        shakePolicy: 'on-every-beat' as ShakePolicy,
        shakeType: 'handheld' as ShakeType,
        shakeIntensity: 40,
        speedCurvePreset: 's-curve',
        speedCurveFrequency: 40,
        transitionStyle: 'cuts-only',
        zoomEnabled: true,
        zoomValues: [100, 115, 130],
        zoomSpeed: 'fast',
        rhythmPattern: 'heartbeat',
    },
    captionStyle: 'tiktok-bold',
    captionsRequired: true,
    tags: ['pov', 'first-person', 'immersive', 'storytelling', 'reaction'],
    visualDescription: 'Camera shakes like a handheld POV shot. Speed ramps in and out of key moments. Text overlays set the scenario: "POV: you just..." The viewer becomes the main character.',
    complexity: 'intermediate',
};

const TALKING_HEAD: SocialMediaRecipe = {
    id: 'talking-head',
    name: 'Talking Head + B-Roll',
    description: 'Auto-detect speech, cut to B-roll during pauses, highlight key points with text.',
    category: 'content',
    icon: '🗣️',
    aspectRatios: ['9:16', '16:9', '1:1'],
    durationRange: [30, 180],
    settings: {
        shortestClip: 2.0,
        longestClip: 8.0,
        autoTrimSilence: true,
        transitionStyle: 'mixed',
        transitionTypes: ['cut', 'dissolve'] as TransitionType[],
        transitionDurationMs: 200,
        zoomEnabled: true,
        zoomValues: [100, 105, 110],
        zoomSpeed: 'smooth',
        rhythmPattern: 'call-response',
    },
    captionStyle: 'hormozi',
    captionsRequired: true,
    tags: ['talking-head', 'education', 'tutorial', 'b-roll', 'business', 'speaking'],
    visualDescription: 'Speaker on camera with subtle zoom shifts for energy. B-roll cuts in during pauses to illustrate points. Word-by-word captions with yellow highlights on the active word. The Hormozi/education creator standard.',
    complexity: 'intermediate',
};

const PHOTO_MONTAGE: SocialMediaRecipe = {
    id: 'photo-montage',
    name: 'Photo Slideshow Edit',
    description: 'Ken Burns zoom on photos, beat-synced transitions. Turns still images into dynamic video.',
    category: 'content',
    icon: '📸',
    aspectRatios: ['9:16', '16:9', '1:1', '4:5'],
    durationRange: [15, 90],
    settings: {
        mediaType: 'all',
        shortestClip: 1.5,
        longestClip: 4.0,
        transitionStyle: 'transitions-only',
        transitionTypes: ['dissolve', 'fade', 'smoothleft', 'smoothright'] as TransitionType[],
        transitionDurationMs: 500,
        zoomEnabled: true,
        zoomValues: [100, 108, 115],
        zoomSpeed: 'slow',
        beatSyncStrategy: 'transition-on-beat',
        rhythmPattern: 'breathing',
    },
    tags: ['photo', 'slideshow', 'memories', 'ken-burns', 'images'],
    visualDescription: 'Photos slowly pan and zoom (Ken Burns effect) with smooth dissolves synced to music beats. Transforms a folder of photos into a cinematic memory reel.',
    complexity: 'simple',
};

const PRODUCT_SHOWCASE: SocialMediaRecipe = {
    id: 'product-showcase',
    name: 'Product Showcase',
    description: 'Clean transitions, close-up emphasis, text callouts. Professional product demo style.',
    category: 'content',
    icon: '🛍️',
    aspectRatios: ['9:16', '1:1', '4:5', '16:9'],
    durationRange: [15, 60],
    settings: {
        shortestClip: 1.0,
        longestClip: 3.5,
        transitionStyle: 'transitions-only',
        transitionTypes: ['dissolve', 'fade', 'circleopen'] as TransitionType[],
        transitionDurationMs: 300,
        autoColorGrade: true,
        zoomEnabled: true,
        zoomValues: [100, 110, 125],
        zoomSpeed: 'smooth',
        rhythmPattern: 'pulse-2-1-2',
    },
    captionStyle: 'minimal',
    tags: ['product', 'showcase', 'demo', 'ecommerce', 'clean', 'professional'],
    visualDescription: 'Clean, polished transitions between close-up product shots. Subtle zoom draws attention to details. Minimal text callouts for features. Auto-graded for consistent lighting.',
    complexity: 'simple',
};

const TRAVEL_VLOG: SocialMediaRecipe = {
    id: 'travel-vlog',
    name: 'Travel Vlog Edit',
    description: 'Drone + POV + time-lapses with location titles. The wanderlust edit.',
    category: 'cinematic',
    icon: '✈️',
    aspectRatios: ['9:16', '16:9'],
    durationRange: [30, 120],
    settings: {
        shortestClip: 1.0,
        longestClip: 4.0,
        transitionStyle: 'mixed',
        transitionTypes: ['dissolve', 'smoothleft', 'wipeleft', 'seamless'] as TransitionType[],
        transitionDurationMs: 350,
        autoColorGrade: true,
        globalStabilize: { enabled: true, smoothing: 12 },
        speedCurvePreset: 's-curve',
        speedCurveFrequency: 30,
        rhythmPattern: 'wave',
        filmGrainAmount: 1,
    },
    captionStyle: 'cinematic-sub',
    tags: ['travel', 'vlog', 'drone', 'adventure', 'wanderlust', 'location'],
    visualDescription: 'Mix of drone aerials, walking POV, and close-up details. Smooth transitions with stabilisation. Location titles in cinematic subtitle style. Warm colour grading for golden-hour feel.',
    complexity: 'intermediate',
};

const DAY_IN_LIFE: SocialMediaRecipe = {
    id: 'day-in-life',
    name: 'Day in the Life',
    description: 'Chronological edit with text timestamps. Casual, authentic daily vlog.',
    category: 'content',
    icon: '☀️',
    aspectRatios: ['9:16', '16:9'],
    durationRange: [30, 90],
    settings: {
        shortestClip: 1.5,
        longestClip: 5.0,
        clipOrderMode: 'sequential' as any,
        sequentialBy: 'date-modified' as any,
        transitionStyle: 'cuts-only',
        zoomEnabled: true,
        zoomValues: [100, 105],
        zoomSpeed: 'smooth',
        rhythmPattern: 'breathing',
        autoTrimSilence: true,
    },
    captionStyle: 'minimal',
    captionsRequired: true,
    tags: ['day-in-life', 'daily', 'routine', 'vlog', 'casual', 'authentic'],
    visualDescription: 'Clips arranged in chronological order with time-of-day text overlays. Clean cuts, no fancy transitions. Authentic, unpolished feel with subtle zoom for energy. Captions add context.',
    complexity: 'simple',
};

const RECAP_HIGHLIGHTS: SocialMediaRecipe = {
    id: 'recap-highlights',
    name: 'Recap / Highlights',
    description: 'Best moments first, fast cuts, energetic music. Event and sports recap style.',
    category: 'trending',
    icon: '🏆',
    aspectRatios: ['9:16', '16:9', '1:1'],
    durationRange: [15, 60],
    settings: {
        shortestClip: 0.3,
        longestClip: 1.5,
        preferHighEnergy: true,
        beatSyncStrategy: 'cut-on-beat',
        beatPattern: 'every',
        enhancedBeatSync: true,
        transitionStyle: 'mixed',
        transitionTypes: ['cut', 'flash', 'zoom-through'] as TransitionType[],
        beatDropImpact: 'heavy',
        speedCurvePreset: 'burst-landing',
        speedCurveFrequency: 60,
        rhythmPattern: 'accelerando',
        zoomEnabled: true,
        zoomValues: [100, 120, 140],
        zoomBeatSync: true,
    },
    captionStyle: 'pop-stack',
    tags: ['recap', 'highlights', 'best-of', 'event', 'sports', 'hype'],
    visualDescription: 'Highest-energy clips first, building intensity. Flash impacts on drops, zoom-throughs on transitions. Speed ramps emphasise key moments. Fast-paced, never letting the viewer breathe.',
    complexity: 'intermediate',
};

const LYRIC_VIDEO: SocialMediaRecipe = {
    id: 'lyric-video',
    name: 'Lyric Video',
    description: 'Full lyrics synced to music with minimal B-roll. The lyric/music video standard.',
    category: 'music',
    icon: '🎤',
    aspectRatios: ['16:9', '9:16'],
    durationRange: [60, 300],
    settings: {
        shortestClip: 2.0,
        longestClip: 8.0,
        useAudioGuide: true,
        beatSyncStrategy: 'groove-ride',
        transitionStyle: 'transitions-only',
        transitionTypes: ['dissolve', 'fade', 'seamless'] as TransitionType[],
        transitionDurationMs: 500,
        autoColorGrade: true,
        filmGrainAmount: 2,
        rhythmPattern: 'wave',
    },
    captionStyle: 'karaoke',
    captionsRequired: true,
    tags: ['lyric', 'music', 'karaoke', 'song', 'lyrics', 'word-sync'],
    visualDescription: 'Words light up on beat as the song plays. Background B-roll transitions smoothly between scenes. Each lyric line appears and fades with the vocal timing. Cinematic colour grading.',
    complexity: 'advanced',
};

const MEME_EDIT: SocialMediaRecipe = {
    id: 'meme-edit',
    name: 'Meme / Shitpost',
    description: 'Impact font, speed distortion, bass boost markers, controlled chaos.',
    category: 'comedy',
    icon: '💀',
    aspectRatios: ['9:16', '16:9', '1:1'],
    durationRange: [5, 30],
    settings: {
        shortestClip: 0.1,
        longestClip: 1.5,
        customSpeedRange: [0.2, 4.0],
        customSpeedRangeEnabled: true,
        speedCurvePresets: ['burst-landing', 'oscillating', 'ramp-up', 'ramp-freeze'] as SpeedCurvePreset[],
        speedCurveFrequency: 90,
        transitionStyle: 'mixed',
        transitionTypes: ['cut', 'glitch', 'flash', 'rgb-split'] as TransitionType[],
        beatDropImpact: 'maximum',
        rgbSplitPolicy: 'per-beat' as EffectApplyPolicy,
        rgbSplitAmount: 80,
        vibrationFlashPolicy: 'per-beat' as EffectApplyPolicy,
        vibrationFlashIntensity: 90,
        filmGrainAmount: 12,
        chromaticAmount: 8,
        shakeEnabled: true,
        shakePolicy: 'on-every-beat' as ShakePolicy,
        shakeType: 'vibration' as ShakeType,
        shakeIntensity: 70,
        rhythmPattern: 'random',
    },
    captionStyle: 'meme-impact',
    captionsRequired: true,
    tags: ['meme', 'shitpost', 'funny', 'chaos', 'earrape', 'deep-fried'],
    visualDescription: 'Pure visual chaos. Speed warps between 0.2× and 4×. Glitch and flash transitions. RGB split, vibration, maximum chromatic aberration. Impact font text top and bottom. Deep-fried grain.',
    complexity: 'simple',
};

const PHONK_EDIT: SocialMediaRecipe = {
    id: 'phonk-edit',
    name: 'Phonk Edit',
    description: 'High-energy with Phonk music. Drift, gym, anime, and grindset content.',
    category: 'trending',
    icon: '🏎️',
    aspectRatios: ['9:16', '16:9'],
    durationRange: [10, 45],
    settings: {
        shortestClip: 0.2,
        longestClip: 1.8,
        preferHighEnergy: true,
        beatSyncStrategy: 'effect-on-drop',
        beatPattern: 'drops',
        enhancedBeatSync: true,
        customSpeedRange: [0.4, 2.5],
        customSpeedRangeEnabled: true,
        speedCurvePreset: 'ramp-down',
        speedCurveFrequency: 70,
        transitionStyle: 'mixed',
        transitionTypes: ['cut', 'flash', 'whip'] as TransitionType[],
        motionBlurPolicy: 'per-beat' as EffectApplyPolicy,
        motionBlurAmount: 65,
        beatDropImpact: 'heavy',
        filmGrainAmount: 5,
        vignetteAmount: 40,
        rhythmPattern: 'staccato-legato',
    },
    captionStyle: 'tiktok-bold',
    tags: ['phonk', 'drift', 'gym', 'anime', 'grindset', 'energy', 'bass'],
    visualDescription: 'Fast-paced with slow-mo drops. Motion blur on speed changes. Whip transitions and flash cuts on bass hits. Heavy grain and vignette for that raw, underground aesthetic. Built for Phonk music.',
    complexity: 'intermediate',
};

// ── Registry ─────────────────────────────────────────────────────────────────

export const SOCIAL_MEDIA_RECIPES: Record<RecipeId, SocialMediaRecipe> = {
    'velocity-edit': VELOCITY_EDIT,
    'beat-sync': BEAT_SYNC,
    'aura-sigma': AURA_SIGMA,
    'cinematic-broll': CINEMATIC_BROLL,
    'whip-montage': WHIP_MONTAGE,
    'pov-edit': POV_EDIT,
    'talking-head': TALKING_HEAD,
    'photo-montage': PHOTO_MONTAGE,
    'product-showcase': PRODUCT_SHOWCASE,
    'travel-vlog': TRAVEL_VLOG,
    'day-in-life': DAY_IN_LIFE,
    'recap-highlights': RECAP_HIGHLIGHTS,
    'lyric-video': LYRIC_VIDEO,
    'meme-edit': MEME_EDIT,
    'phonk-edit': PHONK_EDIT,
};

export const RECIPE_LIST: SocialMediaRecipe[] = Object.values(SOCIAL_MEDIA_RECIPES);

// ── Category grouping ────────────────────────────────────────────────────────

export const RECIPE_CATEGORIES: { id: RecipeCategory; label: string; icon: string }[] = [
    { id: 'trending', label: 'Trending', icon: '🔥' },
    { id: 'cinematic', label: 'Cinematic', icon: '🎬' },
    { id: 'content', label: 'Content', icon: '📱' },
    { id: 'music', label: 'Music', icon: '🎵' },
    { id: 'comedy', label: 'Comedy', icon: '😂' },
];

export function getRecipesByCategory(category: RecipeCategory): SocialMediaRecipe[] {
    return RECIPE_LIST.filter(r => r.category === category);
}

// ── Recipe Application ───────────────────────────────────────────────────────

/**
 * Merge a recipe's settings with user overrides.
 * Recipe settings are applied first, then user overrides take precedence.
 */
export function applyRecipe(
    recipe: SocialMediaRecipe,
    userOverrides?: Partial<TrailerSettings>,
): Partial<TrailerSettings> {
    return {
        ...recipe.settings,
        ...(userOverrides || {}),
        // Ensure the duration range is respected
        targetDuration: userOverrides?.targetDuration ??
            Math.round((recipe.durationRange[0] + recipe.durationRange[1]) / 2),
    };
}

/**
 * Compose multiple recipes by layering their settings.
 * Later recipes override earlier ones. This enables composable edit styles
 * (e.g., "cinematic b-roll" + "beat sync" = cinematic beat-sync edit).
 */
export function composeRecipes(
    recipeIds: RecipeId[],
    userOverrides?: Partial<TrailerSettings>,
): Partial<TrailerSettings> {
    let merged: Partial<TrailerSettings> = {};
    for (const id of recipeIds) {
        const recipe = SOCIAL_MEDIA_RECIPES[id];
        if (recipe) {
            merged = { ...merged, ...recipe.settings };
        }
    }
    // User overrides always win
    return { ...merged, ...(userOverrides || {}) };
}

/**
 * Get the recommended aspect ratio for a recipe.
 */
export function getDefaultAspectRatio(recipe: SocialMediaRecipe): AspectRatio {
    return recipe.aspectRatios[0] || '16:9';
}

/**
 * Search recipes by query string (matches name, description, tags).
 */
export function searchRecipes(query: string): SocialMediaRecipe[] {
    const q = query.toLowerCase().trim();
    if (!q) return RECIPE_LIST;
    return RECIPE_LIST.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.tags.some(t => t.includes(q)),
    );
}
