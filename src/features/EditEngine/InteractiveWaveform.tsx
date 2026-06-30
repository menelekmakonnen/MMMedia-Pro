import React, { useRef, useEffect, useCallback, useState } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface InteractiveWaveformProps {
    audioAnalysis: {
        beats: Array<{ time: number; type: string; energy: number; downbeat?: boolean }>;
        duration: number;
        segments: Array<{ start: number; end: number; type: string; avgEnergy: number }>;
        waveformAmplitudes?: number[];
    };
    audioTrimStart: number;
    audioTrimEnd: number;
    audioCurrentTime: number;
    onTrimChange: (start: number, end: number) => void;
    onSeek?: (time: number) => void;
}

interface TooltipState {
    visible: boolean;
    x: number;
    y: number;
    text: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const WAVEFORM_H = 80;
const MINIMAP_H = 16;
const MIN_ZOOM = 1;
const MAX_ZOOM = 10;
const ZOOM_SENSITIVITY = 0.002;
const BEAT_HIT_RADIUS = 8;      // px distance to "hover" a beat
const TRIM_HIT_TOLERANCE = 8;   // px distance to grab a trim handle

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

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert time (seconds) → x-pixel in the *virtual* (zoomed) coordinate space. */
function timeToX(time: number, duration: number, totalWidth: number, zoomLevel: number, panOffset: number): number {
    if (duration <= 0) return 0;
    const virtualWidth = totalWidth * zoomLevel;
    return (time / duration) * virtualWidth - panOffset;
}

/** Convert x-pixel on the canvas → time (seconds). */
function xToTime(x: number, duration: number, totalWidth: number, zoomLevel: number, panOffset: number): number {
    if (duration <= 0) return 0;
    const virtualWidth = totalWidth * zoomLevel;
    return ((x + panOffset) / virtualWidth) * duration;
}

/** Clamp a value between min and max. */
function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

// ─── Component ──────────────────────────────────────────────────────────────

export const InteractiveWaveform: React.FC<InteractiveWaveformProps> = ({
    audioAnalysis,
    audioTrimStart,
    audioTrimEnd,
    audioCurrentTime,
    onTrimChange,
    onSeek,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const minimapCanvasRef = useRef<HTMLCanvasElement>(null);

    // ── Zoom / Pan state ────────────────────────────────────────────────────
    const [zoomLevel, setZoomLevel] = useState(1);
    const [panOffset, setPanOffset] = useState(0);

    // ── Pan dragging ────────────────────────────────────────────────────────
    const [isPanning, setIsPanning] = useState(false);
    const panStartX = useRef(0);
    const panStartOffset = useRef(0);

    // ── Trim handle dragging ────────────────────────────────────────────────
    const [isDraggingTrim, setIsDraggingTrim] = useState<'start' | 'end' | null>(null);

    // ── Tooltip ─────────────────────────────────────────────────────────────
    const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, text: '' });

    // ── Cursor ──────────────────────────────────────────────────────────────
    const [cursor, setCursor] = useState<string>('crosshair');

    // ── Cached width for event handlers ─────────────────────────────────────
    const widthRef = useRef(0);

    const { beats, duration, segments, waveformAmplitudes } = audioAnalysis;
    const safeDuration = duration > 0 ? duration : 1;

    // ── Clamp panOffset to valid range ──────────────────────────────────────
    const clampPan = useCallback((pan: number, zoom: number, w: number): number => {
        const maxPan = w * zoom - w;
        return clamp(pan, 0, Math.max(0, maxPan));
    }, []);

    // ═════════════════════════════════════════════════════════════════════════
    //  MAIN CANVAS DRAWING
    // ═════════════════════════════════════════════════════════════════════════
    const drawWaveform = useCallback(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();
        const w = rect.width;
        const h = WAVEFORM_H;
        widthRef.current = w;

        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        ctx.scale(dpr, dpr);

        // ── Background ──────────────────────────────────────────────────────
        ctx.clearRect(0, 0, w, h);
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, 'rgba(10, 5, 20, 0.9)');
        bgGrad.addColorStop(1, 'rgba(5, 2, 15, 0.95)');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        const virtualWidth = w * zoomLevel;

        // ── 1. Waveform amplitude bars ──────────────────────────────────────
        if (waveformAmplitudes && waveformAmplitudes.length > 0) {
            const barCount = waveformAmplitudes.length;
            const barWidthVirtual = virtualWidth / barCount;
            const barGap = Math.max(0.5, barWidthVirtual * 0.15);

            // Only draw bars visible in the viewport
            const startIdx = Math.max(0, Math.floor((panOffset / virtualWidth) * barCount) - 1);
            const endIdx = Math.min(barCount, Math.ceil(((panOffset + w) / virtualWidth) * barCount) + 1);

            for (let i = startIdx; i < endIdx; i++) {
                const amp = waveformAmplitudes[i];
                const barH = Math.max(1, amp * (h * 0.85));
                const x = i * barWidthVirtual - panOffset;
                const y = h - barH;

                const grad = ctx.createLinearGradient(x, h, x, y);
                grad.addColorStop(0, 'rgba(88, 28, 135, 0.6)');
                grad.addColorStop(0.5, 'rgba(147, 51, 234, 0.8)');
                grad.addColorStop(1, 'rgba(192, 132, 252, 1)');

                ctx.fillStyle = grad;
                ctx.fillRect(x + barGap / 2, y, Math.max(0.5, barWidthVirtual - barGap), barH);
            }

            // Glow pass
            ctx.save();
            ctx.globalAlpha = 0.3;
            ctx.filter = 'blur(3px)';
            for (let i = startIdx; i < endIdx; i++) {
                const amp = waveformAmplitudes[i];
                const barH = Math.max(1, amp * (h * 0.85));
                const x = i * barWidthVirtual - panOffset;
                const y = h - barH;
                ctx.fillStyle = 'rgba(168, 85, 247, 0.6)';
                ctx.fillRect(x + barGap / 2, y, Math.max(0.5, barWidthVirtual - barGap), barH);
            }
            ctx.restore();
        }

        // ── 2. Segment overlays ─────────────────────────────────────────────
        if (segments && segments.length > 0) {
            for (const seg of segments) {
                const sx = timeToX(seg.start, safeDuration, w, zoomLevel, panOffset);
                const ex = timeToX(seg.end, safeDuration, w, zoomLevel, panOffset);
                const segW = ex - sx;

                // Skip off-screen segments
                if (ex < 0 || sx > w) continue;

                ctx.fillStyle = SEGMENT_COLORS[seg.type] || 'rgba(255,255,255,0.05)';
                ctx.fillRect(sx, 0, segW, h);

                // Right border
                ctx.fillStyle = 'rgba(255,255,255,0.06)';
                ctx.fillRect(ex - 1, 0, 1, h);

                // Label
                if (segW > 20) {
                    ctx.save();
                    ctx.font = 'bold 8px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
                    ctx.fillStyle = SEGMENT_LABEL_COLORS[seg.type] || 'rgba(255,255,255,0.35)';
                    ctx.textBaseline = 'bottom';
                    const label = seg.type.toUpperCase();
                    const textX = clamp(sx + 4, 2, w - 40);
                    ctx.fillText(label, textX, h - 3);
                    ctx.restore();
                }
            }
        }

        // ── 3. Beat markers ────────────────────────────────────────────────
        if (beats && beats.length > 0) {
            const dotRadius = zoomLevel > 2 ? 4 : 2;

            for (const beat of beats) {
                const x = timeToX(beat.time, safeDuration, w, zoomLevel, panOffset);
                if (x < -10 || x > w + 10) continue;

                const color = BEAT_COLORS[beat.type] || '#ffffff';
                const lineH = Math.max(8, beat.energy * h * 0.7);

                // Vertical line
                ctx.beginPath();
                ctx.moveTo(x, h);
                ctx.lineTo(x, h - lineH);
                ctx.strokeStyle = color;
                ctx.globalAlpha = 0.55;
                ctx.lineWidth = 1.2;
                ctx.stroke();

                // Glow behind the line
                ctx.beginPath();
                ctx.moveTo(x, h);
                ctx.lineTo(x, h - lineH);
                ctx.strokeStyle = color;
                ctx.globalAlpha = 0.15;
                ctx.lineWidth = 4;
                ctx.stroke();

                // Dot at the top
                ctx.beginPath();
                ctx.arc(x, h - lineH, dotRadius, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.8;
                ctx.fill();

                // Downbeat emphasis
                if (beat.downbeat) {
                    ctx.beginPath();
                    ctx.arc(x, h - lineH, dotRadius + 2, 0, Math.PI * 2);
                    ctx.strokeStyle = color;
                    ctx.globalAlpha = 0.3;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }

                ctx.globalAlpha = 1;
            }
        }

        // ── 4. Energy contour (synthesized from segments if no raw data) ────
        // The existing code uses an energyContour array. We synthesize one
        // from segments for a smooth energy line.
        if (segments && segments.length > 0) {
            ctx.save();
            ctx.globalAlpha = 0.45;
            ctx.strokeStyle = 'rgba(52, 211, 153, 0.8)';
            ctx.lineWidth = 1.5;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            ctx.beginPath();
            let firstPoint = true;
            for (const seg of segments) {
                const sx = timeToX(seg.start, safeDuration, w, zoomLevel, panOffset);
                const ex = timeToX(seg.end, safeDuration, w, zoomLevel, panOffset);
                const y = h - (seg.avgEnergy * h * 0.8);

                if (firstPoint) { ctx.moveTo(sx, y); firstPoint = false; }
                else ctx.lineTo(sx, y);
                ctx.lineTo(ex, y);
            }
            ctx.stroke();

            // Subtle glow
            ctx.globalAlpha = 0.15;
            ctx.lineWidth = 5;
            ctx.filter = 'blur(2px)';
            ctx.beginPath();
            firstPoint = true;
            for (const seg of segments) {
                const sx = timeToX(seg.start, safeDuration, w, zoomLevel, panOffset);
                const ex = timeToX(seg.end, safeDuration, w, zoomLevel, panOffset);
                const y = h - (seg.avgEnergy * h * 0.8);
                if (firstPoint) { ctx.moveTo(sx, y); firstPoint = false; }
                else ctx.lineTo(sx, y);
                ctx.lineTo(ex, y);
            }
            ctx.stroke();
            ctx.restore();
        }

        // ── 5. Trim region dimming ─────────────────────────────────────────
        const trimLeftX = timeToX(audioTrimStart, safeDuration, w, zoomLevel, panOffset);
        const trimRightX = timeToX(audioTrimEnd, safeDuration, w, zoomLevel, panOffset);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        if (trimLeftX > 0) ctx.fillRect(0, 0, trimLeftX, h);
        if (trimRightX < w) ctx.fillRect(trimRightX, 0, w - trimRightX, h);

        // Edge glow at trim boundaries
        for (const edgeX of [trimLeftX, trimRightX]) {
            if (edgeX >= -4 && edgeX <= w + 4) {
                const edgeGlow = ctx.createLinearGradient(edgeX - 4, 0, edgeX + 4, 0);
                edgeGlow.addColorStop(0, 'rgba(96, 165, 250, 0)');
                edgeGlow.addColorStop(0.5, 'rgba(96, 165, 250, 0.15)');
                edgeGlow.addColorStop(1, 'rgba(96, 165, 250, 0)');
                ctx.fillStyle = edgeGlow;
                ctx.fillRect(edgeX - 4, 0, 8, h);
            }
        }

        // Trim handles — bright white bars with glow
        for (const edgeX of [trimLeftX, trimRightX]) {
            if (edgeX >= -6 && edgeX <= w + 6) {
                // Glow
                ctx.save();
                ctx.shadowColor = 'rgba(255, 255, 255, 0.6)';
                ctx.shadowBlur = 6;
                ctx.fillStyle = '#ffffff';
                const handleW = 4;
                const handleH = 24;
                const handleY = (h - handleH) / 2;
                ctx.fillRect(edgeX - handleW / 2, handleY, handleW, handleH);
                ctx.restore();

                // Rounded cap dots at top/bottom of handle
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.beginPath();
                ctx.arc(edgeX, handleY, 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(edgeX, handleY + handleH, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // ── 6. Playhead indicator ──────────────────────────────────────────
        const playheadX = timeToX(audioCurrentTime, safeDuration, w, zoomLevel, panOffset);
        if (playheadX >= -2 && playheadX <= w + 2) {
            ctx.save();
            ctx.shadowColor = 'rgba(239, 68, 68, 1)';
            ctx.shadowBlur = 8;
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(playheadX - 0.5, 0, 1, h);
            ctx.restore();

            // Playhead dot
            ctx.beginPath();
            ctx.arc(playheadX, 0, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#ef4444';
            ctx.fill();
        }

    }, [audioAnalysis, audioTrimStart, audioTrimEnd, audioCurrentTime, zoomLevel, panOffset, safeDuration, beats, segments, waveformAmplitudes]);

    // ═════════════════════════════════════════════════════════════════════════
    //  MINIMAP DRAWING
    // ═════════════════════════════════════════════════════════════════════════
    const drawMinimap = useCallback(() => {
        if (zoomLevel <= 1) return;

        const canvas = minimapCanvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const w = container.getBoundingClientRect().width;
        const h = MINIMAP_H;

        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        ctx.scale(dpr, dpr);

        // Background
        ctx.fillStyle = 'rgba(5, 2, 15, 0.9)';
        ctx.fillRect(0, 0, w, h);

        // Mini waveform
        if (waveformAmplitudes && waveformAmplitudes.length > 0) {
            const step = w / waveformAmplitudes.length;
            for (let i = 0; i < waveformAmplitudes.length; i++) {
                const amp = waveformAmplitudes[i];
                const barH = Math.max(0.5, amp * h * 0.8);
                ctx.fillStyle = 'rgba(147, 51, 234, 0.5)';
                ctx.fillRect(i * step, h - barH, Math.max(0.5, step * 0.8), barH);
            }
        }

        // Viewport highlight
        const virtualWidth = w * zoomLevel;
        const vpLeft = (panOffset / virtualWidth) * w;
        const vpWidth = (w / virtualWidth) * w;

        // Dimmed outside viewport
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        if (vpLeft > 0) ctx.fillRect(0, 0, vpLeft, h);
        if (vpLeft + vpWidth < w) ctx.fillRect(vpLeft + vpWidth, 0, w - (vpLeft + vpWidth), h);

        // Viewport border
        ctx.strokeStyle = 'rgba(147, 51, 234, 0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(vpLeft, 0, vpWidth, h);

        // Playhead on minimap
        const playX = (audioCurrentTime / safeDuration) * w;
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(playX - 0.5, 0, 1, h);

    }, [zoomLevel, panOffset, waveformAmplitudes, audioCurrentTime, safeDuration]);

    // ═════════════════════════════════════════════════════════════════════════
    //  DRAW TRIGGER
    // ═════════════════════════════════════════════════════════════════════════
    useEffect(() => {
        drawWaveform();
        drawMinimap();
    }, [drawWaveform, drawMinimap]);

    // Redraw on container resize
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => {
            drawWaveform();
            drawMinimap();
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [drawWaveform, drawMinimap]);

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
                    // Keep the time under the cursor fixed
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
    const findBeatAtX = useCallback((clientX: number, clientY: number): typeof beats[number] | null => {
        const canvas = canvasRef.current;
        if (!canvas || !beats || beats.length === 0) return null;

        const rect = canvas.getBoundingClientRect();
        const mx = clientX - rect.left;
        const my = clientY - rect.top;
        const w = rect.width;

        let closest: typeof beats[number] | null = null;
        let closestDist = BEAT_HIT_RADIUS;

        for (const beat of beats) {
            const bx = timeToX(beat.time, safeDuration, w, zoomLevel, panOffset);
            const lineH = Math.max(8, beat.energy * WAVEFORM_H * 0.7);
            const by = WAVEFORM_H - lineH;

            // Check proximity to the beat's vertical line top (dot position)
            const dx = Math.abs(mx - bx);
            const dy = Math.abs(my - by);
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Also accept if cursor is just near the x-axis of the beat line
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

        // Panning drag
        if (isPanning) {
            const dx = e.clientX - panStartX.current;
            const newPan = clampPan(panStartOffset.current - dx, zoomLevel, w);
            setPanOffset(newPan);
            return;
        }

        // Trim handle dragging
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

        // Default cursor
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

        // Check for trim handle grab
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

        // Check for beat click → seek
        const beat = findBeatAtX(e.clientX, e.clientY);
        if (beat && onSeek) {
            onSeek(beat.time);
            return;
        }

        // Pan drag (only when zoomed in)
        if (zoomLevel > 1) {
            setIsPanning(true);
            panStartX.current = e.clientX;
            panStartOffset.current = panOffset;
            setCursor('grabbing');
        }
    }, [audioTrimStart, audioTrimEnd, safeDuration, zoomLevel, panOffset, findBeatAtX, onSeek]);

    // ═════════════════════════════════════════════════════════════════════════
    //  MOUSE UP → STOP DRAG
    // ═════════════════════════════════════════════════════════════════════════
    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
        setIsDraggingTrim(null);
        setCursor(zoomLevel > 1 ? 'grab' : 'crosshair');
    }, [zoomLevel]);

    // Global mouseup to handle release outside canvas
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

    // Global mousemove for dragging that escapes the canvas
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
    const totalHeight = zoomLevel > 1 ? WAVEFORM_H + MINIMAP_H : WAVEFORM_H;

    return (
        <div
            ref={containerRef}
            className="relative overflow-hidden rounded-lg border border-white/10 bg-black/30 select-none"
            style={{ height: totalHeight }}
        >
            {/* Main waveform canvas */}
            <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full"
                style={{ height: WAVEFORM_H, cursor }}
                onMouseMove={handleMouseMove}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
            />

            {/* Minimap canvas (only when zoomed) */}
            {zoomLevel > 1 && (
                <canvas
                    ref={minimapCanvasRef}
                    className="absolute bottom-0 left-0 w-full"
                    style={{ height: MINIMAP_H }}
                />
            )}

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
};

export default InteractiveWaveform;
