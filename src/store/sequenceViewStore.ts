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

export type SequenceSubTab = 'upload' | 'media' | 'edit';
export type LeftPanelTab = 'effects' | 'scopes' | 'hooks' | 'editorial' | 'modes' | 'color';

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

    // Left panel (Effects / Scopes)
    leftPanelOpen: boolean;
    leftPanelWidth: number;
    leftPanelTab: LeftPanelTab;
    setLeftPanelOpen: (open: boolean) => void;
    setLeftPanelWidth: (w: number) => void;
    setLeftPanelTab: (tab: LeftPanelTab) => void;
    toggleLeftPanel: () => void;

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

    // Clip Speed/Duration dialog (Premiere ⌃R)
    speedDialogOpen: boolean;
    setSpeedDialogOpen: (open: boolean) => void;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useSequenceViewStore = create<SequenceViewState>()(
    persist(
        (set) => ({
            // ── State ────────────────────────────────────────────────
            activeSubTab: 'edit' as SequenceSubTab,
            leftPanelOpen: true,
            leftPanelWidth: 260,
            leftPanelTab: 'effects' as LeftPanelTab,
            sourceMonitorClip: null,
            sourceIn: null,
            sourceOut: null,
            showWaveforms: true,
            showFilmstrips: true,
            mediaPanelWidth: 300,
            speedDialogOpen: false,

            // ── Actions ──────────────────────────────────────────────

            setActiveSubTab: (tab) => set({ activeSubTab: tab }),

            setLeftPanelOpen: (open) => set({ leftPanelOpen: open }),
            setLeftPanelWidth: (w) => set({ leftPanelWidth: Math.max(200, Math.min(400, w)) }),
            setLeftPanelTab: (tab) => set({ leftPanelTab: tab }),
            toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),

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

            setSpeedDialogOpen: (open) => set({ speedDialogOpen: open }),
        }),
        {
            name: 'mmmedia-sequence-view',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                activeSubTab: state.activeSubTab,
                leftPanelOpen: state.leftPanelOpen,
                leftPanelWidth: state.leftPanelWidth,
                leftPanelTab: state.leftPanelTab,
                showWaveforms: state.showWaveforms,
                showFilmstrips: state.showFilmstrips,
                mediaPanelWidth: state.mediaPanelWidth,
            }),
        },
    ),
);
