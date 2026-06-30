import React, { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import type { AudioAnalysisResult, BeatMarker, SegmentType } from '../../lib/audioAnalysis';
import type { ShakePolicy, ShakeType, BeatDropIntensity } from '../../types';

// ─── Props ──────────────────────────────────────────────────────────────────

interface UnifiedBeatVisualizerProps {
    audioAnalysis: AudioAnalysisResult;
    audioTrimStart: number;
    audioTrimEnd: number;

    onTrimChange: (start: number, end: number) => void;
    onSeek?: (time: number) => void;
    // Beat effect settings
    beatSensitivity: number;
    shakePolicy: ShakePolicy;
    shakeType: ShakeType | 'all';
    shakeIntensity: number;
    beatDropImpact: BeatDropIntensity;
    vibrationFlashPolicy: string;
    // Focus control — dims unrelated layers
    focusedLayer?: 'waveform' | 'beat-sensitivity' | 'shake' | 'beat-drop' | 'vibration-flash' | null;
}

interface TooltipState {
    visible: boolean;
    x: number;
    y: number;
    text: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const WAVEFORM_H = 80;
const EFFECTS_LANE_H = 24;
const MINIMAP_H = 16;
const MIN_ZOOM = 1;
const MAX_ZOOM = 10;
const ZOOM_SENSITIVITY = 0.002;
const BEAT_HIT_RADIUS = 8;
const TRIM_HIT_TOLERANCE = 8;

const BEAT_COLORS: Record<string, string> = {
    kick: '#ef4444',
    snare: '#f97316',
    hat: '#06b6d4',
    bass: '#a855f7',
    transient: '#ffffff',
};

const SEGMENT_COLORS: Record<string, string> = {
    intro: 'rgba(59,130,246,0.20)',
    buildup: 'rgba(234,179,8,0.30)',
    drop: 'rgba(239,68,68,0.30)',
    breakdown: 'rgba(6,182,212,0.20)',
    chorus: 'rgba(236,72,153,0.25)',
    verse: 'rgba(255,255,255,0.10)',
    outro: 'rgba(99,102,241,0.20)',
    bridge: 'rgba(52,211,153,0.20)',
};

const SEGMENT_LABEL_COLORS: Record<string, string> = {
    intro: 'rgba(96,165,250,0.55)',
    buildup: 'rgba(250,204,21,0.55)',
    drop: 'rgba(248,113,113,0.55)',
    breakdown: 'rgba(34,211,238,0.55)',
    chorus: 'rgba(244,114,182,0.55)',
    verse: 'rgba(255,255,255,0.35)',
    outro: 'rgba(129,140,248,0.55)',
    bridge: 'rgba(110,231,183,0.55)',
};

const SHAKE_COLORS: Record<string, string> = {
    impact: '#ef4444',
    handheld: '#f59e0b',
    earthquake: '#f97316',
    vibration: '#06b6d4',
    whip: '#a855f7',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeToX(time: number, duration: number, totalWidth: number, zoomLevel: number, panOffset: number): number {
    if (duration <= 0) return 0;
    const virtualWidth = totalWidth * zoomLevel;
    return (time / duration) * virtualWidth - panOffset;
}

function xToTime(x: number, duration: number, totalWidth: number, zoomLevel: number, panOffset: number): number {
    if (duration <= 0) return 0;
    const virtualWidth = totalWidth * zoomLevel;
    return ((x + panOffset) / virtualWidth) * duration;
}

function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

function hexToRgba(hex: string, alpha: number): string {
    const raw = hex.startsWith('#') ? hex.slice(1) : hex;
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

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

// ─── Handle ─────────────────────────────────────────────────────────────────

export interface UnifiedBeatVisualizerHandle {
    updatePlayhead: (time: number) => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const UnifiedBeatVisualizer = React.memo(React.forwardRef<UnifiedBeatVisualizerHandle, UnifiedBeatVisualizerProps>(
    ({
        audioAnalysis,
        audioTrimStart,
        audioTrimEnd,
        onTrimChange,
        onSeek,
        beatSensitivity,
        shakePolicy,
        shakeType,
        shakeIntensity,
        beatDropImpact,
        vibrationFlashPolicy,
        focusedLayer = null,
    }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // ── Zoom / Pan state
    const [zoomLevel, setZoomLevel] = useState(1);
    const [panOffset, setPanOffset] = useState(0);

    // ── Pan dragging
    const [isPanning, setIsPanning] = useState(false);
    const panStartX = useRef(0);
    const panStartOffset = useRef(0);

    // ── Trim handle dragging
    const [isDraggingTrim, setIsDraggingTrim] = useState<'start' | 'end' | null>(null);

    // ── Tooltip
    const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, text: '' });

    // ── Cursor
    const [cursor, setCursor] = useState<string>('crosshair');

    // ── Cached width
    const widthRef = useRef(0);

    // ── Playhead time (updated imperatively, not via props)
    const playheadTimeRef = useRef(0);

    // ── Animated threshold for beat sensitivity (lerp)
    const animatedThreshold = useRef(1 - beatSensitivity);
    const rafId = useRef<number>(0);

    const { beats, duration, segments, waveformData } = audioAnalysis;
    // InteractiveWaveform uses waveformAmplitudes — map from waveformData
    const waveformAmplitudes = waveformData;
    const safeDuration = duration > 0 ? duration : 1;

    // ── Clamp panOffset
    const clampPan = useCallback((pan: number, zoom: number, w: number): number => {
        const maxPan = w * zoom - w;
        return clamp(pan, 0, Math.max(0, maxPan));
    }, []);

    // ── Focus-mode alpha helper
    const layerAlpha = useCallback((layer: typeof focusedLayer): number => {
        if (!focusedLayer) return 1;
        return focusedLayer === layer ? 1 : 0.15;
    }, [focusedLayer]);

    // ═════════════════════════════════════════════════════════════════════════
    //  MAIN CANVAS DRAWING
    // ═════════════════════════════════════════════════════════════════════════
    const drawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();
        const w = rect.width;
        const showMinimap = zoomLevel > 1;
        const totalH = WAVEFORM_H + EFFECTS_LANE_H + (showMinimap ? MINIMAP_H : 0);
        widthRef.current = w;

        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(totalH * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${totalH}px`;
        ctx.scale(dpr, dpr);

        const virtualWidth = w * zoomLevel;

        // ── Full background
        ctx.clearRect(0, 0, w, totalH);
        const bgGrad = ctx.createLinearGradient(0, 0, 0, totalH);
        bgGrad.addColorStop(0, 'rgba(10, 5, 20, 0.9)');
        bgGrad.addColorStop(1, 'rgba(5, 2, 15, 0.95)');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, totalH);

        // ─────────────────────────────────────────────────────────────────────
        //  WAVEFORM ZONE (0 → WAVEFORM_H)
        // ─────────────────────────────────────────────────────────────────────
        const waveAlpha = layerAlpha('waveform');

        ctx.save();
        ctx.globalAlpha = waveAlpha;

        // 1. Amplitude bars
        if (waveformAmplitudes && waveformAmplitudes.length > 0) {
            const barCount = waveformAmplitudes.length;
            const barWidthVirtual = virtualWidth / barCount;
            const barGap = Math.max(0.5, barWidthVirtual * 0.15);

            const startIdx = Math.max(0, Math.floor((panOffset / virtualWidth) * barCount) - 1);
            const endIdx = Math.min(barCount, Math.ceil(((panOffset + w) / virtualWidth) * barCount) + 1);

            // Pre-create a single gradient for the full waveform height (reused for all bars)
            const waveGrad = ctx.createLinearGradient(0, WAVEFORM_H, 0, 0);
            waveGrad.addColorStop(0, 'rgba(88, 28, 135, 0.6)');
            waveGrad.addColorStop(0.5, 'rgba(147, 51, 234, 0.8)');
            waveGrad.addColorStop(1, 'rgba(192, 132, 252, 1)');
            ctx.fillStyle = waveGrad;

            for (let i = startIdx; i < endIdx; i++) {
                const amp = waveformAmplitudes[i];
                const barH = Math.max(1, amp * (WAVEFORM_H * 0.85));
                const x = i * barWidthVirtual - panOffset;
                const y = WAVEFORM_H - barH;

                ctx.fillRect(x + barGap / 2, y, Math.max(0.5, barWidthVirtual - barGap), barH);
            }

            // Glow pass
            ctx.save();
            ctx.globalAlpha = waveAlpha * 0.3;
            ctx.shadowBlur = 3;
            ctx.shadowColor = 'rgba(168, 85, 247, 0.6)';
            for (let i = startIdx; i < endIdx; i++) {
                const amp = waveformAmplitudes[i];
                const barH = Math.max(1, amp * (WAVEFORM_H * 0.85));
                const x = i * barWidthVirtual - panOffset;
                const y = WAVEFORM_H - barH;
                ctx.fillStyle = 'rgba(168, 85, 247, 0.6)';
                ctx.fillRect(x + barGap / 2, y, Math.max(0.5, barWidthVirtual - barGap), barH);
            }
            ctx.restore();
        }

        // 2. Segment overlays
        if (segments && segments.length > 0) {
            for (const seg of segments) {
                const sx = timeToX(seg.start, safeDuration, w, zoomLevel, panOffset);
                const ex = timeToX(seg.end, safeDuration, w, zoomLevel, panOffset);
                const segW = ex - sx;

                if (ex < 0 || sx > w) continue;

                ctx.fillStyle = SEGMENT_COLORS[seg.type] || 'rgba(255,255,255,0.05)';
                ctx.fillRect(sx, 0, segW, WAVEFORM_H);

                // Right border
                ctx.fillStyle = 'rgba(255,255,255,0.06)';
                ctx.fillRect(ex - 1, 0, 1, WAVEFORM_H);

                // Label
                if (segW > 20) {
                    ctx.save();
                    ctx.font = 'bold 8px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
                    ctx.fillStyle = SEGMENT_LABEL_COLORS[seg.type] || 'rgba(255,255,255,0.35)';
                    ctx.textBaseline = 'bottom';
                    const label = seg.type.toUpperCase();
                    const textX = clamp(sx + 4, 2, w - 40);
                    ctx.fillText(label, textX, WAVEFORM_H - 3);
                    ctx.restore();
                }
            }
        }

        // 3. Beat markers (colored vertical lines)
        if (beats && beats.length > 0) {
            const dotRadius = zoomLevel > 2 ? 4 : 2;

            for (const beat of beats) {
                const x = timeToX(beat.time, safeDuration, w, zoomLevel, panOffset);
                if (x < -10 || x > w + 10) continue;

                const color = BEAT_COLORS[beat.type] || '#ffffff';
                const lineH = Math.max(8, beat.energy * WAVEFORM_H * 0.7);

                // Vertical line
                ctx.beginPath();
                ctx.moveTo(x, WAVEFORM_H);
                ctx.lineTo(x, WAVEFORM_H - lineH);
                ctx.strokeStyle = color;
                ctx.globalAlpha = waveAlpha * 0.55;
                ctx.lineWidth = 1.2;
                ctx.stroke();

                // Glow
                ctx.beginPath();
                ctx.moveTo(x, WAVEFORM_H);
                ctx.lineTo(x, WAVEFORM_H - lineH);
                ctx.strokeStyle = color;
                ctx.globalAlpha = waveAlpha * 0.15;
                ctx.lineWidth = 4;
                ctx.stroke();

                // Dot at top
                ctx.beginPath();
                ctx.arc(x, WAVEFORM_H - lineH, dotRadius, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.globalAlpha = waveAlpha * 0.8;
                ctx.fill();

                // Downbeat emphasis
                if ((beat as any).downbeat) {
                    ctx.beginPath();
                    ctx.arc(x, WAVEFORM_H - lineH, dotRadius + 2, 0, Math.PI * 2);
                    ctx.strokeStyle = color;
                    ctx.globalAlpha = waveAlpha * 0.3;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }

                ctx.globalAlpha = waveAlpha;
            }
        }

        // 4. Energy contour (from segments)
        if (segments && segments.length > 0) {
            ctx.save();
            ctx.globalAlpha = waveAlpha * 0.45;
            ctx.strokeStyle = 'rgba(52, 211, 153, 0.8)';
            ctx.lineWidth = 1.5;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            ctx.beginPath();
            let firstPoint = true;
            for (const seg of segments) {
                const sx = timeToX(seg.start, safeDuration, w, zoomLevel, panOffset);
                const ex = timeToX(seg.end, safeDuration, w, zoomLevel, panOffset);
                const y = WAVEFORM_H - (seg.avgEnergy * WAVEFORM_H * 0.8);
                if (firstPoint) { ctx.moveTo(sx, y); firstPoint = false; }
                else ctx.lineTo(sx, y);
                ctx.lineTo(ex, y);
            }
            ctx.stroke();

            // Glow
            ctx.globalAlpha = waveAlpha * 0.15;
            ctx.lineWidth = 5;
            ctx.shadowBlur = 2;
            ctx.shadowColor = ctx.strokeStyle as string;
            ctx.beginPath();
            firstPoint = true;
            for (const seg of segments) {
                const sx = timeToX(seg.start, safeDuration, w, zoomLevel, panOffset);
                const ex = timeToX(seg.end, safeDuration, w, zoomLevel, panOffset);
                const y = WAVEFORM_H - (seg.avgEnergy * WAVEFORM_H * 0.8);
                if (firstPoint) { ctx.moveTo(sx, y); firstPoint = false; }
                else ctx.lineTo(sx, y);
                ctx.lineTo(ex, y);
            }
            ctx.stroke();
            ctx.restore();
        }

        // 5. Trim region dimming
        const trimLeftX = timeToX(audioTrimStart, safeDuration, w, zoomLevel, panOffset);
        const trimRightX = timeToX(audioTrimEnd, safeDuration, w, zoomLevel, panOffset);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        if (trimLeftX > 0) ctx.fillRect(0, 0, trimLeftX, WAVEFORM_H);
        if (trimRightX < w) ctx.fillRect(trimRightX, 0, w - trimRightX, WAVEFORM_H);

        // Edge glow
        for (const edgeX of [trimLeftX, trimRightX]) {
            if (edgeX >= -4 && edgeX <= w + 4) {
                const edgeGlow = ctx.createLinearGradient(edgeX - 4, 0, edgeX + 4, 0);
                edgeGlow.addColorStop(0, 'rgba(96, 165, 250, 0)');
                edgeGlow.addColorStop(0.5, 'rgba(96, 165, 250, 0.15)');
                edgeGlow.addColorStop(1, 'rgba(96, 165, 250, 0)');
                ctx.fillStyle = edgeGlow;
                ctx.fillRect(edgeX - 4, 0, 8, WAVEFORM_H);
            }
        }

        // Trim handles — bright white bars with glow
        for (const edgeX of [trimLeftX, trimRightX]) {
            if (edgeX >= -6 && edgeX <= w + 6) {
                ctx.save();
                ctx.shadowColor = 'rgba(255, 255, 255, 0.6)';
                ctx.shadowBlur = 6;
                ctx.fillStyle = '#ffffff';
                const handleW = 4;
                const handleH = 24;
                const handleY = (WAVEFORM_H - handleH) / 2;
                ctx.fillRect(edgeX - handleW / 2, handleY, handleW, handleH);
                ctx.restore();

                // Rounded cap dots
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.beginPath();
                ctx.arc(edgeX, handleY, 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(edgeX, handleY + handleH, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 6. Playhead
        const playheadX = timeToX(playheadTimeRef.current, safeDuration, w, zoomLevel, panOffset);
        if (playheadX >= -2 && playheadX <= w + 2) {
            ctx.save();
            ctx.shadowColor = 'rgba(239, 68, 68, 1)';
            ctx.shadowBlur = 8;
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(playheadX - 0.5, 0, 1, WAVEFORM_H);
            ctx.restore();

            ctx.beginPath();
            ctx.arc(playheadX, 0, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#ef4444';
            ctx.fill();
        }

        ctx.restore(); // end waveform globalAlpha

        // ─────────────────────────────────────────────────────────────────────
        //  EFFECTS LANE (WAVEFORM_H → WAVEFORM_H + EFFECTS_LANE_H)
        // ─────────────────────────────────────────────────────────────────────
        const laneTop = WAVEFORM_H;
        const laneH = EFFECTS_LANE_H;

        // Subtle separator line
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(0, laneTop, w, 1);

        // ── Beat sensitivity: energy mini-bars + threshold line ──
        const beatSensAlpha = layerAlpha('beat-sensitivity');
        const thresholdNorm = animatedThreshold.current; // 0→1, 0=all active, 1=none active
        const thresholdY = laneTop + thresholdNorm * laneH;

        if (beats && beats.length > 0) {
            ctx.save();
            let activeCount = 0;

            for (const beat of beats) {
                const x = timeToX(beat.time, safeDuration, w, zoomLevel, panOffset);
                if (x < -4 || x > w + 4) continue;

                const rawColor = BEAT_COLORS[beat.type] || '#ffffff80';
                const color = rawColor.length > 7 ? rawColor.slice(0, 7) : rawColor;

                const barH = Math.max(1, beat.energy * laneH * 0.9);
                const barY = laneTop + laneH - barH;
                const barW = Math.max(1.5, beat.energy > 0.7 ? 2.5 : 1.5);

                const beatTopY = barY;
                const isActive = beatTopY <= thresholdY;

                if (isActive) {
                    activeCount++;

                    // Glow
                    ctx.save();
                    ctx.globalAlpha = beatSensAlpha * 0.25;
                    ctx.shadowBlur = 3;
                    ctx.shadowColor = color;
                    ctx.fillStyle = color;
                    ctx.fillRect(x - barW, barY, barW * 3, barH);
                    ctx.restore();

                    // Main bar
                    ctx.globalAlpha = beatSensAlpha;
                    ctx.fillStyle = color;
                    ctx.fillRect(x - barW / 2, barY, barW, barH);

                    // Top dot
                    ctx.beginPath();
                    ctx.arc(x, barY, 1, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(255,255,255,0.6)';
                    ctx.globalAlpha = beatSensAlpha;
                    ctx.fill();
                } else {
                    ctx.globalAlpha = beatSensAlpha * 0.25;
                    ctx.fillStyle = color;
                    ctx.fillRect(x - barW / 2, barY, barW, barH);
                }

                ctx.globalAlpha = 1;
            }

            // Threshold dashed green line
            ctx.save();
            ctx.globalAlpha = beatSensAlpha;
            ctx.strokeStyle = 'rgba(34, 197, 94, 0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(0, thresholdY);
            ctx.lineTo(w, thresholdY);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();

            // Active count label
            ctx.save();
            ctx.globalAlpha = beatSensAlpha;
            ctx.font = '8px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.fillText(`${activeCount} / ${beats.length} beats active`, w - 4, laneTop + 2);
            ctx.restore();

            ctx.restore();
        }

        // ── Shake markers (colored dots at qualifying beats) ──
        const shakeAlpha = layerAlpha('shake');
        if (shakePolicy !== 'off' && beats && beats.length > 0) {
            ctx.save();
            ctx.globalAlpha = shakeAlpha;
            let shakeBeatIdx = 0;

            for (const beat of beats) {
                if (!shouldShakeAtBeat(beat, segments ?? [], shakePolicy)) continue;

                const x = timeToX(beat.time, safeDuration, w, zoomLevel, panOffset);
                if (x < -8 || x > w + 8) { shakeBeatIdx++; continue; }

                const type = resolveShakeType(shakeType, shakeBeatIdx);
                const color = SHAKE_COLORS[type] || '#ffffff';

                const dotSize = 3 + (shakeIntensity / 100) * 5;
                const energyScale = 0.6 + beat.energy * 0.4;
                const radius = dotSize * energyScale * 0.5;

                const dotY = laneTop + laneH / 2;

                // Glow
                const glowGrad = ctx.createRadialGradient(x, dotY, 0, x, dotY, radius + 4);
                glowGrad.addColorStop(0, hexToRgba(color, 0.3 * shakeAlpha));
                glowGrad.addColorStop(1, hexToRgba(color, 0));
                ctx.fillStyle = glowGrad;
                ctx.beginPath();
                ctx.arc(x, dotY, radius + 4, 0, Math.PI * 2);
                ctx.fill();

                // Main dot
                ctx.beginPath();
                ctx.arc(x, dotY, radius, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.globalAlpha = shakeAlpha * 0.9;
                ctx.fill();

                // White highlight
                ctx.beginPath();
                ctx.arc(x - radius * 0.2, dotY - radius * 0.2, radius * 0.3, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.globalAlpha = shakeAlpha;
                ctx.fill();

                ctx.globalAlpha = shakeAlpha;
                shakeBeatIdx++;
            }

            ctx.restore();
        }

        // ── Beat drop markers (orange diamonds at drop/chorus beats) ──
        const beatDropAlpha = layerAlpha('beat-drop');
        if (beatDropImpact !== 'off' && beats && beats.length > 0 && segments) {
            ctx.save();
            ctx.globalAlpha = beatDropAlpha;
            const dropSegments = segments.filter(s => s.type === 'drop' || s.type === 'chorus');

            for (const beat of beats) {
                const inDrop = dropSegments.some(s => beat.time >= s.start && beat.time < s.end);
                if (!inDrop) continue;

                const x = timeToX(beat.time, safeDuration, w, zoomLevel, panOffset);
                if (x < -8 || x > w + 8) continue;

                const diamondSize = 3 + beat.energy * 3;
                const diamondY = laneTop + laneH * 0.35;

                // Orange diamond
                ctx.beginPath();
                ctx.moveTo(x, diamondY - diamondSize);
                ctx.lineTo(x + diamondSize, diamondY);
                ctx.lineTo(x, diamondY + diamondSize);
                ctx.lineTo(x - diamondSize, diamondY);
                ctx.closePath();

                ctx.fillStyle = hexToRgba('#f97316', 0.8);
                ctx.fill();

                // Glow
                ctx.save();
                ctx.globalAlpha = beatDropAlpha * 0.3;
                ctx.shadowBlur = 2;
                ctx.shadowColor = '#f97316';
                ctx.fillStyle = '#f97316';
                ctx.beginPath();
                ctx.moveTo(x, diamondY - diamondSize - 1);
                ctx.lineTo(x + diamondSize + 1, diamondY);
                ctx.lineTo(x, diamondY + diamondSize + 1);
                ctx.lineTo(x - diamondSize - 1, diamondY);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }

            ctx.restore();
        }

        // ── Vibration flash markers (rose triangles at qualifying beats) ──
        const vibFlashAlpha = layerAlpha('vibration-flash');
        if (vibrationFlashPolicy !== 'off' && beats && beats.length > 0) {
            ctx.save();
            ctx.globalAlpha = vibFlashAlpha;

            for (const beat of beats) {
                // Vibration flash follows a policy similar to shakes
                let qualify = false;
                if (vibrationFlashPolicy === 'per-beat') {
                    qualify = true;
                } else if (vibrationFlashPolicy === 'every-clip') {
                    qualify = true;
                } else if (vibrationFlashPolicy === 'sparingly') {
                    const seg = segments?.find(s => beat.time >= s.start && beat.time < s.end);
                    const segType = seg?.type || 'verse';
                    qualify = (segType === 'drop' || segType === 'chorus') && beat.energy > 0.5;
                }
                if (!qualify) continue;

                const x = timeToX(beat.time, safeDuration, w, zoomLevel, panOffset);
                if (x < -8 || x > w + 8) continue;

                const triSize = 3 + beat.energy * 2;
                const triY = laneTop + laneH * 0.7;

                // Rose triangle (pointing up)
                ctx.beginPath();
                ctx.moveTo(x, triY - triSize);
                ctx.lineTo(x + triSize * 0.7, triY + triSize * 0.5);
                ctx.lineTo(x - triSize * 0.7, triY + triSize * 0.5);
                ctx.closePath();
                ctx.fillStyle = hexToRgba('#f43f5e', 0.75); // rose-500
                ctx.fill();
            }

            ctx.restore();
        }

        // ── Playhead in effects lane
        if (playheadX >= -2 && playheadX <= w + 2) {
            ctx.save();
            ctx.globalAlpha = 0.6;
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(playheadX - 0.5, laneTop, 1, laneH);
            ctx.restore();
        }

        // ─────────────────────────────────────────────────────────────────────
        //  MINIMAP (only when zoomed > 1×)
        // ─────────────────────────────────────────────────────────────────────
        if (showMinimap) {
            const mmTop = WAVEFORM_H + EFFECTS_LANE_H;
            const mmH = MINIMAP_H;

            // Separator
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.fillRect(0, mmTop, w, 1);

            // Background
            ctx.fillStyle = 'rgba(5, 2, 15, 0.9)';
            ctx.fillRect(0, mmTop, w, mmH);

            // Mini waveform
            if (waveformAmplitudes && waveformAmplitudes.length > 0) {
                const step = w / waveformAmplitudes.length;
                for (let i = 0; i < waveformAmplitudes.length; i++) {
                    const amp = waveformAmplitudes[i];
                    const barH = Math.max(0.5, amp * mmH * 0.8);
                    ctx.fillStyle = 'rgba(147, 51, 234, 0.5)';
                    ctx.fillRect(i * step, mmTop + mmH - barH, Math.max(0.5, step * 0.8), barH);
                }
            }

            // Viewport highlight
            const vpLeft = (panOffset / virtualWidth) * w;
            const vpWidth = (w / virtualWidth) * w;

            // Dimmed outside viewport
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            if (vpLeft > 0) ctx.fillRect(0, mmTop, vpLeft, mmH);
            if (vpLeft + vpWidth < w) ctx.fillRect(vpLeft + vpWidth, mmTop, w - (vpLeft + vpWidth), mmH);

            // Viewport border
            ctx.strokeStyle = 'rgba(147, 51, 234, 0.7)';
            ctx.lineWidth = 1;
            ctx.strokeRect(vpLeft, mmTop, vpWidth, mmH);

            // Playhead on minimap
            const playXMinimap = (playheadTimeRef.current / safeDuration) * w;
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(playXMinimap - 0.5, mmTop, 1, mmH);
        }

    }, [
        audioAnalysis, audioTrimStart, audioTrimEnd,
        zoomLevel, panOffset, safeDuration, beats, segments, waveformAmplitudes,
        beatSensitivity, shakePolicy, shakeType, shakeIntensity,
        beatDropImpact, vibrationFlashPolicy, focusedLayer, layerAlpha,
    ]);

    // Lightweight playhead updater — calls full redraw (reads playheadTimeRef.current)
    const drawPlayhead = useCallback(() => {
        drawCanvas();
    }, [drawCanvas]);

    useImperativeHandle(ref, () => ({
        updatePlayhead: (time: number) => {
            playheadTimeRef.current = time;
            drawPlayhead();
        },
    }), [drawPlayhead]);

    // ═════════════════════════════════════════════════════════════════════════
    //  ANIMATED THRESHOLD LERP
    // ═════════════════════════════════════════════════════════════════════════
    useEffect(() => {
        let running = true;

        const tick = () => {
            if (!running) return;

            const target = 1 - beatSensitivity;
            const current = animatedThreshold.current;
            const diff = target - current;

            if (Math.abs(diff) > 0.001) {
                animatedThreshold.current += diff * 0.15;
                drawCanvas();
                rafId.current = requestAnimationFrame(tick);
            } else {
                animatedThreshold.current = target;
                drawCanvas();
            }
        };

        rafId.current = requestAnimationFrame(tick);

        return () => {
            running = false;
            cancelAnimationFrame(rafId.current);
        };
    }, [beatSensitivity, drawCanvas]);

    // ═════════════════════════════════════════════════════════════════════════
    //  DRAW TRIGGER
    // ═════════════════════════════════════════════════════════════════════════
    useEffect(() => {
        drawCanvas();
    }, [drawCanvas]);

    // Redraw on container resize
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => {
            drawCanvas();
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [drawCanvas]);

    // ═════════════════════════════════════════════════════════════════════════
    //  WHEEL → ZOOM (cursor-centered)
    // ═════════════════════════════════════════════════════════════════════════
    useEffect(() => {
        const el = canvasRef.current;
        if (!el) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const w = rect.width;

            setZoomLevel(prevZoom => {
                const delta = -e.deltaY * ZOOM_SENSITIVITY;
                const newZoom = clamp(prevZoom * (1 + delta), MIN_ZOOM, MAX_ZOOM);
                const zoomRatio = newZoom / prevZoom;

                setPanOffset(prevPan => {
                    const newPan = mouseX * (zoomRatio - 1) + prevPan * zoomRatio;
                    return clampPan(newPan, newZoom, w);
                });

                return newZoom;
            });
        };

        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => el.removeEventListener('wheel', handleWheel);
    }, [clampPan]);

    // ═════════════════════════════════════════════════════════════════════════
    //  FIND BEAT NEAR CURSOR
    // ═════════════════════════════════════════════════════════════════════════
    const findBeatAtX = useCallback((clientX: number, clientY: number): BeatMarker | null => {
        const canvas = canvasRef.current;
        if (!canvas || !beats || beats.length === 0) return null;

        const rect = canvas.getBoundingClientRect();
        const mx = clientX - rect.left;
        const my = clientY - rect.top;
        const w = rect.width;

        let closest: BeatMarker | null = null;
        let closestDist = BEAT_HIT_RADIUS;

        for (const beat of beats) {
            const bx = timeToX(beat.time, safeDuration, w, zoomLevel, panOffset);
            const lineH = Math.max(8, beat.energy * WAVEFORM_H * 0.7);
            const by = WAVEFORM_H - lineH;

            const dx = Math.abs(mx - bx);
            const dy = Math.abs(my - by);
            const dist = Math.sqrt(dx * dx + dy * dy);

            const lineDist = dx;

            if ((dist < closestDist) || (lineDist < closestDist / 2 && my > by && my < WAVEFORM_H)) {
                closest = beat;
                closestDist = Math.min(dist, lineDist);
            }
        }

        return closest;
    }, [beats, safeDuration, zoomLevel, panOffset]);

    // ═════════════════════════════════════════════════════════════════════════
    //  MOUSE MOVE → TOOLTIP + CURSOR
    // ═════════════════════════════════════════════════════════════════════════
    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const w = rect.width;

        // Pan drag
        if (isPanning) {
            const dx = e.clientX - panStartX.current;
            const newPan = clampPan(panStartOffset.current - dx, zoomLevel, w);
            setPanOffset(newPan);
            return;
        }

        // Trim handle drag
        if (isDraggingTrim) {
            const time = xToTime(mx, safeDuration, w, zoomLevel, panOffset);
            const clamped = clamp(time, 0, safeDuration);

            if (isDraggingTrim === 'start') {
                const newStart = Math.min(clamped, audioTrimEnd - 0.1);
                onTrimChange(Math.max(0, newStart), audioTrimEnd);
            } else {
                const newEnd = Math.max(clamped, audioTrimStart + 0.1);
                onTrimChange(audioTrimStart, Math.min(safeDuration, newEnd));
            }
            return;
        }

        // Beat hover detection
        const beat = findBeatAtX(e.clientX, e.clientY);
        if (beat) {
            setTooltip({
                visible: true,
                x: e.clientX - rect.left,
                y: e.clientY - rect.top - 32,
                text: `${beat.time.toFixed(2)}s | ${beat.type} | energy: ${(beat.energy * 100).toFixed(0)}%`,
            });
            setCursor('pointer');
            return;
        }

        // Trim handle hover
        const trimLeftX = timeToX(audioTrimStart, safeDuration, w, zoomLevel, panOffset);
        const trimRightX = timeToX(audioTrimEnd, safeDuration, w, zoomLevel, panOffset);

        if (Math.abs(mx - trimLeftX) < TRIM_HIT_TOLERANCE || Math.abs(mx - trimRightX) < TRIM_HIT_TOLERANCE) {
            setCursor('ew-resize');
            setTooltip({ visible: false, x: 0, y: 0, text: '' });
            return;
        }

        // Default
        setCursor(zoomLevel > 1 ? 'grab' : 'crosshair');
        setTooltip({ visible: false, x: 0, y: 0, text: '' });
    }, [isPanning, isDraggingTrim, zoomLevel, panOffset, safeDuration, audioTrimStart, audioTrimEnd, findBeatAtX, onTrimChange, clampPan]);

    // ═════════════════════════════════════════════════════════════════════════
    //  MOUSE DOWN → START PAN / TRIM / SEEK
    // ═════════════════════════════════════════════════════════════════════════
    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const w = rect.width;

        // Check trim handle grab
        const trimLeftX = timeToX(audioTrimStart, safeDuration, w, zoomLevel, panOffset);
        const trimRightX = timeToX(audioTrimEnd, safeDuration, w, zoomLevel, panOffset);

        if (Math.abs(mx - trimLeftX) < TRIM_HIT_TOLERANCE) {
            setIsDraggingTrim('start');
            setCursor('ew-resize');
            return;
        }
        if (Math.abs(mx - trimRightX) < TRIM_HIT_TOLERANCE) {
            setIsDraggingTrim('end');
            setCursor('ew-resize');
            return;
        }

        // Beat click → seek
        const beat = findBeatAtX(e.clientX, e.clientY);
        if (beat && onSeek) {
            onSeek(beat.time);
            return;
        }

        // Pan drag (only when zoomed)
        if (zoomLevel > 1) {
            setIsPanning(true);
            panStartX.current = e.clientX;
            panStartOffset.current = panOffset;
            setCursor('grabbing');
        }
    }, [audioTrimStart, audioTrimEnd, safeDuration, zoomLevel, panOffset, findBeatAtX, onSeek]);

    // ═════════════════════════════════════════════════════════════════════════
    //  MOUSE UP
    // ═════════════════════════════════════════════════════════════════════════
    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
        setIsDraggingTrim(null);
        setCursor(zoomLevel > 1 ? 'grab' : 'crosshair');
    }, [zoomLevel]);

    // Global mouseup
    useEffect(() => {
        const handler = () => {
            if (isPanning || isDraggingTrim) {
                setIsPanning(false);
                setIsDraggingTrim(null);
                setCursor(zoomLevel > 1 ? 'grab' : 'crosshair');
            }
        };
        window.addEventListener('mouseup', handler);
        return () => window.removeEventListener('mouseup', handler);
    }, [isPanning, isDraggingTrim, zoomLevel]);

    // Global mousemove for drag outside canvas
    useEffect(() => {
        if (!isPanning && !isDraggingTrim) return;

        const handler = (e: MouseEvent) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const w = rect.width;

            if (isPanning) {
                const dx = e.clientX - panStartX.current;
                const newPan = clampPan(panStartOffset.current - dx, zoomLevel, w);
                setPanOffset(newPan);
            }

            if (isDraggingTrim) {
                const time = xToTime(mx, safeDuration, w, zoomLevel, panOffset);
                const clamped = clamp(time, 0, safeDuration);

                if (isDraggingTrim === 'start') {
                    const newStart = Math.min(clamped, audioTrimEnd - 0.1);
                    onTrimChange(Math.max(0, newStart), audioTrimEnd);
                } else {
                    const newEnd = Math.max(clamped, audioTrimStart + 0.1);
                    onTrimChange(audioTrimStart, Math.min(safeDuration, newEnd));
                }
            }
        };

        window.addEventListener('mousemove', handler);
        return () => window.removeEventListener('mousemove', handler);
    }, [isPanning, isDraggingTrim, zoomLevel, panOffset, safeDuration, audioTrimStart, audioTrimEnd, onTrimChange, clampPan]);

    const handleMouseLeave = useCallback(() => {
        if (!isPanning && !isDraggingTrim) {
            setTooltip({ visible: false, x: 0, y: 0, text: '' });
            setCursor('crosshair');
        }
    }, [isPanning, isDraggingTrim]);

    // ═════════════════════════════════════════════════════════════════════════
    //  RENDER
    // ═════════════════════════════════════════════════════════════════════════
    const showMinimap = zoomLevel > 1;
    const totalHeight = WAVEFORM_H + EFFECTS_LANE_H + (showMinimap ? MINIMAP_H : 0);

    return (
        <div
            ref={containerRef}
            className="relative overflow-hidden rounded-lg border border-white/10 bg-black/30 select-none"
            style={{ height: totalHeight }}
        >
            {/* Single unified canvas */}
            <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full"
                style={{ height: totalHeight, cursor }}
                onMouseMove={handleMouseMove}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
            />

            {/* Tooltip */}
            {tooltip.visible && (
                <div
                    className="absolute pointer-events-none z-50 px-2 py-1 rounded text-[10px] font-mono text-white/90 bg-black/80 border border-white/10 shadow-lg backdrop-blur-sm whitespace-nowrap"
                    style={{
                        left: clamp(tooltip.x, 0, (containerRef.current?.getBoundingClientRect().width ?? 200) - 180),
                        top: Math.max(0, tooltip.y),
                        transform: 'translateX(-50%)',
                    }}
                >
                    {tooltip.text}
                </div>
            )}

            {/* Zoom indicator badge */}
            {zoomLevel > 1 && (
                <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-bold text-white/50 bg-black/50 border border-white/5 pointer-events-none">
                    {zoomLevel.toFixed(1)}×
                </div>
            )}
        </div>
    );
})); // close forwardRef + memo

export default UnifiedBeatVisualizer;
