// ══════════════════════════════════════════════════════════════════════════════
// premiereFxStore — Effect presets + "Paste Attributes" clipboard.
//
//  • presets        : saved effect bundles (Premiere "Save Preset") — persisted.
//  • attributeClip  : a snapshot of a source clip's Effect Controls used by
//                     Edit ▸ Paste Attributes (Ctrl+Alt+V). Not persisted.
// ══════════════════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { EffectComponent, EffectControlsState } from '../lib/premiere/effectControls';

export interface EffectPreset {
  id: string;
  name: string;
  /** Snapshot of one or more components (fixed or user effects). */
  components: EffectComponent[];
  createdAt: number;
}

/** Which attribute groups Paste Attributes should transfer. */
export interface AttributeSelection {
  motion: boolean;
  opacity: boolean;
  timeRemap: boolean;
  effects: boolean;       // all user video effects
  audioEffects: boolean;  // audio fixed + user effects
  speed: boolean;
}

interface PremiereFxState {
  presets: EffectPreset[];
  addPreset: (name: string, components: EffectComponent[]) => void;
  removePreset: (id: string) => void;
  renamePreset: (id: string, name: string) => void;

  /** Source clip's Effect Controls snapshot for Paste Attributes. */
  attributeClip: EffectControlsState | null;
  attributeSourceName: string | null;
  copyAttributes: (state: EffectControlsState, sourceName: string) => void;
  clearAttributes: () => void;
}

const uid = () => { try { return crypto.randomUUID(); } catch { return `p-${Date.now()}-${Math.random()}`; } };

export const usePremiereFxStore = create<PremiereFxState>()(
  persist(
    (set) => ({
      presets: [],
      addPreset: (name, components) => set((s) => ({
        presets: [...s.presets, { id: uid(), name, components: JSON.parse(JSON.stringify(components)), createdAt: Date.now() }],
      })),
      removePreset: (id) => set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),
      renamePreset: (id, name) => set((s) => ({ presets: s.presets.map((p) => p.id === id ? { ...p, name } : p) })),

      attributeClip: null,
      attributeSourceName: null,
      copyAttributes: (state, sourceName) => set({ attributeClip: JSON.parse(JSON.stringify(state)), attributeSourceName: sourceName }),
      clearAttributes: () => set({ attributeClip: null, attributeSourceName: null }),
    }),
    {
      name: 'mmmedia-premiere-fx',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ presets: s.presets }),
    },
  ),
);
