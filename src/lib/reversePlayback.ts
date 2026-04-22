/**
 * Reverse Playback Engine
 * Frame-accurate reverse video playback using requestAnimationFrame + canvas rendering.
 * HTML5 <video> elements don't support negative playbackRate, so we render
 * frames in reverse order by stepping currentTime backward and painting to canvas.
 */

export interface ReversePlayerOptions {
    video: HTMLVideoElement;
    canvas: HTMLCanvasElement;
    fps: number;
    startTime: number;    // Source start time (seconds)
    endTime: number;      // Source end time (seconds)
    speed?: number;       // Absolute speed (default 1.0)
    onFrame?: (currentTime: number) => void;
    onComplete?: () => void;
}

export class ReversePlaybackEngine {
    private video: HTMLVideoElement;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private startTime: number;
    private endTime: number;
    private speed: number;
    private onFrame?: (currentTime: number) => void;
    private onComplete?: () => void;
    private animFrameId: number | null = null;
    private currentTime: number;
    private isPlaying = false;
    private lastTimestamp: number = 0;

    constructor(options: ReversePlayerOptions) {
        this.video = options.video;
        this.canvas = options.canvas;
        this.ctx = this.canvas.getContext('2d')!;
        this.startTime = options.startTime;
        this.endTime = options.endTime;
        this.speed = options.speed || 1.0;
        this.onFrame = options.onFrame;
        this.onComplete = options.onComplete;
        this.currentTime = this.endTime; // Start at end for reverse

        // Match canvas to video dimensions
        this.canvas.width = this.video.videoWidth || 1920;
        this.canvas.height = this.video.videoHeight || 1080;
    }

    /** Start reverse playback */
    play(): void {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.lastTimestamp = performance.now();
        this.video.pause(); // Ensure native playback is paused
        this.tick(performance.now());
    }

    /** Pause reverse playback */
    pause(): void {
        this.isPlaying = false;
        if (this.animFrameId !== null) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }
    }

    /** Seek to a specific time (in source seconds) */
    seek(time: number): void {
        this.currentTime = Math.max(this.startTime, Math.min(time, this.endTime));
        this.video.currentTime = this.currentTime;
        this.renderFrame();
    }

    /** Clean up */
    destroy(): void {
        this.pause();
    }

    /** Get current reversed position as a normalized progress (0-1) */
    get progress(): number {
        const total = this.endTime - this.startTime;
        if (total <= 0) return 0;
        return 1 - ((this.currentTime - this.startTime) / total);
    }

    /** Render current video frame to canvas */
    private renderFrame(): void {
        if (!this.ctx || !this.video) return;
        try {
            this.ctx.drawImage(
                this.video,
                0, 0,
                this.canvas.width, this.canvas.height
            );
        } catch {
            // Video may not be ready yet
        }
    }

    /** Animation loop — steps backward through frames */
    private tick = (timestamp: number): void => {
        if (!this.isPlaying) return;

        const elapsed = (timestamp - this.lastTimestamp) / 1000; // Convert to seconds
        this.lastTimestamp = timestamp;

        // Step backward
        const step = elapsed * this.speed;
        this.currentTime -= step;

        // Check bounds
        if (this.currentTime <= this.startTime) {
            this.currentTime = this.startTime;
            this.video.currentTime = this.currentTime;
            this.renderFrame();
            this.isPlaying = false;
            this.onComplete?.();
            return;
        }

        // Seek the video element and render
        this.video.currentTime = this.currentTime;

        // Wait for the video to actually seek before rendering
        const onSeeked = () => {
            this.video.removeEventListener('seeked', onSeeked);
            this.renderFrame();
            this.onFrame?.(this.currentTime);

            if (this.isPlaying) {
                this.animFrameId = requestAnimationFrame(this.tick);
            }
        };

        this.video.addEventListener('seeked', onSeeked);
    };
}

/**
 * Utility: Convert a clip's frame range to reversed source time range.
 * When a clip has `reversed: true`, the source frames should be read
 * from trimEnd to trimStart instead of trimStart to trimEnd.
 */
export const getReversedSourceTime = (
    trimStartFrame: number,
    trimEndFrame: number,
    fps: number,
    currentClipFrame: number, // 0-based frame within clip
    clipDurationFrames: number
): number => {
    const normalizedProgress = currentClipFrame / clipDurationFrames;
    // Reverse: progress 0 = trimEnd, progress 1 = trimStart
    const reversedProgress = 1 - normalizedProgress;
    const trimStartS = trimStartFrame / fps;
    const trimEndS = trimEndFrame / fps;
    return trimStartS + reversedProgress * (trimEndS - trimStartS);
};

/**
 * Utility: Check if a given clip needs canvas-based reverse rendering
 * or can use standard video element playback.
 */
export const needsReverseEngine = (clip: { reversed?: boolean }): boolean => {
    return clip.reversed === true;
};
