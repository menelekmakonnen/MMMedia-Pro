/**
 * Smart Engine — Background media analysis orchestrator.
 * Auto-runs when videos are loaded, classifies energy levels,
 * detects silence, scenes, and color properties.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useTrailerSmartStore } from '../store/trailerSmartStore';
import type { ClipAnalysisResult, SmartKey } from '../store/trailerSmartStore';
import { useMediaStore } from '../store/mediaStore';
import { useProjectStore } from '../store/projectStore';

// ── Energy classification ────────────────────────────────────────────────────

/** Energy classification thresholds */
export function classifyEnergy(score: number): 'static' | 'low' | 'moderate' | 'high' | 'intense' {
    if (score < 10) return 'static';
    if (score < 30) return 'low';
    if (score < 55) return 'moderate';
    if (score < 80) return 'high';
    return 'intense';
}

// ── Auto-grade ───────────────────────────────────────────────────────────────

/** Clip-aware cinematic auto-grade from average luma + saturation (signalstats). */
function computeAutoGrade(yavg: number, satavg: number): any {
    const exposure = Math.max(-0.6, Math.min(0.6, ((118 - yavg) / 118) * 0.7));
    const vibrance = satavg < 60 ? 1.35 : satavg > 130 ? 1.0 : 1.15;
    return {
        temperature: 0, tint: 0, exposure, contrast: 1.08,
        highlights: 0, shadows: 0, saturation: 1.0, vibrance,
        lift: [-0.02, 0, 0.03] as [number, number, number],
        gain: [0.04, 0.0, -0.03] as [number, number, number],
        gamma: [1, 1, 1] as [number, number, number],
    };
}

// ── Background analysis orchestrator ─────────────────────────────────────────

const CONCURRENCY = 2;
let activeAnalysisPromise: Promise<void> | null = null;

/**
 * Start background analysis of all video files.
 * Runs all 4 analysis passes (scoring, silence, scenes, color) concurrently
 * with a concurrency limit of 2.
 *
 * Safe to call multiple times — skips already-analyzed files or forces rescan for a key.
 */
export async function runSmartAnalysis(forceKey?: SmartKey): Promise<void> {
    // If another analysis is already running, wait for it to finish first
    if (activeAnalysisPromise) {
        console.log('[SmartEngine] Another analysis is running. Waiting for it...');
        await activeAnalysisPromise;
    }

    let resolvePromise: () => void = () => {};
    activeAnalysisPromise = new Promise<void>((resolve) => {
        resolvePromise = resolve;
    });

    try {
        await doSmartAnalysis(forceKey);
    } finally {
        activeAnalysisPromise = null;
        resolvePromise();
    }
}

async function doSmartAnalysis(forceKey?: SmartKey): Promise<void> {
    const ipc = (window as any).ipcRenderer;
    if (!ipc) {
        console.warn('[SmartEngine] IPC not available, skipping analysis');
        return;
    }

    const smart = useTrailerSmartStore.getState();
    const { files } = useMediaStore.getState();
    const projFps = useProjectStore.getState().settings?.fps || 30;

    // Only video files with a path
    const vids = files.filter(f => f.type === 'video' && !!f.path);
    if (vids.length === 0) return;

    // Determine pending files
    const pending = forceKey 
        ? vids 
        : vids.filter(f => !smart.getResult(f.id));
    if (pending.length === 0) return;

    // Queue the files we're about to analyze
    smart.queueFiles(vids.map(f => f.id));

    // Set up progress tracking
    const total = pending.length;
    smart.setActive(true);

    const keysToRun: SmartKey[] = forceKey ? [forceKey] : ['scoring', 'silence', 'scenes', 'color'];
    for (const key of keysToRun) {
        smart.begin(key, total);
    }

    console.log(`[SmartEngine] Starting analysis of ${total} clips (forceKey: ${forceKey || 'none'})`);

    let idx = 0;
    const worker = async () => {
        while (idx < pending.length) {
            const f = pending[idx++];
            const fps = (f as any).fps || projFps;

            const existing = smart.getResult(f.id) || {
                score: 0,
                energyLevel: 'static' as const,
                analyzed: false
            };

            let score = existing.score;
            let usableInFrames = existing.usableInFrames;
            let usableOutFrames = existing.usableOutFrames;
            let sceneCutsFrames = existing.sceneCutsFrames;
            let autoGrade = existing.autoGrade;

            // Scoring
            if (!forceKey || forceKey === 'scoring') {
                try {
                    const r = await ipc.scoreClip({ path: f.path });
                    score = r?.success ? (r.score || 0) : 0;
                } catch { score = 0; }
                smart.tick('scoring');
            }

            // Silence detection
            if (!forceKey || forceKey === 'silence') {
                try {
                    const r = await ipc.detectSilence({ path: f.path });
                    if (r?.success && r.trim) {
                        usableInFrames = Math.round(r.trim.trimStart * fps);
                        usableOutFrames = Math.round(r.trim.trimEnd * fps);
                    }
                } catch { /* skip */ }
                smart.tick('silence');
            }

            // Scene detection
            if (!forceKey || forceKey === 'scenes') {
                try {
                    const r = await ipc.detectScenes({ path: f.path });
                    if (r?.success && Array.isArray(r.cuts)) {
                        sceneCutsFrames = r.cuts.map((t: number) => Math.round(t * fps));
                    }
                } catch { /* skip */ }
                smart.tick('scenes');
            }

            // Color analysis
            if (!forceKey || forceKey === 'color') {
                try {
                    const r = await ipc.analyzeClipColor({ path: f.path });
                    if (r?.success) {
                        autoGrade = computeAutoGrade(r.yavg ?? 120, r.satavg ?? 80);
                    }
                } catch { /* skip */ }
                smart.tick('color');
            }

            const result: ClipAnalysisResult = {
                score,
                energyLevel: classifyEnergy(score),
                usableInFrames,
                usableOutFrames,
                sceneCutsFrames,
                autoGrade,
                analyzed: true,
            };

            useTrailerSmartStore.getState().storeResult(f.id, result);
        }
    };

    const workers = Math.min(CONCURRENCY, Math.max(1, pending.length));
    await Promise.all(Array.from({ length: workers }, () => worker()));

    for (const key of keysToRun) {
        smart.finish(key);
    }
    smart.setActive(false);

    console.log(`[SmartEngine] Analysis complete — ${pending.length} clips processed`);
}

// ── React hook: auto-trigger ─────────────────────────────────────────────────

/**
 * React hook that auto-triggers analysis when media files change.
 * Mount this at the top level (e.g. EditRouter) to keep it processing in the background.
 */
export function useAutoSmartEngine(): void {
    const files = useMediaStore(s => s.files);
    const runningRef = useRef(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const trigger = useCallback(() => {
        if (runningRef.current) return;
        runningRef.current = true;
        runSmartAnalysis()
            .catch(err => console.error('[SmartEngine] Background analysis error:', err))
            .finally(() => { runningRef.current = false; });
    }, []);

    useEffect(() => {
        if (files.length === 0) return;

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(trigger, 500);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [files, trigger]);
}
