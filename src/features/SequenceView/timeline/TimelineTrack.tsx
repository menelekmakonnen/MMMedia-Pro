import React, { useState, useCallback, memo } from 'react';
import {
  Lock, Unlock, Volume2, VolumeX, Eye, EyeOff, Headphones,
  Video, Mic, Link2, Link2Off,
} from 'lucide-react';
import clsx from 'clsx';
import { useTimelineStore } from './useTimelineStore';
import { TimelineClip, type SnapFn } from './TimelineClip';
import type { Track } from './types';
import type { Clip } from '../../../store/clipStore';

interface TimelineTrackProps {
  track: Track;
  clips: Clip[];
  trackIndex: number;
  totalTracks: number;
  onClipSelect: (clipId: string, additive: boolean) => void;
  onTrimStart: (clipId: string, deltaFrames: number) => void;
  onTrimEnd: (clipId: string, deltaFrames: number) => void;
  onClipContextMenu?: (e: React.MouseEvent, clip: Clip) => void;
  onHeaderContextMenu?: (e: React.MouseEvent, track: Track, index: number, total: number) => void;
  snapRange?: SnapFn;
}

export const TimelineTrack: React.FC<TimelineTrackProps> = memo(({
  track,
  clips,
  trackIndex,
  totalTracks,
  onClipSelect,
  onTrimStart,
  onTrimEnd,
  onClipContextMenu,
  onHeaderContextMenu,
  snapRange,
}) => {
  const ppf = useTimelineStore((s) => s.pixelsPerFrame);
  const scrollX = useTimelineStore((s) => s.scrollX);
  const activeTool = useTimelineStore((s) => s.activeTool);
  const selectedItemIds = useTimelineStore((s) => s.selectedItemIds);
  const updateTrack = useTimelineStore((s) => s.updateTrack);
  const targetedTrackIds = useTimelineStore((s) => s.targetedTrackIds);
  const toggleTargetTrack = useTimelineStore((s) => s.toggleTargetTrack);
  const syncLockedTrackIds = useTimelineStore((s) => s.syncLockedTrackIds);
  const toggleSyncLock = useTimelineStore((s) => s.toggleSyncLock);
  const isTargeted = targetedTrackIds.has(track.id);
  const isSyncLocked = syncLockedTrackIds.has(track.id);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(track.name);
  const [isDragOver, setIsDragOver] = useState(false);

  // ── Track header actions ──────────────────────────────────────────
  const toggleLock = useCallback(() => {
    updateTrack(track.id, { locked: !track.locked });
  }, [track.id, track.locked, updateTrack]);

  const toggleMute = useCallback(() => {
    updateTrack(track.id, { muted: !track.muted });
  }, [track.id, track.muted, updateTrack]);

  const toggleSolo = useCallback(() => {
    updateTrack(track.id, { solo: !track.solo });
  }, [track.id, track.solo, updateTrack]);

  const toggleVisibility = useCallback(() => {
    updateTrack(track.id, { visible: !track.visible });
  }, [track.id, track.visible, updateTrack]);

  const handleNameDoubleClick = useCallback(() => {
    setEditName(track.name);
    setIsEditing(true);
  }, [track.name]);

  const commitName = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== track.name) {
      updateTrack(track.id, { name: trimmed });
    }
    setIsEditing(false);
  }, [editName, track.id, track.name, updateTrack]);

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateTrack(track.id, { volume: parseInt(e.target.value, 10) });
    },
    [track.id, updateTrack],
  );

  const isAudio = track.type === 'audio';

  return (
    <div
      className={clsx(
        'flex min-h-[48px] border-b border-white/[0.04] relative group transition-all',
        !track.visible ? 'bg-[#0a0a15]/80 opacity-50' : 'bg-[#0c0c18]/60',
      )}
      style={{ height: track.height }}
    >
      {/* ── Track Header (left 200px) ─────────────────────────────────── */}
      <div
        className="w-[200px] bg-[#0f0f20] border-r border-white/[0.04] flex p-2 gap-1.5 flex-shrink-0 sticky left-0 z-10 shadow-lg"
        style={{ borderLeft: `4px solid ${track.color}` }}
        onContextMenu={(e) => onHeaderContextMenu?.(e, track, trackIndex, totalTracks)}
      >
        {/* Track target box (Premiere: insert/overwrite destination) */}
        <button
          onClick={() => toggleTargetTrack(track.id)}
          title={isTargeted ? 'Track targeted — click to untarget' : 'Target this track'}
          className={clsx(
            'w-7 h-7 flex-shrink-0 rounded flex items-center justify-center text-[9px] font-black tracking-tight transition-colors self-start',
            isTargeted
              ? 'bg-sky-500 text-white shadow ring-1 ring-sky-300/60'
              : 'bg-[#1a1a30] text-white/40 hover:text-white/70 ring-1 ring-white/10',
          )}
        >
          {track.name}
        </button>

        {/* Content column */}
        <div className="flex-1 flex flex-col gap-1 min-w-0">
        {/* Name row */}
        <div className="flex items-center justify-between">
          {isEditing ? (
            <input
              autoFocus
              className="bg-transparent text-[10px] font-bold text-white/80 outline-none border-b border-white/20 w-full"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName();
                if (e.key === 'Escape') setIsEditing(false);
              }}
            />
          ) : (
            <span
              className={clsx(
                'text-[10px] font-bold flex items-center gap-1.5 tracking-wide cursor-default',
                track.muted ? 'text-white/25 line-through' : 'text-white/55',
              )}
              onDoubleClick={handleNameDoubleClick}
            >
              {isAudio ? (
                <Mic size={10} className="text-pink-400/70" />
              ) : (
                <Video size={10} className="text-indigo-400/70" />
              )}
              {track.name}
            </span>
          )}
        </div>

        {/* Control row */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={toggleVisibility}
            className={clsx(
              'p-0.5 rounded transition-colors',
              !track.visible ? 'text-yellow-400' : 'text-white/20 hover:text-white/50',
            )}
            title="Toggle Visibility"
          >
            {track.visible ? <Eye size={11} /> : <EyeOff size={11} />}
          </button>
          <button
            onClick={toggleLock}
            className={clsx(
              'p-0.5 rounded transition-colors',
              track.locked ? 'text-red-400' : 'text-white/20 hover:text-white/50',
            )}
            title="Toggle Lock"
          >
            {track.locked ? <Lock size={11} /> : <Unlock size={11} />}
          </button>
          <button
            onClick={toggleMute}
            className={clsx(
              'p-0.5 rounded transition-colors',
              track.muted ? 'text-red-400' : 'text-white/20 hover:text-white/50',
            )}
            title={track.muted ? 'Unmute' : 'Mute'}
          >
            {track.muted ? <VolumeX size={11} /> : <Volume2 size={11} />}
          </button>
          <button
            onClick={toggleSolo}
            className={clsx(
              'p-0.5 rounded transition-colors',
              track.solo ? 'text-yellow-300' : 'text-white/20 hover:text-white/50',
            )}
            title={track.solo ? 'Unsolo' : 'Solo'}
          >
            <Headphones size={11} />
          </button>
          <button
            onClick={() => toggleSyncLock(track.id)}
            className={clsx(
              'p-0.5 rounded transition-colors',
              isSyncLocked ? 'text-cyan-300' : 'text-white/20 hover:text-white/50',
            )}
            title={isSyncLocked ? 'Sync Lock on' : 'Sync Lock off'}
          >
            {isSyncLocked ? <Link2 size={11} /> : <Link2Off size={11} />}
          </button>
        </div>

        {/* Volume slider for audio tracks */}
        {isAudio && (
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[7px] text-white/20 w-4 text-right font-mono">
              {track.volume}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={track.volume}
              onChange={handleVolumeChange}
              className="flex-1 h-0.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-purple-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400"
              title={`Track Volume: ${track.volume}%`}
            />
          </div>
        )}
        </div>
      </div>

      {/* ── Track Lane (clip content area) ────────────────────────────── */}
      <div
        data-track-id={track.id}
        data-track-type={track.type}
        className={clsx(
          'flex-1 relative min-w-0',
          activeTool === 'razor' && 'cursor-crosshair',
          isDragOver && 'ring-1 ring-inset ring-purple-500/40 bg-purple-500/5',
        )}
        style={{
          height: track.height,
          backgroundSize: '20px 20px',
          backgroundImage: 'radial-gradient(circle, #ffffff03 1px, transparent 1px)',
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={() => setIsDragOver(false)}
      >
        {clips.map((clip) => (
          <TimelineClip
            key={clip.id}
            clip={clip}
            track={track}
            isSelected={selectedItemIds.has(clip.id)}
            onSelect={onClipSelect}
            onTrimStart={onTrimStart}
            onTrimEnd={onTrimEnd}
            onContextMenu={onClipContextMenu}
            snapRange={snapRange}
          />
        ))}
      </div>
    </div>
  );
});

TimelineTrack.displayName = 'TimelineTrack';
