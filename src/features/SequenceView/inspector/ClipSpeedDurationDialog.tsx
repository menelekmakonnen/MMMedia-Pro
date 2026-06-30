// ══════════════════════════════════════════════════════════════════════════════
// ClipSpeedDurationDialog — Premiere "Clip Speed / Duration" (⌃R).
// Adjust speed %, duration, reverse, and maintain-pitch for the selected clip(s).
// ══════════════════════════════════════════════════════════════════════════════

import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { X, Gauge, Link, Link2Off } from 'lucide-react';
import { useClipStore } from '../../../store/clipStore';
import { useProjectStore } from '../../../store/projectStore';
import { useSequenceViewStore } from '../../../store/sequenceViewStore';
import { formatTimecode } from '../../../lib/time';

export const ClipSpeedDurationDialog: React.FC = () => {
  const open = useSequenceViewStore((s) => s.speedDialogOpen);
  const setOpen = useSequenceViewStore((s) => s.setSpeedDialogOpen);
  const clips = useClipStore((s) => s.clips);
  const selectedClipIds = useClipStore((s) => s.selectedClipIds);
  const setClipSpeed = useClipStore((s) => s.setClipSpeed);
  const setClipDuration = useClipStore((s) => s.setClipDuration);
  const updateClip = useClipStore((s) => s.updateClip);
  const fps = useProjectStore((s) => s.settings.fps) ?? 30;

  const primary = useMemo(() => clips.find((c) => c.id === selectedClipIds[0]), [clips, selectedClipIds]);

  const [speed, setSpeed] = useState(100);
  const [reverse, setReverse] = useState(false);
  const [maintainPitch, setMaintainPitch] = useState(true);
  const [ripple, setRipple] = useState(false);
  const [linked, setLinked] = useState(true);

  // Seed from the primary clip whenever the dialog opens.
  React.useEffect(() => {
    if (open && primary) {
      setSpeed(Math.round((primary.speed ?? 1) * 100));
      setReverse(Boolean(primary.reversed));
    }
  }, [open, primary?.id]);

  if (!open) return null;

  const durFrames = primary ? primary.endFrame - primary.startFrame : 0;
  const sourceUsed = primary ? (primary.trimEndFrame - primary.trimStartFrame) : 0;
  // Duration implied by the chosen speed.
  const newDurFrames = speed > 0 ? Math.round(sourceUsed / (speed / 100)) : durFrames;

  const apply = () => {
    const ids = selectedClipIds.length ? selectedClipIds : (primary ? [primary.id] : []);
    for (const id of ids) {
      setClipSpeed(id, speed / 100);
      updateClip(id, { reversed: reverse } as any);
    }
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="w-[320px] bg-[#0d0d1c] border border-white/10 rounded-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 h-9 bg-[#11112a] border-b border-white/[0.06]">
          <span className="text-[11px] font-semibold text-white/80 flex items-center gap-1.5"><Gauge size={13} className="text-orange-300" /> Clip Speed / Duration</span>
          <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white"><X size={14} /></button>
        </div>

        {!primary ? (
          <p className="text-[10px] text-amber-300/80 py-6 text-center">Select a clip first.</p>
        ) : (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-[9px] uppercase tracking-wider text-white/40">Speed</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number" value={speed} min={1} max={1000}
                    onChange={(e) => setSpeed(Math.max(1, Math.min(1000, Number(e.target.value) || 0)))}
                    className="w-20 bg-[#15152b] border border-white/10 rounded px-2 py-1 text-[11px] text-white/90 outline-none focus:border-indigo-500/50"
                  />
                  <span className="text-[10px] text-white/40">%</span>
                </div>
              </div>
              <button onClick={() => setLinked((v) => !v)} className={clsx('mt-3 p-1 rounded', linked ? 'text-indigo-300' : 'text-white/30')} title="Link speed and duration">
                {linked ? <Link size={13} /> : <Link2Off size={13} />}
              </button>
              <div className="flex-1">
                <label className="text-[9px] uppercase tracking-wider text-white/40">Duration</label>
                <div className="text-[11px] font-mono text-white/80 bg-[#15152b] border border-white/10 rounded px-2 py-1">
                  {formatTimecode(newDurFrames, fps)}
                </div>
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              {[
                { label: 'Reverse Speed', val: reverse, set: setReverse },
                { label: 'Maintain Audio Pitch', val: maintainPitch, set: setMaintainPitch },
                { label: 'Ripple Edit, Shifting Trailing Clips', val: ripple, set: setRipple },
              ].map((r) => (
                <button key={r.label} onClick={() => r.set(!r.val)} className="w-full flex items-center gap-2 text-left">
                  <span className={clsx('w-3.5 h-3.5 rounded border flex items-center justify-center', r.val ? 'bg-indigo-500 border-indigo-400' : 'border-white/20')}>
                    {r.val && <span className="text-[8px] text-white">✓</span>}
                  </span>
                  <span className="text-[10px] text-white/70">{r.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-3 h-11 bg-[#0b0b18] border-t border-white/[0.06]">
          <button onClick={() => setOpen(false)} className="px-3 py-1 rounded-lg text-[10px] text-white/50 hover:text-white/80">Cancel</button>
          <button onClick={apply} disabled={!primary} className="px-3 py-1 rounded-lg text-[10px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-30">OK</button>
        </div>
      </div>
    </div>
  );
};

export default ClipSpeedDurationDialog;
