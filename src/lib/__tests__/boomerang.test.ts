import { describe, it, expect } from 'vitest';
import {
    expandBoomerang,
    expandClipToBoomerang,
    getBoomerangDuration,
    BOOMERANG_PRESETS,
    DEFAULT_BOOMERANG,
} from '../boomerang';
import type { Clip } from '../../types';

// ── Test helpers ──

const makeClip = (overrides: Partial<Clip> = {}): Clip => ({
    id: 'test-clip',
    type: 'video',
    path: '/test/video.mp4',
    filename: 'video.mp4',
    startFrame: 0,
    endFrame: 60,
    sourceDurationFrames: 300,
    trimStartFrame: 0,
    trimEndFrame: 60,
    track: 1,
    speed: 1.0,
    volume: 100,
    reversed: false,
    locked: false,
    ...overrides,
});

// ══════════════════════════════════════════════════════════════════════════════

describe('expandBoomerang', () => {
    it('returns empty array for zero-length clip', () => {
        expect(expandBoomerang(10, 10)).toEqual([]);
    });

    it('classic preset produces 2 sub-clips (1 cycle = fwd+rev)', () => {
        const subs = expandBoomerang(0, 30, 1.0, BOOMERANG_PRESETS.classic);
        // classic has bounces=1: 1 cycle producing fwd + rev
        expect(subs.length).toBe(2);
    });

    it('sub-clips alternate forward and reverse', () => {
        const subs = expandBoomerang(0, 60, 1.0, DEFAULT_BOOMERANG);
        for (let i = 0; i < subs.length; i++) {
            expect(subs[i].reversed).toBe(i % 2 === 1);
        }
    });

    it('all sub-clips have positive duration', () => {
        const subs = expandBoomerang(0, 30, 1.0, BOOMERANG_PRESETS.classic);
        for (const sub of subs) {
            expect(sub.timelineDuration).toBeGreaterThanOrEqual(2);
        }
    });

    it('respects base speed', () => {
        const subs = expandBoomerang(0, 60, 2.0, BOOMERANG_PRESETS.classic);
        expect(subs[0].speed).toBe(2.0);
    });

    it('first bounce trim covers full range', () => {
        const subs = expandBoomerang(10, 50, 1.0, DEFAULT_BOOMERANG);
        expect(subs[0].trimStartFrame).toBe(10);
        expect(subs[0].trimEndFrame).toBe(50);
    });

    it('handles very short clips gracefully', () => {
        const subs = expandBoomerang(0, 3, 1.0, BOOMERANG_PRESETS.classic);
        // Should produce at least the first cycle, but may skip later bounces
        expect(subs.length).toBeGreaterThanOrEqual(2);
        for (const sub of subs) {
            expect(sub.timelineDuration).toBeGreaterThanOrEqual(2);
        }
    });
});

describe('expandClipToBoomerang', () => {
    it('returns original clip if boomerang expansion fails', () => {
        const clip = makeClip({ trimStartFrame: 5, trimEndFrame: 5 }); // zero length
        const result = expandClipToBoomerang(clip);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('test-clip');
    });

    it('generates unique IDs for sub-clips', () => {
        const clip = makeClip();
        const result = expandClipToBoomerang(clip);
        const ids = result.map(c => c.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('sub-clips are sequential on timeline', () => {
        const clip = makeClip({ startFrame: 100 });
        const result = expandClipToBoomerang(clip);
        for (let i = 1; i < result.length; i++) {
            expect(result[i].startFrame).toBe(result[i - 1].endFrame);
        }
    });

    it('first sub-clip starts at original clip start', () => {
        const clip = makeClip({ startFrame: 50 });
        const result = expandClipToBoomerang(clip);
        expect(result[0].startFrame).toBe(50);
    });

    it('preserves source path and filename', () => {
        const clip = makeClip();
        const result = expandClipToBoomerang(clip);
        for (const sub of result) {
            expect(sub.path).toBe('/test/video.mp4');
            expect(sub.filename).toBe('video.mp4');
        }
    });

    it('sub-clips have boomerang=false to prevent recursion', () => {
        const clip = makeClip({ boomerang: true });
        const result = expandClipToBoomerang(clip);
        for (const sub of result) {
            expect(sub.boomerang).toBe(false);
        }
    });

    it('preserves effect IDs on all sub-clips', () => {
        const clip = makeClip({ effectIds: ['fx_bw_contrast', 'fx_gen_5'] });
        const result = expandClipToBoomerang(clip);
        for (const sub of result) {
            expect(sub.effectIds).toEqual(['fx_bw_contrast', 'fx_gen_5']);
        }
    });

    it('reverses zoom direction on reversed sub-clips', () => {
        const clip = makeClip({ zoomStart: 100, zoomEnd: 120 });
        const result = expandClipToBoomerang(clip, BOOMERANG_PRESETS.classic);
        const fwd = result.find(c => !c.reversed);
        const rev = result.find(c => c.reversed);
        expect(fwd!.zoomStart).toBe(100);
        expect(fwd!.zoomEnd).toBe(120);
        expect(rev!.zoomStart).toBe(120);
        expect(rev!.zoomEnd).toBe(100);
    });
});

describe('getBoomerangDuration', () => {
    it('returns total frames for all sub-clips', () => {
        const dur = getBoomerangDuration(0, 60, 1.0, BOOMERANG_PRESETS.classic);
        expect(dur).toBeGreaterThan(0);
        // Classic at 1.0x with 60 frames: 1 cycle
        // Cycle 0: fwd 60 + rev 60 = 120
        // Total = 120
        expect(dur).toBe(120);
    });

    it('faster speed produces shorter total duration', () => {
        const slow = getBoomerangDuration(0, 60, 1.0, DEFAULT_BOOMERANG);
        const fast = getBoomerangDuration(0, 60, 2.0, DEFAULT_BOOMERANG);
        expect(fast).toBeLessThan(slow);
    });
});

describe('BOOMERANG_PRESETS', () => {
    it('has all preset variants', () => {
        expect(Object.keys(BOOMERANG_PRESETS)).toEqual(['classic', 'slowmo', 'echo', 'duo', 'stutter', 'whiplash']);
    });

    it('classic has no decay', () => {
        expect(BOOMERANG_PRESETS.classic.decay).toBe(0);
        expect(BOOMERANG_PRESETS.classic.speedRamp).toBe(1.0);
    });
});
