import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Marker, Region, createMarker, createRegion, sortMarkers, MarkerType,
    markersFromAudioAnalysis, regionsFromAudioAnalysis } from '../lib/markers';

/**
 * Marker Store
 * Manages timeline markers (point-in-time) and regions (ranges).
 * Persisted to localStorage under 'mmmedia-markers'.
 */

interface MarkerStore {
    markers: Marker[];
    regions: Region[];

    // Marker CRUD
    addMarker: (marker: Marker) => void;
    removeMarker: (id: string) => void;
    updateMarker: (id: string, updates: Partial<Marker>) => void;
    clearMarkers: () => void;
    clearMarkersByType: (type: MarkerType) => void;
    setMarkers: (markers: Marker[]) => void;

    // Region CRUD
    addRegion: (region: Region) => void;
    removeRegion: (id: string) => void;
    updateRegion: (id: string, updates: Partial<Region>) => void;
    clearRegions: () => void;
    setRegions: (regions: Region[]) => void;

    // Batch import
    importFromAudioAnalysis: (analysis: any, fps: number) => void;
}

export const useMarkerStore = create<MarkerStore>()(
    persist(
        (set, get) => ({
    markers: [],
    regions: [],

    // ─── Marker Actions ──────────────────────────────────────────────

    addMarker: (marker) => set((state) => ({
        markers: sortMarkers([...state.markers, marker]),
    })),

    removeMarker: (id) => set((state) => ({
        markers: state.markers.filter((m) => m.id !== id),
    })),

    updateMarker: (id, updates) => set((state) => ({
        markers: sortMarkers(
            state.markers.map((m) => (m.id === id ? { ...m, ...updates } : m))
        ),
    })),

    clearMarkers: () => set({ markers: [] }),

    clearMarkersByType: (type) => set((state) => ({
        markers: state.markers.filter((m) => m.type !== type),
    })),

    setMarkers: (markers) => set({ markers: sortMarkers(markers) }),

    // ─── Region Actions ──────────────────────────────────────────────

    addRegion: (region) => set((state) => ({
        regions: [...state.regions, region],
    })),

    removeRegion: (id) => set((state) => ({
        regions: state.regions.filter((r) => r.id !== id),
    })),

    updateRegion: (id, updates) => set((state) => ({
        regions: state.regions.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    })),

    clearRegions: () => set({ regions: [] }),

    setRegions: (regions) => set({ regions }),

    // ─── Batch Import ────────────────────────────────────────────────

    importFromAudioAnalysis: (analysis, fps) => {
        const beatMarkers = markersFromAudioAnalysis(analysis, fps);
        const sectionRegions = analysis.segments
            ? regionsFromAudioAnalysis(analysis.segments, fps)
            : [];

        set((state) => ({
            markers: sortMarkers([...state.markers, ...beatMarkers]),
            regions: [...state.regions, ...sectionRegions],
        }));
    },
}),
        {
            name: 'mmmedia-markers',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                markers: state.markers,
                regions: state.regions,
            }),
        }
    )
);
