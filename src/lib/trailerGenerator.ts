import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_FPS } from './time';
import type { SegmentType, AudioAnalysisResult } from './audioAnalysis';
import { MediaFile } from '../store/mediaStore';
import { Clip } from '../types';
import { assignTransitions, TransitionType, TRANSITION_PRESETS } from './transitions';
import { RHYTHM_PATTERNS, resolveRhythmDuration, RhythmPatternId } from './rhythmPatterns';

export type EditingStyleOption = 'rubber-band-standard' | 'rubber-band' | 'rubber-band-speed' | 'multi-boomerang' | 'triple-shot' | 'snap-burst' | 'pendulum-sway' | 'hyper-cut' | 'bear-chaos' | 'pattern-interrupt' | 'beat-bounce';

export interface EditingStyleConfig {
    rampFastSpeed: number;        // Speed of the fast segment (1.5 - 4.0x)
    rampSlowSpeed: number;        // Speed of the slow/hero segment (0.15 - 0.6x)
    fastPortion: number;          // Fraction of source used for fast ramp (0.05 - 0.3)
    slowPortion: number;          // Fraction of source used for slow/hero (0.2 - 0.5)
    boomerangSlices: number;      // Number of forward/reverse slices (2 - 4)
    reversalChance: number;       // Probability that a style includes reversal (0.0 - 1.0)
    burstMode: 'short' | 'long'; // Short = tight cuts, Long = breathing room
}

export const DEFAULT_STYLE_CONFIG: EditingStyleConfig = {
    rampFastSpeed: 2.5,
    rampSlowSpeed: 0.25,
    fastPortion: 0.12,
    slowPortion: 0.38,
    boomerangSlices: 4,
    reversalChance: 0.85,
    burstMode: 'short',
};

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
    slowmoPolicy: 'none' | 'slowmo' | 'fast' | 'timelapse' | 'hyperfast' | 'mixed-slow' | 'mixed-fast' | 'mixed-all' | 'dramatic' | 'dramatic-reverse' | 'ramped' | 'ramped-inverse' | 'slowmo-fast' | 'fast-slowmo' | 'pulse' | 'breathe' | 'random';
    templates: string[];
    // Audio trimming
    audioFile?: string | null;
    audioUrl?: string | null;
    audioFilePath?: string;    // Real filesystem path (persists across navigation)
    audioTrimStart?: number;
    audioTrimEnd?: number;
    matchAudioDuration?: boolean;
    audioTimelineStrategy?: 'loop' | 'fade' | 'continue';
    beatSensitivity?: number;
    // Editing styles
    editingStyleMix: 'none' | 'light' | 'heavy' | 'every';
    editingStyles: EditingStyleOption[];
    styleConfig: EditingStyleConfig;
    orientationFilter?: 'all' | 'horizontal' | 'vertical' | 'square';
    // Beat sync intelligence
    beatPattern: 'auto' | 'every' | 'half' | 'quarter' | 'drops' | 'risers-drops' | 'custom';
    beatSyncStrategy: 'auto' | 'cut-on-beat' | 'transition-on-beat' | 'effect-on-drop' | 'riser-buildup' | 'groove-ride';
    selectedSegments: SegmentType[];
    audioAnalysis?: AudioAnalysisResult | null;
    includeGrids?: 'off' | 'mixed' | 'grids-only';
    // Transition engine
    transitionsEnabled?: boolean;
    transitionPreset?: string;
    transitionTypes?: TransitionType[];
    transitionMode?: 'random' | 'single' | 'none';
    maxSimultaneousTransitions?: number;
    simultaneousTransitionDelay?: number;
    // 2026 Viral Retention
    hookStyle?: 'none' | 'snap-speed' | 'pattern-interrupt' | 'speed-freeze' | 'auto';
    retentionInterrupts?: boolean;
    loopMode?: boolean;
    visualTexture?: 'none' | 'grain' | 'chromatic' | 'motion-blur' | 'vintage';
    // Rhythm pattern for clip duration sequencing
    rhythmPattern?: RhythmPatternId;
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
    editingStyleMix: 'none',
    editingStyles: ['rubber-band-standard', 'multi-boomerang'],
    styleConfig: { ...DEFAULT_STYLE_CONFIG },
    orientationFilter: 'all',
    beatPattern: 'auto',
    beatSyncStrategy: 'auto',
    selectedSegments: ['intro', 'buildup', 'drop', 'breakdown', 'chorus', 'verse', 'outro', 'bridge'],
    audioAnalysis: null,
    transitionsEnabled: false,
    transitionPreset: 'cinematic',
    maxSimultaneousTransitions: 1,
    simultaneousTransitionDelay: 0.2,
    includeGrids: 'off',
    hookStyle: 'none',
    retentionInterrupts: false,
    loopMode: false,
    visualTexture: 'none',
    rhythmPattern: 'breathing',
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

// Helper for true uniform shuffle
const shuffleArray = <T,>(array: T[]): T[] => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

/**
 * Generates a procedural sequence of media clips based on dynamic constraints.
 */
export const generateTrailerSequence = (pool: MediaFile[], settings: Partial<TrailerSettings>): Clip[] => {
    if (!pool || pool.length === 0) return [];

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
    } = { ...DEFAULT_TRAILER_SETTINGS, ...settings };

    // Resolve 'random' slowmoPolicy to a concrete policy
    if (slowmoPolicy === 'random') {
        const SPEED_POOL: typeof slowmoPolicy[] = ['slowmo', 'fast', 'timelapse', 'hyperfast', 'mixed-slow', 'mixed-fast', 'mixed-all', 'dramatic', 'dramatic-reverse', 'ramped', 'ramped-inverse', 'slowmo-fast', 'fast-slowmo', 'pulse', 'breathe'];
        slowmoPolicy = SPEED_POOL[Math.floor(Math.random() * SPEED_POOL.length)];
    }

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
        const effectiveDuration = trimOutFrames - trimInFrames;

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

    let accumulatedFrames = 0;
    const sequence: Clip[] = [];
    const usedFiles = new Set<string>();
    const usedSegments = new Map<string, string[]>();

    let consecutiveFailures = 0;
    let lastDurationFrames = -1;
    let clipIndex = 0;
    const totalExpectedClips = Math.ceil(targetDuration / ((shortestClip + longestClip) / 2));

    // ── RHYTHM PATTERN ENGINE ──────────────────────────────────────────
    const rhythmId = settings.rhythmPattern || 'breathing';
    const rhythmPattern = RHYTHM_PATTERNS[rhythmId] || RHYTHM_PATTERNS['flat'];
    let prevRhythmMult = 0.5;

    /*
     * ── SPEED & VOLUME CALCULATION ────────────────────────────────────────
     * Determines playback speed and audio volume for each generated clip.
     *
     * ⚠ EXPORT PIPELINE IMPACT:
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
    const getSpeedAndVolume = () => {
        let speed = 1.0;
        const progress = totalExpectedClips > 0 ? clipIndex / totalExpectedClips : 0;
        if (slowmoPolicy === 'slowmo') speed = 0.5;
        else if (slowmoPolicy === 'fast') speed = 1.5;
        else if (slowmoPolicy === 'timelapse') speed = 2.5;
        else if (slowmoPolicy === 'hyperfast') speed = 4.0;
        else if (slowmoPolicy === 'mixed-slow' && Math.random() > 0.6) speed = 0.5;
        else if (slowmoPolicy === 'mixed-fast' && Math.random() > 0.6) speed = 1.8;
        else if (slowmoPolicy === 'mixed-all') speed = Math.random() > 0.5 ? (Math.random() > 0.5 ? 0.5 : 0.3) : (Math.random() > 0.5 ? 1.5 : 2.0);
        else if (slowmoPolicy === 'dramatic') {
            speed = 0.4 + (progress * 1.6); // 0.4x → 2.0x
        }
        else if (slowmoPolicy === 'dramatic-reverse') {
            speed = 2.0 - (progress * 1.6); // 2.0x → 0.4x
        }
        else if (slowmoPolicy === 'ramped') {
            const wave = Math.sin(progress * Math.PI);
            speed = 2.0 - (wave * 1.5); // 2.0x → 0.5x → 2.0x
        }
        else if (slowmoPolicy === 'ramped-inverse') {
            const wave = Math.sin(progress * Math.PI);
            speed = 0.5 + (wave * 1.5); // 0.5x → 2.0x → 0.5x
        }
        else if (slowmoPolicy === 'slowmo-fast') {
            speed = Math.random() > 0.75 ? 2.0 : 0.5;
        }
        else if (slowmoPolicy === 'fast-slowmo') {
            speed = Math.random() > 0.75 ? 0.3 : 1.5;
        }
        else if (slowmoPolicy === 'pulse') {
            speed = clipIndex % 2 === 0 ? 0.5 : 1.8;
        }
        else if (slowmoPolicy === 'breathe') {
            const wave = Math.sin(progress * Math.PI * 4);
            speed = 1.0 + (wave * 0.3); // 0.7x → 1.3x gentle wave
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
            else if (audioMixStrategy === 'ducking') { volume = (Math.random() > 0.8) ? 100 : 15; }
        }

        return { speed, volume, isMuted };
    };

    // Helper to find best trim start avoiding collisions
    // Respects the file's effective trim region (trimIn offset)
    const getBestTrimStart = (file: PoolFile, sourceReq: number, history: string[]): number => {
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
            return effectiveStart + Math.floor(Math.random() * Math.max(0, effectiveRange));
        }

        let bestTrimStart = effectiveStart + Math.floor(Math.random() * effectiveRange);
        let maxDistance = -1;
        const numCandidates = 15;

        for (let i = 0; i < numCandidates; i++) {
            const candidate = effectiveStart + Math.floor(Math.random() * effectiveRange);
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
    });

    // Helper: finalize a clip sequence with orientation-aware zoom + transitions
    const finalizeSequence = (seq: Clip[]): Clip[] => {
        // ── BLACK SCREEN PREVENTION ──────────────────────────────────────
        // 0a. Clamp all trim ranges to valid source bounds
        const clamped = seq.map(c => {
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

        // Zoom effects removed — pass through directly
        const zoomFixed = gapFilled;
        // 2. Assign transitions (respecting settings)
        if (settings.transitionsEnabled === false) {
            return zoomFixed.map(c => ({ ...c, transitionEnter: ['none'], transitionExit: ['none'], transitionDurationFrames: 0 }));
        }
        let allowedTypes: TransitionType[] | undefined = undefined;
        if (settings.transitionMode === 'single' && settings.transitionTypes && settings.transitionTypes.length > 0) {
            // User picked individual transitions — use those directly
            allowedTypes = settings.transitionTypes;
        } else if (settings.transitionPreset && TRANSITION_PRESETS[settings.transitionPreset]) {
            allowedTypes = TRANSITION_PRESETS[settings.transitionPreset];
        } else if (settings.transitionTypes && settings.transitionTypes.length > 0) {
            allowedTypes = settings.transitionTypes;
        }

        return assignTransitions(zoomFixed, undefined, allowedTypes, settings.maxSimultaneousTransitions || 1);
    };

    // === INTELLIGENT AUDIO BEAT MODE ===
    if (useAudioGuide && beatTimestamps && beatTimestamps.length > 1) {
        const analysis = settings.audioAnalysis || null;
        const beatPatternSetting = settings.beatPattern || 'auto';
        const syncStrategySetting = settings.beatSyncStrategy || 'auto';
        const selectedSegs = settings.selectedSegments || [];
        const shuffledPool = shuffleArray(validPool);
        let poolIndex = 0;

        // Helper: resolve auto beat pattern per segment type (with variety)
        // TUNED: Quiet sections (intro, verse, breakdown, bridge) use sparser patterns
        // to avoid overambitious cuts during moments that should breathe.
        let autoPatternCounter = 0;
        const resolveAutoPattern = (segType: SegmentType): 'every' | 'half' | 'quarter' | 'drops' | 'risers-drops' => {
            autoPatternCounter++;
            switch (segType) {
                case 'drop': return autoPatternCounter % 3 === 0 ? 'half' : 'every'; // Mostly every beat, occasional breathing room
                case 'chorus': return autoPatternCounter % 2 === 0 ? 'every' : 'half'; // Alternate: keep energy but not frantic
                case 'buildup': return 'half'; // Steady build, not cutting on every beat
                case 'breakdown': return 'quarter'; // Slow and spacious — barely cut
                case 'verse': return 'quarter'; // Let scenes hold — cinematic pacing
                case 'bridge': return 'quarter'; // Bridge is quiet — long holds
                case 'intro': return 'quarter'; // Intro should breathe, set the scene
                case 'outro': return 'quarter'; // Outro winds down gracefully
                default: return 'half';
            }
        };

        // Helper: resolve auto sync strategy per segment type (with rotation for variety)
        let autoStrategyCounter = 0;
        const resolveAutoStrategy = (segType: SegmentType): 'cut-on-beat' | 'transition-on-beat' | 'effect-on-drop' | 'riser-buildup' | 'groove-ride' => {
            autoStrategyCounter++;
            switch (segType) {
                case 'drop':
                    // Rotate between cut-on-beat and effect-on-drop for variety
                    return autoStrategyCounter % 3 === 0 ? 'effect-on-drop' : 'cut-on-beat';
                case 'chorus':
                    return autoStrategyCounter % 4 === 0 ? 'transition-on-beat' : 'cut-on-beat';
                case 'buildup':
                    return autoStrategyCounter % 2 === 0 ? 'riser-buildup' : 'transition-on-beat';
                case 'breakdown':
                    return 'groove-ride'; // Always groove-ride for breakdowns — gentle
                case 'verse': case 'bridge':
                    return 'groove-ride'; // Let the footage ride the groove naturally
                case 'intro':
                    return 'groove-ride'; // Intro should feel smooth
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
            return beats; // 'every'
        };

        let activeBeats = [...beatTimestamps];
        if (beatPatternSetting !== 'auto') {
            activeBeats = filterBeatsByPattern(activeBeats, beatPatternSetting);
        }
        if (activeBeats.length < 2) activeBeats = beatTimestamps;

        // Helper: find segment type for a given time
        const getSegTypeAt = (time: number): SegmentType => {
            if (!analysis) return 'verse';
            const seg = analysis.segments.find(s => time >= s.start && time <= s.end);
            return seg?.type || 'verse';
        };

        // ── COOLDOWN: Minimum time between cuts per segment type ──
        // Prevents overambitious cutting in quiet sections.
        const getMinGapForSegment = (segType: SegmentType): number => {
            switch (segType) {
                case 'drop': case 'chorus': return 0.25; // Fast cuts are fine on drops
                case 'buildup': return 0.5;
                case 'breakdown': case 'bridge': return 2.0; // 2 seconds minimum between cuts
                case 'verse': return 1.5; // Let scenes breathe
                case 'intro': return 2.0; // Intro needs breathing room
                case 'outro': return 1.5;
                default: return 1.0;
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
            // ── DURATION GUARD: Stop generating once we've hit the target ──
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

            // ── COOLDOWN ENFORCEMENT ──
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

            const { clipMin, clipMax, speedMult, applyEffect } = getSegmentClipParams(segType, beatGapSeconds, syncStrategy);

            let gapFilled = 0;
            let gapFailures = 0;

            // Cut-on-beat / transition-on-beat / groove-ride: one clip per beat gap
            if (syncStrategy === 'cut-on-beat' || syncStrategy === 'transition-on-beat' || syncStrategy === 'groove-ride') {
                const file = shuffledPool[poolIndex % shuffledPool.length];
                poolIndex++;
                const { speed: baseSpeed, volume, isMuted } = getSpeedAndVolume();
                let speed = baseSpeed * speedMult;
                const clipDuration = Math.min(beatGapFrames, clipMax);
                const sourceReq = Math.max(1, Math.ceil(clipDuration * speed));
                const history = usedSegments.get(file.path) || [];
                const trimStart = getBestTrimStart(file, sourceReq, history);
                const trimEnd = trimStart + sourceReq;
                if (!usedSegments.has(file.path)) usedSegments.set(file.path, []);
                usedSegments.get(file.path)!.push(`${trimStart}-${trimEnd}`);
                const clip = createClip(file, accumulatedFrames, accumulatedFrames + clipDuration, trimStart, trimEnd, speed, volume, isMuted);
                if (applyEffect) (clip as any)._beatEffect = true;
                (clip as any)._segType = segType; // Tag for segment-aware editing intelligence

                // ── BEAT SPICE: segment-aware speed micro-variation, reversals ──
                const rand = Math.random();
                switch (segType) {
                    case 'drop':
                    case 'chorus':
                        // Occasional reversal for snap-back energy
                        if (rand > 0.75) clip.reversed = true;
                        // Speed micro-variation: slight random boost on drops
                        clip.speed = speed * (0.9 + Math.random() * 0.4);
                        break;
                    case 'buildup':
                        // Gradually accelerate
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
                    rhythmPattern, clipIndex, totalExpectedClips, clipMin, clipMax, prevRhythmMult
                );
                prevRhythmMult = rhythmMult;
                let clipDuration = Math.min(rhythmDur, remaining);
                if (clipDuration > remaining) clipDuration = remaining;
                if (clipDuration < 2) { gapFilled = beatGapFrames; break; }

                const file = shuffledPool[poolIndex % shuffledPool.length];
                poolIndex++;
                const { speed: baseSpeed, volume, isMuted } = getSpeedAndVolume();
                const speed = baseSpeed * speedMult;
                const sourceReq = Math.max(1, Math.ceil(clipDuration * speed));
                const history = usedSegments.get(file.path) || [];
                const trimStart = getBestTrimStart(file, sourceReq, history);
                const trimEnd = trimStart + sourceReq;
                if (!usedSegments.has(file.path)) usedSegments.set(file.path, []);
                usedSegments.get(file.path)!.push(`${trimStart}-${trimEnd}`);
                const clip = createClip(file, accumulatedFrames + gapFilled, accumulatedFrames + gapFilled + clipDuration, trimStart, trimEnd, speed, volume, isMuted);
                if (applyEffect) (clip as any)._beatEffect = true;
                (clip as any)._segType = segType;
                sequence.push(clip);
                clipIndex++;
                gapFilled += clipDuration;
                gapFailures = 0;
            }
            lastCutTime = activeBeats[b]; // Update cooldown tracker
            accumulatedFrames += beatGapFrames;
        }
        // ── FINAL DURATION TRIM: if beat-sync overshot, truncate the sequence ──
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

        // ── GAP-FILL: if beat-sync fell short, fill remaining duration ──
        if (accumulatedFrames < targetFrames) {
            const shuffledFill = shuffleArray(validPool);
            let fillIdx = 0;
            while (accumulatedFrames < targetFrames && fillIdx < shuffledFill.length * 3) {
                const file = shuffledFill[fillIdx % shuffledFill.length];
                fillIdx++;
                const remainingFrames = targetFrames - accumulatedFrames;
                if (remainingFrames < 3) break;
                let clipDur = Math.min(
                    Math.floor(Math.random() * (maxFrames - minFrames + 1)) + minFrames,
                    remainingFrames
                );
                const { speed, volume, isMuted } = getSpeedAndVolume();
                const sourceReq = Math.max(1, Math.ceil(clipDur * speed));
                const history = usedSegments.get(file.path) || [];
                const trimStart = getBestTrimStart(file, sourceReq, history);
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
        const shuffledEnsure = shuffleArray(validPool);
        for (let i = 0; i < shuffledEnsure.length; i++) {
            const file = shuffledEnsure[i];
            if (accumulatedFrames >= targetFrames) break;

            const remainingFrames = targetFrames - accumulatedFrames;
            const remainingFiles = shuffledEnsure.length - i;
            let dynamicMaxFrames = Math.floor(remainingFrames / remainingFiles);
            if (dynamicMaxFrames < minFrames) dynamicMaxFrames = minFrames;

            const { durationFrames: rhythmDur, multiplier: rhythmMult } = resolveRhythmDuration(
                rhythmPattern, clipIndex, totalExpectedClips, minFrames, maxFrames, prevRhythmMult
            );
            prevRhythmMult = rhythmMult;
            let cutDurationFrames = Math.min(rhythmDur, dynamicMaxFrames);

            const { speed, volume, isMuted } = getSpeedAndVolume();
            const sourceReq = Math.max(1, Math.ceil(cutDurationFrames * speed));
            const sourceAvailable = file.sourceDurationFrames;
            if (sourceReq > sourceAvailable) cutDurationFrames = Math.floor(sourceAvailable / speed);

            const history = usedSegments.get(file.path) || [];
            const trimStart = getBestTrimStart(file, sourceReq, history);
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
        const fileIndex = Math.floor(Math.random() * validPool.length);
        const file = validPool[fileIndex];

        if (!allowDuplicates && usedFiles.has(file.path)) {
            consecutiveFailures++;
            continue;
        }

        const { durationFrames: rhythmDur, multiplier: rhythmMult } = resolveRhythmDuration(
            rhythmPattern, clipIndex, totalExpectedClips, minFrames, maxFrames, prevRhythmMult
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

        const { speed, volume, isMuted } = getSpeedAndVolume();
        const sourceReq = Math.max(1, Math.ceil(safeDuration * speed));
        const history = usedSegments.get(file.path) || [];
        let trimStart = getBestTrimStart(file, sourceReq, history);
        let trimEnd = trimStart + sourceReq;

        if (!allowSameSegment && usedSegments.has(file.path)) {
            let collision = history.some(range => {
                const [s, e] = range.split('-').map(Number);
                return (trimStart < e && trimEnd > s);
            });

            if (collision) {
                for (let i = 0; i < 3; i++) {
                    trimStart = getBestTrimStart(file, sourceReq, history);
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
            break;
        }
    }

    // ===== POST-PROCESSING: EDITING STYLES =====
    const styleMix = settings.editingStyleMix || 'none';
    const enabledStyles = settings.editingStyles || [];
    const cfg = settings.styleConfig || DEFAULT_STYLE_CONFIG;

    if (styleMix !== 'none' && enabledStyles.length > 0 && sequence.length >= 2) {
        const probability = styleMix === 'light' ? 0.2 : styleMix === 'heavy' ? 0.5 : 1.0;
        const styledSequence: Clip[] = [];
        let i = 0;
        const burstMultiplier = cfg.burstMode === 'short' ? 0.7 : 1.4;

        while (i < sequence.length) {
            const clip = sequence[i];
            const roll = Math.random();

            if (roll > probability || clip.type !== 'video') {
                styledSequence.push(clip);
                i++;
                continue;
            }

            const chosenStyle = (() => {
                // ── SEGMENT-AWARE STYLE SELECTION ──
                // Instead of purely random, pick styles that match the clip's beat context.
                // If the clip has beat metadata (from audio-sync mode), choose accordingly.
                const clipAny = clip as any;
                const segType: string = clipAny._segType || '';
                
                // Filter enabled styles to those that fit this segment's energy
                const styleScores: Record<string, number> = {};
                for (const s of enabledStyles) {
                    // Base weight
                    styleScores[s] = 1;
                    
                    if (segType === 'drop' || segType === 'chorus') {
                        if (s === 'multi-boomerang') styleScores[s] = 5;
                        if (s === 'rubber-band-speed') styleScores[s] = 4;
                        if (s === 'triple-shot') styleScores[s] = 3;
                        if (s === 'snap-burst') styleScores[s] = 5;
                        if (s === 'hyper-cut') styleScores[s] = 4;
                        if (s === 'bear-chaos') styleScores[s] = 3;
                        if (s === 'pattern-interrupt') styleScores[s] = 2;
                        if (s === 'rubber-band') styleScores[s] = 2;
                        if (s === 'rubber-band-standard') styleScores[s] = 1;
                        if (s === 'pendulum-sway') styleScores[s] = 0.5;
                        if (s === 'beat-bounce') styleScores[s] = 6; // Perfect for drops — the viral bounce effect
                    } else if (segType === 'buildup') {
                        if (s === 'rubber-band-standard') styleScores[s] = 5;
                        if (s === 'rubber-band-speed') styleScores[s] = 3;
                        if (s === 'pattern-interrupt') styleScores[s] = 4;
                        if (s === 'snap-burst') styleScores[s] = 2;
                        if (s === 'hyper-cut') styleScores[s] = 3;
                        if (s === 'rubber-band') styleScores[s] = 2;
                        if (s === 'multi-boomerang') styleScores[s] = 1;
                        if (s === 'beat-bounce') styleScores[s] = 3;
                    } else if (segType === 'breakdown' || segType === 'bridge') {
                        if (s === 'pendulum-sway') styleScores[s] = 5;
                        if (s === 'rubber-band') styleScores[s] = 4;
                        if (s === 'rubber-band-standard') styleScores[s] = 3;
                        if (s === 'multi-boomerang') styleScores[s] = 0.5;
                        if (s === 'snap-burst') styleScores[s] = 0.5;
                        if (s === 'beat-bounce') styleScores[s] = 0.5; // Too aggressive for breakdowns
                    } else if (segType === 'verse') {
                        if (s === 'pendulum-sway') styleScores[s] = 4;
                        if (s === 'rubber-band-standard') styleScores[s] = 3;
                        if (s === 'rubber-band') styleScores[s] = 3;
                        if (s === 'triple-shot') styleScores[s] = 2;
                        if (s === 'hyper-cut') styleScores[s] = 2;
                        if (s === 'beat-bounce') styleScores[s] = 2;
                    } else if (segType === 'intro' || segType === 'outro') {
                        if (s === 'snap-burst') styleScores[s] = 5;
                        if (s === 'pendulum-sway') styleScores[s] = 4;
                        if (s === 'rubber-band') styleScores[s] = 3;
                        if (s === 'rubber-band-standard') styleScores[s] = 2;
                        if (s === 'beat-bounce') styleScores[s] = 1;
                    }
                }
                
                // Weighted random selection
                const totalWeight = Object.values(styleScores).reduce((a, b) => a + b, 0);
                let rand = Math.random() * totalWeight;
                for (const [style, weight] of Object.entries(styleScores)) {
                    rand -= weight;
                    if (rand <= 0) return style as EditingStyleOption;
                }
                return enabledStyles[Math.floor(Math.random() * enabledStyles.length)];
            })();
            const srcStart = clip.trimStartFrame || 0;
            const srcEnd = clip.trimEndFrame || clip.sourceDurationFrames || 0;
            const availSource = srcEnd - srcStart;
            const tlDur = clip.endFrame - clip.startFrame;
            const base = { ...clip, isPinned: false, locked: false, origin: 'auto' as const };
            let curFrame = clip.startFrame;
            const useReversal = Math.random() < cfg.reversalChance;

            if (chosenStyle === 'rubber-band-standard' && availSource > 15) {
                // Professional speed ramp: fast entrance → hero slow-mo → reverse slow-mo → fast exit
                const fastLen = Math.max(3, Math.floor(availSource * cfg.fastPortion));
                const slowLen = Math.max(5, Math.floor(availSource * cfg.slowPortion));
                const fastDur = Math.max(1, Math.floor((fastLen / cfg.rampFastSpeed) * burstMultiplier));
                const slowDur = Math.max(2, Math.floor((slowLen / cfg.rampSlowSpeed) * burstMultiplier));

                // Phase 1: Fast ramp in
                styledSequence.push({ ...base, id: uuidv4(), trimStartFrame: srcStart, trimEndFrame: srcStart + fastLen,
                    startFrame: curFrame, endFrame: curFrame + fastDur, speed: cfg.rampFastSpeed, reversed: false });
                curFrame += fastDur;
                // Phase 2: Slow hero moment
                styledSequence.push({ ...base, id: uuidv4(), trimStartFrame: srcStart + fastLen, trimEndFrame: srcStart + fastLen + slowLen,
                    startFrame: curFrame, endFrame: curFrame + slowDur, speed: cfg.rampSlowSpeed, reversed: false });
                curFrame += slowDur;
                if (useReversal) {
                    // Phase 3: Reverse slow (rubber snaps back)
                    styledSequence.push({ ...base, id: uuidv4(), trimStartFrame: srcStart + fastLen, trimEndFrame: srcStart + fastLen + slowLen,
                        startFrame: curFrame, endFrame: curFrame + slowDur, speed: cfg.rampSlowSpeed, reversed: true });
                    curFrame += slowDur;
                    // Phase 4: Reverse fast exit
                    styledSequence.push({ ...base, id: uuidv4(), trimStartFrame: srcStart, trimEndFrame: srcStart + fastLen,
                        startFrame: curFrame, endFrame: curFrame + fastDur, speed: cfg.rampFastSpeed, reversed: true });
                    curFrame += fastDur;
                }
                i++;

            } else if (chosenStyle === 'rubber-band' && availSource > 8) {
                // Push-in forward, pull-out reversed — with proper source trims
                const halfSrc = Math.floor(availSource / 2);
                const halfDur = Math.max(3, Math.floor(tlDur / 2 * burstMultiplier));
                styledSequence.push({ ...base, id: uuidv4(),
                    trimStartFrame: srcStart, trimEndFrame: srcStart + halfSrc,
                    startFrame: curFrame, endFrame: curFrame + halfDur } as any);
                curFrame += halfDur;
                // Always reverse the same source segment for rubber-band effect
                styledSequence.push({ ...base, id: uuidv4(),
                    trimStartFrame: srcStart, trimEndFrame: srcStart + halfSrc,
                    startFrame: curFrame, endFrame: curFrame + halfDur, reversed: true } as any);
                curFrame += halfDur;
                i++;

            } else if (chosenStyle === 'rubber-band-speed' && availSource > 15) {
                // Combined speed ramp
                const fastLen = Math.max(3, Math.floor(availSource * cfg.fastPortion));
                const slowLen = Math.max(5, Math.floor(availSource * cfg.slowPortion));
                const fastDur = Math.max(1, Math.floor((fastLen / cfg.rampFastSpeed) * burstMultiplier));
                const slowDur = Math.max(2, Math.floor((slowLen / cfg.rampSlowSpeed) * burstMultiplier));

                styledSequence.push({ ...base, id: uuidv4(), trimStartFrame: srcStart, trimEndFrame: srcStart + fastLen,
                    startFrame: curFrame, endFrame: curFrame + fastDur, speed: cfg.rampFastSpeed, reversed: false } as any);
                curFrame += fastDur;
                styledSequence.push({ ...base, id: uuidv4(), trimStartFrame: srcStart + fastLen, trimEndFrame: srcStart + fastLen + slowLen,
                    startFrame: curFrame, endFrame: curFrame + slowDur, speed: cfg.rampSlowSpeed, reversed: false } as any);
                curFrame += slowDur;
                if (useReversal) {
                    styledSequence.push({ ...base, id: uuidv4(), trimStartFrame: srcStart + fastLen, trimEndFrame: srcStart + fastLen + slowLen,
                        startFrame: curFrame, endFrame: curFrame + slowDur, speed: cfg.rampSlowSpeed, reversed: true } as any);
                    curFrame += slowDur;
                    styledSequence.push({ ...base, id: uuidv4(), trimStartFrame: srcStart, trimEndFrame: srcStart + fastLen,
                        startFrame: curFrame, endFrame: curFrame + fastDur, speed: cfg.rampFastSpeed, reversed: true } as any);
                    curFrame += fastDur;
                }
                i++;

            } else if (chosenStyle === 'multi-boomerang') {
                // Cap at 4 slices: 2 forward-reverse pairs using different source halves
                const slices = Math.min(cfg.boomerangSlices, 4);
                const halfSrc = Math.floor(availSource / 2);
                const sliceDur = Math.max(1, Math.floor((tlDur / slices) * burstMultiplier));

                // Pair 1: first half of source
                styledSequence.push({ ...base, id: uuidv4(),
                    trimStartFrame: srcStart, trimEndFrame: srcStart + halfSrc,
                    startFrame: curFrame, endFrame: curFrame + sliceDur, reversed: false });
                curFrame += sliceDur;
                styledSequence.push({ ...base, id: uuidv4(),
                    trimStartFrame: srcStart, trimEndFrame: srcStart + halfSrc,
                    startFrame: curFrame, endFrame: curFrame + sliceDur, reversed: true });
                curFrame += sliceDur;
                if (slices > 2) {
                    // Pair 2: second half of source
                    styledSequence.push({ ...base, id: uuidv4(),
                        trimStartFrame: srcStart + halfSrc, trimEndFrame: srcEnd,
                        startFrame: curFrame, endFrame: curFrame + sliceDur, reversed: false });
                    curFrame += sliceDur;
                    styledSequence.push({ ...base, id: uuidv4(),
                        trimStartFrame: srcStart + halfSrc, trimEndFrame: srcEnd,
                        startFrame: curFrame, endFrame: curFrame + sliceDur, reversed: true });
                    curFrame += sliceDur;
                }
                i++;

            } else if (chosenStyle === 'triple-shot' && i + 1 < sequence.length) {
                // A → B → A(reversed) pattern
                const clipA = sequence[i];
                const clipB = sequence[i + 1];
                const aDur = Math.max(2, Math.floor((clipA.endFrame - clipA.startFrame) * burstMultiplier));
                const bDur = Math.max(2, Math.floor((clipB.endFrame - clipB.startFrame) * burstMultiplier * 0.7));

                // Shot A forward
                styledSequence.push({ ...clipA, id: uuidv4(), startFrame: curFrame, endFrame: curFrame + aDur, reversed: false });
                curFrame += aDur;
                // Shot B (skip-forward intercut)
                styledSequence.push({ ...clipB, id: uuidv4(), startFrame: curFrame, endFrame: curFrame + bDur, reversed: false, isPinned: false, locked: false });
                curFrame += bDur;
                // Shot A reversed (return to origin)
                styledSequence.push({ ...clipA, id: uuidv4(), startFrame: curFrame, endFrame: curFrame + aDur, reversed: true });
                curFrame += aDur;
                i += 2;

            // ── 2026 VIRAL STYLES ─────────────────────────────────────────

            } else if (chosenStyle === 'snap-burst') {
                // 300% snap-speed punch: zoom in 3 frames, hold 3 frames, snap back 3 frames
                const zoomInDur = Math.max(2, Math.min(3, Math.floor(tlDur * 0.2)));
                const holdDur = Math.max(2, Math.min(4, Math.floor(tlDur * 0.3)));
                const zoomOutDur = Math.max(2, Math.min(3, Math.floor(tlDur * 0.2)));
                const remainDur = Math.max(1, tlDur - zoomInDur - holdDur - zoomOutDur);
                // Phase 1: Snap zoom IN (100→300%)
                styledSequence.push({ ...base, id: uuidv4(), trimStartFrame: srcStart, trimEndFrame: srcStart + Math.floor(availSource * 0.3),
                    startFrame: curFrame, endFrame: curFrame + zoomInDur, speed: 2.5 } as any);
                curFrame += zoomInDur;
                // Phase 2: Hold at peak zoom
                styledSequence.push({ ...base, id: uuidv4(), trimStartFrame: srcStart + Math.floor(availSource * 0.3), trimEndFrame: srcStart + Math.floor(availSource * 0.5),
                    startFrame: curFrame, endFrame: curFrame + holdDur, speed: 0.3 } as any);
                curFrame += holdDur;
                // Phase 3: Snap back out
                styledSequence.push({ ...base, id: uuidv4(), trimStartFrame: srcStart + Math.floor(availSource * 0.5), trimEndFrame: srcStart + Math.floor(availSource * 0.7),
                    startFrame: curFrame, endFrame: curFrame + zoomOutDur, speed: 2.5 } as any);
                curFrame += zoomOutDur;
                // Phase 4: Normal remainder
                if (remainDur > 1) {
                    styledSequence.push({ ...base, id: uuidv4(), trimStartFrame: srcStart + Math.floor(availSource * 0.7), trimEndFrame: srcEnd,
                        startFrame: curFrame, endFrame: curFrame + remainDur, speed: 1.0 });
                    curFrame += remainDur;
                }
                i++;

            } else if (chosenStyle === 'pendulum-sway' && availSource > 8) {
                // Oscillating zoom: 100→118→100→112→100 over clip — CapCut "Play Pendulum"
                const swingCount = 3;
                const swingDur = Math.max(3, Math.floor(tlDur / swingCount));
                const srcSlice = Math.floor(availSource / swingCount);
                const zooms = [118, 108, 115];
                for (let s = 0; s < swingCount; s++) {
                    const zTarget = zooms[s % zooms.length];
                    const isOut = s % 2 === 1;
                    styledSequence.push({ ...base, id: uuidv4(),
                        trimStartFrame: srcStart + s * srcSlice, trimEndFrame: srcStart + (s + 1) * srcSlice,
                        startFrame: curFrame, endFrame: curFrame + swingDur, speed: 0.85 } as any);
                    curFrame += swingDur;
                }
                i++;

            } else if (chosenStyle === 'hyper-cut' && availSource > 12) {
                // Sub-0.5s rapid micro-cuts from different source positions
                const microCount = Math.min(6, Math.max(3, Math.floor(availSource / 8)));
                const microDur = Math.max(2, Math.floor(tlDur / microCount * burstMultiplier));
                const srcStep = Math.floor(availSource / microCount);
                for (let m = 0; m < microCount; m++) {
                    const mStart = srcStart + m * srcStep;
                    const mEnd = Math.min(mStart + srcStep, srcEnd);
                    styledSequence.push({ ...base, id: uuidv4(),
                        trimStartFrame: mStart, trimEndFrame: mEnd,
                        startFrame: curFrame, endFrame: curFrame + microDur,
                        speed: 1.2 + Math.random() * 0.8, reversed: Math.random() > 0.7 } as any);
                    curFrame += microDur;
                }
                i++;

            } else if (chosenStyle === 'bear-chaos' && availSource > 10) {
                // The Bear style: tight center crop (150% zoom) + speed variation + foreground blur feel
                const phases = 3;
                const phaseDur = Math.max(3, Math.floor(tlDur / phases * burstMultiplier));
                const srcSlice = Math.floor(availSource / phases);
                for (let p = 0; p < phases; p++) {
                    const speedVar = 0.6 + Math.random() * 1.4; // 0.6x to 2.0x
                    const zoomBase = 140 + Math.floor(Math.random() * 25); // 140-165% tight crop
                    styledSequence.push({ ...base, id: uuidv4(),
                        trimStartFrame: srcStart + p * srcSlice, trimEndFrame: srcStart + (p + 1) * srcSlice,
                        startFrame: curFrame, endFrame: curFrame + phaseDur,
                        speed: speedVar, reversed: Math.random() > 0.8 } as any);
                    curFrame += phaseDur;
                }
                i++;

            } else if (chosenStyle === 'pattern-interrupt') {
                // Visual shock: 200% snap zoom + speed freeze for 2-3 frames, then normal
                const shockDur = Math.max(2, Math.min(4, Math.floor(tlDur * 0.15)));
                const normalDur = Math.max(2, tlDur - shockDur);
                // Shock frame
                styledSequence.push({ ...base, id: uuidv4(),
                    trimStartFrame: srcStart, trimEndFrame: srcStart + Math.min(5, availSource),
                    startFrame: curFrame, endFrame: curFrame + shockDur, speed: 0.1 } as any);
                curFrame += shockDur;
                // Normal playback
                styledSequence.push({ ...base, id: uuidv4(),
                    trimStartFrame: srcStart, trimEndFrame: srcEnd,
                    startFrame: curFrame, endFrame: curFrame + normalDur, speed: 1.2 });
                curFrame += normalDur;
                i++;

            } else if (chosenStyle === 'beat-bounce' && availSource > 4) {
                // ── VIRAL INSTAGRAM BEAT-BOUNCE EFFECT ─────────────────────
                // Isolate a short "hero slice" from the source, slow it to 0.4x,
                // then tile forward→reverse→forward→reverse to fill the clip's
                // timeline duration. Direction switches every eighth-note.
                //
                // Best with: static camera + moving subject, OR static subject
                // filmed at 60fps+ and conformed to 24fps.
                const bounceSpeed = cfg.rampSlowSpeed > 0 ? cfg.rampSlowSpeed : 0.4;

                // Hero slice: grab a short, visually interesting segment from source.
                // ~4-8 source frames is ideal — just enough motion for the bounce.
                const heroLen = Math.max(4, Math.min(8, Math.floor(availSource * 0.15)));
                // Pick the hero from slightly past the start to avoid black frames
                const heroOffset = Math.min(Math.floor(availSource * 0.1), availSource - heroLen);
                const heroStart = srcStart + Math.max(0, heroOffset);
                const heroEnd = heroStart + heroLen;

                // Each bounce sub-clip's timeline duration (one eighth-note worth).
                // At bounceSpeed, the hero slice yields this many output frames:
                const bounceDur = Math.max(2, Math.floor(heroLen / bounceSpeed));

                // Tile forward→reverse pairs to fill the full timeline duration
                let filled = 0;
                let fwd = true;
                while (filled < tlDur) {
                    const remaining = tlDur - filled;
                    // Last tile may be shorter to fit exactly
                    const tileDur = Math.min(bounceDur, remaining);
                    if (tileDur < 2) break;

                    styledSequence.push({
                        ...base, id: uuidv4(),
                        trimStartFrame: heroStart,
                        trimEndFrame: heroEnd,
                        startFrame: curFrame, endFrame: curFrame + tileDur,
                        speed: bounceSpeed,
                        reversed: !fwd,
                    });
                    curFrame += tileDur;
                    filled += tileDur;
                    fwd = !fwd; // Alternate direction every tile
                }
                i++;

            } else {
                styledSequence.push(clip);
                i++;
            }
        }

        // Re-magnetize AND enforce target duration cap
        let reFrame = 0;
        const magnetized: Clip[] = [];
        for (const c of styledSequence) {
            const dur = c.endFrame - c.startFrame;
            if (reFrame >= targetFrames) break;
            const cappedDur = Math.min(dur, targetFrames - reFrame);
            magnetized.push({ ...c, startFrame: reFrame, endFrame: reFrame + cappedDur });
            reFrame += cappedDur;
        }
        return finalizeSequence(magnetized);
    }

    // ── HOOK SYSTEM: First 3 seconds treatment ────────────────────────
    const hookStyle = settings.hookStyle || 'none';
    if (hookStyle !== 'none' && sequence.length >= 2) {
        const hookFrames = Math.min(90, targetFrames); // 3 seconds at 30fps
        const firstClip = sequence[0];
        const src = firstClip.trimStartFrame || 0;
        const srcEnd2 = firstClip.trimEndFrame || firstClip.sourceDurationFrames || 300;
        const availSrc = srcEnd2 - src;

        if (hookStyle === 'snap-speed' || hookStyle === 'auto') {
            // Replace first clip with snap-speed hook: fast zoom in → slow hero → fast out
            const zInDur = 4; const holdDur = Math.min(30, hookFrames - 8); const zOutDur = 4;
            sequence[0] = { ...firstClip, id: uuidv4(), startFrame: 0, endFrame: zInDur, speed: 3.0,
                trimStartFrame: src, trimEndFrame: src + Math.min(15, availSrc) } as any;
            sequence.splice(1, 0, { ...firstClip, id: uuidv4(), startFrame: zInDur, endFrame: zInDur + holdDur,
                speed: 0.3, trimStartFrame: src + 15, trimEndFrame: src + Math.min(50, availSrc) } as any);
            sequence.splice(2, 0, { ...firstClip, id: uuidv4(), startFrame: zInDur + holdDur, endFrame: zInDur + holdDur + zOutDur,
                speed: 3.0, trimStartFrame: src + 50, trimEndFrame: src + Math.min(70, availSrc) } as any);
        } else if (hookStyle === 'speed-freeze') {
            // Freeze at 0.1x for 1 second, then burst at 3x
            const freezeDur = 30; const burstDur = Math.min(20, hookFrames - freezeDur);
            sequence[0] = { ...firstClip, id: uuidv4(), startFrame: 0, endFrame: freezeDur, speed: 0.1,
                trimStartFrame: src, trimEndFrame: src + Math.min(10, availSrc) };
            sequence.splice(1, 0, { ...firstClip, id: uuidv4(), startFrame: freezeDur, endFrame: freezeDur + burstDur,
                speed: 3.0, trimStartFrame: src + 10, trimEndFrame: src + Math.min(80, availSrc) });
        } else if (hookStyle === 'pattern-interrupt') {
            // 3 rapid cuts from different sources in first 3 seconds
            for (let h = 0; h < Math.min(3, sequence.length); h++) {
                const hClip = sequence[h];
                hClip.speed = h === 1 ? 0.2 : 2.5;
            }
        }
        // Re-magnetize after hook injection
        let hFrame = 0;
        for (const c of sequence) {
            const dur = c.endFrame - c.startFrame;
            c.startFrame = hFrame; c.endFrame = hFrame + dur;
            hFrame += dur;
        }
    }

    // ── PATTERN INTERRUPT INJECTION ───────────────────────────────────
    if (settings.retentionInterrupts && sequence.length >= 4) {
        const interruptInterval = Math.floor((3 + Math.random() * 2) * DEFAULT_FPS); // 3-5 seconds
        const interrupted: Clip[] = [];
        let acc = 0;
        let lastInterrupt = 0;
        for (const clip of sequence) {
            const dur = clip.endFrame - clip.startFrame;
            interrupted.push(clip);
            acc += dur;
            if (acc - lastInterrupt >= interruptInterval) {
                // Inject a pattern interrupt: 3-frame snap zoom on current clip's source
                const intDur = 3;
                interrupted.push({
                    ...clip, id: uuidv4(),
                    startFrame: 0, endFrame: intDur, speed: 0.15,
                    trimStartFrame: clip.trimStartFrame, trimEndFrame: clip.trimStartFrame + 5,
                } as any);
                lastInterrupt = acc;
            }
        }
        // Replace and re-magnetize
        sequence.length = 0;
        let iFrame = 0;
        for (const c of interrupted) {
            const dur = c.endFrame - c.startFrame;
            if (iFrame >= targetFrames) break;
            const cd = Math.min(dur, targetFrames - iFrame);
            sequence.push({ ...c, startFrame: iFrame, endFrame: iFrame + cd });
            iFrame += cd;
        }
    }

    // ── LOOP ENGINEERING ──────────────────────────────────────────────
    if (settings.loopMode && sequence.length >= 2) {
        const firstClip = sequence[0];
        const lastClip = sequence[sequence.length - 1];
        // Replace last clip with reversed version of first clip's source
        sequence[sequence.length - 1] = {
            ...firstClip, id: uuidv4(),
            startFrame: lastClip.startFrame, endFrame: lastClip.endFrame,
            speed: firstClip.speed || 1.0, reversed: true,
        };
    }

    // ── VISUAL TEXTURE TAGGING ────────────────────────────────────────
    const texture = settings.visualTexture || 'none';
    if (texture !== 'none') {
        for (const clip of sequence) {
            (clip as any)._visualTexture = texture;
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
    preComputedAnalysis?: AudioAnalysisResult | null
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

        const beats = result.beats
            .filter(p => p.time >= trimStart && p.time <= safeTrimEnd)
            .map(p => p.time - trimStart);

        if (beats.length === 0 || beats[0] > 0.5) beats.unshift(0);
        const duration = safeTrimEnd - trimStart;
        if (beats[beats.length - 1] < duration - 0.5) beats.push(duration);

        return beats;
    } catch (e) {
        console.warn('[TrailerGenerator] Beat extraction failed, falling back to standard mode:', e);
        return null;
    }
};
