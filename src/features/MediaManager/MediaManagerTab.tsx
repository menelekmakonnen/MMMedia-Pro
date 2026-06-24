import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Upload, Grid, List, Search, Wand2, Film, FolderOpen, Smartphone, Monitor, Square, Trash2, CheckSquare, Crown, Plus, FileVideo, FileAudio, X, Clock, Music, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import clsx from 'clsx';
import { useClipStore, Clip } from '../../store/clipStore';
import { useMediaStore, MediaFile } from '../../store/mediaStore';
import { useViewStore } from '../../store/viewStore';
import { useUserStore } from '../../store/userStore';
import { useGodModeStore } from '../../store/godModeStore';
import { v4 as uuidv4 } from 'uuid';
import { getStableMediaId } from '../../lib/mediaProbe';
import { MediaItem } from './MediaItem';
import { MediaDetailsPanel } from './MediaDetailsPanel';
import { toast } from '../../components/Toast';
import { confirm } from '../../components/ConfirmDialog';

export const MediaManagerTab: React.FC = () => {
    const { addClip, magnetizeClips, createGrid, setClips, detectBeats } = useClipStore();
    const { setActiveTab } = useViewStore();
    const { files, addFiles, removeFile, clearLibrary, orientationFilter, setOrientationFilter, selectedFileIds, toggleFileSelection, selectAllFiles, clearSelection, setPreloadedAudio, rotateFile, confirmRotation, cancelRotation, addRecentFolder, addRecentAudio, removeRecentFolder, removeRecentAudio, recentFolders, recentAudioFiles } = useMediaStore();
    const { mediaManagerView, mediaSidebarWidth, setMediaSidebarWidth } = useUserStore();
    const [viewMode, setViewMode] = useState<'grid' | 'list'>(mediaManagerView);
    const [searchQuery, setSearchQuery] = useState('');
    const [detailFileId, setDetailFileId] = useState<string | null>(null);

    // ── Sort state ──
    type SortField = 'default' | 'name' | 'duration' | 'size' | 'date-modified' | 'date-created' | 'random';
    const [sortBy, setSortBy] = useState<SortField>('default');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [randomSeed, setRandomSeed] = useState(() => Math.random());

    // ── Resizable sidebar state ──
    const [sidebarWidth, setSidebarWidth] = useState(mediaSidebarWidth);
    const [isResizingSidebar, setIsResizingSidebar] = useState(false);
    const resizeStartX = useRef(0);
    const resizeStartWidth = useRef(0);

    const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizingSidebar(true);
        resizeStartX.current = e.clientX;
        resizeStartWidth.current = sidebarWidth;
    }, [sidebarWidth]);

    useEffect(() => {
        if (!isResizingSidebar) return;
        const handleMouseMove = (e: MouseEvent) => {
            const dx = resizeStartX.current - e.clientX; // dragging left increases width
            const newWidth = Math.max(200, Math.min(500, resizeStartWidth.current + dx));
            setSidebarWidth(newWidth);
        };
        const handleMouseUp = () => {
            setIsResizingSidebar(false);
            setMediaSidebarWidth(sidebarWidth);
        };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizingSidebar, sidebarWidth, setMediaSidebarWidth]);

    // ── Sort comparator ──
    const sortedAndFilteredFiles = React.useMemo(() => {
        // 1. Filter
        const filtered = files.filter((file) => {
            if (!file.filename.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            if (orientationFilter !== 'all' && file.type === 'video' && file.orientation !== orientationFilter) return false;
            return true;
        });

        // 2. Sort
        if (sortBy === 'default') return filtered;
        if (sortBy === 'random') {
            const copy = [...filtered];
            let s = Math.floor(randomSeed * 2147483647);
            for (let i = copy.length - 1; i > 0; i--) {
                s = (s * 16807) % 2147483647;
                const j = s % (i + 1);
                [copy[i], copy[j]] = [copy[j], copy[i]];
            }
            return copy;
        }
        const dir = sortDirection === 'asc' ? 1 : -1;
        return [...filtered].sort((a, b) => {
            switch (sortBy) {
                case 'name':
                    return dir * a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: 'base' });
                case 'duration':
                    return dir * ((a.duration || 0) - (b.duration || 0));
                case 'size':
                    return dir * ((a.size || 0) - (b.size || 0));
                case 'date-modified':
                    return dir * ((a.modifiedAt || 0) - (b.modifiedAt || 0));
                case 'date-created':
                    return dir * ((a.fileCreatedAt || a.createdAt || 0) - (b.fileCreatedAt || b.createdAt || 0));
                default:
                    return 0;
            }
        });
    }, [files, searchQuery, orientationFilter, sortBy, sortDirection, randomSeed]);

    // Alias for backward compatibility with all references below
    const filteredFiles = sortedAndFilteredFiles;

    // Ctrl+A select all VISIBLE (filtered) media
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                // Only intercept if focus is NOT in an input/textarea
                const tag = (e.target as HTMLElement)?.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA') return;
                e.preventDefault();
                // Only select files visible under the current filter
                selectAllFiles(filteredFiles.map(f => f.id));
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [selectAllFiles, filteredFiles]);

    // Audio upload now uses IPC selectFiles('audio') — no raw input ref needed

    // Automatically add imported files to the timeline/sequence
    const autoAddToTimeline = (newFiles: MediaFile[]) => {
        const fps = 30;
        for (const file of newFiles) {
            const durationFrames = Math.floor(file.duration * fps);
            // Respect pre-trim constraints if set
            const trimStartFrame = file.trimIn != null ? Math.floor(file.trimIn * fps) : 0;
            const trimEndFrame = file.trimOut != null ? Math.floor(file.trimOut * fps) : durationFrames;
            const clipDuration = trimEndFrame - trimStartFrame;

            if (file.type === 'video') {
                addClip({
                    id: uuidv4(),
                    mediaLibraryId: file.id,
                    type: file.type,
                    path: file.path,
                    filename: file.filename,
                    startFrame: 0,
                    endFrame: clipDuration || 150,
                    sourceDurationFrames: durationFrames,
                    trimStartFrame,
                    trimEndFrame,
                    track: 1,
                    speed: 1.0,
                    volume: 100,
                    reversed: false,
                    isMuted: false,
                    isPinned: false,
                    origin: 'auto',
                    locked: false,
                    rotation: file.rotation || 0,
                    sourceOrientation: file.orientation || 'horizontal',
                });
            } else if (file.type === 'audio') {
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
                    track: 101,
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
        magnetizeClips();
    };

    // Load a recent folder directly without file dialog
    const handleLoadRecentFolder = async (folderPath: string) => {
        try {
            if (!window.ipcRenderer || !(window.ipcRenderer as any).loadFolder) {
                toast.error('Direct folder loading not available. Please restart the app.');
                return;
            }

            const result = await (window.ipcRenderer as any).loadFolder(folderPath);

            if (result.success && result.files) {
                const newFiles = await Promise.all(result.files.map(async (file: any) => {
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
                    }
                    return {
                        id: getStableMediaId(file.path),
                        path: file.path,
                        filename: file.filename,
                        type: file.type as 'video' | 'audio' | 'image',
                        duration,
                        width,
                        height,
                        orientation,
                        size: file.size,
                        modifiedAt: file.modifiedAt,
                        fileCreatedAt: file.fileCreatedAt,
                        createdAt: Date.now()
                    };
                }));

                addFiles(newFiles);
                addRecentFolder(folderPath, newFiles.length);
                autoAddToTimeline(newFiles);
                toast.success(`Loaded ${newFiles.length} files from ${folderPath.split(/[\\/]/).pop()}`);
            } else {
                toast.error(result.error || 'Failed to load folder');
            }
        } catch (error) {
            console.error('Error in handleLoadRecentFolder:', error);
            toast.error('Failed to load folder: ' + error);
        }
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
                        id: getStableMediaId(file.path),
                        path: file.path,
                        filename: file.filename,
                        type: file.type as 'video' | 'audio' | 'image',
                        duration,
                        width,
                        height,
                        orientation,
                        size: file.size,
                        modifiedAt: file.modifiedAt,
                        fileCreatedAt: file.fileCreatedAt,
                        createdAt: Date.now()
                    };
                }));

                addFiles(newFiles);

                // Track recent imports for sidebar suggestions
                if (type === 'folder' && result.files.length > 0) {
                    // Extract folder path from the first file's parent directory
                    const firstPath = result.files[0].path;
                    const folderPath = firstPath.replace(/[\\/][^\\/]+$/, '');
                    addRecentFolder(folderPath, newFiles.length);
                } else if (type === 'audio') {
                    newFiles.forEach(f => addRecentAudio(f.path));
                }

                // Preload first audio for Beat Intelligence Engine
                const firstAudio = newFiles.find(f => f.type === 'audio');
                if (firstAudio) {
                    setPreloadedAudio(firstAudio.path, firstAudio.filename);
                }

                // Auto-add to timeline/sequence
                autoAddToTimeline(newFiles);

                // Auto-analyze audio files (BPM detection)
                for (const file of newFiles) {
                    if (file.type === 'audio') {
                        try {
                            const audioContext = new AudioContext();
                            const response = await fetch(`file://${file.path}`);
                            const arrayBuffer = await response.arrayBuffer();
                            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                            // Find the clip that was just added for this file
                            const { clips } = useClipStore.getState();
                            const audioClip = clips.find(c => c.mediaLibraryId === file.id);
                            if (audioClip) {
                                await detectBeats(audioClip.id, audioBuffer);
                                console.log('[MediaManager] Auto-analyzed audio:', file.filename);
                            }
                            audioContext.close();
                        } catch (err) {
                            console.warn('[MediaManager] Auto-analyze failed for', file.filename, err);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error in handleFileSelect:', error);
            toast.error('Failed to import files: ' + error);
        }
    };

    // handleAudioUpload removed — audio pickers now use handleFileSelect('audio') via IPC
    // This ensures the audio file picker remembers its own last-used directory.

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

        const { clips } = useClipStore.getState();
        const isUsed = clips.some(c => c.mediaLibraryId === fileId);

        let targetFile = file;

        if (isUsed) {
            const newFile: MediaFile = {
                ...file,
                id: uuidv4(),
                filename: file.filename,
                createdAt: Date.now()
            };
            addFiles([newFile]);
            targetFile = newFile;
        }

        const fps = 30;
        const durationFrames = Math.floor(targetFile.duration * fps);
        // Respect pre-trim constraints
        const trimStartFrame = targetFile.trimIn != null ? Math.floor(targetFile.trimIn * fps) : 0;
        const trimEndFrame = targetFile.trimOut != null ? Math.floor(targetFile.trimOut * fps) : durationFrames;
        const clipDuration = trimEndFrame - trimStartFrame;

        addClip({
            id: uuidv4(),
            mediaLibraryId: targetFile.id,
            type: targetFile.type,
            path: targetFile.path,
            filename: targetFile.filename,
            startFrame: 0,
            endFrame: clipDuration || 150,
            sourceDurationFrames: durationFrames,
            trimStartFrame,
            trimEndFrame,
            track: 1,
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

    const fileToClipPreview = (file: MediaFile): Clip => {
        const fps = 30;
        const durationFrames = Math.floor(file.duration * fps);
        const trimStartFrame = file.trimIn != null ? Math.floor(file.trimIn * fps) : 0;
        const trimEndFrame = file.trimOut != null ? Math.floor(file.trimOut * fps) : durationFrames;
        return {
            id: file.id,
            type: file.type,
            path: file.path,
            filename: file.filename,
            startFrame: 0,
            endFrame: trimEndFrame - trimStartFrame || 150,
            sourceDurationFrames: durationFrames,
            trimStartFrame,
            trimEndFrame,
            speed: 1.0,
            volume: 100,
            track: 0,
            reversed: false,
            isMuted: false,
            isPinned: false,
            origin: 'manual',
            locked: false,
            rotation: file.pendingRotation ?? file.rotation ?? 0,
            sourceOrientation: file.orientation || 'horizontal',
        };
    };

    const selectedFile = files.find(f => f.id === detailFileId) || null;
    const visibleFileIds = filteredFiles.map(f => f.id);
    const hasSelection = selectedFileIds.length > 0;

    // Click handler for MediaItem — INVERTED: plain click toggles multi-select,
    // Ctrl+click singles (opens details for only that item)
    const handleItemClick = (fileId: string, e: React.MouseEvent) => {
        // Always update detail panel to show the clicked item
        setDetailFileId(fileId);

        if (e.ctrlKey || e.metaKey) {
            // Ctrl+Click: single-select only this item (old plain-click behavior)
            toggleFileSelection(fileId, 'single');
        } else if (e.shiftKey) {
            toggleFileSelection(fileId, 'shift', visibleFileIds);
        } else {
            // Plain click: toggle this item in/out of multi-selection
            toggleFileSelection(fileId, 'ctrl');
        }
    };

    const handleRotate = (fileId: string) => {
        // Sets pendingRotation — visual preview only, no commit
        rotateFile(fileId);
    };

    const handleConfirmRotation = (fileId: string) => {
        const file = files.find(f => f.id === fileId);
        if (!file || file.pendingRotation === undefined) return;

        const nextRotation = file.pendingRotation;
        const isOrthogonal = nextRotation === 90 || nextRotation === 270;
        const origW = file.width || 1920;
        const origH = file.height || 1080;
        const effectiveW = isOrthogonal ? origH : origW;
        const effectiveH = isOrthogonal ? origW : origH;
        const newOrientation: 'horizontal' | 'vertical' | 'square' =
            effectiveW > effectiveH ? 'horizontal' :
            effectiveH > effectiveW ? 'vertical' : 'square';
        const oldOrientation = file.orientation || 'horizontal';
        const movesGroup = oldOrientation !== newOrientation;
        const orientationLabels: Record<string, string> = {
            horizontal: 'Landscape', vertical: 'Portrait', square: 'Square'
        };

        // Commit the rotation
        confirmRotation(fileId);

        // Propagate to timeline clips
        const { clips, updateClip } = useClipStore.getState();
        clips.forEach(clip => {
            if (clip.mediaLibraryId === fileId || clip.path === file.path) {
                updateClip(clip.id, {
                    rotation: nextRotation,
                    sourceOrientation: newOrientation,
                });
            }
        });

        const suffix = movesGroup
            ? ` → moved to ${orientationLabels[newOrientation]}`
            : '';
        toast.success(`${file.filename} rotated to ${nextRotation}°${suffix}`);
    };

    const handleCancelRotation = (fileId: string) => {
        cancelRotation(fileId);
    };

    const showSidebar = true; // Always show sidebar

    return (
        <div className="h-full w-full flex flex-col overflow-hidden">
            {/* ── TOP SECTION: Header + Quick Actions + Search (full width) ── */}
            <div className="px-8 pt-8 pb-2 flex flex-col gap-4 flex-shrink-0">
                {/* Header */}
                <div className="flex items-center justify-between">
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
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleFileSelect('audio')}
                            className="flex items-center gap-1.5 bg-accent/20 hover:bg-accent/40 text-accent border border-accent/20 hover:border-accent/40 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                            title="Opens audio file picker (remembers last audio folder)">
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
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => { useGodModeStore.getState().setEnabled(true); setActiveTab('trailer'); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300/70 hover:text-yellow-200 transition-all border border-yellow-500/10 hover:border-yellow-500/30 text-[10px] font-bold uppercase tracking-wider">
                        <Crown size={12} /> God Mode
                    </motion.button>
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setActiveTab('trailer')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-primary/20 text-white/50 hover:text-primary-300 transition-all border border-white/5 hover:border-primary/30 text-[10px] font-bold uppercase tracking-wider">
                        <Wand2 size={12} /> Edit Engine
                    </motion.button>
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setActiveTab('timeline')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-accent/20 text-white/50 hover:text-accent transition-all border border-white/5 hover:border-accent/30 text-[10px] font-bold uppercase tracking-wider">
                        <Film size={12} /> Timeline Editor
                    </motion.button>
                    {files.length > 0 && (
                        <>
                            <div className="w-px h-5 bg-white/10 mx-1" />
                            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                onClick={() => hasSelection ? clearSelection() : selectAllFiles(filteredFiles.map(f => f.id))}
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
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
                    <input type="text" placeholder="Search media files..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-black/40 border border-white/5 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white font-bold outline-none focus:border-primary/50 transition-colors placeholder:text-white/20 placeholder:font-normal" />
                </div>
            </div>

            {/* ── BOTTOM SECTION: Filters + Grid | Sidebar ── */}
            <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Left: Filters + Asset Grid */}
                <div className="flex-1 flex flex-col min-w-0 overflow-y-auto px-8 pb-8">
                    {/* Orientation Filter Bar */}
                    {files.some(f => f.type === 'video') && (
                        <div className="flex items-center gap-2 flex-shrink-0 py-3">
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

                    {/* Sort Controls */}
                    {files.length > 0 && (
                        <div className="flex items-center gap-2 flex-shrink-0 py-2">
                            <span className="text-[10px] font-black text-white/30 uppercase tracking-widest mr-1">Sort:</span>
                            <div className="relative">
                                <select
                                    id="media-sort-field"
                                    value={sortBy}
                                    onChange={(e) => {
                                        const val = e.target.value as SortField;
                                        setSortBy(val);
                                        if (val === 'random') setRandomSeed(Math.random());
                                    }}
                                    className="appearance-none bg-black/40 border border-white/10 rounded-lg pl-3 pr-8 py-1.5 text-[10px] font-bold text-white/70 uppercase tracking-wider outline-none focus:border-primary/50 cursor-pointer transition-colors hover:bg-white/5"
                                >
                                    <option value="default">Default</option>
                                    <option value="name">Name</option>
                                    <option value="duration">Duration</option>
                                    <option value="size">Size</option>
                                    <option value="date-modified">Date Modified</option>
                                    <option value="date-created">Date Created</option>
                                    <option value="random">Random</option>
                                </select>
                                <ArrowUpDown size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                            </div>
                            {sortBy !== 'default' && sortBy !== 'random' && (
                                <button
                                    id="media-sort-direction"
                                    onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}
                                    className={clsx(
                                        "flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border",
                                        "bg-white/5 text-white/50 border-white/5 hover:bg-primary/20 hover:text-primary hover:border-primary/30"
                                    )}
                                    title={sortDirection === 'asc' ? 'Ascending — click for Descending' : 'Descending — click for Ascending'}
                                >
                                    {sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                                    {sortDirection === 'asc' ? 'Asc' : 'Desc'}
                                </button>
                            )}
                            {sortBy === 'random' && (
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setRandomSeed(Math.random())}
                                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border bg-accent/10 text-accent/70 border-accent/20 hover:bg-accent/30 hover:text-accent"
                                    title="Re-shuffle"
                                >
                                    <ArrowUpDown size={12} /> Re-shuffle
                                </motion.button>
                            )}
                            {sortBy !== 'default' && (
                                <button
                                    onClick={() => { setSortBy('default'); setSortDirection('asc'); }}
                                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold text-white/30 border border-transparent hover:text-white/60 hover:border-white/10 transition-all"
                                    title="Reset sort"
                                >
                                    <X size={10} /> Reset
                                </button>
                            )}
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
                                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleFileSelect('audio')}
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
                                ? clsx("grid gap-4 pb-4",
                                    orientationFilter === 'horizontal' ? "grid-cols-1 md:grid-cols-2 [&>*]:min-h-[280px]" :
                                    orientationFilter === 'vertical' ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 [&>*]:min-h-[360px]" :
                                    "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 [&>*]:min-h-[300px]")
                                : "flex flex-col gap-2 pb-4"
                            }>
                                {filteredFiles.map((file) => (
                                    <MediaItem
                                        key={file.id}
                                        clip={fileToClipPreview(file)}
                                        isSelected={file.id === detailFileId}
                                        isMultiSelected={selectedFileIds.includes(file.id)}
                                        isTrimmed={file.trimIn != null && file.trimOut != null}
                                        trimDurationLabel={file.trimIn != null && file.trimOut != null ? `${(file.trimOut - file.trimIn).toFixed(1)}s` : undefined}
                                        viewMode={viewMode}
                                        hasPendingRotation={file.pendingRotation !== undefined}
                                        onSelect={(e) => handleItemClick(file.id, e)}
                                        onAdd={() => handleAddClipToTimeline(file.id)}
                                        onGridAdd={() => handleCreateGridFromMedia(file.id)}
                                        onRotate={() => handleRotate(file.id)}
                                        onConfirmRotation={() => handleConfirmRotation(file.id)}
                                        onCancelRotation={() => handleCancelRotation(file.id)}
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

                {/* Right Sidebar: starts at filter level */}
                {showSidebar && (
                    <>
                        {/* Drag handle for sidebar resize */}
                        <div
                            className="w-1 cursor-col-resize bg-white/5 hover:bg-primary/40 active:bg-primary/60 transition-colors flex-shrink-0 group"
                            onMouseDown={handleResizeMouseDown}
                        >
                            <div className="h-full w-full flex items-center justify-center">
                                <div className="w-0.5 h-8 bg-white/10 group-hover:bg-primary/50 rounded-full" />
                            </div>
                        </div>
                        <div className="border-l border-white/10 bg-[#0A0A0A] flex-shrink-0 overflow-y-auto" style={{ width: sidebarWidth }}>
                            {files.length === 0 ? (
                                /* ── RECENT IMPORTS PANEL (empty library state) ── */
                                <div className="h-full flex flex-col bg-[#080810]">
                                    <div className="p-4 border-b border-white/5">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Clock size={14} className="text-white/40" />
                                            <h3 className="font-medium text-white/90 text-sm">Recent</h3>
                                        </div>
                                        <p className="text-[10px] text-white/30">Quickly reload previous folders and audio.</p>
                                    </div>

                                    <div className="flex-1 overflow-y-auto">
                                        {/* Recent Folders */}
                                        {recentFolders.length > 0 && (
                                            <div className="p-4 border-b border-white/5">
                                                <div className="text-[10px] text-white/30 uppercase tracking-wider font-bold mb-3 flex items-center gap-1.5">
                                                    <FolderOpen size={10} /> Folders
                                                </div>
                                                <div className="space-y-1">
                                                    {recentFolders.map((folder) => (
                                                        <div key={folder.path} className="group flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors">
                                                            <button
                                                                onClick={() => handleLoadRecentFolder(folder.path)}
                                                                className="flex-1 min-w-0 text-left"
                                                                title={folder.path}
                                                            >
                                                                <div className="text-xs text-white/70 font-medium truncate">{folder.name}</div>
                                                                <div className="text-[9px] text-white/25 font-mono truncate">{folder.path}</div>
                                                                <div className="text-[9px] text-white/20 mt-0.5">
                                                                    {folder.fileCount} files · {new Date(folder.addedAt).toLocaleDateString()}
                                                                </div>
                                                            </button>
                                                            <button
                                                                onClick={() => removeRecentFolder(folder.path)}
                                                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded text-white/20 hover:text-red-400 transition-all flex-shrink-0"
                                                                title="Remove from recent"
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Recent Audio */}
                                        {recentAudioFiles.length > 0 && (
                                            <div className="p-4 border-b border-white/5">
                                                <div className="text-[10px] text-white/30 uppercase tracking-wider font-bold mb-3 flex items-center gap-1.5">
                                                    <Music size={10} /> Audio Files
                                                </div>
                                                <div className="space-y-1">
                                                    {recentAudioFiles.map((audio) => (
                                                        <div key={audio.path} className="group flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors">
                                                            <button
                                                                onClick={() => handleFileSelect('audio')}
                                                                className="flex-1 min-w-0 text-left"
                                                                title={audio.path}
                                                            >
                                                                <div className="text-xs text-white/70 font-medium truncate">{audio.name}</div>
                                                                <div className="text-[9px] text-white/25 font-mono truncate">{audio.path}</div>
                                                                <div className="text-[9px] text-white/20 mt-0.5">
                                                                    {new Date(audio.addedAt).toLocaleDateString()}
                                                                </div>
                                                            </button>
                                                            <button
                                                                onClick={() => removeRecentAudio(audio.path)}
                                                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded text-white/20 hover:text-red-400 transition-all flex-shrink-0"
                                                                title="Remove from recent"
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Empty state for no recent items */}
                                        {recentFolders.length === 0 && recentAudioFiles.length === 0 && (
                                            <div className="p-8 text-center">
                                                <FolderOpen size={32} className="text-white/10 mx-auto mb-3" />
                                                <p className="text-xs text-white/30 mb-1">No recent imports</p>
                                                <p className="text-[10px] text-white/15">Folders and audio files you import will appear here for quick access.</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Quick import footer */}
                                    <div className="p-4 border-t border-white/5 bg-white/5 space-y-2">
                                        <button
                                            onClick={() => handleFileSelect('folder')}
                                            className="w-full flex items-center justify-center gap-2 bg-primary/20 hover:bg-primary/40 text-primary-300 border border-primary/20 hover:border-primary/40 p-2.5 rounded-lg text-xs font-bold transition-all"
                                        >
                                            <FolderOpen size={14} /> Import Folder
                                        </button>
                                        <button
                                            onClick={() => handleFileSelect('audio')}
                                            className="w-full flex items-center justify-center gap-2 bg-accent/10 hover:bg-accent/20 text-accent/70 border border-accent/10 hover:border-accent/30 p-2.5 rounded-lg text-xs font-bold transition-all"
                                        >
                                            <Music size={14} /> Add Audio
                                        </button>
                                    </div>
                                </div>
                            ) : selectedFileIds.length > 1 && !detailFileId ? (
                                /* ── MULTI-SELECTION SUMMARY (no active detail file) ── */
                                <div className="h-full flex flex-col bg-[#080810]">
                                    <div className="p-4 border-b border-white/5 flex items-center justify-between">
                                        <h3 className="font-medium text-white/90">{selectedFileIds.length} Selected</h3>
                                        <button onClick={() => clearSelection()} className="p-1 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors">
                                            <X size={16} />
                                        </button>
                                    </div>
                                    {/* Aggregate stats */}
                                    <div className="p-4 border-b border-white/5">
                                        {(() => {
                                            const selectedFiles = files.filter(f => selectedFileIds.includes(f.id));
                                            const videoCount = selectedFiles.filter(f => f.type === 'video').length;
                                            const audioCount = selectedFiles.filter(f => f.type === 'audio').length;
                                            const totalDuration = selectedFiles.reduce((sum, f) => sum + (f.duration || 0), 0);
                                            const orientations = {
                                                horizontal: selectedFiles.filter(f => f.orientation === 'horizontal').length,
                                                vertical: selectedFiles.filter(f => f.orientation === 'vertical').length,
                                                square: selectedFiles.filter(f => f.orientation === 'square').length,
                                            };
                                            return (
                                                <div className="space-y-3">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <div className="text-xs text-white/40 mb-1">Videos</div>
                                                            <div className="text-sm text-white/80 font-mono">{videoCount}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-xs text-white/40 mb-1">Audio</div>
                                                            <div className="text-sm text-white/80 font-mono">{audioCount}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-xs text-white/40 mb-1">Total Duration</div>
                                                            <div className="text-sm text-white/80 font-mono">
                                                                {Math.floor(totalDuration / 60)}:{String(Math.floor(totalDuration % 60)).padStart(2, '0')}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="text-xs text-white/40 mb-1">Avg Duration</div>
                                                            <div className="text-sm text-white/80 font-mono">
                                                                {(totalDuration / selectedFiles.length).toFixed(1)}s
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {(orientations.horizontal > 0 || orientations.vertical > 0 || orientations.square > 0) && (
                                                        <div className="pt-2 border-t border-white/5">
                                                            <div className="text-xs text-white/40 mb-2">Orientations</div>
                                                            <div className="flex gap-2">
                                                                {orientations.horizontal > 0 && (
                                                                    <span className="text-[10px] text-white/60 bg-white/5 px-2 py-1 rounded font-mono">
                                                                        <Monitor size={10} className="inline mr-1" />{orientations.horizontal} landscape
                                                                    </span>
                                                                )}
                                                                {orientations.vertical > 0 && (
                                                                    <span className="text-[10px] text-white/60 bg-white/5 px-2 py-1 rounded font-mono">
                                                                        <Smartphone size={10} className="inline mr-1" />{orientations.vertical} portrait
                                                                    </span>
                                                                )}
                                                                {orientations.square > 0 && (
                                                                    <span className="text-[10px] text-white/60 bg-white/5 px-2 py-1 rounded font-mono">
                                                                        <Square size={10} className="inline mr-1" />{orientations.square} square
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                    {/* Scrollable file list */}
                                    <div className="flex-1 overflow-y-auto p-4 space-y-1">
                                        <div className="text-[10px] text-white/30 uppercase tracking-wider font-bold mb-2">Selected Files</div>
                                        {files.filter(f => selectedFileIds.includes(f.id)).map((f, i) => (
                                            <div key={f.id}
                                                onClick={() => setDetailFileId(f.id)}
                                                className="flex items-center gap-2 text-xs text-white/60 py-1 px-2 rounded hover:bg-white/5 cursor-pointer">
                                                <span className="text-white/20 font-mono text-[9px] w-4">{i + 1}</span>
                                                {f.type === 'video' ? <FileVideo size={12} className="text-accent/50 flex-shrink-0" /> : <FileAudio size={12} className="text-accent/50 flex-shrink-0" />}
                                                <span className="truncate">{f.filename}</span>
                                                <span className="text-white/20 ml-auto font-mono text-[10px] flex-shrink-0">{f.duration.toFixed(1)}s</span>
                                            </div>
                                        ))}
                                    </div>
                                    {/* Action Footer */}
                                    <div className="p-4 border-t border-white/5 bg-white/5 space-y-2">
                                        <button
                                            onClick={() => {
                                                const count = selectedFileIds.length;
                                                setActiveTab('trailer');
                                                toast.success(`${count} clips ready for Trailer`);
                                            }}
                                            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white p-3 rounded-lg font-medium transition-colors"
                                        >
                                            <Wand2 size={18} />
                                            Add {selectedFileIds.length} to Edit
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* ── DETAIL / TRIM PANEL (single select OR active file within multi-select) ── */
                                <div className="h-full flex flex-col bg-[#080810]">
                                    {/* Compact multi-select bar when multi-selecting */}
                                    {selectedFileIds.length > 1 && (
                                        <div className="px-3 py-2 border-b border-purple-500/20 bg-purple-500/5 flex items-center justify-between flex-shrink-0">
                                            <div className="flex items-center gap-2">
                                                <CheckSquare size={12} className="text-purple-400" />
                                                <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">
                                                    {selectedFileIds.length} selected
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => clearSelection()}
                                                className="text-[9px] font-bold text-white/40 hover:text-white/70 uppercase tracking-wider px-2 py-0.5 rounded hover:bg-white/10 transition-colors"
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    )}
                                    <div className="flex-1 overflow-y-auto min-h-0">
                                        <MediaDetailsPanel
                                            clip={selectedFile ? fileToClipPreview(selectedFile) : null}
                                            mediaFile={selectedFile}
                                            onClose={() => setDetailFileId(null)}
                                            onAdd={selectedFile ? () => setActiveTab('trailer') : undefined}
                                            onRotate={selectedFile ? () => handleRotate(selectedFile.id) : undefined}
                                            hasPendingRotation={selectedFile?.pendingRotation !== undefined}
                                            onConfirmRotation={selectedFile ? () => handleConfirmRotation(selectedFile.id) : undefined}
                                            onCancelRotation={selectedFile ? () => handleCancelRotation(selectedFile.id) : undefined}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
