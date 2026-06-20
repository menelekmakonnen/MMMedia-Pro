/**
 * Lyric / cue markers + beat-aware snapping
 * ════════════════════════════════════════════════════════════════════════════
 * Lets cuts land on a specific word ("fast cuts end on the word Loner") or, when
 * no lyric is near, on the closest musical beat. Pure + unit-testable.
 */

export interface LyricMarker {
    /** Seconds into the song. */
    time: number;
    /** The word/phrase at this time. */
    text: string;
}

/** Nearest value in a sorted-or-unsorted numeric list, or null if empty. */
function nearest(values: number[], t: number): number | null {
    if (!values.length) return null;
    let best = values[0], bd = Math.abs(values[0] - t);
    for (const v of values) { const d = Math.abs(v - t); if (d < bd) { bd = d; best = v; } }
    return best;
}

/**
 * Snap a target time to the nearest lyric marker within `tolS`; if none is close,
 * snap to the nearest beat; if no beats, return the original time.
 */
export function snapToLyricOrBeat(
    time: number,
    lyrics: LyricMarker[],
    beats: number[],
    tolS = 0.25,
): { time: number; snappedTo: 'lyric' | 'beat' | 'none'; text?: string } {
    let bestLyric: LyricMarker | null = null, bd = Infinity;
    for (const l of lyrics) { const d = Math.abs(l.time - time); if (d < bd) { bd = d; bestLyric = l; } }
    if (bestLyric && bd <= tolS) return { time: bestLyric.time, snappedTo: 'lyric', text: bestLyric.text };
    const b = nearest(beats, time);
    if (b !== null) return { time: b, snappedTo: 'beat' };
    return { time, snappedTo: 'none' };
}

/** Find the marker whose text matches `word` (case-insensitive), nearest to `near`. */
export function findWord(word: string, lyrics: LyricMarker[], near = 0): LyricMarker | null {
    const w = word.trim().toLowerCase();
    const matches = lyrics.filter(l => l.text.trim().toLowerCase() === w);
    if (!matches.length) return null;
    let best = matches[0], bd = Math.abs(matches[0].time - near);
    for (const m of matches) { const d = Math.abs(m.time - near); if (d < bd) { bd = d; best = m; } }
    return best;
}
