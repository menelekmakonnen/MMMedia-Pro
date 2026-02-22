import React, { useState, useEffect, useRef } from 'react';
import { Layers, Video, Mic, Play, Pause, Magnet, SkipBack, SkipForward, Square, Repeat, Volume2 } from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import { useProjectStore } from '../../store/projectStore';
import { VideoPlayer } from '../../components/VideoPlayer';
import { Clip } from '../../store/clipStore'; // Ensure we import the correct type
import clsx from 'clsx';

const DEFAULT_SCALE = 0.5; // Pixels per frame

export const SequenceViewTab: React.FC = () => {
    const { clips, magnetizeClips, transitionStrategy } = useClipStore();
    const { settings } = useProjectStore();

    const [scale, setScale] = useState(DEFAULT_SCALE);
    const [currentGlobalFrame, setCurrentGlobalFrame] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [sequenceVolume, setSequenceVolume] = useState(1);

    // Resizable Panels
    const [topHeight, setTopHeight] = useState(settings.sequenceViewSplitHeight ?? 50);
    const [isResizing, setIsResizing] = useState(false);
    const { updateSettings } = useProjectStore();

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            // Calculate percentage based on window height relative to the tab content
            const newHeight = (e.clientY / window.innerHeight) * 100;
            setTopHeight(Math.max(20, Math.min(newHeight, 80)));
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            // Persist the height on mouse up to avoid spamming the store during drag
            if (topHeight !== settings.sequenceViewSplitHeight) {
                updateSettings({ sequenceViewSplitHeight: topHeight });
            }
        };

        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, topHeight, settings.sequenceViewSplitHeight, updateSettings]);

    // Group clips by track
    const tracks = React.useMemo(() => {
        const grouped: Record<number, Clip[]> = {};
        // Default tracks
        grouped[1] = []; // Video 1
        grouped[2] = []; // Video 2
        grouped[101] = []; // Audio 1

        clips.forEach(clip => {
            const trackId = clip.track || 1;
            if (!grouped[trackId]) grouped[trackId] = [];
            grouped[trackId].push(clip);
        });

        // Sort keys to render in order
        return Object.keys(grouped).map(Number).sort((a, b) => a - b).map(id => ({
            id,
            isAudio: id > 100,
            clips: grouped[id].sort((a, b) => a.startFrame - b.startFrame)
        }));
    }, [clips]);

    // Determines which clip is currently active under the playhead
    const activeVisualClip = React.useMemo(() => {
        // Simple priority: Highest video track wins
        // Filter for video tracks only (id < 100)
        const videoTracks = tracks.filter(t => !t.isAudio).reverse(); // Topmost track first

        for (const track of videoTracks) {
            const clip = track.clips.find(
                c => !c.disabled && currentGlobalFrame >= c.startFrame && currentGlobalFrame < c.endFrame
            );
            if (clip) return clip;
        }
        return null;
    }, [tracks, currentGlobalFrame]);

    // Compute max frame of the entire sequence
    const maxFrameId = React.useMemo(() => {
        const allClips = tracks.flatMap(t => t.clips).filter(c => !c.disabled);
        return allClips.reduce((max, clip) => Math.max(max, clip.endFrame), 0);
    }, [tracks]);

    // Handle playhead crossing sequence end
    useEffect(() => {
        if (isPlaying && currentGlobalFrame >= maxFrameId && maxFrameId > 0) {
            if (settings.sequenceLoop) {
                setCurrentGlobalFrame(0);
            } else {
                setCurrentGlobalFrame(maxFrameId);
                setIsPlaying(false);
            }
        }
    }, [currentGlobalFrame, maxFrameId, isPlaying, settings.sequenceLoop]);

    // Playback Loop (Smooth requestAnimationFrame implementation)
    useEffect(() => {
        if (!isPlaying) return;

        let animationFrameId: number;
        let lastTime = performance.now();
        const frameDuration = 1000 / settings.fps;

        const loop = (time: number) => {
            const deltaTime = time - lastTime;
            // When enough time has passed for one or more frames
            if (deltaTime >= frameDuration) {
                const framesToAdvance = Math.floor(deltaTime / frameDuration);
                setCurrentGlobalFrame(f => f + framesToAdvance);
                // Adjust lastTime to account for exact frame intervals to prevent drift
                lastTime = time - (deltaTime % frameDuration);
            }
            animationFrameId = requestAnimationFrame(loop);
        };

        animationFrameId = requestAnimationFrame(loop);

        return () => cancelAnimationFrame(animationFrameId);
    }, [isPlaying, settings.fps]);

    const handlePlayPause = () => {
        if (!isPlaying && currentGlobalFrame >= maxFrameId && maxFrameId > 0) {
            setCurrentGlobalFrame(0);
        }
        setIsPlaying(!isPlaying);
    };
    const handleStop = () => { setIsPlaying(false); setCurrentGlobalFrame(0); };

    const handleSkipNext = () => {
        // Find the next clip start frame after current frame
        const allClips = tracks.flatMap(t => t.clips).filter(c => !c.disabled);
        const nextStarts = allClips.map(c => c.startFrame).filter(start => start > currentGlobalFrame).sort((a, b) => a - b);
        if (nextStarts.length > 0) {
            setCurrentGlobalFrame(nextStarts[0]);
        }
    };

    const handleSkipPrev = () => {
        if (currentGlobalFrame === 0) return;
        // If we are slightly past the start of a clip (e.g. within 10 frames), snap to previous clip instead
        const threshold = 10;
        const allClips = tracks.flatMap(t => t.clips).filter(c => !c.disabled);
        const prevStarts = allClips.map(c => c.startFrame).filter(start => start < (currentGlobalFrame - threshold)).sort((a, b) => b - a); // descending

        if (prevStarts.length > 0) {
            setCurrentGlobalFrame(prevStarts[0]);
        } else {
            setCurrentGlobalFrame(0);
        }
    };

    // Calculate player props based on active clip
    const playerProps = activeVisualClip ? {
        videoPath: activeVisualClip.type === 'video' ? activeVisualClip.path : undefined,
        // Map global frame to local clip frame
        // local = (global - start) * speed + trimStart
        // Use trimStartFrame which represents the start of the visible segment in the source file
        currentFrame: Math.floor((currentGlobalFrame - activeVisualClip.startFrame) * activeVisualClip.speed) + (activeVisualClip.trimStartFrame || 0),
        fps: settings.fps,
        playbackSpeed: activeVisualClip.speed,
        volume: sequenceVolume,
        zoomLevel: activeVisualClip.zoomLevel,
        zoomOrigin: activeVisualClip.zoomOrigin,
    } : {
        currentFrame: 0,
        fps: settings.fps,
    };

    const containerRef = useRef<HTMLDivElement>(null);

    const handleTimelineClick = (e: React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const startX = 200; // Width of track header
        const clickX = e.clientX - rect.left - startX;

        // Convert pixels to frames
        // x = frame * scale => frame = x / scale
        const newFrame = Math.max(0, Math.floor((clickX + containerRef.current.scrollLeft) / scale));
        setCurrentGlobalFrame(newFrame);
    };

    // Calculate transition opacity for active clip
    const transitionFrames = Math.floor(settings.fps / 2); // 0.5s transition
    const clipOpacity = React.useMemo(() => {
        if (!activeVisualClip || transitionStrategy === 'cut') return 1;

        const isFirstClip = activeVisualClip.startFrame === 0;
        const framesFromStart = currentGlobalFrame - activeVisualClip.startFrame;
        const framesFromEnd = activeVisualClip.endFrame - currentGlobalFrame;

        if (framesFromStart < transitionFrames && !isFirstClip) {
            return framesFromStart / transitionFrames;
        } else if (framesFromEnd < transitionFrames) {
            return framesFromEnd / transitionFrames;
        }
        return 1;
    }, [activeVisualClip, currentGlobalFrame, transitionStrategy, transitionFrames]);

    return (
        <div className="flex h-full w-full flex-col bg-[#0a0a15] text-white overflow-hidden">
            {/* Top Half: Player Preview */}
            <div
                className="bg-black border-b border-white/10 relative p-4 flex flex-col min-h-0"
                style={{ height: `${topHeight}%` }}
            >
                {/* Visuals Container (Wrapper for opacity transition) */}
                <div className="flex-1 overflow-hidden relative flex flex-col transition-opacity duration-300" style={{ opacity: clipOpacity }}>

                    {/* Full-width Blurred Background */}
                    <div className="absolute inset-0 z-0">
                        <VideoPlayer
                            {...playerProps}
                            bgOnly={true}
                            hideTransport={true}
                            onFrameChange={() => { }}
                        />
                    </div>

                    {/* Main Video Box */}
                    <div className="flex-1 overflow-hidden relative flex items-center justify-center p-4 z-10 pointer-events-none">
                        <div
                            className="relative bg-black/80 border border-white/20 rounded-lg overflow-hidden flex items-center justify-center shadow-[0_0_50px_rgba(0,0,0,0.8)] h-full pointer-events-auto"
                            style={{
                                aspectRatio: settings.aspectRatio.replace(':', '/'),
                                maxHeight: '100%',
                                maxWidth: '100%'
                            }}
                        >
                            <VideoPlayer
                                {...playerProps}
                                hideTransport={true}
                                onFrameChange={() => { }} // Read-only player
                            />
                        </div>
                    </div>
                </div>

                {/* Mini Transport */}
                <div className="h-12 flex items-center justify-between px-4 mt-2 flex-shrink-0">
                    {/* Left: Volume */}
                    <div className="flex items-center gap-2 w-32">
                        <Volume2 size={16} className="text-white/60" />
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={sequenceVolume}
                            title="Sequence Volume"
                            onChange={(e) => setSequenceVolume(parseFloat(e.target.value))}
                            className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                        />
                    </div>

                    {/* Center: Playback Controls */}
                    <div className="flex items-center gap-4">
                        <button onClick={handleSkipPrev} className="p-2 hover:bg-white/10 rounded-full" title="Previous Clip">
                            <SkipBack size={16} />
                        </button>
                        <button onClick={handleStop} className="p-2 hover:bg-white/10 rounded-full text-white/70 hover:text-red-400" title="Stop">
                            <Square size={16} fill="currentColor" />
                        </button>
                        <button
                            onClick={handlePlayPause}
                            className="w-10 h-10 bg-primary hover:bg-primary/80 rounded-full flex items-center justify-center text-black shadow-lg shadow-primary/20"
                            title={isPlaying ? "Pause" : "Play"}
                        >
                            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
                        </button>
                        <button onClick={handleSkipNext} className="p-2 hover:bg-white/10 rounded-full" title="Next Clip">
                            <SkipForward size={16} />
                        </button>
                    </div>

                    {/* Right: Toggles */}
                    <div className="flex items-center gap-2 w-32 justify-end">
                        <button
                            onClick={magnetizeClips}
                            title="Magnetize (Remove Gaps)"
                            className="p-2 hover:bg-white/10 rounded-full text-blue-400 transition-colors"
                        >
                            <Magnet size={16} />
                        </button>
                        <div className="w-px h-4 bg-white/10 mx-1" />
                        <button
                            onClick={() => updateSettings({ sequenceLoop: !settings.sequenceLoop })}
                            title={settings.sequenceLoop ? "Looping Enabled" : "Looping Disabled"}
                            className={`p-2 rounded-full transition-colors ${settings.sequenceLoop ? 'text-primary bg-primary/20' : 'text-white/40 hover:text-white/80 hover:bg-white/10'}`}
                        >
                            <Repeat size={16} />
                        </button>
                    </div>
                </div>

                {/* Sequence Timecode - Single line centered beneath transport */}
                <div className="text-[11px] font-mono text-white/40 text-center pb-2 z-10 flex-shrink-0 mt-1">
                    SEQ TC: {Math.floor(currentGlobalFrame / settings.fps / 60).toString().padStart(2, '0')}:{Math.floor((currentGlobalFrame / settings.fps) % 60).toString().padStart(2, '0')}:{(currentGlobalFrame % settings.fps).toString().padStart(2, '0')} | Frame {currentGlobalFrame}
                </div>
            </div>

            {/* Resize Handle */}
            <div
                className="h-1 bg-[#131320] hover:bg-accent/50 cursor-row-resize transition-colors z-30 flex items-center justify-center group flex-shrink-0"
                onMouseDown={() => setIsResizing(true)}
            >
                <div className="w-8 h-0.5 bg-white/10 group-hover:bg-accent/50 rounded-full" />
            </div>

            {/* Bottom Half: Sequence Timeline */}
            <div className="flex-1 overflow-hidden flex flex-col relative">
                {/* Toolbar */}
                <div className="h-10 border-b border-white/10 flex items-center px-4 justify-between bg-[#0d0d1a] z-20 relative">
                    <div className="flex items-center gap-4">
                        <h2 className="text-sm font-semibold text-white/80 flex items-center gap-2">
                            <Layers size={16} className="text-primary" />
                            Sequence 01
                        </h2>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                        <label htmlFor="scale-slider" className="text-white/40">Scale:</label>
                        <input
                            id="scale-slider"
                            type="range"
                            min="0.1"
                            max="2"
                            step="0.1"
                            value={scale}
                            onChange={(e) => setScale(parseFloat(e.target.value))}
                            className="w-20 accent-primary"
                        />
                    </div>
                </div>

                {/* Timeline Area */}
                <div className="flex-1 overflow-hidden flex flex-col relative" ref={containerRef}>
                    {/* Time Ruler */}
                    <div
                        className="h-8 border-b border-white/5 bg-[#080812] flex items-center overflow-hidden shrink-0 ml-[200px]"
                        onClick={handleTimelineClick}
                    >
                        <div className="relative h-full w-full">
                            {Array.from({ length: 100 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="absolute bottom-0 border-l border-white/10 h-3 text-[9px] text-white/30 pl-1 select-none"
                                    style={{ left: (i * settings.fps * 10) * scale }} // Mark every 10 seconds? No, let's say every second for now
                                >
                                    {i * 10}s
                                </div>
                            ))}
                            {/* Playhead Indicator in Ruler */}
                            <div
                                className="absolute top-0 bottom-0 w-4 -ml-2 flex justify-center cursor-pointer z-30"
                                style={{ left: currentGlobalFrame * scale }}
                            >
                                <div className="w-0.5 h-full bg-red-500" />
                                <div className="absolute top-0 w-3 h-3 bg-red-500 transform rotate-45 -mt-1.5 rounded-sm" />
                            </div>
                        </div>
                    </div>

                    {/* Tracks Container */}
                    <div className="flex-1 flex flex-col min-h-0 overflow-x-auto relative bg-[#080812]">
                        <div className="min-w-full relative flex-1 flex flex-col">
                            {tracks.map(track => (
                                <div key={track.id} className="flex flex-1 min-h-[40px] bg-[#0e0e1b] border-b border-white/5 relative group transition-all">
                                    {/* Track Header (Sticky) */}
                                    <div className="w-[200px] bg-[#111122] border-r border-white/5 flex flex-col p-3 gap-2 flex-shrink-0 sticky left-0 z-10 shadow-lg top-0">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-white/70 flex items-center gap-2">
                                                {track.isAudio ? <Mic size={12} className="text-pink-400" /> : <Video size={12} className="text-blue-400" />}
                                                Track {track.id}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Track Lane */}
                                    <div
                                        className="flex-1 relative min-w-0"
                                        style={{
                                            backgroundSize: '20px 20px',
                                            backgroundImage: 'radial-gradient(circle, #ffffff05 1px, transparent 1px)'
                                        }}
                                        onClick={handleTimelineClick}
                                    >
                                        {track.clips.map(clip => {
                                            const duration = clip.endFrame - clip.startFrame;
                                            const width = duration * scale;
                                            const left = clip.startFrame * scale;

                                            return (
                                                <div
                                                    key={clip.id}
                                                    className={clsx(
                                                        "absolute top-2 bottom-2 rounded border text-xs flex flex-col justify-center px-2 truncate overflow-hidden cursor-pointer hover:brightness-110 shadow-lg transition-colors border-l-4",
                                                        activeVisualClip?.id === clip.id ? "ring-2 ring-white/50" : "",
                                                        clip.disabled ? "opacity-30 grayscale border-dashed" : (
                                                            clip.type === 'video' ? 'bg-blue-900/40 border-l-blue-500 border-y-blue-500/30 border-r-blue-500/30 text-blue-200' :
                                                                clip.type === 'audio' ? 'bg-pink-900/40 border-l-pink-500 border-y-pink-500/30 border-r-pink-500/30 text-pink-200' :
                                                                    'bg-gray-800/40 border-gray-600'
                                                        )
                                                    )}
                                                    style={{ left, width }}
                                                    title={`${clip.filename} (${duration}f)`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        // Jump to start of clip
                                                        setCurrentGlobalFrame(clip.startFrame);
                                                    }}
                                                >
                                                    <span className="font-semibold truncate">{clip.filename}</span>
                                                    <span className="text-[9px] opacity-60">Dur: {duration}f</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}

                            {/* Full Height Playhead Line */}
                            <div
                                className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none z-20"
                                style={{ left: 200 + (currentGlobalFrame * scale) }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div >
    );
};
