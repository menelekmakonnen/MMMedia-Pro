/**
 * Split / Razor Actions
 *
 * Split operations for the NLE sequence editor.
 * All operations are undoable via the history store's Command pattern.
 *
 * Design decisions:
 * - Left half retains the original clip ID (keeps selection/references stable).
 * - Right half gets a new UUID.
 * - Source offsets account for clip.speed so the media window stays correct.
 * - All metadata (effects, color grading, transitions, parametric effects)
 *   is deep-copied to both halves.
 */

import { useClipStore } from '../../../store/clipStore';
import { useHistoryStore } from '../../../store/historyStore';
import { createSetClipsCommand } from '../../../lib/commandPattern';
import { v4 as uuidv4 } from 'uuid';
import type { Clip } from '../../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Deep-clone a clip, preserving nested objects (effects, color grading, etc.)
 * without class instances.
 */
function cloneClip(clip: Clip): Clip {
    return JSON.parse(JSON.stringify(clip));
}

/**
 * Compute the source-frame offset at a given timeline split point,
 * accounting for the clip's speed multiplier.
 *
 * Example: A clip at speed 2× covers source frames twice as fast, so
 * a 30-frame timeline span corresponds to 60 source frames.
 */
function sourceOffsetAtSplit(clip: Clip, splitFrame: number): number {
    const timelineOffset = splitFrame - clip.startFrame;
    const speed = clip.speed ?? 1;
    return Math.round(timelineOffset * speed);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Split a single clip at a given timeline frame.
 *
 * Returns the two resulting clip references, or null if the split is
 * out of bounds (e.g. on the very first/last frame — no-op).
 */
export function splitClipAtFrame(
    clipId: string,
    splitFrame: number,
): { leftClip: Clip; rightClip: Clip } | null {
    const store = useClipStore.getState();
    const clip = store.clips.find((c) => c.id === clipId);
    if (!clip) return null;

    // Bounds check: split must be strictly inside the clip.
    if (splitFrame <= clip.startFrame || splitFrame >= clip.endFrame) {
        return null;
    }

    // Don't split locked/disabled clips.
    if (clip.locked) return null;

    const sourceOffset = sourceOffsetAtSplit(clip, splitFrame);
    const sourceSplitFrame = clip.trimStartFrame + sourceOffset;

    // Build left half (keeps original ID).
    const leftClip: Clip = {
        ...cloneClip(clip),
        // Timeline position unchanged, end moves to split point.
        endFrame: splitFrame,
        // Source out trims to the split.
        trimEndFrame: sourceSplitFrame,
    };

    // Build right half (new UUID).
    const rightClip: Clip = {
        ...cloneClip(clip),
        id: uuidv4(),
        startFrame: splitFrame,
        // Source in starts at the split.
        trimStartFrame: sourceSplitFrame,
        // Remove the incoming transition on the right half — the cut IS the edit point.
        transition: undefined,
    };

    // Build the new clips array: replace original with left + right, preserve order.
    const newClips = store.clips.flatMap((c) =>
        c.id === clipId ? [leftClip, rightClip] : [c],
    );

    // Execute as an undoable command.
    const cmd = createSetClipsCommand(
        () => useClipStore.getState(),
        (updater) => useClipStore.setState(updater(useClipStore.getState())),
        newClips,
        `Split clip at frame ${splitFrame}`,
    );
    useHistoryStore.getState().execute(cmd);

    return { leftClip, rightClip };
}

/**
 * Split ALL clips that span the current playhead on unlocked tracks.
 *
 * This is the standard "Razor at Playhead" shortcut (Ctrl+K / Alt+C).
 * Returns the number of clips that were split.
 */
export function splitAtPlayhead(playheadFrame: number): number {
    const store = useClipStore.getState();

    // Find every clip that the playhead falls strictly inside.
    const overlapping = store.clips.filter(
        (c) =>
            !c.locked &&
            !c.disabled &&
            playheadFrame > c.startFrame &&
            playheadFrame < c.endFrame,
    );

    if (overlapping.length === 0) return 0;

    // Build the full result array in one pass (single undo step).
    let newClips = [...store.clips];

    for (const clip of overlapping) {
        const sourceOffset = sourceOffsetAtSplit(clip, playheadFrame);
        const sourceSplitFrame = clip.trimStartFrame + sourceOffset;

        const leftClip: Clip = {
            ...cloneClip(clip),
            endFrame: playheadFrame,
            trimEndFrame: sourceSplitFrame,
        };

        const rightClip: Clip = {
            ...cloneClip(clip),
            id: uuidv4(),
            startFrame: playheadFrame,
            trimStartFrame: sourceSplitFrame,
            transition: undefined,
        };

        newClips = newClips.flatMap((c) =>
            c.id === clip.id ? [leftClip, rightClip] : [c],
        );
    }

    const cmd = createSetClipsCommand(
        () => useClipStore.getState(),
        (updater) => useClipStore.setState(updater(useClipStore.getState())),
        newClips,
        `Split ${overlapping.length} clip(s) at playhead`,
    );
    useHistoryStore.getState().execute(cmd);

    return overlapping.length;
}

/**
 * Split only the currently selected clips at the playhead frame.
 * Useful when the user wants precise control over which clips get razor'd.
 */
export function splitSelectedAtPlayhead(playheadFrame: number): number {
    const store = useClipStore.getState();
    const selectedIds = new Set(store.selectedClipIds);

    const targets = store.clips.filter(
        (c) =>
            selectedIds.has(c.id) &&
            !c.locked &&
            !c.disabled &&
            playheadFrame > c.startFrame &&
            playheadFrame < c.endFrame,
    );

    if (targets.length === 0) return 0;

    let newClips = [...store.clips];

    for (const clip of targets) {
        const sourceOffset = sourceOffsetAtSplit(clip, playheadFrame);
        const sourceSplitFrame = clip.trimStartFrame + sourceOffset;

        const leftClip: Clip = {
            ...cloneClip(clip),
            endFrame: playheadFrame,
            trimEndFrame: sourceSplitFrame,
        };

        const rightClip: Clip = {
            ...cloneClip(clip),
            id: uuidv4(),
            startFrame: playheadFrame,
            trimStartFrame: sourceSplitFrame,
            transition: undefined,
        };

        newClips = newClips.flatMap((c) =>
            c.id === clip.id ? [leftClip, rightClip] : [c],
        );
    }

    const cmd = createSetClipsCommand(
        () => useClipStore.getState(),
        (updater) => useClipStore.setState(updater(useClipStore.getState())),
        newClips,
        `Split ${targets.length} selected clip(s) at playhead`,
    );
    useHistoryStore.getState().execute(cmd);

    return targets.length;
}
