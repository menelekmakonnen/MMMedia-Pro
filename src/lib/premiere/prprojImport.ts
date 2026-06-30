// ══════════════════════════════════════════════════════════════════════════════
// prprojImport.ts — Best-effort reader for Adobe Premiere .prproj projects.
//
// A .prproj is gzip-compressed XML serialising Premiere's internal object graph
// (elements carry ObjectID, references are ObjectRef attributes). This is a SPIKE:
// it reliably recovers clip TIMING (Start/End/In/Out are in Premiere "ticks") and
// best-effort media paths + names by walking the ObjectRef chain from each track
// item. Track lanes are approximated. For lossless transform/effect/keyframe
// fidelity, export FCPXML from Premiere and use the FCPXML importer.
// ══════════════════════════════════════════════════════════════════════════════

import type { Clip, ClipType } from '../../types';
import type { ImportedSequence } from './fcpxmlImport';

/** Premiere time base: ticks per second. */
const TICKS_PER_SECOND = 254016000000;

const uid = () => { try { return crypto.randomUUID(); } catch { return `pp-${Date.now()}-${Math.random()}`; } };

/** Gunzip a .prproj ArrayBuffer to its XML text (handles already-plain XML too). */
export async function prprojToXml(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf);
  const isGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!isGzip) return new TextDecoder('utf-8').decode(bytes);
  // Use the platform DecompressionStream (Chromium/Electron renderer) — no deps.
  const ds = new (globalThis as any).DecompressionStream('gzip');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const text = await new Response(stream).text();
  return text;
}

const ticksToFrames = (ticks: number, fps: number) => Math.max(0, Math.round((ticks / TICKS_PER_SECOND) * fps));

const childText = (el: Element, tag: string): string | undefined => {
  for (const c of Array.from(el.children)) if (c.tagName === tag) return c.textContent ?? undefined;
  return undefined;
};

/** Walk ObjectRef chains from a track item to recover a media path + clip name. */
function resolveMedia(itemEl: Element, idMap: Map<string, Element>): { path?: string; name?: string } {
  const seen = new Set<string>();
  const stack: Element[] = [itemEl];
  let path: string | undefined;
  let name: string | undefined;
  let steps = 0;
  while (stack.length && steps < 300) {
    steps++;
    const el = stack.pop()!;
    path = path ?? childText(el, 'ActualMediaFilePath') ?? childText(el, 'FilePath');
    name = name ?? childText(el, 'ClipName') ?? childText(el, 'Name');
    if (path && name) break;
    for (const refEl of Array.from(el.querySelectorAll('[ObjectRef]'))) {
      const id = refEl.getAttribute('ObjectRef');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const target = idMap.get(id);
      if (target) stack.push(target);
    }
  }
  return { path, name };
}

const typeFromPath = (p: string): ClipType => {
  const ext = (p.split('.').pop() || '').toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg'].includes(ext)) return 'audio';
  return 'video';
};

export function parsePrproj(xml: string, defaultFps = 30): ImportedSequence {
  const warnings: string[] = [];
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Could not parse .prproj XML (corrupt or unsupported version).');

  // Frame rate: best-effort. Premiere stores frame rate as ticks-per-frame in
  // various places; fall back to the project default.
  let fps = defaultFps;
  const fpsTicks = Number(childText(doc.documentElement, 'VideoFrameRate') || '');
  if (Number.isFinite(fpsTicks) && fpsTicks > 0) fps = Math.round(TICKS_PER_SECOND / fpsTicks);

  // ObjectID → element map for ref resolution.
  const idMap = new Map<string, Element>();
  for (const el of Array.from(doc.querySelectorAll('[ObjectID]'))) {
    const id = el.getAttribute('ObjectID');
    if (id) idMap.set(id, el);
  }

  const items = Array.from(doc.querySelectorAll('VideoClipTrackItem, AudioClipTrackItem'));
  if (items.length === 0) {
    warnings.push('No clip track items found — this .prproj layout is not yet supported. Export FCPXML from Premiere for full fidelity.');
    return { name: 'Imported Premiere Project', fps, width: 1920, height: 1080, clips: [], warnings };
  }

  const clips: Clip[] = [];
  let mediaUnresolved = 0;

  for (const item of items) {
    const isAudio = item.tagName === 'AudioClipTrackItem';
    // TrackItem.Start/End are timeline ticks; InPoint/OutPoint are source ticks.
    const trackItem = item.querySelector('TrackItem') ?? item;
    const startTicks = Number(childText(trackItem, 'Start') ?? '0');
    const endTicks = Number(childText(trackItem, 'End') ?? '0');
    const inTicks = Number(childText(item, 'InPoint') ?? '0');
    const outTicks = Number(childText(item, 'OutPoint') ?? '0');
    if (!(endTicks > startTicks)) continue;

    const startFrame = ticksToFrames(startTicks, fps);
    const endFrame = Math.max(startFrame + 1, ticksToFrames(endTicks, fps));
    const trimStart = ticksToFrames(inTicks, fps);
    const trimEnd = outTicks > inTicks ? ticksToFrames(outTicks, fps) : trimStart + (endFrame - startFrame);

    const { path, name } = resolveMedia(item, idMap);
    if (!path) mediaUnresolved++;
    const filename = name || (path ? path.split(/[\\/]/).pop()! : 'clip');

    clips.push({
      id: uid(),
      type: path ? typeFromPath(path) : (isAudio ? 'audio' : 'video'),
      path: path || '',
      filename,
      startFrame,
      endFrame,
      sourceDurationFrames: Math.max(trimEnd, endFrame - startFrame),
      trimStartFrame: trimStart,
      trimEndFrame: trimEnd,
      track: isAudio ? 2 : 1, // V1 / A1 — lane indices are approximated in this spike
      speed: 1,
      volume: 100,
      reversed: false,
      locked: false,
      origin: 'manual',
    });
  }

  clips.sort((a, b) => a.startFrame - b.startFrame);
  if (mediaUnresolved > 0) warnings.push(`${mediaUnresolved} clip(s) imported without resolvable media (relink in the project).`);
  warnings.push('Premiere .prproj import is best-effort (timing + media). For transforms/effects/keyframes, export FCPXML from Premiere.');

  return { name: 'Imported Premiere Project', fps, width: 1920, height: 1080, clips, warnings };
}
