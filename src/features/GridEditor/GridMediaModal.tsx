import React, { useState } from 'react';
import { X, Upload, CheckCircle2, LayoutGrid } from 'lucide-react';
import { useMediaStore, MediaFile } from '../../store/mediaStore';
import { useClipStore, Clip } from '../../store/clipStore';
import { v4 as uuidv4 } from 'uuid';

interface GridMediaModalProps {
    gridId: string;
    targetCellId?: string | null;
    onClose: () => void;
}

export const GridMediaModal: React.FC<GridMediaModalProps> = ({ gridId, targetCellId, onClose }) => {
    const { files, addFiles } = useMediaStore();
    const { updateGridCell, distributeMediaToGrid, clips } = useClipStore();
    const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);

    const grid = clips.find(c => c.id === gridId && c.type === 'grid');
    if (!grid) return null;

    const handleToggleSelect = (id: string) => {
        if (targetCellId) {
            // Single selection mode for specific cell
            setSelectedFileIds([id]);
        } else {
            // Multi-selection mode for distribution
            setSelectedFileIds(prev =>
                prev.includes(id) ? prev.filter(fid => fid !== id) : [...prev, id]
            );
        }
    };

    const handleApply = () => {
        const selectedFiles = files.filter(f => selectedFileIds.includes(f.id));
        if (selectedFiles.length === 0) return;

        if (targetCellId) {
            // Apply single clip to cell
            const file = selectedFiles[0];
            const fps = 30;
            const durationFrames = Math.floor(file.duration * fps);

            const newClip: Clip = {
                id: uuidv4(),
                mediaLibraryId: file.id,
                type: file.type,
                path: file.path,
                filename: file.filename,
                startFrame: 0,
                endFrame: durationFrames || 150,
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
            updateGridCell(gridId, targetCellId, { clip: newClip });
        } else {
            // Distribute multiple clips to entire grid
            distributeMediaToGrid(gridId, selectedFiles);
        }

        onClose();
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;
        const newFiles = Array.from(e.target.files);
        const addedFiles = await Promise.all(newFiles.map(async (file) => {
            const path = URL.createObjectURL(file); // Stub path for web, in electron it uses ipcRenderer usually but this is a stub
            // Assuming simplified mock since this is UI
            const newFile: MediaFile = {
                id: uuidv4(),
                filename: file.name,
                path: path,
                type: file.type.startsWith('image/') ? 'image' : 'video',
                size: file.size,
                duration: 5 // Mock 5s duration for created object URLs
            };
            return newFile;
        }));

        // Since we don't have direct access to standard electron window.ipcRenderer here for metadata cleanly, we'll mock it for the UI implementation
        addFiles(addedFiles);
        setSelectedFileIds(prev => [...prev, ...addedFiles.map(f => f.id)]);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-[#0a0a12] border border-white/10 rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
                    <div>
                        <h2 className="text-lg font-bold flex items-center gap-2">
                            <LayoutGrid className="text-primary" size={20} />
                            {targetCellId ? 'Assign Media to Cell' : 'Distribute Media to Grid'}
                        </h2>
                        <p className="text-white/50 text-xs mt-1">
                            {targetCellId
                                ? 'Select a single video or image for the chosen grid cell.'
                                : 'Select multiple videos to auto-distribute across all cells.'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition text-white/50 hover:text-white" title="Close" aria-label="Close">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <div className="grid grid-cols-3 gap-3">
                        {/* Upload Button */}
                        <label className="border-2 border-dashed border-white/20 hover:border-primary/50 hover:bg-white/5 rounded-xl flex flex-col items-center justify-center aspect-video cursor-pointer transition group">
                            <Upload className="text-white/40 group-hover:text-primary transition" size={24} />
                            <span className="text-xs text-white/60 font-medium mt-2">Upload Files</span>
                            <input type="file" className="hidden" multiple={!targetCellId} accept="video/*,image/*" onChange={handleFileUpload} />
                        </label>

                        {/* Existing Files */}
                        {files.filter(f => f.type === 'video' || f.type === 'image').map(file => {
                            const isSelected = selectedFileIds.includes(file.id);
                            return (
                                <div
                                    key={file.id}
                                    onClick={() => handleToggleSelect(file.id)}
                                    className={`relative border rounded-xl overflow-hidden cursor-pointer aspect-video bg-black/50 transition-all ${isSelected ? 'border-primary ring-2 ring-primary/50' : 'border-white/10 hover:border-white/30'}`}
                                >
                                    {file.type === 'video' ? (
                                        <video src={file.path} className="w-full h-full object-cover opacity-70" muted />
                                    ) : (
                                        <img src={file.path} className="w-full h-full object-cover opacity-70" alt="" />
                                    )}

                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6">
                                        <div className="text-xs text-white truncate font-medium drop-shadow-md">{file.filename}</div>
                                    </div>

                                    {isSelected && (
                                        <div className="absolute top-2 right-2 bg-primary text-white rounded-full p-0.5 shadow-lg">
                                            <CheckCircle2 size={16} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {files.length === 0 && (
                        <div className="text-center py-10 text-white/30 text-sm">
                            No media found in library. Upload some files to start.
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-white/10 bg-white/5 flex items-center justify-between">
                    <div className="text-xs text-white/50">
                        {selectedFileIds.length} file{selectedFileIds.length !== 1 ? 's' : ''} selected
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 hover:bg-white/10 rounded-lg text-sm text-white/80 transition">
                            Cancel
                        </button>
                        <button
                            onClick={handleApply}
                            disabled={selectedFileIds.length === 0}
                            className="px-6 py-2 bg-primary hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-lg transition"
                        >
                            {targetCellId ? 'Apply to Cell' : 'Auto-Distribute'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
