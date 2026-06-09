import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { GripVertical, LayoutGrid, Minus, Square, ChevronLeft, ChevronRight as ChevronRightIcon, PanelRightOpen, PanelRightClose } from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import { useProjectStore } from '../../store/projectStore';
import { VideoPlayer } from '../../components/VideoPlayer';
import { ClipControls } from './ClipControls';
import { GlobalControls } from './GlobalControls';
import { ClipItem } from './ClipItem';
import { SegmentSelector } from './SegmentSelector';
import { ZoomControls } from './ZoomControls';

// ── Persistent layout prefs ───────────────────────────────────────────────
const LAYOUT_KEY = 'mmmedia-timeline-layout';
interface LayoutPrefs {
    leftWidth: number;   // px
    rightWidth: number;  // px
    leftCollapsed: boolean;
    rightCollapsed: boolean;
}
const DEFAULT_LAYOUT: LayoutPrefs = { leftWidth: 240, rightWidth: 340, leftCollapsed: false, rightCollapsed: false };
function loadLayout(): LayoutPrefs {
    try { return { ...DEFAULT_LAYOUT, ...JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}') }; } catch { return DEFAULT_LAYOUT; }
}
function saveLayout(lp: LayoutPrefs) { localStorage.setItem(LAYOUT_KEY, JSON.stringify(lp)); }

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

    // Layout state (pixel-based for precise control)
    const [layout, setLayout] = useState<LayoutPrefs>(loadLayout);
    const containerRef = useRef<HTMLDivElement>(null);

    const persistLayout = useCallback((updates: Partial<LayoutPrefs>) => {
        setLayout(prev => {
            const next = { ...prev, ...updates };
            saveLayout(next);
            return next;
        });
    }, []);

    // Only show video/grid clips in the timeline
    const timelineClips = clips.filter(c => c.type === 'video' || c.type === 'grid');

    // Auto-select first clip if none selected
    useEffect(() => {
        if (timelineClips.length > 0 && selectedClipIds.length === 0) {
            selectSingleClip(timelineClips[0].id);
        }
    }, [timelineClips, selectedClipIds, selectSingleClip]);

    const selectedClipId = selectedClipIds[0];
    const selectedClip = clips.find((c) => c.id === selectedClipId);

    // Sync video player to segment start when selection changes
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
                endFrame: totalFrames,
            });
        }
    };

    // ── Resize logic (generic for both panels) ───────────────────────────
    const resizeRef = useRef<{ side: 'left' | 'right'; startX: number; startW: number } | null>(null);

    const onResizeStart = useCallback((side: 'left' | 'right', e: React.MouseEvent) => {
        e.preventDefault();
        resizeRef.current = { side, startX: e.clientX, startW: side === 'left' ? layout.leftWidth : layout.rightWidth };

        const onMove = (ev: MouseEvent) => {
            if (!resizeRef.current) return;
            const delta = ev.clientX - resizeRef.current.startX;
            const newW = side === 'left'
                ? Math.max(180, Math.min(450, resizeRef.current.startW + delta))
                : Math.max(260, Math.min(600, resizeRef.current.startW - delta));
            persistLayout({ [`${side}Width`]: newW });
        };
        const onUp = () => {
            resizeRef.current = null;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, [layout, persistLayout]);

    const leftW = layout.leftCollapsed ? 0 : layout.leftWidth;
    const rightW = layout.rightCollapsed ? 0 : layout.rightWidth;

    return (
        <div ref={containerRef} className="h-full flex flex-row bg-background overflow-hidden">
            {/* ═══════════ LEFT PANEL: Clip List ═══════════ */}
            {!layout.leftCollapsed && (
                <div
                    className="flex flex-col min-h-0 overflow-hidden border-r border-white/5 bg-[#080816] flex-shrink-0"
                    style={{ width: leftW }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-white/[0.03]">
                        <div className="flex items-center gap-1.5">
                            <LayoutGrid size={13} className="text-white/30" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Clips</span>
                            <span className="text-[10px] text-white/20 ml-1">{timelineClips.length}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            {/* Transition Strategy */}
                            <select
                                className="bg-black/30 text-[10px] text-white/50 border border-white/5 rounded px-1.5 py-0.5 outline-none focus:border-primary/40"
                                value={transitionStrategy}
                                onChange={(e) => setTransitionStrategy(e.target.value as any)}
                                title="Transition Strategy"
                            >
                                <option value="cut">Cut</option>
                                <option value="dissolve">Dissolve</option>
                                <option value="fade">Fade</option>
                                <option value="wipeleft">Wipe</option>
                            </select>
                            <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => setAllClipsFolded(true)}
                                className="p-0.5 hover:bg-white/10 rounded text-white/30 hover:text-white/60 transition-colors"
                                title="Collapse All"
                            >
                                <Minus size={12} />
                            </motion.button>
                            <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => setAllClipsFolded(false)}
                                className="p-0.5 hover:bg-white/10 rounded text-white/30 hover:text-white/60 transition-colors"
                                title="Expand All"
                            >
                                <Square size={12} />
                            </motion.button>
                            <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => persistLayout({ leftCollapsed: true })}
                                className="p-0.5 hover:bg-white/10 rounded text-white/30 hover:text-white/60 transition-colors"
                                title="Collapse panel"
                            >
                                <ChevronLeft size={12} />
                            </motion.button>
                        </div>
                    </div>

                    {/* Clip List */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
                        {timelineClips.length === 0 ? (
                            <div className="text-center py-8 text-white/30 text-xs">
                                No clips in timeline
                                <div className="text-[10px] mt-1 text-white/20">Import media from Media Manager</div>
                            </div>
                        ) : (
                            timelineClips.map((clip) => (
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
            )}

            {/* Left Resize Handle */}
            {!layout.leftCollapsed && (
                <div
                    className="w-1 bg-transparent hover:bg-accent/40 cursor-col-resize transition-colors flex-shrink-0 relative group z-10"
                    onMouseDown={(e) => onResizeStart('left', e)}
                >
                    <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-center pointer-events-none">
                        <div className="w-px h-8 bg-white/10 group-hover:bg-accent/50 rounded-full transition-colors" />
                    </div>
                </div>
            )}

            {/* ═══════════ CENTER: Video Player (always gets remaining space) ═══════════ */}
            <div className="flex flex-col flex-1 min-w-[400px] min-h-0 relative bg-black/40">
                {/* Collapse toggles when panels are hidden */}
                {(layout.leftCollapsed || layout.rightCollapsed) && (
                    <div className="absolute top-2 left-2 right-2 z-20 flex justify-between pointer-events-none">
                        {layout.leftCollapsed ? (
                            <motion.button
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                whileHover={{ scale: 1.05 }}
                                onClick={() => persistLayout({ leftCollapsed: false })}
                                className="pointer-events-auto flex items-center gap-1 px-2 py-1 bg-black/60 backdrop-blur border border-white/10 rounded text-[10px] text-white/50 hover:text-white/80 hover:border-accent/30 transition-all"
                            >
                                <ChevronRightIcon size={10} /> Clips
                            </motion.button>
                        ) : <div />}
                        {layout.rightCollapsed ? (
                            <motion.button
                                initial={{ opacity: 0, x: 8 }}
                                animate={{ opacity: 1, x: 0 }}
                                whileHover={{ scale: 1.05 }}
                                onClick={() => persistLayout({ rightCollapsed: false })}
                                className="pointer-events-auto flex items-center gap-1 px-2 py-1 bg-black/60 backdrop-blur border border-white/10 rounded text-[10px] text-white/50 hover:text-white/80 hover:border-accent/30 transition-all"
                            >
                                Inspector <ChevronLeft size={10} />
                            </motion.button>
                        ) : <div />}
                    </div>
                )}

                {/* Video Player — takes all available vertical space */}
                <div className="flex-1 flex flex-col justify-center p-3 min-h-[280px]">
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

                {/* Compact toolbar below video — only action buttons + speed + volume */}
                {selectedClip && (
                    <div className="px-3 pb-2 flex items-center gap-2">
                        <ZoomControls clipId={selectedClip.id} />
                    </div>
                )}
            </div>

            {/* Right Resize Handle */}
            {!layout.rightCollapsed && (
                <div
                    className="w-1 bg-transparent hover:bg-accent/40 cursor-col-resize transition-colors flex-shrink-0 relative group z-10"
                    onMouseDown={(e) => onResizeStart('right', e)}
                >
                    <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-center pointer-events-none">
                        <div className="w-px h-8 bg-white/10 group-hover:bg-accent/50 rounded-full transition-colors" />
                    </div>
                </div>
            )}

            {/* ═══════════ RIGHT PANEL: Inspector (ClipControls + GlobalControls) ═══════════ */}
            {!layout.rightCollapsed && (
                <div
                    className="flex flex-col min-h-0 overflow-hidden border-l border-white/5 bg-[#080816] flex-shrink-0"
                    style={{ width: rightW }}
                >
                    {/* Inspector Header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-white/[0.03]">
                        <div className="flex items-center gap-1.5">
                            <PanelRightOpen size={13} className="text-white/30" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Inspector</span>
                        </div>
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => persistLayout({ rightCollapsed: true })}
                            className="p-0.5 hover:bg-white/10 rounded text-white/30 hover:text-white/60 transition-colors"
                            title="Collapse inspector"
                        >
                            <ChevronRightIcon size={12} />
                        </motion.button>
                    </div>

                    {/* Inspector Content — scrollable */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {selectedClip ? (
                            <ClipControls clipId={selectedClip.id} variant="player" />
                        ) : (
                            <div className="p-4 text-center text-white/20 text-xs">
                                Select a clip to inspect
                            </div>
                        )}

                        {/* Global Controls at the bottom of inspector */}
                        <div className="border-t border-white/5 mt-2">
                            <GlobalControls
                                orientation="vertical"
                                slim={rightW < 300}
                                className="w-full"
                                containerWidth={rightW}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
