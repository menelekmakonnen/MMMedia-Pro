// ══════════════════════════════════════════════════════════════════════════════
// effectCompiler.ts — CSS→FFmpeg Filter Transpiler
// Runs in the Electron main process (Node.js).
// Converts CSS filter strings to FFmpeg video filter chains.
// ══════════════════════════════════════════════════════════════════════════════

// ── Identity and full-sepia color channel matrices ──────────────────────────
// Used for blending sepia at partial intensities via colorchannelmixer.
const IDENTITY_MATRIX = {
    rr: 1, rg: 0, rb: 0, ra: 0,
    gr: 0, gg: 1, gb: 0, ga: 0,
    br: 0, bg: 0, bb: 1, ba: 0,
};

const SEPIA_MATRIX = {
    rr: 0.393, rg: 0.769, rb: 0.189, ra: 0,
    gr: 0.349, gg: 0.686, gb: 0.168, ga: 0,
    br: 0.272, bg: 0.534, bb: 0.131, ba: 0,
};

// ── Hardcoded effect map ────────────────────────────────────────────────────
// These 6 manually crafted FFmpeg filters are higher quality than auto-transpiled
// versions; they take priority over CSS-based transpilation.
const HARDCODED_EFFECTS: Record<string, string> = {
    'fx_bw_contrast': 'hue=s=0,eq=contrast=1.2',
    'fx_vhs_glitch': 'boxblur=2:1,eq=contrast=1.2:saturation=1.2',
    'fx_warm_glow': 'colorbalance=rs=.2:gs=-.1:bs=-.2',
    'fx_cinematic_teal_v1': 'colorbalance=rs=-0.2:gs=0:bs=0.2:rm=0:gm=0:bm=0:rh=0.2:gh=0:bh=-0.2',
    'fx_vintage_film_v1': 'noise=alls=20:allf=t,eq=saturation=0.6:contrast=1.1',
    'fx_neon_glow_v1': 'eq=saturation=2.0:contrast=1.1',
};

// ── CSS shader map — built from reading every fx_gen_*.json's shader field ──
// Effects that have lumetriPresets but no CSS shader are NOT included here
// (they rely on their hardcoded FFmpeg equivalent above).
const CSS_EFFECT_MAP: Record<string, string> = {
    'fx_bw_contrast': 'grayscale(100%) contrast(150%)',
    'fx_gen_5': 'hue-rotate(50deg) sepia(25%)',
    'fx_gen_6': 'hue-rotate(60deg) sepia(30%)',
    'fx_gen_7': 'hue-rotate(70deg) sepia(35%)',
    'fx_gen_8': 'hue-rotate(80deg) sepia(40%)',
    'fx_gen_9': 'hue-rotate(90deg) sepia(45%)',
    'fx_gen_10': 'hue-rotate(100deg) sepia(50%)',
    'fx_gen_11': 'hue-rotate(110deg) sepia(55%)',
    'fx_gen_12': 'hue-rotate(120deg) sepia(60%)',
    'fx_gen_13': 'hue-rotate(130deg) sepia(65%)',
    'fx_gen_14': 'hue-rotate(140deg) sepia(70%)',
    'fx_gen_15': 'hue-rotate(150deg) sepia(75%)',
    'fx_gen_16': 'hue-rotate(160deg) sepia(80%)',
    'fx_gen_17': 'hue-rotate(170deg) sepia(85%)',
    'fx_gen_18': 'hue-rotate(180deg) sepia(90%)',
    'fx_gen_19': 'hue-rotate(190deg) sepia(95%)',
    'fx_gen_20': 'hue-rotate(200deg) sepia(100%)',
};

// ── Effects that cannot be exported (preview-only) ──────────────────────────
// Effects with lumetriPresets and no CSS shader fallback that also lack a
// hardcoded FFmpeg equivalent would go here. Currently all effects are exportable.
const PREVIEW_ONLY_EFFECTS = new Set<string>([
    // None currently — all effects have either hardcoded or CSS-transpiled equivalents.
]);

// ── Transpilation cache ─────────────────────────────────────────────────────
const transpileCache = new Map<string, string>();

// ══════════════════════════════════════════════════════════════════════════════
// CSS PARSER
// ══════════════════════════════════════════════════════════════════════════════

interface CssFilterToken {
    name: string;
    value: number;
    unit: string;   // 'deg', '%', 'px', or ''
    raw: string;
}

/**
 * Tokenize a CSS filter string into individual filter function calls.
 * e.g. "hue-rotate(50deg) sepia(25%)" → [{name:'hue-rotate', value:50, unit:'deg'}, ...]
 */
function tokenizeCssFilter(cssFilter: string): CssFilterToken[] {
    if (!cssFilter || typeof cssFilter !== 'string') return [];

    const tokens: CssFilterToken[] = [];
    // Match: functionName(value[unit])
    // Value accepts an optional sign, decimals, and scientific notation
    // (e.g. -50, .5, 1.2e2). Multi-arg functions like drop-shadow capture
    // only the first numeric token; they are intentionally not exportable.
    const regex = /([a-z-]+)\(\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(deg|%|px|rad|turn)?/gi;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(cssFilter)) !== null) {
        let value = parseFloat(match[2]);
        let unit = (match[3] || '').toLowerCase();

        if (!isFinite(value)) continue;

        // Normalize angle units to degrees so downstream code only deals in 'deg'
        if (unit === 'rad') { value = value * (180 / Math.PI); unit = 'deg'; }
        else if (unit === 'turn') { value = value * 360; unit = 'deg'; }

        tokens.push({
            name: match[1].toLowerCase(),
            value,
            unit,
            raw: match[0],
        });
    }

    return tokens;
}

/**
 * Build a sepia colorchannelmixer string at a given intensity (0–100).
 * Blends between the identity matrix and the full sepia matrix.
 */
function buildSepiaFilter(intensity: number): string {
    const t = Math.max(0, Math.min(100, intensity)) / 100;

    // Lerp each coefficient: identity*(1-t) + sepia*t
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

/**
 * Convert a single CSS filter function to its FFmpeg equivalent.
 * Returns empty string if not mappable.
 */
function convertSingleFilter(token: CssFilterToken): string {
    switch (token.name) {
        case 'hue-rotate': {
            // CSS: hue-rotate(Xdeg) → FFmpeg: hue=h=X
            // Round to 3 decimals and strip trailing zeros so unit-converted
            // angles (e.g. π rad → 180) produce clean filter strings.
            const degrees = parseFloat(token.value.toFixed(3));
            return `hue=h=${degrees}`;
        }

        case 'sepia': {
            // CSS: sepia(X%) → FFmpeg: colorchannelmixer blended at X%
            const intensity = token.unit === '%' ? token.value : token.value * 100;
            return buildSepiaFilter(intensity);
        }

        case 'saturate': {
            // CSS: saturate(X%) → FFmpeg: eq=saturation=X/100
            // CSS 100% = normal, FFmpeg 1.0 = normal
            const sat = (token.unit === '%' ? token.value : token.value * 100) / 100;
            return `eq=saturation=${sat.toFixed(2)}`;
        }

        case 'brightness': {
            // CSS: brightness(X%) → FFmpeg: eq=brightness=(X-100)/100
            // CSS 100% = normal (1.0), FFmpeg 0.0 = normal
            // FFmpeg brightness range: -1.0 to 1.0
            const pct = token.unit === '%' ? token.value : token.value * 100;
            const bright = (pct - 100) / 100;
            return `eq=brightness=${bright.toFixed(2)}`;
        }

        case 'contrast': {
            // CSS: contrast(X%) → FFmpeg: eq=contrast=X/100
            // CSS 100% = normal, FFmpeg 1.0 = normal
            const con = (token.unit === '%' ? token.value : token.value * 100) / 100;
            return `eq=contrast=${con.toFixed(2)}`;
        }

        case 'grayscale': {
            // CSS: grayscale(X%)
            // 100%: hue=s=0 (full desaturation)
            // Partial: colorchannelmixer blend toward grayscale
            const pct = token.unit === '%' ? token.value : token.value * 100;
            if (pct >= 100) {
                return 'hue=s=0';
            }
            // For partial grayscale, blend identity with a grayscale matrix
            // Grayscale matrix uses NTSC luma coefficients: R=0.299, G=0.587, B=0.114
            const t = pct / 100;
            const rr = 1 * (1 - t) + 0.299 * t;
            const rg = 0 * (1 - t) + 0.587 * t;
            const rb = 0 * (1 - t) + 0.114 * t;
            const gr = 0 * (1 - t) + 0.299 * t;
            const gg = 1 * (1 - t) + 0.587 * t;
            const gb = 0 * (1 - t) + 0.114 * t;
            const br = 0 * (1 - t) + 0.299 * t;
            const bg = 0 * (1 - t) + 0.587 * t;
            const bb = 1 * (1 - t) + 0.114 * t;
            return `colorchannelmixer=${rr.toFixed(3)}:${rg.toFixed(3)}:${rb.toFixed(3)}:0:${gr.toFixed(3)}:${gg.toFixed(3)}:${gb.toFixed(3)}:0:${br.toFixed(3)}:${bg.toFixed(3)}:${bb.toFixed(3)}:0`;
        }

        case 'blur': {
            // CSS: blur(Xpx) → FFmpeg: boxblur=X:X
            const radius = Math.max(1, Math.round(token.value));
            return `boxblur=${radius}:${radius}`;
        }

        case 'invert': {
            // CSS: invert(X%)
            // 100%: negate
            // Partial: use LUT-based inversion (approximate)
            const pct = token.unit === '%' ? token.value : token.value * 100;
            if (pct >= 100) {
                return 'negate';
            }
            if (pct <= 0) {
                return '';
            }
            // Partial invert via LUT: each pixel = (1-t)*val + t*(255-val) = val*(1-2t) + 255*t
            // Simplified to: lutrgb=r='(1-2*t)*val+255*t' for each channel
            const t = pct / 100;
            const scale = (1 - 2 * t).toFixed(4);
            const offset = Math.round(255 * t);
            return `lutrgb=r='${scale}*val+${offset}':g='${scale}*val+${offset}':b='${scale}*val+${offset}'`;
        }

        case 'opacity': {
            // Not directly mappable in video filters (would need alpha channel support)
            return '';
        }

        case 'drop-shadow': {
            // Not mappable to FFmpeg video filters
            return '';
        }

        default:
            return '';
    }
}

/**
 * Merge consecutive eq= filters into a single eq= call.
 * e.g. ['eq=saturation=1.5', 'eq=brightness=0.1'] → ['eq=saturation=1.5:brightness=0.1']
 */
function mergeEqFilters(filters: string[]): string[] {
    const merged: string[] = [];
    let pendingEqParams: string[] = [];

    const flushEq = () => {
        if (pendingEqParams.length > 0) {
            merged.push('eq=' + pendingEqParams.join(':'));
            pendingEqParams = [];
        }
    };

    for (const f of filters) {
        if (f.startsWith('eq=')) {
            // Extract the parameter portion after 'eq='
            pendingEqParams.push(f.slice(3));
        } else {
            flushEq();
            merged.push(f);
        }
    }
    flushEq();

    return merged;
}

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Parse a CSS filter string and return the equivalent FFmpeg video filter string.
 * Returns empty string if no mappable filters found.
 *
 * Examples:
 *   cssToFfmpeg('hue-rotate(50deg) sepia(25%)') → 'hue=h=50,colorchannelmixer=...'
 *   cssToFfmpeg('saturate(150%) brightness(110%)') → 'eq=saturation=1.50:brightness=0.10'
 *   cssToFfmpeg('grayscale(100%) contrast(120%)') → 'hue=s=0,eq=contrast=1.20'
 *   cssToFfmpeg('blur(2px) saturate(80%)') → 'boxblur=2:2,eq=saturation=0.80'
 *   cssToFfmpeg('') → ''
 */
export function cssToFfmpeg(cssFilter: string): string {
    if (!cssFilter || typeof cssFilter !== 'string') return '';

    // Check cache first
    const cached = transpileCache.get(cssFilter);
    if (cached !== undefined) return cached;

    const tokens = tokenizeCssFilter(cssFilter);
    if (tokens.length === 0) {
        transpileCache.set(cssFilter, '');
        return '';
    }

    const rawFilters = tokens
        .map(convertSingleFilter)
        .filter(f => f.length > 0);

    if (rawFilters.length === 0) {
        transpileCache.set(cssFilter, '');
        return '';
    }

    // Merge consecutive eq= filters for cleaner output
    const merged = mergeEqFilters(rawFilters);
    const result = merged.join(',');

    transpileCache.set(cssFilter, result);
    return result;
}

/**
 * Resolve an effect ID to its FFmpeg filter string.
 * Checks hardcoded map first (higher quality), then falls back to
 * CSS transpilation from the embedded shader map.
 * Also accepts a raw CSS string as fallback (for renderer-passed shaders).
 * Returns empty string if effect not found or not mappable.
 */
export function resolveEffectFilter(effectId: string): string {
    if (!effectId) return '';

    // 1. Check hardcoded high-quality FFmpeg filters
    if (HARDCODED_EFFECTS[effectId]) {
        return HARDCODED_EFFECTS[effectId];
    }

    // 2. Check CSS shader map (auto-transpile from embedded JSON data)
    if (CSS_EFFECT_MAP[effectId]) {
        return cssToFfmpeg(CSS_EFFECT_MAP[effectId]);
    }

    // 3. If the input looks like a CSS filter string (contains parentheses),
    //    treat it as a raw CSS string and transpile directly
    if (effectId.includes('(') && effectId.includes(')')) {
        return cssToFfmpeg(effectId);
    }

    return '';
}

/**
 * Check if an effect can be rendered in FFmpeg.
 * Returns false for effects that are preview-only.
 */
export function isEffectExportable(effectId: string): boolean {
    if (!effectId) return false;

    // Preview-only effects cannot be exported
    if (PREVIEW_ONLY_EFFECTS.has(effectId)) return false;

    // If we have a hardcoded or CSS-transpilable filter, it's exportable
    if (HARDCODED_EFFECTS[effectId]) return true;
    if (CSS_EFFECT_MAP[effectId]) return true;

    return false;
}

/**
 * Get all effects from the given list that cannot be exported,
 * for render warning UI.
 */
export function getUnexportableEffects(effectIds: string[]): string[] {
    if (!effectIds || effectIds.length === 0) return [];
    return effectIds.filter(id => !isEffectExportable(id));
}

/**
 * Get the full hardcoded effects map (for use by filterBuilder or main.ts).
 */
export function getHardcodedEffects(): Record<string, string> {
    return { ...HARDCODED_EFFECTS };
}

/**
 * Get the CSS effect map (for debugging / introspection).
 */
export function getCssEffectMap(): Record<string, string> {
    return { ...CSS_EFFECT_MAP };
}
