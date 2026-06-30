// ══════════════════════════════════════════════════════════════════════════════
// InlineTrackMixer — compact per-track fader strip (volume + Solo/Mute) plus a
// master bus. Lives beside the timeline tracks (folded by default) rather than in
// the Inspector, so the faders sit next to the tracks they control.
// ══════════════════════════════════════════════════════════════════════════════

import React from 'react';
import clsx from 'clsx';
import { useTimelineStore } from '../timeline/useTimelineStore';
import { useUserStore } from '../../../store/userStore';

export const InlineTrackMixer: React.FC<{ highlightTrack?: number }> = ({ highlightTrack }) => {
  const tracks = useTimelineStore((s) => s.tracks);
  const updateTrack = useTimelineStore((s) => s.updateTrack);
  const { masterVolume, isMasterMuted, setMasterVolume, setIsMasterMuted } = useUserStore();

  return (
    <div className="space-y-1.5">
      {tracks.map((track) => {
        const isHighlighted = highlightTrack !== undefined && track.id === highlightTrack;
        return (
          <div
            key={track.id}
            className={clsx(
              'flex items-center gap-1.5 px-1.5 py-1 rounded-lg transition-colors',
              isHighlighted ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-white/[0.02]',
            )}
          >
            <span className="text-[8px] font-bold text-white/40 w-8 truncate">{track.name}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={track.volume}
              onChange={(e) => updateTrack(track.id, { volume: parseInt(e.target.value) })}
              className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-purple-500"
            />
            <span className="text-[7px] font-mono text-white/30 w-5 text-right">
              {track.volume === 0 ? '-∞' : `${Math.round((track.volume / 100) * 12 - 6)}`}
            </span>
            <button
              onClick={() => updateTrack(track.id, { solo: !track.solo })}
              className={clsx(
                'w-4 h-4 rounded text-[7px] font-black flex items-center justify-center',
                track.solo
                  ? 'bg-yellow-500/30 text-yellow-400 border border-yellow-500/40'
                  : 'bg-white/5 text-white/25 hover:bg-white/10',
              )}
            >S</button>
            <button
              onClick={() => updateTrack(track.id, { muted: !track.muted })}
              className={clsx(
                'w-4 h-4 rounded text-[7px] font-black flex items-center justify-center',
                track.muted
                  ? 'bg-red-500/30 text-red-400 border border-red-500/40'
                  : 'bg-white/5 text-white/25 hover:bg-white/10',
              )}
            >M</button>
          </div>
        );
      })}

      {/* Master bus */}
      <div className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg bg-purple-500/5 border border-purple-500/10 mt-1">
        <span className="text-[8px] font-black text-purple-400/60 w-8">MST</span>
        <input
          type="range"
          min={0}
          max={100}
          value={masterVolume}
          onChange={(e) => setMasterVolume(parseInt(e.target.value))}
          className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-purple-400"
        />
        <span className="text-[7px] font-mono text-white/30 w-5 text-right">
          {masterVolume === 0 ? '-∞' : `${Math.round((masterVolume / 100) * 12 - 6)}`}
        </span>
        <button
          onClick={() => setIsMasterMuted(!isMasterMuted)}
          className={clsx(
            'w-4 h-4 rounded text-[7px] font-black flex items-center justify-center',
            isMasterMuted
              ? 'bg-red-500/30 text-red-400 border border-red-500/40'
              : 'bg-white/5 text-white/25 hover:bg-white/10',
          )}
        >M</button>
      </div>
    </div>
  );
};

export default InlineTrackMixer;
