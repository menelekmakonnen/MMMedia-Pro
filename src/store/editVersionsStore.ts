import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** A saved snapshot of a generated edit, for the review/iteration workflow. */
export interface EditVersion {
    id: string;
    label: string;
    createdAt: number;
    note: string;
    mode: 'trailer' | 'music-video';
    clipCount: number;
    durationFrames: number;
    /** Optional serialized sequence for side-by-side compare. */
    sequence?: unknown;
}

interface EditVersionsState {
    versions: EditVersion[];
    addVersion: (v: Omit<EditVersion, 'id' | 'createdAt'>) => string;
    removeVersion: (id: string) => void;
    clear: () => void;
    /** Summary diff between two versions (clip-count / duration deltas). */
    diff: (aId: string, bId: string) => { clipDelta: number; durationDelta: number } | null;
}

export const useEditVersionsStore = create<EditVersionsState>()(
    persist(
        (set, get) => ({
            versions: [],
            addVersion: (v) => {
                const id = 'ver_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36);
                set(s => ({ versions: [{ ...v, id, createdAt: Date.now() }, ...s.versions].slice(0, 30) }));
                return id;
            },
            removeVersion: (id) => set(s => ({ versions: s.versions.filter(v => v.id !== id) })),
            clear: () => set({ versions: [] }),
            diff: (aId, bId) => {
                const a = get().versions.find(v => v.id === aId);
                const b = get().versions.find(v => v.id === bId);
                if (!a || !b) return null;
                return { clipDelta: b.clipCount - a.clipCount, durationDelta: b.durationFrames - a.durationFrames };
            },
        }),
        { name: 'mmmedia-edit-versions', storage: createJSONStorage(() => localStorage) },
    ),
);
