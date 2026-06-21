// ══════════════════════════════════════════════════════════════════════════════
// silenceRemoval.ts — Parse FFmpeg `silencedetect` output and compute trims.
// Pure helpers (testable). Used to auto-tighten talking clips for the auto-editor.
// ══════════════════════════════════════════════════════════════════════════════

export interface SilenceInterval { start: number; end: number; }

/** Parse `silence_start` / `silence_end` pairs from FFmpeg silencedetect stderr.
 *  A trailing `silence_start` with no matching end extends to `totalDuration`. */
export function parseSilenceDetect(text: string, totalDuration = Infinity): SilenceInterval[] {
    const starts: number[] = [];
    const ends: number[] = [];
    let m: RegExpExecArray | null;
    const startRe = /silence_start:\s*(-?[0-9]+\.?[0-9]*)/g;
    while ((m = startRe.exec(text)) !== null) starts.push(parseFloat(m[1]));
    const endRe = /silence_end:\s*(-?[0-9]+\.?[0-9]*)/g;
    while ((m = endRe.exec(text)) !== null) ends.push(parseFloat(m[1]));
    const out: SilenceInterval[] = [];
    for (let i = 0; i < starts.length; i++) {
        const s = Math.max(0, starts[i]);
        const e = i < ends.length ? ends[i] : totalDuration;
        if (isFinite(s) && e > s) out.push({ start: s, end: e });
    }
    return out;
}

/** Non-silent ranges = complement of silence within [0, total]. */
export function computeKeepRanges(silences: SilenceInterval[], total: number): SilenceInterval[] {
    const sorted = [...silences].sort((a, b) => a.start - b.start);
    const keep: SilenceInterval[] = [];
    let cursor = 0;
    for (const s of sorted) {
        if (s.start > cursor) keep.push({ start: cursor, end: Math.min(s.start, total) });
        cursor = Math.max(cursor, s.end);
    }
    if (cursor < total) keep.push({ start: cursor, end: total });
    return keep.filter(r => r.end - r.start > 0.001);
}

/** Head/tail trim: tighten a clip to its first and last non-silent moments. */
export function computeHeadTailTrim(
    silences: SilenceInterval[], total: number
): { trimStart: number; trimEnd: number } {
    let trimStart = 0;
    let trimEnd = total;
    const sorted = [...silences].sort((a, b) => a.start - b.start);
    if (sorted.length) {
        const first = sorted[0];
        if (first.start <= 0.05) trimStart = Math.min(first.end, total);
        const last = sorted[sorted.length - 1];
        if (last.end >= total - 0.05) trimEnd = Math.max(last.start, trimStart);
    }
    return { trimStart, trimEnd };
}
