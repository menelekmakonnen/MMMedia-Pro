import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

export type ResolutionPreset = '9:16' | '16:9' | '1:1' | '4:3' | '21:9';
export type BackgroundFillMode = 'blur' | 'black';

export interface ProjectResolution {
    width: number;
    height: number;
    label: string;
}

export interface ProjectSettings {
    id: string;
    name: string;
    resolution: ProjectResolution;
    aspectRatio: string; // e.g., "9:16", "16:9"
    fps: number;
    backgroundFillMode: BackgroundFillMode;
    createdAt: string;
    lastModified: string;
}

interface ProjectState {
    settings: ProjectSettings;

    // Actions
    updateSettings: (updates: Partial<ProjectSettings>) => void;
    setResolution: (preset: ResolutionPreset) => void;
    setAspectRatio: (ratio: string) => void;
    createNewProject: () => void;
}

// Helper function to generate default project name
const generateProjectName = (): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day} MMMEdia Project ${hours}:${minutes}`;
};

// Mobile-first resolution presets
const RESOLUTIONS: Record<ResolutionPreset, ProjectResolution> = {
    '9:16': { width: 1080, height: 1920, label: '9:16 Vertical/Mobile' },
    '16:9': { width: 1920, height: 1080, label: '16:9 Widescreen' },
    '1:1': { width: 1080, height: 1080, label: '1:1 Square' },
    '4:3': { width: 1440, height: 1080, label: '4:3 Standard' },
    '21:9': { width: 2560, height: 1080, label: '21:9 Ultrawide' }
};

export const useProjectStore = create<ProjectState>((set) => ({
    settings: {
        id: uuidv4(),
        name: generateProjectName(),
        resolution: RESOLUTIONS['9:16'], // Default to mobile
        aspectRatio: '9:16',
        fps: 30,
        backgroundFillMode: 'blur',
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
            aspectRatio: preset,
            lastModified: new Date().toISOString()
        }
    })),

    setAspectRatio: (ratio) => set((state) => {
        // Calculate new dimensions based on ratio
        const baseHeight = 1080; // Standard height
        let width = baseHeight;
        let height = baseHeight;

        switch (ratio) {
            case '16:9':
                width = 1920;
                height = 1080;
                break;
            case '9:16':
                width = 1080;
                height = 1920;
                break;
            case '4:3':
                width = 1440;
                height = 1080;
                break;
            case '1:1':
                width = 1080;
                height = 1080;
                break;
            case '21:9':
                width = 2560;
                height = 1080;
                break;
        }

        return {
            settings: {
                ...state.settings,
                aspectRatio: ratio,
                resolution: {
                    width,
                    height,
                    label: `${width}x${height}`
                },
                lastModified: new Date().toISOString()
            }
        };
    }),

    createNewProject: () => set({
        settings: {
            id: uuidv4(),
            name: generateProjectName(),
            resolution: RESOLUTIONS['9:16'],
            aspectRatio: '9:16',
            fps: 30,
            backgroundFillMode: 'blur',
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString(),
        }
    })
}));
