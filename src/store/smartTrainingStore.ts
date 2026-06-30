// ══════════════════════════════════════════════════════════════════════════════
// smartTrainingStore.ts — Persisted "challenge the Smart Engine" training state.
//
// Holds the learnable bias that nudges future Smart-Engine segment suggestions
// toward the user's taste, plus a rolling log of decisions for transparency.
// The bias is consumed by suggestSmartSegments() (lib/ege/smartSegments.ts).
// ══════════════════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
    NEUTRAL_BIAS,
    updateBias,
    classifyEdit,
    type SmartBias,
    type SmartDecision,
} from '../lib/ege/smartSegments';

export interface DecisionLogEntry extends SmartDecision {
    fileId: string;
    at: number;
}

interface SmartTrainingState {
    /** Global learned bias applied to all suggestions. */
    bias: SmartBias;
    /** Recent decisions (capped) for transparency / undo of learning. */
    log: DecisionLogEntry[];
    /** Per-file count of challenges, for UI badges. */
    challengeCountByFile: Record<string, number>;

    /** Record a raw decision and fold it into the bias. */
    recordDecision: (fileId: string, decision: SmartDecision) => void;
    /** Convenience: derive + record a decision from before/after head/tail edits. */
    recordEdit: (
        fileId: string,
        smart: { inSec: number; outSec: number },
        user: { inSec: number; outSec: number },
    ) => void;
    /** Reset all learning to neutral. */
    resetTraining: () => void;
}

const MAX_LOG = 200;

export const useSmartTrainingStore = create<SmartTrainingState>()(
    persist(
        (set, get) => ({
            bias: { ...NEUTRAL_BIAS },
            log: [],
            challengeCountByFile: {},

            recordDecision: (fileId, decision) => set((state) => {
                const bias = updateBias(state.bias, decision);
                const entry: DecisionLogEntry = { ...decision, fileId, at: Date.now() };
                const isChallenge = decision.kind !== 'accept';
                return {
                    bias,
                    log: [entry, ...state.log].slice(0, MAX_LOG),
                    challengeCountByFile: isChallenge
                        ? { ...state.challengeCountByFile, [fileId]: (state.challengeCountByFile[fileId] ?? 0) + 1 }
                        : state.challengeCountByFile,
                };
            }),

            recordEdit: (fileId, smart, user) => {
                get().recordDecision(fileId, classifyEdit(smart, user));
            },

            resetTraining: () => set({ bias: { ...NEUTRAL_BIAS }, log: [], challengeCountByFile: {} }),
        }),
        { name: 'mmm_smart_training' },
    ),
);
