/**
 * Music Video Generator — Clip adapter
 * Bridges the pure planner (musicVideo.ts) to real timeline Clips, then applies
 * the editorial rules engine. Parallels generateTrailerSequence so the wizard can
 * call it the same way.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Clip } from '../types';
import type { MediaFile } from '../store/mediaStore';
import type { AudioAnalysisResult } from './audioAnalysis';
import { planMusicVideo, type MusicVideoSettings, type MvPoolItem, type MvAnalysis, DEFAULT_MV_SETTINGS } from './musicVideo';
import { applyRules, type RulesConfig, type RulesReport, DEFAULT_RULES } from './editRules';

/** Build the planner's analysis view from a full AudioAnalysisResult. */
function toMvAnalysis(a: AudioAnalysisResult): MvAnalysis {
    return {
        duration: a.duration,
        bpm: a.bpm,
        gridBeats: a.gridBeats ?? [],
        downbeats: a.downbeats ?? [],
        beatsPerBar: a.beatsPerBar,
        segments: a.segments.map(s => ({ type: s.type, start: s.start, end: s.end })),
    };
}

export interface MusicVideoResult {
    clips: Clip[];
    report: RulesReport & { sections: Record<string, number>; total: number; anchoredTo: string };
}

/**
 * Generate a full music-video edit from a media pool + song analysis.
 * @param pool      Media library files (video/image used; audio ignored for cuts)
 * @param analysis  Output of the Beat Intelligence Engine for the song
 * @param settings  Music-video settings
 * @param rules     Optional editorial guardrails (applied as a post-pass)
 */
export function generateMusicVideoSequence(
    pool: MediaFile[],
    analysis: AudioAnalysisResult,
    settings: Partial<MusicVideoSettings> = {},
    rules: RulesConfig = DEFAULT_RULES,
): MusicVideoResult {
    const s: MusicVideoSettings = { ...DEFAULT_MV_SETTINGS, ...settings };
    const fps = s.fps;

    // MediaFile → MvPoolItem (frame-accurate source length, honoring pre-trim).
    const items: MvPoolItem[] = pool.map(f => {
        const totalFrames = Math.max(1, Math.round((f.duration || 0) * fps));
        const inF = f.trimIn != null ? Math.round(f.trimIn * fps) : 0;
        const outF = f.trimOut != null ? Math.round(f.trimOut * fps) : totalFrames;
        return {
            sourceDurationFrames: Math.max(2, outF - inF),
            type: f.type,
            tags: f.tags,
        };
    });

    const { plan, report } = planMusicVideo(items, toMvAnalysis(analysis), s);

    const clips: Clip[] = plan.map((p, i) => {
        const file = pool[p.fileIndex];
        const totalFrames = Math.max(1, Math.round((file.duration || 0) * fps));
        // Offset trims by the file's pre-trim IN point so they index real source.
        const inF = file.trimIn != null ? Math.round(file.trimIn * fps) : 0;
        const clip: Clip = {
            id: uuidv4(),
            type: (file.type as 'video' | 'audio' | 'image'),
            path: file.path,
            filename: file.filename,
            startFrame: p.startFrame,
            endFrame: p.endFrame,
            sourceDurationFrames: totalFrames,
            trimStartFrame: inF + p.trimStartFrame,
            trimEndFrame: inF + p.trimEndFrame,
            track: 1,
            speed: p.speed,
            volume: 0,
            reversed: false,
            isMuted: true,            // music video: clip audio muted under the song
            isPinned: false,
            locked: false,
            origin: 'auto',
            sourceOrientation: file.orientation || 'horizontal',
            rotation: file.rotation || 0,   // persist upload-page rotation into the render
        };
        if (p.zoomStart != null) { clip.zoomStart = p.zoomStart; clip.zoomEnd = p.zoomEnd; clip.zoomOrigin = p.zoomOrigin; }

        // Music-video flavor: sprinkle MV-applicable effects on energetic sections,
        // varied + deterministic per clip (reproducible from the seed).
        const r = ((Math.sin((i + 1) * 12.9898 + (s.seed || 1) * 78.233) * 43758.5453) % 1 + 1) % 1;
        if (p.section === 'drop' || p.section === 'chorus') {
            if (r < 0.30) clip.rgbSplit = { amount: 50 };
            else if (r < 0.55) clip.hueCycle = { speed: 35 };
            else if (r < 0.72) clip.vibrationFlash = { intensity: 70, durationFrames: Math.max(2, Math.round(fps * 0.12)) };
        } else if (p.section === 'buildup' && r < 0.4) {
            clip.rgbSplit = { amount: 28 };
        } else if (p.section === 'breakdown' && r < 0.35) {
            clip.vhs = { amount: 45 };
        }
        return clip;
    });

    const { clips: ruled, report: rulesReport } = applyRules(clips as any, rules);

    return {
        clips: ruled as unknown as Clip[],
        report: { ...rulesReport, sections: report.sectionCounts, total: report.totalClips, anchoredTo: report.anchoredTo },
    };
}
