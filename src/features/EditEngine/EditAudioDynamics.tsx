import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { SlidersHorizontal, Wand2 } from 'lucide-react';
import { DEFAULT_AUDIO_EFFECTS, AudioEffects } from '../../lib/audioEffects';
import type { TrailerSettings } from '../../lib/trailerGenerator';

interface Props { settings: TrailerSettings; update: (patch: Partial<TrailerSettings>) => void; }

/* ── helpers ─────────────────────────────────────────────────────────── */

const DPR = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

/** Bucket an arbitrary-length series into exactly `n` averaged bars, normalized
 *  to 0..1 by the series peak. Returns null for empty input so meters fall back
 *  to their illustrative pattern. */
const toBars = (values: number[] | undefined, n: number): number[] | null => {
    if (!values || values.length === 0) return null;
    const peak = Math.max(...values, 1e-6);
    const out: number[] = [];
    for (let b = 0; b < n; b++) {
        const start = Math.floor((b / n) * values.length);
        const end = Math.max(start + 1, Math.floor(((b + 1) / n) * values.length));
        let sum = 0, cnt = 0;
        for (let i = start; i < end && i < values.length; i++) { sum += values[i]; cnt++; }
        out.push(cnt > 0 ? Math.max(0.04, Math.min(1, (sum / cnt) / peak)) : 0.04);
    }
    return out;
};

/** Draw a single rounded bar on canvas. */
const drawBar = (
    ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
    color: string, radius = 1.5,
) => {
    if (h < 0.5) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();
};

/** Draw a horizontal dashed line with a label. */
const drawThresholdLine = (
    ctx: CanvasRenderingContext2D, y: number, width: number,
    color: string, label: string, labelX?: number,
) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `${8 * DPR}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(label, labelX ?? width / 2, y + 10 * DPR);
    ctx.restore();
};

/* ── NoiseGateMeter (Mirror Input / Output) ─────────────────────────── */

const INPUT_BARS = [0.82, 0.55, 0.18, 0.91, 0.12, 0.68, 0.08, 0.74, 0.15, 0.88, 0.22, 0.60, 0.10, 0.78, 0.40, 0.65, 0.30, 0.85];

const NoiseGateMeter: React.FC<{ active: boolean; threshold?: number; samples?: number[] | null }> = ({ active, threshold = 0.35, samples }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const frameRef = useRef(0);
    const timeRef = useRef(0);
    const real = samples && samples.length > 0;

    const draw = useCallback((t: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        const bars = real ? samples! : INPUT_BARS;
        const barCount = bars.length;
        const gap = 1.5 * DPR;
        const barW = (W - gap * (barCount + 1)) / barCount;
        const center = H / 2;
        const maxH = center - 6 * DPR;

        // Labels
        ctx.font = `${7 * DPR}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.textAlign = 'left';
        ctx.fillText('IN', 4 * DPR, 8 * DPR);
        ctx.fillText('OUT', 4 * DPR, H - 4 * DPR);

        for (let i = 0; i < barCount; i++) {
            // Real data is static (it's the analyzed song); only the illustrative
            // fallback animates so the panel still feels alive when idle.
            const jitter = active && !real ? Math.sin(t * 0.0015 + i * 0.9) * 0.06 : 0;
            const h = Math.max(0.05, Math.min(1, bars[i] + jitter));
            const barH = h * maxH;
            const x = gap + i * (barW + gap);

            // ── Input side (UPWARD from center) ──
            const inputColor = active ? 'rgba(34,211,238,0.7)' : 'rgba(255,255,255,0.10)';
            drawBar(ctx, x, center - barH, barW, barH, inputColor);

            // ── Output side (DOWNWARD from center - GATED) ──
            if (h >= threshold) {
                const outColor = active ? 'rgba(34,211,238,0.7)' : 'rgba(255,255,255,0.10)';
                drawBar(ctx, x, center, barW, barH, outColor);
            } else {
                // gated — flatlined dim red bar growing down slightly
                const gateColor = active ? 'rgba(248,113,113,0.30)' : 'rgba(255,255,255,0.05)';
                drawBar(ctx, x, center, barW, 2 * DPR, gateColor);
            }
        }

        // Draw center dividing line
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(0, center - 0.5 * DPR, W, 1 * DPR);

        // Threshold line on top/input half
        if (active) {
            const threshY = center - threshold * maxH;
            ctx.save();
            ctx.strokeStyle = 'rgba(248,113,113,0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 2]);
            ctx.beginPath();
            ctx.moveTo(0, threshY);
            ctx.lineTo(W, threshY);
            ctx.stroke();
            ctx.restore();
        }
    }, [active, threshold, real, samples]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const resize = () => {
            canvas.width = canvas.clientWidth * DPR;
            canvas.height = canvas.clientHeight * DPR;
            draw(timeRef.current);
        };
        resize();
        window.addEventListener('resize', resize);

        let running = true;
        const loop = (t: number) => {
            if (!running) return;
            timeRef.current = t;
            draw(t);
            frameRef.current = requestAnimationFrame(loop);
        };
        if (active && !real) {
            frameRef.current = requestAnimationFrame(loop);
        } else {
            draw(timeRef.current);
        }
        return () => {
            running = false;
            cancelAnimationFrame(frameRef.current);
            window.removeEventListener('resize', resize);
        };
    }, [active, draw, real]);

    return <canvas ref={canvasRef} className="mt-1 w-full h-12 rounded bg-black/10 border border-white/5" aria-hidden />;
};

/* ── LimiterMeter ────────────────────────────────────────────────────── */

const LIMITER_BARS = [0.60, 0.72, 0.88, 0.55, 0.95, 0.78, 0.62, 0.92, 0.70, 0.85, 0.58, 0.90, 0.65, 0.82, 0.56, 0.96, 0.68, 0.74, 0.80, 0.60];

const LimiterMeter: React.FC<{ active: boolean; ceiling?: number; samples?: number[] | null }> = ({ active, ceiling = 0.78, samples }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const frameRef = useRef(0);
    const timeRef = useRef(0);
    const real = samples && samples.length > 0;

    const draw = useCallback((t: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        const bars = real ? samples! : LIMITER_BARS;
        const barCount = bars.length;
        const gap = 1.5 * DPR;
        const barW = (W - gap * (barCount + 1)) / barCount;
        const topPad = 4 * DPR;
        const maxH = H - topPad - 2 * DPR;
        const ceilingY = topPad + maxH - ceiling * maxH;

        for (let i = 0; i < barCount; i++) {
            const jitter = active && !real ? Math.sin(t * 0.0018 + i * 1.1) * 0.05 : 0;
            const raw = Math.max(0.1, Math.min(1, bars[i] + jitter));
            const barH = raw * maxH;
            const barTop = topPad + maxH - barH;
            const x = gap + i * (barW + gap);

            if (!active) {
                drawBar(ctx, x, barTop, barW, barH, 'rgba(255,255,255,0.10)');
                continue;
            }

            if (raw <= ceiling) {
                // Under ceiling — normal bar
                drawBar(ctx, x, barTop, barW, barH, 'rgba(251,191,36,0.7)'); // amber-400
            } else {
                // Below ceiling portion
                const belowH = ceiling * maxH;
                const belowTop = topPad + maxH - belowH;
                drawBar(ctx, x, belowTop, barW, belowH, 'rgba(251,191,36,0.7)');
                // Above ceiling portion (clipped color)
                const aboveH = barH - belowH;
                drawBar(ctx, x, barTop, barW, aboveH, 'rgba(245,158,11,0.50)'); // amber-500 dimmer
                // Clipped cap line
                ctx.fillStyle = 'rgba(245,158,11,0.9)';
                ctx.fillRect(x, ceilingY - 1 * DPR, barW, 2 * DPR);
            }
        }

        // Ceiling line
        if (active) {
            drawThresholdLine(ctx, ceilingY, W, 'rgba(251,191,36,0.85)', 'Ceiling');
        }
    }, [active, ceiling, real, samples]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const resize = () => {
            canvas.width = canvas.clientWidth * DPR;
            canvas.height = canvas.clientHeight * DPR;
            draw(timeRef.current);
        };
        resize();
        window.addEventListener('resize', resize);

        let running = true;
        const loop = (t: number) => {
            if (!running) return;
            timeRef.current = t;
            draw(t);
            frameRef.current = requestAnimationFrame(loop);
        };
        if (active && !real) {
            frameRef.current = requestAnimationFrame(loop);
        } else {
            draw(timeRef.current);
        }
        return () => {
            running = false;
            cancelAnimationFrame(frameRef.current);
            window.removeEventListener('resize', resize);
        };
    }, [active, draw, real]);

    return <canvas ref={canvasRef} className="mt-1 w-full h-12 rounded bg-black/10 border border-white/5" aria-hidden />;
};

/* ── LoudnessNormMeter (Mirror Before / After) ─────────────────────── */

const LOUD_BEFORE = [0.30, 0.88, 0.22, 0.95, 0.40, 0.15, 0.85, 0.52, 0.10, 0.78, 0.45, 0.82, 0.20, 0.60, 0.35, 0.90, 0.50, 0.75];

const LoudnessNormMeter: React.FC<{ active: boolean; target?: number; samples?: number[] | null }> = ({ active, target = -14, samples }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const frameRef = useRef(0);
    const timeRef = useRef(0);
    const real = samples && samples.length > 0;

    const draw = useCallback((t: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        const beforeBars = real ? samples! : LOUD_BEFORE;
        const barCount = beforeBars.length;
        const gap = 1.5 * DPR;
        const barW = (W - gap * (barCount + 1)) / barCount;
        const center = H / 2;
        const maxH = center - 6 * DPR;

        // The normalized target as a 0-1 height (map LUFS roughly: -23 -> 0.35, -14 -> 0.60, -9 -> 0.75)
        const normLevel = 0.60 + (target + 14) * 0.025;

        // Labels
        ctx.font = `${7 * DPR}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.textAlign = 'left';
        ctx.fillText('BEFORE', 4 * DPR, 8 * DPR);
        ctx.fillText('AFTER', 4 * DPR, H - 4 * DPR);

        for (let i = 0; i < barCount; i++) {
            const jitter = active && !real ? Math.sin(t * 0.0012 + i * 0.7) * 0.04 : 0;
            const raw = Math.max(0.08, Math.min(1, beforeBars[i] + jitter));

            // ── Before side (UPWARD from center) ──
            const x = gap + i * (barW + gap);
            const beforeH = raw * maxH;
            const beforeColor = active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.10)';
            drawBar(ctx, x, center - beforeH, barW, beforeH, beforeColor);

            // ── After side (DOWNWARD from center - normalized) ──
            const compressed = normLevel + (raw - normLevel) * 0.25 + jitter * 0.5;
            const afterH = Math.max(0.08, Math.min(1, compressed)) * maxH;
            const afterColor = active ? 'rgba(52,211,153,0.7)' : 'rgba(255,255,255,0.10)'; // emerald-400
            drawBar(ctx, x, center, barW, afterH, afterColor);
        }

        // Draw center dividing line
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(0, center - 0.5 * DPR, W, 1 * DPR);

        // Target line (on bottom / after half)
        if (active) {
            const targetY = center + normLevel * maxH;
            ctx.save();
            ctx.strokeStyle = 'rgba(52,211,153,0.6)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 2]);
            ctx.beginPath();
            ctx.moveTo(0, targetY);
            ctx.lineTo(W, targetY);
            ctx.stroke();
            ctx.restore();
        }
    }, [active, target, real, samples]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const resize = () => {
            canvas.width = canvas.clientWidth * DPR;
            canvas.height = canvas.clientHeight * DPR;
            draw(timeRef.current);
        };
        resize();
        window.addEventListener('resize', resize);

        let running = true;
        const loop = (t: number) => {
            if (!running) return;
            timeRef.current = t;
            draw(t);
            frameRef.current = requestAnimationFrame(loop);
        };
        if (active && !real) {
            frameRef.current = requestAnimationFrame(loop);
        } else {
            draw(timeRef.current);
        }
        return () => {
            running = false;
            cancelAnimationFrame(frameRef.current);
            window.removeEventListener('resize', resize);
        };
    }, [active, draw, real]);

    return <canvas ref={canvasRef} className="mt-1 w-full h-12 rounded bg-black/10 border border-white/5" aria-hidden />;
};

export const TrailerAudioDynamics: React.FC<Props> = ({ settings, update }) => {
    const audio: AudioEffects = { ...DEFAULT_AUDIO_EFFECTS, ...((settings.globalAudioEffects as any) || {}) };
    const setAudio = (patch: Partial<AudioEffects>) => update({ globalAudioEffects: { ...audio, ...patch } as any });

    // Drive the meters from the REAL analyzed energy contour when available, so the
    // bars reflect this actual song rather than an illustrative pattern. Bucketed to
    // 20 bars and normalized to the track peak.
    const energyBars = useMemo(() => {
        const contour = settings.audioAnalysis?.energyContour;
        return toBars(contour?.map(c => c.energy), 20);
    }, [settings.audioAnalysis]);

    const Toggle: React.FC<{ label: string; on: boolean; onChange: (v: boolean) => void }> = ({ label, on, onChange }) => (
        <label className="flex items-center justify-between cursor-pointer">
            <span className="text-[11px] font-bold uppercase tracking-wide text-white/70">{label}</span>
            <div className="relative">
                <input type="checkbox" className="sr-only" checked={on} onChange={(e) => onChange(e.target.checked)} />
                <div className={`w-10 h-5 rounded-full transition-colors ${on ? 'bg-purple-500' : 'bg-black border border-white/20'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
            </div>
        </label>
    );

    return (
        <div className="pt-3 mt-1 border-t border-white/10 space-y-3">
            <div className="flex items-center gap-2">
                <SlidersHorizontal size={14} className="text-purple-400" />
                <span className="text-xs font-bold text-white">Audio Dynamics</span>
                <span className="text-[9px] text-white/35 ml-auto">applied to mixed soundtrack</span>
            </div>

            {/* Auto-compute from analysis */}
            {settings.audioAnalysis && (
                <button
                    onClick={() => {
                        const analysis = settings.audioAnalysis!;
                        const contour = analysis.energyContour ?? [];
                        const segments = analysis.segments ?? [];
                        const energies = contour.map(c => c.energy);
                        const peakE = energies.length > 0 ? Math.max(...energies) : 0;
                        const avgE = energies.length > 0 ? energies.reduce((a, b) => a + b, 0) / energies.length : 0;
                        const dynamicRange = peakE - avgE;
                        const hasQuiet = segments.some(s => s.avgEnergy < 0.15) || contour.some(c => c.event === 'silence');
                        const patch: Partial<AudioEffects> = {
                            loudnessNorm: true,
                            loudnessTarget: -14,
                        };
                        if (dynamicRange > 0.4) patch.limiter = true;
                        if (hasQuiet) patch.gate = true;
                        setAudio(patch);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 text-[11px] font-bold uppercase tracking-wide text-purple-200 hover:from-purple-600/30 hover:to-blue-600/30 transition-all"
                >
                    <Wand2 size={13} />
                    Auto (from analysis)
                </button>
            )}

            {/* Frequency selector */}
            <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Apply To</span>
                <div className="flex gap-1.5">
                    {[
                        { id: 'all', label: 'All Sections' },
                        { id: 'drops', label: 'Drops Only' },
                        { id: 'builds-drops', label: 'Builds + Drops' },
                        { id: 'custom', label: 'Custom' },
                    ].map(opt => (
                        <button key={opt.id}
                            onClick={() => update({ audioDynamicsScope: opt.id as any })}
                            className={`px-2 py-1 rounded-full text-[9px] font-bold uppercase transition-all border ${
                                (settings.audioDynamicsScope ?? 'all') === opt.id
                                    ? 'bg-purple-600/20 border-purple-500/40 text-purple-200 shadow-[0_0_8px_rgba(168,85,247,0.15)]'
                                    : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Side-by-side Economical Dynamics Layout */}
            <div className="grid grid-cols-3 gap-2.5">
                {/* Noise Gate */}
                <div className="bg-black/30 rounded-lg p-2.5 flex flex-col justify-between min-h-[175px] border border-white/5">
                    <div className="space-y-1">
                        <Toggle label="Gate" on={audio.gate ?? false} onChange={(v) => setAudio({ gate: v })} />
                        <p className="text-[8px] text-white/40 leading-snug">Silences audio below thresh.</p>
                    </div>
                    <div className="mt-auto">
                        <NoiseGateMeter active={audio.gate ?? false} samples={energyBars} />
                    </div>
                </div>

                {/* Limiter */}
                <div className="bg-black/30 rounded-lg p-2.5 flex flex-col justify-between min-h-[175px] border border-white/5">
                    <div className="space-y-1">
                        <Toggle label="Limiter" on={audio.limiter ?? false} onChange={(v) => setAudio({ limiter: v })} />
                        <p className="text-[8px] text-white/40 leading-snug">Hard wall ceiling against clips.</p>
                    </div>
                    <div className="mt-auto">
                        <LimiterMeter active={audio.limiter ?? false} samples={energyBars} />
                    </div>
                </div>

                {/* Loudness Normalize */}
                <div className="bg-black/30 rounded-lg p-2.5 flex flex-col justify-between min-h-[175px] border border-white/5">
                    <div className="space-y-1">
                        <Toggle label="Norm" on={audio.loudnessNorm ?? false} onChange={(v) => setAudio({ loudnessNorm: v })} />
                        <p className="text-[8px] text-white/40 leading-snug">Platform target volume (LUFS).</p>
                    </div>
                    <div className="mt-auto space-y-1.5">
                        <LoudnessNormMeter active={audio.loudnessNorm ?? false} target={audio.loudnessTarget} samples={energyBars} />
                        {audio.loudnessNorm && (
                            <div className="grid grid-cols-3 gap-0.5">
                                {[
                                    { l: 'YT', v: -14 },
                                    { l: 'Pod', v: -16 },
                                    { l: 'Cast', v: -23 }
                                ].map((p) => (
                                    <button
                                        key={p.v}
                                        onClick={() => setAudio({ loudnessTarget: p.v })}
                                        className={`text-[8px] py-0.5 rounded font-black transition-colors ${
                                            (audio.loudnessTarget ?? -14) === p.v
                                                ? 'bg-purple-500/30 text-purple-200 border border-purple-500/25'
                                                : 'bg-white/5 text-white/40 hover:bg-white/10'
                                        }`}
                                    >
                                        {p.l}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
