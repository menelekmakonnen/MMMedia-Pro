/**
 * useDeriveTracks — keeps the timeline store's `tracks` array in sync with the
 * clips that exist in the clipStore.
 *
 * The timeline components render `useTimelineStore.tracks`, but that array is
 * otherwise empty. This hook guarantees a track object exists for every
 * `clip.track` value in use (plus the canonical defaults V1 / A1 / A2), so the
 * modular timeline shows real content. It NEVER removes tracks the user added
 * manually or reordered — it only appends missing ones — so track CRUD and
 * reordering performed elsewhere are preserved.
 *
 * Track-number convention (matches the rest of the app):
 *   1            → V1 (primary video)
 *   2            → A1 (linked / sync audio)
 *   101+         → A2, A3 … (music / extra audio)
 *   3..99        → V2, V3 … (extra video)
 */
import { useEffect, useRef } from 'react';
import { useClipStore } from '../../../store/clipStore';
import { useTimelineStore } from '../timeline/useTimelineStore';
import type { Track } from '../timeline/types';

const VIDEO_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#7c3aed', '#6d28d9'];
const AUDIO_COLORS = ['#06b6d4', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9'];

function isAudioTrack(id: number): boolean {
  return id === 2 || id >= 100;
}

function trackName(id: number): string {
  if (id === 1) return 'V1';
  if (id === 2) return 'A1';
  if (id >= 100) return `A${id - 100 + 2}`; // 101 → A2, 102 → A3
  return `V${id}`; // 3 → V3 …
}

function makeTrack(id: number): Track {
  const audio = isAudioTrack(id);
  const palette = audio ? AUDIO_COLORS : VIDEO_COLORS;
  const paletteIdx = audio ? (id >= 100 ? id - 100 : 1) : Math.max(0, id - 1);
  return {
    id,
    type: audio ? 'audio' : 'video',
    name: trackName(id),
    height: audio ? 48 : 60,
    locked: false,
    muted: false,
    solo: false,
    visible: true,
    color: palette[paletteIdx % palette.length],
    volume: 100,
  };
}

/** Sort key so video tracks render above audio tracks, each ascending. */
function orderKey(id: number): number {
  return isAudioTrack(id) ? 1000 + id : id;
}

export function useDeriveTracks(): void {
  const clips = useClipStore((s) => s.clips);
  const lastSigRef = useRef<string>('');

  useEffect(() => {
    const existing = useTimelineStore.getState().tracks;

    // Required ids = canonical defaults + every track referenced by a clip.
    const needed = new Set<number>([1, 2, 101]);
    for (const c of clips) needed.add((c as { track?: number }).track ?? 1);

    const haveIds = new Set(existing.map((t) => t.id));
    const missing = [...needed].filter((id) => !haveIds.has(id));

    // Nothing to add and we already have at least the defaults → no-op.
    if (missing.length === 0 && existing.length > 0) {
      lastSigRef.current = existing.map((t) => t.id).join(',');
      return;
    }

    let next: Track[];
    if (existing.length === 0) {
      next = [...needed]
        .sort((a, b) => orderKey(a) - orderKey(b))
        .map(makeTrack);
    } else {
      next = [...existing];
      for (const id of missing.sort((a, b) => orderKey(a) - orderKey(b))) {
        next.push(makeTrack(id));
      }
    }

    const sig = next.map((t) => t.id).join(',');
    if (sig !== lastSigRef.current) {
      lastSigRef.current = sig;
      useTimelineStore.getState().setTracks(next);
    }
  }, [clips]);
}
