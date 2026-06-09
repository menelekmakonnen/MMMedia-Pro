/**
 * Color Engine — Section-based color grading, beat flash, and desaturation ramps
 * 
 * Provides preset color grades per song section, desaturation buildup ramps,
 * and beat-reactive flash/color effects.
 */

import type { SegmentType } from './audioAnalysis';

// ─── Color Grade Presets ──────────────────────────────────

export interface ColorPreset {
    /** Display name */
    label: string;
    /** Saturation multiplier (1.0 = normal) */
    saturation: number;
    /** Contrast multiplier (1.0 = normal) */
    contrast: number;
    /** Brightness offset (-1.0 to 1.0) */
    brightness: number;
    /** Gamma adjustment (0.1 to 10, 1.0 = normal) */
    gamma: number;
    /** Warmth/temperature shift (-0.5 cold to +0.5 warm) */
    warmth: number;
}

export const COLOR_PRESETS: Record<string, ColorPreset> = {
    // ── Per-section presets ──
    verse_muted:     { label: 'Verse Muted',     saturation: 0.7,  contrast: 1.0,  brightness: 0,     gamma: 1.0, warmth: 0.1 },
    chorus_vibrant:  { label: 'Chorus Vibrant',   saturation: 1.2,  contrast: 1.2,  brightness: 0.02,  gamma: 1.0, warmth: 0.0 },
    drop_flash:      { label: 'Drop Flash',       saturation: 1.4,  contrast: 1.3,  brightness: 0.15,  gamma: 1.0, warmth: 0.0 },
    buildup_draining:{ label: 'Buildup Draining',  saturation: 0.4,  contrast: 1.1,  brightness: -0.05, gamma: 1.0, warmth: -0.1 },
    bridge_cold:     { label: 'Bridge Cold',       saturation: 0.8,  contrast: 1.1,  brightness: -0.02, gamma: 1.0, warmth: -0.2 },
    intro_warm:      { label: 'Intro Warm',        saturation: 0.9,  contrast: 1.0,  brightness: 0,     gamma: 1.0, warmth: 0.15 },
    outro_fading:    { label: 'Outro Fading',      saturation: 0.6,  contrast: 0.95, brightness: -0.05, gamma: 1.0, warmth: 0.1 },
    breakdown_muted: { label: 'Breakdown Muted',   saturation: 0.5,  contrast: 1.0,  brightness: -0.02, gamma: 1.0, warmth: -0.05 },

    // ── Standalone looks ──
    teal_orange:     { label: 'Teal & Orange',     saturation: 1.1,  contrast: 1.15, brightness: 0,     gamma: 1.0, warmth: 0.0 },
    bleach_bypass:   { label: 'Bleach Bypass',      saturation: 0.5,  contrast: 1.3,  brightness: 0,     gamma: 1.0, warmth: 0.0 },
    vintage_warm:    { label: 'Vintage Warm',       saturation: 0.6,  contrast: 1.0,  brightness: 0.03,  gamma: 1.0, warmth: 0.3 },
    high_contrast:   { label: 'High Contrast',      saturation: 1.1,  contrast: 1.5,  brightness: 0,     gamma: 1.0, warmth: 0.0 },
    desaturated:     { label: 'Desaturated',         saturation: 0.2,  contrast: 1.0,  brightness: 0,     gamma: 1.0, warmth: 0.0 },
    noir:            { label: 'Film Noir',           saturation: 0,    contrast: 1.4,  brightness: 0,     gamma: 1.0, warmth: 0.0 },
    neon:            { label: 'Neon',                saturation: 1.6,  contrast: 1.2,  brightness: 0.05,  gamma: 1.0, warmth: -0.1 },
};

// ─── Section → Color Mapping ──────────────────────────────

/** Map song section types to recommended color presets */
export const SECTION_COLOR_MAP: Record<SegmentType, string> = {
    intro:     'intro_warm',
    verse:     'verse_muted',
    buildup:   'buildup_draining',
    drop:      'drop_flash',
    chorus:    'chorus_vibrant',
    breakdown: 'breakdown_muted',
    bridge:    'bridge_cold',
    outro:     'outro_fading',
};

/**
 * Get the color preset for a given segment type.
 * Returns the preset object or a neutral default.
 */
export function getColorForSection(segmentType: SegmentType): ColorPreset {
    const presetId = SECTION_COLOR_MAP[segmentType];
    return COLOR_PRESETS[presetId] ?? { label: 'Neutral', saturation: 1.0, contrast: 1.0, brightness: 0, gamma: 1.0, warmth: 0 };
}

// ─── FFmpeg Filter Generation ─────────────────────────────

/**
 * Build an FFmpeg `eq` filter string from a ColorPreset.
 * Returns empty string if the preset is effectively neutral.
 */
export function buildColorPresetFilter(preset: ColorPreset): string {
    const parts: string[] = [];

    if (preset.saturation !== 1.0) {
        parts.push(`saturation=${preset.saturation.toFixed(3)}`);
    }
    if (preset.contrast !== 1.0) {
        parts.push(`contrast=${preset.contrast.toFixed(3)}`);
    }
    if (preset.brightness !== 0) {
        parts.push(`brightness=${preset.brightness.toFixed(3)}`);
    }
    if (preset.gamma !== 1.0) {
        parts.push(`gamma=${preset.gamma.toFixed(3)}`);
    }

    if (parts.length === 0) return '';
    return `eq=${parts.join(':')}`;
}

// ─── Desaturation Buildup ─────────────────────────────────

export interface ColorKeyframe {
    /** Time in seconds (relative to clip start) */
    time: number;
    /** Saturation multiplier */
    saturation: number;
    /** Brightness offset */
    brightness: number;
}

/**
 * Generate a desaturation ramp: gradually reduce saturation from normal to near-zero
 * during the buildup, then snap back to full saturation at the drop.
 * 
 * @param startTime  Buildup start (seconds, relative to clip)
 * @param dropTime   Drop start (seconds, relative to clip)
 * @param fps        Frames per second
 * @returns Array of keyframes for desaturation
 */
export function generateDesaturationRamp(
    startTime: number,
    dropTime: number,
    fps: number = 30,
): ColorKeyframe[] {
    const duration = dropTime - startTime;
    if (duration <= 0) return [];

    const keyframes: ColorKeyframe[] = [];
    const steps = Math.max(5, Math.round(duration * 4)); // ~4 keyframes per second

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const time = startTime + t * duration;

        // Exponential desaturation curve (starts slow, accelerates)
        const saturation = 1.0 - (t * t * 0.8); // 1.0 → 0.2 (near B&W)
        const brightness = -t * 0.05; // Slight darkening

        keyframes.push({ time, saturation, brightness });
    }

    // Snap back at drop
    keyframes.push({
        time: dropTime,
        saturation: 1.3, // Oversaturation for impact
        brightness: 0.1,  // Brightness pop
    });

    // Ease back to normal over 0.5 seconds after drop
    keyframes.push({
        time: dropTime + 0.5,
        saturation: 1.0,
        brightness: 0,
    });

    return keyframes;
}

/**
 * Build an FFmpeg eq filter expression for desaturation ramp.
 * Uses the `between(t,start,end)` enable syntax.
 */
export function buildDesaturationFilter(
    startTime: number,
    dropTime: number,
): string {
    const duration = dropTime - startTime;
    if (duration <= 0) return '';

    // Use a single eq filter with time-based expression for saturation
    // Ramp saturation from 1.0 to 0.2 between start and drop using smoothstep
    return `eq=saturation='if(between(t,${startTime.toFixed(3)},${dropTime.toFixed(3)}),` +
        `1.0-0.8*pow((t-${startTime.toFixed(3)})/${duration.toFixed(3)},2),` +
        `if(between(t,${dropTime.toFixed(3)},${(dropTime + 0.3).toFixed(3)}),1.3,1.0))'`;
}

// ─── Beat Flash ───────────────────────────────────────────

export interface FlashConfig {
    /** Maximum brightness intensity (0-1) */
    intensity: number;
    /** Flash color (currently only white is supported via eq) */
    color: string;
    /** Duration in frames */
    durationFrames: number;
}

/**
 * Build an FFmpeg eq filter for beat-reactive flash (brightness spike).
 * 
 * @param beatTimes  Array of beat timestamps (seconds)
 * @param flash      Flash configuration
 * @param fps        Frames per second
 * @returns FFmpeg filter string, or empty if no beats
 */
export function buildBeatFlashFilter(
    beatTimes: number[],
    flash: FlashConfig = { intensity: 0.8, color: '#ffffff', durationFrames: 3 },
    fps: number = 30,
): string {
    if (!beatTimes || beatTimes.length === 0) return '';

    const flashDurSec = flash.durationFrames / fps;
    const enableParts = beatTimes.map(bt =>
        `between(t,${bt.toFixed(4)},${(bt + flashDurSec).toFixed(4)})`
    );

    // Chunk enable expressions to avoid FFmpeg expression length limits
    // Max ~50 beats per eq filter, chain multiples if needed
    const CHUNK_SIZE = 50;
    const filters: string[] = [];

    for (let i = 0; i < enableParts.length; i += CHUNK_SIZE) {
        const chunk = enableParts.slice(i, i + CHUNK_SIZE);
        const enableExpr = chunk.join('+');
        filters.push(`eq=brightness='${flash.intensity.toFixed(2)}*gt(${enableExpr},0)'`);
    }

    return filters.join(',');
}
