/**
 * Clip History Integration — Bridges clipStore mutations with the undo/redo system.
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Instead of wrapping every clipStore mutation (which would be extremely invasive),
 * this module provides high-level action creators that capture state snapshots
 * and route through the historyStore. UI components use these instead of calling
 * clipStore directly for undoable operations.
 *
 * Usage:
 *   const { undoableSetClips, undoableUpdateClip, ... } = useClipHistory();
 *   undoableUpdateClip(clipId, { volume: 50 }, 'Set volume to 50%');
 */

import { useHistoryStore } from '../store/historyStore';
import { useClipStore } from '../store/clipStore';
import type { Clip } from '../types';
import {
    createSetClipsCommand,
    createUpdateClipCommand,
    createAddClipCommand,
    createRemoveClipCommand,
    createReorderClipsCommand,
    createBatchCommand,
    type ClipStateGetter,
    type ClipStateSetter,
    type Command,
} from './commandPattern';

// ─── Store Adapters ─────────────────────────────────────────────────────────
// Bridge Zustand hook-style store to the getter/setter interface that
// commandPattern expects.

/** Create a getter function for the clipStore. */
function getClipStateGetter(): ClipStateGetter {
    return () => ({ clips: useClipStore.getState().clips as Clip[] });
}

/** Create a setter function for the clipStore. */
function getClipStateSetter(): ClipStateSetter {
    return (updater) => {
        const state = useClipStore.getState();
        const update = updater({ clips: state.clips as Clip[] });
        if (update.clips) {
            state.setClips(update.clips as any);
        }
    };
}

// ─── Undoable Actions ─────────────────────────────────────────────────────────

/**
 * Replace all clips (e.g., after trailer generation) with undo support.
 */
export function undoableSetClips(newClips: Clip[], description: string = 'Set clips'): void {
    const cmd = createSetClipsCommand(
        getClipStateGetter(),
        getClipStateSetter(),
        newClips,
        description,
    );
    useHistoryStore.getState().execute(cmd);
}

/**
 * Update a single clip's properties with undo support.
 */
export function undoableUpdateClip(
    clipId: string,
    updates: Partial<Clip>,
    description: string = 'Update clip',
): void {
    const cmd = createUpdateClipCommand(
        getClipStateGetter(),
        getClipStateSetter(),
        clipId,
        updates,
        description,
    );
    useHistoryStore.getState().execute(cmd);
}

/**
 * Add a new clip with undo support.
 */
export function undoableAddClip(clip: Clip): void {
    const cmd = createAddClipCommand(
        getClipStateGetter(),
        getClipStateSetter(),
        clip,
    );
    useHistoryStore.getState().execute(cmd);
}

/**
 * Remove a clip with undo support.
 */
export function undoableRemoveClip(clipId: string): void {
    const cmd = createRemoveClipCommand(
        getClipStateGetter(),
        getClipStateSetter(),
        clipId,
    );
    useHistoryStore.getState().execute(cmd);
}

/**
 * Reorder clips with undo support.
 */
export function undoableReorderClips(
    fromIndex: number,
    toIndex: number,
): void {
    const cmd = createReorderClipsCommand(
        getClipStateGetter(),
        getClipStateSetter(),
        fromIndex,
        toIndex,
    );
    useHistoryStore.getState().execute(cmd);
}

/**
 * Execute multiple clip operations as a single undoable batch.
 * 
 * @example
 * undoableBatch([
 *   () => undoableUpdateClip(id1, { volume: 50 }),
 *   () => undoableUpdateClip(id2, { volume: 75 }),
 * ], 'Set multiple volumes');
 */
export function undoableBatch(
    operations: Command[],
    description: string = 'Batch operation',
): void {
    const batch = createBatchCommand(operations, description);
    useHistoryStore.getState().execute(batch);
}

/**
 * Split a clip at a given frame with undo support.
 * Creates two clips from one, preserving all effects.
 */
export function undoableSplitClip(
    clipId: string,
    splitFrame: number,
    description: string = 'Split clip',
): void {
    const getter = getClipStateGetter();
    const setter = getClipStateSetter();
    const state = getter();
    const clip = state.clips.find(c => c.id === clipId);
    if (!clip) return;

    // Snapshot the before state
    const beforeClips = [...state.clips];

    // Calculate the split
    const clipDuration = clip.endFrame - clip.startFrame;
    const splitPosition = splitFrame - clip.startFrame;
    if (splitPosition <= 0 || splitPosition >= clipDuration) return;

    const speed = clip.speed || 1;
    const sourceSplitOffset = Math.round(splitPosition * speed);

    const leftClip: Clip = {
        ...clip,
        endFrame: splitFrame,
        trimEndFrame: (clip.trimStartFrame || 0) + sourceSplitOffset,
    };

    const rightClip: Clip = {
        ...clip,
        id: crypto.randomUUID(),
        startFrame: splitFrame,
        trimStartFrame: (clip.trimStartFrame || 0) + sourceSplitOffset,
        origin: 'manual' as const,
    };

    const newClips = state.clips.map(c => {
        if (c.id === clipId) return leftClip;
        return c;
    });
    // Insert right clip immediately after left
    const leftIndex = newClips.findIndex(c => c.id === clipId);
    newClips.splice(leftIndex + 1, 0, rightClip);

    // Create the command
    const cmd: Command = {
        id: crypto.randomUUID(),
        type: 'SPLIT_CLIP',
        description,
        timestamp: Date.now(),
        execute: () => setter(() => ({ clips: newClips })),
        undo: () => setter(() => ({ clips: beforeClips })),
    };

    useHistoryStore.getState().execute(cmd);
}

/**
 * React hook providing all undoable clip operations.
 * Components should use this instead of directly calling clipStore mutations
 * for operations that should be undoable.
 */
export function useClipHistory() {
    return {
        undoableSetClips,
        undoableUpdateClip,
        undoableAddClip,
        undoableRemoveClip,
        undoableReorderClips,
        undoableBatch,
        undoableSplitClip,
    };
}
