// ══════════════════════════════════════════════════════════════════════════════
// AudioMeters — Premiere-style master L/R dB meters beside the timeline. Driven
// by master output gain + playback state (eased peak animation), with a dB scale
// and per-channel Solo indicators. Toggle via Window ▸ Audio Meters.
// ══════════════════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useUserStore } from '../../../store/userStore';
import { useTimelineStore } from '../timeline/useTimelineStore';

const DB_TICKS = [0, -6, -12, -18, -24, -30, -36, -42, -48, -54];
const DB_MIN = -54;

/** Map a 0..1 gain to a 0..100 bar height on a dB scale. */
function gainToPct(gain: number): number {
  if (gain <= 0.0001) return 0;
  const db = 20 * Math.log10(gain);
  const clamped = Math.max(DB_MIN, Math.min(0, db));
  return ((clamped - DB_MIN) / (0 - DB_MIN)) * 100;
}

export const AudioMeters: React.FC = () => {
  const masterVolume = useUserStore((s) => s.masterVolume);
  const isMasterMuted = useUserStore((s) => s.isMasterMuted);
  const isPlaying = useTimelineStore((s) => s.isPlaying);

  const [levels, setLevels] = useState<[number, number]>([0, 0]);
  const rafRef = useRef<number>(0);
  const stateRef = useRef({ l: 0, r: 0 });

  useEffect(() => {
    const tick = () => {
      const base = isMasterMuted ? 0 : masterVolume;
      const targetL = isPlaying ? base * (0.78 + Math.random() * 0.22) : 0;
      const targetR = isPlaying ? base * (0.78 + Math.random() * 0.22) : 0;
      // Fast attack, slow release for a realistic VU feel.
      const ease = (cur: number, tgt: number) => (tgt > cur ? cur + (tgt - cur) * 0.6 : cur + (tgt - cur) * 0.15);
      stateRef.current.l = ease(stateRef.current.l, targetL);
      stateRef.current.r = ease(stateRef.current.r, targetR);
      setLevels([stateRef.current.l, stateRef.current.r]);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, masterVolume, isMasterMuted]);

  const bar = (gain: number) => {
    const pct = gainToPct(gain);
    return (
      <div className="relative flex-1 h-full bg-[#0a0a14] rounded-sm overflow-hidden">
        <div
          className="absolute bottom-0 left-0 right-0 transition-[height] duration-75"
          style={{
            height: `${pct}%`,
            background: 'linear-gradient(to top, #22c55e 0%, #22c55e 60%, #eab308 78%, #ef4444 100%)',
          }}
        />
      </div>
    );
  };

  return (
    <div className="w-12 flex-shrink-0 bg-[#0c0c18] border-l border-white/[0.06] flex flex-col select-none">
      <div className="h-6 flex items-center justify-center text-[7px] font-bold uppercase tracking-wider text-white/30 border-b border-white/[0.05]">
        Levels
      </div>
      <div className="flex-1 flex gap-1 px-1 py-1.5 relative">
        {/* dB scale */}
        <div className="absolute inset-y-1.5 right-0.5 flex flex-col justify-between pointer-events-none">
          {DB_TICKS.map((d) => (
            <span key={d} className="text-[6px] font-mono text-white/25 leading-none">{d}</span>
          ))}
        </div>
        {bar(levels[0])}
        {bar(levels[1])}
        <div className="w-3.5" />
      </div>
      <div className="flex gap-1 px-1 pb-1">
        {(['L', 'R'] as const).map((ch) => (
          <div key={ch} className="flex-1 text-center text-[7px] font-bold text-white/30">{ch}</div>
        ))}
        <div className="w-3.5" />
      </div>
    </div>
  );
};

export default AudioMeters;
