// ══════════════════════════════════════════════════════════════════════════════
// keyframes.ts — The keyframe-everything animation substrate.
// One Keyframe type + one evaluator (kfValue) drives any animatable numeric
// property, mirroring libopenshot's KeyFrame model (linear / constant / bezier).
// Plus helpers to bake a keyframed property into an FFmpeg expression so it can
// be rendered by expression-aware filters (eq, etc.).
// ══════════════════════════════════════════════════════════════════════════════

export type Interp = 'linear' | 'bezier' | 'constant';

export interface KfPoint {
    /** Frame number (timeline/source frame; consistent within one Keyframe). */
    frame: number;
    /** Value at this frame. */
    value: number;
    /** Interpolation from THIS point to the next. */
    interp?: Interp;
    /** Bezier control handles in absolute {frame,value} space (optional). */
    handleR?: [number, number]; // outgoing handle of this point
    handleL?: [number, number]; // incoming handle of the next point
}

export type Keyframe = KfPoint[];

/** Named easing presets expressed as CSS cubic-bezier(x1,y1,x2,y2) handles. */
export const EASING: Record<string, [number, number, number, number]> = {
    linear: [0, 0, 1, 1],
    ease: [0.25, 0.1, 0.25, 1],
    'ease-in': [0.42, 0, 1, 1],
    'ease-out': [0, 0, 0.58, 1],
    'ease-in-out': [0.42, 0, 0.58, 1],
    'ease-in-quad': [0.55, 0.085, 0.68, 0.53],
    'ease-out-quad': [0.25, 0.46, 0.45, 0.94],
    'ease-out-cubic': [0.215, 0.61, 0.355, 1],
};

function sortPoints(kf: Keyframe): Keyframe {
    return [...kf].sort((a, b) => a.frame - b.frame);
}

/** Solve cubic bezier for the value (Y) at a given X (frame) via parameter search.
 *  p0,p3 are endpoints; c1,c2 are control points; all in {frame(x),value(y)}. */
function bezierValueAtX(
    p0: [number, number], c1: [number, number], c2: [number, number], p3: [number, number], x: number
): number {
    const bx = (t: number) => {
        const mt = 1 - t;
        return mt * mt * mt * p0[0] + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t * t * t * p3[0];
    };
    const by = (t: number) => {
        const mt = 1 - t;
        return mt * mt * mt * p0[1] + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t * t * t * p3[1];
    };
    // Binary search t so bx(t) ≈ x (bx is monotonic for sane handles).
    let lo = 0, hi = 1, t = 0.5;
    for (let i = 0; i < 32; i++) {
        t = (lo + hi) / 2;
        const cx = bx(t);
        if (Math.abs(cx - x) < 1e-5) break;
        if (cx < x) lo = t; else hi = t;
    }
    return by(t);
}

/** Evaluate a keyframed property at a given frame. Clamps outside the range. */
export function kfValue(kf: Keyframe, frame: number): number {
    if (!kf || kf.length === 0) return 0;
    const pts = sortPoints(kf);
    if (kf.length === 1) return pts[0].value;
    if (frame <= pts[0].frame) return pts[0].value;
    if (frame >= pts[pts.length - 1].frame) return pts[pts.length - 1].value;

    let i = 0;
    while (i < pts.length - 1 && pts[i + 1].frame <= frame) i++;
    const a = pts[i], b = pts[i + 1];
    if (b.frame === a.frame) return a.value;
    const interp = a.interp || 'linear';
    if (interp === 'constant') return a.value;

    if (interp === 'bezier') {
        const c1 = a.handleR || [a.frame + (b.frame - a.frame) / 3, a.value];
        const c2 = a.handleL || b.handleL || [b.frame - (b.frame - a.frame) / 3, b.value];
        return bezierValueAtX([a.frame, a.value], c1, c2, [b.frame, b.value], frame);
    }
    // linear
    const r = (frame - a.frame) / (b.frame - a.frame);
    return a.value + (b.value - a.value) * r;
}

/** Remotion-style interpolate: map an input through ranges with clamping. */
export function interpolate(
    input: number, inRange: number[], outRange: number[],
    opts: { extrapolateLeft?: 'clamp' | 'extend'; extrapolateRight?: 'clamp' | 'extend' } = {}
): number {
    const eL = opts.extrapolateLeft || 'clamp';
    const eR = opts.extrapolateRight || 'clamp';
    if (input <= inRange[0]) {
        if (eL === 'clamp') return outRange[0];
    }
    if (input >= inRange[inRange.length - 1]) {
        if (eR === 'clamp') return outRange[outRange.length - 1];
    }
    let i = 0;
    while (i < inRange.length - 2 && input > inRange[i + 1]) i++;
    const a = inRange[i], b = inRange[i + 1], oa = outRange[i], ob = outRange[i + 1];
    if (b === a) return oa;
    return oa + (ob - oa) * ((input - a) / (b - a));
}

/** Scale all point frames by a factor (e.g. when a clip is retimed). */
export function scalePoints(kf: Keyframe, factor: number): Keyframe {
    return kf.map((p) => ({ ...p, frame: p.frame * factor }));
}

/** Reverse an animation within [0, totalFrames] (pairs with boomerang/reverse). */
export function flipPoints(kf: Keyframe, totalFrames: number): Keyframe {
    return sortPoints(kf.map((p) => ({ ...p, frame: totalFrames - p.frame }))).reverse().sort((a, b) => a.frame - b.frame);
}

/** Sample a keyframed property to a flat array over [fromFrame, toFrame). */
export function sampleKeyframes(kf: Keyframe, fromFrame: number, toFrame: number, step = 1): number[] {
    const out: number[] = [];
    for (let f = fromFrame; f < toFrame; f += step) out.push(kfValue(kf, f));
    return out;
}

/**
 * Bake a keyframed property into an FFmpeg expression in terms of `t` (seconds).
 * Bezier/eased segments are densely sampled into piecewise-linear pieces so the
 * single expression works in any eval-capable filter (eq, geq, overlay, …).
 * `fps` converts frames→seconds; `maxSegments` caps expression size.
 */
export function buildKeyframeExpr(
    kf: Keyframe, fps: number, opts: { maxSegments?: number } = {}
): string {
    if (!kf || kf.length === 0) return '0';
    const pts = sortPoints(kf);
    if (pts.length === 1) return pts[0].value.toFixed(5);

    const startF = pts[0].frame;
    const endF = pts[pts.length - 1].frame;
    const maxSeg = opts.maxSegments || 96;
    const spanF = Math.max(1, endF - startF);
    const stepF = Math.max(1, Math.ceil(spanF / maxSeg));

    // Dense (frame,value) samples covering the whole range.
    const samples: Array<[number, number]> = [];
    for (let f = startF; f < endF; f += stepF) samples.push([f, kfValue(pts, f)]);
    samples.push([endF, kfValue(pts, endF)]);

    const T = (f: number) => (f / fps).toFixed(5);
    const V = (v: number) => v.toFixed(5);

    // Build nested if() from the last segment backwards; clamp beyond the ends.
    let expr = V(samples[samples.length - 1][1]); // value at/after end
    for (let i = samples.length - 2; i >= 0; i--) {
        const [f0, v0] = samples[i];
        const [f1, v1] = samples[i + 1];
        const t0 = T(f0), t1 = T(f1);
        const dt = (f1 - f0) / fps;
        const seg = dt <= 0 ? V(v0) : `${V(v0)}+(${V(v1 - v0)})*(t-${t0})/${dt.toFixed(5)}`;
        expr = `if(lt(t\\,${t1})\\,${seg}\\,${expr})`;
    }
    // Before the first sample → hold first value.
    expr = `if(lt(t\\,${T(startF)})\\,${V(samples[0][1])}\\,${expr})`;
    return expr;
}

// ─── Transition ease presets ────────────────────────────────────────────────

export type TransitionEase = 'linear' | 'ease-out' | 'ease-in' | 'ease-in-out' | 'snap';

/**
 * Generate a two-point keyframe array with bezier easing between `from` and `to`
 * over `durationFrames`. Used by cinematic transitions (slide, zoom, white-flash).
 *
 * @param from           Start value
 * @param to             End value
 * @param durationFrames Total transition duration in frames
 * @param ease           Easing preset
 * @returns KfPoint[] array suitable for any keyframeable Clip property
 */
export function bezierEaseKeyframes(
    from: number,
    to: number,
    durationFrames: number,
    ease: TransitionEase = 'ease-out',
): KfPoint[] {
    const handles = EASING[ease === 'snap' ? 'ease-out-cubic' : ease] ?? EASING['ease-out'];
    // Map CSS bezier handles to absolute frame/value space
    const p0F = 0, p0V = from;
    const p3F = durationFrames, p3V = to;
    const rangeF = p3F - p0F;
    const rangeV = p3V - p0V;

    return [
        {
            frame: p0F,
            value: p0V,
            interp: 'bezier' as Interp,
            handleR: [p0F + handles[0] * rangeF, p0V + handles[1] * rangeV],
        },
        {
            frame: p3F,
            value: p3V,
            interp: 'constant' as Interp,
            handleL: [p0F + handles[2] * rangeF, p0V + handles[3] * rangeV],
        },
    ];
}

/**
 * Generate a three-point keyframe array (0 → peak → 0) for flash/pulse effects.
 * The peak occurs at the midpoint.
 */
export function flashKeyframes(
    peak: number,
    durationFrames: number,
    ease: TransitionEase = 'ease-out',
): KfPoint[] {
    const mid = Math.floor(durationFrames / 2);
    return [
        { frame: 0, value: 0, interp: 'bezier' as Interp },
        { frame: mid, value: peak, interp: 'bezier' as Interp },
        { frame: durationFrames, value: 0, interp: 'constant' as Interp },
    ];
}
