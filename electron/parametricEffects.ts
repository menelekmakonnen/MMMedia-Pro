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
    // AE-derived effects (mirror src/lib/effectRegistry.ts). hue_saturation is a
    // plain template; the rest resolve through dynamic builders below.
    hue_saturation:         { template: 'hue=h={{hue}}:s={{sat}}', defaults: { hue: 0, sat: 1 } },
    tritone:                { template: '{{_tritone}}', defaults: { intensity: 60, warmth: 60 } },
    find_edges:             { template: '{{_findEdges}}', defaults: { low: 0.1, high: 0.4, invert: true } },
    glowing_edges:          { template: '{{_glowingEdges}}', defaults: { intensity: 60 } },
    film_emulation:         { template: '{{_filmEmulation}}', defaults: { strength: 60, grain: 12 } },
    wave_warp:              { template: '{{_waveWarp}}', defaults: { amplitude: 6, wavelength: 18, speed: 3 } },
    turbulent_displace:     { template: '{{_turbulent}}', defaults: { amount: 14, scale: 7 } },
    digital_glitch:         { template: '{{_digitalGlitch}}', defaults: { intensity: 50 } },
    invert:                 { template: 'negate', defaults: { enabled: true } },
    brightness_contrast:    { template: 'eq=brightness={{brightness}}:contrast={{contrast}}', defaults: { brightness: 0, contrast: 1 } },
    threshold:              { template: '{{_threshold}}', defaults: { level: 128 } },
    mosaic:                 { template: '{{_mosaic}}', defaults: { size: 8 } },
    posterize_time:         { template: 'fps=fps={{rate}}', defaults: { rate: 12 } },
    fisheye:                { template: '{{_fisheye}}', defaults: { amount: 40 } },
    scatter:                { template: '{{_scatter}}', defaults: { amount: 20 } },
};

// ── AE-derived effect builders (kept in sync with src/lib/effectRegistry.ts) ──
const _fxClamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, isFinite(v) ? v : lo));

function buildTritoneFilter(intensity: number, warmth: number): string {
    const t = _fxClamp(intensity, 0, 100) / 100;
    const w = _fxClamp(warmth, -100, 100) / 100;
    const s = Math.max(0, 1 - 0.85 * t).toFixed(3);
    const m = 0.35 * t * w;
    return `hue=s=${s},colorbalance=rs=${(-m).toFixed(3)}:bs=${m.toFixed(3)}:rh=${m.toFixed(3)}:bh=${(-m).toFixed(3)}`;
}
function buildFindEdgesFilter(low: number, high: number, invert: boolean): string {
    const lo = _fxClamp(low, 0, 1).toFixed(3);
    const hi = _fxClamp(high, 0, 1).toFixed(3);
    const base = `edgedetect=low=${lo}:high=${hi}:mode=colormix`;
    return invert ? `${base},negate` : base;
}
function buildGlowingEdgesFilter(intensity: number): string {
    const t = _fxClamp(intensity, 0, 100) / 100;
    const mid = (0.5 + 0.3 * t).toFixed(2);
    const sat = (1 + 0.6 * t).toFixed(2);
    return `edgedetect=mode=wires,negate,curves=all='0/0 0.45/${mid} 1/1',colorbalance=rh=-0.2:bh=0.3,eq=saturation=${sat}`;
}
function buildFilmEmulationFilter(strength: number, grain: number): string {
    const t = _fxClamp(strength, 0, 100) / 100;
    const sat = (1 - 0.25 * t).toFixed(2);
    const lift = (0.03 * t).toFixed(3);
    const roll = (1 - 0.04 * t).toFixed(3);
    const rm = (0.05 * t).toFixed(3);
    const bm = (-0.05 * t).toFixed(3);
    let f = `curves=all='0/${lift} 0.5/0.5 1/${roll}',eq=saturation=${sat},colorbalance=rm=${rm}:bm=${bm}`;
    const g = Math.round(_fxClamp(grain, 0, 60));
    if (g > 0) f += `,noise=alls=${g}:allf=t`;
    return f;
}
function buildWaveWarpFilter(amplitude: number, wavelength: number, speed: number): string {
    const a = _fxClamp(amplitude, 0, 60);
    if (a <= 0) return '';
    const A = a.toFixed(2);
    const W = Math.max(1, wavelength).toFixed(2);
    const S = _fxClamp(speed, 0, 60).toFixed(2);
    const e = `X+${A}*sin(Y/${W}+T*${S})`;
    return `format=rgb24,geq=r='r(${e}\\,Y)':g='g(${e}\\,Y)':b='b(${e}\\,Y)'`;
}
function buildTurbulentFilter(amount: number, scale: number): string {
    const amt = _fxClamp(amount, 0, 60);
    if (amt <= 0) return '';
    const A = amt.toFixed(2);
    const s1 = Math.max(2, scale).toFixed(2);
    const s2 = (Math.max(2, scale) * 1.8).toFixed(2);
    const e = `X+${A}*sin(Y/${s1}+T*40)*sin(Y/${s2}-T*30)`;
    return `format=rgb24,geq=r='r(${e}\\,Y)':g='g(${e}\\,Y)':b='b(${e}\\,Y)'`;
}
function buildDigitalGlitchFilter(intensity: number): string {
    const t = _fxClamp(intensity, 0, 100) / 100;
    if (t <= 0) return '';
    const amt = Math.max(2, Math.round(t * 30));
    const ns = Math.max(2, Math.round(t * 14));
    const disp = `${amt}*gt(sin(T*16)\\,0.5)*(2*lt(mod(Y+T*50\\,32)\\,16)-1)`;
    return `format=rgb24,geq=r='r(X+${disp}\\,Y)':g='g(X\\,Y)':b='b(X-${disp}\\,Y)',noise=alls=${ns}:allf=t`;
}
function buildThresholdFilter(level: number): string {
    const L = Math.round(_fxClamp(level, 0, 255));
    return `hue=s=0,lutyuv=y='if(gt(val\\,${L})\\,235\\,16)'`;
}
function buildMosaicFilter(size: number): string {
    const b = Math.round(_fxClamp(size, 2, 64));
    return `scale=iw/${b}:ih/${b}:flags=neighbor,scale=iw*${b}:ih*${b}:flags=neighbor`;
}
function buildFisheyeFilter(amount: number): string {
    const a = _fxClamp(amount, -100, 100) / 100;
    const k1 = (-a * 0.5).toFixed(3);
    const k2 = (-a * 0.15).toFixed(3);
    return `lenscorrection=k1=${k1}:k2=${k2}`;
}
function buildScatterFilter(amount: number): string {
    const a = _fxClamp(amount, 0, 40);
    if (a <= 0) return '';
    const e = `X\\,Y+${a.toFixed(2)}*sin(X*12.9898+T*40)`;
    return `format=rgb24,geq=r='r(${e})':g='g(${e})':b='b(${e})'`;
}

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
    if ((effectId === 'mirror_h' || effectId === 'mirror_v' || effectId === 'invert') && !p['enabled']) return '';

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

    // AE-derived effects — dynamic builders
    if (effectId === 'tritone') return buildTritoneFilter(Number(p['intensity']), Number(p['warmth']));
    if (effectId === 'find_edges') return buildFindEdgesFilter(Number(p['low']), Number(p['high']), Boolean(p['invert']));
    if (effectId === 'glowing_edges') return buildGlowingEdgesFilter(Number(p['intensity']));
    if (effectId === 'film_emulation') return buildFilmEmulationFilter(Number(p['strength']), Number(p['grain']));
    if (effectId === 'wave_warp') return buildWaveWarpFilter(Number(p['amplitude']), Number(p['wavelength']), Number(p['speed']));
    if (effectId === 'turbulent_displace') return buildTurbulentFilter(Number(p['amount']), Number(p['scale']));
    if (effectId === 'digital_glitch') return buildDigitalGlitchFilter(Number(p['intensity']));
    if (effectId === 'threshold') return buildThresholdFilter(Number(p['level']));
    if (effectId === 'mosaic') return buildMosaicFilter(Number(p['size']));
    if (effectId === 'fisheye') return buildFisheyeFilter(Number(p['amount']));
    if (effectId === 'scatter') return buildScatterFilter(Number(p['amount']));

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
        (g.temperature ?? DEFAULTS.temperature) === DEFAULTS.temperature &&
        (g.tint ?? DEFAULTS.tint) === DEFAULTS.tint &&
        (g.exposure ?? DEFAULTS.exposure) === DEFAULTS.exposure &&
        (g.contrast ?? DEFAULTS.contrast) === DEFAULTS.contrast &&
        (g.highlights ?? DEFAULTS.highlights) === DEFAULTS.highlights &&
        (g.shadows ?? DEFAULTS.shadows) === DEFAULTS.shadows &&
        (g.saturation ?? DEFAULTS.saturation) === DEFAULTS.saturation &&
        (g.vibrance ?? DEFAULTS.vibrance) === DEFAULTS.vibrance &&
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

    // ── Normalize: merge defaults for any missing properties ──
    // The EGE and older project files may produce partial ColorGrading objects
    // where fields like contrast/saturation/vibrance are undefined. Without
    // normalization, `undefined.toFixed()` crashes the render pipeline.
    const n: Required<Pick<ColorGrading, 'temperature' | 'tint' | 'exposure' | 'contrast' | 'highlights' | 'shadows' | 'saturation' | 'vibrance'>> & ColorGrading = {
        ...DEFAULTS,
        ...g,
        temperature: g.temperature ?? DEFAULTS.temperature,
        tint: g.tint ?? DEFAULTS.tint,
        exposure: g.exposure ?? DEFAULTS.exposure,
        contrast: g.contrast ?? DEFAULTS.contrast,
        highlights: g.highlights ?? DEFAULTS.highlights,
        shadows: g.shadows ?? DEFAULTS.shadows,
        saturation: g.saturation ?? DEFAULTS.saturation,
        vibrance: g.vibrance ?? DEFAULTS.vibrance,
    };

    const filters: string[] = [];

    const cgWheels = buildWheelFilters(n);
    if (cgWheels) filters.push(cgWheels);

    // Temperature: -100..100 → 2000..10000 K
    if (n.temperature !== 0) {
        const kelvin = Math.round(6500 + (n.temperature / 100) * (n.temperature > 0 ? 3500 : 4500));
        filters.push(`colortemperature=temperature=${kelvin}`);
    }

    // Colorbalance: tint + highlights + shadows
    const cb: string[] = [];
    if (n.tint !== 0) cb.push(`gm=${(n.tint / 100).toFixed(4)}`);
    if (n.highlights !== 0) {
        const h = (n.highlights / 200).toFixed(4);
        cb.push(`rh=${h}`, `gh=${h}`, `bh=${h}`);
    }
    if (n.shadows !== 0) {
        const s = (n.shadows / 200).toFixed(4);
        cb.push(`rs=${s}`, `gs=${s}`, `bs=${s}`);
    }
    if (cb.length > 0) filters.push(`colorbalance=${cb.join(':')}`);

    // eq: exposure + contrast + saturation × vibrance
    const eq: string[] = [];
    if (n.exposure !== 0) eq.push(`brightness=${(n.exposure / 2).toFixed(4)}`);
    if (n.contrast !== 1.0) eq.push(`contrast=${n.contrast.toFixed(4)}`);
    const sat = n.saturation * n.vibrance;
    if (Math.abs(sat - 1.0) > 0.001) eq.push(`saturation=${sat.toFixed(4)}`);
    if (eq.length > 0) filters.push(`eq=${eq.join(':')}`);

    // LUT
    if (n.lutFile) {
        const escaped = n.lutFile.replace(/\\/g, '/').replace(/:/g, '\\:');
        filters.push(`lut3d=${escaped}`);
    }

    return filters.join(',');
}
