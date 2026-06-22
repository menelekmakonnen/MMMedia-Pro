/**
 * Multi-Track Compositor — Timeline-aware compositing for layered video tracks.
 * ════════════════════════════════════════════════════════════════════════════════
 * Professional video editing requires multiple video tracks composited together:
 *   • Picture-in-Picture (PiP)
 *   • Split screens
 *   • Overlay graphics / lower thirds
 *   • Green screen compositing
 *   • Opacity-based layering
 *
 * This module provides the compositing logic and layout engine.
 * Track 1 is the base (lowest), higher track numbers composite on top.
 * Audio tracks (100+) are mixed separately by audioMixEngine.
 *
 * FFmpeg rendering:
 *   Each compositing layer becomes an overlay filter in the filter complex.
 *   The compositor generates the filter_complex string.
 */

import type { Clip } from '../types';
import { DEFAULT_FPS } from './time';

// ─── Compositing Modes ───────────────────────────────────────────────────────

export type BlendMode =
    | 'normal' | 'multiply' | 'screen' | 'overlay'
    | 'darken' | 'lighten' | 'color-dodge' | 'color-burn'
    | 'hard-light' | 'soft-light' | 'difference' | 'exclusion'
    | 'add' | 'subtract';

export type LayoutPreset =
    | 'full-screen' | 'pip-top-right' | 'pip-top-left'
    | 'pip-bottom-right' | 'pip-bottom-left' | 'pip-center'
    | 'split-horizontal' | 'split-vertical'
    | 'thirds-horizontal' | 'thirds-vertical'
    | 'custom';

// ─── Track Layer Configuration ───────────────────────────────────────────────

export interface TrackLayerConfig {
    /** Video track number (1 = base, 2+ = overlay) */
    trackNumber: number;
    /** Display label */
    label: string;
    /** Compositing blend mode */
    blendMode: BlendMode;
    /** Track-level opacity (0-1) */
    opacity: number;
    /** Whether this track is visible in output */
    visible: boolean;
    /** Whether this track is locked from editing */
    locked: boolean;
    /** Layout preset for clips on this track */
    layout: LayoutPreset;
    /** Custom position/scale (when layout is 'custom') */
    customTransform?: {
        x: number;       // percentage (0-100)
        y: number;       // percentage (0-100)
        width: number;   // percentage (0-100)
        height: number;  // percentage (0-100)
    };
}

/** Pre-built PiP position configurations */
export const PIP_POSITIONS: Record<string, { x: number; y: number; width: number; height: number }> = {
    'pip-top-right':     { x: 70, y: 5,  width: 25, height: 25 },
    'pip-top-left':      { x: 5,  y: 5,  width: 25, height: 25 },
    'pip-bottom-right':  { x: 70, y: 70, width: 25, height: 25 },
    'pip-bottom-left':   { x: 5,  y: 70, width: 25, height: 25 },
    'pip-center':        { x: 30, y: 30, width: 40, height: 40 },
};

/** Pre-built split screen layouts */
export const SPLIT_LAYOUTS: Record<string, Array<{ x: number; y: number; width: number; height: number }>> = {
    'split-horizontal': [
        { x: 0,  y: 0, width: 50, height: 100 },
        { x: 50, y: 0, width: 50, height: 100 },
    ],
    'split-vertical': [
        { x: 0, y: 0,  width: 100, height: 50 },
        { x: 0, y: 50, width: 100, height: 50 },
    ],
    'thirds-horizontal': [
        { x: 0,     y: 0, width: 33.33, height: 100 },
        { x: 33.33, y: 0, width: 33.34, height: 100 },
        { x: 66.67, y: 0, width: 33.33, height: 100 },
    ],
    'thirds-vertical': [
        { x: 0, y: 0,     width: 100, height: 33.33 },
        { x: 0, y: 33.33, width: 100, height: 33.34 },
        { x: 0, y: 66.67, width: 100, height: 33.33 },
    ],
};

// ─── Defaults ────────────────────────────────────────────────────────────────

export function createDefaultTrackConfig(trackNumber: number): TrackLayerConfig {
    return {
        trackNumber,
        label: trackNumber === 1 ? 'V1 — Base' : `V${trackNumber} — Overlay`,
        blendMode: 'normal',
        opacity: 1,
        visible: true,
        locked: false,
        layout: trackNumber === 1 ? 'full-screen' : 'pip-top-right',
    };
}

// ─── Compositing Engine ──────────────────────────────────────────────────────

/**
 * Represents a composited frame at a given time: which clips are active
 * on which tracks, with what transforms.
 */
export interface CompositeFrame {
    /** Timeline frame number */
    frame: number;
    /** Active layers, ordered bottom-to-top (track 1 first) */
    layers: CompositeLayer[];
}

export interface CompositeLayer {
    trackNumber: number;
    clip: Clip;
    config: TrackLayerConfig;
    /** Resolved position/scale in output frame (pixels) */
    resolvedTransform: { x: number; y: number; width: number; height: number };
}

/**
 * Resolve which clips are active at a given frame across all video tracks.
 * Returns layers ordered for compositing (bottom-to-top).
 *
 * @param clips All clips in the timeline
 * @param trackConfigs Configuration for each video track
 * @param frame The timeline frame to evaluate
 * @param outputWidth Output resolution width
 * @param outputHeight Output resolution height
 */
export function resolveCompositeFrame(
    clips: Clip[],
    trackConfigs: Map<number, TrackLayerConfig>,
    frame: number,
    outputWidth: number,
    outputHeight: number,
): CompositeFrame {
    // Find active video clips at this frame
    const activeClips = clips.filter(c => {
        if (c.type === 'audio') return false;
        if (c.track >= 100) return false; // audio tracks
        return frame >= c.startFrame && frame < c.endFrame;
    });

    // Sort by track number (ascending = bottom to top)
    activeClips.sort((a, b) => a.track - b.track);

    const layers: CompositeLayer[] = [];

    for (const clip of activeClips) {
        const config = trackConfigs.get(clip.track) || createDefaultTrackConfig(clip.track);
        if (!config.visible) continue;

        const resolvedTransform = resolveTransform(config, outputWidth, outputHeight);
        layers.push({ trackNumber: clip.track, clip, config, resolvedTransform });
    }

    return { frame, layers };
}

/**
 * Convert a track's layout configuration to absolute pixel positions.
 */
export function resolveTransform(
    config: TrackLayerConfig,
    outputWidth: number,
    outputHeight: number,
): { x: number; y: number; width: number; height: number } {
    if (config.layout === 'full-screen') {
        return { x: 0, y: 0, width: outputWidth, height: outputHeight };
    }

    if (config.layout === 'custom' && config.customTransform) {
        return {
            x: Math.round(config.customTransform.x / 100 * outputWidth),
            y: Math.round(config.customTransform.y / 100 * outputHeight),
            width: Math.round(config.customTransform.width / 100 * outputWidth),
            height: Math.round(config.customTransform.height / 100 * outputHeight),
        };
    }

    // PiP presets
    const pip = PIP_POSITIONS[config.layout];
    if (pip) {
        return {
            x: Math.round(pip.x / 100 * outputWidth),
            y: Math.round(pip.y / 100 * outputHeight),
            width: Math.round(pip.width / 100 * outputWidth),
            height: Math.round(pip.height / 100 * outputHeight),
        };
    }

    // Default full-screen
    return { x: 0, y: 0, width: outputWidth, height: outputHeight };
}

// ─── FFmpeg Filter Complex Generation ────────────────────────────────────────

/**
 * FFmpeg blend mode name mapping.
 * Not all Canvas blend modes have direct FFmpeg equivalents.
 */
const FFMPEG_BLEND_MODES: Record<BlendMode, string> = {
    'normal': 'normal',
    'multiply': 'multiply',
    'screen': 'screen',
    'overlay': 'overlay',
    'darken': 'darken',
    'lighten': 'lighten',
    'color-dodge': 'dodge',
    'color-burn': 'burn',
    'hard-light': 'hardlight',
    'soft-light': 'softlight',
    'difference': 'difference',
    'exclusion': 'exclusion',
    'add': 'addition',
    'subtract': 'subtract',
};

/**
 * Generate an FFmpeg overlay filter expression for a composite layer.
 *
 * @param layer The composite layer
 * @param inputLabel The FFmpeg label for this layer's input stream
 * @param baseLabel The FFmpeg label for the base/previous composite
 * @param outputLabel The FFmpeg label for the output
 * @param fps Project FPS
 */
export function generateOverlayFilter(
    layer: CompositeLayer,
    inputLabel: string,
    baseLabel: string,
    outputLabel: string,
    fps: number,
): string {
    const { x, y, width, height } = layer.resolvedTransform;
    const opacity = layer.config.opacity;
    const clip = layer.clip;

    // Scale the overlay to target size
    const scaleFilter = `[${inputLabel}]scale=${width}:${height}[scaled_${outputLabel}]`;

    // Apply opacity if not full
    const opacityPart = opacity < 1
        ? `[scaled_${outputLabel}]format=rgba,colorchannelmixer=aa=${opacity}[alpha_${outputLabel}]`
        : '';
    const overlayInput = opacity < 1 ? `alpha_${outputLabel}` : `scaled_${outputLabel}`;

    // Enable window: only show during clip's timeline span
    const enableStart = clip.startFrame / fps;
    const enableEnd = clip.endFrame / fps;
    const enableExpr = `enable='between(t,${enableStart.toFixed(4)},${enableEnd.toFixed(4)})'`;

    const overlayFilter = `[${baseLabel}][${overlayInput}]overlay=x=${x}:y=${y}:${enableExpr}[${outputLabel}]`;

    const parts = [scaleFilter];
    if (opacityPart) parts.push(opacityPart);
    parts.push(overlayFilter);

    return parts.join(';');
}

/**
 * Generate the complete filter_complex string for multi-track compositing.
 */
export function generateCompositeFilterComplex(
    layers: CompositeLayer[],
    fps: number,
): string {
    if (layers.length <= 1) return ''; // No compositing needed

    const filters: string[] = [];
    let currentBase = '0:v'; // Base video track

    for (let i = 1; i < layers.length; i++) {
        const layer = layers[i];
        const inputLabel = `${i}:v`;
        const outputLabel = `comp${i}`;

        filters.push(
            generateOverlayFilter(layer, inputLabel, currentBase, outputLabel, fps),
        );
        currentBase = outputLabel;
    }

    return filters.join(';');
}

// ─── Audio Mix Engine ────────────────────────────────────────────────────────

export interface AudioTrackConfig {
    trackNumber: number;
    label: string;
    volume: number;    // 0-100
    pan: number;       // -100 to 100 (L to R)
    muted: boolean;
    solo: boolean;
}

export function createDefaultAudioTrackConfig(trackNumber: number): AudioTrackConfig {
    return {
        trackNumber,
        label: trackNumber < 100 ? `A${trackNumber} — Clip Audio` : `A${trackNumber - 99} — Music/SFX`,
        volume: 100,
        pan: 0,
        muted: false,
        solo: false,
    };
}

/**
 * Generate FFmpeg amix filter for combining multiple audio tracks.
 */
export function generateAudioMixFilter(
    tracks: AudioTrackConfig[],
    inputCount: number,
): string {
    const activeTracks = tracks.filter(t => !t.muted);
    const hasSolo = activeTracks.some(t => t.solo);
    const effectiveTracks = hasSolo ? activeTracks.filter(t => t.solo) : activeTracks;

    if (effectiveTracks.length === 0) return 'anullsrc';
    if (effectiveTracks.length === 1) {
        const t = effectiveTracks[0];
        const vol = t.volume / 100;
        return `volume=${vol.toFixed(2)}`;
    }

    // Build amix with individual volume adjustments
    const inputs = effectiveTracks.map((t, i) => {
        const vol = t.volume / 100;
        return `[${i}:a]volume=${vol.toFixed(2)}[a${i}]`;
    });

    const mixInputs = effectiveTracks.map((_, i) => `[a${i}]`).join('');
    const amix = `${mixInputs}amix=inputs=${effectiveTracks.length}:duration=longest:dropout_transition=2`;

    return [...inputs, amix].join(';');
}
