/**
 * styleDNA.ts — Style fingerprint extraction and transfer system.
 *
 * Analyses a reference video (or user edit) and extracts its "Style DNA" —
 * a quantitative fingerprint of its editing patterns: cut frequency,
 * transition distribution, speed curves, colour palette, energy arc,
 * and effect usage.
 *
 * This fingerprint can then be applied to new footage to recreate the
 * same feel/style. "Make my clips look/feel like this reference video."
 *
 * Deeply connected to: trailerGenerator.ts (settings generation),
 *                       socialMediaRecipes.ts (recipe creation from DNA),
 *                       smartEngine.ts (reference video analysis),
 *                       clipIntelligence.ts (colour/energy features)
 */

import type { TransitionType, SpeedCurvePreset, EffectApplyPolicy } from '../types';
import type { TrailerSettings } from './trailerGenerator';

// ── Style DNA Types ──────────────────────────────────────────────────────────

export interface StyleDNA {
    /** Human-readable name for this style (user-defined or auto-generated) */
    name: string;
    /** When this DNA was extracted */
    createdAt: string;
    /** Source reference (path or URL) */
    source?: string;

    // ── Pacing ──
    /** Average clip duration in seconds */
    avgClipDuration: number;
    /** Standard deviation of clip durations */
    clipDurationStdDev: number;
    /** Minimum clip duration observed */
    minClipDuration: number;
    /** Maximum clip duration observed */
    maxClipDuration: number;
    /** Cuts per minute */
    cutsPerMinute: number;

    // ── Transitions ──
    /** Distribution of transition types (normalised weights, sum=1) */
    transitionDistribution: Partial<Record<TransitionType, number>>;
    /** Average transition duration in ms */
    avgTransitionDurationMs: number;
    /** Ratio of cuts vs. transitions (0=all transitions, 1=all cuts) */
    cutToTransitionRatio: number;

    // ── Speed ──
    /** Average playback speed */
    avgSpeed: number;
    /** Speed range [min, max] */
    speedRange: [number, number];
    /** How often speed changes occur (ramps per minute) */
    speedRampFrequency: number;
    /** Most common speed curve shape */
    dominantSpeedCurve: SpeedCurvePreset;

    // ── Colour ──
    /** Average colour temperature in Kelvin */
    avgColorTemperatureK: number;
    /** Average saturation (0-1) */
    avgSaturation: number;
    /** Average brightness/luma (0-1) */
    avgBrightness: number;
    /** Average contrast (0-1 normalised) */
    avgContrast: number;
    /** Dominant colour palette (hex values) */
    colorPalette: string[];

    // ── Energy ──
    /** Normalised energy arc over video duration (10-20 data points) */
    energyCurve: number[];
    /** Energy curve shape classification */
    energyShape: 'build-to-climax' | 'peak-first' | 'wave' | 'flat' | 'valley' | 'double-peak';
    /** Probability of a cut landing on a beat (0-1) */
    cutOnBeatProbability: number;

    // ── Effects ──
    /** Effect usage frequency (effect → 0-1 where 1=every clip) */
    effectUsage: Partial<Record<string, number>>;
    /** Text/caption frequency (overlays per minute) */
    textFrequency: number;
    /** Whether letterbox is used */
    usesLetterbox: boolean;
    /** Film grain amount (0-25) */
    grainAmount: number;
    /** Vignette amount (0-100) */
    vignetteAmount: number;

    // ── Composition ──
    /** Dominant shot type distribution */
    shotTypeDistribution: Record<string, number>;
    /** Camera movement distribution */
    cameraMovementDistribution: Record<string, number>;

    // ── Audio ──
    /** Whether the source has music */
    hasMusic: boolean;
    /** Whether the source has dialogue/narration */
    hasDialogue: boolean;
    /** Audio energy correlation with visual cuts (0-1) */
    audioVisualCorrelation: number;
}

// ── Style DNA from Scene Analysis ────────────────────────────────────────────

/**
 * Extract a Style DNA from scene-detection data and frame analysis.
 *
 * This takes FFmpeg scene detection output (timestamps of cuts) plus
 * per-frame analysis data and produces a style fingerprint.
 *
 * @param cutTimestamps   - Array of cut timestamps in seconds
 * @param totalDuration   - Total video duration in seconds
 * @param frameAnalysis   - Per-frame colour/motion data (sampled, not every frame)
 * @param name           - Human-readable name for the style
 */
export function extractStyleDNA(
    cutTimestamps: number[],
    totalDuration: number,
    frameAnalysis: FrameAnalysisData[],
    name: string = 'Extracted Style',
): StyleDNA {
    // ── Pacing analysis ──
    const clipDurations: number[] = [];
    for (let i = 0; i < cutTimestamps.length; i++) {
        const start = i === 0 ? 0 : cutTimestamps[i - 1];
        const end = cutTimestamps[i];
        clipDurations.push(end - start);
    }
    // Last clip to end
    if (cutTimestamps.length > 0) {
        clipDurations.push(totalDuration - cutTimestamps[cutTimestamps.length - 1]);
    } else {
        clipDurations.push(totalDuration);
    }

    const avgClipDuration = clipDurations.reduce((a, b) => a + b, 0) / clipDurations.length;
    const clipDurationStdDev = Math.sqrt(
        clipDurations.reduce((sum, d) => sum + (d - avgClipDuration) ** 2, 0) / clipDurations.length,
    );

    // ── Colour analysis ──
    const avgBrightness = frameAnalysis.length > 0
        ? frameAnalysis.reduce((s, f) => s + f.luma, 0) / frameAnalysis.length / 255
        : 0.5;
    const avgSaturation = frameAnalysis.length > 0
        ? frameAnalysis.reduce((s, f) => s + f.saturation, 0) / frameAnalysis.length / 255
        : 0.5;
    const avgColorTemperatureK = frameAnalysis.length > 0
        ? frameAnalysis.reduce((s, f) => s + f.colorTempK, 0) / frameAnalysis.length
        : 5500;

    // ── Energy curve (normalise to 10 points) ──
    const energyCurve: number[] = [];
    const bucketSize = Math.ceil(frameAnalysis.length / 10);
    for (let i = 0; i < 10; i++) {
        const bucket = frameAnalysis.slice(i * bucketSize, (i + 1) * bucketSize);
        const avgMotion = bucket.length > 0
            ? bucket.reduce((s, f) => s + f.motionMagnitude, 0) / bucket.length
            : 0;
        energyCurve.push(Math.round(avgMotion * 100) / 100);
    }

    // Classify energy shape
    const energyShape = classifyEnergyShape(energyCurve);

    // ── Dominant colours ──
    const colorPalette = extractDominantColors(frameAnalysis);

    // ── Speed analysis (from frame timing if available) ──
    const avgSpeed = 1.0; // Default — can be refined with actual speed data
    const speedRange: [number, number] = [0.8, 1.2]; // Conservative default

    return {
        name,
        createdAt: new Date().toISOString(),
        avgClipDuration,
        clipDurationStdDev,
        minClipDuration: Math.min(...clipDurations),
        maxClipDuration: Math.max(...clipDurations),
        cutsPerMinute: (cutTimestamps.length / totalDuration) * 60,
        transitionDistribution: { cut: 0.7, dissolve: 0.2, fade: 0.1 },
        avgTransitionDurationMs: 200,
        cutToTransitionRatio: 0.7,
        avgSpeed,
        speedRange,
        speedRampFrequency: 0,
        dominantSpeedCurve: 'constant',
        avgColorTemperatureK,
        avgSaturation,
        avgBrightness,
        avgContrast: 0.5,
        colorPalette,
        energyCurve,
        energyShape,
        cutOnBeatProbability: 0.5,
        effectUsage: {},
        textFrequency: 0,
        usesLetterbox: false,
        grainAmount: 0,
        vignetteAmount: 0,
        shotTypeDistribution: {},
        cameraMovementDistribution: {},
        hasMusic: true,
        hasDialogue: false,
        audioVisualCorrelation: 0.5,
    };
}

// ── Style DNA → TrailerSettings ──────────────────────────────────────────────

/**
 * Convert a Style DNA into TrailerSettings overrides that reproduce the style.
 */
export function styleDNAToSettings(dna: StyleDNA): Partial<TrailerSettings> {
    const settings: Partial<TrailerSettings> = {};

    // Pacing
    settings.shortestClip = Math.max(0.1, dna.minClipDuration);
    settings.longestClip = Math.min(10, dna.maxClipDuration);

    // Speed
    if (dna.speedRange[0] < 0.7 || dna.speedRange[1] > 1.3) {
        settings.customSpeedRangeEnabled = true;
        settings.customSpeedRange = dna.speedRange;
    }
    if (dna.speedRampFrequency > 2) {
        settings.speedCurvePreset = dna.dominantSpeedCurve;
        settings.speedCurveFrequency = Math.min(100, Math.round(dna.speedRampFrequency * 10));
    }

    // Transitions
    const topTransitions = Object.entries(dna.transitionDistribution)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([type]) => type as TransitionType);
    if (topTransitions.length > 0) {
        settings.transitionTypes = topTransitions;
    }
    settings.transitionDurationMs = dna.avgTransitionDurationMs;
    if (dna.cutToTransitionRatio > 0.8) {
        settings.transitionStyle = 'cuts-only';
    } else if (dna.cutToTransitionRatio < 0.3) {
        settings.transitionStyle = 'transitions-only';
    } else {
        settings.transitionStyle = 'mixed';
    }

    // Colour
    settings.autoColorGrade = true;

    // Visual FX
    if (dna.grainAmount > 0) settings.filmGrainAmount = dna.grainAmount;
    if (dna.vignetteAmount > 0) settings.vignetteAmount = dna.vignetteAmount;
    if (dna.usesLetterbox) settings.letterboxEnabled = true;

    // Energy
    if (dna.cutOnBeatProbability > 0.7) {
        settings.beatSyncStrategy = 'cut-on-beat';
        settings.enhancedBeatSync = true;
    }

    // Rhythm pattern based on energy shape
    switch (dna.energyShape) {
        case 'build-to-climax': settings.rhythmPattern = 'accelerando'; break;
        case 'peak-first': settings.rhythmPattern = 'ritardando'; break;
        case 'wave': settings.rhythmPattern = 'wave'; break;
        case 'double-peak': settings.rhythmPattern = 'climax-arc'; break;
        default: settings.rhythmPattern = 'breathing';
    }

    // Effect policies from usage frequency
    if ((dna.effectUsage.motionBlur ?? 0) > 0.3) {
        settings.motionBlurPolicy = frequencyToPolicy(dna.effectUsage.motionBlur!);
    }
    if ((dna.effectUsage.glow ?? 0) > 0.1) {
        settings.glowPolicy = frequencyToPolicy(dna.effectUsage.glow!);
    }
    if ((dna.effectUsage.rgbSplit ?? 0) > 0.1) {
        settings.rgbSplitPolicy = frequencyToPolicy(dna.effectUsage.rgbSplit!);
    }
    if ((dna.effectUsage.vhs ?? 0) > 0.1) {
        settings.vhsPolicy = frequencyToPolicy(dna.effectUsage.vhs!);
    }

    return settings;
}

/**
 * Compute similarity between two Style DNAs (0-1, where 1 = identical).
 */
export function styleSimilarity(a: StyleDNA, b: StyleDNA): number {
    let score = 0;
    let weights = 0;

    // Pacing similarity (weight: 3)
    const pacingDiff = Math.abs(a.cutsPerMinute - b.cutsPerMinute) / Math.max(a.cutsPerMinute, b.cutsPerMinute, 1);
    score += (1 - pacingDiff) * 3;
    weights += 3;

    // Colour similarity (weight: 2)
    const tempDiff = Math.abs(a.avgColorTemperatureK - b.avgColorTemperatureK) / 8000;
    const satDiff = Math.abs(a.avgSaturation - b.avgSaturation);
    const brightDiff = Math.abs(a.avgBrightness - b.avgBrightness);
    score += (1 - (tempDiff + satDiff + brightDiff) / 3) * 2;
    weights += 2;

    // Energy shape match (weight: 2)
    score += (a.energyShape === b.energyShape ? 1 : 0.3) * 2;
    weights += 2;

    // Speed similarity (weight: 1)
    const speedDiff = Math.abs(a.avgSpeed - b.avgSpeed) / Math.max(a.avgSpeed, b.avgSpeed, 1);
    score += (1 - speedDiff) * 1;
    weights += 1;

    return score / weights;
}

// ── Helper Types & Functions ─────────────────────────────────────────────────

export interface FrameAnalysisData {
    timestamp: number;
    luma: number;           // 0-255
    saturation: number;     // 0-255
    colorTempK: number;     // ~2000-10000
    motionMagnitude: number; // 0-1
    dominantColorHex: string;
}

function classifyEnergyShape(curve: number[]): StyleDNA['energyShape'] {
    if (curve.length < 3) return 'flat';

    const first = curve[0];
    const last = curve[curve.length - 1];
    const mid = curve[Math.floor(curve.length / 2)];
    const max = Math.max(...curve);
    const min = Math.min(...curve);
    const range = max - min;

    if (range < 0.1) return 'flat';
    if (first < mid && mid > last && max === mid) return 'build-to-climax';
    if (first > mid && first === max) return 'peak-first';
    if (first < mid && last < mid) return 'valley';

    // Check for double peak
    let peaks = 0;
    for (let i = 1; i < curve.length - 1; i++) {
        if (curve[i] > curve[i - 1] && curve[i] > curve[i + 1]) peaks++;
    }
    if (peaks >= 2) return 'double-peak';

    // Check for wave pattern (alternating ups and downs)
    let dirChanges = 0;
    for (let i = 2; i < curve.length; i++) {
        const prev = curve[i - 1] - curve[i - 2];
        const curr = curve[i] - curve[i - 1];
        if (prev * curr < 0) dirChanges++;
    }
    if (dirChanges >= 3) return 'wave';

    return 'build-to-climax'; // Default
}

function extractDominantColors(frames: FrameAnalysisData[]): string[] {
    if (frames.length === 0) return ['#808080'];
    const colorCounts: Record<string, number> = {};
    for (const f of frames) {
        // Quantise to reduce noise
        const q = quantiseHex(f.dominantColorHex);
        colorCounts[q] = (colorCounts[q] || 0) + 1;
    }
    return Object.entries(colorCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([hex]) => hex);
}

function quantiseHex(hex: string): string {
    // Quantise to 16-level steps per channel
    const match = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!match) return '#808080';
    const [, r, g, b] = match;
    const qr = (Math.round(parseInt(r, 16) / 16) * 16).toString(16).padStart(2, '0');
    const qg = (Math.round(parseInt(g, 16) / 16) * 16).toString(16).padStart(2, '0');
    const qb = (Math.round(parseInt(b, 16) / 16) * 16).toString(16).padStart(2, '0');
    return `#${qr}${qg}${qb}`;
}

function frequencyToPolicy(freq: number): EffectApplyPolicy {
    if (freq > 0.7) return 'every-clip';
    if (freq > 0.3) return 'per-beat';
    return 'sparingly';
}
