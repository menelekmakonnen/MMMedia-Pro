import React, { useRef, useEffect, useCallback } from 'react';
import type { TrailerSettings } from '../../lib/trailerGenerator';
import type { AudioAnalysisResult, SegmentType, BeatMarker } from '../../lib/audioAnalysis';

interface ShakePreviewProps {
    settings: TrailerSettings;
    audioAnalysis: AudioAnalysisResult | null;
    width?: number;
    height?: number;
}

// ── Shake type → color mapping ──────────────────────────────────────────────
const SHAKE_COLORS: Record<string, string> = {
    impact: '#ef4444',     // red
    handheld: '#f59e0b',   // amber
    earthquake: '#f97316', // orange
    vibration: '#06b6d4',  // cyan
    whip: '#a855f7',       // purple
};

const SHAKE_LABELS: [string, string][] = [
    ['impact', '#ef4444'],
    ['handheld', '#f59e0b'],
    ['earthquake', '#f97316'],
    ['vibration', '#06b6d4'],
    ['whip', '#a855f7'],
];

/**
 * Determines whether a beat qualifies for a shake based on the shake policy,
 * the beat's energy, and which segment it falls into.
 */
function shouldShakeAtBeat(
    beat: BeatMarker,
    segments: { start: number; end: number; type: SegmentType; avgEnergy: number }[],
    policy: string,
): boolean {
    if (policy === 'off') return false;
    if (policy === 'on-every-beat') return true;

    // Find which segment this beat falls into
    const seg = segments.find(s => beat.time >= s.start && beat.time < s.end);
    const segType = seg?.type || 'verse';

    if (policy === 'heavy-beats-only') {
        return segType === 'drop' || segType === 'chorus' || beat.energy > 0.7;
    }
    if (policy === 'sparingly') {
        return (segType === 'drop' || segType === 'chorus') && beat.energy > 0.5;
    }
    return false;
}

/**
 * Pick a shake type for the given beat. When shakeType is 'all', cycle through
 * the five types deterministically based on the beat index.
 */
function resolveShakeType(shakeType: string | undefined, beatIndex: number): string {
    const types = ['impact', 'handheld', 'earthquake', 'vibration', 'whip'];
    if (!shakeType || shakeType === 'all') {
        return types[beatIndex % types.length];
    }
    return shakeType;
}

/**
 * ShakePreview — Canvas-based visualization of where shake effects would be
 * applied relative to the audio waveform and beat structure.
 *
 * Renders:
 * 1. Audio waveform as a filled area chart (purple/20)
 * 2. Beat markers as vertical lines (white/20 for regular, red for drops/impacts)
 * 3. Shake application points as colored dots sized by intensity
 * 4. A legend at the bottom
 */
export const ShakePreview = React.memo<ShakePreviewProps>(({
    settings,
    audioAnalysis,
    width: propWidth,
    height: propHeight,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || !audioAnalysis) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // HiDPI setup
        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();
        const w = propWidth || rect.width;
        const h = propHeight || 120;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        ctx.scale(dpr, dpr);

        const { waveformData, beats, segments, duration, gridBeats } = audioAnalysis;
        const legendH = 24; // reserved for legend
        const plotH = h - legendH;

        // ── Background ──────────────────────────────────────────────────────
        ctx.clearRect(0, 0, w, h);
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, 'rgba(15, 10, 25, 0.95)');
        bgGrad.addColorStop(1, 'rgba(8, 5, 18, 0.98)');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // Subtle grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 0.5;
        for (let i = 1; i < 4; i++) {
            const gy = (plotH / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.lineTo(w, gy);
            ctx.stroke();
        }

        // ── 1. Waveform (filled area chart — purple/20) ────────────────────
        if (waveformData && waveformData.length > 0) {
            const step = w / waveformData.length;

            // Filled area
            ctx.beginPath();
            ctx.moveTo(0, plotH);
            for (let i = 0; i < waveformData.length; i++) {
                const x = i * step;
                const amp = waveformData[i];
                const y = plotH - amp * plotH * 0.85;
                ctx.lineTo(x, y);
            }
            ctx.lineTo(w, plotH);
            ctx.closePath();

            const areaGrad = ctx.createLinearGradient(0, 0, 0, plotH);
            areaGrad.addColorStop(0, 'rgba(147, 51, 234, 0.25)');
            areaGrad.addColorStop(0.5, 'rgba(88, 28, 135, 0.15)');
            areaGrad.addColorStop(1, 'rgba(88, 28, 135, 0.05)');
            ctx.fillStyle = areaGrad;
            ctx.fill();

            // Stroke outline for definition
            ctx.beginPath();
            for (let i = 0; i < waveformData.length; i++) {
                const x = i * step;
                const amp = waveformData[i];
                const y = plotH - amp * plotH * 0.85;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = 'rgba(147, 51, 234, 0.35)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // ── 2. Beat markers (vertical lines) ───────────────────────────────
        const allBeats = gridBeats ?? beats?.map(b => b.time) ?? [];
        const dropSegments = segments?.filter(s => s.type === 'drop' || s.type === 'chorus') ?? [];

        for (const beatTime of allBeats) {
            const x = (beatTime / duration) * w;
            const isInDrop = dropSegments.some(s => beatTime >= s.start && beatTime < s.end);

            ctx.beginPath();
            ctx.moveTo(x, plotH);
            ctx.lineTo(x, plotH * 0.3);
            ctx.strokeStyle = isInDrop ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = isInDrop ? 1.5 : 0.8;
            ctx.stroke();
        }

        // ── 3. Shake application points ────────────────────────────────────
        const policy = settings.shakePolicy || 'off';
        const intensity = settings.shakeIntensity ?? 50;
        const shakeType = settings.shakeType || 'impact';

        if (policy !== 'off' && beats && beats.length > 0) {
            let shakeBeatIdx = 0;
            for (const beat of beats) {
                if (!shouldShakeAtBeat(beat, segments ?? [], policy)) continue;

                const x = (beat.time / duration) * w;
                const wfIdx = Math.floor((beat.time / duration) * (waveformData?.length ?? 0));
                const wfAmp = waveformData?.[wfIdx] ?? 0.5;
                const y = plotH - wfAmp * plotH * 0.85;

                const type = resolveShakeType(shakeType, shakeBeatIdx);
                const color = SHAKE_COLORS[type] || '#ffffff';

                // Dot size = intensity scaled 4–12px
                const dotSize = 4 + (intensity / 100) * 8;
                // Scale dot by beat energy for visual variety
                const energyScale = 0.6 + beat.energy * 0.4;
                const radius = dotSize * energyScale * 0.5;

                // Glow
                ctx.beginPath();
                ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
                ctx.fillStyle = color.replace(')', ',0.15)').replace('rgb', 'rgba').replace('#', '');
                // Use hex-to-rgba for glow
                const glowGrad = ctx.createRadialGradient(x, y, 0, x, y, radius + 6);
                glowGrad.addColorStop(0, hexToRgba(color, 0.3));
                glowGrad.addColorStop(1, hexToRgba(color, 0));
                ctx.fillStyle = glowGrad;
                ctx.fill();

                // Main dot
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.9;
                ctx.fill();
                ctx.globalAlpha = 1;

                // White highlight dot
                ctx.beginPath();
                ctx.arc(x - radius * 0.2, y - radius * 0.2, radius * 0.3, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.fill();

                shakeBeatIdx++;
            }
        }

        // ── 4. Legend ──────────────────────────────────────────────────────
        const legendY = plotH + 4;
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

        let legendX = 8;
        for (const [label, color] of SHAKE_LABELS) {
            // Only show legend items that are relevant
            if (shakeType !== 'all' && shakeType !== label) continue;

            // Dot
            ctx.beginPath();
            ctx.arc(legendX + 4, legendY + 8, 4, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();

            // Label
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            const text = label.charAt(0).toUpperCase() + label.slice(1);
            ctx.fillText(text, legendX + 12, legendY + 12);
            legendX += ctx.measureText(text).width + 24;
        }
    }, [audioAnalysis, settings.shakePolicy, settings.shakeIntensity, settings.shakeType, propWidth, propHeight]);

    useEffect(() => {
        draw();
    }, [draw]);

    // Redraw on resize
    useEffect(() => {
        const ro = new ResizeObserver(() => draw());
        if (containerRef.current) ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, [draw]);

    if (!audioAnalysis) {
        return (
            <div className="flex items-center justify-center py-6 px-4 rounded-xl border border-white/5 bg-black/20">
                <p className="text-xs text-white/30 italic">
                    Upload and analyze audio to preview shake placement
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-1 pt-2">
            <span className="text-[9px] font-bold uppercase text-white/30 tracking-wider">
                Shake Placement Preview
            </span>
            <div
                ref={containerRef}
                className="w-full rounded-lg overflow-hidden border border-white/5 bg-black/30"
            >
                <canvas
                    ref={canvasRef}
                    className="w-full"
                    style={{ height: propHeight || 120 }}
                />
            </div>
        </div>
    );
});

/** Convert a hex color to rgba string. */
function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

export default ShakePreview;
