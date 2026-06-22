/// <reference path="../electron.d.ts" />

/**
 * Waveform Renderer — Extracts audio waveform data and renders to Canvas2D
 * for display in timeline audio clips.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * Extraction uses the Web Audio API: the file is read into an ArrayBuffer
 * (via Electron's `readFileBuffer` IPC or a `fetch` on the file:// URL),
 * decoded with `decodeAudioData`, and then downsampled into peak + RMS arrays.
 *
 * Rendering draws a vertically-mirrored waveform (positive up / negative down)
 * with separate peak-envelope and RMS-filled regions.
 *
 * Cache is a module-level singleton Map keyed by clipId.
 * ══════════════════════════════════════════════════════════════════════════════
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface WaveformData {
    clipId: string;
    path: string;
    peaks: Float32Array;       // Normalized peak values (0-1), one per column pixel
    rms: Float32Array;         // RMS values (0-1), one per column pixel
    duration: number;          // Source duration in seconds
    sampleRate: number;
    generatedAt: number;
}

export interface WaveformRenderOptions {
    /** Fraction of waveform to start rendering from (0-1). Default 0. */
    startFraction?: number;
    /** Fraction of waveform to stop rendering at (0-1). Default 1. */
    endFraction?: number;
    /** Colour for peak envelope lines. */
    peakColor?: string;
    /** Colour for the RMS filled area. */
    rmsColor?: string;
    /** Canvas background colour. */
    backgroundColor?: string;
}

// ─── Module-level cache (singleton) ────────────────────────────────────────

const cache = new Map<string, WaveformData>();

// ─── Defaults ──────────────────────────────────────────────────────────────

const DEFAULT_RESOLUTION = 2000;
const DEFAULT_PEAK_COLOR = '#ec4899';
const DEFAULT_RMS_COLOR = '#f472b6';
const DEFAULT_BACKGROUND_COLOR = 'transparent';

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Convert a local filesystem path to a `file://` URL suitable for Electron's
 * renderer process (handles backslashes on Windows).
 */
function toFileUrl(filePath: string): string {
    return `file:///${filePath.replace(/\\/g, '/')}`;
}

/**
 * Fetch the raw audio bytes for a local file.
 *
 * Tries the Electron IPC `readFileBuffer` channel first (fast, no CORS
 * concerns). Falls back to `fetch` on the file:// URL.
 */
async function readAudioBytes(filePath: string): Promise<ArrayBuffer> {
    // IPC path (preferred in Electron)
    if (typeof window !== 'undefined' && window.ipcRenderer?.readFileBuffer) {
        const result = await window.ipcRenderer.readFileBuffer(filePath);
        if (result.success && result.buffer) {
            // The IPC bridge returns a Uint8Array — we need the underlying buffer
            return result.buffer.buffer.slice(
                result.buffer.byteOffset,
                result.buffer.byteOffset + result.buffer.byteLength,
            );
        }
    }

    // Fetch fallback (works in dev / non-Electron environments)
    const response = await fetch(toFileUrl(filePath));
    if (!response.ok) {
        throw new Error(`Failed to fetch audio file: ${filePath} (${response.status})`);
    }
    return response.arrayBuffer();
}

/**
 * Mix an AudioBuffer down to a single mono Float32Array by averaging all
 * channels.
 */
function downmixMono(audioBuffer: AudioBuffer): Float32Array {
    const numChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;

    if (numChannels === 1) {
        return audioBuffer.getChannelData(0);
    }

    const mono = new Float32Array(length);
    for (let ch = 0; ch < numChannels; ch++) {
        const channelData = audioBuffer.getChannelData(ch);
        for (let i = 0; i < length; i++) {
            mono[i] += channelData[i];
        }
    }
    for (let i = 0; i < length; i++) {
        mono[i] /= numChannels;
    }
    return mono;
}

// ─── Extraction ────────────────────────────────────────────────────────────

/**
 * Extract waveform peak and RMS data from an audio file.
 *
 * The file is decoded via Web Audio API and then reduced to `resolution`
 * data points, each containing the peak (max absolute value) and RMS
 * (root-mean-square) of the samples in that window.
 *
 * @param audioPath   Local filesystem path to the audio/video file.
 * @param clipId      Unique identifier for the clip (cache key).
 * @param options     Optional overrides.
 * @returns           A WaveformData object with normalised peak and RMS arrays.
 */
export async function extractWaveformData(
    audioPath: string,
    clipId: string,
    options?: { resolution?: number },
): Promise<WaveformData> {
    const resolution = options?.resolution ?? DEFAULT_RESOLUTION;

    // Read and decode
    const arrayBuffer = await readAudioBytes(audioPath);

    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    let audioBuffer: AudioBuffer;
    try {
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } finally {
        await audioCtx.close();
    }

    const mono = downmixMono(audioBuffer);
    const totalSamples = mono.length;
    const samplesPerBucket = Math.max(1, Math.floor(totalSamples / resolution));
    const actualBuckets = Math.min(resolution, totalSamples);

    const peaks = new Float32Array(actualBuckets);
    const rms = new Float32Array(actualBuckets);

    for (let bucket = 0; bucket < actualBuckets; bucket++) {
        const start = bucket * samplesPerBucket;
        const end = Math.min(start + samplesPerBucket, totalSamples);
        const windowLen = end - start;

        let maxAbs = 0;
        let sumSq = 0;

        for (let i = start; i < end; i++) {
            const abs = Math.abs(mono[i]);
            if (abs > maxAbs) maxAbs = abs;
            sumSq += mono[i] * mono[i];
        }

        peaks[bucket] = maxAbs;
        rms[bucket] = Math.sqrt(sumSq / windowLen);
    }

    // Normalise peaks and RMS to 0-1 range based on the global peak
    const globalPeak = peaks.reduce((max, v) => (v > max ? v : max), 0);
    if (globalPeak > 0) {
        for (let i = 0; i < actualBuckets; i++) {
            peaks[i] /= globalPeak;
            rms[i] /= globalPeak;
        }
    }

    const data: WaveformData = {
        clipId,
        path: audioPath,
        peaks,
        rms,
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        generatedAt: Date.now(),
    };

    // Persist to module cache
    cache.set(clipId, data);

    return data;
}

// ─── Rendering ─────────────────────────────────────────────────────────────

/**
 * Render waveform data onto a `<canvas>` element.
 *
 * Draws a vertically-mirrored waveform centred on the canvas height:
 *   - **RMS**: filled area (inner, lighter colour)
 *   - **Peaks**: envelope lines (outer, primary colour)
 *
 * The visible range is controlled by `startFraction` / `endFraction` (both
 * in 0-1 range), allowing trimmed clips to show only their active portion.
 *
 * @param canvas   Target canvas element (dimensions read from element).
 * @param data     Pre-extracted WaveformData.
 * @param options  Visual and range overrides.
 */
export function renderWaveformToCanvas(
    canvas: HTMLCanvasElement,
    data: WaveformData,
    options?: WaveformRenderOptions,
): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const startFrac = Math.max(0, Math.min(1, options?.startFraction ?? 0));
    const endFrac = Math.max(startFrac, Math.min(1, options?.endFraction ?? 1));
    const peakColor = options?.peakColor ?? DEFAULT_PEAK_COLOR;
    const rmsColor = options?.rmsColor ?? DEFAULT_RMS_COLOR;
    const bgColor = options?.backgroundColor ?? DEFAULT_BACKGROUND_COLOR;

    const w = canvas.width;
    const h = canvas.height;
    const midY = h / 2;

    // Clear canvas
    ctx.clearRect(0, 0, w, h);
    if (bgColor !== 'transparent') {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, w, h);
    }

    const totalBuckets = data.peaks.length;
    if (totalBuckets === 0) return;

    // Map the visible fraction range onto source bucket indices
    const srcStart = Math.floor(startFrac * totalBuckets);
    const srcEnd = Math.ceil(endFrac * totalBuckets);
    const srcLen = Math.max(1, srcEnd - srcStart);

    // ── Draw RMS filled area ───────────────────────────────────────────────
    ctx.fillStyle = rmsColor;
    ctx.beginPath();

    // Upper half (left → right)
    for (let x = 0; x < w; x++) {
        const bucketIdx = srcStart + Math.floor((x / w) * srcLen);
        const clamped = Math.min(bucketIdx, totalBuckets - 1);
        const rmsVal = data.rms[clamped];
        const y = midY - rmsVal * midY;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }

    // Lower half (right → left, mirrored)
    for (let x = w - 1; x >= 0; x--) {
        const bucketIdx = srcStart + Math.floor((x / w) * srcLen);
        const clamped = Math.min(bucketIdx, totalBuckets - 1);
        const rmsVal = data.rms[clamped];
        const y = midY + rmsVal * midY;
        ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.fill();

    // ── Draw peak envelope ─────────────────────────────────────────────────
    ctx.strokeStyle = peakColor;
    ctx.lineWidth = 1;

    // Upper envelope
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
        const bucketIdx = srcStart + Math.floor((x / w) * srcLen);
        const clamped = Math.min(bucketIdx, totalBuckets - 1);
        const peakVal = data.peaks[clamped];
        const y = midY - peakVal * midY;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Lower envelope (mirrored)
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
        const bucketIdx = srcStart + Math.floor((x / w) * srcLen);
        const clamped = Math.min(bucketIdx, totalBuckets - 1);
        const peakVal = data.peaks[clamped];
        const y = midY + peakVal * midY;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

// ─── Cache accessors ───────────────────────────────────────────────────────

/** Retrieve cached WaveformData by clip ID, or null if not cached. */
export function getCachedWaveform(clipId: string): WaveformData | null {
    return cache.get(clipId) ?? null;
}

/** Remove a single clip's waveform data from the cache. */
export function invalidateWaveform(clipId: string): void {
    cache.delete(clipId);
}

/** Clear the entire waveform cache. */
export function clearWaveformCache(): void {
    cache.clear();
}
