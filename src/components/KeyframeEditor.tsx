import React, { useRef, useState, useEffect } from 'react';
import { kfValue, KfPoint, Interp } from '../lib/keyframes';

interface Props {
    points: KfPoint[];
    min: number;
    max: number;
    durationFrames: number;
    onChange: (pts: KfPoint[]) => void;
    height?: number;
    accent?: string;
}

const VW = 280;

/** Interactive SVG keyframe graph editor (drag to move, click to add, right-click
 *  to delete, cycle per-point interpolation). Renders the actual evaluated curve
 *  via kfValue so bezier/eased segments display accurately. */
export const KeyframeEditor: React.FC<Props> = ({ points, min, max, durationFrames, onChange, height = 110, accent = '#a78bfa' }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [sel, setSel] = useState<number | null>(null);
    const [drag, setDrag] = useState<number | null>(null);
    const H = height;
    const pad = 8;
    const dur = Math.max(1, durationFrames);

    const toX = (f: number) => pad + (f / dur) * (VW - 2 * pad);
    const toY = (v: number) => pad + (1 - (v - min) / (max - min)) * (H - 2 * pad);
    const fromX = (x: number) => Math.max(0, Math.min(dur, ((x - pad) / (VW - 2 * pad)) * dur));
    const fromY = (y: number) => Math.max(min, Math.min(max, min + (1 - (y - pad) / (H - 2 * pad)) * (max - min)));

    const sorted = [...points].sort((a, b) => a.frame - b.frame);

    const svgPos = (e: { clientX: number; clientY: number }) => {
        const r = svgRef.current!.getBoundingClientRect();
        return { x: (e.clientX - r.left) * (VW / r.width), y: (e.clientY - r.top) * (H / r.height) };
    };

    useEffect(() => {
        if (drag === null) return;
        const move = (e: MouseEvent) => {
            const { x, y } = svgPos(e);
            const s = [...points].sort((a, b) => a.frame - b.frame);
            if (!s[drag]) return;
            s[drag] = { ...s[drag], frame: Math.round(fromX(x)), value: parseFloat(fromY(y).toFixed(3)) };
            onChange(s);
        };
        const up = () => setDrag(null);
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    }, [drag, points]); // eslint-disable-line react-hooks/exhaustive-deps

    const curve = (() => {
        if (sorted.length === 0) return '';
        const segs: string[] = [];
        const N = 64;
        for (let i = 0; i <= N; i++) { const f = (i / N) * dur; segs.push(`${toX(f).toFixed(1)},${toY(kfValue(sorted, f)).toFixed(1)}`); }
        return 'M' + segs.join(' L');
    })();

    const addPoint = (e: React.MouseEvent) => {
        const { x, y } = svgPos(e);
        const np: KfPoint = { frame: Math.round(fromX(x)), value: parseFloat(fromY(y).toFixed(3)), interp: 'linear' };
        onChange([...points, np].sort((a, b) => a.frame - b.frame));
    };
    const cycleInterp = () => {
        if (sel === null) return;
        const order: Interp[] = ['linear', 'bezier', 'constant'];
        const s = [...points].sort((a, b) => a.frame - b.frame);
        if (!s[sel]) return;
        const cur = s[sel].interp || 'linear';
        s[sel] = { ...s[sel], interp: order[(order.indexOf(cur) + 1) % order.length] };
        onChange(s);
    };

    return (
        <div>
            <svg ref={svgRef} viewBox={`0 0 ${VW} ${H}`} style={{ height }}
                className="w-full bg-black/40 rounded-md border border-white/10 cursor-crosshair"
                onMouseDown={addPoint}>
                <line x1={pad} y1={toY((min + max) / 2)} x2={VW - pad} y2={toY((min + max) / 2)} stroke="rgba(255,255,255,0.07)" />
                <path d={curve} fill="none" stroke={accent} strokeWidth={1.5} />
                {sorted.map((p, i) => (
                    <circle key={i} cx={toX(p.frame)} cy={toY(p.value)} r={sel === i ? 5 : 4}
                        fill={sel === i ? accent : '#fff'} stroke={accent} strokeWidth={1} style={{ cursor: 'grab' }}
                        onMouseDown={(e) => { e.stopPropagation(); setSel(i); setDrag(i); }}
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); const s = [...points].sort((a, b) => a.frame - b.frame); s.splice(i, 1); setSel(null); onChange(s); }} />
                ))}
            </svg>
            <div className="flex items-center justify-between mt-1">
                <span className="text-[9px] text-white/30">click add · drag move · right-click delete</span>
                <button onClick={cycleInterp} disabled={sel === null}
                    className="text-[9px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-white/50 disabled:opacity-30">
                    {sel !== null ? `Interp: ${sorted[sel]?.interp || 'linear'}` : 'Interp'}
                </button>
            </div>
        </div>
    );
};
