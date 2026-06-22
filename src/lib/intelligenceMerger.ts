/**
 * Intelligence Merger — Resolves cut points from dual intelligence engines.
 * ════════════════════════════════════════════════════════════════════════════
 * When both Beat Intelligence (music) and Narration Intelligence (speech)
 * are active, this module merges their outputs into unified cut points,
 * section maps, and ducking regions.
 */

import type { AudioAnalysisResult, SegmentType } from './audioAnalysisCore';
import type { NarrationAnalysisResult, NarrationSectionType } from './narrationAnalysis';

// ─── Types ───────────────────────────────────────────────────────────────────

export type MergeStrategy = 'narration-leads' | 'music-leads' | 'balanced' | 'ducking';

export interface MergedSection {
    start: number;     // seconds
    end: number;
    musicSection?: SegmentType;        // from beat analysis
    narrationSection?: NarrationSectionType;  // from narration analysis
    label: string;     // human-readable combined label
}

export interface DuckingRegion {
    start: number;     // seconds
    end: number;
    musicVolume: number;  // 0-100 (reduced during speech)
    fadeInDuration: number;   // seconds
    fadeOutDuration: number;  // seconds
}

export interface EmphasisSync {
    time: number;      // seconds
    beatEnergy: number;     // 0-1 from beat analysis
    speechEnergy: number;   // 0-1 from narration analysis
    type: 'amplify' | 'beat-only' | 'speech-only';
}

export interface MergedIntelligence {
    cutPoints: number[];              // Unified cut timestamps (seconds)
    sectionMap: MergedSection[];      // Combined section markers
    duckingRegions: DuckingRegion[];  // Where music should duck under speech
    emphasisSync: EmphasisSync[];     // Where beat drops align with speech emphasis
    primaryDriver: 'beat' | 'narration' | 'both';
    strategy: MergeStrategy;
}

export interface MergeOptions {
    proximityThresholdMs?: number;  // default 80
    duckVolume?: number;            // 0-100, default 15
    fadeInMs?: number;              // default 200
    fadeOutMs?: number;             // default 500
}

// ─── Strategy Definitions (for UI) ──────────────────────────────────────────

export const mergeStrategies: { id: MergeStrategy; label: string; description: string; icon: string }[] = [
    {
        id: 'narration-leads',
        label: 'Narration Leads',
        description: 'Speech drives the edit — cuts land on phrase boundaries. Music fills gaps.',
        icon: '🎙️',
    },
    {
        id: 'music-leads',
        label: 'Music Leads',
        description: 'Beats drive the edit — cuts land on beats. Narration adjusts around them.',
        icon: '🎵',
    },
    {
        id: 'balanced',
        label: 'Balanced',
        description: 'Both engines contribute equally. Nearby points merge to an average.',
        icon: '⚖️',
    },
    {
        id: 'ducking',
        label: 'Ducking',
        description: 'Beats drive cuts. Music ducks automatically during speech regions.',
        icon: '🔉',
    },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Remove duplicate cut points within `thresholdSec` of each other. */
function deduplicateCuts(cuts: number[], thresholdSec: number): number[] {
    if (cuts.length === 0) return [];
    const sorted = [...cuts].sort((a, b) => a - b);
    const result: number[] = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] - result[result.length - 1] > thresholdSec) {
            result.push(sorted[i]);
        }
    }
    return result;
}

/** Check if a time falls within any speech region. */
function isInSpeechRegion(
    time: number,
    speechRegions: { start: number; end: number }[],
): boolean {
    return speechRegions.some(r => time >= r.start && time <= r.end);
}

/** Check if a time has a nearby beat within threshold. */
function hasNearbyBeat(
    time: number,
    beats: number[],
    thresholdSec: number,
): boolean {
    return beats.some(b => Math.abs(b - time) <= thresholdSec);
}

/** Capitalize first letter of a string. */
function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Extract speech regions from narration analysis.
 * Narration analysis provides sections; speech regions are sections
 * that aren't silence/pause.
 */
function extractSpeechRegions(
    narration: NarrationAnalysisResult,
): { start: number; end: number }[] {
    // Use sections from narration analysis as speech regions
    if (!narration.sections || narration.sections.length === 0) return [];
    // Use speechRegions if available, fall back to sections
    if (narration.speechRegions && narration.speechRegions.length > 0) {
        return narration.speechRegions.map((s: { start: number; end: number }) => ({ start: s.start, end: s.end }));
    }
    return narration.sections
        .map((s: { start: number; end: number }) => ({ start: s.start, end: s.end }));
}

/**
 * Extract narration cut points (phrase boundaries).
 * These come from the narration analysis phrase/section boundaries.
 */
function extractNarrationCuts(narration: NarrationAnalysisResult): number[] {
    const cuts: number[] = [];
    if (narration.sections) {
        for (const section of narration.sections) {
            cuts.push(section.start);
        }
    }
    if (narration.cutPoints) {
        for (const cp of narration.cutPoints) {
            cuts.push(cp);
        }
    }
    return [...new Set(cuts)].sort((a, b) => a - b);
}

/**
 * Extract beat cut points from audio analysis.
 */
function extractBeatCuts(beat: AudioAnalysisResult): number[] {
    // Use gridBeats if available, otherwise fall back to beats
    if (beat.gridBeats && beat.gridBeats.length > 0) {
        return [...beat.gridBeats];
    }
    return beat.beats.map(b => b.time);
}

/**
 * Extract beat energy values for emphasis sync detection.
 */
function extractBeatEnergies(beat: AudioAnalysisResult): { time: number; energy: number }[] {
    return beat.beats.map(b => ({
        time: b.time,
        energy: b.energy ?? 0,
    }));
}

/**
 * Extract narration emphasis points from narration analysis.
 */
function extractNarrationEmphasis(narration: NarrationAnalysisResult): { time: number; energy: number }[] {
    if (narration.emphasisPoints) {
        return narration.emphasisPoints.map((p: { time: number; energy?: number; strength?: number }) => ({
            time: p.time,
            energy: p.energy ?? p.strength ?? 0.8,
        }));
    }
    // Fallback: use section starts with default energy
    if (narration.sections) {
        return narration.sections.map((s: { start: number }) => ({
            time: s.start,
            energy: 0.6,
        }));
    }
    return [];
}

// ─── Cut Point Merging Strategies ────────────────────────────────────────────

function mergeNarrationLeads(
    beatCuts: number[],
    narrationCuts: number[],
    speechRegions: { start: number; end: number }[],
    thresholdSec: number,
): number[] {
    // Narration phrase boundaries are primary cuts
    const primary = [...narrationCuts];

    // Add beat cuts only during silence gaps (no speech)
    for (const beat of beatCuts) {
        if (!isInSpeechRegion(beat, speechRegions)) {
            primary.push(beat);
        }
    }

    return deduplicateCuts(primary, thresholdSec);
}

function mergeMusicLeads(
    beatCuts: number[],
    narrationCuts: number[],
    thresholdSec: number,
): number[] {
    // Beat timestamps are primary cuts
    const primary = [...beatCuts];

    // Add narration cuts only where no beat exists within proximity
    for (const narr of narrationCuts) {
        if (!hasNearbyBeat(narr, beatCuts, thresholdSec)) {
            primary.push(narr);
        }
    }

    return deduplicateCuts(primary, thresholdSec);
}

function mergeBalanced(
    beatCuts: number[],
    narrationCuts: number[],
    thresholdSec: number,
): number[] {
    const merged: number[] = [];
    const usedNarration = new Set<number>();

    // Find beat/narration pairs within proximity and merge to average
    for (const beat of beatCuts) {
        let closestNarr: number | null = null;
        let closestDist = Infinity;

        for (const narr of narrationCuts) {
            if (usedNarration.has(narr)) continue;
            const dist = Math.abs(beat - narr);
            if (dist <= thresholdSec && dist < closestDist) {
                closestDist = dist;
                closestNarr = narr;
            }
        }

        if (closestNarr !== null) {
            // Merge to average position
            merged.push((beat + closestNarr) / 2);
            usedNarration.add(closestNarr);
        } else {
            merged.push(beat);
        }
    }

    // Add remaining narration cuts that weren't merged
    for (const narr of narrationCuts) {
        if (!usedNarration.has(narr)) {
            merged.push(narr);
        }
    }

    return deduplicateCuts(merged, thresholdSec);
}

function mergeDucking(
    beatCuts: number[],
    thresholdSec: number,
): number[] {
    // Ducking strategy: use beat cuts as primary
    return deduplicateCuts(beatCuts, thresholdSec);
}

// ─── Section Map Builder ─────────────────────────────────────────────────────

function buildSectionMap(
    beat: AudioAnalysisResult | null,
    narration: NarrationAnalysisResult | null,
): MergedSection[] {
    const sections: MergedSection[] = [];

    // Collect all time boundaries from both analyses
    const boundaries = new Set<number>();

    if (beat?.segments) {
        for (const seg of beat.segments) {
            boundaries.add(seg.start);
            boundaries.add(seg.end);
        }
    }

    if (narration?.sections) {
        for (const sec of narration.sections) {
            boundaries.add(sec.start);
            boundaries.add(sec.end);
        }
    }

    const sortedBounds = [...boundaries].sort((a, b) => a - b);

    // Build sections from consecutive boundary pairs
    for (let i = 0; i < sortedBounds.length - 1; i++) {
        const start = sortedBounds[i];
        const end = sortedBounds[i + 1];
        if (end - start < 0.01) continue; // skip negligible gaps

        const midpoint = (start + end) / 2;

        // Find overlapping music section
        let musicSection: SegmentType | undefined;
        if (beat?.segments) {
            const seg = beat.segments.find(
                s => midpoint >= s.start && midpoint < s.end,
            );
            if (seg) musicSection = seg.type;
        }

        // Find overlapping narration section
        let narrationSection: NarrationSectionType | undefined;
        if (narration?.sections) {
            const sec = narration.sections.find(
                (s: { start: number; end: number }) => midpoint >= s.start && midpoint < s.end,
            );
            if (sec) narrationSection = sec.type;
        }

        // Build combined label
        const parts: string[] = [];
        if (musicSection) parts.push(capitalize(musicSection));
        if (narrationSection) parts.push(capitalize(narrationSection));
        const label = parts.length > 0 ? parts.join(' + ') : 'Transition';

        sections.push({
            start,
            end,
            musicSection,
            narrationSection,
            label,
        });
    }

    return sections;
}

// ─── Ducking Region Builder ──────────────────────────────────────────────────

function buildDuckingRegions(
    narration: NarrationAnalysisResult | null,
    duckVolume: number,
    fadeInSec: number,
    fadeOutSec: number,
): DuckingRegion[] {
    if (!narration) return [];

    const speechRegions = extractSpeechRegions(narration);
    return speechRegions.map(region => ({
        start: region.start,
        end: region.end,
        musicVolume: duckVolume,
        fadeInDuration: fadeInSec,
        fadeOutDuration: fadeOutSec,
    }));
}

// ─── Emphasis Sync Builder ───────────────────────────────────────────────────

const EMPHASIS_BEAT_THRESHOLD = 0.7;   // beat energy must exceed this for emphasis
const EMPHASIS_PROXIMITY_SEC = 0.2;    // 200ms window for alignment

function buildEmphasisSync(
    beat: AudioAnalysisResult | null,
    narration: NarrationAnalysisResult | null,
): EmphasisSync[] {
    const syncs: EmphasisSync[] = [];
    const beatEnergies = beat ? extractBeatEnergies(beat) : [];
    const narrationEmphasis = narration ? extractNarrationEmphasis(narration) : [];

    const usedNarration = new Set<number>();

    // Process beat impacts
    for (const beatPoint of beatEnergies) {
        if (beatPoint.energy < EMPHASIS_BEAT_THRESHOLD) continue;

        // Check if any narration emphasis is within proximity
        let matchedNarr: { time: number; energy: number } | null = null;
        for (const narrPoint of narrationEmphasis) {
            if (usedNarration.has(narrPoint.time)) continue;
            if (Math.abs(beatPoint.time - narrPoint.time) <= EMPHASIS_PROXIMITY_SEC) {
                matchedNarr = narrPoint;
                break;
            }
        }

        if (matchedNarr) {
            // Amplify: both beat impact and speech emphasis coincide
            syncs.push({
                time: beatPoint.time,
                beatEnergy: beatPoint.energy,
                speechEnergy: matchedNarr.energy,
                type: 'amplify',
            });
            usedNarration.add(matchedNarr.time);
        } else {
            syncs.push({
                time: beatPoint.time,
                beatEnergy: beatPoint.energy,
                speechEnergy: 0,
                type: 'beat-only',
            });
        }
    }

    // Add remaining narration emphasis points as speech-only
    for (const narrPoint of narrationEmphasis) {
        if (!usedNarration.has(narrPoint.time)) {
            syncs.push({
                time: narrPoint.time,
                beatEnergy: 0,
                speechEnergy: narrPoint.energy,
                type: 'speech-only',
            });
        }
    }

    return syncs.sort((a, b) => a.time - b.time);
}

// ─── Main Merge Function ─────────────────────────────────────────────────────

/**
 * Merge beat intelligence and narration intelligence into unified edit points.
 *
 * @param beatAnalysis     - Audio/beat analysis result (null if no music track)
 * @param narrationAnalysis - Narration analysis result (null if no speech track)
 * @param strategy         - Merge strategy to use
 * @param options          - Optional tuning parameters
 * @returns Unified intelligence merge result
 */
export function mergeIntelligence(
    beatAnalysis: AudioAnalysisResult | null,
    narrationAnalysis: NarrationAnalysisResult | null,
    strategy: MergeStrategy,
    options?: MergeOptions,
): MergedIntelligence {
    const proximityThresholdSec = (options?.proximityThresholdMs ?? 80) / 1000;
    const duckVolume = options?.duckVolume ?? 15;
    const fadeInSec = (options?.fadeInMs ?? 200) / 1000;
    const fadeOutSec = (options?.fadeOutMs ?? 500) / 1000;

    // ── Step 1: Determine primary driver ──────────────────────────────────
    const hasBeat = beatAnalysis !== null;
    const hasNarration = narrationAnalysis !== null;

    let primaryDriver: 'beat' | 'narration' | 'both';
    if (hasBeat && hasNarration) {
        primaryDriver = 'both';
    } else if (hasBeat) {
        primaryDriver = 'beat';
    } else {
        primaryDriver = 'narration';
    }

    // ── Step 2: Merge cut points based on strategy ────────────────────────
    const beatCuts = hasBeat ? extractBeatCuts(beatAnalysis) : [];
    const narrationCuts = hasNarration ? extractNarrationCuts(narrationAnalysis) : [];
    const speechRegions = hasNarration ? extractSpeechRegions(narrationAnalysis) : [];

    let cutPoints: number[];

    if (!hasBeat && !hasNarration) {
        // No intelligence — empty result
        cutPoints = [];
    } else if (!hasNarration) {
        // Beat-only: use all beat cuts
        cutPoints = deduplicateCuts(beatCuts, proximityThresholdSec);
    } else if (!hasBeat) {
        // Narration-only: use all narration cuts
        cutPoints = deduplicateCuts(narrationCuts, proximityThresholdSec);
    } else {
        // Both active — apply strategy
        switch (strategy) {
            case 'narration-leads':
                cutPoints = mergeNarrationLeads(beatCuts, narrationCuts, speechRegions, proximityThresholdSec);
                break;
            case 'music-leads':
                cutPoints = mergeMusicLeads(beatCuts, narrationCuts, proximityThresholdSec);
                break;
            case 'balanced':
                cutPoints = mergeBalanced(beatCuts, narrationCuts, proximityThresholdSec);
                break;
            case 'ducking':
                cutPoints = mergeDucking(beatCuts, proximityThresholdSec);
                break;
            default:
                cutPoints = mergeBalanced(beatCuts, narrationCuts, proximityThresholdSec);
        }
    }

    // ── Step 3: Build section map ─────────────────────────────────────────
    const sectionMap = buildSectionMap(beatAnalysis, narrationAnalysis);

    // ── Step 4: Compute ducking regions ───────────────────────────────────
    const duckingRegions = buildDuckingRegions(narrationAnalysis, duckVolume, fadeInSec, fadeOutSec);

    // ── Step 5: Compute emphasis sync ─────────────────────────────────────
    const emphasisSync = buildEmphasisSync(beatAnalysis, narrationAnalysis);

    // ── Step 6: Sort all arrays by time ───────────────────────────────────
    cutPoints.sort((a, b) => a - b);
    sectionMap.sort((a, b) => a.start - b.start);
    duckingRegions.sort((a, b) => a.start - b.start);
    // emphasisSync already sorted in buildEmphasisSync

    return {
        cutPoints,
        sectionMap,
        duckingRegions,
        emphasisSync,
        primaryDriver,
        strategy,
    };
}
