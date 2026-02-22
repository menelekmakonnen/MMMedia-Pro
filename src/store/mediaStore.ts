import { create } from 'zustand';

export interface MediaFile {
    id: string;
    path: string;
    filename: string;
    type: 'video' | 'audio' | 'image';
    duration: number; // in seconds
    format?: string;
    size?: number;
    createdAt?: number;
}

interface MediaState {
    files: MediaFile[];

    // Actions
    addFiles: (newFiles: MediaFile[]) => void;
    removeFile: (id: string) => void;
    clearLibrary: () => void;
    updateFile: (id: string, updates: Partial<MediaFile>) => void;
}

export const useMediaStore = create<MediaState>((set) => ({
    files: [],

    addFiles: (newFiles) => set((state) => {
        // Allow duplicates (different IDs, same path are allowed)
        return { files: [...state.files, ...newFiles] };
    }),

    removeFile: (id) => set((state) => ({
        files: state.files.filter(f => f.id !== id)
    })),

    clearLibrary: () => set({ files: [] }),

    updateFile: (id, updates) => set((state) => ({
        files: state.files.map(f => f.id === id ? { ...f, ...updates } : f)
    }))
}));
