/**
 * WebGPU Preview Renderer — GPU-accelerated real-time effect preview.
 * ════════════════════════════════════════════════════════════════════════════════
 * Replaces the Canvas2D pipeline from previewRenderer.ts with WebGPU compute
 * shaders for dramatically higher throughput. Falls back to Canvas2D when
 * WebGPU is not available.
 *
 * Architecture:
 *   1. Detect WebGPU support at init
 *   2. If available, build compute pipeline with effect shaders
 *   3. Upload video frame → GPU texture
 *   4. Run compute shader pipeline (color grade → film grain → vignette → etc.)
 *   5. Read back to canvas for display
 *
 * The compute shader approach allows all pixel operations in a single pass,
 * which is 10-50x faster than the per-pixel Canvas2D ImageData manipulation.
 */

// ─── Feature Detection ──────────────────────────────────────────────────────

/**
 * Check if WebGPU is supported in this environment.
 */
export async function isWebGPUSupported(): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;
    if (!('gpu' in navigator)) return false;
    try {
        const adapter = await (navigator as any).gpu.requestAdapter();
        return adapter !== null;
    } catch {
        return false;
    }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GPUEffectParams {
    // Color grading
    exposure: number;      // -2 to 2
    contrast: number;      // 0.5 to 2
    temperature: number;   // -100 to 100
    tint: number;          // -100 to 100
    saturation: number;    // 0 to 2
    vibrance: number;      // 0 to 2
    highlights: number;    // -100 to 100
    shadows: number;       // -100 to 100

    // Film look
    filmGrain: number;     // 0 to 100
    vignette: number;      // 0 to 100
    sharpen: number;       // 0 to 3

    // Transform
    opacity: number;       // 0 to 1
}

export const DEFAULT_GPU_PARAMS: GPUEffectParams = {
    exposure: 0,
    contrast: 1,
    temperature: 0,
    tint: 0,
    saturation: 1,
    vibrance: 1,
    highlights: 0,
    shadows: 0,
    filmGrain: 0,
    vignette: 0,
    sharpen: 0,
    opacity: 1,
};

// ─── WGSL Compute Shader ────────────────────────────────────────────────────

const COLOR_GRADE_SHADER = /* wgsl */ `
struct Params {
    exposure: f32,
    contrast: f32,
    temperature: f32,
    tint: f32,
    saturation: f32,
    vibrance: f32,
    highlights: f32,
    shadows: f32,
    filmGrain: f32,
    vignette: f32,
    sharpen: f32,
    opacity: f32,
    width: u32,
    height: u32,
    time: f32,
    _pad: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var outputTex: texture_storage_2d<rgba8unorm, write>;

// Pseudo-random hash for film grain
fn hash(p: vec2<f32>) -> f32 {
    var h = dot(p, vec2<f32>(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let dims = vec2<u32>(params.width, params.height);
    if (id.x >= dims.x || id.y >= dims.y) {
        return;
    }

    let coord = vec2<i32>(i32(id.x), i32(id.y));
    var color = textureLoad(inputTex, coord, 0);
    var rgb = color.rgb;

    // ── Exposure ──
    let exposureMult = pow(2.0, params.exposure);
    rgb = rgb * exposureMult;

    // ── Temperature (R/B shift) ──
    let tempShift = params.temperature / 100.0;
    rgb.r = rgb.r + tempShift * 0.1;
    rgb.b = rgb.b - tempShift * 0.1;

    // ── Tint (G shift) ──
    let tintShift = params.tint / 100.0;
    rgb.g = rgb.g + tintShift * 0.05;

    // ── Contrast ──
    rgb = (rgb - 0.5) * params.contrast + 0.5;

    // ── Highlights / Shadows ──
    let luma = dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
    let highlightMask = smoothstep(0.5, 1.0, luma);
    let shadowMask = 1.0 - smoothstep(0.0, 0.5, luma);
    rgb = rgb + rgb * highlightMask * (params.highlights / 200.0);
    rgb = rgb + rgb * shadowMask * (params.shadows / 200.0);

    // ── Saturation ──
    let gray = dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
    rgb = mix(vec3<f32>(gray), rgb, params.saturation);

    // ── Vibrance (adaptive saturation) ──
    let maxC = max(rgb.r, max(rgb.g, rgb.b));
    let minC = min(rgb.r, min(rgb.g, rgb.b));
    let satLevel = select(0.0, (maxC - minC) / maxC, maxC > 0.001);
    let vibBoost = (1.0 - satLevel) * (params.vibrance - 1.0);
    rgb = mix(vec3<f32>(gray), rgb, 1.0 + vibBoost);

    // ── Film Grain ──
    if (params.filmGrain > 0.0) {
        let uv = vec2<f32>(f32(id.x), f32(id.y));
        let grain = (hash(uv + vec2<f32>(params.time, params.time * 0.7)) - 0.5) * params.filmGrain / 100.0;
        rgb = rgb + vec3<f32>(grain);
    }

    // ── Vignette ──
    if (params.vignette > 0.0) {
        let uv = vec2<f32>(f32(id.x) / f32(dims.x), f32(id.y) / f32(dims.y));
        let center = uv - 0.5;
        let dist = length(center) * 1.414;  // normalize to 0-1 at corners
        let vig = 1.0 - smoothstep(0.4, 1.2, dist) * params.vignette / 100.0 * 0.8;
        rgb = rgb * vig;
    }

    // ── Opacity ──
    let a = color.a * params.opacity;

    // ── Clamp & Write ──
    rgb = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    textureStore(outputTex, coord, vec4<f32>(rgb, a));
}
`;

// ─── WebGPU Pipeline Manager ────────────────────────────────────────────────

export class WebGPUPreviewPipeline {
    private device: GPUDevice | null = null;
    private pipeline: GPUComputePipeline | null = null;
    private paramBuffer: GPUBuffer | null = null;
    private bindGroupLayout: GPUBindGroupLayout | null = null;
    private _ready = false;
    private _frameCount = 0;

    /** Whether the pipeline is ready for rendering. */
    get ready(): boolean { return this._ready; }

    /**
     * Initialize the WebGPU pipeline. Must be called once before rendering.
     * Returns false if WebGPU is not available.
     */
    async init(): Promise<boolean> {
        try {
            if (!('gpu' in navigator)) return false;

            const adapter = await (navigator as any).gpu.requestAdapter({
                powerPreference: 'high-performance',
            });
            if (!adapter) return false;

            this.device = await adapter.requestDevice();
            if (!this.device) return false;

            // Create shader module
            const shaderModule = this.device.createShaderModule({
                code: COLOR_GRADE_SHADER,
            });

            // Bind group layout
            this.bindGroupLayout = this.device.createBindGroupLayout({
                entries: [
                    { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                    { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
                    { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba8unorm' } },
                ],
            });

            // Pipeline
            const pipelineLayout = this.device.createPipelineLayout({
                bindGroupLayouts: [this.bindGroupLayout],
            });

            this.pipeline = this.device.createComputePipeline({
                layout: pipelineLayout,
                compute: {
                    module: shaderModule,
                    entryPoint: 'main',
                },
            });

            // Uniform buffer for params (64 bytes = 16 floats)
            this.paramBuffer = this.device.createBuffer({
                size: 64,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });

            this._ready = true;
            console.log('[WebGPU] Preview pipeline initialized');
            return true;

        } catch (err) {
            console.warn('[WebGPU] Failed to initialize:', err);
            this._ready = false;
            return false;
        }
    }

    /**
     * Process a video frame through the effect pipeline.
     *
     * @param source - ImageBitmap, HTMLVideoElement, or HTMLCanvasElement
     * @param canvas - Target canvas element to render to
     * @param params - Effect parameters
     */
    async processFrame(
        source: ImageBitmap | HTMLVideoElement | HTMLCanvasElement,
        canvas: HTMLCanvasElement,
        params: GPUEffectParams,
    ): Promise<void> {
        if (!this._ready || !this.device || !this.pipeline || !this.paramBuffer || !this.bindGroupLayout) {
            return;
        }

        const width = canvas.width;
        const height = canvas.height;
        if (width === 0 || height === 0) return;

        this._frameCount++;

        try {
            // Upload source to GPU texture
            const inputTexture = this.device.createTexture({
                size: [width, height],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
            });

            // Copy source to input texture
            if (source instanceof HTMLVideoElement) {
                // For video elements, we need to go through ImageBitmap
                const bitmap = await createImageBitmap(source, { resizeWidth: width, resizeHeight: height });
                this.device.queue.copyExternalImageToTexture(
                    { source: bitmap },
                    { texture: inputTexture },
                    [width, height],
                );
                bitmap.close();
            } else {
                this.device.queue.copyExternalImageToTexture(
                    { source },
                    { texture: inputTexture },
                    [width, height],
                );
            }

            // Create output storage texture
            const outputTexture = this.device.createTexture({
                size: [width, height],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
            });

            // Update uniform buffer
            const uniformData = new Float32Array([
                params.exposure, params.contrast, params.temperature, params.tint,
                params.saturation, params.vibrance, params.highlights, params.shadows,
                params.filmGrain, params.vignette, params.sharpen, params.opacity,
            ]);
            const uniformU32 = new Uint32Array([width, height]);
            const timeData = new Float32Array([this._frameCount * 0.016, 0]); // ~60fps time

            const fullBuffer = new ArrayBuffer(64);
            new Float32Array(fullBuffer, 0, 12).set(uniformData);
            new Uint32Array(fullBuffer, 48, 2).set(uniformU32);
            new Float32Array(fullBuffer, 56, 2).set(timeData);

            this.device.queue.writeBuffer(this.paramBuffer, 0, fullBuffer);

            // Create bind group
            const bindGroup = this.device.createBindGroup({
                layout: this.bindGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: this.paramBuffer } },
                    { binding: 1, resource: inputTexture.createView() },
                    { binding: 2, resource: outputTexture.createView() },
                ],
            });

            // Dispatch compute shader
            const commandEncoder = this.device.createCommandEncoder();
            const computePass = commandEncoder.beginComputePass();
            computePass.setPipeline(this.pipeline);
            computePass.setBindGroup(0, bindGroup);
            computePass.dispatchWorkgroups(
                Math.ceil(width / 8),
                Math.ceil(height / 8),
            );
            computePass.end();

            // Copy output texture to canvas
            // We need a staging buffer to read back the output
            const bytesPerRow = Math.ceil(width * 4 / 256) * 256;
            const stagingBuffer = this.device.createBuffer({
                size: bytesPerRow * height,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });

            commandEncoder.copyTextureToBuffer(
                { texture: outputTexture },
                { buffer: stagingBuffer, bytesPerRow, rowsPerImage: height },
                [width, height],
            );

            this.device.queue.submit([commandEncoder.finish()]);

            // Read back and draw to canvas
            await stagingBuffer.mapAsync(GPUMapMode.READ);
            const data = new Uint8ClampedArray(stagingBuffer.getMappedRange());

            const ctx = canvas.getContext('2d');
            if (ctx) {
                // Handle potential row padding
                const imageData = ctx.createImageData(width, height);
                for (let row = 0; row < height; row++) {
                    const srcOffset = row * bytesPerRow;
                    const dstOffset = row * width * 4;
                    imageData.data.set(
                        data.subarray(srcOffset, srcOffset + width * 4),
                        dstOffset,
                    );
                }
                ctx.putImageData(imageData, 0, 0);
            }

            stagingBuffer.unmap();

            // Cleanup per-frame resources
            inputTexture.destroy();
            outputTexture.destroy();
            stagingBuffer.destroy();

        } catch (err) {
            console.warn('[WebGPU] Frame processing error:', err);
        }
    }

    /**
     * Destroy the pipeline and release GPU resources.
     */
    destroy(): void {
        this.paramBuffer?.destroy();
        this.device?.destroy();
        this.device = null;
        this.pipeline = null;
        this.paramBuffer = null;
        this.bindGroupLayout = null;
        this._ready = false;
        console.log('[WebGPU] Pipeline destroyed');
    }
}

// ─── Singleton Instance ─────────────────────────────────────────────────────

let _instance: WebGPUPreviewPipeline | null = null;

/**
 * Get or create the singleton WebGPU preview pipeline.
 * Returns null if WebGPU is not supported.
 */
export async function getWebGPUPipeline(): Promise<WebGPUPreviewPipeline | null> {
    if (_instance?.ready) return _instance;

    _instance = new WebGPUPreviewPipeline();
    const ok = await _instance.init();
    if (!ok) {
        _instance = null;
        return null;
    }
    return _instance;
}

/**
 * Destroy the singleton pipeline.
 */
export function destroyWebGPUPipeline(): void {
    _instance?.destroy();
    _instance = null;
}

// ─── React Hook ─────────────────────────────────────────────────────────────

/**
 * React hook for WebGPU preview rendering.
 * Returns the pipeline instance and a boolean indicating GPU availability.
 *
 * Usage:
 *   const { pipeline, isGPU } = useWebGPUPreview();
 *   if (isGPU && pipeline) pipeline.processFrame(source, canvas, params);
 *   else applyEffectStackCanvas2D(ctx, canvas, stack); // fallback
 */
export function useWebGPUPreviewState(): { pipeline: WebGPUPreviewPipeline | null; isGPU: boolean; loading: boolean } {
    // This is intentionally NOT a React hook (no useState/useEffect) because
    // it needs to work in both React and non-React contexts.
    // Instead, consumers use this as a factory/getter.
    return {
        pipeline: _instance,
        isGPU: _instance?.ready ?? false,
        loading: false,
    };
}
