import { RhythmPatternId } from './rhythmPatterns';
import type { TransitionType, TransitionStyle, BoomerangPresetId, EffectApplyPolicy } from '../types';

// ─── TEMPLATE DEFINITIONS ─────────────────────────────

export type TemplateId = 'pulse' | 'flow' | 'impact' | 'narrative' | 'rapid' | 'interview' | 'montage' | 'flash-reel' | 'promo-intro' | 'talking-panel' | 'atmosphere' | 'glam' | 'performance';

export interface EditingTemplate {
    id: TemplateId;
    name: string;
    icon: string; // emoji
    description: string;
    // Clip duration range (seconds)
    minClip: number;
    maxClip: number;
    // Cut density (cuts per minute)
    minCPM: number;
    maxCPM: number;
    // Beat response
    beatDivisor: number; // 1=every beat, 2=every 2nd, 4=every 4th, 8=every 8th
    beatOffset: number; // frames to cut BEFORE beat (negative = anticipation)
    // Speed
    speedRange: [number, number]; // [min, max] playback speed
    useSpeedRamps: boolean;
    // Camera motion
    zoomRange: [number, number]; // [min%, max%] zoom intensity (100=no zoom)
    cameraMotionIntensity: number; // 0-1 how much camera motion to apply
    // Rhythm pattern preference
    defaultRhythmPattern: RhythmPatternId;
    // Behavior flags
    allowDuplicates: boolean;
    burstOnDrops: boolean; // rapid burst-cuts on drop segments
    reverseOnHits: boolean; // occasional reverse clips on impacts

    // ── Transition preferences ──────────────────────────
    /** 'cuts-only' = hard cuts, 'mixed' = cuts + transitions, 'transitions-only' = always transition */
    transitionStyle: TransitionStyle;
    /** Which transition types to use (subset of all available) */
    transitionTypes: TransitionType[];
    /** Per-transition duration override in ms (50–1500) */
    transitionDurationMs: number;

    // ── Boomerang preferences ──────────────────────────
    /** 0-100: % of clips that get a boomerang (0 = disabled) */
    boomerangFrequency: number;
    /** Which boomerang presets to rotate through */
    boomerangPresets: BoomerangPresetId[];

    // ── PIP (Picture-in-Picture) preferences ────────────
    /** 'off' | 'sparingly' | 'per-beat' | 'every-clip' */
    pipPolicy: EffectApplyPolicy;
}

export const TEMPLATES: Record<TemplateId, EditingTemplate> = {
    pulse: {
        id: 'pulse',
        name: 'Pulse',
        icon: '🎵',
        description: 'Ride the beat — boomerangs and dissolves land on musical beats',
        minClip: 0.3,
        maxClip: 2.0,
        minCPM: 15,
        maxCPM: 40,
        beatDivisor: 2,
        beatOffset: -1,
        speedRange: [0.9, 1.1],
        useSpeedRamps: false,
        zoomRange: [100, 105],
        cameraMotionIntensity: 0.2,
        defaultRhythmPattern: 'breathing',
        allowDuplicates: true,
        burstOnDrops: false,
        reverseOnHits: false,
        transitionStyle: 'mixed',
        transitionTypes: ['dissolve', 'fade', 'smoothleft', 'smoothright', 'boomerang', 'wipeleft', 'wiperight'],
        transitionDurationMs: 400,
        boomerangFrequency: 35,
        boomerangPresets: ['classic', 'slowmo'],
        pipPolicy: 'off',
    },
    flow: {
        id: 'flow',
        name: 'Flow',
        icon: '🌊',
        description: 'Let it breathe — smooth dissolves, cinematic fades, boomerang accents',
        minClip: 2.0,
        maxClip: 8.0,
        minCPM: 4,
        maxCPM: 15,
        beatDivisor: 8,
        beatOffset: 0,
        speedRange: [0.5, 1.5],
        useSpeedRamps: true,
        zoomRange: [100, 115],
        cameraMotionIntensity: 0.8,
        defaultRhythmPattern: 'wave',
        allowDuplicates: false,
        burstOnDrops: false,
        reverseOnHits: false,
        transitionStyle: 'transitions-only',
        transitionTypes: ['dissolve', 'fade', 'fadeblack', 'smoothleft', 'smoothright', 'boomerang', 'double-exposure'],
        transitionDurationMs: 800,
        boomerangFrequency: 25,
        boomerangPresets: ['slowmo', 'echo'],
        pipPolicy: 'off',
    },
    impact: {
        id: 'impact',
        name: 'Impact',
        icon: '💥',
        description: 'Hit hard — speed ramps, zoom punches, whip-pans, boomerang whiplashes',
        minClip: 0.08,
        maxClip: 4.0,
        minCPM: 20,
        maxCPM: 60,
        beatDivisor: 1,
        beatOffset: -2,
        speedRange: [0.5, 2.0],
        useSpeedRamps: true,
        zoomRange: [100, 120],
        cameraMotionIntensity: 0.6,
        defaultRhythmPattern: 'staccato-legato',
        allowDuplicates: true,
        burstOnDrops: true,
        reverseOnHits: true,
        transitionStyle: 'mixed',
        transitionTypes: ['flash', 'white-flash', 'glitch', 'rgb-split', 'zoom-through', 'whip', 'boomerang', 'spin', 'film-burn'],
        transitionDurationMs: 250,
        boomerangFrequency: 40,
        boomerangPresets: ['whiplash', 'stutter', 'classic'],
        pipPolicy: 'off',
    },
    narrative: {
        id: 'narrative',
        name: 'Narrative',
        icon: '📖',
        description: 'Tell the story — gentle dissolves and fades, emotion-driven pacing',
        minClip: 1.0,
        maxClip: 6.0,
        minCPM: 5,
        maxCPM: 20,
        beatDivisor: 4,
        beatOffset: 0,
        speedRange: [0.8, 1.0],
        useSpeedRamps: false,
        zoomRange: [100, 103],
        cameraMotionIntensity: 0.1,
        defaultRhythmPattern: 'climax-arc',
        allowDuplicates: false,
        burstOnDrops: false,
        reverseOnHits: false,
        transitionStyle: 'transitions-only',
        transitionTypes: ['dissolve', 'fade', 'fadeblack', 'fadewhite', 'wipeleft', 'wiperight'],
        transitionDurationMs: 600,
        boomerangFrequency: 10,
        boomerangPresets: ['slowmo'],
        pipPolicy: 'off',
    },
    rapid: {
        id: 'rapid',
        name: 'Rapid',
        icon: '⚡',
        description: 'Machine gun — stutter boomerangs, flash transitions, relentless energy',
        minClip: 0.08,
        maxClip: 0.5,
        minCPM: 40,
        maxCPM: 80,
        beatDivisor: 1,
        beatOffset: -1,
        speedRange: [1.0, 2.0],
        useSpeedRamps: false,
        zoomRange: [100, 102],
        cameraMotionIntensity: 0.05,
        defaultRhythmPattern: 'heartbeat',
        allowDuplicates: true,
        burstOnDrops: true,
        reverseOnHits: false,
        transitionStyle: 'mixed',
        transitionTypes: ['flash', 'white-flash', 'glitch', 'boomerang', 'zoom-through', 'whip'],
        transitionDurationMs: 150,
        boomerangFrequency: 50,
        boomerangPresets: ['stutter', 'whiplash', 'classic'],
        pipPolicy: 'off',
    },
    interview: {
        id: 'interview',
        name: 'Interview',
        icon: '🎙️',
        description: 'Clean talking-head — hard cuts with PIP cutaways, polished speaker presentation',
        minClip: 1.5,
        maxClip: 12.0,
        minCPM: 3,
        maxCPM: 12,
        beatDivisor: 8,
        beatOffset: 0,
        speedRange: [1.0, 1.0],
        useSpeedRamps: false,
        zoomRange: [100, 103],
        cameraMotionIntensity: 0.05,
        defaultRhythmPattern: 'breathing',
        allowDuplicates: false,
        burstOnDrops: false,
        reverseOnHits: false,
        transitionStyle: 'cuts-only',
        transitionTypes: ['cut'],
        transitionDurationMs: 0,
        boomerangFrequency: 0,
        boomerangPresets: [],
        pipPolicy: 'sparingly',
    },
    montage: {
        id: 'montage',
        name: 'Montage',
        icon: '🏋️',
        description: 'Beat-cut montage — boomerangs and wipes synced to music, fitness/lifestyle energy',
        minClip: 0.3,
        maxClip: 3.0,
        minCPM: 20,
        maxCPM: 50,
        beatDivisor: 1,
        beatOffset: -1,
        speedRange: [0.9, 1.1],
        useSpeedRamps: false,
        zoomRange: [100, 108],
        cameraMotionIntensity: 0.15,
        defaultRhythmPattern: 'pulse-2-1-2',
        allowDuplicates: true,
        burstOnDrops: false,
        reverseOnHits: false,
        transitionStyle: 'mixed',
        transitionTypes: ['boomerang', 'wipeleft', 'wiperight', 'dissolve', 'flash', 'smoothleft', 'smoothright'],
        transitionDurationMs: 300,
        boomerangFrequency: 45,
        boomerangPresets: ['classic', 'duo', 'stutter'],
        pipPolicy: 'off',
    },
    'flash-reel': {
        id: 'flash-reel',
        name: 'Flash Reel',
        icon: '📸',
        description: 'Rapid-fire — boomerang whiplashes, glitch transitions, flash effects, punchy energy',
        minClip: 0.15,
        maxClip: 2.0,
        minCPM: 25,
        maxCPM: 60,
        beatDivisor: 1,
        beatOffset: -2,
        speedRange: [0.8, 1.5],
        useSpeedRamps: true,
        zoomRange: [100, 115],
        cameraMotionIntensity: 0.5,
        defaultRhythmPattern: 'staccato-legato',
        allowDuplicates: true,
        burstOnDrops: true,
        reverseOnHits: true,
        transitionStyle: 'transitions-only',
        transitionTypes: ['flash', 'white-flash', 'glitch', 'rgb-split', 'zoom-through', 'boomerang', 'whip', 'spin', 'pixelize'],
        transitionDurationMs: 200,
        boomerangFrequency: 55,
        boomerangPresets: ['whiplash', 'stutter', 'classic', 'duo'],
        pipPolicy: 'off',
    },
    'promo-intro': {
        id: 'promo-intro',
        name: 'Promo Intro',
        icon: '🚀',
        description: 'Branded intro — zoom-throughs, whip transitions, boomerang accents, high energy',
        minClip: 0.2,
        maxClip: 1.5,
        minCPM: 30,
        maxCPM: 70,
        beatDivisor: 1,
        beatOffset: -1,
        speedRange: [1.0, 1.5],
        useSpeedRamps: true,
        zoomRange: [100, 120],
        cameraMotionIntensity: 0.7,
        defaultRhythmPattern: 'heartbeat',
        allowDuplicates: true,
        burstOnDrops: true,
        reverseOnHits: false,
        transitionStyle: 'transitions-only',
        transitionTypes: ['zoom-through', 'whip', 'flash', 'white-flash', 'boomerang', 'spin', 'glitch', 'wipeleft', 'wiperight'],
        transitionDurationMs: 200,
        boomerangFrequency: 30,
        boomerangPresets: ['classic', 'whiplash'],
        pipPolicy: 'off',
    },
    'talking-panel': {
        id: 'talking-panel',
        name: 'Panel / Podcast',
        icon: '🎙️',
        description: 'Multi-camera panel — hard cuts between speakers, PIP for reactions, title cards',
        minClip: 2.0,
        maxClip: 15.0,
        minCPM: 2,
        maxCPM: 8,
        beatDivisor: 8,
        beatOffset: 0,
        speedRange: [1.0, 1.0],
        useSpeedRamps: false,
        zoomRange: [100, 105],
        cameraMotionIntensity: 0.05,
        defaultRhythmPattern: 'wave',
        allowDuplicates: false,
        burstOnDrops: false,
        reverseOnHits: false,
        transitionStyle: 'cuts-only',
        transitionTypes: ['cut'],
        transitionDurationMs: 0,
        boomerangFrequency: 0,
        boomerangPresets: [],
        pipPolicy: 'per-beat',
    },
    atmosphere: {
        id: 'atmosphere',
        name: 'Atmosphere',
        icon: '🌅',
        description: 'Immersive mood — long dissolves, cinematic fades, slowmo boomerang accents',
        minClip: 2.0,
        maxClip: 8.0,
        minCPM: 4,
        maxCPM: 12,
        beatDivisor: 4,
        beatOffset: 0,
        speedRange: [0.8, 1.0],
        useSpeedRamps: false,
        zoomRange: [100, 105],
        cameraMotionIntensity: 0.3,
        defaultRhythmPattern: 'wave',
        allowDuplicates: false,
        burstOnDrops: false,
        reverseOnHits: false,
        transitionStyle: 'transitions-only',
        transitionTypes: ['dissolve', 'fade', 'fadeblack', 'double-exposure', 'smoothleft', 'smoothright', 'boomerang'],
        transitionDurationMs: 1000,
        boomerangFrequency: 20,
        boomerangPresets: ['slowmo', 'echo'],
        pipPolicy: 'off',
    },
    glam: {
        id: 'glam',
        name: 'Glam',
        icon: '✨',
        description: 'Luxury aesthetic — film burns, light leaks, smooth dissolves, slowmo boomerangs',
        minClip: 0.5,
        maxClip: 4.0,
        minCPM: 10,
        maxCPM: 30,
        beatDivisor: 2,
        beatOffset: -1,
        speedRange: [0.8, 1.2],
        useSpeedRamps: false,
        zoomRange: [100, 110],
        cameraMotionIntensity: 0.4,
        defaultRhythmPattern: 'breathing',
        allowDuplicates: false,
        burstOnDrops: false,
        reverseOnHits: false,
        transitionStyle: 'transitions-only',
        transitionTypes: ['dissolve', 'fade', 'film-burn', 'double-exposure', 'boomerang', 'smoothleft', 'smoothright', 'hblur'],
        transitionDurationMs: 600,
        boomerangFrequency: 30,
        boomerangPresets: ['slowmo', 'echo', 'classic'],
        pipPolicy: 'off',
    },
    performance: {
        id: 'performance',
        name: 'Performance',
        icon: '💃',
        description: 'Dance/performance — boomerang loops, flash transitions, movement preservation',
        minClip: 0.5,
        maxClip: 5.0,
        minCPM: 8,
        maxCPM: 25,
        beatDivisor: 2,
        beatOffset: -1,
        speedRange: [0.7, 1.3],
        useSpeedRamps: true,
        zoomRange: [100, 112],
        cameraMotionIntensity: 0.6,
        defaultRhythmPattern: 'breathing',
        allowDuplicates: true,
        burstOnDrops: true,
        reverseOnHits: false,
        transitionStyle: 'mixed',
        transitionTypes: ['boomerang', 'flash', 'white-flash', 'dissolve', 'zoom-through', 'whip', 'smoothleft', 'smoothright'],
        transitionDurationMs: 350,
        boomerangFrequency: 45,
        boomerangPresets: ['classic', 'duo', 'slowmo', 'whiplash'],
        pipPolicy: 'off',
    },
};

// ─── VIDEO TYPE MODES ─────────────────────────────────

export type VideoMode = 'trailer' | 'music-video' | 'dance' | 'showreel' | 'epic' | 'short-film' | 'interview' | 'promo' | 'lifestyle' | 'panel';

export interface VideoModeConfig {
    id: VideoMode;
    name: string;
    icon: string;
    description: string;
    defaultTemplates: TemplateId[];
    // Section-specific overrides (segment type → editing behavior)
    sectionOverrides: Partial<Record<SegmentEditType, SectionBehavior>>;
    // Mode-specific flags
    disableMusic: boolean;
    preferLongClips: boolean;
    enableCameraMotion: boolean;
    enableSpeedRamps: boolean;
    // Structure
    structure: 'escalating' | 'song-driven' | 'performance' | 'best-first' | 'crescendo' | 'story-driven';
}

export type SegmentEditType = 'intro' | 'verse' | 'chorus' | 'buildup' | 'drop' | 'breakdown' | 'bridge' | 'outro';

export interface SectionBehavior {
    rhythmPattern: RhythmPatternId;
    beatDivisor: number; // 1=every beat, 2=every 2nd, etc.
    speedRange: [number, number];
    zoomIntensity: number; // 0-1
    cutDensityMultiplier: number; // 1.0=normal, 2.0=double, 0.5=half
}

// Default section behaviors (used when mode doesn't override)
export const DEFAULT_SECTION_BEHAVIORS: Record<SegmentEditType, SectionBehavior> = {
    intro: { rhythmPattern: 'ritardando', beatDivisor: 4, speedRange: [1, 1], zoomIntensity: 0.3, cutDensityMultiplier: 0.5 },
    verse: { rhythmPattern: 'breathing', beatDivisor: 2, speedRange: [1, 1], zoomIntensity: 0.3, cutDensityMultiplier: 0.8 },
    chorus: { rhythmPattern: 'pulse-2-1-2', beatDivisor: 1, speedRange: [1, 1.2], zoomIntensity: 0.5, cutDensityMultiplier: 1.2 },
    buildup: { rhythmPattern: 'accelerando', beatDivisor: 2, speedRange: [1, 1.5], zoomIntensity: 0.6, cutDensityMultiplier: 1.5 },
    drop: { rhythmPattern: 'staccato-legato', beatDivisor: 1, speedRange: [0.5, 2.0], zoomIntensity: 0.8, cutDensityMultiplier: 2.0 },
    breakdown: { rhythmPattern: 'wave', beatDivisor: 4, speedRange: [0.7, 1], zoomIntensity: 0.2, cutDensityMultiplier: 0.4 },
    bridge: { rhythmPattern: 'cascade', beatDivisor: 2, speedRange: [0.8, 1.2], zoomIntensity: 0.4, cutDensityMultiplier: 0.8 },
    outro: { rhythmPattern: 'ritardando', beatDivisor: 4, speedRange: [0.8, 1], zoomIntensity: 0.2, cutDensityMultiplier: 0.3 },
};

export const VIDEO_MODES: Record<VideoMode, VideoModeConfig> = {
    trailer: {
        id: 'trailer',
        name: 'Trailer',
        icon: '🎬',
        description: 'Cinematic trailer with 3-act escalation',
        defaultTemplates: ['pulse', 'impact'],
        sectionOverrides: {
            intro: { rhythmPattern: 'ritardando', beatDivisor: 4, speedRange: [1, 1], zoomIntensity: 0.2, cutDensityMultiplier: 0.4 },
            drop: { rhythmPattern: 'staccato-legato', beatDivisor: 1, speedRange: [0.8, 1.5], zoomIntensity: 0.9, cutDensityMultiplier: 2.5 },
        },
        disableMusic: false,
        preferLongClips: false,
        enableCameraMotion: true,
        enableSpeedRamps: true,
        structure: 'escalating',
    },
    'music-video': {
        id: 'music-video',
        name: 'Music Video',
        icon: '🎵',
        description: 'Beat-synced with song structure awareness',
        defaultTemplates: ['pulse', 'flow'],
        sectionOverrides: {
            verse: { rhythmPattern: 'breathing', beatDivisor: 2, speedRange: [1, 1], zoomIntensity: 0.3, cutDensityMultiplier: 0.7 },
            chorus: { rhythmPattern: 'pulse-2-1-2', beatDivisor: 1, speedRange: [1, 1.1], zoomIntensity: 0.5, cutDensityMultiplier: 1.5 },
            bridge: { rhythmPattern: 'wave', beatDivisor: 4, speedRange: [0.8, 1], zoomIntensity: 0.6, cutDensityMultiplier: 0.5 },
        },
        disableMusic: false,
        preferLongClips: false,
        enableCameraMotion: true,
        enableSpeedRamps: false,
        structure: 'song-driven',
    },
    dance: {
        id: 'dance',
        name: 'Dance Edit',
        icon: '💃',
        description: 'Minimal cuts, heavy camera movement, performance preservation',
        defaultTemplates: ['flow'],
        sectionOverrides: {
            verse: { rhythmPattern: 'wave', beatDivisor: 8, speedRange: [0.8, 1.2], zoomIntensity: 0.7, cutDensityMultiplier: 0.3 },
            chorus: { rhythmPattern: 'wave', beatDivisor: 4, speedRange: [0.5, 1.5], zoomIntensity: 0.8, cutDensityMultiplier: 0.5 },
            drop: { rhythmPattern: 'wave', beatDivisor: 4, speedRange: [0.4, 1.8], zoomIntensity: 0.9, cutDensityMultiplier: 0.4 },
        },
        disableMusic: false,
        preferLongClips: true,
        enableCameraMotion: true,
        enableSpeedRamps: true,
        structure: 'performance',
    },
    showreel: {
        id: 'showreel',
        name: 'Showreel',
        icon: '🎭',
        description: 'Performance showcase — strongest material first, clean cuts',
        defaultTemplates: ['narrative'],
        sectionOverrides: {},
        disableMusic: true,
        preferLongClips: true,
        enableCameraMotion: false,
        enableSpeedRamps: false,
        structure: 'best-first',
    },
    epic: {
        id: 'epic',
        name: 'Epic Compilation',
        icon: '🔥',
        description: 'Heavy motion, kinetic energy, beat-drop explosions',
        defaultTemplates: ['impact', 'rapid'],
        sectionOverrides: {
            buildup: { rhythmPattern: 'accelerando', beatDivisor: 1, speedRange: [0.5, 1.5], zoomIntensity: 0.7, cutDensityMultiplier: 2.0 },
            drop: { rhythmPattern: 'heartbeat', beatDivisor: 1, speedRange: [0.3, 2.5], zoomIntensity: 1.0, cutDensityMultiplier: 3.0 },
            breakdown: { rhythmPattern: 'wave', beatDivisor: 2, speedRange: [0.6, 1], zoomIntensity: 0.4, cutDensityMultiplier: 0.5 },
        },
        disableMusic: false,
        preferLongClips: false,
        enableCameraMotion: true,
        enableSpeedRamps: true,
        structure: 'crescendo',
    },
    'short-film': {
        id: 'short-film',
        name: 'Short Film',
        icon: '🎞️',
        description: 'Story-driven editing — cuts serve emotion, not rhythm',
        defaultTemplates: ['narrative', 'flow'],
        sectionOverrides: {
            verse: { rhythmPattern: 'climax-arc', beatDivisor: 8, speedRange: [1, 1], zoomIntensity: 0.1, cutDensityMultiplier: 0.4 },
            chorus: { rhythmPattern: 'breathing', beatDivisor: 4, speedRange: [1, 1], zoomIntensity: 0.2, cutDensityMultiplier: 0.6 },
        },
        disableMusic: false,
        preferLongClips: true,
        enableCameraMotion: true,
        enableSpeedRamps: false,
        structure: 'story-driven',
    },
    interview: {
        id: 'interview',
        name: 'Interview',
        icon: '🎙️',
        description: 'Talking-head interview with jump cuts and clean presentation',
        defaultTemplates: ['interview'],
        sectionOverrides: {},
        disableMusic: true,
        preferLongClips: true,
        enableCameraMotion: false,
        enableSpeedRamps: false,
        structure: 'story-driven',
    },
    promo: {
        id: 'promo',
        name: 'Promo / Intro',
        icon: '🚀',
        description: 'High-energy branded intro or promotional sizzle',
        defaultTemplates: ['promo-intro', 'impact'],
        sectionOverrides: {
            intro: { rhythmPattern: 'heartbeat', beatDivisor: 1, speedRange: [1, 1.5], zoomIntensity: 0.8, cutDensityMultiplier: 2.0 },
            drop: { rhythmPattern: 'staccato-legato', beatDivisor: 1, speedRange: [0.8, 2.0], zoomIntensity: 1.0, cutDensityMultiplier: 3.0 },
        },
        disableMusic: false,
        preferLongClips: false,
        enableCameraMotion: true,
        enableSpeedRamps: true,
        structure: 'escalating',
    },
    lifestyle: {
        id: 'lifestyle',
        name: 'Lifestyle',
        icon: '🌅',
        description: 'Immersive mood piece with rich ambience and story-driven flow',
        defaultTemplates: ['atmosphere', 'narrative'],
        sectionOverrides: {
            intro: { rhythmPattern: 'ritardando', beatDivisor: 8, speedRange: [1, 1], zoomIntensity: 0.2, cutDensityMultiplier: 0.3 },
            verse: { rhythmPattern: 'wave', beatDivisor: 4, speedRange: [0.8, 1], zoomIntensity: 0.3, cutDensityMultiplier: 0.5 },
        },
        disableMusic: false,
        preferLongClips: true,
        enableCameraMotion: true,
        enableSpeedRamps: false,
        structure: 'story-driven',
    },
    panel: {
        id: 'panel',
        name: 'Panel / Podcast',
        icon: '🎤',
        description: 'Multi-speaker discussion with camera switching',
        defaultTemplates: ['talking-panel'],
        sectionOverrides: {},
        disableMusic: true,
        preferLongClips: true,
        enableCameraMotion: false,
        enableSpeedRamps: false,
        structure: 'story-driven',
    },
};

// ─── HELPERS ──────────────────────────────────────────

export const TEMPLATE_LIST: EditingTemplate[] = Object.values(TEMPLATES);
export const VIDEO_MODE_LIST: VideoModeConfig[] = Object.values(VIDEO_MODES);

export function getDefaultTemplatesForMode(mode: VideoMode): TemplateId[] {
    return VIDEO_MODES[mode]?.defaultTemplates || ['pulse'];
}

export function getSectionBehavior(mode: VideoMode, segmentType: SegmentEditType): SectionBehavior {
    const modeConfig = VIDEO_MODES[mode];
    return modeConfig?.sectionOverrides[segmentType] || DEFAULT_SECTION_BEHAVIORS[segmentType];
}
