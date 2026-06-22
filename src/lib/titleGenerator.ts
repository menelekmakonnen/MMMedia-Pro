/**
 * Title Generator — Creates opening titles, scrolling credits, and name plates.
 * ════════════════════════════════════════════════════════════════════════════
 * High-level helpers that compose one or more TextOverlay objects for common
 * professional video title sequences:
 *
 *   • Opening title cards (with optional subtitle, multiple animation styles)
 *   • Scrolling end credits (role + name pairs positioned for vertical scroll)
 *   • Name plates (character introduction lower thirds)
 *
 * Every function returns TextOverlay[] or a single TextOverlay so the result
 * can be fed straight into the timeline overlay pipeline.
 */

import type { TextOverlay, TextAnimation } from './textOverlay';
import { applyTextTemplate } from './textTemplates';

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC TYPES
// ══════════════════════════════════════════════════════════════════════════════

export interface CreditEntry {
    /** Role or department — e.g. 'Director', 'Starring', 'Music By' */
    role: string;
    /** Person or entity name */
    name: string;
}

export interface TitleCardConfig {
    text: string;
    subtitle?: string;
    fontFamily: string;
    fontSize: number;
    color: string;
    backgroundColor: string;
    durationSeconds: number;
    animation: 'fade-in' | 'slide-up' | 'typewriter' | 'scale-in' | 'none';
}

export interface ScrollingCreditsConfig {
    entries: CreditEntry[];
    fontFamily: string;
    fontSize: number;
    color: string;
    backgroundColor: string;
    /** Pixels scrolled per second — controls overall scroll speed. @default 50 */
    scrollSpeedPixelsPerSecond: number;
    /** Vertical gap (px) between successive credit entries. @default 30 */
    gapBetweenEntries: number;
}

// ── Internal Helpers ────────────────────────────────────────────────────────

/** Generate a unique overlay ID. */
function uid(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Map the simplified TitleCardConfig animation names to the TextOverlay
 * `TextAnimation` type. 'scale-in' has no direct equivalent in the current
 * animation set so we fall back to 'fade'.
 */
function mapAnimation(anim: TitleCardConfig['animation']): TextAnimation {
    switch (anim) {
        case 'fade-in':    return 'fade';
        case 'slide-up':   return 'slide-up';
        case 'typewriter': return 'typewriter';
        case 'scale-in':   return 'fade'; // closest available approximation
        case 'none':       return 'none';
        default:           return 'fade';
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// generateOpeningTitles
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Generate TextOverlays for an opening title sequence.
 *
 * Returns one overlay for the main title and, optionally, a second overlay for
 * the subtitle line. Both are center-positioned with timing and animation
 * derived from the config.
 *
 * @param config - Title card configuration.
 * @param fps    - Timeline frame rate.
 * @returns Array of one or two TextOverlay objects.
 */
export function generateOpeningTitles(
    config: TitleCardConfig,
    fps: number,
): TextOverlay[] {
    const overlays: TextOverlay[] = [];
    const animation = mapAnimation(config.animation);
    const animDur = animation === 'none' ? 0 : 0.8;

    // ── Main title ──────────────────────────────────────────────────────
    overlays.push({
        id: uid('title-main'),
        text: config.text,
        fontFamily: config.fontFamily,
        fontSize: config.fontSize,
        fontColor: config.color,
        fontWeight: 'bold',
        backgroundColor: config.backgroundColor || undefined,
        position: 'center',
        offsetX: 0,
        offsetY: config.subtitle ? -30 : 0,
        startTime: 0,
        endTime: config.durationSeconds,
        animation,
        animationDuration: animDur,
        opacity: 1.0,
        shadow: true,
    });

    // ── Subtitle (optional) ─────────────────────────────────────────────
    if (config.subtitle) {
        overlays.push({
            id: uid('title-sub'),
            text: config.subtitle,
            fontFamily: config.fontFamily,
            fontSize: Math.round(config.fontSize * 0.55),
            fontColor: config.color,
            fontWeight: 'normal',
            backgroundColor: config.backgroundColor || undefined,
            position: 'center',
            offsetX: 0,
            offsetY: 40,
            startTime: 0.3,
            endTime: config.durationSeconds,
            animation,
            animationDuration: animDur,
            opacity: 0.85,
            shadow: true,
        });
    }

    return overlays;
}

// ══════════════════════════════════════════════════════════════════════════════
// generateScrollingCredits
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Generate TextOverlays for scrolling end credits.
 *
 * Because FFmpeg drawtext does not natively support continuous vertical
 * scrolling of arbitrary multi-block text, this function simulates the effect
 * by creating one TextOverlay per credit entry with staggered start/end times.
 * Each entry fades in at the bottom and fades out, creating the impression of
 * a smooth upward scroll when the overlays are composited together.
 *
 * @param config               - Credits configuration (entries, fonts, scroll speed).
 * @param totalDurationSeconds - Total duration the credits sequence should span.
 * @param fps                  - Timeline frame rate.
 * @returns Array of TextOverlay objects — one per credit entry.
 */
export function generateScrollingCredits(
    config: ScrollingCreditsConfig,
    totalDurationSeconds: number,
    fps: number,
): TextOverlay[] {
    const {
        entries,
        fontFamily,
        fontSize,
        color,
        backgroundColor,
        scrollSpeedPixelsPerSecond = 50,
        gapBetweenEntries = 30,
    } = config;

    if (entries.length === 0) return [];

    // Estimate how much vertical space each entry consumes (role + name + gap).
    const entryHeightPx = fontSize * 2.4 + gapBetweenEntries;

    // Seconds each entry needs to be visible on screen while "scrolling" through.
    const visibleDuration = Math.max(2, entryHeightPx / scrollSpeedPixelsPerSecond);

    // Stagger: time between successive entries appearing.
    const stagger = entries.length > 1
        ? Math.max(0.5, (totalDurationSeconds - visibleDuration) / (entries.length - 1))
        : 0;

    const overlays: TextOverlay[] = [];

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const start = i * stagger;
        const end = Math.min(start + visibleDuration, totalDurationSeconds);

        overlays.push({
            id: uid('credit'),
            text: `${entry.role}\n${entry.name}`,
            fontFamily,
            fontSize,
            fontColor: color,
            fontWeight: 'bold',
            backgroundColor: i === 0 && backgroundColor ? backgroundColor : undefined,
            position: 'center',
            offsetX: 0,
            offsetY: 0,
            startTime: start,
            endTime: end,
            animation: 'fade',
            animationDuration: 0.6,
            opacity: 1.0,
            shadow: false,
        });
    }

    return overlays;
}

// ══════════════════════════════════════════════════════════════════════════════
// generateNamePlate
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a name plate (character introduction lower third).
 *
 * Delegates to the lower-third text templates from `textTemplates.ts`,
 * mapping the `style` parameter to the corresponding template ID.
 *
 * @param name            - Person's name.
 * @param title           - Role or title description.
 * @param durationSeconds - How long the name plate should be displayed.
 * @param fps             - Timeline frame rate.
 * @param style           - Visual style variant. @default 'minimal'
 * @returns A single TextOverlay positioned as a lower-third name plate.
 */
export function generateNamePlate(
    name: string,
    title: string,
    durationSeconds: number,
    fps: number,
    style: 'minimal' | 'broadcast' | 'modern' = 'minimal',
): TextOverlay {
    const templateMap: Record<string, string> = {
        minimal:   'lower-third-minimal',
        broadcast: 'lower-third-broadcast',
        modern:    'lower-third-modern',
    };

    const templateId = templateMap[style] as import('./textTemplates').TextTemplateId;
    const durationFrames = Math.round(durationSeconds * fps);

    return applyTextTemplate(templateId, { name, title }, durationFrames, fps);
}
