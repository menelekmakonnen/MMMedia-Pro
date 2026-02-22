import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { AudioVisualizer } from './AudioVisualizer';
import { useProjectStore } from '../store/projectStore';
import { secondsToFrames } from '../lib/time';

interface VideoPlayerProps {
    videoPath?: string;
    currentFrame: number;
    fps: number;
    onFrameChange: (frame: number) => void;
    onDurationChange?: (duration: number) => void;
    playbackSpeed?: number;
    clipSpeed?: number;
    centerControls?: React.ReactNode;
    stopAtFrame?: number;
    zoomLevel?: number;
    zoomOrigin?: 'center' | 'top' | 'bottom' | 'left' | 'right';
    volume?: number;
    hideTransport?: boolean;
    bgOnly?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
    videoPath,
    currentFrame,
    fps,
    onFrameChange,
    onDurationChange,
    playbackSpeed = 1,
    clipSpeed = 1,
    volume = 1,
    centerControls,
    stopAtFrame,
    zoomLevel = 100,
    zoomOrigin = 'center',
    hideTransport = false,
    bgOnly = false,
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const bgVideoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [localVolume, setLocalVolume] = useState(1);
    const [duration, setDuration] = useState(0);

    const { settings } = useProjectStore();
    const backgroundFillMode = settings.backgroundFillMode;
    const aspectRatio = settings.aspectRatio;

    // Calculate effective playback speed (global * clip-specific)
    const effectiveSpeed = playbackSpeed * clipSpeed;

    useEffect(() => {
        setIsReady(false);
    }, [videoPath]);

    // Apply strictly controlled volume prop
    useEffect(() => {
        if (videoRef.current) {
            try {
                videoRef.current.volume = Math.max(0, Math.min(volume, 1));
            } catch (e) {
                console.warn("Failed to set volume on foreground video:", volume, e);
            }
        }
    }, [volume]);

    // Sync video current time with frame
    useEffect(() => {
        if (!isReady) return; // Wait for metadata

        if (videoRef.current) {
            const targetTime = currentFrame / fps;
            // Only sync if not playing OR if there is a significant deviation (e.g. clip change / seek)
            // Deviation > 0.5s usually means we swapped clips or user scrubbed far away
            if (!isPlaying || Math.abs(videoRef.current.currentTime - targetTime) > 0.5) {
                videoRef.current.currentTime = targetTime;

                // CRITICAL: If we were playing and swapped source (deviation), ensure we keep playing
                if (isPlaying) {
                    const playPromise = videoRef.current.play();
                    if (playPromise !== undefined) {
                        playPromise.catch(() => {
                            // Verify console logs for "DOMException: The play() request was interrupted"
                            // If it fails (e.g. not loaded), onLoadedMetadata should handle it or next tick
                        });
                    }
                }
            }
        }
        // Sync background video too
        if (bgVideoRef.current) {
            const targetTime = currentFrame / fps;
            if (!isPlaying || Math.abs(bgVideoRef.current.currentTime - targetTime) > 0.5) {
                bgVideoRef.current.currentTime = targetTime;
            }
        }
    }, [currentFrame, fps, isPlaying, videoPath, isReady]); // Added videoPath as dependency to ensure re-check on swap

    // Apply playback speed to video element
    useEffect(() => {
        // Chromium limits playbackRate to [0.0625, 16.0]. We clamp to [0.1, 16.0] to be safe.
        const safeSpeed = Math.max(0.1, Math.min(effectiveSpeed, 16.0));

        if (videoRef.current) {
            try {
                videoRef.current.playbackRate = safeSpeed;
            } catch (e) {
                console.warn("Failed to set playbackRate on foreground video:", safeSpeed, e);
            }
        }
        if (bgVideoRef.current) {
            try {
                bgVideoRef.current.playbackRate = safeSpeed;
            } catch (e) {
                console.warn("Failed to set playbackRate on background video:", safeSpeed, e);
            }
        }
    }, [effectiveSpeed]);

    // Update frame from video playback
    useEffect(() => {
        if (!videoRef.current || !isPlaying) return;

        const interval = setInterval(() => {
            if (!isReady) return; // Guard: Wait for metadata

            if (videoRef.current) {
                // Use robust conversion
                const newFrame = secondsToFrames(videoRef.current.currentTime, fps);

                // Check if we hit the limit
                if (stopAtFrame !== undefined && newFrame >= stopAtFrame) {
                    setIsPlaying(false);
                    videoRef.current.pause();
                    if (bgVideoRef.current) bgVideoRef.current.pause();
                    onFrameChange(stopAtFrame); // Snap to end
                    return;
                }
                onFrameChange(newFrame);
            }
        }, 1000 / fps);

        return () => clearInterval(interval);
    }, [isPlaying, fps, onFrameChange, stopAtFrame, isReady]);

    const togglePlayPause = () => {
        if (!videoRef.current) return;

        if (isPlaying) {
            videoRef.current.pause();
            if (bgVideoRef.current) bgVideoRef.current.pause();
            setIsPlaying(false);
        } else {
            videoRef.current.play();
            if (bgVideoRef.current) bgVideoRef.current.play();
            setIsPlaying(true);
        }
    };

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            const vidDuration = videoRef.current.duration;
            setDuration(vidDuration);

            // Mark as ready
            setIsReady(true);

            // Immediate initial seek on load to prevent frame 0 flash
            if (currentFrame > 0) {
                videoRef.current.currentTime = currentFrame / fps;
            }

            if (onDurationChange) {
                onDurationChange(vidDuration);
            }

            // If we are supposed to be playing, ensure we play
            if (isPlaying) {
                videoRef.current.play().catch(() => { });
            }
        }
    };

    const skipBackward = () => {
        const newFrame = Math.max(0, currentFrame - fps); // Skip 1 second
        onFrameChange(newFrame);
    };

    const skipForward = () => {
        const maxFrame = Math.floor(duration * fps);
        const newFrame = Math.min(maxFrame, currentFrame + fps);
        onFrameChange(newFrame);
    };

    return (
        <div className="flex flex-col h-full bg-black/50 rounded-lg overflow-hidden">
            {/* Video Container - Aspect ratio aware with background fill */}
            <div
                className="flex-1 relative flex items-center justify-center min-h-0 overflow-hidden cursor-pointer"
                style={{
                    aspectRatio: aspectRatio,
                    backgroundColor: backgroundFillMode === 'black' ? '#000000' : undefined
                }}
                onClick={togglePlayPause}
                title={isPlaying ? "Click to pause" : "Click to play"}
            >
                {videoPath ? (
                    <>
                        {/* Blurred background video */}
                        {(backgroundFillMode === 'blur' || bgOnly) && (
                            <video
                                ref={bgVideoRef}
                                src={`file://${videoPath}`}
                                className={`absolute inset-0 w-full h-full object-cover ${bgOnly ? 'blur-[80px] opacity-40 scale-110 saturate-150' : 'blur-2xl opacity-60'}`}
                                muted
                            />
                        )}

                        {/* Main video - centered with contain */}
                        {!bgOnly && (
                            <video
                                ref={videoRef}
                                src={`file://${videoPath}`}
                                className="relative w-full h-full object-contain z-10 transition-transform duration-300"
                                style={{
                                    transform: `scale(${zoomLevel / 100})`,
                                    transformOrigin: zoomOrigin
                                }}
                                onLoadedMetadata={handleLoadedMetadata}
                                onEnded={() => setIsPlaying(false)}
                            />
                        )}
                    </>
                ) : (
                    <div className="text-white/40 text-sm">No video loaded</div>
                )}
            </div>

            {/* Transport Controls - Optionally hidden */}
            {!hideTransport && !bgOnly && (
                <div className="bg-[#0a0a15] border-t border-white/10 px-4 py-2 flex-shrink-0">
                    <div className="flex items-center gap-4 h-12">
                        {/* Left: Playback Controls */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                                onClick={skipBackward}
                                title="Skip Backward 1s"
                                className="h-8 w-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded transition-colors"
                            >
                                <SkipBack size={16} />
                            </button>
                            <button
                                onClick={togglePlayPause}
                                disabled={!videoPath}
                                title={isPlaying ? "Pause" : "Play"}
                                className="h-10 w-10 flex items-center justify-center bg-primary hover:bg-primary/80 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                            </button>
                            <button
                                onClick={skipForward}
                                title="Skip Forward 1s"
                                className="h-8 w-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded transition-colors"
                            >
                                <SkipForward size={16} />
                            </button>
                        </div>

                        {/* Center: Custom Controls (Segment Selector) */}
                        <div className="flex-1 flex justify-center min-w-0">
                            {centerControls && (
                                <div className="w-full max-w-2xl">
                                    {centerControls}
                                </div>
                            )}
                        </div>

                        {/* Right: Info & Volume */}
                        <div className="flex items-center gap-4 flex-shrink-0">
                            {/* Audio Visualizer */}
                            <div className="h-8 w-24 bg-black/20 rounded overflow-hidden flex items-center border border-white/5 hidden xl:flex">
                                <AudioVisualizer
                                    videoElement={videoRef.current}
                                    width={96}
                                    height={32}
                                    barColor="#06b6d4"
                                />
                            </div>

                            {/* Timecode */}
                            <div className="text-right hidden lg:block">
                                <div className="font-mono text-sm text-white/90">
                                    {Math.floor(currentFrame / fps / 60).toString().padStart(2, '0')}:
                                    {Math.floor((currentFrame / fps) % 60).toString().padStart(2, '0')}:
                                    {(currentFrame % fps).toString().padStart(2, '0')}
                                </div>
                                <div className="text-[10px] text-white/40">Frame {currentFrame}</div>
                            </div>

                            {/* Volume */}
                            <div className="flex items-center gap-2">
                                <Volume2 size={16} className="text-white/60" />
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={localVolume}
                                    title="Volume"
                                    placeholder="Volume"
                                    onChange={(e) => {
                                        const newVolume = parseFloat(e.target.value);
                                        setLocalVolume(newVolume);
                                        if (videoRef.current) {
                                            videoRef.current.volume = newVolume;
                                        }
                                    }}
                                    className="w-16 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};
