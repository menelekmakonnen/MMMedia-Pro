/**
 * SFX Store
 *
 * Persisted Zustand store for the SFX/Foley Browser.
 * Manages registered SFX folders, scanned files with auto-categorization,
 * favourites, recently-used history, search, and category filters.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SfxFolder {
    path: string;
    name: string;
    addedAt: number;
}

export interface SfxFile {
    path: string;
    filename: string;
    categoryId: string;
    subcategoryId: string;
    /** Duration in seconds (0 when unknown). */
    duration: number;
    /** File size in bytes. */
    size: number;
    /** `path` of the SfxFolder this file came from. */
    folderId: string;
}

// ── Store interface ──────────────────────────────────────────────────────────

interface SfxStore {
    // ── Data ──
    sfxFolders: SfxFolder[];
    sfxFiles: SfxFile[];
    favorites: string[];       // file paths
    recentlyUsed: string[];    // last 20 used, newest first

    // ── UI state ──
    searchQuery: string;
    activeCategory: string | null;
    activeSubcategory: string | null;

    // ── Actions ──
    addSfxFolder: (path: string, name: string) => void;
    removeSfxFolder: (path: string) => void;
    setSfxFiles: (files: SfxFile[]) => void;
    addSfxFiles: (files: SfxFile[]) => void;
    toggleFavorite: (path: string) => void;
    recordUsage: (path: string) => void;
    setSearchQuery: (q: string) => void;
    setActiveCategory: (id: string | null) => void;
    setActiveSubcategory: (id: string | null) => void;
}

// ── Store implementation ─────────────────────────────────────────────────────

const MAX_RECENT = 20;

export const useSfxStore = create<SfxStore>()(
    persist(
        (set) => ({
            // ── Initial state ──
            sfxFolders: [],
            sfxFiles: [],
            favorites: [],
            recentlyUsed: [],
            searchQuery: '',
            activeCategory: null,
            activeSubcategory: null,

            // ── Folder management ──
            addSfxFolder: (path, name) =>
                set((s) => {
                    if (s.sfxFolders.some((f) => f.path === path)) return s;
                    return {
                        sfxFolders: [...s.sfxFolders, { path, name, addedAt: Date.now() }],
                    };
                }),

            removeSfxFolder: (path) =>
                set((s) => ({
                    sfxFolders: s.sfxFolders.filter((f) => f.path !== path),
                    sfxFiles: s.sfxFiles.filter((f) => f.folderId !== path),
                })),

            // ── File management ──
            setSfxFiles: (files) => set({ sfxFiles: files }),

            addSfxFiles: (files) =>
                set((s) => {
                    const existing = new Set(s.sfxFiles.map((f) => f.path));
                    const newFiles = files.filter((f) => !existing.has(f.path));
                    return { sfxFiles: [...s.sfxFiles, ...newFiles] };
                }),

            // ── Favourites ──
            toggleFavorite: (path) =>
                set((s) => ({
                    favorites: s.favorites.includes(path)
                        ? s.favorites.filter((p) => p !== path)
                        : [...s.favorites, path],
                })),

            // ── Recently used ──
            recordUsage: (path) =>
                set((s) => {
                    const filtered = s.recentlyUsed.filter((p) => p !== path);
                    return {
                        recentlyUsed: [path, ...filtered].slice(0, MAX_RECENT),
                    };
                }),

            // ── UI filters ──
            setSearchQuery: (q) => set({ searchQuery: q }),
            setActiveCategory: (id) => set({ activeCategory: id, activeSubcategory: null }),
            setActiveSubcategory: (id) => set({ activeSubcategory: id }),
        }),
        {
            name: 'mmmedia-sfx-store',
            // Only persist data, not transient UI state
            partialize: (state) => ({
                sfxFolders: state.sfxFolders,
                sfxFiles: state.sfxFiles,
                favorites: state.favorites,
                recentlyUsed: state.recentlyUsed,
            }),
        },
    ),
);
