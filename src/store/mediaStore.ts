import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface MediaFile {
    id: string;
    path: string;
    filename: string;
    type: 'video' | 'audio' | 'image';
    duration: number; // in seconds
    width?: number;
    height?: number;
    orientation?: 'horizontal' | 'vertical' | 'square';
    format?: string;
    size?: number;
    createdAt?: number;
}

interface MediaState {
    files: MediaFile[];
    selectedFileIds: string[];
    lastSelectedFileId: string | null;
    orientationFilter: 'all' | 'horizontal' | 'vertical' | 'square';

    // Actions
    addFiles: (newFiles: MediaFile[]) => void;
    removeFile: (id: string) => void;
    clearLibrary: () => void;
    updateFile: (id: string, updates: Partial<MediaFile>) => void;
    setOrientationFilter: (filter: 'all' | 'horizontal' | 'vertical' | 'square') => void;
    // Multi-select actions
    toggleFileSelection: (id: string, mode: 'single' | 'ctrl' | 'shift', allVisibleIds?: string[]) => void;
    selectAllFiles: () => void;
    clearSelection: () => void;
}

export const useMediaStore = create<MediaState>()(
    persist(
        (set) => ({
            files: [],
            selectedFileIds: [],
            lastSelectedFileId: null,
            orientationFilter: 'all',

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

            setOrientationFilter: (filter) => set({ orientationFilter: filter }),

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

            selectAllFiles: () => set((state) => ({
                selectedFileIds: state.files.map(f => f.id),
            })),

            clearSelection: () => set({ selectedFileIds: [], lastSelectedFileId: null }),
        }),
        {
            name: 'mmmedia-media-storage',
            partialize: (state) => ({ orientationFilter: state.orientationFilter }),
        }
    )
);

