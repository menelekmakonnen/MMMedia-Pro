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
    { id: 'white', name: 'White Veil',    colors: ['#ffffff', '#f0f0f0', '#ffffff', '#e8e8e8'] },
    { id: 'black', name: 'Dark Shadow',   colors: ['#000000', '#111111', '#0a0a0a', '#1a1a1a'] },
    { id: 'gray',  name: 'Neutral Mist',  colors: ['#808080', '#666666', '#999999', '#777777'] },
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

/** CSS radial-gradient string for previews/UI chips. */
export function gradientToCss(colors: string[], angle = 135): string {
    if (!colors.length) return 'transparent';
    return `radial-gradient(ellipse at center, ${colors.join(', ')})`;
}
