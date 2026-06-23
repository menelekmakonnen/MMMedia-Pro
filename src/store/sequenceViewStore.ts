/**
 * Sequence View Store — UI state for the NLE Sequence page.
 * ════════════════════════════════════════════════════════════════════════════
 * Manages subtab selection, source monitor clip, in/out points, waveform &
 * filmstrip display toggles, and resizable media panel width.
 *
 * Persists visual preferences (activeSubTab, showWaveforms, showFilmstrips,
 * mediaPanelWidth) to localStorage.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ─── Types ───────────────────────────────────────────────────────────────────

export type SequenceSubTab = 'upload' | 'media' | 'edit' | 'mix' | 'effects' | 'scopes';

export interface SourceMonitorClip {
    id: string;
    path: string;
    filename: string;
    duration: number;
}

export interface SequenceViewState {
    // Subtab navigation
    activeSubTab: SequenceSubTab;
    setActiveSubTab: (tab: SequenceSubTab) => void;

    // Source monitor
    sourceMonitorClip: SourceMonitorClip | null;
    setSourceMonitorClip: (clip: SourceMonitorClip | null) => void;

    // Source in/out points (frame-based)
    sourceIn: number | null;
    sourceOut: number | null;
    setSourceIn: (frame: number | null) => void;
    setSourceOut: (frame: number | null) => void;

    // Display toggles
    showWaveforms: boolean;
    toggleWaveforms: () => void;
    showFilmstrips: boolean;
    toggleFilmstrips: () => void;

    // Resizable media panel
    mediaPanelWidth: number;
    setMediaPanelWidth: (w: number) => void;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useSequenceViewStore = create<SequenceViewState>()(
    persist(
        (set) => ({
            // ── State ────────────────────────────────────────────────
            activeSubTab: 'edit',
            sourceMonitorClip: null,
            sourceIn: null,
            sourceOut: null,
            showWaveforms: true,
            showFilmstrips: true,
            mediaPanelWidth: 300,

            // ── Actions ──────────────────────────────────────────────

            setActiveSubTab: (tab) => set({ activeSubTab: tab }),

            setSourceMonitorClip: (clip) => set({
                sourceMonitorClip: clip,
                sourceIn: null,
                sourceOut: null,
            }),

            setSourceIn: (frame) => set({ sourceIn: frame }),
            setSourceOut: (frame) => set({ sourceOut: frame }),

            toggleWaveforms: () => set((s) => ({ showWaveforms: !s.showWaveforms })),
            toggleFilmstrips: () => set((s) => ({ showFilmstrips: !s.showFilmstrips })),

            setMediaPanelWidth: (w) => set({ mediaPanelWidth: Math.max(200, Math.min(600, w)) }),
        }),
        {
            name: 'mmmedia-sequence-view',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                activeSubTab: state.activeSubTab,
                showWaveforms: state.showWaveforms,
                showFilmstrips: state.showFilmstrips,
                mediaPanelWidth: state.mediaPanelWidth,
            }),
        },
    ),
);
