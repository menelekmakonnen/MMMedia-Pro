import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_FPS } from './time';
import { expandClipToBoomerang, BOOMERANG_PRESETS, getBoomerangPreset } from './boomerang';
import { IMPACT_PRESETS, presetToKeyframes } from './effectsEngine';
import { DEFAULT_AUDIO_EFFECTS } from './audioEffects';
import { pickDoubleExposureShape } from './editEffectFilters';
import { getGradientColors } from './doubleExposureGradients';
import { resolveKeptRanges, resolveShowRanges } from './mediaSegments';
import type { SegmentType, AudioAnalysisResult } from './audioAnalysis';
import { MediaFile } from '../store/mediaStore';
import { Clip, TransitionType, ShakeType, ShakePolicy, BeatDropIntensity, TransitionStyle, BoomerangPresetId, ZoomSpeed, SpeedCurvePreset, EffectApplyPolicy } from '../types';
import { RHYTHM_PATTERNS, resolveRhythmDuration, RhythmPatternId } from './rhythmPatterns';
import { SeededRandom, generateSeed } from './random';
import { generateGridSequence } from './gridEditEngine';
import { selectTransition } from './transitions';
import { buildOneTakeRamp } from './ege/oneTakeRamp';
import { applyReturnTransitions } from './returnTransitions';
import {
    selectContextAwareTransition,
    classifyEnergy,
    classifyColorTemperature,
    type TransitionContext,
    type EnergyLevel,
    type ColorTemperature,
} from './clipIntelligence';
import { getColorForSection } from './colorEngine';
import { findMatchCutPairs, findSeamlessTransitionPairs, hammingDistance, histogramSimilarity, motionDirectionDelta } from './matchAnalysis';
import { VideoMode, SegmentEditType, getSectionBehavior, DEFAULT_SECTION_BEHAVIORS, SectionBehavior } from './editingModes';
import { MixedTemplate, mixTemplates, templateToSettings } from './templateMixer';
import type { TemplateId } from './editingModes';
import { generateSfxClips } from './sfxIntelligence';


export interface TrailerSettings {
    targetDuration: number;
    shortestClip: number;
    longestClip: number;
    allowDuplicates: boolean;
    allowSameSegment: boolean;
    mediaType: 'video' | 'image' | 'gif' | 'all';
    useAllClips: boolean;
    useAudioGuide: boolean;
    beatTimestamps: number[] | null;
    audioMixStrategy: 'muted' | 'subtle' | 'original' | 'ducking';
    // Cinematic Speed: 4 presets + custom
    slowmoPolicy: 'none' | 'slowmo' | 'fast' | 'hyper' | 'custom';
    slowmoPolicies?: ('none' | 'slowmo' | 'fast' | 'hyper')[]; // multi-select; one picked per clip for variety
    customSpeed?: number; // User-specified speed when slowmoPolicy is 'custom'
    seed?: string;
    templates: string[];
    // Audio trimming
    audioFile?: string | null;
    audioUrl?: string | null;
    audioFilePath?: string;
    audioTrimStart?: number;
    audioTrimEnd?: number;

    beatSensitivity?: number;
    orientationFilter?: 'all' | 'horizontal' | 'vertical' | 'square';
    // Beat sync intelligence
    beatPattern: 'auto' | 'every' | 'half' | 'quarter' | 'drops' | 'risers-drops' | 'downbeats' | 'custom';

    // ── Generator mode (Trailer vs Music Video) ──
    generatorMode?: 'trailer' | 'music-video' | 'showreel' | 'video-essay' | 'short-film' | 'social-media' | 'bts';

    /** Active subcategories within the selected mode(s) */
    activeSubcategories?: string[];
    /** Additional stacked modes whose intelligence merges with the primary */
    stackedModes?: string[];
    mvBeatAnchor?: 'downbeat' | 'beat';
    mvIntroEnabled?: boolean;
    mvOutroEnabled?: boolean;
    mvBtsSlot?: boolean;
    mvOutroCornerScale?: number;
    beatSyncStrategy: 'auto' | 'cut-on-beat' | 'transition-on-beat' | 'effect-on-drop' | 'riser-buildup' | 'groove-ride';
    selectedSegments: SegmentType[];
    audioAnalysis?: AudioAnalysisResult | null;
    enhancedBeatSync?: boolean;
    includeGrids?: 'off' | 'mixed' | 'grids-only';
    // Rhythm pattern for clip duration sequencing
    rhythmPattern?: RhythmPatternId;
    // Template system
    templateIds?: TemplateId[];
    videoMode?: VideoMode;
    // Beat offset (anticipation cuts)
    beatOffset?: number; // frames to cut BEFORE beat (default: -1)
    // Template-derived fields (set by templateToSettings, but can be overridden)
    templateSpeedRange?: [number, number];
    templateUseSpeedRamps?: boolean;
    templateZoomRange?: [number, number];
    templateReverseOnHits?: boolean;
    templateBurstOnDrops?: boolean;
    templateCameraMotion?: number;
    templateBeatDivisor?: number;
    // Boomerang
    boomerangAll?: boolean; // apply boomerang to ALL clips (overrides frequency)
    boomerangPreset?: BoomerangPresetId; // legacy single preset
    boomerangFrequency?: number; // 0-100: % of clips that get a boomerang (when not boomerangAll)
    boomerangPresets?: BoomerangPresetId[]; // multi-select; rotated one-at-a-time across clips

    // ── Super Editing Engine ──────────────────────────────────────

    // Custom Speed Range (system picks within range)
    customSpeedRange?: [number, number];   // e.g. [0.5, 2.0]
    customSpeedRangeEnabled?: boolean;     // toggle range vs. single

    // Speed curve (how speed changes are applied within a clip)
    speedCurvePreset?: SpeedCurvePreset;
    speedCurvePresets?: SpeedCurvePreset[];   // Multi-select array (replaces single preset in UI)
    speedCurveFrequency?: number;             // 0-100: % of clips that get a speed curve
    audioDynamicsScope?: 'all' | 'drops' | 'builds-drops' | 'custom';
    sequencePresetId?: string; // NLE preset ID to apply on generation
    sequencePresetIds?: string[]; // Composable NLE patterns (legacy ID still supported)

    // Zoom controls
    zoomEnabled?: boolean;
    zoomValues?: number[];                 // e.g. [100, 125, 150, 175, 200]
    zoomCustomRange?: [number, number];    // e.g. [100, 200] with 5% steps
    zoomCustomRangeEnabled?: boolean;
    zoomSpeed?: ZoomSpeed | 'all';         // speed of zoom application
    zoomBeatSync?: boolean;               // zoom duration ends on beat

    // Shake controls
    shakeEnabled?: boolean;
    shakePolicy?: ShakePolicy;
    shakeType?: ShakeType | 'all';
    shakeIntensity?: number;

    // ── Advanced edit-effects: intelligent application policies + params ──
    motionBlurPolicy?: EffectApplyPolicy;
    motionBlurAmount?: number;            // 0-100
    glowPolicy?: EffectApplyPolicy;
    glowIntensity?: number;               // 0-100
    glowRadius?: number;                  // 0-100
    doubleExposurePolicy?: EffectApplyPolicy;
    doubleExposureOpacity?: number;       // 0-100
    doubleExposureBlend?: 'screen' | 'lighten' | 'overlay' | 'add' | 'softlight' | 'multiply';
    doubleExposureShapeMode?: 'full' | 'shaped' | 'mix'; // full-frame / always-shaped / healthy mix
    /** Selected gradient preset ids for gradient double-exposure (replaces the
     *  clip-overlay variant when non-empty). */
    doubleExposureGradientIds?: string[];
    /** 'cycle' = one gradient per clip (rotating); 'stack' = all selected on each clip. */
    doubleExposureGradientMode?: 'cycle' | 'stack';
    // Triple Exposure (3 layers instead of 2)
    tripleExposurePolicy?: EffectApplyPolicy;
    tripleExposureOpacity?: number;       // 0-100
    tripleExposureBlend?: 'screen' | 'lighten' | 'overlay' | 'add' | 'softlight' | 'multiply';
    tripleExposureGradientIds?: string[];
    vibrationFlashPolicy?: EffectApplyPolicy;
    vibrationFlashIntensity?: number;     // 0-100
    smoothSlowmoPolicy?: EffectApplyPolicy;
    // Music-video-flavored effects (work in trailer too)
    rgbSplitPolicy?: EffectApplyPolicy;
    rgbSplitAmount?: number;       // 0-100
    hueCyclePolicy?: EffectApplyPolicy;
    hueCycleSpeed?: number;        // 0-100
    vhsPolicy?: EffectApplyPolicy;
    vhsAmount?: number;            // 0-100              // 0-100 global intensity

    // Picture-in-Picture
    pipPolicy?: EffectApplyPolicy;
    pipPosition?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; // 3x3 grid: 1=TL, 2=TC, 3=TR, 4=ML, 5=MC, 6=MR, 7=BL, 8=BC, 9=BR
    pipScale?: number; // 20-50, default 30
    pipBorderRadius?: number; // 0-20, default 8
    pipShape?: 'square' | 'vertical' | 'horizontal'; // box shape: square (1:1), vertical (9:16 tall), horizontal (16:9 wide)
    // Moving PIP — PIP moves between grid positions on beat
    pipMovement?: 'static' | 'horizontal' | 'vertical' | 'diagonal' | 'random';
    // Movement path: 3 positions on the 3x3 grid that the PIP visits in order (beat-synced)
    // horizontal: e.g. [1,2,3] or [7,8,9]
    // vertical: e.g. [1,4,7] or [3,6,9]
    // diagonal: e.g. [1,5,9] or [3,5,7]
    // random: picks from all 9 positions randomly per beat
    pipMovementPath?: (1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9)[];


    // Transition-as-Effect (transitions that also exist as on-clip effects)
    spinPolicy?: EffectApplyPolicy;
    spinSpeed?: number;           // 0-100 (rotation speed/amount)
    filmBurnPolicy?: EffectApplyPolicy;
    filmBurnIntensity?: number;   // 0-100
    pixelizePolicy?: EffectApplyPolicy;
    pixelizeAmount?: number;      // 0-100 (mosaic block size)
    whipBlurPolicy?: EffectApplyPolicy;
    whipBlurAmount?: number;      // 0-100

    /** Deflicker temporal averaging policy */
    deflickerPolicy?: EffectApplyPolicy;
    /** Deflicker layer count (default: 3) */
    deflickerLayers?: 3 | 5;

    // Beat Drop Impact Stack
    beatDropImpact?: BeatDropIntensity;

    // Transition controls
    transitionStyle?: TransitionStyle;
    transitionTypes?: TransitionType[];   // which transitions to allow
    transitionDurationMs?: number;        // default transition duration
    returnTransitions?: boolean;          // A→B→A: mirror a transition with its reverse on the next cut
    returnTransitionFrequency?: number;   // 0-100: chance a forward transition gets a return leg
    returnTransitionMap?: Record<string, { enabled: boolean; frequency: 50 | 100 }>;
    /** Per-transition option overrides keyed by TransitionType (duration, intensity, ease). */
    transitionParams?: Record<string, { duration?: number; intensity?: number; ease?: string }>;

    // Visual FX globals
    filmGrainAmount?: number;             // 0-25
    vignetteAmount?: number;              // 0-100
    letterboxEnabled?: boolean;
    chromaticAmount?: number;             // 0-20

    // Color per section
    colorPerSection?: boolean;
    desaturationBuildup?: boolean;        // fade to B&W during buildup
    beatFlashEnabled?: boolean;           // white flash on beats

    // Color grading presets
    tealOrangeGrade?: boolean;            // Cinematic teal & orange look
    coolShadows?: boolean;                // Blue-tinted shadows
    warmHighlights?: boolean;             // Golden/amber highlight push
    highContrast?: boolean;               // Boosted blacks and whites
    vintageFade?: boolean;                // Lifted blacks, warm tint, reduced sat
    monochromeGrade?: boolean;            // Full B&W grade

    // Visual Effects (applied to all generated clips)
    globalEffects?: Array<{ effectId: string; params: Record<string, number | string | boolean> }>;
    globalColorGrading?: import('./colorGrading').ColorGrading;
    globalFlipH?: boolean;
    globalFlipV?: boolean;
    globalSharpen?: number;
    globalBlurAmount?: number;
    globalChromaKey?: { enabled: boolean; color: string; similarity: number; blend: number };
    globalStabilize?: { enabled: boolean; smoothing: number };
    globalAudioEffects?: import('./audioEffects').AudioEffects;
    /** Auto brightness fade-in on first clip and fade-out on last (keyframe substrate). */
    autoFadeInOut?: boolean;
    /** Rank the source pool by motion energy and prefer the liveliest takes. */
    preferHighEnergy?: boolean;
    /** Restrict source trims to the non-silent usable range (FFmpeg silencedetect). */
    autoTrimSilence?: boolean;
    /** Snap source trim-ins to detected scene-change boundaries. */
    sceneAwareCuts?: boolean;
    /** Clip-aware automatic cinematic color grade (per-clip, from luma/saturation). */
    autoColorGrade?: boolean;
    /** Lockable clip-ordering structure (Media Pool). 'none' = current behaviour. */
    clipOrderMode?: import('./clipOrdering').ClipOrderMode;
    /** When sequential / sequential-randomized: order clips by file date or filename. */
    sequentialBy?: import('./clipOrdering').SequentialBy | import('./clipOrdering').SequentialBy[];
    /** Internal continuation state used when a caller must extend a short draft. */
    initialSegmentHistory?: Record<string, string[]>;
    /** Internal source-use counts paired with initialSegmentHistory. */
    initialSourceUseCounts?: Record<string, number>;
    /** Last source in a preceding generation pass, to prevent a boundary repeat. */
    initialLastSourcePath?: string;

    // ── Social Media Recipe System ───────────────────────────────────────
    /** Active social media recipe ID(s). Recipes compose: later overrides earlier. */
    recipeIds?: import('./socialMediaRecipes').RecipeId[];
    /** Output aspect ratios for multi-format export. */
    outputAspectRatios?: import('./socialMediaRecipes').AspectRatio[];
    /** Reframing strategy when aspect ratio differs from source. */
    reframingStrategy?: 'center-crop' | 'smart-pan' | 'ken-burns' | 'letterbox';

    // ── Shot Classification & Scene Graph ────────────────────────────────
    /** Shot type preference weights (0-100 per type). Higher = more likely selected. */
    shotTypePreference?: Partial<Record<import('./shotClassifier').ShotType, number>>;
    /** Enable intelligent shot diversity enforcement (no two same types adjacent). */
    shotDiversityEnabled?: boolean;
    /** Group related clips into scenes and treat them as atomic units. */
    sceneGrouping?: boolean;
    /** Performance vs B-roll interleaving ratio (0-100, where 100=all performance). */
    performanceBRollRatio?: number;

    // ── Semantic Tagging & Content Intelligence ──────────────────────────
    /** Mood preference for clip selection (match these moods to song sections). */
    moodPreference?: import('./semanticTagger').MoodTag[];
    /** Setting filter: only use clips matching these settings. */
    settingFilter?: import('./semanticTagger').SettingTag[];
    /** Time-of-day filter. */
    timeOfDayFilter?: import('./semanticTagger').TimeOfDayTag[];
    /** Enable mood-to-segment matching (calm verse clips, energetic drop clips). */
    moodMatchEnabled?: boolean;

    // ── Caption / Text Overlay Engine ────────────────────────────────────
    /** Caption style preset for auto-generated captions. */
    captionStyle?: import('./captionStyles').CaptionStyleId;
    /** Caption source: SRT file, VTT file, or lyric timestamps. */
    captionSource?: 'srt' | 'vtt' | 'lyrics' | 'none';
    /** Path to caption/subtitle file. */
    captionFilePath?: string;
    /** Title card configuration. */
    titleCard?: { text: string; duration: number; style: import('./captionStyles').CaptionStyleId };
    /** End card configuration. */
    endCard?: { text: string; duration: number; style: import('./captionStyles').CaptionStyleId };

    // ── Style DNA System ─────────────────────────────────────────────────
    /** Active Style DNA to apply (extracted from a reference video). */
    styleDNA?: import('./styleDNA').StyleDNA;
    /** Whether to prioritise Style DNA settings over manual overrides. */
    styleDNAPriority?: boolean;

    // ── Edit Memory & Variant Engine ─────────────────────────────────────
    /** Number of creative variants to generate (1 = default, 2-5 for comparison). */
    variantCount?: number;
    /** Variant dimensions to vary across generated options. */
    variantAxes?: ('pacing' | 'transitions' | 'color' | 'energy' | 'structure')[];

    // ── Pacing Arc ────────────────────────────────────────────────────────
    /** Explicit narrative pacing curve/shape control */
    pacingArcShape?: import('./pacingArc').PacingArcShape;

    // ── Project frame rate ────────────────────────────────────────────────
    /** Project FPS for frame calculations. Defaults to 30 if not provided. */
    fps?: number;

    // ── Default structure presets (applied automatically as best practices) ──
    /** Structure patterns always applied when no explicit presets are user-selected. */
    defaultStructurePresets?: string[];

    // ── Grid Edit Engine Bridge ──────────────────────────────────────────
    /** Enable grid generation within single-video EGE (inserts grid segments). */
    useGridBridges?: boolean;
    /** Number of cells per grid segment (2-9). */
    gridBridgeLayout?: number;
    /** Grid segment format: horizontal/vertical/square. */
    gridBridgeFormat?: import('../types').GridFormat;
    /** 0-100: frequency of grid segments vs single clips in the sequence. */
    gridBridgeFrequency?: number;

    /** Auto-apply 30ms audio crossfade on all cuts to eliminate pops (default: true) */
    autoCrossfadeAudio?: boolean;
}

export const DEFAULT_TRAILER_SETTINGS: TrailerSettings = {
    targetDuration: 30,
    shortestClip: 0.2,
    longestClip: 1.0,
    allowDuplicates: true,
    allowSameSegment: false,
    mediaType: 'video',
    useAllClips: false,
    useAudioGuide: false,
    beatTimestamps: null,
    audioMixStrategy: 'muted',
    slowmoPolicy: 'none',
    templates: ['social'],
    beatSensitivity: 0.5,
    enhancedBeatSync: false,
    orientationFilter: 'all',
    beatPattern: 'auto',
    beatSyncStrategy: 'auto',
    selectedSegments: ['intro', 'buildup', 'drop', 'breakdown', 'chorus', 'verse', 'outro', 'bridge'],
    audioAnalysis: null,
    includeGrids: 'off',
    seed: undefined,
    rhythmPattern: 'breathing',
    templateIds: undefined,
    videoMode: undefined,
    beatOffset: -1,
    templateSpeedRange: undefined,
    templateUseSpeedRamps: undefined,
    templateZoomRange: undefined,
    templateReverseOnHits: undefined,
    templateBurstOnDrops: undefined,
    templateCameraMotion: undefined,
    templateBeatDivisor: undefined,
    // Super editing engine defaults
    boomerangPreset: 'classic',
    customSpeedRangeEnabled: false,
    zoomEnabled: false,
    zoomValues: [100, 125, 150, 175, 200],
    zoomCustomRangeEnabled: false,
    zoomSpeed: 'all',
    zoomBeatSync: false,
    shakeEnabled: false,
    shakePolicy: 'off',
    shakeType: 'impact',
    pacingArcShape: undefined,
    shakeIntensity: 50,
    motionBlurPolicy: 'off',
    motionBlurAmount: 50,
    glowPolicy: 'off',
    glowIntensity: 55,
    glowRadius: 50,
    doubleExposurePolicy: 'off',
    doubleExposureOpacity: 50,
    doubleExposureBlend: 'screen',
    doubleExposureGradientIds: [],
    doubleExposureGradientMode: 'cycle',
    tripleExposurePolicy: 'off',
    tripleExposureOpacity: 50,
    tripleExposureBlend: 'screen',
    tripleExposureGradientIds: [],
    vibrationFlashPolicy: 'sparingly',
    vibrationFlashIntensity: 70,
    smoothSlowmoPolicy: 'off',
    autoFadeInOut: false,
    preferHighEnergy: false,
    autoTrimSilence: false,
    sceneAwareCuts: false,
    autoColorGrade: false,
    clipOrderMode: 'none',
    sequentialBy: 'date-modified',
    rgbSplitPolicy: 'off',
    rgbSplitAmount: 45,
    hueCyclePolicy: 'off',
    hueCycleSpeed: 30,
    vhsPolicy: 'off',
    vhsAmount: 50,
    pipPolicy: 'off',
    pipPosition: 9,  // Bottom-right by default
    pipScale: 30,
    pipBorderRadius: 8,
    pipShape: 'square',
    pipMovement: 'static',
    pipMovementPath: [],
    spinPolicy: 'off',
    spinSpeed: 50,
    filmBurnPolicy: 'off',
    filmBurnIntensity: 50,
    pixelizePolicy: 'off',
    pixelizeAmount: 50,
    whipBlurPolicy: 'off',
    whipBlurAmount: 50,
    deflickerPolicy: 'off',
    deflickerLayers: 3,
    beatDropImpact: 'off',
    transitionStyle: 'cuts-only',
    transitionDurationMs: 200,
    returnTransitions: false,
    returnTransitionFrequency: 50,
    returnTransitionMap: undefined,
    transitionParams: undefined,
    filmGrainAmount: 0,
    vignetteAmount: 0,
    letterboxEnabled: false,
    chromaticAmount: 0,
    colorPerSection: false,
    desaturationBuildup: false,
    beatFlashEnabled: false,
    tealOrangeGrade: false,
    coolShadows: false,
    warmHighlights: false,
    highContrast: false,
    vintageFade: false,
    monochromeGrade: false,
    // Structure presets applied by default as best practices
    defaultStructurePresets: ['multi-track-split', 'a-b-roll', 'split-screen-dual', 'triple-layer'],
    // Grid bridge defaults
    useGridBridges: false,
    gridBridgeLayout: 4,
    gridBridgeFormat: 'horizontal',
    gridBridgeFrequency: 20,
    autoCrossfadeAudio: true,
};





export interface TrailerClip extends Clip {
    globalStart?: number;
    globalEnd?: number;
    localDuration?: number;
}

interface PoolFile extends MediaFile {
    sourceDurationFrames: number;
    name?: string;
    // Effective trim range in frames (respects MediaFile.trimIn/trimOut)
    effectiveTrimInFrames: number;
    effectiveTrimOutFrames: number;
}



/**
 * Clamp a zoom offset (pan position) so the cropped viewport stays within
 * the source frame at the given zoom level.
 *
 * @param zoom - Zoom percentage (100 = no zoom, 200 = 2×)
 * @param offset - Current pan offset in pixels
 * @param dimension - Source dimension (width or height) in pixels
 * @returns Clamped offset that keeps the viewport inside the frame
 */
function clampZoomOffset(zoom: number, offset: number, dimension: number): number {
    // zoom is percentage (100 = no zoom, 200 = 2x)
    const visibleSize = dimension / (zoom / 100);
    const maxOffset = dimension - visibleSize;
    return Math.max(0, Math.min(offset, maxOffset));
}

/**
 * Generates a procedural sequence of media clips based on dynamic constraints.
 */
export const generateTrailerSequence = (pool: MediaFile[], settings: Partial<TrailerSettings>): Clip[] => {
    if (!pool || pool.length === 0) return [];

    const s = { ...DEFAULT_TRAILER_SETTINGS, ...settings };
    const seed = s.seed || generateSeed();
    const rng = new SeededRandom(seed);

    // ── Frame rate: prefer explicit fps, fall back to DEFAULT_FPS (30) ──
    const fps = s.fps || DEFAULT_FPS;

    // ── Template Resolution ──
    // If templates specified, mix them and apply to settings
    if (s.templateIds && s.templateIds.length > 0) {
        const mixed = mixTemplates(s.templateIds);
        const templateOverrides = templateToSettings(mixed);
        // Apply template settings as defaults (explicit user settings take priority)
        for (const [key, value] of Object.entries(templateOverrides)) {
            if ((s as any)[key] === undefined || (s as any)[key] === (DEFAULT_TRAILER_SETTINGS as any)[key]) {
                (s as any)[key] = value;
            }
        }
    }

    let {
        targetDuration = 30,
        shortestClip = 0.2,
        longestClip = 1.0,
        allowDuplicates = true,
        allowSameSegment = false,
        mediaType = 'video',
        useAllClips = false,
        useAudioGuide = false,
        beatTimestamps = null,
        audioMixStrategy = 'muted',
        slowmoPolicy = 'none',
        orientationFilter = 'all',
    } = s;

    // ── AUDIO DURATION OVERRIDE ──────────────────────────────────────────
    // When an audio guide is active, the edit MUST match the audio's duration,
    // not the (often stale) targetDuration slider. This prevents the generator
    // from stopping early when the audio is longer than the default 30s.
    if (useAudioGuide) {
        // Primary: use the audio trim range if provided
        const trimStart = s.audioTrimStart ?? 0;
        const trimEnd = s.audioTrimEnd ?? (s.audioAnalysis?.duration ?? 0);
        if (trimEnd > trimStart) {
            const audioDuration = trimEnd - trimStart;
            if (Math.abs(audioDuration - targetDuration) > 0.5) {
                console.log(`[TrailerGen] Audio duration override: ${targetDuration}s → ${audioDuration.toFixed(1)}s (from audio trim ${trimStart.toFixed(1)}-${trimEnd.toFixed(1)})`);
                targetDuration = audioDuration;
            }
        }
        // Fallback: if beat timestamps span beyond targetDuration, extend to cover them
        if (beatTimestamps && beatTimestamps.length > 1) {
            const lastBeat = beatTimestamps[beatTimestamps.length - 1];
            if (lastBeat > targetDuration) {
                console.log(`[TrailerGen] Beat span override: ${targetDuration}s → ${lastBeat.toFixed(1)}s (last beat at ${lastBeat.toFixed(1)}s)`);
                targetDuration = lastBeat;
            }
        }
    }


    let validPool: PoolFile[] = pool.filter(f => {
        if (mediaType === 'video') return f.type === 'video';
        if (mediaType === 'image') return f.type === 'image';
        if (mediaType === 'gif') return f.filename.toLowerCase().endsWith('.gif');
        return true;
    }).filter(f => {
        // Apply orientation filter
        if (orientationFilter === 'all' || f.type !== 'video') return true;
        return f.orientation === orientationFilter;
    }).map(f => {
        let fullDurationFrames = 9000; // Assume 5 min if unknown
        if (f.duration) fullDurationFrames = Math.floor(f.duration * fps);
        if (mediaType !== 'video') fullDurationFrames = 900; // Images act as 30s clips

        // Respect pre-import trim constraints from Media Library
        const trimInFrames = f.trimIn != null ? Math.floor(f.trimIn * fps) : 0;
        const trimOutFrames = f.trimOut != null ? Math.floor(f.trimOut * fps) : fullDurationFrames;
        const _effectiveDuration = trimOutFrames - trimInFrames;

        // ── Include/exclude segments are the SOURCE OF TRUTH ────────────────
        // When a source carries segment decisions, constrain the pickable window
        // to its LARGEST kept range so the generator never samples excluded
        // footage; kept-range boundaries become preferred scene cuts. Only set
        // when segments exist, so Smart-Engine usable windows are untouched
        // otherwise.
        const segmentOverride: Record<string, unknown> = {};
        if (f.segments && f.segments.length > 0) {
            const kept = resolveKeptRanges({ duration: f.duration || fullDurationFrames / fps, trimIn: f.trimIn, trimOut: f.trimOut }, f.segments);
            if (kept.length > 0) {
                // Store ALL kept ranges so getBestTrimStart can reject excluded zones
                segmentOverride._keptRanges = kept.map(r => ({
                    inFrame: Math.floor(r.startSec * fps),
                    outFrame: Math.floor(r.endSec * fps),
                }));
                // Outer bounds for backward compat
                const allStarts = kept.map(r => Math.floor(r.startSec * fps));
                const allEnds = kept.map(r => Math.floor(r.endSec * fps));
                segmentOverride._usableInFrames = Math.min(...allStarts);
                segmentOverride._usableOutFrames = Math.max(...allEnds);
                // Scene cuts at every kept-range boundary (except the first)
                const cuts = kept.slice(1).map(r => Math.floor(r.startSec * fps));
                if (cuts.length > 0) segmentOverride._sceneCutsFrames = cuts;
            }
        }

        return {
            ...f,
            sourceDurationFrames: fullDurationFrames,
            effectiveTrimInFrames: trimInFrames,
            effectiveTrimOutFrames: trimOutFrames,
            ...segmentOverride,
        };
    });

    if (validPool.length === 0) {
        validPool = pool.map(f => {
            const dur = f.duration ? Math.floor(f.duration * fps) : 9000;
            return {
                ...f,
                sourceDurationFrames: dur,
                effectiveTrimInFrames: f.trimIn != null ? Math.floor(f.trimIn * fps) : 0,
                effectiveTrimOutFrames: f.trimOut != null ? Math.floor(f.trimOut * fps) : dur,
            };
        });
    }

    // Force chop behavior if there's exactly one video
    if (validPool.length === 1) {
        allowDuplicates = true;
    }

    const targetFrames = Math.floor(targetDuration * fps);
    // Hard floor: 6 frames (0.2s) is the minimum for FFmpeg to produce a valid
    // intermediate segment with at least one keyframe. Clips shorter than this
    // produce zero-frame MKVs that crash the stitch phase.
    const MIN_RENDERABLE_FRAMES = 6;
    const minFrames = Math.max(MIN_RENDERABLE_FRAMES, Math.floor(shortestClip * fps));
    const maxFrames = Math.max(minFrames + 1, Math.floor(longestClip * fps));

    console.log('[TrailerGen] â•â•â• GENERATION START â•â•â•');
    console.log('[TrailerGen] Settings:', { targetDuration, shortestClip, longestClip, targetFrames, minFrames, maxFrames, slowmoPolicy, useAllClips, allowDuplicates });
    console.log('[TrailerGen] Pool size:', validPool.length, 'files');
    validPool.forEach((f, i) => console.log(`[TrailerGen]   Pool[${i}]: "${f.filename}" dur=${f.duration}s srcFrames=${f.sourceDurationFrames} trimIn=${f.effectiveTrimInFrames} trimOut=${f.effectiveTrimOutFrames}`));

    let accumulatedFrames = 0;
    const sequence: Clip[] = [];
    const usedSegments = new Map<string, string[]>(
        Object.entries(s.initialSegmentHistory || {}).map(([path, ranges]) => [path, [...ranges]]),
    );
    const usedFiles = new Set<string>(usedSegments.keys());
    const sourceUseCounts = new Map<string, number>(validPool.map(file => [
        file.path,
        s.initialSourceUseCounts?.[file.path] || 0,
    ]));
    let lastSourcePath: string | null = s.initialLastSourcePath || null;

    const recordSegmentUse = (file: PoolFile, trimStart: number, trimEnd: number) => {
        if (!usedSegments.has(file.path)) usedSegments.set(file.path, []);
        usedSegments.get(file.path)!.push(`${trimStart}-${trimEnd}`);
        usedFiles.add(file.path);
        sourceUseCounts.set(file.path, (sourceUseCounts.get(file.path) || 0) + 1);
        lastSourcePath = file.path;
    };

    // Select for coverage before reuse. `allowDuplicates` means a source may be
    // revisited after a pass through the eligible pool, not random sampling with
    // replacement. This prevents a few lucky files from monopolising an edit.
    const pickCoverageFile = (): PoolFile => {
        // Filter out 'show once' files that have already been used
        const eligible = validPool.filter(file => {
            if ((file as any).usageMode === 'once' && (sourceUseCounts.get(file.path) || 0) > 0) return false;
            return true;
        });
        const pool = eligible.length > 0 ? eligible : validPool;

        const minimumUse = Math.min(...pool.map(file => sourceUseCounts.get(file.path) || 0));
        let candidates = pool.filter(file => {
            const uses = sourceUseCounts.get(file.path) || 0;
            const weight = (file as any).usageWeight ?? 1;
            // 'show more' files (weight >= 2) stay eligible even at minimumUse + 1
            // 'show less' files (weight <= 0.5) only eligible at the strict minimum
            if (weight >= 2) return uses <= minimumUse + 1;
            if (weight <= 0.5) return uses === minimumUse;
            return uses === minimumUse;
        });
        // Fallback: if no candidates (all weighted out), use minimum-use from pool
        if (candidates.length === 0) {
            candidates = pool.filter(file => (sourceUseCounts.get(file.path) || 0) === minimumUse);
        }

        if (candidates.length > 1 && lastSourcePath) {
            const withoutImmediateRepeat = candidates.filter(file => file.path !== lastSourcePath);
            if (withoutImmediateRepeat.length > 0) candidates = withoutImmediateRepeat;
        }

        if (s.preferHighEnergy) {
            const bestScore = Math.max(...candidates.map(file => typeof (file as any).score === 'number' ? (file as any).score : 50));
            const highQuality = candidates.filter(file => {
                const score = typeof (file as any).score === 'number' ? (file as any).score : 50;
                return score >= bestScore - 5;
            });
            if (highQuality.length > 0) candidates = highQuality;
        }

        // Weighted random selection: 'show more' files get double probability
        const weighted = candidates.flatMap(file => {
            const w = (file as any).usageWeight ?? 1;
            if (w >= 2) return [file, file]; // double representation
            return [file];
        });
        return weighted[Math.floor(rng.random() * weighted.length)] || validPool[0];
    };

    let consecutiveFailures = 0;
    let lastDurationFrames = -1;
    let clipIndex = 0;
    const totalExpectedClips = Math.ceil(targetDuration / ((shortestClip + longestClip) / 2));

    // â”€â”€ RHYTHM PATTERN ENGINE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const rhythmId = settings.rhythmPattern || 'breathing';
    const rhythmPattern = RHYTHM_PATTERNS[rhythmId] || RHYTHM_PATTERNS['flat'];
    let prevRhythmMult = 0.5;

    /*
     * â”€â”€ SPEED & VOLUME CALCULATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     * Determines playback speed and audio volume for each generated clip.
     *
     * âš  EXPORT PIPELINE IMPACT:
     * When useAudioGuide is true and audioMixStrategy is 'muted' (the default),
     * this function sets volume=0 and isMuted=true on VIDEO clips. This is
     * correct for both preview AND export:
     *   - In preview: The TrailerPlayer mutes video audio so background music
     *     plays cleanly through the <audio> element.
     *   - In export: The export handler (electron/main.ts) uses these values to
     *     set volume=0 in the FFmpeg audio chain for video clips. The background
     *     music (type='audio' clip) is mixed in separately via amix at its own
     *     volume (typically 100), making it the only audible audio in the output.
     *
     * If you change the volume/mute logic here, you MUST verify that the
     * export handler in main.ts still produces correct audio. The handler
     * treats audio-type clips differently from video clips for volume.
     */
    // Helper for dynamic cinematic attributes
    const getSpeedAndVolume = (rng: SeededRandom, segType?: SegmentType) => {
        let speed = 1.0;
        // Cinematic Speed: 4 presets + custom. Multi-select rotates among the chosen
        // speeds (one per clip) for variety; single-select uses the one policy.
        const SPEED_MAP: Record<string, number> = { none: 1.0, slowmo: 0.5, fast: 1.5, hyper: 4.0 };
        if (s.slowmoPolicies && s.slowmoPolicies.length > 0) {
            const pick = s.slowmoPolicies[Math.floor(rng.random() * s.slowmoPolicies.length)];
            speed = SPEED_MAP[pick] ?? 1.0;
        } else if (slowmoPolicy === 'slowmo') speed = 0.5;
        else if (slowmoPolicy === 'fast') speed = 1.5;
        else if (slowmoPolicy === 'hyper') speed = 4.0;
        else if (slowmoPolicy === 'custom') speed = settings.customSpeed || 1.0;

        // Custom Speed Range: pick speed from within the range, weighted by segment type
        if (s.customSpeedRangeEnabled && s.customSpeedRange) {
            const [lo, hi] = s.customSpeedRange;
            const range = hi - lo;
            const seg = segType || 'verse';
            let t: number; // 0→1 position within the range
            switch (seg) {
                case 'drop':
                case 'chorus':
                    // Prefer the FASTER end (top 60%)
                    t = 0.4 + rng.random() * 0.6;
                    break;
                case 'buildup':
                    // Use the middle of the range
                    t = 0.2 + rng.random() * 0.6;
                    break;
                case 'breakdown':
                case 'bridge':
                case 'intro':
                    // Prefer the SLOWER end (bottom 60%)
                    t = rng.random() * 0.6;
                    break;
                case 'outro':
                    // Prefer slower
                    t = rng.random() * 0.5;
                    break;
                case 'verse':
                default:
                    // Full range evenly
                    t = rng.random();
                    break;
            }
            speed = lo + t * range;
        }

        let volume = 100;
        let isMuted = false;

        // NOTE: When background music is active, video clip audio is intentionally
        // muted/reduced. The export handler in main.ts will use these values directly
        // for video clips, but will override volume for audio-type (background music)
        // clips to ensure they always play at their intended volume.
        if (useAudioGuide) {
            if (audioMixStrategy === 'muted') { volume = 0; isMuted = true; }
            else if (audioMixStrategy === 'subtle') { volume = 20; }
            else if (audioMixStrategy === 'ducking') { volume = (rng.random() > 0.8) ? 100 : 15; }
        }

        return { speed, volume, isMuted };
    };

    // Find a novel source window. Candidate coverage is deliberately spread over
    // the full usable range; scene cuts are preferred only when they do not force
    // the same handful of trim points to repeat.
    const getBestTrimStart = (file: PoolFile, sourceReq: number, history: string[], rng: SeededRandom): number => {
        const f = file as any;
        let trimInOffset = file.effectiveTrimInFrames;
        let trimOutLimit = file.effectiveTrimOutFrames;
        // Smart prep: prefer the non-silent usable range when it's been precomputed.
        if (typeof f._usableInFrames === 'number' || typeof f._usableOutFrames === 'number') {
            const ui = typeof f._usableInFrames === 'number' ? f._usableInFrames : trimInOffset;
            const uo = typeof f._usableOutFrames === 'number' ? f._usableOutFrames : trimOutLimit;
            if (uo - ui >= sourceReq) { trimInOffset = Math.max(trimInOffset, ui); trimOutLimit = Math.min(trimOutLimit, uo); }
        }
        // Build excluded zones from gaps between kept ranges
        const keptRanges: {inFrame: number, outFrame: number}[] = Array.isArray(f._keptRanges) ? f._keptRanges : [];
        const availableRange = trimOutLimit - trimInOffset - sourceReq;

        if (availableRange <= 0) {
            return trimInOffset; // File is shorter than requested — use from trim start
        }

        const START_OFFSET_FRAMES = Math.floor(1.0 * fps);
        const effectiveStart = trimInOffset + Math.min(START_OFFSET_FRAMES, availableRange);
        const effectiveRange = trimOutLimit - sourceReq - effectiveStart;

        if (effectiveRange <= 0) return effectiveStart;

        const previousRanges = (history || []).map(range => range.split('-').map(Number) as [number, number]);
        const sceneCuts: number[] = Array.isArray(f._sceneCutsFrames)
            ? f._sceneCutsFrames.filter((cut: number) => cut >= effectiveStart && cut + sourceReq <= trimOutLimit)
            : [];
        const candidates = new Set<number>(sceneCuts);
        const sampleCount = 24;
        for (let i = 0; i <= sampleCount; i++) {
            candidates.add(effectiveStart + Math.floor((effectiveRange * i) / sampleCount));
        }
        for (let i = 0; i < sampleCount; i++) {
            candidates.add(effectiveStart + Math.floor(rng.random() * effectiveRange));
        }

        let bestTrimStart = effectiveStart;
        let bestScore = -Infinity;
        for (const candidate of candidates) {
            const candEnd = candidate + sourceReq;
            let minSeparation = effectiveRange;
            let exactReuse = false;

            for (const [start, end] of previousRanges) {
                if (candidate === start && candEnd === end) {
                    exactReuse = true;
                    break;
                }
                const separation = candEnd <= start
                    ? start - candEnd
                    : candidate >= end
                        ? candidate - end
                        : -Math.min(candEnd, end) + Math.max(candidate, start);
                minSeparation = Math.min(minSeparation, separation);
            }

            // Skip candidates that overlap an excluded zone (gap between kept ranges)
            if (keptRanges.length > 1) {
                const candStart = candidate;
                const candEnd2 = candidate + sourceReq;
                let overlapsExcluded = false;
                for (let k = 0; k < keptRanges.length - 1; k++) {
                    const gapStart = keptRanges[k].outFrame;
                    const gapEnd = keptRanges[k + 1].inFrame;
                    if (gapEnd > gapStart && candStart < gapEnd && candEnd2 > gapStart) {
                        overlapsExcluded = true;
                        break;
                    }
                }
                if (overlapsExcluded) continue;
            }
            if (exactReuse && candidates.size > 1) continue;
            const sceneCutBonus = sceneCuts.includes(candidate) ? 0.25 : 0;
            const score = minSeparation + sceneCutBonus + rng.random() * 0.01;
            if (score > bestScore) {
                bestScore = score;
                bestTrimStart = candidate;
            }
        }

        return bestTrimStart;
    };

    const createClip = (file: PoolFile, startFrame: number, endFrame: number, trimStart: number, trimEnd: number, speed: number, volume: number, isMuted: boolean): Clip => ({
        id: uuidv4(),
        mediaLibraryId: file.id,
        type: file.type as 'video' | 'audio' | 'image',
        path: file.path,
        filename: file.filename,
        startFrame,
        endFrame,
        sourceDurationFrames: file.sourceDurationFrames,
        trimStartFrame: trimStart,
        trimEndFrame: trimEnd,
        track: 1,
        speed,
        volume,
        reversed: false,
        isMuted,
        isPinned: false,
        origin: 'auto',
        locked: false,
        sourceOrientation: file.orientation || 'horizontal',
        rotation: file.rotation || 0,   // persist upload-page rotation into the render
        // Source-level framing (zoom + reposition from import page)
        ...(file.sourceZoom && file.sourceZoom !== 100 ? { sourceZoom: file.sourceZoom } : {}),
        ...(file.sourcePanX ? { sourcePanX: file.sourcePanX } : {}),
        ...(file.sourcePanY ? { sourcePanY: file.sourcePanY } : {}),
        // Usage weight (for per-clip tracking)
        ...(file.usageWeight && file.usageWeight !== 1 ? { usageWeight: file.usageWeight, usageMode: file.usageMode } : {}),
        ...(s.globalEffects?.length ? { parametricEffects: s.globalEffects } : {}),
        ...((file as any)._autoGrade ? { colorGrading: (file as any)._autoGrade } : (s.globalColorGrading ? { colorGrading: s.globalColorGrading } : {})),
        ...(s.globalFlipH ? { flipH: true } : {}),
        ...(s.globalFlipV ? { flipV: true } : {}),
        ...(s.globalSharpen ? { sharpen: s.globalSharpen } : {}),
        ...(s.globalBlurAmount ? { blurAmount: s.globalBlurAmount } : {}),
        ...(s.globalChromaKey?.enabled ? { chromaKey: s.globalChromaKey } : {}),
        ...(s.globalStabilize?.enabled ? { stabilize: s.globalStabilize } : {}),
        ...(s.globalAudioEffects ? { audioEffects: s.globalAudioEffects } : {}),
        ...((file as any).deflicker ? { deflicker: { enabled: true, includeAudio: true, layers: 3 as const } } : {}),
    });

    // Helper: finalize a clip sequence with orientation-aware zoom + transitions
    const finalizeSequence = (seq: Clip[]): Clip[] => {
        console.log(`[TrailerGen] â•â•â• FINALIZE â•â•â• ${seq.length} clips, accumulated=${accumulatedFrames}fr (${(accumulatedFrames/fps).toFixed(1)}s)`);
        
        // â”€â”€ BLACK SCREEN PREVENTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // 0a. Clamp all trim ranges to valid source bounds
        const clamped = seq.map((c, idx) => {
            const srcDur = c.sourceDurationFrames || 9000;
            let ts = Math.max(0, c.trimStartFrame || 0);
            let te = Math.min(srcDur, c.trimEndFrame || srcDur);
            // Ensure trim range has at least MIN_RENDERABLE_FRAMES
            if (te - ts < MIN_RENDERABLE_FRAMES) {
                ts = Math.max(0, te - MIN_RENDERABLE_FRAMES);
                if (te - ts < MIN_RENDERABLE_FRAMES) te = ts + MIN_RENDERABLE_FRAMES;
            }
            const clipDur = c.endFrame - c.startFrame;
            // If the clip's output duration exceeds what the source can provide, shrink it
            const maxOutputFrames = Math.ceil((te - ts) / (c.speed || 1));
            const safeDur = Math.min(clipDur, maxOutputFrames);
            
            if (safeDur < clipDur) {
                console.warn(`[TrailerGen] CLAMP clip[${idx}] "${c.filename}": clipDur=${clipDur} -> safeDur=${safeDur} (srcDur=${srcDur}, trimRange=${te-ts}, speed=${c.speed}, maxOutput=${maxOutputFrames})`);
            }
            
            return {
                ...c,
                trimStartFrame: ts,
                trimEndFrame: te,
                endFrame: c.startFrame + Math.max(MIN_RENDERABLE_FRAMES, safeDur),
            };
        });

        // 0b. Remove zero-duration, negative-duration, or path-less clips
        const validSeq = clamped.filter(c => {
            const dur = c.endFrame - c.startFrame;
            return dur >= MIN_RENDERABLE_FRAMES && c.path && c.path.length > 0;
        });

        // 0c. Close gaps by re-snapping timelines
        let cursor = 0;
        const gapFilled: Clip[] = [];
        for (const c of validSeq) {
            const dur = c.endFrame - c.startFrame;
            // Hard clamp: never exceed targetFrames
            if (cursor >= targetFrames) break;
            const clampedDur = Math.min(dur, targetFrames - cursor);
            if (clampedDur < MIN_RENDERABLE_FRAMES) break;
            gapFilled.push({ ...c, startFrame: cursor, endFrame: cursor + clampedDur });
            cursor += clampedDur;
        }

        // 0d. DURATION BACKFILL: the clamp step (0a) can shrink clips when a source
        // video is shorter than the requested clip duration.  After re-snapping the
        // total may fall short of targetFrames. Fill the remainder with fresh clips
        // from the pool so the edit always honours the user's requested duration.
        if (cursor < targetFrames && validPool.length > 0) {
            const deficit = targetFrames - cursor;
            console.log(`[TrailerGen] BACKFILL: clamped sequence is ${(cursor/fps).toFixed(1)}s / ${(targetFrames/fps).toFixed(1)}s target — filling ${(deficit/fps).toFixed(1)}s`);
            const fillRng = new SeededRandom(seed + '_backfill');
            const fillPool = fillRng.shuffle(validPool);
            let fillIdx = 0;
            let fillSafety = 0;
            while (cursor < targetFrames && fillSafety < 500) {
                fillSafety++;
                const remaining = targetFrames - cursor;
                if (remaining < MIN_RENDERABLE_FRAMES) break;
                const file = fillPool[fillIdx % fillPool.length];
                fillIdx++;
                const availFrames = Math.max(0,
                    (file.effectiveTrimOutFrames ?? file.sourceDurationFrames) - (file.effectiveTrimInFrames ?? 0));
                if (availFrames < MIN_RENDERABLE_FRAMES) continue;
                const dur = Math.min(
                    Math.floor(fillRng.random() * (maxFrames - minFrames + 1)) + minFrames,
                    remaining,
                    availFrames,
                );
                if (dur < MIN_RENDERABLE_FRAMES) continue;
                const { speed, volume, isMuted } = getSpeedAndVolume(fillRng);
                const sourceReq = Math.max(1, Math.ceil(dur * speed));
                const trimIn = file.effectiveTrimInFrames ?? 0;
                const trimOut = file.effectiveTrimOutFrames ?? file.sourceDurationFrames;
                const trimStart = trimIn + Math.min(
                    Math.floor(fillRng.random() * Math.max(0, trimOut - trimIn - sourceReq)),
                    Math.max(0, trimOut - trimIn - sourceReq),
                );
                const trimEnd = Math.min(trimStart + sourceReq, trimOut);
                gapFilled.push(createClip(file, cursor, cursor + dur, trimStart, trimEnd, speed, volume, isMuted));
                cursor += dur;
            }
            console.log(`[TrailerGen] BACKFILL complete: ${gapFilled.length} clips, ${(cursor/fps).toFixed(1)}s`);
        }

        let finalClips = gapFilled;

        // ── BOOMERANG MARKING: frequency-controlled, multi-preset (rotated one at a
        // time across clips so several boomerang styles can coexist in one edit). ──
        const boomPresets: BoomerangPresetId[] = (s.boomerangPresets && s.boomerangPresets.length)
            ? s.boomerangPresets
            : (s.boomerangPreset ? [s.boomerangPreset] : ['classic']);
        const boomFreq = s.boomerangAll ? 1 : Math.max(0, Math.min(1, (s.boomerangFrequency ?? 0) / 100));
        if (boomFreq > 0) {
            const boomRng = new SeededRandom(s.seed ? s.seed + '_boom' : generateSeed());
            let presetCursor = 0;
            for (const clip of finalClips) {
                if (clip.type === 'audio') continue;
                const force = clip.boomerang === true;          // per-clip toggle from the timeline
                if (force || boomRng.random() < boomFreq) {
                    clip.boomerang = true;
                    clip.reversed = false;
                    // Rotate presets one-at-a-time; honor a pre-set per-clip preset.
                    (clip as any)._boomPreset = clip.boomerangPreset || boomPresets[presetCursor % boomPresets.length];
                    presetCursor++;
                }
            }
        }

        // ── BOOMERANG EXPANSION: expand boomerang clips into sub-clips ──
        let expandedClips: Clip[] = [];
        for (const clip of finalClips) {
            if (clip.boomerang) {
                const preset = getBoomerangPreset((clip as any)._boomPreset || clip.boomerangPreset || boomPresets[0]);
                const expanded = expandClipToBoomerang(clip, preset, fps);
                expandedClips.push(...expanded);
            } else {
                expandedClips.push(clip);
            }
        }
        // Re-magnetize + RE-CLAMP to the target duration. Boomerang/effect expansion
        // changes a clip's timeline footprint (a classic boomerang ~doubles it), so
        // after laying clips sequentially we trim the sequence back to EXACTLY
        // targetFrames. Without this the generated edit overshoots the declared (or
        // song-derived) duration on every boomerang. The pre-expansion sequence was
        // already clamped to targetFrames, so this only ever trims the overflow.
        {
            const laid: Clip[] = [];
            let head = 0;
            for (const clip of expandedClips) {
                if (targetFrames > 0 && head >= targetFrames) break;
                const dur = clip.endFrame - clip.startFrame;
                const allowed = targetFrames > 0 ? Math.min(dur, targetFrames - head) : dur;
                if (allowed < MIN_RENDERABLE_FRAMES) { if (targetFrames > 0) break; else continue; }
                laid.push({ ...clip, startFrame: head, endFrame: head + allowed });
                head += allowed;
            }
            expandedClips = laid;
        }

        // ── VISUAL FX SAFETY SWEEP ──
        // Ensure film grain, vignette, chromatic aberration, and letterbox are
        // stamped on EVERY clip. Some code paths (standard mode, fill loops) may
        // create clips without passing through the beat-driven VFX assignment.
        // This sweep guarantees the effects persist throughout the entire edit.
        for (const clip of expandedClips) {
            if (s.filmGrainAmount && s.filmGrainAmount > 0 && !clip.filmGrain) clip.filmGrain = s.filmGrainAmount;
            if (s.vignetteAmount && s.vignetteAmount > 0 && !clip.vignette) clip.vignette = s.vignetteAmount;
            if (s.chromaticAmount && s.chromaticAmount > 0 && !clip.chromaticAberration) clip.chromaticAberration = s.chromaticAmount;
            if (s.letterboxEnabled && !clip.letterbox) clip.letterbox = true;
        }

        // ── TRANSITION ASSIGNMENT (Context-Aware) ──
        // Uses clip intelligence metadata when available for smarter transition selection.
        // Falls back to segment-based selection when intelligence data is absent.
        if (s.transitionStyle && s.transitionStyle !== 'cuts-only') {
            const transitionRng = new SeededRandom(s.seed ? s.seed + '_transitions' : generateSeed());
            const beats = settings.audioAnalysis?.gridBeats ?? [];
            const downbeats = settings.audioAnalysis?.downbeats ?? [];
            const beatTol = 0.12; // seconds tolerance for beat alignment

            for (let i = 0; i < expandedClips.length - 1; i++) {
                const clip = expandedClips[i];
                const nextClip = expandedClips[i + 1];
                const segType: SegmentType = (clip as any)._segType || 'verse';
                const nextSegType: SegmentType = (nextClip as any)._segType || 'verse';

                // Determine clip energies from segment type as heuristic
                const segEnergyMap: Record<string, EnergyLevel> = {
                    drop: 'intense', chorus: 'high', buildup: 'high',
                    verse: 'moderate', bridge: 'moderate',
                    intro: 'calm', outro: 'calm', breakdown: 'calm',
                };
                const outEnergy = segEnergyMap[segType] || 'moderate';
                const inEnergy = segEnergyMap[nextSegType] || 'moderate';

                // Color temp heuristic from segment type
                const segColorMap: Record<string, ColorTemperature> = {
                    drop: 'cool', chorus: 'warm', buildup: 'neutral',
                    verse: 'neutral', bridge: 'cool',
                    intro: 'cool', outro: 'warm', breakdown: 'cool',
                };

                const cutTime = clip.endFrame / fps;
                const isOnBeat = beats.some(b => Math.abs(b - cutTime) <= beatTol);
                const isOnDownbeat = downbeats.some(d => Math.abs(d - cutTime) <= beatTol);
                const isDropMoment = nextSegType === 'drop' && isOnDownbeat;

                const ctx: TransitionContext = {
                    segment: segType,
                    outgoingEnergy: outEnergy,
                    incomingEnergy: inEnergy,
                    isOnBeat,
                    isOnDownbeat,
                    isDropMoment,
                    outgoingColorTemp: segColorMap[segType] || 'neutral',
                    incomingColorTemp: segColorMap[nextSegType] || 'neutral',
                };

                const transType = selectContextAwareTransition(
                    ctx,
                    s.transitionTypes ?? [],
                    s.transitionStyle || 'mixed',
                    transitionRng,
                );
                if (transType !== 'cut') {
                    const durationMs = s.transitionDurationMs ?? 200;
                    const durationFrames = Math.round((durationMs / 1000) * fps);
                    clip.transition = {
                        type: transType,
                        durationFrames,
                    };
                }
            }

            // ── RETURN TRANSITIONS (A → B → A) ──
            // Mirror selected forward transitions with their reverse on the next
            // boundary, so the edit moves out and comes back. Frequency-controlled.
            if (s.returnTransitions) {
                applyReturnTransitions(expandedClips, {
                    frequency: s.returnTransitionFrequency ?? 50,
                    seed: s.seed ? s.seed + '_return' : undefined,
                });
            }
        }

        // ── INTELLIGENT TRANSITIONS (Match-Cut & Seamless) ──
        // If the user has enabled match-cut or seamless transitions, overlay them
        // at clip boundaries where the Smart Engine detected visual similarity.
        // This respects the user's allowed transition list — only applies if the
        // intelligent types are in their selection.
        {
            const allowed = s.transitionTypes ?? [];
            const wantMatchCut = allowed.length === 0 || allowed.includes('match-cut');
            const wantSeamless = allowed.length === 0 || allowed.includes('seamless');

            if ((wantMatchCut || wantSeamless) && typeof window !== 'undefined') {
                try {
                    // Access smart engine store synchronously — it's always available in the renderer
                    const { useTrailerSmartStore: smartStore } = require('../store/trailerSmartStore');
                    const smartState = smartStore.getState();
                    const smartResults = smartState.analysisResults;

                    if (smartResults && Object.keys(smartResults).length > 0) {
                        // Build a lookup from file path → analysis result
                        const pathToResult: Record<string, any> = {};
                        for (const [id, result] of Object.entries(smartResults)) {
                            const scannedFile = smartState.scannedFiles?.[id];
                            if (scannedFile?.path) pathToResult[scannedFile.path] = result;
                            else pathToResult[id] = result; // fallback
                        }

                        const durationFrames = Math.round(((s.transitionDurationMs ?? 200) / 1000) * fps);

                        for (let i = 0; i < expandedClips.length - 1; i++) {
                            const outClip = expandedClips[i];
                            const inClip = expandedClips[i + 1];
                            const outResult = pathToResult[outClip.path];
                            const inResult = pathToResult[inClip.path];

                            if (!outResult || !inResult) continue;

                            // Check for seamless first (stronger requirement)
                            if (wantSeamless) {
                                const histSim = histogramSimilarity(outResult.colorHistogram, inResult.colorHistogram);
                                const motionDelta = motionDirectionDelta(outResult.dominantMotionDirection, inResult.dominantMotionDirection);
                                const hashDist = hammingDistance(outResult.endFrameSignature, inResult.startFrameSignature);

                                if (histSim >= 0.85 && motionDelta <= 30 && hashDist <= 12) {
                                    outClip.transition = { type: 'seamless', durationFrames: Math.max(3, Math.round(durationFrames * 0.5)) };
                                    continue;
                                }
                            }

                            // Check for match-cut (lighter requirement — just visual similarity)
                            if (wantMatchCut) {
                                const hashDist = hammingDistance(outResult.endFrameSignature, inResult.startFrameSignature);
                                if (hashDist <= 8) {
                                    outClip.transition = { type: 'match-cut', durationFrames: 0 }; // hard cut at matched frames
                                    continue;
                                }
                            }
                        }
                    }
                } catch {
                    // Smart engine data not available — skip intelligent transitions gracefully
                }
            }
        }

        // ── COLOR PER SECTION ──
        if (s.colorPerSection) {
            for (const clip of expandedClips) {
                const segType: SegmentType = (clip as any)._segType || 'verse';
                const colorPreset = getColorForSection(segType);
                // Apply as color grading if not already graded
                if (!clip.colorGrading) {
                    clip.colorGrading = {
                        temperature: colorPreset.warmth * 100,
                        tint: 0,
                        exposure: colorPreset.brightness * 2,
                        contrast: colorPreset.contrast,
                        highlights: 0,
                        shadows: 0,
                        saturation: colorPreset.saturation,
                        vibrance: 1.0,
                    };
                }
            }
        }

        // ── SHAKE ASSIGNMENT ──
        // Derive shakeEnabled from shakePolicy — the wizard sets the policy
        // directly (off/sparingly/heavy-beats/every-beat) without ever toggling
        // shakeEnabled explicitly, so gate on the policy value itself.
        if (s.shakePolicy && s.shakePolicy !== 'off') {
            const shakeRng = new SeededRandom(s.seed ? s.seed + '_shake' : generateSeed());
            for (const clip of expandedClips) {
                const segType: SegmentType = (clip as any)._segType || 'verse';
                const beatMarkers = clip.beatMarkers || [];
                const maxEnergy = beatMarkers.length > 0 ? Math.max(...beatMarkers.map(b => b.energy)) : 0;

                let shouldShake = false;
                // Per-clip beatMarkers/energy aren't populated during generation, so gate
                // on the policy + segment type (always available) so shake actually fires.
                if (s.shakePolicy === 'on-every-beat') shouldShake = true;
                else if (s.shakePolicy === 'heavy-beats-only') shouldShake = (segType === 'drop' || segType === 'chorus' || maxEnergy > 0.7);
                else if (s.shakePolicy === 'sparingly') shouldShake = ((segType === 'drop' || segType === 'chorus') && shakeRng.random() < 0.5);

                if (shouldShake && !clip.shake) {
                    const shakeType = s.shakeType === 'all'
                        ? (['impact', 'handheld', 'earthquake', 'vibration', 'whip'] as const)[Math.floor(shakeRng.random() * 5)]
                        : (s.shakeType || 'impact');
                    clip.shake = {
                        type: shakeType as any,
                        intensity: s.shakeIntensity ?? 50,
                        direction: 'random',
                        decayRate: 5,
                        durationFrames: Math.round(fps * 0.3),
                    };
                }
            }
        }

        // ── ZOOM / STILL IMAGE / KEN BURNS ASSIGNMENT ──
        {
            const zoomRng = new SeededRandom(s.seed ? s.seed + '_zoom' : generateSeed());
            const zoomValues = s.zoomValues ?? [100, 125, 150, 175, 200];
            const isKenBurnsGlobal = s.reframingStrategy === 'ken-burns';

            for (const clip of expandedClips) {
                if (clip.zoomStart !== undefined || clip.zoomEnd !== undefined) continue; // Already zoomed

                const srcFile = validPool.find(f => f.path === clip.path) as PoolFile | undefined;
                
                // Still Image / Photo / Static Clip Detection Heuristic
                let isStill = false;
                if (srcFile) {
                    if (srcFile.type === 'image') {
                        isStill = true;
                    } else {
                        // Heuristic still image detection from Smart Engine results:
                        try {
                            const { useTrailerSmartStore: smartStore } = require('../store/trailerSmartStore');
                            const smartState = smartStore.getState();
                            const smartResult = smartState.getResult(srcFile.id);
                            if (smartResult && smartResult.analyzed) {
                                const hasNoCuts = !smartResult.sceneCutsFrames || smartResult.sceneCutsFrames.length === 0;
                                const isStatic = smartResult.energyLevel === 'static' || (smartResult.score !== undefined && smartResult.score < 10);
                                if (isStatic && hasNoCuts) {
                                    isStill = true;
                                }
                            }
                        } catch { /* skip if error or store not loaded */ }
                    }
                }

                const applyKenBurns = isKenBurnsGlobal || isStill;

                if (applyKenBurns) {
                    // Ken Burns effect: subtle slow zoom/pan (100% to 115%, or 115% to 100%)
                    const zoomVal = 115; 
                    if (zoomRng.random() < 0.5) {
                        clip.zoomStart = 100;
                        clip.zoomEnd = zoomVal;
                    } else {
                        clip.zoomStart = zoomVal;
                        clip.zoomEnd = 100;
                    }
                    // Randomize origin for dynamic pans: center, left, right, top, bottom
                    const origins: Array<'center' | 'left' | 'right' | 'top' | 'bottom'> = ['center', 'left', 'right', 'top', 'bottom'];
                    clip.zoomOrigin = origins[Math.floor(zoomRng.random() * origins.length)];
                    clip.zoomSpeed = 'slow';
                    
                    // Clamp offsets
                    const maxZoom = Math.max(clip.zoomStart ?? 100, clip.zoomEnd ?? 100);
                    if (srcFile?.width && srcFile?.height && maxZoom > 100) {
                        const clampedX = clampZoomOffset(maxZoom, (srcFile.width - srcFile.width / (maxZoom / 100)) / 2, srcFile.width);
                        const clampedY = clampZoomOffset(maxZoom, (srcFile.height - srcFile.height / (maxZoom / 100)) / 2, srcFile.height);
                        (clip as any)._zoomClampedX = clampedX;
                        (clip as any)._zoomClampedY = clampedY;
                    }
                } else if (s.zoomEnabled) {
                    // Regular settings-based zoom
                    let zoomVal: number;
                    if (s.zoomCustomRangeEnabled && s.zoomCustomRange) {
                        const [lo, hi] = s.zoomCustomRange;
                        zoomVal = Math.round((lo + zoomRng.random() * (hi - lo)) / 5) * 5;
                    } else {
                        zoomVal = zoomValues[Math.floor(zoomRng.random() * zoomValues.length)];
                    }

                    if (zoomVal !== 100) {
                        if (zoomRng.random() < 0.5) {
                            clip.zoomStart = 100;
                            clip.zoomEnd = zoomVal;
                        } else {
                            clip.zoomStart = zoomVal;
                            clip.zoomEnd = 100;
                        }
                        clip.zoomOrigin = 'center';

                        const maxZoom = Math.max(clip.zoomStart ?? 100, clip.zoomEnd ?? 100);
                        if (srcFile?.width && srcFile?.height && maxZoom > 100) {
                            const clampedX = clampZoomOffset(maxZoom, (srcFile.width - srcFile.width / (maxZoom / 100)) / 2, srcFile.width);
                            const clampedY = clampZoomOffset(maxZoom, (srcFile.height - srcFile.height / (maxZoom / 100)) / 2, srcFile.height);
                            (clip as any)._zoomClampedX = clampedX;
                            (clip as any)._zoomClampedY = clampedY;
                        }

                        if (s.zoomSpeed && s.zoomSpeed !== 'all') {
                            clip.zoomSpeed = s.zoomSpeed as any;
                        } else if (s.zoomSpeed === 'all') {
                            const speeds: Array<'instant' | 'fast' | 'slow'> = ['instant', 'fast', 'slow'];
                            clip.zoomSpeed = speeds[Math.floor(zoomRng.random() * speeds.length)];
                        }

                        if (s.zoomBeatSync) {
                            const clipDurSec = (clip.endFrame - clip.startFrame) / fps;
                            clip.zoomSpeed = clipDurSec <= 0.5 ? 'instant' : 'fast';
                        }
                    }
                }
            }
        }

        // ── ADVANCED EDIT-EFFECT ASSIGNMENT (intelligent per-clip application) ──
        // Each effect applies by policy: off / sparingly / per-beat / every-clip.
        // "sparingly" favors drops & downbeats; "per-beat" targets downbeat-aligned
        // clips; "every-clip" applies to all. Downbeats come from the rebuilt Beat
        // Intelligence Engine when available; otherwise every cut counts as on-grid.
        {
            const fxRng = new SeededRandom(s.seed ? s.seed + '_fx' : generateSeed());
            const dbeats = settings.audioAnalysis?.downbeats ?? [];
            const dbTol = 0.12;
            const isDownbeatClip = (clip: Clip): boolean => {
                if (dbeats.length === 0) return true;
                const t = clip.startFrame / fps;
                return dbeats.some(d => Math.abs(d - t) <= dbTol);
            };
            const shouldApply = (policy: EffectApplyPolicy | undefined, clip: Clip): boolean => {
                if (!policy || policy === 'off') return false;
                if (policy === 'every-clip') return true;
                const segType: SegmentType = (clip as any)._segType || 'verse';
                const down = isDownbeatClip(clip);
                if (policy === 'per-beat') return down;
                // sparingly — reserve for high-impact moments
                if (segType === 'drop' || segType === 'chorus') return down || fxRng.random() < 0.5;
                return down && fxRng.random() < 0.3;
            };

            let deGradCursor = 0; // rotates gradients one-per-clip in 'cycle' mode
            for (const clip of expandedClips) {
                if (!clip.motionBlur && shouldApply(s.motionBlurPolicy, clip)) {
                    clip.motionBlur = { amount: s.motionBlurAmount ?? 50 };
                }
                if (!clip.glow && shouldApply(s.glowPolicy, clip)) {
                    clip.glow = { intensity: s.glowIntensity ?? 55, radius: s.glowRadius ?? 50, threshold: 55 };
                }
                if (!clip.doubleExposure && shouldApply(s.doubleExposurePolicy, clip)) {
                  const gradIds = (s.doubleExposureGradientIds || []).filter(Boolean);
                  if (gradIds.length > 0) {
                    // GRADIENT double exposure: procedural colour overlay(s).
                    // 'cycle' rotates one gradient per clip; 'stack' applies all selected.
                    const mode = s.doubleExposureGradientMode || 'cycle';
                    let chosen: string[][];
                    if (mode === 'stack') {
                        chosen = gradIds.map(id => getGradientColors(id)).filter(c => c.length > 0);
                    } else {
                        chosen = [getGradientColors(gradIds[deGradCursor % gradIds.length])].filter(c => c.length > 0);
                    }
                    deGradCursor++;
                    if (chosen.length > 0) {
                        clip.doubleExposure = {
                            blendMode: s.doubleExposureBlend ?? 'screen',
                            opacity: s.doubleExposureOpacity ?? 50,
                            shape: null,
                            gradients: chosen,
                        };
                    }
                  } else {
                    // TRUE double exposure: overlay a DIFFERENT source clip (never the
                    // same file), with a seeded-random source window for variance, and
                    // a shape chosen per the user's shape mode (full / shaped / mix).
                    const deCands = validPool.filter(f => f.path !== clip.path && f.type !== 'audio');
                    if (deCands.length > 0) {
                        const ov = deCands[Math.floor(fxRng.random() * deCands.length)];
                        const ovIn = ov.effectiveTrimInFrames || 0;
                        const ovUsable = Math.max(2, (ov.effectiveTrimOutFrames || ov.sourceDurationFrames || 300) - ovIn);
                        const want = Math.max(2, (clip.endFrame - clip.startFrame) + 4);
                        const ovLen = Math.min(ovUsable, want);
                        const ovStart = ovIn + Math.floor(fxRng.random() * Math.max(1, ovUsable - ovLen));
                        const mode = s.doubleExposureShapeMode || 'mix';
                        const shape = mode === 'full' ? null
                            : mode === 'shaped' ? pickDoubleExposureShape(fxRng.random())
                            : (fxRng.random() < 0.5 ? null : pickDoubleExposureShape(fxRng.random()));
                        clip.doubleExposure = {
                            overlayPath: ov.path,
                            overlayTrimStart: ovStart,
                            overlayTrimEnd: ovStart + ovLen,
                            blendMode: s.doubleExposureBlend ?? 'screen',
                            opacity: s.doubleExposureOpacity ?? 50,
                            shape,
                        };
                    }
                  }
                }
                if (!clip.vibrationFlash && shouldApply(s.vibrationFlashPolicy, clip)) {
                    clip.vibrationFlash = {
                        intensity: s.vibrationFlashIntensity ?? 70,
                        durationFrames: Math.max(2, Math.round(fps * 0.12)),
                    };
                }
                if (!clip.smoothSlowmo && shouldApply(s.smoothSlowmoPolicy, clip)) {
                    // Render-time gate only activates this on genuinely slowed clips.
                    clip.smoothSlowmo = true;
                }
                if (!clip.rgbSplit && shouldApply(s.rgbSplitPolicy, clip)) {
                    clip.rgbSplit = { amount: s.rgbSplitAmount ?? 45 };
                }
                if (!clip.hueCycle && shouldApply(s.hueCyclePolicy, clip)) {
                    clip.hueCycle = { speed: s.hueCycleSpeed ?? 30 };
                }
                if (!clip.vhs && shouldApply(s.vhsPolicy, clip)) {
                    clip.vhs = { amount: s.vhsAmount ?? 50 };
                }
                // ── DEFLICKER ──
                if (s.deflickerPolicy && s.deflickerPolicy !== 'off') {
                    if (clip.type !== 'audio' && !clip.deflicker?.enabled && shouldApply(s.deflickerPolicy, clip)) {
                        clip.deflicker = {
                            enabled: true,
                            includeAudio: true,
                            layers: s.deflickerLayers ?? 3,
                        };
                    }
                }
                // ── Triple Exposure: two overlay clips at 50% and 25% opacity ──
                if (!clip.tripleExposure && shouldApply(s.tripleExposurePolicy, clip)) {
                    const teCands = validPool.filter(f => f.path !== clip.path && f.type !== 'audio');
                    if (teCands.length >= 2) {
                        // Pick two DIFFERENT overlay clips
                        const shuffled = [...teCands].sort(() => fxRng.random() - 0.5);
                        const ov1 = shuffled[0];
                        const ov2 = shuffled[1];
                        const makeOverlay = (ov: typeof ov1, opacity: number) => {
                            const ovIn = ov.effectiveTrimInFrames || 0;
                            const ovUsable = Math.max(2, (ov.effectiveTrimOutFrames || ov.sourceDurationFrames || 300) - ovIn);
                            const want = Math.max(2, (clip.endFrame - clip.startFrame) + 4);
                            const ovLen = Math.min(ovUsable, want);
                            const ovStart = ovIn + Math.floor(fxRng.random() * Math.max(1, ovUsable - ovLen));
                            return {
                                overlayPath: ov.path,
                                overlayTrimStart: ovStart,
                                overlayTrimEnd: ovStart + ovLen,
                                blendMode: (s.tripleExposureBlend ?? 'screen') as any,
                                opacity,
                                shape: null,
                            };
                        };
                        clip.tripleExposure = {
                            layer1: makeOverlay(ov1, s.tripleExposureOpacity ?? 50),
                            layer2: makeOverlay(ov2, Math.round((s.tripleExposureOpacity ?? 50) / 2)),
                        };
                    }
                }
            }
        }

        // ── PIP (Picture-in-Picture) OVERLAY GENERATION ──────────────────────
        // Creates duplicate clips on track 3 as composited overlays.  Each PIP
        // clip uses a DIFFERENT source video than the background clip it sits on.
        // Policy: off / sparingly (~20%) / per-beat (~50%) / every-clip (100%).
        if (s.pipPolicy && s.pipPolicy !== 'off') {
            const pipRng = new SeededRandom(s.seed ? s.seed + '_pip' : generateSeed());
            const pipClips: Clip[] = [];

            // 3×3 grid position → compositeX / compositeY lookup
            const pipGrid: Record<number, { x: number; y: number }> = {
                1: { x: 15, y: 15 },  // TL
                2: { x: 50, y: 15 },  // TC
                3: { x: 85, y: 15 },  // TR
                4: { x: 15, y: 50 },  // ML
                5: { x: 50, y: 50 },  // MC
                6: { x: 85, y: 50 },  // MR
                7: { x: 15, y: 85 },  // BL
                8: { x: 50, y: 85 },  // BC
                9: { x: 85, y: 85 },  // BR
            };

            // Policy → probability mapping (mirrors shouldApply pattern)
            const shouldApplyPip = (policy: EffectApplyPolicy): boolean => {
                if (policy === 'every-clip') return true;
                if (policy === 'per-beat') return pipRng.random() < 0.5;
                // sparingly
                return pipRng.random() < 0.2;
            };

            const basePos = pipGrid[s.pipPosition || 9] || pipGrid[9];
            const videoCandidates = validPool.filter(f => f.type !== 'audio');

            for (const clip of expandedClips) {
                if (clip.type === 'audio') continue;
                if (!shouldApplyPip(s.pipPolicy)) continue;

                // Pick a DIFFERENT source than the background clip
                const altCands = videoCandidates.filter(f => f.path !== clip.path);
                if (altCands.length === 0) continue;
                const srcFile = altCands[Math.floor(pipRng.random() * altCands.length)];

                // Compute trim window for the overlay source
                const srcIn = srcFile.effectiveTrimInFrames || 0;
                const srcUsable = Math.max(2, (srcFile.effectiveTrimOutFrames || srcFile.sourceDurationFrames || 300) - srcIn);
                const want = Math.max(2, (clip.endFrame - clip.startFrame) + 4);
                const srcLen = Math.min(srcUsable, want);
                const srcStart = srcIn + Math.floor(pipRng.random() * Math.max(1, srcUsable - srcLen));

                // Resolve position (supports movement paths)
                let posX = basePos.x;
                let posY = basePos.y;
                if (s.pipMovement && s.pipMovement !== 'static' && s.pipMovementPath && s.pipMovementPath.length > 0) {
                    // Pick a position from the path using RNG (beat-synced rotation)
                    const pathPos = s.pipMovementPath[Math.floor(pipRng.random() * s.pipMovementPath.length)];
                    const resolved = pipGrid[pathPos] || basePos;
                    posX = resolved.x;
                    posY = resolved.y;
                } else if (s.pipMovement === 'random') {
                    const allPositions = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
                    const randPos = allPositions[Math.floor(pipRng.random() * allPositions.length)];
                    const resolved = pipGrid[randPos];
                    posX = resolved.x;
                    posY = resolved.y;
                }

                const pipClip: Clip = {
                    id: uuidv4(),
                    mediaLibraryId: srcFile.id,
                    type: srcFile.type as 'video' | 'audio' | 'image',
                    path: srcFile.path,
                    filename: srcFile.filename,
                    startFrame: clip.startFrame,
                    endFrame: clip.endFrame,
                    sourceDurationFrames: srcFile.sourceDurationFrames,
                    trimStartFrame: srcStart,
                    trimEndFrame: srcStart + srcLen,
                    track: 3,
                    speed: clip.speed || 1,
                    volume: 0,          // PIP overlay is silent
                    reversed: false,
                    isMuted: true,
                    isPinned: false,
                    origin: 'auto' as const,
                    locked: false,
                    sourceOrientation: srcFile.orientation || 'horizontal',
                    rotation: srcFile.rotation || 0,
                    compositeOverlay: true,
                    compositeScale: s.pipScale || 30,
                    compositeX: posX,
                    compositeY: posY,
                    compositeOpacity: 100,
                    compositeBorderRadius: s.pipBorderRadius || 8,
                };

                pipClips.push(pipClip);
            }

            if (pipClips.length > 0) {
                expandedClips.push(...pipClips);
                console.log(`[TrailerGen] PIP: generated ${pipClips.length} overlay clips on track 3 (policy=${s.pipPolicy})`);
            }
        }

        const totalOutputFrames = expandedClips.reduce((sum, c) => sum + (c.endFrame - c.startFrame), 0);
        console.log(`[TrailerGen] Final output: ${expandedClips.length} clips, ${totalOutputFrames}fr (${(totalOutputFrames/fps).toFixed(1)}s) target was ${targetFrames}fr (${targetDuration}s)`);

        // Auto fade in/out via the keyframe substrate (brightness ramp from black).
        if (s.autoFadeInOut && expandedClips.length > 0) {
            const fadeF = Math.max(2, Math.round(fps * 0.5));
            const first = expandedClips[0];
            const firstDur = first.endFrame - first.startFrame;
            first.brightnessKeyframes = [{ frame: 0, value: -1, interp: 'linear' }, { frame: Math.min(fadeF, Math.max(2, firstDur - 1)), value: 0, interp: 'linear' }];
            const last = expandedClips[expandedClips.length - 1];
            const lastDur = last.endFrame - last.startFrame;
            last.brightnessKeyframes = [{ frame: Math.max(0, lastDur - fadeF), value: 0, interp: 'linear' }, { frame: lastDur, value: -1, interp: 'linear' }];
        }

        // ── AUTO AUDIO CROSSFADE (baked-in best practice) ──
        if (s.autoCrossfadeAudio !== false) {
            for (const clip of expandedClips) {
                if (!clip.audioEffects) {
                    clip.audioEffects = { ...DEFAULT_AUDIO_EFFECTS };
                }
                // Only set micro-crossfade if user hasn't explicitly set fades
                if (!clip.audioEffects.fadeInDuration || clip.audioEffects.fadeInDuration === 0) {
                    clip.audioEffects.fadeInDuration = 0.03;
                }
                if (!clip.audioEffects.fadeOutDuration || clip.audioEffects.fadeOutDuration === 0) {
                    clip.audioEffects.fadeOutDuration = 0.03;
                }
            }
        }

        return expandedClips;
    };

    // === INTELLIGENT AUDIO BEAT MODE ===
    if (useAudioGuide && beatTimestamps && beatTimestamps.length > 1) {
        const analysis = settings.audioAnalysis || null;
        const isEnhanced = settings.enhancedBeatSync === true;
        // Enhanced mode uses 'auto' but with tighter, more responsive resolvers
        const beatPatternSetting = settings.beatPattern || 'auto';
        const syncStrategySetting = settings.beatSyncStrategy || 'auto';
        const selectedSegs = settings.selectedSegments || [];
        const shuffledPool = rng.shuffle(validPool);
        let poolIndex = 0;
        // Compute average beat gap to detect sparse vs dense beats
        const avgBeatGap = beatTimestamps.length > 2
            ? (beatTimestamps[beatTimestamps.length - 1] - beatTimestamps[0]) / (beatTimestamps.length - 1)
            : 0.5;

        // ── Downbeat awareness (from the rebuilt Beat Intelligence Engine) ──
        // Drops land hardest on bar starts. When the analysis lacks downbeats
        // (older cache), `isDownbeat` returns true so behavior is unchanged.
        const downbeatTimes = analysis?.downbeats ?? [];
        const downbeatTol = Math.min(0.12, (avgBeatGap || 0.5) * 0.4);
        const isDownbeat = (t: number): boolean =>
            downbeatTimes.length === 0 || downbeatTimes.some(d => Math.abs(d - t) <= downbeatTol);

        // Build a beat-drop impact config, scaled down off the downbeat so the
        // heavy accents land musically on the bar instead of on every beat.
        const buildImpact = (preset: typeof IMPACT_PRESETS[BeatDropIntensity], t: number) => {
            const f = isDownbeat(t) ? 1.0 : 0.45;
            return {
                flash: { intensity: preset.flash * f, color: '#ffffff', durationFrames: preset.durationFrames },
                chromatic: { offset: preset.chromatic * f, durationFrames: preset.durationFrames },
                shake: { type: 'impact' as const, intensity: preset.shake * f },
                zoom: { punchScale: 1 + (preset.zoom - 1) * f, durationFrames: preset.durationFrames },
            };
        };

        // Apply the wizard's global speed-curve preset as a continuous remap.
        // The curve is normalized at render to preserve the clip's timeline slot,
        // so the smooth velocity ramp never disturbs beat-sync timing.
        const applySpeedCurveShape = (clip: Clip): void => {
            if (s.speedCurvePreset && s.speedCurvePreset !== 'constant' && !clip.boomerang) {
                clip.speedCurvePreset = s.speedCurvePreset;
                clip.speedCurve = presetToKeyframes(s.speedCurvePreset);
            }
        };

        // Helper: resolve auto beat pattern per segment type (with variety)
        // TUNED: Quiet sections (intro, verse, breakdown, bridge) use sparser patterns
        // to avoid overambitious cuts during moments that should breathe.
        let autoPatternCounter = 0;
        const resolveAutoPattern = (segType: SegmentType): 'every' | 'half' | 'quarter' | 'drops' | 'risers-drops' => {
            autoPatternCounter++;
            if (isEnhanced) {
                // Enhanced: tighter patterns — more responsive to rhythm
                switch (segType) {
                    case 'drop': return 'every';
                    case 'chorus': return autoPatternCounter % 2 === 0 ? 'every' : 'half';
                    case 'buildup': return 'every'; // Build intensity by cutting every beat
                    case 'breakdown': return 'quarter'; // Let it breathe during breakdowns
                    case 'verse': return 'half';
                    case 'bridge': return 'half';
                    case 'intro': return 'half';
                    case 'outro': return 'quarter';
                    default: return 'half';
                }
            }
            switch (segType) {
                case 'drop': return autoPatternCounter % 3 === 0 ? 'half' : 'every';
                case 'chorus': return autoPatternCounter % 2 === 0 ? 'every' : 'half';
                case 'buildup': return 'half';
                case 'breakdown': return 'half';
                case 'verse': return 'half';
                case 'bridge': return 'half';
                case 'intro': return 'half';
                case 'outro': return 'half';
                default: return 'half';
            }
        };

        // Helper: resolve auto sync strategy per segment type (with rotation for variety)
        let autoStrategyCounter = 0;
        const resolveAutoStrategy = (segType: SegmentType): 'cut-on-beat' | 'transition-on-beat' | 'effect-on-drop' | 'riser-buildup' | 'groove-ride' => {
            autoStrategyCounter++;
            if (isEnhanced) {
                // Enhanced: more aggressive strategy assignment
                switch (segType) {
                    case 'drop': return autoStrategyCounter % 2 === 0 ? 'effect-on-drop' : 'cut-on-beat';
                    case 'chorus': return autoStrategyCounter % 3 === 0 ? 'effect-on-drop' : 'cut-on-beat';
                    case 'buildup': return 'riser-buildup';
                    case 'breakdown': return 'groove-ride';
                    case 'verse': return autoStrategyCounter % 3 === 0 ? 'transition-on-beat' : 'groove-ride';
                    case 'bridge': return 'groove-ride';
                    case 'intro': return 'groove-ride';
                    case 'outro': return autoStrategyCounter % 2 === 0 ? 'groove-ride' : 'transition-on-beat';
                    default: return 'cut-on-beat';
                }
            }
            switch (segType) {
                case 'drop':
                    return autoStrategyCounter % 3 === 0 ? 'effect-on-drop' : 'cut-on-beat';
                case 'chorus':
                    return autoStrategyCounter % 4 === 0 ? 'transition-on-beat' : 'cut-on-beat';
                case 'buildup':
                    return autoStrategyCounter % 2 === 0 ? 'riser-buildup' : 'transition-on-beat';
                case 'breakdown':
                    return 'groove-ride';
                case 'verse': case 'bridge':
                    return 'groove-ride';
                case 'intro':
                    return 'groove-ride';
                case 'outro':
                    return autoStrategyCounter % 2 === 0 ? 'groove-ride' : 'transition-on-beat';
                default: return 'cut-on-beat';
            }
        };

        // Filter beats by pattern (global pattern for non-auto modes)
        const filterBeatsByPattern = (beats: number[], pattern: string): number[] => {
            if (pattern === 'half') return beats.filter((_, i) => i % 2 === 0);
            if (pattern === 'quarter') return beats.filter((_, i) => i % 4 === 0);
            if (pattern === 'drops' && analysis) {
                const dropSegs = analysis.segments.filter(s => s.type === 'drop');
                return beats.filter(t => dropSegs.some(s => t >= s.start && t <= s.end));
            }
            if (pattern === 'risers-drops' && analysis) {
                const matchSegs = analysis.segments.filter(s => s.type === 'drop' || s.type === 'buildup');
                return beats.filter(t => matchSegs.some(s => t >= s.start && t <= s.end));
            }
            if (pattern === 'downbeats' && downbeatTimes.length > 1) {
                // Cut only on bar starts — punchy, on-the-grid editing.
                const filtered = beats.filter(t => isDownbeat(t));
                return filtered.length >= 2 ? filtered : beats;
            }
            return beats; // 'every'
        };

        let activeBeats = [...beatTimestamps];
        if (beatPatternSetting !== 'auto') {
            activeBeats = filterBeatsByPattern(activeBeats, beatPatternSetting);
        }
        if (activeBeats.length < 2) activeBeats = [...beatTimestamps];

        // ── Beat Sensitivity: thin out beats based on sensitivity slider ──
        // 1.0 = use every beat (tight), 0.0 = use every 4th beat (loose)
        const sensitivity = s.beatSensitivity ?? 0.5;
        const sensitivityDivisor = sensitivity >= 0.9 ? 1 : sensitivity >= 0.6 ? 2 : sensitivity >= 0.3 ? 3 : 4;
        if (sensitivityDivisor > 1) {
            const thinned = activeBeats.filter((_, i) => i % sensitivityDivisor === 0);
            // Always keep first and last beat
            if (thinned.length > 0 && thinned[thinned.length - 1] !== activeBeats[activeBeats.length - 1]) {
                thinned.push(activeBeats[activeBeats.length - 1]);
            }
            if (thinned.length >= 2) {
                activeBeats = thinned;
            }
        }

        // Helper: find segment type for a given time
        const getSegTypeAt = (time: number): SegmentType => {
            if (!analysis) return 'verse';
            const seg = analysis.segments.find(s => time >= s.start && time <= s.end);
            return seg?.type || 'verse';
        };

        // ——— COOLDOWN: Minimum time between cuts per segment type ———
        // Prevents overambitious cutting in quiet sections.
        const getMinGapForSegment = (segType: SegmentType): number => {
            // Enhanced mode: halved cooldowns for tighter rhythm response
            const enhancedFactor = isEnhanced ? 0.5 : 1.0;
            // When beats are already sparse (>0.5s apart), reduce cooldowns
            const sparseFactor = avgBeatGap > 0.5 ? 0.5 : 1.0;
            const factor = sparseFactor * enhancedFactor;
            switch (segType) {
                case 'drop': case 'chorus': return 0.2 * factor;
                case 'buildup': return 0.4 * factor;
                case 'breakdown': case 'bridge': return 1.0 * factor;
                case 'verse': return 0.8 * factor;
                case 'intro': return 1.0 * factor;
                case 'outro': return 0.8 * factor;
                default: return 0.5 * factor;
            }
        };
        let lastCutTime = -10; // Track last cut time for cooldown

        // Helper: adjust clip params based on segment type and strategy
        const getSegmentClipParams = (segType: SegmentType, beatGapS: number, syncStrategy: string) => {
            let clipMin = minFrames;
            let clipMax = maxFrames;
            let speedMult = 1.0;
            let applyEffect = false;

            switch (segType) {
                case 'drop':
                case 'chorus':
                    // Fast, punchy cuts on drops
                    clipMin = Math.max(MIN_RENDERABLE_FRAMES, Math.floor(minFrames * 0.5));
                    clipMax = Math.max(clipMin + 3, Math.floor(maxFrames * 0.6));
                    if (syncStrategy === 'effect-on-drop' || syncStrategy === 'riser-buildup') applyEffect = true;
                    break;
                case 'buildup':
                    // Progressively shorter clips
                    clipMin = Math.floor(minFrames * 0.7);
                    clipMax = Math.floor(maxFrames * 0.8);
                    if (syncStrategy === 'riser-buildup') speedMult = 1.5;
                    break;
                case 'breakdown':
                case 'bridge':
                    // Slower, much longer clips — let the scene breathe
                    clipMin = Math.floor(minFrames * 2.0);
                    clipMax = Math.floor(maxFrames * 3.0);
                    speedMult = 0.6;
                    break;
                case 'intro':
                    // Intro should feel cinematic and slow
                    clipMin = Math.floor(minFrames * 2.0);
                    clipMax = Math.floor(maxFrames * 2.5);
                    speedMult = 0.7;
                    break;
                case 'outro':
                    clipMin = Math.floor(minFrames * 1.5);
                    clipMax = Math.floor(maxFrames * 2.0);
                    speedMult = 0.7;
                    break;
                default: // verse
                    // Verse: slightly longer than before to avoid frantic feeling
                    clipMin = Math.floor(minFrames * 1.2);
                    clipMax = Math.floor(maxFrames * 1.5);
                    break;
            }

            // Groove-ride: let clip duration match the beat gap naturally
            if (syncStrategy === 'groove-ride') {
                const gapFrames = Math.floor(beatGapS * fps);
                clipMin = Math.max(MIN_RENDERABLE_FRAMES, gapFrames - 3);
                clipMax = gapFrames;
            }

            // Apply Pacing Arc Multiplier
            if (s.pacingArcShape) {
                try {
                    const { getPacingArcMultiplier } = require('./pacingArc');
                    const progress = accumulatedFrames / targetFrames;
                    const pacingMult = getPacingArcMultiplier(s.pacingArcShape, progress);
                    clipMin = Math.max(MIN_RENDERABLE_FRAMES, Math.floor(clipMin * pacingMult));
                    clipMax = Math.max(clipMin + 3, Math.floor(clipMax * pacingMult));
                } catch { /* fallback */ }
            }

            return { clipMin, clipMax, speedMult, applyEffect };
        };

        for (let b = 0; b < activeBeats.length - 1; b++) {
            // ——— DURATION GUARD: Stop generating once we've hit the target ———
            if (accumulatedFrames >= targetFrames) break;

            const beatGapSeconds = activeBeats[b + 1] - activeBeats[b];
            let beatGapFrames = Math.floor(beatGapSeconds * fps);

            // Clamp this beat gap so we don't overshoot targetDuration
            const remainingFrames = targetFrames - accumulatedFrames;
            if (beatGapFrames > remainingFrames) beatGapFrames = remainingFrames;
            if (beatGapFrames < MIN_RENDERABLE_FRAMES) continue; // skip beats too close to render

            const segType = getSegTypeAt(activeBeats[b]);

            // Skip if segment not selected
            if (selectedSegs.length > 0 && !selectedSegs.includes(segType)) continue;

            // ——— COOLDOWN ENFORCEMENT ———
            // Skip this beat if we're still within the minimum gap for this segment type
            const minGap = getMinGapForSegment(segType);
            if (activeBeats[b] - lastCutTime < minGap) continue;

            // In auto mode, resolve per-beat pattern and strategy
            let syncStrategy: string;
            if (syncStrategySetting === 'auto') {
                syncStrategy = resolveAutoStrategy(segType);
            } else {
                syncStrategy = syncStrategySetting;
            }

            // In auto mode, filter beats locally per segment type for adaptive density
            if (beatPatternSetting === 'auto') {
                const localPattern = resolveAutoPattern(segType);
                // Skip this beat if the local pattern says so
                if (localPattern === 'half' && b % 2 !== 0) continue;
                if (localPattern === 'quarter' && b % 4 !== 0) continue;
            }

            let { clipMin: effectiveMin, clipMax: effectiveMax, speedMult, applyEffect } = getSegmentClipParams(segType, beatGapSeconds, syncStrategy);

            // Section-aware behavior from video mode
            const currentSegment = analysis?.segments.find(seg => activeBeats[b] >= seg.start && activeBeats[b] <= seg.end);
            let activePattern: typeof rhythmPattern | undefined;
            if (s.videoMode) {
                const segEditType = currentSegment?.type as SegmentEditType | undefined;
                if (segEditType) {
                    const sectionBehavior = getSectionBehavior(s.videoMode, segEditType);
                    // Override rhythm pattern for this section
                    activePattern = RHYTHM_PATTERNS[sectionBehavior.rhythmPattern as RhythmPatternId] || undefined;
                    // Adjust min/max clip duration based on cut density multiplier
                    const dMult = sectionBehavior.cutDensityMultiplier;
                    effectiveMin = Math.max(MIN_RENDERABLE_FRAMES, Math.round(effectiveMin / dMult));
                    effectiveMax = Math.max(effectiveMin + 1, Math.round(effectiveMax / dMult));
                }
            }

            let gapFilled = 0;
            let gapFailures = 0;

            // Cut-on-beat / transition-on-beat / groove-ride: one clip per beat gap
            if (syncStrategy === 'cut-on-beat' || syncStrategy === 'transition-on-beat' || syncStrategy === 'groove-ride') {
                const file = shuffledPool[poolIndex % shuffledPool.length];
                poolIndex++;
                const { speed: baseSpeed, volume, isMuted } = getSpeedAndVolume(rng, segType);
                let speed = baseSpeed * speedMult;
                const clipDuration = Math.min(beatGapFrames, effectiveMax);
                const sourceReq = Math.max(1, Math.ceil(clipDuration * speed));
                const history = usedSegments.get(file.path) || [];
                const trimStart = getBestTrimStart(file, sourceReq, history, rng);
                const trimEnd = trimStart + sourceReq;
                recordSegmentUse(file, trimStart, trimEnd);
                const clip = createClip(file, accumulatedFrames, accumulatedFrames + clipDuration, trimStart, trimEnd, speed, volume, isMuted);
                if (applyEffect) (clip as any)._beatEffect = true;
                (clip as any)._segType = segType; // Tag for segment-aware editing intelligence

                // ── BEAT SPICE: segment-aware speed micro-variation, reversals ──
                const rand = rng.random();
                // If video mode specified, use section behavior speed range
                if (s.videoMode && currentSegment) {
                    const segEditType = currentSegment.type as SegmentEditType;
                    const behavior = getSectionBehavior(s.videoMode, segEditType);
                    const [minSpeed, maxSpeed] = behavior.speedRange;
                    clip.speed = parseFloat((speed * (minSpeed + rng.random() * (maxSpeed - minSpeed))).toFixed(2));
                } else if (isEnhanced) {
                    // Enhanced mode: more pronounced speed mapping based on segment energy
                    switch (segType) {
                        case 'drop':
                            if (rand > 0.6) clip.reversed = true;
                            // Boomerang on high-energy drop beats
                            if (s.templateReverseOnHits && rand > 0.4 && rand <= 0.6) {
                                clip.boomerang = true;
                                clip.reversed = false; // boomerang handles its own reversal
                            }
                            clip.speed = speed * (1.1 + rng.random() * 0.5); // 1.1x-1.6x boost
                            break;
                        case 'chorus':
                            if (rand > 0.8) clip.reversed = true;
                            clip.speed = speed * (0.9 + rng.random() * 0.4); // 0.9x-1.3x
                            break;
                        case 'buildup':
                            // Accelerate through the buildup — later beats faster
                            clip.speed = speed * (1.0 + (b % 8) * 0.08);
                            break;
                        case 'breakdown':
                        case 'bridge':
                            clip.speed = speed * 0.7; // Notably slower
                            break;
                        case 'intro':
                            clip.speed = speed * 0.65; // Cinematic slow
                            break;
                        case 'outro':
                            clip.speed = speed * 0.6; // Fade-out pacing
                            break;
                        case 'verse':
                        default:
                            clip.speed = speed * (0.85 + rng.random() * 0.3);
                            break;
                    }
                } else {
                    switch (segType) {
                        case 'drop':
                        case 'chorus':
                            if (rand > 0.75) clip.reversed = true;
                            clip.speed = speed * (0.9 + rng.random() * 0.4);
                            break;
                        case 'buildup':
                            clip.speed = speed * (1.0 + (b % 8) * 0.05);
                            break;
                        case 'breakdown':
                        case 'bridge':
                            clip.speed = speed * 0.85;
                            break;
                        case 'verse':
                            break;
                        case 'intro':
                            clip.speed = speed * 0.8;
                            break;
                        case 'outro':
                            clip.speed = speed * 0.7;
                            break;
                    }
                }

                // ── VISUAL FX: apply global visual effects to the clip ──
                if (s.filmGrainAmount && s.filmGrainAmount > 0) clip.filmGrain = s.filmGrainAmount;
                if (s.vignetteAmount && s.vignetteAmount > 0) clip.vignette = s.vignetteAmount;
                if (s.chromaticAmount && s.chromaticAmount > 0) clip.chromaticAberration = s.chromaticAmount;
                if (s.letterboxEnabled) clip.letterbox = true;

                // ── DESATURATION BUILDUP: ramp saturation toward B&W during buildup ──
                if (s.desaturationBuildup && segType === 'buildup' && beatTimestamps) {
                    // Find buildup boundaries from beat positions
                    const clipTimeSec = activeBeats[b] || 0;
                    // Estimate progress through the buildup (0=start, 1=near drop)
                    const buildupBeats = activeBeats.filter((_bt, idx) => {
                        const seg = analysis?.segments?.find(seg => _bt >= seg.start && _bt < seg.end);
                        return seg?.type === 'buildup';
                    });
                    const posInBuildup = buildupBeats.length > 1
                        ? buildupBeats.indexOf(activeBeats[b]) / (buildupBeats.length - 1)
                        : 0;
                    // Ramp saturation from 1.0 (full color) → 0.0 (B&W) across buildup
                    const saturation = Math.max(0, 1.0 - posInBuildup);
                    clip.colorGrading = { ...(clip.colorGrading || {}), saturation } as any;
                }

                // ── BEAT FLASH: strobe on downbeat-aligned clips ──
                if (s.beatFlashEnabled && isDownbeat(activeBeats[b])) {
                    clip.strobe = { frequency: Math.round(fps / 2), durationFrames: 2 };
                }

                // ── BEAT DROP IMPACT: apply impact preset on drop segments ──
                if (s.beatDropImpact && s.beatDropImpact !== 'off' && (segType === 'drop' || segType === 'chorus')) {
                    const impactPreset = IMPACT_PRESETS[s.beatDropImpact];
                    if (impactPreset) {
                        clip.beatEffect = buildImpact(impactPreset, activeBeats[b]);
                        // Render the impact's shake by merging it into the clip's shake
                        // (the filter builder applies shake from clip.shake, not beatEffect).
                        if (clip.beatEffect.shake && !clip.shake) {
                            clip.shake = { type: 'impact', intensity: clip.beatEffect.shake.intensity, direction: 'random', decayRate: 6, durationFrames: Math.round(fps * 0.25) };
                        }
                        // Stamp clip-local beat timestamps so the filterBuilder's
                        // beat-reactive flash/chromatic filters actually fire.
                        // Compute beats that fall within this clip's time window.
                        const clipStartSec = activeBeats[b];
                        const clipDurSec = (clip.endFrame - clip.startFrame) / fps;
                        const clipEndSec = clipStartSec + clipDurSec;
                        const localBeats = beatTimestamps
                            .filter(bt => bt >= clipStartSec && bt < clipEndSec)
                            .map(bt => bt - clipStartSec);
                        if (localBeats.length > 0) {
                            clip.beatTimestamps = localBeats;
                        } else {
                            // At minimum, place one beat at the clip start
                            clip.beatTimestamps = [0];
                        }
                    }
                }

                // ── SPEED CURVE: smooth cinematic velocity ramp (continuous remap) ──
                applySpeedCurveShape(clip);

                // ── BOOMERANG: 'all' mode — apply to every clip if not already boomeranged ──
                if (s.boomerangAll && !clip.boomerang) {
                    clip.boomerang = true;
                    clip.reversed = false;
                }

                sequence.push(clip);
                clipIndex++;
                lastCutTime = activeBeats[b]; // Update cooldown tracker
                accumulatedFrames += beatGapFrames;
                continue;
            }

            // Effect-on-drop / riser-buildup: fill gap with multiple clips
            while (gapFilled < beatGapFrames && gapFailures < 20) {
                const remaining = beatGapFrames - gapFilled;
                const { durationFrames: rhythmDur, multiplier: rhythmMult } = resolveRhythmDuration(
                    activePattern || rhythmPattern, clipIndex, totalExpectedClips, effectiveMin, effectiveMax, prevRhythmMult, rng
                );
                prevRhythmMult = rhythmMult;
                let clipDuration = Math.min(rhythmDur, remaining);
                if (clipDuration > remaining) clipDuration = remaining;
                if (clipDuration < MIN_RENDERABLE_FRAMES) { gapFilled = beatGapFrames; break; }

                const file = shuffledPool[poolIndex % shuffledPool.length];
                poolIndex++;
                const { speed: baseSpeed, volume, isMuted } = getSpeedAndVolume(rng, segType);
                const speed = baseSpeed * speedMult;
                const sourceReq = Math.max(1, Math.ceil(clipDuration * speed));
                const history = usedSegments.get(file.path) || [];
                const trimStart = getBestTrimStart(file, sourceReq, history, rng);
                const trimEnd = trimStart + sourceReq;
                recordSegmentUse(file, trimStart, trimEnd);
                const clip = createClip(file, accumulatedFrames + gapFilled, accumulatedFrames + gapFilled + clipDuration, trimStart, trimEnd, speed, volume, isMuted);
                if (applyEffect) (clip as any)._beatEffect = true;
                (clip as any)._segType = segType;

                // ── VISUAL FX: apply global visual effects to sub-gap clips ──
                if (s.filmGrainAmount && s.filmGrainAmount > 0) clip.filmGrain = s.filmGrainAmount;
                if (s.vignetteAmount && s.vignetteAmount > 0) clip.vignette = s.vignetteAmount;
                if (s.chromaticAmount && s.chromaticAmount > 0) clip.chromaticAberration = s.chromaticAmount;
                if (s.letterboxEnabled) clip.letterbox = true;

                // ── BEAT FLASH: strobe on downbeat-aligned sub-gap clips ──
                if (s.beatFlashEnabled && isDownbeat(activeBeats[b])) {
                    clip.strobe = { frequency: Math.round(fps / 2), durationFrames: 2 };
                }

                // ── BEAT DROP IMPACT: apply impact preset on drop segments ──
                if (s.beatDropImpact && s.beatDropImpact !== 'off' && (segType === 'drop' || segType === 'chorus')) {
                    const impactPreset = IMPACT_PRESETS[s.beatDropImpact];
                    if (impactPreset) {
                        clip.beatEffect = buildImpact(impactPreset, activeBeats[b]);
                        // Render the impact's shake by merging it into the clip's shake
                        // (the filter builder applies shake from clip.shake, not beatEffect).
                        if (clip.beatEffect.shake && !clip.shake) {
                            clip.shake = { type: 'impact', intensity: clip.beatEffect.shake.intensity, direction: 'random', decayRate: 6, durationFrames: Math.round(fps * 0.25) };
                        }
                        // Stamp clip-local beat timestamps (see main loop above)
                        const clipStartSec = activeBeats[b];
                        const clipDurSec = (clip.endFrame - clip.startFrame) / fps;
                        const clipEndSec = clipStartSec + clipDurSec;
                        const localBeats = beatTimestamps
                            .filter(bt => bt >= clipStartSec && bt < clipEndSec)
                            .map(bt => bt - clipStartSec);
                        clip.beatTimestamps = localBeats.length > 0 ? localBeats : [0];
                    }
                }

                // ── SPEED CURVE: smooth cinematic velocity ramp (continuous remap) ──
                applySpeedCurveShape(clip);

                sequence.push(clip);
                clipIndex++;
                gapFilled += clipDuration;
                gapFailures = 0;
            }
            lastCutTime = activeBeats[b]; // Update cooldown tracker
            accumulatedFrames += beatGapFrames;
        }
        // â”€â”€ FINAL DURATION TRIM: if beat-sync overshot, truncate the sequence â”€â”€
        if (accumulatedFrames > targetFrames) {
            let totalFrames = 0;
            const trimmed: typeof sequence = [];
            for (const clip of sequence) {
                const clipDur = clip.endFrame - clip.startFrame;
                if (totalFrames + clipDur > targetFrames) {
                    const remaining = targetFrames - totalFrames;
                    if (remaining > 2) {
                        trimmed.push({ ...clip, endFrame: clip.startFrame + remaining });
                    }
                    break;
                }
                trimmed.push(clip);
                totalFrames += clipDur;
            }
            return finalizeSequence(trimmed);
        }

        // â”€â”€ GAP-FILL: if beat-sync fell short, fill remaining duration â”€â”€
        if (accumulatedFrames < targetFrames) {
            const shuffledFill = rng.shuffle(validPool);
            let fillIdx = 0;
            let safetyCounter = 0;
            while (accumulatedFrames < targetFrames && safetyCounter < 500) {
                safetyCounter++;
                const file = shuffledFill[fillIdx % shuffledFill.length];
                fillIdx++;
                const remainingFrames = targetFrames - accumulatedFrames;
                if (remainingFrames < MIN_RENDERABLE_FRAMES) break;
                let currentMin = minFrames;
                let currentMax = maxFrames;
                if (s.pacingArcShape) {
                    try {
                        const { getPacingArcMultiplier } = require('./pacingArc');
                        const progress = accumulatedFrames / targetFrames;
                        const pacingMult = getPacingArcMultiplier(s.pacingArcShape, progress);
                        currentMin = Math.max(MIN_RENDERABLE_FRAMES, Math.floor(minFrames * pacingMult));
                        currentMax = Math.max(currentMin + 1, Math.floor(maxFrames * pacingMult));
                    } catch { /* fallback */ }
                }

                let clipDur = Math.min(
                    Math.floor(rng.random() * (currentMax - currentMin + 1)) + currentMin,
                    remainingFrames
                );
                const { speed, volume, isMuted } = getSpeedAndVolume(rng);
                const sourceReq = Math.max(1, Math.ceil(clipDur * speed));
                const history = usedSegments.get(file.path) || [];
                const trimStart = getBestTrimStart(file, sourceReq, history, rng);
                const trimEnd = trimStart + sourceReq;

                recordSegmentUse(file, trimStart, trimEnd);

                sequence.push(createClip(file, accumulatedFrames, accumulatedFrames + clipDur, trimStart, trimEnd, speed, volume, isMuted));
                accumulatedFrames += clipDur;
            }
        }

        return finalizeSequence(sequence);
    }

    // === STANDARD MODE ===
    if (useAllClips && validPool.length > 0) {
        const shuffledEnsure = rng.shuffle(validPool);
        for (let i = 0; i < shuffledEnsure.length; i++) {
            const file = shuffledEnsure[i];
            if (accumulatedFrames >= targetFrames) break;

            const remainingFrames = targetFrames - accumulatedFrames;
            const remainingFiles = shuffledEnsure.length - i;
            let dynamicMaxFrames = Math.floor(remainingFrames / remainingFiles);
            if (dynamicMaxFrames < minFrames) dynamicMaxFrames = minFrames;

            let currentMin = minFrames;
            let currentMax = maxFrames;
            if (s.pacingArcShape) {
                try {
                    const { getPacingArcMultiplier } = require('./pacingArc');
                    const progress = accumulatedFrames / targetFrames;
                    const pacingMult = getPacingArcMultiplier(s.pacingArcShape, progress);
                    currentMin = Math.max(MIN_RENDERABLE_FRAMES, Math.floor(minFrames * pacingMult));
                    currentMax = Math.max(currentMin + 1, Math.floor(maxFrames * pacingMult));
                } catch { /* fallback */ }
            }

            const { durationFrames: rhythmDur, multiplier: rhythmMult } = resolveRhythmDuration(
                rhythmPattern, clipIndex, totalExpectedClips, currentMin, currentMax, prevRhythmMult, rng
            );
            prevRhythmMult = rhythmMult;
            let cutDurationFrames = Math.min(rhythmDur, dynamicMaxFrames);

            const { speed, volume, isMuted } = getSpeedAndVolume(rng);
            const sourceReq = Math.max(1, Math.ceil(cutDurationFrames * speed));
            const sourceAvailable = file.sourceDurationFrames;
            if (sourceReq > sourceAvailable) cutDurationFrames = Math.floor(sourceAvailable / speed);

            const history = usedSegments.get(file.path) || [];
            const trimStart = getBestTrimStart(file, sourceReq, history, rng);
            const trimEnd = trimStart + sourceReq;

            recordSegmentUse(file, trimStart, trimEnd);

            sequence.push(createClip(file, accumulatedFrames, accumulatedFrames + cutDurationFrames, trimStart, trimEnd, speed, volume, isMuted));
            clipIndex++;
            accumulatedFrames += cutDurationFrames;
        }
        allowDuplicates = true;
    }

    // ── SHOW SEGMENT PRE-PLACEMENT ─────────────────────────────────────────
    // 'show' segments are forced full-length inclusions. They are placed FIRST
    // (before the random clip loop) so the generator fills AROUND them. Long
    // show segments receive the one-take speed ramp pattern.
    for (const file of validPool) {
        const showRanges = resolveShowRanges(
            { duration: file.duration || file.sourceDurationFrames / fps, trimIn: file.trimIn, trimOut: file.trimOut },
            (file as any).segments,
        );
        if (showRanges.length === 0) continue;

        for (const range of showRanges) {
            const rangeDurSec = range.endSec - range.startSec;
            const trimStartFrame = Math.floor(range.startSec * fps);
            const trimEndFrame = Math.floor(range.endSec * fps);
            const remainingTargetSec = Math.max(0, (targetFrames - accumulatedFrames) / fps);

            // If the show segment is short enough, place it as a single clip
            if (rangeDurSec <= (longestClip * 2) || rangeDurSec <= remainingTargetSec) {
                const clipFrames = Math.floor(rangeDurSec * fps);
                const { speed, volume, isMuted } = getSpeedAndVolume(rng);
                const clip = createClip(file, accumulatedFrames, accumulatedFrames + clipFrames, trimStartFrame, trimEndFrame, speed, volume, isMuted);
                (clip as any)._showSegment = true;
                sequence.push(clip);
                recordSegmentUse(file, trimStartFrame, trimEndFrame);
                accumulatedFrames += clipFrames;
                clipIndex++;
                console.log(`[TrailerGen] Show segment: "${file.filename}" ${range.startSec.toFixed(1)}-${range.endSec.toFixed(1)}s (${rangeDurSec.toFixed(1)}s) placed as single clip`);
            } else {
                // Long show segment → one-take speed ramp pattern
                const targetForRamp = Math.min(remainingTargetSec, rangeDurSec * 0.6);
                if (targetForRamp < 1) continue; // not enough space
                const rampSegs = buildOneTakeRamp(rangeDurSec, targetForRamp, fps, {
                    beats: (beatTimestamps || []).filter(b => b >= accumulatedFrames / fps),
                    maxFastSpeed: 3,
                });
                console.log(`[TrailerGen] Show segment (ramp): "${file.filename}" ${range.startSec.toFixed(1)}-${range.endSec.toFixed(1)}s → ${rampSegs.length} sub-clips`);
                for (const seg of rampSegs) {
                    const segTrimStart = Math.floor((range.startSec + seg.startSec) * fps);
                    const segTrimEnd = Math.floor((range.startSec + seg.endSec) * fps);
                    const playbackFrames = Math.floor(((seg.endSec - seg.startSec) / seg.speed) * fps);
                    const { volume, isMuted } = getSpeedAndVolume(rng);
                    const clip = createClip(file, accumulatedFrames, accumulatedFrames + playbackFrames, segTrimStart, segTrimEnd, seg.speed, volume, isMuted);
                    (clip as any)._showSegment = true;
                    (clip as any)._rampPattern = 'one-take';
                    sequence.push(clip);
                    accumulatedFrames += playbackFrames;
                    clipIndex++;
                }
                recordSegmentUse(file, trimStartFrame, trimEndFrame);
            }
        }
    }

    // Continue filling remaining target duration
    while (accumulatedFrames < targetFrames && consecutiveFailures < 100) {
        if (!allowDuplicates && usedFiles.size >= validPool.length) {
            // The requested duration is longer than one pass through the pool.
            // Start another coverage pass while retaining segment history.
            allowDuplicates = true;
        }
        const file = pickCoverageFile();

        if (!allowDuplicates && usedFiles.has(file.path)) {
            consecutiveFailures++;
            continue;
        }

        let currentMin = minFrames;
        let currentMax = maxFrames;
        if (s.pacingArcShape) {
            try {
                const { getPacingArcMultiplier } = require('./pacingArc');
                const progress = accumulatedFrames / targetFrames;
                const pacingMult = getPacingArcMultiplier(s.pacingArcShape, progress);
                currentMin = Math.max(MIN_RENDERABLE_FRAMES, Math.floor(minFrames * pacingMult));
                currentMax = Math.max(currentMin + 1, Math.floor(maxFrames * pacingMult));
            } catch { /* fallback */ }
        }

        const { durationFrames: rhythmDur, multiplier: rhythmMult } = resolveRhythmDuration(
            rhythmPattern, clipIndex, totalExpectedClips, currentMin, currentMax, prevRhythmMult, rng
        );
        prevRhythmMult = rhythmMult;
        let cutDurationFrames = rhythmDur;

        if (currentMax > currentMin && cutDurationFrames === lastDurationFrames) {
            cutDurationFrames = (cutDurationFrames === currentMax) ? currentMin : cutDurationFrames + 1;
        }

        const sourceAvailable = Math.max(
            0,
            (file.effectiveTrimOutFrames ?? file.sourceDurationFrames) - (file.effectiveTrimInFrames ?? 0),
        );
        let safeDuration = cutDurationFrames;
        if (safeDuration > sourceAvailable) {
            if (mediaType === 'video' && sourceAvailable < minFrames) {
                consecutiveFailures++;
                continue;
            }
            safeDuration = sourceAvailable;
        }

        const { speed, volume, isMuted } = getSpeedAndVolume(rng);
        if (safeDuration * speed > sourceAvailable) {
            safeDuration = Math.floor(sourceAvailable / Math.max(0.01, speed));
        }
        if (safeDuration < MIN_RENDERABLE_FRAMES) {
            consecutiveFailures++;
            sourceUseCounts.set(file.path, (sourceUseCounts.get(file.path) || 0) + 1);
            continue;
        }
        const sourceReq = Math.max(1, Math.ceil(safeDuration * speed));
        const history = usedSegments.get(file.path) || [];
        let trimStart = getBestTrimStart(file, sourceReq, history, rng);
        let trimEnd = trimStart + sourceReq;

        if (!allowSameSegment && usedSegments.has(file.path)) {
            let exactReuse = history.includes(`${trimStart}-${trimEnd}`);
            if (exactReuse) {
                for (let i = 0; i < 8; i++) {
                    trimStart = getBestTrimStart(file, sourceReq, history, rng);
                    trimEnd = trimStart + sourceReq;
                    exactReuse = history.includes(`${trimStart}-${trimEnd}`);
                    if (!exactReuse) break;
                }

                if (exactReuse) {
                    // This source has no novel window of the requested size.
                    // Deprioritise it and let another source satisfy the slot.
                    sourceUseCounts.set(file.path, (sourceUseCounts.get(file.path) || 0) + 1);
                    consecutiveFailures++;
                    continue;
                }
            }
        }

        consecutiveFailures = 0;
        recordSegmentUse(file, trimStart, trimEnd);

        sequence.push(createClip(file, accumulatedFrames, accumulatedFrames + safeDuration, trimStart, trimEnd, speed, volume, isMuted));
        clipIndex++;
        accumulatedFrames += safeDuration;
        lastDurationFrames = safeDuration;

        if (!allowDuplicates && usedFiles.size >= validPool.length) {
            // All unique files used â€” auto-enable duplicates to reach target duration
            console.log(`[TrailerGen] Pool exhausted (${usedFiles.size}/${validPool.length} files used) at ${(accumulatedFrames/fps).toFixed(1)}s / ${targetDuration}s â€” enabling duplicates to fill remaining duration`);
            allowDuplicates = true;
            // Keep source-window history across coverage passes. Reusing a file is
            // allowed; replaying the same trim range is not.
        }
    }

    // ── GRID INTEGRATION ──────────────────────────────────────────────────
    // When includeGrids is set, intersperse auto-generated grid clips.
    let gridOutputSeq: Clip[] | undefined;
    if (s.includeGrids && s.includeGrids !== 'off' && validPool.length >= 2) {
        const gridFormat = s.orientationFilter === 'vertical' ? 'vertical' as const
                         : s.orientationFilter === 'horizontal' ? 'horizontal' as const
                         : 'square' as const;

        if (s.includeGrids === 'grids-only') {
            // Replace entire sequence with grid clips
            const gridCount = Math.max(1, Math.floor(sequence.length / 4));
            const gridSeq: Clip[] = [];
            let gridCursor = 0;
            for (let g = 0; g < gridCount; g++) {
                const numCells = 2 + Math.floor(rng.random() * 3); // 2-4 cells
                const gridDurFrames = Math.min(
                    targetFrames - gridCursor,
                    Math.round(fps * (3 + rng.random() * 4)) // 3-7s per grid
                );
                if (gridDurFrames < fps) break;
                const gridClip: any = {
                    id: uuidv4(),
                    type: 'grid',
                    path: '',
                    filename: `Grid ${numCells}x`,
                    startFrame: gridCursor,
                    endFrame: gridCursor + gridDurFrames,
                    sourceDurationFrames: gridDurFrames,
                    trimStartFrame: 0,
                    trimEndFrame: gridDurFrames,
                    track: 1,
                    speed: 1,
                    volume: 100,
                    reversed: false,
                    locked: false,
                    origin: 'auto',
                    gridFormat,
                    numCells,
                    backgroundMode: 'blur',
                    syncMode: 'beat-locked',
                    autoOrientation: true,
                    masterDurationSec: gridDurFrames / fps,
                    cells: Array.from({ length: numCells }).map(() => ({
                        id: uuidv4(),
                        clip: null,
                        clips: [],
                        x: 0, y: 0, width: 1, height: 1,
                        cellOrientation: 'auto' as const,
                        cellMediaIds: [],
                        isGenerated: false,
                    })),
                };
                try {
                    const filled = generateGridSequence(gridClip, pool, s.audioAnalysis ?? null, fps);
                    gridSeq.push(filled as any);
                } catch {
                    gridSeq.push(gridClip);
                }
                gridCursor += gridDurFrames;
            }
            gridOutputSeq = gridSeq;
        } else {
            // 'mixed' — intersperse grid clips every ~8 normal clips
            const interval = Math.max(4, Math.min(12, Math.round(sequence.length / 4)));
            const mixed: Clip[] = [];
            for (let i = 0; i < sequence.length; i++) {
                mixed.push(sequence[i]);
                if ((i + 1) % interval === 0 && i < sequence.length - 1) {
                    const numCells = 2 + Math.floor(rng.random() * 3);
                    const prevEnd = sequence[i].endFrame;
                    const gridDurFrames = Math.round(fps * (2 + rng.random() * 3));
                    const gridClip: any = {
                        id: uuidv4(),
                        type: 'grid',
                        path: '',
                        filename: `Grid ${numCells}x`,
                        startFrame: prevEnd,
                        endFrame: prevEnd + gridDurFrames,
                        sourceDurationFrames: gridDurFrames,
                        trimStartFrame: 0,
                        trimEndFrame: gridDurFrames,
                        track: 1,
                        speed: 1,
                        volume: 100,
                        reversed: false,
                        locked: false,
                        origin: 'auto',
                        gridFormat,
                        numCells,
                        backgroundMode: 'blur',
                        syncMode: 'beat-locked',
                        autoOrientation: true,
                        masterDurationSec: gridDurFrames / fps,
                        cells: Array.from({ length: numCells }).map(() => ({
                            id: uuidv4(),
                            clip: null,
                            clips: [],
                            x: 0, y: 0, width: 1, height: 1,
                            cellOrientation: 'auto' as const,
                            cellMediaIds: [],
                            isGenerated: false,
                        })),
                    };
                    try {
                        const filled = generateGridSequence(gridClip, pool, s.audioAnalysis ?? null, fps);
                        mixed.push(filled as any);
                    } catch {
                        mixed.push(gridClip);
                    }
                }
            }
            gridOutputSeq = mixed;
        }
        console.log(`[TrailerGen] Grid integration (${s.includeGrids}): ${gridOutputSeq.length} total clips`);
    }

    const finalized = finalizeSequence(gridOutputSeq ?? sequence);

    // ── SFX INTELLIGENCE ─────────────────────────────────────────────
    // After finalizing the visual sequence (transitions, boomerangs, effects),
    // generate context-aware SFX clips on dedicated audio tracks 102/103.
    const sfxClips = generateSfxClips(finalized, fps);
    if (sfxClips.length > 0) {
        console.log(`[TrailerGen] SFX Intelligence: placed ${sfxClips.length} SFX clips on tracks 102/103`);
    }

    return [...finalized, ...sfxClips];
};



/**
 * Extracts beat timestamps from audio.
 * Accepts a pre-computed AudioAnalysisResult to avoid coupling.
 * Falls back to inline analysis only if no result is provided.
 */
export const extractBeatTimestamps = async (
    audioUrl: string,
    trimStart = 0,
    trimEnd = 30,
    preComputedAnalysis?: AudioAnalysisResult | null,
    options?: { beatOffset?: number; fps?: number }
): Promise<number[] | null> => {
    try {
        let result = preComputedAnalysis;

        // Lazy analysis only if no pre-computed result provided
        if (!result) {
            const { analyzeAudio } = await import('./audioAnalysis');
            const response = await fetch(audioUrl);
            const arrayBuffer = await response.arrayBuffer();
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            result = await analyzeAudio(audioBuffer);
            await audioContext.close();
        }

        // Clamp trimEnd to actual audio duration to prevent loop-past-end
        const safeTrimEnd = Math.min(trimEnd, result.duration);

        let timestamps = result.beats
            .filter(p => p.time >= trimStart && p.time <= safeTrimEnd)
            .map(p => p.time - trimStart);

        // Apply beat offset (anticipation cuts — cut slightly before the beat)
        const fps = options?.fps ?? DEFAULT_FPS;
        const beatOffsetSec = (options?.beatOffset ?? -1) / fps;
        if (beatOffsetSec !== 0) {
            timestamps = timestamps.map(t => Math.max(0, t + beatOffsetSec));
        }

        if (timestamps.length === 0 || timestamps[0] > 0.5) timestamps.unshift(0);
        const duration = safeTrimEnd - trimStart;
        if (timestamps[timestamps.length - 1] < duration - 0.5) timestamps.push(duration);

        return timestamps;
    } catch (e) {
        console.warn('[TrailerGenerator] Beat extraction failed, falling back to standard mode:', e);
        return null;
    }
};
