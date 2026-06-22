import { create } from 'zustand';
import { CommandHistory, Command } from '../lib/commandPattern';

// ─── History Store Types ──────────────────────────────────────────────────────

interface HistoryState {
    /** The backing command history (not serialised — session-only). */
    history: CommandHistory;

    // ── Reactive state mirrors ──────────────────────────────────────────────
    // These duplicate values from `CommandHistory` so that React components
    // re-render when undo/redo availability changes. Zustand only triggers
    // re-renders for top-level state changes, not for mutations inside a
    // class instance.

    /** Whether there is at least one action that can be undone. */
    canUndo: boolean;
    /** Whether there is at least one action that can be redone. */
    canRedo: boolean;
    /** Description of the next undoable action (for tooltips). */
    undoDescription: string | undefined;
    /** Description of the next redoable action (for tooltips). */
    redoDescription: string | undefined;
    /** Number of commands on the undo stack (for UI badge counts). */
    undoCount: number;
    /** Number of commands on the redo stack (for UI badge counts). */
    redoCount: number;

    // ── Actions ─────────────────────────────────────────────────────────────

    /** Execute a command and push it onto the undo stack. */
    execute: (command: Command) => void;
    /** Undo the most recent command. */
    undo: () => void;
    /** Redo the most recently undone command. */
    redo: () => void;
    /** Clear all undo/redo history (e.g. on project switch). */
    clear: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Derive the reactive slice from the current `CommandHistory` instance.
 * Called after every mutation so Zustand subscribers see fresh values.
 */
function deriveState(history: CommandHistory) {
    return {
        canUndo: history.canUndo,
        canRedo: history.canRedo,
        undoDescription: history.undoDescription,
        redoDescription: history.redoDescription,
        undoCount: history.undoStack.length,
        redoCount: history.redoStack.length,
    };
}

// ─── Store ────────────────────────────────────────────────────────────────────

/**
 * Global undo/redo history store.
 *
 * This store is **not persisted** — undo history is session-only and resets
 * when the application reloads. The `CommandHistory` instance lives in
 * memory; Zustand mirrors its state into reactive properties so React
 * components can subscribe efficiently.
 *
 * @example
 * ```ts
 * import { useHistoryStore } from '../store/historyStore';
 * import { createAddClipCommand } from '../lib/commandPattern';
 *
 * // Execute an undoable action
 * const cmd = createAddClipCommand(getState, setState, newClip);
 * useHistoryStore.getState().execute(cmd);
 *
 * // Undo / Redo from a keyboard shortcut handler
 * useHistoryStore.getState().undo();
 * useHistoryStore.getState().redo();
 * ```
 */
export const useHistoryStore = create<HistoryState>((set, get) => {
    const history = new CommandHistory(100);

    return {
        history,
        ...deriveState(history),

        execute: (command: Command) => {
            const { history } = get();
            history.push(command);
            set(deriveState(history));
        },

        undo: () => {
            const { history } = get();
            history.undo();
            set(deriveState(history));
        },

        redo: () => {
            const { history } = get();
            history.redo();
            set(deriveState(history));
        },

        clear: () => {
            const { history } = get();
            history.clear();
            set(deriveState(history));
        },
    };
});
