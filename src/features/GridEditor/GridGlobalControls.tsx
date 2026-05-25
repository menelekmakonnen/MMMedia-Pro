import React from 'react';
import { ArrowRightLeft, Sparkles, Zap, Upload, LayoutGrid, Layers } from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import { useMediaStore } from '../../store/mediaStore';
import { GridClip } from '../../types';

interface GridGlobalControlsProps {
    grid: GridClip;
}

export const GridGlobalControls: React.FC<GridGlobalControlsProps> = ({ grid }) => {
    const { shuffleGridItems, globalFluxGrid, globalChaosGrid, distributeMediaToGrid } = useClipStore();
    const { files } = useMediaStore();

    const videoFiles = files.filter(f => f.type === 'video' || f.type === 'image');
    const filledCells = grid.cells.filter(c => (c.clips && c.clips.length > 0) || c.clip).length;
    const totalClips = grid.cells.reduce((sum, c) => sum + (c.clips?.length || (c.clip ? 1 : 0)), 0);

    const handleAutoDistribute = () => {
        if (videoFiles.length === 0) return;
        distributeMediaToGrid(grid.id, videoFiles);
    };

    return (
        <div className="h-full flex flex-col bg-[#080812] border-l border-white/10">
            {/* Header */}
            <div className="p-4 border-b border-white/5 bg-gradient-to-r from-accent/10 to-transparent">
                <h3 className="font-bold text-white/90 text-sm flex items-center gap-2">
                    <LayoutGrid size={14} className="text-accent" />
                    Grid Controls
                </h3>
                <p className="text-[9px] text-white/40 mt-0.5">
                    {grid.numCells} cells • {filledCells} filled • {totalClips} total clips
                </p>
            </div>

            {/* Grid Stats */}
            <div className="p-3 border-b border-white/5">
                <div className="grid grid-cols-3 gap-2">
                    <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                        <div className="text-[8px] font-black uppercase text-white/30 tracking-widest">Cells</div>
                        <div className="text-lg font-black text-white">{grid.numCells}</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                        <div className="text-[8px] font-black uppercase text-white/30 tracking-widest">Filled</div>
                        <div className="text-lg font-black text-primary">{filledCells}</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                        <div className="text-[8px] font-black uppercase text-white/30 tracking-widest">Clips</div>
                        <div className="text-lg font-black text-accent">{totalClips}</div>
                    </div>
                </div>
            </div>

            {/* Auto-Distribute */}
            <div className="p-3 border-b border-white/5 space-y-2">
                <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Media Distribution</span>
                <button
                    onClick={handleAutoDistribute}
                    disabled={videoFiles.length === 0}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-primary to-secondary text-white font-bold text-[10px] uppercase tracking-wider rounded-lg transition-all hover:shadow-[0_0_15px_rgba(var(--color-primary),0.3)] active:scale-95 disabled:opacity-40 disabled:grayscale border border-primary/30"
                >
                    <Upload size={12} /> Auto-Distribute ({videoFiles.length} files)
                </button>
                <p className="text-[8px] text-white/25">
                    Evenly distributes your media library across all {grid.numCells} cells.
                </p>
            </div>

            {/* Global Actions */}
            <div className="p-3 space-y-2">
                <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Global Controls</span>
                <div className="space-y-2">
                    <button
                        onClick={() => shuffleGridItems(grid.id)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-white/5 hover:border-white/20 active:scale-95"
                        title="Shuffle clip assignments across all cells"
                    >
                        <ArrowRightLeft size={14} /> Shuffle All Cells
                    </button>

                    <button
                        onClick={() => globalFluxGrid(grid.id)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary/20 hover:bg-primary/40 text-primary-light rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-primary/20 hover:border-primary/40 active:scale-95 shadow-[0_0_10px_rgba(var(--color-primary),0.1)]"
                        title="Randomize durations & segments across all cells"
                    >
                        <Sparkles size={14} /> Flux All Cells
                    </button>

                    <button
                        onClick={() => globalChaosGrid(grid.id)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-red-500/10 hover:border-red-500/30 active:scale-95"
                        title="Shuffle + Flux everything"
                    >
                        <Zap size={14} fill="currentColor" /> Chaos Mode
                    </button>
                </div>
            </div>

            {/* Grid Properties */}
            <div className="p-3 border-t border-white/5 mt-auto">
                <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Properties</span>
                <div className="mt-2 space-y-1.5 text-[10px]">
                    <div className="flex justify-between text-white/50">
                        <span>Format</span>
                        <span className="font-mono text-white/70">{grid.gridFormat}</span>
                    </div>
                    <div className="flex justify-between text-white/50">
                        <span>Duration</span>
                        <span className="font-mono text-white/70">{((grid.endFrame - grid.startFrame) / 30).toFixed(1)}s</span>
                    </div>
                    <div className="flex justify-between text-white/50">
                        <span>Background</span>
                        <span className="font-mono text-white/70">{grid.backgroundMode}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
