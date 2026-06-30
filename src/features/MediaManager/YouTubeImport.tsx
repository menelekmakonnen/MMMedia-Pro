// ══════════════════════════════════════════════════════════════════════════════
// YouTubeImport — paste a YouTube / YouTube Music link; the main process downloads
// it (audio → mp3, video → mp4 via the 'fetch-youtube' IPC) and it's added to the
// media pool as an audio track or video clip. Reusable on the Import page (video)
// and in audio/BIE import (audio).
// ══════════════════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { Youtube, Loader2, Download } from 'lucide-react';
import { useMediaStore, type MediaFile } from '../../store/mediaStore';
import { getStableMediaId } from '../../lib/mediaProbe';
import { toast } from '../../components/Toast';

const ipc = () => (window as unknown as { ipcRenderer?: { invoke?: (c: string, a: unknown) => Promise<any> } }).ipcRenderer;

async function probeMeta(path: string, isVideo: boolean): Promise<{ duration: number; width: number; height: number; orientation: 'horizontal' | 'vertical' | 'square' }> {
  return new Promise((resolve) => {
    const el = document.createElement(isVideo ? 'video' : 'audio') as HTMLMediaElement;
    el.preload = 'metadata';
    el.src = `file://${path}`;
    el.onloadedmetadata = () => {
      const w = (el as HTMLVideoElement).videoWidth || 0;
      const h = (el as HTMLVideoElement).videoHeight || 0;
      const orientation = w > h ? 'horizontal' : h > w ? 'vertical' : 'square';
      resolve({ duration: el.duration || 0, width: w, height: h, orientation });
      el.remove();
    };
    el.onerror = () => { resolve({ duration: 0, width: 0, height: 0, orientation: 'horizontal' }); el.remove(); };
  });
}

export const YouTubeImport: React.FC<{ kind?: 'audio' | 'video'; onAdded?: (f: MediaFile) => void }> = ({ kind = 'video', onAdded }) => {
  const addFiles = useMediaStore((s) => s.addFiles);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async () => {
    const link = url.trim();
    if (!link || busy) return;
    const r = ipc();
    if (!r?.invoke) { toast.error('YouTube download is only available in the desktop app'); return; }
    setBusy(true);
    try {
      const format = kind === 'audio' ? 'mp3' : 'mp4';
      const res = await r.invoke('fetch-youtube', { url: link, format });
      if (!res?.ok || !res.path) { toast.error(res?.error || 'Download failed'); return; }
      const isVideo = res.type === 'video';
      const meta = await probeMeta(res.path, isVideo);
      const file = {
        id: getStableMediaId(res.path),
        path: res.path,
        filename: `${res.title || 'youtube'}${isVideo ? '.mp4' : '.mp3'}`,
        type: isVideo ? 'video' : 'audio',
        duration: meta.duration,
        width: meta.width,
        height: meta.height,
        orientation: meta.orientation,
        size: res.size,
        createdAt: Date.now(),
      } as unknown as MediaFile;
      addFiles([file]);
      onAdded?.(file);
      toast.success(`Added "${res.title}"${res.skipped ? ' (already downloaded)' : ''}`);
      setUrl('');
    } catch (e: any) {
      toast.error(e?.message || 'YouTube import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-1.5 flex-1 bg-black/30 border border-white/10 rounded-lg px-2">
        <Youtube size={13} className="text-red-500/80 flex-shrink-0" />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') go(); }}
          placeholder={kind === 'audio' ? 'Paste YouTube / YT Music link → song' : 'Paste YouTube link → video'}
          className="flex-1 bg-transparent text-[11px] text-white/80 py-1.5 outline-none placeholder:text-white/25 min-w-0"
        />
      </div>
      <button
        onClick={go}
        disabled={busy || !url.trim()}
        className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-red-600/80 hover:bg-red-600 text-white disabled:opacity-40 flex items-center gap-1 flex-shrink-0"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
        {busy ? 'Getting…' : 'Add'}
      </button>
    </div>
  );
};

export default YouTubeImport;
