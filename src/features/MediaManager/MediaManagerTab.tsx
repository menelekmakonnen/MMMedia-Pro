import React, { useState } from 'react';
import { Upload, Grid, List, Search } from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import { v4 as uuidv4 } from 'uuid';
import { MediaItem } from './MediaItem';
import { MediaDetailsPanel } from './MediaDetailsPanel';

export const MediaManagerTab: React.FC = () => {
    const { clips, addClip } = useClipStore();
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

    const handleFileSelect = async () => {
        try {
            if (!window.ipcRenderer || !window.ipcRenderer.selectFiles) {
                console.error('IPC Renderer not available!');
                alert('File picker is not available. Please restart the app.');
                return;
            }

            const result = await window.ipcRenderer.selectFiles();

            if (result.success && result.files) {
                // Determine file durations
                const filesWithDuration = await Promise.all(result.files.map(async (file) => {
                    let duration = 0;
                    if (file.type === 'video' || file.type === 'audio') {
                        try {
                            duration = await getMediaDuration(file.path);
                        } catch (e) {
                            console.warn('Failed to get duration for', file.path, e);
                        }
                    }
                    return { ...file, duration };
                }));

                filesWithDuration.forEach((file) => {
                    const fps = 30;
                    const durationFrames = Math.floor(file.duration * fps);

                    addClip({
                        id: uuidv4(),
                        type: file.type as 'video' | 'audio' | 'image',
                        path: file.path,
                        filename: file.filename,
                        startFrame: 0,
                        endFrame: durationFrames || 150, // Default 5s if 0
                        sourceDurationFrames: durationFrames,
                        trimStartFrame: 0,
                        trimEndFrame: durationFrames,
                        speed: 1.0,
                        volume: 100,
                        isMuted: false,
                        isPinned: false,
                    });
                });
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

    const handleAddClipToTimeline = (clipId: string) => {
        const clip = clips.find(c => c.id === clipId);
        if (clip) {
            addClip({ ...clip, id: uuidv4() });
        }
    };

    const filteredClips = clips.filter((clip) =>
        clip.filename.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const selectedClip = clips.find(c => c.id === selectedClipId) || null;

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
                            >
                                <Grid size={18} />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-primary text-white' : 'bg-white/5 text-white/60'}`}
                            >
                                <List size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Search and Import */}
                    <div className="flex gap-3 flex-shrink-0">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                            <input
                                type="text"
                                placeholder="Search media files..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-[#0a0a15] border border-white/10 rounded-lg pl-10 pr-4 py-3 text-white focus:outline-none focus:border-primary/50 transition-colors"
                            />
                        </div>
                        <button
                            onClick={handleFileSelect}
                            className="flex items-center gap-2 px-6 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-colors shadow-lg shadow-white/10"
                        >
                            <Upload size={18} />
                            Import Media
                        </button>
                    </div>

                    {/* Asset Grid */}
                    <div className="flex-1 min-h-0">
                        {clips.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-white/10 rounded-2xl bg-white/5">
                                <Upload className="text-white/20 mb-4" size={48} />
                                <h3 className="text-xl font-semibold text-white/80 mb-2">No media imported yet</h3>
                                <p className="text-white/40 text-sm mb-6 max-w-sm">
                                    Click "Import Media" to add video, audio, or image files to your library.
                                </p>
                                <button
                                    onClick={handleFileSelect}
                                    className="flex items-center gap-2 px-6 py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary/80 transition-colors"
                                >
                                    <Upload size={18} />
                                    Import Your First File
                                </button>
                            </div>
                        ) : (
                            <div className={viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-8' : 'flex flex-col gap-2 pb-8'}>
                                {filteredClips.map((clip) => (
                                    <MediaItem
                                        key={clip.id}
                                        clip={clip}
                                        isSelected={clip.id === selectedClipId}
                                        viewMode={viewMode}
                                        onSelect={() => setSelectedClipId(clip.id)}
                                        onAdd={() => handleAddClipToTimeline(clip.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Right Sidebar: Details Panel (conditionally rendered or always present but empty state) */}
            {selectedClip && (
                <MediaDetailsPanel
                    clip={selectedClip}
                    onClose={() => setSelectedClipId(null)}
                />
            )}
        </div>
    );
};
