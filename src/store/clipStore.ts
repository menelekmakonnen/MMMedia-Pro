import { create } from 'zustand';

export interface Clip {
    id: string;
    type: 'video' | 'audio' | 'image';
    path: string;
    filename: string;
    startFrame: number;
    endFrame: number;
    sourceDurationFrames: number;
    trimStartFrame: number;
    trimEndFrame: number;
    isPinned?: boolean;
    volume?: number; // 0-100
    isMuted?: boolean;
    speed?: number; // playback speed multiplier (default: 1.0)
    isFolded?: boolean;
}

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

    addClip: (clip: Clip) => void;
    removeClip: (id: string) => void;
    updateClip: (id: string, updates: Partial<Clip>) => void;
    selectClip: (id: string) => void;
    deselectClip: (id: string) => void;
    selectSingleClip: (id: string) => void;

    // New actions
    duplicateClip: (id: string) => void;
    deleteClip: (id: string) => void;
    randomizeSegment: (id: string) => void;
    randomizeClipDuration: (id: string) => void;
    setGlobalFlux: () => void;
    pinClip: (id: string, pinned: boolean) => void;
    setClipVolume: (id: string, volume: number) => void;
    setClipMuted: (id: string, muted: boolean) => void;
    setGlobalMute: (muted: boolean) => void;
    selectSegment: (clipId: string, startFrame: number, endFrame: number) => void;
    clearSegmentSelection: () => void;
    moveSegment: (clipId: string, newStartFrame: number) => void;

    // Phase 2 features
    shuffleClips: () => void;
    swapClip: (id: string) => void;
    chaos: () => void;

    // Phase 3: Speed controls
    setClipSpeed: (id: string, speed: number) => void;
    setGlobalPlaybackSpeed: (speed: number) => void;

    // Folding
    setClipFolded: (id: string, folded: boolean) => void;
    setAllClipsFolded: (folded: boolean) => void;
}

export const useClipStore = create<ClipStore>((set, get) => ({
    clips: [],
    selectedClipIds: [],
    selectedSegment: null,
    globalMute: false,
    globalPlaybackSpeed: 1.0,

    addClip: (clip) => set((state) => ({ clips: [...state.clips, clip] })),

    removeClip: (id) => set((state) => ({
        clips: state.clips.filter((c) => c.id !== id),
        selectedClipIds: state.selectedClipIds.filter((cid) => cid !== id),
    })),

    updateClip: (id, updates) => set((state) => ({
        clips: state.clips.map((c) => (c.id === id ? { ...c, ...updates } : c)),
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
            selectedSegment: clip ? { clipId: clip.id, startFrame: clip.startFrame, endFrame: clip.endFrame } : null
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
        };
        set((state) => ({ clips: [...state.clips, newClip] }));
    },

    deleteClip: (id) => {
        get().removeClip(id);
    },

    randomizeSegment: (id) => {
        const clip = get().clips.find((c) => c.id === id);
        if (!clip) return;

        // If duration is 0 (not loaded yet) or very short, do nothing
        if (!clip.sourceDurationFrames || clip.sourceDurationFrames < 30) {
            console.warn('[ClipStore] Cannot randomize: invalid source duration', clip.sourceDurationFrames);
            return;
        }

        // Phase 2: Respect pinned state
        if (clip.isPinned) {
            console.warn('[ClipStore] Cannot randomize: clip is pinned', clip.id);
            // In a real app we'd dispatch a toast here. For now validation is enough.
            return;
        }

        const maxDuration = clip.sourceDurationFrames;
        const segmentDuration = clip.endFrame - clip.startFrame;

        // Ensure segment isn't longer than source
        if (segmentDuration >= maxDuration) return;

        const maxStart = Math.max(0, maxDuration - segmentDuration);
        const randomStart = Math.floor(Math.random() * maxStart);
        const randomEnd = randomStart + segmentDuration;

        console.log('[ClipStore] Randomizing segment:', { from: clip.startFrame, to: randomStart });

        set((state) => {
            const updatedSelectedSegment = state.selectedSegment?.clipId === id
                ? { ...state.selectedSegment, startFrame: randomStart, endFrame: randomEnd }
                : state.selectedSegment;

            return {
                clips: state.clips.map((c) =>
                    c.id === id
                        ? {
                            ...c,
                            startFrame: randomStart,
                            endFrame: randomEnd,
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
        if (!clip || !clip.sourceDurationFrames || clip.isPinned) return; // Respect pinned state

        const fps = 30; // Assuming 30fps for now
        const minDuration = 1 * fps;
        const maxDuration = Math.min(clip.sourceDurationFrames, 10 * fps);

        if (maxDuration <= minDuration) return;

        const newDuration = Math.floor(Math.random() * (maxDuration - minDuration + 1)) + minDuration;
        const maxStart = Math.max(0, clip.sourceDurationFrames - newDuration);
        const newStart = Math.floor(Math.random() * maxStart);
        const newEnd = newStart + newDuration;

        set((state) => {
            const updatedSelectedSegment = state.selectedSegment?.clipId === id
                ? { ...state.selectedSegment, startFrame: newStart, endFrame: newEnd }
                : state.selectedSegment;

            return {
                clips: state.clips.map((c) =>
                    c.id === id ? { ...c, startFrame: newStart, endFrame: newEnd } : c
                ),
                selectedSegment: updatedSelectedSegment
            };
        });
    },

    setGlobalFlux: () => {
        // Optimized: Single state update for all clips
        const { clips, selectedSegment } = get();
        const fps = 30;

        const newClips = clips.map(clip => {
            if (clip.isPinned || !clip.sourceDurationFrames) return clip;

            const minDuration = 1 * fps;
            const maxDuration = Math.min(clip.sourceDurationFrames, 10 * fps);

            if (maxDuration <= minDuration) return clip;

            const newDuration = Math.floor(Math.random() * (maxDuration - minDuration + 1)) + minDuration;
            const maxStart = Math.max(0, clip.sourceDurationFrames - newDuration);
            const newStart = Math.floor(Math.random() * maxStart);
            const newEnd = newStart + newDuration;

            return { ...clip, startFrame: newStart, endFrame: newEnd };
        });

        // Update selected segment if its clip changed
        let newSelectedSegment = selectedSegment;
        if (selectedSegment) {
            const updatedClip = newClips.find(c => c.id === selectedSegment.clipId);
            if (updatedClip) {
                newSelectedSegment = {
                    ...selectedSegment,
                    startFrame: updatedClip.startFrame,
                    endFrame: updatedClip.endFrame
                };
            }
        }

        set({ clips: newClips, selectedSegment: newSelectedSegment });
    },

    pinClip: (id, pinned) => {
        set((state) => ({
            clips: state.clips.map((c) => (c.id === id ? { ...c, isPinned: pinned } : c)),
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

    moveSegment: (clipId, newStartFrame) => {
        const { selectedSegment } = get();
        if (!selectedSegment || selectedSegment.clipId !== clipId) return;

        const segmentDuration = selectedSegment.endFrame - selectedSegment.startFrame;
        const clip = get().clips.find((c) => c.id === clipId);
        if (!clip) return;

        const maxStart = Math.max(0, clip.sourceDurationFrames - segmentDuration);
        const clampedStart = Math.max(0, Math.min(maxStart, newStartFrame));

        set((state) => ({
            clips: state.clips.map((c) =>
                c.id === clipId
                    ? {
                        ...c,
                        startFrame: clampedStart,
                        endFrame: clampedStart + segmentDuration,
                    }
                    : c
            ),
            selectedSegment: {
                ...selectedSegment,
                startFrame: clampedStart,
                endFrame: clampedStart + segmentDuration,
            },
        }));
    },

    shuffleClips: () => {
        const { clips } = get();
        // Identify unpinned clips
        const unpinnedClips = clips.filter(c => !c.isPinned);
        if (unpinnedClips.length < 2) return; // Nothing to shuffle

        // Shuffle unpinned clips
        const shuffled = [...unpinnedClips].sort(() => Math.random() - 0.5);

        // Reconstruct array: keep pinned clips in place, fill others with shuffled
        let unpinnedIndex = 0;
        const newClips = clips.map(clip => {
            if (clip.isPinned) return clip;
            return shuffled[unpinnedIndex++];
        });

        set({ clips: newClips });
    },

    swapClip: (id) => {
        const { clips } = get();
        const sourceIndex = clips.findIndex(c => c.id === id);
        if (sourceIndex === -1) return;

        const sourceClip = clips[sourceIndex];
        if (sourceClip.isPinned) {
            console.warn('Cannot swap pinned clip'); // Add toast here later
            return;
        }

        // Find other unpinned clips
        const validTargets = clips.map((c, i) => ({ c, i }))
            .filter(({ c, i }) => !c.isPinned && i !== sourceIndex);

        if (validTargets.length === 0) return;

        // Pick random target
        const target = validTargets[Math.floor(Math.random() * validTargets.length)];

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
            clips: state.clips.map(clip =>
                clip.id === id ? { ...clip, speed } : clip
            )
        }));
    },

    setGlobalPlaybackSpeed: (globalPlaybackSpeed) => set({ globalPlaybackSpeed }),

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
}));
