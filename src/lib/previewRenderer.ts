/**
 * Preview Renderer — Canvas2D-based real-time effect preview pipeline.
 * ════════════════════════════════════════════════════════════════════════════
 * Applies visual effects to video frames drawn on a canvas, providing
 * an approximate preview of what FFmpeg will render. This is the intermediate
 * step before WebGPU (Phase 5) — it handles the most common effects:
 *   • Color grading (temperature, tint, exposure, contrast, saturation)
 *   • Zoom/pan/rotation transforms
 *   • Film grain overlay
 *   • Vignette
 *   • Flip H/V
 *   • Sharpen (approximated)
 *   • Color LUT application (simplified)
 *
 * Performance notes:
 *   - All ImageData operations use typed-array access for speed.
 *   - Film grain reuses a cached noise buffer where possible.
 *   - Vignette uses a single radial gradient draw call.
 *   - Transform effects use canvas matrix operations (zero pixel copies).
 */

import type { Clip } from '../types';
import { getWebGPUPipeline, type GPUEffectParams, type WebGPUPreviewPipeline } from './webgpuPreview';

// ══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════

export interface PreviewEffectStack {
    /** Color grading adjustments (temperature, tint, exposure, etc.) */
    colorGrading?: {
        temperature?: number;   // -100 to 100
        tint?: number;          // -100 to 100
        exposure?: number;      // -2 to 2
        contrast?: number;      // 0.5 to 2
        saturation?: number;    // 0 to 3
        vibrance?: number;      // 0 to 2
    };
    /** Static zoom percentage (100 = no zoom) */
    zoom?: number;
    /** Anchor point for the zoom transform */
    zoomOrigin?: string;        // 'center' | 'top' | 'bottom' | 'left' | 'right'
    /** Rotation in 90° increments */
    rotation?: 0 | 90 | 180 | 270;
    /** Mirror horizontally */
    flipH?: boolean;
    /** Mirror vertically */
    flipV?: boolean;
    /** Film grain intensity (0-25) */
    filmGrain?: number;
    /** Vignette intensity (0-100) */
    vignette?: number;
    /** Sharpen strength (0-3) */
    sharpen?: number;
    /** Overall opacity (0-1) */
    opacity?: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// STACK BUILDER
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Build a PreviewEffectStack from a Clip's properties.
 * Extracts only the properties relevant to the preview pipeline and normalises
 * defaults so downstream renderers can skip no-op checks.
 */
export function buildEffectStack(clip: Partial<Clip>): PreviewEffectStack {
    const stack: PreviewEffectStack = {};

    // ── Color grading ────────────────────────────────────────────────────
    if (clip.colorGrading) {
        const cg = clip.colorGrading;
        stack.colorGrading = {
            temperature: cg.temperature ?? 0,
            tint:        cg.tint ?? 0,
            exposure:    cg.exposure ?? 0,
            contrast:    cg.contrast ?? 1,
            saturation:  cg.saturation ?? 1,
            vibrance:    cg.vibrance ?? 1,
        };
    }

    // ── Zoom ─────────────────────────────────────────────────────────────
    // Use the static `zoomLevel` or the start of a dynamic zoom range.
    const zoom = clip.zoomLevel ?? clip.zoomStart ?? undefined;
    if (zoom !== undefined && zoom !== 100) {
        stack.zoom = zoom;
        stack.zoomOrigin = clip.zoomOrigin ?? 'center';
    }

    // ── Rotation ─────────────────────────────────────────────────────────
    if (clip.rotation) {
        stack.rotation = clip.rotation;
    }

    // ── Flips ────────────────────────────────────────────────────────────
    if (clip.flipH) stack.flipH = true;
    if (clip.flipV) stack.flipV = true;

    // ── Film grain ───────────────────────────────────────────────────────
    if (clip.filmGrain && clip.filmGrain > 0) {
        stack.filmGrain = clip.filmGrain;
    }

    // ── Vignette ─────────────────────────────────────────────────────────
    if (clip.vignette && clip.vignette > 0) {
        stack.vignette = clip.vignette;
    }

    // ── Sharpen ──────────────────────────────────────────────────────────
    if (clip.sharpen && clip.sharpen > 0) {
        stack.sharpen = clip.sharpen;
    }

    return stack;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PIPELINE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Apply the full effect stack to a canvas context.
 * The source frame should already be drawn on the canvas before calling this.
 *
 * Effect order: transform → color grading → overlay effects → opacity.
 * Transforms (zoom, rotation, flip) are applied via canvas matrix operations.
 * Pixel-level effects (color grading, sharpen) use getImageData/putImageData.
 * Overlay effects (grain, vignette) are composited on top.
 */
export function applyEffectStack(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    stack: PreviewEffectStack
): void {
    const { width, height } = canvas;

    // ── 1. Pixel-level effects (color grading + sharpen) ─────────────────
    const needsPixelWork =
        stack.colorGrading !== undefined ||
        (stack.sharpen !== undefined && stack.sharpen > 0);

    if (needsPixelWork) {
        const imageData = ctx.getImageData(0, 0, width, height);

        if (stack.colorGrading) {
            applyColorGrading(imageData, stack.colorGrading);
        }

        if (stack.sharpen && stack.sharpen > 0) {
            applySharpen(imageData, width, height, stack.sharpen);
        }

        ctx.putImageData(imageData, 0, 0);
    }

    // ── 2. Film grain overlay ────────────────────────────────────────────
    if (stack.filmGrain && stack.filmGrain > 0) {
        applyFilmGrain(ctx, width, height, stack.filmGrain);
    }

    // ── 3. Vignette overlay ──────────────────────────────────────────────
    if (stack.vignette && stack.vignette > 0) {
        applyVignette(ctx, width, height, stack.vignette);
    }

    // ── 4. Opacity ───────────────────────────────────────────────────────
    if (stack.opacity !== undefined && stack.opacity < 1) {
        ctx.save();
        ctx.globalAlpha = stack.opacity;
        ctx.globalCompositeOperation = 'destination-in';
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
    }
}

/**
 * Apply spatial transforms (zoom, rotation, flip) to a canvas context.
 * Call this **before** drawing the source frame so the frame is rendered
 * into the already-transformed coordinate space.
 *
 * Usage:
 *   applyTransforms(ctx, canvas, stack);
 *   ctx.drawImage(videoFrame, 0, 0, canvas.width, canvas.height);
 *   applyEffectStack(ctx, canvas, stack);
 */
export function applyTransforms(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    stack: PreviewEffectStack
): void {
    const { width, height } = canvas;

    if (stack.zoom !== undefined && stack.zoom !== 100) {
        applyZoomTransform(ctx, width, height, stack.zoom, stack.zoomOrigin ?? 'center');
    }

    if (stack.rotation) {
        applyRotation(ctx, width, height, stack.rotation);
    }

    if (stack.flipH || stack.flipV) {
        applyFlip(ctx, width, height, !!stack.flipH, !!stack.flipV);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// COLOR GRADING
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Apply color grading to ImageData pixels.
 * Modifies pixel data in-place for zero-allocation performance.
 *
 * Processing order per pixel:
 *   1. Exposure (multiplicative)
 *   2. Temperature (R/B shift)
 *   3. Tint (G shift)
 *   4. Contrast (S-curve around midpoint)
 *   5. Saturation / Vibrance (HSL-space saturation manipulation)
 */
export function applyColorGrading(
    imageData: ImageData,
    grading: NonNullable<PreviewEffectStack['colorGrading']>
): void {
    const data = imageData.data;
    const len = data.length;

    // Pre-compute constants outside the pixel loop for speed.
    const exposureMul   = Math.pow(2, grading.exposure ?? 0);
    const tempShift     = (grading.temperature ?? 0) * 0.5;   // ±50 per-channel
    const tintShift     = (grading.tint ?? 0) * 0.3;          // ±30 per-channel
    const contrast      = grading.contrast ?? 1;
    const saturation    = grading.saturation ?? 1;
    const vibrance      = grading.vibrance ?? 1;

    const needsSaturation = saturation !== 1 || vibrance !== 1;

    // Build a 256-entry contrast LUT so we avoid the per-pixel multiply.
    const contrastLUT = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
        const v = ((i / 255 - 0.5) * contrast + 0.5) * 255;
        contrastLUT[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }

    for (let i = 0; i < len; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];
        // Alpha (data[i+3]) is untouched.

        // 1. Exposure — multiply all channels by 2^exposure
        if (exposureMul !== 1) {
            r = r * exposureMul;
            g = g * exposureMul;
            b = b * exposureMul;
        }

        // 2. Temperature — shift red (warm) / blue (cool)
        if (tempShift !== 0) {
            r = r + tempShift;
            b = b - tempShift;
        }

        // 3. Tint — shift green channel
        if (tintShift !== 0) {
            g = g + tintShift;
        }

        // Clamp to 0-255 before LUT indexing
        r = r < 0 ? 0 : r > 255 ? 255 : r;
        g = g < 0 ? 0 : g > 255 ? 255 : g;
        b = b < 0 ? 0 : b > 255 ? 255 : b;

        // 4. Contrast — apply via pre-computed LUT
        if (contrast !== 1) {
            r = contrastLUT[r | 0];
            g = contrastLUT[g | 0];
            b = contrastLUT[b | 0];
        }

        // 5. Saturation + Vibrance — work in pseudo-HSL space
        if (needsSaturation) {
            const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

            // Vibrance: saturation boost that is stronger on desaturated pixels
            // and weaker on already-saturated pixels, preventing clipping.
            let effectiveSat = saturation;
            if (vibrance !== 1) {
                // Measure how saturated this pixel already is (0 = grey, 1 = pure)
                const maxC = Math.max(r, g, b);
                const minC = Math.min(r, g, b);
                const currentSat = maxC > 0 ? (maxC - minC) / maxC : 0;
                // Less saturated pixels get the full vibrance boost
                effectiveSat *= 1 + (vibrance - 1) * (1 - currentSat);
            }

            r = lum + effectiveSat * (r - lum);
            g = lum + effectiveSat * (g - lum);
            b = lum + effectiveSat * (b - lum);
        }

        // Final clamp + write
        data[i]     = r < 0 ? 0 : r > 255 ? 255 : r;
        data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
        data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// SHARPEN (3×3 UNSHARP MASK APPROXIMATION)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Apply a 3×3 unsharp-mask sharpen to ImageData.
 * Uses a simplified Laplacian kernel blended at `strength` intensity.
 * This is an approximation — full unsharp mask would require a separate blur
 * pass, but for real-time preview the kernel approach is sufficient.
 *
 * @param imageData - Pixel data (modified in-place)
 * @param w         - Image width
 * @param h         - Image height
 * @param strength  - 0-3 sharpen intensity
 */
function applySharpen(
    imageData: ImageData,
    w: number,
    h: number,
    strength: number
): void {
    const src = new Uint8ClampedArray(imageData.data);
    const dst = imageData.data;

    // Kernel weights: centre = 1 + 4*str, neighbors = -str
    const center = 1 + 4 * strength;
    const edge = -strength;

    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const idx = (y * w + x) * 4;

            for (let c = 0; c < 3; c++) {
                const val =
                    center * src[idx + c] +
                    edge * src[idx - 4 + c] +          // left
                    edge * src[idx + 4 + c] +          // right
                    edge * src[((y - 1) * w + x) * 4 + c] + // top
                    edge * src[((y + 1) * w + x) * 4 + c];  // bottom

                dst[idx + c] = val < 0 ? 0 : val > 255 ? 255 : val;
            }
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// FILM GRAIN
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Apply film grain overlay to a canvas.
 * Generates random noise and composites it using the 'overlay' blend mode.
 * The noise is drawn at reduced resolution and scaled up to save fill-rate.
 *
 * @param ctx       - Target canvas context
 * @param width     - Canvas width
 * @param height    - Canvas height
 * @param intensity - Grain strength 0-25 (maps to noise opacity 0-0.5)
 */
export function applyFilmGrain(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    intensity: number
): void {
    if (intensity <= 0) return;

    // Downsample for performance: grain at ¼ resolution looks identical
    // when blended, and is 16× fewer random() calls.
    const grainW = Math.ceil(width / 4);
    const grainH = Math.ceil(height / 4);

    // Re-use an offscreen canvas if available (avoids allocation each frame).
    const offscreen = _getGrainCanvas(grainW, grainH);
    const gCtx = offscreen.getContext('2d')!;
    const imageData = gCtx.createImageData(grainW, grainH);
    const data = imageData.data;

    // Generate monochrome noise
    for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() * 255) | 0;
        data[i]     = noise;  // R
        data[i + 1] = noise;  // G
        data[i + 2] = noise;  // B
        data[i + 3] = 255;    // A
    }

    gCtx.putImageData(imageData, 0, 0);

    // Composite the noise onto the target canvas
    ctx.save();
    ctx.globalAlpha = (intensity / 25) * 0.5;   // Max alpha = 0.5
    ctx.globalCompositeOperation = 'overlay';
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offscreen, 0, 0, width, height);
    ctx.restore();
}

/** Cached offscreen canvas for grain generation. */
let _grainCanvas: HTMLCanvasElement | null = null;

/**
 * Get (or create) a cached offscreen canvas for film grain.
 * Resizes only when dimensions change.
 */
function _getGrainCanvas(w: number, h: number): HTMLCanvasElement {
    if (!_grainCanvas || _grainCanvas.width !== w || _grainCanvas.height !== h) {
        _grainCanvas = document.createElement('canvas');
        _grainCanvas.width = w;
        _grainCanvas.height = h;
    }
    return _grainCanvas;
}

// ══════════════════════════════════════════════════════════════════════════════
// VIGNETTE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Apply vignette overlay to a canvas.
 * Draws a single radial gradient from transparent at centre to darkened
 * edges. Uses a single draw call for optimal performance.
 *
 * @param ctx       - Target canvas context
 * @param width     - Canvas width
 * @param height    - Canvas height
 * @param intensity - Vignette strength 0-100
 */
export function applyVignette(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    intensity: number
): void {
    if (intensity <= 0) return;

    const cx = width / 2;
    const cy = height / 2;
    // Outer radius covers corners
    const outerRadius = Math.sqrt(cx * cx + cy * cy);
    // Inner radius where the darkening begins (≈60% of the way out)
    const innerRadius = outerRadius * 0.4;

    const maxAlpha = (intensity / 100) * 0.8;

    const gradient = ctx.createRadialGradient(cx, cy, innerRadius, cx, cy, outerRadius);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${maxAlpha})`);

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════════════
// ZOOM TRANSFORM
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Apply zoom/pan transform to canvas context.
 * Must be called BEFORE drawing the source frame so the image is rendered
 * into the scaled coordinate space.
 *
 * @param ctx    - Target canvas context
 * @param width  - Canvas width
 * @param height - Canvas height
 * @param zoom   - Zoom percentage (100 = identity, 150 = 1.5× zoom in)
 * @param origin - Anchor point for the zoom ('center', 'top', 'bottom', etc.)
 */
export function applyZoomTransform(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    zoom: number,
    origin: string
): void {
    const scale = zoom / 100;
    if (scale === 1) return;

    // Resolve the origin anchor to a pixel coordinate
    const [ox, oy] = _resolveOrigin(origin, width, height);

    // Translate so the origin stays fixed, then scale
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    ctx.translate(-ox, -oy);
}

/**
 * Map a named origin string to pixel coordinates.
 * Supported values: center, top, bottom, left, right, top-left, top-right,
 * bottom-left, bottom-right. Defaults to center for unknown values.
 */
function _resolveOrigin(
    origin: string,
    width: number,
    height: number
): [number, number] {
    switch (origin) {
        case 'top':          return [width / 2, 0];
        case 'bottom':       return [width / 2, height];
        case 'left':         return [0, height / 2];
        case 'right':        return [width, height / 2];
        case 'top-left':     return [0, 0];
        case 'top-right':    return [width, 0];
        case 'bottom-left':  return [0, height];
        case 'bottom-right': return [width, height];
        case 'center':
        default:             return [width / 2, height / 2];
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// ROTATION TRANSFORM
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Apply rotation transform to canvas context.
 * Rotates around the canvas centre in 90° increments. Must be called
 * BEFORE drawing the source frame.
 *
 * @param ctx     - Target canvas context
 * @param width   - Canvas width
 * @param height  - Canvas height
 * @param degrees - Rotation angle (0, 90, 180, 270)
 */
export function applyRotation(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    degrees: 0 | 90 | 180 | 270
): void {
    if (degrees === 0) return;

    const cx = width / 2;
    const cy = height / 2;
    const radians = (degrees * Math.PI) / 180;

    ctx.translate(cx, cy);
    ctx.rotate(radians);

    // For 90° / 270° the aspect ratio is swapped; translate back accordingly
    if (degrees === 90 || degrees === 270) {
        ctx.translate(-cy, -cx);
    } else {
        ctx.translate(-cx, -cy);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// FLIP TRANSFORM
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Apply flip (mirror) transforms to canvas context.
 * Uses scale(-1, 1) / scale(1, -1) with appropriate translation to keep
 * the image centred. Must be called BEFORE drawing the source frame.
 *
 * @param ctx   - Target canvas context
 * @param width - Canvas width
 * @param height - Canvas height
 * @param flipH - Mirror horizontally
 * @param flipV - Mirror vertically
 */
export function applyFlip(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    flipH: boolean,
    flipV: boolean
): void {
    if (!flipH && !flipV) return;

    const sx = flipH ? -1 : 1;
    const sy = flipV ? -1 : 1;
    const tx = flipH ? width : 0;
    const ty = flipV ? height : 0;

    ctx.translate(tx, ty);
    ctx.scale(sx, sy);
}

// ══════════════════════════════════════════════════════════════════════════════
// WEBGPU-ACCELERATED PATH
// ══════════════════════════════════════════════════════════════════════════════

/** Cached WebGPU pipeline singleton (lazy-init). */
let _gpuPipeline: WebGPUPreviewPipeline | null | undefined;
let _gpuInitPromise: Promise<WebGPUPreviewPipeline | null> | null = null;

/**
 * Convert a PreviewEffectStack into GPUEffectParams for the WebGPU shader.
 */
function stackToGPUParams(stack: PreviewEffectStack): GPUEffectParams {
    const cg = stack.colorGrading;
    return {
        exposure: cg?.exposure ?? 0,
        contrast: cg?.contrast ?? 1,
        saturation: cg?.saturation ?? 1,
        temperature: cg?.temperature ?? 0,
        tint: cg?.tint ?? 0,
        vibrance: cg?.vibrance ?? 1,
        highlights: 0,
        shadows: 0,
        filmGrain: stack.filmGrain ?? 0,
        vignette: stack.vignette ?? 0,
        sharpen: stack.sharpen ?? 0,
        opacity: stack.opacity ?? 1,
    };
}

/**
 * Apply the preview effect stack using WebGPU acceleration when available,
 * falling back to Canvas2D otherwise.
 *
 * This is the recommended entry point for the SequenceView preview loop.
 * It lazily initializes the WebGPU pipeline on first call.
 *
 * @param source  - The video frame source (video element, canvas, or ImageBitmap)
 * @param ctx     - The destination canvas 2D context
 * @param canvas  - The destination canvas element
 * @param stack   - The effect stack to apply
 * @returns true if GPU path was used, false if Canvas2D fallback was used
 */
export async function applyEffectStackAccelerated(
    source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    stack: PreviewEffectStack,
): Promise<boolean> {
    // Lazy-init the GPU pipeline
    if (_gpuPipeline === undefined) {
        if (!_gpuInitPromise) {
            _gpuInitPromise = getWebGPUPipeline().then(p => {
                _gpuPipeline = p;
                _gpuInitPromise = null;
                return p;
            }).catch(() => {
                _gpuPipeline = null;
                _gpuInitPromise = null;
                return null;
            });
        }
        await _gpuInitPromise;
    }

    // Check if GPU path can handle this stack
    const hasGPUWork = stack.colorGrading || stack.filmGrain || stack.vignette ||
        (stack.opacity !== undefined && stack.opacity < 1);

    if (_gpuPipeline?.ready && hasGPUWork) {
        try {
            const gpuParams = stackToGPUParams(stack);
            await _gpuPipeline.processFrame(source, canvas, gpuParams);

            // GPU handled color grading + grain + vignette + opacity.
            // Sharpen is still Canvas2D-only — apply if needed.
            if (stack.sharpen && stack.sharpen > 0) {
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                applySharpen(imageData, canvas.width, canvas.height, stack.sharpen);
                ctx.putImageData(imageData, 0, 0);
            }
            return true;
        } catch (err) {
            console.warn('[PreviewRenderer] WebGPU frame failed, falling back to Canvas2D:', err);
        }
    }

    // Canvas2D fallback
    applyEffectStack(ctx, canvas, stack);
    return false;
}
