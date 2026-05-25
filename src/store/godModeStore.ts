import { create } from 'zustand';
import { AudioAnalysisResult } from '../lib/audioAnalysis';
import { TrailerSettings } from '../lib/trailerGenerator';

/**
 * Session-only GodMode store. Resets on reload.
 * Holds the vibe, duration, audio guide, and transition settings
 * chosen in the GodMode page — consumed by TrailerRouter/TrailerWizard.
 *
 * This is the single source of truth for GodMode state across
 * both the standalone GodModeTab and the TrailerWizard inline GodMode.
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

    // Resolved preset reference
    selectedPresetId: string | null;
    pacingTemplate: string | null;
    styleTemplate: string | null;

    // Viral intelligence
    hookStyle: 'none' | 'snap-speed' | 'pattern-interrupt' | 'speed-freeze' | 'auto';
    retentionInterrupts: boolean;
    loopMode: boolean;
    visualTexture: 'none' | 'grain' | 'chromatic' | 'motion-blur' | 'vintage';

    // Auto-generate: when set, TrailerRouter will skip the wizard
    // and go straight to the player with these settings
    autoGenerate: boolean;
    lastGeneratedSettings: TrailerSettings | null;

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
    setPresetRef: (data: { presetId?: string | null; pacing?: string | null; style?: string | null }) => void;
    setViralIntelligence: (data: {
        hookStyle?: 'none' | 'snap-speed' | 'pattern-interrupt' | 'speed-freeze' | 'auto';
        retentionInterrupts?: boolean;
        loopMode?: boolean;
        visualTexture?: 'none' | 'grain' | 'chromatic' | 'motion-blur' | 'vintage';
    }) => void;
    setAutoGenerate: (settings: TrailerSettings | null) => void;
    clearAutoGenerate: () => void;
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
    selectedPresetId: null as string | null,
    pacingTemplate: null as string | null,
    styleTemplate: null as string | null,
    hookStyle: 'none' as const,
    retentionInterrupts: false,
    loopMode: false,
    visualTexture: 'none' as const,
    autoGenerate: false,
    lastGeneratedSettings: null as TrailerSettings | null,
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

    setPresetRef: (data) => set((s) => ({
        selectedPresetId: data.presetId ?? s.selectedPresetId,
        pacingTemplate: data.pacing ?? s.pacingTemplate,
        styleTemplate: data.style ?? s.styleTemplate,
    })),

    setViralIntelligence: (data) => set((s) => ({
        hookStyle: data.hookStyle ?? s.hookStyle,
        retentionInterrupts: data.retentionInterrupts ?? s.retentionInterrupts,
        loopMode: data.loopMode ?? s.loopMode,
        visualTexture: data.visualTexture ?? s.visualTexture,
    })),

    setAutoGenerate: (settings) => set({
        autoGenerate: true,
        lastGeneratedSettings: settings,
    }),

    clearAutoGenerate: () => set({
        autoGenerate: false,
    }),

    reset: () => set(INITIAL_STATE),
}));
