/**
 * featureManifest.ts — Central registry of every feature the Edit Plan can access.
 * ════════════════════════════════════════════════════════════════════════════
 * Each entry describes a feature, its category, where it reads from on a Clip,
 * and whether it's adjustable. The Edit Plan builder iterates this manifest to
 * detect which features are active on each clip and describe them.
 */

// ─── Feature categories ──────────────────────────────────────────────────────

export type FeatureCategory = 'visual' | 'audio' | 'motion' | 'timing' | 'editorial' | 'composition';

// ─── Parameter schema ────────────────────────────────────────────────────────

export interface ParamDef {
    key: string;
    label: string;
    type: 'number' | 'string' | 'boolean' | 'select';
    min?: number;
    max?: number;
    step?: number;
    options?: string[];
    unit?: string;
}

// ─── Feature entry ───────────────────────────────────────────────────────────

export interface FeatureEntry {
    /** Unique feature ID. */
    id: string;
    /** Human-readable label. */
    label: string;
    /** Feature category for grouping. */
    category: FeatureCategory;
    /** Dot-path on a Clip object to check for this feature's presence. */
    clipField: string;
    /** How to detect if this feature is active on a clip. */
    detect: (clip: any) => boolean;
    /** Extract current parameter values from a clip. */
    extractParams: (clip: any) => Record<string, unknown>;
    /** Whether the user can adjust this in the Edit Plan. */
    adjustable: boolean;
    /** Parameter definitions for the UI. */
    params: ParamDef[];
    /** Icon name (Lucide). */
    icon?: string;
}

// ─── Feature Registry ────────────────────────────────────────────────────────

export const FEATURE_MANIFEST: FeatureEntry[] = [
    // ── Visual Effects ──
    {
        id: 'film_grain',
        label: 'Film Grain',
        category: 'visual',
        clipField: 'filmGrain',
        detect: (c) => c.filmGrain != null && c.filmGrain > 0,
        extractParams: (c) => ({ amount: c.filmGrain }),
        adjustable: true,
        params: [{ key: 'amount', label: 'Amount', type: 'number', min: 0, max: 100, step: 5 }],
        icon: 'Grain',
    },
    {
        id: 'vignette',
        label: 'Vignette',
        category: 'visual',
        clipField: 'vignette',
        detect: (c) => c.vignette != null && c.vignette > 0,
        extractParams: (c) => ({ intensity: c.vignette }),
        adjustable: true,
        params: [{ key: 'intensity', label: 'Intensity', type: 'number', min: 0, max: 1, step: 0.1 }],
        icon: 'Circle',
    },
    {
        id: 'letterbox',
        label: 'Letterbox',
        category: 'visual',
        clipField: 'letterbox',
        detect: (c) => !!c.letterbox,
        extractParams: (c) => ({ enabled: !!c.letterbox, ratio: c.letterboxRatio }),
        adjustable: true,
        params: [{ key: 'ratio', label: 'Aspect Ratio', type: 'select', options: ['2.35:1', '2.39:1', '1.85:1', '16:9'] }],
        icon: 'RectangleHorizontal',
    },
    {
        id: 'chromatic_aberration',
        label: 'Chromatic Aberration',
        category: 'visual',
        clipField: 'chromaticAberration',
        detect: (c) => c.chromaticAberration != null && c.chromaticAberration > 0,
        extractParams: (c) => ({ offset: c.chromaticAberration }),
        adjustable: true,
        params: [{ key: 'offset', label: 'Offset', type: 'number', min: 0, max: 20, step: 1, unit: 'px' }],
    },
    {
        id: 'glow',
        label: 'Glow',
        category: 'visual',
        clipField: 'glow',
        detect: (c) => !!c.glow?.enabled,
        extractParams: (c) => ({ intensity: c.glow?.intensity, radius: c.glow?.radius }),
        adjustable: true,
        params: [
            { key: 'intensity', label: 'Intensity', type: 'number', min: 0, max: 100, step: 5 },
            { key: 'radius', label: 'Radius', type: 'number', min: 1, max: 50, step: 1 },
        ],
    },
    {
        id: 'double_exposure',
        label: 'Double Exposure',
        category: 'visual',
        clipField: 'doubleExposure',
        detect: (c) => !!c.doubleExposure?.enabled,
        extractParams: (c) => ({ opacity: c.doubleExposure?.opacity, blend: c.doubleExposure?.blendMode }),
        adjustable: true,
        params: [
            { key: 'opacity', label: 'Opacity', type: 'number', min: 0, max: 100, step: 5, unit: '%' },
            { key: 'blend', label: 'Blend', type: 'select', options: ['screen', 'multiply', 'overlay', 'soft-light'] },
        ],
    },
    {
        id: 'vhs',
        label: 'VHS Effect',
        category: 'visual',
        clipField: 'vhs',
        detect: (c) => !!c.vhs?.enabled,
        extractParams: (c) => ({ intensity: c.vhs?.intensity }),
        adjustable: true,
        params: [{ key: 'intensity', label: 'Intensity', type: 'number', min: 0, max: 100, step: 5 }],
    },
    {
        id: 'hue_cycle',
        label: 'Hue Cycle',
        category: 'visual',
        clipField: 'hueCycle',
        detect: (c) => !!c.hueCycle?.enabled,
        extractParams: (c) => ({ speed: c.hueCycle?.speed }),
        adjustable: true,
        params: [{ key: 'speed', label: 'Speed', type: 'number', min: 0.1, max: 5, step: 0.1, unit: '×' }],
    },
    {
        id: 'color_grading',
        label: 'Color Grade',
        category: 'visual',
        clipField: 'colorGrading',
        detect: (c) => !!c.colorGrading,
        extractParams: (c) => ({ preset: c.colorGrading?.preset, ...c.colorGrading }),
        adjustable: true,
        params: [{ key: 'preset', label: 'Preset', type: 'string' }],
        icon: 'Palette',
    },
    {
        id: 'light_bloom',
        label: 'Light Bloom',
        category: 'visual',
        clipField: 'parametricEffects',
        detect: (c) => c.parametricEffects?.some((e: any) => e.effectId === 'light_bloom'),
        extractParams: (c) => {
            const e = c.parametricEffects?.find((e: any) => e.effectId === 'light_bloom');
            return e?.params ?? {};
        },
        adjustable: true,
        params: [
            { key: 'intensity', label: 'Intensity', type: 'number', min: 10, max: 100, step: 5, unit: '%' },
            { key: 'radius', label: 'Radius', type: 'number', min: 5, max: 60, step: 1, unit: 'px' },
        ],
        icon: 'Sparkles',
    },
    {
        id: 'blur_background',
        label: 'Blur Background',
        category: 'visual',
        clipField: 'parametricEffects',
        detect: (c) => c.parametricEffects?.some((e: any) => e.effectId === 'blur_background'),
        extractParams: (c) => {
            const e = c.parametricEffects?.find((e: any) => e.effectId === 'blur_background');
            return e?.params ?? {};
        },
        adjustable: true,
        params: [
            { key: 'sigma', label: 'Blur', type: 'number', min: 5, max: 40, step: 1, unit: 'px' },
            { key: 'opacity', label: 'Opacity', type: 'number', min: 30, max: 100, step: 5, unit: '%' },
        ],
        icon: 'Layers',
    },

    // ── Audio Effects ──
    {
        id: 'hard_limiter',
        label: 'Hard Limiter',
        category: 'audio',
        clipField: 'audioEffects',
        detect: (c) => !!c.audioEffects?.limiter,
        extractParams: (c) => ({ level: c.audioEffects?.limiterLevel }),
        adjustable: true,
        params: [{ key: 'level', label: 'Ceiling', type: 'number', min: -6, max: 0, step: 0.5, unit: 'dB' }],
        icon: 'Gauge',
    },
    {
        id: 'ring_out',
        label: 'Audio Ring-out',
        category: 'audio',
        clipField: 'audioEffects',
        detect: (c) => !!c.audioEffects?.ringOut,
        extractParams: (c) => ({ duration: c.audioEffects?.ringOutDuration, pitchDrop: c.audioEffects?.ringOutPitchDrop }),
        adjustable: true,
        params: [
            { key: 'duration', label: 'Duration', type: 'number', min: 0.3, max: 2.0, step: 0.1, unit: 's' },
            { key: 'pitchDrop', label: 'Pitch Drop', type: 'number', min: 0, max: 12, step: 1, unit: 'st' },
        ],
        icon: 'Volume1',
    },

    // ── Motion ──
    {
        id: 'shake',
        label: 'Camera Shake',
        category: 'motion',
        clipField: 'shake',
        detect: (c) => !!c.shake,
        extractParams: (c) => ({ type: c.shake?.type, intensity: c.shake?.intensity }),
        adjustable: true,
        params: [
            { key: 'type', label: 'Type', type: 'select', options: ['handheld', 'impact', 'earthquake', 'subtle', 'whip'] },
            { key: 'intensity', label: 'Intensity', type: 'number', min: 5, max: 100, step: 5, unit: '%' },
        ],
        icon: 'Move',
    },
    {
        id: 'stabilize',
        label: 'Stabilization',
        category: 'motion',
        clipField: 'stabilize',
        detect: (c) => !!c.stabilize?.enabled,
        extractParams: (c) => ({ smoothing: c.stabilize?.smoothing }),
        adjustable: true,
        params: [{ key: 'smoothing', label: 'Smoothing', type: 'number', min: 0, max: 100, step: 5 }],
    },
    {
        id: 'motion_blur',
        label: 'Motion Blur',
        category: 'motion',
        clipField: 'motionBlur',
        detect: (c) => c.motionBlur?.amount > 0,
        extractParams: (c) => ({ amount: c.motionBlur?.amount }),
        adjustable: true,
        params: [{ key: 'amount', label: 'Shutter Angle', type: 'number', min: 0, max: 360, step: 45, unit: '°' }],
    },
    {
        id: 'speed',
        label: 'Speed',
        category: 'motion',
        clipField: 'speed',
        detect: (c) => c.speed != null && c.speed !== 1,
        extractParams: (c) => ({ speed: c.speed, curve: c.speedCurvePreset }),
        adjustable: true,
        params: [
            { key: 'speed', label: 'Speed', type: 'number', min: 0.1, max: 8, step: 0.1, unit: '×' },
            { key: 'curve', label: 'Curve', type: 'select', options: ['constant', 'ease-in', 'ease-out', 'ease-in-out', 'ramp-up', 'ramp-down'] },
        ],
    },
    {
        id: 'boomerang',
        label: 'Boomerang',
        category: 'motion',
        clipField: 'boomerang',
        detect: (c) => !!c.boomerang,
        extractParams: (c) => ({ loops: c.boomerangLoops }),
        adjustable: true,
        params: [{ key: 'loops', label: 'Loops', type: 'number', min: 1, max: 5, step: 1 }],
    },
    {
        id: 'deflicker',
        label: 'Deflicker',
        category: 'motion',
        clipField: 'deflicker',
        detect: (c) => !!c.deflicker?.enabled,
        extractParams: (c) => ({ strength: c.deflicker?.strength }),
        adjustable: true,
        params: [{ key: 'strength', label: 'Strength', type: 'number', min: 0, max: 100, step: 5 }],
    },
    {
        id: 'reverse',
        label: 'Reverse Playback',
        category: 'motion',
        clipField: 'reverse',
        detect: (c) => !!c.reverse,
        extractParams: () => ({ enabled: true }),
        adjustable: true,
        params: [],
    },

    // ── Composition ──
    {
        id: 'text_overlay',
        label: 'Text Overlay',
        category: 'composition',
        clipField: 'textOverlay',
        detect: (c) => !!c.textOverlay,
        extractParams: (c) => ({ text: c.textOverlay?.text, style: c.textOverlay?.style }),
        adjustable: true,
        params: [{ key: 'text', label: 'Text', type: 'string' }],
    },
    {
        id: 'caption',
        label: 'Captions',
        category: 'composition',
        clipField: 'caption',
        detect: (c) => !!c.caption,
        extractParams: (c) => ({ text: c.caption?.text, style: c.caption?.style }),
        adjustable: false,
        params: [],
    },

    // ── Timing ──
    {
        id: 'transition',
        label: 'Transition',
        category: 'timing',
        clipField: 'transition',
        detect: (c) => !!c.transition?.type,
        extractParams: (c) => ({ type: c.transition?.type, durationFrames: c.transition?.durationFrames }),
        adjustable: true,
        params: [
            { key: 'type', label: 'Type', type: 'select', options: ['cut', 'fade', 'fade-black', 'fade-white', 'zoom-in', 'zoom-out', 'wipe', 'slide', 'flash', 'glitch', 'spin', 'motion-tween'] },
            { key: 'durationFrames', label: 'Duration', type: 'number', min: 2, max: 60, step: 2, unit: 'f' },
        ],
    },
];

// ─── Lookup helpers ──────────────────────────────────────────────────────────

const featureMap = new Map(FEATURE_MANIFEST.map((f) => [f.id, f]));

/** Get a feature entry by ID. */
export function getFeatureById(id: string): FeatureEntry | undefined {
    return featureMap.get(id);
}

/** Detect all active features on a clip. */
export function detectActiveFeatures(clip: any): { feature: FeatureEntry; params: Record<string, unknown> }[] {
    const active: { feature: FeatureEntry; params: Record<string, unknown> }[] = [];
    for (const f of FEATURE_MANIFEST) {
        try {
            if (f.detect(clip)) {
                active.push({ feature: f, params: f.extractParams(clip) });
            }
        } catch {
            // Skip features that error on detection
        }
    }
    return active;
}
