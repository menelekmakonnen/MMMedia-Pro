/**
 * Manifest Protocol v1.0 Definition
 * This matches the "Golden Demo" and "Spec" requirements.
 */

export interface ManifestProjectSettings {
    name: string;
    resolution: { width: number, height: number };
    fps: number;
    seed: string;
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

    // Assets
    effects?: string[];
    transitionOut?: { type: string, duration: number };
}

export interface Manifest {
    project: ManifestProjectSettings;
    media: ManifestClip[];
    // Future: assets, grid, text layers
}

export const MANIFEST_VERSION = "1.0.0";
