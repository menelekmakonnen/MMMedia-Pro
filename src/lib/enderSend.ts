// ─────────────────────────────────────────────────────────────────────────────
// Send the current edit to MMMedia Ender (the render-queue app).
//
// This reproduces EXACTLY the clip+settings payload ExportTab builds for the
// segment engine (getExportClips → trim-repair → boomerang expansion), then maps
// the project/export settings into Ender's ExportSettings shape. Because Ender
// runs Pro's own render-core on this same input, the output is render-true.
//
// Usable from anywhere (render page button, video-player toolbar) — it reads the
// stores directly, so there is no prop drilling and one source of truth.
// ─────────────────────────────────────────────────────────────────────────────
import { useClipStore } from '../store/clipStore';
import { useProjectStore } from '../store/projectStore';
import { useExportSettingsStore } from '../store/exportSettingsStore';
import { useMediaStore } from '../store/mediaStore';
import { useGodModeStore } from '../store/godModeStore';
import { EXPORT_PRESETS, getOutputDimensions } from './exportPresets';
import { expandClipToBoomerang, getBoomerangPreset } from './boomerang';

/** Mirrors ExportTab.getExportClips(): applies track mute/volume, filters muted
 *  audio tracks, and resolves blob: audio paths to filesystem paths. */
function getExportClips(): any[] {
  const { clips, trackMutes, trackVolumes } = useClipStore.getState();
  const audio1Muted = trackMutes[2] ?? false;

  let ec = clips.map((c: any) => {
    if (c.type === 'audio') {
      const audioTrack = c.track === 2 ? 101 : (c.track ?? 101);
      const audioTrackVol = trackVolumes[audioTrack] ?? 100;
      const effectiveVol = Math.round(((c.volume ?? 100) * audioTrackVol) / 100);
      return { ...c, track: audioTrack, volume: effectiveVol };
    }
    const audio1Vol = trackVolumes[2] ?? 100;
    if (audio1Muted) return { ...c, volume: 0, isMuted: true };
    return { ...c, volume: audio1Vol, isMuted: false };
  });

  ec = ec.filter((c: any) => {
    if (c.type === 'audio') return !(trackMutes[c.track] ?? false);
    return true;
  });

  ec = ec.map((c: any) => {
    if (c.type === 'audio' && c.path?.startsWith('blob:')) {
      const gmPath = useGodModeStore.getState().audioFilePath;
      if (gmPath && !gmPath.startsWith('blob:') && !gmPath.startsWith('http:')) {
        let resolved = gmPath;
        if (resolved.startsWith('file:///')) resolved = resolved.slice(8);
        else if (resolved.startsWith('file://')) resolved = resolved.slice(7);
        try { resolved = decodeURIComponent(resolved); } catch { /* keep */ }
        return { ...c, path: resolved };
      }
      const winPath = (window as any).__godModeAudioFilePath;
      if (winPath && !winPath.startsWith('blob:') && !winPath.startsWith('http:')) {
        return { ...c, path: winPath };
      }
    }
    return c;
  });

  return ec;
}

/** Mirrors ExportTab's pre-flight trim-repair + boomerang expansion. */
function prepareClipsForRender(raw: any[], fps: number): any[] {
  let out = raw.map((c: any) => {
    if (c.type === 'audio') return c;
    const trimStart = c.trimStartFrame ?? 0;
    let trimEnd = c.trimEndFrame;
    const speed = c.speed || 1.0;
    if (trimEnd === undefined || trimEnd === null) {
      const timelineFrames = (c.endFrame ?? 0) - (c.startFrame ?? 0);
      if (timelineFrames > 0) trimEnd = trimStart + Math.round(timelineFrames * speed);
      else if (c.sourceDurationFrames > 0) trimEnd = c.sourceDurationFrames;
      if (trimEnd !== undefined && trimEnd !== null) return { ...c, trimEndFrame: trimEnd };
    }
    if (trimEnd !== undefined && trimEnd <= trimStart && c.sourceDurationFrames > 0) {
      const timelineFrames = (c.endFrame ?? 0) - (c.startFrame ?? 0);
      const repairedEnd = timelineFrames > 0
        ? trimStart + Math.round(timelineFrames * speed)
        : Math.min(c.sourceDurationFrames, trimStart + c.sourceDurationFrames);
      return { ...c, trimEndFrame: repairedEnd };
    }
    return c;
  });

  out = out.flatMap((c: any) => {
    if (c.type === 'audio' || !c.boomerang) return [c];
    const preset = getBoomerangPreset(c.boomerangPreset);
    return expandClipToBoomerang(c, preset, fps);
  });

  return out;
}

/** Resolve a usable filesystem path for the project's background song.
 *  The song can be an AUDIO file OR a VIDEO file (Pro lets a video serve as the
 *  background audio — its audio stream becomes the music bed). Returns null for
 *  blob:/http: paths that FFmpeg can't open. */
function resolveSongPath(): string | null {
  const gm = useGodModeStore.getState();
  let p: string | null =
    gm.audioFilePath ||
    (window as any).__godModeAudioFilePath ||
    ((useProjectStore.getState().settings as any)?.audioFilePath ?? null) ||
    null;
  if (!p || p.startsWith('blob:') || p.startsWith('http:')) return null;
  if (p.startsWith('file:///')) p = p.slice(8);
  else if (p.startsWith('file://')) p = p.slice(7);
  try { p = decodeURIComponent(p); } catch { /* keep */ }
  return p;
}

/** When the timeline payload carries no audio-type clip (e.g. the edit was sent
 *  from a context whose store never materialised the song clip — the Sequence
 *  page uses a different timeline store than the Edit wizard), reconstruct the
 *  background-audio clip from godModeStore exactly as EditPlayer would. This is
 *  the nuance where "Pro classifies a VIDEO as the background audio": the song
 *  path may be a .mp4/.mov whose audio is the bed, and Ender's audio bus reads
 *  it the same as any audio file. Returns null if there's no resolvable song. */
function synthesizeBgAudioClip(prepared: any[], fps: number): any | null {
  if (prepared.some((c: any) => c.type === 'audio')) return null;
  const gm = useGodModeStore.getState();
  const path = resolveSongPath();
  if (!path) return null;

  const videoEnd = prepared.reduce((m: number, c: any) => Math.max(m, c.endFrame ?? 0), 0);
  const trimStartFrame = Math.max(0, Math.floor((gm.audioTrimStart || 0) * fps));
  const trimEndFrame = gm.audioTrimEnd
    ? Math.floor(gm.audioTrimEnd * fps)
    : (videoEnd > 0 ? videoEnd : Math.floor(30 * fps));
  const endFrame = Math.max(videoEnd, trimEndFrame);

  return {
    id: `bgaudio-${Date.now()}`,
    type: 'audio',
    path,
    filename: gm.audioFile || 'Background Audio',
    startFrame: 0,
    endFrame,
    sourceDurationFrames: endFrame,
    trimStartFrame,
    trimEndFrame,
    track: 101,            // Audio-2: background music, looped to the timeline
    speed: 1,
    volume: 100,
    reversed: false,
    loopToTimeline: true,  // Ender loops/trims this to fill the full video duration
    locked: false,
    origin: 'auto',
  };
}

export interface EnderSendResult {
  success: boolean;
  transport?: 'bridge' | 'mailbox';
  id?: string;
  file?: string;
  error?: string;
}

/** Build the Ender job from current state and hand it off. */
export async function sendCurrentProjectToEnder(overrides: Record<string, any> = {}): Promise<EnderSendResult> {
  const { clips } = useClipStore.getState();
  if (!clips.length) return { success: false, error: 'Timeline is empty' };

  const { settings } = useProjectStore.getState();
  const { selectedPresetId, exportQuality, orientation, selectedFps } = useExportSettingsStore.getState();

  const preset =
    EXPORT_PRESETS.find((p) => p.id === selectedPresetId) ||
    EXPORT_PRESETS.find((p) => p.id === 'hd_1080')!;
  const dims = getOutputDimensions(preset, orientation);
  const fps = selectedFps || settings.fps || 30;

  const prepared = prepareClipsForRender(getExportClips(), fps);

  // ── BACKGROUND-AUDIO SAFETY NET ──────────────────────────────────────────
  // If no audio-type clip survived into the payload, the project's background
  // song (which may be a VIDEO file) never made it onto this store's timeline.
  // Rebuild it from godModeStore so the music bed is always sent to Ender.
  const bgAudio = synthesizeBgAudioClip(prepared, fps);
  if (bgAudio) prepared.push(bgAudio);

  // Map Pro's project/export settings → Ender's render-core ExportSettings.
  const enderSettings = {
    width: dims.w,
    height: dims.h,
    fps,
    projectFps: settings.fps || 30,
    quality: exportQuality, // 'draft' | 'standard' | 'master'
    codec: preset.codec === 'libx265' ? 'hevc' : 'h264',
    // carry transition intent so Ender's stitch matches the preview
    transitionStrategy: useClipStore.getState().transitionStrategy,
    transitionDurationSec: 0.5,
  };

  const safeName = settings.name?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'mmmedia';
  const folder = useMediaStore.getState().recentFolders?.[0]?.name;
  const name = folder ? `${safeName}_${folder.replace(/[^a-z0-9]/gi, '_')}` : safeName;

  const mediaRefs = Array.from(
    new Set(prepared.map((c: any) => c.path).filter((p: any) => p && !String(p).startsWith('blob:')))
  );

  return window.ipcRenderer.sendToEnder({
    name,
    source: 'MMMedia Pro',
    clips: prepared,
    settings: enderSettings,
    mediaRefs,
    overrides,
  });
}
