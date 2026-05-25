import React, { useState, useEffect } from 'react';
import { useClipStore } from '../../store/clipStore';
import { GridClip, GridFormat } from '../../types';
import { LayoutGrid, Plus, Play, Pause, Trash2, Settings, ChevronDown } from 'lucide-react';
import { GridPlayer } from '../../components/GridPlayer';
import { GridCellEditor } from './GridCellEditor';
import { GridGlobalControls } from './GridGlobalControls';

export const GridEditorTab: React.FC = () => {
    const { clips, createGrid, updateGrid, deleteClip, addClip } = useClipStore();

    // Filter out only grids
    const gridClips = clips.filter(c => c.type === 'grid') as GridClip[];

    const [selectedGridId, setSelectedGridId] = useState<string | null>(gridClips.length > 0 ? gridClips[0].id : null);
    const selectedGrid = gridClips.find(g => g.id === selectedGridId) || null;

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentFrame, setCurrentFrame] = useState(0);
    const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
    const [showNewGridMenu, setShowNewGridMenu] = useState(false);

    // Auto-select newly created grids
    useEffect(() => {
        if (gridClips.length > 0 && !selectedGrid) {
            setSelectedGridId(gridClips[gridClips.length - 1].id);
        }
    }, [gridClips.length]);

    // Check if selected grid is fully populated (all cells have clips)
    const isGridComplete = selectedGrid
        ? selectedGrid.cells.every(c => (c.clips && c.clips.length > 0) || c.clip)
        : false;

    const handleCreateGrid = (numCells: number, format: GridFormat) => {
        createGrid(numCells, format);
        setShowNewGridMenu(false);
        // The grid will be auto-selected on next render via the useEffect
    };

    const handleDeleteGrid = (gridId: string) => {
        deleteClip(gridId);
        setSelectedGridId(null);
        setSelectedCellId(null);
    };

    const handleUpdateNumCells = (numCells: number) => {
        if (selectedGrid) {
            const newCells = Array.from({ length: numCells }).map((_, i) =>
                selectedGrid.cells[i] || { id: crypto.randomUUID(), clip: null, clips: [], x: 0, y: 0, width: 1, height: 1 }
            );
            updateGrid(selectedGrid.id, { numCells, cells: newCells });
        }
    };

    // Auto-add completed grids to the trailer sequence
    const handleAddToSequence = () => {
        if (!selectedGrid || !isGridComplete) return;
        // The grid is already a clip in the clips array (added by createGrid).
        // It just needs to be placed properly on the timeline.
        const maxEnd = clips.reduce((max, c) => Math.max(max, c.endFrame), 0);
        updateGrid(selectedGrid.id, {
            startFrame: maxEnd,
            endFrame: maxEnd + (selectedGrid.endFrame - selectedGrid.startFrame)
        });
    };

    return (
        <div className="h-full flex flex-row bg-background overflow-hidden text-white relative">
            {/* Left Panel: Grid List */}
            <div className="w-56 border-r border-white/5 bg-[#0a0a12] flex flex-col flex-shrink-0">
                <div className="p-3 border-b border-white/5 flex items-center justify-between">
                    <h2 className="font-bold text-sm flex items-center gap-2">
                        <LayoutGrid size={14} className="text-primary" /> Grids
                    </h2>
                    <div className="relative">
                        <button
                            onClick={() => setShowNewGridMenu(!showNewGridMenu)}
                            className="p-1.5 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition-colors"
                            title="New Grid"
                        >
                            <Plus size={14} />
                        </button>
                        {/* New Grid Dropdown */}
                        {showNewGridMenu && (
                            <div className="absolute right-0 top-full mt-1 w-48 bg-[#111122] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in">
                                <div className="p-2 text-[9px] text-white/30 font-bold uppercase tracking-widest">Quick Create</div>
                                {[
                                    { label: '2-Split Horizontal', cells: 2, format: 'horizontal' as GridFormat },
                                    { label: '2-Split Vertical', cells: 2, format: 'vertical' as GridFormat },
                                    { label: '3-Panel', cells: 3, format: 'horizontal' as GridFormat },
                                    { label: '4-Grid', cells: 4, format: 'square' as GridFormat },
                                    { label: '6-Grid', cells: 6, format: 'horizontal' as GridFormat },
                                    { label: '9-Grid', cells: 9, format: 'square' as GridFormat },
                                ].map(preset => (
                                    <button
                                        key={preset.label}
                                        onClick={() => handleCreateGrid(preset.cells, preset.format)}
                                        className="w-full text-left px-3 py-2 text-[11px] text-white/70 hover:bg-primary/20 hover:text-white transition-colors flex items-center gap-2"
                                    >
                                        <LayoutGrid size={12} className="text-white/30" />
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
                    {gridClips.length === 0 ? (
                        <div className="p-4 text-white/30 text-[10px] text-center">
                            No grids yet.
                            <br />Click <Plus size={10} className="inline" /> to create one.
                        </div>
                    ) : (
                        gridClips.map((grid) => {
                            const filled = grid.cells.filter(c => (c.clips?.length > 0) || c.clip).length;
                            const complete = filled === grid.numCells;
                            return (
                                <div
                                    key={grid.id}
                                    onClick={() => {
                                        setSelectedGridId(grid.id);
                                        setSelectedCellId(null);
                                    }}
                                    className={`p-2.5 rounded-lg cursor-pointer transition-all border group ${selectedGridId === grid.id
                                        ? 'bg-primary/20 border-primary/50 shadow-lg shadow-primary/10'
                                        : 'bg-white/5 border-transparent hover:bg-white/10 hover:border-white/10'}`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="font-semibold text-[11px] truncate">{grid.filename}</div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteGrid(grid.id); }}
                                            className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 rounded text-red-400/60 hover:text-red-400 transition-all"
                                        >
                                            <Trash2 size={10} />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[9px] text-white/40">{grid.numCells} cells</span>
                                        <span className="text-[9px] text-white/30">•</span>
                                        <span className="text-[9px] text-white/40">{grid.gridFormat}</span>
                                        {complete && (
                                            <span className="text-[8px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full font-bold ml-auto">✓</span>
                                        )}
                                    </div>
                                    {/* Fill progress bar */}
                                    <div className="mt-1.5 h-0.5 bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${complete ? 'bg-emerald-500' : 'bg-primary/60'}`}
                                            style={{ width: `${(filled / grid.numCells) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Center: Preview & Transport */}
            <div className="flex-1 flex flex-col items-center justify-center bg-black/40 relative min-w-0">
                {selectedGrid ? (
                    <div className="w-full h-full flex flex-col p-4">
                        {/* Grid Preview */}
                        <div className="flex-1 min-h-0 flex items-center justify-center">
                            <div className="w-full max-w-3xl aspect-video bg-black rounded-xl border border-white/10 relative overflow-hidden shadow-2xl">
                                <GridPlayer
                                    grid={selectedGrid}
                                    currentFrame={currentFrame}
                                    isPlaying={isPlaying}
                                    onFrameChange={setCurrentFrame}
                                    onCellClick={(cellId: string) => setSelectedCellId(selectedCellId === cellId ? null : cellId)}
                                    selectedCellId={selectedCellId}
                                />
                            </div>
                        </div>

                        {/* Transport Bar */}
                        <div className="flex items-center justify-center gap-4 py-3 mt-2">
                            <button
                                onClick={() => setIsPlaying(!isPlaying)}
                                className="w-10 h-10 bg-primary text-black flex items-center justify-center rounded-full hover:bg-primary/80 transition shadow-lg shadow-primary/20"
                            >
                                {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
                            </button>
                            <div className="text-[10px] font-mono text-white/40">Frame {currentFrame}</div>

                            {/* Grid Settings Inline */}
                            <div className="flex items-center gap-2 ml-4">
                                <label className="text-[9px] text-white/30 uppercase">Cells</label>
                                <input
                                    type="range"
                                    min="2" max="12"
                                    value={selectedGrid.numCells}
                                    onChange={(e) => handleUpdateNumCells(parseInt(e.target.value))}
                                    className="w-20 accent-primary h-1"
                                    title="Number of Cells"
                                />
                                <span className="text-[10px] font-mono text-primary">{selectedGrid.numCells}</span>
                            </div>

                            <div className="flex items-center gap-1 ml-2">
                                {(['horizontal', 'vertical', 'square'] as GridFormat[]).map(fmt => (
                                    <button
                                        key={fmt}
                                        onClick={() => updateGrid(selectedGrid.id, { gridFormat: fmt })}
                                        className={`px-2 py-1 rounded text-[9px] font-bold uppercase transition-all ${selectedGrid.gridFormat === fmt
                                            ? 'bg-primary/30 text-primary border border-primary/30'
                                            : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10'}`}
                                    >
                                        {fmt.charAt(0)}
                                    </button>
                                ))}
                            </div>

                            {isGridComplete && (
                                <button
                                    onClick={handleAddToSequence}
                                    className="ml-4 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 rounded-lg text-[9px] font-bold uppercase tracking-wider border border-emerald-500/20 hover:border-emerald-500/40 transition-all active:scale-95"
                                >
                                    ✓ Add to Sequence
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="text-white/30 flex flex-col items-center">
                        <LayoutGrid size={48} className="mb-4 opacity-30" />
                        <p className="text-sm">Select or create a grid to begin</p>
                        <button
                            onClick={() => handleCreateGrid(4, 'horizontal')}
                            className="mt-4 px-4 py-2 bg-primary/20 hover:bg-primary/40 text-primary border border-primary/20 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                        >
                            <Plus size={12} className="inline mr-1" /> Create 4-Grid
                        </button>
                    </div>
                )}
            </div>

            {/* Right Panel: Context-Sensitive Sidebar */}
            {selectedGrid && (
                <div className="w-72 flex-shrink-0">
                    {selectedCellId ? (
                        <GridCellEditor
                            grid={selectedGrid}
                            cellId={selectedCellId}
                            onClose={() => setSelectedCellId(null)}
                        />
                    ) : (
                        <GridGlobalControls grid={selectedGrid} />
                    )}
                </div>
            )}
        </div>
    );
};
