// Run with:  npx vitest run src/lib/__tests__/aeEffects.test.ts
//
// GUARANTEE: every AE-derived effect added to the registry resolves to a real,
// non-empty FFmpeg filter fragment (so it actually renders), the renderer-side
// and electron-side resolvers stay in lock-step, and every look pack references
// only real registry effects with numeric params.
import { describe, it, expect } from 'vitest';
import {
    EFFECT_REGISTRY,
    resolveParametricEffect,
    getDefaultParams,
    getEffectById,
} from '../effectRegistry';
import { resolveParametricEffect as resolveElectron } from '../../../electron/parametricEffects';
import { LOOK_PACKS, validateLookPacks, applyLookPack, getLookPack } from '../ege/lookPacks';
import type { ProjectSettings } from '../../types';

const AE_EFFECTS = [
    'hue_saturation',
    'tritone',
    'find_edges',
    'glowing_edges',
    'film_emulation',
    'wave_warp',
    'turbulent_displace',
    'digital_glitch',
    // batch 2
    'invert',
    'brightness_contrast',
    'threshold',
    'mosaic',
    'posterize_time',
    'fisheye',
    'scatter',
] as const;

describe('AE-derived effects — registry presence', () => {
    it('every AE effect is registered with parameters', () => {
        for (const id of AE_EFFECTS) {
            const def = getEffectById(id);
            expect(def, `${id} should be registered`).toBeTruthy();
            expect(def!.parameters.length, `${id} should expose params`).toBeGreaterThan(0);
        }
    });
});

describe('AE-derived effects — resolve to real FFmpeg', () => {
    it('each resolves to a non-empty filter at defaults', () => {
        for (const id of AE_EFFECTS) {
            const out = resolveParametricEffect(id, getDefaultParams(id));
            expect(out, `${id} should resolve`).toBeTruthy();
            expect(out.length, `${id} should be non-empty`).toBeGreaterThan(0);
        }
    });

    it('produces the expected FFmpeg primitives', () => {
        expect(resolveParametricEffect('hue_saturation', { hue: 120, sat: 1.4 })).toBe('hue=h=120:s=1.4');
        expect(resolveParametricEffect('tritone', getDefaultParams('tritone'))).toContain('colorbalance=');
        expect(resolveParametricEffect('find_edges', { low: 0.1, high: 0.4, invert: true })).toBe(
            'edgedetect=low=0.100:high=0.400:mode=colormix,negate',
        );
        expect(resolveParametricEffect('find_edges', { low: 0.1, high: 0.4, invert: false })).toBe(
            'edgedetect=low=0.100:high=0.400:mode=colormix',
        );
        expect(resolveParametricEffect('glowing_edges', getDefaultParams('glowing_edges'))).toContain('edgedetect=mode=wires');
        expect(resolveParametricEffect('film_emulation', getDefaultParams('film_emulation'))).toContain('curves=all=');
        // batch 2
        expect(resolveParametricEffect('invert', { enabled: true })).toBe('negate');
        expect(resolveParametricEffect('invert', { enabled: false })).toBe('');
        expect(resolveParametricEffect('brightness_contrast', { brightness: 0.2, contrast: 1.6 })).toBe('eq=brightness=0.2:contrast=1.6');
        expect(resolveParametricEffect('threshold', { level: 140 })).toContain('lutyuv=');
        expect(resolveParametricEffect('mosaic', { size: 8 })).toBe('scale=iw/8:ih/8:flags=neighbor,scale=iw*8:ih*8:flags=neighbor');
        expect(resolveParametricEffect('posterize_time', { rate: 12 })).toBe('fps=fps=12');
        expect(resolveParametricEffect('fisheye', { amount: 40 })).toContain('lenscorrection=');
        expect(resolveParametricEffect('scatter', { amount: 0 })).toBe('');
    });

    it('geq effects escape internal commas so they survive the -vf join', () => {
        for (const id of ['wave_warp', 'turbulent_displace', 'digital_glitch', 'scatter']) {
            const out = resolveParametricEffect(id, getDefaultParams(id));
            expect(out, `${id} uses geq`).toContain('geq=');
            expect(out, `${id} escapes commas`).toContain('\\,');
            // The pixel-lookup terminator must always be escaped: no bare `,Y)`.
            expect(/(?<!\\),Y\)/.test(out), `${id} has no unescaped comma before Y)`).toBe(false);
        }
    });

    it('amount/amplitude/intensity of 0 disables the geq displacement effects', () => {
        expect(resolveParametricEffect('wave_warp', { amplitude: 0, wavelength: 18, speed: 3 })).toBe('');
        expect(resolveParametricEffect('turbulent_displace', { amount: 0, scale: 7 })).toBe('');
        expect(resolveParametricEffect('digital_glitch', { intensity: 0 })).toBe('');
    });

    it('clamps out-of-range params without throwing', () => {
        expect(() => resolveParametricEffect('tritone', { intensity: 999, warmth: -999 })).not.toThrow();
        expect(() => resolveParametricEffect('wave_warp', { amplitude: 9999, wavelength: 0, speed: -5 })).not.toThrow();
    });
});

describe('AE-derived effects — renderer/electron parity', () => {
    it('renderer and electron resolvers agree at defaults for every effect', () => {
        for (const def of EFFECT_REGISTRY) {
            const params = getDefaultParams(def.id);
            const a = resolveParametricEffect(def.id, params);
            const b = resolveElectron(def.id, params as Record<string, number | string | boolean>);
            expect(b, `electron mirror should match for ${def.id}`).toBe(a);
        }
    });
});

describe('Look packs', () => {
    it('all packs are valid (known effects, numeric params)', () => {
        expect(validateLookPacks()).toEqual([]);
    });

    it('every pack resolves all its effects to real FFmpeg', () => {
        for (const pack of LOOK_PACKS) {
            for (const e of pack.effects) {
                const out = resolveParametricEffect(e.effectId, e.params);
                expect(out, `${pack.id}/${e.effectId} should resolve`).toBeTruthy();
            }
        }
    });

    it('applyLookPack sets globalEffects and clears them', () => {
        const base = { id: 'p', name: 'P' } as unknown as ProjectSettings;
        const withLook = applyLookPack(base, 'cinematic_tritone');
        expect(withLook.globalEffects?.length).toBe(getLookPack('cinematic_tritone')!.effects.length);
        const cleared = applyLookPack(withLook, null);
        expect(cleared.globalEffects).toBeUndefined();
        // purity: original untouched
        expect((base as ProjectSettings).globalEffects).toBeUndefined();
    });

    it('unknown pack id is a no-op', () => {
        const base = { id: 'p' } as unknown as ProjectSettings;
        expect(applyLookPack(base, 'does_not_exist')).toBe(base);
    });
});
