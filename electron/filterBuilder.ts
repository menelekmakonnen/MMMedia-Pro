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
import { buildDeflickerVf } from '../src/lib/deflickerFilter';

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

    // ── Source-level framing (static crop/reposition from import) ──────
    /** Source zoom percentage (100 = no crop, 150 = 1.5x crop) */
    sourceZoom?: number;
    /** Source horizontal pan offset (-100 to 100) */
    sourcePanX?: number;
    /** Source vertical pan offset (-100 to 100) */
    sourcePanY?: number;

    // ── New parametric & grading fields ──────────────────────────────────
    /** Parametric effects (new adjustable-param system) */
    parametricEffects?: Array<{ effectId: string; params: Record<string, number | string | boolean> }>;
    /** Color grading settings */
    colorGrading?: ColorGrading;
    /** Premiere Effect Controls (Motion/Opacity + masks). Only the fields the
     *  renderer bakes are typed. Rotation/opacity (static + keyframed) and ellipse
     *  masks are rendered here so exports match the Effect Controls preview.
     *  Position/scale continue to flow through the zoom/composite path. */
    effectControls?: {
        video?: Array<{
            matchName: string;
            enabled?: boolean;
            params: Array<{
                id: string;
                keyframed?: boolean;
                value?: number | string | boolean | { x: number; y: number };
                keyframes?: Array<{ frame: number; value: number; interp?: 'linear' | 'bezier' | 'constant'; handleR?: [number, number]; handleL?: [number, number] }>;
                keyframesX?: Array<{ frame: number; value: number; interp?: 'linear' | 'bezier' | 'constant' }>;
                keyframesY?: Array<{ frame: number; value: number; interp?: 'linear' | 'bezier' | 'constant' }>;
            }>;
            masks?: Array<{
                enabled?: boolean; mode?: string; x: number; y: number;
                width: number; height: number; feather: number; expansion: number;
                opacity: number; inverted?: boolean;
            }>;
        }>;
        audio?: Array<{
            matchName: string;
            enabled?: boolean;
            params: Array<{ id: string; value?: number | string | boolean | { x: number; y: number } }>;
        }>;
    };
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
    /** Deflicker: temporal averaging via multi-layer blend */
    deflicker?: { enabled: boolean; includeAudio: boolean; layers: 3 | 5 };
    /** Keyframed brightness (-1..1) baked to an eq expression. */
    brightnessKeyframes?: Array<{ frame: number; value: number; interp?: 'linear' | 'bezier' | 'constant'; handleR?: [number, number]; handleL?: [number, number] }>;
    /** Keyframed contrast (0..3) baked to an eq expression. */
    contrastKeyframes?: Array<{ frame: number; value: number; interp?: 'linear' | 'bezier' | 'constant'; handleR?: [number, number]; handleL?: [number, number] }>;
    /** Keyframed saturation (0..3) baked to an eq expression. */
    saturationKeyframes?: Array<{ frame: number; value: number; interp?: 'linear' | 'bezier' | 'constant'; handleR?: [number, number]; handleL?: [number, number] }>;
    /** Keyframed volume (0..100) baked to a volume expression. */
    volumeKeyframes?: Array<{ frame: number; value: number; interp?: 'linear' | 'bezier' | 'constant'; handleR?: [number, number]; handleL?: [number, number] }>;

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

    // ── Multi-track composite fields ─────────────────────────────────────
    /** Track index (0 = primary/base, 1+ = overlay). */
    track?: number;
    /** When true, this clip is composited ON TOP of the base track (not sequential). */
    compositeOverlay?: boolean;
    /** Scale percentage for overlay (30 = 30% of canvas). */
    compositeScale?: number;
    /** Horizontal position percentage (0=left, 50=center, 100=right). */
    compositeX?: number;
    /** Vertical position percentage (0=top, 50=center, 100=bottom). */
    compositeY?: number;
    /** Border radius in pixels for overlay (rounded corners). */
    compositeBorderRadius?: number;
    /** Opacity percentage for overlay (0-100). */
    compositeOpacity?: number;
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
            srcDurSec = Math.max(0.2, probeData.duration - seekSec - 0.01);
        }
    }
    // Hard floor: 0.2s (6 frames at 30fps) is the minimum for FFmpeg to
    // produce a valid intermediate with at least one keyframe.
    if (srcDurSec < 0.2) srcDurSec = 0.2;

    // OUTPUT duration is ALWAYS the clip's timeline slot — the slot is the source
    // of truth for how long the clip occupies the edit. We DECODE srcDurSec of real
    // footage (clamped above to what the source actually has), and the pad-to-slot
    // filter clones the last frame to fill any shortfall. This keeps reordered or
    // short-source clips filling their full slot instead of collapsing below it,
    // so the rendered total matches the defined duration. In the common case where
    // the source covers the slot, timelineDurSec == srcDurSec/speed, so this is a
    // no-op vs. the old formula.
    // Hard floor: prevent invisible 1-frame clips from reaching the stitch phase.
    const outDurSec = Math.max(0.2, timelineDurSec);
    return {
        seekSec,
        srcDurSec,
        outDurSec,
        outFrames: Math.max(6, Math.round(outDurSec * settings.fps)),
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

    // ── AUTO MICRO-CROSSFADE (30ms) ─────────────────────────────────────
    // When no explicit audio fades are set, inject 30ms fade-in / fade-out
    // to eliminate audible pops at cut boundaries. Imperceptible to the
    // listener but prevents the hard DC-offset clicks FFmpeg can produce
    // when audio samples are sliced mid-waveform.
    {
        const hasFadeIn  = clip.audioEffects?.fadeInDuration  && clip.audioEffects.fadeInDuration  > 0;
        const hasFadeOut = clip.audioEffects?.fadeOutDuration && clip.audioEffects.fadeOutDuration > 0;
        if (!hasFadeIn) {
            filters.push('afade=t=in:st=0:d=0.03');
        }
        if (!hasFadeOut) {
            const fadeOutStart = Math.max(0, timing.outDurSec - 0.03);
            filters.push(`afade=t=out:st=${fadeOutStart.toFixed(4)}:d=0.03`);
        }
    }

    if (clip.volumeKeyframes && clip.volumeKeyframes.length > 0) {
        const normalizedKf = clip.volumeKeyframes.map(kf => ({
            ...kf,
            value: (kf.value / 100) * (clip.isMuted ? 0 : 1)
        }));
        const expr = buildKeyframeExpr(normalizedKf, settings.fps || 30);
        filters.push(`volume='${expr}'`);
    } else {
        const vol = ((clip.volume ?? 100) / 100) * (clip.isMuted ? 0 : 1);
        filters.push(`volume=${vol.toFixed(4)}`);
    }
    // Premiere Effect Controls ▸ Audio: Volume (Mute + Level dB) and Channel
    // Volume (L/R dB). Defaults (0 dB, unmuted) are no-ops, so this only changes
    // the render when the user adjusts them. Shared with Ender via the render-core.
    {
        const audio = clip.effectControls?.audio;
        if (audio) {
            const num = (comp: { params: Array<{ id: string; value?: unknown }> } | undefined, id: string): number =>
                typeof comp?.params.find((p) => p.id === id)?.value === 'number'
                    ? (comp!.params.find((p) => p.id === id)!.value as number) : 0;
            const vol = audio.find((c) => c.matchName === 'AE.ADBE Volume');
            if (vol && vol.enabled !== false) {
                const muted = vol.params.find((p) => p.id === 'mute')?.value === true;
                const db = num(vol, 'level');
                if (muted) filters.push('volume=0');
                else if (Math.abs(db) > 0.01) filters.push(`volume=${Math.pow(10, db / 20).toFixed(4)}`);
            }
            const ch = audio.find((c) => c.matchName === 'AE.ADBE Channel Volume');
            if (ch && ch.enabled !== false) {
                const dbL = num(ch, 'left'), dbR = num(ch, 'right');
                if (Math.abs(dbL) > 0.01 || Math.abs(dbR) > 0.01) {
                    filters.push(`pan=stereo|c0=${Math.pow(10, dbL / 20).toFixed(4)}*c0|c1=${Math.pow(10, dbR / 20).toFixed(4)}*c1`);
                }
            }
        }
    }

    // Normalize to a uniform layout so concat/xfade across intermediates is clean.
    filters.push('aresample=async=1');
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
    let zoomStart = clip.zoomStart ?? 100;
    let zoomEnd = clip.zoomEnd ?? (clip.zoomLevel ?? 100);

    // Premiere Effect Controls ▸ Motion: Scale keyframes drive the animated zoom
    // (start→end, eased by zoomCurve) and Position drives a pan, so EXPORTS match
    // the panel. Scale clamps to ≥100% (zoompan zooms in; shrink/PiP uses the
    // composite path). Pan only has room when zoomed in. Shared with MMMedia
    // Ender via the vendored render-core.
    //
    // Sign convention (derived to match motionToCssStyle's preview): the preview
    // translates a clip with position.x > centre to the RIGHT. In a zoomed crop,
    // showing the clip shifted right means the crop window moves LEFT (x ↓):
    //   x = centreX − (posX − cx)·(iw/zoom)/outW   (and likewise for y).
    let panFirstX = 0, panLastX = 0, panFirstY = 0, panLastY = 0, hasPan = false;
    {
        const motion = clip.effectControls?.video?.find((c) => c.matchName === 'AE.ADBE Motion');
        const scaleP = motion?.params.find((p) => p.id === 'scale');
        if (scaleP && scaleP.keyframed && scaleP.keyframes && scaleP.keyframes.length > 1) {
            zoomStart = scaleP.keyframes[0].value;
            zoomEnd = scaleP.keyframes[scaleP.keyframes.length - 1].value;
        }
        const posP = motion?.params.find((p) => p.id === 'position');
        const cx = outputWidth / 2, cy = outputHeight / 2;
        if (posP && posP.keyframed && (posP.keyframesX?.length || posP.keyframesY?.length)) {
            const lx = posP.keyframesX ?? [], ly = posP.keyframesY ?? [];
            hasPan = true;
            panFirstX = (lx[0]?.value ?? cx) - cx;
            panLastX = (lx[lx.length - 1]?.value ?? cx) - cx;
            panFirstY = (ly[0]?.value ?? cy) - cy;
            panLastY = (ly[ly.length - 1]?.value ?? cy) - cy;
        } else if (posP && posP.value && typeof posP.value === 'object') {
            const v = posP.value as { x: number; y: number };
            if (Math.abs(v.x - cx) > 0.5 || Math.abs(v.y - cy) > 0.5) {
                hasPan = true;
                panFirstX = panLastX = v.x - cx;
                panFirstY = panLastY = v.y - cy;
            }
        }
    }

    // No zoom needed if both start and end are 100% (or very close). A pan needs
    // a zoom to have room, so without zoom there is nothing to render here.
    if (Math.abs(zoomStart - 100) < 0.5 && Math.abs(zoomEnd - 100) < 0.5) {
        return '';
    }

    // Zoom IN only — clamp to >=100% so zoom can never reveal beyond the frame edges.
    const zs = (Math.max(100, zoomStart) / 100).toFixed(4);
    const ze = (Math.max(100, zoomEnd) / 100).toFixed(4);
    const d = Math.max(1, Math.round(clipDurationFrames));
    const origin = clip.zoomOrigin || 'center';

    // Build x/y expressions based on zoom origin.
    // BOUNDARY CLAMPING: All expressions are wrapped with min(max(expr,0),iw-iw/zoom)
    // and min(max(expr,0),ih-ih/zoom) respectively, so the cropped viewport can never
    // extend beyond the source frame edges — even with extreme zoom or pan values.
    let xExpr: string;
    let yExpr: string;

    switch (origin) {
        case 'top':
            xExpr = "'min(max(iw/2-(iw/zoom/2),0),iw-iw/zoom)'";
            yExpr = "'0'";
            break;
        case 'bottom':
            xExpr = "'min(max(iw/2-(iw/zoom/2),0),iw-iw/zoom)'";
            yExpr = "'min(max(ih-ih/zoom,0),ih-ih/zoom)'";
            break;
        case 'left':
            xExpr = "'0'";
            yExpr = "'min(max(ih/2-(ih/zoom/2),0),ih-ih/zoom)'";
            break;
        case 'right':
            xExpr = "'min(max(iw-iw/zoom,0),iw-iw/zoom)'";
            yExpr = "'min(max(ih/2-(ih/zoom/2),0),ih-ih/zoom)'";
            break;
        case 'center':
        default:
            xExpr = "'min(max(iw/2-(iw/zoom/2),0),iw-iw/zoom)'";
            yExpr = "'min(max(ih/2-(ih/zoom/2),0),ih-ih/zoom)'";
            break;
    }

    // Effect Controls ▸ Motion ▸ Position pan (overrides origin centring). Animates
    // first→last over the clip's frame span (`on`), clamped to the crop bounds.
    if (hasPan) {
        const Dp = Math.max(1, Math.round(clipDurationFrames));
        const panXE = Math.abs(panLastX - panFirstX) < 0.5
            ? panFirstX.toFixed(1)
            : `(${panFirstX.toFixed(1)}+(${(panLastX - panFirstX).toFixed(1)})*min(1,on/${Dp}))`;
        const panYE = Math.abs(panLastY - panFirstY) < 0.5
            ? panFirstY.toFixed(1)
            : `(${panFirstY.toFixed(1)}+(${(panLastY - panFirstY).toFixed(1)})*min(1,on/${Dp}))`;
        xExpr = `'min(max(iw/2-(iw/zoom/2)-(${panXE})*(iw/zoom)/${outputWidth},0),iw-iw/zoom)'`;
        yExpr = `'min(max(ih/2-(ih/zoom/2)-(${panYE})*(ih/zoom)/${outputHeight},0),ih-ih/zoom)'`;
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

    // `:fps=` is REQUIRED. Without it zoompan defaults to 25fps; on high-fps
    // sources (e.g. 60fps phone footage) with d=1 that desyncs into BLACK frames.
    return `zoompan=z=${zExpr}:x=${xExpr}:y=${yExpr}:d=1:s=${outputWidth}x${outputHeight}:fps=${fps}`;
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
/**
 * Bake the Premiere Effect Controls model into FFmpeg filters so EXPORTS match
 * the Effect Controls preview. Handles Motion ▸ Rotation (static + keyframed),
 * Opacity (static + keyframed), and ellipse masks (with feather / expansion /
 * inversion). Position & Scale continue to flow through the existing zoom /
 * composite path, so this only adds what that path doesn't cover.
 *
 * Shared by the internal export AND — through the vendored render-core — by
 * MMMedia Ender, so both engines render identically.
 *
 * Guards:
 *  • Rotation subtracts any legacy 90°-bucket `clip.rotation` already applied
 *    upstream, so a clean 90/180/270 isn't rotated twice.
 *  • Opacity/masks are skipped for overlay clips (the track compositor applies
 *    their opacity), avoiding double-dim.
 */
function buildEffectControlsFilters(clip: ClipExportData, fps: number, outW = 1920, outH = 1080): string[] {
    const ec = clip.effectControls;
    if (!ec || !ec.video) return [];
    const out: string[] = [];

    const motion = ec.video.find((c) => c.matchName === 'AE.ADBE Motion');
    const opacityC = ec.video.find((c) => c.matchName === 'AE.ADBE Opacity');

    // ── Motion ▸ Crop (Left/Top/Right/Bottom %) → crop the sub-rect, then pad it
    //    back to full frame at the same offset (Premiere shrinks the image and
    //    leaves the cropped area empty). ──
    if (motion && motion.enabled !== false) {
        const cv = (id: string) => {
            const p = motion.params.find((x) => x.id === id);
            return typeof p?.value === 'number' ? p.value : 0;
        };
        const L = cv('cropLeft'), T = cv('cropTop'), R = cv('cropRight'), B = cv('cropBottom');
        if ((L > 0.01 || T > 0.01 || R > 0.01 || B > 0.01) && (L + R) < 99.5 && (T + B) < 99.5) {
            const cw = Math.max(2, Math.round(outW * (100 - (L + R)) / 100));
            const ch = Math.max(2, Math.round(outH * (100 - (T + B)) / 100));
            const cx = Math.round(outW * L / 100);
            const cy = Math.round(outH * T / 100);
            out.push(`crop=${cw}:${ch}:${cx}:${cy}`);
            out.push(`pad=${outW}:${outH}:${cx}:${cy}:black`);
        }
    }

    // ── Motion ▸ Rotation (minus any legacy quantised rotation already applied) ──
    if (motion && motion.enabled !== false) {
        const rot = motion.params.find((p) => p.id === 'rotation');
        const legacyDeg = typeof clip.rotation === 'number' ? clip.rotation : 0;
        if (rot && rot.keyframed && rot.keyframes && rot.keyframes.length > 1) {
            const deg = buildKeyframeExpr(rot.keyframes as any, fps);
            out.push(`rotate='((${deg})-${legacyDeg})*PI/180':ow=iw:oh=ih`);
        } else if (rot && typeof rot.value === 'number') {
            const residual = rot.value - legacyDeg;
            if (Math.abs(residual) > 0.01) {
                out.push(`rotate=${((residual * Math.PI) / 180).toFixed(6)}:ow=iw:oh=ih`);
            }
        }
    }

    // ── Opacity (Opacity) + first ellipse mask → alpha ──
    // Skipped for overlay clips: the track compositor owns their opacity.
    const isOverlay = Boolean((clip as unknown as { compositeOverlay?: boolean }).compositeOverlay);
    if (!isOverlay && opacityC && opacityC.enabled !== false) {
        let opacityStatic = 1;
        let opacityExpr: string | null = null;
        const op = opacityC.params.find((p) => p.id === 'opacity');
        if (op && op.keyframed && op.keyframes && op.keyframes.length > 1) {
            // geq evaluates with plain commas (see the white-flash geq elsewhere),
            // so un-escape the filtergraph commas buildKeyframeExpr emits.
            opacityExpr = `(${buildKeyframeExpr(op.keyframes as any, fps).replace(/\\,/g, ',')})/100`;
        } else if (op && typeof op.value === 'number') {
            opacityStatic = Math.max(0, Math.min(1, op.value / 100));
        }

        const mask = opacityC.masks?.find((m) => m.enabled !== false && (m.mode === 'ellipse' || !m.mode));

        if (opacityExpr !== null || mask || opacityStatic < 0.999) {
            const opPart = opacityExpr ?? opacityStatic.toFixed(4);
            let maskPart = '1';
            if (mask) {
                const rx = Math.max(1, mask.width / 2 + (mask.expansion || 0));
                const ry = Math.max(1, mask.height / 2 + (mask.expansion || 0));
                const avgR = (rx + ry) / 2;
                const d = `sqrt(pow((X-${mask.x.toFixed(1)})/${rx.toFixed(2)},2)+pow((Y-${mask.y.toFixed(1)})/${ry.toFixed(2)},2))`;
                const ff = (mask.feather || 0) / avgR;
                let base = ff > 0.0001 ? `clip((1-(${d}))/${ff.toFixed(4)},0,1)` : `lte(${d},1)`;
                if (mask.inverted) base = `(1-(${base}))`;
                const mOp = Math.max(0, Math.min(1, (mask.opacity ?? 100) / 100));
                maskPart = mOp < 0.999 ? `(${base})*${mOp.toFixed(4)}` : `(${base})`;
            }
            // Base clips have nothing beneath them in the per-clip segment render, so
            // opacity/mask must fade toward BLACK by multiplying RGB. Writing an alpha
            // channel (the old approach) was silently dropped when the segment flattens
            // to yuv420p, leaving the clip fully opaque. Overlay/PiP clips never reach
            // here (the isOverlay guard above hands them to the track compositor, which
            // owns their real over-the-clip-below opacity).
            const factor = `(${opPart})*(${maskPart})`;
            out.push(`format=rgba,geq=r='r(X,Y)*(${factor})':g='g(X,Y)*(${factor})':b='b(X,Y)*(${factor})':a='255'`);
        }
    }

    return out;
}

export function buildVideoFilter(
    clip: ClipExportData,
    settings: ExportSettings,
    probeData: ProbeData,
    opts: { preSeeked?: boolean; padToSlot?: boolean } = {}
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

    // 3b. Source-level framing (static crop/reposition from import page)
    //     Applied BEFORE zoompan/scale so it acts as a global reframe of the source.
    const srcZoom = clip.sourceZoom ?? 100;
    const srcPanX = clip.sourcePanX ?? 0;
    const srcPanY = clip.sourcePanY ?? 0;
    if (srcZoom > 100 || srcPanX !== 0 || srcPanY !== 0) {
        const z = Math.max(100, srcZoom) / 100;
        // Crop dimensions: inverse of zoom (zoom 200% → crop to 50% of frame)
        const cropW = `iw/${z.toFixed(4)}`;
        const cropH = `ih/${z.toFixed(4)}`;
        // Pan: map -100..+100 to the available offset range.
        // At center (pan=0): offset = (iw - cropW) / 2
        // At pan=+100: offset = iw - cropW (right/bottom edge)
        // At pan=-100: offset = 0 (left/top edge)
        const xOff = `(iw-iw/${z.toFixed(4)})/2*(1+${(srcPanX / 100).toFixed(4)})`;
        const yOff = `(ih-ih/${z.toFixed(4)})/2*(1+${(srcPanY / 100).toFixed(4)})`;
        filters.push(`crop=${cropW}:${cropH}:${xOff}:${yOff}`);
    }

    // 4. Zoompan (must come before scale/pad — it changes frame size)
    const outputDurSec = clipDur / speed;
    const clipDurationFrames = outputDurSec * fps;
    const zoompan = buildZoompanFilter(clip, clipDurationFrames, outW, outH, fps);
    if (zoompan) {
        filters.push(zoompan);
    }

    // 5. Scale + crop to output resolution (cover/fill mode — no black bars)
    //    scale with force_original_aspect_ratio=increase → video fills frame completely
    //    crop trims any overflow to exact output dimensions
    filters.push(`scale=${outW}:${outH}:force_original_aspect_ratio=increase`);
    filters.push(`crop=${outW}:${outH}`);
    filters.push('setsar=1');

    // 5c. Colorspace metadata — tag the output stream as BT.709 so players
    //     interpret it correctly. Using setparams (metadata-only) instead of
    //     the colorspace filter, which crashes on phone footage that lacks
    //     colorspace tags (produces zero frames → "no packets" failures).
    //     The primary color fidelity fix is the toned-down presets and
    //     auto-grade in colorEngine/smartEngine, not pixel conversion.
    filters.push('setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709');

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

    // 9b. Premiere Effect Controls — Motion rotation/crop, Opacity, ellipse masks
    //     (static + keyframed). Renders so exports match the Effect Controls panel.
    for (const f of buildEffectControlsFilters(clip, fps, outW, outH)) {
        filters.push(f);
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
        // BOUNDARY CLAMPING: All shake crop x/y offsets are wrapped with
        // min(max(expr,0),iw-outW) / min(max(expr,0),ih-outH) to guarantee
        // the crop window never exceeds the scaled-up source frame.
        if (sh.type === 'impact') {
            // Impact: multi-frequency sine blend with exponential decay — feels like a camera hit
            const decay = sh.decayRate || 5;
            filters.push(`crop=${outW}:${outH}:` +
                `'min(max((iw-${outW})/2+${maxOffset}*(sin(t*23.7)*0.6+sin(t*37.1)*0.4)*exp(-${decay}*t),0),iw-${outW})':` +
                `'min(max((ih-${outH})/2+${maxOffset}*(sin(t*19.3)*0.5+sin(t*31.7)*0.5)*exp(-${decay}*t),0),ih-${outH})'`);
        } else if (sh.type === 'vibration') {
            // Vibration: high-frequency coherent sine (not random jitter)
            const a = Math.round(maxOffset * 0.15);
            filters.push(`crop=${outW}:${outH}:` +
                `'min(max((iw-${outW})/2+${a}*sin(t*67.3)*sin(t*43.1),0),iw-${outW})':` +
                `'min(max((ih-${outH})/2+${a}*sin(t*53.7)*sin(t*71.9),0),ih-${outH})'`);
        } else if (sh.type === 'earthquake') {
            // Earthquake: low-freq Y-dominant sinusoidal
            filters.push(`crop=${outW}:${outH}:` +
                `'min(max((iw-${outW})/2+${Math.round(maxOffset * 0.3)}*sin(t*2*PI),0),iw-${outW})':` +
                `'min(max((ih-${outH})/2+${maxOffset}*sin(t*1.5*PI),0),ih-${outH})'`);
        } else if (sh.type === 'handheld') {
            // Handheld: smooth organic drift via product-of-sines (Lissajous-like)
            filters.push(`crop=${outW}:${outH}:` +
                `'min(max((iw-${outW})/2+${Math.round(maxOffset * 0.4)}*sin(t*3.7)*sin(t*2.3),0),iw-${outW})':` +
                `'min(max((ih-${outH})/2+${Math.round(maxOffset * 0.4)}*sin(t*2.1)*sin(t*4.1),0),ih-${outH})'`);
        } else if (sh.type === 'whip') {
            // Single directional sweep with eased motion
            const dir = sh.direction === 'vertical' ? 'y' : 'x';
            if (dir === 'x') {
                filters.push(`crop=${outW}:${outH}:` +
                    `'min(max((iw-${outW})/2+${maxOffset}*(-1+2*min(1,t*5)),0),iw-${outW})':` +
                    `'min(max((ih-${outH})/2,0),ih-${outH})'`);
            } else {
                filters.push(`crop=${outW}:${outH}:` +
                    `'min(max((iw-${outW})/2,0),iw-${outW})':` +
                    `'min(max((ih-${outH})/2+${maxOffset}*(-1+2*min(1,t*5)),0),ih-${outH})'`);
            }
        } else {
            // Default fallback: coherent multi-sine (no random())
            filters.push(`crop=${outW}:${outH}:` +
                `'min(max((iw-${outW})/2+${maxOffset}*sin(t*11.3)*sin(t*7.1),0),iw-${outW})':` +
                `'min(max((ih-${outH})/2+${maxOffset}*sin(t*13.7)*sin(t*5.3),0),ih-${outH})'`);
        }
    }

    // 10g. Strobe/flicker effect
    if (clip.strobe && clip.strobe.frequency > 0) {
        // Toggle brightness between normal and near-white at given frequency
        const freq = clip.strobe.frequency;
        filters.push(`eq=brightness='0.3*gt(sin(t*${freq}*2*PI),0)':eval=frame`);
    }

    // Beat-reactive effects below index into clip.beatTimestamps. A stray
    // undefined/NaN entry (a beat-sync edit can produce one) used to throw
    // `undefined.toFixed` and abort the whole export — sanitize to finite numbers.
    const beatTs: number[] = Array.isArray(clip.beatTimestamps)
        ? clip.beatTimestamps.filter((bt: any) => typeof bt === 'number' && Number.isFinite(bt))
        : [];

    // 10h. Beat-reactive flash (brightness spike at beat timestamps)
    if (clip.beatEffect?.flash && beatTs.length > 0) {
        const flash = clip.beatEffect.flash;
        const flashDurSec = (Number.isFinite(flash.durationFrames) ? flash.durationFrames : 0) / fps;
        const intensity = Number.isFinite(flash.intensity) ? flash.intensity : 0;
        if (flashDurSec > 0 && intensity !== 0) {
            const enableExpr = beatTs
                .map(bt => `between(t,${bt.toFixed(4)},${(bt + flashDurSec).toFixed(4)})`)
                .join('+');
            // Cap brightness add at ±0.4 so a flash is punchy, never pure white.
            const bI = Math.max(-0.4, Math.min(0.4, intensity));
            filters.push(`eq=brightness='${bI.toFixed(2)}*gt(${enableExpr},0)':eval=frame`);
        }
    }

    // 10h-b. Beat-reactive chromatic aberration (rgbashift at beat timestamps)
    if (clip.beatEffect?.chromatic && beatTs.length > 0) {
        const chroma = clip.beatEffect.chromatic;
        const chromaDurSec = (Number.isFinite(chroma.durationFrames) ? chroma.durationFrames : 0) / fps;
        const offset = Number.isFinite(chroma.offset) ? chroma.offset : 0;
        if (chromaDurSec > 0 && offset !== 0) {
            const chromaEnableExpr = beatTs
                .map(bt => `between(t,${bt.toFixed(4)},${(bt + chromaDurSec).toFixed(4)})`)
                .join('+');
            // rgbashift's rh/bh are static integers (no per-frame expression
            // support) — time-gate the beat windows with `enable=` instead.
            filters.push(`rgbashift=rh=${Math.round(offset)}:bh=${Math.round(-offset)}:enable='${chromaEnableExpr}'`);
        }
    }

    // 10i. Beat-reactive shake boost: merged into clip.shake during generation (trailerGenerator.ts)

    // 10j. Beat-reactive zoom punch (scale + crop at beat timestamps)
    if (clip.beatEffect?.zoom && beatTs.length > 0) {
        const zoomPunch = clip.beatEffect.zoom;
        const punchDurSec = (Number.isFinite(zoomPunch.durationFrames) ? zoomPunch.durationFrames : 0) / fps;
        const punch = (Number.isFinite(zoomPunch.punchScale) ? zoomPunch.punchScale : 1) - 1; // e.g. 1.05 → 0.05
        if (punchDurSec > 0 && punch !== 0) {
            const zoomEnableExpr = beatTs
                .map(bt => `between(t,${bt.toFixed(4)},${(bt + punchDurSec).toFixed(4)})`)
                .join('+');
            // scale's w/h expressions reference `t`, so they MUST be evaluated
            // per-frame — without eval=frame ffmpeg rejects them at init with
            // "Expressions with frame variables 'n','t','pos' are not valid in
            // init eval_mode" and the whole clip's effect chain fails.
            filters.push(`scale=w='iw*(1+${punch.toFixed(4)}*gt(${zoomEnableExpr},0))':h='ih*(1+${punch.toFixed(4)}*gt(${zoomEnableExpr},0))':eval=frame`);
            filters.push(`crop=${outW}:${outH}:'(iw-${outW})/2':'(ih-${outH})/2'`);
        }
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

    // 12b-DF. Deflicker — temporal-average blend of consecutive frames at the
    //      output cadence (matches Premiere's "stack 3 copies at 100/66/33%
    //      opacity, offset by 1 frame each" technique, expressed as a single
    //      weighted `tmix`). Runs after fps/interpolation so it blends the final
    //      displayed frames, exactly like the Premiere nested sequence would.
    if (clip.deflicker?.enabled) {
        filters.push(buildDeflickerVf(clip.deflicker.layers || 3));
    }

    // 12c. FRAME LOCK — the canvas has a fixed, defined boundary. After every
    //      zoom / shake / motion effect, crop back to exactly outW x outH (centered)
    //      so nothing can breach the top, bottom, or side edges; the edges stay put.
    filters.push(`crop=${outW}:${outH}:(iw-${outW})/2:(ih-${outH})/2`);
    filters.push('setsar=1');

    // 12d. PAD-TO-SLOT (export only). When a clip's source runs short, its video
    //      stream ends a few frames before its timeline slot while the audio fills
    //      the slot. That video<audio mismatch drifts the stitch (xfade offsets and
    //      plain concat) and freezes the picture while the music plays on. Cloning
    //      the last frame fills the slot; the caller's `-t` cap trims the surplus so
    //      the rendered video length matches the audio exactly. Opt-in so single-clip
    //      preview proxies (which have no `-t` cap) never grow a frozen tail.
    if (opts.padToSlot) {
        filters.push(`tpad=stop_mode=clone:stop_duration=${(timing.outDurSec + 0.5).toFixed(3)}`);
    }

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

    // ── AUTO MICRO-CROSSFADE (30ms) ─────────────────────────────────────
    // Mirror of the same guard in buildClipAudioFilter: inject 30ms fade
    // edges to prevent audible pops when no explicit fades are configured.
    {
        const outDurSec = clipDur / speed;
        const hasFadeIn  = clip.audioEffects?.fadeInDuration  && clip.audioEffects.fadeInDuration  > 0;
        const hasFadeOut = clip.audioEffects?.fadeOutDuration && clip.audioEffects.fadeOutDuration > 0;
        if (!hasFadeIn) {
            filters.push('afade=t=in:st=0:d=0.03');
        }
        if (!hasFadeOut) {
            const fadeOutStart = Math.max(0, outDurSec - 0.03);
            filters.push(`afade=t=out:st=${fadeOutStart.toFixed(4)}:d=0.03`);
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
    maskConfig?: {
        mode: 'chromakey' | 'ml-segment';
        chromakey?: { color: string; similarity: number; blend: number };
        mattePath?: string;
        invertMask?: boolean;
    },
): string {
    const dur = Math.max(0.04, durationSec).toFixed(4);
    const offset = Math.max(0, offsetSec).toFixed(4);

    // Built-in xfade transitions
    const BUILTIN_XFADE = new Set([
        'fade', 'fadewhite', 'fadeblack', 'dissolve',
        'wipeleft', 'wiperight', 'wipeup', 'wipedown',
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

    // Slide transitions with motion blur (shutter angle 360° simulation)
    // Moved out of BUILTIN_XFADE to add directional blur during the slide.
    const SLIDE_TYPES = new Set(['slideleft', 'slideright', 'slideup', 'slidedown']);
    if (SLIDE_TYPES.has(transitionType)) {
        const isHorizontal = transitionType === 'slideleft' || transitionType === 'slideright';
        const blurX = isHorizontal ? 8 : 0;
        const blurY = isHorizontal ? 0 : 8;
        return [
            `${inputLabel0}avgblur=sizeX=${blurX}:sizeY=${blurY}:planes=0x7[sl_a]`,
            `${inputLabel1}avgblur=sizeX=${blurX}:sizeY=${blurY}:planes=0x7[sl_b]`,
            `[sl_a][sl_b]xfade=transition=${transitionType}:duration=${dur}:offset=${offset}${outputLabel}`,
        ].join(';');
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

        case 'white-flash': {
            // Cinematic white flash: overlay-blended white matte with animated opacity
            const halfDur = (parseFloat(dur) / 2).toFixed(4);
            return [
                `${inputLabel0}${inputLabel1}xfade=transition=dissolve:duration=${dur}:offset=${offset}[wf_base]`,
                `color=c=white:s=1920x1080:d=${dur}[wf_white]`,
                `[wf_white]format=rgba,geq=lum=255:a='if(lt(t,${halfDur}),255*t/${halfDur},255*(${dur}-t)/${halfDur})'[wf_alpha]`,
                `[wf_base][wf_alpha]overlay=0:0:format=auto${outputLabel}`,
            ].join(';');
        }

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

        case 'zoom-through': {
            // Cinematic zoom in/out with bezier easing + motion blur
            const zoomDur = parseFloat(dur);
            const zoomInExpr = `1+0.8*pow(on/(${Math.round(zoomDur * 30)}),2)`;
            const zoomOutExpr = `1.8-0.8*pow(on/(${Math.round(zoomDur * 30)}),0.5)`;
            return [
                `${inputLabel0}zoompan=z='${zoomInExpr}':d=1:s=1920x1080:fps=30,avgblur=sizeX=3:sizeY=3[zt_out]`,
                `${inputLabel1}zoompan=z='${zoomOutExpr}':d=1:s=1920x1080:fps=30,avgblur=sizeX=3:sizeY=3[zt_in]`,
                `[zt_out][zt_in]xfade=transition=fade:duration=${dur}:offset=${offset}${outputLabel}`,
            ].join(';');
        }

        case 'spin':
            // Spin: rotate during fade
            return `${inputLabel0}${inputLabel1}xfade=transition=radial:duration=${dur}:offset=${offset}${outputLabel}`;

        case 'film-burn': {
            // Cinematic film burn: warm orange overlay with screen blend
            const burnDur = parseFloat(dur);
            const halfBurn = (burnDur / 2).toFixed(4);
            return [
                `${inputLabel0}${inputLabel1}xfade=transition=dissolve:duration=${dur}:offset=${offset}[fb_base]`,
                `color=c=#FF6A00:s=1920x1080:d=${dur}[fb_warm]`,
                `[fb_warm]format=rgba,colorchannelmixer=rr=1.2:gg=0.6:bb=0.2,geq=lum=p(X,Y):a='if(lt(t,${halfBurn}),200*t/${halfBurn},200*(${dur}-t)/${halfBurn})'[fb_alpha]`,
                `[fb_base][fb_alpha]blend=all_mode=screen:all_opacity=0.7${outputLabel}`,
            ].join(';');
        }

        case 'whip':
            // Whip pan: fast horizontal slide
            return `${inputLabel0}${inputLabel1}xfade=transition=slideleft:duration=${(parseFloat(dur) * 0.3).toFixed(4)}:offset=${offset}${outputLabel}`;

        case 'subject-mask': {
            // ── Subject Masking Transition ────────────────────────────────
            // Three approaches, selected via maskConfig:
            //
            // 1. Chroma-key (Option A): Use FFmpeg's chromakey filter to knock out
            //    a solid background color, then composite clip B behind the keyed
            //    clip A. Works for green-screen or high-contrast solid backgrounds.
            //
            // 2. ML Segmentation (Option C): A pre-computed alpha matte (PNG sequence
            //    or video) generated by an external ML tool (rembg, SAM, etc.) is
            //    overlaid as a luma-keyed mask. The IPC 'segment-subject' handler
            //    runs the ML model and writes the matte before render.
            //
            // 3. Fallback: circle-open reveal (approximates a center-out subject mask).

            if (maskConfig?.mode === 'chromakey' && maskConfig.chromakey) {
                // Option A: Chroma-key compositing
                // Knock out the background on clip A, then overlay clip A (subject only)
                // on top of clip B, with a dissolve fade for smoothness.
                const ck = maskConfig.chromakey;
                const hexColor = ck.color.replace('#', '0x');
                const sim = ck.similarity.toFixed(2);
                const blend = ck.blend.toFixed(2);
                return [
                    // Key out clip A's background → subject-only with alpha
                    `${inputLabel0}chromakey=color=${hexColor}:similarity=${sim}:blend=${blend}[sm_fg]`,
                    // Cross-fade clip B in behind keyed clip A
                    `${inputLabel1}setpts=PTS-STARTPTS[sm_bg]`,
                    `[sm_bg][sm_fg]overlay=0:0:format=auto:shortest=1${outputLabel}`,
                ].join(';');
            }

            if (maskConfig?.mode === 'ml-segment' && maskConfig.mattePath) {
                // Option C: Pre-computed alpha matte from ML segmentation
                // The matte is a grayscale video/image-sequence where white = subject.
                // Use it as a luma mask to composite clip A's subject over clip B.
                const invert = maskConfig.invertMask ? ',negate' : '';
                return [
                    // Load the alpha matte, ensure it's grayscale
                    `movie=${maskConfig.mattePath.replace(/\\/g, '/')}:loop=0,format=gray${invert}[sm_mask]`,
                    // Use alphamerge to apply the matte to clip A
                    `${inputLabel0}format=rgba[sm_src]`,
                    `[sm_src][sm_mask]alphamerge[sm_keyed]`,
                    // Composite keyed clip A over clip B
                    `${inputLabel1}setpts=PTS-STARTPTS[sm_bg2]`,
                    `[sm_bg2][sm_keyed]overlay=0:0:format=auto:shortest=1${outputLabel}`,
                ].join(';');
            }

            // Fallback: radial-wipe that simulates a center-out subject reveal
            return `${inputLabel0}${inputLabel1}xfade=transition=circleopen:duration=${dur}:offset=${offset}${outputLabel}`;
        }

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
    transitions: Array<{ type: string; durationSec: number; maskConfig?: Parameters<typeof buildTransitionFilter>[6] }>,
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
            t.maskConfig,
        );
        parts.push(filter);
    }

    return parts.join(';');
}
