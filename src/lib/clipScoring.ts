// ══════════════════════════════════════════════════════════════════════════════
// clipScoring.ts — FFmpeg-native clip "interest" scoring.
// A model-free stand-in for embedding-based clip selection: ranks footage by
// motion energy (frame-difference luminance) so the auto-editor can prefer the
// liveliest takes. Pure, testable helpers; the FFmpeg run lives in the main process.
// ══════════════════════════════════════════════════════════════════════════════

/** Extract numeric values for a metadata key from FFmpeg metadata=print output. */
export function parseMetadataValues(text: string, key: string): number[] {
    const out: number[] = [];
    const re = new RegExp(key.replace(/\./g, '\\.') + '=([0-9]+\\.?[0-9]*)', 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const v = parseFloat(m[1]);
        if (isFinite(v)) out.push(v);
    }
    return out;
}

export function mean(values: number[]): number {
    if (!values.length) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Map a raw motion-energy mean (~0..60+) to a 0..100 interest score. */
export function motionToScore(meanEnergy: number): number {
    return Math.max(0, Math.min(100, Math.round((meanEnergy / 40) * 100)));
}

/** Rank scored items, highest score first. */
export function rankByScore<T extends { score: number }>(items: T[]): T[] {
    return [...items].sort((a, b) => b.score - a.score);
}
