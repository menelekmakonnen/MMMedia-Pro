/**
 * Showreel Metadata Synthesizer — Bridges Smart Engine analysis data
 * to ShowreelClipMeta[] required by the showreel generator.
 * ════════════════════════════════════════════════════════════════════════════
 * The showreel planner needs per-clip metadata (face visibility, shot type,
 * emotion, genre, dialogue, stability) that requires dedicated ML analysis.
 * Until that's available, this synthesizer creates reasonable proxies from
 * the data the Smart Engine already computes (motion energy, silence
 * detection, scene cuts, color analysis).
 */

import type { ShowreelClipMeta, ShotType, PerformanceGenre, EmotionType } from './showreelGenerator';
import { computeWorthiness } from './showreelGenerator';

// ─── Smart Engine Data Shape ─────────────────────────────────────────────────

/**
 * Per-clip analysis result from the Smart Engine (mirrors ClipAnalysisResult
 * from trailerSmartStore, kept as a standalone interface so the synthesizer
 * doesn't depend on Zustand stores).
 */
export interface SmartEngineData {
    /** Motion energy score 0-100 */
    score: number;
    /** Classified energy bucket */
    energyLevel: 'static' | 'low' | 'moderate' | 'high' | 'intense';
    /** Frame number of first non-silent content (silence detection) */
    usableInFrames?: number;
    /** Frame number of last non-silent content (silence detection) */
    usableOutFrames?: number;
    /** Frame numbers of detected scene cuts */
    sceneCutsFrames?: number[];
    /** Auto-grade color correction (unused here, but present in data) */
    autoGrade?: any;
    /** Whether analysis has completed */
    analyzed: boolean;
}

// ─── Safe Defaults ───────────────────────────────────────────────────────────

/**
 * Reasonable defaults for clips that haven't been analyzed yet.
 * Merge with file-specific overrides via `{ ...DEFAULT_CLIP_META, ...overrides }`.
 */
export const DEFAULT_CLIP_META: Partial<ShowreelClipMeta> = {
    faceVisibility: 0.5,
    shotType: 'ms',
    emotion: 'neutral',
    genre: 'drama',
    hasDialogue: false,
    stabilityScore: 0.6,
    worthinessScore: 0,
};

// ─── Filename Keyword Detection ──────────────────────────────────────────────

/** Case-insensitive keyword check against a filename. */
function filenameContains(filename: string, keywords: string[]): boolean {
    const lower = filename.toLowerCase();
    return keywords.some(kw => lower.includes(kw));
}

// ─── Face Visibility Heuristic ───────────────────────────────────────────────

/**
 * Estimate face visibility from filename cues.
 * Future: will be replaced by IPC face detection.
 */
function inferFaceVisibility(filename: string): number {
    if (filenameContains(filename, ['closeup', 'close-up', 'close_up', 'portrait', 'face', 'headshot'])) {
        return 0.8;
    }
    // Default: assume actor is somewhat visible
    return 0.5;
}

// ─── Shot Type Heuristic ─────────────────────────────────────────────────────

/**
 * Infer predominant shot type from motion energy and scene cut density.
 *
 * Rationale:
 * - Low energy + few cuts → wide establishing shot (LS/ELS)
 * - Moderate energy → medium shot (MS)
 * - High energy + many cuts → close-up action (CU/MCU)
 */
function inferShotType(
    energyLevel: SmartEngineData['energyLevel'],
    sceneCutsCount: number,
): ShotType {
    switch (energyLevel) {
        case 'static':
            return sceneCutsCount <= 1 ? 'els' : 'ls';
        case 'low':
            return sceneCutsCount <= 2 ? 'ls' : 'mls';
        case 'moderate':
            return 'ms';
        case 'high':
            return sceneCutsCount >= 4 ? 'cu' : 'mcu';
        case 'intense':
            return sceneCutsCount >= 3 ? 'ecu' : 'cu';
        default:
            return 'ms';
    }
}

// ─── Emotion Heuristic ───────────────────────────────────────────────────────

/** Counter for alternating high-energy emotions (happy/angry). */
let _highEnergyAlternator = 0;

/**
 * Map energy level to a plausible emotion.
 *
 * This is a coarse proxy — real emotion detection requires facial AU analysis.
 * The alternator ensures high-energy clips aren't all tagged identically.
 */
function inferEmotion(energyLevel: SmartEngineData['energyLevel']): EmotionType {
    switch (energyLevel) {
        case 'intense':
            return 'intense';
        case 'high':
            return (_highEnergyAlternator++ % 2 === 0) ? 'happy' : 'angry';
        case 'moderate':
            return 'neutral';
        case 'low':
            return 'contemplative';
        case 'static':
            return 'neutral';
        default:
            return 'neutral';
    }
}

// ─── Genre Heuristic ─────────────────────────────────────────────────────────

/** Keyword → genre mapping for filename-based genre inference. */
const GENRE_KEYWORDS: Array<{ keywords: string[]; genre: PerformanceGenre }> = [
    { keywords: ['action', 'fight', 'chase', 'stunt', 'explosion'], genre: 'action' },
    { keywords: ['comedy', 'funny', 'sitcom', 'laugh'], genre: 'comedy' },
    { keywords: ['horror', 'scare', 'creepy', 'zombie', 'ghost'], genre: 'horror' },
    { keywords: ['thriller', 'suspense', 'mystery'], genre: 'thriller' },
    { keywords: ['romance', 'love', 'romantic', 'kiss'], genre: 'romance' },
    { keywords: ['scifi', 'sci-fi', 'sci_fi', 'space', 'futuristic'], genre: 'sci-fi' },
    { keywords: ['documentary', 'docu', 'doc', 'interview'], genre: 'documentary' },
];

function inferGenre(filename: string): PerformanceGenre {
    const lower = filename.toLowerCase();
    for (const { keywords, genre } of GENRE_KEYWORDS) {
        if (keywords.some(kw => lower.includes(kw))) return genre;
    }
    return 'drama'; // safest default for actor showreels
}

// ─── Dialogue Heuristic ──────────────────────────────────────────────────────

/**
 * Estimate dialogue presence from silence detection boundaries.
 *
 * If the usable (non-silent) range is significantly shorter than the full clip,
 * there are extended silent portions — and the non-silent parts may contain
 * dialogue. Non-static clips with low-to-moderate energy are most likely to
 * have dialogue (calm conversation scenes).
 *
 * @param data      Smart Engine analysis
 * @param totalFrames  Estimated total frame count (from duration × fps)
 */
function inferDialogue(data: SmartEngineData, totalFrames: number): boolean {
    if (data.energyLevel === 'static') return false;

    // If we have silence detection data, check if the usable range differs
    // from the full clip — meaning non-silent content was detected.
    if (data.usableInFrames != null && data.usableOutFrames != null && totalFrames > 0) {
        const usableSpan = data.usableOutFrames - data.usableInFrames;
        const ratio = usableSpan / totalFrames;
        // If trimmed range is less than 90% of total → noticeable silence → potential dialogue
        if (ratio < 0.9 && ratio > 0.1) return true;
    }

    // Fallback: low-to-moderate energy suggests dialogue scenes
    return data.energyLevel === 'low' || data.energyLevel === 'moderate';
}

// ─── Stability Heuristic ─────────────────────────────────────────────────────

/**
 * Derive a 0-1 stability score as an inverse of motion energy.
 *
 * Maps:  static=0.95, low=0.80, moderate=0.60, high=0.40, intense=0.20
 */
function inferStability(energyLevel: SmartEngineData['energyLevel']): number {
    const STABILITY_MAP: Record<SmartEngineData['energyLevel'], number> = {
        static: 0.95,
        low: 0.80,
        moderate: 0.60,
        high: 0.40,
        intense: 0.20,
    };
    return STABILITY_MAP[energyLevel] ?? 0.60;
}

// ─── Main Synthesizer ────────────────────────────────────────────────────────

/**
 * Synthesize ShowreelClipMeta from Smart Engine analysis results.
 *
 * Accepts smart data as either a Map or a plain object keyed by file id/path.
 * Files without matching smart data receive safe defaults.
 *
 * @param files       Pool of candidate media files (path, filename, type)
 * @param smartData   Per-file analysis results from the Smart Engine
 * @param fps         Project frame rate (used for dialogue heuristic), defaults to 30
 * @param closeUpBias Passed to computeWorthiness, defaults to 0.6
 * @returns           One ShowreelClipMeta per input file
 */
export function synthesizeShowreelMeta(
    files: Array<{ path: string; filename: string; type: string }>,
    smartData: Map<string, SmartEngineData> | Record<string, SmartEngineData>,
    fps: number = 30,
    closeUpBias: number = 0.6,
): ShowreelClipMeta[] {
    // Reset the alternator so results are deterministic per call
    _highEnergyAlternator = 0;

    // Normalize to a get-function regardless of input shape
    const getData = (key: string): SmartEngineData | undefined => {
        if (smartData instanceof Map) return smartData.get(key);
        return (smartData as Record<string, SmartEngineData>)[key];
    };

    return files.map((file, index) => {
        // Try matching by path first, then by filename
        const data = getData(file.path) ?? getData(file.filename);

        if (!data || !data.analyzed) {
            // Unanalyzed file → safe defaults
            const meta: ShowreelClipMeta = {
                fileIndex: index,
                faceVisibility: inferFaceVisibility(file.filename),
                shotType: 'ms',
                emotion: 'neutral',
                genre: inferGenre(file.filename),
                hasDialogue: false,
                stabilityScore: 0.6,
                worthinessScore: 0,
            };
            meta.worthinessScore = computeWorthiness(meta, closeUpBias);
            return meta;
        }

        const sceneCutsCount = data.sceneCutsFrames?.length ?? 0;

        // Estimate total frame count for dialogue heuristic
        // Use usable out frame as a rough proxy for clip length
        const estimatedTotalFrames = data.usableOutFrames ?? (fps * 10); // fallback: 10s

        const meta: ShowreelClipMeta = {
            fileIndex: index,
            faceVisibility: inferFaceVisibility(file.filename),
            shotType: inferShotType(data.energyLevel, sceneCutsCount),
            emotion: inferEmotion(data.energyLevel),
            genre: inferGenre(file.filename),
            hasDialogue: inferDialogue(data, estimatedTotalFrames),
            stabilityScore: inferStability(data.energyLevel),
            worthinessScore: 0, // computed below
        };

        meta.worthinessScore = computeWorthiness(meta, closeUpBias);

        return meta;
    });
}

// ─── Batch Helper ────────────────────────────────────────────────────────────

/**
 * Convenience: synthesize from a Zustand store's `analysisResults` Map.
 *
 * Usage:
 * ```ts
 * const results = useTrailerSmartStore.getState().analysisResults;
 * const metas = synthesizeFromStore(files, results);
 * ```
 */
export function synthesizeFromStore(
    files: Array<{ path: string; filename: string; type: string; id: string }>,
    analysisResults: Map<string, { score: number; energyLevel: string; usableInFrames?: number; usableOutFrames?: number; sceneCutsFrames?: number[]; autoGrade?: any; analyzed: boolean }>,
    fps?: number,
    closeUpBias?: number,
): ShowreelClipMeta[] {
    // Re-key from file IDs to file paths so synthesizeShowreelMeta can match
    const byPath = new Map<string, SmartEngineData>();
    for (const file of files) {
        const result = analysisResults.get(file.id);
        if (result) {
            byPath.set(file.path, result as SmartEngineData);
        }
    }
    return synthesizeShowreelMeta(files, byPath, fps, closeUpBias);
}
