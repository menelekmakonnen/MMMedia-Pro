import React, { useState, useRef, useMemo } from 'react';
import { GlobalControls } from '../Timeline/GlobalControls';
import { VideoPlayer } from '../../components/VideoPlayer';
import { Layers, Monitor, Sliders, Film, Trash2, Shuffle } from 'lucide-react';
import { useClipStore, Clip } from '../../store/clipStore';
import clsx from 'clsx';

export const SequenceTab: React.FC = () => {
    const { clips } = useClipStore();

    // Track definitions
    const tracks = [
        { id: 1, name: 'Video 1', type: 'video', color: 'bg-blue-500' },
        { id: 2, name: 'Video 2', type: 'video', color: 'bg-purple-500' },
        { id: 3, name: 'Audio', type: 'audio', color: 'bg-emerald-500' },
    ];

    // Filtering clips by track
    const clipsByTrack = useMemo(() => {
        const grouped: Record<number, Clip[]> = {};
        clips.forEach(clip => {
            const trackId = clip.track || 1;
            // Map old Audio 2 clips to Audio 1 if needed, or just let them hide
            if (!grouped[trackId]) grouped[trackId] = [];
            grouped[trackId].push(clip);
        });
        return grouped;
    }, [clips]);

    // Local state for playhead
    const [currentFrame, setCurrentFrame] = useState(0);
    const [fps] = useState(30);
    const [slimTracks, setSlimTracks] = useState<Record<number, boolean>>({
        1: true, 2: true, 3: true
    });

    const toggleTrackSlim = (id: number) => {
        setSlimTracks(prev => ({ ...prev, [id]: !prev[id] }));
    };

    // Calculate total duration for ruler and playhead positioning
    const totalDurationFrames = useMemo(() => {
        return clips.reduce((max, clip) => Math.max(max, clip.endFrame), 300);
    }, [clips]);

    // Draggable Seeker State
    const [isDragging, setIsDragging] = useState(false);
    const rulerRef = useRef<HTMLDivElement>(null);

    const handleSeek = (clientX: number) => {
        if (!rulerRef.current) return;
        const rect = rulerRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, x / rect.width));
        const frame = Math.floor(percentage * totalDurationFrames);
        setCurrentFrame(frame);
    };

    const handleSeekerMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        handleSeek(e.clientX);
    };

    React.useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging) {
                e.preventDefault();
                handleSeek(e.clientX);
            }
        };
        const handleMouseUp = () => setIsDragging(false);

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, totalDurationFrames]);

    // Active Clip logic for Preview Monitor
    const activeClip = useMemo(() => {
        for (let i = 1; i <= 3; i++) {
            const trackClips = clipsByTrack[i] || [];
            // Find clip at currentFrame
            const clipAtPlayhead = trackClips.find(c =>
                c.type === 'video' &&
                currentFrame >= c.startFrame &&
                currentFrame < c.endFrame
            );

            if (clipAtPlayhead) return clipAtPlayhead;
        }
        return null;
    }, [clipsByTrack, currentFrame]);


    // Resizable Sidebar State
    const [sidebarWidth, setSidebarWidth] = useState(64);
    const [isResizingSidebar, setIsResizingSidebar] = useState(false);
    const sidebarRef = useRef<HTMLDivElement>(null);

    // Sidebar Resize Logic
    React.useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizingSidebar) return;
            const newWidth = window.innerWidth - e.clientX;
            setSidebarWidth(Math.max(48, Math.min(newWidth, 400)));
        };
        const handleMouseUp = () => setIsResizingSidebar(false);

        if (isResizingSidebar) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizingSidebar]);

    return (
        <div className="h-full flex flex-col bg-gray-900 text-white overflow-hidden select-none">

            {/* Center Area: Player+Tracks | Sidebar */}
            <div className="flex-1 flex flex-row min-h-0 overflow-hidden relative">
                {/* Left Column: Player & Tracks */}
                <div className="flex-1 flex flex-col min-w-0 relative">

                    {/* Top: Video Player (Program Monitor) */}
                    <div className="flex-1 min-h-0 relative bg-black border-b border-white/10">
                        <div className="absolute inset-0 flex items-center justify-center p-4">
                            <div className="h-full aspect-video bg-[#050510] border border-white/10 rounded-lg shadow-2xl relative overflow-hidden group">
                                {/* Monitor Content */}
                                {activeClip ? (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <VideoPlayer
                                            videoPath={activeClip.path}
                                            currentFrame={currentFrame}
                                            fps={fps}
                                            onFrameChange={(f) => setCurrentFrame(f)}
                                        />
                                        {/* Overlay Info */}
                                        <div className="absolute top-4 left-4 px-3 py-1 bg-black/60 backdrop-blur-md rounded border border-white/10 text-xs font-mono z-10">
                                            <div className="text-white/50 text-[10px] uppercase tracking-wider mb-0.5">Program</div>
                                            <div className="text-white font-bold">{activeClip.filename}</div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white/20">
                                        <Monitor size={48} className="mb-4 opacity-50" />
                                        <div className="text-sm font-medium tracking-widest uppercase">No Signal</div>
                                    </div>
                                )}

                                {/* Timecode Overlay */}
                                <div className="absolute bottom-4 right-4 px-3 py-1 bg-black/80 backdrop-blur rounded font-mono text-xs text-secondary-light border border-secondary/20 shadow-[0_0_10px_rgba(0,255,159,0.1)] z-10">
                                    {Math.floor(currentFrame / fps / 60).toString().padStart(2, '0')}:
                                    {Math.floor((currentFrame / fps) % 60).toString().padStart(2, '0')}:
                                    {(currentFrame % fps).toString().padStart(2, '0')}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Bottom: Multi-Track Timeline */}
                    <div className="h-64 bg-[#0f0f1b] flex flex-col flex-shrink-0 relative border-t border-white/5 shadow-[0_-5px_15px_rgba(0,0,0,0.3)] z-10">
                        {/* Time Ruler & Playhead Track */}
                        <div
                            ref={rulerRef}
                            className="h-8 border-b border-white/5 bg-[#131320] relative cursor-pointer group hover:bg-[#1a1a2e] transition-colors"
                            onMouseDown={handleSeekerMouseDown}
                        >
                            {/* Ruler Ticks */}
                            <div className="absolute inset-0 opacity-30 pointer-events-none">
                                {Array.from({ length: 20 }).map((_, i) => (
                                    <div
                                        key={i}
                                        className="absolute bottom-0 h-2 w-px bg-white/50"
                                        style={{ left: `${(i / 20) * 100}%` }}
                                    />
                                ))}
                            </div>

                            {/* Playhead Indicator (Triangle) */}
                            <div
                                className="absolute top-0 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-red-500 transform -translate-x-1/2 z-40 pointer-events-none transition-transform duration-75 ease-out"
                                style={{ left: `${(currentFrame / totalDurationFrames) * 100}%` }}
                            />
                        </div>

                        {/* Tracks Container */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1 relative">
                            {/* Playhead Line (spanning tracks) */}
                            <div
                                className="absolute top-0 bottom-0 w-px bg-red-500 z-30 pointer-events-none shadow-[0_0_8px_rgba(239,68,68,0.5)] transition-all duration-75 ease-out"
                                style={{ left: `${(currentFrame / totalDurationFrames) * 100}%` }}
                            />

                            {tracks.map(track => {
                                const isSlim = slimTracks[track.id];
                                return (
                                    <div key={track.id} className="flex rounded-lg overflow-hidden border border-white/5 bg-[#0a0a12]">
                                        {/* Track Header */}
                                        <div className="w-24 flex-shrink-0 bg-[#151520] border-r border-white/5 flex flex-col justify-center px-2 py-2 gap-1 group/header relative">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider truncate">{track.name}</span>
                                                <div className={`w-2 h-2 rounded-full ${track.color}`} />
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover/header:opacity-100 transition-opacity absolute right-1 top-1">
                                                <button
                                                    onClick={() => toggleTrackSlim(track.id)}
                                                    className={clsx(
                                                        "p-1 rounded hover:bg-white/10 transition-colors",
                                                        isSlim ? "text-blue-400" : "text-white/40"
                                                    )}
                                                >
                                                    <Sliders size={10} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Track Lane */}
                                        <div className={clsx(
                                            "flex-1 relative transition-all duration-300 ease-in-out",
                                            isSlim ? "h-8" : "h-24"
                                        )}>
                                            {/* Grid Lines */}
                                            <div className="absolute inset-0 opacity-5 pointer-events-none"
                                                style={{ backgroundImage: 'linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '5% 100%' }}
                                            />

                                            {/* Clips */}
                                            {clipsByTrack[track.id]?.map(clip => {
                                                const widthPercent = (clip.sourceDurationFrames || (clip.endFrame - clip.startFrame)) / totalDurationFrames * 100;
                                                const leftPercent = (clip.startFrame / totalDurationFrames) * 100;

                                                return (
                                                    <div
                                                        key={clip.id}
                                                        className={clsx(
                                                            "absolute top-1 bottom-1 rounded border overflow-hidden group/clip cursor-pointer transition-all duration-200",
                                                            isSelected(clip.id) ? "border-accent ring-1 ring-accent" : "border-transparent hover:border-white/20",
                                                            isSlim ? "opacity-80" : ""
                                                        )}
                                                        style={{
                                                            left: `${leftPercent}%`,
                                                            width: `${widthPercent}%`
                                                        }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            // selection logic if needed
                                                            useClipStore.getState().selectSingleClip(clip.id);
                                                        }}
                                                    >
                                                        <div className={clsx("w-full h-full relative flex items-center px-2 overflow-hidden", track.color.replace('bg-', 'bg-opacity-20 bg-'))}>
                                                            {/* Thumbnail Slit Visual */}
                                                            <div className="w-1 h-full absolute left-0 top-0 bottom-0 bg-white/20" />
                                                            <div className="w-4 h-full absolute left-1 top-0 bottom-0 bg-black/20 flex items-center justify-center">
                                                                {track.type === 'video' ? <Film size={8} className="text-white/40" /> : <Layers size={8} className="text-white/40" />}
                                                            </div>

                                                            <span className="text-[10px] font-medium text-white/90 truncate pl-6 drop-shadow-md">{clip.filename}</span>

                                                            {/* Clip Actions (Hover) */}
                                                            <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover/clip:opacity-100 transition-opacity bg-black/50 rounded p-0.5 backdrop-blur-sm z-20">
                                                                <button
                                                                    className="p-1 hover:text-white text-white/70 transition-colors"
                                                                    title="Delete Clip"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        useClipStore.getState().removeClip(clip.id);
                                                                    }}
                                                                >
                                                                    <Trash2 size={10} />
                                                                </button>
                                                                <button
                                                                    className="p-1 hover:text-white text-white/70 transition-colors"
                                                                    title="Randomize Segment"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        useClipStore.getState().randomizeSegment(clip.id);
                                                                    }}
                                                                >
                                                                    <Shuffle size={10} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right Resize Handle (God Mode) */}
                <div
                    className="w-1 bg-[#131320] hover:bg-accent/50 cursor-col-resize transition-colors z-30 flex items-center justify-center group flex-shrink-0"
                    onMouseDown={() => setIsResizingSidebar(true)}
                >
                    <div className="h-8 w-0.5 bg-white/10 group-hover:bg-accent/50 rounded-full" />
                </div>

                {/* Right Column: Global Controls (Vertical Slim) */}
                <div
                    ref={sidebarRef}
                    className="flex-shrink-0 z-20 bg-[#080816] h-full relative shadow-xl overflow-hidden"
                    style={{ width: sidebarWidth }}
                >
                    <GlobalControls
                        orientation="vertical"
                        slim={sidebarWidth < 180}
                        className="h-full"
                        containerWidth={sidebarWidth}
                        sections={['automation', 'actions']} // Sidebar content
                    />
                </div>
            </div>

            {/* Bottom Bar: Global Stats & Mute */}
            <div className="flex-shrink-0 border-t border-white/5 bg-[#080816] z-40">
                <GlobalControls
                    orientation="horizontal"
                    sections={['stats', 'mute']}
                    className="py-2 px-4"
                />
            </div>
        </div>
    );
};

// Helper for selection check, assumes we can import or define it
const isSelected = (id: string) => useClipStore.getState().selectedClipIds.includes(id);

// Helper for selection check, assumes we can import or define it




