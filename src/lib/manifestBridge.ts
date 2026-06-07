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
        reversed: clip.reversed,
        locked: clip.locked,
        origin: clip.origin,
        effects: clip.effectIds,
        zoomLevel: clip.zoomLevel,
        zoomStart: clip.zoomStart,
        zoomEnd: clip.zoomEnd,
        zoomOrigin: clip.zoomOrigin,
        sourceOrientation: clip.sourceOrientation,
        rotation: clip.rotation,
        isMuted: clip.isMuted,
        bpm: clip.bpm,
        isPinned: clip.isPinned,
        ...(clip.type === 'grid' && {
            gridFormat: (clip as any).gridFormat,
            numCells: (clip as any).numCells,
            backgroundMode: (clip as any).backgroundMode,
            cells: (clip as any).cells.map((cell: any) => ({
                id: cell.id,
                x: cell.x,
                y: cell.y,
                width: cell.width,
                height: cell.height,
                clip: cell.clip ? {
                    id: cell.clip.id,
                    file: cell.clip.path,
                    type: cell.clip.type,
                    timelineIn: cell.clip.startFrame,
                    timelineOut: cell.clip.endFrame,
                    sourceIn: cell.clip.trimStartFrame,
                    sourceOut: cell.clip.trimEndFrame,
                    speed: cell.clip.speed,
                    volume: cell.clip.volume,
                    metadata: { durationFrames: cell.clip.sourceDurationFrames }
                } : null
            }))
        })
    }));

    return {
        manifestVersion: MANIFEST_VERSION,
        project: {
            name: settings.name,
            resolution: settings.resolution,
            fps: settings.fps,
            seed: settings.seed || undefined,
            schemaVersion: MANIFEST_VERSION
        },
        clips: manifestClips
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
        fps: manifest.project.fps,
        ...(manifest.project.seed ? { seed: manifest.project.seed } : {})
    });

    // Resolution matching logic - match based on aspect ratio
    const aspectRatio = manifest.project.resolution.width / manifest.project.resolution.height;
    if (Math.abs(aspectRatio - 16 / 9) < 0.01) setResolution('16:9');
    else if (Math.abs(aspectRatio - 9 / 16) < 0.01) setResolution('9:16');
    else if (Math.abs(aspectRatio - 1) < 0.01) setResolution('1:1');
    else if (Math.abs(aspectRatio - 4 / 3) < 0.01) setResolution('4:3');
    else setResolution('16:9'); // Default fallback

    // 2. Reconstruct Clips
    const restoredClips: Clip[] = manifest.clips.map((mClip: ManifestClip) => ({
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
        volume: mClip.volume ?? 100,
        reversed: mClip.reversed || false,
        locked: mClip.locked || false,
        origin: mClip.origin,
        effectIds: mClip.effects,
        zoomLevel: mClip.zoomLevel,
        zoomStart: mClip.zoomStart,
        zoomEnd: mClip.zoomEnd,
        zoomOrigin: mClip.zoomOrigin,
        sourceOrientation: mClip.sourceOrientation,
        rotation: mClip.rotation,
        isMuted: mClip.isMuted,
        isPinned: false, // Runtime state, always reset
        isFolded: false, // Runtime state,
        ...(mClip.type === 'grid' && {
            gridFormat: mClip.gridFormat || 'horizontal',
            numCells: mClip.numCells || 2,
            backgroundMode: mClip.backgroundMode || 'blur',
            cells: (mClip.cells || []).map((cell: any) => ({
                id: cell.id || uuidv4(),
                x: cell.x || 0,
                y: cell.y || 0,
                width: cell.width || 0,
                height: cell.height || 0,
                clip: cell.clip ? {
                    id: cell.clip.id || uuidv4(),
                    path: cell.clip.file,
                    filename: cell.clip.file.split(/[/\\]/).pop() || cell.clip.file,
                    type: cell.clip.type,
                    startFrame: cell.clip.timelineIn,
                    endFrame: cell.clip.timelineOut,
                    sourceDurationFrames: cell.clip.metadata?.durationFrames || 9999,
                    trimStartFrame: cell.clip.sourceIn,
                    trimEndFrame: cell.clip.sourceOut,
                    speed: cell.clip.speed || 1.0,
                    volume: cell.clip.volume ?? 100,
                    reversed: false,
                    locked: false
                } : null
            }))
        })
    } as any));

    setClips(restoredClips);
};

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
