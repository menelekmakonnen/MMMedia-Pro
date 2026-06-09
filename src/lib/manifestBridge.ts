import { useProjectStore } from '../store/projectStore';
import { useClipStore } from '../store/clipStore';
import { Manifest, MANIFEST_VERSION, ManifestClip } from '../manifest';
import { Clip, EditDocument, GridClip } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generates a Manifest object from current store state.
 * Serializes ALL clip properties including cell mini-timelines, speed curves,
 * zoom curves, parametric effects, color grading, text overlays, audio effects,
 * shake, and all Super Editing Engine fields.
 */
export const generateManifest = (): Manifest => {
    const { settings } = useProjectStore.getState();
    const { clips, transitionStrategy, trackMutes, trackVolumes } = useClipStore.getState();

    const serializeClip = (clip: Clip): ManifestClip => ({
        id: clip.id,
        file: clip.path,
        type: clip.type as any,
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
        metadata: {
            width: clip.metadata?.width || clip.width,
            height: clip.metadata?.height || clip.height,
            durationFrames: clip.sourceDurationFrames,
        },
        // Grid clip specifics
        ...(clip.type === 'grid' && {
            gridFormat: (clip as GridClip).gridFormat,
            numCells: (clip as GridClip).numCells,
            backgroundMode: (clip as GridClip).backgroundMode,
            cells: (clip as GridClip).cells.map((cell) => ({
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
                    metadata: { durationFrames: cell.clip.sourceDurationFrames },
                } : null,
                // Full mini-timeline clips array
                clips: cell.clips?.map((c) => ({
                    id: c.id,
                    file: c.path,
                    type: c.type,
                    timelineIn: c.startFrame,
                    timelineOut: c.endFrame,
                    sourceIn: c.trimStartFrame,
                    sourceOut: c.trimEndFrame,
                    speed: c.speed,
                    volume: c.volume,
                    reversed: c.reversed,
                    metadata: { durationFrames: c.sourceDurationFrames },
                })) || [],
            })),
        }),
    });

    const manifestClips: ManifestClip[] = clips.map(serializeClip);

    return {
        manifestVersion: MANIFEST_VERSION,
        project: {
            name: settings.name,
            resolution: settings.resolution,
            fps: settings.fps,
            seed: settings.seed || undefined,
            schemaVersion: MANIFEST_VERSION,
        },
        clips: manifestClips,
    };
};

/**
 * Generates a full EditDocument from current store state.
 * This includes ALL clip properties, transition strategy, track mutes/volumes.
 */
export const generateEditDocument = (): EditDocument => {
    const { settings } = useProjectStore.getState();
    const { clips, transitionStrategy, trackMutes, trackVolumes } = useClipStore.getState();

    return {
        version: '2.0.0',
        project: {
            name: settings.name,
            resolution: {
                width: settings.resolution.width,
                height: settings.resolution.height,
                label: settings.resolution.label,
            },
            aspectRatio: settings.aspectRatio,
            fps: settings.fps,
            seed: settings.seed,
            backgroundFillMode: settings.backgroundFillMode,
            targetDurationSeconds: settings.targetDurationSeconds,
            sequenceLoop: settings.sequenceLoop,
        },
        clips: clips,  // Full Clip[] with all properties preserved
        transitionStrategy,
        trackMutes,
        trackVolumes,
    };
};

/**
 * Loads a Manifest into the Store.
 * Fully hydrates projectStore, clipStore (including transition strategy, track mutes/volumes).
 */
export const loadManifestToStore = (manifest: Manifest) => {
    const { updateSettings, setResolution } = useProjectStore.getState();
    const { setClips, setTransitionStrategy, setTrackMuted, setTrackVolume } = useClipStore.getState();

    // 1. Update Settings
    updateSettings({
        name: manifest.project.name,
        fps: manifest.project.fps,
        ...(manifest.project.seed ? { seed: manifest.project.seed } : {}),
    });

    // Resolution matching logic - match based on aspect ratio
    const aspectRatio = manifest.project.resolution.width / manifest.project.resolution.height;
    if (Math.abs(aspectRatio - 16 / 9) < 0.01) setResolution('16:9');
    else if (Math.abs(aspectRatio - 9 / 16) < 0.01) setResolution('9:16');
    else if (Math.abs(aspectRatio - 1) < 0.01) setResolution('1:1');
    else if (Math.abs(aspectRatio - 4 / 3) < 0.01) setResolution('4:3');
    else setResolution('16:9');

    // 2. Reconstruct Clips
    const restoredClips: Clip[] = manifest.clips.map((mClip: ManifestClip) => ({
        id: mClip.id || uuidv4(),
        type: (['video', 'audio', 'image', 'grid'].includes(mClip.type) ? mClip.type : 'video') as any,
        path: mClip.file,
        filename: mClip.file.split(/[/\\]/).pop() || mClip.file,
        startFrame: mClip.timelineIn,
        endFrame: mClip.timelineOut,
        sourceDurationFrames: mClip.metadata?.durationFrames || 9999,
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
        isPinned: mClip.isPinned || false,
        bpm: mClip.bpm,
        width: mClip.metadata?.width,
        height: mClip.metadata?.height,
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
                    filename: (cell.clip.file || '').split(/[/\\]/).pop() || cell.clip.file,
                    type: cell.clip.type,
                    startFrame: cell.clip.timelineIn,
                    endFrame: cell.clip.timelineOut,
                    sourceDurationFrames: cell.clip.metadata?.durationFrames || 9999,
                    trimStartFrame: cell.clip.sourceIn,
                    trimEndFrame: cell.clip.sourceOut,
                    speed: cell.clip.speed || 1.0,
                    volume: cell.clip.volume ?? 100,
                    reversed: false,
                    locked: false,
                    track: 1,
                } : null,
                clips: (cell.clips || []).map((c: any) => ({
                    id: c.id || uuidv4(),
                    path: c.file,
                    filename: (c.file || '').split(/[/\\]/).pop() || c.file,
                    type: c.type || 'video',
                    startFrame: c.timelineIn || 0,
                    endFrame: c.timelineOut || 0,
                    sourceDurationFrames: c.metadata?.durationFrames || 9999,
                    trimStartFrame: c.sourceIn || 0,
                    trimEndFrame: c.sourceOut || 0,
                    speed: c.speed || 1.0,
                    volume: c.volume ?? 100,
                    reversed: c.reversed || false,
                    locked: false,
                    track: 1,
                })),
            })),
        }),
    } as any));

    setClips(restoredClips);
};

/**
 * Loads a full EditDocument into all stores.
 * This provides complete hydration including transition strategy,
 * track mutes, track volumes, and all clip properties.
 */
export const loadEditDocumentToStores = (doc: EditDocument) => {
    const { updateSettings, setResolution, setAspectRatio } = useProjectStore.getState();
    const { setClips, setTransitionStrategy, setTrackMuted, setTrackVolume } = useClipStore.getState();

    // 1. Project settings
    updateSettings({
        name: doc.project.name,
        fps: doc.project.fps,
        backgroundFillMode: doc.project.backgroundFillMode,
        targetDurationSeconds: doc.project.targetDurationSeconds,
        sequenceLoop: doc.project.sequenceLoop,
        ...(doc.project.seed ? { seed: doc.project.seed } : {}),
    });

    // Resolution
    if (doc.project.aspectRatio) {
        setAspectRatio(doc.project.aspectRatio);
    } else {
        const aspectRatio = doc.project.resolution.width / doc.project.resolution.height;
        if (Math.abs(aspectRatio - 16 / 9) < 0.01) setResolution('16:9');
        else if (Math.abs(aspectRatio - 9 / 16) < 0.01) setResolution('9:16');
        else if (Math.abs(aspectRatio - 1) < 0.01) setResolution('1:1');
        else if (Math.abs(aspectRatio - 4 / 3) < 0.01) setResolution('4:3');
        else setResolution('16:9');
    }

    // 2. Clips — EditDocument stores full Clip[] objects, so direct hydration
    setClips(doc.clips);

    // 3. Transition strategy
    if (doc.transitionStrategy) {
        setTransitionStrategy(doc.transitionStrategy);
    }

    // 4. Track mutes
    if (doc.trackMutes) {
        Object.entries(doc.trackMutes).forEach(([trackId, muted]) => {
            setTrackMuted(Number(trackId), muted as boolean);
        });
    }

    // 5. Track volumes
    if (doc.trackVolumes) {
        Object.entries(doc.trackVolumes).forEach(([trackId, volume]) => {
            setTrackVolume(Number(trackId), volume as number);
        });
    }
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
