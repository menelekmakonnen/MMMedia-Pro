/**
 * Generator Mode — apply engine.
 * ════════════════════════════════════════════════════════════════════════════
 * Transforms the live timeline to match a Generator Mode and (when enabled)
 * auto-places sound effects from the SFX Engine. The whole operation goes
 * through the Command pattern so it is a single, fully reversible undo step.
 *
 * Reads effective toggle state from `generatorModeStore`; everything it writes
 * lands on existing Clip fields understood by the preview/export pipelines.
 *
 * FITTING TRANSITIONS OVER HARD CUTS — each mode stamps its declared default
 * transition between clips; the SFX Engine then accents those transitions and
 * beats with whooshes, impacts and ambience.
 */

import { v4 as uuidv4 } from 'uuid';
import { useClipStore } from '../store/clipStore';
import { useHistoryStore } from '../store/historyStore';
import { useProjectStore } from '../store/projectStore';
import { useSfxStore } from '../store/sfxStore';
import { useGeneratorModeStore } from '../store/generatorModeStore';
import { createSetClipsCommand } from './commandPattern';
import { DEFAULT_COLOR_GRADING } from './colorGrading';
import { DEFAULT_FPS } from './time';
import { getGeneratorMode, type GeneratorMode, type ModeSfxCue } from './generatorModes';
import type { Clip } from '../types';

/** SFX track id used by the SFX Browser (kept in sync with SFXBrowserTab). */
const SFX_TRACK = 102;
/** Safety cap so a hyper-cut mode can't place thousands of SFX clips. */
const MAX_SFX_CLIPS = 240;

export interface ApplyModeResult {
    modeId: string;
    modeName: string;
    /** Video/image clips whose look was changed. */
    clipsAffected: number;
    /** SFX clips placed on the SFX track. */
    sfxPlaced: number;
    /** True when SFX was requested but no matching files exist in the library. */
    sfxLibraryEmpty: boolean;
}

function clone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v));
}

// ─── Canvas / sequence preset ────────────────────────────────────────────────

export interface CanvasMatchResult {
    aspect: string;
    fps: number;
    width: number;
    height: number;
}

/**
 * Apply a mode's canvas as a one-click sequence preset — sets the project
 * resolution/aspect (e.g. auto-switch to 9:16 for vertical social modes) and
 * frame rate. Returns the applied canvas, or null for an unknown mode.
 */
export function applyModeCanvas(modeId: string): CanvasMatchResult | null {
    const mode = getGeneratorMode(modeId);
    if (!mode) return null;
    const project = useProjectStore.getState();
    project.setResolution(mode.canvas.aspect);
    project.updateSettings({ fps: mode.canvas.fps });
    const res = useProjectStore.getState().settings.resolution;
    return { aspect: mode.canvas.aspect, fps: mode.canvas.fps, width: res.width, height: res.height };
}

/** True when the project canvas already matches the mode's aspect + fps. */
export function canvasMatchesMode(modeId: string): boolean {
    const mode = getGeneratorMode(modeId);
    if (!mode) return false;
    const s = useProjectStore.getState().settings;
    return s.aspectRatio === mode.canvas.aspect && s.fps === mode.canvas.fps;
}

function projectFps(): number {
    return useProjectStore.getState().settings?.fps || DEFAULT_FPS;
}

/** Pick SFX files matching a cue, narrowing to subcategory when available. */
function pickSfxForCue(cue: ModeSfxCue): string[] {
    const all = useSfxStore.getState().sfxFiles;
    let pool = all.filter((f) => f.categoryId === cue.categoryId);
    if (cue.subcategoryId) {
        const narrowed = pool.filter((f) => f.subcategoryId === cue.subcategoryId);
        if (narrowed.length > 0) pool = narrowed;
    }
    return pool.map((f) => f.path);
}

function sfxDurationFrames(path: string, fps: number): number {
    const f = useSfxStore.getState().sfxFiles.find((s) => s.path === path);
    const dur = f?.duration && f.duration > 0 ? f.duration : 0.6;
    return Math.max(1, Math.round(dur * fps));
}

function filenameOf(path: string): string {
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 1] || path;
}

// ─── Look application ────────────────────────────────────────────────────────

/** True when a look field's gate toggle is on (or it has no gate). */
function gateOn(toggles: Record<string, boolean>, gatedBy?: string): boolean {
    if (!gatedBy) return true;
    return toggles[gatedBy] !== false;
}

/** Apply the mode's declarative look to a single video/image clip. */
function applyLookToClip(clip: Clip, mode: GeneratorMode, toggles: Record<string, boolean>): void {
    const look = mode.look;

    if (look.transition && gateOn(toggles, look.transition.gatedBy)) {
        clip.transition = { type: look.transition.type, durationFrames: look.transition.durationFrames };
    }
    if (look.punchIn && gateOn(toggles, look.punchIn.gatedBy)) {
        clip.zoomStart = look.punchIn.start;
        clip.zoomEnd = look.punchIn.end;
        clip.zoomOrigin = 'center';
    }
    // Colour grading is no longer applied by the Edit Generator. The ONLY colour
    // change the generator may make is a mild vibrance / saturation lift across the
    // whole edit — everything else (full grades, looks, tints, colour schemes)
    // belongs to the Sequence page so renders never introduce colours that weren't
    // defined there. When the look's grade toggle is on, apply vibrance/saturation
    // only (all other colour-grading fields stay neutral).
    if (look.colorPreset && gateOn(toggles, look.colorPreset.gatedBy)) {
        clip.colorGrading = { ...clone(DEFAULT_COLOR_GRADING), saturation: 1.12, vibrance: 1.15 };
    }
    if (look.letterbox && gateOn(toggles, look.letterbox.gatedBy)) {
        clip.letterbox = true;
    }
    if (look.filmTexture && gateOn(toggles, look.filmTexture.gatedBy)) {
        clip.filmGrain = look.filmTexture.grain;
        clip.vignette = look.filmTexture.vignette;
    }
    if (look.speedCurve && gateOn(toggles, look.speedCurve.gatedBy)) {
        clip.speedCurvePreset = look.speedCurve.preset;
    }
    if (look.stabilize && gateOn(toggles, look.stabilize.gatedBy)) {
        clip.stabilize = { enabled: true, smoothing: look.stabilize.smoothing };
    }
    if (look.motionBlur && gateOn(toggles, look.motionBlur.gatedBy)) {
        clip.motionBlur = { amount: 60 };
    }
    // RGB split removed: it shifts colour channels, which is a colour change the
    // Edit Generator must not introduce.
}

// ─── SFX placement ───────────────────────────────────────────────────────────

/**
 * Build the SFX clips to place for a mode, given the laid-out video clips.
 * Returns new audio clips on the SFX track (not yet committed). Records usage
 * for each picked file via the SFX store.
 */
function buildModeSfx(
    videoClips: Clip[],
    mode: GeneratorMode,
    toggles: Record<string, boolean>,
    fps: number,
): { clips: Clip[]; libraryEmptyForRequested: boolean } {
    if (toggles['sfx'] === false) return { clips: [], libraryEmptyForRequested: false };

    const out: Clip[] = [];
    const usedPaths = new Set<string>();
    let requestedAny = false;
    let foundAny = false;

    // Sorted cut points (clip starts) for transition / impact placement.
    const sorted = [...videoClips].sort((a, b) => a.startFrame - b.startFrame);
    const timelineEnd = sorted.reduce((m, c) => Math.max(m, c.endFrame), 0);

    const addClip = (path: string, startFrame: number, maxLenFrames: number, volume: number) => {
        if (out.length >= MAX_SFX_CLIPS) return;
        const srcFrames = sfxDurationFrames(path, fps);
        const len = Math.max(1, Math.min(srcFrames, maxLenFrames));
        out.push({
            id: uuidv4(),
            type: 'audio',
            path,
            filename: filenameOf(path),
            startFrame,
            endFrame: startFrame + len,
            sourceDurationFrames: srcFrames,
            trimStartFrame: 0,
            trimEndFrame: len,
            track: SFX_TRACK,
            speed: 1.0,
            volume,
            reversed: false,
            locked: false,
            isMuted: false,
            isPinned: false,
            origin: 'auto',
        });
        usedPaths.add(path);
    };

    for (const cue of mode.sfxCues) {
        // Per-cue gating: the cue's own toggle (defaults to the global 'sfx' toggle).
        if (cue.gatedBy && toggles[cue.gatedBy] === false) continue;
        requestedAny = true;

        const pool = pickSfxForCue(cue);
        if (pool.length === 0) continue;
        foundAny = true;
        let pick = 0;
        const next = () => pool[pick++ % pool.length];

        if (cue.placement === 'ambience') {
            // One bed under the whole sequence.
            if (timelineEnd > 0) addClip(next(), 0, timelineEnd, cue.volume);
            continue;
        }

        if (cue.placement === 'transition' || cue.placement === 'whoosh') {
            // Accent every cut except the very first clip's start.
            for (let i = 1; i < sorted.length; i++) {
                const c = sorted[i];
                const gap = c.endFrame - c.startFrame;
                // Start a few frames before the cut so the swoosh leads into it.
                const start = Math.max(0, c.startFrame - Math.round(fps * 0.15));
                addClip(next(), start, gap, cue.volume);
            }
            continue;
        }

        if (cue.placement === 'impact') {
            // A hit on the first frame of every clip (beat/cut accents).
            for (const c of sorted) {
                const gap = c.endFrame - c.startFrame;
                addClip(next(), c.startFrame, gap, cue.volume);
            }
            continue;
        }
    }

    // Record usage (newest-first history) for picked files.
    const recordUsage = useSfxStore.getState().recordUsage;
    usedPaths.forEach((p) => recordUsage(p));

    return { clips: out, libraryEmptyForRequested: requestedAny && !foundAny };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Apply a Generator Mode (with the current toggle state from the store) over
 * the live timeline. Returns a summary; throws nothing — a no-op when there are
 * no clips or the mode id is unknown.
 */
export function applyGeneratorMode(modeId: string): ApplyModeResult {
    const mode = getGeneratorMode(modeId);
    const empty: ApplyModeResult = {
        modeId,
        modeName: mode?.name ?? modeId,
        clipsAffected: 0,
        sfxPlaced: 0,
        sfxLibraryEmpty: false,
    };
    if (!mode) return empty;

    const toggles = useGeneratorModeStore.getState().getToggles(modeId);
    const fps = projectFps();

    // Drive the program-monitor blend strategy.
    if (mode.look.transitionStrategy) {
        useClipStore.getState().setTransitionStrategy(mode.look.transitionStrategy);
    }

    const current = clone(useClipStore.getState().clips) as Clip[];
    if (current.length === 0) return empty;

    // 1) Stamp the look onto video/image clips.
    let affected = 0;
    const videoClips: Clip[] = [];
    for (const c of current) {
        if (c.type === 'video' || c.type === 'image') {
            applyLookToClip(c, mode, toggles);
            videoClips.push(c);
            affected++;
        }
    }

    // 2) Build SFX from the laid-out clips.
    const { clips: sfxClips, libraryEmptyForRequested } = buildModeSfx(videoClips, mode, toggles, fps);

    // 3) Commit look + SFX as one undo step.
    const next = [...current, ...sfxClips];
    const cmd = createSetClipsCommand(
        () => useClipStore.getState(),
        (updater) => useClipStore.setState(updater(useClipStore.getState())),
        next,
        `Generator Mode: ${mode.name}`,
    );
    useHistoryStore.getState().execute(cmd);

    return {
        modeId,
        modeName: mode.name,
        clipsAffected: affected,
        sfxPlaced: sfxClips.length,
        sfxLibraryEmpty: libraryEmptyForRequested,
    };
}
