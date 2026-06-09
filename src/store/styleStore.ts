import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { useClipStore } from './clipStore';
import { useProjectStore } from './projectStore';
import { DEFAULT_FPS } from '../lib/time';

export interface StyleDNA {
    id: string;
    name: string;
    cutDensity: number;            // cuts per second (0.5 - 4.0)
    zoomStrategy: 'none' | 'subtle' | 'aggressive' | 'ken-burns';
    transitionAggression: number;  // 0-100
    colorMood: string;             // preset name
    audioStrategy: 'beat-sync' | 'free' | 'rhythmic';
    effectIntensity: number;       // 0-100
    speedRange: [number, number];
    createdAt: string;
}

interface StyleStore {
    styles: StyleDNA[];
    activeStyleId: string | null;
    saveStyle: (style: Omit<StyleDNA, 'id' | 'createdAt'>) => void;
    deleteStyle: (id: string) => void;
    applyStyle: (id: string) => void;
    extractStyleFromTimeline: () => StyleDNA;
}

export const useStyleStore = create<StyleStore>()(
    persist(
        (set, get) => ({
            styles: [],
            activeStyleId: null,

            saveStyle: (style) => {
                const newStyle: StyleDNA = {
                    ...style,
                    id: uuidv4(),
                    createdAt: new Date().toISOString(),
                };
                set((state) => ({
                    styles: [...state.styles, newStyle],
                }));
            },

            deleteStyle: (id) => {
                set((state) => ({
                    styles: state.styles.filter((s) => s.id !== id),
                    activeStyleId: state.activeStyleId === id ? null : state.activeStyleId,
                }));
            },

            applyStyle: (id) => {
                const style = get().styles.find((s) => s.id === id);
                if (!style) return;

                set({ activeStyleId: id });

                // Apply style parameters to the current timeline
                const clipStore = useClipStore.getState();
                const clips = clipStore.clips;
                const fps = useProjectStore.getState().settings?.fps || DEFAULT_FPS;

                // Apply speed range to clips
                const [minSpeed, maxSpeed] = style.speedRange;
                const updatedClips = clips.map((clip) => {
                    if (clip.type === 'audio') return clip;

                    // Apply zoom strategy
                    let zoomStart = 100;
                    let zoomEnd = 100;
                    switch (style.zoomStrategy) {
                        case 'subtle':
                            zoomStart = 100;
                            zoomEnd = 110;
                            break;
                        case 'aggressive':
                            zoomStart = 100;
                            zoomEnd = 140;
                            break;
                        case 'ken-burns':
                            zoomStart = 110;
                            zoomEnd = 130;
                            break;
                    }

                    return {
                        ...clip,
                        zoomStart: style.zoomStrategy !== 'none' ? zoomStart : clip.zoomStart,
                        zoomEnd: style.zoomStrategy !== 'none' ? zoomEnd : clip.zoomEnd,
                    };
                });

                clipStore.setClips(updatedClips);

                // Apply transition aggression → transition strategy
                if (style.transitionAggression < 20) {
                    clipStore.setTransitionStrategy('cut');
                } else if (style.transitionAggression < 60) {
                    clipStore.setTransitionStrategy('cross-dissolve');
                } else {
                    clipStore.setTransitionStrategy('fade-to-black');
                }
            },

            extractStyleFromTimeline: () => {
                const clipStore = useClipStore.getState();
                const clips = clipStore.clips.filter((c) => c.type !== 'audio');
                const fps = useProjectStore.getState().settings?.fps || DEFAULT_FPS;

                // Calculate cut density (cuts per second)
                const totalFrames = clips.reduce((sum, c) => sum + (c.endFrame - c.startFrame), 0);
                const totalSeconds = totalFrames / fps;
                const cutDensity = totalSeconds > 0
                    ? Math.max(0.5, Math.min(4.0, parseFloat((clips.length / totalSeconds).toFixed(2))))
                    : 1.0;

                // Analyze zoom strategy
                const zoomedClips = clips.filter(
                    (c) => (c.zoomStart && c.zoomStart !== 100) || (c.zoomEnd && c.zoomEnd !== 100)
                );
                const zoomRatio = clips.length > 0 ? zoomedClips.length / clips.length : 0;
                let zoomStrategy: StyleDNA['zoomStrategy'] = 'none';
                if (zoomRatio > 0.6) {
                    const avgZoom = zoomedClips.reduce((sum, c) => sum + ((c.zoomEnd || 100) - (c.zoomStart || 100)), 0) / (zoomedClips.length || 1);
                    zoomStrategy = avgZoom > 25 ? 'aggressive' : avgZoom > 10 ? 'ken-burns' : 'subtle';
                } else if (zoomRatio > 0.2) {
                    zoomStrategy = 'subtle';
                }

                // Transition aggression
                const transitionStrategy = clipStore.transitionStrategy;
                let transitionAggression = 0;
                if (transitionStrategy === 'cross-dissolve' || transitionStrategy === 'fade') transitionAggression = 40;
                else if (transitionStrategy === 'fade-to-black' || transitionStrategy === 'fadeblack') transitionAggression = 70;
                else if (transitionStrategy !== 'cut') transitionAggression = 60;

                // Color mood
                const gradedClips = clips.filter((c) => c.colorGrading);
                const colorMood = gradedClips.length > 0 ? 'custom' : 'natural';

                // Speed range
                const speeds = clips.map((c) => c.speed || 1.0);
                const minSpeed = Math.min(...speeds, 1.0);
                const maxSpeed = Math.max(...speeds, 1.0);

                // Effect intensity
                const effectClips = clips.filter(
                    (c) => (c.effectIds && c.effectIds.length > 0) ||
                           (c.parametricEffects && c.parametricEffects.length > 0) ||
                           c.shake || c.filmGrain || c.vignette
                );
                const effectIntensity = clips.length > 0
                    ? Math.round((effectClips.length / clips.length) * 100)
                    : 0;

                // Audio strategy
                const audioClips = clipStore.clips.filter((c) => c.type === 'audio');
                const hasBeatMarkers = audioClips.some((c) => c.beatMarkers && c.beatMarkers.length > 0);
                const audioStrategy: StyleDNA['audioStrategy'] = hasBeatMarkers ? 'beat-sync' : 'free';

                const extracted: StyleDNA = {
                    id: uuidv4(),
                    name: `Style ${new Date().toLocaleTimeString()}`,
                    cutDensity,
                    zoomStrategy,
                    transitionAggression,
                    colorMood,
                    audioStrategy,
                    effectIntensity,
                    speedRange: [parseFloat(minSpeed.toFixed(2)), parseFloat(maxSpeed.toFixed(2))],
                    createdAt: new Date().toISOString(),
                };

                return extracted;
            },
        }),
        {
            name: 'mmmedia-style-storage',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                styles: state.styles,
                activeStyleId: state.activeStyleId,
            }),
        }
    )
);
