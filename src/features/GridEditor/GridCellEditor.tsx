import React, { useState } from 'react';
import { X, Plus, Trash2, ArrowRightLeft, Sparkles, Zap, ChevronUp, ChevronDown, Film } from 'lucide-react';
import { useClipStore, Clip } from '../../store/clipStore';
import { useMediaStore, MediaFile } from '../../store/mediaStore';
import { GridClip, GridCell } from '../../types';
import { v4 as uuidv4 } from 'uuid';

interface GridCellEditorProps {
    grid: GridClip;
    cellId: string;
    onClose: () => void;
}

export const GridCellEditor: React.FC<GridCellEditorProps> = ({ grid, cellId, onClose }) => {
    const { files } = useMediaStore();
    const { addClipToGridCell, removeClipFromGridCell, shuffleGridCellClips, fluxGridCellClips } = useClipStore();
    const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);

    const cell = grid.cells.find(c => c.id === cellId);
    if (!cell) return null;

    const cellIndex = grid.cells.indexOf(cell) + 1;
    const cellClips = cell.clips || (cell.clip ? [cell.clip] : []);
    const videoFiles = files.filter(f => f.type === 'video' || f.type === 'image');

    const handleToggleSelect = (id: string) => {
        setSelectedFileIds(prev =>
            prev.includes(id) ? prev.filter(fid => fid !== id) : [...prev, id]
        );
    };

    const handleAddSelected = () => {
        const selectedFiles = files.filter(f => selectedFileIds.includes(f.id));
        if (selectedFiles.length === 0) return;

        const fps = 30;
        const gridDurationFrames = grid.endFrame - grid.startFrame || 150;

        for (const file of selectedFiles) {
            const durationFrames = Math.floor(file.duration * fps);
            const newClip: Clip = {
                id: uuidv4(),
                mediaLibraryId: file.id,
                type: file.type,
                path: file.path,
                filename: file.filename,
                startFrame: 0,
                endFrame: gridDurationFrames,
                sourceDurationFrames: durationFrames,
                trimStartFrame: 0,
                trimEndFrame: durationFrames,
                track: 1,
                speed: 1.0,
                volume: 100,
                reversed: false,
                isMuted: false,
                isPinned: false,
                origin: 'manual',
                locked: false
            };
            addClipToGridCell(grid.id, cellId, newClip);
        }
        setSelectedFileIds([]);
    };

    return (
        <div className="h-full flex flex-col bg-[#080812] border-l border-white/10 animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-primary/10 to-transparent">
                <div>
                    <h3 className="font-bold text-white/90 text-sm flex items-center gap-2">
                        <Film size={14} className="text-primary" />
                        Cell {cellIndex} Editor
                    </h3>
                    <p className="text-[9px] text-white/40 mt-0.5">{cellClips.length} clip{cellClips.length !== 1 ? 's' : ''} in timeline</p>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors"
                >
                    <X size={16} />
                </button>
            </div>

            {/* Cell Controls */}
            {cellClips.length > 0 && (
                <div className="p-3 border-b border-white/5 flex gap-2">
                    <button
                        onClick={() => shuffleGridCellClips(grid.id, cellId)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-white/5 hover:border-white/20 active:scale-95"
                        title="Shuffle clips within this cell"
                    >
                        <ArrowRightLeft size={12} /> Shuffle
                    </button>
                    <button
                        onClick={() => fluxGridCellClips(grid.id, cellId)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-primary/20 hover:bg-primary/40 text-primary-light rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-primary/20 hover:border-primary/40 active:scale-95"
                        title="Randomize durations & segments within this cell"
                    >
                        <Sparkles size={12} /> Flux
                    </button>
                </div>
            )}

            {/* Cell Clip List (Mini-Timeline) */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {cellClips.length > 0 && (
                    <div className="p-3 space-y-1.5">
                        <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Cell Timeline</span>
                        {cellClips.map((clip, idx) => (
                            <div
                                key={clip.id}
                                className="flex items-center gap-2 bg-white/5 hover:bg-white/10 rounded-lg p-2 border border-white/5 group transition-all"
                            >
                                {/* Thumbnail */}
                                <div className="w-12 h-8 bg-black/50 rounded overflow-hidden flex-shrink-0">
                                    {clip.type === 'video' && (
                                        <video src={`file://${clip.path}`} className="w-full h-full object-cover" muted />
                                    )}
                                </div>
                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="text-[10px] text-white/80 truncate font-medium">{clip.filename}</div>
                                    <div className="text-[8px] text-white/30 font-mono">
                                        {((clip.trimEndFrame - clip.trimStartFrame) / 30).toFixed(1)}s • {clip.speed}x
                                    </div>
                                </div>
                                {/* Order badge */}
                                <span className="text-[9px] text-white/20 font-mono">{idx + 1}</span>
                                {/* Remove */}
                                <button
                                    onClick={() => removeClipFromGridCell(grid.id, cellId, clip.id)}
                                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 rounded text-red-400/60 hover:text-red-400 transition-all"
                                >
                                    <Trash2 size={11} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Media Picker */}
                <div className="p-3 border-t border-white/5">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Add Media</span>
                        {selectedFileIds.length > 0 && (
                            <button
                                onClick={handleAddSelected}
                                className="flex items-center gap-1 px-2.5 py-1 bg-primary hover:bg-primary/80 text-white text-[9px] font-bold uppercase rounded-md transition-all active:scale-95 shadow-lg"
                            >
                                <Plus size={10} /> Add {selectedFileIds.length}
                            </button>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 max-h-[300px] overflow-y-auto custom-scrollbar">
                        {videoFiles.map(file => {
                            const isSelected = selectedFileIds.includes(file.id);
                            return (
                                <div
                                    key={file.id}
                                    onClick={() => handleToggleSelect(file.id)}
                                    className={`relative border rounded-lg overflow-hidden cursor-pointer aspect-video bg-black/50 transition-all ${isSelected ? 'border-primary ring-1 ring-primary/50' : 'border-white/10 hover:border-white/30'}`}
                                >
                                    {file.type === 'video' ? (
                                        <video src={`file://${file.path}`} className="w-full h-full object-cover opacity-70" muted />
                                    ) : (
                                        <img src={`file://${file.path}`} className="w-full h-full object-cover opacity-70" alt="" />
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1 pt-4">
                                        <div className="text-[8px] text-white truncate font-medium">{file.filename}</div>
                                    </div>
                                    {isSelected && (
                                        <div className="absolute top-1 right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                                            <Plus size={10} className="text-white" />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {videoFiles.length === 0 && (
                        <div className="text-center py-6 text-white/20 text-[10px]">
                            No media in library. Import files first.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
