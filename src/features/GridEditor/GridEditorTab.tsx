import React, { useState } from 'react';
import { useClipStore } from '../../store/clipStore';
import { GridClip, GridFormat } from '../../types';
import { LayoutGrid, Plus, Shuffle, Settings, Play, Pause } from 'lucide-react';
import { GridPlayer } from '../../components/GridPlayer';
import { ClipControls } from '../Timeline/ClipControls';
import { GlobalControls } from '../Timeline/GlobalControls';
import { GridMediaModal } from './GridMediaModal';

export const GridEditorTab: React.FC = () => {
    const { clips, createGrid, updateGrid, shuffleGridItems, deleteClip } = useClipStore();

    // Filter out only grids
    const gridClips = clips.filter(c => c.type === 'grid') as GridClip[];

    const [selectedGridId, setSelectedGridId] = useState<string | null>(gridClips.length > 0 ? gridClips[0].id : null);
    const selectedGrid = gridClips.find(g => g.id === selectedGridId) || null;

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentFrame, setCurrentFrame] = useState(0);
    const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
    const [showMediaModal, setShowMediaModal] = useState(false);

    // Determines the appropriate ID for ClipControls:
    // If a cell is active AND it has a clip, the controls target the clip. Otherwise they target the grid itself.
    let targetedClipId: string | null = null;
    if (selectedGrid) {
        if (selectedCellId) {
            const cell = selectedGrid.cells.find(c => c.id === selectedCellId);
            if (cell && cell.clip) {
                targetedClipId = cell.clip.id; // Wait... ClipControls can't update a sub-clip easily since it is not in the main clips array. 
                // We will just fall back to grid id if true sub-clip control isn't supported yet, but for now we pass the cell clip id if it exists (assuming clipStore handles it, though it doesn't currently)
                // Since updateClip only works on top level clips, we will just target the grid for now!
            }
        }
        targetedClipId = selectedGrid.id;
    }

    const handleCreateGrid = () => {
        createGrid(4, 'horizontal');
        // Select it on next render roughly
    };

    const handleShuffleItems = () => {
        if (selectedGrid) {
            shuffleGridItems(selectedGrid.id);
        }
    };

    const handleUpdateNumCells = (numCells: number) => {
        if (selectedGrid) {
            // Re-create cells array extending or trimming
            const newCells = Array.from({ length: numCells }).map((_, i) =>
                selectedGrid.cells[i] || { id: crypto.randomUUID(), clip: null, x: 0, y: 0, width: 1, height: 1 }
            );
            updateGrid(selectedGrid.id, { numCells, cells: newCells });
        }
    };

    return (
        <div className="h-full flex flex-row bg-background overflow-hidden text-white relative">
            {showMediaModal && selectedGrid && (
                <GridMediaModal
                    gridId={selectedGrid.id}
                    targetCellId={selectedCellId}
                    onClose={() => setShowMediaModal(false)}
                />
            )}

            {/* Left Panel: Grid List */}
            <div className="w-64 border-r border-white/5 bg-[#0a0a12] flex flex-col">
                <div className="p-4 border-b border-white/5 flex items-center justify-between">
                    <h2 className="font-bold flex items-center gap-2"><LayoutGrid size={16} /> Grids</h2>
                    <button onClick={handleCreateGrid} className="p-1 hover:bg-white/10 rounded" title="New Grid">
                        <Plus size={16} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {gridClips.length === 0 ? (
                        <div className="p-4 text-white/40 text-xs text-center">No grids created.</div>
                    ) : (
                        gridClips.map((grid) => (
                            <div
                                key={grid.id}
                                onClick={() => {
                                    setSelectedGridId(grid.id);
                                    setSelectedCellId(null);
                                }}
                                className={`p-3 rounded-lg cursor-pointer transition-colors border ${selectedGridId === grid.id ? 'bg-primary/20 border-primary/50' : 'bg-white/5 border-transparent hover:bg-white/10'}`}
                            >
                                <div className="font-semibold text-sm">{grid.filename}</div>
                                <div className="text-xs text-white/50">{grid.numCells} Cells | {grid.gridFormat}</div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Center: Preview */}
            <div className="flex-1 flex flex-col items-center justify-center bg-black/50 p-8 relative">
                {selectedGrid ? (
                    <div className="w-full max-w-4xl flex flex-col gap-4">
                        <div className="aspect-video bg-black rounded border border-white/10 relative overflow-hidden shadow-2xl flex items-center justify-center">
                            {/* Grid Player will go here */}
                            <GridPlayer
                                grid={selectedGrid}
                                currentFrame={currentFrame}
                                isPlaying={isPlaying}
                                onFrameChange={setCurrentFrame}
                                onCellClick={(cellId: string) => setSelectedCellId(selectedCellId === cellId ? null : cellId)}
                                selectedCellId={selectedCellId}
                            />
                        </div>

                        {/* Controls underneath player */}
                        {targetedClipId && (
                            <div className="w-full bg-[#0a0a12] rounded-xl border border-white/10 overflow-hidden shadow-xl mt-[-8px] z-10 mx-auto">
                                <ClipControls clipId={targetedClipId} variant="player" />
                            </div>
                        )}

                        {/* Transport */}
                        <div className="flex items-center justify-between bg-[#0d0d1a] p-3 rounded-xl border border-white/10 mx-auto w-full max-w-lg mt-2">
                            <button
                                onClick={() => setShowMediaModal(true)}
                                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition font-medium flex-1 text-center"
                            >
                                {selectedCellId ? 'Assign to Cell' : 'Add / Distribute Media'}
                            </button>
                            <div className="mx-4 flex items-center justify-center gap-4 flex-1">
                                <button onClick={() => setIsPlaying(!isPlaying)} className="w-10 h-10 bg-primary text-black flex items-center justify-center rounded-full hover:bg-primary/80 transition shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                                    {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-1" />}
                                </button>
                                <div className="text-xs font-mono text-white/50">{currentFrame}</div>
                            </div>
                            <div className="flex-1" />
                        </div>
                    </div>
                ) : (
                    <div className="text-white/40 flex flex-col items-center">
                        <LayoutGrid size={48} className="mb-4 opacity-50" />
                        Select or create a grid to edit
                    </div>
                )}
            </div>

            {/* Right Panel: Settings */}
            <div className="w-80 border-l border-white/5 bg-[#0a0a12] p-4 flex flex-col">
                <div className="flex items-center gap-2 border-b border-white/5 pb-4 mb-4">
                    <Settings size={16} className="text-white/50" />
                    <h3 className="font-bold">Grid Properties</h3>
                </div>

                {selectedGrid ? (
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-xs text-white/60 uppercase tracking-wider">Number of Cells</label>
                            <input
                                type="range"
                                min="2" max="12"
                                value={selectedGrid.numCells}
                                onChange={(e) => handleUpdateNumCells(parseInt(e.target.value))}
                                className="w-full accent-primary"
                                title="Number of Cells"
                            />
                            <div className="text-right text-xs font-mono text-primary">{selectedGrid.numCells}</div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs text-white/60 uppercase tracking-wider">Format</label>
                            <div className="flex bg-white/5 rounded-lg p-1 border border-white/10">
                                {(['horizontal', 'vertical', 'square'] as GridFormat[]).map((format) => (
                                    <button
                                        key={format}
                                        onClick={() => updateGrid(selectedGrid.id, { gridFormat: format })}
                                        className={`flex-1 text-xs font-medium py-1.5 capitalize rounded-md transition-all ${selectedGrid.gridFormat === format
                                            ? 'bg-primary text-white shadow-sm'
                                            : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                                            }`}
                                    >
                                        {format}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs text-white/60 uppercase tracking-wider">Background Mode</label>
                            <div className="flex bg-white/5 rounded-lg p-1 border border-white/10">
                                {(['blur', 'black'] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => updateGrid(selectedGrid.id, { backgroundMode: mode })}
                                        className={`flex-1 text-xs font-medium py-1.5 capitalize rounded-md transition-all ${selectedGrid.backgroundMode === mode
                                            ? 'bg-primary text-white shadow-sm'
                                            : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                                            }`}
                                    >
                                        {mode}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs text-white/60 uppercase tracking-wider">Duration (Seconds)</label>
                            <input
                                type="number"
                                value={Math.floor(selectedGrid.endFrame / 30)}
                                onChange={(e) => updateGrid(selectedGrid.id, {
                                    endFrame: parseInt(e.target.value) * 30,
                                    trimEndFrame: parseInt(e.target.value) * 30
                                })}
                                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm outline-none focus:border-primary/50"
                                title="Duration in Seconds"
                            />
                        </div>

                        <div className="pt-4 border-t border-white/5 space-y-3">
                            <button
                                onClick={handleShuffleItems}
                                className="w-full bg-white/10 hover:bg-white/20 text-white rounded px-3 py-2 text-sm flex items-center justify-center gap-2 transition"
                            >
                                <Shuffle size={14} /> Shuffle Cells
                            </button>
                            <button
                                onClick={() => {
                                    deleteClip(selectedGrid.id);
                                    setSelectedGridId(null);
                                }}
                                className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded px-3 py-2 text-sm transition"
                            >
                                Delete Grid
                            </button>
                        </div>

                        {/* Global Actions equivalent */}
                        <div className="pt-4 mt-4 border-t border-white/5">
                            <GlobalControls orientation="vertical" slim={false} className="w-full h-auto" containerWidth={300} />
                        </div>
                    </div>
                ) : (
                    <div className="text-white/30 text-xs text-center mt-10">No grid selected</div>
                )}
            </div>
        </div>
    );
};
