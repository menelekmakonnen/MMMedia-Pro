// ══════════════════════════════════════════════════════════════════════════════
// fcpxmlExport.ts — Export the sequence to FCPXML (the round-trip foundation).
//
// Adobe Premiere Pro imports/exports FCPXML, so it is our interchange format. The
// Premiere-aligned Effect Controls model maps almost directly:
//
//   Motion.Position  → adjust-transform position  (center-origin, sequence px)
//   Motion.Scale     → adjust-transform scale
//   Motion.Rotation  → adjust-transform rotation
//   Motion.Anchor    → adjust-transform anchor
//   Opacity.Opacity  → adjust-opacity / video amount (0..1)
//   keyframed params → <param><keyframeAnimation><keyframe .../></...>
//
// This produces a well-formed FCPXML 1.9 document. Position/anchor are emitted in
// center-origin sequence pixels (the documented mapping); refine units against a
// Premiere round-trip when wiring the importer.
// ══════════════════════════════════════════════════════════════════════════════

import type { Clip } from '../../types';
import { resolveMotion, evalScalar, type EffectControlsState, type ScalarParam, type Point2DParam, MATCH } from './effectControls';
import { kfValue } from '../keyframes';

interface SeqSettings {
  fps: number;
  resolution?: { width: number; height: number };
}

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Frame → FCPXML rational time string at the sequence timebase. */
const t = (frame: number, fps: number) => `${Math.round(frame * 100)}/${Math.round(fps * 100)}s`;

const findComp = (ec: EffectControlsState | undefined, matchName: string) => ec?.video.find((c) => c.matchName === matchName);

/** Build a <param> with optional keyframeAnimation for a scalar lane. */
function scalarParam(name: string, p: ScalarParam | undefined, fps: number, scale = 1): string {
  if (!p) return '';
  if (p.keyframed && p.keyframes && p.keyframes.length > 0) {
    const kfs = p.keyframes.map((k) => `          <keyframe time="${t(k.frame, fps)}" value="${(k.value * scale).toFixed(4)}" interp="${k.interp === 'constant' ? 'hold' : k.interp === 'bezier' ? 'smooth' : 'linear'}"/>`).join('\n');
    return `        <param name="${name}">\n          <keyframeAnimation>\n${kfs}\n          </keyframeAnimation>\n        </param>`;
  }
  return `        <param name="${name}" value="${(p.value * scale).toFixed(4)}"/>`;
}

/** Build a position <param> "x y" (uses static value; per-axis keyframes flattened to value). */
function positionParam(p: Point2DParam | undefined, cx: number, cy: number): string {
  if (!p) return '';
  const x = (p.value.x - cx).toFixed(2);
  const y = (p.value.y - cy).toFixed(2);
  return `        <param name="position" value="${x} ${y}"/>`;
}

/** Serialize one clip's Effect Controls into adjust-transform + adjust-opacity. */
function clipAdjustments(clip: Clip, fps: number, width: number, height: number): string {
  const ec = clip.effectControls;
  if (!ec) return '';
  const cx = width / 2, cy = height / 2;
  const motion = findComp(ec, MATCH.MOTION);
  const opacity = findComp(ec, MATCH.OPACITY);
  const pos = motion?.params.find((p) => p.id === 'position') as Point2DParam | undefined;
  const scale = motion?.params.find((p) => p.id === 'scale') as ScalarParam | undefined;
  const rot = motion?.params.find((p) => p.id === 'rotation') as ScalarParam | undefined;
  const anchor = motion?.params.find((p) => p.id === 'anchorPoint') as Point2DParam | undefined;
  const op = opacity?.params.find((p) => p.id === 'opacity') as ScalarParam | undefined;

  const lines: string[] = [];
  const transformParts: string[] = [];
  if (pos) transformParts.push(positionParam(pos, cx, cy));
  if (scale) transformParts.push(scalarParam('scale', scale, fps, 0.01)); // percent → fraction (100→1)
  if (rot) transformParts.push(scalarParam('rotation', rot, fps));
  if (anchor) transformParts.push(`        <param name="anchor" value="${(anchor.value.x - cx).toFixed(2)} ${(anchor.value.y - cy).toFixed(2)}"/>`);
  if (transformParts.filter(Boolean).length) {
    lines.push(`      <adjust-transform>\n${transformParts.filter(Boolean).join('\n')}\n      </adjust-transform>`);
  }
  if (op) {
    const amount = scalarParam('amount', op, fps, 0.01); // percent → 0..1
    lines.push(`      <adjust-opacity>\n${amount}\n      </adjust-opacity>`);
  }
  return lines.join('\n');
}

/** Build a complete FCPXML document string for the given clips. */
export function buildFcpxml(clips: Clip[], settings: SeqSettings, projectName = 'MMMedia Sequence'): string {
  const fps = settings.fps || 30;
  const width = settings.resolution?.width ?? 1920;
  const height = settings.resolution?.height ?? 1080;
  const frameDuration = `${Math.round(100)}/${Math.round(fps * 100)}s`;

  // Unique assets by media path.
  const visual = clips.filter((c) => c.type === 'video' || c.type === 'image').sort((a, b) => a.startFrame - b.startFrame);
  const assetMap = new Map<string, string>();
  let assetN = 0;
  const assets: string[] = [];
  for (const c of visual) {
    if (!c.path || assetMap.has(c.path)) continue;
    const id = `r${++assetN}`;
    assetMap.set(c.path, id);
    const durFrames = c.sourceDurationFrames || (c.endFrame - c.startFrame);
    assets.push(
      `    <asset id="${id}" name="${xmlEscape(c.filename || 'clip')}" src="file://${xmlEscape(c.path)}" ` +
      `hasVideo="1" hasAudio="${c.type === 'video' ? 1 : 0}" format="r0" duration="${t(durFrames, fps)}"/>`,
    );
  }

  const spine = visual.map((c) => {
    const assetId = assetMap.get(c.path) ?? 'r1';
    const offset = t(c.startFrame, fps);
    const dur = t(c.endFrame - c.startFrame, fps);
    const start = t(c.trimStartFrame || 0, fps);
    const adjustments = clipAdjustments(c, fps, width, height);
    const body = adjustments ? `\n${adjustments}\n    ` : '';
    return `    <asset-clip ref="${assetId}" name="${xmlEscape(c.filename || 'clip')}" offset="${offset}" duration="${dur}" start="${start}" tcFormat="NDF">${body}</asset-clip>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r0" name="FFVideoFormat" frameDuration="${frameDuration}" width="${width}" height="${height}"/>
${assets.join('\n')}
  </resources>
  <library>
    <event name="MMMedia Pro">
      <project name="${xmlEscape(projectName)}">
        <sequence format="r0" tcFormat="NDF">
          <spine>
${spine}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>`;
}

/** Trigger a browser/Electron download of the FCPXML for the current sequence. */
export function downloadFcpxml(clips: Clip[], settings: SeqSettings, filename = 'sequence.fcpxml'): void {
  const xml = buildFcpxml(clips, settings);
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Note: `resolveMotion`, `evalScalar`, `kfValue` are exported here for the
// forthcoming importer (FCPXML → Effect Controls) so it shares one mapping.
export { resolveMotion, evalScalar, kfValue };
