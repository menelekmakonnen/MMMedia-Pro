import { v4 as uuidv4 } from 'uuid';
import { secondsToFrames } from './time';

/**
 * Markers & Labels System
 * Defines timeline markers (point-in-time) and regions (ranges)
 * for beat sync, section labeling, cut-points, and editorial notes.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type MarkerType = 'beat' | 'section' | 'cut-point' | 'note' | 'chapter';

export interface Marker {
    id: string;
    type: MarkerType;
    frame: number;           // Position in frames
    label: string;
    color: string;           // hex color
    metadata?: Record<string, unknown>;
}

export interface Region {
    id: string;
    type: 'section' | 'custom';
    startFrame: number;
    endFrame: number;
    label: string;
    color: string;           // hex color with alpha for background
    sectionType?: string;    // 'intro' | 'verse' | 'chorus' | 'drop' | 'bridge' | 'outro' | 'buildup' | 'breakdown'
}

// ─── Default Colors ──────────────────────────────────────────────────────────

export const MARKER_COLORS: Record<MarkerType, string> = {
    beat: '#00BCD4',         // cyan
    section: '#9C27B0',      // purple
    'cut-point': '#F44336',  // red
    note: '#FFEB3B',         // yellow
    chapter: '#4CAF50',      // green
};

export const SECTION_COLORS: Record<string, string> = {
    intro: '#4CAF50',
    verse: '#2196F3',
    chorus: '#FF9800',
    drop: '#F44336',
    bridge: '#9C27B0',
    outro: '#607D8B',
    buildup: '#FFC107',
    breakdown: '#00BCD4',
};

// ─── Factory Functions ───────────────────────────────────────────────────────

/**
 * Creates a new Marker with a unique id.
 */
export function createMarker(
    type: MarkerType,
    frame: number,
    label: string,
    color?: string,
    metadata?: Record<string, unknown>
): Marker {
    return {
        id: uuidv4(),
        type,
        frame,
        label,
        color: color ?? MARKER_COLORS[type],
        metadata,
    };
}

/**
 * Creates a new Region with a unique id.
 */
export function createRegion(
    type: 'section' | 'custom',
    startFrame: number,
    endFrame: number,
    label: string,
    color?: string,
    sectionType?: string
): Region {
    return {
        id: uuidv4(),
        type,
        startFrame,
        endFrame,
        label,
        color: color ?? (sectionType ? SECTION_COLORS[sectionType] ?? '#888888' : '#888888'),
        sectionType,
    };
}

// ─── Audio Analysis Converters ───────────────────────────────────────────────

/**
 * Converts beat markers from audio analysis into Marker objects.
 * Each beat's time (in seconds) is converted to the nearest frame.
 */
export function markersFromAudioAnalysis(
    analysisResult: { beatMarkers?: { time: number; energy: number }[] },
    fps: number
): Marker[] {
    if (!analysisResult.beatMarkers || analysisResult.beatMarkers.length === 0) {
        return [];
    }

    return analysisResult.beatMarkers.map((beat, index) =>
        createMarker(
            'beat',
            secondsToFrames(beat.time, fps),
            `Beat ${index + 1}`,
            MARKER_COLORS.beat,
            { energy: beat.energy }
        )
    );
}

/**
 * Converts audio segments into Region objects.
 * Each segment's start/end time (seconds) is converted to frames.
 */
export function regionsFromAudioAnalysis(
    segments: Array<{ label: string; startTime: number; endTime: number }>,
    fps: number
): Region[] {
    return segments.map((seg) => {
        const sectionType = seg.label.toLowerCase();
        return createRegion(
            'section',
            secondsToFrames(seg.startTime, fps),
            secondsToFrames(seg.endTime, fps),
            seg.label,
            SECTION_COLORS[sectionType] ?? '#888888',
            sectionType
        );
    });
}

// ─── Query Helpers ───────────────────────────────────────────────────────────

/**
 * Returns markers sorted by frame position (ascending).
 */
export function sortMarkers(markers: Marker[]): Marker[] {
    return [...markers].sort((a, b) => a.frame - b.frame);
}

/**
 * Finds the marker nearest to the given frame.
 * Returns null if the markers array is empty.
 */
export function findNearestMarker(markers: Marker[], frame: number): Marker | null {
    if (markers.length === 0) return null;

    let nearest = markers[0];
    let minDistance = Math.abs(markers[0].frame - frame);

    for (let i = 1; i < markers.length; i++) {
        const distance = Math.abs(markers[i].frame - frame);
        if (distance < minDistance) {
            minDistance = distance;
            nearest = markers[i];
        }
    }

    return nearest;
}

/**
 * Returns all markers whose frame falls within [startFrame, endFrame] (inclusive).
 */
export function findMarkersInRange(markers: Marker[], startFrame: number, endFrame: number): Marker[] {
    return markers.filter((m) => m.frame >= startFrame && m.frame <= endFrame);
}
