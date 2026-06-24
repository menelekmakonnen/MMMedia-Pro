import type { Clip } from '../types';
import type { MediaFile } from '../store/mediaStore';
import { generateTrailerSequence, type TrailerSettings } from './trailerGenerator';
import { applySequencePresetStack, getPresetById, resolveSequencePresetIds } from '../features/EditEngine/sequencePresets';

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

    for (let pass = 1; renderedFrames < targetFrames && pass <= 24; pass++) {
        const remainingFrames = targetFrames - renderedFrames;
        if (remainingFrames < 1) break;

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
    return clamped;
}
