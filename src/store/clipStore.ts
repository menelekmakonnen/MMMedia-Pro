import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DEFAULT_FPS, secondsToFrames } from '../lib/time';
import { SeededRandom, generateSeed } from '../lib/random';
import { useProjectStore } from './projectStore';
import { MediaFile } from './mediaStore';
import { v4 as uuidv4 } from 'uuid';
import { Clip as BaseClip, GridClip, GridCell } from '../types';
import type { TextOverlay } from '../lib/textOverlay';
import type { AudioEffects } from '../lib/audioEffects';
import { useUserStore } from './userStore';

import { analyzeAudio } from '../lib/audioAnalysis';

// Extend BaseClip with store-specific properties
export type Clip = (BaseClip | GridClip) & { isFolded?: boolean };

export interface SelectedSegment {
    clipId: string;
    startFrame: number;
    endFrame: number;
}

interface ClipStore {
    clips: Clip[];
    selectedClipIds: string[];
    selectedSegment: SelectedSegment | null;
    globalMute: boolean;
    globalPlaybackSpeed: number;
    transitionStrategy: 'cut' | 'cross-dissolve' | 'fade-to-black';
    // Per-track mute state: track 2 = Audio 1 (clip-linked), track 101+ = Audio 2 (added audio)
    trackMutes: Record<number, boolean>;
    trackVolumes: Record<number, number>;
    _persistedProjectId: string | null;

    setClips: (clips: Clip[]) => void;
    addClip: (clip: Clip) => void;
    removeClip: (id: string) => void;
    updateClip: (id: string, updates: Partial<Clip>) => void;
    selectClip: (id: string) => void;
    deselectClip: (id: string) => void;
    selectSingleClip: (id: string) => void;

    // New actions
    duplicateClip: (id: string) => void;
    deleteClip: (id: string) => void;
    moveClip: (id: string, direction: 'up' | 'down') => void;
    randomizeSegment: (id: string) => void;
    randomizeClipDuration: (id: string) => void;
    setGlobalFlux: () => void;
    pinClip: (id: string, pinned: boolean) => void;
    lockClip: (id: string, locked: boolean) => void; // Phase 5: Ownership protection
    setClipVolume: (id: string, volume: number) => void;
    setClipMuted: (id: string, muted: boolean) => void;
    setGlobalMute: (muted: boolean) => void;
    selectSegment: (clipId: string, startFrame: number, endFrame: number) => void;
    clearSegmentSelection: () => void;
    moveSegment: (clipId: string, newStartFrame: number) => void;
    updateClipSource: (clipId: string, newTrimStart: number, newTrimEnd: number) => void;

    // Phase 2 features
    shuffleClips: () => void;
    swapClip: (id: string) => void;
    chaos: () => void;

    // Phase 3: Speed controls
    setClipSpeed: (id: string, speed: number) => void;
    setGlobalPlaybackSpeed: (speed: number) => void;

    // Boomerang
    toggleBoomerang: (id: string) => void;

    // Folding
    setClipFolded: (id: string, folded: boolean) => void;
    setAllClipsFolded: (folded: boolean) => void;

    // Grid Editor Actions
    createGrid: (numCells: number, gridFormat: 'horizontal' | 'vertical' | 'square', initialClip?: Clip) => void;
    updateGrid: (id: string, updates: Partial<GridClip>) => void;
    updateGridCell: (gridId: string, cellId: string, updates: Partial<GridCell>) => void;
    shuffleGridItems: (gridId: string) => void;
    shuffleAllGrids: () => void;
    distributeMediaToGrid: (gridId: string, files: MediaFile[]) => void;

    // Grid Cell Mini-Timeline Actions
    addClipToGridCell: (gridId: string, cellId: string, clip: Clip) => void;
    removeClipFromGridCell: (gridId: string, cellId: string, clipId: string) => void;
    shuffleGridCellClips: (gridId: string, cellId: string) => void;
    fluxGridCellClips: (gridId: string, cellId: string) => void;
    globalFluxGrid: (gridId: string) => void;
    globalChaosGrid: (gridId: string) => void;

    // Phase 7: Advanced
    setTransitionStrategy: (strategy: 'cut' | 'cross-dissolve' | 'fade-to-black') => void;
    setClipDuration: (id: string, durationInSeconds: number) => void;
    nukeLibrary: () => void;

    // Track mute controls
    setTrackMuted: (trackId: number, muted: boolean) => void;
    isTrackMuted: (trackId: number) => boolean;
    setTrackVolume: (trackId: number, volume: number) => void;
    getTrackVolume: (trackId: number) => number;

    // Phase 18: Sequence Actions
    magnetizeClips: () => void;
    reorderClips: (fromIndex: number, toIndex: number) => void;

    // Text Overlays
    addTextOverlay: (clipId: string, overlay: TextOverlay) => void;
    removeTextOverlay: (clipId: string, overlayId: string) => void;
    updateTextOverlay: (clipId: string, overlayId: string, updates: Partial<TextOverlay>) => void;

    // Audio Effects
    setAudioEffects: (clipId: string, effects: AudioEffects) => void;
    resetAudioEffects: (clipId: string) => void;

    // Persistence
    clearPersistedClips: () => void;

    // Automation
    regenerateTimeline: (sourceFiles: MediaFile[], seed: string) => void;
    detectBeats: (id: string, audioBuffer: AudioBuffer) => Promise<void>;
}

const isProtected = (c: { origin?: string; locked?: boolean; isPinned?: boolean }) =>
    c.origin === 'manual' || c.locked || c.isPinned;

export const useClipStore = create<ClipStore>()(
    persist(
        (set, get) => ({
    clips: [],
    selectedClipIds: [],
    selectedSegment: null,
    globalMute: false,
    globalPlaybackSpeed: 1.0,
    transitionStrategy: useUserStore.getState().defaultTransition,
    trackMutes: {},
    trackVolumes: {},
    _persistedProjectId: null,

    setClips: (clips) => {
        const projectId = useProjectStore.getState().settings?.id || null;
        set({ clips, _persistedProjectId: projectId });
    },
    addClip: (clip) => set((state) => ({ clips: [...state.clips, clip] })),

    removeClip: (id) => set((state) => ({
        clips: state.clips.filter((c) => c.id !== id),
        selectedClipIds: state.selectedClipIds.filter((cid) => cid !== id),
    })),

    updateClip: (id, updates) => set((state) => ({
        clips: state.clips.map((c) => {
            if (c.id !== id) return c;
            const promoted = c.origin === 'auto' ? { origin: 'manual' as const } : {};
            return { ...c, ...updates, ...promoted };
        }),
    })),

    selectClip: (id) => set((state) => ({
        selectedClipIds: state.selectedClipIds.includes(id)
            ? state.selectedClipIds
            : [...state.selectedClipIds, id],
    })),

    deselectClip: (id) => set((state) => ({
        selectedClipIds: state.selectedClipIds.filter((cid) => cid !== id),
    })),

    selectSingleClip: (id) => {
        const clip = get().clips.find((c) => c.id === id);
        set({
            selectedClipIds: [id],
            // Use TRIM frames (Source) for the segment selector
            selectedSegment: clip ? {
                clipId: clip.id,
                startFrame: clip.trimStartFrame ?? 0,
                endFrame: clip.trimEndFrame ?? (clip.sourceDurationFrames || 0)
            } : null
        });
    },

    // New implementations
    duplicateClip: (id) => {
        const clip = get().clips.find((c) => c.id === id);
        if (!clip) return;

        const newClip: Clip = {
            ...clip,
            id: crypto.randomUUID(),
            filename: `${clip.filename} (copy)`,
            origin: 'manual',
        };
        set((state) => ({ clips: [...state.clips, newClip] }));
    },

    deleteClip: (id) => {
        get().removeClip(id);
    },

    moveClip: (id, direction) => set((state) => {
        const index = state.clips.findIndex(c => c.id === id);
        if (index === -1) return state;

        const newClips = [...state.clips];
        if (direction === 'up' && index > 0) {
            // Swap with previous
            const temp = newClips[index - 1];
            newClips[index - 1] = newClips[index];
            newClips[index] = temp;
        } else if (direction === 'down' && index < newClips.length - 1) {
            // Swap with next
            const temp = newClips[index + 1];
            newClips[index + 1] = newClips[index];
            newClips[index] = temp;
        }
        return { clips: newClips };
    }),

    randomizeSegment: (id) => {
        const clip = get().clips.find((c) => c.id === id);
        if (!clip) return;

        // If duration is 0 (not loaded yet) or very short, do nothing
        if (!clip.sourceDurationFrames || clip.sourceDurationFrames < DEFAULT_FPS) {
            console.warn('[ClipStore] Cannot randomize: invalid source duration', clip.sourceDurationFrames);
            return;
        }

        // Respect ownership protection
        if (isProtected(clip)) {
            console.warn('[ClipStore] Cannot randomize: clip is protected', clip.id);
            return;
        }

        const seed = useProjectStore.getState().settings.seed || generateSeed();
        const rng = new SeededRandom(seed + id); // Add clip ID for unique but deterministic variation

        const maxDuration = clip.sourceDurationFrames;
        const segmentDuration = (clip.trimEndFrame || 0) - (clip.trimStartFrame || 0);

        // Ensure segment isn't longer than source
        if (segmentDuration >= maxDuration) return;

        const maxStart = Math.max(0, maxDuration - segmentDuration);
        const randomStart = rng.randInt(0, maxStart);
        const randomEnd = randomStart + segmentDuration;

        console.log('[ClipStore] Randomizing segment:', { from: clip.trimStartFrame, to: randomStart });

        set((state) => {
            const updatedSelectedSegment = state.selectedSegment?.clipId === id
                ? { ...state.selectedSegment, startFrame: randomStart, endFrame: randomEnd }
                : state.selectedSegment;

            return {
                clips: state.clips.map((c) =>
                    c.id === id
                        ? {
                            ...c,
                            trimStartFrame: randomStart,
                            trimEndFrame: randomEnd,
                            // Timeline start stays same, timeline end stays same (Slip)
                        }
                        : c
                ),
                selectedSegment: updatedSelectedSegment
            };
        });
    },

    // NEW: Randomizes both duration and position (The "Flux" feature)
    randomizeClipDuration: (id) => {
        const clip = get().clips.find((c) => c.id === id);
        if (!clip || !clip.sourceDurationFrames) return;

        // Respect ownership protection
        if (isProtected(clip)) return;

        const seed = useProjectStore.getState().settings.seed || generateSeed();
        const rng = new SeededRandom(seed + id + '_duration'); // Unique seed for duration variation

        const fps = DEFAULT_FPS;
        const minDuration = 1 * fps;
        const maxDuration = Math.min(clip.sourceDurationFrames, 10 * fps);

        if (maxDuration <= minDuration) return;

        const newDuration = rng.randInt(minDuration, maxDuration + 1);
        const maxStart = Math.max(0, clip.sourceDurationFrames - newDuration);
        const newStart = rng.randInt(0, maxStart);
        const newEnd = newStart + newDuration;

        set((state) => {
            const updatedSelectedSegment = state.selectedSegment?.clipId === id
                ? { ...state.selectedSegment, startFrame: newStart, endFrame: newEnd }
                : state.selectedSegment;

            return {
                clips: state.clips.map((c) =>
                    c.id === id ? {
                        ...c,
                        trimStartFrame: newStart,
                        trimEndFrame: newEnd,
                        endFrame: c.startFrame + newDuration // Sync timeline duration
                    } : c
                ),
                selectedSegment: updatedSelectedSegment
            };
        });
    },

    setGlobalFlux: () => {
        const { clips, selectedSegment } = get();
        // Skip operation if no clips
        if (clips.length === 0) return;

        const fps = DEFAULT_FPS;
        const targetSeconds = useProjectStore.getState().settings.targetDurationSeconds;

        let newClips = clips.map(clip => ({ ...clip }));

        // Split clips into locked/pinned (fixed) vs fluxable (mutable)
        const fixedClips = newClips.filter(c => isProtected(c));
        let mutableClips = newClips.filter(c => !isProtected(c));

        // Calculate fixed duration already committed
        const fixedFrames = fixedClips.reduce((sum, c) => sum + ((c.trimEndFrame || 0) - (c.trimStartFrame || 0)), 0);

        if (targetSeconds !== undefined) {
            // ----- EXACT TARGET DURATION MATH -----
            const targetFrames = Math.max(0, (targetSeconds * fps) - fixedFrames);

            // 1. Initial constraint calculation
            // Base minimum per user request is 0.25s
            const minFrames = Math.max(Math.floor(0.25 * fps), 1);

            // Get effective max duration possible for each mutable clip
            const maxSources = mutableClips.map(clip => {
                return (clip.sourceDurationFrames || 1800);
            });

            // Note: If the sum of all source videos is less than target, they will max out. 
            // We cannot manufacture footage that doesn't exist.

            let allocatedFrames = mutableClips.map(() => 0);
            let remainingTarget = targetFrames;

            // First pass: Assign minimums
            mutableClips.forEach((_, i) => {
                const alloc = Math.min(minFrames, maxSources[i]);
                allocatedFrames[i] = alloc;
                remainingTarget -= alloc;
            });

            // Iterative Maximum Cap Allocation
            // While we have frames to give, and there are clips that can still take more
            let canTakeMore = true;
            while (remainingTarget > 0 && canTakeMore) {
                canTakeMore = false;

                // Count how many clips can still absorb more frames
                let absorbCount = 0;
                for (let i = 0; i < mutableClips.length; i++) {
                    if (allocatedFrames[i] < maxSources[i]) absorbCount++;
                }

                if (absorbCount === 0) break; // All clips maxed out!

                // Distribute a slice (at least 1 frame) to each capable clip
                const slice = Math.max(1, Math.floor(remainingTarget / absorbCount));

                for (let i = 0; i < mutableClips.length && remainingTarget > 0; i++) {
                    const headroom = maxSources[i] - allocatedFrames[i];
                    if (headroom > 0) {
                        canTakeMore = true;
                        const take = Math.min(slice, headroom, remainingTarget);
                        allocatedFrames[i] += take;
                        remainingTarget -= take;
                    }
                }
            }

            // 3. Apply randomized start position based on exact calculated length
            const seed = useProjectStore.getState().settings.seed || generateSeed();
            const rng = new SeededRandom(seed + '_flux');
            mutableClips = mutableClips.map((clip, i) => {
                const maxSource = maxSources[i];
                const finalDuration = allocatedFrames[i];

                // Safety bounds
                const safeDuration = Math.min(finalDuration, maxSource);
                const maxStart = Math.max(0, maxSource - safeDuration);

                const newStart = Math.floor(rng.random() * maxStart);
                const newEnd = newStart + safeDuration;

                return {
                    ...clip,
                    trimStartFrame: newStart,
                    trimEndFrame: newEnd,
                    sourceDurationFrames: maxSource,
                    endFrame: clip.startFrame + safeDuration
                };
            });

        } else {
            // ----- NO TARGET DURATION (Standard Chaotic Flux) -----
            const seed = useProjectStore.getState().settings.seed || generateSeed();
            const rng = new SeededRandom(seed + '_flux');
            mutableClips = mutableClips.map(clip => {
                const effectiveMaxDuration = clip.sourceDurationFrames || Math.max(clip.endFrame, 1800);

                // Floor is still 0.25s
                const minDuration = Math.max(Math.floor(0.25 * fps), 1);
                // Roof is 10s for chaotic mode
                const maxDuration = Math.min(effectiveMaxDuration, 10 * fps);

                if (maxDuration <= minDuration) return clip;

                const newDuration = Math.floor(rng.random() * (maxDuration - minDuration + 1)) + minDuration;
                const maxStart = Math.max(0, effectiveMaxDuration - newDuration);
                const newStart = Math.floor(rng.random() * maxStart);
                const newEnd = newStart + newDuration;

                return {
                    ...clip,
                    trimStartFrame: newStart,
                    trimEndFrame: newEnd,
                    sourceDurationFrames: effectiveMaxDuration,
                    endFrame: clip.startFrame + newDuration
                };
            });
        }

        // Re-combine and Magnetize (Snap back-to-back sequentially)
        const combinedClips = [...fixedClips, ...mutableClips].sort((a, b) => a.startFrame - b.startFrame);

        let currentFrame = 0;
        const finalizedClips = combinedClips.map(clip => {
            const duration = (clip.trimEndFrame || 0) - (clip.trimStartFrame || 0);
            const start = currentFrame;
            const end = start + duration;
            currentFrame = end;
            return {
                ...clip,
                startFrame: start,
                endFrame: end
            };
        });

        // Update selected segment if its clip changed
        let newSelectedSegment = selectedSegment;
        if (selectedSegment) {
            const updatedClip = finalizedClips.find(c => c.id === selectedSegment.clipId);
            if (updatedClip) {
                newSelectedSegment = {
                    ...selectedSegment,
                    startFrame: updatedClip.trimStartFrame ?? 0,
                    endFrame: updatedClip.trimEndFrame ?? 0
                };
            }
        }

        set({ clips: finalizedClips, selectedSegment: newSelectedSegment });
    },

    pinClip: (id, pinned) => {
        set((state) => ({
            clips: state.clips.map((c) => (c.id === id ? { ...c, isPinned: pinned } : c)),
        }));
    },

    lockClip: (id, locked) => {
        set((state) => ({
            clips: state.clips.map((c) => (c.id === id ? { ...c, locked } : c)),
        }));
    },

    setClipVolume: (id, volume) => {
        set((state) => ({
            clips: state.clips.map((c) => (c.id === id ? { ...c, volume: Math.max(0, Math.min(100, volume)) } : c)),
        }));
    },

    setClipMuted: (id, muted) => {
        set((state) => ({
            clips: state.clips.map((c) => (c.id === id ? { ...c, isMuted: muted } : c)),
        }));
    },

    setGlobalMute: (muted) => set({ globalMute: muted }),

    selectSegment: (clipId, startFrame, endFrame) => {
        set({ selectedSegment: { clipId, startFrame, endFrame } });
    },

    clearSegmentSelection: () => set({ selectedSegment: null }),

    // Replaces moveSegment for Source Trim updates
    updateClipSource: (clipId: string, newTrimStart: number, newTrimEnd: number) => {
        const { selectedSegment } = get();

        // Calculate new duration
        const newDuration = newTrimEnd - newTrimStart;

        set((state) => ({
            clips: state.clips.map((c) =>
                c.id === clipId
                    ? {
                        ...c,
                        trimStartFrame: newTrimStart,
                        trimEndFrame: newTrimEnd,
                        endFrame: c.startFrame + newDuration, // Sync timeline duration
                    }
                    : c
            ),
            // Loop back to selected segment if matches
            selectedSegment: selectedSegment && selectedSegment.clipId === clipId ? {
                ...selectedSegment,
                startFrame: newTrimStart,
                endFrame: newTrimEnd
            } : selectedSegment
        }));
    },

    moveSegment: (clipId, newStartFrame) => {
        // Legacy: kept for simple move? Actually simpler to just use updateClipSource for SegmentSelector
        // Just forwarding to updateClipSource logic but assuming slip (duration constant)
        const { selectedSegment } = get();
        if (!selectedSegment) return;
        const duration = selectedSegment.endFrame - selectedSegment.startFrame;
        get().updateClipSource(clipId, newStartFrame, newStartFrame + duration);
    },

    shuffleClips: () => {
        const { clips } = get();
        const seed = useProjectStore.getState().settings.seed || generateSeed();
        const rng = new SeededRandom(seed);

        // Filter clips that can be shuffled (not manual, not locked, not pinned)
        const canShuffle = (c: Clip) =>
            c.origin !== 'manual' && !c.locked && !c.isPinned;

        const shuffleableClips = clips.filter(canShuffle);
        if (shuffleableClips.length < 2) return; // Nothing to shuffle

        // Use SeededRandom to shuffle
        const shuffled = rng.shuffle(shuffleableClips);

        // Reconstruct array: keep protected clips in place, fill others with shuffled
        let shuffledIndex = 0;
        const newClips = clips.map(clip => {
            if (!canShuffle(clip)) return clip;
            return shuffled[shuffledIndex++];
        });

        set({ clips: newClips });
    },

    swapClip: (id) => {
        const { clips } = get();
        const sourceIndex = clips.findIndex(c => c.id === id);
        if (sourceIndex === -1) return;

        const sourceClip = clips[sourceIndex];
        if (isProtected(sourceClip)) {
            console.warn('Cannot swap protected clip');
            return;
        }

        // Find other unprotected clips
        const validTargets = clips.map((c, i) => ({ c, i }))
            .filter(({ c, i }) => !isProtected(c) && i !== sourceIndex);

        if (validTargets.length === 0) return;

        // Pick random target using SeededRandom
        const seed = useProjectStore.getState().settings.seed || generateSeed();
        const rng = new SeededRandom(seed + '_swap_' + id);
        const target = validTargets[Math.floor(rng.random() * validTargets.length)];

        // Swap
        const newClips = [...clips];
        newClips[sourceIndex] = target.c;
        newClips[target.i] = sourceClip;

        set({ clips: newClips });
    },

    chaos: () => {
        // 1. Shuffle Order
        get().shuffleClips();
        // 2. Flux (Random duration + segment)
        get().setGlobalFlux();
    },

    // Phase 3: Speed controls
    setClipSpeed: (id, speed) => {
        set((state) => ({
            clips: state.clips.map(clip => {
                if (clip.id === id) {
                    const segmentLength = (clip.trimEndFrame || 0) - (clip.trimStartFrame || 0);
                    const newDuration = Math.round(segmentLength / speed);
                    return { ...clip, speed, endFrame: clip.startFrame + newDuration };
                }
                return clip;
            })
        }));
        get().magnetizeClips();
    },

    setGlobalPlaybackSpeed: (globalPlaybackSpeed) => set({ globalPlaybackSpeed }),

    // ── Boomerang ──────────────────────────────────────────────
    toggleBoomerang: (id) => {
        set((state) => ({
            clips: state.clips.map(c =>
                c.id === id ? { ...c, boomerang: !c.boomerang } : c
            ),
        }));
    },



    setClipFolded: (id, isFolded) =>
        set((state) => ({
            clips: state.clips.map((clip) =>
                clip.id === id ? { ...clip, isFolded } : clip
            ),
        })),

    setAllClipsFolded: (isFolded) =>
        set((state) => ({
            clips: state.clips.map((clip) => ({ ...clip, isFolded })),
        })),

    // Grid implementations
    createGrid: (numCells, gridFormat, initialClip) => {
        const newGrid: GridClip = {
            id: uuidv4(),
            type: 'grid',
            path: '',
            filename: `Grid ${numCells}x`,
            startFrame: 0,
            endFrame: 5 * DEFAULT_FPS, // Default 5s
            sourceDurationFrames: 5 * DEFAULT_FPS,
            trimStartFrame: 0,
            trimEndFrame: 5 * DEFAULT_FPS,
            track: 1,
            speed: 1,
            volume: 100,
            reversed: false,
            locked: false,
            origin: 'manual',
            gridFormat,
            numCells,
            backgroundMode: 'blur',
            cells: Array.from({ length: numCells }).map((_, i) => ({
                id: uuidv4(),
                clip: i === 0 && initialClip ? initialClip : null,
                clips: i === 0 && initialClip ? [initialClip] : [],
                x: 0,
                y: 0,
                width: 1,
                height: 1
            }))
        };
        set((state) => ({ clips: [...state.clips, newGrid] }));
    },

    updateGrid: (id, updates) =>
        set((state) => ({
            clips: state.clips.map((c) =>
                c.id === id && c.type === 'grid' ? { ...c, ...updates } as GridClip : c
            ),
        })),

    updateGridCell: (gridId, cellId, updates) =>
        set((state) => ({
            clips: state.clips.map((c) => {
                if (c.id === gridId && c.type === 'grid') {
                    const grid = c as GridClip;
                    return {
                        ...grid,
                        cells: grid.cells.map(cell =>
                            cell.id === cellId ? { ...cell, ...updates } : cell
                        )
                    };
                }
                return c;
            })
        })),

    distributeMediaToGrid: (gridId, files) => {
        if (!files.length) return;
        set((state) => {
            const gridIndex = state.clips.findIndex(c => c.id === gridId && c.type === 'grid');
            if (gridIndex === -1) return state;
            const grid = state.clips[gridIndex] as GridClip;
            const newCells = [...grid.cells];

            const fps = useProjectStore.getState().settings?.fps || DEFAULT_FPS;
            const gridDurationFrames = grid.endFrame - grid.startFrame || 150;

            const filesAvailable = files.map(f => ({
                ...f,
                durationFrames: Math.floor(f.duration * fps),
                usedUntil: 0
            }));

            let currentFileIndex = 0;
            for (let i = 0; i < grid.numCells; i++) {
                const fIndex = currentFileIndex % filesAvailable.length;
                const file = filesAvailable[fIndex];

                let startTrim = file.usedUntil;
                let endTrim = startTrim + gridDurationFrames;

                if (endTrim > file.durationFrames) {
                    startTrim = 0;
                    endTrim = gridDurationFrames > file.durationFrames ? file.durationFrames : gridDurationFrames;
                }
                file.usedUntil = endTrim;

                newCells[i] = {
                    ...newCells[i],
                    clip: {
                        id: uuidv4(),
                        mediaLibraryId: file.id,
                        type: file.type,
                        path: file.path,
                        filename: file.filename,
                        startFrame: 0,
                        endFrame: gridDurationFrames,
                        sourceDurationFrames: file.durationFrames,
                        trimStartFrame: startTrim,
                        trimEndFrame: endTrim,
                        track: 1,
                        speed: 1.0,
                        volume: 100,
                        reversed: false,
                        isMuted: false,
                        isPinned: false,
                        origin: 'manual',
                        locked: false
                    },
                    clips: [{
                        id: uuidv4(),
                        mediaLibraryId: file.id,
                        type: file.type,
                        path: file.path,
                        filename: file.filename,
                        startFrame: 0,
                        endFrame: gridDurationFrames,
                        sourceDurationFrames: file.durationFrames,
                        trimStartFrame: startTrim,
                        trimEndFrame: endTrim,
                        track: 1,
                        speed: 1.0,
                        volume: 100,
                        reversed: false,
                        isMuted: false,
                        isPinned: false,
                        origin: 'manual',
                        locked: false
                    }]
                };
                currentFileIndex++;
            }

            const newClips = [...state.clips];
            newClips[gridIndex] = { ...grid, cells: newCells };
            return { clips: newClips };
        });
    },

    shuffleGridItems: (gridId) => set((state) => {
        const grid = state.clips.find(c => c.id === gridId && c.type === 'grid') as GridClip;
        if (!grid) return state;

        const cells = [...grid.cells];
        const seed = useProjectStore.getState().settings.seed || generateSeed();
        const rng = new SeededRandom(seed + gridId);

        // Extract clips
        const cellClips = cells.map(c => c.clip);
        // Shuffle clips
        const shuffledClips = rng.shuffle(cellClips);

        const newCells = cells.map((cell, i) => ({
            ...cell,
            clip: shuffledClips[i]
        }));

        return {
            clips: state.clips.map((c) => c.id === gridId ? { ...(c as GridClip), cells: newCells } : c)
        };
    }),

    shuffleAllGrids: () => {
        const { clips } = get();
        clips.forEach(clip => {
            if (clip.type === 'grid') {
                get().shuffleGridItems(clip.id);
            }
        });
    },

    // â”€â”€ Grid Cell Mini-Timeline Actions â”€â”€
    addClipToGridCell: (gridId, cellId, clip) =>
        set((state) => ({
            clips: state.clips.map((c) => {
                if (c.id === gridId && c.type === 'grid') {
                    const grid = c as GridClip;
                    return {
                        ...grid,
                        cells: grid.cells.map(cell =>
                            cell.id === cellId
                                ? { ...cell, clips: [...cell.clips, clip], clip: cell.clip || clip }
                                : cell
                        )
                    };
                }
                return c;
            })
        })),

    removeClipFromGridCell: (gridId, cellId, clipId) =>
        set((state) => ({
            clips: state.clips.map((c) => {
                if (c.id === gridId && c.type === 'grid') {
                    const grid = c as GridClip;
                    return {
                        ...grid,
                        cells: grid.cells.map(cell => {
                            if (cell.id !== cellId) return cell;
                            const newClips = cell.clips.filter(cl => cl.id !== clipId);
                            return { ...cell, clips: newClips, clip: newClips[0] || null };
                        })
                    };
                }
                return c;
            })
        })),

    shuffleGridCellClips: (gridId, cellId) => set((state) => {
        const grid = state.clips.find(c => c.id === gridId && c.type === 'grid') as GridClip;
        if (!grid) return state;
        const seed = useProjectStore.getState().settings.seed || generateSeed();
        const rng = new SeededRandom(seed + cellId);
        return {
            clips: state.clips.map((c) => {
                if (c.id !== gridId) return c;
                const g = c as GridClip;
                return {
                    ...g,
                    cells: g.cells.map(cell => {
                        if (cell.id !== cellId || cell.clips.length < 2) return cell;
                        const shuffled = rng.shuffle([...cell.clips]);
                        return { ...cell, clips: shuffled, clip: shuffled[0] || null };
                    })
                };
            })
        };
    }),

    fluxGridCellClips: (gridId, cellId) => set((state) => {
        const grid = state.clips.find(c => c.id === gridId && c.type === 'grid') as GridClip;
        if (!grid) return state;
        const seed = useProjectStore.getState().settings.seed || generateSeed();
        const rng = new SeededRandom(seed + '_gridflux_' + cellId);
        return {
            clips: state.clips.map((c) => {
                if (c.id !== gridId) return c;
                const g = c as GridClip;
                return {
                    ...g,
                    cells: g.cells.map(cell => {
                        if (cell.id !== cellId) return cell;
                        const fluxed = cell.clips.map(clip => {
                            const src = clip.sourceDurationFrames || 150;
                            const newTrimStart = Math.floor(rng.random() * src * 0.6);
                            const maxLen = src - newTrimStart;
                            const newLen = Math.max(30, Math.floor(rng.random() * maxLen));
                            return {
                                ...clip,
                                trimStartFrame: newTrimStart,
                                trimEndFrame: newTrimStart + newLen,
                                speed: parseFloat((0.5 + rng.random() * 2.0).toFixed(2)),
                            };
                        });
                        return { ...cell, clips: fluxed, clip: fluxed[0] || null };
                    })
                };
            })
        };
    }),

    globalFluxGrid: (gridId) => {
        const grid = get().clips.find(c => c.id === gridId && c.type === 'grid') as GridClip;
        if (!grid) return;
        grid.cells.forEach(cell => {
            if (cell.clips.length > 0) {
                get().fluxGridCellClips(gridId, cell.id);
            }
        });
    },

    globalChaosGrid: (gridId) => {
        get().shuffleGridItems(gridId);
        get().globalFluxGrid(gridId);
    },

    setTransitionStrategy: (transitionStrategy) => set({ transitionStrategy }),

    nukeLibrary: () => set({ clips: [], selectedClipIds: [], selectedSegment: null }),

    // Track mute controls
    setTrackMuted: (trackId, muted) => set((state) => ({
        trackMutes: { ...state.trackMutes, [trackId]: muted }
    })),
    isTrackMuted: (trackId) => get().trackMutes[trackId] ?? false,

    setClipDuration: (id, durationInSeconds) => {
        set((state) => {
            const fps = DEFAULT_FPS;
            const durationFrames = secondsToFrames(durationInSeconds, fps);

            return {
                clips: state.clips.map((c) => {
                    if (c.id !== id) return c;

                    // Only update if currently 0 or we want to enforce accuracy
                    return {
                        ...c,
                        sourceDurationFrames: durationFrames,
                        endFrame: c.startFrame + durationFrames, // Extend to full length by default if imported fresh
                        // Note: If we had a trimmer, we might not want to reset endFrame, 
                        // but for the "Truncation" bug, resetting to full length is the fix.
                    };
                }),
            };
        });
    },

    // Phase 18: Sequence Actions
    magnetizeClips: () => {
        set((state) => {
            // Sort by start frame first to maintain rough order
            const sortedClips = [...state.clips].sort((a, b) => {
                if (a.track !== b.track) return (a.track || 0) - (b.track || 0);
                return a.startFrame - b.startFrame;
            });

            // Re-assign start frames sequentially for track 1 (Main Video)
            // Currently simplified to assume single track sequencing for "Sequence View"
            let currentFrame = 0;
            const newClips = sortedClips.map(clip => {
                // Determine clip duration
                // Determine clip duration based on current state (respecting trims)
                const duration = clip.endFrame - clip.startFrame;

                // For Sequence View, we arrange clips sequentially on Track 1
                if (clip.track === 1 || !clip.track) {
                    const newStart = currentFrame;
                    const newEnd = newStart + duration;
                    currentFrame = newEnd;

                    return {
                        ...clip,
                        startFrame: newStart,
                        endFrame: newEnd,
                        // IMPORANT: trimStartFrame and trimEndFrame stay exactly as they were
                        // The duration (end - start) matches (trimEnd - trimStart)
                    };
                }
                return clip;
            });

            return { clips: newClips };
        });
    },

    reorderClips: (fromIndex, toIndex) => {
        set((state) => {
            // 1. Get current list, presumably sorted by timeline order
            const currentClips = [...state.clips].sort((a, b) => a.startFrame - b.startFrame);

            // 2. Perform array move
            const [movedClip] = currentClips.splice(fromIndex, 1);
            currentClips.splice(toIndex, 0, movedClip);

            // 3. Magnetize (Recalculate frames based on new order)
            let currentFrame = 0;
            const updatedClips = currentClips.map(clip => {
                const duration = clip.endFrame - clip.startFrame;
                const start = currentFrame;
                const end = start + duration;
                currentFrame = end;
                return { ...clip, startFrame: start, endFrame: end };
            });

            return { clips: updatedClips };
        });
    },


    regenerateTimeline: (sourceFiles, seed) => {
        set((state) => {
            if (sourceFiles.length === 0) return state;

            const rng = new SeededRandom(seed);

            // 1. Keep protected clips (manual, locked, pinned)
            const protectedClips = state.clips.filter(c =>
                c.origin === 'manual' || c.locked || c.isPinned
            );

            // 2. Generate new clips
            const numClips = rng.randInt(5, 15);
            const newClips: Clip[] = [];

            for (let i = 0; i < numClips; i++) {
                const sourceFile = rng.choice(sourceFiles);
                if (!sourceFile) continue;

                // Determine clip duration
                const fps = useProjectStore.getState().settings?.fps || DEFAULT_FPS;
                const sourceDurationFrames = Math.floor(sourceFile.duration * fps);
                const minFrames = 2 * fps;

                // If source is too short, we can't make a good clip, skip or use whole
                if (sourceDurationFrames < minFrames) continue;

                const maxFrames = Math.min(8 * fps, sourceDurationFrames);

                const durationFrames = rng.randInt(minFrames, maxFrames);

                // Random start point
                const maxStart = sourceDurationFrames - durationFrames;
                const startFrame = rng.randInt(0, maxStart);

                newClips.push({
                    id: uuidv4(),
                    type: sourceFile.type,
                    path: sourceFile.path,
                    filename: sourceFile.filename,
                    startFrame: 0,
                    endFrame: durationFrames,
                    sourceDurationFrames: sourceDurationFrames,
                    trimStartFrame: startFrame,
                    trimEndFrame: startFrame + durationFrames,
                    speed: 1.0,
                    volume: 100,
                    isMuted: false,
                    isPinned: false,
                    origin: 'auto',
                    locked: false,
                    track: 1,
                    reversed: false,
                });
            }

            // 3. Append new clips AFTER protected clips
            // Recalculate startFrame/endFrame to be sequential (Magnetize)

            const allClips = [...protectedClips, ...newClips];

            let currentFrame = 0;
            const updatedClips = allClips.map(clip => {
                const duration = clip.endFrame - clip.startFrame;
                const start = currentFrame;
                const end = start + duration;
                currentFrame = end;
                return { ...clip, startFrame: start, endFrame: end };
            });

            return { clips: updatedClips };
        });
    },

    detectBeats: async (id, audioBuffer) => {
        try {
            console.log('[ClipStore] Analyzing audio for clip:', id);
            const result = await analyzeAudio(audioBuffer);

            set((state) => ({
                clips: state.clips.map((c) =>
                    c.id === id ? {
                        ...c,
                        bpm: result.bpm,
                        beatMarkers: result.beats // Full BeatMarker[] with type classification
                    } : c
                ),
            }));
            console.log('[ClipStore] Beat analysis complete â€” BPM:', result.bpm, 'Beats:', result.beats.length);
        } catch (error) {
            console.error('[ClipStore] Audio analysis failed:', error);
        }
    },
    // Track volume controls
    setTrackVolume: (trackId, volume) => set((s) => ({
        trackVolumes: { ...s.trackVolumes, [trackId]: Math.max(0, Math.min(100, volume)) },
    })),
    getTrackVolume: (trackId) => get().trackVolumes[trackId] ?? 100,

    // ── Text Overlay Actions ───────────────────────────────────────────
    addTextOverlay: (clipId, overlay) => set((state) => ({
        clips: state.clips.map((c) => {
            if (c.id !== clipId) return c;
            const existing = (c as any).textOverlays || [];
            return { ...c, textOverlays: [...existing, overlay] };
        }),
    })),

    removeTextOverlay: (clipId, overlayId) => set((state) => ({
        clips: state.clips.map((c) => {
            if (c.id !== clipId) return c;
            const existing = ((c as any).textOverlays || []) as TextOverlay[];
            return { ...c, textOverlays: existing.filter((o) => o.id !== overlayId) };
        }),
    })),

    updateTextOverlay: (clipId, overlayId, updates) => set((state) => ({
        clips: state.clips.map((c) => {
            if (c.id !== clipId) return c;
            const existing = ((c as any).textOverlays || []) as TextOverlay[];
            return {
                ...c,
                textOverlays: existing.map((o) =>
                    o.id === overlayId ? { ...o, ...updates } : o
                ),
            };
        }),
    })),

    // ── Audio Effects Actions ──────────────────────────────────────────
    setAudioEffects: (clipId, effects) => set((state) => ({
        clips: state.clips.map((c) =>
            c.id === clipId ? { ...c, audioEffects: effects } : c
        ),
    })),

    resetAudioEffects: (clipId) => set((state) => ({
        clips: state.clips.map((c) =>
            c.id === clipId ? { ...c, audioEffects: undefined } : c
        ),
    })),

    // Persistence
    clearPersistedClips: () => {
        set({ clips: [], _persistedProjectId: null });
        try { localStorage.removeItem('mmmedia-clip-storage'); } catch {}
    },
}),
        {
            name: 'mmmedia-clip-storage',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                clips: state.clips,
                _persistedProjectId: state._persistedProjectId,
                trackMutes: state.trackMutes,
                trackVolumes: state.trackVolumes,
                transitionStrategy: state.transitionStrategy,
                // EXCLUDE transient state:
                // selectedClipIds, selectedSegment, globalMute, globalPlaybackSpeed
            }),
            onRehydrateStorage: () => (rehydrated, error) => {
                if (error) {
                    console.warn('[ClipStore] Rehydration failed:', error);
                    return;
                }
                if (rehydrated) {
                    // Smart restore logic
                    const projectStore = useProjectStore.getState();
                    const currentProjectId = projectStore.settings?.id;
                    const persistedProjectId = rehydrated._persistedProjectId;

                    // (C) Auto-clear if project changed
                    if (persistedProjectId && currentProjectId !== persistedProjectId) {
                        console.log('[ClipStore] Project changed, clearing persisted clips');
                        rehydrated.clearPersistedClips();
                        return;
                    }

                    // (A) Validate paths — mark clips as needing validation
                    if (rehydrated.clips && rehydrated.clips.length > 0) {
                        const validatedClips = rehydrated.clips.map((clip: Clip) => ({
                            ...clip,
                            _needsValidation: true,
                        }));
                        rehydrated.setClips(validatedClips);
                        console.log(`[ClipStore] Restored ${validatedClips.length} clips (pending path validation)`);
                    }
                }
            },
        }
    )
);
