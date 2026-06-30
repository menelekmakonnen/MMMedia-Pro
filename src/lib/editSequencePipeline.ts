import type { Clip } from '../types';
import type { MediaFile } from '../store/mediaStore';
import { generateTrailerSequence, type TrailerSettings } from './trailerGenerator';
import { applySequencePresetStack, getPresetById, resolveSequencePresetIds } from '../features/EditEngine/sequencePresets';
import { scoreEdit, type EditScore } from './ege/editScorer';
import { classifyPromise, checkPromise, type PromiseCheckResult } from './ege/deliveryPromise';

function activePostProcessPresetIds(settings: TrailerSettings): string[] {
    // Pacing now configures the generator directly through shortest/longest clip
    // and rhythmPattern. Applying the old post-process as well changes duration.
    return resolveSequencePresetIds(settings).filter(id => getPresetById(id)?.category !== 'pacing');
}

function applyPatterns(clips: Clip[], settings: TrailerSettings, fps: number): Clip[] {
    return applySequencePresetStack(clips, activePostProcessPresetIds(settings), fps);
}

function continuationState(clips: Clip[]) {
    const initialSegmentHistory: Record<string, string[]> = {};
    const initialSourceUseCounts: Record<string, number> = {};
    for (const clip of clips) {
        if (!clip.path || clip.type === 'audio') continue;
        (initialSegmentHistory[clip.path] ||= []).push(`${clip.trimStartFrame}-${clip.trimEndFrame}`);
        initialSourceUseCounts[clip.path] = (initialSourceUseCounts[clip.path] || 0) + 1;
    }
    const lastSource = [...clips].reverse().find(clip => clip.type !== 'audio' && clip.path)?.path;
    return { initialSegmentHistory, initialSourceUseCounts, initialLastSourcePath: lastSource };
}

/**
 * Apply every selected pattern, generate novel continuation material when those
 * patterns shorten the edit, and clamp the result to the requested duration.
 * Generate, Randomize, Shuffle + Flux, and Flux All all use this function.
 */
export function finalizeGeneratedSequence(
    rawClips: Clip[],
    pool: MediaFile[],
    settings: TrailerSettings,
    fps: number,
): Clip[] {
    const targetFrames = Math.max(1, Math.floor((settings.targetDuration || 30) * fps));
    let clips = applyPatterns(rawClips.map(clip => ({ ...clip })), settings, fps);
    // Use the actual timeline span (max endFrame) instead of summing individual clip
    // durations — overlapping multi-track clips (PiP, split-screen, A/B roll) must
    // not be double-counted.
    let timelineEnd = clips.length > 0 ? Math.max(...clips.map(clip => clip.endFrame)) : 0;
    let renderedFrames = timelineEnd;

    for (let pass = 1; renderedFrames < targetFrames && pass <= 50; pass++) {
        const remainingFrames = targetFrames - renderedFrames;
        if (remainingFrames < 6) break; // too few frames to render a valid segment
        console.log(`[finalizeGenSeq] Continuation pass ${pass}: ${(renderedFrames/fps).toFixed(1)}s / ${(targetFrames/fps).toFixed(1)}s target, filling ${(remainingFrames/fps).toFixed(1)}s`);

        const state = continuationState(clips);
        const continuation = generateTrailerSequence(pool, {
            ...settings,
            ...state,
            seed: `${settings.seed || 'edit'}_continuation_${pass}`,
            targetDuration: remainingFrames / fps,
            beatTimestamps: null,
            useAudioGuide: false,
        });
        if (continuation.length === 0) break;

        const patterned = applyPatterns(continuation, settings, fps);
        if (patterned.length === 0) break;
        const localStart = Math.min(...patterned.map(clip => clip.startFrame));
        const shifted = patterned.map(clip => ({
            ...clip,
            startFrame: clip.startFrame - localStart + timelineEnd,
            endFrame: clip.endFrame - localStart + timelineEnd,
        }));
        clips.push(...shifted);

        const newEnd = Math.max(timelineEnd, ...shifted.map(clip => clip.endFrame));
        const addedFrames = newEnd - timelineEnd;
        if (addedFrames <= 0) break;
        timelineEnd = newEnd;
        renderedFrames = timelineEnd;
    }

    // Clamp to target duration — keep every clip that starts before the deadline,
    // trimming the last one that overflows. Multi-track clips that overlap are all
    // kept (they share timeline space, not add to it).
    const clamped: Clip[] = [];
    for (const clip of clips) {
        if (clip.startFrame >= targetFrames) continue; // starts after deadline
        if (clip.endFrame <= targetFrames) {
            clamped.push(clip);
        } else {
            // Trim this clip to fit within the target
            const duration = targetFrames - clip.startFrame;
            const trimEnd = Math.min(
                clip.sourceDurationFrames || Number.MAX_SAFE_INTEGER,
                clip.trimStartFrame + Math.max(1, Math.round(duration * (clip.speed || 1))),
            );
            clamped.push({ ...clip, endFrame: clip.startFrame + duration, trimEndFrame: trimEnd });
        }
    }

    // ── Post-generation quality scoring ───────────────────────────────────
    const contractClips = clamped.map(c => ({
        id: c.id,
        startFrame: c.startFrame,
        endFrame: c.endFrame,
        trimStartFrame: c.trimStartFrame,
        trimEndFrame: c.trimEndFrame,
        sourceDurationFrames: c.sourceDurationFrames,
        track: c.track,
        mediaLibraryId: (c as any).mediaLibraryId,
        path: c.path,
        filename: c.filename,
        speed: c.speed,
    }));

    const score = scoreEdit({
        clips: contractClips,
        targetDurationFrames: targetFrames,
        fps,
        beatTimestamps: settings.beatTimestamps ?? null,
        maxTrack: Math.max(0, ...clamped.map(c => c.track)),
    });
    console.log(
        `[Pipeline] Edit quality: ${score.verdict} (${score.overall.toFixed(2)})`,
        `pacing=${score.pacingVariety.toFixed(2)}`,
        `diversity=${score.visualDiversity.toFixed(2)}`,
        `sync=${score.syncTightness.toFixed(2)}`,
        `hook=${score.hookStrength.toFixed(2)}`,
        `slideshow=${score.slideshowRisk.toFixed(2)}`,
        `flow=${score.narrativeFlow.toFixed(2)}`,
    );

    // ── Delivery promise enforcement ─────────────────────────────────────
    const mode = settings.generatorMode || 'trailer';
    const sub = (settings.activeSubcategories && settings.activeSubcategories.length > 0)
        ? settings.activeSubcategories[0]
        : undefined;
    const promise = classifyPromise(mode, sub);
    const promiseResult = checkPromise(contractClips, promise, fps);
    if (!promiseResult.fulfilled) {
        console.warn(
            `[Pipeline] Delivery promise (${promise.promiseType}) NOT fulfilled for mode=${mode}:`,
            promiseResult.violations.join('; '),
        );
        if (promiseResult.suggestions.length > 0) {
            console.log('[Pipeline] Suggestions:', promiseResult.suggestions.join('; '));
        }
    } else {
        console.log(`[Pipeline] Delivery promise (${promise.promiseType}) fulfilled ✓`);
    }

    // Attach quality metadata to the returned clips array for upstream consumers
    (clamped as any).__editScore = score;
    (clamped as any).__promiseResult = promiseResult;

    return clamped;
}
