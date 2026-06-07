import { RhythmPatternId } from './rhythmPatterns';

// ─── TEMPLATE DEFINITIONS ─────────────────────────────

export type TemplateId = 'pulse' | 'flow' | 'impact' | 'narrative' | 'rapid';

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
}

export const TEMPLATES: Record<TemplateId, EditingTemplate> = {
    pulse: {
        id: 'pulse',
        name: 'Pulse',
        icon: '🎵',
        description: 'Ride the beat — cuts land on musical beats with energy-responsive pacing',
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
    },
    flow: {
        id: 'flow',
        name: 'Flow',
        icon: '🌊',
        description: 'Let it breathe — minimal cuts, heavy camera movement, performance preservation',
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
    },
    impact: {
        id: 'impact',
        name: 'Impact',
        icon: '💥',
        description: 'Hit hard — speed ramps, zoom punches, drop-synced explosions of cuts',
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
    },
    narrative: {
        id: 'narrative',
        name: 'Narrative',
        icon: '📖',
        description: 'Tell the story — emotion-driven pacing, cuts serve story not rhythm',
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
    },
    rapid: {
        id: 'rapid',
        name: 'Rapid',
        icon: '⚡',
        description: 'Machine gun — ultra-fast metric editing, sub-second cuts, relentless energy',
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
    },
};

// ─── VIDEO TYPE MODES ─────────────────────────────────

export type VideoMode = 'trailer' | 'music-video' | 'dance' | 'showreel' | 'epic' | 'short-film';

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
