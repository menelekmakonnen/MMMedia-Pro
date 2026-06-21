// ══════════════════════════════════════════════════════════════════════════════
// colorGrading.ts — Color Grading Types & FFmpeg Filter Builder
// Defines the ColorGrading data structure and converts it to an FFmpeg
// filter chain for export. Used by both the renderer (UI) and electron.
// ══════════════════════════════════════════════════════════════════════════════

export interface ColorGrading {
    // Basic adjustments
    /** Color temperature shift: -100 (cool) to 100 (warm), maps to colortemperature 2000–10000K */
    temperature: number;
    /** Green/magenta tint: -100 to 100, maps to colorbalance green midtone shift */
    tint: number;

    // Tone
    /** Exposure: -2.0 to 2.0, maps to eq brightness */
    exposure: number;
    /** Contrast: 0.5 to 2.0, maps to eq contrast */
    contrast: number;
    /** Highlights adjustment: -100 to 100, maps to colorbalance highlight channels */
    highlights: number;
    /** Shadows adjustment: -100 to 100, maps to colorbalance shadow channels */
    shadows: number;

    // Color
    /** Saturation: 0 to 2.0, maps to eq saturation */
    saturation: number;
    /** Vibrance: 0 to 2.0 (soft saturation boost — approximated via eq saturation) */
    vibrance: number;

    // Lift / Gamma / Gain color wheels
    /** Lift (shadows) RGB offset, -1..1 each (0 = neutral) */
    lift?: [number, number, number];
    /** Gamma (midtones) RGB, 0.1..3 each (1 = neutral) */
    gamma?: [number, number, number];
    /** Gain (highlights) RGB, -1..1 each (0 = neutral) */
    gain?: [number, number, number];

    // LUT
    /** Optional path to a .cube LUT file for 3D color lookup */
    lutFile?: string;
}

export const DEFAULT_COLOR_GRADING: ColorGrading = {
    temperature: 0,
    tint: 0,
    exposure: 0,
    contrast: 1.0,
    highlights: 0,
    shadows: 0,
    saturation: 1.0,
    vibrance: 1.0,
};

// ══════════════════════════════════════════════════════════════════════════════
// FILTER BUILDER
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Build a complete FFmpeg filter chain from a ColorGrading object.
 *
 * The chain is assembled in this order:
 *   1. colortemperature  (temperature)
 *   2. colorbalance      (tint + highlights + shadows — merged into one call)
 *   3. eq                (exposure + contrast + saturation + vibrance — merged)
 *   4. lut3d             (LUT file, if provided)
 *
 * Consecutive eq= and colorbalance= filters are merged into single calls
 * to reduce overhead.
 *
 * @returns Comma-separated FFmpeg filter string, or '' if grading is default.
 */
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

export function buildColorGradingFilter(grading: ColorGrading): string {
    if (isDefaultGrading(grading)) return '';

    const filters: string[] = [];

    const cgWheels = buildWheelFilters(grading);
    if (cgWheels) filters.push(cgWheels);

    // ── 1. Temperature ───────────────────────────────────────────────────
    // Map -100..100 → 2000..10000 K (linear)
    if (grading.temperature !== 0) {
        const kelvin = Math.round(6500 + (grading.temperature / 100) * (grading.temperature > 0 ? 3500 : 4500));
        filters.push(`colortemperature=temperature=${kelvin}`);
    }

    // ── 2. Colorbalance (tint + highlights + shadows merged) ─────────────
    const cbParts: string[] = [];

    // Tint → green midtone shift (negative tint = more magenta, positive = more green)
    if (grading.tint !== 0) {
        const tintValue = (grading.tint / 100).toFixed(4);
        cbParts.push(`gm=${tintValue}`);
    }

    // Highlights → uniform RGB highlight shift
    if (grading.highlights !== 0) {
        const hVal = (grading.highlights / 200).toFixed(4); // map -100..100 to -0.5..0.5
        cbParts.push(`rh=${hVal}`);
        cbParts.push(`gh=${hVal}`);
        cbParts.push(`bh=${hVal}`);
    }

    // Shadows → uniform RGB shadow shift
    if (grading.shadows !== 0) {
        const sVal = (grading.shadows / 200).toFixed(4); // map -100..100 to -0.5..0.5
        cbParts.push(`rs=${sVal}`);
        cbParts.push(`gs=${sVal}`);
        cbParts.push(`bs=${sVal}`);
    }

    if (cbParts.length > 0) {
        filters.push(`colorbalance=${cbParts.join(':')}`);
    }

    // ── 3. eq (exposure + contrast + saturation + vibrance merged) ───────
    const eqParts: string[] = [];

    // Exposure → brightness: map -2..2 to -1..1
    if (grading.exposure !== 0) {
        const brightness = (grading.exposure / 2).toFixed(4);
        eqParts.push(`brightness=${brightness}`);
    }

    // Contrast → eq contrast (direct passthrough, 1.0 = default)
    if (grading.contrast !== 1.0) {
        eqParts.push(`contrast=${grading.contrast.toFixed(4)}`);
    }

    // Saturation — combine base saturation and vibrance
    // Vibrance acts as a softer saturation boost, so we multiply them
    const effectiveSat = grading.saturation * grading.vibrance;
    if (Math.abs(effectiveSat - 1.0) > 0.001) {
        eqParts.push(`saturation=${effectiveSat.toFixed(4)}`);
    }

    if (eqParts.length > 0) {
        filters.push(`eq=${eqParts.join(':')}`);
    }

    // ── 4. LUT ───────────────────────────────────────────────────────────
    if (grading.lutFile) {
        // Escape backslashes for FFmpeg on Windows
        const escapedPath = grading.lutFile.replace(/\\/g, '/').replace(/:/g, '\\:');
        filters.push(`lut3d=${escapedPath}`);
    }

    return filters.join(',');
}

/**
 * Check if a ColorGrading object is equivalent to the default (no grading).
 * Returns true if all values match defaults, meaning the filter chain
 * can be skipped entirely.
 */
export function isDefaultGrading(grading: ColorGrading): boolean {
    return (
        grading.temperature === DEFAULT_COLOR_GRADING.temperature &&
        grading.tint === DEFAULT_COLOR_GRADING.tint &&
        grading.exposure === DEFAULT_COLOR_GRADING.exposure &&
        grading.contrast === DEFAULT_COLOR_GRADING.contrast &&
        grading.highlights === DEFAULT_COLOR_GRADING.highlights &&
        grading.shadows === DEFAULT_COLOR_GRADING.shadows &&
        grading.saturation === DEFAULT_COLOR_GRADING.saturation &&
        grading.vibrance === DEFAULT_COLOR_GRADING.vibrance &&
        isNeutralWheels(grading) &&
        !grading.lutFile
    );
}
