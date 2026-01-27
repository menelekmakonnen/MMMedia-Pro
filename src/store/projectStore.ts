import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

export type ResolutionPreset = '720p' | '1080p' | '4K';

export interface ProjectResolution {
    width: number;
    height: number;
    label: string;
}

export interface ProjectSettings {
    id: string;
    name: string;
    resolution: ProjectResolution;
    fps: number;
    createdAt: string;
    lastModified: string;
}

interface ProjectState {
    settings: ProjectSettings;

    // Actions
    updateSettings: (updates: Partial<ProjectSettings>) => void;
    setResolution: (preset: ResolutionPreset) => void;
    createNewProject: () => void;
}

const RESOLUTIONS: Record<ResolutionPreset, ProjectResolution> = {
    '720p': { width: 1280, height: 720, label: '720p HD' },
    '1080p': { width: 1920, height: 1080, label: '1080p Full HD' },
    '4K': { width: 3840, height: 2160, label: '4K UHD' }
};

export const useProjectStore = create<ProjectState>((set) => ({
    settings: {
        id: uuidv4(),
        name: "Untitled Project",
        resolution: RESOLUTIONS['1080p'],
        fps: 30,
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
    },

    updateSettings: (updates) => set((state) => ({
        settings: { ...state.settings, ...updates, lastModified: new Date().toISOString() }
    })),

    setResolution: (preset) => set((state) => ({
        settings: {
            ...state.settings,
            resolution: RESOLUTIONS[preset],
            lastModified: new Date().toISOString()
        }
    })),

    createNewProject: () => set({
        settings: {
            id: uuidv4(),
            name: "New Project",
            resolution: RESOLUTIONS['1080p'],
            fps: 30,
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString(),
        }
    })
}));
