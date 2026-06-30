/**
 * Generator Mode Store
 * ════════════════════════════════════════════════════════════════════════════
 * Persisted UI/selection state for the Generator Modes feature shared by the
 * Edit Generator home and the Sequence page.
 *
 *   • `selectedModeId`  — the mode currently focused in the picker.
 *   • `toggleState`     — per-mode map of toggle id → on/off, seeded from the
 *                         mode's defaults and overridable by the user via the
 *                         UI switches.
 *
 * Apply logic lives in `lib/generatorModeApply.ts`; this store only holds state.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getGeneratorMode, defaultToggleState } from '../lib/generatorModes';

interface GeneratorModeStore {
    /** Currently selected mode id (null = none focused). */
    selectedModeId: string | null;
    /** Per-mode toggle overrides: modeId → (toggleId → boolean). */
    toggleState: Record<string, Record<string, boolean>>;
    /** When true, applying a mode also matches the sequence canvas (aspect + fps). */
    matchCanvasOnApply: boolean;

    setSelectedMode: (id: string | null) => void;
    setMatchCanvasOnApply: (value: boolean) => void;
    /** Set one toggle for a mode. */
    setToggle: (modeId: string, toggleId: string, value: boolean) => void;
    /** Reset a mode's toggles to their defaults. */
    resetToggles: (modeId: string) => void;
    /** Effective toggle state for a mode (defaults merged with user overrides). */
    getToggles: (modeId: string) => Record<string, boolean>;
}

export const useGeneratorModeStore = create<GeneratorModeStore>()(
    persist(
        (set, get) => ({
            selectedModeId: null,
            toggleState: {},
            matchCanvasOnApply: true,

            setSelectedMode: (id) => set({ selectedModeId: id }),
            setMatchCanvasOnApply: (value) => set({ matchCanvasOnApply: value }),

            setToggle: (modeId, toggleId, value) =>
                set((s) => ({
                    toggleState: {
                        ...s.toggleState,
                        [modeId]: { ...get().getToggles(modeId), [toggleId]: value },
                    },
                })),

            resetToggles: (modeId) =>
                set((s) => {
                    const next = { ...s.toggleState };
                    delete next[modeId];
                    return { toggleState: next };
                }),

            getToggles: (modeId) => {
                const mode = getGeneratorMode(modeId);
                if (!mode) return {};
                const defaults = defaultToggleState(mode);
                return { ...defaults, ...(get().toggleState[modeId] ?? {}) };
            },
        }),
        {
            name: 'mmmedia-generator-modes',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                selectedModeId: state.selectedModeId,
                toggleState: state.toggleState,
                matchCanvasOnApply: state.matchCanvasOnApply,
            }),
        },
    ),
);
