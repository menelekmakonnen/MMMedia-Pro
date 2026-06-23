/**
 * Timeline engine — barrel export.
 * Import everything from this file for clean consumption.
 */

// ── Types ──────────────────────────────────────────────────────────
export type {
  Track,
  TimelineMarker,
  InOutRange,
  ActiveTool,
  SnapResult,
  TimelineState,
} from './types';

// ── Store ──────────────────────────────────────────────────────────
export { useTimelineStore } from './useTimelineStore';

// ── Components ─────────────────────────────────────────────────────
export { TimelineRuler } from './TimelineRuler';
export { TimelinePlayhead } from './TimelinePlayhead';
export { TimelineTrack } from './TimelineTrack';
export { TimelineClip } from './TimelineClip';
export { TimelineTransition } from './TimelineTransition';
export { TimelineMarkers } from './TimelineMarkers';
export { TrackControls } from './TrackControls';
export { TimelineCanvas } from './TimelineCanvas';
