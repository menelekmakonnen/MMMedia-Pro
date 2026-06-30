// ══════════════════════════════════════════════════════════════════════════════
// SourceMonitor — Premiere-style Source monitor with 3-point editing.
// Opens when a clip is loaded (double-click in the Media panel). Set In/Out on
// the source, then Insert (ripple) or Overwrite into the timeline at the playhead
// on the targeted video track. Shown as a floating panel so the Program monitor's
// playback engine is untouched.
// ══════════════════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Play, Pause, X, LogIn, LogOut, ChevronsLeftRight } from 'lucide-react';
import { useSequenceViewStore } from '../../store/sequenceViewStore';
import { useTimelineStore } from './timeline/useTimelineStore';
import { useProjectStore } from '../../store/projectStore';
import { formatTimecode } from '../../lib/time';
import { insertClipAtPlayhead, overwriteAtPlayhead } from './actions';
import type { MediaFile } from '../../store/mediaStore';

export const SourceMonitor: React.FC = () => {
  const src = useSequenceViewStore((s) => s.sourceMonitorClip);
  const setSrc = useSequenceViewStore((s) => s.setSourceMonitorClip);
  const sourceIn = useSequenceViewStore((s) => s.sourceIn);
  const sourceOut = useSequenceViewStore((s) => s.sourceOut);
  const setSourceIn = useSequenceViewStore((s) => s.setSourceIn);
  const setSourceOut = useSequenceViewStore((s) => s.setSourceOut);

  const playhead = useTimelineStore((s) => s.playheadFrame);
  const targetedTrackIds = useTimelineStore((s) => s.targetedTrackIds);
  const settings = useProjectStore((s) => s.settings);
  const fps = settings.fps ?? 30;
  const W = settings.resolution?.width ?? 1920;
  const H = settings.resolution?.height ?? 1080;

  const videoRef = useRef<HTMLVideoElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef<number>(0);

  const durationFrames = src ? Math.max(1, Math.round(src.duration * fps)) : 1;

  // Drive the source playhead from the <video> while playing.
  useEffect(() => {
    if (!playing) { videoRef.current?.pause(); return; }
    const v = videoRef.current;
    if (v) v.play().catch(() => {});
    const tick = () => {
      const vid = videoRef.current;
      if (vid) setFrame(Math.min(durationFrames, Math.round(vid.currentTime * fps)));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, fps, durationFrames]);

  if (!src) return null;

  const seekTo = (f: number) => {
    const clamped = Math.max(0, Math.min(durationFrames, f));
    setFrame(clamped);
    if (videoRef.current) videoRef.current.currentTime = clamped / fps;
  };
  const seekFromClientX = (clientX: number) => {
    const r = barRef.current?.getBoundingClientRect();
    if (!r) return;
    seekTo(Math.round(((clientX - r.left) / r.width) * durationFrames));
  };

  const targetTrack = (() => {
    const vids = [...targetedTrackIds].filter((id) => id < 100 && id !== 2);
    return String(vids.length ? Math.min(...vids) : 1);
  })();

  const asMedia: MediaFile = {
    id: src.id, path: src.path, filename: src.filename,
    type: /\.(mp3|wav|aac|m4a|flac|ogg)$/i.test(src.path) ? 'audio'
      : /\.(png|jpe?g|webp|gif|bmp)$/i.test(src.path) ? 'image' : 'video',
    duration: src.duration, width: W, height: H,
  } as unknown as MediaFile;

  const inF = sourceIn ?? 0;
  const outF = sourceOut ?? durationFrames;

  const doInsert = () => { insertClipAtPlayhead(asMedia, inF, outF, targetTrack, playhead); };
  const doOverwrite = () => { overwriteAtPlayhead(asMedia, inF, outF, targetTrack, playhead); };

  const pct = (f: number) => `${Math.max(0, Math.min(100, (f / durationFrames) * 100))}%`;

  return (
    <div className="fixed left-4 top-20 z-[180] w-[420px] bg-[#0d0d1c] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 h-8 bg-[#11112a] border-b border-white/[0.06]">
        <span className="text-[10px] font-semibold text-white/75 truncate flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400/70" /> Source: {src.filename}
        </span>
        <button onClick={() => setSrc(null)} className="text-white/40 hover:text-white"><X size={13} /></button>
      </div>

      {/* Video */}
      <div className="relative bg-black aspect-video flex items-center justify-center" onClick={() => setPlaying((p) => !p)}>
        <video ref={videoRef} src={`file://${src.path}`} className="max-h-full max-w-full" playsInline />
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center"><Play size={16} className="text-white/70 ml-0.5" /></div>
          </div>
        )}
      </div>

      {/* Seek bar with in/out shading */}
      <div className="px-3 pt-2">
        <div
          ref={barRef}
          className="relative h-1.5 bg-white/[0.08] rounded-full cursor-pointer"
          onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); seekFromClientX(e.clientX); }}
          onPointerMove={(e) => { if (e.buttons === 1) seekFromClientX(e.clientX); }}
        >
          <div className="absolute top-0 bottom-0 bg-sky-400/20 pointer-events-none" style={{ left: pct(inF), width: `calc(${pct(outF)} - ${pct(inF)})` }} />
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-sky-400 rounded-full pointer-events-none" style={{ left: pct(frame) }} />
        </div>
        <div className="flex items-center justify-between mt-1 text-[9px] font-mono text-white/40">
          <span>In {sourceIn !== null ? formatTimecode(sourceIn, fps) : '--:--'}</span>
          <span className="text-sky-300/70">{formatTimecode(frame, fps)}</span>
          <span>Out {sourceOut !== null ? formatTimecode(sourceOut, fps) : '--:--'}</span>
        </div>
      </div>

      {/* Transport + 3-point edit */}
      <div className="flex items-center gap-1 px-3 py-2 border-t border-white/[0.06] mt-2">
        <button onClick={() => setPlaying((p) => !p)} className="p-1.5 rounded text-white/60 hover:text-white hover:bg-white/[0.06]" title="Play/Pause">
          {playing ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <button onClick={() => setSourceIn(frame)} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-sky-300 hover:bg-sky-500/10" title="Mark In (I)"><LogIn size={11} /> In</button>
        <button onClick={() => setSourceOut(frame)} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-sky-300 hover:bg-sky-500/10" title="Mark Out (O)"><LogOut size={11} /> Out</button>
        <div className="flex-1" />
        <button onClick={doInsert} className={clsx('flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white')} title="Insert (,) — ripple at playhead">
          <ChevronsLeftRight size={11} /> Insert
        </button>
        <button onClick={doOverwrite} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-purple-600 hover:bg-purple-500 text-white" title="Overwrite (.) at playhead">
          Overwrite
        </button>
      </div>
      <div className="px-3 pb-2 text-[8px] text-white/25 text-right">→ target {targetTrack === '2' ? 'A1' : `V${targetTrack}`} @ {formatTimecode(playhead, fps)}</div>
    </div>
  );
};

export default SourceMonitor;
