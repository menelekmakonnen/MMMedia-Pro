// ══════════════════════════════════════════════════════════════════════════════
// filterBuilder.ts — FFmpeg Filter Chain Construction
// Runs in the Electron main process (Node.js).
// Extracts the duplicated filter chain construction from main.ts into shared,
// testable functions for both per-clip and monolithic export pipelines.
// ══════════════════════════════════════════════════════════════════════════════

import { resolveEffectFilter, cssToFfmpeg } from './effectCompiler';
import { buildDrawtextFilter } from '../src/lib/textOverlay';
import { buildAudioEffectsFilter } from '../src/lib/audioEffects';
import { resolveParametricEffect, buildColorGradingFilter, isDefaultGrading } from './parametricEffects';
import type { ColorGrading } from './parametricEffects';
import { buildSpeedRemapSetpts, curveHasSlowdown } from '../src/lib/effectsEngine';
import { buildKeyframeExpr } from '../src/lib/keyframes';
import { buildMotionBlurChain, buildVibrationFlashChain, buildMinterpolateChain, buildForkMergeGraph, buildRgbSplitChain, buildHueCycleChain, buildVhsChain } from '../src/lib/editEffectFilters';

// ── Data Types ──────────────────────────────────────────────────────────────

export interface ClipExportData {
    /** Absolute path to the source media file */
    path: string;
    /** Timeline start frame (project fps) — position on the timeline */
    startFrame: number;
    /** Timeline end frame (project fps) — position on the timeline */
    endFrame: number;
    /** Source IN point in frames (where to seek into the source media) */
    trimStartFrame?: number;
    /** Source OUT point in frames */
    trimEndFrame?: number;
    /** Total length of the source media in frames */
    sourceDurationFrames?: number;
    /** Playback speed multiplier (1.0 = normal) */
    speed: number;
    /** Volume percentage (0–200, default 100) */
    volume: number;
    /** Whether audio is muted */
    isMuted: boolean;
    /** Rotation in degrees (0, 90, 180, 270) */
    rotation?: number;
    /** Whether the clip should play in reverse */
    reversed?: boolean;
    /** Array of applied effect IDs */
    effectIds?: string[];
    /** CSS shader string for fx_gen_* effects (passed from renderer) */
    effectCss?: string;
    /** Zoom start percentage (100 = no zoom) */
    zoomStart?: number;
    /** Zoom end percentage */
    zoomEnd?: number;
    /** Zoom anchor point */
    zoomOrigin?: 'center' | 'top' | 'bottom' | 'left' | 'right';
    /** Static zoom level percentage (if no animated zoom) */
    zoomLevel?: number;
    /** Audio effects configuration */
    audioEffects?: any;
    /** Text overlay configurations */
    textOverlays?: any[];

    // ── New parametric & grading fields ──────────────────────────────────
    /** Parametric effects (new adjustable-param system) */
    parametricEffects?: Array<{ effectId: string; params: Record<string, number | string | boolean> }>;
    /** Color grading settings */
    colorGrading?: ColorGrading;
    /** Flip horizontally */
    flipH?: boolean;
    /** Flip vertically */
    flipV?: boolean;
    /** Sharpen amount (0 = off, 0.5-3.0 = strength) */
    sharpen?: number;
    /** Gaussian blur sigma (0 = off, 0.5-20) */
    blurAmount?: number;
    /** Chroma key (green screen removal) */
    chromaKey?: { enabled: boolean; color: string; similarity: number; blend: number };
    /** Video stabilization */
    stabilize?: { enabled: boolean; smoothing: number };
    /** Keyframed brightness (-1..1) baked to an eq expression. */
    brightnessKeyframes?: Array<{ frame: number; value: number; interp?: 'linear' | 'bezier' | 'constant'; handleR?: [number, number]; handleL?: [number, number] }>;
    /** Keyframed contrast (0..3) baked to an eq expression. */
    contrastKeyframes?: Array<{ frame: number; value: number; interp?: 'linear' | 'bezier' | 'constant'; handleR?: [number, number]; handleL?: [number, number] }>;
    /** Keyframed saturation (0..3) baked to an eq expression. */
    saturationKeyframes?: Array<{ frame: number; value: number; interp?: 'linear' | 'bezier' | 'constant'; handleR?: [number, number]; handleL?: [number, number] }>;

    // ── Super Editing Engine fields ──────────────────────────────────────
    /** Camera shake effect */
    shake?: {
        type: 'impact' | 'handheld' | 'earthquake' | 'vibration' | 'whip';
        intensity: number;
        direction: 'horizontal' | 'vertical' | 'radial' | 'rotational' | 'random';
        decayRate: number;
        durationFrames: number;
    };
    /** Animated blur (time-varying) */
    blurAnimated?: {
        type: 'gaussian' | 'motion' | 'radial' | 'directional';
        startSigma: number;
        endSigma: number;
        direction?: number;
    };
    /** Film grain strength (0-25) */
    filmGrain?: number;
    /** Vignette intensity (0-100) */
    vignette?: number;
    /** Cinematic letterboxing */
    letterbox?: boolean;
    /** Chromatic aberration offset pixels (0-20) */
    chromaticAberration?: number;
    /** Strobe/flicker effect */
    strobe?: { frequency: number; durationFrames: number };
    /** Echo/ghosting trails */
    echo?: { trailCount: number; opacity: number };
    /** Beat-reactive effects at specific times */
    beatEffect?: {
        flash?: { intensity: number; color: string; durationFrames: number };
        chromatic?: { offset: number; durationFrames: number };
        shake?: { type: string; intensity: number };
        zoom?: { punchScale: number; durationFrames: number };
    };
    /** Beat timestamps (seconds, relative to clip start) for beat-reactive effects */
    beatTimestamps?: number[];
    /** Zoom speed */
    zoomSpeed?: 'instant' | 'fast' | 'slow' | 'smooth';
    /** Zoom easing curve */
    zoomCurve?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'snap';
    /** Keyframed speed curve (normalized shape over the source window). When set,
     *  a continuous variable-speed time-remap is rendered instead of a constant
     *  speed — the clip keeps its timeline slot but ramps velocity smoothly. */
    speedCurve?: Array<{ time: number; speed: number }>;
    /** Synthesize intermediate frames (optical-flow) so slow-mo isn't choppy.
     *  Costly — only enable when a curve actually slows below 1×. */
    smoothSlowmo?: boolean;
    /** Shutter-style temporal motion blur. */
    motionBlur?: { amount: number };
    /** Bloom / soft glow. */
    glow?: { intensity: number; radius: number; threshold?: number };
    /** True double exposure: a SECOND clip overlaid (optionally shape-masked).
     *  Rendered as a two-input graph by the export engine, not in this chain. */
    doubleExposure?: {
        overlayPath: string; overlayTrimStart: number; overlayTrimEnd: number;
        blendMode: 'screen' | 'lighten' | 'overlay' | 'add' | 'softlight' | 'multiply';
        opacity: number;
        shape?: string | null;
    };
    /** Decaying brightness/saturation flash punch. */
    vibrationFlash?: { intensity: number; durationFrames: number };
    /** Chromatic / RGB split (music-video staple). */
    rgbSplit?: { amount: number };
    /** Continuous hue rotation over time. */
    hueCycle?: { speed: number };
    /** Retro VHS look (chroma shift + grain). */
    vhs?: { amount: number };
}

export interface ExportSettings {
    /** Output width in pixels */
    width: number;
    /** Output height in pixels */
    height: number;
    /** Output frames per second (controls the rendered file's frame rate) */
    fps: number;
    /** Project frames per second — used to convert frame counts to seconds.
     *  Defaults to `fps` when omitted (legacy behaviour). */
    projectFps?: number;
    /** Quality preset */
    quality: 'draft' | 'standard' | 'master';
    /** Video codec */
    codec: 'h264' | 'hevc';
}

export interface ProbeData {
    /** Source media width in pixels */
    width: number;
    /** Source media height in pixels */
    height: number;
    /** Source media duration in seconds */
    duration: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// CLIP TIMING
// ══════════════════════════════════════════════════════════════════════════════

export interface ClipTiming {
    /** Seconds to seek into the source media (the clip's IN point) */
    seekSec: number;
    /** Seconds of SOURCE material to read (before speed) */
    srcDurSec: number;
    /** Seconds of OUTPUT after speed is applied (the on-timeline length) */
    outDurSec: number;
    /** Output duration expressed in output frames */
    outFrames: number;
}

/**
 * Single source of truth for a clip's timing. Used by both the video-filter
 * builder and the export engines so seek/trim/duration can never drift.
 */
export function computeClipTiming(
    clip: ClipExportData,
    settings: ExportSettings,
    probeData: ProbeData
): ClipTiming {
    const speed = clip.speed || 1.0;
    const projectFps = settings.projectFps || settings.fps;
    const timelineDurSec = (clip.endFrame - clip.startFrame) / projectFps;
    let seekSec = Math.max(0, (clip.trimStartFrame ?? 0) / projectFps);
    let srcDurSec = timelineDurSec * speed;

    if (probeData.duration > 0.5) {
        if (seekSec >= probeData.duration) {
            seekSec = Math.max(0, probeData.duration - srcDurSec - 0.5);
        }
        if (seekSec + srcDurSec > probeData.duration) {
            srcDurSec = Math.max(0.04, probeData.duration - seekSec - 0.01);
        }
    }
    if (srcDurSec < 0.01) srcDurSec = 0.04;

    const outDurSec = srcDurSec / speed;
    return {
        seekSec,
        srcDurSec,
        outDurSec,
        outFrames: Math.max(1, Math.round(outDurSec * settings.fps)),
    };
}

/**
 * Build the per-clip AUDIO filter chain (no stream labels).
 * Order: atrim → asetpts → reverse? → speed(atempo) → audio effects → volume.
 * Returns a comma-joined chain. `preSeeked` mirrors buildVideoFilter.
 */
export function buildClipAudioFilter(
    clip: ClipExportData,
    settings: ExportSettings,
    probeData: ProbeData,
    opts: { preSeeked?: boolean } = {}
): string {
    const timing = computeClipTiming(clip, settings, probeData);
    const speed = clip.speed || 1.0;
    const filters: string[] = [];

    if (opts.preSeeked) {
        filters.push(`atrim=start=0:duration=${timing.srcDurSec.toFixed(4)}`);
    } else {
        filters.push(`atrim=start=${timing.seekSec.toFixed(4)}:end=${(timing.seekSec + timing.srcDurSec).toFixed(4)}`);
    }
    filters.push('asetpts=PTS-STARTPTS');

    if (clip.reversed) filters.push('areverse');

    if (speed !== 1.0) {
        const atempo = buildAtempoChain(speed);
        if (atempo) filters.push(atempo);
    }

    if (clip.audioEffects) {
        const fx = buildAudioEffectsFilter(clip.audioEffects, timing.outDurSec);
        if (fx) filters.push(fx);
    }

    const vol = ((clip.volume ?? 100) / 100) * (clip.isMuted ? 0 : 1);
    filters.push(`volume=${vol.toFixed(4)}`);
    // Normalize to a uniform layout so concat/xfade across intermediates is clean.
    filters.push('aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo');

    return filters.join(',');
}

// ══════════════════════════════════════════════════════════════════════════════
// ZOOMPAN FILTER
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Build the zoompan filter string for a clip with zoom data.
 * Returns empty string if no zoom needed.
 *
 * The zoompan filter animates zoom over the clip duration:
 *   zoompan=z='lerp(zs,ze,on/d)':x=...:y=...:d=FRAMES:s=WxH:fps=FPS
 *
 * Must come BEFORE scale/pad in the filter chain because it changes frame size.
 */
export function buildZoompanFilter(
    clip: ClipExportData,
    clipDurationFrames: number,
    outputWidth: number,
    outputHeight: number,
    fps: number = 30
): string {
    const zoomStart = clip.zoomStart ?? 100;
    const zoomEnd = clip.zoomEnd ?? (clip.zoomLevel ?? 100);

    // No zoom needed if both start and end are 100% (or very close)
    if (Math.abs(zoomStart - 100) < 0.5 && Math.abs(zoomEnd - 100) < 0.5) {
        return '';
    }

    // Zoom IN only — clamp to >=100% so zoom can never reveal beyond the frame edges.
    const zs = (Math.max(100, zoomStart) / 100).toFixed(4);
    const ze = (Math.max(100, zoomEnd) / 100).toFixed(4);
    const d = Math.max(1, Math.round(clipDurationFrames));
    const origin = clip.zoomOrigin || 'center';

    // Build x/y expressions based on zoom origin
    let xExpr: string;
    let yExpr: string;

    switch (origin) {
        case 'top':
            xExpr = "'iw/2-(iw/zoom/2)'";
            yExpr = "'0'";
            break;
        case 'bottom':
            xExpr = "'iw/2-(iw/zoom/2)'";
            yExpr = "'ih-ih/zoom'";
            break;
        case 'left':
            xExpr = "'0'";
            yExpr = "'ih/2-(ih/zoom/2)'";
            break;
        case 'right':
            xExpr = "'iw-iw/zoom'";
            yExpr = "'ih/2-(ih/zoom/2)'";
            break;
        case 'center':
        default:
            xExpr = "'iw/2-(iw/zoom/2)'";
            yExpr = "'ih/2-(ih/zoom/2)'";
            break;
    }

    // CRITICAL: d MUST be 1 for video input. zoompan emits `d` frames for EACH
    // input frame, so d=clipDurationFrames on a multi-frame clip multiplies the
    // duration by clipDurationFrames (the "30-minute export" bug). With d=1 we
    // get exactly one output frame per input frame and animate the zoom via the
    // global output-frame counter `on` over the clip's total frame span.
    const totalFrames = d; // total output frames over which to interpolate

    // Build eased progress expression based on zoomCurve
    // t = linear progress (0..1), eased = curve-adjusted progress
    const curve = clip.zoomCurve || 'linear';
    let tExpr: string;
    switch (curve) {
        case 'ease-in':
            // Quadratic ease-in: t^2
            tExpr = `min(1,on/${totalFrames})*min(1,on/${totalFrames})`;
            break;
        case 'ease-out':
            // Quadratic ease-out: 1-(1-t)^2
            tExpr = `(1-(1-min(1,on/${totalFrames}))*(1-min(1,on/${totalFrames})))`;
            break;
        case 'ease-in-out':
            // Smoothstep: 3t^2 - 2t^3
            tExpr = `(3*min(1,on/${totalFrames})*min(1,on/${totalFrames})-2*min(1,on/${totalFrames})*min(1,on/${totalFrames})*min(1,on/${totalFrames}))`;
            break;
        case 'snap':
            // Fast snap: cubic ease-out for punchy zoom
            tExpr = `(1-(1-min(1,on/${totalFrames}))*(1-min(1,on/${totalFrames}))*(1-min(1,on/${totalFrames})))`;
            break;
        case 'linear':
        default:
            tExpr = `min(1,on/${totalFrames})`;
            break;
    }
    // Interpolate: zs + (ze - zs) * eased_t
    const zExpr = `'${zs}+(${ze}-${zs})*${tExpr}'`;

    return `zoompan=z=${zExpr}:x=${xExpr}:y=${yExpr}:d=1:s=${outputWidth}x${outputHeight}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// ATEMPO CHAIN
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Build the atempo filter chain for a given speed.
 * FFmpeg atempo only accepts 0.5–100.0, so speeds outside this range
 * need chained filters.
 *
 * Examples:
 *   buildAtempoChain(1.0) → '' (no filter needed)
 *   buildAtempoChain(2.0) → 'atempo=2.0000'
 *   buildAtempoChain(0.25) → 'atempo=0.5,atempo=0.5'
 *   buildAtempoChain(0.125) → 'atempo=0.5,atempo=0.5,atempo=0.5'
 *   buildAtempoChain(4.0) → 'atempo=4.0000'
 */
export function buildAtempoChain(speed: number): string {
    if (speed === 1.0) return '';

    let rem = speed;
    const parts: string[] = [];

    // Chain atempo=2.0 for speeds > 2.0 (split into powers of 2)
    while (rem > 2.0) {
        parts.push('atempo=2.0');
        rem /= 2.0;
    }

    // Chain atempo=0.5 for speeds < 0.5 (split into inverse powers of 2)
    while (rem < 0.5) {
        parts.push('atempo=0.5');
        rem /= 0.5;
    }

    // Final atempo for the remainder (guaranteed 0.5 ≤ rem ≤ 2.0 or ≤ 100)
    parts.push(`atempo=${rem.toFixed(4)}`);

    return parts.join(',');
}

// ══════════════════════════════════════════════════════════════════════════════
// VIDEO FILTER CHAIN
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Build the video filter chain for a single clip.
 *
 * Filter order:
 *   trim → setpts → reverse? → rotation → zoompan → scale/pad → effects → speed → fps
 *
 * @param clip - The clip export data
 * @param settings - Export settings (resolution, fps, quality)
 * @param probeData - Probed source media dimensions and duration
 * @returns FFmpeg video filter chain string (without stream labels)
 */
export function buildVideoFilter(
    clip: ClipExportData,
    settings: ExportSettings,
    probeData: ProbeData,
    opts: { preSeeked?: boolean } = {}
): string {
    const speed = clip.speed || 1.0;
    const fps = settings.fps;
    const outW = settings.width;
    const outH = settings.height;

    // Single source of truth for seek/trim/duration (uses trimStartFrame + projectFps).
    const timing = computeClipTiming(clip, settings, probeData);
    const clipDur = timing.srcDurSec;

    const filters: string[] = [];

    // 1. Trim + reset PTS.
    //    When the caller fast-seeks with `-ss` before `-i` (preSeeked), the source
    //    is already positioned at the IN point, so we trim from 0. Otherwise we
    //    trim by absolute source timestamps.
    if (opts.preSeeked) {
        filters.push(`trim=start=0:duration=${clipDur.toFixed(4)}`);
    } else {
        filters.push(`trim=start=${timing.seekSec.toFixed(4)}:end=${(timing.seekSec + clipDur).toFixed(4)}`);
    }
    filters.push('setpts=PTS-STARTPTS');

    // 2. Reverse (for short clips ≤ 5 seconds, applied inline)
    if (clip.reversed && !shouldUseIntermediateForReverse(clip, fps)) {
        filters.push('reverse');
    }

    // 2b. Flip H/V (before rotation so orientation is intuitive)
    if (clip.flipH) {
        filters.push('hflip');
    }
    if (clip.flipV) {
        filters.push('vflip');
    }

    // 3. Rotation
    const rot = clip.rotation || 0;
    if (rot === 90) {
        filters.push('transpose=1');
    } else if (rot === 180) {
        filters.push('transpose=1');
        filters.push('transpose=1');
    } else if (rot === 270) {
        filters.push('transpose=2');
    }

    // 4. Zoompan (must come before scale/pad — it changes frame size)
    const outputDurSec = clipDur / speed;
    const clipDurationFrames = outputDurSec * fps;
    const zoompan = buildZoompanFilter(clip, clipDurationFrames, outW, outH, fps);
    if (zoompan) {
        filters.push(zoompan);
    }

    // 5. Scale + pad to output resolution
    filters.push(`scale=${outW}:${outH}:force_original_aspect_ratio=decrease`);
    filters.push(`pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2`);
    filters.push('setsar=1');

    // 5b. Video stabilization. Single-pass `deshake` keeps the per-clip filtergraph
    //     intact (a higher-quality two-pass vidstab path can be applied by the export
    //     engine, which sets _vidstabApplied to skip this). The smoothing slider
    //     (1-60) maps to the deshake search range in pixels.
    if (clip.stabilize && clip.stabilize.enabled && !(clip as any)._vidstabApplied) {
        const s = Math.min(64, Math.max(8, Math.round(clip.stabilize.smoothing || 10)));
        filters.push(`deshake=rx=${s}:ry=${s}:edge=clamp`);
    }

    // 6. Chroma key (after scale/pad, before color grading)
    if (clip.chromaKey && clip.chromaKey.enabled) {
        const hex = clip.chromaKey.color.replace('#', '');
        const sim = clip.chromaKey.similarity.toFixed(4);
        const blend = clip.chromaKey.blend.toFixed(4);
        filters.push(`chromakey=color=0x${hex}:similarity=${sim}:blend=${blend}`);
    }

    // 7. Color grading (after chroma key, before effects)
    if (clip.colorGrading && !isDefaultGrading(clip.colorGrading)) {
        const cgFilter = buildColorGradingFilter(clip.colorGrading);
        if (cgFilter) {
            filters.push(cgFilter);
        }
    }

    // 7b. Keyframed brightness/contrast/saturation (keyframe-everything substrate,
    //     baked into a single eq expression evaluated per frame).
    {
        const eqKf: string[] = [];
        if (clip.brightnessKeyframes && clip.brightnessKeyframes.length > 1) eqKf.push(`brightness='${buildKeyframeExpr(clip.brightnessKeyframes as any, fps)}'`);
        if (clip.contrastKeyframes && clip.contrastKeyframes.length > 1) eqKf.push(`contrast='${buildKeyframeExpr(clip.contrastKeyframes as any, fps)}'`);
        if (clip.saturationKeyframes && clip.saturationKeyframes.length > 1) eqKf.push(`saturation='${buildKeyframeExpr(clip.saturationKeyframes as any, fps)}'`);
        if (eqKf.length) filters.push(`eq=${eqKf.join(':')}:eval=frame`);
    }

    // 8. Legacy effects (effectIds + CSS)
    const effectFilters = buildEffectFilters(clip);
    if (effectFilters) {
        filters.push(effectFilters);
    }

    // 6b. Text Overlays (after effects, before speed)
    if (clip.textOverlays && clip.textOverlays.length > 0) {
        for (const overlay of clip.textOverlays) {
            const dt = buildDrawtextFilter(overlay, outputDurSec, outW, outH);
            if (dt) filters.push(dt);
        }
    }

    // 9. Parametric effects (new system)
    if (clip.parametricEffects && clip.parametricEffects.length > 0) {
        for (const pe of clip.parametricEffects) {
            const peFilter = resolveParametricEffect(pe.effectId, pe.params);
            if (peFilter) {
                filters.push(peFilter);
            }
        }
    }

    // 10. Quick sharpen / blur (before speed)
    if (clip.sharpen && clip.sharpen > 0) {
        filters.push(`unsharp=5:5:${clip.sharpen.toFixed(4)}:5:5:0`);
    }
    if (clip.blurAmount && clip.blurAmount > 0) {
        filters.push(`gblur=sigma=${clip.blurAmount.toFixed(4)}`);
    }

    // ── Super Editing Engine Filters ──────────────────────────────────

    // 10a. Animated blur (time-varying gaussian)
    if (clip.blurAnimated && (clip.blurAnimated.startSigma > 0 || clip.blurAnimated.endSigma > 0)) {
        const ab = clip.blurAnimated;
        if (ab.type === 'gaussian' || !ab.type) {
            // Linearly interpolate sigma over the clip duration
            const durFrames = Math.max(1, clipDurationFrames);
            filters.push(`gblur=sigma='${ab.startSigma.toFixed(2)}+(${ab.endSigma.toFixed(2)}-${ab.startSigma.toFixed(2)})*min(1,n/${durFrames})'`);
        } else if (ab.type === 'motion') {
            // Temporal blend for motion blur effect
            filters.push('tblend=all_mode=average');
        }
    }

    // 10b. Film grain (noise overlay)
    if (clip.filmGrain && clip.filmGrain > 0) {
        filters.push(`noise=c0s=${Math.round(clip.filmGrain)}:c0f=t+u`);
    }

    // 10c. Vignette (edge darkening)
    if (clip.vignette && clip.vignette > 0) {
        // Map 0-100 intensity to vignette angle (PI/6 to PI/2)
        const angle = (Math.PI / 6) + ((clip.vignette / 100) * (Math.PI / 2 - Math.PI / 6));
        filters.push(`vignette=${angle.toFixed(4)}`);
    }

    // 10d. Chromatic aberration (RGB channel offset)
    if (clip.chromaticAberration && clip.chromaticAberration > 0) {
        const offset = Math.round(clip.chromaticAberration);
        filters.push(`rgbashift=rh=${offset}:bh=${-offset}`);
    }

    // 10e. Letterbox (cinematic bars — 2.39:1 ratio)
    if (clip.letterbox) {
        const barHeight = Math.round(outH * 0.12);
        filters.push(`drawbox=x=0:y=0:w=iw:h=${barHeight}:t=fill:color=black`);
        filters.push(`drawbox=x=0:y=ih-${barHeight}:w=iw:h=${barHeight}:t=fill:color=black`);
    }

    // 10f. Camera shake (crop-based with scale-up to hide edges)
    if (clip.shake && clip.shake.intensity > 0) {
        const sh = clip.shake;
        const maxOffset = Math.round((sh.intensity / 100) * 30); // 0-30px max
        const scaleUp = 1 + (maxOffset * 2.5) / Math.min(outW, outH);
        // Scale up slightly to allow crop offsets without black edges
        filters.push(`scale=${Math.round(outW * scaleUp)}:${Math.round(outH * scaleUp)}`);
        // Use coherent sine-based motion with decay for smooth, non-jittery shake
        if (sh.type === 'impact') {
            // Impact: multi-frequency sine blend with exponential decay — feels like a camera hit
            const decay = sh.decayRate || 5;
            filters.push(`crop=${outW}:${outH}:` +
                `'(iw-${outW})/2+${maxOffset}*(sin(t*23.7)*0.6+sin(t*37.1)*0.4)*exp(-${decay}*t)':` +
                `'(ih-${outH})/2+${maxOffset}*(sin(t*19.3)*0.5+sin(t*31.7)*0.5)*exp(-${decay}*t)'`);
        } else if (sh.type === 'vibration') {
            // Vibration: high-frequency coherent sine (not random jitter)
            const a = Math.round(maxOffset * 0.15);
            filters.push(`crop=${outW}:${outH}:` +
                `'(iw-${outW})/2+${a}*sin(t*67.3)*sin(t*43.1)':` +
                `'(ih-${outH})/2+${a}*sin(t*53.7)*sin(t*71.9)'`);
        } else if (sh.type === 'earthquake') {
            // Earthquake: low-freq Y-dominant sinusoidal
            filters.push(`crop=${outW}:${outH}:` +
                `'(iw-${outW})/2+${Math.round(maxOffset * 0.3)}*sin(t*2*PI)':` +
                `'(ih-${outH})/2+${maxOffset}*sin(t*1.5*PI)'`);
        } else if (sh.type === 'handheld') {
            // Handheld: smooth organic drift via product-of-sines (Lissajous-like)
            filters.push(`crop=${outW}:${outH}:` +
                `'(iw-${outW})/2+${Math.round(maxOffset * 0.4)}*sin(t*3.7)*sin(t*2.3)':` +
                `'(ih-${outH})/2+${Math.round(maxOffset * 0.4)}*sin(t*2.1)*sin(t*4.1)'`);
        } else if (sh.type === 'whip') {
            // Single directional sweep with eased motion
            const dir = sh.direction === 'vertical' ? 'y' : 'x';
            if (dir === 'x') {
                filters.push(`crop=${outW}:${outH}:` +
                    `'(iw-${outW})/2+${maxOffset}*(-1+2*min(1,t*5))':` +
                    `'(ih-${outH})/2'`);
            } else {
                filters.push(`crop=${outW}:${outH}:` +
                    `'(iw-${outW})/2':` +
                    `'(ih-${outH})/2+${maxOffset}*(-1+2*min(1,t*5))'`);
            }
        } else {
            // Default fallback: coherent multi-sine (no random())
            filters.push(`crop=${outW}:${outH}:` +
                `'(iw-${outW})/2+${maxOffset}*sin(t*11.3)*sin(t*7.1)':` +
                `'(ih-${outH})/2+${maxOffset}*sin(t*13.7)*sin(t*5.3)'`);
        }
    }

    // 10g. Strobe/flicker effect
    if (clip.strobe && clip.strobe.frequency > 0) {
        // Toggle brightness between normal and near-white at given frequency
        const freq = clip.strobe.frequency;
        filters.push(`eq=brightness='0.3*gt(sin(t*${freq}*2*PI),0)'`);
    }

    // 10h. Beat-reactive flash (brightness spike at beat timestamps)
    if (clip.beatEffect?.flash && clip.beatTimestamps && clip.beatTimestamps.length > 0) {
        const flash = clip.beatEffect.flash;
        const flashDurSec = flash.durationFrames / fps;
        const enableExpr = clip.beatTimestamps
            .map(bt => `between(t,${bt.toFixed(4)},${(bt + flashDurSec).toFixed(4)})`)
            .join('+');
        filters.push(`eq=brightness='${flash.intensity.toFixed(2)}*gt(${enableExpr},0)'`);
    }

    // 10h-b. Beat-reactive chromatic aberration (rgbashift at beat timestamps)
    if (clip.beatEffect?.chromatic && clip.beatTimestamps && clip.beatTimestamps.length > 0) {
        const chroma = clip.beatEffect.chromatic;
        const chromaDurSec = chroma.durationFrames / fps;
        const chromaEnableExpr = clip.beatTimestamps
            .map(bt => `between(t,${bt.toFixed(4)},${(bt + chromaDurSec).toFixed(4)})`)
            .join('+');
        const offset = chroma.offset;
        filters.push(`rgbashift=rh='${offset}*gt(${chromaEnableExpr},0)':bh='${-offset}*gt(${chromaEnableExpr},0)'`);
    }

    // 10i. Beat-reactive shake boost: merged into clip.shake during generation (trailerGenerator.ts)

    // 10j. Beat-reactive zoom punch (scale + crop at beat timestamps)
    if (clip.beatEffect?.zoom && clip.beatTimestamps && clip.beatTimestamps.length > 0) {
        const zoomPunch = clip.beatEffect.zoom;
        const punchDurSec = zoomPunch.durationFrames / fps;
        const punch = zoomPunch.punchScale - 1; // e.g. 1.05 → 0.05
        const zoomEnableExpr = clip.beatTimestamps
            .map(bt => `between(t,${bt.toFixed(4)},${(bt + punchDurSec).toFixed(4)})`)
            .join('+');
        filters.push(`scale='iw*(1+${punch.toFixed(4)}*gt(${zoomEnableExpr},0))':'ih*(1+${punch.toFixed(4)}*gt(${zoomEnableExpr},0))'`);
        filters.push(`crop=${outW}:${outH}:'(iw-${outW})/2':'(ih-${outH})/2'`);
    }

    // 10z. Advanced linear edit-effects: shutter motion blur + vibration flash.
    const mbChain = buildMotionBlurChain(clip.motionBlur);
    if (mbChain) filters.push(mbChain);
    const vFlash = buildVibrationFlashChain(clip.vibrationFlash, fps);
    if (vFlash) filters.push(vFlash);
    const rgbS = buildRgbSplitChain(clip.rgbSplit);
    if (rgbS) filters.push(rgbS);
    const hueC = buildHueCycleChain(clip.hueCycle);
    if (hueC) filters.push(hueC);
    const vhsC = buildVhsChain(clip.vhs);
    if (vhsC) filters.push(vhsC);

    // 11. Speed adjustment via setpts
    //     Variable-speed time-remap (smooth ramp) when a keyframed curve is set;
    //     otherwise the constant-speed mapping. The remap is rescaled so the clip
    //     still fills exactly its timeline slot (average speed = clip.speed), so
    //     downstream concat/audio timing is unchanged.
    const remap = clip.speedCurve
        ? buildSpeedRemapSetpts(clip.speedCurve, timing.srcDurSec, speed)
        : null;
    if (remap) {
        filters.push(`setpts='${remap}'`);
    } else if (speed !== 1.0) {
        filters.push(`setpts=${(1 / speed).toFixed(4)}*PTS`);
    }

    // 12. FPS
    filters.push(`fps=fps=${fps}`);

    // 12b. Optical-flow frame interpolation for smooth slow-motion. Worth it when
    //      the footage is actually slowed (constant <1× or a curve that dips <1×).
    const isSlowed = speed < 0.98 || (clip.speedCurve ? curveHasSlowdown(clip.speedCurve) : false);
    if (clip.smoothSlowmo && isSlowed) {
        filters.push(buildMinterpolateChain(fps));
    }

    // 12c. FRAME LOCK — the canvas has a fixed, defined boundary. After every
    //      zoom / shake / motion effect, crop back to exactly outW x outH (centered)
    //      so nothing can breach the top, bottom, or side edges; the edges stay put.
    filters.push(`crop=${outW}:${outH}:(iw-${outW})/2:(ih-${outH})/2`);
    filters.push('setsar=1');

    // 13. Fork/merge effects (double exposure + glow bloom). Appended as a valid
    //     single-in/single-out sub-graph so the whole -vf remains one filtergraph.
    const forkMerge = buildForkMergeGraph({ glow: clip.glow });
    return filters.join(',') + forkMerge;
}

/**
 * Build the effect portion of the filter chain from a clip's effect data.
 * Checks hardcoded effects first, then CSS transpilation.
 * Returns empty string if no effects.
 */
function buildEffectFilters(clip: ClipExportData): string {
    const parts: string[] = [];

    // Process effect IDs
    if (clip.effectIds && clip.effectIds.length > 0) {
        for (const id of clip.effectIds) {
            const ffmpegFilter = resolveEffectFilter(id);
            if (ffmpegFilter) {
                parts.push(ffmpegFilter);
            }
        }
    }

    // Process raw CSS shader string (from renderer for fx_gen_* effects)
    if (clip.effectCss) {
        const ffmpegFilter = cssToFfmpeg(clip.effectCss);
        if (ffmpegFilter) {
            parts.push(ffmpegFilter);
        }
    }

    return parts.join(',');
}

// ══════════════════════════════════════════════════════════════════════════════
// AUDIO FILTER CHAIN
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Build the audio filter chain for a single clip.
 *
 * Filter order:
 *   atrim → asetpts → areverse? → atempo chain → volume
 *
 * @param clip - The clip export data
 * @param settings - Export settings
 * @returns FFmpeg audio filter chain string (without stream labels)
 */
export function buildAudioFilter(
    clip: ClipExportData,
    settings: ExportSettings
): string {
    const speed = clip.speed || 1.0;
    const fps = settings.fps;

    // Calculate source trim boundaries (same logic as video)
    const timelineDurSec = (clip.endFrame - clip.startFrame) / fps;
    const seekTo = clip.startFrame / fps;
    const srcTrimDur = timelineDurSec * speed;

    let seekClamped = Math.max(0, seekTo);
    let clipDur = srcTrimDur;
    if (clipDur < 0.01) clipDur = 0.04;

    const trimEnd = seekClamped + clipDur;
    const filters: string[] = [];

    // 1. Audio trim + reset PTS
    filters.push(`atrim=start=${seekClamped.toFixed(4)}:end=${trimEnd.toFixed(4)}`);
    filters.push('asetpts=PTS-STARTPTS');

    // 2. Reverse (for short clips ≤ 5 seconds)
    if (clip.reversed && !shouldUseIntermediateForReverse(clip, fps)) {
        filters.push('areverse');
    }

    // 3. Speed change via atempo chain
    if (speed !== 1.0) {
        const atempoChain = buildAtempoChain(speed);
        if (atempoChain) {
            filters.push(atempoChain);
        }
    }

    // 3b. Audio effects (before volume)
    if (clip.audioEffects) {
        const audioEffectsChain = buildAudioEffectsFilter(clip.audioEffects, clipDur / speed);
        if (audioEffectsChain) {
            filters.push(audioEffectsChain);
        }
    }

    // 4. Volume
    const volumeMult = ((clip.volume !== undefined ? clip.volume : 100) / 100) * (clip.isMuted ? 0 : 1);
    filters.push(`volume=${volumeMult.toFixed(4)}`);

    return filters.join(',');
}

// ══════════════════════════════════════════════════════════════════════════════
// REVERSE HELPER
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Determine if a reversed clip should use the intermediate rendering approach
 * (render forward first, then reverse the intermediate file) to avoid OOM.
 *
 * FFmpeg's `reverse` filter loads ALL frames into memory. For clips longer
 * than 5 seconds this can exhaust RAM, so we use a two-pass approach instead.
 *
 * @returns true if the clip is > 5 seconds and should use intermediate reversal
 */
export function shouldUseIntermediateForReverse(clip: ClipExportData, fps: number): boolean {
    const durationFrames = clip.endFrame - clip.startFrame;
    const durationSeconds = durationFrames / fps;
    return durationSeconds > 5;
}

// ══════════════════════════════════════════════════════════════════════════════
// QUALITY ARGS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Quality preset mapping:
 *
 * | Quality  | H264 CRF | H265 CRF | H264 Preset | H265 Preset |
 * |----------|----------|----------|-------------|-------------|
 * | draft    | 28       | 30       | veryfast    | fast        |
 * | standard | 20       | 24       | medium      | medium      |
 * | master   | 17       | 20       | slow        | slow        |
 */
const QUALITY_PRESETS = {
    draft: { h264Crf: '28', h265Crf: '30', h264Preset: 'veryfast', h265Preset: 'fast' },
    standard: { h264Crf: '20', h265Crf: '24', h264Preset: 'medium', h265Preset: 'medium' },
    master: { h264Crf: '17', h265Crf: '20', h264Preset: 'slow', h265Preset: 'slow' },
} as const;

/**
 * Build FFmpeg quality arguments (CRF, preset, bitrate, color, etc.).
 *
 * Always includes:
 *   -pix_fmt yuv420p -colorspace bt709 -color_trc bt709
 *   -color_primaries bt709 -movflags +faststart
 *
 * @param settings - Export settings with quality and codec
 * @param bitrateMode - If true, use target bitrate instead of CRF
 * @param targetBitrate - Target bitrate in kbps (only used when bitrateMode=true)
 * @returns Array of FFmpeg argument strings
 */
export function buildQualityArgs(
    settings: ExportSettings,
    bitrateMode: boolean = false,
    targetBitrate: number = 0
): string[] {
    const isHevc = settings.codec === 'hevc';
    const codecLib = isHevc ? 'libx265' : 'libx264';
    const quality = settings.quality || 'standard';
    const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS.standard;

    const args: string[] = [];

    // Codec
    args.push('-c:v', codecLib);

    if (bitrateMode && targetBitrate > 0) {
        // Bitrate mode: VBR with ceiling
        args.push(
            '-b:v', `${targetBitrate}k`,
            '-maxrate', `${Math.round(targetBitrate * 1.5)}k`,
            '-bufsize', `${Math.round(targetBitrate * 2)}k`
        );
        args.push('-preset', isHevc ? preset.h265Preset : preset.h264Preset);
    } else {
        // CRF mode (default — highest quality per file size)
        const crf = isHevc ? preset.h265Crf : preset.h264Crf;
        args.push('-crf', crf);
        args.push('-preset', isHevc ? preset.h265Preset : preset.h264Preset);
    }

    // Color space and pixel format (always included)
    args.push(
        '-pix_fmt', 'yuv420p',
        '-colorspace', 'bt709',
        '-color_trc', 'bt709',
        '-color_primaries', 'bt709',
        '-movflags', '+faststart'
    );

    return args;
}

// ══════════════════════════════════════════════════════════════════════════════
// TRANSITION FILTER (xfade between two clips)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Build an xfade transition filter between two video streams.
 *
 * FFmpeg xfade syntax:
 *   [v0][v1]xfade=transition=TYPE:duration=D:offset=T
 *
 * For custom transitions (flash, glitch, etc.), this builds equivalent
 * filter graphs using standard FFmpeg filters.
 *
 * @param transitionType - The transition type name
 * @param durationSec    - Duration of the transition in seconds
 * @param offsetSec      - Offset from the start of the output where transition begins
 * @param inputLabel0    - FFmpeg stream label for first clip (e.g. '[v0]')
 * @param inputLabel1    - FFmpeg stream label for second clip (e.g. '[v1]')
 * @param outputLabel    - FFmpeg stream label for output (e.g. '[vout]')
 * @returns FFmpeg filter string for the transition
 */
export function buildTransitionFilter(
    transitionType: string,
    durationSec: number,
    offsetSec: number,
    inputLabel0: string = '[v0]',
    inputLabel1: string = '[v1]',
    outputLabel: string = '[vout]',
): string {
    const dur = Math.max(0.04, durationSec).toFixed(4);
    const offset = Math.max(0, offsetSec).toFixed(4);

    // Built-in xfade transitions
    const BUILTIN_XFADE = new Set([
        'fade', 'fadewhite', 'fadeblack', 'dissolve',
        'wipeleft', 'wiperight', 'wipeup', 'wipedown',
        'slideleft', 'slideright', 'slideup', 'slidedown',
        'circlecrop', 'circleopen', 'circleclose',
        'pixelize', 'radial', 'hblur',
        'smoothleft', 'smoothright', 'smoothup', 'smoothdown',
        'diagtl', 'diagtr', 'diagbl', 'diagbr',
        'squeezeh', 'squeezev',
    ]);

    if (transitionType === 'cut' || !transitionType) {
        // No transition — direct concatenation
        return `${inputLabel0}${inputLabel1}concat=n=2:v=1:a=0${outputLabel}`;
    }

    if (BUILTIN_XFADE.has(transitionType)) {
        return `${inputLabel0}${inputLabel1}xfade=transition=${transitionType}:duration=${dur}:offset=${offset}${outputLabel}`;
    }

    // Custom transitions that need bespoke filter chains
    switch (transitionType) {
        case 'flash':
            // Flash: fade to white then fade in
            return [
                `${inputLabel0}fade=t=out:st=${offset}:d=${dur}:color=white[flash0]`,
                `${inputLabel1}fade=t=in:st=0:d=${dur}:color=white[flash1]`,
                `[flash0][flash1]concat=n=2:v=1:a=0${outputLabel}`,
            ].join(';');

        case 'glitch':
            // Glitch: chromatic aberration + noise during transition
            return [
                `${inputLabel0}split[g0a][g0b]`,
                `[g0a]trim=end=${offset},setpts=PTS-STARTPTS[g0pre]`,
                `[g0b]trim=start=${offset},setpts=PTS-STARTPTS,rgbashift=rh=8:bh=-8,noise=c0s=30:c0f=t[g0post]`,
                `${inputLabel1}trim=start=0:end=${dur},setpts=PTS-STARTPTS,rgbashift=rh=-8:bh=8,noise=c0s=30:c0f=t[g1trans]`,
                `${inputLabel1}trim=start=${dur},setpts=PTS-STARTPTS[g1post]`,
                `[g0pre][g0post]concat=n=2:v=1:a=0[gleft]`,
                `[g1trans][g1post]concat=n=2:v=1:a=0[gright]`,
                `[gleft][gright]xfade=transition=fade:duration=${dur}:offset=${offset}${outputLabel}`,
            ].join(';');

        case 'rgb-split':
            // RGB Split: offset color channels during fade
            return `${inputLabel0}${inputLabel1}xfade=transition=fade:duration=${dur}:offset=${offset}${outputLabel}`;

        case 'zoom-through':
            // Zoom through: first clip zooms in, second zooms out
            return [
                `${inputLabel0}scale=iw*2:ih*2,crop=iw/2:ih/2[zt0]`,
                `[zt0]${inputLabel1}xfade=transition=fade:duration=${dur}:offset=${offset}${outputLabel}`,
            ].join(';');

        case 'spin':
            // Spin: rotate during fade
            return `${inputLabel0}${inputLabel1}xfade=transition=radial:duration=${dur}:offset=${offset}${outputLabel}`;

        case 'film-burn':
            // Film burn: warm fade
            return `${inputLabel0}${inputLabel1}xfade=transition=fadewhite:duration=${dur}:offset=${offset}${outputLabel}`;

        case 'whip':
            // Whip pan: fast horizontal slide
            return `${inputLabel0}${inputLabel1}xfade=transition=slideleft:duration=${(parseFloat(dur) * 0.3).toFixed(4)}:offset=${offset}${outputLabel}`;

        default:
            // Fallback to dissolve
            return `${inputLabel0}${inputLabel1}xfade=transition=dissolve:duration=${dur}:offset=${offset}${outputLabel}`;
    }
}

/**
 * Build a chained xfade filter graph for multiple clips with transitions.
 *
 * Given N clips with transitions between them, produces a filter_complex string
 * that chains xfade operations:
 *   [v0][v1]xfade=...[xf0]; [xf0][v2]xfade=...[xf1]; ...
 *
 * @param clipCount       - Number of video clips
 * @param transitions     - Array of {type, durationSec} for each transition (length = clipCount-1)
 * @param clipDurations   - Duration of each clip in seconds (for computing offsets)
 * @returns FFmpeg filter_complex string
 */
export function buildTransitionChain(
    clipCount: number,
    transitions: Array<{ type: string; durationSec: number }>,
    clipDurations: number[],
): string {
    if (clipCount <= 1 || transitions.length === 0) return '';

    const parts: string[] = [];
    let accumulatedOffset = 0;

    for (let i = 0; i < Math.min(transitions.length, clipCount - 1); i++) {
        const t = transitions[i];
        const inputA = i === 0 ? `[v${i}]` : `[xf${i - 1}]`;
        const inputB = `[v${i + 1}]`;
        const output = i === transitions.length - 1 ? '[vout]' : `[xf${i}]`;

        // Offset = accumulated clip durations minus accumulated transition durations
        accumulatedOffset += clipDurations[i] - (i > 0 ? transitions[i - 1].durationSec : 0);

        const filter = buildTransitionFilter(
            t.type,
            t.durationSec,
            accumulatedOffset,
            inputA,
            inputB,
            output,
        );
        parts.push(filter);
    }

    return parts.join(';');
}
