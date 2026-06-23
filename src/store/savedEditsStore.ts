import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { Clip } from '../types';

/**
 * Saved Edit — a snapshot of a generated trailer or manual edit
 * that can be reloaded, re-watched, or compiled into .mmm files.
 */
export interface SavedEdit {
    id: string;
    name: string;
    clips: Clip[];
    clipCount: number;
    thumbnailPath?: string;
    createdAt: string;
    lastOpenedAt?: string;
    /** Vibe/preset that generated this edit (if GodMode was used) */
    godModeVibe?: string;
    godModePresetId?: string;
    /** Duration in seconds */
    duration: number;
    /** Source folder path(s) — for full project restore */
    sourceFolders?: string[];
    /** Audio file path — for Beat Intelligence restore */
    audioFilePath?: string;
    /** Audio file display name */
    audioFileName?: string;
    /** Snapshot of TrailerSettings at generation time (excluding transient data) */
    settingsSnapshot?: Record<string, any>;
}

interface SavedEditsStore {
    savedEdits: SavedEdit[];
    addEdit: (edit: Omit<SavedEdit, 'id' | 'createdAt'>) => string;
    removeEdit: (id: string) => void;
    updateEditLastOpened: (id: string) => void;
    renameEdit: (id: string, name: string) => void;
    loadEdits: (edits: SavedEdit[]) => void;
    clearAll: () => void;
}

export const useSavedEditsStore = create<SavedEditsStore>()(
    persist(
        (set) => ({
            savedEdits: [],

            addEdit: (edit) => {
                const id = uuidv4();
                set((s) => ({
                    savedEdits: [
                        { ...edit, id, createdAt: new Date().toISOString() },
                        ...s.savedEdits,
                    ],
                }));
                return id;
            },

            removeEdit: (id) =>
                set((s) => ({
                    savedEdits: s.savedEdits.filter((e) => e.id !== id),
                })),

            updateEditLastOpened: (id) =>
                set((s) => ({
                    savedEdits: s.savedEdits.map((e) =>
                        e.id === id ? { ...e, lastOpenedAt: new Date().toISOString() } : e
                    ),
                })),

            renameEdit: (id, name) =>
                set((s) => ({
                    savedEdits: s.savedEdits.map((e) =>
                        e.id === id ? { ...e, name } : e
                    ),
                })),

            loadEdits: (edits) => set({ savedEdits: edits }),

            clearAll: () => set({ savedEdits: [] }),
        }),
        {
            name: 'mmmedia-saved-edits',
            storage: createJSONStorage(() => localStorage),
        }
    )
);
