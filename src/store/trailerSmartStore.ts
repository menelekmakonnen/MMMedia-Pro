import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SmartStatus = 'idle' | 'running' | 'done' | 'error';
export interface FeatureProgress { status: SmartStatus; done: number; total: number; }
export type SmartKey = 'scoring' | 'silence' | 'scenes' | 'color';

/** Per-clip analysis result produced by the Smart Engine. */
export interface ClipAnalysisResult {
    score: number;
    energyLevel: 'static' | 'low' | 'moderate' | 'high' | 'intense';
    usableInFrames?: number;
    usableOutFrames?: number;
    sceneCutsFrames?: number[];
    autoGrade?: any;
    analyzed: boolean;
    completedPasses?: SmartKey[];
    /** Analysis schema version + source fingerprint for cache invalidation. */
    analysisVersion?: number;
    sourceSize?: number;
    sourceMtimeMs?: number;
}

interface TrailerSmartStore {
    // ── Legacy per-pass progress ──
    scoring: FeatureProgress;
    silence: FeatureProgress;
    scenes: FeatureProgress;
    color: FeatureProgress;
    active: boolean;
    reset: () => void;
    setActive: (v: boolean) => void;
    begin: (key: SmartKey, total: number) => void;
    tick: (key: SmartKey) => void;
    finish: (key: SmartKey) => void;

    // ── Per-clip analysis results ──
    analysisResults: Record<string, ClipAnalysisResult>;
    queuedFileIds: string[];
    scannedFiles: Record<string, { id: string; path: string; filename: string }>;
    analyzedCount: number;
    totalCount: number;
    isFullyAnalyzed: boolean;
    isPaused: boolean;

    storeResult: (fileId: string, result: ClipAnalysisResult) => void;
    getResult: (fileId: string) => ClipAnalysisResult | undefined;
    queueFiles: (fileIds: string[]) => void;
    registerScannedFiles: (files: Array<{ id: string; path: string; filename: string }>) => void;
    clearResults: () => void;
    setPaused: (paused: boolean) => void;
}

const idle = (): FeatureProgress => ({ status: 'idle', done: 0, total: 0 });

export const useTrailerSmartStore = create<TrailerSmartStore>()(
    persist(
        (set, get) => ({
            // ── Legacy ──
            scoring: idle(), silence: idle(), scenes: idle(), color: idle(), active: false,
            reset: () => set({
                scoring: idle(), silence: idle(), scenes: idle(), color: idle(), active: false,
            }),
            setActive: (active) => set({ active }),
            begin: (key, total) => set(() => ({ [key]: { status: 'running' as SmartStatus, done: 0, total } } as any)),
            tick: (key) => set((s) => {
                const f = (s as any)[key] as FeatureProgress;
                return { [key]: { ...f, done: Math.min(f.total, f.done + 1) } } as any;
            }),
            finish: (key) => set((s) => {
                const f = (s as any)[key] as FeatureProgress;
                return { [key]: { ...f, status: 'done' as SmartStatus, done: f.total } } as any;
            }),

            // ── Per-clip results ──
            analysisResults: {},
            queuedFileIds: [],
            scannedFiles: {},
            analyzedCount: 0,
            totalCount: 0,
            isFullyAnalyzed: false,
            isPaused: false,

            storeResult: (fileId, result) => set((s) => {
                const next = { ...s.analysisResults, [fileId]: result };
                const analyzedCount = Object.keys(next).length;
                const totalCount = s.queuedFileIds.length;
                return {
                    analysisResults: next,
                    analyzedCount,
                    isFullyAnalyzed: totalCount > 0 && analyzedCount >= totalCount,
                };
            }),

            getResult: (fileId) => get().analysisResults[fileId],

            queueFiles: (fileIds) => {
                const existing = get().analysisResults;
                // Only queue files that haven't been analyzed yet
                const newIds = fileIds.filter(id => !existing[id]);
                set((s) => {
                    const merged = Array.from(new Set([...s.queuedFileIds, ...newIds]));
                    return {
                        queuedFileIds: merged,
                        totalCount: merged.length,
                        isFullyAnalyzed: merged.length > 0 && Object.keys(s.analysisResults).length >= merged.length,
                    };
                });
            },

            registerScannedFiles: (files) => set((s) => {
                const next = { ...s.scannedFiles };
                files.forEach(f => {
                    next[f.id] = { id: f.id, path: f.path, filename: f.filename };
                });
                return { scannedFiles: next };
            }),

            clearResults: () => set({
                analysisResults: {},
                queuedFileIds: [],
                scannedFiles: {},
                analyzedCount: 0,
                totalCount: 0,
                isFullyAnalyzed: false,
            }),

            setPaused: (isPaused) => set({ isPaused }),
        }),
        {
            name: 'mmmedia-trailer-smart-store',
        }
    )
);
