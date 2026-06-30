// ══════════════════════════════════════════════════════════════════════════════
// PasteAttributesModal — Premiere "Paste Attributes" dialog.
// Choose which attribute groups from the copied source clip to apply to the
// selected target clip(s).
// ══════════════════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import clsx from 'clsx';
import { X, ClipboardPaste } from 'lucide-react';
import { useClipStore } from '../../../store/clipStore';
import { useProjectStore } from '../../../store/projectStore';
import { usePremiereFxStore } from '../../../store/premiereFxStore';
import {
  applyAttributes, migrateClipToEffectControls, syncEffectControlsToLegacy,
  type AttributeSelection,
} from '../../../lib/premiere/effectControls';
import { effectControlsToParametric } from '../../../lib/premiere/effectLibrary';

interface Props {
  targetClipIds: string[];
  onClose: () => void;
}

const ROWS: Array<{ key: keyof AttributeSelection; label: string; hint: string }> = [
  { key: 'motion', label: 'Motion', hint: 'Position · Scale · Rotation · Anchor Point' },
  { key: 'opacity', label: 'Opacity', hint: 'Opacity · Blend Mode' },
  { key: 'timeRemap', label: 'Time Remapping', hint: 'Speed keyframes' },
  { key: 'speed', label: 'Speed (constant)', hint: 'Clip speed only' },
  { key: 'effects', label: 'Video Effects', hint: 'All applied video effects' },
  { key: 'audioEffects', label: 'Audio Effects', hint: 'Volume · Pan · applied audio FX' },
];

export const PasteAttributesModal: React.FC<Props> = ({ targetClipIds, onClose }) => {
  const { attributeClip, attributeSourceName } = usePremiereFxStore();
  const clips = useClipStore((s) => s.clips);
  const updateClip = useClipStore((s) => s.updateClip);
  const settings = useProjectStore((s) => s.settings);
  const width = settings.resolution?.width ?? 1920;
  const height = settings.resolution?.height ?? 1080;

  const [sel, setSel] = useState<AttributeSelection>({
    motion: true, opacity: true, timeRemap: false, speed: false, effects: true, audioEffects: true,
  });

  const toggle = (k: keyof AttributeSelection) => setSel((s) => ({ ...s, [k]: !s[k] }));

  const apply = () => {
    if (!attributeClip) return;
    for (const id of targetClipIds) {
      const clip = clips.find((c) => c.id === id);
      if (!clip) continue;
      const target = clip.effectControls ?? migrateClipToEffectControls(clip as any, width, height);
      const next = applyAttributes(target, attributeClip, sel);
      const legacy = syncEffectControlsToLegacy(next, width, height);
      const parametricEffects = effectControlsToParametric(next);
      updateClip(id, { effectControls: next, parametricEffects, ...legacy } as any);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[340px] bg-[#0d0d1c] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 h-9 bg-[#11112a] border-b border-white/[0.06]">
          <span className="text-[11px] font-semibold text-white/80 flex items-center gap-1.5">
            <ClipboardPaste size={13} className="text-indigo-300" /> Paste Attributes
          </span>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={14} /></button>
        </div>

        <div className="p-3">
          <p className="text-[9px] text-white/40 mb-2">
            From <span className="text-indigo-300">{attributeSourceName ?? 'copied clip'}</span> →
            {' '}{targetClipIds.length} target clip{targetClipIds.length === 1 ? '' : 's'}
          </p>
          {!attributeClip ? (
            <p className="text-[10px] text-amber-300/80 py-4 text-center">Nothing copied. Select a clip and click <b>Copy</b> first.</p>
          ) : (
            <div className="space-y-1">
              {ROWS.map((r) => (
                <button
                  key={r.key}
                  onClick={() => toggle(r.key)}
                  className={clsx(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors',
                    sel[r.key] ? 'bg-indigo-500/10 border border-indigo-500/30' : 'bg-white/[0.02] border border-transparent hover:bg-white/[0.04]',
                  )}
                >
                  <span className={clsx('w-3.5 h-3.5 rounded flex items-center justify-center border', sel[r.key] ? 'bg-indigo-500 border-indigo-400' : 'border-white/20')}>
                    {sel[r.key] && <span className="text-[8px] text-white">✓</span>}
                  </span>
                  <span className="flex-1">
                    <span className="block text-[10px] text-white/80 font-medium">{r.label}</span>
                    <span className="block text-[8px] text-white/35">{r.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-3 h-11 bg-[#0b0b18] border-t border-white/[0.06]">
          <button onClick={onClose} className="px-3 py-1 rounded-lg text-[10px] text-white/50 hover:text-white/80">Cancel</button>
          <button
            onClick={apply}
            disabled={!attributeClip}
            className="px-3 py-1 rounded-lg text-[10px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-30"
          >
            Paste
          </button>
        </div>
      </div>
    </div>
  );
};

export default PasteAttributesModal;
