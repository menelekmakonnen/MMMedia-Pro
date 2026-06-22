/**
 * Edit Settings Store — Per-mode settings persistence.
 * ════════════════════════════════════════════════════════════════════════════
 * Persists user preferences for each edit generator mode (trailer, showreel,
 * video essay, short film) to localStorage. Settings are stored as partials
 * and merged with defaults at consumption time.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { TrailerSettings } from '../lib/trailerGenerator';
import type { ShowreelSettings } from '../lib/showreelGenerator';
import type { VideoEssaySettings } from '../lib/videoEssayGenerator';
import type { ActStructure, SceneDefinition } from '../lib/shortFilmAssistant';
import type { EditType } from '../features/TrailerGenerator/EditGeneratorHome';

// ─── Store Interface ─────────────────────────────────────────────────────────

interface EditSettingsStore {
    // Last selected mode
    activeMode: EditType;

    // Per-mode settings (partials — merged with defaults at use-time)
    trailerSettings: Partial<TrailerSettings>;
    showreelSettings: Partial<ShowreelSettings>;
    videoEssaySettings: Partial<VideoEssaySettings>;
    shortFilmState: {
        structure: ActStructure;
        scenes: SceneDefinition[];
    };

    // Actions
    setActiveMode: (mode: EditType) => void;
    updateTrailerSettings: (patch: Partial<TrailerSettings>) => void;
    updateShowreelSettings: (patch: Partial<ShowreelSettings>) => void;
    updateVideoEssaySettings: (patch: Partial<VideoEssaySettings>) => void;
    updateShortFilmState: (patch: Partial<{ structure: ActStructure; scenes: SceneDefinition[] }>) => void;
    resetMode: (mode: EditType) => void;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_SHORT_FILM_STATE: EditSettingsStore['shortFilmState'] = {
    structure: 'three-act',
    scenes: [],
};

// ─── Store ───────────────────────────────────────────────────────────────────

export const useEditSettingsStore = create<EditSettingsStore>()(
    persist(
        (set) => ({
            // ── State ────────────────────────────────────────────────
            activeMode: 'trailer' as EditType,
            trailerSettings: {},
            showreelSettings: {},
            videoEssaySettings: {},
            shortFilmState: { ...DEFAULT_SHORT_FILM_STATE },

            // ── Actions ──────────────────────────────────────────────

            setActiveMode: (mode) => set({ activeMode: mode }),

            updateTrailerSettings: (patch) =>
                set((state) => ({
                    trailerSettings: { ...state.trailerSettings, ...patch },
                })),

            updateShowreelSettings: (patch) =>
                set((state) => ({
                    showreelSettings: { ...state.showreelSettings, ...patch },
                })),

            updateVideoEssaySettings: (patch) =>
                set((state) => ({
                    videoEssaySettings: { ...state.videoEssaySettings, ...patch },
                })),

            updateShortFilmState: (patch) =>
                set((state) => ({
                    shortFilmState: { ...state.shortFilmState, ...patch },
                })),

            resetMode: (mode) => {
                switch (mode) {
                    case 'trailer':
                    case 'music-video':
                        set({ trailerSettings: {} });
                        break;
                    case 'showreel':
                        set({ showreelSettings: {} });
                        break;
                    case 'video-essay':
                        set({ videoEssaySettings: {} });
                        break;
                    case 'short-film':
                        set({ shortFilmState: { ...DEFAULT_SHORT_FILM_STATE } });
                        break;
                }
            },
        }),
        {
            name: 'mmmedia-edit-settings',
            storage: createJSONStorage(() => localStorage),
        },
    ),
);
