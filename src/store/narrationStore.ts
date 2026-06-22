import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { NarrationAnalysisResult } from '../lib/narrationAnalysis';

// ═══════════════════════════════════════════════════════
//  NARRATION STORE
// ═══════════════════════════════════════════════════════

interface NarrationStore {
    narrationFile: string | null;
    narrationName: string | null;
    narrationUrl: string | null;
    narrationDuration: number;
    transcript: string | null;
    analysis: NarrationAnalysisResult | null;
    isAnalyzing: boolean;

    // Actions
    setNarrationFile: (path: string, name: string) => void;
    setNarrationUrl: (url: string) => void;
    setTranscript: (text: string) => void;
    setAnalysis: (result: NarrationAnalysisResult) => void;
    setAnalyzing: (v: boolean) => void;
    clear: () => void;
}

const initialState = {
    narrationFile: null as string | null,
    narrationName: null as string | null,
    narrationUrl: null as string | null,
    narrationDuration: 0,
    transcript: null as string | null,
    analysis: null as NarrationAnalysisResult | null,
    isAnalyzing: false,
};

export const useNarrationStore = create<NarrationStore>()(
    persist(
        (set) => ({
            ...initialState,

            setNarrationFile: (path, name) => set({
                narrationFile: path,
                narrationName: name,
            }),

            setNarrationUrl: (url) => set({ narrationUrl: url }),

            setTranscript: (text) => set({ transcript: text }),

            setAnalysis: (result) => set({
                analysis: result,
                narrationDuration: result.duration,
            }),

            setAnalyzing: (v) => set({ isAnalyzing: v }),

            clear: () => set({ ...initialState }),
        }),
        {
            name: 'mmmedia-narration',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                narrationFile: state.narrationFile,
                narrationName: state.narrationName,
                narrationUrl: state.narrationUrl,
                narrationDuration: state.narrationDuration,
                transcript: state.transcript,
                analysis: state.analysis,
                // EXCLUDE transient state: isAnalyzing
            }),
        },
    ),
);
