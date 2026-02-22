import { useProjectStore } from '../store/projectStore';
import { useClipStore } from '../store/clipStore';
import { createManifestFromState, validateManifest, Manifest } from '../manifest';
import { Clip } from '../types';

export const saveProject = async (): Promise<boolean> => {
    try {
        const settings = useProjectStore.getState().settings;
        const clips = useClipStore.getState().clips;

        // Create manifest from current state
        const manifest = createManifestFromState(settings, clips);

        // Validate before saving
        const validation = validateManifest(manifest);
        if (!validation.valid) {
            console.error("Manifest validation failed:", validation.errors);
            alert(`Project validation failed:\n${validation.errors.join('\n')}`);
            return false;
        }

        const json = JSON.stringify(manifest, null, 2);

        // Send to Electron Main process
        if (window.ipcRenderer) {
            const result = await window.ipcRenderer.saveProject(json);
            if (result.success) {
                console.log("Project saved successfully to:", result.filePath);
                return true;
            } else {
                console.error("Failed to save project:", result.error);
                alert(`Failed to save project: ${result.error}`);
                return false;
            }
        } else {
            console.warn("IPC Renderer not available (Browser Mode). Downloading file...");
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${settings.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mmm`;
            a.click();
            URL.revokeObjectURL(url);
            return true;
        }
    } catch (e) {
        console.error("Exception during save:", e);
        return false;
    }
};

export const loadProject = async (): Promise<boolean> => {
    try {
        let content: string | undefined;
        let filePath: string | undefined;

        if (window.ipcRenderer) {
            const result = await window.ipcRenderer.loadProject();
            if (result.canceled) return false;
            if (!result.success || !result.content) {
                console.error("Failed to load project:", result.error);
                alert(`Failed to load project: ${result.error}`);
                return false;
            }
            content = result.content;
            // filePath handled internally or not needed for just content loading
        } else {
            // Browser mode fallback (simplified, mostly for dev)
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.mmm,.json';

            return new Promise((resolve) => {
                input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) {
                        resolve(false);
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        content = event.target?.result as string;
                        // Continue processing...
                        processLoadedContent(content).then(resolve);
                    };
                    reader.readAsText(file);
                };
                input.click();
            });
        }

        if (content) {
            return await processLoadedContent(content);
        }
        return false;

    } catch (e) {
        console.error("Exception during load:", e);
        return false;
    }
};

export const exportManifest = async (): Promise<boolean> => {
    try {
        const settings = useProjectStore.getState().settings;
        const clips = useClipStore.getState().clips;
        const manifest = createManifestFromState(settings, clips);

        const validation = validateManifest(manifest);
        if (!validation.valid) {
            const proceed = confirm(`Manifest has validation warnings:\n${validation.errors.join('\n')}\n\nExport anyway?`);
            if (!proceed) return false;
        }

        const json = JSON.stringify(manifest, null, 2);

        if (window.ipcRenderer) {
            const result = await window.ipcRenderer.exportManifest(json);
            if (result.success) {
                alert(`Manifest exported successfully to ${result.filePath}`);
                return true;
            } else {
                alert(`Failed to export manifest: ${result.error}`);
                return false;
            }
        } else {
            console.log("Browser mode export manifest:", json);
            return true;
        }
    } catch (e) {
        console.error("Export manifest failed:", e);
        return false;
    }
}

async function processLoadedContent(content: string): Promise<boolean> {
    try {
        const manifest = JSON.parse(content) as Manifest;

        // Validate
        const validation = validateManifest(manifest);
        if (!validation.valid) {
            const proceed = confirm(`Project file has validation warnings:\n${validation.errors.join('\n')}\n\nLoad anyway?`);
            if (!proceed) return false;
        }

        // Validate types? validationManifest does structure check.

        // Update Stores
        const projectStore = useProjectStore.getState();
        const clipStore = useClipStore.getState();

        // 1. Update Settings
        projectStore.updateSettings({
            name: manifest.project.name,
            resolution: {
                width: manifest.project.resolution.width,
                height: manifest.project.resolution.height,
                label: `${manifest.project.resolution.width}x${manifest.project.resolution.height}` // Approximate label
            },
            fps: manifest.project.fps,
            seed: manifest.project.seed
        });

        // 2. Convert ManifestClips to internal Clips
        const loadedClips: Clip[] = manifest.clips.map(mc => ({
            id: mc.id,
            type: mc.type as any, // Cast to 'video'|'audio'|'image'
            path: mc.file, // Note: In Electron, this might need path resolution if relative
            filename: mc.file, // Usually just filename
            startFrame: mc.timelineIn,
            endFrame: mc.timelineOut,
            sourceDurationFrames: mc.metadata?.durationFrames || (mc.sourceOut - mc.sourceIn), // Estimate if missing
            trimStartFrame: mc.sourceIn,
            trimEndFrame: mc.sourceOut,
            track: mc.track,
            speed: mc.speed || 1.0,
            volume: mc.volume || 100,
            reversed: mc.reversed || false,
            locked: mc.locked || false,
            origin: mc.origin || 'manual',
            effectIds: mc.effects,
            speedRampId: mc.speedRampId,
            isFolded: false, // Runtime state reset
            isPinned: false
        }));

        clipStore.setClips(loadedClips);
        console.log("Project loaded successfully:", manifest.project.name);
        return true;

    } catch (e) {
        console.error("Failed to process project content:", e);
        alert("Failed to parse project file.");
        return false;
    }
}
