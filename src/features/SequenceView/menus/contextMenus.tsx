/**
 * Context-menu definitions for the NLE timeline.
 *
 * These builders translate the (already-complete) sequence action library
 * into ContextMenuItem[] structures consumed by the shared `useContextMenu`
 * hook. They are intentionally side-effect-light: each item just calls an
 * action; the hook handles open/close/positioning.
 */
import React from 'react';
import {
  Scissors, Copy, ClipboardPaste, Files, Trash2, ChevronsRight,
  EyeOff, Eye, Gauge, Rewind, Layers, PackageOpen, MoveVertical,
  Plus, Lock, Volume2, ArrowUp, ArrowDown,
} from 'lucide-react';
import type { ContextMenuItem } from '../../../components/ContextMenu';
import type { Clip } from '../../../store/clipStore';
import type { Track } from '../timeline/types';
import { useClipStore } from '../../../store/clipStore';
import { useTimelineStore } from '../timeline/useTimelineStore';
import {
  splitAtPlayhead,
  cutSelectedClips,
  copySelectedClips,
  pasteAtPlayhead,
  duplicateSelectedClips,
  deleteSelectedClips,
  rippleDeleteSelectedClips,
  toggleClipEnabled,
  moveClipToTrack,
  nestAsSubsequence,
  unnestSubsequence,
  getClipboardCount,
} from '../actions';

const ic = (node: React.ReactNode) => node;

const SPEED_PRESETS: Array<{ label: string; value: number }> = [
  { label: '0.25× — Slow Motion', value: 0.25 },
  { label: '0.5× — Half Speed', value: 0.5 },
  { label: '1× — Normal', value: 1 },
  { label: '1.5×', value: 1.5 },
  { label: '2× — Double', value: 2 },
  { label: '4× — Fast', value: 4 },
];

/**
 * Build the right-click menu for a clip on the timeline.
 * `selectedIds` are the currently-selected clip ids (the action library
 * operates on the clipStore selection, which the caller keeps in sync).
 */
export function buildClipMenu(clip: Clip, selectedIds: string[]): ContextMenuItem[] {
  const playhead = useTimelineStore.getState().playheadFrame;
  const tracks = useTimelineStore.getState().tracks;
  const { setClipSpeed, updateClip } = useClipStore.getState();
  const selCount = Math.max(1, selectedIds.length);
  const isSubsequence = Array.isArray((clip as unknown as { subClips?: unknown[] }).subClips);
  const clipboardCount = getClipboardCount();

  const moveTargets: ContextMenuItem[] = tracks
    .filter((t) => t.id !== clip.track)
    .map((t) => ({
      label: `${t.name} (${t.type})`,
      icon: ic(<MoveVertical size={13} />),
      onClick: () => moveClipToTrack(clip.id, String(t.id)),
    }));

  const speedItems: ContextMenuItem[] = SPEED_PRESETS.map((p) => ({
    label: p.label,
    onClick: () => selectedIds.forEach((id) => setClipSpeed(id, p.value)),
  }));
  speedItems.push({ type: 'separator' });
  speedItems.push({
    label: clip.reversed ? 'Un-reverse' : 'Reverse Clip',
    icon: ic(<Rewind size={13} />),
    onClick: () => selectedIds.forEach((id) => updateClip(id, { reversed: !clip.reversed })),
  });

  return [
    { label: 'Split at Playhead', shortcut: 'B', icon: ic(<Scissors size={13} />), onClick: () => splitAtPlayhead(playhead) },
    { type: 'separator' },
    { label: 'Cut', shortcut: 'Ctrl+X', icon: ic(<Scissors size={13} />), onClick: () => cutSelectedClips() },
    { label: 'Copy', shortcut: 'Ctrl+C', icon: ic(<Copy size={13} />), onClick: () => copySelectedClips() },
    { label: 'Paste', shortcut: 'Ctrl+V', icon: ic(<ClipboardPaste size={13} />), disabled: clipboardCount === 0, onClick: () => pasteAtPlayhead(playhead) },
    { label: 'Duplicate', shortcut: 'Ctrl+D', icon: ic(<Files size={13} />), onClick: () => duplicateSelectedClips() },
    { type: 'separator' },
    { label: 'Speed / Duration', icon: ic(<Gauge size={13} />), children: speedItems },
    { label: 'Move to Track', icon: ic(<MoveVertical size={13} />), disabled: moveTargets.length === 0, children: moveTargets.length ? moveTargets : [{ label: 'No other tracks', disabled: true }] },
    {
      label: clip.disabled ? 'Enable Clip' : 'Disable Clip',
      icon: ic(clip.disabled ? <Eye size={13} /> : <EyeOff size={13} />),
      onClick: () => toggleClipEnabled(clip.id),
    },
    { type: 'separator' },
    {
      label: `Nest as Subsequence${selCount > 1 ? ` (${selCount})` : ''}`,
      icon: ic(<Layers size={13} />),
      disabled: selCount < 2,
      onClick: () => nestAsSubsequence(selectedIds),
    },
    ...(isSubsequence
      ? [{ label: 'Unnest Subsequence', icon: ic(<PackageOpen size={13} />), onClick: () => unnestSubsequence(clip.id) } as ContextMenuItem]
      : []),
    { type: 'separator' },
    { label: 'Ripple Delete (close gap)', shortcut: 'Shift+Del', icon: ic(<ChevronsRight size={13} />), danger: true, onClick: () => rippleDeleteSelectedClips() },
    { label: 'Delete (leave gap)', shortcut: 'Del', icon: ic(<Trash2 size={13} />), danger: true, onClick: () => deleteSelectedClips() },
  ];
}

/** Build the right-click menu for a track header. */
export function buildTrackMenu(track: Track, index: number, totalTracks: number): ContextMenuItem[] {
  const { updateTrack, removeTrack, reorderTracks, addTrack, tracks } = useTimelineStore.getState();

  const nextVideoId = 10 + tracks.filter((t) => t.type === 'video').length;
  const nextAudioId = 200 + tracks.filter((t) => t.type === 'audio').length;

  const trackClipCount = useClipStore.getState().clips.filter((c) => c.track === track.id).length;

  return [
    {
      label: 'Add Video Track', icon: ic(<Plus size={13} />),
      onClick: () => addTrack({ id: nextVideoId, type: 'video', name: `V${nextVideoId}`, height: 60, locked: false, muted: false, solo: false, visible: true, color: '#6366f1', volume: 100 }),
    },
    {
      label: 'Add Audio Track', icon: ic(<Plus size={13} />),
      onClick: () => addTrack({ id: nextAudioId, type: 'audio', name: `A${nextAudioId - 100 + 1}`, height: 48, locked: false, muted: false, solo: false, visible: true, color: '#ec4899', volume: 100 }),
    },
    { type: 'separator' },
    { label: 'Move Track Up', icon: ic(<ArrowUp size={13} />), disabled: index === 0, onClick: () => reorderTracks(index, index - 1) },
    { label: 'Move Track Down', icon: ic(<ArrowDown size={13} />), disabled: index >= totalTracks - 1, onClick: () => reorderTracks(index, index + 1) },
    { type: 'separator' },
    { label: track.locked ? 'Unlock Track' : 'Lock Track', icon: ic(<Lock size={13} />), onClick: () => updateTrack(track.id, { locked: !track.locked }) },
    { label: track.visible ? 'Hide Track' : 'Show Track', icon: ic(track.visible ? <EyeOff size={13} /> : <Eye size={13} />), onClick: () => updateTrack(track.id, { visible: !track.visible }) },
    { label: track.muted ? 'Unmute Track' : 'Mute Track', icon: ic(<Volume2 size={13} />), onClick: () => updateTrack(track.id, { muted: !track.muted }) },
    { type: 'separator' },
    {
      label: 'Track Height', children: [
        { label: 'Compact (36px)', onClick: () => updateTrack(track.id, { height: 36 }) },
        { label: 'Standard (60px)', onClick: () => updateTrack(track.id, { height: 60 }) },
        { label: 'Tall (96px)', onClick: () => updateTrack(track.id, { height: 96 }) },
      ],
    },
    { type: 'separator' },
    {
      label: trackClipCount > 0 ? `Remove Track (${trackClipCount} clips)` : 'Remove Track',
      icon: ic(<Trash2 size={13} />),
      danger: true,
      disabled: track.id === 1 || trackClipCount > 0,
      onClick: () => removeTrack(track.id),
    },
  ];
}
