/**
 * ICUNI Edit Exporter (MMMedia Pro side)
 * ════════════════════════════════════════════════════════════════════════════
 * Serializes MMMedia's rich Clip[] into the shared, LOSSLESS ICUNI Edit format
 * that Edia ingests to rebuild the Premiere timeline. Unlike the legacy
 * manifestBridge (a small whitelist), this carries EVERY clip property — including
 * speed curves, transitions, zoom, shake, beat effects, and the advanced looks —
 * and attaches a degradation report describing what Premiere can/can't reproduce.
 */

import type { Clip } from '../types';
import {
    type IcuniEdit,
    type IcuniClip,
    type IcuniClipType,
    type IcuniEffects,
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
 * Build a full, lossless ICUNI Edit from a project's clips. Disabled clips are
 * dropped; everything else is carried with a degradation report for Premiere.
 */
export function clipsToIcuniEdit(
    clips: Clip[],
    project: IcuniProjectInfo,
    createdBy: IcuniSource = 'mmmedia',
): IcuniEdit {
    const icuniClips = clips.filter(c => !c.disabled).map(clipToIcuni);
    const report: IcuniReportEntry[] = [];
    for (const ic of icuniClips) report.push(...classifyClipFeatures(ic));
    return {
        schema: ICUNI_EDIT_SCHEMA,
        version: ICUNI_EDIT_VERSION,
        createdBy,
        createdAt: new Date().toISOString(),
        timeUnit: 'frames',
        project,
        clips: icuniClips,
        report,
    };
}
