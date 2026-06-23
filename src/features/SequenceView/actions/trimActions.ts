/**
 * Trim Actions
 *
 * All NLE trim modes for the sequence editor.
 * Each function snapshots the full clips array before mutation, enabling
 * clean undo/redo via the history store's Command pattern.
 *
 * Speed-aware: All source-frame calculations multiply timeline deltas by
 * `clip.speed` so that trimming a 2× clip extends/shrinks the source window
 * by the correct number of source frames.
 */

import { useClipStore } from '../../../store/clipStore';
import { useHistoryStore } from '../../../store/historyStore';
import { createSetClipsCommand } from '../../../lib/commandPattern';
import type { Clip } from '../../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cloneClips(clips: Clip[]): Clip[] {
    return JSON.parse(JSON.stringify(clips));
}

function findClip(clips: Clip[], id: string): Clip | undefined {
    return clips.find((c) => c.id === id);
}

/** Source-frame delta corresponding to a timeline-frame delta at a given speed. */
function sourceDelta(timelineDelta: number, speed: number): number {
    return Math.round(timelineDelta * speed);
}

/** Commit a new clips array as an undoable command. */
function commitClips(newClips: Clip[], description: string): void {
    const cmd = createSetClipsCommand(
        () => useClipStore.getState(),
        (updater) => useClipStore.setState(updater(useClipStore.getState())),
        newClips,
        description,
    );
    useHistoryStore.getState().execute(cmd);
}

// ─── Normal Trim ──────────────────────────────────────────────────────────────

/**
 * Adjust a clip's in or out point by `deltaFrames`.
 *
 * Positive delta:
 *   - start edge → shrinks clip (moves in-point right)
 *   - end edge   → extends clip (moves out-point right)
 * Negative delta:
 *   - start edge → extends clip (moves in-point left)
 *   - end edge   → shrinks clip (moves out-point left)
 *
 * Clamped to source boundaries (trimStartFrame ≥ 0, trimEndFrame ≤ sourceDuration).
 */
export function trimClipEdge(
    clipId: string,
    edge: 'start' | 'end',
    deltaFrames: number,
): void {
    if (deltaFrames === 0) return;

    const clips = cloneClips(useClipStore.getState().clips);
    const clip = findClip(clips, clipId);
    if (!clip || clip.locked) return;

    const speed = clip.speed ?? 1;
    const srcDelta = sourceDelta(deltaFrames, speed);

    if (edge === 'start') {
        const newStart = clip.startFrame + deltaFrames;
        const newTrimStart = clip.trimStartFrame + srcDelta;

        // Clamp: can't move start past end, can't go before source start.
        if (newStart >= clip.endFrame || newTrimStart < 0) return;

        clip.startFrame = newStart;
        clip.trimStartFrame = Math.max(0, newTrimStart);
    } else {
        const newEnd = clip.endFrame + deltaFrames;
        const newTrimEnd = clip.trimEndFrame + srcDelta;

        // Clamp: can't move end before start, can't exceed source duration.
        if (newEnd <= clip.startFrame || newTrimEnd > clip.sourceDurationFrames) return;

        clip.endFrame = newEnd;
        clip.trimEndFrame = Math.min(clip.sourceDurationFrames, newTrimEnd);
    }

    commitClips(clips, `Trim ${edge} edge by ${deltaFrames}f`);
}

// ─── Ripple Trim ──────────────────────────────────────────────────────────────

/**
 * Trim an edge AND shift all subsequent clips on the same track to close/open
 * the resulting gap.
 */
export function rippleTrimClipEdge(
    clipId: string,
    edge: 'start' | 'end',
    deltaFrames: number,
): void {
    if (deltaFrames === 0) return;

    const clips = cloneClips(useClipStore.getState().clips);
    const clip = findClip(clips, clipId);
    if (!clip || clip.locked) return;

    const track = clip.track;
    const speed = clip.speed ?? 1;
    const srcDelta = sourceDelta(deltaFrames, speed);

    if (edge === 'start') {
        const newStart = clip.startFrame + deltaFrames;
        const newTrimStart = clip.trimStartFrame + srcDelta;
        if (newStart >= clip.endFrame || newTrimStart < 0) return;

        const rippleAmount = clip.startFrame - newStart; // positive = gap opened
        clip.startFrame = newStart;
        clip.trimStartFrame = Math.max(0, newTrimStart);

        // Shift all clips that start at or after the OLD start, on the same track.
        for (const c of clips) {
            if (c.id === clipId || c.track !== track) continue;
            if (c.startFrame >= clip.endFrame) {
                c.startFrame += rippleAmount;
                c.endFrame += rippleAmount;
            }
        }
    } else {
        const oldEnd = clip.endFrame;
        const newEnd = clip.endFrame + deltaFrames;
        const newTrimEnd = clip.trimEndFrame + srcDelta;
        if (newEnd <= clip.startFrame || newTrimEnd > clip.sourceDurationFrames) return;

        clip.endFrame = newEnd;
        clip.trimEndFrame = Math.min(clip.sourceDurationFrames, newTrimEnd);

        const rippleAmount = newEnd - oldEnd;

        // Shift all downstream clips.
        for (const c of clips) {
            if (c.id === clipId || c.track !== track) continue;
            if (c.startFrame >= oldEnd) {
                c.startFrame += rippleAmount;
                c.endFrame += rippleAmount;
            }
        }
    }

    commitClips(clips, `Ripple trim ${edge} by ${deltaFrames}f`);
}

// ─── Roll Trim ────────────────────────────────────────────────────────────────

/**
 * Adjust the shared edit point between two adjacent clips.
 *
 * The left clip's out-point and the right clip's in-point move together,
 * keeping total timeline duration unchanged.
 */
export function rollTrim(
    leftClipId: string,
    rightClipId: string,
    deltaFrames: number,
): void {
    if (deltaFrames === 0) return;

    const clips = cloneClips(useClipStore.getState().clips);
    const left = findClip(clips, leftClipId);
    const right = findClip(clips, rightClipId);
    if (!left || !right || left.locked || right.locked) return;

    const leftSpeed = left.speed ?? 1;
    const rightSpeed = right.speed ?? 1;

    // Clamp: don't collapse either clip to zero duration.
    const maxExtendLeft = right.endFrame - right.startFrame - 1;
    const maxShrinkLeft = left.endFrame - left.startFrame - 1;
    const clampedDelta = Math.max(-maxShrinkLeft, Math.min(maxExtendLeft, deltaFrames));
    if (clampedDelta === 0) return;

    // Also clamp to source boundaries.
    const leftNewTrimEnd = left.trimEndFrame + sourceDelta(clampedDelta, leftSpeed);
    const rightNewTrimStart = right.trimStartFrame + sourceDelta(clampedDelta, rightSpeed);
    if (leftNewTrimEnd > left.sourceDurationFrames || leftNewTrimEnd < left.trimStartFrame) return;
    if (rightNewTrimStart < 0 || rightNewTrimStart > right.trimEndFrame) return;

    left.endFrame += clampedDelta;
    left.trimEndFrame = leftNewTrimEnd;

    right.startFrame += clampedDelta;
    right.trimStartFrame = rightNewTrimStart;

    commitClips(clips, `Roll trim by ${clampedDelta}f`);
}

// ─── Slip ─────────────────────────────────────────────────────────────────────

/**
 * Slip: move the source media window without changing the clip's timeline
 * position or duration. The source in/out points shift together.
 */
export function slipClip(clipId: string, deltaFrames: number): void {
    if (deltaFrames === 0) return;

    const clips = cloneClips(useClipStore.getState().clips);
    const clip = findClip(clips, clipId);
    if (!clip || clip.locked) return;

    const speed = clip.speed ?? 1;
    const srcDelta = sourceDelta(deltaFrames, speed);

    const newTrimStart = clip.trimStartFrame + srcDelta;
    const newTrimEnd = clip.trimEndFrame + srcDelta;

    // Clamp to source boundaries.
    if (newTrimStart < 0 || newTrimEnd > clip.sourceDurationFrames) return;

    clip.trimStartFrame = newTrimStart;
    clip.trimEndFrame = newTrimEnd;

    commitClips(clips, `Slip clip by ${deltaFrames}f`);
}

// ─── Slide ────────────────────────────────────────────────────────────────────

/**
 * Slide: move a clip on the timeline; adjacent clips expand/contract to fill.
 *
 * The clip's source window stays the same, but its timeline position shifts.
 * The previous clip's out-point extends, the next clip's in-point shrinks
 * (or vice versa).
 */
export function slideClip(clipId: string, deltaFrames: number): void {
    if (deltaFrames === 0) return;

    const clips = cloneClips(useClipStore.getState().clips);
    const clip = findClip(clips, clipId);
    if (!clip || clip.locked) return;

    const track = clip.track;

    // Find adjacent clips on the same track.
    const sameTrack = clips
        .filter((c) => c.track === track && c.id !== clipId)
        .sort((a, b) => a.startFrame - b.startFrame);

    const prevClip = sameTrack.filter((c) => c.endFrame <= clip.startFrame).pop();
    const nextClip = sameTrack.find((c) => c.startFrame >= clip.endFrame);

    // Validate: need at least one adjacent clip to absorb the delta.
    if (deltaFrames < 0 && !prevClip) return;
    if (deltaFrames > 0 && !nextClip) return;

    // Clamp delta so neither adjacent clip collapses to zero.
    let clamped = deltaFrames;
    if (prevClip && clamped < 0) {
        const maxShrinkPrev = prevClip.endFrame - prevClip.startFrame - 1;
        clamped = Math.max(-maxShrinkPrev, clamped);
    }
    if (nextClip && clamped > 0) {
        const maxShrinkNext = nextClip.endFrame - nextClip.startFrame - 1;
        clamped = Math.min(maxShrinkNext, clamped);
    }
    if (clamped === 0) return;

    // Move the clip.
    clip.startFrame += clamped;
    clip.endFrame += clamped;

    // Adjust adjacent clips' edges and source windows.
    if (prevClip) {
        const prevSpeed = prevClip.speed ?? 1;
        prevClip.endFrame += clamped;
        prevClip.trimEndFrame += sourceDelta(clamped, prevSpeed);
        prevClip.trimEndFrame = Math.min(prevClip.sourceDurationFrames, Math.max(prevClip.trimStartFrame, prevClip.trimEndFrame));
    }
    if (nextClip) {
        const nextSpeed = nextClip.speed ?? 1;
        nextClip.startFrame += clamped;
        nextClip.trimStartFrame += sourceDelta(clamped, nextSpeed);
        nextClip.trimStartFrame = Math.max(0, Math.min(nextClip.trimEndFrame, nextClip.trimStartFrame));
    }

    commitClips(clips, `Slide clip by ${clamped}f`);
}

// ─── Rate Stretch ─────────────────────────────────────────────────────────────

/**
 * Rate stretch: change the clip's speed by dragging an edge.
 *
 * The clip's source in/out points stay fixed. Instead, the playback speed
 * is recalculated so the source content fills the new timeline duration.
 */
export function rateStretchClip(
    clipId: string,
    edge: 'start' | 'end',
    deltaFrames: number,
): void {
    if (deltaFrames === 0) return;

    const clips = cloneClips(useClipStore.getState().clips);
    const clip = findClip(clips, clipId);
    if (!clip || clip.locked) return;

    const sourceDurationUsed = clip.trimEndFrame - clip.trimStartFrame;

    if (edge === 'start') {
        const newStart = clip.startFrame + deltaFrames;
        if (newStart >= clip.endFrame - 1) return; // min 1 frame
        clip.startFrame = newStart;
    } else {
        const newEnd = clip.endFrame + deltaFrames;
        if (newEnd <= clip.startFrame + 1) return;
        clip.endFrame = newEnd;
    }

    const newTimelineDuration = clip.endFrame - clip.startFrame;
    if (newTimelineDuration <= 0) return;

    // New speed = sourceFrames / timelineFrames
    clip.speed = Math.max(0.01, sourceDurationUsed / newTimelineDuration);

    commitClips(clips, `Rate stretch ${edge} (speed → ${clip.speed.toFixed(2)}×)`);
}
