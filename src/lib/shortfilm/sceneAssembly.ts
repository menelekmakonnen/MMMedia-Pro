// ══════════════════════════════════════════════════════════════════════════════
// sceneAssembly.ts — Cut matched takes into frame-accurate scene timelines.
//
// Given a scene (its shotlist entries) and the take chosen for each shot, this
// builds the real `Clip[]` the editor renders. Per shot it:
//   • picks the best matched take,
//   • trims the take to the shot's target slot length (dropping leading
//     clapper / dead-air when a `usableInFrames` hint is supplied),
//   • lays shots out CONTIGUOUSLY in storyboard order on the video track,
//   • optionally attaches the synced mic as an audio-track clip, advanced by the
//     cross-correlation offset so it lines up with the cut take.
//
// `assembleFilm` concatenates every scene's clips end-to-end (with optional
// inter-scene handle gaps) and reports each scene's [startFrame, endFrame) range.
//
// All timing is FRAME-BASED (lib/time.ts is the contract). PURE: builds and
// returns plain `Clip` objects; the parent wires FFmpeg/rendering/IPC.
// ══════════════════════════════════════════════════════════════════════════════

import type { Clip } from '../../types';
import { DEFAULT_FPS } from '../time';
import type { ShotlistEntry } from './shotlist';
import type { Take } from './takeMatching';

// ─── Inputs the parent supplies per shot ─────────────────────────────────────

/** Per-shot decision: which take fills this shot, plus optional sync data. */
export interface MatchedShot {
    entry: ShotlistEntry;
    take: Take;
    /**
     * First USABLE source frame of the take (drops slate/clapper/dead-air).
     * Defaults to 0. Trimming starts here so the slot begins on real action.
     */
    usableInFrames?: number;
    /**
     * Synced mic, if available. `offsetSamples` is the cross-correlation result
     * from findAudioOffset (positive => mic lags reference). The mic clip's
     * source window is shifted so it stays aligned to the cut camera take.
     */
    micAudio?: {
        path: string;
        filename: string;
        sourceDurationFrames: number;
        offsetSamples: number;
        sampleRate: number;
    };
}

export interface AssembleOptions {
    fps?: number;
    /** Video track index for cut takes. Default 0. */
    videoTrack?: number;
    /** Audio track index for synced mic clips. Default 1. */
    audioTrack?: number;
    /** Frame at which this scene's timeline begins (for film concatenation). */
    startFrame?: number;
    /** Prefix for generated clip ids (kept deterministic). */
    idPrefix?: string;
}

// ─── Deterministic id helper (no uuid dependency — keeps the module pure) ─────

function makeId(prefix: string, n: number): string {
    return `${prefix}-clip-${n}`;
}

// ─── Single-scene assembly ───────────────────────────────────────────────────

/**
 * Build the video (and optional mic-audio) clips for ONE scene, contiguous in
 * storyboard order. Each shot's slot is exactly its `targetFrames`; the take is
 * trimmed from `usableInFrames` for that many source frames (clamped to the
 * take's real length so we never seek past the media end).
 */
export function assembleScene(
    matched: MatchedShot[],
    opts: AssembleOptions = {},
): Clip[] {
    const fps = opts.fps ?? DEFAULT_FPS;
    const videoTrack = opts.videoTrack ?? 0;
    const audioTrack = opts.audioTrack ?? 1;
    const idPrefix = opts.idPrefix ?? 'scene';
    let cursor = opts.startFrame ?? 0;
    let n = 0;

    const clips: Clip[] = [];

    // Keep storyboard order via the entry's shotIndex (stable, scene-local).
    const ordered = [...matched].sort((a, b) => a.entry.shotIndex - b.entry.shotIndex);

    for (const m of ordered) {
        const slot = Math.max(1, m.entry.targetFrames);
        const usableIn = Math.max(0, Math.floor(m.usableInFrames ?? 0));

        // Trim window into the take, clamped so it stays inside the source.
        let trimStart = usableIn;
        let trimEnd = usableIn + slot;
        const srcLen = m.take.durationFrames;
        if (srcLen > 0 && trimEnd > srcLen) {
            // Slide the window earlier so a long-enough take still fills the slot;
            // genuinely-short takes fall short and the renderer pads the slot.
            trimStart = Math.max(0, srcLen - slot);
            trimEnd = Math.min(srcLen, trimStart + slot);
            if (trimEnd <= trimStart) trimEnd = trimStart + 1;
        }

        const startFrame = cursor;
        const endFrame = cursor + slot;

        const videoClip: Clip = {
            id: makeId(idPrefix, n++),
            type: 'video',
            path: m.take.path,
            filename: m.take.filename,
            startFrame,
            endFrame,
            sourceDurationFrames: srcLen > 0 ? srcLen : slot,
            trimStartFrame: trimStart,
            trimEndFrame: trimEnd,
            track: videoTrack,
            speed: 1,
            volume: 100,
            reversed: false,
            locked: false,
            origin: 'auto',
        };
        clips.push(videoClip);

        // ── Synced mic audio on the audio track, aligned to the cut take. ─────
        if (m.micAudio) {
            const { offsetSamples, sampleRate } = m.micAudio;
            // Convert the sample offset to source frames of the mic media.
            // Positive offset => mic lags reference, so to align the mic's content
            // to the take's usable-in point we advance the mic's source-in by the
            // same offset (in frames).
            const offsetFrames = sampleRate > 0
                ? Math.round((offsetSamples / sampleRate) * fps)
                : 0;
            let micTrimStart = usableIn + offsetFrames;
            if (micTrimStart < 0) micTrimStart = 0;
            let micTrimEnd = micTrimStart + slot;
            const micLen = m.micAudio.sourceDurationFrames;
            if (micLen > 0 && micTrimEnd > micLen) {
                micTrimStart = Math.max(0, micLen - slot);
                micTrimEnd = Math.min(micLen, micTrimStart + slot);
                if (micTrimEnd <= micTrimStart) micTrimEnd = micTrimStart + 1;
            }

            const micClip: Clip = {
                id: makeId(idPrefix, n++),
                type: 'audio',
                path: m.micAudio.path,
                filename: m.micAudio.filename,
                startFrame,
                endFrame,
                sourceDurationFrames: micLen > 0 ? micLen : slot,
                trimStartFrame: micTrimStart,
                trimEndFrame: micTrimEnd,
                track: audioTrack,
                speed: 1,
                volume: 100,
                reversed: false,
                locked: false,
                origin: 'auto',
            };
            clips.push(micClip);
        }

        cursor = endFrame;
    }

    return clips;
}

// ─── Whole-film assembly ─────────────────────────────────────────────────────

export interface FilmAssembleOptions extends AssembleOptions {
    /** Blank frames inserted between consecutive scenes. Default 0 (hard cut). */
    interSceneHandleFrames?: number;
}

export interface SceneRange {
    sceneId: string;
    sceneName: string;
    startFrame: number;
    endFrame: number;
}

export interface FilmAssembly {
    clips: Clip[];
    sceneRanges: SceneRange[];
}

/** A scene's worth of matched shots, paired with its identity. */
export interface MatchedScene {
    sceneId: string;
    sceneName: string;
    matched: MatchedShot[];
}

/**
 * Concatenate every scene end-to-end. Scenes are laid out in the given order;
 * `interSceneHandleFrames` inserts a gap between them (e.g. for fades/dead-air).
 * Returns the flat clip list plus each scene's contiguous frame range.
 */
export function assembleFilm(
    scenes: MatchedScene[],
    opts: FilmAssembleOptions = {},
): FilmAssembly {
    const fps = opts.fps ?? DEFAULT_FPS;
    const handle = Math.max(0, Math.floor(opts.interSceneHandleFrames ?? 0));

    const clips: Clip[] = [];
    const sceneRanges: SceneRange[] = [];
    let cursor = opts.startFrame ?? 0;

    scenes.forEach((scene, i) => {
        const sceneClips = assembleScene(scene.matched, {
            ...opts,
            fps,
            startFrame: cursor,
            idPrefix: opts.idPrefix ? `${opts.idPrefix}-${scene.sceneId}` : scene.sceneId,
        });

        // The scene's video span is the max endFrame among its video clips.
        const videoClips = sceneClips.filter(c => c.type !== 'audio');
        const sceneStart = cursor;
        const sceneEnd = videoClips.length
            ? Math.max(...videoClips.map(c => c.endFrame))
            : cursor;

        clips.push(...sceneClips);
        sceneRanges.push({
            sceneId: scene.sceneId,
            sceneName: scene.sceneName,
            startFrame: sceneStart,
            endFrame: sceneEnd,
        });

        cursor = sceneEnd + (i < scenes.length - 1 ? handle : 0);
    });

    return { clips, sceneRanges };
}
