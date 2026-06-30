// ══════════════════════════════════════════════════════════════════════════════
// effectRegistry.ts — Parametric Effects Registry
// Defines all adjustable effects with their parameter schemas and FFmpeg
// filter templates. Used by both the renderer (UI) and electron (export).
// ══════════════════════════════════════════════════════════════════════════════

export interface EffectParameter {
    key: string;
    label: string;
    type: 'slider' | 'color' | 'select' | 'toggle';
    min?: number;
    max?: number;
    step?: number;
    default: number | string | boolean;
    unit?: string;  // '%', 'px', '°', 'K', etc.
    options?: string[];  // For 'select' type
}

export interface ParametricEffect {
    id: string;
    name: string;
    category: 'color' | 'style' | 'blur' | 'distortion' | 'sharpen';
    description: string;
    parameters: EffectParameter[];
    /** FFmpeg template with {{paramKey}} placeholders */
    ffmpegTemplate: string;
    /** CSS preview approximation (optional) */
    cssPreview?: string;
    /** Whether real-time preview is possible */
    realtimePreview: boolean;
}

// ══════════════════════════════════════════════════════════════════════════════
// EFFECT DEFINITIONS
// ══════════════════════════════════════════════════════════════════════════════

export const EFFECT_REGISTRY: ParametricEffect[] = [
    // ── Color ────────────────────────────────────────────────────────────────
    {
        id: 'color_temperature',
        name: 'Color Temperature',
        category: 'color',
        description: 'Adjust the color temperature of the image from cool (blue) to warm (orange).',
        parameters: [
            { key: 'temp', label: 'Temperature', type: 'slider', min: 2000, max: 10000, step: 100, default: 6500, unit: 'K' },
        ],
        ffmpegTemplate: 'colortemperature=temperature={{temp}}',
        cssPreview: 'sepia({{_tempCss}}%)',
        realtimePreview: true,
    },
    {
        id: 'color_balance',
        name: 'Color Balance',
        category: 'color',
        description: 'Fine-tune shadow, midtone, and highlight color balance per RGB channel.',
        parameters: [
            { key: 'rs', label: 'Shadows Red', type: 'slider', min: -1, max: 1, step: 0.05, default: 0 },
            { key: 'gs', label: 'Shadows Green', type: 'slider', min: -1, max: 1, step: 0.05, default: 0 },
            { key: 'bs', label: 'Shadows Blue', type: 'slider', min: -1, max: 1, step: 0.05, default: 0 },
            { key: 'rm', label: 'Midtones Red', type: 'slider', min: -1, max: 1, step: 0.05, default: 0 },
            { key: 'gm', label: 'Midtones Green', type: 'slider', min: -1, max: 1, step: 0.05, default: 0 },
            { key: 'bm', label: 'Midtones Blue', type: 'slider', min: -1, max: 1, step: 0.05, default: 0 },
            { key: 'rh', label: 'Highlights Red', type: 'slider', min: -1, max: 1, step: 0.05, default: 0 },
            { key: 'gh', label: 'Highlights Green', type: 'slider', min: -1, max: 1, step: 0.05, default: 0 },
            { key: 'bh', label: 'Highlights Blue', type: 'slider', min: -1, max: 1, step: 0.05, default: 0 },
        ],
        ffmpegTemplate: 'colorbalance=rs={{rs}}:gs={{gs}}:bs={{bs}}:rm={{rm}}:gm={{gm}}:bm={{bm}}:rh={{rh}}:gh={{gh}}:bh={{bh}}',
        realtimePreview: true,
    },
    {
        id: 'color_curves',
        name: 'Color Curves',
        category: 'color',
        description: 'Apply preset color curves for creative grading.',
        parameters: [
            {
                key: 'preset', label: 'Preset', type: 'select', default: 'none',
                options: ['none', 'vintage', 'cross_process', 'linear_contrast', 'medium_contrast'],
            },
        ],
        ffmpegTemplate: 'curves=preset={{preset}}',
        realtimePreview: true,
    },
    {
        id: 'levels',
        name: 'Levels',
        category: 'color',
        description: 'Adjust input black/white points and gamma for tonal control.',
        parameters: [
            { key: 'min', label: 'Input Min', type: 'slider', min: 0, max: 255, step: 1, default: 0 },
            { key: 'max', label: 'Input Max', type: 'slider', min: 0, max: 255, step: 1, default: 255 },
            { key: 'gamma', label: 'Gamma', type: 'slider', min: 0.1, max: 3.0, step: 0.05, default: 1.0 },
        ],
        ffmpegTemplate: 'levels=rmin={{min}}:gmin={{min}}:bmin={{min}}:rmax={{max}}:gmax={{max}}:bmax={{max}}',
        realtimePreview: true,
    },

    // ── Style ────────────────────────────────────────────────────────────────
    {
        id: 'film_grain',
        name: 'Film Grain',
        category: 'style',
        description: 'Add organic film grain noise for a cinematic texture.',
        parameters: [
            { key: 'intensity', label: 'Intensity', type: 'slider', min: 0, max: 60, step: 1, default: 15 },
            { key: 'animated', label: 'Animated', type: 'toggle', default: true },
        ],
        ffmpegTemplate: 'noise=alls={{intensity}}:allf={{_noiseFlag}}',
        realtimePreview: false,
    },
    {
        id: 'vignette',
        name: 'Vignette',
        category: 'style',
        description: 'Darken the edges of the frame for a focused look.',
        parameters: [
            { key: 'angle', label: 'Angle', type: 'slider', min: 0.524, max: 1.571, step: 0.01, default: 0.785, unit: 'rad' },
        ],
        ffmpegTemplate: 'vignette=angle={{angle}}',
        cssPreview: 'none',
        realtimePreview: true,
    },
    {
        id: 'chromatic_aberration',
        name: 'Chromatic Aberration',
        category: 'style',
        description: 'Shift red and blue channels horizontally for a lens fringe effect.',
        parameters: [
            { key: 'rx', label: 'Red Shift', type: 'slider', min: -15, max: 15, step: 1, default: 3, unit: 'px' },
            { key: 'bx', label: 'Blue Shift', type: 'slider', min: -15, max: 15, step: 1, default: -3, unit: 'px' },
        ],
        ffmpegTemplate: 'rgbashift=rh={{rx}}:bh={{bx}}',
        realtimePreview: false,
    },
    {
        id: 'posterize',
        name: 'Posterize',
        category: 'style',
        description: 'Reduce the number of color levels for a poster-like look.',
        parameters: [
            { key: 'bits', label: 'Bits', type: 'slider', min: 2, max: 8, step: 1, default: 4 },
        ],
        ffmpegTemplate: 'posterize={{bits}}',
        realtimePreview: true,
    },
    {
        id: 'duotone',
        name: 'Duotone',
        category: 'style',
        description: 'Desaturate the image and tint the highlights with a chosen color.',
        parameters: [
            { key: 'r', label: 'Tint Red', type: 'slider', min: -1, max: 1, step: 0.05, default: 0.3 },
            { key: 'g', label: 'Tint Green', type: 'slider', min: -1, max: 1, step: 0.05, default: 0 },
            { key: 'b', label: 'Tint Blue', type: 'slider', min: -1, max: 1, step: 0.05, default: 0.5 },
        ],
        ffmpegTemplate: 'hue=s=0,colorbalance=rh={{r}}:gh={{g}}:bh={{b}}',
        realtimePreview: true,
    },
    {
        id: 'sepia_advanced',
        name: 'Sepia (Advanced)',
        category: 'style',
        description: 'Apply a warm sepia tone with adjustable intensity.',
        parameters: [
            { key: 'intensity', label: 'Intensity', type: 'slider', min: 0, max: 100, step: 1, default: 50, unit: '%' },
        ],
        // Resolved dynamically — uses colorchannelmixer matrix blended with identity
        ffmpegTemplate: '{{_sepiaFilter}}',
        realtimePreview: true,
    },

    // ── Blur ─────────────────────────────────────────────────────────────────
    {
        id: 'gaussian_blur',
        name: 'Gaussian Blur',
        category: 'blur',
        description: 'Apply a smooth Gaussian blur to the image.',
        parameters: [
            { key: 'sigma', label: 'Sigma', type: 'slider', min: 0.5, max: 20, step: 0.5, default: 3, unit: 'px' },
        ],
        ffmpegTemplate: 'gblur=sigma={{sigma}}',
        cssPreview: 'blur({{sigma}}px)',
        realtimePreview: true,
    },
    {
        id: 'box_blur',
        name: 'Box Blur',
        category: 'blur',
        description: 'Apply a fast box blur (uniform averaging).',
        parameters: [
            { key: 'radius', label: 'Radius', type: 'slider', min: 1, max: 20, step: 1, default: 3, unit: 'px' },
        ],
        ffmpegTemplate: 'boxblur={{radius}}:{{radius}}',
        cssPreview: 'blur({{radius}}px)',
        realtimePreview: true,
    },

    // ── Sharpen ──────────────────────────────────────────────────────────────
    {
        id: 'sharpen',
        name: 'Sharpen',
        category: 'sharpen',
        description: 'Sharpen image details using unsharp masking (5×5 kernel).',
        parameters: [
            { key: 'amount', label: 'Amount', type: 'slider', min: 0.5, max: 3.0, step: 0.1, default: 1.5 },
        ],
        ffmpegTemplate: 'unsharp=5:5:{{amount}}:5:5:0',
        realtimePreview: true,
    },
    {
        id: 'clarity',
        name: 'Clarity',
        category: 'sharpen',
        description: 'Enhance midtone contrast and detail using a wider unsharp kernel (7×7).',
        parameters: [
            { key: 'amount', label: 'Amount', type: 'slider', min: 0.5, max: 2.0, step: 0.1, default: 1.0 },
        ],
        ffmpegTemplate: 'unsharp=7:7:{{amount}}:7:7:0',
        realtimePreview: true,
    },

    // ── Distortion ───────────────────────────────────────────────────────────
    {
        id: 'lens_distortion',
        name: 'Lens Distortion',
        category: 'distortion',
        description: 'Apply barrel/pincushion lens correction.',
        parameters: [
            { key: 'k1', label: 'K1 (Barrel)', type: 'slider', min: -1, max: 1, step: 0.05, default: 0 },
            { key: 'k2', label: 'K2 (Pincushion)', type: 'slider', min: -1, max: 1, step: 0.05, default: 0 },
        ],
        ffmpegTemplate: 'lenscorrection=k1={{k1}}:k2={{k2}}',
        realtimePreview: false,
    },
    {
        id: 'mirror_h',
        name: 'Mirror Horizontal',
        category: 'distortion',
        description: 'Flip the image horizontally (left ↔ right).',
        parameters: [
            { key: 'enabled', label: 'Enabled', type: 'toggle', default: true },
        ],
        ffmpegTemplate: 'hflip',
        realtimePreview: true,
    },
    {
        id: 'mirror_v',
        name: 'Mirror Vertical',
        category: 'distortion',
        description: 'Flip the image vertically (top ↔ bottom).',
        parameters: [
            { key: 'enabled', label: 'Enabled', type: 'toggle', default: true },
        ],
        ffmpegTemplate: 'vflip',
        realtimePreview: true,
    },

    // Color (added)
    {
        id: 'exposure',
        name: 'Exposure',
        category: 'color',
        description: 'Adjust exposure in stops (EV), brightening or darkening the whole image.',
        parameters: [
            { key: 'ev', label: 'Exposure', type: 'slider', min: -3, max: 3, step: 0.05, default: 0, unit: 'EV' },
        ],
        ffmpegTemplate: 'exposure=exposure={{ev}}',
        realtimePreview: true,
    },
    {
        id: 'vibrance',
        name: 'Vibrance',
        category: 'color',
        description: 'Smart saturation that boosts muted colors while protecting skin tones.',
        parameters: [
            { key: 'amt', label: 'Intensity', type: 'slider', min: -2, max: 2, step: 0.05, default: 0.5 },
        ],
        ffmpegTemplate: 'vibrance=intensity={{amt}}',
        realtimePreview: true,
    },

    // Style (added)
    {
        id: 'deflicker',
        name: 'Deflicker',
        category: 'style',
        description: 'Remove temporal luminance flicker (timelapse, old footage, LED lights).',
        parameters: [
            { key: 'size', label: 'Window', type: 'slider', min: 2, max: 60, step: 1, default: 10, unit: 'fr' },
        ],
        ffmpegTemplate: 'deflicker=size={{size}}:mode=am',
        realtimePreview: false,
    },
    {
        id: 'deband',
        name: 'Deband',
        category: 'style',
        description: 'Smooth out banding artifacts in gradients and flat areas.',
        parameters: [
            { key: 'range', label: 'Range', type: 'slider', min: 1, max: 64, step: 1, default: 16 },
        ],
        ffmpegTemplate: 'deband=range={{range}}',
        realtimePreview: false,
    },
    {
        id: 'edge_detect',
        name: 'Edge Detect',
        category: 'style',
        description: 'Stylized edge/sketch look via Canny edge detection.',
        parameters: [
            { key: 'low', label: 'Low Threshold', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.1 },
            { key: 'high', label: 'High Threshold', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.4 },
        ],
        ffmpegTemplate: 'edgedetect=low={{low}}:high={{high}}',
        realtimePreview: false,
    },

    // Blur / Denoise (added)
    {
        id: 'denoise',
        name: 'Denoise (HQ 3D)',
        category: 'blur',
        description: 'High-quality spatial + temporal denoiser to clean up grainy footage.',
        parameters: [
            { key: 'luma', label: 'Strength', type: 'slider', min: 0, max: 12, step: 0.5, default: 4 },
        ],
        ffmpegTemplate: 'hqdn3d={{luma}}:{{luma}}:6:6',
        realtimePreview: false,
    },

    // ══════════════════════════════════════════════════════════════════════════
    // AE-DERIVED EFFECTS — FFmpeg equivalents of common After Effects techniques.
    // Each maps a tutorial workflow onto a single 1-in/1-out -vf filter so it
    // renders identically in the preview proxy and the final export, and can be
    // auto-applied by the Edit/Grid Generator Engine via globalEffects.
    // ══════════════════════════════════════════════════════════════════════════

    // ── Color ────────────────────────────────────────────────────────────────
    {
        // AE "Hue/Saturation" (Master Hue) — cycle the colour spectrum + saturate.
        id: 'hue_saturation',
        name: 'Hue / Saturation',
        category: 'color',
        description: 'Rotate the entire colour spectrum (Master Hue) and push or pull overall saturation.',
        parameters: [
            { key: 'hue', label: 'Master Hue', type: 'slider', min: -180, max: 180, step: 1, default: 0, unit: '°' },
            { key: 'sat', label: 'Saturation', type: 'slider', min: 0, max: 3, step: 0.05, default: 1 },
        ],
        ffmpegTemplate: 'hue=h={{hue}}:s={{sat}}',
        realtimePreview: true,
    },
    {
        // AE "Tritone" — map shadows / highlights to opposing colours for a
        // custom duotone/tritone grade (teal-orange when warmth is positive).
        id: 'tritone',
        name: 'Tritone',
        category: 'color',
        description: 'Desaturate, then map shadows and highlights to opposing tones for a duotone/tritone colour grade.',
        parameters: [
            { key: 'intensity', label: 'Intensity', type: 'slider', min: 0, max: 100, step: 1, default: 60, unit: '%' },
            { key: 'warmth', label: 'Warmth', type: 'slider', min: -100, max: 100, step: 1, default: 60 },
        ],
        ffmpegTemplate: '{{_tritone}}',
        realtimePreview: true,
    },

    // ── Style ────────────────────────────────────────────────────────────────
    {
        // AE "Find Edges" (+ Invert) — Canny edge stylisation, optionally inked.
        id: 'find_edges',
        name: 'Find Edges',
        category: 'style',
        description: 'Stylised edge outlines (Canny). Invert for white-on-black inked edges.',
        parameters: [
            { key: 'low', label: 'Low Threshold', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.1 },
            { key: 'high', label: 'High Threshold', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.4 },
            { key: 'invert', label: 'Invert', type: 'toggle', default: true },
        ],
        ffmpegTemplate: '{{_findEdges}}',
        realtimePreview: false,
    },
    {
        // AE combo: Find Edges + Curves + Tint + Deep Glow — glowing inked outline.
        id: 'glowing_edges',
        name: 'Glowing Edges',
        category: 'style',
        description: 'Find Edges → Curves → Tint look: a stylised, glowing outline of the subject. Pair with Glow for bloom.',
        parameters: [
            { key: 'intensity', label: 'Intensity', type: 'slider', min: 0, max: 100, step: 1, default: 60, unit: '%' },
        ],
        ffmpegTemplate: '{{_glowingEdges}}',
        realtimePreview: false,
    },
    {
        // AE "FilmConvert Nitrate"-style film emulation: toe lift, rolled
        // highlights, gentle desaturation and animated grain.
        id: 'film_emulation',
        name: 'Film Emulation',
        category: 'style',
        description: 'Cinematic film-stock emulation: lifted toe, rolled highlights, gentle desaturation and animated grain.',
        parameters: [
            { key: 'strength', label: 'Strength', type: 'slider', min: 0, max: 100, step: 1, default: 60, unit: '%' },
            { key: 'grain', label: 'Grain', type: 'slider', min: 0, max: 40, step: 1, default: 12 },
        ],
        ffmpegTemplate: '{{_filmEmulation}}',
        realtimePreview: false,
    },

    // ── Distortion ───────────────────────────────────────────────────────────
    {
        // AE "Wave Warp" — gentle organic float/wobble (sine displacement).
        id: 'wave_warp',
        name: 'Wave Warp',
        category: 'distortion',
        description: 'Gentle organic wave displacement — a subtle floating wobble for text or elements.',
        parameters: [
            { key: 'amplitude', label: 'Amplitude', type: 'slider', min: 0, max: 30, step: 1, default: 6, unit: 'px' },
            { key: 'wavelength', label: 'Wavelength', type: 'slider', min: 4, max: 60, step: 1, default: 18 },
            { key: 'speed', label: 'Speed', type: 'slider', min: 0, max: 10, step: 0.1, default: 3 },
        ],
        ffmpegTemplate: '{{_waveWarp}}',
        realtimePreview: false,
    },
    {
        // AE "Turbulent Displace" (Horizontal) — high-frequency glitch shimmer.
        id: 'turbulent_displace',
        name: 'Turbulent Displace',
        category: 'distortion',
        description: 'High-impact horizontal turbulence — a fast, glitchy displacement shimmer across the frame.',
        parameters: [
            { key: 'amount', label: 'Amount', type: 'slider', min: 0, max: 30, step: 1, default: 14, unit: 'px' },
            { key: 'scale', label: 'Detail', type: 'slider', min: 4, max: 40, step: 1, default: 7 },
        ],
        ffmpegTemplate: '{{_turbulent}}',
        realtimePreview: false,
    },
    {
        // AE "Digital Damage" / glitch — torn-scanline displacement + chroma + noise.
        id: 'digital_glitch',
        name: 'Digital Glitch',
        category: 'distortion',
        description: 'Digital-damage glitch: time-gated torn scanlines, chroma fringing and static.',
        parameters: [
            { key: 'intensity', label: 'Intensity', type: 'slider', min: 0, max: 100, step: 1, default: 50, unit: '%' },
        ],
        ffmpegTemplate: '{{_digitalGlitch}}',
        realtimePreview: false,
    },

    // ── Color ────────────────────────────────────────────────────────────────
    {
        // AE "Invert" — flip colour values (the X-ray base).
        id: 'invert',
        name: 'Invert',
        category: 'color',
        description: 'Invert all colour values — the high-contrast base for X-ray and negative looks.',
        parameters: [
            { key: 'enabled', label: 'Enabled', type: 'toggle', default: true },
        ],
        ffmpegTemplate: 'negate',
        realtimePreview: true,
    },
    {
        // AE "Brightness & Contrast" — a staple of nearly every tutorial.
        id: 'brightness_contrast',
        name: 'Brightness & Contrast',
        category: 'color',
        description: 'Direct brightness and contrast control.',
        parameters: [
            { key: 'brightness', label: 'Brightness', type: 'slider', min: -1, max: 1, step: 0.01, default: 0 },
            { key: 'contrast', label: 'Contrast', type: 'slider', min: 0, max: 3, step: 0.05, default: 1 },
        ],
        ffmpegTemplate: 'eq=brightness={{brightness}}:contrast={{contrast}}',
        realtimePreview: true,
    },

    // ── Style ────────────────────────────────────────────────────────────────
    {
        // AE "Threshold" — hard two-tone cutoff for gritty high-contrast grades.
        id: 'threshold',
        name: 'Threshold',
        category: 'style',
        description: 'Hard black/white threshold for a gritty, high-contrast two-tone look.',
        parameters: [
            { key: 'level', label: 'Level', type: 'slider', min: 0, max: 255, step: 1, default: 128 },
        ],
        ffmpegTemplate: '{{_threshold}}',
        realtimePreview: false,
    },
    {
        // AE "Mosaic" — block pixelation (X-ray texture).
        id: 'mosaic',
        name: 'Mosaic',
        category: 'style',
        description: 'Block pixelation — coarse mosaic texture (resolution-independent, neighbour-sampled).',
        parameters: [
            { key: 'size', label: 'Block Size', type: 'slider', min: 2, max: 64, step: 1, default: 8, unit: 'px' },
        ],
        ffmpegTemplate: '{{_mosaic}}',
        realtimePreview: false,
    },
    {
        // AE "Posterize Time" — drop the temporal frame rate for a choppy, filmic stutter.
        id: 'posterize_time',
        name: 'Posterize Time',
        category: 'style',
        description: 'Reduce the temporal frame rate for a choppy, hand-animated / filmic stutter.',
        parameters: [
            { key: 'rate', label: 'Frame Rate', type: 'slider', min: 4, max: 30, step: 1, default: 12, unit: 'fps' },
        ],
        ffmpegTemplate: 'fps=fps={{rate}}',
        realtimePreview: false,
    },

    // ── Distortion ───────────────────────────────────────────────────────────
    {
        // AE "Warp Fisheye" / CC Lens — barrel bulge (positive) or pinch (negative).
        id: 'fisheye',
        name: 'Fisheye / Warp',
        category: 'distortion',
        description: 'Lens warp — bulge outward (positive) or pinch inward (negative), like Warp Fisheye / CC Lens.',
        parameters: [
            { key: 'amount', label: 'Amount', type: 'slider', min: -100, max: 100, step: 1, default: 40 },
        ],
        ffmpegTemplate: '{{_fisheye}}',
        realtimePreview: false,
    },
    {
        // AE "Scatter" (Vertical) — per-column random pixel displacement.
        id: 'scatter',
        name: 'Scatter',
        category: 'distortion',
        description: 'Vertical pixel scatter — a shimmering per-column displacement, like AE Scatter.',
        parameters: [
            { key: 'amount', label: 'Amount', type: 'slider', min: 0, max: 40, step: 1, default: 20, unit: 'px' },
        ],
        ffmpegTemplate: '{{_scatter}}',
        realtimePreview: false,
    },

    // ── Creator Hacks: Glow & Light ─────────────────────────────────────────
    {
        id: 'light_bloom',
        name: 'Light Bloom',
        category: 'style' as const,
        description: 'Soft dreamy glow on highlights — duplicates layer with blur and screen blend. Popular social media editing hack.',
        parameters: [
            { key: 'intensity', label: 'Bloom Intensity', type: 'slider' as const, min: 0, max: 100, step: 5, default: 40, unit: '%' },
            { key: 'radius', label: 'Bloom Radius', type: 'slider' as const, min: 5, max: 60, step: 1, default: 20, unit: 'px' },
            { key: 'threshold', label: 'Highlight Threshold', type: 'slider' as const, min: 100, max: 250, step: 5, default: 180 },
        ],
        ffmpegTemplate: 'split[bloom_orig][bloom_copy];[bloom_copy]colorlevels=rimin={{threshold}}/255:gimin={{threshold}}/255:bimin={{threshold}}/255,gblur=sigma={{radius}}[bloom_blur];[bloom_orig][bloom_blur]blend=all_mode=screen:all_opacity={{intensity}}/100',
        cssPreview: 'brightness(1.{{intensity}}) contrast(1.05)',
        realtimePreview: true,
    },
    {
        id: 'blur_background',
        name: 'Blur Background Fill',
        category: 'blur' as const,
        description: 'Auto-fills letterbox/pillarbox areas with a blurred, scaled-up version of the source — the classic vertical-in-horizontal hack.',
        parameters: [
            { key: 'sigma', label: 'Blur Amount', type: 'slider' as const, min: 5, max: 40, step: 1, default: 20, unit: 'px' },
            { key: 'opacity', label: 'Background Opacity', type: 'slider' as const, min: 30, max: 100, step: 5, default: 80, unit: '%' },
        ],
        ffmpegTemplate: 'split[bg_orig][bg_copy];[bg_copy]scale=iw*3:ih*3,crop=iw:ih,gblur=sigma={{sigma}},colorchannelmixer=aa={{opacity}}/100[bg_blur];[bg_blur][bg_orig]overlay=(W-w)/2:(H-h)/2',
        cssPreview: 'blur({{sigma}}px)',
        realtimePreview: true,
    },
    {
        id: 'long_shadow',
        name: 'Long Shadow',
        category: 'style' as const,
        description: 'Dramatic long shadow text effect at a configurable angle and length — popular for title cards.',
        parameters: [
            { key: 'length', label: 'Shadow Length', type: 'slider' as const, min: 5, max: 200, step: 5, default: 50, unit: 'px' },
            { key: 'angle', label: 'Angle', type: 'slider' as const, min: 0, max: 360, step: 15, default: 135, unit: '°' },
            { key: 'opacity', label: 'Shadow Opacity', type: 'slider' as const, min: 10, max: 100, step: 5, default: 60, unit: '%' },
        ],
        ffmpegTemplate: 'drawbox=x=0:y=0:w=iw:h=ih:color=black@{{opacity}}/100:thickness=fill',
        cssPreview: 'drop-shadow({{length}}px {{length}}px 0 rgba(0,0,0,{{opacity}}/100))',
        realtimePreview: true,
    },
];

// ══════════════════════════════════════════════════════════════════════════════
// LOOKUP HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/** Internal index for fast lookups by ID */
const _effectById = new Map<string, ParametricEffect>();
for (const effect of EFFECT_REGISTRY) {
    _effectById.set(effect.id, effect);
}

// ── Sepia blending matrices (reused from effectCompiler.ts) ─────────────────
const IDENTITY_MATRIX = {
    rr: 1, rg: 0, rb: 0,
    gr: 0, gg: 1, gb: 0,
    br: 0, bg: 0, bb: 1,
};
const SEPIA_MATRIX = {
    rr: 0.393, rg: 0.769, rb: 0.189,
    gr: 0.349, gg: 0.686, gb: 0.168,
    br: 0.272, bg: 0.534, bb: 0.131,
};

function buildSepiaFilter(intensity: number): string {
    const t = Math.max(0, Math.min(100, intensity)) / 100;
    const rr = IDENTITY_MATRIX.rr * (1 - t) + SEPIA_MATRIX.rr * t;
    const rg = IDENTITY_MATRIX.rg * (1 - t) + SEPIA_MATRIX.rg * t;
    const rb = IDENTITY_MATRIX.rb * (1 - t) + SEPIA_MATRIX.rb * t;
    const gr = IDENTITY_MATRIX.gr * (1 - t) + SEPIA_MATRIX.gr * t;
    const gg = IDENTITY_MATRIX.gg * (1 - t) + SEPIA_MATRIX.gg * t;
    const gb = IDENTITY_MATRIX.gb * (1 - t) + SEPIA_MATRIX.gb * t;
    const br = IDENTITY_MATRIX.br * (1 - t) + SEPIA_MATRIX.br * t;
    const bg = IDENTITY_MATRIX.bg * (1 - t) + SEPIA_MATRIX.bg * t;
    const bb = IDENTITY_MATRIX.bb * (1 - t) + SEPIA_MATRIX.bb * t;
    return `colorchannelmixer=${rr.toFixed(3)}:${rg.toFixed(3)}:${rb.toFixed(3)}:0:${gr.toFixed(3)}:${gg.toFixed(3)}:${gb.toFixed(3)}:0:${br.toFixed(3)}:${bg.toFixed(3)}:${bb.toFixed(3)}:0`;
}

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Resolve a parametric effect to its FFmpeg filter string with all
 * {{placeholders}} substituted by the provided parameter values.
 *
 * Handles special-case effects like sepia_advanced and film_grain that
 * require computed sub-expressions.
 *
 * @param effectId - The effect identifier (e.g. 'color_temperature')
 * @param params   - Map of parameter key → value overrides
 * @returns Fully resolved FFmpeg filter string, or '' if effect not found
 */
/**
 * Build a `colorlevels` filter from 0-255 input black/white points plus gamma.
 * Returns '' when the settings are neutral (0/255/1.0).
 */
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
    if (Math.abs(g - 1.0) > 0.001) {
        parts.push(`eq=gamma=${g.toFixed(4)}`);
    }
    return parts.join(',');
}

// ── AE-derived effect builders ──────────────────────────────────────────────
// Shared with electron/parametricEffects.ts (kept in sync by hand — the electron
// tsconfig can't import across rootDir). Each returns a single 1-in/1-out -vf
// fragment; commas inside geq expressions are backslash-escaped so the fragment
// survives `filters.join(',')` in the filter builder.
const _fxClamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, isFinite(v) ? v : lo));

function buildTritoneFilter(intensity: number, warmth: number): string {
    const t = _fxClamp(intensity, 0, 100) / 100;
    const w = _fxClamp(warmth, -100, 100) / 100;
    const s = Math.max(0, 1 - 0.85 * t).toFixed(3);
    const m = 0.35 * t * w;                       // shadow/highlight tint magnitude
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
    const mid = (0.5 + 0.3 * t).toFixed(2);       // brighter edges with intensity
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
    // Positive amount = barrel bulge (negative lenscorrection k); negative = pinch.
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

export function resolveParametricEffect(
    effectId: string,
    params: Record<string, number | string | boolean>
): string {
    const effect = _effectById.get(effectId);
    if (!effect) return '';

    // Build a complete params map with defaults filled in
    const resolved: Record<string, number | string | boolean> = {};
    for (const p of effect.parameters) {
        resolved[p.key] = params[p.key] !== undefined ? params[p.key] : p.default;
    }

    // ── Special-case: toggle effects that do nothing when disabled ────────
    if (effectId === 'mirror_h' || effectId === 'mirror_v') {
        if (!resolved['enabled']) return '';
    }

    // ── Special-case: film_grain noise flag ───────────────────────────────
    if (effectId === 'film_grain') {
        (resolved as any)['_noiseFlag'] = resolved['animated'] ? 't+u' : 'u';
    }

    // ── Special-case: sepia_advanced — fully dynamic template ────────────
    if (effectId === 'sepia_advanced') {
        return buildSepiaFilter(Number(resolved['intensity']));
    }

    // ── Special-case: color_curves "none" preset → skip filter ───────────
    if (effectId === 'color_curves' && resolved['preset'] === 'none') {
        return '';
    }

    if (effectId === 'levels') {
        return buildLevelsFilter(Number(resolved['min']), Number(resolved['max']), Number(resolved['gamma']));
    }

    // ── AE-derived effects — dynamic builders ────────────────────────────
    if (effectId === 'tritone') {
        return buildTritoneFilter(Number(resolved['intensity']), Number(resolved['warmth']));
    }
    if (effectId === 'find_edges') {
        return buildFindEdgesFilter(Number(resolved['low']), Number(resolved['high']), Boolean(resolved['invert']));
    }
    if (effectId === 'glowing_edges') {
        return buildGlowingEdgesFilter(Number(resolved['intensity']));
    }
    if (effectId === 'film_emulation') {
        return buildFilmEmulationFilter(Number(resolved['strength']), Number(resolved['grain']));
    }
    if (effectId === 'wave_warp') {
        return buildWaveWarpFilter(Number(resolved['amplitude']), Number(resolved['wavelength']), Number(resolved['speed']));
    }
    if (effectId === 'turbulent_displace') {
        return buildTurbulentFilter(Number(resolved['amount']), Number(resolved['scale']));
    }
    if (effectId === 'digital_glitch') {
        return buildDigitalGlitchFilter(Number(resolved['intensity']));
    }
    if (effectId === 'invert') {
        return resolved['enabled'] ? 'negate' : '';
    }
    if (effectId === 'threshold') {
        return buildThresholdFilter(Number(resolved['level']));
    }
    if (effectId === 'mosaic') {
        return buildMosaicFilter(Number(resolved['size']));
    }
    // ── Special-case: light_bloom — composite filter chain ────────────────
    if (effectId === 'light_bloom') {
        const intensity = Number(resolved['intensity']) || 40;
        const radius = Number(resolved['radius']) || 20;
        const threshold = Number(resolved['threshold']) || 180;
        const threshNorm = (threshold / 255).toFixed(4);
        return `split[bloom_orig][bloom_copy];[bloom_copy]colorlevels=rimin=${threshNorm}:gimin=${threshNorm}:bimin=${threshNorm},gblur=sigma=${radius}[bloom_blur];[bloom_orig][bloom_blur]blend=all_mode=screen:all_opacity=${intensity / 100}`;
    }

    if (effectId === 'fisheye') {
        return buildFisheyeFilter(Number(resolved['amount']));
    }
    if (effectId === 'scatter') {
        return buildScatterFilter(Number(resolved['amount']));
    }

    // Substitute {{key}} placeholders in the template
    let filter = effect.ffmpegTemplate;
    for (const [key, value] of Object.entries(resolved)) {
        const placeholder = `{{${key}}}`;
        if (filter.includes(placeholder)) {
            filter = filter.split(placeholder).join(String(value));
        }
    }

    return filter;
}

/**
 * Get all effects grouped by category.
 */
export function getEffectsByCategory(): Record<string, ParametricEffect[]> {
    const grouped: Record<string, ParametricEffect[]> = {};
    for (const effect of EFFECT_REGISTRY) {
        if (!grouped[effect.category]) {
            grouped[effect.category] = [];
        }
        grouped[effect.category].push(effect);
    }
    return grouped;
}

/**
 * Get the default parameter values for a given effect.
 * Returns an empty object if the effect is not found.
 */
export function getDefaultParams(effectId: string): Record<string, number | string | boolean> {
    const effect = _effectById.get(effectId);
    if (!effect) return {};
    const defaults: Record<string, number | string | boolean> = {};
    for (const p of effect.parameters) {
        defaults[p.key] = p.default;
    }
    return defaults;
}

/**
 * Look up a single parametric effect definition by ID.
 */
export function getEffectById(effectId: string): ParametricEffect | undefined {
    return _effectById.get(effectId);
}
