import { create } from 'zustand';
import { AudioAnalysisResult } from '../lib/audioAnalysis';
import { TrailerSettings } from '../lib/trailerGenerator';
import { VideoMode, TemplateId, getDefaultTemplatesForMode } from '../lib/editingModes';

/**
 * Session-only GodMode store. Resets on reload.
 * Holds the duration and audio guide chosen in the GodMode page —
 * consumed by TrailerRouter/TrailerWizard.
 */
interface GodModeStore {
    enabled: boolean;
    duration: number;
    advanced: boolean;

    // Audio guide (session-only)
    useAudioGuide: boolean;
    audioFile: string | null;
    audioUrl: string | null;
    audioFilePath: string | null;
    audioAnalysis: AudioAnalysisResult | null;
    audioTrimStart: number;
    audioTrimEnd: number;

    // Resolved preset reference
    selectedPresetId: string | null;
    pacingTemplate: string | null;

    // Auto-generate: when set, TrailerRouter will skip the wizard
    // and go straight to the player with these settings
    autoGenerate: boolean;
    lastGeneratedSettings: TrailerSettings | null;

    // Video mode
    videoMode: VideoMode;
    selectedTemplates: TemplateId[];

    // Advanced settings
    beatSensitivity: number; // 0-1
    cameraMotion: number; // 0-1
    forceAllClips: boolean;
    // Boomerang
    boomerangMode: 'off' | 'drops' | 'all';


    // Actions
    setEnabled: (v: boolean) => void;
    setDuration: (v: number) => void;
    setAdvanced: (v: boolean) => void;
    setAudioGuide: (data: {
        useAudioGuide: boolean;
        audioFile?: string | null;
        audioUrl?: string | null;
        audioFilePath?: string | null;
        audioAnalysis?: AudioAnalysisResult | null;
        audioTrimStart?: number;
        audioTrimEnd?: number;
    }) => void;
    setPresetRef: (data: { presetId?: string | null; pacing?: string | null }) => void;
    setAutoGenerate: (settings: TrailerSettings | null) => void;
    clearAutoGenerate: () => void;
    setVideoMode: (mode: VideoMode) => void;
    setSelectedTemplates: (templates: TemplateId[]) => void;
    toggleTemplate: (template: TemplateId) => void;
    setBeatSensitivity: (v: number) => void;
    setCameraMotion: (v: number) => void;
    setForceAllClips: (v: boolean) => void;
    setBoomerangMode: (v: 'off' | 'drops' | 'all') => void;

    reset: () => void;
}

const INITIAL_STATE = {
    enabled: false,
    duration: 30,
    advanced: false,
    useAudioGuide: false,
    audioFile: null as string | null,
    audioUrl: null as string | null,
    audioFilePath: null as string | null,
    audioAnalysis: null as AudioAnalysisResult | null,
    audioTrimStart: 0,
    audioTrimEnd: 30,
    selectedPresetId: null as string | null,
    pacingTemplate: null as string | null,
    autoGenerate: false,
    lastGeneratedSettings: null as TrailerSettings | null,
    videoMode: 'trailer' as VideoMode,
    selectedTemplates: ['pulse', 'impact'] as TemplateId[],
    beatSensitivity: 0.5,
    cameraMotion: 0.5,
    forceAllClips: false,
    boomerangMode: 'off' as 'off' | 'drops' | 'all',

};

export const useGodModeStore = create<GodModeStore>((set) => ({
    ...INITIAL_STATE,

    setEnabled: (v) => set({ enabled: v }),
    setDuration: (v) => set({ duration: v }),
    setAdvanced: (v) => set({ advanced: v }),

    setAudioGuide: (data) => set((s) => ({
        useAudioGuide: data.useAudioGuide,
        audioFile: data.audioFile ?? s.audioFile,
        audioUrl: data.audioUrl ?? s.audioUrl,
        audioFilePath: data.audioFilePath ?? s.audioFilePath,
        audioAnalysis: data.audioAnalysis ?? s.audioAnalysis,
        audioTrimStart: data.audioTrimStart ?? s.audioTrimStart,
        audioTrimEnd: data.audioTrimEnd ?? s.audioTrimEnd,
    })),

    setPresetRef: (data) => set((s) => ({
        selectedPresetId: data.presetId ?? s.selectedPresetId,
        pacingTemplate: data.pacing ?? s.pacingTemplate,
    })),

    setAutoGenerate: (settings) => set({
        autoGenerate: true,
        lastGeneratedSettings: settings,
    }),

    clearAutoGenerate: () => set({
        autoGenerate: false,
    }),

    setVideoMode: (mode) => {
        const defaults = getDefaultTemplatesForMode(mode);
        set({ videoMode: mode, selectedTemplates: defaults });
    },

    setSelectedTemplates: (templates) => set({ selectedTemplates: templates }),

    toggleTemplate: (template) => set((state) => {
        const current = state.selectedTemplates;
        if (current.includes(template)) {
            // Remove (but keep at least 1)
            if (current.length <= 1) return state;
            return { selectedTemplates: current.filter(t => t !== template) };
        }
        // Add (max 3)
        if (current.length >= 3) return state;
        return { selectedTemplates: [...current, template] };
    }),

    setBeatSensitivity: (v) => set({ beatSensitivity: v }),
    setCameraMotion: (v) => set({ cameraMotion: v }),
    setForceAllClips: (v) => set({ forceAllClips: v }),
    setBoomerangMode: (v) => set({ boomerangMode: v }),


    reset: () => set(INITIAL_STATE),
}));
