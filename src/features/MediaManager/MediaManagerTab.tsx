import React, { useState } from 'react';
import { Upload, Grid, List, Search } from 'lucide-react';
import { useClipStore, Clip } from '../../store/clipStore';
import { useMediaStore, MediaFile } from '../../store/mediaStore';
import { v4 as uuidv4 } from 'uuid';
import { MediaItem } from './MediaItem';
import { MediaDetailsPanel } from './MediaDetailsPanel';

export const MediaManagerTab: React.FC = () => {
    const { addClip } = useClipStore();
    const { files, addFiles } = useMediaStore();
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

    const handleFileSelect = async (type: 'video' | 'audio') => {
        try {
            if (!window.ipcRenderer || !window.ipcRenderer.selectFiles) {
                console.error('IPC Renderer not available!');
                alert('File picker is not available. Please restart the app.');
                return;
            }

            // Pass the filter type to the main process
            const result = await window.ipcRenderer.selectFiles(type);

            if (result.success && result.files) {
                // Determine file durations and create MediaFiles
                const newFiles = await Promise.all(result.files.map(async (file) => {
                    let duration = 0;
                    if (file.type === 'video' || file.type === 'audio') {
                        try {
                            duration = await getMediaDuration(file.path);
                        } catch (e) {
                            console.warn('Failed to get duration for', file.path, e);
                        }
                    }
                    return {
                        id: uuidv4(), // Generate ID for the library item
                        path: file.path,
                        filename: file.filename,
                        type: file.type as 'video' | 'audio' | 'image',
                        duration: duration,
                        createdAt: Date.now()
                    };
                }));

                addFiles(newFiles);
            }
        } catch (error) {
            console.error('Error in handleFileSelect:', error);
            alert('Failed to import files: ' + error);
        }
    };

    // Helper to get media duration
    const getMediaDuration = (path: string): Promise<number> => {
        return new Promise((resolve, reject) => {
            const element = document.createElement('video');
            element.preload = 'metadata';
            element.src = `file://${path}`;

            element.onloadedmetadata = () => {
                resolve(element.duration);
                element.remove();
            };

            element.onerror = (e) => {
                reject(e);
                element.remove();
            };
        });
    };

    const handleAddClipToTimeline = (fileId: string) => {
        const file = files.find(f => f.id === fileId);
        if (!file) return;

        // Check if this specific MediaFile is already used on the timeline
        const { clips } = useClipStore.getState();
        const isUsed = clips.some(c => c.mediaLibraryId === fileId);

        let targetFile = file;

        // If used, DUPLICATE the media file in the library first
        if (isUsed) {
            const newFile: MediaFile = {
                ...file,
                id: uuidv4(),
                // We keep the same filename or append copy, user preference usually implies visual duplicate
                // But typically bins show "Name" and "Name". Let's append copy to be clear it's a new instance.
                filename: file.filename, // User can rename if they want, or we can auto-increment. 
                // Let's keep filename identical so it looks like a clean clone as per "Duplicate items... show the duplicates".
                createdAt: Date.now()
            };
            addFiles([newFile]);
            targetFile = newFile;
        }

        const fps = 30;
        const durationFrames = Math.floor(targetFile.duration * fps);

        addClip({
            id: uuidv4(), // New ID for timeline instance
            mediaLibraryId: targetFile.id, // Link to the specific Media Library item used
            type: targetFile.type,
            path: targetFile.path,
            filename: targetFile.filename,
            startFrame: 0,
            endFrame: durationFrames || 150, // Default 5s if 0
            sourceDurationFrames: durationFrames,
            trimStartFrame: 0,
            trimEndFrame: durationFrames,
            track: 1, // Default to track 1
            speed: 1.0,
            volume: 100,
            reversed: false,
            isMuted: false,
            isPinned: false,
            origin: 'manual',
            locked: false
        });
    };

    // Helper to adapt MediaFile to Clip for display
    const fileToClipPreview = (file: MediaFile): Clip => {
        const fps = 30;
        const durationFrames = Math.floor(file.duration * fps);
        return {
            id: file.id,
            type: file.type,
            path: file.path,
            filename: file.filename,
            startFrame: 0,
            endFrame: durationFrames || 150,
            sourceDurationFrames: durationFrames,
            trimStartFrame: 0,
            trimEndFrame: durationFrames,
            speed: 1.0,
            volume: 100,
            track: 0, // Preview only
            reversed: false,
            isMuted: false,
            isPinned: false,
            origin: 'manual',
            locked: false
        };
    };

    const filteredFiles = files.filter((file) =>
        file.filename.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const selectedFile = files.find(f => f.id === selectedFileId) || null;

    return (
        <div className="h-full w-full flex overflow-hidden">
            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="p-8 gap-6 flex flex-col h-full overflow-y-auto">
                    {/* Header */}
                    <div className="flex items-center justify-between flex-shrink-0">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">Media Library</h1>
                            <p className="text-white/50 text-sm mt-1">Import and organize your media assets.</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-primary text-white' : 'bg-white/5 text-white/60'}`}
                                title="Grid View"
                            >
                                <Grid size={18} />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-primary text-white' : 'bg-white/5 text-white/60'}`}
                                title="List View"
                            >
                                <List size={18} />
                            </button>
                            <button
                                onClick={() => handleFileSelect('video')}
                                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                            >
                                <Upload size={18} />
                                Add Video
                            </button>
                            <button
                                onClick={() => handleFileSelect('audio')}
                                className="flex items-center gap-2 bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                            >
                                <Upload size={18} />
                                Add Audio
                            </button>
                        </div>
                    </div>

                    {/* Search */}
                    <div className="flex-shrink-0 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                        <input
                            type="text"
                            placeholder="Search media files..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-[#0a0a15] border border-white/10 rounded-lg pl-10 pr-4 py-3 text-white focus:outline-none focus:border-primary/50 transition-colors"
                        />
                    </div>

                    {/* Asset Grid */}
                    <div className="flex-1 min-h-0">
                        {files.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-white/10 rounded-2xl bg-white/5">
                                <Upload className="text-white/20 mb-4" size={48} />
                                <h3 className="text-xl font-semibold text-white/80 mb-2">No media imported yet</h3>
                                <p className="text-white/40 text-sm mb-6 max-w-sm">
                                    Click "Import Media" to add video, audio, or image files to your library.
                                </p>
                                <div className="flex gap-4">
                                    <button
                                        onClick={() => handleFileSelect('video')}
                                        className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                                    >
                                        <Upload size={18} />
                                        Add Video
                                    </button>
                                    <button
                                        onClick={() => handleFileSelect('audio')}
                                        className="flex items-center gap-2 px-6 py-3 bg-pink-600 text-white font-medium rounded-lg hover:bg-pink-700 transition-colors"
                                    >
                                        <Upload size={18} />
                                        Add Audio
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className={viewMode === 'grid'
                                ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-4"
                                : "flex flex-col gap-2 pb-4"
                            }>
                                {filteredFiles.map((file) => (
                                    <MediaItem
                                        key={file.id}
                                        clip={fileToClipPreview(file)}
                                        isSelected={file.id === selectedFileId}
                                        viewMode={viewMode}
                                        onSelect={() => setSelectedFileId(file.id)}
                                        onAdd={() => handleAddClipToTimeline(file.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Right Sidebar: Details Panel */}
            {selectedFile && (
                <div className="w-80 border-l border-white/10 bg-[#0A0A0A] flex-shrink-0 overflow-y-auto">
                    <MediaDetailsPanel
                        clip={fileToClipPreview(selectedFile)}
                        onClose={() => setSelectedFileId(null)}
                    />
                </div>
            )}
        </div>
    );
};
