import { useProjectStore } from '../store/projectStore';
import { useClipStore } from '../store/clipStore';
import { Manifest, MANIFEST_VERSION, ManifestClip } from '../manifest';
import { Clip } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generates a Manifest object from current store state
 */
export const generateManifest = (): Manifest => {
    const { settings } = useProjectStore.getState();
    const { clips } = useClipStore.getState();

    const manifestClips: ManifestClip[] = clips.map(clip => ({
        id: clip.id,
        file: clip.path, // In real app, might want relative path if possible
        type: clip.type as any, // 'text' not yet in ClipType but in Manifest
        timelineIn: clip.startFrame,
        timelineOut: clip.endFrame,
        sourceIn: clip.trimStartFrame,
        sourceOut: clip.trimEndFrame,
        track: clip.track || 0,
        speed: clip.speed,
        volume: clip.volume,
        reversed: clip.reversed
    }));

    return {
        project: {
            name: settings.name,
            resolution: settings.resolution,
            fps: settings.fps,
            seed: "default-seed", // TODO: Add seed to project settings
            schemaVersion: MANIFEST_VERSION
        },
        media: manifestClips
    };
};

/**
 * Loads a Manifest into the Store
 */
export const loadManifestToStore = (manifest: Manifest) => {
    const { updateSettings, setResolution } = useProjectStore.getState();
    const { setClips } = useClipStore.getState();

    // 1. Update Settings
    updateSettings({
        name: manifest.project.name,
        fps: manifest.project.fps
    });

    // Resolution matching logic - match based on aspect ratio
    const aspectRatio = manifest.project.resolution.width / manifest.project.resolution.height;
    if (Math.abs(aspectRatio - 16 / 9) < 0.01) setResolution('16:9');
    else if (Math.abs(aspectRatio - 9 / 16) < 0.01) setResolution('9:16');
    else if (Math.abs(aspectRatio - 1) < 0.01) setResolution('1:1');
    else if (Math.abs(aspectRatio - 4 / 3) < 0.01) setResolution('4:3');
    else setResolution('16:9'); // Default fallback

    // 2. Reconstruct Clips
    const restoredClips: Clip[] = manifest.media.map((mClip: ManifestClip) => ({
        id: mClip.id || uuidv4(),
        type: (mClip.type === 'video' || mClip.type === 'audio' || mClip.type === 'image') ? mClip.type : 'video',
        path: mClip.file,
        filename: mClip.file.split(/[/\\]/).pop() || mClip.file, // Extract filename
        startFrame: mClip.timelineIn,
        endFrame: mClip.timelineOut,
        sourceDurationFrames: 9999, // Unknown without file analysis
        trimStartFrame: mClip.sourceIn,
        trimEndFrame: mClip.sourceOut,
        track: mClip.track,
        speed: mClip.speed || 1.0,
        volume: mClip.volume ?? 1.0,
        reversed: mClip.reversed || false,
        locked: false,
    }));

    setClips(restoredClips);
};
