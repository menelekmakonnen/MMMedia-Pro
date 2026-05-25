import React, { useEffect } from 'react';
import { GridClip, Clip } from '../types';
import { getGridLayout } from '../lib/gridTemplates';
import { VideoPlayer } from './VideoPlayer';
import { useProjectStore } from '../store/projectStore';

export interface GridPlayerProps {
    grid: GridClip;
    currentFrame: number;
    isPlaying: boolean;
    onFrameChange?: (frame: number) => void;
    onCellClick?: (cellId: string) => void;
    selectedCellId?: string | null;
}

export const GridPlayer: React.FC<GridPlayerProps> = ({ grid, currentFrame, isPlaying, onFrameChange, onCellClick, selectedCellId }) => {
    const { settings } = useProjectStore();

    // Playback loop for GridPlayer when independent in Editor
    useEffect(() => {
        if (!isPlaying || !onFrameChange) return;

        let animationFrameId: number;
        let lastTime = performance.now();
        const frameDuration = 1000 / settings.fps;

        const loop = (time: number) => {
            const deltaTime = time - lastTime;
            if (deltaTime >= frameDuration) {
                const framesToAdvance = Math.floor(deltaTime / frameDuration);
                let nextFrame = currentFrame + framesToAdvance;

                // Loop
                if (nextFrame >= grid.endFrame) {
                    nextFrame = 0;
                }
                onFrameChange(nextFrame);
                lastTime = time - (deltaTime % frameDuration);
            }
            animationFrameId = requestAnimationFrame(loop);
        };

        animationFrameId = requestAnimationFrame(loop);

        return () => cancelAnimationFrame(animationFrameId);
    }, [isPlaying, currentFrame, settings.fps, grid.endFrame, onFrameChange]);

    const layouts = getGridLayout(grid.numCells, grid.gridFormat);

    return (
        <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
            {/* Background Layer */}
            {grid.backgroundMode === 'blur' && (() => {
                const firstCell = grid.cells[0];
                const bgClip = firstCell?.clips?.[0] || firstCell?.clip;
                if (!bgClip) return null;
                return (
                    <div className="absolute inset-0 blur-xl opacity-50 transform scale-110 pointer-events-none">
                        <VideoPlayer
                            videoPath={bgClip.path}
                            currentFrame={currentFrame}
                            fps={settings.fps}
                            bgOnly={true}
                            hideTransport={true}
                            volume={0}
                            onFrameChange={() => { }}
                        />
                    </div>
                );
            })()}

            <div className="w-full h-full flex" style={{ aspectRatio: settings.aspectRatio.replace(':', '/') }}>
                {grid.cells.slice(0, grid.numCells).map((cell, index) => {
                    const layout = layouts[index];
                    if (!layout) return null;

                    // Determine the active clip for this cell
                    // If the cell has clips[], find which one covers the current frame
                    // For now: cycle through clips sequentially (each plays for its full duration)
                    const cellClips = cell.clips && cell.clips.length > 0 ? cell.clips : (cell.clip ? [cell.clip] : []);

                    let activeClip: Clip | null = null;
                    let clipLocalFrame = currentFrame;

                    if (cellClips.length > 0) {
                        // Calculate which clip in the cell's mini-timeline is active
                        let accumulated = 0;
                        for (const cc of cellClips) {
                            const dur = (cc.trimEndFrame - cc.trimStartFrame) / (cc.speed || 1);
                            if (currentFrame < accumulated + dur) {
                                activeClip = cc;
                                clipLocalFrame = Math.floor(((currentFrame - accumulated) * (cc.speed || 1)) + (cc.trimStartFrame || 0));
                                break;
                            }
                            accumulated += dur;
                        }
                        // If past all clips, loop back to first
                        if (!activeClip && cellClips.length > 0) {
                            const totalDur = cellClips.reduce((sum, cc) => sum + (cc.trimEndFrame - cc.trimStartFrame) / (cc.speed || 1), 0);
                            const loopedFrame = totalDur > 0 ? currentFrame % totalDur : 0;
                            let acc2 = 0;
                            for (const cc of cellClips) {
                                const dur = (cc.trimEndFrame - cc.trimStartFrame) / (cc.speed || 1);
                                if (loopedFrame < acc2 + dur) {
                                    activeClip = cc;
                                    clipLocalFrame = Math.floor(((loopedFrame - acc2) * (cc.speed || 1)) + (cc.trimStartFrame || 0));
                                    break;
                                }
                                acc2 += dur;
                            }
                            if (!activeClip) activeClip = cellClips[0];
                        }
                    }

                    // If cell is empty, render placeholder
                    if (!activeClip) {
                        return (
                            <div
                                key={cell.id}
                                onClick={() => onCellClick && onCellClick(cell.id)}
                                className={`absolute border bg-white/5 flex flex-col items-center justify-center text-white/30 text-xs cursor-pointer transition-colors ${selectedCellId === cell.id ? 'border-primary ring-1 ring-primary/50 bg-primary/10' : 'border-black/50 hover:bg-white/10'
                                    }`}
                                style={{
                                    left: `${layout.x * 100}%`,
                                    top: `${layout.y * 100}%`,
                                    width: `${layout.width * 100}%`,
                                    height: `${layout.height * 100}%`
                                }}
                            >
                                <div>Cell {index + 1}</div>
                                <div className="text-[9px]">Click to Assign Media</div>
                            </div>
                        );
                    }

                    return (
                        <div
                            key={cell.id}
                            onClick={() => onCellClick && onCellClick(cell.id)}
                            className={`absolute overflow-hidden cursor-pointer transition-all ${selectedCellId === cell.id ? 'border-2 border-primary ring-2 ring-primary/50 z-10' : 'border border-black/50 hover:border-white/50 z-0'
                                }`}
                            style={{
                                left: `${layout.x * 100}%`,
                                top: `${layout.y * 100}%`,
                                width: `${layout.width * 100}%`,
                                height: `${layout.height * 100}%`
                            }}
                        >
                            <div className="absolute inset-0 pointer-events-none z-20" /> {/* Click interceptor */}
                            <VideoPlayer
                                videoPath={activeClip.type === 'video' ? activeClip.path : undefined}
                                currentFrame={clipLocalFrame}
                                fps={settings.fps}
                                hideTransport={true}
                                volume={activeClip.isMuted ? 0 : (activeClip.volume / 100)}
                                playbackSpeed={activeClip.speed}
                                zoomLevel={activeClip.zoomLevel}
                                zoomOrigin={activeClip.zoomOrigin}
                                centerControls={null}
                                onFrameChange={() => { }}
                            />
                            {/* Mini-timeline badge for multi-clip cells */}
                            {cellClips.length > 1 && (
                                <div className="absolute bottom-1 right-1 bg-black/60 text-white/80 text-[8px] font-bold px-1.5 py-0.5 rounded z-30">
                                    {cellClips.indexOf(activeClip!) + 1}/{cellClips.length}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
