import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ExportQuality, ExportOrientation } from '../lib/exportPresets';

export type RenderEngine = 'per-clip' | 'monolithic' | 'both';

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
            renderEngine: 'per-clip',
            useGpu: false,
            isExporting: false,

            setSelectedPresetId: (selectedPresetId) => set({ selectedPresetId }),
            setExportQuality: (exportQuality) => set({ exportQuality }),
            setOrientation: (orientation) => set({ orientation }),
            setSelectedFps: (selectedFps) => set({ selectedFps }),
            setLastExportPath: (lastExportPath) => set({ lastExportPath }),
            setActiveTab: (activeTab) => set({ activeTab }),
            setRenderEngine: (renderEngine) => set({ renderEngine }),
            setUseGpu: (useGpu) => set({ useGpu }),
            setIsExporting: (isExporting) => set({ isExporting }),
        }),
        {
            name: 'mmmedia-export-settings',
            partialize: (state) => {
                // Never persist isExporting — it must always start as false
                const { isExporting, ...rest } = state;
                return rest;
            },
        }
    )
);
