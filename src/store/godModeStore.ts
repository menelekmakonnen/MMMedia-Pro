import { create } from 'zustand';
import { AudioAnalysisResult } from '../lib/audioAnalysis';

/**
 * Session-only GodMode store. Resets on reload.
 * Holds the vibe, duration, audio guide, and transition settings
 * chosen in the GodMode page — consumed by TrailerRouter/TrailerWizard.
 */
interface GodModeStore {
    enabled: boolean;
    vibe: string | null;
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

    // Transitions
    transitionsEnabled: boolean;
    transitionPreset: string;

    // Actions
    setEnabled: (v: boolean) => void;
    setVibe: (v: string | null) => void;
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
    setTransitions: (data: { enabled?: boolean; preset?: string }) => void;
    reset: () => void;
}

const INITIAL_STATE = {
    enabled: false,
    vibe: null as string | null,
    duration: 30,
    advanced: false,
    useAudioGuide: false,
    audioFile: null as string | null,
    audioUrl: null as string | null,
    audioFilePath: null as string | null,
    audioAnalysis: null as AudioAnalysisResult | null,
    audioTrimStart: 0,
    audioTrimEnd: 30,
    transitionsEnabled: true,
    transitionPreset: 'hard-cuts',
};

export const useGodModeStore = create<GodModeStore>((set) => ({
    ...INITIAL_STATE,

    setEnabled: (v) => set({ enabled: v }),
    setVibe: (v) => set({ vibe: v }),
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

    setTransitions: (data) => set((s) => ({
        transitionsEnabled: data.enabled ?? s.transitionsEnabled,
        transitionPreset: data.preset ?? s.transitionPreset,
    })),

    reset: () => set(INITIAL_STATE),
}));
