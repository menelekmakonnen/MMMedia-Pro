/**
 * ICUNI Edit — Shared Interchange Format (authoritative TS definition)
 * ════════════════════════════════════════════════════════════════════════════
 * The single, versioned contract that makes MMMedia Pro and Edia (ChaosEdit /
 * Premiere) "family" again. MMMedia writes it; Edia reads it and rebuilds the
 * Premiere timeline, approximating what Premiere supports natively and reporting
 * what it can't.
 *
 * Design rules:
 *   • Times are ALWAYS in FRAMES at `project.fps` (no ambiguity). Edia converts
 *     frames → Premiere ticks on import.
 *   • The format is LOSSLESS from MMMedia's side: every clip property is carried,
 *     even effects Premiere can't reproduce, so nothing is silently dropped.
 *   • Every rich feature is classified (native / approx / unsupported) so the
 *     importer knows how to handle it and can produce a degradation report.
 *
 * A matching JS copy lives in Edia at shared/icuniEdit.js — keep them in sync.
 */

export const ICUNI_EDIT_SCHEMA = 'icuni-edit';
export const ICUNI_EDIT_VERSION = '1.0';

/** Premiere Pro internal ticks per second (matches Edia's constants.js). */
export const TICKS_PER_SECOND = 254016000000;

export type IcuniSource = 'mmmedia' | 'edia' | 'premiere';
export type IcuniClipType = 'video' | 'audio' | 'image';
export type IcuniTrackType = 'video' | 'audio';

/** How faithfully Premiere (via Edia) can reproduce a given feature. */
export type SupportLevel = 'native' | 'approx' | 'unsupported';

/**
 * Premiere reproduction capability per feature key. Drives the importer's
 * strategy and the degradation report.
 *   native      — Premiere reproduces faithfully.
 *   approx      — Premiere approximates (keyframes / built-in effects); look may differ.
 *   unsupported — no native equivalent (custom GLSL/FFmpeg looks) → marker + report.
 */
export const PREMIERE_SUPPORT: Record<string, SupportLevel> = {
    // Structure & timing — Premiere does these natively.
    trim: 'native',
    position: 'native',
    track: 'native',
    speed: 'native',          // constant speed via trackItem.setSpeed
    reversed: 'native',
    volume: 'native',
    muted: 'native',
    transition: 'native',     // cross dissolve / dip etc.
    // Motion — approximated with scale/position keyframes.
    zoom: 'approx',
    speedCurve: 'approx',     // → time-remap keyframes
    rotation: 'native',
    flipH: 'approx',
    flipV: 'approx',
    // Looks Premiere can approximate with built-in effects / Lumetri.
    blurAmount: 'approx',     // Gaussian Blur
    sharpen: 'approx',        // Unsharp Mask
    vignette: 'approx',       // Lumetri vignette
    colorGrading: 'approx',   // Lumetri
    glow: 'approx',           // Gaussian Blur + blend (approx)
    motionBlur: 'approx',     // Directional/transform blur (approx)
    // Custom MMMedia looks with no native Premiere equivalent.
    doubleExposure: 'unsupported',
    vibrationFlash: 'unsupported',
    beatEffect: 'unsupported',
    shake: 'approx',          // transform position keyframes (approx)
    filmGrain: 'unsupported',
    chromaticAberration: 'unsupported',
    strobe: 'unsupported',
    echo: 'unsupported',
    smoothSlowmo: 'approx',   // Premiere "Optical Flow" time interpolation
    boomerang: 'unsupported', // multi-clip expansion; handled structurally if pre-expanded
    parametricEffects: 'unsupported',
    effectIds: 'unsupported',
    textOverlays: 'approx',   // graphics/essential text
};

// ─── Clip shape ──────────────────────────────────────────────────────────────

export interface IcuniZoom {
    level?: number;   // static %
    start?: number;   // dynamic start %
    end?: number;     // dynamic end %
    origin?: string;
    curve?: string;
}

export interface IcuniTransition {
    type: string;
    durationFrames: number;
    params?: Record<string, number | string>;
}

/** Rich effect payload — carried verbatim so nothing is lost in transit. */
export interface IcuniEffects {
    filmGrain?: number;
    vignette?: number;
    letterbox?: boolean;
    chromaticAberration?: number;
    sharpen?: number;
    blurAmount?: number;
    glow?: unknown;
    motionBlur?: unknown;
    doubleExposure?: unknown;
    vibrationFlash?: unknown;
    smoothSlowmo?: boolean;
    shake?: unknown;
    beatEffect?: unknown;
    echo?: unknown;
    strobe?: unknown;
    colorGrading?: unknown;
    parametricEffects?: unknown;
    effectIds?: string[];
    boomerang?: boolean;
    boomerangPreset?: string;
    flipH?: boolean;
    flipV?: boolean;
    rotation?: number;
    textOverlays?: unknown;
}

export interface IcuniClip {
    id: string;
    file: string;            // absolute source media path
    name?: string;
    type: IcuniClipType;
    track: number;
    trackType: IcuniTrackType;

    // Timing — FRAMES at project.fps.
    timelineStart: number;
    timelineEnd: number;
    sourceStart: number;
    sourceEnd: number;
    sourceDurationFrames?: number;

    // Core playback (Premiere-native).
    speed: number;
    volume: number;
    reversed: boolean;
    muted: boolean;
    locked: boolean;

    // Motion / ramps (approximated by Premiere).
    zoom?: IcuniZoom;
    speedCurve?: Array<{ time: number; speed: number }>;
    speedCurvePreset?: string;

    // Transition into the next clip.
    transition?: IcuniTransition;

    // Everything else, carried verbatim.
    effects?: IcuniEffects;
}

export interface IcuniReportEntry { clipId: string; feature: string; level: SupportLevel; }

export interface IcuniEdit {
    schema: typeof ICUNI_EDIT_SCHEMA;
    version: string;
    createdBy: IcuniSource;
    createdAt: string;
    timeUnit: 'frames';
    project: { name: string; fps: number; width: number; height: number };
    clips: IcuniClip[];
    /** Degradation registry — what won't transfer cleanly to Premiere. */
    report?: IcuniReportEntry[];
}

// ─── Helpers (shared logic; mirrored in Edia) ────────────────────────────────

export function framesToTicks(frames: number, fps: number): number {
    if (!fps) return 0;
    return Math.round((frames / fps) * TICKS_PER_SECOND);
}

export function ticksToFrames(ticks: number, fps: number): number {
    return Math.round((ticks / TICKS_PER_SECOND) * fps);
}

/**
 * Inspect a clip and classify which rich features it actually uses, with each
 * feature's Premiere support level. Used to build the degradation report and to
 * tell the importer what to attempt vs. flag.
 */
export function classifyClipFeatures(clip: IcuniClip): IcuniReportEntry[] {
    const out: IcuniReportEntry[] = [];
    const note = (feature: string) => {
        const level = PREMIERE_SUPPORT[feature] ?? 'unsupported';
        if (level !== 'native') out.push({ clipId: clip.id, feature, level });
    };
    if (clip.speedCurve && clip.speedCurve.length > 1) note('speedCurve');
    if (clip.zoom && (clip.zoom.start !== undefined || clip.zoom.end !== undefined || (clip.zoom.level ?? 100) !== 100)) note('zoom');
    const e = clip.effects;
    if (e) {
        const keys: (keyof IcuniEffects)[] = [
            'filmGrain', 'vignette', 'chromaticAberration', 'sharpen', 'blurAmount',
            'glow', 'motionBlur', 'doubleExposure', 'vibrationFlash', 'smoothSlowmo',
            'shake', 'beatEffect', 'echo', 'strobe', 'colorGrading', 'parametricEffects',
            'boomerang', 'flipH', 'flipV', 'textOverlays',
        ];
        for (const k of keys) {
            const v = e[k];
            const present = Array.isArray(v) ? v.length > 0 : (typeof v === 'number' ? v > 0 : !!v);
            if (present) note(k as string);
        }
        if (e.effectIds && e.effectIds.length > 0) note('effectIds');
    }
    return out;
}
