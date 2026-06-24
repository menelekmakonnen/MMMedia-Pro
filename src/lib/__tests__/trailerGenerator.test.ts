import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaFile } from '../../store/mediaStore';
import { generateTrailerSequence } from '../trailerGenerator';

function makePool(count: number, duration = 60): MediaFile[] {
    return Array.from({ length: count }, (_, index) => ({
        id: `media-${index}`,
        path: `C:/media/source-${index}.mp4`,
        filename: `source-${index}.mp4`,
        type: 'video' as const,
        duration,
        width: 1920,
        height: 1080,
        orientation: 'horizontal' as const,
        score: 100 - index,
    } as MediaFile & { score: number }));
}

describe('generateTrailerSequence diversity', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => vi.restoreAllMocks());

    it('cycles through the eligible pool before reusing a source', () => {
        const pool = makePool(12);
        const clips = generateTrailerSequence(pool, {
            seed: 'coverage-first',
            targetDuration: 12,
            shortestClip: 0.5,
            longestClip: 0.5,
            allowDuplicates: true,
            allowSameSegment: false,
        });

        expect(clips.length).toBeGreaterThanOrEqual(pool.length);
        expect(new Set(clips.slice(0, pool.length).map(clip => clip.path)).size).toBe(pool.length);
    });

    it('does not replay the same source range while novel windows exist', () => {
        const clips = generateTrailerSequence(makePool(1, 120), {
            seed: 'novel-ranges',
            targetDuration: 20,
            shortestClip: 0.5,
            longestClip: 0.5,
            allowDuplicates: true,
            allowSameSegment: false,
        });
        const ranges = clips.map(clip => `${clip.trimStartFrame}-${clip.trimEndFrame}`);

        expect(ranges.length).toBeGreaterThan(20);
        expect(new Set(ranges).size).toBe(ranges.length);
    });

    it('honours previous passes when selecting a continuation', () => {
        const pool = makePool(4);
        const usedPath = pool[0].path;
        const clips = generateTrailerSequence(pool, {
            seed: 'continuation',
            targetDuration: 1,
            shortestClip: 0.5,
            longestClip: 0.5,
            allowDuplicates: true,
            initialSegmentHistory: { [usedPath]: ['30-45', '90-105'] },
            initialSourceUseCounts: { [usedPath]: 2 },
            initialLastSourcePath: usedPath,
        });

        expect(clips[0]?.path).not.toBe(usedPath);
    });
});
