import React, { useState, useCallback, useRef, memo } from 'react';
import { Plus, Film, Music, Sliders, ChevronDown, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { useTimelineStore } from './useTimelineStore';
import { InlineTrackMixer } from '../audio/InlineTrackMixer';
import type { Track } from './types';

interface TrackControlsProps {
  /** Tracks ordered top-to-bottom. */
  tracks: Track[];
}

let nextVideoId = 10;
let nextAudioId = 200;

/**
 * TrackControls — the fixed-width left column above all track headers.
 * Provides a global header row and an "Add Track" button.
 */
export const TrackControls: React.FC<TrackControlsProps> = memo(({ tracks }) => {
  const addTrack = useTimelineStore((s) => s.addTrack);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [mixerOpen, setMixerOpen] = useState(false); // folded by default
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleAddVideo = useCallback(() => {
    const id = nextVideoId++;
    addTrack({
      id,
      type: 'video',
      name: `V${id}`,
      height: 60,
      locked: false,
      muted: false,
      solo: false,
      visible: true,
      color: '#6366f1',
      volume: 100,
    });
    setShowAddMenu(false);
  }, [addTrack]);

  const handleAddAudio = useCallback(() => {
    const id = nextAudioId++;
    addTrack({
      id,
      type: 'audio',
      name: `A${id - 100 + 1}`,
      height: 48,
      locked: false,
      muted: false,
      solo: false,
      visible: true,
      color: '#ec4899',
      volume: 100,
    });
    setShowAddMenu(false);
  }, [addTrack]);

  return (
    <div className="w-[200px] flex-shrink-0 flex flex-col bg-[#0a0a15]/90 border-r border-white/[0.04]">
      {/* Global header */}
      <div className="h-7 flex items-center justify-between px-2 border-b border-white/10 bg-[#0d0d1a]">
        <span className="text-[9px] font-bold text-white/30 tracking-widest uppercase">
          Tracks
        </span>
      </div>

      {/* Spacer to align with track lanes — the actual headers are rendered by TimelineTrack */}
      <div className="flex-1" />

      {/* Track Mixer — folded by default, sits beside the tracks it controls */}
      <div className="border-t border-white/[0.04]">
        <button
          onClick={() => setMixerOpen((v) => !v)}
          className={clsx(
            'w-full flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider transition-colors',
            mixerOpen ? 'text-cyan-300 bg-cyan-500/[0.06]' : 'text-white/35 hover:text-white/60 hover:bg-white/[0.03]',
          )}
          title="Track Mixer"
        >
          {mixerOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          <Sliders size={10} />
          Track Mixer
        </button>
        {mixerOpen && (
          <div className="max-h-[200px] overflow-y-auto px-1.5 py-1.5 bg-[#0a0a15]/60">
            <InlineTrackMixer />
          </div>
        )}
      </div>

      {/* Add track button */}
      <div className="relative p-1.5 border-t border-white/[0.04]">
        <button
          ref={btnRef}
          onClick={() => setShowAddMenu((v) => !v)}
          className="w-full flex items-center justify-center gap-1 py-1 rounded text-[9px] text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
        >
          <Plus size={10} />
          Add Track
        </button>

        {showAddMenu && (
          <div className="absolute bottom-full left-1 mb-1 bg-[#12122a] border border-white/10 rounded shadow-xl z-50 min-w-[140px] py-0.5">
            <button
              onClick={handleAddVideo}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-[10px] text-white/60 hover:text-white hover:bg-white/5 transition-colors"
            >
              <Film size={11} className="text-indigo-400" />
              Add Video Track
            </button>
            <button
              onClick={handleAddAudio}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-[10px] text-white/60 hover:text-white hover:bg-white/5 transition-colors"
            >
              <Music size={11} className="text-pink-400" />
              Add Audio Track
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

TrackControls.displayName = 'TrackControls';
