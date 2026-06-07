import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface RecentFolder {
    path: string;
    name: string;
    addedAt: number;
    fileCount: number;
}

export interface RecentAudioFile {
    path: string;
    name: string;
    addedAt: number;
}

export interface MediaFile {
    id: string;
    path: string;
    filename: string;
    type: 'video' | 'audio' | 'image';
    duration: number; // in seconds
    width?: number;
    height?: number;
    orientation?: 'horizontal' | 'vertical' | 'square';
    rotation?: 0 | 90 | 180 | 270;  // Persistent rotation applied in preview + export
    format?: string;
    size?: number;
    createdAt?: number;
    // Pre-import trim constraints (seconds). When set, all downstream tools
    // (trailer, godmode, timeline, flux) only use this portion of the source.
    trimIn?: number;   // Start of usable region (default: 0)
    trimOut?: number;  // End of usable region (default: duration)
}

interface MediaState {
    files: MediaFile[];
    selectedFileIds: string[];
    lastSelectedFileId: string | null;
    orientationFilter: 'all' | 'horizontal' | 'vertical' | 'square';
    // Preloaded audio for Beat Intelligence Engine (set by MediaManager, consumed by TrailerWizard)
    preloadedAudioPath: string | null;
    preloadedAudioName: string | null;
    // Recent imports (persisted for sidebar suggestions)
    recentFolders: RecentFolder[];
    recentAudioFiles: RecentAudioFile[];

    // Actions
    addFiles: (newFiles: MediaFile[]) => void;
    removeFile: (id: string) => void;
    clearLibrary: () => void;
    updateFile: (id: string, updates: Partial<MediaFile>) => void;
    rotateFile: (id: string) => void;
    setOrientationFilter: (filter: 'all' | 'horizontal' | 'vertical' | 'square') => void;
    setPreloadedAudio: (path: string | null, name: string | null) => void;
    // Trim constraints
    setFileTrim: (id: string, trimIn: number, trimOut: number) => void;
    clearFileTrim: (id: string) => void;
    // Multi-select actions
    toggleFileSelection: (id: string, mode: 'single' | 'ctrl' | 'shift', allVisibleIds?: string[]) => void;
    selectAllFiles: (visibleIds?: string[]) => void;
    clearSelection: () => void;
    // Recent imports
    addRecentFolder: (path: string, fileCount: number) => void;
    removeRecentFolder: (path: string) => void;
    addRecentAudio: (path: string) => void;
    removeRecentAudio: (path: string) => void;
}

export const useMediaStore = create<MediaState>()(
    persist(
        (set) => ({
            files: [],
            selectedFileIds: [],
            lastSelectedFileId: null,
            orientationFilter: 'all',
            preloadedAudioPath: null,
            preloadedAudioName: null,
            recentFolders: [],
            recentAudioFiles: [],

            addFiles: (newFiles) => set((state) => {
                return { files: [...state.files, ...newFiles] };
            }),

            removeFile: (id) => set((state) => ({
                files: state.files.filter(f => f.id !== id),
                selectedFileIds: state.selectedFileIds.filter(fid => fid !== id),
            })),

            clearLibrary: () => set({ files: [], selectedFileIds: [], lastSelectedFileId: null }),

            updateFile: (id, updates) => set((state) => ({
                files: state.files.map(f => f.id === id ? { ...f, ...updates } : f)
            })),

            rotateFile: (id) => set((state) => ({
                files: state.files.map(f => {
                    if (f.id !== id) return f;
                    const nextRotation = (((f.rotation || 0) + 90) % 360) as 0 | 90 | 180 | 270;
                    return { ...f, rotation: nextRotation };
                })
            })),

            setOrientationFilter: (filter) => set({ orientationFilter: filter }),

            setPreloadedAudio: (path, name) => set({ preloadedAudioPath: path, preloadedAudioName: name }),

            setFileTrim: (id, trimIn, trimOut) => set((state) => ({
                files: state.files.map(f => f.id === id ? { ...f, trimIn, trimOut } : f)
            })),

            clearFileTrim: (id) => set((state) => ({
                files: state.files.map(f => f.id === id ? { ...f, trimIn: undefined, trimOut: undefined } : f)
            })),

            toggleFileSelection: (id, mode, allVisibleIds) => set((state) => {
                if (mode === 'single') {
                    // Plain click: toggle single selection (deselect if already only selected)
                    const isAlreadySole = state.selectedFileIds.length === 1 && state.selectedFileIds[0] === id;
                    return {
                        selectedFileIds: isAlreadySole ? [] : [id],
                        lastSelectedFileId: id,
                    };
                }
                if (mode === 'ctrl') {
                    // Ctrl+Click: toggle individual item in/out of selection
                    const isSelected = state.selectedFileIds.includes(id);
                    return {
                        selectedFileIds: isSelected
                            ? state.selectedFileIds.filter(fid => fid !== id)
                            : [...state.selectedFileIds, id],
                        lastSelectedFileId: id,
                    };
                }
                if (mode === 'shift' && allVisibleIds) {
                    // Shift+Click: range select from lastSelectedFileId to id
                    const anchor = state.lastSelectedFileId;
                    if (!anchor) {
                        return { selectedFileIds: [id], lastSelectedFileId: id };
                    }
                    const anchorIdx = allVisibleIds.indexOf(anchor);
                    const targetIdx = allVisibleIds.indexOf(id);
                    if (anchorIdx === -1 || targetIdx === -1) {
                        return { selectedFileIds: [id], lastSelectedFileId: id };
                    }
                    const start = Math.min(anchorIdx, targetIdx);
                    const end = Math.max(anchorIdx, targetIdx);
                    const rangeIds = allVisibleIds.slice(start, end + 1);
                    // Merge with existing ctrl selections
                    const merged = new Set([...state.selectedFileIds, ...rangeIds]);
                    return { selectedFileIds: Array.from(merged), lastSelectedFileId: id };
                }
                return state;
            }),

            selectAllFiles: (visibleIds) => set((state) => ({
                selectedFileIds: visibleIds ?? state.files.map(f => f.id),
            })),

            clearSelection: () => set({ selectedFileIds: [], lastSelectedFileId: null }),

            addRecentFolder: (path, fileCount) => set((state) => {
                const name = path.split(/[\\/]/).pop() || path;
                const existing = state.recentFolders.filter(f => f.path !== path);
                return { recentFolders: [{ path, name, addedAt: Date.now(), fileCount }, ...existing] };
            }),

            removeRecentFolder: (path) => set((state) => ({
                recentFolders: state.recentFolders.filter(f => f.path !== path),
            })),

            addRecentAudio: (path) => set((state) => {
                const name = path.split(/[\\/]/).pop() || path;
                const existing = state.recentAudioFiles.filter(f => f.path !== path);
                return { recentAudioFiles: [{ path, name, addedAt: Date.now() }, ...existing] };
            }),

            removeRecentAudio: (path) => set((state) => ({
                recentAudioFiles: state.recentAudioFiles.filter(f => f.path !== path),
            })),
        }),
        {
            name: 'mmmedia-media-storage',
            partialize: (state) => ({
                orientationFilter: state.orientationFilter,
                recentFolders: state.recentFolders,
                recentAudioFiles: state.recentAudioFiles,
            }),
        }
    )
);

