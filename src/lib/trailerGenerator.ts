import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_FPS } from './time';
import { expandClipToBoomerang, BOOMERANG_PRESETS, getBoomerangPreset } from './boomerang';
import { IMPACT_PRESETS, presetToKeyframes } from './effectsEngine';
import { pickDoubleExposureShape } from './editEffectFilters';
import type { SegmentType, AudioAnalysisResult } from './audioAnalysis';
import { MediaFile } from '../store/mediaStore';
import { Clip, TransitionType, ShakeType, ShakePolicy, BeatDropIntensity, TransitionStyle, BoomerangPresetId, ZoomSpeed, SpeedCurvePreset, EffectApplyPolicy } from '../types';
import { RHYTHM_PATTERNS, resolveRhythmDuration, RhythmPatternId } from './rhythmPatterns';
import { SeededRandom, generateSeed } from './random';
import { selectTransition } from './transitions';
import { getColorForSection } from './colorEngine';
import { VideoMode, SegmentEditType, getSectionBehavior, DEFAULT_SECTION_BEHAVIORS, SectionBehavior } from './editingModes';
import { MixedTemplate, mixTemplates, templateToSettings } from './templateMixer';
import type { TemplateId } from './editingModes';


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
    generatorMode?: 'trailer' | 'music-video';
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

    // Beat Drop Impact Stack
    beatDropImpact?: BeatDropIntensity;

    // Transition controls
    transitionStyle?: TransitionStyle;
    transitionTypes?: TransitionType[];   // which transitions to allow
    transitionDurationMs?: number;        // default transition duration

    // Visual FX globals
    filmGrainAmount?: number;             // 0-25
    vignetteAmount?: number;              // 0-100
    letterboxEnabled?: boolean;
    chromaticAmount?: number;             // 0-20

    // Color per section
    colorPerSection?: boolean;
    desaturationBuildup?: boolean;        // fade to B&W during buildup
    beatFlashEnabled?: boolean;           // white flash on beats

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
    shakeIntensity: 50,
    motionBlurPolicy: 'off',
    motionBlurAmount: 50,
    glowPolicy: 'off',
    glowIntensity: 55,
    glowRadius: 50,
    doubleExposurePolicy: 'off',
    doubleExposureOpacity: 45,
    doubleExposureBlend: 'screen',
    vibrationFlashPolicy: 'off',
    vibrationFlashIntensity: 70,
    smoothSlowmoPolicy: 'off',
    autoFadeInOut: false,
    preferHighEnergy: false,
    rgbSplitPolicy: 'off',
    rgbSplitAmount: 45,
    hueCyclePolicy: 'off',
    hueCycleSpeed: 30,
    vhsPolicy: 'off',
    vhsAmount: 50,
    beatDropImpact: 'off',
    transitionStyle: 'cuts-only',
    transitionDurationMs: 200,
    filmGrainAmount: 0,
    vignetteAmount: 0,
    letterboxEnabled: false,
    chromaticAmount: 0,
    colorPerSection: false,
    desaturationBuildup: false,
    beatFlashEnabled: false,
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
 * Generates a procedural sequence of media clips based on dynamic constraints.
 */
export const generateTrailerSequence = (pool: MediaFile[], settings: Partial<TrailerSettings>): Clip[] => {
    if (!pool || pool.length === 0) return [];

    const s = { ...DEFAULT_TRAILER_SETTINGS, ...settings };
    const seed = s.seed || generateSeed();
    const rng = new SeededRandom(seed);

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

    // 1. Filter Pool
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
        if (f.duration) fullDurationFrames = Math.floor(f.duration * DEFAULT_FPS);
        if (mediaType !== 'video') fullDurationFrames = 900; // Images act as 30s clips

        // Respect pre-import trim constraints from Media Library
        const trimInFrames = f.trimIn != null ? Math.floor(f.trimIn * DEFAULT_FPS) : 0;
        const trimOutFrames = f.trimOut != null ? Math.floor(f.trimOut * DEFAULT_FPS) : fullDurationFrames;
        const _effectiveDuration = trimOutFrames - trimInFrames;

        return {
            ...f,
            sourceDurationFrames: fullDurationFrames,
            effectiveTrimInFrames: trimInFrames,
            effectiveTrimOutFrames: trimOutFrames,
        };
    });

    if (validPool.length === 0) {
        validPool = pool.map(f => {
            const dur = f.duration ? Math.floor(f.duration * DEFAULT_FPS) : 9000;
            return {
                ...f,
                sourceDurationFrames: dur,
                effectiveTrimInFrames: f.trimIn != null ? Math.floor(f.trimIn * DEFAULT_FPS) : 0,
                effectiveTrimOutFrames: f.trimOut != null ? Math.floor(f.trimOut * DEFAULT_FPS) : dur,
            };
        });
    }

    // Force chop behavior if there's exactly one video
    if (validPool.length === 1) {
        allowDuplicates = true;
    }

    const targetFrames = Math.floor(targetDuration * DEFAULT_FPS);
    const minFrames = Math.max(1, Math.floor(shortestClip * DEFAULT_FPS));
    const maxFrames = Math.max(minFrames + 1, Math.floor(longestClip * DEFAULT_FPS));

    console.log('[TrailerGen] â•â•â• GENERATION START â•â•â•');
    console.log('[TrailerGen] Settings:', { targetDuration, shortestClip, longestClip, targetFrames, minFrames, maxFrames, slowmoPolicy, useAllClips, allowDuplicates });
    console.log('[TrailerGen] Pool size:', validPool.length, 'files');
    validPool.forEach((f, i) => console.log(`[TrailerGen]   Pool[${i}]: "${f.filename}" dur=${f.duration}s srcFrames=${f.sourceDurationFrames} trimIn=${f.effectiveTrimInFrames} trimOut=${f.effectiveTrimOutFrames}`));

    let accumulatedFrames = 0;
    const sequence: Clip[] = [];
    const usedFiles = new Set<string>();
    const usedSegments = new Map<string, string[]>();

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

    // Helper to find best trim start avoiding collisions
    // Respects the file's effective trim region (trimIn offset)
    const getBestTrimStart = (file: PoolFile, sourceReq: number, history: string[], rng: SeededRandom): number => {
        const trimInOffset = file.effectiveTrimInFrames;
        const trimOutLimit = file.effectiveTrimOutFrames;
        const availableRange = trimOutLimit - trimInOffset - sourceReq;

        if (availableRange <= 0) {
            return trimInOffset; // File is shorter than requested — use from trim start
        }

        const START_OFFSET_FRAMES = Math.floor(1.0 * DEFAULT_FPS);
        const effectiveStart = trimInOffset + Math.min(START_OFFSET_FRAMES, availableRange);
        const effectiveRange = trimOutLimit - sourceReq - effectiveStart;

        if (!history || history.length === 0 || effectiveRange <= 0) {
            return effectiveStart + Math.floor(rng.random() * Math.max(0, effectiveRange));
        }

        let bestTrimStart = effectiveStart + Math.floor(rng.random() * effectiveRange);
        let maxDistance = -1;
        const numCandidates = 15;

        for (let i = 0; i < numCandidates; i++) {
            const candidate = effectiveStart + Math.floor(rng.random() * effectiveRange);
            const candEnd = candidate + sourceReq;
            let minDist = Infinity;

            for (const range of history) {
                const [s, e] = range.split('-').map(Number);
                let dist = 0;
                if (candEnd < s) dist = s - candEnd;
                else if (candidate > e) dist = candidate - e;
                else dist = 0;

                if (dist < minDist) minDist = dist;
            }

            if (minDist > maxDistance) {
                maxDistance = minDist;
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
        ...(s.globalEffects?.length ? { parametricEffects: s.globalEffects } : {}),
        ...(s.globalColorGrading ? { colorGrading: s.globalColorGrading } : {}),
        ...(s.globalFlipH ? { flipH: true } : {}),
        ...(s.globalFlipV ? { flipV: true } : {}),
        ...(s.globalSharpen ? { sharpen: s.globalSharpen } : {}),
        ...(s.globalBlurAmount ? { blurAmount: s.globalBlurAmount } : {}),
        ...(s.globalChromaKey?.enabled ? { chromaKey: s.globalChromaKey } : {}),
        ...(s.globalStabilize?.enabled ? { stabilize: s.globalStabilize } : {}),
        ...(s.globalAudioEffects ? { audioEffects: s.globalAudioEffects } : {}),
    });

    // Helper: finalize a clip sequence with orientation-aware zoom + transitions
    const finalizeSequence = (seq: Clip[]): Clip[] => {
        console.log(`[TrailerGen] â•â•â• FINALIZE â•â•â• ${seq.length} clips, accumulated=${accumulatedFrames}fr (${(accumulatedFrames/DEFAULT_FPS).toFixed(1)}s)`);
        
        // â”€â”€ BLACK SCREEN PREVENTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // 0a. Clamp all trim ranges to valid source bounds
        const clamped = seq.map((c, idx) => {
            const srcDur = c.sourceDurationFrames || 9000;
            let ts = Math.max(0, c.trimStartFrame || 0);
            let te = Math.min(srcDur, c.trimEndFrame || srcDur);
            // Ensure trim range has at least 2 frames
            if (te - ts < 2) {
                ts = Math.max(0, te - 2);
                if (te - ts < 2) te = ts + 2;
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
                endFrame: c.startFrame + Math.max(2, safeDur),
            };
        });

        // 0b. Remove zero-duration, negative-duration, or path-less clips
        const validSeq = clamped.filter(c => {
            const dur = c.endFrame - c.startFrame;
            return dur >= 2 && c.path && c.path.length > 0;
        });

        // 0c. Close gaps by re-snapping timelines
        let cursor = 0;
        const gapFilled: Clip[] = [];
        for (const c of validSeq) {
            const dur = c.endFrame - c.startFrame;
            // Hard clamp: never exceed targetFrames
            if (cursor >= targetFrames) break;
            const clampedDur = Math.min(dur, targetFrames - cursor);
            if (clampedDur < 2) break;
            gapFilled.push({ ...c, startFrame: cursor, endFrame: cursor + clampedDur });
            cursor += clampedDur;
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
                const expanded = expandClipToBoomerang(clip, preset, DEFAULT_FPS);
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
                if (allowed < 2) { if (targetFrames > 0) break; else continue; }
                laid.push({ ...clip, startFrame: head, endFrame: head + allowed });
                head += allowed;
            }
            expandedClips = laid;
        }

        // ── TRANSITION ASSIGNMENT ──
        // Assign transitions to each clip based on settings
        if (s.transitionStyle && s.transitionStyle !== 'cuts-only') {
            const transitionRng = new SeededRandom(s.seed ? s.seed + '_transitions' : generateSeed());
            for (let i = 0; i < expandedClips.length - 1; i++) {
                const clip = expandedClips[i];
                const segType: SegmentType = (clip as any)._segType || 'verse';
                const transType = selectTransition(
                    segType,
                    s.transitionTypes ?? [],
                    s.transitionStyle,
                    transitionRng,
                );
                if (transType !== 'cut') {
                    const durationMs = s.transitionDurationMs ?? 200;
                    const durationFrames = Math.round((durationMs / 1000) * DEFAULT_FPS);
                    clip.transition = {
                        type: transType,
                        durationFrames,
                    };
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
                if (s.shakePolicy === 'on-every-beat' && beatMarkers.length > 0) shouldShake = true;
                else if (s.shakePolicy === 'heavy-beats-only' && maxEnergy > 0.7) shouldShake = true;
                else if (s.shakePolicy === 'sparingly' && segType === 'drop' && shakeRng.random() < 0.4) shouldShake = true;

                if (shouldShake && !clip.shake) {
                    const shakeType = s.shakeType === 'all'
                        ? (['impact', 'handheld', 'earthquake', 'vibration', 'whip'] as const)[Math.floor(shakeRng.random() * 5)]
                        : (s.shakeType || 'impact');
                    clip.shake = {
                        type: shakeType as any,
                        intensity: s.shakeIntensity ?? 50,
                        direction: 'random',
                        decayRate: 5,
                        durationFrames: Math.round(DEFAULT_FPS * 0.3),
                    };
                }
            }
        }

        // ── ZOOM ASSIGNMENT ──
        if (s.zoomEnabled) {
            const zoomRng = new SeededRandom(s.seed ? s.seed + '_zoom' : generateSeed());
            const zoomValues = s.zoomValues ?? [100, 125, 150, 175, 200];
            for (const clip of expandedClips) {
                if (clip.zoomStart !== undefined || clip.zoomEnd !== undefined) continue; // Already zoomed

                let zoomVal: number;
                if (s.zoomCustomRangeEnabled && s.zoomCustomRange) {
                    const [lo, hi] = s.zoomCustomRange;
                    // Round to nearest 5%
                    zoomVal = Math.round((lo + zoomRng.random() * (hi - lo)) / 5) * 5;
                } else {
                    zoomVal = zoomValues[Math.floor(zoomRng.random() * zoomValues.length)];
                }

                if (zoomVal !== 100) {
                    // 50% chance zoom in, 50% zoom out
                    if (zoomRng.random() < 0.5) {
                        clip.zoomStart = 100;
                        clip.zoomEnd = zoomVal;
                    } else {
                        clip.zoomStart = zoomVal;
                        clip.zoomEnd = 100;
                    }
                    clip.zoomOrigin = 'center';
                    // Forward zoomSpeed from wizard settings to the clip so the
                    // filterBuilder's zoompan 'd' parameter respects the user's
                    // Instant/Fast/Slow/All selection.
                    if (s.zoomSpeed && s.zoomSpeed !== 'all') {
                        clip.zoomSpeed = s.zoomSpeed as any;
                    } else if (s.zoomSpeed === 'all') {
                        // 'all' means randomly pick a speed per clip
                        const speeds: Array<'instant' | 'fast' | 'slow'> = ['instant', 'fast', 'slow'];
                        clip.zoomSpeed = speeds[Math.floor(zoomRng.random() * speeds.length)];
                    }
                    // zoomBeatSync: force instant/fast zoom for punchier beat alignment
                    if (s.zoomBeatSync) {
                        const clipDurSec = (clip.endFrame - clip.startFrame) / DEFAULT_FPS;
                        clip.zoomSpeed = clipDurSec <= 0.5 ? 'instant' : 'fast';
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
                const t = clip.startFrame / DEFAULT_FPS;
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

            for (const clip of expandedClips) {
                if (!clip.motionBlur && shouldApply(s.motionBlurPolicy, clip)) {
                    clip.motionBlur = { amount: s.motionBlurAmount ?? 50 };
                }
                if (!clip.glow && shouldApply(s.glowPolicy, clip)) {
                    clip.glow = { intensity: s.glowIntensity ?? 55, radius: s.glowRadius ?? 50, threshold: 55 };
                }
                if (!clip.doubleExposure && shouldApply(s.doubleExposurePolicy, clip)) {
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
                            opacity: s.doubleExposureOpacity ?? 45,
                            shape,
                        };
                    }
                }
                if (!clip.vibrationFlash && shouldApply(s.vibrationFlashPolicy, clip)) {
                    clip.vibrationFlash = {
                        intensity: s.vibrationFlashIntensity ?? 70,
                        durationFrames: Math.max(2, Math.round(DEFAULT_FPS * 0.12)),
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
            }
        }

        const totalOutputFrames = expandedClips.reduce((sum, c) => sum + (c.endFrame - c.startFrame), 0);
        console.log(`[TrailerGen] Final output: ${expandedClips.length} clips, ${totalOutputFrames}fr (${(totalOutputFrames/DEFAULT_FPS).toFixed(1)}s) target was ${targetFrames}fr (${targetDuration}s)`);

        // Auto fade in/out via the keyframe substrate (brightness ramp from black).
        if (s.autoFadeInOut && expandedClips.length > 0) {
            const fadeF = Math.max(2, Math.round(DEFAULT_FPS * 0.5));
            const first = expandedClips[0];
            const firstDur = first.endFrame - first.startFrame;
            first.brightnessKeyframes = [{ frame: 0, value: -1, interp: 'linear' }, { frame: Math.min(fadeF, Math.max(2, firstDur - 1)), value: 0, interp: 'linear' }];
            const last = expandedClips[expandedClips.length - 1];
            const lastDur = last.endFrame - last.startFrame;
            last.brightnessKeyframes = [{ frame: Math.max(0, lastDur - fadeF), value: 0, interp: 'linear' }, { frame: lastDur, value: -1, interp: 'linear' }];
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
                    clipMin = Math.max(3, Math.floor(minFrames * 0.5));
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
                const gapFrames = Math.floor(beatGapS * DEFAULT_FPS);
                clipMin = Math.max(3, gapFrames - 3);
                clipMax = gapFrames;
            }

            return { clipMin, clipMax, speedMult, applyEffect };
        };

        for (let b = 0; b < activeBeats.length - 1; b++) {
            // ——— DURATION GUARD: Stop generating once we've hit the target ———
            if (accumulatedFrames >= targetFrames) break;

            const beatGapSeconds = activeBeats[b + 1] - activeBeats[b];
            let beatGapFrames = Math.floor(beatGapSeconds * DEFAULT_FPS);

            // Clamp this beat gap so we don't overshoot targetDuration
            const remainingFrames = targetFrames - accumulatedFrames;
            if (beatGapFrames > remainingFrames) beatGapFrames = remainingFrames;
            if (beatGapFrames < 2) break;

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
                    effectiveMin = Math.max(2, Math.round(effectiveMin / dMult));
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
                if (!usedSegments.has(file.path)) usedSegments.set(file.path, []);
                usedSegments.get(file.path)!.push(`${trimStart}-${trimEnd}`);
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
                    clip.strobe = { frequency: Math.round(DEFAULT_FPS / 2), durationFrames: 2 };
                }

                // ── BEAT DROP IMPACT: apply impact preset on drop segments ──
                if (s.beatDropImpact && s.beatDropImpact !== 'off' && segType === 'drop') {
                    const impactPreset = IMPACT_PRESETS[s.beatDropImpact];
                    if (impactPreset) {
                        clip.beatEffect = buildImpact(impactPreset, activeBeats[b]);
                        // Stamp clip-local beat timestamps so the filterBuilder's
                        // beat-reactive flash/chromatic filters actually fire.
                        // Compute beats that fall within this clip's time window.
                        const clipStartSec = activeBeats[b];
                        const clipDurSec = (clip.endFrame - clip.startFrame) / DEFAULT_FPS;
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
                if (clipDuration < 2) { gapFilled = beatGapFrames; break; }

                const file = shuffledPool[poolIndex % shuffledPool.length];
                poolIndex++;
                const { speed: baseSpeed, volume, isMuted } = getSpeedAndVolume(rng, segType);
                const speed = baseSpeed * speedMult;
                const sourceReq = Math.max(1, Math.ceil(clipDuration * speed));
                const history = usedSegments.get(file.path) || [];
                const trimStart = getBestTrimStart(file, sourceReq, history, rng);
                const trimEnd = trimStart + sourceReq;
                if (!usedSegments.has(file.path)) usedSegments.set(file.path, []);
                usedSegments.get(file.path)!.push(`${trimStart}-${trimEnd}`);
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
                    clip.strobe = { frequency: Math.round(DEFAULT_FPS / 2), durationFrames: 2 };
                }

                // ── BEAT DROP IMPACT: apply impact preset on drop segments ──
                if (s.beatDropImpact && s.beatDropImpact !== 'off' && segType === 'drop') {
                    const impactPreset = IMPACT_PRESETS[s.beatDropImpact];
                    if (impactPreset) {
                        clip.beatEffect = buildImpact(impactPreset, activeBeats[b]);
                        // Stamp clip-local beat timestamps (see main loop above)
                        const clipStartSec = activeBeats[b];
                        const clipDurSec = (clip.endFrame - clip.startFrame) / DEFAULT_FPS;
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
                if (remainingFrames < 3) break;
                let clipDur = Math.min(
                    Math.floor(rng.random() * (maxFrames - minFrames + 1)) + minFrames,
                    remainingFrames
                );
                const { speed, volume, isMuted } = getSpeedAndVolume(rng);
                const sourceReq = Math.max(1, Math.ceil(clipDur * speed));
                const history = usedSegments.get(file.path) || [];
                const trimStart = getBestTrimStart(file, sourceReq, history, rng);
                const trimEnd = trimStart + sourceReq;

                if (!usedSegments.has(file.path)) usedSegments.set(file.path, []);
                usedSegments.get(file.path)!.push(`${trimStart}-${trimEnd}`);

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

            const { durationFrames: rhythmDur, multiplier: rhythmMult } = resolveRhythmDuration(
                rhythmPattern, clipIndex, totalExpectedClips, minFrames, maxFrames, prevRhythmMult, rng
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

            if (!usedSegments.has(file.path)) usedSegments.set(file.path, []);
            usedSegments.get(file.path)!.push(`${trimStart}-${trimEnd}`);

            sequence.push(createClip(file, accumulatedFrames, accumulatedFrames + cutDurationFrames, trimStart, trimEnd, speed, volume, isMuted));
            clipIndex++;
            accumulatedFrames += cutDurationFrames;
            usedFiles.add(file.path);
        }
        allowDuplicates = true;
    }

    // Continue filling remaining target duration
    while (accumulatedFrames < targetFrames && consecutiveFailures < 100) {
        const fileIndex = Math.floor(rng.random() * validPool.length);
        const file = validPool[fileIndex];

        if (!allowDuplicates && usedFiles.has(file.path)) {
            consecutiveFailures++;
            continue;
        }

        const { durationFrames: rhythmDur, multiplier: rhythmMult } = resolveRhythmDuration(
            rhythmPattern, clipIndex, totalExpectedClips, minFrames, maxFrames, prevRhythmMult, rng
        );
        prevRhythmMult = rhythmMult;
        let cutDurationFrames = rhythmDur;

        if (maxFrames > minFrames && cutDurationFrames === lastDurationFrames) {
            cutDurationFrames = (cutDurationFrames === maxFrames) ? minFrames : cutDurationFrames + 1;
        }

        const sourceAvailable = file.sourceDurationFrames;
        let safeDuration = cutDurationFrames;
        if (safeDuration > sourceAvailable) {
            if (mediaType === 'video' && sourceAvailable < minFrames) {
                consecutiveFailures++;
                continue;
            }
            safeDuration = sourceAvailable;
        }

        const { speed, volume, isMuted } = getSpeedAndVolume(rng);
        const sourceReq = Math.max(1, Math.ceil(safeDuration * speed));
        const history = usedSegments.get(file.path) || [];
        let trimStart = getBestTrimStart(file, sourceReq, history, rng);
        let trimEnd = trimStart + sourceReq;

        if (!allowSameSegment && usedSegments.has(file.path)) {
            let collision = history.some(range => {
                const [s, e] = range.split('-').map(Number);
                return (trimStart < e && trimEnd > s);
            });

            if (collision) {
                for (let i = 0; i < 3; i++) {
                    trimStart = getBestTrimStart(file, sourceReq, history, rng);
                    trimEnd = trimStart + sourceReq;
                    collision = history.some(range => {
                        const [s, e] = range.split('-').map(Number);
                        return (trimStart < e && trimEnd > s);
                    });
                    if (!collision) break;
                }

                if (collision) {
                    consecutiveFailures++;
                    if (consecutiveFailures > 50 && allowDuplicates) {
                        usedSegments.clear();
                        allowSameSegment = true;
                        consecutiveFailures = 0;
                    }
                    continue;
                }
            }
        }

        consecutiveFailures = 0;
        usedFiles.add(file.path);

        if (!usedSegments.has(file.path)) usedSegments.set(file.path, []);
        usedSegments.get(file.path)!.push(`${trimStart}-${trimEnd}`);

        sequence.push(createClip(file, accumulatedFrames, accumulatedFrames + safeDuration, trimStart, trimEnd, speed, volume, isMuted));
        clipIndex++;
        accumulatedFrames += safeDuration;
        lastDurationFrames = safeDuration;

        if (!allowDuplicates && usedFiles.size >= validPool.length) {
            // All unique files used â€” auto-enable duplicates to reach target duration
            console.log(`[TrailerGen] Pool exhausted (${usedFiles.size}/${validPool.length} files used) at ${(accumulatedFrames/DEFAULT_FPS).toFixed(1)}s / ${targetDuration}s â€” enabling duplicates to fill remaining duration`);
            allowDuplicates = true;
            usedSegments.clear(); // Reset segment tracking so new segments can be picked
        }
    }

    return finalizeSequence(sequence);
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
