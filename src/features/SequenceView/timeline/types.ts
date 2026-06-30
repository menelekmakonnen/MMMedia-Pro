/**
 * Timeline engine local types.
 * These stubs mirror the interfaces that useTimelineStore (src/store/timelineStore.ts)
 * will expose. They exist here so the timeline components compile independently
 * before the store is wired in.
 */

export type ActiveTool =
  | 'select' | 'trim' | 'razor' | 'hand' | 'slip' | 'slide' | 'rate-stretch'
  | 'ripple' | 'rolling' | 'track-select' | 'pen' | 'zoom';

export interface Track {
  id: number;
  type: 'video' | 'audio';
  name: string;
  height: number;         // px
  locked: boolean;
  muted: boolean;
  solo: boolean;
  visible: boolean;
  color: string;          // hex accent for left border
  volume: number;         // 0–100
}

export interface TimelineMarker {
  id: string;
  frame: number;
  label: string;
  color: string;          // hex
}

export interface InOutRange {
  inFrame: number | null;
  outFrame: number | null;
}

export interface SnapResult {
  snappedFrame: number;
  didSnap: boolean;
  snapSourceFrame?: number;
}

/** Minimal subset of the timelineStore that components read from. */
export interface TimelineState {
  tracks: Track[];
  playheadFrame: number;
  isPlaying: boolean;
  /** JKL shuttle rate: -4,-2,-1,0,1,2,4 (0 = paused). */
  playbackRate: number;
  pixelsPerFrame: number;
  scrollX: number;
  snapEnabled: boolean;
  activeTool: ActiveTool;
  selectedItemIds: Set<string>;
  markers: TimelineMarker[];
  inOutRange: InOutRange;
  /** Pre-render / proxy state. */
  prerenderEnabled: boolean;
  prerenderCache: Record<string, string>; // clipId → proxy path

  /** Guide overlay state. */
  guides: { id: string; axis: 'h' | 'v'; position: number }[];
  showGuides: boolean;

  /** Track targeting (Premiere: which tracks receive insert/overwrite edits). */
  targetedTrackIds: Set<number>;
  /** Source patching (which source track maps onto which timeline track). */
  syncLockedTrackIds: Set<number>;

  // Actions
  setTracks: (tracks: Track[]) => void;
  setPlayheadFrame: (frame: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  setPrerenderEnabled: (v: boolean) => void;
  requestPrerender: (clipId: string) => void;
  setPixelsPerFrame: (ppf: number) => void;
  setScrollX: (x: number) => void;
  setSelectedItemIds: (ids: Set<string>) => void;
  toggleSnapEnabled: () => void;
  setActiveTool: (tool: ActiveTool) => void;
  addMarker: (marker: TimelineMarker) => void;
  removeMarker: (id: string) => void;
  updateMarker: (id: string, updates: Partial<TimelineMarker>) => void;
  setInOutRange: (range: InOutRange) => void;
  updateTrack: (id: number, updates: Partial<Track>) => void;
  addTrack: (track: Track) => void;
  removeTrack: (id: number) => void;
  reorderTracks: (fromIndex: number, toIndex: number) => void;
  addGuide: (axis: 'h' | 'v', position: number) => void;
  removeGuide: (id: string) => void;
  updateGuidePosition: (id: string, position: number) => void;
  toggleGuides: () => void;
  toggleTargetTrack: (id: number) => void;
  toggleSyncLock: (id: number) => void;
}
