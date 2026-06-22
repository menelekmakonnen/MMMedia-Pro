/**
 * Smoke tests for the Smart Engine, WebGPU Preview, and new store expansions.
 * These validate the core logic at the module level without IPC/GPU hardware.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Smart Engine: classifyEnergy ─────────────────────────────────────────────
describe('smartEngine', () => {
    it('classifies energy levels correctly', async () => {
        const { classifyEnergy } = await import('../smartEngine');

        expect(classifyEnergy(0)).toBe('static');
        expect(classifyEnergy(5)).toBe('static');
        expect(classifyEnergy(10)).toBe('low');
        expect(classifyEnergy(29)).toBe('low');
        expect(classifyEnergy(30)).toBe('moderate');
        expect(classifyEnergy(54)).toBe('moderate');
        expect(classifyEnergy(55)).toBe('high');
        expect(classifyEnergy(79)).toBe('high');
        expect(classifyEnergy(80)).toBe('intense');
        expect(classifyEnergy(100)).toBe('intense');
    });

    it('covers all boundary values', async () => {
        const { classifyEnergy } = await import('../smartEngine');
        const levels = new Set<string>();
        for (let i = 0; i <= 100; i += 5) {
            levels.add(classifyEnergy(i));
        }
        expect(levels.size).toBe(5);
        expect(levels.has('static')).toBe(true);
        expect(levels.has('low')).toBe(true);
        expect(levels.has('moderate')).toBe(true);
        expect(levels.has('high')).toBe(true);
        expect(levels.has('intense')).toBe(true);
    });
});

// ── WebGPU Preview: isWebGPUSupported ────────────────────────────────────────
describe('webgpuPreview', () => {
    it('returns false when navigator.gpu is missing', async () => {
        const { isWebGPUSupported } = await import('../webgpuPreview');
        // In Node/Vitest environment, navigator.gpu doesn't exist
        const result = await isWebGPUSupported();
        expect(result).toBe(false);
    });

    it('exports DEFAULT_GPU_PARAMS with correct defaults', async () => {
        const { DEFAULT_GPU_PARAMS } = await import('../webgpuPreview');
        expect(DEFAULT_GPU_PARAMS.exposure).toBe(0);
        expect(DEFAULT_GPU_PARAMS.contrast).toBe(1);
        expect(DEFAULT_GPU_PARAMS.saturation).toBe(1);
        expect(DEFAULT_GPU_PARAMS.opacity).toBe(1);
        expect(DEFAULT_GPU_PARAMS.filmGrain).toBe(0);
        expect(DEFAULT_GPU_PARAMS.vignette).toBe(0);
    });

    it('WebGPUPreviewPipeline can be constructed', async () => {
        const { WebGPUPreviewPipeline } = await import('../webgpuPreview');
        const pipeline = new WebGPUPreviewPipeline();
        expect(pipeline.ready).toBe(false);
    });
});

// ── TrailerSmartStore: expanded functionality ────────────────────────────────
describe('trailerSmartStore', () => {
    beforeEach(async () => {
        const { useTrailerSmartStore } = await import('../../store/trailerSmartStore');
        useTrailerSmartStore.getState().clearResults();
        useTrailerSmartStore.getState().reset();
    });

    it('stores and retrieves analysis results', async () => {
        const { useTrailerSmartStore } = await import('../../store/trailerSmartStore');
        const store = useTrailerSmartStore.getState();

        store.storeResult('test-file-1', {
            score: 75,
            energyLevel: 'high',
            analyzed: true,
        });

        const result = useTrailerSmartStore.getState().getResult('test-file-1');
        expect(result).toBeDefined();
        expect(result!.score).toBe(75);
        expect(result!.energyLevel).toBe('high');
        expect(result!.analyzed).toBe(true);
    });

    it('tracks queued file IDs', async () => {
        const { useTrailerSmartStore } = await import('../../store/trailerSmartStore');
        const store = useTrailerSmartStore.getState();

        store.queueFiles(['a', 'b', 'c']);
        expect(useTrailerSmartStore.getState().totalCount).toBe(3);
        expect(useTrailerSmartStore.getState().isFullyAnalyzed).toBe(false);
    });

    it('detects when fully analyzed', async () => {
        const { useTrailerSmartStore } = await import('../../store/trailerSmartStore');
        const store = useTrailerSmartStore.getState();

        store.queueFiles(['x', 'y']);
        store.storeResult('x', { score: 50, energyLevel: 'moderate', analyzed: true });
        store.storeResult('y', { score: 30, energyLevel: 'low', analyzed: true });

        expect(useTrailerSmartStore.getState().isFullyAnalyzed).toBe(true);
        expect(useTrailerSmartStore.getState().analyzedCount).toBe(2);
    });

    it('legacy SmartKey progress tracking still works', async () => {
        const { useTrailerSmartStore } = await import('../../store/trailerSmartStore');
        const store = useTrailerSmartStore.getState();

        store.begin('scoring', 5);
        expect(useTrailerSmartStore.getState().scoring.status).toBe('running');
        expect(useTrailerSmartStore.getState().scoring.total).toBe(5);

        store.tick('scoring');
        expect(useTrailerSmartStore.getState().scoring.done).toBe(1);

        store.finish('scoring');
        expect(useTrailerSmartStore.getState().scoring.status).toBe('done');
        expect(useTrailerSmartStore.getState().scoring.done).toBe(5);
    });

    it('clearResults resets everything', async () => {
        const { useTrailerSmartStore } = await import('../../store/trailerSmartStore');
        const store = useTrailerSmartStore.getState();

        store.queueFiles(['a']);
        store.storeResult('a', { score: 50, energyLevel: 'moderate', analyzed: true });
        store.clearResults();

        expect(useTrailerSmartStore.getState().totalCount).toBe(0);
        expect(useTrailerSmartStore.getState().analyzedCount).toBe(0);
        expect(useTrailerSmartStore.getState().isFullyAnalyzed).toBe(false);
        expect(useTrailerSmartStore.getState().getResult('a')).toBeUndefined();
    });
});

// ── Export Queue ──────────────────────────────────────────────────────────────
describe('exportQueue', () => {
    it('exports createExportJob and ExportQueueManager', async () => {
        const mod = await import('../exportQueue');
        expect(typeof mod.createExportJob).toBe('function');
        expect(typeof mod.ExportQueueManager).toBe('function');
    });

    it('creates an export job with defaults', async () => {
        const { createExportJob } = await import('../exportQueue');
        const job = createExportJob('test-export', '/tmp/test.mp4', 'proj-1');
        expect(job.name).toBe('test-export');
        expect(job.status).toBe('queued');
        expect(job.progress).toBe(0);
    });
});

// ── Color Grading Presets ────────────────────────────────────────────────────
describe('colorGradingPresets', () => {
    it('exports preset array', async () => {
        const { COLOR_PRESETS } = await import('../colorGradingPresets');
        expect(COLOR_PRESETS.length).toBeGreaterThanOrEqual(10);
    });

    it('all presets have required fields', async () => {
        const { COLOR_PRESETS } = await import('../colorGradingPresets');
        for (const preset of COLOR_PRESETS) {
            expect(preset.name).toBeTruthy();
            expect(preset.category).toBeTruthy();
            expect(typeof preset.grading).toBe('object');
        }
    });

    it('getRecommendedPresets returns results for trailer', async () => {
        const { getRecommendedPresets } = await import('../colorGradingPresets');
        const recs = getRecommendedPresets('trailer');
        expect(recs.length).toBeGreaterThan(0);
    });
});

// ── Keyframe System ──────────────────────────────────────────────────────────
describe('keyframeSystem', () => {
    it('evaluates linear interpolation correctly', async () => {
        const { getKeyframeValue, addKeyframeToTrack, createKeyframe, EASING_PRESETS } = await import('../keyframeSystem');
        const kf0 = createKeyframe(0, 0, 'linear');
        const kf1 = createKeyframe(1, 1, 'linear');
        let track = { property: 'opacity', label: 'Opacity', keyframes: [] as any[], defaultValue: 0, min: 0, max: 1 };
        track = addKeyframeToTrack(track, kf0);
        track = addKeyframeToTrack(track, kf1);

        expect(getKeyframeValue(track, 0)).toBeCloseTo(0, 2);
        expect(getKeyframeValue(track, 0.5)).toBeCloseTo(0.5, 2);
        expect(getKeyframeValue(track, 1)).toBeCloseTo(1, 2);
    });

    it('exports easing presets', async () => {
        const { EASING_PRESETS } = await import('../keyframeSystem');
        expect(Object.keys(EASING_PRESETS).length).toBeGreaterThanOrEqual(10);
    });
});
