import { useRef, useEffect, useState } from 'react';

/**
 * Per-path cache of extracted filmstrip thumbnails.
 */
const filmstripCache = new Map<string, ImageBitmap[]>();

/**
 * useFilmstrip — extracts evenly-spaced video frame thumbnails
 * using an offscreen <video> element + canvas.drawImage.
 *
 * Returns a `canvasRef` to attach to a `<canvas>` element.
 */
export function useFilmstrip(
  clipPath: string,
  trimStart: number,
  trimEnd: number,
  width: number,
  height: number,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [thumbnails, setThumbnails] = useState<ImageBitmap[]>([]);

  // ── Extract thumbnails ────────────────────────────────────────────
  useEffect(() => {
    if (!clipPath || width <= 0 || height <= 0) return;

    // If already cached, reuse
    const cacheKey = `${clipPath}:${trimStart}:${trimEnd}`;
    if (filmstripCache.has(cacheKey)) {
      setThumbnails(filmstripCache.get(cacheKey)!);
      return;
    }

    let cancelled = false;
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'auto';
    video.src = `file://${clipPath}`;

    const thumbWidth = Math.max(40, height * (16 / 9)); // maintain rough 16:9 per thumb
    const numFrames = Math.max(1, Math.min(Math.floor(width / thumbWidth), 12));

    const extractFrames = async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error('Video load failed'));
          // Timeout after 5s
          setTimeout(() => reject(new Error('Video load timeout')), 5000);
        });

        if (cancelled) return;

        const duration = video.duration;
        if (!duration || !isFinite(duration)) return;

        // Convert trimStart / trimEnd from frames to seconds (rough: assume 30fps)
        const fps = 30;
        const startSec = trimStart / fps;
        const endSec = trimEnd > 0 ? trimEnd / fps : duration;
        const range = endSec - startSec;

        const bitmaps: ImageBitmap[] = [];

        for (let i = 0; i < numFrames; i++) {
          if (cancelled) break;
          const t = startSec + (range / numFrames) * (i + 0.5);
          video.currentTime = Math.min(t, duration - 0.01);

          await new Promise<void>((resolve) => {
            video.onseeked = () => resolve();
            // Safety timeout
            setTimeout(resolve, 1000);
          });

          if (cancelled) break;

          // Draw to an offscreen canvas and create bitmap
          const offscreen = document.createElement('canvas');
          const thumbH = height;
          const thumbW = Math.round(thumbH * (video.videoWidth / (video.videoHeight || 1)));
          offscreen.width = thumbW;
          offscreen.height = thumbH;
          const octx = offscreen.getContext('2d');
          if (octx) {
            octx.drawImage(video, 0, 0, thumbW, thumbH);
            try {
              const bmp = await createImageBitmap(offscreen);
              bitmaps.push(bmp);
            } catch {
              // Silently skip failed frame
            }
          }
        }

        if (!cancelled && bitmaps.length > 0) {
          filmstripCache.set(cacheKey, bitmaps);
          setThumbnails(bitmaps);
        }
      } catch {
        // Video not available in this environment — that's fine
      } finally {
        video.src = '';
        video.load(); // Release resources
      }
    };

    extractFrames();
    return () => { cancelled = true; };
  }, [clipPath, trimStart, trimEnd, width, height]);

  // ── Draw thumbnails to canvas ─────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || thumbnails.length === 0 || width <= 0) return;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    const thumbDisplayWidth = width / thumbnails.length;

    thumbnails.forEach((bmp, i) => {
      const x = i * thumbDisplayWidth;
      ctx.drawImage(bmp, x, 0, thumbDisplayWidth, height);
    });
  }, [thumbnails, width, height]);

  return canvasRef;
}
