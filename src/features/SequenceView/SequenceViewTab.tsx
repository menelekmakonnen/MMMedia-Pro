import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Layers, Video, Mic, Play, Pause, Magnet, SkipBack, SkipForward, Square, Repeat, Volume2, VolumeX, MonitorSmartphone, Eye, EyeOff, Lock, Unlock, Link2 } from 'lucide-react';
import { useClipStore, Clip } from '../../store/clipStore';
import { useProjectStore } from '../../store/projectStore';
import { useUserStore } from '../../store/userStore';
import { GridPlayer } from '../../components/GridPlayer';
import { GridClip } from '../../types';
import { DEFAULT_FPS } from '../../lib/time';

import clsx from 'clsx';

const DEFAULT_SCALE = 0.5; // Pixels per frame

export const SequenceViewTab: React.FC = () => {
    const { clips, magnetizeClips, transitionStrategy, trackMutes, trackVolumes, setTrackMuted, setTrackVolume, updateClip } = useClipStore();
    const { settings } = useProjectStore();
    const { timecodeFormat, masterVolume, isMasterMuted, setMasterVolume, setIsMasterMuted } = useUserStore();

    const [scale, setScale] = useState(DEFAULT_SCALE);

    // Track-level controls: lock, visibility, solo
    const [trackLocked, setTrackLocked] = useState<Record<number, boolean>>({});
    const [trackHidden, setTrackHidden] = useState<Record<number, boolean>>({});
    const [trackSolo, setTrackSolo] = useState<Record<number, boolean>>({});
    const toggleTrackLock = (id: number) => setTrackLocked(p => ({ ...p, [id]: !p[id] }));
    const toggleTrackHidden = (id: number) => setTrackHidden(p => ({ ...p, [id]: !p[id] }));
    const toggleTrackSolo = (id: number) => setTrackSolo(p => ({ ...p, [id]: !p[id] }));

    // ── Audio clip drag state ──
    const [dragClipId, setDragClipId] = useState<string | null>(null);
    const dragStartXRef = useRef(0);
    const dragOrigStartFrameRef = useRef(0);
    const dragOrigEndFrameRef = useRef(0);
    const [currentGlobalFrame, setCurrentGlobalFrame] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [showVolumeBar, setShowVolumeBar] = useState(false);
    const volumeBarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Double-buffered video refs (TrailerPlayer-style smooth playback)
    const videoARef = useRef<HTMLVideoElement>(null);
    const videoBRef = useRef<HTMLVideoElement>(null);
    const activeBufferRef = useRef<'A' | 'B'>('A');
    const rafRef = useRef<number>(0);
    const lastClipIdRef = useRef<string | null>(null);


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

    // ── Audio clip drag handlers ──
    useEffect(() => {
        if (!dragClipId) return;
        const handleDragMove = (e: MouseEvent) => {
            const dx = e.clientX - dragStartXRef.current;
            const frameDelta = Math.round(dx / scale);
            const newStart = Math.max(0, dragOrigStartFrameRef.current + frameDelta);
            const duration = dragOrigEndFrameRef.current - dragOrigStartFrameRef.current;
            updateClip(dragClipId, { startFrame: newStart, endFrame: newStart + duration });
        };
        const handleDragEnd = () => setDragClipId(null);
        window.addEventListener('mousemove', handleDragMove);
        window.addEventListener('mouseup', handleDragEnd);
        return () => {
            window.removeEventListener('mousemove', handleDragMove);
            window.removeEventListener('mouseup', handleDragEnd);
        };
    }, [dragClipId, scale, updateClip]);

    // Group clips by track + generate shadow audio blocks for video clips
    const tracks = React.useMemo(() => {
        const grouped: Record<number, Clip[]> = {};
        grouped[1] = [];
        grouped[2] = []; // Audio 1 — linked audio from video clips
        grouped[101] = []; // Audio 2 — background music

        clips.forEach(clip => {
            const trackId = clip.track || 1;
            if (!grouped[trackId]) grouped[trackId] = [];
            grouped[trackId].push(clip);
        });

        // Generate shadow audio blocks on Audio 1 (track 2) for each video clip on track 1
        const videoClips = grouped[1]?.filter(c => c.type === 'video') || [];
        const shadowAudio: Clip[] = videoClips.map(vc => ({
            ...vc,
            id: `shadow-audio-${vc.id}`,
            type: 'audio' as const,
            track: 2,
            volume: vc.volume ?? 100,
            isMuted: vc.isMuted ?? false,
            origin: 'auto' as const,
            _shadowOf: vc.id, // link marker
        } as Clip & { _shadowOf: string }));
        // Merge shadow audio with any existing track-2 clips
        grouped[2] = [...(grouped[2] || []), ...shadowAudio];

        const trackOrder = [1, 2, 101, ...Object.keys(grouped).map(Number).filter(id => id !== 1 && id !== 2 && id !== 101).sort((a,b) => a-b)];
        const uniqueOrder = [...new Set(trackOrder)].filter(id => grouped[id]);

        return uniqueOrder.map(id => ({
            id,
            label: id === 1 ? 'V1' : id === 2 ? 'A1' : id === 101 ? 'A2' : id < 100 ? `V${id}` : `A${id - 100 + 1}`,
            isAudio: id === 2 || id >= 100,
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

    // ========= DOUBLE-BUFFERED PLAYBACK ENGINE WITH REVERSE SUPPORT =========
    const fps = settings.fps || DEFAULT_FPS;
    const lastRafTimeRef = useRef(0);

    const syncVideoToClip = useCallback((clip: Clip | null, vid: HTMLVideoElement | null) => {
        if (!vid || !clip || clip.type !== 'video') return;
        const src = `file://${clip.path}`;
        if (vid.getAttribute('src') !== src) vid.src = src;
        // A1 track controls govern embedded video audio
        const audio1Muted = trackMutes[2] ?? false;
        const audio1Vol = (trackVolumes[2] ?? 100) / 100;
        vid.volume = (isMasterMuted || audio1Muted) ? 0 : masterVolume * audio1Vol;
        // For reversed clips we DON'T use native playback — we step backwards manually
        if (!clip.reversed) {
            vid.playbackRate = Math.max(0.1, Math.min(clip.speed || 1, 16));
        } else {
            vid.playbackRate = 1; // paused stepping, rate doesn't matter
        }
        // Seek to start position: reversed clips start at trimEnd, forward clips at trimStart
        const targetSec = clip.reversed ? (clip.trimEndFrame / fps) : (clip.trimStartFrame / fps);
        if (Math.abs(vid.currentTime - targetSec) > 0.05) vid.currentTime = targetSec;
    }, [fps, masterVolume, isMasterMuted, trackMutes, trackVolumes]);

    useEffect(() => {
        if (!activeVisualClip || activeVisualClip.type !== 'video') return;
        if (lastClipIdRef.current === activeVisualClip.id) return;
        lastClipIdRef.current = activeVisualClip.id;
        activeBufferRef.current = activeBufferRef.current === 'A' ? 'B' : 'A';
        const activeVid = activeBufferRef.current === 'A' ? videoARef.current : videoBRef.current;
        const bgVid = activeBufferRef.current === 'A' ? videoBRef.current : videoARef.current;
        if (bgVid) bgVid.pause();
        syncVideoToClip(activeVisualClip, activeVid);
        // Only auto-play for forward clips; reversed clips use manual seeking
        if (isPlaying && activeVid && !activeVisualClip.reversed) {
            activeVid.play().catch(() => {});
        }
    }, [activeVisualClip?.id, isPlaying, syncVideoToClip]);

    useEffect(() => {
        if (!isPlaying) { videoARef.current?.pause(); videoBRef.current?.pause(); return; }
        lastRafTimeRef.current = performance.now();

        const loop = (now: number) => {
            const clip = activeVisualClip;
            if (!clip || clip.type !== 'video') { setCurrentGlobalFrame(f => f + 1); rafRef.current = requestAnimationFrame(loop); return; }
            const activeVid = activeBufferRef.current === 'A' ? videoARef.current : videoBRef.current;
            if (!activeVid) { rafRef.current = requestAnimationFrame(loop); return; }

            const clipDurFrames = clip.endFrame - clip.startFrame;
            const trimStart = clip.trimStartFrame / fps;
            const trimEnd = clip.trimEndFrame / fps;
            const speed = clip.speed || 1;

            if (clip.reversed) {
                // REVERSE PLAYBACK: manually step currentTime backwards each frame
                const dt = (now - lastRafTimeRef.current) / 1000; // seconds since last frame
                lastRafTimeRef.current = now;
                const step = dt * speed; // how many seconds of source to rewind
                activeVid.pause(); // keep paused, we're seeking manually
                const newTime = activeVid.currentTime - step;

                if (newTime <= trimStart) {
                    // Clip done
                    setCurrentGlobalFrame(clip.endFrame);
                } else {
                    activeVid.currentTime = newTime;
                    const elapsed = Math.max(0, trimEnd - newTime) * fps / speed;
                    setCurrentGlobalFrame(clip.startFrame + Math.min(Math.floor(elapsed), clipDurFrames));
                }
            } else {
                // FORWARD PLAYBACK: native play, read currentTime
                if (activeVid.paused && activeVid.readyState >= 2) activeVid.play().catch(() => {});
                const elapsed = Math.max(0, activeVid.currentTime - trimStart) * fps / speed;
                if (elapsed >= clipDurFrames || activeVid.ended || activeVid.currentTime >= trimEnd) {
                    setCurrentGlobalFrame(clip.endFrame);
                } else {
                    setCurrentGlobalFrame(clip.startFrame + Math.min(Math.floor(elapsed), clipDurFrames));
                }
            }
            rafRef.current = requestAnimationFrame(loop);
        };

        const activeVid = activeBufferRef.current === 'A' ? videoARef.current : videoBRef.current;
        if (activeVid && activeVisualClip?.type === 'video') {
            const audio1Muted = trackMutes[2] ?? false;
            const audio1Vol = (trackVolumes[2] ?? 100) / 100;
            activeVid.volume = (isMasterMuted || audio1Muted) ? 0 : masterVolume * audio1Vol;
            if (!activeVisualClip.reversed) activeVid.play().catch(() => {});
        }
        rafRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(rafRef.current);
    }, [isPlaying, activeVisualClip, fps, masterVolume, isMasterMuted]);

    // Background audio clips: real audio clips on track 101+ (NOT shadow audio on track 2)
    const bgAudioClips = React.useMemo(() => {
        return clips.filter(c => c.type === 'audio' && (c.track || 0) >= 101);
    }, [clips]);

    // Refs for each background audio element
    const bgAudioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

    // Background music sync — per-frame volume, position, play/pause
    // Audio elements are rendered in JSX below (DOM-attached, like <video> elements)
    useEffect(() => {
        bgAudioClips.forEach(clip => {
            const audio = bgAudioRefs.current[clip.id];
            if (!audio) return;

            const trackId = clip.track || 101;
            const trackMuted = trackMutes[trackId] ?? false;

            // Volume — include per-track volume slider (trackVolumes)
            const trackVol = (trackVolumes[trackId] ?? 100) / 100;
            const clipVol = (clip.volume !== undefined ? clip.volume : 100) / 100;
            audio.volume = (isMasterMuted || trackMuted) ? 0 : masterVolume * trackVol * clipVol;

            // Sync position — audio clips may have their own startFrame offset on the timeline
            const trimStartSec = (clip.trimStartFrame || 0) / fps;
            const clipStartFrame = clip.startFrame || 0;
            const clipEndFrame = clip.endFrame || 0;

            if (isPlaying && !trackMuted && currentGlobalFrame >= clipStartFrame && currentGlobalFrame < clipEndFrame) {
                const elapsedFrames = currentGlobalFrame - clipStartFrame;
                const expectedSec = trimStartSec + (elapsedFrames / fps);
                if (Math.abs(audio.currentTime - expectedSec) > 0.3) audio.currentTime = expectedSec;
                // Only attempt play if audio has loaded enough data
                if (audio.paused && audio.readyState >= 2) {
                    audio.play().catch(e => console.warn(`[SequenceView] A2 play failed:`, e));
                }
            } else {
                if (!audio.paused) audio.pause();
            }
        });
    }, [isPlaying, currentGlobalFrame, bgAudioClips, masterVolume, isMasterMuted, fps, trackMutes, trackVolumes]);

    const handlePlayPause = () => {
        if (!isPlaying && currentGlobalFrame >= maxFrameId && maxFrameId > 0) setCurrentGlobalFrame(0);
        setIsPlaying(!isPlaying);
    };
    const handleStop = () => { setIsPlaying(false); setCurrentGlobalFrame(0); };
    const handleSkipNext = () => {
        const allClips = tracks.flatMap(t => t.clips).filter(c => !c.disabled);
        const ns = allClips.map(c => c.startFrame).filter(s => s > currentGlobalFrame).sort((a, b) => a - b);
        if (ns.length > 0) setCurrentGlobalFrame(ns[0]);
    };
    const handleSkipPrev = () => {
        if (currentGlobalFrame === 0) return;
        const allClips = tracks.flatMap(t => t.clips).filter(c => !c.disabled);
        const ps = allClips.map(c => c.startFrame).filter(s => s < (currentGlobalFrame - 10)).sort((a, b) => b - a);
        if (ps.length > 0) setCurrentGlobalFrame(ps[0]); else setCurrentGlobalFrame(0);
    };

    const isGrid = activeVisualClip?.type === 'grid';
    const isActA = activeBufferRef.current === 'A';
    const clipProgress = activeVisualClip ? (currentGlobalFrame - activeVisualClip.startFrame) / Math.max(1, activeVisualClip.endFrame - activeVisualClip.startFrame) : 0;
    const currentZoom = activeVisualClip?.zoomStart !== undefined && activeVisualClip?.zoomEnd !== undefined
        ? activeVisualClip.zoomStart + (clipProgress * (activeVisualClip.zoomEnd - activeVisualClip.zoomStart))
        : (activeVisualClip?.zoomLevel || 100);

    // Compute transition style for active clip
    const clipLocalFrame = activeVisualClip ? currentGlobalFrame - activeVisualClip.startFrame : 0;
    const transitionStyle = { transform: '', opacity: 1, zIndex: 20 };

    // Vertical video: use object-cover when zoomed
    const activeOrientation = activeVisualClip?.sourceOrientation || 'horizontal';
    const seqObjectFit = (activeVisualClip?.zoomStart || activeVisualClip?.zoomEnd) && activeOrientation === 'vertical'
        ? 'object-cover' : 'object-contain';

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
        <div className="flex h-full w-full flex-col bg-transparent text-white overflow-hidden">

            {/* Top Half: Player Preview */}
            <div
                className="bg-black/60 backdrop-blur-sm border-b border-white/10 relative p-4 flex flex-col min-h-0"
                style={{ height: `${topHeight}%` }}
            >
                {/* Visuals Container */}
                <div className="flex-1 overflow-hidden relative flex flex-col transition-opacity duration-300" style={{ opacity: clipOpacity }}>

                    {/* Main Video Box */}
                    <div className="flex-1 relative flex items-center justify-center p-4 z-10 overflow-hidden">
                        <div
                            className="relative bg-black/80 border border-white/20 rounded-lg overflow-clip flex items-center justify-center shadow-[0_0_50px_rgba(0,0,0,0.8)] h-full"
                            style={{
                                aspectRatio: settings.aspectRatio.replace(':', '/'),
                                maxHeight: '100%',
                                maxWidth: '100%'
                            }}
                            onClick={handlePlayPause}
                            onWheel={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const delta = e.deltaY > 0 ? -0.05 : 0.05;
                                const newVol = Math.max(0, Math.min(1, masterVolume + delta));
                                setMasterVolume(newVol);
                                if (isMasterMuted && newVol > 0) setIsMasterMuted(false);
                                setShowVolumeBar(true);
                                if (volumeBarTimeoutRef.current) clearTimeout(volumeBarTimeoutRef.current);
                                volumeBarTimeoutRef.current = setTimeout(() => setShowVolumeBar(false), 1500);
                            }}
                        >
                            {isGrid && activeVisualClip ? (
                                <GridPlayer
                                    grid={activeVisualClip as GridClip}
                                    currentFrame={Math.floor((currentGlobalFrame - activeVisualClip.startFrame) * activeVisualClip.speed) + (activeVisualClip.trimStartFrame || 0)}
                                    isPlaying={isPlaying}
                                    onFrameChange={() => {}}
                                />
                            ) : activeVisualClip?.type === 'video' ? (
                                <>
                                    <video ref={videoARef} src={activeVisualClip ? `file://${activeVisualClip.path}` : ''}
                                        className={clsx(`absolute inset-0 w-full h-full ${seqObjectFit} transition-none`,
                                            isActA ? "z-20 opacity-100" : "z-0 opacity-0")}
                                        style={{
                                            transform: `scale(${currentZoom / 100}) ${isActA ? transitionStyle.transform : ''}`,
                                            transformOrigin: activeVisualClip?.zoomOrigin || 'center',
                                            opacity: isActA ? transitionStyle.opacity : 0,
                                        }}
                                        playsInline muted={isMasterMuted || (trackMutes[2] ?? false)} />
                                    <video ref={videoBRef} src={activeVisualClip ? `file://${activeVisualClip.path}` : ''}
                                        className={clsx(`absolute inset-0 w-full h-full ${seqObjectFit} transition-none`,
                                            !isActA ? "z-20 opacity-100" : "z-0 opacity-0")}
                                        style={{
                                            transform: `scale(${currentZoom / 100}) ${!isActA ? transitionStyle.transform : ''}`,
                                            transformOrigin: activeVisualClip?.zoomOrigin || 'center',
                                            opacity: !isActA ? transitionStyle.opacity : 0,
                                        }}
                                        playsInline muted={isMasterMuted || (trackMutes[2] ?? false)} />
                                </>
                            ) : (
                                <div className="text-white/30 text-sm">No clip at playhead</div>
                            )}
                            {/* Volume Overlay Bar */}
                            {showVolumeBar && (
                                <div className="absolute top-3 right-3 z-30 flex flex-col items-center gap-1 bg-black/60 backdrop-blur-md rounded-lg px-2 py-2 border border-white/10 transition-opacity duration-300"
                                    style={{ opacity: showVolumeBar ? 1 : 0 }}>
                                    <div className="text-[9px] font-bold text-white/70 uppercase tracking-wider">Vol</div>
                                    <div className="relative w-1.5 h-16 bg-white/10 rounded-full overflow-hidden">
                                        <div className="absolute bottom-0 w-full rounded-full transition-all duration-150"
                                            style={{
                                                height: `${Math.round((isMasterMuted ? 0 : masterVolume) * 100)}%`,
                                                background: masterVolume > 0.7 ? '#ef4444' : masterVolume > 0.4 ? '#eab308' : '#22c55e'
                                            }} />
                                    </div>
                                    <div className="text-[10px] font-mono text-white/80">{Math.round((isMasterMuted ? 0 : masterVolume) * 100)}</div>
                                </div>
                            )}
                        </div>
                        {/* ── A2+ Background Audio (DOM-attached, same security context as <video>) ── */}
                        {bgAudioClips.map(clip => (
                            <audio
                                key={clip.id}
                                ref={el => { bgAudioRefs.current[clip.id] = el; }}
                                src={clip.path?.startsWith('blob:') ? clip.path : clip.path?.startsWith('file://') ? clip.path : `file://${clip.path}`}
                                preload="auto"
                                className="hidden"
                            />
                        ))}
                    </div>
                </div>

                {/* Mini Transport */}
                <div className="h-12 flex items-center justify-between px-4 mt-2 flex-shrink-0">
                    {/* Left: Volume */}
                    <div className="flex items-center gap-2 w-32">
                        <button onClick={() => setIsMasterMuted(!isMasterMuted)} className="text-white/60 hover:text-white transition-colors">
                            {isMasterMuted || masterVolume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                        </button>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={isMasterMuted ? 0 : masterVolume}
                            title="Master Volume"
                            onChange={(e) => { setMasterVolume(parseFloat(e.target.value)); setIsMasterMuted(false); }}
                            className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                        />
                    </div>

                    {/* Center: Playback Controls */}
                    <div className="flex items-center gap-4">
                        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={handleSkipPrev} className="p-2 hover:bg-white/10 rounded-full" title="Previous Clip">
                            <SkipBack size={16} />
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={handleStop} className="p-2 hover:bg-white/10 rounded-full text-white/70 hover:text-red-400" title="Stop">
                            <Square size={16} fill="currentColor" />
                        </motion.button>
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handlePlayPause}
                            className="w-10 h-10 bg-primary hover:bg-primary/80 rounded-full flex items-center justify-center text-black shadow-lg shadow-primary/20 transition-colors"
                            title={isPlaying ? "Pause" : "Play"}
                        >
                            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={handleSkipNext} className="p-2 hover:bg-white/10 rounded-full" title="Next Clip">
                            <SkipForward size={16} />
                        </motion.button>
                    </div>

                    {/* Right: Toggles */}
                    <div className="flex items-center gap-2 w-32 justify-end">
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => {
                                // Cycle aspect ratio 16:9 -> 9:16 -> 1:1
                                const current = settings.aspectRatio;
                                const next = current === '16:9' ? '9:16' : current === '9:16' ? '1:1' : '16:9';
                                updateSettings({ aspectRatio: next as any });
                            }}
                            title={`Toggle Aspect Ratio (${settings.aspectRatio})`}
                            className="p-2 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-colors"
                        >
                            <MonitorSmartphone size={16} />
                        </motion.button>
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={magnetizeClips}
                            title="Magnetize (Remove Gaps)"
                            className="p-2 hover:bg-white/10 rounded-full text-accent transition-colors"
                        >
                            <Magnet size={16} />
                        </motion.button>
                        <div className="w-px h-4 bg-white/10 mx-1" />
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => updateSettings({ sequenceLoop: !settings.sequenceLoop })}
                            title={settings.sequenceLoop ? "Looping Enabled" : "Looping Disabled"}
                            className={`p-2 rounded-full transition-colors ${settings.sequenceLoop ? 'text-primary bg-primary/20' : 'text-white/40 hover:text-white/80 hover:bg-white/10'}`}
                        >
                            <Repeat size={16} />
                        </motion.button>
                    </div>
                </div>

                {/* Sequence Timecode - Single line centered beneath transport */}
                <div className="text-[11px] font-mono text-white/40 text-center pb-2 z-10 flex-shrink-0 mt-1">
                    {timecodeFormat === 'timecode' 
                        ? `SEQ TC: ${Math.floor(currentGlobalFrame / settings.fps / 60).toString().padStart(2, '0')}:${Math.floor((currentGlobalFrame / settings.fps) % 60).toString().padStart(2, '0')}:${(currentGlobalFrame % settings.fps).toString().padStart(2, '0')} | Frame ${currentGlobalFrame}`
                        : `Frame ${currentGlobalFrame} | Total: ${maxFrameId}`
                    }
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
                <div className="h-10 border-b border-white/10 flex items-center px-4 justify-between bg-[#0d0d1a]/80 backdrop-blur-sm z-20 relative">
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
                        className="h-8 border-b border-white/5 bg-[#080812]/80 flex items-center overflow-hidden shrink-0 ml-[200px]"
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
                    <div className="flex-1 flex flex-col min-h-0 overflow-x-auto relative bg-transparent">
                        <div className="min-w-full relative flex-1 flex flex-col">
                            {tracks.map(track => {
                                const isLocked = trackLocked[track.id] ?? false;
                                const isHiddenTrack = trackHidden[track.id] ?? false;
                                const isSolo = trackSolo[track.id] ?? false;
                                const isMuted = trackMutes[track.id] ?? false;
                                return (
                                <div key={track.id} className={clsx("flex flex-1 min-h-[48px] border-b border-white/5 relative group transition-all", isHiddenTrack ? 'bg-[#0a0a15]/80 opacity-50' : 'bg-[#0e0e1b]/60')}>
                                    {/* Track Header — Premiere Pro style */}
                                    <div className="w-[200px] bg-[#111122]/80 backdrop-blur-md border-r border-white/5 flex flex-col p-2 gap-1 flex-shrink-0 sticky left-0 z-10 shadow-lg top-0">
                                        <div className="flex items-center justify-between">
                                            <span className={clsx("text-[11px] font-bold flex items-center gap-1.5", isMuted ? 'text-white/30 line-through' : 'text-white/70')}>
                                                {track.isAudio ? <Mic size={11} className={isMuted ? 'text-white/20' : track.id === 2 ? 'text-cyan-400' : 'text-pink-400'} /> : <Video size={11} className="text-accent" />}
                                                {track.label}
                                                {track.id === 2 && <Link2 size={9} className="text-cyan-400/50" />}
                                            </span>
                                        </div>
                                        {/* Control row */}
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => toggleTrackHidden(track.id)} className={clsx('p-0.5 rounded transition-colors', isHiddenTrack ? 'text-yellow-400' : 'text-white/30 hover:text-white/60')} title="Toggle Visibility">
                                                {isHiddenTrack ? <EyeOff size={12} /> : <Eye size={12} />}
                                            </button>
                                            <button onClick={() => toggleTrackLock(track.id)} className={clsx('p-0.5 rounded transition-colors', isLocked ? 'text-red-400' : 'text-white/30 hover:text-white/60')} title="Toggle Lock">
                                                {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
                                            </button>
                                            {track.isAudio && (
                                                <>
                                                    <button onClick={(e) => { e.stopPropagation(); setTrackMuted(track.id, !isMuted); }}
                                                        className={clsx('px-1 py-0.5 rounded text-[9px] font-black transition-colors', isMuted ? 'bg-red-500/30 text-red-300' : 'text-white/30 hover:text-white/60 hover:bg-white/10')}
                                                        title={isMuted ? 'Unmute' : 'Mute'}>M</button>
                                                    <button onClick={() => toggleTrackSolo(track.id)}
                                                        className={clsx('px-1 py-0.5 rounded text-[9px] font-black transition-colors', isSolo ? 'bg-yellow-500/30 text-yellow-300' : 'text-white/30 hover:text-white/60 hover:bg-white/10')}
                                                        title={isSolo ? 'Unsolo' : 'Solo'}>S</button>
                                                    <button onClick={(e) => { e.stopPropagation(); setTrackMuted(track.id, !isMuted); }}
                                                        className={clsx('p-0.5 rounded transition-colors', isMuted ? 'text-red-400' : 'text-white/30 hover:text-white/60')}
                                                        title={isMuted ? 'Unmute' : 'Mute'}>
                                                        {isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                        {/* Per-Track Volume Slider */}
                                        {track.isAudio && (
                                            <div className="flex items-center gap-1 mt-0.5">
                                                <span className="text-[8px] text-white/25 w-4 text-right">{trackVolumes[track.id] ?? 100}</span>
                                                <input
                                                    type="range"
                                                    min={0}
                                                    max={100}
                                                    step={1}
                                                    value={trackVolumes[track.id] ?? 100}
                                                    onChange={(e) => setTrackVolume(track.id, parseInt(e.target.value))}
                                                    className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-purple-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400"
                                                    title={`Track Volume: ${trackVolumes[track.id] ?? 100}%`}
                                                />
                                            </div>
                                        )}
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
                                            const isShadow = (clip as any)._shadowOf;
                                            const isLinkedAudio = track.id === 2 && isShadow;

                                            return (
                                                <div
                                                    key={clip.id}
                                                    className={clsx(
                                                        "absolute top-1 bottom-1 rounded border text-xs flex flex-col justify-center px-2 truncate overflow-hidden hover:brightness-110 shadow-lg transition-colors border-l-4",
                                                        activeVisualClip?.id === clip.id || activeVisualClip?.id === isShadow ? "ring-2 ring-white/40" : "",
                                                        isLocked ? "cursor-not-allowed" : (track.isAudio && track.id > 100 ? (dragClipId === clip.id ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-pointer'),
                                                        clip.disabled ? "opacity-30 grayscale border-dashed" : (
                                                            isLinkedAudio ? 'bg-cyan-900/40 border-l-cyan-500 border-y-cyan-500/20 border-r-cyan-500/20 text-cyan-200' :
                                                            clip.type === 'grid' ? 'bg-primary/40 border-l-primary border-y-primary/30 border-r-primary/30 text-primary-light' :
                                                                clip.type === 'video' ? 'bg-accent/40 border-l-accent border-y-accent/30 border-r-accent/30 text-accent-light' :
                                                                    clip.type === 'audio' ? 'bg-pink-900/40 border-l-pink-500 border-y-pink-500/30 border-r-pink-500/30 text-pink-200' :
                                                                        'bg-gray-800/40 border-gray-600'
                                                        )
                                                    )}
                                                    style={{ left, width }}
                                                    title={`${clip.filename} (${duration}f)${isLinkedAudio ? ' — linked audio' : ''}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setCurrentGlobalFrame(clip.startFrame);
                                                    }}
                                                    onMouseDown={(e) => {
                                                        if (isLocked) return;
                                                        if (track.isAudio && track.id > 100 && !isShadow) {
                                                            e.stopPropagation();
                                                            e.preventDefault();
                                                            setDragClipId(clip.id);
                                                            dragStartXRef.current = e.clientX;
                                                            dragOrigStartFrameRef.current = clip.startFrame;
                                                            dragOrigEndFrameRef.current = clip.endFrame;
                                                        }
                                                    }}
                                                >
                                                    <span className="font-semibold truncate flex items-center gap-1">
                                                        {isLinkedAudio && <Link2 size={9} className="text-cyan-300/60 flex-shrink-0" />}
                                                        {clip.filename}
                                                    </span>
                                                    <span className="text-[9px] opacity-60">{isLinkedAudio ? 'Linked' : `${duration}f`}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                            })}

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
