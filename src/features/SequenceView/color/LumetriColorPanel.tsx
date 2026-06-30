// ══════════════════════════════════════════════════════════════════════════════
// LumetriColorPanel — a Lumetri-style Color panel (Basic Correction + Color
// Wheels) editing clip.colorGrading, which already renders 1:1 in the export
// pipeline (buildColorGradingFilter) on both the internal engine and Ender.
// ══════════════════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Palette, RotateCcw, Droplet } from 'lucide-react';
import clsx from 'clsx';
import { useClipStore, type Clip } from '../../../store/clipStore';
import { DEFAULT_COLOR_GRADING, type ColorGrading } from '../../../lib/colorGrading';

interface SliderDef { key: keyof ColorGrading; label: string; min: number; max: number; step: number; def: number }

const BASIC: SliderDef[] = [
  { key: 'temperature', label: 'Temperature', min: -100, max: 100, step: 1, def: 0 },
  { key: 'tint', label: 'Tint', min: -100, max: 100, step: 1, def: 0 },
  { key: 'exposure', label: 'Exposure', min: -2, max: 2, step: 0.01, def: 0 },
  { key: 'contrast', label: 'Contrast', min: 0.5, max: 2, step: 0.01, def: 1 },
  { key: 'highlights', label: 'Highlights', min: -100, max: 100, step: 1, def: 0 },
  { key: 'shadows', label: 'Shadows', min: -100, max: 100, step: 1, def: 0 },
  { key: 'saturation', label: 'Saturation', min: 0, max: 2, step: 0.01, def: 1 },
  { key: 'vibrance', label: 'Vibrance', min: 0, max: 2, step: 0.01, def: 1 },
];

const WHEELS: Array<{ key: 'lift' | 'gamma' | 'gain'; label: string; min: number; max: number; def: number }> = [
  { key: 'lift', label: 'Lift (Shadows)', min: -1, max: 1, def: 0 },
  { key: 'gamma', label: 'Gamma (Midtones)', min: 0.1, max: 3, def: 1 },
  { key: 'gain', label: 'Gain (Highlights)', min: -1, max: 1, def: 0 },
];

const Section: React.FC<{ title: string; icon: React.ReactNode; open: boolean; onToggle: () => void; children: React.ReactNode }> = ({ title, icon, open, onToggle, children }) => (
  <div className="border-b border-white/[0.05]">
    <button onClick={onToggle} className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-white/[0.03]">
      {open ? <ChevronDown size={11} className="text-white/30" /> : <ChevronRight size={11} className="text-white/30" />}
      <span className="text-amber-300/70">{icon}</span>
      <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-white/50">{title}</span>
    </button>
    {open && <div className="px-3 pb-2 space-y-1.5">{children}</div>}
  </div>
);

const Slider: React.FC<{ label: string; value: number; min: number; max: number; step: number; def: number; onChange: (v: number) => void }> = ({ label, value, min, max, step, def, onChange }) => (
  <div className="flex flex-col gap-0.5">
    <div className="flex items-center justify-between text-[9px]">
      <span className="text-white/45">{label}</span>
      <span className="text-indigo-300 font-mono tabular-nums">{step < 1 ? value.toFixed(2) : value.toFixed(0)}</span>
    </div>
    <input
      type="range" min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      onDoubleClick={() => onChange(def)}
      className="w-full h-1 bg-[#121226] rounded-full cursor-pointer appearance-none accent-amber-500"
      title="Double-click to reset"
    />
  </div>
);

export const LumetriColorPanel: React.FC = () => {
  const clips = useClipStore((s) => s.clips);
  const selectedClipIds = useClipStore((s) => s.selectedClipIds);
  const updateClip = useClipStore((s) => s.updateClip);
  const clip = clips.find((c) => c.id === selectedClipIds[0]);

  const [open, setOpen] = useState<Record<string, boolean>>({ basic: true, wheels: false });
  const g: ColorGrading = { ...DEFAULT_COLOR_GRADING, ...(clip?.colorGrading ?? {}) };

  const setField = (patch: Partial<ColorGrading>) => {
    if (!clip) return;
    updateClip(clip.id, { colorGrading: { ...g, ...patch } } as Partial<Clip>);
  };
  const setWheel = (key: 'lift' | 'gamma' | 'gain', idx: number, value: number) => {
    const def: [number, number, number] = key === 'gamma' ? [1, 1, 1] : [0, 0, 0];
    const cur = (g[key] as [number, number, number] | undefined) ?? def;
    const next: [number, number, number] = [...cur] as [number, number, number];
    next[idx] = value;
    setField({ [key]: next } as Partial<ColorGrading>);
  };

  if (!clip) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center text-white/25 px-6">
        <Palette size={26} className="mb-2 text-amber-300/60" />
        <p className="text-[11px] font-semibold text-white/40">Lumetri Color</p>
        <p className="text-[9px] mt-1 max-w-[200px]">Select a clip to grade. Adjustments render in the export.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0b0b18] overflow-hidden">
      <div className="flex items-center justify-between px-3 h-7 bg-[#0e0e1c] border-b border-white/[0.06] flex-shrink-0">
        <span className="text-[10px] font-semibold text-white/70 flex items-center gap-1.5"><Palette size={12} className="text-amber-300" /> Lumetri Color</span>
        <button onClick={() => setField({ ...DEFAULT_COLOR_GRADING })} className="text-white/30 hover:text-amber-300" title="Reset grade"><RotateCcw size={12} /></button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <Section title="Basic Correction" icon={<Droplet size={11} />} open={open.basic} onToggle={() => setOpen((o) => ({ ...o, basic: !o.basic }))}>
          {BASIC.map((s) => (
            <Slider key={s.key} label={s.label} value={(g[s.key] as number) ?? s.def} min={s.min} max={s.max} step={s.step} def={s.def}
              onChange={(v) => setField({ [s.key]: v } as Partial<ColorGrading>)} />
          ))}
        </Section>
        <Section title="Color Wheels (Lift / Gamma / Gain)" icon={<Palette size={11} />} open={open.wheels} onToggle={() => setOpen((o) => ({ ...o, wheels: !o.wheels }))}>
          {WHEELS.map((w) => {
            const def: [number, number, number] = w.key === 'gamma' ? [1, 1, 1] : [0, 0, 0];
            const cur = (g[w.key] as [number, number, number] | undefined) ?? def;
            return (
              <div key={w.key} className="space-y-1">
                <div className="text-[9px] text-white/40 font-semibold mt-1">{w.label}</div>
                {(['R', 'G', 'B'] as const).map((ch, i) => (
                  <Slider key={ch} label={ch} value={cur[i]} min={w.min} max={w.max} step={0.01} def={w.def}
                    onChange={(v) => setWheel(w.key, i, v)} />
                ))}
              </div>
            );
          })}
        </Section>
      </div>
    </div>
  );
};

export default LumetriColorPanel;
