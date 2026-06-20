/**
 * Advanced Edit-Effect FFmpeg Filter Builders
 * ════════════════════════════════════════════════════════════════════════════
 * Pure string builders for the "next-level" trending effects. They are consumed
 * by electron/filterBuilder.ts, which bakes them into BOTH the preview proxy
 * files and the final export — so every effect shows up identically in the main
 * video player, the trailer player, and the rendered video.
 *
 * Two kinds of filters:
 *   • LINEAR  — a single filter inserted into the comma-joined -vf chain
 *               (motion blur, vibration flash, optical-flow slow-mo).
 *   • FORK/MERGE — effects that split the stream, process a copy and blend it
 *               back (glow bloom, double exposure). These are emitted as a
 *               trailing sub-graph appended after the linear chain; the result
 *               is still a valid single-input/single-output -vf graph.
 *
 * This module has NO imports so it stays trivially unit-testable in Node and
 * free of any DOM/Electron coupling.
 */

// ─── Config shapes (also used as Clip fields in types.ts) ──────────────────────

export type BlendMode = 'screen' | 'lighten' | 'overlay' | 'add' | 'softlight' | 'multiply';

export interface MotionBlurConfig {
    /** 0-100 — strength of the shutter trail. */
    amount: number;
}

export interface GlowConfig {
    /** 0-100 — strength of the bloom blended back over the image. */
    intensity: number;
    /** 0-100 — blur radius of the bloom. */
    radius: number;
    /** 0-100 — brightness threshold; higher = only brightest areas bloom. */
    threshold?: number;
}

/** Procedural, time-varying alpha shapes the top layer can be masked into. */
export type DoubleExposureShape =
    | 'stripes-v' | 'stripes-h' | 'stripes-d' | 'circle' | 'flame'
    | 'wave' | 'checker' | 'radial' | 'split-v' | 'diamond';

export const DOUBLE_EXPOSURE_SHAPES: DoubleExposureShape[] = [
    'stripes-v', 'stripes-h', 'stripes-d', 'circle', 'flame',
    'wave', 'checker', 'radial', 'split-v', 'diamond',
];

export interface DoubleExposureConfig {
    /** Absolute path to the SECOND clip layered over the base (the real "double"). */
    overlayPath: string;
    /** Source in/out of the overlay clip, in frames. */
    overlayTrimStart: number;
    overlayTrimEnd: number;
    /** How the top layer is blended over the base. */
    blendMode: BlendMode;
    /** 0-100 — opacity of the top layer. */
    opacity: number;
    /** Shape the top layer is confined to; null/undefined = full frame. */
    shape?: DoubleExposureShape | null;
}

export interface VibrationFlashConfig {
    /** 0-100 — peak brightness of the flash. */
    intensity: number;
    /** How many frames the flash decays over. */
    durationFrames: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** FFmpeg `blend` accepts `addition`, not `add`; map friendly names through. */
function ffBlendMode(mode: BlendMode): string {
    switch (mode) {
        case 'add': return 'addition';
        case 'screen': return 'screen';
        case 'lighten': return 'lighten';
        case 'overlay': return 'overlay';
        case 'softlight': return 'softlight';
        case 'multiply': return 'multiply';
        default: return 'screen';
    }
}

// ─── LINEAR filters ─────────────────────────────────────────────────────────────

/**
 * Motion blur via temporal frame mixing (a software "shutter angle").
 * Averages N consecutive frames so fast movement smears like a long exposure.
 * Returns '' when the effect is effectively off.
 */
export function buildMotionBlurChain(cfg: MotionBlurConfig | undefined): string {
    if (!cfg || cfg.amount <= 0) return '';
    // amount 1..100 → 2..8 averaged frames.
    const frames = clamp(Math.round(2 + (cfg.amount / 100) * 6), 2, 8);
    const weights = new Array(frames).fill('1').join(' ');
    return `tmix=frames=${frames}:weights=${weights}`;
}

/**
 * Optical-flow smooth slow-motion: synthesizes intermediate frames so slowed
 * footage stays fluid instead of stuttering. Heavy — only use on real slowdowns.
 */
export function buildMinterpolateChain(fps: number): string {
    const f = clamp(Math.round(fps) || 30, 1, 240);
    return `minterpolate=fps=${f}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`;
}

/**
 * Vibration Flash: a punchy brightness/saturation spike that decays over a few
 * frames — used to slam transitions and hammer heavy beats. Animated per-frame.
 */
export function buildVibrationFlashChain(cfg: VibrationFlashConfig | undefined, fps: number): string {
    if (!cfg || cfg.intensity <= 0) return '';
    const durSec = Math.max(0.03, (cfg.durationFrames || Math.round(fps * 0.12)) / Math.max(1, fps));
    const b = (clamp(cfg.intensity, 0, 100) / 100).toFixed(3);      // up to +1.0 brightness
    const s = (1 + (clamp(cfg.intensity, 0, 100) / 100) * 0.6).toFixed(3); // saturation pop
    const env = `max(0,1-t/${durSec.toFixed(3)})`;
    return `eq=brightness='${b}*${env}':saturation='1+(${s}-1)*${env}':eval=frame`;
}

// ─── FORK / MERGE sub-graph (glow + double exposure) ─────────────────────────────

interface ForkStage {
    /** Filters applied to the duplicated copy before it is blended back. */
    proc: string;
    /** Blend mode used to merge the processed copy over the base. */
    mode: string;
    /** 0-1 blend opacity. */
    opacity: number;
}

function glowStage(cfg: GlowConfig): ForkStage {
    const sigma = (clamp(cfg.radius, 0, 100) / 100) * 35 + 4;     // 4..39
    const thr = clamp(cfg.threshold ?? 55, 0, 100) / 100;          // bloom threshold
    // Keep only the bright areas, blur them → that's the bloom we screen back.
    const lo = thr.toFixed(3);
    const proc =
        `curves=all='0/0 ${lo}/0 1/1',gblur=sigma=${sigma.toFixed(2)}:steps=2`;
    return { proc, mode: 'screen', opacity: clamp(cfg.intensity, 0, 100) / 100 };
}

/**
 * Build the trailing fork/merge sub-graph for any combination of double exposure
 * and glow. Returns a string beginning with ',' to append directly after the
 * main comma-joined -vf chain, or '' when neither effect is active.
 *
 * Each stage becomes:  split=2[a][b];[b]<proc>[c];[a][c]blend=...   threaded by
 * intermediate [mN] labels so multiple stages chain into one 1-in/1-out graph.
 */
export function buildForkMergeGraph(opts: {
    glow?: GlowConfig;
}): string {
    const stages: ForkStage[] = [];
    if (opts.glow && opts.glow.intensity > 0) stages.push(glowStage(opts.glow));
    if (stages.length === 0) return '';

    const chains: string[] = [];
    stages.forEach((st, i) => {
        const inLabel = i === 0 ? '' : `[m${i - 1}]`;
        const outLabel = i === stages.length - 1 ? '' : `[m${i}]`;
        const a = `xa${i}`, b = `xb${i}`, c = `xc${i}`;
        chains.push(`${inLabel}split=2[${a}][${b}]`);
        chains.push(`[${b}]${st.proc}[${c}]`);
        chains.push(`[${a}][${c}]blend=all_mode=${st.mode}:all_opacity=${st.opacity.toFixed(3)}${outLabel}`);
    });

    return ',' + chains.join(';');
}

// ─── DOUBLE EXPOSURE (true two-clip overlay, optionally shape-masked) ─────────────
// A real double exposure layers a SECOND clip over the base at reduced opacity.
// Optionally the top layer is confined to a moving procedural SHAPE (flame,
// stripes, circle, …) so it reads as art rather than a flat dissolve. The shapes
// are time-varying (driven by `T`) so they never feel static or predictable.

/** Per-shape geq luma expression (white = show the blended top layer). Commas are
 *  escaped (\,) so the expression survives the FFmpeg filtergraph parser. */
function shapeLumaExpr(shape: DoubleExposureShape): string {
    switch (shape) {
        case 'stripes-v': return 'if(gte(mod(X+T*180\\,220)\\,110)\\,255\\,0)';
        case 'stripes-h': return 'if(gte(mod(Y+T*140\\,200)\\,100)\\,255\\,0)';
        case 'stripes-d': return 'if(gte(mod(X+Y+T*220\\,260)\\,130)\\,255\\,0)';
        case 'circle':    return 'if(lte(hypot(X-(W/2+sin(T*1.6)*W*0.22)\\,Y-(H/2+cos(T*1.3)*H*0.18))\\,H*0.34)\\,255\\,0)';
        case 'flame':     return 'clip((1.15-Y/H)*255*(0.5+0.5*sin(X/45+T*7)*sin(Y/28-T*9))\\,0\\,255)';
        case 'wave':      return 'clip(255-abs(Y-(H/2+sin(X/90+T*2.5)*H*0.22))*5\\,0\\,255)';
        case 'checker':   return 'if(eq(mod(floor((X+T*120)/140)+floor((Y+T*70)/140)\\,2)\\,0)\\,255\\,0)';
        case 'radial':    return 'clip(255-hypot(X-W/2\\,Y-H/2)/(H*0.5)*255\\,0\\,255)';
        case 'split-v':   return 'if(lt(X\\,W/2+sin(T*1.5)*W*0.15)\\,255\\,0)';
        case 'diamond':   return 'if(lte(abs(X-W/2)/(W*0.4)+abs(Y-H/2)/(H*0.4)\\,1)\\,255\\,0)';
        default:          return '255';
    }
}

/** Deterministically pick a shape from a 0..1 random value. */
export function pickDoubleExposureShape(rand: number): DoubleExposureShape {
    const i = Math.floor(Math.max(0, Math.min(0.9999, rand)) * DOUBLE_EXPOSURE_SHAPES.length);
    return DOUBLE_EXPOSURE_SHAPES[i];
}

/**
 * Build the filter-graph chains for a true double exposure. The base (main clip,
 * already processed) is provided as `baseLabel`; the overlay clip is a SECOND
 * input `overlayLabel` (e.g. '1:v'). Output is `outLabel`.
 *   • full frame  → blend the top layer over the whole base at `opacity`.
 *   • shaped      → split the base, blend one copy, then maskedmerge so the blend
 *                   only shows inside the moving shape and the base shows elsewhere.
 */
export function buildDoubleExposureGraph(
    cfg: DoubleExposureConfig,
    opts: { width: number; height: number; fps: number; baseLabel: string; overlayLabel: string; outLabel: string },
): string[] {
    const W = Math.round(opts.width), H = Math.round(opts.height);
    const mode = ffBlendMode(cfg.blendMode);
    const op = (clamp(cfg.opacity, 0, 100) / 100).toFixed(3);
    const chains: string[] = [];
    // Fit the overlay to the frame, matching fps/format so blend inputs agree.
    chains.push(`[${opts.overlayLabel}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${opts.fps},format=yuv420p[deov]`);

    if (!cfg.shape) {
        chains.push(`[${opts.baseLabel}][deov]blend=all_mode=${mode}:all_opacity=${op}[${opts.outLabel}]`);
        return chains;
    }
    // Shaped: base is reused twice → split it first (a label may be consumed once).
    chains.push(`[${opts.baseLabel}]split=2[deb1][deb2]`);
    chains.push(`[deb1][deov]blend=all_mode=${mode}:all_opacity=${op}[deblend]`);
    chains.push(`color=c=black:s=${W}x${H}:r=${opts.fps}[demaskbg]`);
    chains.push(`[demaskbg]geq=lum=${shapeLumaExpr(cfg.shape)}:cb=128:cr=128[demask]`);
    chains.push(`[deb2][deblend][demask]maskedmerge[${opts.outLabel}]`);
    return chains;
}

// ─── MUSIC-VIDEO LINEAR EFFECTS (work in preview proxies AND export) ──────────────
// All three are single-filter (linear) so they slot into the normal -vf chain and
// render identically in the players and the final export.

export interface RgbSplitConfig { amount: number; }   // 0-100 → chromatic separation px
export interface HueCycleConfig { speed: number; }     // 0-100 → degrees/second hue rotation
export interface VhsConfig { amount: number; }         // 0-100 → retro chroma-shift + grain

/** RGB / chromatic split — a music-video staple (red/blue fringing). */
export function buildRgbSplitChain(cfg: RgbSplitConfig | undefined): string {
    if (!cfg || cfg.amount <= 0) return '';
    const px = clamp(Math.round((cfg.amount / 100) * 12), 1, 12);
    return `rgbashift=rh=${px}:bh=${-px}`;
}

/** Continuous hue rotation over time — psychedelic colour throb. `h` is evaluated
 *  per frame natively, so no eval flag is needed. */
export function buildHueCycleChain(cfg: HueCycleConfig | undefined): string {
    if (!cfg || cfg.speed <= 0) return '';
    const deg = clamp(Math.round((cfg.speed / 100) * 180), 5, 180);
    return `hue=h=t*${deg}`;
}

/** VHS / retro: chroma shift + animated grain + saturation/contrast pop + softness. */
export function buildVhsChain(cfg: VhsConfig | undefined): string {
    if (!cfg || cfg.amount <= 0) return '';
    const a = clamp(cfg.amount, 0, 100) / 100;
    const px = clamp(Math.round(a * 8), 1, 8);
    const ns = clamp(Math.round(6 + a * 24), 4, 30);
    const sat = (1 + a * 0.35).toFixed(2);
    return `rgbashift=rh=${px}:bh=${-px},noise=alls=${ns}:allf=t,eq=saturation=${sat}:contrast=1.05,gblur=sigma=0.6`;
}
