// ══════════════════════════════════════════════════════════════════════════════
// AdjustmentLayerDialog — Premiere "Adjustment Layer" creator (File ▸ New ▸
// Adjustment Layer). Width/Height/Timebase/PAR default to the sequence. On OK it
// drops a transparent adjustment-layer clip on a NEW video track above all
// content, spanning the In/Out range (or the whole edit). Trim it to cover a
// transition, part of a clip, or the full edit — its effects apply to everything
// below it.
// ══════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import { X, Layers } from 'lucide-react';
import { useClipStore, type Clip } from '../../store/clipStore';
import { useProjectStore } from '../../store/projectStore';
import { useTimelineStore } from './timeline/useTimelineStore';

const FPS_OPTIONS = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];

const uid = () => { try { return crypto.randomUUID(); } catch { return `adj-${Date.now()}-${Math.random()}`; } };

export const AdjustmentLayerDialog: React.FC = () => {
  const open = useTimelineStore((s) => s.adjustmentDialogOpen);
  const setOpen = useTimelineStore((s) => s.setAdjustmentDialogOpen);
  const settings = useProjectStore((s) => s.settings);
  const clips = useClipStore((s) => s.clips);
  const addClip = useClipStore((s) => s.addClip);
  const inOutRange = useTimelineStore((s) => s.inOutRange);

  const seqW = settings.resolution?.width ?? 1080;
  const seqH = settings.resolution?.height ?? 1920;
  const seqFps = settings.fps ?? 30;

  const [width, setWidth] = useState(seqW);
  const [height, setHeight] = useState(seqH);
  const [fps, setFps] = useState(seqFps);
  const [par, setPar] = useState('Square Pixels (1.0)');

  useEffect(() => {
    if (open) { setWidth(seqW); setHeight(seqH); setFps(seqFps); }
  }, [open, seqW, seqH, seqFps]);

  if (!open) return null;

  const create = () => {
    const maxFrame = clips.reduce((m, c) => Math.max(m, c.endFrame), 0);
    // Span: In/Out range if set, else the whole edit (fallback 5s).
    const start = inOutRange.inFrame ?? 0;
    const end = inOutRange.outFrame ?? Math.max(maxFrame, Math.round(seqFps * 5));
    const span = Math.max(1, end - start);

    // Place on a NEW video track above all existing video content.
    const videoIds = clips.map((c) => c.track ?? 1).filter((t) => t < 100 && t !== 2);
    const track = Math.max(2, ...videoIds, 2) + 1; // ≥ 3 and above existing video

    const layer: Clip = {
      id: uid(),
      type: 'video',
      isAdjustmentLayer: true,
      path: '',
      filename: 'Adjustment Layer',
      startFrame: start,
      endFrame: start + span,
      sourceDurationFrames: span,
      trimStartFrame: 0,
      trimEndFrame: span,
      width, height,
      track,
      speed: 1,
      volume: 0,
      reversed: false,
      locked: false,
      origin: 'manual',
    } as Clip;
    addClip(layer);
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="w-[360px] bg-[#0f0f1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 h-9 bg-[#15152b] border-b border-white/[0.06]">
          <span className="text-[11px] font-semibold text-white/80 flex items-center gap-1.5"><Layers size={13} className="text-indigo-300" /> Adjustment Layer</span>
          <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white"><X size={14} /></button>
        </div>

        <div className="p-4">
          <div className="border border-white/10 rounded-lg p-3">
            <div className="text-[9px] uppercase tracking-wider text-white/35 mb-3">Video Settings</div>
            <div className="space-y-2.5">
              <Row label="Width">
                <input type="number" value={width} onChange={(e) => setWidth(Math.max(1, Number(e.target.value) || 0))}
                  className="w-24 bg-[#1a1a30] border border-white/10 rounded px-2 py-1 text-[11px] text-amber-300 outline-none focus:border-indigo-500/50" />
              </Row>
              <Row label="Height">
                <input type="number" value={height} onChange={(e) => setHeight(Math.max(1, Number(e.target.value) || 0))}
                  className="w-24 bg-[#1a1a30] border border-white/10 rounded px-2 py-1 text-[11px] text-amber-300 outline-none focus:border-indigo-500/50" />
              </Row>
              <Row label="Timebase">
                <select value={fps} onChange={(e) => setFps(Number(e.target.value))}
                  className="w-40 bg-[#1a1a30] border border-white/10 rounded px-2 py-1 text-[11px] text-white/80 outline-none">
                  {FPS_OPTIONS.map((f) => <option key={f} value={f}>{f.toFixed(2)} fps</option>)}
                </select>
              </Row>
              <Row label="Pixel Aspect Ratio">
                <select value={par} onChange={(e) => setPar(e.target.value)}
                  className="w-40 bg-[#1a1a30] border border-white/10 rounded px-2 py-1 text-[11px] text-white/80 outline-none">
                  {['Square Pixels (1.0)', 'D1/DV NTSC (0.9091)', 'D1/DV PAL (1.0940)', 'Anamorphic 2:1 (2.0)'].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Row>
            </div>
          </div>
          <p className="text-[9px] text-white/30 mt-2">Matches the sequence aspect ratio. Spans the In/Out range, or the whole edit — trim it on the timeline to target a transition, part of a clip, or the full edit.</p>
        </div>

        <div className="flex items-center justify-end gap-2 px-3 h-11 bg-[#0b0b18] border-t border-white/[0.06]">
          <button onClick={() => setOpen(false)} className="px-4 py-1 rounded-lg text-[11px] text-white/55 hover:text-white/85 border border-white/10">Cancel</button>
          <button onClick={create} className="px-4 py-1 rounded-lg text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white">OK</button>
        </div>
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-[11px] text-white/55">{label}:</span>
    {children}
  </div>
);

export default AdjustmentLayerDialog;
