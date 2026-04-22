import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Upload, Grid, List, Search, Wand2, Film, FolderOpen, Smartphone, Monitor, Square, Trash2, CheckSquare, Crown } from 'lucide-react';
import clsx from 'clsx';
import { useClipStore, Clip } from '../../store/clipStore';
import { useMediaStore, MediaFile } from '../../store/mediaStore';
import { useViewStore } from '../../store/viewStore';
import { useUserStore } from '../../store/userStore';
import { v4 as uuidv4 } from 'uuid';
import { MediaItem } from './MediaItem';
import { MediaDetailsPanel } from './MediaDetailsPanel';
import { toast } from '../../components/Toast';
import { confirm } from '../../components/ConfirmDialog';

export const MediaManagerTab: React.FC = () => {
    const { addClip, magnetizeClips, createGrid, setClips } = useClipStore();
    const { setActiveTab } = useViewStore();
    const { files, addFiles, removeFile, clearLibrary, orientationFilter, setOrientationFilter, selectedFileIds, toggleFileSelection, selectAllFiles, clearSelection } = useMediaStore();
    const { mediaManagerView } = useUserStore();
    const [viewMode, setViewMode] = useState<'grid' | 'list'>(mediaManagerView);
    const [searchQuery, setSearchQuery] = useState('');
    const [detailFileId, setDetailFileId] = useState<string | null>(null);

    const audioInputRef = useRef<HTMLInputElement>(null);

    // Automatically add imported files to the timeline/sequence
    const autoAddToTimeline = (newFiles: MediaFile[]) => {
        const fps = 30;
        for (const file of newFiles) {
            const durationFrames = Math.floor(file.duration * fps);

            if (file.type === 'video') {
                // Videos go to the main timeline (track 1)
                addClip({
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
                    origin: 'auto',
                    locked: false
                });
            } else if (file.type === 'audio') {
                // Audio goes to sequence only (track 2 — audio track, not rendered on main timeline)
                addClip({
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
                    track: 2,  // Audio track — shown in Sequence view only
                    speed: 1.0,
                    volume: 100,
                    reversed: false,
                    isMuted: false,
                    isPinned: false,
                    origin: 'auto',
                    locked: false
                });
            }
        }
        // Snap all track-1 clips back-to-back
        magnetizeClips();
    };

    const handleFileSelect = async (type: 'video' | 'audio' | 'folder') => {
        try {
            if (!window.ipcRenderer || !window.ipcRenderer.selectFiles) {
                console.error('IPC Renderer not available!');
                toast.error('File picker is not available. Please restart the app.');
                return;
            }

            // Pass the filter type to the main process
            const result = await window.ipcRenderer.selectFiles(type);

            if (result.success && result.files) {
                // Determine file durations and create MediaFiles
                const newFiles = await Promise.all(result.files.map(async (file) => {
                    let duration = 0;
                    let width = 0;
                    let height = 0;
                    let orientation: 'horizontal' | 'vertical' | 'square' = 'horizontal';
                    if (file.type === 'video') {
                        try {
                            const meta = await getMediaMetadata(file.path);
                            duration = meta.duration;
                            width = meta.width;
                            height = meta.height;
                            orientation = meta.orientation;
                        } catch (e) {
                            console.warn('Failed to get metadata for', file.path, e);
                        }
                    } else if (file.type === 'audio') {
                        try {
                            const el = document.createElement('audio');
                            el.preload = 'metadata';
                            el.src = `file://${file.path}`;
                            duration = await new Promise<number>((res, rej) => { el.onloadedmetadata = () => { res(el.duration); el.remove(); }; el.onerror = rej; });
                        } catch (e) {
                            console.warn('Failed to get duration for audio', file.path, e);
                        }
                    }
                    return {
                        id: uuidv4(),
                        path: file.path,
                        filename: file.filename,
                        type: file.type as 'video' | 'audio' | 'image',
                        duration,
                        width,
                        height,
                        orientation,
                        createdAt: Date.now()
                    };
                }));

                addFiles(newFiles);

                // Auto-add to timeline/sequence
                autoAddToTimeline(newFiles);
            }
        } catch (error) {
            console.error('Error in handleFileSelect:', error);
            toast.error('Failed to import files: ' + error);
        }
    };

    const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files;
        if (!fileList || fileList.length === 0) return;
        
        const newFiles: MediaFile[] = [];
        for (let i = 0; i < fileList.length; i++) {
            const file = fileList[i];
            const path = (file as any).path;
            
            // Extract duration
            let duration = 0;
            try {
                const el = document.createElement('audio');
                el.preload = 'metadata';
                el.src = `file://${path}`;
                duration = await new Promise<number>((res, rej) => { el.onloadedmetadata = () => { res(el.duration); el.remove(); }; el.onerror = rej; });
            } catch (err) {
                console.warn('Failed to get duration for audio', path, err);
            }
            
            newFiles.push({
                id: uuidv4(),
                path: path,
                filename: file.name,
                type: 'audio', // Force as audio even if it's an mp4
                duration,
                width: 0,
                height: 0,
                orientation: 'horizontal',
                createdAt: Date.now()
            });
        }
        
        addFiles(newFiles);
        autoAddToTimeline(newFiles);
        
        // Reset input
        e.target.value = '';
    };

    // Helper to get media duration AND dimensions
    const getMediaMetadata = (path: string): Promise<{ duration: number; width: number; height: number; orientation: 'horizontal' | 'vertical' | 'square' }> => {
        return new Promise((resolve, reject) => {
            const element = document.createElement('video');
            element.preload = 'metadata';
            element.src = `file://${path}`;

            element.onloadedmetadata = () => {
                const w = element.videoWidth;
                const h = element.videoHeight;
                const orientation = w > h ? 'horizontal' : h > w ? 'vertical' : 'square';
                resolve({ duration: element.duration, width: w, height: h, orientation });
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

    const handleCreateGridFromMedia = (fileId: string) => {
        const file = files.find(f => f.id === fileId);
        if (!file) return;

        const fps = 30;
        const durationFrames = Math.floor(file.duration * fps);

        // Generate a preview clip object to act as the initial cell
        const initialClip: Clip = {
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

        // Create a horizontal 4-cell grid, populated with the first item
        createGrid(4, 'horizontal', initialClip);

        // Jump to grid editor view
        setActiveTab('grideditor');
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

    const filteredFiles = files.filter((file) => {
        if (!file.filename.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        if (orientationFilter !== 'all' && file.type === 'video' && file.orientation !== orientationFilter) return false;
        return true;
    });

    const selectedFile = files.find(f => f.id === detailFileId) || null;
    const visibleFileIds = filteredFiles.map(f => f.id);
    const hasSelection = selectedFileIds.length > 0;

    // Click handler for MediaItem — supports Ctrl/Shift/plain click
    const handleItemClick = (fileId: string, e: React.MouseEvent) => {
        if (e.ctrlKey || e.metaKey) {
            toggleFileSelection(fileId, 'ctrl');
        } else if (e.shiftKey) {
            toggleFileSelection(fileId, 'shift', visibleFileIds);
        } else {
            // Plain click: open details panel + set as single selection
            setDetailFileId(fileId);
            toggleFileSelection(fileId, 'single');
        }
    };

    return (
        <div className="h-full w-full flex overflow-hidden">
            <input type="file" multiple ref={audioInputRef} accept="audio/*,video/*" className="hidden" onChange={handleAudioUpload} />
            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="p-8 gap-6 flex flex-col h-full overflow-y-auto">
                    {/* Header */}
                    <div className="flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-gradient-to-br from-primary to-secondary rounded-lg shadow-lg">
                                <FolderOpen size={20} className="text-white drop-shadow-md" />
                            </div>
                            <div>
                                <h2 className="text-lg font-black tracking-tight text-white">Media Library</h2>
                                <p className="text-xs text-white/50">Import and organize your media assets.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setViewMode('grid')}
                                className={clsx("p-2 rounded-lg transition-all border", viewMode === 'grid' ? 'bg-primary/20 text-primary border-primary/30' : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10 hover:text-white/80')}
                                title="Grid View"><Grid size={16} /></button>
                            <button onClick={() => setViewMode('list')}
                                className={clsx("p-2 rounded-lg transition-all border", viewMode === 'list' ? 'bg-primary/20 text-primary border-primary/30' : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10 hover:text-white/80')}
                                title="List View"><List size={16} /></button>
                            <div className="w-px h-5 bg-white/10 mx-1" />
                            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleFileSelect('folder')}
                                className="flex items-center gap-1.5 bg-primary/20 hover:bg-primary/40 text-primary-300 border border-primary/20 hover:border-primary/40 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all">
                                <FolderOpen size={12} /> Add Folder
                            </motion.button>
                            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleFileSelect('video')}
                                className="flex items-center gap-1.5 bg-primary/20 hover:bg-primary/40 text-primary border border-primary/20 hover:border-primary/40 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shadow-[0_0_10px_rgba(var(--color-primary),0.1)]">
                                <Upload size={12} /> Add Video
                            </motion.button>
                            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => audioInputRef.current?.click()}
                                className="flex items-center gap-1.5 bg-accent/20 hover:bg-accent/40 text-accent border border-accent/20 hover:border-accent/40 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all">
                                <Upload size={12} /> Add Audio
                            </motion.button>
                            {files.length > 0 && (
                                <>
                                    <div className="w-px h-5 bg-white/10 mx-1" />
                                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                        onClick={async () => { if (await confirm('Clear entire media library and timeline? This cannot be undone.', { title: 'Clear Library', confirmText: 'Clear All', variant: 'danger' })) { clearLibrary(); setClips([]); } }}
                                        className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/30 text-red-400 border border-red-500/15 hover:border-red-500/40 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all">
                                        <Trash2 size={12} /> Clear Library
                                    </motion.button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="flex items-center gap-3 py-2">
                        <span className="text-[10px] font-black text-white/30 uppercase tracking-widest mr-1">Quick:</span>
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setActiveTab('godmode')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300/70 hover:text-yellow-200 transition-all border border-yellow-500/10 hover:border-yellow-500/30 text-[10px] font-bold uppercase tracking-wider">
                            <Crown size={12} /> God Mode
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setActiveTab('trailer')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-primary/20 text-white/50 hover:text-primary-300 transition-all border border-white/5 hover:border-primary/30 text-[10px] font-bold uppercase tracking-wider">
                            <Wand2 size={12} /> Trailer Generator
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setActiveTab('timeline')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-accent/20 text-white/50 hover:text-accent transition-all border border-white/5 hover:border-accent/30 text-[10px] font-bold uppercase tracking-wider">
                            <Film size={12} /> Timeline Editor
                        </motion.button>
                        {files.length > 0 && (
                            <>
                                <div className="w-px h-5 bg-white/10 mx-1" />
                                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                    onClick={() => hasSelection ? clearSelection() : selectAllFiles()}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
                                        hasSelection
                                            ? 'bg-primary/20 text-primary-300 border-primary/30 hover:bg-primary/40'
                                            : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10'
                                    }`}>
                                    <CheckSquare size={12} />
                                    {hasSelection ? `${selectedFileIds.length} Selected — Clear` : 'Select All'}
                                </motion.button>
                                {hasSelection && (
                                    <span className="text-[9px] text-primary-300/60 font-mono">
                                        Trailer will use {selectedFileIds.length} of {files.filter(f => f.type === 'video').length} videos
                                    </span>
                                )}
                            </>
                        )}
                    </div>

                    {/* Search */}
                    <div className="flex-shrink-0 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
                        <input type="text" placeholder="Search media files..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-black/40 border border-white/5 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white font-bold outline-none focus:border-primary/50 transition-colors placeholder:text-white/20 placeholder:font-normal" />
                    </div>

                    {/* Orientation Filter Bar */}
                    {files.some(f => f.type === 'video') && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[10px] font-black text-white/30 uppercase tracking-widest mr-1">Orientation:</span>
                            {(['all', 'horizontal', 'vertical', 'square'] as const).map(o => {
                                const icons = { all: Grid, horizontal: Monitor, vertical: Smartphone, square: Square };
                                const Icon = icons[o];
                                const count = o === 'all' ? files.filter(f => f.type === 'video').length : files.filter(f => f.orientation === o).length;
                                return (
                                    <button key={o} onClick={() => setOrientationFilter(o)}
                                        className={clsx("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border",
                                            orientationFilter === o ? 'bg-primary/20 text-primary border-primary/30' : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10')}>
                                        <Icon size={12} />
                                        {o === 'all' ? 'All' : o.charAt(0).toUpperCase() + o.slice(1)}
                                        <span className="text-[9px] opacity-50">({count})</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Asset Grid */}
                    <div className="flex-1 min-h-0">
                        {files.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-12 border border-dashed border-white/10 rounded-xl bg-black/20">
                                <Upload className="text-white/15 mb-4" size={40} />
                                <h3 className="text-sm font-bold text-white/70 mb-1">No media imported yet</h3>
                                <p className="text-[10px] text-white/40 mb-6 max-w-xs">Import a folder of media or add individual files to your library.</p>
                                <div className="flex flex-col items-center gap-4">
                                    {/* Primary: Individual files */}
                                    <div className="flex gap-3">
                                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleFileSelect('video')}
                                            className="flex items-center gap-1.5 px-4 py-2 bg-primary/20 text-primary border border-primary/20 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-primary/40 transition-all">
                                            <Upload size={12} /> Add Video
                                        </motion.button>
                                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => audioInputRef.current?.click()}
                                            className="flex items-center gap-1.5 px-4 py-2 bg-accent/20 text-accent border border-accent/20 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-accent/40 transition-all">
                                            <Upload size={12} /> Add Audio
                                        </motion.button>
                                    </div>
                                    {/* Secondary: Folder import */}
                                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleFileSelect('folder')}
                                        className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-primary to-secondary text-white border border-primary/30 rounded-xl text-xs font-black uppercase tracking-wider hover:shadow-[0_0_25px_rgba(var(--color-primary),0.3)] transition-all shadow-lg">
                                        <FolderOpen size={16} /> Import Folder
                                    </motion.button>
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
                                        isSelected={file.id === detailFileId}
                                        isMultiSelected={selectedFileIds.includes(file.id)}
                                        viewMode={viewMode}
                                        onSelect={(e) => handleItemClick(file.id, e)}
                                        onAdd={() => handleAddClipToTimeline(file.id)}
                                        onGridAdd={() => handleCreateGridFromMedia(file.id)}
                                        onDelete={() => {
                                            removeFile(file.id);
                                            if (detailFileId === file.id) setDetailFileId(null);
                                        }}
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
                        onClose={() => setDetailFileId(null)}
                    />
                </div>
            )}
        </div>
    );
};
