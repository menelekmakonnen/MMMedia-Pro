import React, { useRef, useEffect } from 'react';
import type { SpeedCurvePreset } from '../../types';

interface SpeedCurveVisualizerProps {
  preset: SpeedCurvePreset;
  width?: number;
  height?: number;
  color?: string;
}

/**
 * Returns an array of 100 Y-values (0–2 scale, where 1 = normal speed)
 * representing the speed curve shape for the given preset.
 */
export function getSpeedCurvePoints(preset: SpeedCurvePreset): number[] {
  const points: number[] = [];
  const N = 100;

  for (let i = 0; i < N; i++) {
    const t = i / (N - 1); // normalized 0→1

    let y: number;

    switch (preset) {
      case 'constant':
        y = 1.0;
        break;

      case 'ramp-up':
        // Quadratic ease-in from 0.5 → 1.5
        y = 0.5 + t * t * 1.0;
        break;

      case 'ramp-down':
        // Quadratic ease-out from 1.5 → 0.5
        y = 1.5 - t * t * 1.0;
        break;

      case 's-curve':
        // Sigmoid-like sine from 0.5 → 1.5 → 0.5
        y = 1.0 + 0.5 * Math.sin(t * Math.PI * 2 - Math.PI / 2);
        break;

      case 'ramp-freeze':
        // Ramp up in first 60%, then plateau at 1.5
        if (t <= 0.6) {
          const tNorm = t / 0.6;
          y = 0.5 + tNorm * tNorm * 1.0;
        } else {
          y = 1.5;
        }
        break;

      case 'burst-landing':
        // Spike to 2.0 quickly (first 20%), then exponentially settle toward 1.0
        if (t <= 0.2) {
          y = 2.0 * (t / 0.2);
        } else {
          y = 1.0 + 1.0 * Math.exp(-5 * ((t - 0.2) / 0.8));
        }
        break;

      case 'oscillating':
        // Sine wave centered at 1.0, amplitude 0.4
        y = 1.0 + 0.4 * Math.sin(t * Math.PI * 4);
        break;

      default:
        y = 1.0;
    }

    points.push(y);
  }

  return points;
}

/**
 * Canvas-based visualizer that renders a speed curve shape
 * with grid lines, reference markers, gradient fill, and axis labels.
 */
export const SpeedCurveVisualizer: React.FC<SpeedCurveVisualizerProps> = ({
  preset,
  width: w = 120,
  height: h = 60,
  color = '#a855f7',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // --- HiDPI scaling ---
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    // --- Padding ---
    const padL = 16;
    const padR = 12;
    const padT = 8;
    const padB = 14;

    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    // --- Background ---
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    // --- Grid lines ---
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 0.5;

    // 4 horizontal grid lines
    for (let i = 0; i < 4; i++) {
      const gy = padT + (plotH / 4) * (i + 0.5);
      ctx.beginPath();
      ctx.moveTo(padL, gy);
      ctx.lineTo(w - padR, gy);
      ctx.stroke();
    }

    // 4 vertical grid lines
    for (let i = 0; i < 4; i++) {
      const gx = padL + (plotW / 4) * (i + 0.5);
      ctx.beginPath();
      ctx.moveTo(gx, padT);
      ctx.lineTo(gx, h - padB);
      ctx.stroke();
    }

    // --- Reference line at Y=1x ---
    const refY = padT + plotH * (1 - 1.0 / 2.0); // y=1 on 0–2 scale
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, refY);
    ctx.lineTo(w - padR, refY);
    ctx.stroke();
    ctx.setLineDash([]);

    // --- Speed curve points ---
    const points = getSpeedCurvePoints(preset);

    // Map point index → canvas coordinates
    const mapX = (i: number) => padL + (i / (points.length - 1)) * plotW;
    const mapY = (val: number) => padT + plotH * (1 - val / 2.0);

    // --- Gradient for curve ---
    const gradient = ctx.createLinearGradient(padL, 0, w - padR, 0);
    gradient.addColorStop(0, '#a855f7');
    gradient.addColorStop(1, '#3b82f6');

    // --- Draw curve line ---
    ctx.beginPath();
    ctx.moveTo(mapX(0), mapY(points[0]));
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(mapX(i), mapY(points[i]));
    }
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.stroke();

    // --- Filled area under curve ---
    ctx.beginPath();
    ctx.moveTo(mapX(0), mapY(points[0]));
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(mapX(i), mapY(points[i]));
    }
    ctx.lineTo(mapX(points.length - 1), h - padB);
    ctx.lineTo(mapX(0), h - padB);
    ctx.closePath();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // --- Axis labels ---
    ctx.font = '8px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';

    // "0" bottom-left
    ctx.textAlign = 'left';
    ctx.fillText('0', padL, h - 2);

    // "T" bottom-right
    ctx.textAlign = 'right';
    ctx.fillText('T', w - padR, h - 2);

    // "2x" top-left Y label
    ctx.textAlign = 'left';
    ctx.fillText('2x', 1, padT + 3);

    // "0x" bottom Y label
    ctx.fillText('0x', 1, h - padB);
  }, [preset, w, h, color]);

  return (
    <canvas
      ref={canvasRef}
      style={{ borderRadius: 6, display: 'block' }}
    />
  );
};
