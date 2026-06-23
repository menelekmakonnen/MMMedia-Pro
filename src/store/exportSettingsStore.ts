import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ExportQuality, ExportOrientation } from '../lib/exportPresets';

export type RenderEngine = 'segment' | 'per-clip' | 'monolithic' | 'both';

/** A queued edit generated while a render is in progress. */
export interface QueuedEdit {
    id: string;
    clips: any[];
    label: string;
    queuedAt: number;
}

interface ExportSettingsState {
    // Persisted user selections
    selectedPresetId: string;
    exportQuality: ExportQuality;
    orientation: ExportOrientation;
    selectedFps: number;
    lastExportPath: string | null;
    activeTab: 'mp4' | 'premiere' | 'ame';
    renderEngine: RenderEngine;
    useGpu: boolean;
    isExporting: boolean;
    /** Edits generated while a render is in progress, waiting to be rendered. */
    queuedEdits: QueuedEdit[];

    // Actions
    setSelectedPresetId: (id: string) => void;
    setExportQuality: (quality: ExportQuality) => void;
    setOrientation: (orientation: ExportOrientation) => void;
    setSelectedFps: (fps: number) => void;
    setLastExportPath: (path: string | null) => void;
    setActiveTab: (tab: 'mp4' | 'premiere' | 'ame') => void;
    setRenderEngine: (engine: RenderEngine) => void;
    setUseGpu: (v: boolean) => void;
    setIsExporting: (v: boolean) => void;
    addQueuedEdit: (edit: QueuedEdit) => void;
    removeQueuedEdit: (id: string) => void;
    clearQueuedEdits: () => void;
}

export const useExportSettingsStore = create<ExportSettingsState>()(
    persist(
        (set) => ({
            selectedPresetId: 'hd_1080',
            exportQuality: 'standard',
            orientation: 'landscape',
            selectedFps: 30,
            lastExportPath: null,
            activeTab: 'mp4',
            renderEngine: 'segment',
            useGpu: false,
            isExporting: false,
            queuedEdits: [],

            setSelectedPresetId: (selectedPresetId) => set({ selectedPresetId }),
            setExportQuality: (exportQuality) => set({ exportQuality }),
            setOrientation: (orientation) => set({ orientation }),
            setSelectedFps: (selectedFps) => set({ selectedFps }),
            setLastExportPath: (lastExportPath) => set({ lastExportPath }),
            setActiveTab: (activeTab) => set({ activeTab }),
            setRenderEngine: (renderEngine) => set({ renderEngine }),
            setUseGpu: (useGpu) => set({ useGpu }),
            setIsExporting: (isExporting) => set({ isExporting }),
            addQueuedEdit: (edit) => set((state) => ({ queuedEdits: [...state.queuedEdits, edit] })),
            removeQueuedEdit: (id) => set((state) => ({ queuedEdits: state.queuedEdits.filter((e) => e.id !== id) })),
            clearQueuedEdits: () => set({ queuedEdits: [] }),
        }),
        {
            name: 'mmmedia-export-settings',
            version: 1,
            // v1: introduce the Segment engine and make it the default. Move users
            // off the legacy default ('per-clip') unless they had explicitly chosen
            // monolithic/both. They can always switch back in the UI.
            migrate: (persisted: any, fromVersion: number) => {
                if (fromVersion < 1 && persisted && persisted.renderEngine === 'per-clip') {
                    persisted.renderEngine = 'segment';
                }
                if (persisted && persisted.useGpu === undefined) persisted.useGpu = false;
                return persisted;
            },
            partialize: (state) => {
                // Never persist isExporting or queuedEdits — they must always start empty
                const { isExporting, queuedEdits, ...rest } = state;
                return rest;
            },
        }
    )
);
