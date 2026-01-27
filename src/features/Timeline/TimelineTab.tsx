import React, { useState, useEffect, useRef } from 'react';
import { Layers, GripVertical } from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import { useProjectStore } from '../../store/projectStore';
import { VideoPlayer } from '../../components/VideoPlayer';
import { ClipControls } from './ClipControls';
import { GlobalControls } from './GlobalControls';
import { ClipItem } from './ClipItem';

export const TimelineTab: React.FC = () => {
    const { clips, selectedClipIds, selectSingleClip, updateClip, selectedSegment, globalPlaybackSpeed, setAllClipsFolded } = useClipStore();
    const { settings } = useProjectStore();
    const [currentFrame, setCurrentFrame] = useState(0);
    const [leftPanelWidth, setLeftPanelWidth] = useState(35); // percentage
    const [isResizing, setIsResizing] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-select first clip if none selected
    useEffect(() => {
        if (clips.length > 0 && selectedClipIds.length === 0) {
            selectSingleClip(clips[0].id);
        }
    }, [clips, selectedClipIds, selectSingleClip]);

    // Sync video player to segment start when selection changes (e.g. dragging or randomizing)
    useEffect(() => {
        if (selectedSegment) {
            setCurrentFrame(selectedSegment.startFrame);
        }
    }, [selectedSegment]);

    const selectedClipId = selectedClipIds[0];
    const selectedClip = clips.find((c) => c.id === selectedClipId);

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

    return (
        <div className="h-full flex flex-col bg-background overflow-hidden">
            {/* Main Content Area */}
            <div ref={containerRef} className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
                {/* Left Column: Clips List */}
                <div
                    className="flex flex-col min-h-0 overflow-hidden border-b lg:border-b-0 lg:border-r border-white/5"
                    style={{ width: `${leftPanelWidth}%` }}
                >
                    <div className="p-4 border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Layers size={18} className="text-white/60" />
                            <h3 className="text-sm font-medium text-white/80">Clips</h3>
                            <span className="text-xs text-white/40">({clips.length})</span>
                        </div>

                        <div className="flex items-center">
                            <button
                                onClick={() => {
                                    // Check if any clip is unfolded; if so, fold all. Otherwise unfold all.
                                    const anyUnfolded = clips.some(c => !c.isFolded);
                                    setAllClipsFolded(anyUnfolded);
                                }}
                                className="p-1.5 hover:bg-white/10 rounded transition-colors text-white/40 hover:text-white/80"
                                title="Fold/Unfold All"
                            >
                                <div className="flex flex-col gap-0.5">
                                    <div className="w-3 h-0.5 bg-current rounded-full" />
                                    <div className="w-3 h-0.5 bg-current rounded-full" />
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {clips.length === 0 ? (
                            <div className="text-center py-12 text-white/40">
                                No clips in timeline
                                <div className="text-xs mt-2">Import media from Media Manager</div>
                            </div>
                        ) : (
                            clips.map((clip) => (
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

                {/* Resize Handle */}
                <div
                    className="hidden lg:flex items-center justify-center w-1 bg-white/5 hover:bg-accent/50 cursor-col-resize transition-colors relative group"
                    onMouseDown={handleMouseDown}
                    title="Drag to resize"
                >
                    <div className="absolute inset-y-0 flex items-center justify-center pointer-events-none">
                        <GripVertical size={16} className="text-white/20 group-hover:text-accent/70" />
                    </div>
                </div>

                {/* Right Column: Video Player + ClipControls */}
                <div className="flex flex-col flex-1 min-h-0">
                    {/* Video Player Section */}
                    <div className="flex-1 p-4 min-h-[300px]">
                        <VideoPlayer
                            videoPath={selectedClip?.type === 'video' ? selectedClip.path : undefined}
                            currentFrame={currentFrame}
                            fps={settings.fps}
                            onFrameChange={setCurrentFrame}
                            onDurationChange={handleDurationChange}
                            playbackSpeed={globalPlaybackSpeed}
                            clipSpeed={selectedClip?.speed}
                        />
                    </div>

                    {/* ClipControls - Display if clip selected */}
                    {selectedClip && (
                        <ClipControls clipId={selectedClip.id} />
                    )}
                </div>
            </div>

            {/* Bottom: Global Controls - Horizontal Layout */}
            <div className="border-t border-white/5">
                <GlobalControls />
            </div>
        </div>
    );
};
