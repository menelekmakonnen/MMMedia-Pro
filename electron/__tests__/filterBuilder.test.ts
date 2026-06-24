import { describe, it, expect } from 'vitest';
import {
    buildZoompanFilter,
    buildAtempoChain,
    buildVideoFilter,
    buildAudioFilter,
    shouldUseIntermediateForReverse,
    buildQualityArgs,
    ClipExportData,
    ExportSettings,
    ProbeData,
} from '../filterBuilder';

// ── Test helpers ──
const baseClip: ClipExportData = {
    path: '/test/video.mp4',
    startFrame: 0,
    endFrame: 90, // 3 seconds at 30fps
    speed: 1.0,
    volume: 100,
    isMuted: false,
};

const baseSettings: ExportSettings = {
    width: 1920,
    height: 1080,
    fps: 30,
    quality: 'standard',
    codec: 'h264',
};

const baseProbe: ProbeData = {
    width: 1920,
    height: 1080,
    duration: 60.0,
};

describe('buildVideoFilter — beat-effect resilience (regression)', () => {
    it('does not throw when beatTimestamps contain undefined/NaN entries', () => {
        const clip: ClipExportData = {
            ...baseClip,
            beatTimestamps: [0.1, undefined as any, NaN, 0.8],
            beatEffect: {
                flash: { intensity: 0.4, color: '#fff', durationFrames: 3 },
                chromatic: { offset: 6, durationFrames: 3 },
                zoom: { punchScale: 1.05, durationFrames: 3 },
            },
        };
        expect(() => buildVideoFilter(clip, baseSettings, baseProbe, { preSeeked: true, padToSlot: true })).not.toThrow();
    });
    it('does not throw when a beat-effect scalar is missing', () => {
        const clip: ClipExportData = {
            ...baseClip,
            beatTimestamps: [0.2, 0.5],
            beatEffect: { zoom: { punchScale: undefined as any, durationFrames: undefined as any } },
        };
        expect(() => buildVideoFilter(clip, baseSettings, baseProbe, { preSeeked: true })).not.toThrow();
    });
});

describe('buildAtempoChain', () => {
    it('returns empty string for speed 1.0', () => {
        expect(buildAtempoChain(1.0)).toBe('');
    });
    it('returns single atempo for speed 2.0', () => {
        expect(buildAtempoChain(2.0)).toBe('atempo=2.0000');
    });
    it('returns single atempo for speed 0.5', () => {
        expect(buildAtempoChain(0.5)).toBe('atempo=0.5000');
    });
    it('chains atempo for speed 0.25', () => {
        const result = buildAtempoChain(0.25);
        expect(result).toBe('atempo=0.5,atempo=0.5000');
    });
    it('chains atempo for speed 4.0', () => {
        const result = buildAtempoChain(4.0);
        expect(result).toBe('atempo=2.0,atempo=2.0000');
    });
    it('handles speed 0.125', () => {
        const result = buildAtempoChain(0.125);
        expect(result).toBe('atempo=0.5,atempo=0.5,atempo=0.5000');
    });
    it('handles speed 1.5', () => {
        const result = buildAtempoChain(1.5);
        expect(result).toBe('atempo=1.5000');
    });
});

describe('buildZoompanFilter', () => {
    it('returns empty string for no zoom', () => {
        const clip = { ...baseClip, zoomStart: 100, zoomEnd: 100 };
        expect(buildZoompanFilter(clip, 90, 1920, 1080, 30)).toBe('');
    });
    it('returns empty string when zoom values are undefined', () => {
        expect(buildZoompanFilter(baseClip, 90, 1920, 1080, 30)).toBe('');
    });
    it('generates zoompan filter for zoom in', () => {
        const clip = { ...baseClip, zoomStart: 100, zoomEnd: 120 };
        const result = buildZoompanFilter(clip, 90, 1920, 1080, 30);
        expect(result).toContain('zoompan=');
        expect(result).toContain('1.0000');
        expect(result).toContain('1.2000');
        expect(result).toContain('d=1');
        expect(result).toContain('s=1920x1080');
    });
    it('uses correct zoom origin', () => {
        const clip = { ...baseClip, zoomStart: 100, zoomEnd: 110, zoomOrigin: 'top' as const };
        const result = buildZoompanFilter(clip, 90, 1920, 1080, 30);
        // 'top' uses y='0'
        expect(result).toContain("y='0'");
    });
    it('handles static zoom level', () => {
        const clip = { ...baseClip, zoomLevel: 150 };
        const result = buildZoompanFilter(clip, 90, 1920, 1080, 30);
        expect(result).toContain('zoompan=');
        expect(result).toContain('1.5000'); // 150/100
    });
});

describe('shouldUseIntermediateForReverse', () => {
    it('returns false for clips <= 5 seconds', () => {
        const clip = { ...baseClip, startFrame: 0, endFrame: 150 }; // 5s
        expect(shouldUseIntermediateForReverse(clip, 30)).toBe(false);
    });
    it('returns true for clips > 5 seconds', () => {
        const clip = { ...baseClip, startFrame: 0, endFrame: 151 }; // 5.03s
        expect(shouldUseIntermediateForReverse(clip, 30)).toBe(true);
    });
    it('considers FPS in duration calculation', () => {
        const clip = { ...baseClip, startFrame: 0, endFrame: 300 };
        // At 30fps: 10s → true
        expect(shouldUseIntermediateForReverse(clip, 30)).toBe(true);
        // At 60fps: 5s → false
        expect(shouldUseIntermediateForReverse(clip, 60)).toBe(false);
    });
});

describe('buildVideoFilter', () => {
    it('includes trim, setpts, scale, pad, fps for basic clip', () => {
        const result = buildVideoFilter(baseClip, baseSettings, baseProbe);
        expect(result).toContain('trim=');
        expect(result).toContain('setpts=PTS-STARTPTS');
        expect(result).toContain('scale=1920:1080');
        expect(result).toContain('pad=1920:1080');
        expect(result).toContain('fps=fps=30');
    });
    it('includes reverse filter for short reversed clips', () => {
        const clip = { ...baseClip, reversed: true }; // 3s, under 5s threshold
        const result = buildVideoFilter(clip, baseSettings, baseProbe);
        expect(result).toContain('reverse');
    });
    it('does NOT include reverse filter for long reversed clips', () => {
        const clip = { ...baseClip, reversed: true, startFrame: 0, endFrame: 300 }; // 10s
        const result = buildVideoFilter(clip, baseSettings, baseProbe);
        expect(result).not.toContain(',reverse,');
    });
    it('includes speed adjustment via setpts for fast clips', () => {
        const clip = { ...baseClip, speed: 2.0 };
        const result = buildVideoFilter(clip, baseSettings, baseProbe);
        expect(result).toContain('setpts=0.5000*PTS');
    });
    it('wraps speed curve setpts in FFmpeg single quotes', () => {
        // Speed remap expressions use if()/lt()/log() which contain commas.
        // Without single quotes, FFmpeg's filter_complex parser splits on those
        // commas, producing "No such filter: '0.5)'" errors.
        const clip = {
            ...baseClip,
            speed: 1.2,
            speedCurve: [
                { time: 0, speed: 0.8 },
                { time: 0.5, speed: 1.0 },
                { time: 1.0, speed: 1.6 },
            ],
        };
        const result = buildVideoFilter(clip, baseSettings, baseProbe);
        // The setpts value must be wrapped in single quotes
        expect(result).toMatch(/setpts='[^']+'/);
        // Must contain the nested if() expression (not the simple X*PTS form)
        expect(result).toMatch(/setpts='.*if\(/);
    });
    it('includes rotation filter', () => {
        const clip = { ...baseClip, rotation: 90 };
        const result = buildVideoFilter(clip, baseSettings, baseProbe);
        expect(result).toContain('transpose=1');
    });
    it('includes zoompan for zoomed clips', () => {
        const clip = { ...baseClip, zoomStart: 100, zoomEnd: 120 };
        const result = buildVideoFilter(clip, baseSettings, baseProbe);
        expect(result).toContain('zoompan=');
    });
    it('includes effects for clips with effect IDs', () => {
        const clip = { ...baseClip, effectIds: ['fx_bw_contrast'] };
        const result = buildVideoFilter(clip, baseSettings, baseProbe);
        expect(result).toContain('hue=s=0');
        expect(result).toContain('eq=contrast=1.2');
    });
    it('clamps trim to source duration', () => {
        const shortProbe = { ...baseProbe, duration: 2.0 }; // Source is only 2s
        const clip = { ...baseClip, startFrame: 0, endFrame: 90 }; // Wants 3s
        const result = buildVideoFilter(clip, baseSettings, shortProbe);
        // Should not crash and should produce valid filter
        expect(result).toContain('trim=');
    });
});

describe('buildAudioFilter', () => {
    it('includes atrim, asetpts, volume for basic clip', () => {
        const result = buildAudioFilter(baseClip, baseSettings);
        expect(result).toContain('atrim=');
        expect(result).toContain('asetpts=PTS-STARTPTS');
        expect(result).toContain('volume=1.0000');
    });
    it('applies mute via zero volume', () => {
        const clip = { ...baseClip, isMuted: true };
        const result = buildAudioFilter(clip, baseSettings);
        expect(result).toContain('volume=0.0000');
    });
    it('includes atempo for speed changes', () => {
        const clip = { ...baseClip, speed: 2.0 };
        const result = buildAudioFilter(clip, baseSettings);
        expect(result).toContain('atempo=');
    });
    it('applies volume percentage', () => {
        const clip = { ...baseClip, volume: 50 };
        const result = buildAudioFilter(clip, baseSettings);
        expect(result).toContain('volume=0.5000');
    });
    it('includes areverse for short reversed clips', () => {
        const clip = { ...baseClip, reversed: true };
        const result = buildAudioFilter(clip, baseSettings);
        expect(result).toContain('areverse');
    });
});

describe('buildQualityArgs', () => {
    it('includes codec for h264', () => {
        const args = buildQualityArgs(baseSettings);
        expect(args).toContain('-c:v');
        expect(args).toContain('libx264');
    });
    it('uses hevc codec', () => {
        const settings = { ...baseSettings, codec: 'hevc' as const };
        const args = buildQualityArgs(settings);
        expect(args).toContain('libx265');
    });
    it('includes CRF in default mode', () => {
        const args = buildQualityArgs(baseSettings);
        expect(args).toContain('-crf');
    });
    it('uses bitrate mode when specified', () => {
        const args = buildQualityArgs(baseSettings, true, 5000);
        expect(args).toContain('-b:v');
        expect(args).toContain('5000k');
    });
    it('includes color space args', () => {
        const args = buildQualityArgs(baseSettings);
        expect(args).toContain('-pix_fmt');
        expect(args).toContain('yuv420p');
        expect(args).toContain('-movflags');
    });
    it('adjusts preset for quality levels', () => {
        const draft = buildQualityArgs({ ...baseSettings, quality: 'draft' });
        const master = buildQualityArgs({ ...baseSettings, quality: 'master' });
        expect(draft).toContain('veryfast');
        expect(master).toContain('slow');
    });
});
