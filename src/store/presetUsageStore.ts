import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface PresetUsageState {
    templateUsage: Record<string, number>;
    styleUsage: Record<string, number>;
    godModeUsage: Record<string, number>;
    pinnedTemplates: string[];
    pinnedStyles: string[];
    pinnedGodModes: string[];
    rhythmUsage: Record<string, number>;
    pinnedRhythms: string[];

    // Edit-effect usage + co-occurrence (drives trailer "recommended effects").
    effectUsage: Record<string, number>;
    effectComboUsage: Record<string, number>;
    pinnedEffects: string[];

    incrementTemplate: (id: string) => void;
    incrementStyle: (id: string) => void;
    incrementGodMode: (id: string) => void;
    incrementRhythm: (id: string) => void;
    togglePinTemplate: (id: string) => void;
    togglePinStyle: (id: string) => void;
    togglePinGodMode: (id: string) => void;
    togglePinRhythm: (id: string) => void;
    getTopTemplates: (n: number) => string[];
    getTopStyles: (n: number) => string[];
    getTopGodModes: (n: number) => string[];
    getTopRhythms: (n: number) => string[];

    incrementEffect: (id: string) => void;
    /** Record a whole stack of effects used together (for combo suggestions). */
    recordEffectStack: (ids: string[]) => void;
    togglePinEffect: (id: string) => void;
    /** Most-used (and pinned) individual effects for quick-config chips. */
    getRecommendedEffects: (n: number) => string[];
    /** Most-used effect combinations, each as an array of effect ids. */
    getTopEffectCombos: (n: number) => string[][];
}

/**
 * Smart-Preset usage tracking store.
 * Persists usage counts and pinned slots to localStorage.
 * Pinned presets always appear in quick-pick slots;
 * remaining slots fill with the most-used presets.
 */
export const usePresetUsageStore = create<PresetUsageState>()(
    persist(
        (set, get) => ({
            templateUsage: {},
            styleUsage: {},
            godModeUsage: {},
            pinnedTemplates: [],
            pinnedStyles: [],
            pinnedGodModes: [],
            rhythmUsage: {},
            pinnedRhythms: [],
            effectUsage: {},
            effectComboUsage: {},
            pinnedEffects: [],

            incrementTemplate: (id) => set((s) => ({
                templateUsage: { ...s.templateUsage, [id]: (s.templateUsage[id] || 0) + 1 }
            })),

            incrementStyle: (id) => set((s) => ({
                styleUsage: { ...s.styleUsage, [id]: (s.styleUsage[id] || 0) + 1 }
            })),

            incrementGodMode: (id) => set((s) => ({
                godModeUsage: { ...s.godModeUsage, [id]: (s.godModeUsage[id] || 0) + 1 }
            })),

            togglePinTemplate: (id) => set((s) => ({
                pinnedTemplates: s.pinnedTemplates.includes(id)
                    ? s.pinnedTemplates.filter(p => p !== id)
                    : [...s.pinnedTemplates, id]
            })),

            togglePinStyle: (id) => set((s) => ({
                pinnedStyles: s.pinnedStyles.includes(id)
                    ? s.pinnedStyles.filter(p => p !== id)
                    : [...s.pinnedStyles, id]
            })),

            togglePinGodMode: (id) => set((s) => ({
                pinnedGodModes: s.pinnedGodModes.includes(id)
                    ? s.pinnedGodModes.filter(p => p !== id)
                    : [...s.pinnedGodModes, id]
            })),

            incrementRhythm: (id) => set((s) => ({
                rhythmUsage: { ...s.rhythmUsage, [id]: (s.rhythmUsage[id] || 0) + 1 }
            })),

            togglePinRhythm: (id) => set((s) => ({
                pinnedRhythms: s.pinnedRhythms.includes(id)
                    ? s.pinnedRhythms.filter(p => p !== id)
                    : [...s.pinnedRhythms, id]
            })),

            getTopTemplates: (n) => {
                const { templateUsage, pinnedTemplates } = get();
                return getTopN(templateUsage, pinnedTemplates, n);
            },

            getTopStyles: (n) => {
                const { styleUsage, pinnedStyles } = get();
                return getTopN(styleUsage, pinnedStyles, n);
            },

            getTopGodModes: (n) => {
                const { godModeUsage, pinnedGodModes } = get();
                return getTopN(godModeUsage, pinnedGodModes, n);
            },

            getTopRhythms: (n) => {
                const { rhythmUsage, pinnedRhythms } = get();
                return getTopN(rhythmUsage, pinnedRhythms, n);
            },

            incrementEffect: (id) => set((s) => ({
                effectUsage: { ...s.effectUsage, [id]: (s.effectUsage[id] || 0) + 1 }
            })),

            recordEffectStack: (ids) => set((s) => {
                const effectUsage = { ...s.effectUsage };
                for (const id of ids) effectUsage[id] = (effectUsage[id] || 0) + 1;
                const effectComboUsage = { ...s.effectComboUsage };
                if (ids.length >= 2) {
                    const key = [...ids].sort().join('+');
                    effectComboUsage[key] = (effectComboUsage[key] || 0) + 1;
                }
                return { effectUsage, effectComboUsage };
            }),

            togglePinEffect: (id) => set((s) => ({
                pinnedEffects: s.pinnedEffects.includes(id)
                    ? s.pinnedEffects.filter(p => p !== id)
                    : [...s.pinnedEffects, id]
            })),

            getRecommendedEffects: (n) => {
                const { effectUsage, pinnedEffects } = get();
                return getTopN(effectUsage, pinnedEffects, n);
            },

            getTopEffectCombos: (n) => {
                const { effectComboUsage } = get();
                return Object.entries(effectComboUsage)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, n)
                    .map(([key]) => key.split('+'));
            },
        }),
        {
            name: 'mmmedia-preset-usage',
            storage: createJSONStorage(() => localStorage),
        }
    )
);

/**
 * Returns the top N preset IDs, with pinned items always included first.
 * Remaining slots fill with highest-usage items not already pinned.
 */
function getTopN(usage: Record<string, number>, pinned: string[], n: number): string[] {
    const result = [...pinned];
    const pinnedSet = new Set(pinned);
    const remaining = Object.entries(usage)
        .filter(([id]) => !pinnedSet.has(id))
        .sort((a, b) => b[1] - a[1]);

    for (const [id] of remaining) {
        if (result.length >= n) break;
        result.push(id);
    }

    return result.slice(0, n);
}
