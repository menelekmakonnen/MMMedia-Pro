import { useRef, useEffect, useState, useCallback } from 'react';

/**
 * Per-path cache of decoded & downsampled waveform data.
 * Shared across all hook instances so re-mounts don't re-decode.
 */
const waveformCache = new Map<string, Float32Array>();

/**
 * useWaveform — decodes audio from a file path via IPC, downsamples
 * to fit the given width, and draws a mirrored waveform on a canvas.
 *
 * Returns a `canvasRef` to attach to a `<canvas>` element.
 *
 * Pattern adapted from the existing TimelineWaveform.tsx component.
 */
export function useWaveform(
  clipPath: string,
  trimStart: number,
  trimEnd: number,
  width: number,
  height: number,
  color: string = '#ec4899',
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<Float32Array | null>(null);
  const [sampleRate, setSampleRate] = useState(44100);

  // ── Decode audio (once per path) ──────────────────────────────────
  useEffect(() => {
    if (!clipPath || width <= 0) return;

    if (waveformCache.has(clipPath)) {
      setData(waveformCache.get(clipPath)!);
      return;
    }

    let cancelled = false;

    const decode = async () => {
      try {
        const ipc = (window as any).ipcRenderer;
        if (!ipc?.readFileBuffer) return;

        const result = await ipc.readFileBuffer(clipPath);
        if (cancelled) return;

        if (!result.success || !result.buffer) {
          setData(null);
          waveformCache.set(clipPath, new Float32Array(0));
          return;
        }

        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const audioBuffer = await audioCtx.decodeAudioData(result.buffer.buffer);
        if (cancelled) { audioCtx.close(); return; }

        setSampleRate(audioBuffer.sampleRate);

        // Downsample to 1000 peak bins
        const raw = audioBuffer.getChannelData(0);
        const bins = 1000;
        const blockSize = Math.floor(raw.length / bins);
        const peaks = new Float32Array(bins);

        for (let i = 0; i < bins; i++) {
          const start = i * blockSize;
          let sum = 0;
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(raw[start + j]);
          }
          peaks[i] = sum / blockSize;
        }

        // Normalise in-place
        let max = 0;
        for (let i = 0; i < peaks.length; i++) {
          if (peaks[i] > max) max = peaks[i];
        }
        if (max > 0) {
          for (let i = 0; i < peaks.length; i++) {
            peaks[i] = peaks[i] / max;
          }
        }

        if (!cancelled) {
          waveformCache.set(clipPath, peaks);
          setData(peaks);
        }

        audioCtx.close();
      } catch {
        if (!cancelled) {
          setData(null);
        }
      }
    };

    decode();
    return () => { cancelled = true; };
  }, [clipPath, width]);

  // ── Draw on canvas ────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.length === 0 || width <= 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    // Only draw the trimmed portion
    const totalSamples = data.length;
    // trimStart/trimEnd are frame indices — we need them as a proportion.
    // If both are 0, draw everything.
    let sampleStart = 0;
    let sampleEnd = totalSamples;

    if (trimEnd > trimStart && trimEnd > 0) {
      // Approximate: treat data as uniformly spanning the source duration
      const ratio = totalSamples;
      const totalFrames = trimEnd; // rough upper bound
      sampleStart = Math.floor((trimStart / totalFrames) * ratio);
      sampleEnd = Math.floor((trimEnd / totalFrames) * ratio);
      sampleStart = Math.max(0, Math.min(sampleStart, totalSamples - 1));
      sampleEnd = Math.max(sampleStart + 1, Math.min(sampleEnd, totalSamples));
    }

    const sliceLen = sampleEnd - sampleStart;
    const barWidth = width / sliceLen;

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.6;

    for (let i = 0; i < sliceLen; i++) {
      const val = data[sampleStart + i];
      const barH = val * height * 0.9;
      const x = i * barWidth;
      const y = (height - barH) / 2;
      ctx.fillRect(x, y, Math.max(barWidth - 0.5, 0.5), barH);
    }

    ctx.globalAlpha = 1;
  }, [data, width, height, trimStart, trimEnd, color]);

  return canvasRef;
}
