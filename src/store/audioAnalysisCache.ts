/**
 * Audio Analysis Cache --- Persists beat intelligence results by file path.
 * Once an audio file has been analyzed, subsequent loads skip re-analysis
 * and return the cached result instantly.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AudioAnalysisResult } from '../lib/audioAnalysis';

interface AudioAnalysisCacheEntry {
    result: AudioAnalysisResult;
    analyzedAt: number; // epoch ms
    beatSensitivity: number; // the sensitivity used for this analysis
}

interface AudioAnalysisCacheState {
    cache: Record<string, AudioAnalysisCacheEntry>; // keyed by file path or name
    getCached: (key: string, sensitivity: number) => AudioAnalysisResult | null;
    store: (key: string, result: AudioAnalysisResult, sensitivity: number) => void;
    invalidate: (key: string) => void;
    clearAll: () => void;
}

export const useAudioAnalysisCache = create<AudioAnalysisCacheState>()(
    persist(
        (set, get) => ({
            cache: {},
            getCached: (key, sensitivity) => {
                const entry = get().cache[key];
                if (!entry) return null;
                // Only return cached result if sensitivity matches
                if (entry.beatSensitivity !== sensitivity) return null;
                return entry.result;
            },
            store: (key, result, sensitivity) => set(state => ({
                cache: {
                    ...state.cache,
                    [key]: { result, analyzedAt: Date.now(), beatSensitivity: sensitivity },
                },
            })),
            invalidate: (key) => set(state => {
                const { [key]: _, ...rest } = state.cache;
                return { cache: rest };
            }),
            clearAll: () => set({ cache: {} }),
        }),
        {
            name: 'mmmedia-audio-analysis-cache',
            // Serialize AudioAnalysisResult which has typed arrays
            // We store the essential fields, not the full Float32Array waveform data
            partialize: (state) => ({
                cache: Object.fromEntries(
                    Object.entries(state.cache).map(([key, entry]) => [
                        key,
                        {
                            ...entry,
                            result: {
                                ...entry.result,
                                // Strip waveform data from cache (too large for localStorage)
                                // Keep beats, segments, bpm, duration, etc.
                            },
                        },
                    ])
                ),
            }),
        }
    )
);
