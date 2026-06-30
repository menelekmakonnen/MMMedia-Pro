/**
 * Overlay Asset Registry
 * ════════════════════════════════════════════════════════════════════════════
 * Maps common VFX overlay types (light leaks, particles, rain, bokeh, etc.)
 * to the existing double/triple exposure blend-mode system in
 * editEffectFilters.ts.  Every preset here is PROCEDURAL — FFmpeg can
 * generate the overlay frame without external asset files.
 *
 * The `buildOverlayFilter` helper emits a self-contained 1-in/1-out
 * filtergraph fragment that:
 *   1. Generates the overlay source (color, noise, gradients…)
 *   2. Blends it over the incoming video using the preset's blend mode +
 *      opacity, via the same `blend` filter used by double-exposure.
 *
 * This module has NO imports so it stays trivially unit-testable and free of
 * any DOM/Electron coupling — same convention as editEffectFilters.ts.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type OverlayCategory =
    | 'light-leaks'
    | 'particles'
    | 'weather'
    | 'film'
    | 'bokeh'
    | 'texture'
    | 'glow';

export interface OverlayPreset {
    id: string;
    name: string;
    category: OverlayCategory;
    description: string;
    /** The blend mode to use when compositing */
    blendMode: 'screen' | 'add' | 'overlay' | 'softlight' | 'lighten' | 'multiply';
    /** Suggested opacity (0-100) */
    defaultOpacity: number;
    /** Keywords for search */
    keywords: string[];
    /** Whether this is a built-in procedural effect (no external file needed) */
    procedural: boolean;
    /** For procedural overlays: the FFmpeg filter to generate them */
    ffmpegFilter?: string;
    /** Icon hint */
    icon: string;
}

// ─── Category metadata ────────────────────────────────────────────────────────

export const OVERLAY_CATEGORIES: {
    id: OverlayCategory;
    name: string;
    icon: string;
    description: string;
}[] = [
    { id: 'light-leaks', name: 'Light Leaks',  icon: 'sun',        description: 'Warm and cool light leak overlays that emulate lens flare and film burn.' },
    { id: 'particles',   name: 'Particles',    icon: 'sparkles',   description: 'Floating dust motes, glitter, and sparkle dot overlays.' },
    { id: 'weather',     name: 'Weather',       icon: 'cloud-rain', description: 'Rain, snow, and atmospheric fog effects.' },
    { id: 'film',        name: 'Film',          icon: 'film',       description: 'Film grain, VHS scan lines, and scratch overlays.' },
    { id: 'bokeh',       name: 'Bokeh',         icon: 'aperture',   description: 'Soft circular and anamorphic bokeh light overlays.' },
    { id: 'texture',     name: 'Texture',       icon: 'layers',     description: 'Subtle texture overlays for added depth.' },
    { id: 'glow',        name: 'Glow',          icon: 'zap',        description: 'Bloom, neon glow, and radial halo effects.' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Map our friendly blend-mode names to FFmpeg `blend` filter values. */
function ffBlend(mode: OverlayPreset['blendMode']): string {
    switch (mode) {
        case 'add':       return 'addition';
        case 'screen':    return 'screen';
        case 'overlay':   return 'overlay';
        case 'softlight': return 'softlight';
        case 'lighten':   return 'lighten';
        case 'multiply':  return 'multiply';
        default:          return 'screen';
    }
}

// ─── Preset definitions ───────────────────────────────────────────────────────
// Every preset is procedural — ffmpegFilter contains a fragment that creates
// the overlay source at {W}x{H} / {FPS}.  Placeholders {W}, {H}, {FPS} are
// resolved by `buildOverlayFilter`.

export const OVERLAY_PRESETS: OverlayPreset[] = [
    // ── Light Leaks ─────────────────────────────────────────────────────────
    {
        id: 'warm-leak',
        name: 'Warm Leak',
        category: 'light-leaks',
        description: 'Warm orange light leak — a soft gradient that drifts across the frame.',
        blendMode: 'screen',
        defaultOpacity: 40,
        keywords: ['warm', 'orange', 'light', 'leak', 'flare'],
        procedural: true,
        ffmpegFilter: 'gradients=s={W}x{H}:r={FPS}:c0=0xFF8C00:c1=0xFFD700:c2=0xFF6347:nb_colors=3:x0=0:y0=0:x1={W}:y1={H}:speed=0.008,format=yuv420p',
        icon: 'sun',
    },
    {
        id: 'cool-leak',
        name: 'Cool Leak',
        category: 'light-leaks',
        description: 'Cool blue/cyan light leak with a subtle sweep.',
        blendMode: 'screen',
        defaultOpacity: 35,
        keywords: ['cool', 'blue', 'cyan', 'light', 'leak'],
        procedural: true,
        ffmpegFilter: 'gradients=s={W}x{H}:r={FPS}:c0=0x00BFFF:c1=0x1E90FF:c2=0x00CED1:nb_colors=3:x0=0:y0={H}:x1={W}:y1=0:speed=0.006,format=yuv420p',
        icon: 'sun',
    },
    {
        id: 'golden-hour',
        name: 'Golden Hour',
        category: 'light-leaks',
        description: 'Golden horizontal streak emulating late-afternoon sun.',
        blendMode: 'screen',
        defaultOpacity: 30,
        keywords: ['golden', 'hour', 'sunset', 'streak', 'warm'],
        procedural: true,
        ffmpegFilter: 'gradients=s={W}x{H}:r={FPS}:c0=0xFFD700:c1=0xFFA500:c2=0xFFE4B5:nb_colors=3:x0=0:y0={H_HALF}:x1={W}:y1={H_HALF}:speed=0.004,format=yuv420p',
        icon: 'sunrise',
    },
    {
        id: 'film-burn',
        name: 'Film Burn',
        category: 'light-leaks',
        description: 'Overexposed film burn that bleaches from the edges.',
        blendMode: 'add',
        defaultOpacity: 25,
        keywords: ['film', 'burn', 'overexposed', 'bleach', 'edge'],
        procedural: true,
        ffmpegFilter: 'gradients=s={W}x{H}:r={FPS}:c0=0xFFFFFF:c1=0xFFE0B2:c2=0xFF8A65:c3=0x000000:nb_colors=4:x0=0:y0=0:x1={W}:y1={H}:speed=0.012,format=yuv420p',
        icon: 'flame',
    },

    // ── Particles ───────────────────────────────────────────────────────────
    {
        id: 'dust-motes',
        name: 'Dust Motes',
        category: 'particles',
        description: 'Floating dust particles — subtle noise softened to dot-like motes.',
        blendMode: 'screen',
        defaultOpacity: 20,
        keywords: ['dust', 'motes', 'particles', 'floating', 'organic'],
        procedural: true,
        ffmpegFilter: 'color=c=black:s={W}x{H}:r={FPS},noise=c0s=18:c0f=t,gblur=sigma=3:steps=2,curves=all=\'0/0 0.75/0 0.85/1 1/1\',format=yuv420p',
        icon: 'sparkles',
    },
    {
        id: 'sparkle',
        name: 'Sparkle',
        category: 'particles',
        description: 'Glitter and sparkle dots — bright noise spikes on black.',
        blendMode: 'screen',
        defaultOpacity: 30,
        keywords: ['sparkle', 'glitter', 'dots', 'stars', 'bright'],
        procedural: true,
        ffmpegFilter: 'color=c=black:s={W}x{H}:r={FPS},noise=c0s=40:c0f=t,curves=all=\'0/0 0.92/0 0.96/1 1/1\',format=yuv420p',
        icon: 'sparkles',
    },

    // ── Weather ─────────────────────────────────────────────────────────────
    {
        id: 'rain',
        name: 'Rain',
        category: 'weather',
        description: 'Rain drops — directional noise with motion blur to emulate falling rain.',
        blendMode: 'screen',
        defaultOpacity: 25,
        keywords: ['rain', 'drops', 'water', 'storm', 'weather'],
        procedural: true,
        ffmpegFilter: 'color=c=black:s={W}x{H}:r={FPS},noise=c0s=50:c0f=t+p,curves=all=\'0/0 0.85/0 0.9/1 1/1\',boxblur=1:8,format=yuv420p',
        icon: 'cloud-rain',
    },
    {
        id: 'snow',
        name: 'Snow',
        category: 'weather',
        description: 'Falling snow particles — soft, scattered, and slowly drifting.',
        blendMode: 'screen',
        defaultOpacity: 30,
        keywords: ['snow', 'falling', 'winter', 'flakes', 'cold'],
        procedural: true,
        ffmpegFilter: 'color=c=black:s={W}x{H}:r={FPS},noise=c0s=24:c0f=t,gblur=sigma=2,curves=all=\'0/0 0.78/0 0.88/1 1/1\',format=yuv420p',
        icon: 'snowflake',
    },
    {
        id: 'fog',
        name: 'Fog',
        category: 'weather',
        description: 'Atmospheric fog / haze — a soft, low-contrast mist.',
        blendMode: 'screen',
        defaultOpacity: 20,
        keywords: ['fog', 'haze', 'mist', 'atmosphere', 'moody'],
        procedural: true,
        ffmpegFilter: 'color=c=gray:s={W}x{H}:r={FPS},noise=c0s=10:c0f=t,boxblur=40:5,format=gbrp,colorchannelmixer=rr=0.3:gg=0.3:bb=0.3,format=yuv420p',
        icon: 'cloud',
    },

    // ── Film ────────────────────────────────────────────────────────────────
    {
        id: 'film-grain-light',
        name: 'Film Grain (Light)',
        category: 'film',
        description: 'Light 16mm film grain — subtle organic texture.',
        blendMode: 'overlay',
        defaultOpacity: 50,
        keywords: ['film', 'grain', '16mm', 'light', 'texture', 'organic'],
        procedural: true,
        ffmpegFilter: 'color=c=gray:s={W}x{H}:r={FPS},noise=c0s=12:c0f=t,format=yuv420p',
        icon: 'film',
    },
    {
        id: 'film-grain-heavy',
        name: 'Film Grain (Heavy)',
        category: 'film',
        description: 'Heavy 8mm film grain — gritty, lo-fi texture.',
        blendMode: 'overlay',
        defaultOpacity: 60,
        keywords: ['film', 'grain', '8mm', 'heavy', 'gritty', 'lo-fi'],
        procedural: true,
        ffmpegFilter: 'color=c=gray:s={W}x{H}:r={FPS},noise=c0s=35:c0f=t,format=yuv420p',
        icon: 'film',
    },
    {
        id: 'vhs-lines',
        name: 'VHS Scan Lines',
        category: 'film',
        description: 'VHS scan lines — retro chroma shift, grain, and faint horizontal banding.',
        blendMode: 'overlay',
        defaultOpacity: 40,
        keywords: ['vhs', 'scan', 'lines', 'retro', 'analog', 'tape'],
        procedural: true,
        ffmpegFilter: 'color=c=gray:s={W}x{H}:r={FPS},noise=c0s=14:c0f=t,rgbashift=rh=3:bh=-3,eq=saturation=1.15:contrast=1.05,gblur=sigma=0.6,format=yuv420p',
        icon: 'tv',
    },
    {
        id: 'scratches',
        name: 'Film Scratches',
        category: 'film',
        description: 'Film scratches — vertical noise lines emulating damaged film stock.',
        blendMode: 'screen',
        defaultOpacity: 15,
        keywords: ['film', 'scratches', 'damage', 'vintage', 'lines'],
        procedural: true,
        ffmpegFilter: 'color=c=black:s={W}x{H}:r={FPS},noise=c0s=30:c0f=t+p,boxblur=0:6,curves=all=\'0/0 0.9/0 0.95/1 1/1\',format=yuv420p',
        icon: 'film',
    },

    // ── Bokeh ───────────────────────────────────────────────────────────────
    {
        id: 'soft-bokeh',
        name: 'Soft Bokeh',
        category: 'bokeh',
        description: 'Soft circular bokeh circles — bright noise heavily blurred into orbs.',
        blendMode: 'screen',
        defaultOpacity: 25,
        keywords: ['bokeh', 'circles', 'soft', 'defocus', 'lights'],
        procedural: true,
        ffmpegFilter: 'color=c=black:s={W}x{H}:r={FPS},noise=c0s=45:c0f=t,curves=all=\'0/0 0.94/0 0.97/1 1/1\',gblur=sigma=18:steps=3,format=yuv420p',
        icon: 'aperture',
    },
    {
        id: 'anamorphic-bokeh',
        name: 'Anamorphic Bokeh',
        category: 'bokeh',
        description: 'Horizontal oval bokeh — anamorphic lens simulation with a wide blur.',
        blendMode: 'screen',
        defaultOpacity: 25,
        keywords: ['anamorphic', 'bokeh', 'oval', 'horizontal', 'cinematic', 'lens'],
        procedural: true,
        ffmpegFilter: 'color=c=black:s={W}x{H}:r={FPS},noise=c0s=45:c0f=t,curves=all=\'0/0 0.94/0 0.97/1 1/1\',gblur=sigma=28:steps=2,scale={W_HALF}:{H},scale={W}:{H}:flags=lanczos,format=yuv420p',
        icon: 'aperture',
    },

    // ── Glow ────────────────────────────────────────────────────────────────
    {
        id: 'bloom',
        name: 'Bloom',
        category: 'glow',
        description: 'Soft glow bloom — brightens and softly diffuses highlight areas.',
        blendMode: 'screen',
        defaultOpacity: 30,
        keywords: ['bloom', 'glow', 'soft', 'highlight', 'diffuse'],
        procedural: true,
        // This is a special case: bloom is applied as a fork/merge on the
        // source itself (duplicate, blur, screen-blend back). The ffmpegFilter
        // here is a placeholder; buildOverlayFilter handles it as a split.
        ffmpegFilter: '__BLOOM__',
        icon: 'sun',
    },
    {
        id: 'neon-glow',
        name: 'Neon Glow',
        category: 'glow',
        description: 'Colored neon edge glow — magenta/cyan fringe over a dark base.',
        blendMode: 'add',
        defaultOpacity: 35,
        keywords: ['neon', 'glow', 'edge', 'color', 'fringe', 'cyberpunk'],
        procedural: true,
        ffmpegFilter: 'gradients=s={W}x{H}:r={FPS}:c0=0xFF00FF:c1=0x00FFFF:c2=0xFF00FF:nb_colors=3:x0=0:y0=0:x1={W}:y1={H}:speed=0.01,gblur=sigma=12:steps=2,format=yuv420p',
        icon: 'zap',
    },
    {
        id: 'halo',
        name: 'Halo',
        category: 'glow',
        description: 'Central radial halo — a bright core that fades to black at the edges.',
        blendMode: 'screen',
        defaultOpacity: 25,
        keywords: ['halo', 'radial', 'center', 'glow', 'light'],
        procedural: true,
        ffmpegFilter: 'gradients=s={W}x{H}:r={FPS}:c0=0xFFFFFF:c1=0x000000:nb_colors=2:x0={W_HALF}:y0={H_HALF}:x1={W}:y1={H}:speed=0.003,format=yuv420p',
        icon: 'target',
    },
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

const _presetById = new Map<string, OverlayPreset>();
for (const p of OVERLAY_PRESETS) {
    _presetById.set(p.id, p);
}

/** Look up a single overlay preset by ID. */
export function getOverlayPreset(id: string): OverlayPreset | undefined {
    return _presetById.get(id);
}

/** Get all presets for a given category. */
export function getPresetsByCategory(category: OverlayCategory): OverlayPreset[] {
    return OVERLAY_PRESETS.filter((p) => p.category === category);
}

/** Search presets by keyword (case-insensitive partial match). */
export function searchPresets(query: string): OverlayPreset[] {
    const q = query.toLowerCase().trim();
    if (!q) return OVERLAY_PRESETS;
    return OVERLAY_PRESETS.filter(
        (p) =>
            p.name.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            p.keywords.some((k) => k.includes(q)),
    );
}

// ─── Filter builder ───────────────────────────────────────────────────────────

/**
 * Build a complete 1-in/1-out FFmpeg filtergraph fragment that generates the
 * overlay source procedurally and blends it over the incoming video stream.
 *
 * The returned string should be appended (with a leading comma) to the main
 * -vf chain.  Example:
 *   `...existing filters...,<returned fragment>`
 *
 * For the 'bloom' preset the builder emits a split-blur-blend sub-graph
 * (same pattern as buildForkMergeGraph in editEffectFilters.ts).
 */
export function buildOverlayFilter(
    preset: OverlayPreset,
    width: number,
    height: number,
    fps: number,
): string {
    const W = Math.round(width);
    const H = Math.round(height);
    const F = clamp(Math.round(fps) || 30, 1, 240);
    const op = (clamp(preset.defaultOpacity, 0, 100) / 100).toFixed(3);
    const blendMode = ffBlend(preset.blendMode);

    // ── Special case: bloom is a fork/merge on the source itself ──────────
    if (preset.id === 'bloom') {
        const sigma = 14;
        return [
            'split=2[_ova][_ovb]',
            `[_ovb]curves=all='0/0 0.45/0 1/1',gblur=sigma=${sigma}:steps=2[_ovc]`,
            `[_ova][_ovc]blend=all_mode=${blendMode}:all_opacity=${op}`,
        ].join(';');
    }

    // ── Standard procedural overlay: generate source → blend ─────────────
    if (!preset.ffmpegFilter) return '';

    const filter = preset.ffmpegFilter
        .replace(/\{W_HALF\}/g, String(Math.round(W / 2)))
        .replace(/\{H_HALF\}/g, String(Math.round(H / 2)))
        .replace(/\{W\}/g, String(W))
        .replace(/\{H\}/g, String(H))
        .replace(/\{FPS\}/g, String(F));

    // The overlay source is generated as a separate chain, then blended over
    // the main video via a split+blend sub-graph.
    return [
        `split=2[_ova][_ovb]`,
        `${filter}[_ovs]`,
        `[_ova][_ovs]blend=all_mode=${blendMode}:all_opacity=${op}`,
    ].join(';');
}
