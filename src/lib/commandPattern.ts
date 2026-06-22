import { v4 as uuidv4 } from 'uuid';
import type { Clip } from '../types';

// ─── Store Accessor Types ─────────────────────────────────────────────────────
// These mirror Zustand's getState/setState semantics without importing the store,
// keeping the command pattern decoupled and testable.

/** Function that applies a partial state update to the clip store. */
export type ClipStateSetter = (
    updater: (state: { clips: Clip[] }) => Partial<{ clips: Clip[] }>
) => void;

/** Function that returns the current clip state snapshot. */
export type ClipStateGetter = () => { clips: Clip[] };

// ─── Command Interface ────────────────────────────────────────────────────────

/**
 * Represents a single undoable operation.
 *
 * Every command captures enough state to both execute (apply) and undo (revert)
 * itself. Commands are the atomic unit of the undo/redo system.
 */
export interface Command {
    /** Unique identifier for this command instance. */
    readonly id: string;
    /** Machine-readable command type (e.g. 'SET_CLIPS', 'UPDATE_CLIP'). */
    readonly type: string;
    /** Human-readable description shown in the UI (e.g. "Move clip forward"). */
    readonly description: string;
    /** Epoch timestamp (ms) of when this command was created. */
    readonly timestamp: number;

    /** Apply the operation. Called on first execution and on redo. */
    execute(): void;
    /** Revert the operation. Called on undo. */
    undo(): void;
}

// ─── CommandGroup ──────────────────────────────────────────────────────────────

/**
 * Batches multiple {@link Command}s into a single undo step.
 *
 * `execute()` runs all sub-commands in insertion order.
 * `undo()` runs them all in **reverse** order so dependent state is unwound
 * correctly.
 */
export class CommandGroup implements Command {
    public readonly id: string;
    public readonly type = 'BATCH';
    public readonly description: string;
    public readonly timestamp: number;

    constructor(
        private readonly commands: Command[],
        description: string,
    ) {
        this.id = uuidv4();
        this.description = description;
        this.timestamp = Date.now();
    }

    /** Execute every sub-command in forward order. */
    execute(): void {
        for (const cmd of this.commands) {
            cmd.execute();
        }
    }

    /** Undo every sub-command in reverse order. */
    undo(): void {
        for (let i = this.commands.length - 1; i >= 0; i--) {
            this.commands[i].undo();
        }
    }
}

// ─── CommandHistory ────────────────────────────────────────────────────────────

/**
 * Manages the undo and redo stacks.
 *
 * The history has a configurable maximum size — when the undo stack exceeds
 * this limit the oldest commands are silently discarded (FIFO eviction).
 */
export class CommandHistory {
    private _undoStack: Command[] = [];
    private _redoStack: Command[] = [];
    private readonly _maxSize: number;

    constructor(maxSize: number = 100) {
        this._maxSize = maxSize;
    }

    // ── Public Accessors ────────────────────────────────────────────────────

    /** Maximum number of commands retained in the undo stack. */
    get maxSize(): number {
        return this._maxSize;
    }

    /** Read-only view of the undo stack (oldest first). */
    get undoStack(): readonly Command[] {
        return this._undoStack;
    }

    /** Read-only view of the redo stack (oldest first). */
    get redoStack(): readonly Command[] {
        return this._redoStack;
    }

    /** `true` when at least one command can be undone. */
    get canUndo(): boolean {
        return this._undoStack.length > 0;
    }

    /** `true` when at least one command can be redone. */
    get canRedo(): boolean {
        return this._redoStack.length > 0;
    }

    /** Description of the next command that would be undone, or `undefined`. */
    get undoDescription(): string | undefined {
        const top = this._undoStack[this._undoStack.length - 1];
        return top?.description;
    }

    /** Description of the next command that would be redone, or `undefined`. */
    get redoDescription(): string | undefined {
        const top = this._redoStack[this._redoStack.length - 1];
        return top?.description;
    }

    // ── Mutations ───────────────────────────────────────────────────────────

    /**
     * Execute a command and push it onto the undo stack.
     *
     * Clears the redo stack (branching history is discarded, matching every
     * major editor's behaviour).
     */
    push(command: Command): void {
        command.execute();
        this._undoStack.push(command);

        // Evict oldest commands when we exceed the cap.
        while (this._undoStack.length > this._maxSize) {
            this._undoStack.shift();
        }

        // Any new action invalidates the redo branch.
        this._redoStack = [];
    }

    /**
     * Undo the most recent command.
     *
     * The command is moved from the undo stack to the redo stack.
     */
    undo(): Command | undefined {
        const command = this._undoStack.pop();
        if (!command) return undefined;

        command.undo();
        this._redoStack.push(command);

        return command;
    }

    /**
     * Redo the most recently undone command.
     *
     * The command is re-executed and moved back onto the undo stack.
     */
    redo(): Command | undefined {
        const command = this._redoStack.pop();
        if (!command) return undefined;

        command.execute();
        this._undoStack.push(command);

        return command;
    }

    /** Clear both stacks (e.g. on project switch). */
    clear(): void {
        this._undoStack = [];
        this._redoStack = [];
    }
}

// ─── Factory Functions ─────────────────────────────────────────────────────────
// Each factory captures a before-snapshot at creation time so `undo()` can
// restore the exact prior state, regardless of what happened in between.

/**
 * Replace the entire clips array.
 *
 * @param getState - Getter for current clip state.
 * @param setState - Setter for clip state.
 * @param newClips - The new clips array to set.
 * @param description - Human-readable description of the action.
 */
export function createSetClipsCommand(
    getState: ClipStateGetter,
    setState: ClipStateSetter,
    newClips: Clip[],
    description: string,
): Command {
    const previousClips = [...getState().clips];

    return {
        id: uuidv4(),
        type: 'SET_CLIPS',
        description,
        timestamp: Date.now(),
        execute() {
            setState(() => ({ clips: newClips }));
        },
        undo() {
            setState(() => ({ clips: previousClips }));
        },
    };
}

/**
 * Update a single clip's properties.
 *
 * @param getState - Getter for current clip state.
 * @param setState - Setter for clip state.
 * @param clipId - ID of the clip to update.
 * @param updates - Partial clip properties to merge.
 * @param description - Human-readable description of the action.
 */
export function createUpdateClipCommand(
    getState: ClipStateGetter,
    setState: ClipStateSetter,
    clipId: string,
    updates: Partial<Clip>,
    description: string,
): Command {
    const previousClips = [...getState().clips];

    return {
        id: uuidv4(),
        type: 'UPDATE_CLIP',
        description,
        timestamp: Date.now(),
        execute() {
            setState((state) => ({
                clips: state.clips.map((c) =>
                    c.id === clipId ? { ...c, ...updates } : c,
                ),
            }));
        },
        undo() {
            setState(() => ({ clips: previousClips }));
        },
    };
}

/**
 * Add a new clip to the timeline.
 *
 * @param getState - Getter for current clip state.
 * @param setState - Setter for clip state.
 * @param clip - The clip to add.
 */
export function createAddClipCommand(
    getState: ClipStateGetter,
    setState: ClipStateSetter,
    clip: Clip,
): Command {
    const previousClips = [...getState().clips];

    return {
        id: uuidv4(),
        type: 'ADD_CLIP',
        description: `Add clip "${clip.filename}"`,
        timestamp: Date.now(),
        execute() {
            setState((state) => ({ clips: [...state.clips, clip] }));
        },
        undo() {
            setState(() => ({ clips: previousClips }));
        },
    };
}

/**
 * Remove a clip from the timeline.
 *
 * @param getState - Getter for current clip state.
 * @param setState - Setter for clip state.
 * @param clipId - ID of the clip to remove.
 */
export function createRemoveClipCommand(
    getState: ClipStateGetter,
    setState: ClipStateSetter,
    clipId: string,
): Command {
    const currentClips = getState().clips;
    const clip = currentClips.find((c) => c.id === clipId);
    const previousClips = [...currentClips];

    return {
        id: uuidv4(),
        type: 'REMOVE_CLIP',
        description: `Remove clip "${clip?.filename ?? clipId}"`,
        timestamp: Date.now(),
        execute() {
            setState((state) => ({
                clips: state.clips.filter((c) => c.id !== clipId),
            }));
        },
        undo() {
            setState(() => ({ clips: previousClips }));
        },
    };
}

/**
 * Reorder clips by moving one clip from one index to another.
 *
 * Mirrors the reorder logic from clipStore — sorts by startFrame, performs
 * the array move, then magnetizes (recalculates contiguous frame positions).
 *
 * @param getState - Getter for current clip state.
 * @param setState - Setter for clip state.
 * @param fromIndex - Source index in the sorted clip list.
 * @param toIndex - Destination index in the sorted clip list.
 */
export function createReorderClipsCommand(
    getState: ClipStateGetter,
    setState: ClipStateSetter,
    fromIndex: number,
    toIndex: number,
): Command {
    const previousClips = [...getState().clips];

    /** Sorts clips by startFrame, moves `from→to`, then magnetizes frames. */
    const computeReordered = (clips: Clip[], from: number, to: number): Clip[] => {
        const sorted = [...clips].sort((a, b) => a.startFrame - b.startFrame);
        const [moved] = sorted.splice(from, 1);
        sorted.splice(to, 0, moved);

        // Magnetize — assign contiguous frame positions.
        let currentFrame = 0;
        return sorted.map((clip) => {
            const duration = clip.endFrame - clip.startFrame;
            const start = currentFrame;
            const end = start + duration;
            currentFrame = end;
            return { ...clip, startFrame: start, endFrame: end };
        });
    };

    const reorderedClips = computeReordered(previousClips, fromIndex, toIndex);

    return {
        id: uuidv4(),
        type: 'REORDER_CLIPS',
        description: `Move clip from position ${fromIndex + 1} to ${toIndex + 1}`,
        timestamp: Date.now(),
        execute() {
            setState(() => ({ clips: reorderedClips }));
        },
        undo() {
            setState(() => ({ clips: previousClips }));
        },
    };
}

/**
 * Wrap multiple commands into a single undoable batch.
 *
 * @param commands - The commands to group together.
 * @param description - Human-readable description of the batch.
 */
export function createBatchCommand(
    commands: Command[],
    description: string,
): Command {
    return new CommandGroup(commands, description);
}
