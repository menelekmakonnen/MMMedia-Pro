/**
 * SequenceMediaPanel — Media browser within the Sequence page.
 * ════════════════════════════════════════════════════════════════════════════
 * A self-contained media browser panel that lets users import, search,
 * preview, and drag media into the timeline.
 *
 * Features:
 *   • Import buttons (Add Folder, Add Files) via window.ipcRenderer
 *   • Search bar for filtering by filename
 *   • Grid view (4 columns) with thumbnails, duration, resolution badges
 *   • List view toggle (compact rows)
 *   • Click to select, double-click to set as source monitor clip
 *   • Drag support (dataTransfer for timeline drop)
 *   • Recent folders section
 */

import React, { useState, useCallback } from 'react';
import {
    FolderOpen,
    FileVideo,
    Search,
    Grid,
    List,
    FileAudio,
    Clock,
    Plus,
    Monitor,
    X,
} from 'lucide-react';
import clsx from 'clsx';
import { v4 as uuidv4 } from 'uuid';
import { getStableMediaId } from '../../lib/mediaProbe';

import { useMediaStore, MediaFile } from '../../store/mediaStore';
import { useSequenceViewStore } from '../../store/sequenceViewStore';
import { toast } from '../../components/Toast';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
    if (!seconds || seconds <= 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatResolution(w?: number, h?: number): string | null {
    if (!w || !h) return null;
    if (w >= 3840) return '4K';
    if (w >= 2560) return 'QHD';
    if (w >= 1920) return 'FHD';
    if (w >= 1280) return 'HD';
    return `${w}×${h}`;
}

/** Read video metadata via a throwaway <video> element. */
function getMediaMetadata(
    path: string,
): Promise<{
    duration: number;
    width: number;
    height: number;
    orientation: 'horizontal' | 'vertical' | 'square';
}> {
    return new Promise((resolve, reject) => {
        const el = document.createElement('video');
        el.preload = 'metadata';
        el.src = `file://${path}`;
        el.onloadedmetadata = () => {
            const w = el.videoWidth;
            const h = el.videoHeight;
            const orientation =
                w > h ? 'horizontal' : h > w ? 'vertical' : 'square';
            resolve({ duration: el.duration, width: w, height: h, orientation });
            el.remove();
        };
        el.onerror = (e) => {
            reject(e);
            el.remove();
        };
    });
}

// ─── Component ───────────────────────────────────────────────────────────────

export const SequenceMediaPanel: React.FC = () => {
    const {
        files,
        addFiles,
        recentFolders,
        addRecentFolder,
    } = useMediaStore();
    const { setSourceMonitorClip } = useSequenceViewStore();

    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

    // ── Filtering ────────────────────────────────────────────────────

    const filteredFiles = files.filter((f) =>
        f.filename.toLowerCase().includes(searchQuery.toLowerCase()),
    );

    // ── Import handlers ──────────────────────────────────────────────

    const handleImport = useCallback(
        async (type: 'video' | 'folder') => {
            try {
                if (!window.ipcRenderer?.selectFiles) {
                    toast.error('File picker is not available. Please restart the app.');
                    return;
                }

                const result = await window.ipcRenderer.selectFiles(
                    type === 'folder' ? 'folder' : 'video',
                );

                if (result.success && result.files) {
                    const newFiles: MediaFile[] = await Promise.all(
                        result.files.map(async (file) => {
                            let duration = 0;
                            let width = 0;
                            let height = 0;
                            let orientation: 'horizontal' | 'vertical' | 'square' =
                                'horizontal';

                            if (file.type === 'video') {
                                try {
                                    const meta = await getMediaMetadata(file.path);
                                    duration = meta.duration;
                                    width = meta.width;
                                    height = meta.height;
                                    orientation = meta.orientation;
                                } catch (e) {
                                    console.warn(
                                        'Failed to get metadata for',
                                        file.path,
                                        e,
                                    );
                                }
                            } else if (file.type === 'audio') {
                                try {
                                    const el = document.createElement('audio');
                                    el.preload = 'metadata';
                                    el.src = `file://${file.path}`;
                                    duration = await new Promise<number>((res, rej) => {
                                        el.onloadedmetadata = () => {
                                            res(el.duration);
                                            el.remove();
                                        };
                                        el.onerror = rej;
                                    });
                                } catch (e) {
                                    console.warn(
                                        'Failed to get duration for audio',
                                        file.path,
                                        e,
                                    );
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
                                createdAt: Date.now(),
                            };
                        }),
                    );

                    addFiles(newFiles);

                    // Track recent folder
                    if (type === 'folder' && result.files.length > 0) {
                        const firstPath = result.files[0].path;
                        const folderPath = firstPath.replace(/[\\/][^\\/]+$/, '');
                        addRecentFolder(folderPath, newFiles.length);
                    }

                    toast.success(`Imported ${newFiles.length} file${newFiles.length !== 1 ? 's' : ''}`);
                }
            } catch (error) {
                console.error('Import error:', error);
                toast.error('Failed to import files: ' + error);
            }
        },
        [addFiles, addRecentFolder],
    );

    // ── Click handlers ───────────────────────────────────────────────

    const handleSelect = useCallback((file: MediaFile) => {
        setSelectedFileId(file.id);
    }, []);

    const handleDoubleClick = useCallback(
        (file: MediaFile) => {
            setSourceMonitorClip({
                id: file.id,
                path: file.path,
                filename: file.filename,
                duration: file.duration,
            });
        },
        [setSourceMonitorClip],
    );

    // ── Drag start ───────────────────────────────────────────────────

    const handleDragStart = useCallback(
        (e: React.DragEvent, file: MediaFile) => {
            e.dataTransfer.setData(
                'application/x-mmmedia-media',
                JSON.stringify({
                    id: file.id,
                    path: file.path,
                    filename: file.filename,
                    type: file.type,
                    duration: file.duration,
                    width: file.width,
                    height: file.height,
                }),
            );
            e.dataTransfer.effectAllowed = 'copy';
        },
        [],
    );

    // ── Render ────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col h-full overflow-hidden bg-[#0a0a15]/40">
            {/* ── Toolbar ── */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 flex-shrink-0">
                {/* Import Buttons */}
                <button
                    onClick={() => handleImport('folder')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-medium transition-all border border-white/5 hover:border-white/10"
                >
                    <FolderOpen size={14} />
                    <span>Add Folder</span>
                </button>
                <button
                    onClick={() => handleImport('video')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-medium transition-all border border-white/5 hover:border-white/10"
                >
                    <Plus size={14} />
                    <span>Add Files</span>
                </button>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Search */}
                <div className="relative">
                    <Search
                        size={14}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30"
                    />
                    <input
                        type="text"
                        placeholder="Search media…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8 pr-7 py-1.5 w-48 rounded-lg bg-white/5 border border-white/5 text-xs text-white/80 placeholder-white/30 focus:outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20 transition-all"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>

                {/* View Toggle */}
                <div className="flex items-center rounded-lg border border-white/5 overflow-hidden">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={clsx(
                            'p-1.5 transition-colors',
                            viewMode === 'grid'
                                ? 'bg-purple-600/30 text-purple-300'
                                : 'text-white/40 hover:text-white/60 hover:bg-white/5',
                        )}
                        title="Grid View"
                    >
                        <Grid size={14} />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={clsx(
                            'p-1.5 transition-colors',
                            viewMode === 'list'
                                ? 'bg-purple-600/30 text-purple-300'
                                : 'text-white/40 hover:text-white/60 hover:bg-white/5',
                        )}
                        title="List View"
                    >
                        <List size={14} />
                    </button>
                </div>
            </div>

            {/* ── Media Grid / List ── */}
            <div className="flex-1 overflow-y-auto p-4">
                {filteredFiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-white/30 gap-3">
                        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                            <FileVideo size={28} />
                        </div>
                        <p className="text-sm">
                            {files.length === 0
                                ? 'No media imported yet'
                                : 'No results found'}
                        </p>
                        {files.length === 0 && (
                            <button
                                onClick={() => handleImport('folder')}
                                className="mt-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600/80 to-indigo-600/80 text-white text-xs font-medium hover:from-purple-600 hover:to-indigo-600 transition-all shadow-lg shadow-purple-500/20"
                            >
                                Import Media
                            </button>
                        )}
                    </div>
                ) : viewMode === 'grid' ? (
                    /* ── Grid View (4 columns) ── */
                    <div className="grid grid-cols-4 gap-3">
                        {filteredFiles.map((file) => {
                            const isSelected = selectedFileId === file.id;
                            const resBadge = formatResolution(file.width, file.height);

                            return (
                                <div
                                    key={file.id}
                                    draggable
                                    onClick={() => handleSelect(file)}
                                    onDoubleClick={() => handleDoubleClick(file)}
                                    onDragStart={(e) => handleDragStart(e, file)}
                                    className={clsx(
                                        'group relative rounded-lg overflow-hidden cursor-pointer transition-all duration-200 border',
                                        isSelected
                                            ? 'border-purple-500/60 ring-1 ring-purple-500/40 bg-purple-500/5'
                                            : 'border-white/5 hover:border-white/15 bg-white/5 hover:bg-white/8',
                                    )}
                                >
                                    {/* Thumbnail */}
                                    <div className="relative aspect-video bg-black/50 overflow-hidden">
                                        {file.type === 'video' || file.type === 'image' ? (
                                            <video
                                                src={`file://${file.path}`}
                                                className="w-full h-full object-cover"
                                                muted
                                                preload="metadata"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-white/20">
                                                <FileAudio size={24} />
                                            </div>
                                        )}

                                        {/* Duration Badge */}
                                        <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/80 rounded text-[10px] text-white/80 font-mono">
                                            {formatDuration(file.duration)}
                                        </div>

                                        {/* Resolution Badge */}
                                        {resBadge && (
                                            <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-black/70 rounded text-[9px] text-white/60 font-medium uppercase tracking-wider">
                                                {resBadge}
                                            </div>
                                        )}

                                        {/* Hover overlay */}
                                        <div className="absolute inset-0 bg-purple-600/0 group-hover:bg-purple-600/10 transition-colors" />
                                    </div>

                                    {/* Info */}
                                    <div className="px-2.5 py-2">
                                        <p className="text-xs text-white/80 truncate font-medium">
                                            {file.filename}
                                        </p>
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium px-1 py-0.5 bg-white/5 rounded">
                                                {file.type}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    /* ── List View ── */
                    <div className="flex flex-col gap-1">
                        {filteredFiles.map((file) => {
                            const isSelected = selectedFileId === file.id;
                            const resBadge = formatResolution(file.width, file.height);

                            return (
                                <div
                                    key={file.id}
                                    draggable
                                    onClick={() => handleSelect(file)}
                                    onDoubleClick={() => handleDoubleClick(file)}
                                    onDragStart={(e) => handleDragStart(e, file)}
                                    className={clsx(
                                        'group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 border',
                                        isSelected
                                            ? 'border-purple-500/40 bg-purple-500/10'
                                            : 'border-transparent hover:bg-white/5',
                                    )}
                                >
                                    {/* Mini Thumbnail */}
                                    <div className="w-16 h-10 rounded bg-black/50 overflow-hidden flex-shrink-0 flex items-center justify-center">
                                        {file.type === 'video' || file.type === 'image' ? (
                                            <video
                                                src={`file://${file.path}`}
                                                className="w-full h-full object-cover"
                                                muted
                                                preload="metadata"
                                            />
                                        ) : (
                                            <FileAudio
                                                size={16}
                                                className="text-white/20"
                                            />
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-white/80 truncate font-medium">
                                            {file.filename}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">
                                                {file.type}
                                            </span>
                                            {resBadge && (
                                                <span className="text-[9px] text-white/30">
                                                    {resBadge}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Duration */}
                                    <div className="flex items-center gap-1 text-[10px] text-white/40 font-mono flex-shrink-0">
                                        <Clock size={10} />
                                        {formatDuration(file.duration)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Recent Folders ── */}
            {recentFolders.length > 0 && (
                <div className="border-t border-white/5 px-4 py-3 flex-shrink-0">
                    <h4 className="text-[10px] uppercase tracking-wider text-white/30 font-semibold mb-2">
                        Recent Folders
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                        {recentFolders.slice(0, 5).map((folder) => (
                            <button
                                key={folder.path}
                                onClick={() => handleImport('folder')}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/70 text-[10px] transition-all border border-white/5 hover:border-white/10"
                                title={folder.path}
                            >
                                <FolderOpen size={10} />
                                <span className="truncate max-w-[120px]">
                                    {folder.name}
                                </span>
                                <span className="text-white/25">
                                    ({folder.fileCount})
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Status Bar ── */}
            <div className="border-t border-white/5 px-4 py-1.5 flex items-center justify-between text-[10px] text-white/30 flex-shrink-0">
                <span>
                    {filteredFiles.length} item{filteredFiles.length !== 1 ? 's' : ''}
                    {searchQuery && ` (filtered from ${files.length})`}
                </span>
                <span>
                    {selectedFileId && (
                        <span className="text-purple-400/60">
                            {files.find((f) => f.id === selectedFileId)?.filename}
                        </span>
                    )}
                </span>
            </div>
        </div>
    );
};
