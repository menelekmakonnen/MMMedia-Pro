import React, { useState, useEffect, useCallback } from 'react';
import { useClipStore } from '../../store/clipStore';
import { DEFAULT_COLOR_GRADING, ColorGrading } from '../../lib/colorGrading';
import { toast } from '../../components/Toast';
import { Upload, Activity, RotateCcw } from 'lucide-react';

const w = (typeof window !== 'undefined' ? (window as any) : {}) as any;

type TriadKey = 'lift' | 'gamma' | 'gain';
const TRIADS: { key: TriadKey; label: string; min: number; max: number; neutral: number }[] = [
    { key: 'lift', label: 'Lift', min: -1, max: 1, neutral: 0 },
    { key: 'gamma', label: 'Gamma', min: 0.1, max: 3, neutral: 1 },
    { key: 'gain', label: 'Gain', min: -1, max: 1, neutral: 0 },
];
const CH = [{ i: 0, n: 'R', a: 'accent-red-500' }, { i: 1, n: 'G', a: 'accent-green-500' }, { i: 2, n: 'B', a: 'accent-blue-500' }];

/** Premiere-style color wheels + LUT library + scopes for a single clip.
 *  Folds the former Color Lab page into a reusable inspector panel. */
export const ColorLabPanel: React.FC<{ clipId: string }> = ({ clipId }) => {
    const clip = useClipStore((s) => s.clips.find((c) => c.id === clipId));
    const grading: ColorGrading = { ...DEFAULT_COLOR_GRADING, ...((clip?.colorGrading as any) || {}) };
    const [luts, setLuts] = useState<Array<{ name: string; path: string }>>([]);
    const [scopes, setScopes] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);

    const refreshLuts = useCallback(async () => {
        try { const r = await w.ipcRenderer?.listLuts(); if (r?.success) setLuts(r.luts || []); } catch { /* noop */ }
    }, []);
    useEffect(() => { refreshLuts(); }, [refreshLuts]);

    if (!clip) return null;

    const update = (patch: Partial<ColorGrading>) =>
        useClipStore.getState().updateClip(clipId, { colorGrading: { ...grading, ...patch } as any });
    const triad = (k: TriadKey): [number, number, number] =>
        ((grading as any)[k] as [number, number, number]) || (k === 'gamma' ? [1, 1, 1] : [0, 0, 0]);
    const setTriad = (k: TriadKey, idx: number, v: number) => {
        const next = [...triad(k)] as [number, number, number]; next[idx] = v; update({ [k]: next } as any);
    };

    const genScopes = async () => {
        if (!clip.path) { toast.error('Clip has no source file'); return; }
        setBusy(true);
        try {
            const r = await w.ipcRenderer?.generateScopes({ path: clip.path, atSec: 0 });
            if (r?.success) setScopes(r.scopes || {}); else toast.error(r?.error || 'Scope generation failed');
        } catch (e: any) { toast.error(e?.message || 'Scope generation failed'); }
        finally { setBusy(false); }
    };
    const importLut = async () => {
        try {
            const r = await w.ipcRenderer?.importLut();
            if (r?.success) { toast.success(`Imported ${r.name}`); await refreshLuts(); update({ lutFile: r.path }); }
            else if (!r?.canceled) toast.error(r?.error || 'Import failed');
        } catch (e: any) { toast.error(e?.message || 'Import failed'); }
    };

    const head = 'text-[10px] uppercase tracking-wider text-white/30 font-semibold pt-2 pb-1 border-t border-white/5 flex items-center gap-2';

    return (
        <div className="space-y-1 mt-2">
            {/* Color Wheels */}
            <div className={head}>Color Wheels</div>
            <div className="grid grid-cols-3 gap-2">
                {TRIADS.map((t) => (
                    <div key={t.key} className="bg-black/30 rounded-md p-1.5">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] uppercase tracking-wider text-white/40">{t.label}</span>
                            <button onClick={() => update({ [t.key]: [t.neutral, t.neutral, t.neutral] } as any)} className="text-white/25 hover:text-white/60"><RotateCcw size={9} /></button>
                        </div>
                        {CH.map((c) => (
                            <input key={c.i} type="range" min={t.min} max={t.max} step={0.01} value={triad(t.key)[c.i]}
                                onChange={(e) => setTriad(t.key, c.i, parseFloat(e.target.value))}
                                className={`w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer ${c.a} mb-1`} title={`${t.label} ${c.n}`} />
                        ))}
                    </div>
                ))}
            </div>

            {/* LUT Library */}
            <div className={head}>LUT Library
                <button onClick={importLut} className="ml-auto flex items-center gap-1 text-[10px] text-purple-300 hover:text-purple-200"><Upload size={10} /> Import</button>
            </div>
            <div className="flex flex-wrap gap-1">
                <button onClick={() => update({ lutFile: undefined })}
                    className={`text-[10px] px-2 py-0.5 rounded border ${!grading.lutFile ? 'bg-purple-500/25 text-purple-200 border-purple-500/40' : 'bg-white/5 text-white/55 border-transparent hover:bg-white/10'}`}>None</button>
                {luts.map((l) => (
                    <button key={l.path} onClick={() => update({ lutFile: l.path })}
                        className={`text-[10px] px-2 py-0.5 rounded border ${grading.lutFile === l.path ? 'bg-purple-500/25 text-purple-200 border-purple-500/40' : 'bg-white/5 text-white/55 border-transparent hover:bg-white/10'}`}>{l.name.replace(/\.cube$/i, '')}</button>
                ))}
                {luts.length === 0 && <span className="text-[10px] text-white/25">Import a .cube file</span>}
            </div>

            {/* Scopes */}
            <div className={head}><Activity size={11} /> Scopes
                <button onClick={genScopes} disabled={busy} className="ml-auto text-[10px] text-purple-300 hover:text-purple-200 disabled:opacity-40">{busy ? 'Generating…' : 'Generate'}</button>
            </div>
            <div className="grid grid-cols-3 gap-1">
                {(['waveform', 'vectorscope', 'histogram'] as const).map((k) => (
                    <div key={k} className="bg-black/40 rounded p-1 border border-white/5">
                        <div className="text-[8px] uppercase tracking-widest text-white/30 mb-0.5">{k.slice(0, 4)}</div>
                        {scopes[k] ? <img src={scopes[k]} alt={k} className="w-full rounded" /> : <div className="aspect-video flex items-center justify-center text-white/15 text-[9px]">—</div>}
                    </div>
                ))}
            </div>
        </div>
    );
};
