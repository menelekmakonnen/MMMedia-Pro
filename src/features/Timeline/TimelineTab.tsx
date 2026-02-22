import React, { useState, useEffect, useRef } from 'react';
import { GripVertical, LayoutGrid, Minus, Square } from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import { useProjectStore } from '../../store/projectStore';
import { VideoPlayer } from '../../components/VideoPlayer';
import { ClipControls } from './ClipControls';
import { GlobalControls } from './GlobalControls';
import { ClipItem } from './ClipItem';
import { SegmentSelector } from './SegmentSelector';
import { ZoomControls } from './ZoomControls';

export const TimelineTab: React.FC = () => {
    const {
        clips,
        selectedClipIds,
        selectSingleClip,
        updateClip,
        globalPlaybackSpeed,
        setAllClipsFolded,
        transitionStrategy,
        setTransitionStrategy
    } = useClipStore();
    const { settings } = useProjectStore();
    const [currentFrame, setCurrentFrame] = useState(0);
    // UI state for resizable panels
    const [leftPanelWidth, setLeftPanelWidth] = useState(30); // Percentage
    const [isResizing, setIsResizing] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-select first clip if none selected
    useEffect(() => {
        if (clips.length > 0 && selectedClipIds.length === 0) {
            selectSingleClip(clips[0].id);
        }
    }, [clips, selectedClipIds, selectSingleClip]);

    const selectedClipId = selectedClipIds[0];
    const selectedClip = clips.find((c) => c.id === selectedClipId);

    // Sync video player to segment start when selection changes (e.g. dragging or randomizing)
    // This ensures that when "Flux" changes the start point, the video player jumps to show it.
    useEffect(() => {
        if (selectedClip) {
            setCurrentFrame(selectedClip.trimStartFrame ?? 0);
        }
    }, [selectedClip?.trimStartFrame, selectedClip?.id]);

    const handleDurationChange = (duration: number) => {
        if (selectedClip && selectedClip.sourceDurationFrames === 0) {
            const totalFrames = Math.floor(duration * settings.fps);
            updateClip(selectedClip.id, {
                sourceDurationFrames: totalFrames,
                endFrame: totalFrames, // Initially set endFrame to full duration
            });
        }
    };

    // Resize handler
    const handleMouseDown = () => {
        setIsResizing(true);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing || !containerRef.current) return;

            const containerRect = containerRef.current.getBoundingClientRect();
            const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;

            // Constrain between 20% and 60%
            const clampedWidth = Math.min(Math.max(newWidth, 20), 60);
            setLeftPanelWidth(clampedWidth);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    // Resizable Sidebar State
    const [sidebarWidth, setSidebarWidth] = useState(64); // Default to 64px (slim)
    const [isResizingSidebar, setIsResizingSidebar] = useState(false);
    const sidebarRef = useRef<HTMLDivElement>(null);

    // Sidebar Resize Handler
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizingSidebar) return;
            const newWidth = window.innerWidth - e.clientX;
            // Constrain width: min 48px, max 400px
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
        <div className="h-full flex flex-row bg-background overflow-hidden">
            {/* Main Content Area: Left Panel + Video Player */}
            <div ref={containerRef} className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden relative">
                {/* Left Column: Clips List */}
                <div
                    className="flex flex-col min-h-0 overflow-hidden border-b lg:border-b-0 lg:border-r border-white/5"
                    style={{ width: `${leftPanelWidth}%` }}
                >
                    <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/5">
                        <div className="flex items-center gap-2">
                            <LayoutGrid size={16} className="text-white/40" />
                            <span className="text-xs font-bold uppercase tracking-wider text-white/60">Timeline</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Transition Strategy Selector */}
                            <select
                                className="bg-black/20 text-xs text-white/60 border border-white/10 rounded px-2 py-1 outline-none focus:border-primary/50"
                                value={transitionStrategy}
                                onChange={(e) => setTransitionStrategy(e.target.value as any)}
                                title="Transition Strategy"
                            >
                                <option value="cut">Cut</option>
                                <option value="cross-dissolve">Dissolve</option>
                                <option value="fade-to-black">Fade</option>
                            </select>
                            <button
                                onClick={() => setAllClipsFolded(true)}
                                className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-white transition-colors"
                                title="Collapse All"
                            >
                                <Minus size={14} />
                            </button>
                            <button
                                onClick={() => setAllClipsFolded(false)}
                                className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-white transition-colors"
                                title="Expand All"
                            >
                                <Square size={14} />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                        {clips.length === 0 ? (
                            <div className="text-center py-12 text-white/40">
                                No clips in timeline
                                <div className="text-xs mt-2">Import media from Media Manager</div>
                            </div>
                        ) : (
                            clips.filter(c => c.type === 'video').map((clip) => (
                                <ClipItem
                                    key={clip.id}
                                    clip={clip}
                                    isSelected={selectedClipIds.includes(clip.id)}
                                    onSelect={selectSingleClip}
                                />
                            ))
                        )}
                    </div>
                </div>

                {/* Resize Handle (Left Panel) */}
                <div
                    className="hidden lg:flex items-center justify-center w-1 bg-white/5 hover:bg-accent/50 cursor-col-resize transition-colors relative group z-10"
                    onMouseDown={handleMouseDown}
                    title="Drag to resize list"
                >
                    <div className="absolute inset-y-0 flex items-center justify-center pointer-events-none">
                        <GripVertical size={12} className="text-white/20 group-hover:text-accent/70" />
                    </div>
                </div>

                {/* Center Column: Video Player */}
                <div className="flex flex-col flex-1 min-h-0 relative bg-black/50">
                    <div className="flex-1 p-4 min-h-[300px] flex flex-col justify-center">
                        <VideoPlayer
                            videoPath={selectedClip?.type === 'video' ? selectedClip.path : undefined}
                            currentFrame={currentFrame}
                            fps={settings.fps}
                            onFrameChange={setCurrentFrame}
                            onDurationChange={handleDurationChange}
                            playbackSpeed={globalPlaybackSpeed}
                            clipSpeed={selectedClip?.speed}
                            centerControls={selectedClip ? <SegmentSelector clipId={selectedClip.id} onScrub={setCurrentFrame} /> : null}
                            stopAtFrame={selectedClip ? (selectedClip.trimEndFrame || selectedClip.endFrame) : undefined}
                            zoomLevel={selectedClip?.zoomLevel}
                            zoomOrigin={selectedClip?.zoomOrigin}
                        />
                    </div>
                    {selectedClip && (
                        <div className="p-4 border-t border-white/5 bg-[#0a0a12] flex items-start justify-between gap-4 overflow-x-auto custom-scrollbar">
                            <ClipControls clipId={selectedClip.id} variant="player" />
                            <ZoomControls clipId={selectedClip.id} />
                        </div>
                    )}
                </div>
            </div>

            {/* Right Resize Handle (God Mode) */}
            <div
                className="w-1 bg-[#131320] hover:bg-accent/50 cursor-col-resize transition-colors z-30 flex items-center justify-center group flex-shrink-0"
                onMouseDown={() => setIsResizingSidebar(true)}
            >
                <div className="h-8 w-0.5 bg-white/10 group-hover:bg-accent/50 rounded-full" />
            </div>

            {/* Right Column: Global Controls (Vertical Resizable) */}
            <div
                ref={sidebarRef}
                className="flex-shrink-0 z-20 bg-[#080816] h-full relative shadow-xl overflow-hidden"
                style={{ width: sidebarWidth }}
            >
                <GlobalControls
                    orientation="vertical"
                    slim={sidebarWidth < 180} // Switch to text mode if > 180px
                    className="h-full"
                    containerWidth={sidebarWidth} // Pass width for scaling
                />
            </div>
        </div>
    );
};
