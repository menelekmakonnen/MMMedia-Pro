/**
 * ICUNI Edit Exporter (MMMedia Pro side)
 * ════════════════════════════════════════════════════════════════════════════
 * Serializes MMMedia's rich Clip[] into the shared, LOSSLESS ICUNI Edit format
 * that Edia ingests to rebuild the Premiere timeline. Unlike the legacy
 * manifestBridge (a small whitelist), this carries EVERY clip property — including
 * speed curves, transitions, zoom, shake, beat effects, and the advanced looks —
 * and attaches a degradation report describing what Premiere can/can't reproduce.
 *
 * Grid clips are expanded into their constituent cell clips for multi-track export.
 */

import type { Clip, GridClip, GridCell } from '../types';
import {
    type IcuniEdit,
    type IcuniClip,
    type IcuniClipType,
    type IcuniEffects,
    type IcuniMarker,
    type IcuniRegion,
    type IcuniReportEntry,
    type IcuniSource,
    ICUNI_EDIT_SCHEMA,
    ICUNI_EDIT_VERSION,
    classifyClipFeatures,
} from './icuniEdit';

export interface IcuniProjectInfo {
    name: string;
    fps: number;
    width: number;
    height: number;
}

const mapType = (t: Clip['type']): IcuniClipType =>
    t === 'audio' ? 'audio' : t === 'image' ? 'image' : 'video';

/** Only include keys whose value is meaningfully present (keeps the payload lean). */
function buildEffects(clip: Clip): IcuniEffects | undefined {
    const e: IcuniEffects = {};
    let any = false;
    const set = <K extends keyof IcuniEffects>(k: K, v: IcuniEffects[K], present: boolean) => {
        if (present) { e[k] = v; any = true; }
    };
    set('filmGrain', clip.filmGrain, !!clip.filmGrain);
    set('vignette', clip.vignette, !!clip.vignette);
    set('letterbox', clip.letterbox, !!clip.letterbox);
    set('chromaticAberration', clip.chromaticAberration, !!clip.chromaticAberration);
    set('sharpen', clip.sharpen, !!clip.sharpen);
    set('blurAmount', clip.blurAmount, !!clip.blurAmount);
    set('glow', clip.glow, !!clip.glow);
    set('motionBlur', clip.motionBlur, !!clip.motionBlur);
    set('doubleExposure', clip.doubleExposure, !!clip.doubleExposure);
    set('vibrationFlash', clip.vibrationFlash, !!clip.vibrationFlash);
    set('smoothSlowmo', clip.smoothSlowmo, !!clip.smoothSlowmo);
    set('shake', clip.shake, !!clip.shake);
    set('beatEffect', clip.beatEffect, !!clip.beatEffect);
    set('echo', clip.echo, !!clip.echo);
    set('strobe', clip.strobe, !!clip.strobe);
    set('colorGrading', clip.colorGrading, !!clip.colorGrading);
    set('parametricEffects', clip.parametricEffects, !!(clip.parametricEffects && clip.parametricEffects.length));
    set('effectIds', clip.effectIds, !!(clip.effectIds && clip.effectIds.length));
    set('boomerang', clip.boomerang, !!clip.boomerang);
    set('boomerangPreset', clip.boomerangPreset, !!clip.boomerangPreset);
    set('flipH', clip.flipH, !!clip.flipH);
    set('flipV', clip.flipV, !!clip.flipV);
    set('rotation', clip.rotation, !!clip.rotation);
    set('textOverlays', clip.textOverlays, !!(clip.textOverlays && clip.textOverlays.length));
    return any ? e : undefined;
}

export function clipToIcuni(clip: Clip): IcuniClip {
    const hasZoom =
        clip.zoomLevel !== undefined || clip.zoomStart !== undefined || clip.zoomEnd !== undefined;
    const ic: IcuniClip = {
        id: clip.id,
        file: clip.path,
        name: clip.filename,
        type: mapType(clip.type),
        track: clip.track || 0,
        trackType: clip.type === 'audio' ? 'audio' : 'video',
        timelineStart: clip.startFrame,
        timelineEnd: clip.endFrame,
        sourceStart: clip.trimStartFrame,
        sourceEnd: clip.trimEndFrame,
        sourceDurationFrames: clip.sourceDurationFrames,
        speed: clip.speed ?? 1,
        volume: clip.volume ?? 100,
        reversed: !!clip.reversed,
        muted: !!clip.isMuted,
        locked: !!clip.locked,
    };
    if (hasZoom) {
        ic.zoom = {
            level: clip.zoomLevel,
            start: clip.zoomStart,
            end: clip.zoomEnd,
            origin: clip.zoomOrigin,
            curve: clip.zoomCurve,
        };
    }
    if (clip.speedCurve && clip.speedCurve.length) ic.speedCurve = clip.speedCurve;
    if (clip.speedCurvePreset && clip.speedCurvePreset !== 'constant') ic.speedCurvePreset = clip.speedCurvePreset;
    if (clip.transition) {
        ic.transition = {
            type: String(clip.transition.type),
            durationFrames: clip.transition.durationFrames,
            params: clip.transition.params,
        };
    }
    const fx = buildEffects(clip);
    if (fx) ic.effects = fx;
    return ic;
}

/**
 * Expand a GridClip into individual IcuniClips for each cell's sub-clips.
 * Each cell becomes a separate track lane in the export, allowing Premiere Pro
 * to reconstruct the multi-cell layout as stacked video tracks with position/scale.
 */
function expandGridClip(grid: GridClip): IcuniClip[] {
    const result: IcuniClip[] = [];
    const gridStart = grid.startFrame;

    grid.cells.forEach((cell: GridCell, cellIdx: number) => {
        const cellClips = cell.clips || (cell.clip ? [cell.clip] : []);
        if (cellClips.length === 0) return;

        // Each cell's clips go on a separate track (V2, V3, V4, etc.)
        const trackNum = cellIdx + 2; // V2+ (V1 is primary spine)

        cellClips.forEach((subClip) => {
            const ic = clipToIcuni(subClip);
            // Override timeline position to align with grid's position in the sequence
            ic.timelineStart = gridStart + (subClip.startFrame || 0);
            ic.timelineEnd = gridStart + (subClip.endFrame || subClip.startFrame || 0);
            ic.track = trackNum;
            // Attach grid cell layout metadata for position/scale reconstruction
            ic.name = `[Grid Cell ${cellIdx + 1}] ${ic.name}`;
            // Store position as custom metadata (x, y, width, height as 0-1 fractions)
            (ic as any).gridCellLayout = {
                x: cell.x, y: cell.y,
                width: cell.width, height: cell.height,
                cellIndex: cellIdx,
                gridFormat: grid.gridFormat,
                orientation: cell.cellOrientation || 'auto',
            };
            result.push(ic);
        });
    });

    return result;
}

/**
 * Build a full, lossless ICUNI Edit from a project's clips. Disabled clips are
 * dropped; everything else is carried with a degradation report for Premiere.
 * Grid clips are expanded into their constituent cell clips for multi-track export.
 */
export function clipsToIcuniEdit(
    clips: Clip[],
    project: IcuniProjectInfo,
    createdBy: IcuniSource = 'mmmedia',
): IcuniEdit {
    const icuniClips: IcuniClip[] = [];

    for (const c of clips) {
        if ((c as any).disabled) continue;

        if (c.type === 'grid') {
            // Expand grid into individual cell clips on separate tracks
            const gridClips = expandGridClip(c as GridClip);
            icuniClips.push(...gridClips);
        } else {
            icuniClips.push(clipToIcuni(c));
        }
    }

    const report: IcuniReportEntry[] = [];
    for (const ic of icuniClips) report.push(...classifyClipFeatures(ic));

    // Add a degradation note about grid compositing
    const hasGrids = clips.some(c => c.type === 'grid');
    if (hasGrids) {
        report.push({
            clipId: '__grid__',
            feature: 'grid-composite: cells exported as separate track lanes, manual position/scale adjustment in Premiere may be needed',
            level: 'approx',
        });
    }

    return {
        schema: ICUNI_EDIT_SCHEMA,
        version: ICUNI_EDIT_VERSION,
        createdBy,
        createdAt: new Date().toISOString(),
        timeUnit: 'frames',
        project,
        clips: icuniClips,
        report,
        markers: [],
        regions: [],
    };
}
