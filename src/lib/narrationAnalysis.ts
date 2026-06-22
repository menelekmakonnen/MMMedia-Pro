/**
 * Narration Intelligence — Speech-focused audio analysis engine.
 * ════════════════════════════════════════════════════════════════════════════
 * Parallel to Beat Intelligence (music analysis), this engine analyzes
 * voiceover/narration audio to detect speech regions, phrase boundaries,
 * emphasis points, pacing profiles, and optimal cut points.
 *
 * Can be used standalone (narration-only edits) or merged with Beat
 * Intelligence for projects with both music and voiceover.
 */

import { v4 as uuidv4 } from 'uuid';

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface SpeechRegion {
    start: number;        // seconds
    end: number;
    avgEnergy: number;    // 0-1 normalized
    peakEnergy: number;   // 0-1
}

export interface SilenceRegion {
    start: number;
    end: number;
    duration: number;     // seconds
}

export interface NarrationPhrase {
    id: string;
    text: string;         // from transcript, or '' if no transcript
    start: number;        // seconds
    end: number;
    keywords: string[];   // extracted key terms
    emphasis: 'normal' | 'strong' | 'whisper';
}

export interface NarrationParagraph {
    id: string;
    phrases: NarrationPhrase[];
    startTime: number;
    endTime: number;
    topic: string;         // first keyword or 'Section N'
}

export type NarrationSectionType = 'intro' | 'argument' | 'example' | 'transition' | 'climax' | 'conclusion';

export interface NarrationSection {
    type: NarrationSectionType;
    start: number;
    end: number;
    confidence: number;    // 0-1
}

export interface PacingPoint {
    time: number;         // seconds
    wpm: number;          // words per minute
    density: 'dense' | 'moderate' | 'sparse';
}

export interface EmphasisPoint {
    time: number;          // seconds
    intensity: number;     // 0-1
    type: 'volume-peak' | 'pause-before' | 'pace-change';
}

export interface NarrationAnalysisResult {
    duration: number;
    speechRegions: SpeechRegion[];
    silenceRegions: SilenceRegion[];
    phrases: NarrationPhrase[];
    paragraphs: NarrationParagraph[];
    cutPoints: number[];          // optimal cut timestamps
    pacingProfile: PacingPoint[];
    emphasisPoints: EmphasisPoint[];
    averageWPM: number;
    keywords: string[];
    sections: NarrationSection[];
    waveformData: number[];       // ~2000 points
}

// ═══════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════

const VAD_WINDOW_MS = 30;          // RMS energy window for VAD
const VAD_HOP_MS = 10;            // Hop size for VAD frames
const MIN_SPEECH_DURATION_S = 0.1; // Minimum speech region duration (100ms)
const MERGE_GAP_S = 0.3;          // Merge speech regions closer than 300ms
const DEFAULT_VAD_THRESHOLD = 0.01;
const PARAGRAPH_PAUSE_S = 1.5;    // Pause > 1.5s = paragraph break
const MIN_CUT_INTERVAL_S = 1.5;   // Minimum interval between cut points
const PACING_WINDOW_S = 5;        // Sliding window for WPM calculation
const WAVEFORM_POINTS = 2000;

// ─── Stop words set (mirrors videoEssayGenerator) ────────────────────────────

const STOP_WORDS = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'shall', 'would',
    'could', 'should', 'may', 'might', 'must', 'can', 'to', 'of', 'in',
    'for', 'on', 'with', 'at', 'by', 'from', 'up', 'about', 'into',
    'through', 'during', 'before', 'after', 'above', 'below', 'between',
    'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once',
    'here', 'there', 'when', 'where', 'why', 'how', 'all', 'both', 'each',
    'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only',
    'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but',
    'or', 'nor', 'yet', 'also', 'it', 'its', 'this', 'that', 'these',
    'those', 'he', 'she', 'they', 'we', 'you', 'i', 'me', 'my', 'his',
    'her', 'their', 'our', 'your',
]);

// ═══════════════════════════════════════════════════════
//  SAFE ARRAY HELPERS (no spread → no stack-overflow)
// ═══════════════════════════════════════════════════════

function arrayMax(arr: ArrayLike<number>, floor = -Infinity): number {
    let m = floor;
    for (let i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i];
    return m;
}

function arraySum(arr: ArrayLike<number>): number {
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += arr[i];
    return s;
}

function arrayMean(arr: ArrayLike<number>): number {
    return arr.length ? arraySum(arr) / arr.length : 0;
}

// ═══════════════════════════════════════════════════════
//  KEYWORD EXTRACTION
// ═══════════════════════════════════════════════════════

/**
 * Extract key terms from text via stop-word removal.
 * Mirrors the pattern from videoEssayGenerator.extractKeywords().
 */
export function extractKeywords(text: string): string[] {
    const words = text
        .toLowerCase()
        .replace(/[^a-z0-9\s'-]/g, '')
        .split(/\s+/)
        .map(w => w.replace(/^['-]+|['-]+$/g, ''))
        .filter(w => w.length > 3 && !STOP_WORDS.has(w));

    return Array.from(new Set(words));
}

// ═══════════════════════════════════════════════════════
//  SPEECH / SILENCE DETECTION
// ═══════════════════════════════════════════════════════

/**
 * Detect speech regions using energy-based Voice Activity Detection (VAD).
 *
 * 1. Compute RMS energy in 30ms windows with 10ms hop
 * 2. Mark frames exceeding the threshold
 * 3. Require at least 100ms of continuous speech
 * 4. Merge regions closer than 300ms apart
 * 5. Compute avg and peak energy per region
 */
export function detectSpeechRegions(
    mono: Float32Array,
    sampleRate: number,
    threshold: number = DEFAULT_VAD_THRESHOLD,
): SpeechRegion[] {
    const windowSamples = Math.round((VAD_WINDOW_MS / 1000) * sampleRate);
    const hopSamples = Math.round((VAD_HOP_MS / 1000) * sampleRate);
    const totalSamples = mono.length;

    // Step 1: Compute per-frame RMS energy
    const frameCount = Math.floor((totalSamples - windowSamples) / hopSamples) + 1;
    const energies = new Float32Array(Math.max(0, frameCount));

    for (let f = 0; f < frameCount; f++) {
        const offset = f * hopSamples;
        let sum = 0;
        for (let s = 0; s < windowSamples && (offset + s) < totalSamples; s++) {
            const v = mono[offset + s];
            sum += v * v;
        }
        energies[f] = Math.sqrt(sum / windowSamples);
    }

    // Step 2: Mark active frames
    const active = new Uint8Array(frameCount);
    for (let f = 0; f < frameCount; f++) {
        active[f] = energies[f] > threshold ? 1 : 0;
    }

    // Step 3: Find contiguous active runs → raw regions
    const hopDuration = VAD_HOP_MS / 1000;
    const minFrames = Math.ceil(MIN_SPEECH_DURATION_S / hopDuration);
    const rawRegions: Array<{ startFrame: number; endFrame: number }> = [];

    let runStart = -1;
    for (let f = 0; f <= frameCount; f++) {
        if (f < frameCount && active[f]) {
            if (runStart < 0) runStart = f;
        } else {
            if (runStart >= 0) {
                const runLen = f - runStart;
                if (runLen >= minFrames) {
                    rawRegions.push({ startFrame: runStart, endFrame: f - 1 });
                }
                runStart = -1;
            }
        }
    }

    // Step 4: Merge regions closer than MERGE_GAP_S
    const mergeFrames = Math.ceil(MERGE_GAP_S / hopDuration);
    const merged: Array<{ startFrame: number; endFrame: number }> = [];
    for (const r of rawRegions) {
        if (merged.length > 0 && (r.startFrame - merged[merged.length - 1].endFrame) <= mergeFrames) {
            merged[merged.length - 1].endFrame = r.endFrame;
        } else {
            merged.push({ ...r });
        }
    }

    // Step 5: Build SpeechRegion with energy stats
    return merged.map(r => {
        const startTime = r.startFrame * hopDuration;
        const endTime = (r.endFrame + 1) * hopDuration;
        let sumE = 0;
        let peakE = 0;
        let count = 0;
        for (let f = r.startFrame; f <= r.endFrame; f++) {
            sumE += energies[f];
            if (energies[f] > peakE) peakE = energies[f];
            count++;
        }
        const avgE = count > 0 ? sumE / count : 0;
        // Normalize to 0-1 by global max energy
        const globalMax = arrayMax(energies, 0.001);
        return {
            start: startTime,
            end: Math.min(endTime, totalSamples / sampleRate),
            avgEnergy: avgE / globalMax,
            peakEnergy: peakE / globalMax,
        };
    });
}

/**
 * Detect silence regions — gaps between speech regions.
 */
export function detectSilenceRegions(
    speechRegions: SpeechRegion[],
    totalDuration: number,
): SilenceRegion[] {
    const silences: SilenceRegion[] = [];

    if (speechRegions.length === 0) {
        if (totalDuration > 0) {
            silences.push({ start: 0, end: totalDuration, duration: totalDuration });
        }
        return silences;
    }

    // Gap before first speech
    if (speechRegions[0].start > 0.01) {
        const dur = speechRegions[0].start;
        silences.push({ start: 0, end: dur, duration: dur });
    }

    // Gaps between speech regions
    for (let i = 1; i < speechRegions.length; i++) {
        const gapStart = speechRegions[i - 1].end;
        const gapEnd = speechRegions[i].start;
        if (gapEnd > gapStart + 0.01) {
            silences.push({ start: gapStart, end: gapEnd, duration: gapEnd - gapStart });
        }
    }

    // Gap after last speech
    const lastEnd = speechRegions[speechRegions.length - 1].end;
    if (totalDuration - lastEnd > 0.01) {
        silences.push({ start: lastEnd, end: totalDuration, duration: totalDuration - lastEnd });
    }

    return silences;
}

// ═══════════════════════════════════════════════════════
//  PHRASE COMPUTATION
// ═══════════════════════════════════════════════════════

/**
 * Compute narration phrases from speech regions and optional transcript.
 *
 * - If transcript provided: split on sentence boundaries (. ? ! ; :),
 *   align proportionally to speech regions.
 * - If no transcript: each speech region = one phrase with empty text.
 * - Classify emphasis by energy relative to average.
 * - Extract keywords via stop-word removal.
 */
export function computeNarrationPhrases(
    speechRegions: SpeechRegion[],
    transcript?: string,
): NarrationPhrase[] {
    if (speechRegions.length === 0) return [];

    const avgEnergy = arrayMean(speechRegions.map(r => r.avgEnergy));

    if (transcript && transcript.trim().length > 0) {
        // Split transcript on sentence boundaries
        const sentences = transcript
            .split(/(?<=[.?!;:])\s+/)
            .map(s => s.trim())
            .filter(s => s.length > 0);

        if (sentences.length === 0) {
            return speechRegionsToPhrase(speechRegions, avgEnergy);
        }

        // Compute total speech duration for proportional alignment
        const totalSpeechDuration = speechRegions.reduce((sum, r) => sum + (r.end - r.start), 0);
        const totalTextLen = sentences.reduce((sum, s) => sum + s.length, 0);

        // Build a flat timeline of speech (merging all regions into continuous time)
        const speechTimeline: Array<{ start: number; end: number; energy: number }> = [];
        for (const r of speechRegions) {
            speechTimeline.push({ start: r.start, end: r.end, energy: r.avgEnergy });
        }

        const phrases: NarrationPhrase[] = [];
        let timeOffset = 0; // accumulated duration

        for (const sentence of sentences) {
            const fraction = sentence.length / totalTextLen;
            const duration = fraction * totalSpeechDuration;

            // Find the absolute start/end by walking through speech timeline
            const absStart = findAbsoluteTime(speechTimeline, timeOffset);
            const absEnd = findAbsoluteTime(speechTimeline, timeOffset + duration);

            // Find the average energy for this time range
            const regionEnergy = getEnergyForRange(speechRegions, absStart, absEnd);
            const emphasis = classifyEmphasis(regionEnergy, avgEnergy);

            phrases.push({
                id: uuidv4(),
                text: sentence,
                start: absStart,
                end: absEnd,
                keywords: extractKeywords(sentence),
                emphasis,
            });

            timeOffset += duration;
        }

        return phrases;
    }

    // No transcript: each speech region is a phrase
    return speechRegionsToPhrase(speechRegions, avgEnergy);
}

/** Convert speech regions to phrases (no transcript mode). */
function speechRegionsToPhrase(regions: SpeechRegion[], avgEnergy: number): NarrationPhrase[] {
    return regions.map(r => ({
        id: uuidv4(),
        text: '',
        start: r.start,
        end: r.end,
        keywords: [],
        emphasis: classifyEmphasis(r.avgEnergy, avgEnergy),
    }));
}

/** Map accumulated speech-time offset to absolute timeline position. */
function findAbsoluteTime(
    timeline: Array<{ start: number; end: number }>,
    offsetDuration: number,
): number {
    let remaining = offsetDuration;
    for (const seg of timeline) {
        const segDur = seg.end - seg.start;
        if (remaining <= segDur) {
            return seg.start + remaining;
        }
        remaining -= segDur;
    }
    // Past the end — return last segment end
    return timeline.length > 0 ? timeline[timeline.length - 1].end : 0;
}

/** Get average energy for a time range across speech regions. */
function getEnergyForRange(regions: SpeechRegion[], start: number, end: number): number {
    let totalE = 0;
    let count = 0;
    for (const r of regions) {
        const overlap = Math.min(r.end, end) - Math.max(r.start, start);
        if (overlap > 0) {
            totalE += r.avgEnergy * overlap;
            count += overlap;
        }
    }
    return count > 0 ? totalE / count : 0;
}

/** Classify emphasis based on energy relative to average. */
function classifyEmphasis(
    energy: number,
    avgEnergy: number,
): 'normal' | 'strong' | 'whisper' {
    if (avgEnergy <= 0) return 'normal';
    if (energy > avgEnergy * 1.5) return 'strong';
    if (energy < avgEnergy * 0.5) return 'whisper';
    return 'normal';
}

// ═══════════════════════════════════════════════════════
//  PARAGRAPH GROUPING
// ═══════════════════════════════════════════════════════

/**
 * Group phrases into paragraphs.
 * A pause > PARAGRAPH_PAUSE_S between consecutive phrases creates a paragraph break.
 */
function groupIntoParagraphs(phrases: NarrationPhrase[]): NarrationParagraph[] {
    if (phrases.length === 0) return [];

    const paragraphs: NarrationParagraph[] = [];
    let currentPhrases: NarrationPhrase[] = [phrases[0]];

    for (let i = 1; i < phrases.length; i++) {
        const gap = phrases[i].start - phrases[i - 1].end;
        if (gap > PARAGRAPH_PAUSE_S) {
            paragraphs.push(buildParagraph(currentPhrases, paragraphs.length + 1));
            currentPhrases = [phrases[i]];
        } else {
            currentPhrases.push(phrases[i]);
        }
    }

    // Final paragraph
    if (currentPhrases.length > 0) {
        paragraphs.push(buildParagraph(currentPhrases, paragraphs.length + 1));
    }

    return paragraphs;
}

/** Build a NarrationParagraph from a group of phrases. */
function buildParagraph(phrases: NarrationPhrase[], index: number): NarrationParagraph {
    const allKeywords = phrases.flatMap(p => p.keywords);
    return {
        id: uuidv4(),
        phrases,
        startTime: phrases[0].start,
        endTime: phrases[phrases.length - 1].end,
        topic: allKeywords.length > 0 ? allKeywords[0] : `Section ${index}`,
    };
}

// ═══════════════════════════════════════════════════════
//  CUT POINTS
// ═══════════════════════════════════════════════════════

/**
 * Compute optimal cut points at phrase boundaries.
 * Prefers paragraph boundaries (longer pauses) and enforces a minimum interval.
 */
export function computeNarrationCutPoints(
    phrases: NarrationPhrase[],
    options?: { minInterval?: number },
): number[] {
    if (phrases.length === 0) return [];

    const minInterval = options?.minInterval ?? MIN_CUT_INTERVAL_S;

    // Collect all phrase-end times as candidate cut points
    const candidates = phrases.map(p => p.end);

    // Also identify paragraph boundaries (gaps > PARAGRAPH_PAUSE_S)
    const paragraphBoundaries = new Set<number>();
    for (let i = 1; i < phrases.length; i++) {
        const gap = phrases[i].start - phrases[i - 1].end;
        if (gap > PARAGRAPH_PAUSE_S) {
            paragraphBoundaries.add(phrases[i - 1].end);
        }
    }

    // Filter: remove cuts too close together, preferring paragraph boundaries
    const cuts: number[] = [];
    let lastCut = -Infinity;

    for (const t of candidates) {
        const timeSinceLast = t - lastCut;
        const isParagraphBoundary = paragraphBoundaries.has(t);

        if (timeSinceLast >= minInterval || isParagraphBoundary) {
            cuts.push(t);
            lastCut = t;
        }
    }

    return cuts;
}

// ═══════════════════════════════════════════════════════
//  SECTION CLASSIFICATION
// ═══════════════════════════════════════════════════════

/**
 * Classify narration sections by position and energy.
 *
 * - First 15% = intro
 * - Last 10% = conclusion
 * - Highest energy paragraph = climax
 * - Short paragraphs between longer ones = transition
 * - Others alternate between argument and example
 */
export function classifyNarrationSections(
    paragraphs: NarrationParagraph[],
    totalDuration: number,
): NarrationSection[] {
    if (paragraphs.length === 0) return [];

    const introEnd = totalDuration * 0.15;
    const conclusionStart = totalDuration * 0.90;

    // Pre-compute paragraph energies (average of phrase emphasis levels)
    const paraEnergies = paragraphs.map(p => {
        const emphasisValues = p.phrases.map(ph => {
            if (ph.emphasis === 'strong') return 1.0;
            if (ph.emphasis === 'whisper') return 0.2;
            return 0.6;
        });
        return arrayMean(emphasisValues);
    });

    // Find climax paragraph (highest energy, excluding intro/conclusion zones)
    let climaxIdx = -1;
    let climaxEnergy = -1;
    for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        if (p.startTime >= introEnd && p.endTime <= conclusionStart) {
            if (paraEnergies[i] > climaxEnergy) {
                climaxEnergy = paraEnergies[i];
                climaxIdx = i;
            }
        }
    }

    // Compute average paragraph duration for transition detection
    const paraDurations = paragraphs.map(p => p.endTime - p.startTime);
    const avgDuration = arrayMean(paraDurations);

    const sections: NarrationSection[] = [];
    let alternateFlag = false;

    for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        let type: NarrationSectionType;
        let confidence: number;

        if (p.endTime <= introEnd || (i === 0 && paragraphs.length > 1)) {
            type = 'intro';
            confidence = p.endTime <= introEnd ? 0.9 : 0.7;
        } else if (p.startTime >= conclusionStart || (i === paragraphs.length - 1 && paragraphs.length > 1)) {
            type = 'conclusion';
            confidence = p.startTime >= conclusionStart ? 0.9 : 0.7;
        } else if (i === climaxIdx) {
            type = 'climax';
            confidence = 0.8;
        } else if (
            paraDurations[i] < avgDuration * 0.5 &&
            i > 0 && i < paragraphs.length - 1 &&
            paraDurations[i - 1] > paraDurations[i] &&
            paraDurations[i + 1] > paraDurations[i]
        ) {
            type = 'transition';
            confidence = 0.7;
        } else {
            type = alternateFlag ? 'example' : 'argument';
            alternateFlag = !alternateFlag;
            confidence = 0.5;
        }

        sections.push({
            type,
            start: p.startTime,
            end: p.endTime,
            confidence,
        });
    }

    return sections;
}

// ═══════════════════════════════════════════════════════
//  EMPHASIS DETECTION
// ═══════════════════════════════════════════════════════

/**
 * Detect emphasis points within speech regions:
 * - Volume peaks: RMS > 2x local average
 * - Pause-before: silence followed by speech onset (dramatic pause)
 * - Pace changes: shifts in speech density
 */
export function detectEmphasis(
    mono: Float32Array,
    sampleRate: number,
    speechRegions: SpeechRegion[],
): EmphasisPoint[] {
    const points: EmphasisPoint[] = [];
    const windowSamples = Math.round((VAD_WINDOW_MS / 1000) * sampleRate);
    const hopSamples = Math.round((VAD_HOP_MS / 1000) * sampleRate);
    const hopDuration = VAD_HOP_MS / 1000;

    // --- Volume peaks within speech ---
    for (const region of speechRegions) {
        const startSample = Math.floor(region.start * sampleRate);
        const endSample = Math.min(Math.floor(region.end * sampleRate), mono.length);
        const regionSamples = endSample - startSample;
        if (regionSamples < windowSamples) continue;

        // Compute frame energies within this region
        const frameCount = Math.floor((regionSamples - windowSamples) / hopSamples) + 1;
        const energies: number[] = [];
        const times: number[] = [];

        for (let f = 0; f < frameCount; f++) {
            const offset = startSample + f * hopSamples;
            let sum = 0;
            for (let s = 0; s < windowSamples && (offset + s) < mono.length; s++) {
                const v = mono[offset + s];
                sum += v * v;
            }
            energies.push(Math.sqrt(sum / windowSamples));
            times.push(region.start + f * hopDuration);
        }

        const localAvg = arrayMean(energies);
        const localMax = arrayMax(energies, 0.001);

        // Find peaks > 2x local average
        for (let f = 1; f < energies.length - 1; f++) {
            if (
                energies[f] > localAvg * 2 &&
                energies[f] > energies[f - 1] &&
                energies[f] > energies[f + 1]
            ) {
                points.push({
                    time: times[f],
                    intensity: energies[f] / localMax,
                    type: 'volume-peak',
                });
            }
        }
    }

    // --- Pause-before emphasis (dramatic pauses) ---
    for (let i = 1; i < speechRegions.length; i++) {
        const gap = speechRegions[i].start - speechRegions[i - 1].end;
        // A pause of 0.3-2s before speech = dramatic emphasis
        if (gap >= 0.3 && gap <= 2.0) {
            points.push({
                time: speechRegions[i].start,
                intensity: Math.min(1.0, gap / 1.5), // longer pause = more intensity
                type: 'pause-before',
            });
        }
    }

    // --- Pace change emphasis ---
    if (speechRegions.length >= 3) {
        for (let i = 1; i < speechRegions.length - 1; i++) {
            const prevDur = speechRegions[i - 1].end - speechRegions[i - 1].start;
            const currDur = speechRegions[i].end - speechRegions[i].start;
            const nextDur = speechRegions[i + 1].end - speechRegions[i + 1].start;
            const avgSurrounding = (prevDur + nextDur) / 2;

            // Significant pace change: current region duration differs > 50% from neighbors
            if (avgSurrounding > 0 && Math.abs(currDur - avgSurrounding) / avgSurrounding > 0.5) {
                points.push({
                    time: speechRegions[i].start,
                    intensity: Math.min(1.0, Math.abs(currDur - avgSurrounding) / avgSurrounding),
                    type: 'pace-change',
                });
            }
        }
    }

    // Sort by time
    points.sort((a, b) => a.time - b.time);
    return points;
}

// ═══════════════════════════════════════════════════════
//  PACING PROFILE
// ═══════════════════════════════════════════════════════

/**
 * Compute the pacing profile over time.
 *
 * - If transcript: count words per sliding window
 * - If no transcript: estimate WPM from speech density
 */
export function computePacingProfile(
    speechRegions: SpeechRegion[],
    transcript?: string,
    windowSec: number = PACING_WINDOW_S,
): PacingPoint[] {
    if (speechRegions.length === 0) return [];

    const totalEnd = speechRegions[speechRegions.length - 1].end;
    const points: PacingPoint[] = [];

    if (transcript && transcript.trim().length > 0) {
        // Word-based pacing: distribute words proportionally across speech regions
        const words = transcript.trim().split(/\s+/);
        const totalSpeechDuration = speechRegions.reduce((s, r) => s + (r.end - r.start), 0);
        const overallWPM = totalSpeechDuration > 0 ? (words.length / totalSpeechDuration) * 60 : 0;

        // Sample at 1-second intervals
        for (let t = 0; t < totalEnd; t += 1.0) {
            const winStart = t;
            const winEnd = Math.min(t + windowSec, totalEnd);

            // Count speech time in this window
            let speechInWindow = 0;
            for (const r of speechRegions) {
                const overlap = Math.min(r.end, winEnd) - Math.max(r.start, winStart);
                if (overlap > 0) speechInWindow += overlap;
            }

            // Estimate WPM from speech density in window
            const windowDuration = winEnd - winStart;
            const density = windowDuration > 0 ? speechInWindow / windowDuration : 0;
            const wpm = Math.round(overallWPM * density);

            points.push({
                time: t,
                wpm,
                density: classifyDensity(wpm),
            });
        }
    } else {
        // No transcript: estimate from speech frame density
        // Assume average speaking rate of 150 WPM when speech is present
        const ASSUMED_WPM = 150;

        for (let t = 0; t < totalEnd; t += 1.0) {
            const winStart = t;
            const winEnd = Math.min(t + windowSec, totalEnd);

            let speechInWindow = 0;
            for (const r of speechRegions) {
                const overlap = Math.min(r.end, winEnd) - Math.max(r.start, winStart);
                if (overlap > 0) speechInWindow += overlap;
            }

            const windowDuration = winEnd - winStart;
            const density = windowDuration > 0 ? speechInWindow / windowDuration : 0;
            const wpm = Math.round(ASSUMED_WPM * density);

            points.push({
                time: t,
                wpm,
                density: classifyDensity(wpm),
            });
        }
    }

    return points;
}

/** Classify WPM into density category. */
function classifyDensity(wpm: number): 'dense' | 'moderate' | 'sparse' {
    if (wpm > 180) return 'dense';
    if (wpm >= 120) return 'moderate';
    return 'sparse';
}

// ═══════════════════════════════════════════════════════
//  WAVEFORM DOWNSAMPLING
// ═══════════════════════════════════════════════════════

/**
 * Peak-based downsampling of mono waveform to targetPoints.
 * For each bucket, keep the sample with the largest absolute value.
 */
export function downsampleWaveform(mono: Float32Array, targetPoints: number = WAVEFORM_POINTS): number[] {
    if (mono.length === 0) return [];
    if (mono.length <= targetPoints) {
        return Array.from(mono);
    }

    const bucketSize = mono.length / targetPoints;
    const result: number[] = new Array(targetPoints);

    for (let i = 0; i < targetPoints; i++) {
        const bucketStart = Math.floor(i * bucketSize);
        const bucketEnd = Math.min(Math.floor((i + 1) * bucketSize), mono.length);
        let peak = 0;
        for (let s = bucketStart; s < bucketEnd; s++) {
            const abs = Math.abs(mono[s]);
            if (abs > Math.abs(peak)) {
                peak = mono[s];
            }
        }
        result[i] = peak;
    }

    return result;
}

// ═══════════════════════════════════════════════════════
//  MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════

/**
 * Analyze narration audio — main entry point.
 *
 * Pipeline:
 * 1. Get mono channel data (average stereo channels)
 * 2. Detect speech regions via energy-based VAD
 * 3. Detect silence regions (inverse of speech)
 * 4. Split into phrases (aligned to transcript if provided)
 * 5. Group phrases into paragraphs (pause > 1.5s = break)
 * 6. Compute emphasis points from energy peaks
 * 7. Compute pacing profile (WPM sliding window)
 * 8. Classify sections by position and energy
 * 9. Generate cut points at phrase boundaries
 * 10. Downsample waveform to ~2000 points
 */
export async function analyzeNarration(
    audioBuffer: AudioBuffer,
    transcript?: string,
): Promise<NarrationAnalysisResult> {
    const sampleRate = audioBuffer.sampleRate;
    const duration = audioBuffer.duration;
    const numChannels = audioBuffer.numberOfChannels;

    // Step 1: Get mono channel data
    let mono: Float32Array;
    if (numChannels === 1) {
        mono = audioBuffer.getChannelData(0);
    } else {
        // Average all channels to mono
        const length = audioBuffer.length;
        mono = new Float32Array(length);
        for (let ch = 0; ch < numChannels; ch++) {
            const channelData = audioBuffer.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                mono[i] += channelData[i];
            }
        }
        const scale = 1 / numChannels;
        for (let i = 0; i < length; i++) {
            mono[i] *= scale;
        }
    }

    // Step 2: Detect speech regions
    const speechRegions = detectSpeechRegions(mono, sampleRate);

    // Step 3: Detect silence regions
    const silenceRegions = detectSilenceRegions(speechRegions, duration);

    // Step 4: Compute phrases
    const phrases = computeNarrationPhrases(speechRegions, transcript);

    // Step 5: Group into paragraphs
    const paragraphs = groupIntoParagraphs(phrases);

    // Step 6: Detect emphasis
    const emphasisPoints = detectEmphasis(mono, sampleRate, speechRegions);

    // Step 7: Compute pacing profile
    const pacingProfile = computePacingProfile(speechRegions, transcript);

    // Step 8: Classify sections
    const sections = classifyNarrationSections(paragraphs, duration);

    // Step 9: Compute cut points
    const cutPoints = computeNarrationCutPoints(phrases);

    // Step 10: Downsample waveform
    const waveformData = downsampleWaveform(mono);

    // Compute aggregate stats
    const allKeywords = phrases.flatMap(p => p.keywords);
    const uniqueKeywords = Array.from(new Set(allKeywords));

    const totalSpeechDuration = speechRegions.reduce((s, r) => s + (r.end - r.start), 0);
    let averageWPM = 0;
    if (transcript && transcript.trim().length > 0) {
        const wordCount = transcript.trim().split(/\s+/).length;
        averageWPM = totalSpeechDuration > 0
            ? Math.round((wordCount / totalSpeechDuration) * 60)
            : 0;
    } else if (pacingProfile.length > 0) {
        averageWPM = Math.round(arrayMean(pacingProfile.map(p => p.wpm)));
    }

    return {
        duration,
        speechRegions,
        silenceRegions,
        phrases,
        paragraphs,
        cutPoints,
        pacingProfile,
        emphasisPoints,
        averageWPM,
        keywords: uniqueKeywords,
        sections,
        waveformData,
    };
}
