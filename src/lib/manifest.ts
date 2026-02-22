import { Manifest, ProjectSettings, Clip } from '../types';
import { DEFAULT_FPS } from './time';

/**
 * Generates a Manifest object from current project state.
 * Ensures strict adherence to spec v1.0.
 */
export function exportManifest(project: ProjectSettings, clips: Clip[]): Manifest {
    // 1. Sanitize Clips: Ensure all frame data is integer
    const sanitizedClips = clips.map(c => ({
        ...c,
        startFrame: Math.floor(c.startFrame),
        endFrame: Math.floor(c.endFrame),
        sourceDurationFrames: Math.floor(c.sourceDurationFrames),
        trimStartFrame: Math.floor(c.trimStartFrame),
        trimEndFrame: Math.floor(c.trimEndFrame),
        // Ensure arrays are initialized
        effectIds: c.effectIds || []
    }));

    // 2. Construct Manifest
    const manifest: Manifest = {
        version: "1.0",
        project: {
            ...project,
            // Ensure reserved fields
            fps: project.fps || DEFAULT_FPS,
            projectType: project.projectType || 'manual'
        },
        clips: sanitizedClips
    };

    return manifest;
}

/**
 * Validates and parses a raw JSON object into a Manifest.
 * Throws error if version mismatch or critical fields missing.
 */
export function validateManifest(json: any): Manifest {
    if (!json || typeof json !== 'object') {
        throw new Error("Invalid manifest JSON");
    }

    if (json.version !== "1.0") {
        throw new Error(`Unsupported manifest version: ${json.version}`);
    }

    if (!json.project || !json.clips || !Array.isArray(json.clips)) {
        throw new Error("Manifest missing 'project' or 'clips' array");
    }

    // Deep validation could go here, but for now we trust the structure
    // We should strictly cast / sanitize on import

    return json as Manifest;
}

/**
 * Helper to download the manifest as a JSON file in the browser
 */
export function downloadManifest(manifest: Manifest) {
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${manifest.project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mmm.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
