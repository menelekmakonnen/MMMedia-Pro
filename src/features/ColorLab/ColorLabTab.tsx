import React, { useState, useEffect, useCallback } from 'react';
import { useClipStore } from '../../store/clipStore';
import { DEFAULT_COLOR_GRADING, ColorGrading } from '../../lib/colorGrading';
import { toast } from '../../components/Toast';
import { Palette, Upload, RotateCcw, Activity } from 'lucide-react';

const w = (typeof window !== 'undefined' ? (window as any) : {}) as any;

type TriadKey = 'lift' | 'gamma' | 'gain';
const TRIADS: { key: TriadKey; label: string; min: number; max: number; neutral: number }[] = [
    { key: 'lift', label: 'Lift (Shadows)', min: -1, max: 1, neutral: 0 },
    { key: 'gamma', label: 'Gamma (Midtones)', min: 0.1, max: 3, neutral: 1 },
    { key: 'gain', label: 'Gain (Highlights)', min: -1, max: 1, neutral: 0 },
];
const CH = [
    { i: 0, name: 'R', accent: 'accent-red-500' },
    { i: 1, name: 'G', accent: 'accent-green-500' },
    { i: 2, name: 'B', accent: 'accent-blue-500' },
];

const Slider: React.FC<{ label: string; value: number; min: number; max: number; step?: number; accent?: string; onChange: (v: number) => void; fmt?: (v: number) => string }>
    = ({ label, value, min, max, step = 0.01, accent = 'accent-purple-500', onChange, fmt }) => (
    <div className="flex items-center gap-2">
        <label className="text-[10px] text-white/45 w-12 shrink-0">{label}</label>
        <input type="range" min={min} max={max} step={step} value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className={`flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer ${accent}`} />
        <span className="text-[10px] text-white/50 font-mono w-10 text-right">{fmt ? fmt(value) : value.toFixed(2)}</span>
    </div>
);

export const ColorLabTab: React.FC = () => {
    const { clips } = useClipStore();
    const gradeable = clips.filter((c) => c.type === 'video' || c.type === 'image');
    const [selId, setSelId] = useState<string>('');
    const clip = gradeable.find((c) => c.id === selId) || gradeable[0];
    const grading: ColorGrading = { ...DEFAULT_COLOR_GRADING, ...((clip?.colorGrading as any) || {}) };

    const [luts, setLuts] = useState<Array<{ name: string; path: string }>>([]);
    const [scopes, setScopes] = useState<Record<string, string>>({});
    const [scopeBusy, setScopeBusy] = useState(false);

    const refreshLuts = useCallback(async () => {
        try { const r = await w.ipcRenderer?.listLuts(); if (r?.success) setLuts(r.luts || []); } catch { /* noop */ }
    }, []);
    useEffect(() => { refreshLuts(); }, [refreshLuts]);
    useEffect(() => { if (clip && !selId) setSelId(clip.id); }, [clip, selId]);

    const update = (patch: Partial<ColorGrading>) => {
        if (!clip) return;
        useClipStore.getState().updateClip(clip.id, { colorGrading: { ...grading, ...patch } as any });
    };
    const triadVal = (key: TriadKey): [number, number, number] => {
        const def = key === 'gamma' ? [1, 1, 1] : [0, 0, 0];
        return ((grading as any)[key] as [number, number, number]) || (def as [number, number, number]);
    };
    const setTriad = (key: TriadKey, idx: number, val: number) => {
        const next = [...triadVal(key)] as [number, number, number];
        next[idx] = val;
        update({ [key]: next } as any);
    };
    const resetTriad = (key: TriadKey, neutral: number) => update({ [key]: [neutral, neutral, neutral] } as any);

    const genScopes = useCallback(async () => {
        if (!clip?.path) { toast.error('Select a clip with a source file'); return; }
        setScopeBusy(true);
        try {
            const r = await w.ipcRenderer?.generateScopes({ path: clip.path, atSec: 0 });
            if (r?.success) setScopes(r.scopes || {}); else toast.error(r?.error || 'Scope generation failed');
        } catch (e: any) { toast.error(e?.message || 'Scope generation failed'); }
        finally { setScopeBusy(false); }
    }, [clip?.path]);

    const importLut = useCallback(async () => {
        try {
            const r = await w.ipcRenderer?.importLut();
            if (r?.success) { toast.success(`Imported ${r.name}`); await refreshLuts(); if (clip) update({ lutFile: r.path }); }
            else if (!r?.canceled) toast.error(r?.error || 'Import failed');
        } catch (e: any) { toast.error(e?.message || 'Import failed'); }
    }, [clip, grading]);

    const card = 'bg-black/40 border border-white/10 rounded-xl p-4';
    const h = 'text-[11px] font-semibold text-white/55 uppercase tracking-widest mb-3 flex items-center gap-2';

    return (
        <div className="h-full overflow-y-auto p-6 text-white">
            <div className="max-w-5xl mx-auto space-y-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Palette size={20} className="text-purple-400" />
                        <h1 className="text-lg font-bold">Color Lab</h1>
                    </div>
                    <select
                        value={clip?.id || ''}
                        onChange={(e) => setSelId(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/80 outline-none"
                    >
                        {gradeable.length === 0 && <option value="">No clips</option>}
                        {gradeable.map((c) => <option key={c.id} value={c.id}>{c.filename}</option>)}
                    </select>
                </div>

                {!clip ? (
                    <div className={`${card} text-center text-white/40 py-12`}>Add clips on the Timeline to start grading.</div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {/* Color Wheels */}
                        <div className={card}>
                            <div className={h}><Palette size={13} /> Color Wheels</div>
                            <div className="space-y-4">
                                {TRIADS.map((t) => (
                                    <div key={t.key}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[10px] uppercase tracking-wider text-white/35 font-semibold">{t.label}</span>
                                            <button onClick={() => resetTriad(t.key, t.neutral)} className="text-white/30 hover:text-white/60" title="Reset"><RotateCcw size={11} /></button>
                                        </div>
                                        <div className="space-y-1.5">
                                            {CH.map((c) => (
                                                <Slider key={c.i} label={c.name} accent={c.accent} min={t.min} max={t.max}
                                                    value={triadVal(t.key)[c.i]} onChange={(v) => setTriad(t.key, c.i, v)} />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Basic grade + LUT */}
                        <div className="space-y-5">
                            <div className={card}>
                                <div className={h}>Basic Grade</div>
                                <div className="space-y-1.5">
                                    <Slider label="Temp" min={-100} max={100} step={1} value={grading.temperature} onChange={(v) => update({ temperature: v })} fmt={(v) => v.toFixed(0)} />
                                    <Slider label="Tint" min={-100} max={100} step={1} value={grading.tint} onChange={(v) => update({ tint: v })} fmt={(v) => v.toFixed(0)} />
                                    <Slider label="Expo" min={-2} max={2} value={grading.exposure} onChange={(v) => update({ exposure: v })} />
                                    <Slider label="Contr" min={0.5} max={2} value={grading.contrast} onChange={(v) => update({ contrast: v })} />
                                    <Slider label="Sat" min={0} max={2} value={grading.saturation} onChange={(v) => update({ saturation: v })} />
                                </div>
                            </div>

                            <div className={card}>
                                <div className={h}>
                                    LUT Library
                                    <button onClick={importLut} className="ml-auto flex items-center gap-1 text-[10px] text-purple-300 hover:text-purple-200"><Upload size={11} /> Import .cube</button>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    <button onClick={() => update({ lutFile: undefined })}
                                        className={`text-[10px] px-2.5 py-1 rounded-md border ${!grading.lutFile ? 'bg-purple-500/25 text-purple-200 border-purple-500/40' : 'bg-white/5 text-white/55 border-transparent hover:bg-white/10'}`}>None</button>
                                    {luts.map((l) => (
                                        <button key={l.path} onClick={() => update({ lutFile: l.path })}
                                            className={`text-[10px] px-2.5 py-1 rounded-md border ${grading.lutFile === l.path ? 'bg-purple-500/25 text-purple-200 border-purple-500/40' : 'bg-white/5 text-white/55 border-transparent hover:bg-white/10'}`}>{l.name.replace(/\.cube$/i, '')}</button>
                                    ))}
                                    {luts.length === 0 && <span className="text-[10px] text-white/30">No LUTs yet — import a .cube file.</span>}
                                </div>
                            </div>
                        </div>

                        {/* Scopes */}
                        <div className={`${card} lg:col-span-2`}>
                            <div className={h}>
                                <Activity size={13} /> Scopes
                                <button onClick={genScopes} disabled={scopeBusy} className="ml-auto text-[10px] text-purple-300 hover:text-purple-200 disabled:opacity-40">{scopeBusy ? 'Generating…' : 'Generate from clip'}</button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {(['waveform', 'vectorscope', 'histogram'] as const).map((k) => (
                                    <div key={k} className="bg-black/50 rounded-lg p-2 border border-white/5">
                                        <div className="text-[9px] uppercase tracking-widest text-white/35 mb-1">{k}</div>
                                        {scopes[k]
                                            ? <img src={scopes[k]} alt={k} className="w-full rounded" />
                                            : <div className="aspect-video flex items-center justify-center text-white/20 text-[10px]">—</div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
