// ══════════════════════════════════════════════════════════════════════════════
// textOverlay.ts — Text/Title Overlay System
// Defines types, defaults, and FFmpeg drawtext filter construction for
// rendering text overlays onto video clips during export.
// ══════════════════════════════════════════════════════════════════════════════

export type TextPosition =
    | 'top-left' | 'top-center' | 'top-right'
    | 'center-left' | 'center' | 'center-right'
    | 'bottom-left' | 'bottom-center' | 'bottom-right';

export type TextAnimation =
    | 'none' | 'fade'
    | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right'
    | 'typewriter';

export interface TextOverlay {
    id: string;
    text: string;
    fontFamily: string;        // e.g., 'Arial', 'Impact', 'Courier New'
    fontSize: number;          // px
    fontColor: string;         // hex (#FFFFFF)
    fontWeight: 'normal' | 'bold';
    backgroundColor?: string;  // hex with alpha, or empty for none
    borderColor?: string;      // text outline color
    borderWidth?: number;      // text outline width
    position: TextPosition;
    offsetX: number;           // px offset from position
    offsetY: number;           // px offset from position
    startTime: number;         // seconds (relative to clip start)
    endTime: number;           // seconds (relative to clip start)
    animation: TextAnimation;
    animationDuration: number; // seconds for fade/slide
    opacity: number;           // 0-1
    shadow: boolean;
}

export const DEFAULT_TEXT_OVERLAY: Omit<TextOverlay, 'id'> = {
    text: 'Your Text Here',
    fontFamily: 'Arial',
    fontSize: 48,
    fontColor: '#FFFFFF',
    fontWeight: 'bold',
    position: 'bottom-center',
    offsetX: 0,
    offsetY: 0,
    startTime: 0,
    endTime: 5,
    animation: 'fade',
    animationDuration: 0.5,
    opacity: 1.0,
    shadow: true,
};

// ── FFmpeg Text Escaping ────────────────────────────────────────────────────

/**
 * Escape text for safe inclusion in FFmpeg drawtext filter.
 * FFmpeg drawtext requires specific escaping for colons, single quotes,
 * backslashes, semicolons, and brackets.
 */
function escapeDrawtext(text: string): string {
    return text
        .replace(/\\/g, '\\\\\\\\')    // backslash → escaped
        .replace(/'/g, "'\\\\\\''")     // single-quote → '\''
        .replace(/:/g, '\\\\:')        // colon → \:
        .replace(/;/g, '\\\\;')        // semicolon → \;
        .replace(/%/g, '%%')           // percent → %%
        .replace(/\[/g, '\\\\[')       // brackets
        .replace(/\]/g, '\\\\]')
        .replace(/\n/g, '\\n');         // newlines
}

/**
 * Convert hex color string (#RRGGBB or #RRGGBBAA) to FFmpeg color format.
 * FFmpeg uses 0xRRGGBB or 0xRRGGBBAA.
 */
function hexToFfmpegColor(hex: string): string {
    if (!hex || hex.length < 4) return 'white';
    const clean = hex.replace('#', '');
    return `0x${clean}`;
}

// ── Position Mapping ────────────────────────────────────────────────────────

/**
 * Map TextPosition to FFmpeg x/y expressions.
 * Positions use 20px padding from edges and support per-overlay pixel offsets.
 */
function positionToXY(position: TextPosition, offsetX: number, offsetY: number): { x: string; y: string } {
    const ox = offsetX >= 0 ? `+${offsetX}` : `${offsetX}`;
    const oy = offsetY >= 0 ? `+${offsetY}` : `${offsetY}`;

    switch (position) {
        case 'top-left':
            return { x: `20${ox}`, y: `20${oy}` };
        case 'top-center':
            return { x: `(w-text_w)/2${ox}`, y: `20${oy}` };
        case 'top-right':
            return { x: `w-text_w-20${ox}`, y: `20${oy}` };
        case 'center-left':
            return { x: `20${ox}`, y: `(h-text_h)/2${oy}` };
        case 'center':
            return { x: `(w-text_w)/2${ox}`, y: `(h-text_h)/2${oy}` };
        case 'center-right':
            return { x: `w-text_w-20${ox}`, y: `(h-text_h)/2${oy}` };
        case 'bottom-left':
            return { x: `20${ox}`, y: `h-text_h-20${oy}` };
        case 'bottom-center':
            return { x: `(w-text_w)/2${ox}`, y: `h-text_h-60${oy}` };
        case 'bottom-right':
            return { x: `w-text_w-20${ox}`, y: `h-text_h-20${oy}` };
        default:
            return { x: `(w-text_w)/2${ox}`, y: `(h-text_h)/2${oy}` };
    }
}

// ── Alpha Expression Builder ────────────────────────────────────────────────

/**
 * Build the alpha expression for fade animation timing.
 *
 * For 'fade' animation:
 *   - Fade in for animationDuration seconds after startTime
 *   - Hold at opacity
 *   - Fade out for animationDuration seconds before endTime
 *
 * For 'none':
 *   - Constant opacity value
 */
function buildAlphaExpression(overlay: TextOverlay): string {
    const { startTime, endTime, animation, animationDuration, opacity } = overlay;
    const START = startTime.toFixed(4);
    const END = endTime.toFixed(4);
    const DUR = animationDuration.toFixed(4);
    const OP = opacity.toFixed(4);

    if (animation === 'fade' && animationDuration > 0) {
        // Fade in → hold → fade out
        return `'if(lt(t-${START},${DUR}),(t-${START})/${DUR}*${OP},if(gt(t,${END}-${DUR}),(${END}-t)/${DUR}*${OP},${OP}))'`;
    }

    // No animation — constant alpha
    return `${OP}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN BUILDER
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Build an FFmpeg drawtext filter string for a single text overlay.
 *
 * Result format:
 *   drawtext=text='escaped':font=Arial:fontsize=48:fontcolor=white:x=...:y=...:enable=...:alpha=...
 *
 * @param overlay - The text overlay configuration
 * @param clipDurationSec - Duration of the clip in seconds (used for timing clamp)
 * @param outputWidth - Output video width in pixels (currently unused, reserved for future scaling)
 * @param outputHeight - Output video height in pixels (currently unused, reserved for future scaling)
 * @returns FFmpeg drawtext filter string, or empty string if invalid
 */
export function buildDrawtextFilter(
    overlay: TextOverlay,
    clipDurationSec: number,
    outputWidth: number,
    outputHeight: number
): string {
    if (!overlay.text || overlay.text.trim().length === 0) return '';

    const parts: string[] = [];

    // Text content (escaped)
    parts.push(`text='${escapeDrawtext(overlay.text)}'`);

    // Font
    parts.push(`font='${overlay.fontFamily}'`);
    parts.push(`fontsize=${overlay.fontSize}`);
    parts.push(`fontcolor=${hexToFfmpegColor(overlay.fontColor)}`);

    // Position
    const { x, y } = positionToXY(overlay.position, overlay.offsetX, overlay.offsetY);
    parts.push(`x=${x}`);
    parts.push(`y=${y}`);

    // Timing — clamp end to clip duration
    const start = Math.max(0, overlay.startTime);
    const end = Math.min(overlay.endTime, clipDurationSec);
    parts.push(`enable='between(t,${start.toFixed(4)},${end.toFixed(4)})'`);

    // Alpha / animation
    const alphaExpr = buildAlphaExpression(overlay);
    parts.push(`alpha=${alphaExpr}`);

    // Shadow
    if (overlay.shadow) {
        parts.push(`shadowcolor=black@0.5`);
        parts.push(`shadowx=2`);
        parts.push(`shadowy=2`);
    }

    // Border (text outline)
    if (overlay.borderWidth && overlay.borderWidth > 0 && overlay.borderColor) {
        parts.push(`borderw=${overlay.borderWidth}`);
        parts.push(`bordercolor=${hexToFfmpegColor(overlay.borderColor)}`);
    }

    return `drawtext=${parts.join(':')}`;
}
