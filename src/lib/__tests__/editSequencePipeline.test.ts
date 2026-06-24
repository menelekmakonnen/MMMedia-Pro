import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Clip } from '../../types';
import type { MediaFile } from '../../store/mediaStore';
import { DEFAULT_TRAILER_SETTINGS, generateTrailerSequence } from '../trailerGenerator';
import { finalizeGeneratedSequence } from '../editSequencePipeline';
import { applySequencePresetStack, resolveSequencePresetIds } from '../../features/EditEngine/sequencePresets';

const FPS = 30;

function pool(count = 8): MediaFile[] {
    return Array.from({ length: count }, (_, index) => ({
        id: `media-${index}`,
        path: `C:/media/${index}.mp4`,
        filename: `${index}.mp4`,
        type: 'video' as const,
        duration: 60,
        orientation: 'horizontal' as const,
    }));
}

describe('edit sequence pipeline', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => vi.restoreAllMocks());

    it('supports stacked preset IDs and legacy IDs', () => {
        expect(resolveSequencePresetIds({ sequencePresetIds: ['j-cut', 'audio-ducking'] }))
            .toEqual(['j-cut', 'audio-ducking']);
        expect(resolveSequencePresetIds({ sequencePresetId: 'j-cut' })).toEqual(['j-cut']);
    });

    it('stacks compatible effects on the same clips', () => {
        const base: Clip[] = generateTrailerSequence(pool(2), {
            ...DEFAULT_TRAILER_SETTINGS,
            seed: 'stacked-effects',
            targetDuration: 2,
        });
        const clips = applySequencePresetStack(base, ['cinematic-bars', 'glitch-pulse'], FPS);

        expect(clips[0].letterbox).toBe(true);
        expect(clips[0].filmGrain).toBe(15);
        expect(clips[0].rgbSplit).toBeDefined();
    });

    it('keeps the rendered duration exact after stacked structure and audio patterns', () => {
        const media = pool();
        const settings = {
            ...DEFAULT_TRAILER_SETTINGS,
            seed: 'exact-stacked-duration',
            targetDuration: 12,
            shortestClip: 0.4,
            longestClip: 1.2,
            sequencePresetIds: ['a-b-roll', 'multi-track-split', 'j-cut', 'audio-ducking'],
        };
        const raw = generateTrailerSequence(media, settings);
        const clips = finalizeGeneratedSequence(raw, media, settings, FPS);
        // Multi-track presets (a-b-roll, multi-track-split) create overlapping clips
        // on V1/V2. The correct measure is the timeline span, not sum-of-durations.
        const timelineEnd = Math.max(...clips.map(clip => clip.endFrame));

        expect(timelineEnd).toBe(settings.targetDuration * FPS);
        expect(clips.some(clip => (clip as any)._audioLeadFrames)).toBe(true);
        expect(clips.every(clip => (clip as any)._duckBgMusic)).toBe(true);
    });

    it('does not apply legacy pacing post-processors after generator pacing', () => {
        const base = generateTrailerSequence(pool(3), {
            ...DEFAULT_TRAILER_SETTINGS,
            seed: 'generator-pacing-only',
            targetDuration: 4,
        });
        const before = base.map(clip => clip.endFrame - clip.startFrame);
        const after = applySequencePresetStack(base, ['montage-rapid'], FPS)
            .map(clip => clip.endFrame - clip.startFrame);

        expect(after).toEqual(before);
    });
});
