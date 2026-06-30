import { create } from 'zustand';
import type { ClipDecision } from '../types/ClipDecision';

interface EditLogicState {
    /** The current edit plan decisions */
    decisions: ClipDecision[];
    /** True while a preview generation is running */
    isGeneratingPreview: boolean;
    /** Index of the currently-playing clip (-1 = none) */
    activeClipIndex: number;
    /** Whether the sidebar panel is visible */
    sidebarVisible: boolean;

    // Actions
    setDecisions: (d: ClipDecision[]) => void;
    setActiveClipIndex: (i: number) => void;
    reorderDecision: (fromIndex: number, toIndex: number) => void;
    removeDecision: (index: number) => void;
    toggleSidebar: () => void;
    setSidebarVisible: (v: boolean) => void;
    setGenerating: (v: boolean) => void;
    clear: () => void;
}

export const useEditLogicStore = create<EditLogicState>((set) => ({
    decisions: [],
    isGeneratingPreview: false,
    activeClipIndex: -1,
    sidebarVisible: true,

    setDecisions: (decisions) => set({ decisions, isGeneratingPreview: false }),

    setActiveClipIndex: (activeClipIndex) => set({ activeClipIndex }),

    reorderDecision: (fromIndex, toIndex) =>
        set((state) => {
            const next = [...state.decisions];
            const [moved] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, moved);
            // Re-index the order field
            return { decisions: next.map((d, i) => ({ ...d, order: i })) };
        }),

    removeDecision: (index) =>
        set((state) => {
            const next = state.decisions.filter((_, i) => i !== index);
            return { decisions: next.map((d, i) => ({ ...d, order: i })) };
        }),

    toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
    setSidebarVisible: (sidebarVisible) => set({ sidebarVisible }),
    setGenerating: (isGeneratingPreview) => set({ isGeneratingPreview }),
    clear: () => set({ decisions: [], activeClipIndex: -1, isGeneratingPreview: false }),
}));
