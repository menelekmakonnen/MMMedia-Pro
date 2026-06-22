import React, { useRef, useEffect, useCallback } from 'react';
import { SlidersHorizontal, Wand2 } from 'lucide-react';
import { DEFAULT_AUDIO_EFFECTS, AudioEffects } from '../../lib/audioEffects';
import type { TrailerSettings } from '../../lib/trailerGenerator';

interface Props { settings: TrailerSettings; update: (patch: Partial<TrailerSettings>) => void; }

/* ── helpers ─────────────────────────────────────────────────────────── */

const DPR = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

/** Seed-able pseudo random so bar patterns are deterministic per-bar. */
const seededRand = (seed: number) => {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
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
    ctx.font = `${9 * DPR}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(label, labelX ?? width / 2, y + 11 * DPR);
    ctx.restore();
};

/* ── NoiseGateMeter ──────────────────────────────────────────────────── */

const INPUT_BARS = [0.82, 0.55, 0.18, 0.91, 0.12, 0.68, 0.08, 0.74, 0.15, 0.88, 0.22, 0.60, 0.10, 0.78];

const NoiseGateMeter: React.FC<{ active: boolean; threshold?: number }> = ({ active, threshold = 0.35 }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const frameRef = useRef(0);
    const timeRef = useRef(0);

    const draw = useCallback((t: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        const barCount = INPUT_BARS.length;
        const halfW = W / 2;
        const gap = 2 * DPR;
        const barW = (halfW - gap * barCount) / barCount;
        const maxH = H - 14 * DPR; // leave room for label

        // Section labels
        ctx.font = `${8 * DPR}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.textAlign = 'center';
        ctx.fillText('Input', halfW / 2, 8 * DPR);
        ctx.fillText('Output', halfW + halfW / 2, 8 * DPR);

        const topY = 12 * DPR;

        for (let i = 0; i < barCount; i++) {
            const jitter = active ? Math.sin(t * 0.0015 + i * 0.9) * 0.06 : 0;
            const h = Math.max(0.05, Math.min(1, INPUT_BARS[i] + jitter));
            const barH = h * maxH;

            // ── Input side ──
            const x1 = i * (barW + gap) + gap;
            const inputColor = active ? 'rgba(34,211,238,0.7)' : 'rgba(255,255,255,0.10)';
            drawBar(ctx, x1, topY + maxH - barH, barW, barH, inputColor);

            // ── Output side (gated) ──
            const x2 = halfW + i * (barW + gap) + gap;
            if (h >= threshold) {
                const outColor = active ? 'rgba(34,211,238,0.7)' : 'rgba(255,255,255,0.10)';
                drawBar(ctx, x2, topY + maxH - barH, barW, barH, outColor);
            } else {
                // gated — dim bar
                const gateColor = active ? 'rgba(248,113,113,0.30)' : 'rgba(255,255,255,0.05)';
                drawBar(ctx, x2, topY + maxH - 2 * DPR, barW, 2 * DPR, gateColor);
            }
        }

        // Threshold line
        if (active) {
            const threshY = topY + maxH - threshold * maxH;
            drawThresholdLine(ctx, threshY, W, 'rgba(248,113,113,0.8)', 'Threshold');
        }
    }, [active, threshold]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = 200 * DPR;
        canvas.height = 48 * DPR;

        let running = true;
        const loop = (t: number) => {
            if (!running) return;
            timeRef.current = t;
            draw(t);
            frameRef.current = requestAnimationFrame(loop);
        };
        if (active) {
            frameRef.current = requestAnimationFrame(loop);
        } else {
            draw(0);
        }
        return () => { running = false; cancelAnimationFrame(frameRef.current); };
    }, [active, draw]);

    return <canvas ref={canvasRef} className="mt-1" style={{ width: 200, height: 48 }} aria-hidden />;
};

/* ── LimiterMeter ────────────────────────────────────────────────────── */

const LIMITER_BARS = [0.60, 0.72, 0.88, 0.55, 0.95, 0.78, 0.62, 0.92, 0.70, 0.85, 0.58, 0.90, 0.65, 0.82,
    0.56, 0.96, 0.68, 0.74];

const LimiterMeter: React.FC<{ active: boolean; ceiling?: number }> = ({ active, ceiling = 0.78 }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const frameRef = useRef(0);

    const draw = useCallback((t: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        const barCount = LIMITER_BARS.length;
        const gap = 2 * DPR;
        const barW = (W - gap * (barCount + 1)) / barCount;
        const topPad = 4 * DPR;
        const maxH = H - topPad - 2 * DPR;
        const ceilingY = topPad + maxH - ceiling * maxH;

        for (let i = 0; i < barCount; i++) {
            const jitter = active ? Math.sin(t * 0.0018 + i * 1.1) * 0.05 : 0;
            const raw = Math.max(0.1, Math.min(1, LIMITER_BARS[i] + jitter));
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
    }, [active, ceiling]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = 200 * DPR;
        canvas.height = 48 * DPR;

        let running = true;
        const loop = (t: number) => {
            if (!running) return;
            draw(t);
            frameRef.current = requestAnimationFrame(loop);
        };
        if (active) {
            frameRef.current = requestAnimationFrame(loop);
        } else {
            draw(0);
        }
        return () => { running = false; cancelAnimationFrame(frameRef.current); };
    }, [active, draw]);

    return <canvas ref={canvasRef} className="mt-1" style={{ width: 200, height: 48 }} aria-hidden />;
};

/* ── LoudnessNormMeter ───────────────────────────────────────────────── */

const LOUD_BEFORE = [0.30, 0.88, 0.22, 0.95, 0.40, 0.15, 0.85, 0.52, 0.10, 0.78];

const LoudnessNormMeter: React.FC<{ active: boolean; target?: number }> = ({ active, target = -14 }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const frameRef = useRef(0);

    const draw = useCallback((t: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        const barCount = LOUD_BEFORE.length;
        const halfW = W / 2;
        const gap = 2 * DPR;
        const barW = (halfW - gap * (barCount + 1)) / barCount;
        const topPad = 12 * DPR;
        const maxH = H - topPad - 2 * DPR;

        // The normalized target as a 0-1 height (map LUFS roughly: -23 -> 0.35, -14 -> 0.60, -9 -> 0.75)
        const normLevel = 0.60 + (target + 14) * 0.025;

        // Section labels
        ctx.font = `${8 * DPR}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.textAlign = 'center';
        ctx.fillText('Before', halfW / 2, 8 * DPR);
        ctx.fillText('After', halfW + halfW / 2, 8 * DPR);

        for (let i = 0; i < barCount; i++) {
            const jitter = active ? Math.sin(t * 0.0012 + i * 0.7) * 0.04 : 0;
            const raw = Math.max(0.08, Math.min(1, LOUD_BEFORE[i] + jitter));

            // ── Before side ──
            const x1 = gap + i * (barW + gap);
            const beforeH = raw * maxH;
            const beforeColor = active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.10)';
            drawBar(ctx, x1, topPad + maxH - beforeH, barW, beforeH, beforeColor);

            // ── After side (normalized toward target) ──
            const x2 = halfW + gap + i * (barW + gap);
            // Compress dynamic range: pull everything toward the target level
            const compressed = normLevel + (raw - normLevel) * 0.25 + jitter * 0.5;
            const afterH = Math.max(0.08, Math.min(1, compressed)) * maxH;
            const afterColor = active ? 'rgba(52,211,153,0.7)' : 'rgba(255,255,255,0.10)'; // emerald-400
            drawBar(ctx, x2, topPad + maxH - afterH, barW, afterH, afterColor);
        }

        // Target line (on right half only)
        if (active) {
            const targetY = topPad + maxH - normLevel * maxH;
            ctx.save();
            ctx.strokeStyle = 'rgba(52,211,153,0.85)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(halfW, targetY);
            ctx.lineTo(W, targetY);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.font = `${8 * DPR}px Inter, system-ui, sans-serif`;
            ctx.fillStyle = 'rgba(52,211,153,0.85)';
            ctx.textAlign = 'center';
            ctx.fillText(`${target} LUFS`, halfW + halfW / 2, targetY + 10 * DPR);
            ctx.restore();
        }
    }, [active, target]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = 200 * DPR;
        canvas.height = 48 * DPR;

        let running = true;
        const loop = (t: number) => {
            if (!running) return;
            draw(t);
            frameRef.current = requestAnimationFrame(loop);
        };
        if (active) {
            frameRef.current = requestAnimationFrame(loop);
        } else {
            draw(0);
        }
        return () => { running = false; cancelAnimationFrame(frameRef.current); };
    }, [active, draw]);

    return <canvas ref={canvasRef} className="mt-1" style={{ width: 200, height: 48 }} aria-hidden />;
};

export const TrailerAudioDynamics: React.FC<Props> = ({ settings, update }) => {
    const audio: AudioEffects = { ...DEFAULT_AUDIO_EFFECTS, ...((settings.globalAudioEffects as any) || {}) };
    const setAudio = (patch: Partial<AudioEffects>) => update({ globalAudioEffects: { ...audio, ...patch } as any });

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
                <span className="text-[9px] text-white/35 ml-auto">applied to the mixed soundtrack</span>
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

            <div className="bg-black/30 rounded-lg p-2.5 relative">
                <Toggle label="Noise Gate" on={audio.gate ?? false} onChange={(v) => setAudio({ gate: v })} />
                <p className="text-[10px] text-white/40 mt-1">Silences signal below the threshold — kills hiss and room tone between hits.</p>
                <NoiseGateMeter active={audio.gate ?? false} />
            </div>

            <div className="bg-black/30 rounded-lg p-2.5 relative">
                <Toggle label="Limiter" on={audio.limiter ?? false} onChange={(v) => setAudio({ limiter: v })} />
                <p className="text-[10px] text-white/40 mt-1">Brick-wall ceiling on peaks so the track never clips after beats/effects.</p>
                <LimiterMeter active={audio.limiter ?? false} />
            </div>

            <div className="bg-black/30 rounded-lg p-2.5 relative">
                <Toggle label="Loudness Normalize" on={audio.loudnessNorm ?? false} onChange={(v) => setAudio({ loudnessNorm: v })} />
                <p className="text-[10px] text-white/40 mt-1">EBU R128 normalization to a platform target so every export lands at the same perceived volume.</p>
                <LoudnessNormMeter active={audio.loudnessNorm ?? false} target={audio.loudnessTarget} />
                {audio.loudnessNorm && (
                    <div className="grid grid-cols-3 gap-1 pt-2">
                        {[{ l: 'YouTube', v: -14 }, { l: 'Podcast', v: -16 }, { l: 'Broadcast', v: -23 }].map((p) => (
                            <button key={p.v} onClick={() => setAudio({ loudnessTarget: p.v })}
                                className={`text-[9px] py-1 rounded ${(audio.loudnessTarget ?? -14) === p.v ? 'bg-purple-500/30 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>{p.l}<br />{p.v} LUFS</button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
