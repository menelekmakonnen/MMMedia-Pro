// ══════════════════════════════════════════════════════════════════════════════
// social/autoReframe.ts — No-ML auto-reframe planner (wide → vertical/square).
//
// Ports the classic "smart reframe" idea WITHOUT any pixel reading or ML: the
// caller supplies per-frame subject-center estimates (from a skin-region /
// edge-energy / face-box heuristic computed elsewhere, OR from detection
// callbacks). This module is the PURE motion-planning half: it turns those raw,
// jittery centers into a smoothed sequence of crop keyframes that always stay
// inside the source frame, never pan faster than a velocity cap, and lock onto a
// target aspect (9:16 / 1:1 / 4:5 / custom).
//
//   raw subject centers ─▶ EMA smoothing ─▶ velocity clamp ─▶ bounds clamp ─▶
//   crop keyframes { frame, cropX, cropY, cropW, cropH }
//
// No React, no IPC, no FFmpeg, no canvas. Deterministic & unit-testable.
// ══════════════════════════════════════════════════════════════════════════════

import { DEFAULT_FPS } from '../time';

// ── Platform aspect presets ───────────────────────────────────────────────────

/** Target aspect ratios social platforms care about, as width/height numbers. */
export type AspectPresetId = '9:16' | '1:1' | '4:5' | '16:9' | '2.39:1';

export interface AspectPreset {
    id: AspectPresetId;
    /** width / height — e.g. 9/16 = 0.5625 (taller than wide). */
    ratio: number;
    label: string;
}

export const ASPECT_PRESETS: Record<AspectPresetId, AspectPreset> = {
    '9:16': { id: '9:16', ratio: 9 / 16, label: 'Vertical (Reels/Shorts/TikTok)' },
    '1:1': { id: '1:1', ratio: 1, label: 'Square (Feed)' },
    '4:5': { id: '4:5', ratio: 4 / 5, label: 'Portrait (Feed)' },
    '16:9': { id: '16:9', ratio: 16 / 9, label: 'Landscape' },
    '2.39:1': { id: '2.39:1', ratio: 2.39, label: 'Cinemascope' },
};

/** Resolve an aspect — accepts a preset id or a raw width/height ratio number. */
export function resolveAspectRatio(target: AspectPresetId | number): number {
    if (typeof target === 'number') return target;
    const preset = ASPECT_PRESETS[target];
    if (!preset) throw new Error(`[autoReframe] Unknown aspect preset: ${String(target)}`);
    return preset.ratio;
}

// ── Inputs / outputs ──────────────────────────────────────────────────────────

/** A subject-center estimate for one sampled frame. Normalized 0..1 in source
 *  space so callers can sample sparsely without knowing pixel dimensions; an
 *  optional `confidence` (0..1) lets low-confidence samples decay toward the
 *  centerBias instead of yanking the crop around. */
export interface SubjectCenterSample {
    /** Source frame index this sample was measured at. */
    frame: number;
    /** Subject center X, normalized 0..1 of source width. */
    x: number;
    /** Subject center Y, normalized 0..1 of source height. */
    y: number;
    /** 0..1 detection confidence. Absent → treated as 1. */
    confidence?: number;
}

/** A detection callback the planner can pull a center from on demand (no pixel
 *  work happens here — the callback owns that). Returns null when nothing is
 *  found for that frame, in which case the planner falls back to centerBias. */
export type SubjectDetector = (frame: number) => { x: number; y: number; confidence?: number } | null;

export interface ReframeInput {
    sourceW: number;
    sourceH: number;
    /** Target aspect: a preset id ('9:16') or a raw width/height ratio. */
    targetAspect: AspectPresetId | number;
    /** Per-frame subject centers. EITHER an array of samples OR a detector +
     *  frame range. Samples may be sparse; gaps are linearly interpolated. */
    subjectCentersByFrame?: SubjectCenterSample[];
    /** Alternative to a sample array: a callback queried per frame. */
    detector?: SubjectDetector;
    /** Inclusive frame range to plan over. Required when using `detector`;
     *  inferred from the sample range otherwise. */
    frameRange?: { startFrame: number; endFrame: number };
    /** 0..1 — exponential-moving-average factor. 0 = no smoothing (follow raw),
     *  1 = frozen. Default 0.85 (heavy smoothing, slow graceful pans). */
    smoothing?: number;
    /** Max crop-center motion in *normalized source units per frame*. Caps pan
     *  speed so the crop never whip-jitters on a noisy detection. Default 0.02. */
    trackingSpeed?: number;
    /** Where the crop drifts toward when confidence is low / no subject is
     *  found. Normalized 0..1. Default { x: 0.5, y: 0.45 } (slightly high — heads
     *  read better than dead-center). */
    centerBias?: { x: number; y: number };
    /** Extra breathing room around the subject as a fraction of the crop size,
     *  0..0.5. Larger = looser framing. Default 0.08. */
    padding?: number;
    /** Frames-per-second of the source. Display-only here; carried through for
     *  callers that key off it. Default DEFAULT_FPS. */
    fps?: number;
}

/** One crop keyframe in SOURCE pixel space. A renderer scales this crop up to
 *  fill the target canvas. Guaranteed to satisfy:
 *    0 ≤ cropX, cropX + cropW ≤ sourceW (and same for Y/H), cropW/cropH ≈ aspect. */
export interface CropKeyframe {
    frame: number;
    cropX: number;
    cropY: number;
    cropW: number;
    cropH: number;
}

export interface ReframePlan {
    sourceW: number;
    sourceH: number;
    targetRatio: number;
    /** Fixed crop dimensions (the largest target-aspect rect that fits source). */
    cropW: number;
    cropH: number;
    keyframes: CropKeyframe[];
}

// ── Geometry: the largest target-aspect crop that fits inside the source ───────

function fitCropSize(sourceW: number, sourceH: number, targetRatio: number): { cropW: number; cropH: number } {
    // targetRatio = w/h. Try full-height first; if too wide, fall back to full-width.
    let cropH = sourceH;
    let cropW = cropH * targetRatio;
    if (cropW > sourceW) {
        cropW = sourceW;
        cropH = cropW / targetRatio;
    }
    return { cropW, cropH };
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

// ── Sample resolution: build a dense per-frame center track ────────────────────

interface DenseCenter { x: number; y: number; confidence: number }

/** Turn sparse samples / a detector into a dense, gap-free per-frame center track
 *  in normalized 0..1 source space. Missing frames are linearly interpolated
 *  between known neighbours; ends hold the nearest known value; total absence
 *  falls back to the centerBias. */
function buildDenseTrack(input: ReframeInput, start: number, end: number): DenseCenter[] {
    const bias = input.centerBias ?? { x: 0.5, y: 0.45 };
    const n = end - start + 1;
    const track: (DenseCenter | null)[] = new Array(n).fill(null);

    const put = (frame: number, x: number, y: number, confidence: number) => {
        const i = frame - start;
        if (i < 0 || i >= n) return;
        track[i] = { x: clamp(x, 0, 1), y: clamp(y, 0, 1), confidence: clamp(confidence, 0, 1) };
    };

    if (input.subjectCentersByFrame?.length) {
        for (const s of input.subjectCentersByFrame) put(s.frame, s.x, s.y, s.confidence ?? 1);
    }
    if (input.detector) {
        for (let f = start; f <= end; f++) {
            if (track[f - start]) continue; // explicit samples win
            const d = input.detector(f);
            if (d) put(f, d.x, d.y, d.confidence ?? 1);
        }
    }

    // Linear interpolation across gaps; clamp-hold at the ends.
    let prev = -1;
    const known: number[] = [];
    for (let i = 0; i < n; i++) if (track[i]) known.push(i);
    if (known.length === 0) {
        // Nothing detected anywhere → sit on the bias with zero confidence.
        return new Array(n).fill(null).map(() => ({ x: bias.x, y: bias.y, confidence: 0 }));
    }
    // Leading hold.
    for (let i = 0; i < known[0]; i++) track[i] = { ...track[known[0]]! };
    // Trailing hold.
    for (let i = known[known.length - 1] + 1; i < n; i++) track[i] = { ...track[known[known.length - 1]]! };
    // Interior gaps.
    for (let k = 0; k < known.length - 1; k++) {
        const a = known[k], b = known[k + 1];
        const ca = track[a]!, cb = track[b]!;
        for (let i = a + 1; i < b; i++) {
            const t = (i - a) / (b - a);
            track[i] = {
                x: ca.x + (cb.x - ca.x) * t,
                y: ca.y + (cb.y - ca.y) * t,
                confidence: ca.confidence + (cb.confidence - ca.confidence) * t,
            };
        }
    }
    void prev;
    return track as DenseCenter[];
}

// ── The planner ────────────────────────────────────────────────────────────────

/**
 * Plan a smoothed reframe. Returns crop keyframes (one per planned frame) that:
 *   • hold a fixed target-aspect crop size,
 *   • follow the subject with EMA smoothing,
 *   • never move the crop center faster than `trackingSpeed` per frame,
 *   • stay fully inside the source frame,
 *   • blend toward `centerBias` where detection confidence is low.
 */
export function planReframe(input: ReframeInput): ReframePlan {
    const { sourceW, sourceH } = input;
    if (sourceW <= 0 || sourceH <= 0) throw new Error('[autoReframe] sourceW/sourceH must be positive');

    const targetRatio = resolveAspectRatio(input.targetAspect);
    const smoothing = clamp(input.smoothing ?? 0.85, 0, 0.999);
    const trackingSpeed = Math.max(1e-4, input.trackingSpeed ?? 0.02); // normalized units/frame
    const padding = clamp(input.padding ?? 0.08, 0, 0.5);
    const bias = input.centerBias ?? { x: 0.5, y: 0.45 };
    const fps = input.fps ?? DEFAULT_FPS;
    void fps;

    // Frame range: explicit > sample span > single frame 0.
    let start: number, end: number;
    if (input.frameRange) {
        start = input.frameRange.startFrame;
        end = input.frameRange.endFrame;
    } else if (input.subjectCentersByFrame?.length) {
        start = Math.min(...input.subjectCentersByFrame.map((s) => s.frame));
        end = Math.max(...input.subjectCentersByFrame.map((s) => s.frame));
    } else {
        start = 0;
        end = 0;
    }
    if (end < start) end = start;

    // Crop size (with padding shrinking it slightly for breathing room).
    const base = fitCropSize(sourceW, sourceH, targetRatio);
    const padFactor = 1 - padding; // padding loosens framing by shrinking the crop
    let cropW = Math.round(base.cropW * padFactor);
    let cropH = Math.round(base.cropH * padFactor);
    // Re-fit so padding never pushes us out of an exact aspect or past the source.
    cropW = clamp(cropW, 2, sourceW);
    cropH = clamp(cropH, 2, sourceH);

    // Crop-center travel bounds, normalized, so the crop rect never leaves source.
    const halfW = cropW / sourceW / 2;
    const halfH = cropH / sourceH / 2;
    const minCx = halfW, maxCx = 1 - halfW;
    const minCy = halfH, maxCy = 1 - halfH;

    const track = buildDenseTrack(input, start, end);

    const keyframes: CropKeyframe[] = [];
    // EMA state, seeded on the first (confidence-blended) target so we don't pan
    // in from an arbitrary corner on frame 0.
    let smCx: number | null = null;
    let smCy: number | null = null;

    for (let i = 0; i < track.length; i++) {
        const c = track[i];
        // Blend the raw center toward the bias by (1 - confidence): a low-confidence
        // frame leans on the safe bias instead of chasing noise.
        const conf = c.confidence;
        const targetX = c.x * conf + bias.x * (1 - conf);
        const targetY = c.y * conf + bias.y * (1 - conf);

        if (smCx === null || smCy === null) {
            smCx = targetX;
            smCy = targetY;
        } else {
            // EMA: new = old*α + target*(1-α).
            smCx = smCx * smoothing + targetX * (1 - smoothing);
            smCy = smCy * smoothing + targetY * (1 - smoothing);
        }

        // Velocity clamp relative to the PREVIOUS emitted (clamped) center so the
        // cap is honoured on the actual motion, not just the smoothed intent.
        const prev = keyframes.length
            ? { x: (keyframes[keyframes.length - 1].cropX + cropW / 2) / sourceW, y: (keyframes[keyframes.length - 1].cropY + cropH / 2) / sourceH }
            : { x: smCx, y: smCy };
        let cx = smCx, cy = smCy;
        const dx = cx - prev.x, dy = cy - prev.y;
        const dist = Math.hypot(dx, dy);
        if (dist > trackingSpeed && dist > 0) {
            const k = trackingSpeed / dist;
            cx = prev.x + dx * k;
            cy = prev.y + dy * k;
        }

        // Keep the crop fully inside the source frame.
        cx = clamp(cx, minCx, maxCx);
        cy = clamp(cy, minCy, maxCy);

        const cropX = Math.round(cx * sourceW - cropW / 2);
        const cropY = Math.round(cy * sourceH - cropH / 2);
        keyframes.push({
            frame: start + i,
            cropX: clamp(cropX, 0, sourceW - cropW),
            cropY: clamp(cropY, 0, sourceH - cropH),
            cropW,
            cropH,
        });
    }

    return { sourceW, sourceH, targetRatio, cropW, cropH, keyframes };
}
