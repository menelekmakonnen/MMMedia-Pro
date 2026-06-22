import { create } from 'zustand';

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
}

interface TrailerSmartStore {
    // ── Legacy per-pass progress (backward compat) ──
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
    analysisResults: Map<string, ClipAnalysisResult>;
    queuedFileIds: string[];
    analyzedCount: number;
    totalCount: number;
    isFullyAnalyzed: boolean;

    storeResult: (fileId: string, result: ClipAnalysisResult) => void;
    getResult: (fileId: string) => ClipAnalysisResult | undefined;
    queueFiles: (fileIds: string[]) => void;
    clearResults: () => void;
}

const idle = (): FeatureProgress => ({ status: 'idle', done: 0, total: 0 });

export const useTrailerSmartStore = create<TrailerSmartStore>((set, get) => ({
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
    analysisResults: new Map(),
    queuedFileIds: [],
    analyzedCount: 0,
    totalCount: 0,
    isFullyAnalyzed: false,

    storeResult: (fileId, result) => set((s) => {
        const next = new Map(s.analysisResults);
        next.set(fileId, result);
        const analyzedCount = next.size;
        const totalCount = s.queuedFileIds.length;
        return {
            analysisResults: next,
            analyzedCount,
            isFullyAnalyzed: totalCount > 0 && analyzedCount >= totalCount,
        };
    }),

    getResult: (fileId) => get().analysisResults.get(fileId),

    queueFiles: (fileIds) => {
        const existing = get().analysisResults;
        // Only queue files that haven't been analyzed yet
        const newIds = fileIds.filter(id => !existing.has(id));
        set((s) => {
            // Merge new IDs into the queue, avoiding duplicates
            const merged = Array.from(new Set([...s.queuedFileIds, ...newIds]));
            return {
                queuedFileIds: merged,
                totalCount: merged.length,
                isFullyAnalyzed: merged.length > 0 && s.analysisResults.size >= merged.length,
            };
        });
    },

    clearResults: () => set({
        analysisResults: new Map(),
        queuedFileIds: [],
        analyzedCount: 0,
        totalCount: 0,
        isFullyAnalyzed: false,
    }),
}));
