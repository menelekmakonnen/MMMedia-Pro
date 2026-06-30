import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Volume2, VolumeX, Mic, Activity } from 'lucide-react';
import { useTimelineStore } from '../timeline/useTimelineStore';
import { useClipStore } from '../../../store/clipStore';
import { motion } from 'framer-motion';
import clsx from 'clsx';

// ─── Rotary Pan Knob Component ───────────────────────────────────────────────
const PanKnob: React.FC<{
    value: number; // -100 (Left) to 100 (Right)
    onChange: (val: number) => void;
}> = ({ value, onChange }) => {
    const [dragging, setDragging] = useState(false);
    const startY = useRef(0);
    const startVal = useRef(0);

    const handlePointerDown = (e: React.PointerEvent) => {
        setDragging(true);
        startY.current = e.clientY;
        startVal.current = value;
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!dragging) return;
        const dy = startY.current - e.clientY;
        // 1px drag = 1.5 units change
        const nextVal = Math.max(-100, Math.min(100, startVal.current + dy * 1.5));
        onChange(Math.round(nextVal));
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        setDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    // Map -100..100 to rotation degrees -135..135
    const rotation = (value / 100) * 135;

    return (
        <div className="flex flex-col items-center select-none cursor-ns-resize">
            <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className="w-8 h-8 rounded-full border border-white/10 bg-[#161630] flex items-center justify-center relative shadow-inner"
            >
                <div 
                    className="absolute w-1 h-3 bg-purple-400 rounded-full top-0.5 left-1/2 -ml-0.5 origin-bottom"
                    style={{ transform: `rotate(${rotation}deg)` }}
                />
            </div>
            <span className="text-[8px] font-semibold text-white/40 mt-1 font-mono">
                {value === 0 ? 'C' : value < 0 ? `L${Math.abs(value)}` : `R${value}`}
            </span>
        </div>
    );
};

// ─── dB Reference Lines for VU Meter ──────────────────────────────────────────
const drawRefLines = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const refs = [
        { db: -6, color: 'rgba(34, 197, 94, 0.6)', label: '-6dB', dash: [] as number[] },
        { db: -12, color: 'rgba(34, 197, 94, 0.4)', label: '-12dB', dash: [3, 3] },
        { db: -24, color: 'rgba(59, 130, 246, 0.5)', label: '-24dB', dash: [] as number[] },
        { db: -30, color: 'rgba(59, 130, 246, 0.3)', label: '-30dB', dash: [3, 3] },
    ];
    for (const ref of refs) {
        // Convert dB to canvas position (0dB at top, -60dB at bottom)
        const y = Math.round(h * (1 - (ref.db + 60) / 60));
        ctx.save();
        ctx.setLineDash(ref.dash);
        ctx.strokeStyle = ref.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        // Label
        ctx.fillStyle = ref.color;
        ctx.font = '7px monospace';
        ctx.fillText(ref.label, 2, y - 2);
        ctx.restore();
    }
};

// ─── Canvas VU Meter Component ────────────────────────────────────────────────
const VUMeter: React.FC<{
    isActive: boolean;
    level: number; // 0..100 (simulated/active input volume)
}> = ({ isActive, level }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animRef = useRef<number>(0);
    const lastLevelL = useRef(0);
    const lastLevelR = useRef(0);
    const peakHoldL = useRef({ val: 0, age: 0 });
    const peakHoldR = useRef({ val: 0, age: 0 });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const draw = () => {
            const w = canvas.width;
            const h = canvas.height;
            ctx.clearRect(0, 0, w, h);

            // Target level based on active play status. Only moves when there is
            // a real signal (isActive is gated on audio actually playing). Motion
            // is deterministic (an indicative meter), not random noise — so an
            // empty/paused timeline reads a flat zero instead of fake activity.
            let targetL = 0;
            let targetR = 0;
            if (isActive) {
                const base = level / 100;
                const t = performance.now() / 1000;
                targetL = base * (0.6 + 0.4 * Math.abs(Math.sin(t * 6.0)));
                targetR = base * (0.6 + 0.4 * Math.abs(Math.sin(t * 6.0 + 0.9)));
            }

            // Smooth updates (decay)
            lastLevelL.current += (targetL - lastLevelL.current) * (targetL > lastLevelL.current ? 0.3 : 0.08);
            lastLevelR.current += (targetR - lastLevelR.current) * (targetR > lastLevelR.current ? 0.3 : 0.08);

            const levels = [lastLevelL.current, lastLevelR.current];
            const peakHolds = [peakHoldL.current, peakHoldR.current];

            // Render L & R channels
            const channelW = Math.floor((w - 3) / 2);
            for (let ch = 0; ch < 2; ch++) {
                const x = ch * (channelW + 3);
                const currentVal = levels[ch];
                const peak = peakHolds[ch];

                // Draw background channel strip
                ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
                ctx.fillRect(x, 0, channelW, h);

                // Draw segments: green (0.7), yellow (0.2), red (0.1)
                const fillH = currentVal * h;
                const greenMax = Math.min(fillH, h * 0.7);
                const yellowMax = fillH > h * 0.7 ? Math.min(fillH - h * 0.7, h * 0.2) : 0;
                const redMax = fillH > h * 0.9 ? fillH - h * 0.9 : 0;

                ctx.fillStyle = '#22c55e'; // Green
                ctx.fillRect(x, h - greenMax, channelW, greenMax);

                if (yellowMax > 0) {
                    ctx.fillStyle = '#eab308'; // Yellow
                    ctx.fillRect(x, h - (h * 0.7) - yellowMax, channelW, yellowMax);
                }

                if (redMax > 0) {
                    ctx.fillStyle = '#ef4444'; // Red
                    ctx.fillRect(x, h - (h * 0.9) - redMax, channelW, redMax);
                }

                // Peak hold logic
                if (currentVal > peak.val) {
                    peak.val = currentVal;
                    peak.age = 0;
                } else {
                    peak.age++;
                    if (peak.age > 45) {
                        peak.val *= 0.95; // Decay peak
                    }
                }

                // Draw peak bar
                if (peak.val > 0.02) {
                    const peakY = h - (peak.val * h);
                    ctx.fillStyle = peak.val > 0.9 ? '#ef4444' : peak.val > 0.7 ? '#eab308' : '#4ade80';
                    ctx.fillRect(x, Math.max(0, peakY - 1), channelW, 1);
                }
            }

            // Draw dB reference lines on top of meter bars
            drawRefLines(ctx, w, h);

            animRef.current = requestAnimationFrame(draw);
        };

        animRef.current = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(animRef.current);
    }, [isActive, level]);

    // Compute peak dB from current level for readout
    const peakDb = level === 0 ? -Infinity : (level / 100) * 12 - 6;

    return (
        <div className="w-4 h-full relative flex flex-col items-center">
            <canvas ref={canvasRef} width={16} height={120} className="w-full flex-1 rounded bg-[#090918]" />
            <span className="text-[8px] font-mono text-white/40 text-center block mt-0.5">
                {level === 0 ? '-∞' : `${peakDb.toFixed(1)} dB`}
            </span>
        </div>
    );
};

// ─── Channel Strip Component ─────────────────────────────────────────────────
const ChannelStrip: React.FC<{
    name: string;
    type: 'video' | 'audio' | 'master';
    volume: number;
    muted: boolean;
    solo?: boolean;
    onVolumeChange: (v: number) => void;
    onMuteToggle: () => void;
    onSoloToggle?: () => void;
    isPlaying: boolean;
}> = ({
    name,
    type,
    volume,
    muted,
    solo = false,
    onVolumeChange,
    onMuteToggle,
    onSoloToggle,
    isPlaying,
}) => {
    const [pan, setPan] = useState(0);

    return (
        <div className="flex flex-col items-center bg-[#111126]/60 border border-white/[0.04] rounded-xl p-2 w-[84px] select-none shrink-0 shadow-lg relative group">
            {/* Header */}
            <div className="text-[10px] font-black text-white/50 tracking-wider mb-2 flex items-center gap-1">
                {type === 'master' ? (
                    <Activity size={10} className="text-purple-400" />
                ) : (
                    <Mic size={10} className={clsx(type === 'video' ? 'text-indigo-400/80' : 'text-cyan-400/80')} />
                )}
                {name}
            </div>

            {/* Panning (Only audio channels) */}
            {type !== 'master' ? (
                <div className="mb-3">
                    <PanKnob value={pan} onChange={setPan} />
                </div>
            ) : (
                <div className="h-11 flex items-center justify-center text-[8px] font-black text-purple-400 bg-purple-500/10 px-2 rounded-md border border-purple-500/20 mb-3 tracking-wider font-mono">
                    MASTER BUS
                </div>
            )}

            {/* Fader & VU Meter Layout */}
            <div className="flex gap-2.5 items-stretch h-[120px] mb-3">
                {/* VU Meter */}
                <VUMeter isActive={isPlaying && !muted} level={volume} />

                {/* Vertical Slider Fader */}
                <div className="relative flex flex-col items-center w-6">
                    {/* Tick Marks */}
                    <div className="absolute right-6 top-0 bottom-0 flex flex-col justify-between text-[6px] font-mono text-white/15 pr-0.5 select-none pointer-events-none">
                        <span>+6</span>
                        <span>0</span>
                        <span>-6</span>
                        <span>-12</span>
                        <span>-24</span>
                        <span>-∞</span>
                    </div>

                    <input
                        type="range"
                        min={0}
                        max={100}
                        value={volume}
                        onChange={(e) => onVolumeChange(parseInt(e.target.value))}
                        className="h-full w-1 rounded-full bg-[#090918] cursor-pointer accent-purple-500 appearance-none slider-vertical"
                        style={{
                            WebkitAppearance: 'slider-vertical', // For WebKit/Blink
                        } as React.CSSProperties}
                    />
                </div>
            </div>

            {/* Volume Text Indicator */}
            <div className="font-mono text-[9px] font-bold text-white/70 bg-[#08081a] px-1.5 py-0.5 rounded border border-white/[0.04] mb-2">
                {volume === 0 ? '-∞' : `${Math.round((volume / 100) * 12 - 6)} dB`}
            </div>

            {/* Quick gain presets */}
            <div className="flex gap-0.5 mb-3 w-full">
                <button
                    onClick={() => onVolumeChange(75)}
                    className="flex-1 text-[7px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400/70 hover:bg-emerald-500/25 transition-colors"
                    title="Dialogue level (~-9dB)"
                >
                    DLG
                </button>
                <button
                    onClick={() => onVolumeChange(20)}
                    className="flex-1 text-[7px] px-1 py-0.5 rounded bg-blue-500/15 text-blue-400/70 hover:bg-blue-500/25 transition-colors"
                    title="Music level (~-27dB)"
                >
                    MUS
                </button>
                <button
                    onClick={() => onVolumeChange(45)}
                    className="flex-1 text-[7px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-400/70 hover:bg-amber-500/25 transition-colors"
                    title="SFX level (~-18dB)"
                >
                    SFX
                </button>
            </div>

            {/* Fader Mute & Solo row */}
            <div className="flex gap-1 w-full">
                {onSoloToggle && (
                    <button
                        onClick={onSoloToggle}
                        className={clsx(
                            'flex-1 text-[8px] font-black py-1 rounded transition-colors',
                            solo
                                ? 'bg-yellow-500/30 text-yellow-400 border border-yellow-500/40 shadow-[0_0_8px_rgba(234,179,8,0.15)]'
                                : 'bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/60 border border-transparent'
                        )}
                        title="Solo Track"
                    >
                        S
                    </button>
                )}
                <button
                    onClick={onMuteToggle}
                    className={clsx(
                        'flex-1 text-[8px] font-black py-1 rounded transition-colors flex justify-center items-center',
                        muted
                            ? 'bg-red-500/30 text-red-400 border border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.15)]'
                            : 'bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/60 border border-transparent'
                    )}
                    title="Mute Track"
                >
                    {muted ? <VolumeX size={10} /> : <Volume2 size={10} />}
                </button>
            </div>
        </div>
    );
};

// ─── Main Component ──────────────────────────────────────────────────────────
export const AudioMixer: React.FC = () => {
    const tracks = useTimelineStore((s) => s.tracks);
    const updateTrack = useTimelineStore((s) => s.updateTrack);
    const isPlaying = useTimelineStore((s) => s.isPlaying);
    const playhead = useTimelineStore((s) => s.playheadFrame);
    const clips = useClipStore((s) => s.clips);

    // Local master volume state
    const [masterVol, setMasterVol] = useState(80);
    const [masterMuted, setMasterMuted] = useState(false);

    // A track only shows meter activity when audio is genuinely playing under the
    // playhead — never on an empty/paused timeline.
    const trackHasSignal = useCallback((trackId: number) => {
        if (!isPlaying) return false;
        return clips.some((c) =>
            (c.type === 'audio' || c.type === 'video') &&
            (c.track === trackId || (trackId === 2 && c.type === 'video' && (c.track ?? 1) === 1)) &&
            playhead >= c.startFrame && playhead < c.endFrame && !c.disabled,
        );
    }, [isPlaying, clips, playhead]);
    const anySignal = isPlaying && clips.some((c) =>
        (c.type === 'audio' || c.type === 'video') && playhead >= c.startFrame && playhead < c.endFrame && !c.disabled,
    );

    return (
        <div className="w-full h-full flex flex-col bg-[#0b0b18] select-none p-4 overflow-hidden">
            {/* Header Title */}
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <div>
                    <h2 className="text-sm font-bold text-white tracking-wider uppercase">Audio Mixer Panel</h2>
                    <p className="text-[10px] text-white/30 mt-0.5">Level &amp; pan controls · indicative metering (preview)</p>
                </div>
            </div>

            {/* Mixer Strips Row */}
            <div className="flex-1 flex gap-3 overflow-x-auto pb-2 pr-4 min-h-0 items-start">
                {tracks.map((track) => (
                    <ChannelStrip
                        key={track.id}
                        name={track.name}
                        type={track.type}
                        volume={track.volume}
                        muted={track.muted}
                        solo={track.solo}
                        onVolumeChange={(val) => updateTrack(track.id, { volume: val })}
                        onMuteToggle={() => updateTrack(track.id, { muted: !track.muted })}
                        onSoloToggle={() => updateTrack(track.id, { solo: !track.solo })}
                        isPlaying={trackHasSignal(track.id)}
                    />
                ))}

                {/* Master Bus Separator Divider */}
                <div className="w-px self-stretch bg-white/[0.06] mx-1" />

                {/* Master Channel Strip */}
                <ChannelStrip
                    name="MASTER"
                    type="master"
                    volume={masterVol}
                    muted={masterMuted}
                    onVolumeChange={setMasterVol}
                    onMuteToggle={() => setMasterMuted(!masterMuted)}
                    isPlaying={anySignal}
                />
            </div>
        </div>
    );
};
