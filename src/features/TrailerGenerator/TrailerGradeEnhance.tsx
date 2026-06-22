import React, { useState, useEffect, useCallback } from 'react';
import { DEFAULT_COLOR_GRADING, ColorGrading } from '../../lib/colorGrading';
import type { TrailerSettings } from '../../lib/trailerGenerator';
import { toast } from '../../components/Toast';
import { Upload } from 'lucide-react';

const w = (typeof window !== 'undefined' ? (window as any) : {}) as any;

interface Props { settings: TrailerSettings; update: (patch: Partial<TrailerSettings>) => void; }

const ENHANCERS: { id: string; label: string; params: Record<string, number> }[] = [
    { id: 'exposure', label: 'Exposure', params: { ev: 0.3 } },
    { id: 'vibrance', label: 'Vibrance', params: { amt: 0.6 } },
    { id: 'deflicker', label: 'Deflicker', params: {} },
    { id: 'deband', label: 'Deband', params: {} },
    { id: 'denoise', label: 'Denoise', params: {} },
    { id: 'edge_detect', label: 'Edge Detect', params: {} },
];
const TRIADS: { key: 'lift' | 'gamma' | 'gain'; label: string; min: number; max: number; neutral: number }[] = [
    { key: 'lift', label: 'Lift', min: -1, max: 1, neutral: 0 },
    { key: 'gamma', label: 'Gamma', min: 0.1, max: 3, neutral: 1 },
    { key: 'gain', label: 'Gain', min: -1, max: 1, neutral: 0 },
];
const CH = [{ i: 0, n: 'R', a: 'accent-red-500' }, { i: 1, n: 'G', a: 'accent-green-500' }, { i: 2, n: 'B', a: 'accent-blue-500' }];

const Row: React.FC<{ label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }>
    = ({ label, value, min, max, step, onChange }) => (
    <div className="flex items-center gap-2">
        <span className="text-[10px] text-white/45 w-16 shrink-0">{label}</span>
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))}
            className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary" />
        <span className="text-[10px] text-white/40 font-mono w-9 text-right">{value.toFixed(2)}</span>
    </div>
);
const Toggle: React.FC<{ label: string; on: boolean; onChange: (v: boolean) => void }> = ({ label, on, onChange }) => (
    <label className="flex items-center justify-between cursor-pointer py-0.5">
        <span className="text-[10px] font-bold uppercase text-white/50">{label}</span>
        <div className="relative">
            <input type="checkbox" className="sr-only" checked={on} onChange={(e) => onChange(e.target.checked)} />
            <div className={`w-9 h-5 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-black border border-white/20'}`}>
                <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
        </div>
    </label>
);

/** Trailer-wide color grade + LUT + enhance effects + audio dynamics. */
export const TrailerGradeEnhance: React.FC<Props> = ({ settings, update }) => {
    const grade: ColorGrading = { ...DEFAULT_COLOR_GRADING, ...((settings.globalColorGrading as any) || {}) };
    const effects = settings.globalEffects || [];
    const [luts, setLuts] = useState<Array<{ name: string; path: string }>>([]);

    const refreshLuts = useCallback(async () => {
        try { const r = await w.ipcRenderer?.listLuts(); if (r?.success) setLuts(r.luts || []); } catch { /* noop */ }
    }, []);
    useEffect(() => { refreshLuts(); }, [refreshLuts]);

    const setGrade = (patch: Partial<ColorGrading>) => update({ globalColorGrading: { ...grade, ...patch } as any });
    const triad = (k: 'lift' | 'gamma' | 'gain'): [number, number, number] =>
        ((grade as any)[k] as [number, number, number]) || (k === 'gamma' ? [1, 1, 1] : [0, 0, 0]);
    const setTriad = (k: 'lift' | 'gamma' | 'gain', idx: number, v: number) => {
        const next = [...triad(k)] as [number, number, number]; next[idx] = v; setGrade({ [k]: next } as any);
    };
    const effOn = (id: string) => effects.some((e) => e.effectId === id);
    const toggleEff = (id: string, params: Record<string, number>) => {
        if (effOn(id)) update({ globalEffects: effects.filter((e) => e.effectId !== id) });
        else update({ globalEffects: [...effects, { effectId: id, params }] });
    };
    const importLut = async () => {
        try {
            const r = await w.ipcRenderer?.importLut();
            if (r?.success) { toast.success(`Imported ${r.name}`); await refreshLuts(); setGrade({ lutFile: r.path }); }
            else if (!r?.canceled) toast.error(r?.error || 'Import failed');
        } catch (e: any) { toast.error(e?.message || 'Import failed'); }
    };

    const head = 'text-[10px] uppercase tracking-widest text-white/35 font-semibold pt-2 pb-1 border-t border-white/5 first:border-t-0 first:pt-0 flex items-center gap-2';

    return (
        <div className="border border-white/5 rounded-xl bg-black/20 p-5 space-y-1">
            <span className="text-sm font-bold text-white flex items-center gap-2 pb-1">🎨 Grade &amp; Enhance</span>

            <div className={head}>Color Grade</div>
            <Row label="Temp" min={-100} max={100} step={1} value={grade.temperature} onChange={(v) => setGrade({ temperature: v })} />
            <Row label="Exposure" min={-2} max={2} step={0.05} value={grade.exposure} onChange={(v) => setGrade({ exposure: v })} />
            <Row label="Contrast" min={0.5} max={2} step={0.05} value={grade.contrast} onChange={(v) => setGrade({ contrast: v })} />
            <Row label="Saturation" min={0} max={2} step={0.05} value={grade.saturation} onChange={(v) => setGrade({ saturation: v })} />

            <div className={head}>Color Wheels</div>
            <div className="grid grid-cols-3 gap-2">
                {TRIADS.map((t) => (
                    <div key={t.key} className="bg-black/30 rounded-md p-1.5">
                        <span className="text-[9px] uppercase tracking-wider text-white/40">{t.label}</span>
                        {CH.map((c) => (
                            <input key={c.i} type="range" min={t.min} max={t.max} step={0.01} value={triad(t.key)[c.i]}
                                onChange={(e) => setTriad(t.key, c.i, parseFloat(e.target.value))}
                                className={`w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer ${c.a} mb-1 mt-1`} title={`${t.label} ${c.n}`} />
                        ))}
                    </div>
                ))}
            </div>

            <div className={head}>LUT<button onClick={importLut} className="ml-auto flex items-center gap-1 text-[10px] text-primary hover:brightness-125"><Upload size={10} /> Import</button></div>
            <div className="flex flex-wrap gap-1">
                <button onClick={() => setGrade({ lutFile: undefined })}
                    className={`text-[10px] px-2 py-0.5 rounded border ${!grade.lutFile ? 'bg-primary/25 text-white border-primary/40' : 'bg-white/5 text-white/55 border-transparent hover:bg-white/10'}`}>None</button>
                {luts.map((l) => (
                    <button key={l.path} onClick={() => setGrade({ lutFile: l.path })}
                        className={`text-[10px] px-2 py-0.5 rounded border ${grade.lutFile === l.path ? 'bg-primary/25 text-white border-primary/40' : 'bg-white/5 text-white/55 border-transparent hover:bg-white/10'}`}>{l.name.replace(/\.cube$/i, '')}</button>
                ))}
                {luts.length === 0 && <span className="text-[10px] text-white/25">Import a .cube file</span>}
            </div>

            <div className={head}>Enhance (applied to all clips)</div>
            <div className="grid grid-cols-2 gap-x-3">
                {ENHANCERS.map((e) => <Toggle key={e.id} label={e.label} on={effOn(e.id)} onChange={() => toggleEff(e.id, e.params)} />)}
            </div>

        </div>
    );
};
