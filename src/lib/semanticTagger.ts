/**
 * semanticTagger.ts — Automatic semantic tagging for clips.
 *
 * Tags each clip with mood, setting, time-of-day, and content attributes.
 * These tags feed into the generator for intelligent narrative decisions:
 *   - "This is a tense moment — pick a dark, indoor, close-up clip"
 *   - "Match clip mood to song section (verse=calm, chorus=energetic)"
 *   - "Auto-sort by mood arc (start strong, dip, build, climax)"
 *
 * All inference is done from FFmpeg-extractable features (luma, chroma,
 * saturation, motion, audio spectral data) — no ML models required.
 *
 * Deeply connected to: smartEngine.ts (extraction), clipScoring.ts (scoring),
 *                       trailerGenerator.ts (selection), shotClassifier.ts (enrichment)
 */

// ── Tag Types ────────────────────────────────────────────────────────────────

export type MoodTag =
    | 'happy'
    | 'sad'
    | 'tense'
    | 'calm'
    | 'energetic'
    | 'romantic'
    | 'mysterious'
    | 'epic'
    | 'melancholic'
    | 'playful'
    | 'dark'
    | 'neutral';

export type SettingTag =
    | 'indoor'
    | 'outdoor'
    | 'studio'
    | 'nature'
    | 'urban'
    | 'underwater'
    | 'aerial'
    | 'stage'
    | 'unknown';

export type TimeOfDayTag =
    | 'day'
    | 'night'
    | 'golden-hour'
    | 'blue-hour'
    | 'dawn'
    | 'dusk'
    | 'artificial-light'
    | 'unknown';

export type PaceTag = 'still' | 'slow' | 'moderate' | 'fast' | 'frenetic';

export type ContentFlag =
    | 'has-faces'
    | 'has-text'
    | 'has-speech'
    | 'has-music'
    | 'has-silence'
    | 'has-motion'
    | 'high-contrast'
    | 'low-light'
    | 'colorful'
    | 'monochrome';

// ── Semantic Tag Result ──────────────────────────────────────────────────────

export interface SemanticTags {
    /** Primary mood classification */
    mood: MoodTag;
    /** Mood confidence (0-1) */
    moodConfidence: number;
    /** Setting classification */
    setting: SettingTag;
    /** Time of day */
    timeOfDay: TimeOfDayTag;
    /** Pace/energy level */
    pace: PaceTag;
    /** Content flags (binary attributes) */
    contentFlags: ContentFlag[];
    /** Dominant colour (hex) */
    dominantColor: string;
    /** Secondary colour (hex) */
    secondaryColor: string;
    /** Colour temperature in Kelvin (approximated from luma/chroma) */
    colorTemperatureK: number;
    /** Saturation level (0-1 normalised) */
    saturationLevel: number;
    /** Brightness level (0-1 normalised) */
    brightnessLevel: number;
    /** Visual complexity (0-1): low=simple composition, high=busy frame */
    visualComplexity: number;
}

// ── Inference Functions ──────────────────────────────────────────────────────

/**
 * Infer mood from visual features.
 *
 * Mood classification uses a weighted combination of:
 *   - Brightness (dark=tense/dark, bright=happy/energetic)
 *   - Saturation (high=vibrant/energetic, low=melancholic/calm)
 *   - Motion (high=energetic, low=calm)
 *   - Colour temperature (warm=happy/romantic, cool=sad/mysterious)
 */
export function inferMood(features: {
    avgLuma: number;           // 0-255
    avgSaturation: number;     // 0-255
    motionMagnitude: number;   // 0-1
    colorTempK: number;        // ~2000-10000
    edgeDensity: number;       // 0-1
}): { mood: MoodTag; confidence: number } {
    const { avgLuma, avgSaturation, motionMagnitude, colorTempK, edgeDensity } = features;

    // Normalise inputs to 0-1
    const brightness = avgLuma / 255;
    const saturation = avgSaturation / 255;
    const warmth = Math.min(1, Math.max(0, (colorTempK - 2000) / 8000));
    const motion = motionMagnitude;

    // Score each mood
    const scores: Record<MoodTag, number> = {
        happy:       brightness * 0.3 + saturation * 0.3 + warmth * 0.3 + motion * 0.1,
        sad:         (1 - brightness) * 0.3 + (1 - saturation) * 0.3 + (1 - warmth) * 0.2 + (1 - motion) * 0.2,
        tense:       (1 - brightness) * 0.3 + motion * 0.3 + edgeDensity * 0.2 + (1 - warmth) * 0.2,
        calm:        brightness * 0.2 + (1 - motion) * 0.4 + (1 - edgeDensity) * 0.2 + saturation * 0.2,
        energetic:   motion * 0.4 + saturation * 0.3 + brightness * 0.2 + edgeDensity * 0.1,
        romantic:    warmth * 0.4 + saturation * 0.2 + brightness * 0.2 + (1 - motion) * 0.2,
        mysterious:  (1 - brightness) * 0.3 + (1 - warmth) * 0.3 + (1 - saturation) * 0.2 + (1 - motion) * 0.2,
        epic:        motion * 0.3 + edgeDensity * 0.2 + (1 - saturation) * 0.1 + brightness * 0.2 + saturation * 0.2,
        melancholic: (1 - saturation) * 0.3 + (1 - brightness) * 0.2 + (1 - warmth) * 0.2 + (1 - motion) * 0.3,
        playful:     saturation * 0.3 + motion * 0.3 + brightness * 0.3 + warmth * 0.1,
        dark:        (1 - brightness) * 0.5 + (1 - saturation) * 0.2 + (1 - warmth) * 0.2 + edgeDensity * 0.1,
        neutral:     0.35, // baseline — wins when nothing else is strong
    };

    // Find the highest-scoring mood
    let bestMood: MoodTag = 'neutral';
    let bestScore = 0;
    for (const [mood, score] of Object.entries(scores) as [MoodTag, number][]) {
        if (score > bestScore) {
            bestScore = score;
            bestMood = mood;
        }
    }

    return { mood: bestMood, confidence: Math.min(1, bestScore * 1.2) };
}

/**
 * Infer setting (indoor/outdoor/studio/nature/urban) from visual features.
 */
export function inferSetting(features: {
    avgLuma: number;
    edgeDensity: number;
    colorVariance: number;     // 0-1: how many different colours are present
    greenRatio: number;        // fraction of frame that is green/vegetation
    blueRatio: number;         // fraction that is sky-blue
    hasUIEdges: boolean;
}): SettingTag {
    const { avgLuma, edgeDensity, colorVariance, greenRatio, blueRatio, hasUIEdges } = features;

    if (hasUIEdges) return 'studio'; // Clean edges = studio or controlled environment
    if (greenRatio > 0.3 && blueRatio > 0.15) return 'nature';
    if (greenRatio > 0.25) return 'outdoor';
    if (blueRatio > 0.3 && edgeDensity < 0.2) return 'aerial';
    if (edgeDensity > 0.5 && colorVariance > 0.5) return 'urban';
    if (avgLuma > 180 && edgeDensity < 0.3 && colorVariance < 0.3) return 'studio';
    if (avgLuma < 80) return 'indoor';
    return 'unknown';
}

/**
 * Infer time of day from colour temperature and brightness.
 */
export function inferTimeOfDay(features: {
    avgLuma: number;
    colorTempK: number;
    warmthRatio: number;       // fraction of frame in warm tones (red/orange/yellow)
}): TimeOfDayTag {
    const { avgLuma, colorTempK, warmthRatio } = features;
    const brightness = avgLuma / 255;

    if (brightness < 0.15) return 'night';
    if (brightness < 0.3 && colorTempK > 5500) return 'blue-hour';
    if (warmthRatio > 0.4 && colorTempK < 4000 && brightness > 0.3 && brightness < 0.7) return 'golden-hour';
    if (warmthRatio > 0.3 && brightness < 0.4) return 'dusk';
    if (colorTempK < 3500 && brightness > 0.5) return 'artificial-light';
    if (brightness > 0.5) return 'day';
    return 'unknown';
}

/**
 * Infer pace from motion magnitude.
 */
export function inferPace(motionMagnitude: number): PaceTag {
    if (motionMagnitude < 0.03) return 'still';
    if (motionMagnitude < 0.15) return 'slow';
    if (motionMagnitude < 0.35) return 'moderate';
    if (motionMagnitude < 0.6) return 'fast';
    return 'frenetic';
}

/**
 * Detect content flags from features.
 */
export function inferContentFlags(features: {
    faceCount: number;
    hasText: boolean;
    hasSpeech: boolean;
    hasMusic: boolean;
    hasSilence: boolean;
    motionMagnitude: number;
    avgLuma: number;
    avgSaturation: number;
    contrastRatio: number;     // max luma / min luma (1+)
}): ContentFlag[] {
    const flags: ContentFlag[] = [];
    if (features.faceCount > 0) flags.push('has-faces');
    if (features.hasText) flags.push('has-text');
    if (features.hasSpeech) flags.push('has-speech');
    if (features.hasMusic) flags.push('has-music');
    if (features.hasSilence) flags.push('has-silence');
    if (features.motionMagnitude > 0.1) flags.push('has-motion');
    if (features.contrastRatio > 3) flags.push('high-contrast');
    if (features.avgLuma < 60) flags.push('low-light');
    if (features.avgSaturation > 150) flags.push('colorful');
    if (features.avgSaturation < 30) flags.push('monochrome');
    return flags;
}

/**
 * Approximate colour temperature in Kelvin from frame colour analysis.
 * Uses the blue/red channel ratio as a proxy.
 */
export function estimateColorTemperature(
    avgRed: number,   // 0-255
    avgGreen: number, // 0-255
    avgBlue: number,  // 0-255
): number {
    // Simple linear model: high blue = cool (high K), high red = warm (low K)
    const blueRatio = avgBlue / (avgRed + avgGreen + avgBlue + 1);
    const redRatio = avgRed / (avgRed + avgGreen + avgBlue + 1);

    // Map to approximate Kelvin range (2000-10000)
    const warmCool = blueRatio - redRatio; // negative = warm, positive = cool
    return Math.round(5500 + warmCool * 8000);
}

// ── Mood-to-Segment Mapping ──────────────────────────────────────────────────

/**
 * Map song segment types to preferred clip moods.
 * Used by the generator to pick mood-appropriate clips for each section.
 */
export const SEGMENT_MOOD_MAP: Record<string, MoodTag[]> = {
    intro: ['calm', 'mysterious', 'neutral'],
    verse: ['calm', 'melancholic', 'neutral', 'romantic'],
    buildup: ['tense', 'energetic', 'mysterious'],
    drop: ['energetic', 'epic', 'dark'],
    chorus: ['happy', 'energetic', 'playful', 'epic'],
    breakdown: ['calm', 'melancholic', 'sad', 'romantic'],
    bridge: ['mysterious', 'tense', 'romantic'],
    outro: ['calm', 'melancholic', 'happy'],
};

/**
 * Score how well a clip's mood matches a target segment.
 * Returns 0-1 where 1 = perfect match.
 */
export function moodSegmentScore(clipMood: MoodTag, segmentType: string): number {
    const preferred = SEGMENT_MOOD_MAP[segmentType] || ['neutral'];
    const idx = preferred.indexOf(clipMood);
    if (idx === -1) return 0.2; // Not a preferred mood, but not zero
    // Earlier in the array = better match
    return 1.0 - (idx * 0.15);
}
