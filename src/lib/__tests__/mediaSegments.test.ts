// Run with:  npx vitest run src/lib/__tests__/mediaSegments.test.ts
//
// Locks the include/exclude segment model — the source of truth for which
// footage downstream tools may use.
import { describe, it, expect } from 'vitest';
import {
    mergeRanges,
    subtractRanges,
    clipRangesToWindow,
    rangesDuration,
    usableCanvas,
    resolveKeptRanges,
    keptDuration,
    isFullyExcluded,
    clampSegment,
    makeSegment,
    type MediaSegment,
    type SegmentCanvas,
} from '../mediaSegments';

const inc = (s: number, e: number, origin: 'smart' | 'user' = 'user'): MediaSegment =>
    makeSegment(s, e, 'include', origin);
const exc = (s: number, e: number, origin: 'smart' | 'user' = 'user'): MediaSegment =>
    makeSegment(s, e, 'exclude', origin);

describe('range algebra', () => {
    it('merges overlapping and adjacent ranges', () => {
        expect(mergeRanges([{ startSec: 0, endSec: 2 }, { startSec: 1.5, endSec: 3 }, { startSec: 5, endSec: 6 }]))
            .toEqual([{ startSec: 0, endSec: 3 }, { startSec: 5, endSec: 6 }]);
    });

    it('subtracts holes, splitting ranges', () => {
        expect(subtractRanges([{ startSec: 0, endSec: 10 }], [{ startSec: 3, endSec: 5 }]))
            .toEqual([{ startSec: 0, endSec: 3 }, { startSec: 5, endSec: 10 }]);
    });

    it('subtracting a covering hole yields nothing', () => {
        expect(subtractRanges([{ startSec: 2, endSec: 4 }], [{ startSec: 0, endSec: 10 }])).toEqual([]);
    });

    it('clips ranges to a window', () => {
        expect(clipRangesToWindow([{ startSec: 0, endSec: 10 }], { startSec: 2, endSec: 6 }))
            .toEqual([{ startSec: 2, endSec: 6 }]);
    });

    it('rangesDuration sums disjoint coverage', () => {
        expect(rangesDuration([{ startSec: 0, endSec: 2 }, { startSec: 1, endSec: 3 }, { startSec: 5, endSec: 6 }]))
            .toBeCloseTo(4); // 0-3 (=3) + 5-6 (=1)
    });
});

describe('usable canvas', () => {
    it('defaults to 0..duration and respects trim', () => {
        expect(usableCanvas({ duration: 10 })).toEqual({ startSec: 0, endSec: 10 });
        expect(usableCanvas({ duration: 10, trimIn: 2, trimOut: 8 })).toEqual({ startSec: 2, endSec: 8 });
    });
    it('clamps trim to the source bounds', () => {
        expect(usableCanvas({ duration: 10, trimIn: -5, trimOut: 99 })).toEqual({ startSec: 0, endSec: 10 });
    });
});

describe('resolveKeptRanges — the source of truth', () => {
    const canvas: SegmentCanvas = { duration: 10 };

    it('keeps the whole canvas with no segments', () => {
        expect(resolveKeptRanges(canvas, [])).toEqual([{ startSec: 0, endSec: 10 }]);
        expect(resolveKeptRanges(canvas, undefined)).toEqual([{ startSec: 0, endSec: 10 }]);
    });

    it('keeps only the union of includes when includes exist', () => {
        expect(resolveKeptRanges(canvas, [inc(1, 3), inc(6, 8)]))
            .toEqual([{ startSec: 1, endSec: 3 }, { startSec: 6, endSec: 8 }]);
    });

    it('layers excludes over the whole canvas when no includes', () => {
        expect(resolveKeptRanges(canvas, [exc(4, 6)]))
            .toEqual([{ startSec: 0, endSec: 4 }, { startSec: 6, endSec: 10 }]);
    });

    it('layers an exclude inside an include (the expressive case)', () => {
        expect(resolveKeptRanges(canvas, [inc(2, 8), exc(4, 5)]))
            .toEqual([{ startSec: 2, endSec: 4 }, { startSec: 5, endSec: 8 }]);
    });

    it('respects trim as the outer canvas', () => {
        expect(resolveKeptRanges({ duration: 10, trimIn: 2, trimOut: 8 }, [inc(0, 100)]))
            .toEqual([{ startSec: 2, endSec: 8 }]);
    });

    it('keptDuration and isFullyExcluded agree', () => {
        expect(keptDuration(canvas, [inc(0, 4)])).toBeCloseTo(4);
        expect(isFullyExcluded(canvas, [exc(0, 10)])).toBe(true);
        expect(isFullyExcluded(canvas, [inc(1, 2)])).toBe(false);
    });
});

describe('segment editing helpers', () => {
    it('clamps a segment to the canvas and normalizes order', () => {
        const c: SegmentCanvas = { duration: 10 };
        const s = clampSegment(makeSegment(12, -3, 'include', 'user'), c);
        expect(s.startSec).toBeGreaterThanOrEqual(0);
        expect(s.endSec).toBeLessThanOrEqual(10);
        expect(s.startSec).toBeLessThan(s.endSec);
    });

    it('makeSegment orders start before end and tags origin', () => {
        const s = makeSegment(8, 2, 'exclude', 'smart', { label: 'silence', score: 0.1 });
        expect(s).toMatchObject({ startSec: 2, endSec: 8, type: 'exclude', origin: 'smart', label: 'silence' });
    });
});
