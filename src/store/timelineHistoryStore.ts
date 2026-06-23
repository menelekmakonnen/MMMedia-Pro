/**
 * Timeline History Store — Undo/Redo with auto-coalescing.
 * ════════════════════════════════════════════════════════════════════════════
 * Provides an undo/redo stack specifically for timeline operations.
 *
 * Auto-coalescing: when a new entry has the same `groupId` as the most
 * recent entry AND was pushed within 500 ms, the last entry's `redo`
 * function is replaced while keeping the original `undo`. This lets
 * continuous slider drags collapse into a single undo step.
 */

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HistoryEntry {
    id: string;
    description: string;
    timestamp: number;
    groupId?: string;
    undo: () => void;
    redo: () => void;
}

export interface TimelineHistoryState {
    entries: HistoryEntry[];
    currentIndex: number;   // Points to last applied entry (-1 = clean)
    maxEntries: number;     // default 100

    push: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
    undo: () => void;
    redo: () => void;
    canUndo: () => boolean;
    canRedo: () => boolean;
    clear: () => void;
    getUndoDescription: () => string | null;
    getRedoDescription: () => string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const COALESCE_WINDOW_MS = 500;

// ─── Store ───────────────────────────────────────────────────────────────────

export const useTimelineHistoryStore = create<TimelineHistoryState>((set, get) => ({
    entries: [],
    currentIndex: -1,
    maxEntries: 100,

    push: (incoming) => {
        const { entries, currentIndex, maxEntries } = get();
        const now = Date.now();

        // Trim any future entries (discard redo stack on new action)
        const trimmed = entries.slice(0, currentIndex + 1);

        // Auto-coalesce: same groupId within the coalesce window
        if (
            incoming.groupId &&
            trimmed.length > 0
        ) {
            const last = trimmed[trimmed.length - 1];
            if (
                last.groupId === incoming.groupId &&
                now - last.timestamp < COALESCE_WINDOW_MS
            ) {
                // Replace redo & description, keep original undo
                const coalesced: HistoryEntry = {
                    ...last,
                    description: incoming.description,
                    timestamp: now,
                    redo: incoming.redo,
                };
                const updated = [...trimmed.slice(0, -1), coalesced];
                set({ entries: updated, currentIndex: updated.length - 1 });
                return;
            }
        }

        const newEntry: HistoryEntry = {
            id: uuidv4(),
            timestamp: now,
            description: incoming.description,
            groupId: incoming.groupId,
            undo: incoming.undo,
            redo: incoming.redo,
        };

        let next = [...trimmed, newEntry];

        // Enforce max entries by trimming the oldest
        if (next.length > maxEntries) {
            next = next.slice(next.length - maxEntries);
        }

        set({ entries: next, currentIndex: next.length - 1 });
    },

    undo: () => {
        const { entries, currentIndex } = get();
        if (currentIndex < 0) return;
        const entry = entries[currentIndex];
        entry.undo();
        set({ currentIndex: currentIndex - 1 });
    },

    redo: () => {
        const { entries, currentIndex } = get();
        if (currentIndex >= entries.length - 1) return;
        const entry = entries[currentIndex + 1];
        entry.redo();
        set({ currentIndex: currentIndex + 1 });
    },

    canUndo: () => get().currentIndex >= 0,

    canRedo: () => {
        const { entries, currentIndex } = get();
        return currentIndex < entries.length - 1;
    },

    clear: () => set({ entries: [], currentIndex: -1 }),

    getUndoDescription: () => {
        const { entries, currentIndex } = get();
        return currentIndex >= 0 ? entries[currentIndex].description : null;
    },

    getRedoDescription: () => {
        const { entries, currentIndex } = get();
        return currentIndex < entries.length - 1
            ? entries[currentIndex + 1].description
            : null;
    },
}));
