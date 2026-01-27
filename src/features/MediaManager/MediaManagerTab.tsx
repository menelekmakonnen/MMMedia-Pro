import React, { useState } from 'react';
import { Upload, Grid, List, Search } from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import { v4 as uuidv4 } from 'uuid';

export const MediaManagerTab: React.FC = () => {
    const { clips, addClip } = useClipStore();
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [searchQuery, setSearchQuery] = useState('');

    const handleFileSelect = async () => {
        try {
            console.log('handleFileSelect called');
            console.log('window.ipcRenderer:', window.ipcRenderer);

            if (!window.ipcRenderer || !window.ipcRenderer.selectFiles) {
                console.error('IPC Renderer not available!');
                alert('File picker is not available. Please restart the app.');
                return;
            }

            const result = await window.ipcRenderer.selectFiles();
            console.log('selectFiles result:', result);

            if (result.success && result.files) {
                result.files.forEach((file) => {
                    addClip({
                        id: uuidv4(),
                        type: file.type as 'video' | 'audio' | 'image',
                        path: file.path,
                        filename: file.filename,
                        startFrame: 0,
                        endFrame: 0,
                        sourceDurationFrames: 0, // Will be updated by ffprobe
                        trimStartFrame: 0,
                        trimEndFrame: 0,
                        track: 0,
                        speed: 1.0,
                        volume: 1.0,
                        reversed: false,
                        locked: false,
                    });
                });
                console.log(`Added ${result.files.length} files to library`);
            } else if (result.canceled) {
                console.log('File selection canceled');
            } else {
                console.error('File selection failed:', result);
            }
        } catch (error) {
            console.error('Error in handleFileSelect:', error);
            alert('Failed to import files: ' + error);
        }
    };

    const filteredClips = clips.filter((clip) =>
        clip.filename.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="h-full w-full flex flex-col p-8 gap-6 overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Media Library</h1>
                    <p className="text-white/50 text-sm mt-1">Import and organize your media assets.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-primary text-white' : 'bg-white/5 text-white/60'
                            }`}
                    >
                        <Grid size={18} />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-primary text-white' : 'bg-white/5 text-white/60'
                            }`}
                    >
                        <List size={18} />
                    </button>
                </div>
            </div>

            {/* Search and Import */}
            <div className="flex gap-3">
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
            {clips.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-white/10 rounded-2xl">
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
                <div className={viewMode === 'grid' ? 'grid grid-cols-4 gap-4' : 'flex flex-col gap-2'}>
                    {filteredClips.map((clip) => (
                        <div
                            key={clip.id}
                            className={`bg-white/5 border border-white/10 rounded-lg p-4 hover:bg-white/10 transition-colors cursor-pointer ${viewMode === 'list' ? 'flex items-center gap-4' : ''
                                }`}
                        >
                            <div className={`${viewMode === 'grid' ? 'aspect-video' : 'w-20 h-14'} bg-black/50 rounded mb-3 flex items-center justify-center overflow-hidden`}>
                                {clip.type === 'video' && clip.path && (
                                    <video
                                        src={`file://${clip.path}`}
                                        className="w-full h-full object-cover"
                                        muted
                                    />
                                )}
                                {clip.type === 'image' && clip.path && (
                                    <img
                                        src={`file://${clip.path}`}
                                        className="w-full h-full object-cover"
                                        alt={clip.filename}
                                    />
                                )}
                                {clip.type === 'audio' && (
                                    <div className="text-white/40 text-xs">Audio</div>
                                )}
                            </div>
                            <div className="flex-1">
                                <div className="text-sm font-medium text-white/90 truncate">{clip.filename}</div>
                                <div className="text-xs text-white/40 mt-1">{clip.type.toUpperCase()}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
