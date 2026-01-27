import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2 } from 'lucide-react';

interface VideoPlayerProps {
    videoPath?: string;
    currentFrame: number;
    fps: number;
    onFrameChange: (frame: number) => void;
    onDurationChange?: (duration: number) => void;
    playbackSpeed?: number;  // Global playback speed
    clipSpeed?: number;       // Per-clip speed
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
    videoPath,
    currentFrame,
    fps,
    onFrameChange,
    onDurationChange,
    playbackSpeed = 1,
    clipSpeed = 1,
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(1);
    const [duration, setDuration] = useState(0);

    // Calculate effective playback speed (global * clip-specific)
    const effectiveSpeed = playbackSpeed * clipSpeed;

    // Sync video current time with frame
    useEffect(() => {
        if (videoRef.current && !isPlaying) {
            videoRef.current.currentTime = currentFrame / fps;
        }
    }, [currentFrame, fps, isPlaying]);

    // Apply playback speed to video element
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.playbackRate = effectiveSpeed;
        }
    }, [effectiveSpeed]);

    // Update frame from video playback
    useEffect(() => {
        if (!videoRef.current || !isPlaying) return;

        const interval = setInterval(() => {
            if (videoRef.current) {
                const newFrame = Math.floor(videoRef.current.currentTime * fps);
                onFrameChange(newFrame);
            }
        }, 1000 / fps);

        return () => clearInterval(interval);
    }, [isPlaying, fps, onFrameChange]);

    const togglePlayPause = () => {
        if (!videoRef.current) return;

        if (isPlaying) {
            videoRef.current.pause();
            setIsPlaying(false);
        } else {
            videoRef.current.play();
            setIsPlaying(true);
        }
    };

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            const vidDuration = videoRef.current.duration;
            setDuration(vidDuration);
            if (onDurationChange) {
                onDurationChange(vidDuration);
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
            {/* Video Container - Responsive with object-fit contain */}
            <div
                className="flex-1 relative bg-black flex items-center justify-center min-h-0 overflow-hidden cursor-pointer"
                onClick={togglePlayPause}
                title={isPlaying ? "Click to pause" : "Click to play"}
            >
                {videoPath ? (
                    <video
                        ref={videoRef}
                        src={`file://${videoPath}`}
                        className="w-full h-full object-contain"
                        style={{ maxHeight: '100%', maxWidth: '100%' }}
                        onLoadedMetadata={handleLoadedMetadata}
                        onEnded={() => setIsPlaying(false)}
                    />
                ) : (
                    <div className="text-white/40 text-sm">No video loaded</div>
                )}
            </div>

            {/* Transport Controls - Always visible */}
            <div className="bg-[#0a0a15] border-t border-white/10 p-4 flex-shrink-0">
                <div className="flex items-center justify-between gap-4">
                    {/* Playback Controls */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={skipBackward}
                            className="h-10 w-10 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                        >
                            <SkipBack size={18} />
                        </button>
                        <button
                            onClick={togglePlayPause}
                            disabled={!videoPath}
                            className="h-12 w-12 flex items-center justify-center bg-primary hover:bg-primary/80 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                        </button>
                        <button
                            onClick={skipForward}
                            className="h-10 w-10 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                        >
                            <SkipForward size={18} />
                        </button>
                    </div>

                    {/* Timecode */}
                    <div className="flex-1 text-center">
                        <div className="font-mono text-lg text-white/90">
                            {Math.floor(currentFrame / fps / 60).toString().padStart(2, '0')}:
                            {Math.floor((currentFrame / fps) % 60).toString().padStart(2, '0')}:
                            {(currentFrame % fps).toString().padStart(2, '0')}
                        </div>
                        <div className="text-xs text-white/40 mt-1">Frame {currentFrame}</div>
                    </div>

                    {/* Volume */}
                    <div className="flex items-center gap-2">
                        <Volume2 size={18} className="text-white/60" />
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={volume}
                            onChange={(e) => {
                                const newVolume = parseFloat(e.target.value);
                                setVolume(newVolume);
                                if (videoRef.current) {
                                    videoRef.current.volume = newVolume;
                                }
                            }}
                            className="w-24"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
