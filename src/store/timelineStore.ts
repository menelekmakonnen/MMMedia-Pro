/**
 * Timeline Store — DEPRECATED location.
 * ════════════════════════════════════════════════════════════════════════════
 * The timeline state model now lives in a single place:
 *   src/features/SequenceView/timeline/useTimelineStore.ts  (+ ./types.ts)
 *
 * This module used to define a second, competing store that nothing consumed.
 * It now simply re-exports the canonical store so there is exactly one store and
 * one type model. Import from the feature module directly in new code.
 */
export { useTimelineStore } from '../features/SequenceView/timeline/useTimelineStore';
export type {
    Track,
    TimelineMarker,
    TimelineState,
    InOutRange,
    ActiveTool,
    ActiveTool as TimelineTool,
} from '../features/SequenceView/timeline/types';
