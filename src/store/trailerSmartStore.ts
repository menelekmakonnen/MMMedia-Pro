import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SmartStatus = 'idle' | 'running' | 'done' | 'error';
export interface FeatureProgress { status: SmartStatus; done: number; total: number; }
export type SmartKey = 'scoring' | 'silence' | 'scenes' | 'color' | 'visual-match' | 'shot-type' | 'semantic';

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
    /** Visual-match analysis — used for match-cut & seamless transitions */
    startFrameSignature?: string;     // perceptual hash of the first frame
    endFrameSignature?: string;       // perceptual hash of the last frame
    colorHistogram?: number[];        // 16-bin normalized luma histogram (last 10 frames)
    dominantMotionDirection?: number; // dominant optical flow direction in degrees (0-360)
    /** Which analysis pass produced this result (1 = first, 2 = refinement). */
    analysisPass?: number;
    /** Shot classification — from shotClassifier.ts */
    shotType?: import('../lib/shotClassifier').ShotType;
    shotTypeConfidence?: number;
    cameraMovement?: import('../lib/shotClassifier').CameraMovement;
    hasFaces?: boolean;
    faceCount?: number;
    edgeDensity?: number;
    /** Semantic tagging — from semanticTagger.ts */
    mood?: import('../lib/semanticTagger').MoodTag;
    moodConfidence?: number;
    setting?: import('../lib/semanticTagger').SettingTag;
    timeOfDay?: import('../lib/semanticTagger').TimeOfDayTag;
    pace?: import('../lib/semanticTagger').PaceTag;
    dominantColor?: string;
    colorTemperatureK?: number;
    contentFlags?: import('../lib/semanticTagger').ContentFlag[];
    /** High-level content category — from contentClassifier.ts (Pass 3). */
    contentType?: import('../lib/contentClassifier').ContentLabel;
}

interface TrailerSmartStore {
    // ── Legacy per-pass progress ──
    scoring: FeatureProgress;
    silence: FeatureProgress;
    scenes: FeatureProgress;
    color: FeatureProgress;
    'visual-match': FeatureProgress;
    'shot-type': FeatureProgress;
    semantic: FeatureProgress;
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
            scoring: idle(), silence: idle(), scenes: idle(), color: idle(), 'visual-match': idle(), 'shot-type': idle(), semantic: idle(), active: false,
            reset: () => set({
                scoring: idle(), silence: idle(), scenes: idle(), color: idle(), 'visual-match': idle(), 'shot-type': idle(), semantic: idle(), active: false,
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
