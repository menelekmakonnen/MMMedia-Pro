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
import { useClipStore } from '../store/clipStore';
import { getStableMediaId } from './mediaProbe';

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

// One clip at a time. Each clip already fans out up to 4 concurrent FFmpeg
// passes, so a single worker keeps the background load to ~4 processes instead
// of 8+, which matters when this runs while the user is editing.
const CONCURRENCY = 1;
/** Bump when analysis logic changes so cached results are recomputed. */
const ANALYSIS_VERSION = 3;
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

    // Analyse ONLY the clips the user has actually imported into the library.
    // (Previously this also scanned every "recent folder" on disk, which could
    // queue hundreds of clips that aren't even in the project — analysing 1000+
    // files while the library/timeline were empty.)
    const allVids = files
        .filter(f => f.type === 'video' && !!f.path)
        .map(v => ({ id: v.id, path: v.path, filename: v.filename, type: v.type as 'video' }));

    if (allVids.length === 0) return;

    // Register scanned files in the store for settings dashboard display
    if (smart.registerScannedFiles) {
        smart.registerScannedFiles(allVids);
    }

    // Determine pending files (only those that are not fully analyzed yet or if we force a key)
    const pendingVids = forceKey
        ? allVids
        : allVids.filter(v => {
            const res = smart.getResult(v.id);
            return !res || !res.analyzed || res.analysisVersion !== ANALYSIS_VERSION;
        });

    if (pendingVids.length === 0) return;

    // Queue the files we are about to analyze
    smart.queueFiles(pendingVids.map(f => f.id));

    // Set up progress tracking
    const total = pendingVids.length;
    smart.setActive(true);

    const keysToRun: SmartKey[] = forceKey ? [forceKey] : ['scoring', 'silence', 'scenes', 'color'];
    for (const key of keysToRun) {
        smart.begin(key, total);
    }

    console.log(`[SmartEngine] Starting pass 1 analysis of ${total} clips (forceKey: ${forceKey || 'none'})`);

    const inProgressIds = new Set<string>();

    const getNextFile = () => {
        const smartState = useTrailerSmartStore.getState();
        const currentSelectedIds = new Set(useMediaStore.getState().selectedFileIds);
        const currentTimelinePaths = new Set(useClipStore.getState().clips.map(c => c.path));
        const currentActivePaths = new Set(useMediaStore.getState().files.filter(f => f.type === 'video').map(f => f.path));

        const getPriority = (vid: { id: string; path: string }) => {
            if (currentSelectedIds.has(vid.id)) return 4;
            if (currentTimelinePaths.has(vid.path)) return 3;
            if (currentActivePaths.has(vid.path)) return 2;
            return 1;
        };

        // Filter for files that are not fully analyzed yet (or all if forceKey) and not currently being analyzed
        const eligible = pendingVids.filter(v => {
            if (inProgressIds.has(v.id)) return false;
            if (forceKey) return true;
            const res = smartState.getResult(v.id);
            return !res || !res.analyzed || res.analysisVersion !== ANALYSIS_VERSION;
        });

        if (eligible.length === 0) return null;

        // Sort descending by priority
        eligible.sort((a, b) => getPriority(b) - getPriority(a));

        const chosen = eligible[0];
        inProgressIds.add(chosen.id);
        return chosen;
    };

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const worker = async () => {
        while (true) {
            // Check pause
            while (useTrailerSmartStore.getState().isPaused) {
                await sleep(500);
            }

            const f = getNextFile();
            if (!f) break; // no more files

            const fps = (f as any).fps || projFps;

            const existing = useTrailerSmartStore.getState().getResult(f.id) || {
                score: 0,
                energyLevel: 'static' as const,
                analyzed: false,
                completedPasses: []
            };

            let score = existing.score;
            let usableInFrames = existing.usableInFrames;
            let usableOutFrames = existing.usableOutFrames;
            let sceneCutsFrames = existing.sceneCutsFrames;
            let autoGrade = existing.autoGrade;
            const completedPasses = existing.completedPasses ? [...existing.completedPasses] : [];
            const mark = (key: SmartKey) => { if (!completedPasses.includes(key)) completedPasses.push(key); smart.tick(key); };

            // ── Run the 4 independent ffmpeg passes CONCURRENTLY for this clip ──
            // They don't depend on each other, so awaiting them sequentially just
            // serialised four process spawns. Parallelising them cuts per-clip wall
            // time roughly 4x. Each pass is self-contained and failure-isolated.
            const passes: Array<Promise<void>> = [];

            if (!forceKey || forceKey === 'scoring') {
                passes.push((async () => {
                    try { const r = await ipc.scoreClip({ path: f.path }); score = r?.success ? (r.score || 0) : 0; }
                    catch { score = 0; }
                    mark('scoring');
                })());
            }
            if (!forceKey || forceKey === 'silence') {
                passes.push((async () => {
                    try {
                        const r = await ipc.detectSilence({ path: f.path });
                        if (r?.success && r.trim) {
                            usableInFrames = Math.round(r.trim.trimStart * fps);
                            usableOutFrames = Math.round(r.trim.trimEnd * fps);
                        }
                    } catch { /* skip */ }
                    mark('silence');
                })());
            }
            if (!forceKey || forceKey === 'scenes') {
                passes.push((async () => {
                    try {
                        const r = await ipc.detectScenes({ path: f.path });
                        if (r?.success && Array.isArray(r.cuts)) sceneCutsFrames = r.cuts.map((t: number) => Math.round(t * fps));
                    } catch { /* skip */ }
                    mark('scenes');
                })());
            }
            if (!forceKey || forceKey === 'color') {
                passes.push((async () => {
                    try {
                        const r = await ipc.analyzeClipColor({ path: f.path });
                        if (r?.success) autoGrade = computeAutoGrade(r.yavg ?? 120, r.satavg ?? 80);
                    } catch { /* skip */ }
                    mark('color');
                })());
            }

            await Promise.all(passes);

            // Store the fully-analyzed clip once (its results only surface when complete).
            // Capture source size/mtime so a re-imported/edited file invalidates.
            let sourceSize: number | undefined;
            let sourceMtimeMs: number | undefined;
            try {
                const stat = await ipc.statFile?.({ path: f.path });
                if (stat?.success) { sourceSize = stat.size; sourceMtimeMs = stat.mtimeMs; }
            } catch { /* stat optional */ }

            const finalResult: ClipAnalysisResult = {
                score,
                energyLevel: classifyEnergy(score),
                usableInFrames,
                usableOutFrames,
                sceneCutsFrames,
                autoGrade,
                analyzed: true,
                completedPasses,
                analysisVersion: ANALYSIS_VERSION,
                sourceSize,
                sourceMtimeMs,
                analysisPass: 1,
            };
            useTrailerSmartStore.getState().storeResult(f.id, finalResult);
        }
    };

    const workers = Math.min(CONCURRENCY, Math.max(1, pendingVids.length));
    await Promise.all(Array.from({ length: workers }, () => worker()));

    for (const key of keysToRun) {
        smart.finish(key);
    }
    smart.setActive(false);

    console.log(`[SmartEngine] Pass 1 complete — ${pendingVids.length} clips processed`);

    // ── Multi-pass: schedule a refinement pass after a delay ──
    // Pass 2 runs the visual-match analysis (perceptual hashing, histograms,
    // motion direction) and re-scans borderline clips for upgraded classification.
    if (!forceKey) {
        setTimeout(async () => {
            try {
                await runVisualMatchPass(allVids);
            } catch (err) {
                console.error('[SmartEngine] Pass 2 (visual-match) error:', err);
            }
        }, 5000);
    }
}

// ── Pass 2: Visual-match analysis ────────────────────────────────────────────

/**
 * Runs the visual-match analysis pass on all clips.
 * Extracts perceptual hashes for start/end frames, colour histograms,
 * and dominant motion direction. Used for match-cut and seamless transitions.
 * Runs at lower priority (sleep between clips) to avoid impacting editing.
 */
async function runVisualMatchPass(allVids: Array<{ id: string; path: string; filename: string; type: 'video' }>): Promise<void> {
    const ipc = (window as any).ipcRenderer;
    if (!ipc) return;

    const smart = useTrailerSmartStore.getState();

    // Only process clips that have completed pass 1 but not visual-match
    const eligible = allVids.filter(v => {
        const r = smart.getResult(v.id);
        return r?.analyzed && !(r.completedPasses || []).includes('visual-match');
    });

    if (eligible.length === 0) return;

    smart.begin('visual-match', eligible.length);
    console.log(`[SmartEngine] Starting pass 2 (visual-match) for ${eligible.length} clips`);

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    for (const f of eligible) {
        // Check pause
        while (useTrailerSmartStore.getState().isPaused) {
            await sleep(500);
        }

        const existing = useTrailerSmartStore.getState().getResult(f.id);
        if (!existing) continue;

        let startFrameSignature: string | undefined;
        let endFrameSignature: string | undefined;
        let colorHistogram: number[] | undefined;
        let dominantMotionDirection: number | undefined;

        // Extract perceptual hashes for first and last frames
        try {
            const hashResult = await ipc.extractFrameHashes?.({ path: f.path });
            if (hashResult?.success) {
                startFrameSignature = hashResult.startHash;
                endFrameSignature = hashResult.endHash;
                colorHistogram = hashResult.histogram;
                dominantMotionDirection = hashResult.motionDirection;
            }
        } catch {
            // Frame extraction may fail for some formats — skip gracefully
        }

        // Update the existing result with visual-match data
        const updatedPasses = [...(existing.completedPasses || []), 'visual-match' as SmartKey];
        const updatedResult: ClipAnalysisResult = {
            ...existing,
            startFrameSignature,
            endFrameSignature,
            colorHistogram,
            dominantMotionDirection,
            completedPasses: updatedPasses,
            analysisPass: 2,
        };
        useTrailerSmartStore.getState().storeResult(f.id, updatedResult);
        smart.tick('visual-match');

        // Lower-priority: sleep 200ms between clips to keep the UI responsive
        await sleep(200);
    }

    smart.finish('visual-match');
    console.log(`[SmartEngine] Pass 2 (visual-match) complete — ${eligible.length} clips processed`);

    // Pass 3: Shot classification + Semantic Tagging refinement
    try {
        await runShotAndSemanticClassificationPass(allVids);
    } catch (err) {
        console.error('[SmartEngine] Pass 3 (shot & semantic) error:', err);
    }
}

/**
 * Runs Pass 3: Shot type classification & Semantic tagging on all clips.
 * Takes Pass 1 and Pass 2 results (luma, color, motion, hashes) and categorizes
 * them into cinematic classifications (shot scale, camera motion, mood, setting, pace).
 */
async function runShotAndSemanticClassificationPass(allVids: Array<{ id: string; path: string; filename: string }>) {
    const smart = useTrailerSmartStore.getState();
    const projFps = useProjectStore.getState().settings?.fps || 30;
    const eligible = allVids.filter(v => {
        const r = smart.getResult(v.id);
        return r?.analyzed && !(r.completedPasses || []).includes('shot-type');
    });

    if (eligible.length === 0) return;

    smart.begin('shot-type', eligible.length);
    smart.begin('semantic', eligible.length);
    console.log(`[SmartEngine] Starting Pass 3 (shot & semantic) for ${eligible.length} clips`);

    const { classifyShot } = await import('./shotClassifier');
    const { inferMood, inferSetting, inferTimeOfDay, inferPace, estimateColorTemperature } = await import('./semanticTagger');
    const { classifyContent } = await import('./contentClassifier');

    for (const f of eligible) {
        const existing = smart.getResult(f.id);
        if (!existing) continue;

        // Construct heuristic features from existing pass 1 results
        const isStatic = existing.energyLevel === 'static';
        const motionMagnitude = existing.score / 100;
        
        // Check filename cues for faces/interviews (talking-head indicator)
        const nameLower = f.filename.toLowerCase();
        const hasFaceKeywords = nameLower.includes('interview') || nameLower.includes('face') || nameLower.includes('talking') || nameLower.includes('host') || nameLower.includes('speaker');
        const faceCount = hasFaceKeywords ? 1 : 0;
        const faceRegionRatio = hasFaceKeywords ? 0.25 : 0;

        const duration = (existing.usableOutFrames || (10 * projFps)) / projFps;

        const shotClass = classifyShot({
            edgeDensity: existing.edgeDensity ?? 0.3,
            motionMagnitude,
            faceRegionRatio,
            faceCount,
            isStatic,
            histogramUniformity: 0.5,
            hasUIEdges: nameLower.includes('screen') || nameLower.includes('app') || nameLower.includes('ui'),
            avgLuma: 120,
            salientRegion: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
            aspectRatio: 16 / 9,
            duration,
            motionStdDev: isStatic ? 0.01 : 0.15
        });

        // Infer settings & mood
        const colorTemp = estimateColorTemperature(120, 120, 120); // Neutral baseline temperature
        const inferredMoodObj = inferMood({
            avgLuma: 120,
            avgSaturation: 80,
            motionMagnitude,
            colorTempK: colorTemp,
            edgeDensity: existing.edgeDensity ?? 0.3
        });

        const inferredSetting = inferSetting({
            avgLuma: 120,
            edgeDensity: existing.edgeDensity ?? 0.3,
            colorVariance: 0.5,
            greenRatio: 0.1,
            blueRatio: 0.1,
            hasUIEdges: nameLower.includes('screen') || nameLower.includes('app') || nameLower.includes('ui')
        });

        const inferredTime = inferTimeOfDay({
            avgLuma: 120,
            colorTempK: colorTemp,
            warmthRatio: 0.2
        });

        const updatedPasses = [...(existing.completedPasses || []), 'shot-type' as SmartKey, 'semantic' as SmartKey];
        const updatedResult: ClipAnalysisResult = {
            ...existing,
            shotType: shotClass.shotType,
            shotTypeConfidence: shotClass.confidence,
            cameraMovement: shotClass.cameraMovement,
            hasFaces: shotClass.hasFaces,
            faceCount: shotClass.faceCount,
            mood: inferredMoodObj.mood,
            moodConfidence: inferredMoodObj.confidence,
            setting: inferredSetting,
            timeOfDay: inferredTime,
            pace: inferPace(motionMagnitude),
            completedPasses: updatedPasses,
            analysisPass: 3
        };

        // High-level content label (performance / B-roll / interview / BTS / …)
        // derived from the now-complete feature set + filename cues. Used by
        // generators for content-aware sequencing (BTS intercut, talking-head).
        updatedResult.contentType = classifyContent(f.filename, updatedResult);

        smart.storeResult(f.id, updatedResult);
        smart.tick('shot-type');
        smart.tick('semantic');
    }

    smart.finish('shot-type');
    smart.finish('semantic');
    console.log(`[SmartEngine] Pass 3 complete — classified ${eligible.length} clips`);
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
