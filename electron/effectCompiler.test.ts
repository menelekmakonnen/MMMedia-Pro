// Run with:  npx vitest run electron/effectCompiler.test.ts
import { describe, it, expect } from 'vitest';
import {
    cssToFfmpeg,
    resolveEffectFilter,
    isEffectExportable,
    getUnexportableEffects,
} from './effectCompiler';

describe('cssToFfmpeg', () => {
    it('returns empty for empty / non-string input', () => {
        expect(cssToFfmpeg('')).toBe('');
        // @ts-expect-error testing runtime guard
        expect(cssToFfmpeg(null)).toBe('');
        expect(cssToFfmpeg('   ')).toBe('');
    });

    it('maps hue-rotate (positive)', () => {
        expect(cssToFfmpeg('hue-rotate(50deg)')).toBe('hue=h=50');
    });

    it('maps hue-rotate with NEGATIVE values (regression: old regex dropped these)', () => {
        expect(cssToFfmpeg('hue-rotate(-30deg)')).toBe('hue=h=-30');
    });

    it('converts radians and turns to degrees', () => {
        // pi rad = 180deg
        expect(cssToFfmpeg('hue-rotate(3.14159265rad)')).toBe('hue=h=180');
        expect(cssToFfmpeg('hue-rotate(0.5turn)')).toBe('hue=h=180');
    });

    it('maps full grayscale to hue=s=0', () => {
        expect(cssToFfmpeg('grayscale(100%)')).toBe('hue=s=0');
    });

    it('merges consecutive eq filters into one call', () => {
        // saturate(150%) -> eq=saturation=1.50, brightness(110%) -> eq=brightness=0.10
        expect(cssToFfmpeg('saturate(150%) brightness(110%)')).toBe(
            'eq=saturation=1.50:brightness=0.10'
        );
    });

    it('maps blur to boxblur', () => {
        expect(cssToFfmpeg('blur(2px)')).toBe('boxblur=2:2');
    });

    it('chains a color filter then an eq filter with a comma', () => {
        expect(cssToFfmpeg('grayscale(100%) contrast(120%)')).toBe(
            'hue=s=0,eq=contrast=1.20'
        );
    });

    it('handles decimals without a leading zero', () => {
        // sepia uses a matrix; just assert it produces a colorchannelmixer
        expect(cssToFfmpeg('sepia(.5)')).toContain('colorchannelmixer=');
    });

    it('ignores unmappable functions but keeps mappable neighbours', () => {
        expect(cssToFfmpeg('drop-shadow(2px) hue-rotate(20deg)')).toBe('hue=h=20');
        expect(cssToFfmpeg('opacity(50%)')).toBe('');
    });

    it('returns empty string for garbage input', () => {
        expect(cssToFfmpeg('not a filter at all')).toBe('');
    });
});

describe('resolveEffectFilter', () => {
    it('resolves hardcoded high-quality effects', () => {
        expect(resolveEffectFilter('fx_bw_contrast')).toBe('hue=s=0,eq=contrast=1.2');
    });

    it('resolves CSS-mapped generated effects (all 14 fx_gen_*)', () => {
        for (let n = 5; n <= 20; n++) {
            const id = `fx_gen_${n}`;
            const out = resolveEffectFilter(id);
            expect(out, `${id} should produce a filter`).not.toBe('');
        }
    });

    it('transpiles a raw CSS string passed directly', () => {
        expect(resolveEffectFilter('hue-rotate(90deg)')).toBe('hue=h=90');
    });

    it('returns empty for unknown ids', () => {
        expect(resolveEffectFilter('fx_does_not_exist')).toBe('');
    });
});

describe('exportability', () => {
    it('reports all shipped effects as exportable', () => {
        const all = [
            'fx_bw_contrast', 'fx_cinematic_teal_v1', 'fx_neon_glow_v1',
            'fx_vintage_film_v1',
            ...Array.from({ length: 16 }, (_, i) => `fx_gen_${i + 5}`),
        ];
        expect(getUnexportableEffects(all)).toEqual([]);
        for (const id of all) expect(isEffectExportable(id)).toBe(true);
    });

    it('flags unknown effect ids as unexportable', () => {
        expect(getUnexportableEffects(['fx_bw_contrast', 'fx_mystery'])).toEqual(['fx_mystery']);
    });
});
