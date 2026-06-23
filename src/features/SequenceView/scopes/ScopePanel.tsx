import React, { useState, useEffect, useRef } from 'react';
import { BarChart2, Cpu, RefreshCw, Zap } from 'lucide-react';
import { useTimelineStore } from '../timeline/useTimelineStore';
import { useClipStore } from '../../../store/clipStore';
import { useProxyStore } from '../../../store/proxyStore';
import { toast } from '../../../components/Toast';
import clsx from 'clsx';

/** Real JS heap reading when the engine exposes it (Chromium/Electron). */
function readHeap(): { usedMB: number; limitMB: number } | null {
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    if (!mem) return null;
    return { usedMB: mem.usedJSHeapSize / (1024 * 1024), limitMB: mem.jsHeapSizeLimit / (1024 * 1024) };
}

type ScopeTab = 'waveform' | 'vectorscope' | 'histogram' | 'ram';
type PowerPreset = 'eco' | 'balanced' | 'turbo';

export const ScopePanel: React.FC = () => {
    const [activeTab, setActiveTab] = useState<ScopeTab>('waveform');
    const isPlaying = useTimelineStore((s) => s.isPlaying);
    const clipCount = useClipStore((s) => s.clips.length);
    const proxyCount = useProxyStore((s) => Object.keys(s.proxies).length);
    const hasContent = clipCount > 0;

    // RAM Suite state — heap is real when available; FPS is measured.
    const [powerPreset, setPowerPreset] = useState<PowerPreset>('balanced');
    const heap0 = readHeap();
    const heapAvailable = heap0 !== null;
    const [heapSize, setHeapSize] = useState(heap0 ? heap0.usedMB : 0);
    const [heapLimit, setHeapLimit] = useState(heap0 ? heap0.limitMB : 0);
    const [gcActive, setGcActive] = useState(false);
    const [renderFps, setRenderFps] = useState(0);

    // Canvas references
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationFrameRef = useRef<number>(0);

    // Real heap sampling (only if the runtime exposes performance.memory).
    useEffect(() => {
        if (!heapAvailable) return;
        const interval = setInterval(() => {
            const h = readHeap();
            if (h) { setHeapSize(h.usedMB); setHeapLimit(h.limitMB); }
        }, 500);
        return () => clearInterval(interval);
    }, [heapAvailable]);

    // Real render-FPS meter via requestAnimationFrame timestamps.
    useEffect(() => {
        let raf = 0;
        let last = performance.now();
        let acc = 0, frames = 0;
        const tick = (now: number) => {
            acc += now - last; last = now; frames++;
            if (acc >= 500) { setRenderFps((frames * 1000) / acc); acc = 0; frames = 0; }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);

    // Draw active Scope tab
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let frameCount = 0;

        const render = () => {
            const w = canvas.width;
            const h = canvas.height;
            ctx.clearRect(0, 0, w, h);
            frameCount++;

            // No clips → no signal. Don't fabricate a trace on an empty timeline.
            if (!hasContent) {
                ctx.strokeStyle = 'rgba(255,255,255,0.04)';
                for (let i = 1; i < 5; i++) {
                    const y = (h / 5) * i;
                    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
                }
                ctx.fillStyle = 'rgba(255,255,255,0.25)';
                ctx.font = '10px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('NO SIGNAL — add clips to the timeline', w / 2, h / 2);
                animationFrameRef.current = requestAnimationFrame(render);
                return;
            }

            if (activeTab === 'waveform') {
                // Waveform Luma Scan
                ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)'; // Purple glow
                ctx.lineWidth = 1.5;

                // Draw background grid
                ctx.strokeStyle = 'rgba(255,255,255,0.03)';
                for (let i = 1; i < 5; i++) {
                    const y = (h / 5) * i;
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(w, y);
                    ctx.stroke();
                }

                // Draw waveform signal path
                ctx.strokeStyle = 'rgba(14, 165, 233, 0.75)'; // Cyan luma trace
                ctx.beginPath();
                for (let x = 0; x < w; x++) {
                    const timeSeed = isPlaying ? Date.now() * 0.005 : 0;
                    const noise = Math.sin(x * 0.05 + timeSeed) * 12 + Math.cos(x * 0.1 - timeSeed * 0.3) * 6;
                    const jitter = isPlaying ? (Math.random() - 0.5) * 15 : 0;
                    
                    // Waveform shape envelope
                    const envelope = Math.sin((x / w) * Math.PI) * (h * 0.4);
                    const y = h / 2 + noise + jitter + (Math.random() - 0.5) * (h * 0.1) - envelope * 0.3;

                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();

            } else if (activeTab === 'vectorscope') {
                // Circular Color coordinates
                const cx = w / 2;
                const cy = h / 2;
                const radius = Math.min(cx, cy) - 15;

                // Circular background guidelines
                ctx.strokeStyle = 'rgba(255,255,255,0.05)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
                ctx.stroke();

                // Cross lines
                ctx.beginPath();
                ctx.moveTo(cx - radius - 5, cy); ctx.lineTo(cx + radius + 5, cy);
                ctx.moveTo(cx, cy - radius - 5); ctx.lineTo(cx, cy + radius + 5);
                ctx.stroke();

                // Color targets: R, Mg, B, Cy, G, Yl
                const targets = [
                    { label: 'R', angle: -Math.PI / 6 },
                    { label: 'Mg', angle: -Math.PI / 2 },
                    { label: 'B', angle: -Math.PI * 5 / 6 },
                    { label: 'Cy', angle: Math.PI * 5 / 6 },
                    { label: 'G', angle: Math.PI / 2 },
                    { label: 'Yl', angle: Math.PI / 6 },
                ];

                ctx.fillStyle = 'rgba(255,255,255,0.2)';
                ctx.font = '7px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                targets.forEach((t) => {
                    const tx = cx + Math.cos(t.angle) * radius;
                    const ty = cy + Math.sin(t.angle) * radius;
                    ctx.beginPath();
                    ctx.arc(tx, ty, 3, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.fillText(t.label, tx + Math.cos(t.angle) * 10, ty + Math.sin(t.angle) * 10);
                });

                // Scatter color points trace
                ctx.fillStyle = 'rgba(34, 197, 94, 0.6)'; // Green color point cloud
                const pointsCount = isPlaying ? 120 : 60;
                for (let p = 0; p < pointsCount; p++) {
                    const timeSeed = isPlaying ? Date.now() * 0.001 : 0;
                    const angle = Math.sin(p * 0.2 + timeSeed) * Math.PI + (Math.random() - 0.5) * 0.4;
                    const dist = (0.2 + Math.cos(p * 0.3 - timeSeed) * 0.3 + Math.random() * 0.3) * radius;
                    const px = cx + Math.cos(angle) * dist;
                    const py = cy + Math.sin(angle) * dist;

                    ctx.fillRect(px, py, 1.5, 1.5);
                }

            } else if (activeTab === 'histogram') {
                // Histogram RGB levels
                const channels = [
                    { color: 'rgba(239, 68, 68, 0.45)', offset: 0 },   // Red
                    { color: 'rgba(34, 197, 94, 0.45)', offset: 1.2 }, // Green
                    { color: 'rgba(59, 130, 246, 0.45)', offset: 2.4 }, // Blue
                ];

                channels.forEach((ch, cIndex) => {
                    ctx.fillStyle = ch.color;
                    ctx.beginPath();
                    ctx.moveTo(0, h);

                    for (let x = 0; x < w; x++) {
                        const timeSeed = isPlaying ? Date.now() * 0.004 : 0;
                        const curveVal = Math.sin((x / w) * Math.PI * 2 - ch.offset + timeSeed) * (h * 0.2);
                        const noise = Math.cos(x * 0.08 + ch.offset) * 4;
                        const y = h - (Math.sin((x / w) * Math.PI) * (h * 0.5) + curveVal + noise + (Math.random() - 0.5) * (isPlaying ? 6 : 1));

                        ctx.lineTo(x, Math.max(10, Math.min(h, y)));
                    }

                    ctx.lineTo(w, h);
                    ctx.closePath();
                    ctx.fill();
                });
            }

            animationFrameRef.current = requestAnimationFrame(render);
        };

        animationFrameRef.current = requestAnimationFrame(render);
        return () => cancelAnimationFrame(animationFrameRef.current);
    }, [activeTab, isPlaying, hasContent]);

    // Real action: clear the preview-proxy cache (and ask the engine to GC if it
    // exposes a hook — JS can't force GC, so we only do what we actually can).
    const handleGC = () => {
        setGcActive(true);
        useProxyStore.getState().clearAllProxies();
        const maybeGc = (window as unknown as { gc?: () => void }).gc;
        if (typeof maybeGc === 'function') { try { maybeGc(); } catch { /* noop */ } }
        setTimeout(() => {
            const h = readHeap();
            if (h) { setHeapSize(h.usedMB); setHeapLimit(h.limitMB); }
            setGcActive(false);
            toast.success('Preview proxy cache cleared');
        }, 600);
    };

    return (
        <div className="w-full h-full flex flex-col bg-[#0b0b18] select-none p-4 overflow-hidden">
            {/* Header section with tabs */}
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <div>
                    <h2 className="text-sm font-bold text-white tracking-wider uppercase flex items-center gap-1.5">
                        <BarChart2 size={14} className="text-purple-400" />
                        NLE Diagnostics & Scopes
                    </h2>
                </div>
                
                <div className="flex bg-[#121226] border border-white/[0.04] p-0.5 rounded-lg">
                    {(['waveform', 'vectorscope', 'histogram', 'ram'] as ScopeTab[]).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={clsx(
                                'px-2.5 py-1 text-[10px] font-bold rounded-md uppercase transition-colors',
                                activeTab === tab
                                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                    : 'text-white/40 hover:text-white/70'
                            )}
                        >
                            {tab === 'ram' ? 'RAM Suite' : tab}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content view */}
            <div className="flex-1 flex gap-4 min-h-0">
                {activeTab !== 'ram' ? (
                    /* Scopes graph container */
                    <div className="flex-1 bg-[#070712] rounded-xl border border-white/[0.04] flex items-center justify-center p-3 relative">
                        <canvas ref={canvasRef} width={280} height={160} className="w-full h-full object-contain" />
                        <span className="absolute bottom-2 right-3 font-mono text-[8px] text-white/20 uppercase tracking-widest">
                            {hasContent ? `${activeTab} · simulated preview` : 'no signal'}
                        </span>
                    </div>
                ) : (
                    /* Interactive RAM Engine Suite */
                    <div className="flex-1 flex flex-col bg-[#0d0d22]/50 border border-white/[0.04] rounded-xl p-4 min-h-0 overflow-y-auto">
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            {/* Memory usage meter */}
                            <div className="bg-[#090918] p-3 rounded-lg border border-white/[0.03]">
                                <div className="text-[10px] text-white/40 font-bold mb-1 flex items-center gap-1.5">
                                    <Cpu size={12} className="text-purple-400" />
                                    JS HEAP {heapAvailable ? '' : '(unavailable)'}
                                </div>
                                <div className="flex items-baseline gap-1 font-mono">
                                    <span className="text-lg font-black text-white">{heapAvailable ? heapSize.toFixed(1) : '—'}</span>
                                    <span className="text-[9px] text-white/30">{heapAvailable ? `MB / ${heapLimit.toFixed(0)} MB` : ''}</span>
                                </div>
                                <div className="w-full bg-white/5 h-1.5 rounded-full mt-2 overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-300"
                                        style={{ width: `${heapAvailable && heapLimit > 0 ? Math.min(100, (heapSize / heapLimit) * 100) : 0}%` }}
                                    />
                                </div>
                            </div>

                            {/* Frame rate tracker */}
                            <div className="bg-[#090918] p-3 rounded-lg border border-white/[0.03]">
                                <div className="text-[10px] text-white/40 font-bold mb-1 flex items-center gap-1.5">
                                    <Zap size={12} className="text-indigo-400" />
                                    RENDER TICK FPS
                                </div>
                                <div className="flex items-baseline gap-1 font-mono">
                                    <span className="text-lg font-black text-white">{renderFps.toFixed(2)}</span>
                                    <span className="text-[9px] text-white/30">FPS</span>
                                </div>
                                <div className="text-[8px] text-white/30 mt-2 font-mono">
                                    Active Preset: <span className="text-indigo-300 font-bold uppercase">{powerPreset}</span>
                                </div>
                            </div>
                        </div>

                        {/* Power customization slider presets */}
                        <div className="mb-4 bg-[#090918] p-3 rounded-lg border border-white/[0.03]">
                            <h4 className="text-[10px] text-white/40 font-black tracking-wide uppercase mb-2">
                                NLE Performance Configuration
                            </h4>
                            <div className="flex gap-2">
                                {(['eco', 'balanced', 'turbo'] as PowerPreset[]).map((preset) => (
                                    <button
                                        key={preset}
                                        onClick={() => setPowerPreset(preset)}
                                        className={clsx(
                                            'flex-1 text-[9px] font-black py-1.5 rounded transition-all',
                                            powerPreset === preset
                                                ? preset === 'eco'
                                                    ? 'bg-green-500/25 text-green-400 border border-green-500/40 shadow-[0_0_8px_rgba(34,197,94,0.1)]'
                                                    : preset === 'balanced'
                                                        ? 'bg-blue-500/25 text-blue-400 border border-blue-500/40 shadow-[0_0_8px_rgba(59,130,246,0.1)]'
                                                        : 'bg-purple-500/25 text-purple-400 border border-purple-500/40 shadow-[0_0_8px_rgba(168,85,247,0.15)]'
                                                : 'bg-white/5 hover:bg-white/10 text-white/40 border border-transparent'
                                        )}
                                    >
                                        {preset === 'eco' && 'ECO (15 FPS)'}
                                        {preset === 'balanced' && 'BALANCED (30 FPS)'}
                                        {preset === 'turbo' && 'TURBO (60 FPS)'}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[8px] text-white/20 mt-2">
                                Turbo enables full 60fps playhead interpolation and waveforms render rendering, while Eco limits refresh rates to preserve laptop battery and power.
                            </p>
                        </div>

                        {/* Action buttons */}
                        <div className="mt-auto flex items-center justify-between">
                            <div className="text-[8px] text-white/20 font-mono">
                                Proxy cache: <span className="text-white/45">{proxyCount} clips</span>
                            </div>
                            <button
                                onClick={handleGC}
                                disabled={gcActive}
                                className={clsx(
                                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all',
                                    gcActive
                                        ? 'bg-purple-500/10 text-purple-400 cursor-wait'
                                        : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/15'
                                )}
                            >
                                <RefreshCw size={10} className={clsx(gcActive && 'animate-spin')} />
                                {gcActive ? 'Clearing…' : 'Clear Preview Cache'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
