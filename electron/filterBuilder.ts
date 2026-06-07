// ══════════════════════════════════════════════════════════════════════════════
// filterBuilder.ts — FFmpeg Filter Chain Construction
// Runs in the Electron main process (Node.js).
// Extracts the duplicated filter chain construction from main.ts into shared,
// testable functions for both per-clip and monolithic export pipelines.
// ══════════════════════════════════════════════════════════════════════════════

import { resolveEffectFilter, cssToFfmpeg } from './effectCompiler';

// ── Data Types ──────────────────────────────────────────────────────────────

export interface ClipExportData {
    /** Absolute path to the source media file */
    path: string;
    /** Timeline start frame (project fps) */
    startFrame: number;
    /** Timeline end frame (project fps) */
    endFrame: number;
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
}

export interface ExportSettings {
    /** Output width in pixels */
    width: number;
    /** Output height in pixels */
    height: number;
    /** Output frames per second */
    fps: number;
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

    const zs = (zoomStart / 100).toFixed(4);
    const ze = (zoomEnd / 100).toFixed(4);
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

    // z expression: linear interpolation from zs to ze over d frames
    const zExpr = `'if(eq(on,1),${zs},lerp(${zs},${ze},on/${d}))'`;

    return `zoompan=z=${zExpr}:x=${xExpr}:y=${yExpr}:d=${d}:s=${outputWidth}x${outputHeight}:fps=${fps}`;
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
    probeData: ProbeData
): string {
    const speed = clip.speed || 1.0;
    const fps = settings.fps;
    const outW = settings.width;
    const outH = settings.height;

    // Calculate source trim boundaries
    const timelineDurSec = (clip.endFrame - clip.startFrame) / fps;
    const seekTo = clip.startFrame / fps;
    const srcTrimDur = timelineDurSec * speed;

    // Clamp to source duration
    let seekClamped = Math.max(0, seekTo);
    let clipDur = srcTrimDur;

    if (probeData.duration > 0.5) {
        if (seekClamped >= probeData.duration) {
            seekClamped = Math.max(0, probeData.duration - clipDur - 0.5);
        }
        if (seekClamped + clipDur > probeData.duration) {
            clipDur = Math.max(0.04, probeData.duration - seekClamped - 0.01);
        }
    }
    if (clipDur < 0.01) clipDur = 0.04;

    const trimEnd = seekClamped + clipDur;
    const filters: string[] = [];

    // 1. Trim + reset PTS
    filters.push(`trim=start=${seekClamped.toFixed(4)}:end=${trimEnd.toFixed(4)}`);
    filters.push('setpts=PTS-STARTPTS');

    // 2. Reverse (for short clips ≤ 5 seconds, applied inline)
    if (clip.reversed && !shouldUseIntermediateForReverse(clip, fps)) {
        filters.push('reverse');
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

    // 6. Effects
    const effectFilters = buildEffectFilters(clip);
    if (effectFilters) {
        filters.push(effectFilters);
    }

    // 7. Speed adjustment via setpts
    if (speed !== 1.0) {
        filters.push(`setpts=${(1 / speed).toFixed(4)}*PTS`);
    }

    // 8. FPS
    filters.push(`fps=fps=${fps}`);

    return filters.join(',');
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
