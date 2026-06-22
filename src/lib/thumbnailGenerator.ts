/**
 * Thumbnail Generator — Extracts frames from video clips for filmstrip display.
 * Uses FFmpeg in the main process via IPC (when available), with fallback to
 * HTML5 video element + canvas capture in the renderer.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * The renderer-side canvas path (`generateThumbnailsCanvas`) is always
 * available and works with any video format the browser can decode. The IPC
 * path (to be wired up later) will use FFmpeg for format/codec coverage that
 * exceeds the browser's capabilities.
 *
 * Cache is a module-level singleton Map keyed by clipId.
 * ══════════════════════════════════════════════════════════════════════════════
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ThumbnailStrip {
    clipId: string;
    path: string;              // Source video path
    frames: string[];          // Base64 data URLs of extracted frames
    intervalFrames: number;    // Frames between each thumbnail
    width: number;             // Thumbnail width in px
    height: number;            // Thumbnail height in px
    generatedAt: number;       // Timestamp
}

export interface ThumbnailCache {
    strips: Map<string, ThumbnailStrip>;
}

// ─── Module-level cache (singleton) ────────────────────────────────────────

const cache: ThumbnailCache = { strips: new Map() };

// ─── Defaults ──────────────────────────────────────────────────────────────

const DEFAULT_WIDTH = 160;
const DEFAULT_HEIGHT = 90;
const DEFAULT_MAX_THUMBNAILS = 20;

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Convert a local filesystem path to a `file://` URL suitable for Electron's
 * renderer process (handles backslashes on Windows).
 */
function toFileUrl(filePath: string): string {
    return `file:///${filePath.replace(/\\/g, '/')}`;
}

/**
 * Wait for a video element to reach a specific `readyState`.
 * Resolves once the video has enough data for the current seek position.
 */
function waitForSeeked(video: HTMLVideoElement): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const onSeeked = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error('Video seek error')); };
        const cleanup = () => {
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onError);
        };
        video.addEventListener('seeked', onSeeked, { once: true });
        video.addEventListener('error', onError, { once: true });
    });
}

/**
 * Load a hidden video element and wait until metadata (duration, dimensions)
 * is available.
 */
function loadVideo(src: string): Promise<HTMLVideoElement> {
    return new Promise<HTMLVideoElement>((resolve, reject) => {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.preload = 'auto';
        // Prevent flash-of-video in the DOM
        video.style.position = 'fixed';
        video.style.opacity = '0';
        video.style.pointerEvents = 'none';
        video.style.width = '0';
        video.style.height = '0';

        const onLoaded = () => { cleanup(); resolve(video); };
        const onError = () => {
            cleanup();
            reject(new Error(`Failed to load video: ${src}`));
        };
        const cleanup = () => {
            video.removeEventListener('loadeddata', onLoaded);
            video.removeEventListener('error', onError);
        };

        video.addEventListener('loadeddata', onLoaded, { once: true });
        video.addEventListener('error', onError, { once: true });
        video.src = src;

        // Append briefly so the browser begins loading
        document.body.appendChild(video);
    });
}

/**
 * Clean up a video element: pause, revoke any object URL, remove from DOM.
 */
function disposeVideo(video: HTMLVideoElement): void {
    video.pause();
    video.removeAttribute('src');
    video.load(); // release internal resources
    if (video.parentNode) video.parentNode.removeChild(video);
}

// ─── Core generation ───────────────────────────────────────────────────────

/**
 * Generate a thumbnail strip from a video file using the renderer-side
 * HTML5 video element + canvas capture approach.
 *
 * This is the universal fallback — it works without IPC / FFmpeg but is
 * limited to codecs the browser can decode.
 *
 * @param videoPath       Local filesystem path to the video file.
 * @param clipId          Unique identifier for the clip (cache key).
 * @param durationFrames  Total duration of the clip in frames.
 * @param fps             Frame rate of the clip.
 * @param options         Optional overrides for thumbnail dimensions and count.
 * @returns               A ThumbnailStrip with base64-encoded frame data URLs.
 */
export async function generateThumbnailsCanvas(
    videoPath: string,
    clipId: string,
    durationFrames: number,
    fps: number,
    options?: {
        width?: number;
        height?: number;
        maxThumbnails?: number;
    },
): Promise<ThumbnailStrip> {
    const width = options?.width ?? DEFAULT_WIDTH;
    const height = options?.height ?? DEFAULT_HEIGHT;
    const maxThumbnails = options?.maxThumbnails ?? DEFAULT_MAX_THUMBNAILS;

    // Clamp thumbnail count to at least 1
    const count = Math.max(1, Math.min(maxThumbnails, durationFrames));
    const intervalFrames = Math.max(1, Math.floor(durationFrames / count));
    const durationSec = durationFrames / fps;

    const frames: string[] = [];
    let video: HTMLVideoElement | null = null;

    try {
        const fileUrl = toFileUrl(videoPath);
        video = await loadVideo(fileUrl);

        // Prepare an offscreen canvas for frame capture
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to acquire canvas 2D context');

        for (let i = 0; i < count; i++) {
            const frameIndex = i * intervalFrames;
            const seekTime = Math.min((frameIndex / fps), durationSec - 0.01);

            try {
                video.currentTime = Math.max(0, seekTime);
                await waitForSeeked(video);

                // Draw the current video frame scaled to thumbnail dimensions
                ctx.clearRect(0, 0, width, height);
                ctx.drawImage(video, 0, 0, width, height);

                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                frames.push(dataUrl);
            } catch {
                // Individual frame extraction failure — push empty string so
                // the strip length stays consistent (callers can check for '')
                frames.push('');
            }
        }
    } catch (err) {
        // Complete failure (e.g. video can't be loaded at all) — return empty
        console.warn('[ThumbnailGenerator] Canvas fallback failed:', err);
    } finally {
        if (video) disposeVideo(video);
    }

    const strip: ThumbnailStrip = {
        clipId,
        path: videoPath,
        frames,
        intervalFrames,
        width,
        height,
        generatedAt: Date.now(),
    };

    // Persist to module cache
    cache.strips.set(clipId, strip);

    return strip;
}

// ─── Cache accessors ───────────────────────────────────────────────────────

/** Retrieve a cached ThumbnailStrip by clip ID, or null if not cached. */
export function getCachedThumbnails(clipId: string): ThumbnailStrip | null {
    return cache.strips.get(clipId) ?? null;
}

/** Remove a single clip's thumbnails from the cache. */
export function invalidateThumbnails(clipId: string): void {
    cache.strips.delete(clipId);
}

/** Clear the entire thumbnail cache. */
export function clearThumbnailCache(): void {
    cache.strips.clear();
}
