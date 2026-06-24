// ══════════════════════════════════════════════════════════════════════════════
// shotlist.ts — Flatten a Film into an ordered, frame-resolved shotlist.
//
// A Film's storyboard is intent in seconds. Production works in FRAMES (the app's
// source of truth — see lib/time.ts). `buildShotlist(film)` walks every scene's
// shots in storyboard order and emits one ShotlistEntry per shot, carrying:
//   • a stable timeline index (global + per-scene)
//   • targetFrames computed from the shot's targetDurationSec at the project fps
//   • the required coverage (which canonical shot type this entry needs from a take)
// Entries are grouped by scene via `sceneId`; the per-scene `shotsInScene`/`shotIndex`
// fields let downstream tools place shots contiguously within a scene.
//
// PURE: no React / IPC / FFmpeg. Deterministic. Import time helpers only.
// ══════════════════════════════════════════════════════════════════════════════

import { DEFAULT_FPS, secondsToFrames } from '../time';
import type { Film, Scene, Shot, StoryboardShotType } from './storyboard';

export interface ShotlistEntry {
    /** Global ordering index across the whole film (0-based). */
    index: number;
    sceneId: string;
    sceneName: string;
    /** Ordinal of the scene within the film (0-based). */
    sceneIndex: number;
    /** Ordinal of this shot within its scene (0-based). */
    shotIndex: number;
    /** Total shots in this entry's scene (for contiguous layout). */
    shotsInScene: number;
    shotId: string;
    description: string;
    /** Canonical coverage this shot needs a take for. */
    requiredCoverage: StoryboardShotType;
    targetDurationSec: number;
    /** Target slot length in frames at the project fps (>= 1). */
    targetFrames: number;
    dialogue?: string;
    action?: string;
    camera?: string;
    audioCue?: string;
    /** True when the shot carries dialogue and therefore wants sync audio. */
    needsAudio: boolean;
}

export interface SceneShotGroup {
    sceneId: string;
    sceneName: string;
    sceneIndex: number;
    grade?: string;
    audioBed?: string;
    entries: ShotlistEntry[];
    /** Sum of all entries' targetFrames in this scene. */
    sceneTargetFrames: number;
}

export interface Shotlist {
    entries: ShotlistEntry[];
    /** The same entries grouped by scene, in storyboard order. */
    scenes: SceneShotGroup[];
    fps: number;
    totalTargetFrames: number;
}

function entryFromShot(
    shot: Shot,
    scene: Scene,
    sceneIndex: number,
    shotIndex: number,
    shotsInScene: number,
    globalIndex: number,
    fps: number,
): ShotlistEntry {
    // At least one frame, even for zero/unset durations, so a slot always exists.
    const targetFrames = Math.max(1, secondsToFrames(shot.targetDurationSec || 0, fps));
    return {
        index: globalIndex,
        sceneId: scene.id,
        sceneName: scene.name,
        sceneIndex,
        shotIndex,
        shotsInScene,
        shotId: shot.id,
        description: shot.description,
        requiredCoverage: shot.shotType,
        targetDurationSec: shot.targetDurationSec || 0,
        targetFrames,
        dialogue: shot.dialogue,
        action: shot.action,
        camera: shot.camera,
        audioCue: shot.audioCue,
        needsAudio: Boolean(shot.dialogue && shot.dialogue.trim()),
    };
}

/**
 * Build the ordered, frame-resolved shotlist for a film. Shots keep storyboard
 * order; durations are converted to frames at `fps` (default DEFAULT_FPS).
 */
export function buildShotlist(film: Film, fps: number = DEFAULT_FPS): Shotlist {
    const entries: ShotlistEntry[] = [];
    const scenes: SceneShotGroup[] = [];
    let globalIndex = 0;

    film.scenes.forEach((scene, sceneIndex) => {
        const groupEntries: ShotlistEntry[] = [];
        const shotsInScene = scene.shots.length;
        scene.shots.forEach((shot, shotIndex) => {
            const e = entryFromShot(shot, scene, sceneIndex, shotIndex, shotsInScene, globalIndex++, fps);
            entries.push(e);
            groupEntries.push(e);
        });
        scenes.push({
            sceneId: scene.id,
            sceneName: scene.name,
            sceneIndex,
            grade: scene.grade,
            audioBed: scene.audioBed,
            entries: groupEntries,
            sceneTargetFrames: groupEntries.reduce((s, e) => s + e.targetFrames, 0),
        });
    });

    return {
        entries,
        scenes,
        fps,
        totalTargetFrames: entries.reduce((s, e) => s + e.targetFrames, 0),
    };
}
