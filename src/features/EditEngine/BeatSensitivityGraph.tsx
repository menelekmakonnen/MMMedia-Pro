import React, { useRef, useEffect, useCallback } from 'react';

interface BeatSensitivityGraphProps {
    audioAnalysis: {
        beats: Array<{ time: number; type: string; energy: number; downbeat?: boolean }>;
        duration: number;
        waveformAmplitudes?: number[];
    } | null;
    beatSensitivity: number; // 0.0 to 1.0
}

// ── Beat type → color mapping ───────────────────────────────────────────────
const BEAT_COLORS: Record<string, string> = {
    kick: '#ef4444',   // red
    snare: '#f97316',  // orange
    hat: '#06b6d4',    // cyan
    bass: '#a855f7',   // purple
};

const DEFAULT_BEAT_COLOR = '#ffffff80';

/** Convert a hex color to rgba string. */
function hexToRgba(hex: string, alpha: number): string {
    // Handle 8-char hex with alpha channel (#rrggbbaa)
    const raw = hex.startsWith('#') ? hex.slice(1) : hex;
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

const CANVAS_HEIGHT = 64;

export const BeatSensitivityGraph: React.FC<BeatSensitivityGraphProps> = ({
    audioAnalysis,
    beatSensitivity,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const animatedThreshold = useRef(1 - beatSensitivity);
    const rafId = useRef<number>(0);

    // ── Animated threshold lerp ─────────────────────────────────────────────
    const targetThreshold = 1 - beatSensitivity;

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || !audioAnalysis) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // HiDPI setup — match canvas bitmap size to physical pixels
        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();
        const w = rect.width;
        const h = CANVAS_HEIGHT;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        ctx.scale(dpr, dpr);

        const { beats, duration } = audioAnalysis;
        const thresholdY = animatedThreshold.current * h;

        // ── Background ──────────────────────────────────────────────────────
        ctx.clearRect(0, 0, w, h);

        // ── Subtle grid lines ───────────────────────────────────────────────
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 0.5;
        for (let i = 1; i < 4; i++) {
            const gy = (h / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.lineTo(w, gy);
            ctx.stroke();
        }

        // ── Beat markers ────────────────────────────────────────────────────
        let activeCount = 0;

        for (const beat of beats) {
            const x = (beat.time / duration) * w;
            const rawColor = BEAT_COLORS[beat.type] || DEFAULT_BEAT_COLOR;
            // Bars with alpha channel in the hex default use the first 7 chars for RGB
            const color = rawColor.length > 7 ? rawColor.slice(0, 7) : rawColor;
            const isDefault = !BEAT_COLORS[beat.type];

            const barH = Math.max(2, beat.energy * h * 0.9);
            const barY = h - barH;
            const barW = Math.max(2, beat.energy > 0.7 ? 3 : 2);

            // Does this beat sit above the threshold?
            // Energy is mapped to height from bottom; threshold is from top.
            // Beat is "active" when its energy reaches above the threshold line.
            const beatTopY = barY; // top of the bar
            const isActive = beatTopY <= thresholdY; // bar reaches above the line

            if (isActive) {
                activeCount++;

                // Glow pass behind active beats
                ctx.save();
                ctx.globalAlpha = 0.25;
                ctx.filter = 'blur(4px)';
                ctx.fillStyle = isDefault ? 'rgba(255,255,255,0.4)' : color;
                ctx.fillRect(x - barW, barY, barW * 3, barH);
                ctx.restore();

                // Main bar — full opacity
                ctx.globalAlpha = 1;
                ctx.fillStyle = color;
                ctx.fillRect(x - barW / 2, barY, barW, barH);

                // Top dot highlight
                ctx.beginPath();
                ctx.arc(x, barY, 1.5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.6)';
                ctx.fill();
            } else {
                // Dimmed bar — 25% opacity
                ctx.globalAlpha = 0.25;
                ctx.fillStyle = isDefault ? 'rgba(255,255,255,0.5)' : color;
                ctx.fillRect(x - barW / 2, barY, barW, barH);
            }

            ctx.globalAlpha = 1;
        }

        // ── Threshold line ──────────────────────────────────────────────────
        ctx.save();
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.5)'; // #22c55e at 50%
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(0, thresholdY);
        ctx.lineTo(w, thresholdY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Threshold label — right side
        ctx.save();
        ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillStyle = 'rgba(34, 197, 94, 0.5)';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText('Threshold', w - 4, thresholdY - 3);
        ctx.restore();

        // ── Active count badge — top-right corner ───────────────────────────
        const badgeText = `${activeCount} / ${beats.length} beats active`;
        ctx.save();
        ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText(badgeText, w - 6, 5);
        ctx.restore();
    }, [audioAnalysis, targetThreshold]);

    // ── Animation loop — smoothly lerp threshold toward target ──────────────
    useEffect(() => {
        let running = true;

        const tick = () => {
            if (!running) return;

            const target = 1 - beatSensitivity;
            const current = animatedThreshold.current;
            const diff = target - current;

            // Lerp toward target
            if (Math.abs(diff) > 0.001) {
                animatedThreshold.current += diff * 0.15;
                draw();
                rafId.current = requestAnimationFrame(tick);
            } else {
                animatedThreshold.current = target;
                draw(); // final frame
            }
        };

        rafId.current = requestAnimationFrame(tick);

        return () => {
            running = false;
            cancelAnimationFrame(rafId.current);
        };
    }, [beatSensitivity, draw]);

    // ── Redraw on resize ────────────────────────────────────────────────────
    useEffect(() => {
        const ro = new ResizeObserver(() => draw());
        if (containerRef.current) ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, [draw]);

    if (!audioAnalysis) return null;

    return (
        <div
            ref={containerRef}
            className="w-full rounded-lg bg-white/[0.03] border border-white/5 overflow-hidden"
        >
            <canvas
                ref={canvasRef}
                className="w-full"
                style={{ height: CANVAS_HEIGHT }}
            />
        </div>
    );
};

export default BeatSensitivityGraph;
