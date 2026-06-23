/**
 * Double-exposure gradients.
 *
 * The double-exposure effect can layer a procedural colour GRADIENT over a clip
 * (instead of, or as well as, a second video clip). Users pick one or more
 * gradients; the generator either cycles them one-per-clip or stacks several on
 * a single clip. Each gradient is just an ordered list of hex colour stops, so
 * the same definition drives the CSS preview and the FFmpeg render.
 */

export interface GradientPreset {
    id: string;
    name: string;
    /** 2–8 hex colour stops (e.g. '#ff6b6b'). */
    colors: string[];
}

export const DOUBLE_EXPOSURE_GRADIENTS: GradientPreset[] = [
    { id: 'sunset',   name: 'Sunset',     colors: ['#ff6b6b', '#feca57', '#ff9ff3'] },
    { id: 'ocean',    name: 'Ocean',      colors: ['#0abde3', '#48dbfb', '#1dd1a1'] },
    { id: 'neon',     name: 'Neon',       colors: ['#7c3aed', '#3b82f6', '#ec4899'] },
    { id: 'fire',     name: 'Fire',       colors: ['#f97316', '#ef4444', '#facc15'] },
    { id: 'mint',     name: 'Mint',       colors: ['#10b981', '#34d399', '#a7f3d0'] },
    { id: 'berry',    name: 'Berry',      colors: ['#db2777', '#9333ea', '#4f46e5'] },
    { id: 'gold',     name: 'Gold',       colors: ['#b45309', '#f59e0b', '#fde68a'] },
    { id: 'ice',      name: 'Ice',        colors: ['#0ea5e9', '#a5f3fc', '#e0f2fe'] },
    { id: 'vapor',    name: 'Vaporwave',  colors: ['#ff71ce', '#01cdfe', '#05ffa1'] },
    { id: 'noir',     name: 'Noir',       colors: ['#111827', '#6b7280', '#e5e7eb'] },
    { id: 'rose-gold',name: 'Rose Gold',  colors: ['#f9a8d4', '#fbcfe8', '#fde68a'] },
    { id: 'emerald',  name: 'Emerald',    colors: ['#064e3b', '#059669', '#6ee7b7'] },
];

const BY_ID: Record<string, GradientPreset> = Object.fromEntries(
    DOUBLE_EXPOSURE_GRADIENTS.map((g) => [g.id, g]),
);

export function getGradientPreset(id: string): GradientPreset | undefined {
    return BY_ID[id];
}

/** Resolve a preset id to its colour-stop array (empty if unknown). */
export function getGradientColors(id: string): string[] {
    return BY_ID[id]?.colors ?? [];
}

/** CSS linear-gradient string for previews/UI chips. */
export function gradientToCss(colors: string[], angle = 135): string {
    if (!colors.length) return 'transparent';
    return `linear-gradient(${angle}deg, ${colors.join(', ')})`;
}
