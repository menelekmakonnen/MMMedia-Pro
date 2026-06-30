// ══════════════════════════════════════════════════════════════════════════════
// EffectsBrowser — Premiere-style Effects panel category tree.
//
// Folders mirror Premiere: Presets · Lumetri Presets · Audio Effects ·
// Audio Transitions · Video Effects · Video Transitions · Legacy. Leaves apply to
// the selected clip: video effects + Lumetri presets go through the Effect
// Controls model; saved presets apply their components; video transitions set the
// clip transition. Searchable. Editing of applied parameters lives in the Effect
// Controls panel.
// ══════════════════════════════════════════════════════════════════════════════

import React, { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, Folder, Search, Sparkles, Film, Music, Wand2, Sliders } from 'lucide-react';
import clsx from 'clsx';
import { useClipStore, type Clip } from '../../../store/clipStore';
import { useProjectStore } from '../../../store/projectStore';
import { useTimelineStore } from '../timeline/useTimelineStore';
import { usePremiereFxStore } from '../../../store/premiereFxStore';
import { EFFECT_REGISTRY } from '../../../lib/effectRegistry';
import { TRANSITION_META } from '../../../lib/transitions';
import {
  migrateClipToEffectControls, syncEffectControlsToLegacy, applyPresetComponents,
  type EffectControlsState,
} from '../../../lib/premiere/effectControls';
import {
  componentFromEffectId, appendEffectComponent, effectControlsToParametric,
} from '../../../lib/premiere/effectLibrary';

type Leaf =
  | { kind: 'effect'; id: string; label: string }
  | { kind: 'lumetri'; effectId: string; params: Record<string, number | string | boolean>; label: string }
  | { kind: 'preset'; id: string; label: string }
  | { kind: 'transition'; id: string; label: string }
  | { kind: 'info'; label: string };

interface FolderNode { label: string; icon?: React.ElementType; children: Array<FolderNode | Leaf> }

const isLeaf = (n: FolderNode | Leaf): n is Leaf => 'kind' in n;

// ─── Lumetri-style presets (apply a registry colour effect with preset params) ──
const LUMETRI_PRESETS: Leaf[] = [
  { kind: 'lumetri', label: 'Warm Cinematic', effectId: 'color_temperature', params: { temp: 7800 } },
  { kind: 'lumetri', label: 'Cool Teal', effectId: 'color_temperature', params: { temp: 4800 } },
  { kind: 'lumetri', label: 'High Contrast', effectId: 'levels', params: {} },
  { kind: 'lumetri', label: 'Faded Film', effectId: 'sepia_advanced', params: {} },
  { kind: 'lumetri', label: 'Punchy Exposure', effectId: 'exposure', params: {} },
];

export const EffectsBrowser: React.FC = () => {
  const clips = useClipStore((s) => s.clips);
  const updateClip = useClipStore((s) => s.updateClip);
  const setTransitionStrategy = useClipStore((s) => s.setTransitionStrategy);
  const selectedItemIds = useTimelineStore((s) => s.selectedItemIds);
  const settings = useProjectStore((s) => s.settings);
  const presets = usePremiereFxStore((s) => s.presets);
  const W = settings.resolution?.width ?? 1920;
  const H = settings.resolution?.height ?? 1080;

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({ 'Video Effects': true });

  const selectedIds = Array.from(selectedItemIds);
  const selectedClipId = selectedIds.length === 1 ? selectedIds[0] : null;
  const selectedClip = clips.find((c) => c.id === selectedClipId) as Clip | undefined;

  const ensureEC = (clip: Clip): EffectControlsState => clip.effectControls ?? migrateClipToEffectControls(clip as any, W, H);
  const commitEC = (clipId: string, next: EffectControlsState) => {
    updateClip(clipId, { effectControls: next, parametricEffects: effectControlsToParametric(next), ...syncEffectControlsToLegacy(next, W, H) } as Partial<Clip>);
  };

  const applyEffectId = (effectId: string, params?: Record<string, number | string | boolean>) => {
    if (!selectedClip || !selectedClipId) return;
    const ec = ensureEC(selectedClip);
    if (ec.video.some((c) => c.matchName === `MA.${effectId}`)) return;
    const comp = componentFromEffectId(effectId);
    if (!comp) return;
    if (params) for (const p of comp.params) if (p.id in params) (p as any).value = params[p.id];
    commitEC(selectedClipId, appendEffectComponent(ec, comp));
  };

  const applyLeaf = (leaf: Leaf) => {
    switch (leaf.kind) {
      case 'effect': return applyEffectId(leaf.id);
      case 'lumetri': return applyEffectId(leaf.effectId, leaf.params);
      case 'transition': return setTransitionStrategy(leaf.id);
      case 'preset': {
        if (!selectedClip || !selectedClipId) return;
        const preset = presets.find((p) => p.id === leaf.id);
        if (preset) commitEC(selectedClipId, applyPresetComponents(ensureEC(selectedClip), preset.components));
        return;
      }
      default: return;
    }
  };

  // ─── Build the tree ───
  const tree: FolderNode[] = useMemo(() => {
    const byCat: Record<string, Leaf[]> = {};
    for (const e of EFFECT_REGISTRY) (byCat[e.category] ??= []).push({ kind: 'effect', id: e.id, label: e.name });
    const catFolders: FolderNode[] = Object.entries(byCat).map(([cat, leaves]) => ({
      label: cat.charAt(0).toUpperCase() + cat.slice(1), children: leaves,
    }));

    const transitions: Leaf[] = Object.entries(TRANSITION_META)
      .filter(([id]) => id !== 'cut')
      .map(([id, meta]) => ({ kind: 'transition', id, label: (meta as { label?: string }).label ?? id }));

    return [
      { label: 'Presets', icon: Sliders, children: presets.length ? presets.map((p) => ({ kind: 'preset', id: p.id, label: p.name } as Leaf)) : [{ kind: 'info', label: 'No presets — save one from Effect Controls' }] },
      { label: 'Lumetri Presets', icon: Wand2, children: LUMETRI_PRESETS },
      { label: 'Audio Effects', icon: Music, children: [{ kind: 'info', label: 'Volume · Channel Volume · Panner (Effect Controls)' }] },
      { label: 'Audio Transitions', icon: Music, children: [{ kind: 'info', label: 'Constant Power · Exponential Fade' }] },
      { label: 'Video Effects', icon: Film, children: catFolders },
      { label: 'Video Transitions', icon: Film, children: transitions },
      { label: 'Legacy', icon: Folder, children: [{ kind: 'info', label: 'Older effects appear here' }] },
    ];
  }, [presets]);

  const q = query.trim().toLowerCase();
  const matches = (label: string) => !q || label.toLowerCase().includes(q);

  const renderNode = (node: FolderNode | Leaf, depth: number, path: string): React.ReactNode => {
    if (isLeaf(node)) {
      if (!matches(node.label)) return null;
      const muted = node.kind === 'info';
      return (
        <button
          key={path}
          disabled={muted || !selectedClipId}
          onDoubleClick={() => applyLeaf(node)}
          onClick={() => { if (!muted) applyLeaf(node); }}
          style={{ paddingLeft: depth * 12 + 8 }}
          className={clsx(
            'w-full flex items-center gap-1.5 py-[3px] pr-2 text-left text-[10px] transition-colors rounded',
            muted ? 'text-white/25 cursor-default'
              : selectedClipId ? 'text-white/65 hover:bg-indigo-500/20 hover:text-white'
              : 'text-white/30 cursor-not-allowed',
          )}
          title={muted ? node.label : selectedClipId ? `Apply "${node.label}" to selected clip` : 'Select a clip first'}
        >
          <Sparkles size={8} className={muted ? 'text-white/15' : 'text-indigo-400/70'} />
          <span className="truncate">{node.label}</span>
        </button>
      );
    }
    // folder
    const isOpen = open[path] ?? false;
    const childNodes = node.children.map((c, i) => renderNode(c, depth + 1, `${path}/${isLeaf(c) ? c.label : c.label}#${i}`)).filter(Boolean);
    // When searching, auto-expand folders that have matches.
    const forceOpen = q.length > 0 && childNodes.length > 0;
    if (q.length > 0 && childNodes.length === 0) return null;
    const Icon = node.icon ?? Folder;
    return (
      <div key={path}>
        <button
          onClick={() => setOpen((o) => ({ ...o, [path]: !isOpen }))}
          style={{ paddingLeft: depth * 12 + 4 }}
          className="w-full flex items-center gap-1 py-1 pr-2 text-left text-[10px] font-semibold text-white/55 hover:text-white/80 transition-colors"
        >
          {(isOpen || forceOpen) ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          <Icon size={11} className="text-amber-300/70" />
          <span className="truncate">{node.label}</span>
        </button>
        {(isOpen || forceOpen) && <div>{childNodes}</div>}
      </div>
    );
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#0b0b18] select-none">
      {/* Search */}
      <div className="p-2 flex-shrink-0 border-b border-white/[0.05]">
        <div className="flex items-center gap-1.5 bg-[#070712] rounded-md px-2 py-1 border border-white/[0.05]">
          <Search size={11} className="text-white/30" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search effects…"
            className="flex-1 bg-transparent text-[10px] text-white/80 outline-none placeholder:text-white/25"
          />
        </div>
        {!selectedClipId && (
          <p className="text-[8px] text-amber-300/60 mt-1 px-0.5">Select a single clip to apply effects.</p>
        )}
      </div>
      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1 pr-1">
        {tree.map((n, i) => renderNode(n, 0, `${n.label}#${i}`))}
      </div>
    </div>
  );
};
