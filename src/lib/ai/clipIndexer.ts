/**
 * Clip Indexer — Background indexing pipeline for media analysis.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Manages the analysis queue, caches results, and provides query access.
 * Actual ML inference would run in Web Workers (not implemented here —
 * this provides the pipeline orchestration and mock data generation
 * for testing the system before ML models are integrated).
 */

import type {
    ClipAnalysis,
    ShotScale,
    SceneEnvironment,
    TimeOfDayVisual,
    CameraMotion,
    EmotionLabel,
    FaceDetection,
} from './clipAnalyzer';
import { classifyShotScale } from './clipAnalyzer';

// ─── Indexing Status ─────────────────────────────────────────────────────────

export type IndexingStatus = 'idle' | 'indexing' | 'paused' | 'error';

export interface IndexingProgress {
    status: IndexingStatus;
    totalClips: number;
    processedClips: number;
    currentClipId?: string;
    /** Estimated seconds remaining. */
    estimatedTimeRemaining?: number;
    errors: Array<{ clipId: string; error: string }>;
}

// ─── Deterministic RNG (mulberry32) ──────────────────────────────────────────

/**
 * mulberry32 — fast 32-bit deterministic PRNG.
 * Returns a function that yields numbers in [0, 1) on each call.
 * Used for mock data generation so results are reproducible per clip ID.
 */
function mulberry32(seed: number): () => number {
    return () => {
        seed |= 0;
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Simple string → 32-bit hash (djb2).
 * Deterministic and fast enough for mock data seeding.
 */
function hashString(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
    }
    return hash >>> 0; // force unsigned
}

// ─── Clip Index Manager ──────────────────────────────────────────────────────

/**
 * Orchestrates background clip analysis, caches results, and exposes
 * query / subscription APIs for the rest of the application.
 *
 * The real ML inference path (Transformers.js in Web Workers) is not
 * implemented here. Instead, `generateMockAnalysis` can be used to
 * produce plausible test data for every pipeline consumer.
 */
export class ClipIndexManager {
    private cache: Map<string, ClipAnalysis> = new Map();
    private progress: IndexingProgress;
    private listeners: Set<(progress: IndexingProgress) => void> = new Set();
    private queue: string[] = [];

    constructor() {
        this.progress = {
            status: 'idle',
            totalClips: 0,
            processedClips: 0,
            errors: [],
        };
    }

    // ── Read API ─────────────────────────────────────────────────────────

    /** Get cached analysis for a clip (undefined if not yet analysed). */
    getAnalysis(clipId: string): ClipAnalysis | undefined {
        return this.cache.get(clipId);
    }

    /** Check if a clip has been analysed. */
    isAnalyzed(clipId: string): boolean {
        return this.cache.has(clipId);
    }

    /** Return all cached analyses as an array. */
    getAllAnalyses(): ClipAnalysis[] {
        return Array.from(this.cache.values());
    }

    // ── Queue API ────────────────────────────────────────────────────────

    /**
     * Queue clip IDs for background analysis.
     * Already-analysed clips are silently skipped.
     */
    queueForAnalysis(clipIds: string[]): void {
        const newIds = clipIds.filter(id => !this.cache.has(id) && !this.queue.includes(id));
        this.queue.push(...newIds);
        this.progress.totalClips = this.cache.size + this.queue.length;
        this.notifyListeners();
    }

    // ── Progress / Subscription ──────────────────────────────────────────

    /** Get a snapshot of current indexing progress. */
    getProgress(): IndexingProgress {
        return { ...this.progress, errors: [...this.progress.errors] };
    }

    /**
     * Subscribe to progress updates.
     * @returns An unsubscribe function.
     */
    onProgress(listener: (progress: IndexingProgress) => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    // ── Write API ────────────────────────────────────────────────────────

    /** Store an analysis result (and remove the clip from the queue). */
    storeAnalysis(analysis: ClipAnalysis): void {
        this.cache.set(analysis.clipId, analysis);
        const idx = this.queue.indexOf(analysis.clipId);
        if (idx !== -1) this.queue.splice(idx, 1);

        this.progress.processedClips = this.cache.size;
        this.progress.totalClips = this.cache.size + this.queue.length;
        if (this.queue.length === 0) {
            this.progress.status = 'idle';
            this.progress.currentClipId = undefined;
            this.progress.estimatedTimeRemaining = undefined;
        }
        this.notifyListeners();
    }

    /** Clear all cached analyses and reset progress. */
    clearCache(): void {
        this.cache.clear();
        this.queue = [];
        this.progress = {
            status: 'idle',
            totalClips: 0,
            processedClips: 0,
            errors: [],
        };
        this.notifyListeners();
    }

    // ── Stats ────────────────────────────────────────────────────────────

    /** Aggregate summary statistics across all cached analyses. */
    getStats(): {
        total: number;
        withFaces: number;
        withDialogue: number;
        byEnvironment: Record<string, number>;
    } {
        const analyses = this.getAllAnalyses();
        const byEnvironment: Record<string, number> = {};

        let withFaces = 0;
        let withDialogue = 0;

        for (const a of analyses) {
            if (a.faceCount > 0) withFaces++;
            if (a.hasDialogue) withDialogue++;
            byEnvironment[a.sceneEnvironment] = (byEnvironment[a.sceneEnvironment] || 0) + 1;
        }

        return {
            total: analyses.length,
            withFaces,
            withDialogue,
            byEnvironment,
        };
    }

    // ── Mock Data Generation ─────────────────────────────────────────────

    /** Lookup tables for mock generation. */
    private static readonly SHOT_SCALES: ShotScale[] =
        ['ecu', 'cu', 'mcu', 'ms', 'mls', 'ls', 'els'];
    private static readonly ENVIRONMENTS: SceneEnvironment[] =
        ['indoor', 'outdoor', 'studio', 'stage', 'vehicle'];
    private static readonly TIMES_OF_DAY: TimeOfDayVisual[] =
        ['day', 'night', 'golden-hour', 'blue-hour', 'artificial'];
    private static readonly CAMERA_MOTIONS: CameraMotion[] =
        ['static', 'pan', 'tilt', 'zoom-in', 'zoom-out', 'tracking', 'handheld', 'drone', 'dolly'];
    private static readonly EMOTIONS: EmotionLabel[] =
        ['happy', 'sad', 'angry', 'fearful', 'surprised', 'disgusted', 'neutral', 'contempt'];
    private static readonly SCENE_LABELS: string[] = [
        'office', 'park', 'street', 'beach', 'kitchen', 'forest',
        'concert', 'classroom', 'restaurant', 'warehouse', 'rooftop',
        'airport', 'hospital', 'courtroom', 'gym', 'library',
    ];
    private static readonly OBJECT_LABELS: string[] = [
        'person', 'car', 'dog', 'cat', 'phone', 'laptop', 'chair',
        'table', 'cup', 'book', 'bicycle', 'umbrella', 'backpack',
        'bottle', 'microphone', 'guitar', 'camera', 'monitor',
    ];

    /**
     * Generate plausible mock analysis data for testing.
     *
     * Uses mulberry32 RNG seeded from a hash of `clipId` (plus an optional
     * numeric seed offset) so results are fully deterministic and
     * reproducible.
     *
     * @param clipId  Clip identifier to generate data for
     * @param seed    Optional numeric seed offset (default 0)
     * @returns A complete ClipAnalysis with realistic distributions
     */
    generateMockAnalysis(clipId: string, seed: number = 0): ClipAnalysis {
        const rng = mulberry32(hashString(clipId) + seed);

        // Helper: pick from an array
        const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

        // ── Faces (0-3) ──────────────────────────────────────────────────
        const faceCount = Math.floor(rng() * 4); // 0, 1, 2, or 3
        const faces: FaceDetection[] = [];

        for (let i = 0; i < faceCount; i++) {
            const w = 0.05 + rng() * 0.35;  // 5-40% of frame width
            const h = 0.08 + rng() * 0.45;  // 8-53% of frame height
            faces.push({
                bbox: {
                    x: rng() * (1 - w),
                    y: rng() * (1 - h),
                    width: w,
                    height: h,
                },
                confidence: 0.6 + rng() * 0.4,  // 0.6-1.0
                emotion: pick(ClipIndexManager.EMOTIONS),
            });
        }

        // Largest face area → face-to-frame ratio
        const faceToFrameRatio = faces.length > 0
            ? Math.max(...faces.map(f => f.bbox.width * f.bbox.height))
            : 0;

        const shotScale = classifyShotScale(faceToFrameRatio);

        // Dominant emotion from the highest-confidence face
        const dominantFace = faces.length > 0
            ? faces.reduce((best, f) => f.confidence > best.confidence ? f : best, faces[0])
            : undefined;

        // ── Scene labels (2-4 labels) ────────────────────────────────────
        const labelCount = 2 + Math.floor(rng() * 3);
        const sceneLabels: Array<{ label: string; confidence: number }> = [];
        const usedLabels = new Set<string>();
        for (let i = 0; i < labelCount; i++) {
            let label: string;
            do { label = pick(ClipIndexManager.SCENE_LABELS); } while (usedLabels.has(label));
            usedLabels.add(label);
            sceneLabels.push({
                label,
                confidence: Math.round((0.3 + rng() * 0.7) * 100) / 100,
            });
        }
        // Sort by confidence descending
        sceneLabels.sort((a, b) => b.confidence - a.confidence);

        // ── Objects (1-5 distinct objects) ────────────────────────────────
        const objectCount = 1 + Math.floor(rng() * 5);
        const objects: Array<{ label: string; confidence: number; count: number }> = [];
        const usedObjects = new Set<string>();
        for (let i = 0; i < objectCount; i++) {
            let label: string;
            do { label = pick(ClipIndexManager.OBJECT_LABELS); } while (usedObjects.has(label));
            usedObjects.add(label);
            objects.push({
                label,
                confidence: Math.round((0.4 + rng() * 0.6) * 100) / 100,
                count: 1 + Math.floor(rng() * 3),
            });
        }

        // ── Audio features ───────────────────────────────────────────────
        const hasDialogue = rng() > 0.4;        // ~60% have dialogue
        const hasMusicBed = rng() > 0.5;         // ~50% have music
        const averageLoudness = -40 + rng() * 30; // -40 to -10 dBFS

        return {
            clipId,
            analyzedAt: Date.now(),
            faces,
            faceCount,
            faceToFrameRatio: Math.round(faceToFrameRatio * 1000) / 1000,
            shotScale,
            sceneEnvironment: pick(ClipIndexManager.ENVIRONMENTS),
            timeOfDay: pick(ClipIndexManager.TIMES_OF_DAY),
            sceneLabels,
            cameraMotion: pick(ClipIndexManager.CAMERA_MOTIONS),
            motionMagnitude: Math.round(rng() * 100) / 100,
            objects,
            dominantEmotion: dominantFace?.emotion,
            emotionConfidence: dominantFace
                ? Math.round(dominantFace.confidence * 100) / 100
                : undefined,
            hasDialogue,
            hasMusicBed,
            averageLoudness: Math.round(averageLoudness * 10) / 10,
        };
    }

    // ── Internal ─────────────────────────────────────────────────────────

    /** Broadcast current progress to all listeners. */
    private notifyListeners(): void {
        const snapshot = this.getProgress();
        const listenerArr = Array.from(this.listeners);
        for (const listener of listenerArr) {
            listener(snapshot);
        }
    }
}
