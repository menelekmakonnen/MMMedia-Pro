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

/**
 * Put tracks in Premiere stacking order and name them by POSITION (not by raw
 * id): video on top with the highest number at the top and V1 at the bottom,
 * then audio below with A1 directly under V1 increasing downward. This fixes
 * mis-ordered inserts (new video track landing under audio) and wrong labels
 * (id 101 → "A3", a new track → "V11").
 */
export function normalizeTracks(tracks: Track[]): Track[] {
  const key = (t: Track) => (t.type === 'audio' ? 1000 + t.id : -t.id);
  const sorted = [...tracks].sort((a, b) => key(a) - key(b));
  const vCount = sorted.filter((t) => t.type === 'video').length;
  let vSeen = 0;
  let aSeen = 0;
  return sorted.map((t) => {
    if (t.type === 'video') { vSeen += 1; return { ...t, name: `V${vCount - vSeen + 1}` }; }
    aSeen += 1; return { ...t, name: `A${aSeen}` };
  });
}

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

  // Guide overlay state
  guides: [],
  showGuides: false,

  // Track targeting / sync lock (Premiere track-header toggles)
  targetedTrackIds: new Set<number>([1, 2]), // V1 + A1 targeted by default
  syncLockedTrackIds: new Set<number>(),
  showAudioMeters: true,
  markersPanelOpen: false,
  adjustmentDialogOpen: false,

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
    tracks: normalizeTracks([...s.tracks, track]),
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

  // ── Guide overlay actions ─────────────────────────────────────────
  addGuide: (axis, position) => set((s) => ({ guides: [...s.guides, { id: crypto.randomUUID(), axis, position }] })),
  removeGuide: (id) => set((s) => ({ guides: s.guides.filter((g) => g.id !== id) })),
  updateGuidePosition: (id, position) => set((s) => ({ guides: s.guides.map((g) => g.id === id ? { ...g, position } : g) })),
  toggleGuides: () => set((s) => ({ showGuides: !s.showGuides })),
  toggleTargetTrack: (id) => set((s) => {
    const next = new Set(s.targetedTrackIds);
    next.has(id) ? next.delete(id) : next.add(id);
    return { targetedTrackIds: next };
  }),
  toggleSyncLock: (id) => set((s) => {
    const next = new Set(s.syncLockedTrackIds);
    next.has(id) ? next.delete(id) : next.add(id);
    return { syncLockedTrackIds: next };
  }),
  toggleAudioMeters: () => set((s) => ({ showAudioMeters: !s.showAudioMeters })),
  toggleMarkersPanel: () => set((s) => ({ markersPanelOpen: !s.markersPanelOpen })),
  setAdjustmentDialogOpen: (open) => set({ adjustmentDialogOpen: open }),
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
        showGuides: s.showGuides,
      }),
    },
  ),
);
