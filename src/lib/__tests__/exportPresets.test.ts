import { describe, it, expect } from 'vitest';
import {
    aspectRatioToOrientation,
    estimateFileSize,
    getOutputDimensions,
    getQualityArgs,
    EXPORT_PRESETS,
    FPS_OPTIONS,
} from '../exportPresets';

describe('aspectRatioToOrientation', () => {
    it('maps 9:16 to portrait', () => {
        expect(aspectRatioToOrientation('9:16')).toBe('portrait');
    });
    it('maps 16:9 to landscape', () => {
        expect(aspectRatioToOrientation('16:9')).toBe('landscape');
    });
    it('maps 1:1 to square', () => {
        expect(aspectRatioToOrientation('1:1')).toBe('square');
    });
    it('maps 4:3 to landscape', () => {
        expect(aspectRatioToOrientation('4:3')).toBe('landscape');
    });
    it('maps 21:9 to landscape', () => {
        expect(aspectRatioToOrientation('21:9')).toBe('landscape');
    });
    it('defaults to landscape for unknown ratios', () => {
        expect(aspectRatioToOrientation('3:2')).toBe('landscape');
    });
});

describe('getOutputDimensions', () => {
    // Use a 1080p preset for testing
    const preset1080p = EXPORT_PRESETS.find(p => p.width === 1920 && p.height === 1080);

    it('returns landscape dimensions by default', () => {
        if (!preset1080p) return;
        const { w, h } = getOutputDimensions(preset1080p, 'landscape');
        expect(w).toBe(1920);
        expect(h).toBe(1080);
    });

    it('swaps dimensions for portrait', () => {
        if (!preset1080p) return;
        const { w, h } = getOutputDimensions(preset1080p, 'portrait');
        expect(w).toBe(1080);
        expect(h).toBe(1920);
    });

    it('uses smaller dimension for square', () => {
        if (!preset1080p) return;
        const { w, h } = getOutputDimensions(preset1080p, 'square');
        expect(w).toBe(1080);
        expect(h).toBe(1080);
    });
});

describe('estimateFileSize', () => {
    it('returns a positive number for valid inputs', () => {
        const preset = EXPORT_PRESETS[0];
        const size = estimateFileSize(preset, 'standard', 30);
        expect(size).toBeGreaterThan(0);
    });

    it('scales linearly with duration', () => {
        const preset = EXPORT_PRESETS[0];
        const size30 = estimateFileSize(preset, 'standard', 30);
        const size60 = estimateFileSize(preset, 'standard', 60);
        expect(size60).toBeCloseTo(size30 * 2, 0);
    });

    it('master quality produces larger files than draft', () => {
        // Use a CRF-mode preset (bitrate=0) so quality multiplier actually applies
        const crfPreset = EXPORT_PRESETS.find(p => p.bitrate === 0) || EXPORT_PRESETS[0];
        const draft = estimateFileSize(crfPreset, 'draft', 30);
        const master = estimateFileSize(crfPreset, 'master', 30);
        expect(master).toBeGreaterThan(draft);
    });
});

describe('getQualityArgs', () => {
    it('returns CRF args for h264 standard', () => {
        const args = getQualityArgs('standard', 'libx264', 0);
        expect(args).toContain('-crf');
        expect(args).toContain('20');
        expect(args).toContain('-preset');
        expect(args).toContain('medium');
    });

    it('returns CRF args for h265 standard', () => {
        const args = getQualityArgs('standard', 'libx265', 0);
        expect(args).toContain('-crf');
        expect(args).toContain('24');
    });

    it('uses bitrate mode when targetBitrate > 0', () => {
        const args = getQualityArgs('standard', 'libx264', 8000);
        expect(args).toContain('-b:v');
        expect(args).toContain('8000k');
        expect(args).toContain('-maxrate');
    });

    it('draft quality uses faster preset', () => {
        const args = getQualityArgs('draft', 'libx264', 0);
        expect(args).toContain('veryfast');
    });

    it('master quality uses slower preset', () => {
        const args = getQualityArgs('master', 'libx264', 0);
        expect(args).toContain('slow');
    });
});

describe('EXPORT_PRESETS', () => {
    it('has at least 5 presets', () => {
        expect(EXPORT_PRESETS.length).toBeGreaterThanOrEqual(5);
    });

    it('all presets have required fields', () => {
        for (const p of EXPORT_PRESETS) {
            expect(p.id).toBeTruthy();
            expect(p.name).toBeTruthy();
            expect(p.width).toBeGreaterThan(0);
            expect(p.height).toBeGreaterThan(0);
            expect(p.fps).toBeGreaterThanOrEqual(0); // fps=0 means 'Match Source'
            expect(['libx264', 'libx265']).toContain(p.codec);
        }
    });
});

describe('FPS_OPTIONS', () => {
    it('includes standard frame rates', () => {
        const values = FPS_OPTIONS.map(o => o.value);
        expect(values).toContain(24);
        expect(values).toContain(30);
        expect(values).toContain(60);
    });
});
