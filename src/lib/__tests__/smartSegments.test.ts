// Run with:  npx vitest run src/lib/__tests__/smartSegments.test.ts
import { describe, it, expect } from 'vitest';
import {
    suggestSmartSegments,
    updateBias,
    classifyEdit,
    NEUTRAL_BIAS,
    type SmartAnalysisLike,
} from '../ege/smartSegments';
import { resolveKeptRanges } from '../mediaSegments';

const canvas = { duration: 10 };

describe('suggestSmartSegments', () => {
    it('produces a single usable include when no scene cuts', () => {
        const a: SmartAnalysisLike = { usableInFrames: 30, usableOutFrames: 270, score: 0.8, energyLevel: 'high' };
        const segs = suggestSmartSegments(canvas, a, { fps: 30, perScene: false });
        expect(segs).toHaveLength(1);
        expect(segs[0]).toMatchObject({ type: 'include', origin: 'smart' });
        expect(segs[0].startSec).toBeCloseTo(1);
        expect(segs[0].endSec).toBeCloseTo(9);
        expect(segs[0].label).toContain('high');
    });

    it('splits the usable region into per-scene includes', () => {
        const a: SmartAnalysisLike = { usableInFrames: 0, usableOutFrames: 300, sceneCutsFrames: [90, 180], score: 0.6 };
        const segs = suggestSmartSegments(canvas, a, { fps: 30, perScene: true });
        expect(segs.length).toBe(3); // 0-3, 3-6, 6-10
        expect(segs.every((s) => s.type === 'include' && s.origin === 'smart')).toBe(true);
    });

    it('suggestions resolve to valid kept ranges', () => {
        const a: SmartAnalysisLike = { usableInFrames: 30, usableOutFrames: 270, sceneCutsFrames: [150] };
        const segs = suggestSmartSegments(canvas, a, { fps: 30 });
        const kept = resolveKeptRanges(canvas, segs);
        expect(kept.length).toBeGreaterThan(0);
        expect(kept[0].startSec).toBeGreaterThanOrEqual(1 - 1e-6);
        expect(kept[kept.length - 1].endSec).toBeLessThanOrEqual(9 + 1e-6);
    });

    it('a tightness bias trims the usable region inward', () => {
        const a: SmartAnalysisLike = { usableInFrames: 0, usableOutFrames: 300 };
        const tight = suggestSmartSegments(canvas, a, { fps: 30, perScene: false, bias: { ...NEUTRAL_BIAS, tightness: 1, samples: 5 } });
        expect(tight[0].startSec).toBeGreaterThan(0);
        expect(tight[0].endSec).toBeLessThan(10);
    });
});

describe('training loop', () => {
    it('classifyEdit detects tightening', () => {
        const d = classifyEdit({ inSec: 0, outSec: 10 }, { inSec: 1, outSec: 8 });
        expect(d.kind).toBe('tightened');
        expect(d.headDeltaSec).toBeCloseTo(1);
        expect(d.tailDeltaSec).toBeCloseTo(-2);
    });

    it('classifyEdit detects acceptance', () => {
        expect(classifyEdit({ inSec: 0, outSec: 10 }, { inSec: 0, outSec: 10 }).kind).toBe('accept');
    });

    it('updateBias moves toward tighter and accumulates samples', () => {
        let bias = NEUTRAL_BIAS;
        for (let i = 0; i < 5; i++) bias = updateBias(bias, { kind: 'tightened', headDeltaSec: 1, tailDeltaSec: -1 });
        expect(bias.samples).toBe(5);
        expect(bias.tightness).toBeGreaterThan(0);
        expect(bias.headTrimSec).toBeGreaterThan(0);
        expect(bias.tailTrimSec).toBeGreaterThan(0);
    });
});
