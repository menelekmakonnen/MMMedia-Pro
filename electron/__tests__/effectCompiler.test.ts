import { describe, it, expect } from 'vitest';
import { cssToFfmpeg, resolveEffectFilter, isEffectExportable, getUnexportableEffects } from '../effectCompiler';

describe('cssToFfmpeg', () => {
    it('returns empty string for empty input', () => {
        expect(cssToFfmpeg('')).toBe('');
    });
    it('returns empty string for null/undefined', () => {
        expect(cssToFfmpeg(null as any)).toBe('');
        expect(cssToFfmpeg(undefined as any)).toBe('');
    });
    it('transpiles hue-rotate', () => {
        expect(cssToFfmpeg('hue-rotate(50deg)')).toBe('hue=h=50');
        expect(cssToFfmpeg('hue-rotate(180deg)')).toBe('hue=h=180');
    });
    it('transpiles saturate', () => {
        expect(cssToFfmpeg('saturate(150%)')).toBe('eq=saturation=1.50');
    });
    it('transpiles brightness', () => {
        // brightness(100%) = normal = eq=brightness=0.00
        expect(cssToFfmpeg('brightness(100%)')).toBe('eq=brightness=0.00');
        // brightness(110%) = +10% = eq=brightness=0.10
        expect(cssToFfmpeg('brightness(110%)')).toBe('eq=brightness=0.10');
    });
    it('transpiles contrast', () => {
        expect(cssToFfmpeg('contrast(120%)')).toBe('eq=contrast=1.20');
    });
    it('transpiles grayscale 100%', () => {
        expect(cssToFfmpeg('grayscale(100%)')).toBe('hue=s=0');
    });
    it('transpiles blur', () => {
        expect(cssToFfmpeg('blur(2px)')).toBe('boxblur=2:2');
    });
    it('transpiles invert 100%', () => {
        expect(cssToFfmpeg('invert(100%)')).toBe('negate');
    });
    it('merges consecutive eq= filters', () => {
        const result = cssToFfmpeg('saturate(150%) brightness(110%)');
        expect(result).toBe('eq=saturation=1.50:brightness=0.10');
    });
    it('handles multi-filter chains', () => {
        const result = cssToFfmpeg('hue-rotate(50deg) sepia(25%)');
        expect(result).toContain('hue=h=50');
        expect(result).toContain('colorchannelmixer=');
    });
    it('transpiles sepia with matrix blending', () => {
        const result = cssToFfmpeg('sepia(100%)');
        expect(result).toContain('colorchannelmixer=');
        // Full sepia should contain the sepia rr coefficient 0.393
        expect(result).toContain('0.393');
    });
    it('handles unknown filters gracefully', () => {
        expect(cssToFfmpeg('fakefunc(50%)')).toBe('');
    });
});

describe('resolveEffectFilter', () => {
    it('returns empty string for empty input', () => {
        expect(resolveEffectFilter('')).toBe('');
    });
    it('resolves hardcoded effects', () => {
        const result = resolveEffectFilter('fx_bw_contrast');
        expect(result).toBe('hue=s=0,eq=contrast=1.2');
    });
    it('resolves CSS-mapped effects via transpilation', () => {
        const result = resolveEffectFilter('fx_gen_5');
        expect(result).toContain('hue=h=50');
    });
    it('transpiles raw CSS strings', () => {
        const result = resolveEffectFilter('saturate(200%)');
        expect(result).toBe('eq=saturation=2.00');
    });
    it('returns empty string for unknown effect ID', () => {
        expect(resolveEffectFilter('fx_nonexistent')).toBe('');
    });
});

describe('isEffectExportable', () => {
    it('returns true for hardcoded effects', () => {
        expect(isEffectExportable('fx_bw_contrast')).toBe(true);
        expect(isEffectExportable('fx_vhs_glitch')).toBe(true);
    });
    it('returns true for CSS-mapped effects', () => {
        expect(isEffectExportable('fx_gen_5')).toBe(true);
    });
    it('returns false for unknown effects', () => {
        expect(isEffectExportable('fx_nonexistent')).toBe(false);
    });
    it('returns false for empty string', () => {
        expect(isEffectExportable('')).toBe(false);
    });
});

describe('getUnexportableEffects', () => {
    it('returns empty array for all-exportable list', () => {
        expect(getUnexportableEffects(['fx_bw_contrast', 'fx_gen_5'])).toEqual([]);
    });
    it('returns unknown effects', () => {
        expect(getUnexportableEffects(['fx_bw_contrast', 'fx_nonexistent'])).toEqual(['fx_nonexistent']);
    });
    it('handles empty array', () => {
        expect(getUnexportableEffects([])).toEqual([]);
    });
});
