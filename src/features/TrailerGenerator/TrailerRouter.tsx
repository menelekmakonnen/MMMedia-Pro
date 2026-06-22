import React, { useState, useEffect, useRef } from 'react';
import { TrailerWizard } from './TrailerWizard';
import { TrailerPlayer } from './TrailerPlayer';
import { TrailerSettings, generateTrailerSequence, extractBeatTimestamps } from '../../lib/trailerGenerator';
import { generateSeed } from '../../lib/random';
import { useClipStore } from '../../store/clipStore';
import { useMediaStore } from '../../store/mediaStore';
import { useGodModeStore } from '../../store/godModeStore';
import { useProjectStore } from '../../store/projectStore';
import { generateMusicVideoSequence } from '../../lib/musicVideoBuild';
import { useTrailerSmartStore } from '../../store/trailerSmartStore';

/** Clip-aware cinematic auto-grade from average luma + saturation (signalstats). */
function computeAutoGrade(yavg: number, satavg: number): any {
    const exposure = Math.max(-0.6, Math.min(0.6, ((118 - yavg) / 118) * 0.7));
    const vibrance = satavg < 60 ? 1.35 : satavg > 130 ? 1.0 : 1.15;
    return {
        temperature: 0, tint: 0, exposure, contrast: 1.08,
        highlights: 0, shadows: 0, saturation: 1.0, vibrance,
        lift: [-0.02, 0, 0.03] as [number, number, number],   // cool shadows
        gain: [0.04, 0.0, -0.03] as [number, number, number],  // warm highlights (teal-orange)
        gamma: [1, 1, 1] as [number, number, number],
    };
}

export const TrailerRouter: React.FC = () => {
    const [activeView, setActiveView] = useState<'wizard' | 'player'>('wizard');
    const [settings, setSettings] = useState<TrailerSettings | null>(null);
    const [preGeneratedClips, setPreGeneratedClips] = useState<any[]>([]);
    const { setClips } = useClipStore();
    const { files } = useMediaStore();
    const autoGenerateConsumed = useRef(false);

    // ── AUTO-GENERATE: if GodMode tab pre-built settings, skip wizard ──
    const { autoGenerate, lastGeneratedSettings, clearAutoGenerate } = useGodModeStore();

    useEffect(() => {
        if (autoGenerate && lastGeneratedSettings && !autoGenerateConsumed.current) {
            autoGenerateConsumed.current = true;
            clearAutoGenerate();
            handleGenerate(lastGeneratedSettings);
        }
    }, [autoGenerate, lastGeneratedSettings]);

    const handleGenerate = async (newSettings: TrailerSettings) => {
        if (!newSettings.seed) {
            newSettings.seed = generateSeed();
        }
        setSettings(newSettings);

        // Generate clips and push to timeline
        let beatTimestamps = newSettings.beatTimestamps;
        if (newSettings.useAudioGuide && newSettings.audioUrl && !beatTimestamps) {
            // If we already have pre-computed audio analysis (from GodMode or Wizard),
            // extract beats directly — avoids fetch() on file:// URLs which fails in Electron
            if (newSettings.audioAnalysis && newSettings.audioAnalysis.beats?.length > 0) {
                const trimStart = newSettings.audioTrimStart || 0;
                const trimEnd = newSettings.audioTrimEnd || 30;
                const safeTrimEnd = Math.min(trimEnd, newSettings.audioAnalysis.duration);
                beatTimestamps = newSettings.audioAnalysis.beats
                    .filter(b => b.time >= trimStart && b.time <= safeTrimEnd)
                    .map(b => b.time - trimStart);
                if (beatTimestamps.length === 0 || beatTimestamps[0] > 0.5) beatTimestamps.unshift(0);
                const duration = safeTrimEnd - trimStart;
                if (beatTimestamps[beatTimestamps.length - 1] < duration - 0.5) beatTimestamps.push(duration);
                console.log(`[TrailerRouter] Extracted ${beatTimestamps.length} beats from pre-computed analysis`);
            } else {
                // Fallback: try extractBeatTimestamps (may fail with file:// URLs)
                beatTimestamps = await extractBeatTimestamps(
                    newSettings.audioUrl,
                    newSettings.audioTrimStart || 0,
                    newSettings.audioTrimEnd || 30,
                    newSettings.audioAnalysis
                );
            }
        }

        // ── MEDIA SELECTION LOGIC ──────────────────────────────────────────
        // If the user selected specific files in the Media Library (via Ctrl/Shift click),
        // only those files are used for generation. If nothing is selected, use all files.
        const { selectedFileIds } = useMediaStore.getState();
        const pool = selectedFileIds.length > 0
            ? files.filter(f => selectedFileIds.includes(f.id))
            : files;

        // ── Smart analysis (bounded, concurrency-limited, with live progress) ──
        //    Each ffmpeg pass is downscaled + duration-capped and only a couple run
        //    at once, so analysis can never thrash the machine or stall generation.
        const smart = useTrailerSmartStore.getState();
        smart.reset();
        let workingPool = pool;
        const ipc = (window as any).ipcRenderer;
        const projFps = useProjectStore.getState().settings.fps || 30;
        const needScore = !!(newSettings.preferHighEnergy && pool.length > 1);
        const needSilence = !!newSettings.autoTrimSilence;
        const needScenes = !!newSettings.sceneAwareCuts;
        const needColor = !!newSettings.autoColorGrade;
        if (needScore || needSilence || needScenes || needColor) {
            const vids = pool.filter((f) => f.type === 'video' && !!f.path);
            smart.setActive(true);
            if (needScore) smart.begin('scoring', vids.length);
            if (needSilence) smart.begin('silence', vids.length);
            if (needScenes) smart.begin('scenes', vids.length);
            if (needColor) smart.begin('color', vids.length);
            const meta = new Map<string, any>();
            let idx = 0;
            const worker = async () => {
                while (idx < vids.length) {
                    const f = vids[idx++];
                    const fps = (f as any).fps || projFps;
                    const m: any = {};
                    if (needScore) { try { const r = await ipc.scoreClip({ path: f.path }); m.score = r?.success ? (r.score || 0) : 0; } catch { m.score = 0; } smart.tick('scoring'); }
                    if (needSilence) { try { const r = await ipc.detectSilence({ path: f.path }); if (r?.success && r.trim) { m._usableInFrames = Math.round(r.trim.trimStart * fps); m._usableOutFrames = Math.round(r.trim.trimEnd * fps); } } catch { /* skip */ } smart.tick('silence'); }
                    if (needScenes) { try { const r = await ipc.detectScenes({ path: f.path }); if (r?.success && Array.isArray(r.cuts)) m._sceneCutsFrames = r.cuts.map((t: number) => Math.round(t * fps)); } catch { /* skip */ } smart.tick('scenes'); }
                    if (needColor) { try { const r = await ipc.analyzeClipColor({ path: f.path }); if (r?.success) m._autoGrade = computeAutoGrade(r.yavg ?? 120, r.satavg ?? 80); } catch { /* skip */ } smart.tick('color'); }
                    meta.set(f.id, m);
                }
            };
            const CONCURRENCY = Math.min(2, Math.max(1, vids.length));
            await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
            if (needScore) smart.finish('scoring');
            if (needSilence) smart.finish('silence');
            if (needScenes) smart.finish('scenes');
            if (needColor) smart.finish('color');
            workingPool = pool.map((f) => ({ ...f, ...(meta.get(f.id) || {}) }));
            if (needScore) workingPool = [...workingPool].sort((a, b) => ((meta.get(b.id)?.score) || 0) - ((meta.get(a.id)?.score) || 0));
            smart.setActive(false);
            console.log('[TrailerRouter] smart analysis complete');
        }

        let clips: any[];
        if (newSettings.generatorMode === 'music-video' && newSettings.audioAnalysis) {
            // Music-video mode: structure-driven, full-song edit (downbeat-anchored,
            // auto intro/outro), with the editorial rules engine applied.
            const projFps = useProjectStore.getState().settings.fps || 30;
            const seedNum = typeof newSettings.seed === 'number' ? newSettings.seed : Math.abs(String(newSettings.seed || '1').split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)) || 1;
            const mv = generateMusicVideoSequence(workingPool, newSettings.audioAnalysis, {
                fps: projFps,
                beatAnchor: newSettings.mvBeatAnchor || 'downbeat',
                introEnabled: newSettings.mvIntroEnabled ?? true,
                outroEnabled: newSettings.mvOutroEnabled ?? true,
                btsSlot: newSettings.mvBtsSlot ?? true,
                outroCornerScale: newSettings.mvOutroCornerScale ?? 0.4,
                seed: seedNum,
            });
            clips = mv.clips;
            console.log('[TrailerRouter] Music-video mode:', mv.report);
        } else {
            clips = generateTrailerSequence(workingPool, { ...newSettings, beatTimestamps });
        }
        setPreGeneratedClips(clips);
        if (clips.length > 0) {
            // ⚠ EXPORT PIPELINE: Preserve existing MANUALLY-IMPORTED audio clips
            // from the store (e.g., background music added via the Media Manager).
            // generateTrailerSequence() only produces video clips.
            //
            // IMPORTANT: Do NOT preserve wizard-generated audio clips (track 101,
            // origin='auto') — those are created by TrailerPlayer.handleSave()
            // and must be recreated from the NEW wizard settings. Blindly keeping
            // them causes the "double audio" bug where both old and new songs play.
            const { clips: existingClips } = useClipStore.getState();
            const manualAudioClips = existingClips.filter(c =>
                c.type === 'audio' && !(c.origin === 'auto' && c.track === 101)
            );
            setClips([...clips as any, ...manualAudioClips]);
        }

        setActiveView('player');
    };

    const handleDiscard = () => {
        setSettings(null);
        setActiveView('wizard');
    };

    const handleSettings = () => {
        setActiveView('wizard');
    };

    return (
        <div className="w-full h-full bg-[#050505]">
            {activeView === 'wizard' || !settings ? (
                <TrailerWizard onGenerate={handleGenerate} />
            ) : (
                <TrailerPlayer 
                    settings={settings} 
                    preGeneratedClips={preGeneratedClips}
                    onDiscard={handleDiscard} 
                    onSettings={handleSettings} 
                />
            )}
        </div>
    );
};
