// ══════════════════════════════════════════════════════════════════════════════
// parametricEffects.ts — Parametric Effect Resolver (Electron Main Process)
// Re-exports the core resolver logic for use in filterBuilder.ts.
//
// Because the electron/ tsconfig has rootDir='.', we cannot import directly
// from ../src/lib/effectRegistry.ts. Instead, this file contains a self-
// contained copy of the resolver logic optimised for the export pipeline.
// The UI-facing effect definitions live in src/lib/effectRegistry.ts.
// ══════════════════════════════════════════════════════════════════════════════

// ── Sepia blending matrices ─────────────────────────────────────────────────
const IDENTITY = { rr: 1, rg: 0, rb: 0, gr: 0, gg: 1, gb: 0, br: 0, bg: 0, bb: 1 };
const SEPIA    = { rr: 0.393, rg: 0.769, rb: 0.189, gr: 0.349, gg: 0.686, gb: 0.168, br: 0.272, bg: 0.534, bb: 0.131 };

function buildSepiaFilter(intensity: number): string {
    const t = Math.max(0, Math.min(100, intensity)) / 100;
    const lerp = (a: number, b: number) => a * (1 - t) + b * t;
    return `colorchannelmixer=${lerp(IDENTITY.rr, SEPIA.rr).toFixed(3)}:${lerp(IDENTITY.rg, SEPIA.rg).toFixed(3)}:${lerp(IDENTITY.rb, SEPIA.rb).toFixed(3)}:0:${lerp(IDENTITY.gr, SEPIA.gr).toFixed(3)}:${lerp(IDENTITY.gg, SEPIA.gg).toFixed(3)}:${lerp(IDENTITY.gb, SEPIA.gb).toFixed(3)}:0:${lerp(IDENTITY.br, SEPIA.br).toFixed(3)}:${lerp(IDENTITY.bg, SEPIA.bg).toFixed(3)}:${lerp(IDENTITY.bb, SEPIA.bb).toFixed(3)}:0`;
}

// ── Effect template map ─────────────────────────────────────────────────────
// Mirrors src/lib/effectRegistry.ts EFFECT_REGISTRY but only stores the
// ffmpegTemplate and parameter defaults needed for resolution.
interface EffectDef {
    template: string;
    defaults: Record<string, number | string | boolean>;
}

const EFFECTS: Record<string, EffectDef> = {
    color_temperature:      { template: 'colortemperature=temperature={{temp}}', defaults: { temp: 6500 } },
    color_balance:          { template: 'colorbalance=rs={{rs}}:gs={{gs}}:bs={{bs}}:rm={{rm}}:gm={{gm}}:bm={{bm}}:rh={{rh}}:gh={{gh}}:bh={{bh}}', defaults: { rs: 0, gs: 0, bs: 0, rm: 0, gm: 0, bm: 0, rh: 0, gh: 0, bh: 0 } },
    color_curves:           { template: 'curves=preset={{preset}}', defaults: { preset: 'none' } },
    levels:                 { template: 'levels=rmin={{min}}:gmin={{min}}:bmin={{min}}:rmax={{max}}:gmax={{max}}:bmax={{max}}', defaults: { min: 0, max: 255, gamma: 1.0 } },
    film_grain:             { template: 'noise=alls={{intensity}}:allf={{_noiseFlag}}', defaults: { intensity: 15, animated: true } },
    vignette:               { template: 'vignette=angle={{angle}}', defaults: { angle: 0.785 } },
    chromatic_aberration:   { template: 'rgbashift=rh={{rx}}:bh={{bx}}', defaults: { rx: 3, bx: -3 } },
    posterize:              { template: 'posterize={{bits}}', defaults: { bits: 4 } },
    duotone:                { template: 'hue=s=0,colorbalance=rh={{r}}:gh={{g}}:bh={{b}}', defaults: { r: 0.3, g: 0, b: 0.5 } },
    sepia_advanced:         { template: '{{_sepiaFilter}}', defaults: { intensity: 50 } },
    gaussian_blur:          { template: 'gblur=sigma={{sigma}}', defaults: { sigma: 3 } },
    box_blur:               { template: 'boxblur={{radius}}:{{radius}}', defaults: { radius: 3 } },
    sharpen:                { template: 'unsharp=5:5:{{amount}}:5:5:0', defaults: { amount: 1.5 } },
    clarity:                { template: 'unsharp=7:7:{{amount}}:7:7:0', defaults: { amount: 1.0 } },
    lens_distortion:        { template: 'lenscorrection=k1={{k1}}:k2={{k2}}', defaults: { k1: 0, k2: 0 } },
    mirror_h:               { template: 'hflip', defaults: { enabled: true } },
    mirror_v:               { template: 'vflip', defaults: { enabled: true } },
    // Added effects (mirror src/lib/effectRegistry.ts)
    exposure:               { template: 'exposure=exposure={{ev}}', defaults: { ev: 0 } },
    vibrance:               { template: 'vibrance=intensity={{amt}}', defaults: { amt: 0.5 } },
    deflicker:              { template: 'deflicker=size={{size}}:mode=am', defaults: { size: 10 } },
    deband:                 { template: 'deband=range={{range}}', defaults: { range: 16 } },
    edge_detect:            { template: 'edgedetect=low={{low}}:high={{high}}', defaults: { low: 0.1, high: 0.4 } },
    denoise:                { template: 'hqdn3d={{luma}}:{{luma}}:6:6', defaults: { luma: 4 } },
};

function buildLevelsFilter(min: number, max: number, gamma: number): string {
    const lo = Math.max(0, Math.min(255, isFinite(min) ? min : 0)) / 255;
    const hi = Math.max(0, Math.min(255, isFinite(max) ? max : 255)) / 255;
    const g = isFinite(gamma) && gamma > 0 ? gamma : 1.0;
    const parts: string[] = [];
    if (lo > 0.0001 || hi < 0.9999) {
        parts.push(
            `colorlevels=rimin=${lo.toFixed(4)}:gimin=${lo.toFixed(4)}:bimin=${lo.toFixed(4)}:` +
            `rimax=${hi.toFixed(4)}:gimax=${hi.toFixed(4)}:bimax=${hi.toFixed(4)}`
        );
    }
    if (Math.abs(g - 1.0) > 0.001) parts.push(`eq=gamma=${g.toFixed(4)}`);
    return parts.join(',');
}

/**
 * Resolve a parametric effect ID + parameters to an FFmpeg filter string.
 *
 * @param effectId - Effect identifier (e.g. 'color_temperature')
 * @param params   - Parameter overrides; missing keys use defaults
 * @returns Fully resolved FFmpeg filter string, or '' if not found / disabled
 */
export function resolveParametricEffect(
    effectId: string,
    params: Record<string, number | string | boolean>
): string {
    const def = EFFECTS[effectId];
    if (!def) return '';

    // Merge with defaults
    const p: Record<string, number | string | boolean> = { ...def.defaults, ...params };

    // Toggle-based effects
    if ((effectId === 'mirror_h' || effectId === 'mirror_v') && !p['enabled']) return '';

    // Film grain: compute noise flag
    if (effectId === 'film_grain') {
        (p as any)['_noiseFlag'] = p['animated'] ? 't+u' : 'u';
    }

    // Sepia advanced: dynamic colorchannelmixer
    if (effectId === 'sepia_advanced') {
        return buildSepiaFilter(Number(p['intensity']));
    }

    // Color curves "none" → skip
    if (effectId === 'color_curves' && p['preset'] === 'none') return '';

    if (effectId === 'levels') {
        return buildLevelsFilter(Number(p['min']), Number(p['max']), Number(p['gamma']));
    }

    // Substitute {{key}} placeholders
    let filter = def.template;
    for (const [key, value] of Object.entries(p)) {
        const ph = `{{${key}}}`;
        if (filter.includes(ph)) {
            filter = filter.split(ph).join(String(value));
        }
    }

    return filter;
}

// ══════════════════════════════════════════════════════════════════════════════
// COLOR GRADING FILTER BUILDER  (mirrors src/lib/colorGrading.ts)
// ══════════════════════════════════════════════════════════════════════════════

export interface ColorGrading {
    temperature: number;
    tint: number;
    exposure: number;
    contrast: number;
    highlights: number;
    shadows: number;
    saturation: number;
    vibrance: number;
    /** Lift (shadows) RGB offset, -1..1 each (0 = neutral) */
    lift?: [number, number, number];
    /** Gamma (midtones) RGB, 0.1..3 each (1 = neutral) */
    gamma?: [number, number, number];
    /** Gain (highlights) RGB, -1..1 each (0 = neutral) */
    gain?: [number, number, number];
    lutFile?: string;
}

const DEFAULTS: ColorGrading = {
    temperature: 0, tint: 0, exposure: 0, contrast: 1.0,
    highlights: 0, shadows: 0, saturation: 1.0, vibrance: 1.0,
};

export function isDefaultGrading(g: ColorGrading): boolean {
    return (
        g.temperature === DEFAULTS.temperature &&
        g.tint === DEFAULTS.tint &&
        g.exposure === DEFAULTS.exposure &&
        g.contrast === DEFAULTS.contrast &&
        g.highlights === DEFAULTS.highlights &&
        g.shadows === DEFAULTS.shadows &&
        g.saturation === DEFAULTS.saturation &&
        g.vibrance === DEFAULTS.vibrance &&
        isNeutralWheels(g) &&
        !g.lutFile
    );
}

function isNeutralWheels(g: ColorGrading): boolean {
    const tri = (t: [number, number, number] | undefined, n: number) => !t || (t[0] === n && t[1] === n && t[2] === n);
    return tri(g.lift, 0) && tri(g.gain, 0) && tri(g.gamma, 1);
}
function buildWheelFilters(g: ColorGrading): string {
    const out: string[] = [];
    const cb: string[] = [];
    if (g.lift && (g.lift[0] || g.lift[1] || g.lift[2])) {
        cb.push(`rs=${g.lift[0].toFixed(4)}`, `gs=${g.lift[1].toFixed(4)}`, `bs=${g.lift[2].toFixed(4)}`);
    }
    if (g.gain && (g.gain[0] || g.gain[1] || g.gain[2])) {
        cb.push(`rh=${g.gain[0].toFixed(4)}`, `gh=${g.gain[1].toFixed(4)}`, `bh=${g.gain[2].toFixed(4)}`);
    }
    if (cb.length) out.push(`colorbalance=${cb.join(':')}`);
    if (g.gamma && (g.gamma[0] !== 1 || g.gamma[1] !== 1 || g.gamma[2] !== 1)) {
        out.push(`eq=gamma_r=${g.gamma[0].toFixed(4)}:gamma_g=${g.gamma[1].toFixed(4)}:gamma_b=${g.gamma[2].toFixed(4)}`);
    }
    return out.join(',');
}

export function buildColorGradingFilter(g: ColorGrading): string {
    if (isDefaultGrading(g)) return '';
    const filters: string[] = [];

    const cgWheels = buildWheelFilters(g);
    if (cgWheels) filters.push(cgWheels);

    // Temperature: -100..100 → 2000..10000 K
    if (g.temperature !== 0) {
        const kelvin = Math.round(6500 + (g.temperature / 100) * (g.temperature > 0 ? 3500 : 4500));
        filters.push(`colortemperature=temperature=${kelvin}`);
    }

    // Colorbalance: tint + highlights + shadows
    const cb: string[] = [];
    if (g.tint !== 0) cb.push(`gm=${(g.tint / 100).toFixed(4)}`);
    if (g.highlights !== 0) {
        const h = (g.highlights / 200).toFixed(4);
        cb.push(`rh=${h}`, `gh=${h}`, `bh=${h}`);
    }
    if (g.shadows !== 0) {
        const s = (g.shadows / 200).toFixed(4);
        cb.push(`rs=${s}`, `gs=${s}`, `bs=${s}`);
    }
    if (cb.length > 0) filters.push(`colorbalance=${cb.join(':')}`);

    // eq: exposure + contrast + saturation × vibrance
    const eq: string[] = [];
    if (g.exposure !== 0) eq.push(`brightness=${(g.exposure / 2).toFixed(4)}`);
    if (g.contrast !== 1.0) eq.push(`contrast=${g.contrast.toFixed(4)}`);
    const sat = g.saturation * g.vibrance;
    if (Math.abs(sat - 1.0) > 0.001) eq.push(`saturation=${sat.toFixed(4)}`);
    if (eq.length > 0) filters.push(`eq=${eq.join(':')}`);

    // LUT
    if (g.lutFile) {
        const escaped = g.lutFile.replace(/\\/g, '/').replace(/:/g, '\\:');
        filters.push(`lut3d=${escaped}`);
    }

    return filters.join(',');
}
