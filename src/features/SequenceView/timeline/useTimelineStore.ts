/**
 * Timeline store — the single source of truth for the NLE timeline UI state.
 *
 * This is the canonical store: every timeline component imports it. (The old
 * `src/store/timelineStore.ts` now just re-exports this one, so there is exactly
 * one store and one type model.) UI preferences (snap, zoom) persist across
 * sessions; tracks/selection are rebuilt from the clips via useDeriveTracks.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useClipStore } from '../../../store/clipStore';
import { useProjectStore } from '../../../store/projectStore';
import type {
  TimelineState,
  Track,
  TimelineMarker,
  InOutRange,
  ActiveTool,
} from './types';

export const useTimelineStore = create<TimelineState>()(
  persist(
    (set, get) => ({
  tracks: [],
  playheadFrame: 0,
  isPlaying: false,
  playbackRate: 1,
  pixelsPerFrame: 0.5,
  scrollX: 0,
  snapEnabled: true,
  activeTool: 'select' as ActiveTool,
  selectedItemIds: new Set<string>(),
  markers: [],
  inOutRange: { inFrame: null, outFrame: null },
  prerenderEnabled: false,
  prerenderCache: {},

  // ── Actions ───────────────────────────────────────────────────────
  setTracks: (tracks) => set({ tracks }),
  setPlayheadFrame: (frame) => set({ playheadFrame: Math.max(0, frame) }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setPlaybackRate: (rate) => set({ playbackRate: rate, isPlaying: rate !== 0 }),
  setPrerenderEnabled: (v) => set({ prerenderEnabled: v }),
  requestPrerender: (clipId) => {
    const ipc = (window as unknown as { ipcRenderer?: { generatePreviewProxy?: (a: unknown) => Promise<{ success: boolean; proxyPath?: string; error?: string }> } }).ipcRenderer;
    if (!ipc?.generatePreviewProxy) return;
    // Look up the FULL clip + project settings — Electron needs the media path,
    // trim/speed/effect data and fps, not just an id (otherwise it rejects).
    const clip = useClipStore.getState().clips.find((c) => c.id === clipId);
    if (!clip || (clip.type !== 'video' && clip.type !== 'image')) return;
    const settings = useProjectStore.getState().settings;
    ipc.generatePreviewProxy({ clip, settings })
      .then((result) => {
        if (result.success && result.proxyPath) {
          set((s) => ({ prerenderCache: { ...s.prerenderCache, [clipId]: result.proxyPath! } }));
        } else if (result.error) {
          console.warn('[timeline] prerender failed for', clipId, result.error);
        }
      })
      .catch((err) => console.warn('[timeline] prerender failed for', clipId, err));
  },
  setPixelsPerFrame: (ppf) => set({ pixelsPerFrame: Math.max(0.02, Math.min(5.0, ppf)) }),
  setScrollX: (x) => set({ scrollX: Math.max(0, x) }),
  setSelectedItemIds: (ids) => set({ selectedItemIds: ids }),
  toggleSnapEnabled: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  setActiveTool: (tool) => set({ activeTool: tool }),

  addMarker: (marker) => set((s) => ({
    markers: [...s.markers, marker].sort((a, b) => a.frame - b.frame),
  })),
  removeMarker: (id) => set((s) => ({
    markers: s.markers.filter((m) => m.id !== id),
  })),
  updateMarker: (id, updates) => set((s) => ({
    markers: s.markers
      .map((m) => (m.id === id ? { ...m, ...updates } : m))
      .sort((a, b) => a.frame - b.frame),
  })),

  setInOutRange: (range) => set({ inOutRange: range }),

  updateTrack: (id, updates) => set((s) => ({
    tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
  })),
  addTrack: (track) => set((s) => ({
    tracks: [...s.tracks, track],
  })),
  removeTrack: (id) => set((s) => ({
    tracks: s.tracks.filter((t) => t.id !== id),
  })),
  reorderTracks: (fromIndex, toIndex) => set((s) => {
    const next = [...s.tracks];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return { tracks: next };
  }),
    }),
    {
      name: 'mmmedia-timeline-ui',
      storage: createJSONStorage(() => localStorage),
      // Persist only durable UI preferences. Tracks/selection/playhead are
      // rebuilt from the clips each session (see useDeriveTracks), so they are
      // intentionally NOT persisted (avoids cross-project track bleed).
      partialize: (s) => ({
        snapEnabled: s.snapEnabled,
        pixelsPerFrame: s.pixelsPerFrame,
        prerenderEnabled: s.prerenderEnabled,
      }),
    },
  ),
);
