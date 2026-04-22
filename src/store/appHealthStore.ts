import { create } from 'zustand';

export type AppHealthState = 'idle' | 'active' | 'fast' | 'slow' | 'error' | 'loading';

interface AppHealthStore {
    state: AppHealthState;
    errorCount: number;
    scrollVelocity: number;
    fps: number;
    setState: (state: AppHealthState) => void;
    setScrollVelocity: (v: number) => void;
    setFps: (fps: number) => void;
    incrementError: () => void;
    clearErrors: () => void;
}

/**
 * Global app health store — drives the living logo's visual state.
 * Components throughout the app can push state signals here
 * (e.g. error boundaries, scroll handlers, performance monitors).
 */
export const useAppHealthStore = create<AppHealthStore>((set) => ({
    state: 'idle',
    errorCount: 0,
    scrollVelocity: 0,
    fps: 60,
    setState: (state) => set({ state }),
    setScrollVelocity: (scrollVelocity) => set({ scrollVelocity }),
    setFps: (fps) => set({ fps }),
    incrementError: () => set((s) => ({ errorCount: s.errorCount + 1, state: 'error' })),
    clearErrors: () => set({ errorCount: 0, state: 'idle' }),
}));
