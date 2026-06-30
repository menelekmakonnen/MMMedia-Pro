// ══════════════════════════════════════════════════════════════════════════════
// masks.ts — Effect masks (Premiere ▸ ellipse / 4-point rectangle / free pen).
// Factories + the CSS preview projection (clip-path / mask-image) used by the
// Program Monitor. Masks live on EffectComponent.masks.
// ══════════════════════════════════════════════════════════════════════════════

import type { EffectMask, EffectComponent, Point2D } from './effectControls';

let _m = 0;
const uid = () => { try { return crypto.randomUUID(); } catch { return `mask-${Date.now()}-${_m++}`; } };

export function makeEllipseMask(width: number, height: number, index = 1): EffectMask {
  return {
    id: uid(), name: `Mask (${index})`, mode: 'ellipse',
    x: width / 2, y: height / 2, width: width * 0.5, height: height * 0.5,
    rotation: 0, feather: Math.round(height * 0.02), expansion: 0, opacity: 100, inverted: false, enabled: true,
  };
}

export function makeRectangleMask(width: number, height: number, index = 1): EffectMask {
  const w = width * 0.5, h = height * 0.5, cx = width / 2, cy = height / 2;
  const pts: Point2D[] = [
    { x: cx - w / 2, y: cy - h / 2 }, { x: cx + w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy + h / 2 }, { x: cx - w / 2, y: cy + h / 2 },
  ];
  return {
    id: uid(), name: `Mask (${index})`, mode: 'rectangle',
    x: cx, y: cy, width: w, height: h, rotation: 0, feather: 0, expansion: 0,
    opacity: 100, inverted: false, points: pts, enabled: true,
  };
}

export function makeFreeMask(width: number, height: number, index = 1): EffectMask {
  const cx = width / 2, cy = height / 2, r = Math.min(width, height) * 0.25;
  // Seed a pentagon the user can reshape.
  const pts: Point2D[] = Array.from({ length: 5 }).map((_, i) => {
    const a = (-Math.PI / 2) + (i * 2 * Math.PI) / 5;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
  return {
    id: uid(), name: `Mask (${index})`, mode: 'free',
    x: cx, y: cy, width: r * 2, height: r * 2, rotation: 0, feather: 0, expansion: 0,
    opacity: 100, inverted: false, points: pts, enabled: true,
  };
}

export interface MaskCss {
  clipPath?: string;
  maskImage?: string;
  WebkitMaskImage?: string;
  opacity?: number;
}

/**
 * Project the first enabled mask of a component to CSS for the preview element.
 * Ellipse uses a radial-gradient mask (supports feather + inversion); polygonal
 * masks use clip-path. Multi-mask compositing is approximated by the first mask.
 */
export function maskToCss(comp: EffectComponent | undefined, seqW: number, seqH: number): MaskCss | null {
  const mask = comp?.masks?.find((m) => m.enabled);
  if (!mask) return null;
  const pX = (v: number) => (v / seqW) * 100;
  const pY = (v: number) => (v / seqH) * 100;

  if (mask.mode === 'ellipse') {
    const rw = pX(mask.width / 2 + mask.expansion);
    const rh = pY(mask.height / 2 + mask.expansion);
    const cx = pX(mask.x), cy = pY(mask.y);
    const featherPct = Math.max(0, Math.min(99, pY(mask.feather)));
    const inner = Math.max(0, 100 - featherPct);
    const stops = mask.inverted
      ? `transparent ${inner}%, black 100%`
      : `black ${inner}%, transparent 100%`;
    const grad = `radial-gradient(ellipse ${rw.toFixed(2)}% ${rh.toFixed(2)}% at ${cx.toFixed(2)}% ${cy.toFixed(2)}%, ${stops})`;
    return { maskImage: grad, WebkitMaskImage: grad, opacity: mask.opacity / 100 };
  }

  // Polygon (rectangle / free)
  const pts = mask.points ?? [];
  if (pts.length < 3) return null;
  const poly = pts.map((p) => `${pX(p.x).toFixed(2)}% ${pY(p.y).toFixed(2)}%`).join(', ');
  // CSS clip-path can't invert a polygon simply; inverted polygons fall back to a
  // full-frame wind with a hole (even-odd not supported in clip-path) → approximate
  // by leaving uninverted for preview.
  return { clipPath: `polygon(${poly})`, opacity: mask.opacity / 100 };
}

export const MASK_FACTORIES = { ellipse: makeEllipseMask, rectangle: makeRectangleMask, free: makeFreeMask };
