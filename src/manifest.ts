/**
 * Manifest Protocol v1.0 Definition
 * This matches the "Golden Demo" and "Spec" requirements.
 */

import { Clip, ProjectSettings } from './types';

export interface ManifestProjectSettings {
    name: string;
    resolution: { width: number, height: number };
    fps: number;
    seed?: string;
    schemaVersion: string;
}

export interface ManifestClip {
    id: string;
    file: string; // Filename relative or absolute
    type: 'video' | 'audio' | 'image' | 'text';

    // Timing (Frames)
    timelineIn: number;
    timelineOut: number;
    sourceIn: number;
    sourceOut: number;

    track: number;

    // Properties
    speed?: number;
    volume?: number;
    reversed?: boolean;
    locked?: boolean;
    origin?: 'auto' | 'manual';

    // Assets
    effects?: string[];
    speedRampId?: string;
    transitionOut?: { type: string, duration: number };

    // Metadata for matching
    metadata?: {
        fileSize?: number;
        width?: number;
        height?: number;
        durationFrames?: number;
        hash?: string;
    }
}

export interface Manifest {
    manifestVersion: string;
    project: ManifestProjectSettings;
    clips: ManifestClip[];
    // Future: assets, grid, text layers
    textItems?: any[]; // Placeholder
    gridLayouts?: any[]; // Placeholder
    operationLog?: any[]; // Placeholder
}

export const MANIFEST_VERSION = "1.0.0";

/**
 * Validates a loaded manifest object against the schema requirements.
 */
export function validateManifest(manifest: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!manifest) {
        return { valid: false, errors: ["Manifest is empty or undefined"] };
    }

    // Check version
    if (manifest.manifestVersion !== MANIFEST_VERSION) {
        errors.push(`Unsupported manifest version: ${manifest.manifestVersion}. Expected ${MANIFEST_VERSION}`);
    }

    // Check project settings
    if (!manifest.project) {
        errors.push("Missing 'project' settings");
    } else {
        if (!manifest.project.name) errors.push("Missing project name");
        if (!manifest.project.resolution || typeof manifest.project.resolution.width !== 'number') {
            errors.push("Invalid or missing project resolution");
        }
        if (typeof manifest.project.fps !== 'number') {
            errors.push("Invalid or missing project FPS");
        }
    }

    // Check clips
    if (!Array.isArray(manifest.clips)) {
        errors.push("'clips' must be an array");
    } else {
        manifest.clips.forEach((clip: any, index: number) => {
            if (!clip.id) errors.push(`Clip at index ${index} missing 'id'`);
            if (!clip.file) errors.push(`Clip at index ${index} missing 'file'`);
            if (typeof clip.timelineIn !== 'number' || typeof clip.timelineOut !== 'number') {
                errors.push(`Clip at index ${index} has invalid timing`);
            }
        });
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Converts internal Project State to Manifest format
 */
export function createManifestFromState(
    settings: ProjectSettings,
    clips: Clip[]
): Manifest {
    return {
        manifestVersion: MANIFEST_VERSION,
        project: {
            name: settings.name,
            resolution: {
                width: settings.resolution.width,
                height: settings.resolution.height
            },
            fps: settings.fps,
            seed: settings.seed,
            schemaVersion: MANIFEST_VERSION
        },
        clips: clips.map(clip => ({
            id: clip.id,
            file: clip.filename, // Using filename for portability
            type: clip.type === 'image' ? 'image' : clip.type === 'audio' ? 'audio' : 'video',
            timelineIn: clip.startFrame,
            timelineOut: clip.endFrame,
            sourceIn: clip.trimStartFrame,
            sourceOut: clip.trimEndFrame,
            track: clip.track,
            speed: clip.speed,
            volume: clip.volume,
            reversed: clip.reversed,
            locked: clip.locked,
            origin: clip.origin,
            effects: clip.effectIds,
            speedRampId: clip.speedRampId,
            metadata: {
                width: clip.metadata?.width,
                height: clip.metadata?.height,
                durationFrames: clip.sourceDurationFrames
            }
        })),
        textItems: [],
        gridLayouts: [],
        operationLog: []
    };
}
