import { create } from 'zustand';
import type { ClipDecision } from '../types/ClipDecision';
import type { EditPlan, ClipDecisionNode } from '../types/EditPlanTypes';

interface EditLogicState {
    // ── Legacy (backward compat) ──
    /** The current edit plan decisions (legacy format). */
    decisions: ClipDecision[];

    // ── New Edit Plan ──
    /** The comprehensive Edit Plan tree. */
    editPlan: EditPlan | null;

    /** True while a preview generation is running */
    isGeneratingPreview: boolean;
    /** Index of the currently-playing clip (-1 = none) */
    activeClipIndex: number;
    /** Whether the sidebar panel is visible */
    sidebarVisible: boolean;
    /** Expanded section IDs in the Edit Plan UI */
    expandedSections: Set<string>;
    /** Whether the plan has been modified (needs re-generation) */
    planModified: boolean;

    // Actions
    setDecisions: (d: ClipDecision[]) => void;
    setEditPlan: (plan: EditPlan) => void;
    setActiveClipIndex: (i: number) => void;
    reorderDecision: (fromIndex: number, toIndex: number) => void;
    reorderClipNode: (fromIndex: number, toIndex: number) => void;
    removeDecision: (index: number) => void;
    toggleSection: (sectionId: string) => void;
    toggleSidebar: () => void;
    setSidebarVisible: (v: boolean) => void;
    setGenerating: (v: boolean) => void;
    setPlanModified: (v: boolean) => void;
    clear: () => void;
}

export const useEditLogicStore = create<EditLogicState>((set) => ({
    decisions: [],
    editPlan: null,
    isGeneratingPreview: false,
    activeClipIndex: -1,
    sidebarVisible: true,
    expandedSections: new Set(['global', 'clips', 'audio']),
    planModified: false,

    setDecisions: (decisions) => set({ decisions, isGeneratingPreview: false }),

    setEditPlan: (editPlan) => set({ editPlan, planModified: false }),

    setActiveClipIndex: (activeClipIndex) => set({ activeClipIndex }),

    reorderDecision: (fromIndex, toIndex) =>
        set((state) => {
            const next = [...state.decisions];
            const [moved] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, moved);
            // Re-index the order field
            return { decisions: next.map((d, i) => ({ ...d, order: i })) };
        }),

    reorderClipNode: (fromIndex, toIndex) =>
        set((state) => {
            if (!state.editPlan) return {};
            const clips = [...state.editPlan.clips];
            const [moved] = clips.splice(fromIndex, 1);
            clips.splice(toIndex, 0, moved);
            const reindexed = clips.map((c, i) => ({ ...c, order: i }));
            return {
                editPlan: { ...state.editPlan, clips: reindexed },
                planModified: true,
            };
        }),

    removeDecision: (index) =>
        set((state) => {
            const next = state.decisions.filter((_, i) => i !== index);
            return { decisions: next.map((d, i) => ({ ...d, order: i })) };
        }),

    toggleSection: (sectionId) =>
        set((state) => {
            const next = new Set(state.expandedSections);
            if (next.has(sectionId)) next.delete(sectionId);
            else next.add(sectionId);
            return { expandedSections: next };
        }),

    toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
    setSidebarVisible: (sidebarVisible) => set({ sidebarVisible }),
    setGenerating: (isGeneratingPreview) => set({ isGeneratingPreview }),
    setPlanModified: (planModified) => set({ planModified }),
    clear: () => set({ decisions: [], editPlan: null, activeClipIndex: -1, isGeneratingPreview: false, planModified: false }),
}));
