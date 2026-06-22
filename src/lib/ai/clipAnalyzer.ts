/**
 * AI Clip Analyzer — Content analysis interfaces and scoring for intelligent editing.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * Defines the data structures and algorithms for:
 *   • Face detection & shot type classification
 *   • Scene classification (indoor/outdoor, day/night)
 *   • Camera motion classification
 *   • Emotion/expression estimation
 *   • Object detection summaries
 *
 * The actual ML inference happens in clipIndexer.ts via Web Workers.
 * This module handles the typing, scoring, and query logic.
 */

// ─── Shot & Scene Types ──────────────────────────────────────────────────────

/** Shot scale taxonomy (matches showreelGenerator.ts ShotType). */
export type ShotScale = 'ecu' | 'cu' | 'mcu' | 'ms' | 'mls' | 'ls' | 'els';

/** Broad scene environment classification. */
export type SceneEnvironment = 'indoor' | 'outdoor' | 'studio' | 'stage' | 'vehicle';

/** Visual time-of-day estimation. */
export type TimeOfDayVisual = 'day' | 'night' | 'golden-hour' | 'blue-hour' | 'artificial';

/** Camera motion classification. */
export type CameraMotion =
    | 'static' | 'pan' | 'tilt'
    | 'zoom-in' | 'zoom-out'
    | 'tracking' | 'handheld' | 'drone' | 'dolly';

/** Emotion labels for face expression classification. */
export type EmotionLabel =
    | 'happy' | 'sad' | 'angry' | 'fearful'
    | 'surprised' | 'disgusted' | 'neutral' | 'contempt';

// ─── Face Detection ──────────────────────────────────────────────────────────

/**
 * A single detected face within a video frame.
 */
export interface FaceDetection {
    /** Bounding box as percentage of frame (0-1 for each axis). */
    bbox: { x: number; y: number; width: number; height: number };
    /** Detection confidence (0-1). */
    confidence: number;
    /** Face embedding for person clustering (optional, high-dimensional). */
    embedding?: number[];
    /** Estimated expression. */
    emotion?: EmotionLabel;
}

// ─── Clip Analysis Result ────────────────────────────────────────────────────

/**
 * Complete analysis output for a single clip / keyframe.
 * Produced by the indexing pipeline (clipIndexer.ts) and consumed by
 * generators (trailerGenerator, showreelGenerator, etc.).
 */
export interface ClipAnalysis {
    clipId: string;
    /** Epoch ms when analysis was performed. */
    analyzedAt: number;

    // ── Face analysis ────────────────────────────────────────────────────
    faces: FaceDetection[];
    faceCount: number;
    /** Dominant face's area as a ratio to total frame area (0-1). */
    faceToFrameRatio: number;
    /** Classified shot scale based on face-to-frame ratio. */
    shotScale: ShotScale;
    /** Identified person cluster ID (for showreel grouping). */
    personId?: string;

    // ── Scene analysis ───────────────────────────────────────────────────
    sceneEnvironment: SceneEnvironment;
    timeOfDay: TimeOfDayVisual;
    /** Top scene classification labels with confidence. */
    sceneLabels: Array<{ label: string; confidence: number }>;

    // ── Camera analysis ──────────────────────────────────────────────────
    cameraMotion: CameraMotion;
    /** Estimated motion magnitude (0-1). */
    motionMagnitude: number;

    // ── Object detection ─────────────────────────────────────────────────
    /** Key objects detected in the frame. */
    objects: Array<{ label: string; confidence: number; count: number }>;

    // ── Emotion (from faces) ─────────────────────────────────────────────
    dominantEmotion?: EmotionLabel;
    emotionConfidence?: number;

    // ── Audio features ───────────────────────────────────────────────────
    hasDialogue: boolean;
    hasMusicBed: boolean;
    /** Average loudness in dBFS. */
    averageLoudness: number;
}

// ─── Shot Scale Classification ───────────────────────────────────────────────

/**
 * Classify shot scale from face-to-frame area ratio.
 *
 * | Scale | Ratio range     | Description             |
 * |-------|-----------------|-------------------------|
 * | ECU   | > 0.60          | Extreme close-up        |
 * | CU    | 0.30 – 0.60     | Close-up                |
 * | MCU   | 0.15 – 0.30     | Medium close-up         |
 * | MS    | 0.08 – 0.15     | Medium shot             |
 * | MLS   | 0.04 – 0.08     | Medium long shot        |
 * | LS    | 0.01 – 0.04     | Long shot               |
 * | ELS   | < 0.01          | Extreme long shot        |
 */
export function classifyShotScale(faceToFrameRatio: number): ShotScale {
    if (faceToFrameRatio > 0.60) return 'ecu';
    if (faceToFrameRatio > 0.30) return 'cu';
    if (faceToFrameRatio > 0.15) return 'mcu';
    if (faceToFrameRatio > 0.08) return 'ms';
    if (faceToFrameRatio > 0.04) return 'mls';
    if (faceToFrameRatio > 0.01) return 'ls';
    return 'els';
}

// ─── Purpose-Based Scoring ───────────────────────────────────────────────────

/** Weights for each scoring dimension, per purpose. */
interface ScoringWeights {
    facePresence: number;
    closeShotBias: number;
    motionEnergy: number;
    emotionIntensity: number;
    dialogueBias: number;
    musicBias: number;
    environmentVariety: number;
}

/** Weights tuned for each editorial purpose. */
const PURPOSE_WEIGHTS: Record<string, ScoringWeights> = {
    'trailer': {
        facePresence: 0.15,
        closeShotBias: 0.10,
        motionEnergy: 0.25,
        emotionIntensity: 0.20,
        dialogueBias: 0.10,
        musicBias: 0.05,
        environmentVariety: 0.15,
    },
    'music-video': {
        facePresence: 0.10,
        closeShotBias: 0.05,
        motionEnergy: 0.30,
        emotionIntensity: 0.10,
        dialogueBias: 0.00,
        musicBias: 0.30,
        environmentVariety: 0.15,
    },
    'showreel': {
        facePresence: 0.30,
        closeShotBias: 0.25,
        motionEnergy: 0.05,
        emotionIntensity: 0.20,
        dialogueBias: 0.15,
        musicBias: 0.00,
        environmentVariety: 0.05,
    },
    'video-essay': {
        facePresence: 0.15,
        closeShotBias: 0.10,
        motionEnergy: 0.05,
        emotionIntensity: 0.05,
        dialogueBias: 0.35,
        musicBias: 0.05,
        environmentVariety: 0.25,
    },
    'short-film': {
        facePresence: 0.20,
        closeShotBias: 0.15,
        motionEnergy: 0.15,
        emotionIntensity: 0.20,
        dialogueBias: 0.15,
        musicBias: 0.05,
        environmentVariety: 0.10,
    },
};

/**
 * Numeric ordering for shot scales — lower index = tighter framing.
 * Used to compute a 0-1 "closeness" score.
 */
const SHOT_CLOSENESS: Record<ShotScale, number> = {
    'ecu': 1.0,
    'cu': 0.85,
    'mcu': 0.70,
    'ms': 0.50,
    'mls': 0.35,
    'ls': 0.20,
    'els': 0.05,
};

/**
 * Map emotions to an "intensity" score (0-1) for cinematic value.
 * High-arousal emotions score higher — they're more visually compelling.
 */
const EMOTION_INTENSITY: Record<EmotionLabel, number> = {
    'angry': 0.90,
    'fearful': 0.85,
    'surprised': 0.80,
    'disgusted': 0.75,
    'happy': 0.65,
    'sad': 0.60,
    'contempt': 0.50,
    'neutral': 0.10,
};

/**
 * Score a clip for a specific editorial purpose.
 *
 * Produces a 0-100 score by computing weighted sub-scores for face presence,
 * shot closeness, motion energy, emotion intensity, dialogue, music, and
 * environment. Each purpose has different weight distributions reflecting
 * the editorial priorities of that format.
 *
 * @param analysis  Completed clip analysis
 * @param purpose   Editorial purpose
 * @returns Score in the range 0-100
 */
export function scoreForPurpose(
    analysis: ClipAnalysis,
    purpose: 'trailer' | 'music-video' | 'showreel' | 'video-essay' | 'short-film',
): number {
    const w = PURPOSE_WEIGHTS[purpose] ?? PURPOSE_WEIGHTS['trailer'];

    // Sub-scores (each 0-1)
    const facePresence = Math.min(1, analysis.faceCount / 2);
    const closeShotBias = SHOT_CLOSENESS[analysis.shotScale] ?? 0.5;
    const motionEnergy = analysis.motionMagnitude;
    const emotionIntensity = analysis.dominantEmotion
        ? (EMOTION_INTENSITY[analysis.dominantEmotion] ?? 0.1)
        : 0;
    const dialogueBias = analysis.hasDialogue ? 1 : 0;
    const musicBias = analysis.hasMusicBed ? 1 : 0;

    // Environment variety bonus: non-indoor environments are more visually diverse
    const envScore = analysis.sceneEnvironment === 'outdoor' ? 0.8
        : analysis.sceneEnvironment === 'stage' ? 0.7
        : analysis.sceneEnvironment === 'vehicle' ? 0.6
        : analysis.sceneEnvironment === 'studio' ? 0.4
        : 0.3;  // indoor

    const composite =
        w.facePresence * facePresence +
        w.closeShotBias * closeShotBias +
        w.motionEnergy * motionEnergy +
        w.emotionIntensity * emotionIntensity +
        w.dialogueBias * dialogueBias +
        w.musicBias * musicBias +
        w.environmentVariety * envScore;

    return Math.max(0, Math.min(100, Math.round(composite * 100)));
}

// ─── Clip Search / Filtering ─────────────────────────────────────────────────

/**
 * Criteria for filtering and ranking analysed clips.
 */
export interface ClipSearchCriteria {
    minFaceCount?: number;
    maxFaceCount?: number;
    preferredShotScale?: ShotScale[];
    preferredEnvironment?: SceneEnvironment[];
    preferredEmotion?: EmotionLabel[];
    preferredCameraMotion?: CameraMotion[];
    requireDialogue?: boolean;
    personId?: string;
}

/**
 * Find the best clips matching the given criteria from a pool of analysed clips.
 *
 * Hard filters are applied first (face count range, dialogue requirement,
 * person ID). Then each surviving clip receives a relevance score based on
 * how many of the preferred attributes it matches. Results are returned
 * sorted by descending relevance score, capped at `limit`.
 *
 * @param analyses  Pool of clip analyses to search
 * @param criteria  Filter and preference criteria
 * @param limit     Maximum number of results (default 10)
 * @returns Sorted array of matching ClipAnalysis objects
 */
export function findBestClips(
    analyses: ClipAnalysis[],
    criteria: ClipSearchCriteria,
    limit: number = 10,
): ClipAnalysis[] {
    // ── Hard filters ─────────────────────────────────────────────────────
    let filtered = analyses.filter(a => {
        if (criteria.minFaceCount !== undefined && a.faceCount < criteria.minFaceCount) return false;
        if (criteria.maxFaceCount !== undefined && a.faceCount > criteria.maxFaceCount) return false;
        if (criteria.requireDialogue && !a.hasDialogue) return false;
        if (criteria.personId && a.personId !== criteria.personId) return false;
        return true;
    });

    // ── Soft scoring (preference matching) ───────────────────────────────
    const scored = filtered.map(a => {
        let relevance = 0;
        let checks = 0;

        if (criteria.preferredShotScale?.length) {
            checks++;
            if (criteria.preferredShotScale.includes(a.shotScale)) relevance++;
        }
        if (criteria.preferredEnvironment?.length) {
            checks++;
            if (criteria.preferredEnvironment.includes(a.sceneEnvironment)) relevance++;
        }
        if (criteria.preferredEmotion?.length) {
            checks++;
            if (a.dominantEmotion && criteria.preferredEmotion.includes(a.dominantEmotion)) {
                relevance++;
            }
        }
        if (criteria.preferredCameraMotion?.length) {
            checks++;
            if (criteria.preferredCameraMotion.includes(a.cameraMotion)) relevance++;
        }

        // Normalise to 0-1 (if no soft preferences, everyone ties at 0.5)
        const score = checks > 0 ? relevance / checks : 0.5;
        return { analysis: a, score };
    });

    // ── Sort and cap ─────────────────────────────────────────────────────
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.analysis);
}
