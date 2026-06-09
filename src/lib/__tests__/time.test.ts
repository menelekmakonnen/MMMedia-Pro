import { describe, it, expect } from 'vitest';
import { secondsToFrames, framesToSeconds, formatTimecode, verifyFrameConsistency, DEFAULT_FPS } from '../time';

describe('secondsToFrames', () => {
    it('converts 1 second to 30 frames at default FPS', () => {
        expect(secondsToFrames(1)).toBe(30);
    });
    it('converts 0 seconds to 0 frames', () => {
        expect(secondsToFrames(0)).toBe(0);
    });
    it('handles floating point precision (1/30 of a second = 1 frame)', () => {
        expect(secondsToFrames(1/30)).toBe(1);
    });
    it('handles custom FPS', () => {
        expect(secondsToFrames(1, 24)).toBe(24);
        expect(secondsToFrames(1, 60)).toBe(60);
    });
    it('floors fractional results', () => {
        expect(secondsToFrames(0.5)).toBe(15);
    });
    it('handles epsilon for floating point drift', () => {
        // 0.033333... * 30 = 0.999... which should round to 1 not 0
        expect(secondsToFrames(0.033333333333)).toBe(1);
    });
    it('handles large durations', () => {
        expect(secondsToFrames(3600)).toBe(108000); // 1 hour
    });
});

describe('framesToSeconds', () => {
    it('converts 30 frames to 1 second at default FPS', () => {
        expect(framesToSeconds(30)).toBe(1);
    });
    it('converts 0 frames to 0 seconds', () => {
        expect(framesToSeconds(0)).toBe(0);
    });
    it('handles fractional result', () => {
        expect(framesToSeconds(1)).toBeCloseTo(1/30);
    });
    it('handles custom FPS', () => {
        expect(framesToSeconds(24, 24)).toBe(1);
    });
});

describe('formatTimecode', () => {
    it('formats zero as 00:00:00:00', () => {
        expect(formatTimecode(0)).toBe('00:00:00:00');
    });
    it('formats 30 frames as 00:00:01:00', () => {
        expect(formatTimecode(30)).toBe('00:00:01:00');
    });
    it('formats with frame remainder', () => {
        expect(formatTimecode(15)).toBe('00:00:00:15');
    });
    it('formats minutes correctly', () => {
        expect(formatTimecode(1800)).toBe('00:01:00:00'); // 60 seconds
    });
    it('formats hours correctly', () => {
        expect(formatTimecode(108000)).toBe('01:00:00:00'); // 3600 seconds
    });
    it('handles complex timecode', () => {
        // 1 hour + 23 min + 45 sec + 15 frames
        const frames = (1*3600 + 23*60 + 45) * 30 + 15;
        expect(formatTimecode(frames)).toBe('01:23:45:15');
    });
});

describe('round-trip consistency', () => {
    it('verifyFrameConsistency returns true for whole frames', () => {
        expect(verifyFrameConsistency(0)).toBe(true);
        expect(verifyFrameConsistency(1)).toBe(true);
        expect(verifyFrameConsistency(30)).toBe(true);
        expect(verifyFrameConsistency(108000)).toBe(true);
    });
    it('round-trips correctly for common durations', () => {
        for (const frames of [0, 1, 15, 30, 90, 900, 1800, 108000]) {
            const secs = framesToSeconds(frames);
            const back = secondsToFrames(secs);
            expect(back).toBe(frames);
        }
    });
});
