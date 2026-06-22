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

        // ── Prefer high-energy clips: rank the pool by motion energy (FFmpeg) ──
        let workingPool = pool;
        if (newSettings.preferHighEnergy && pool.length > 1) {
            try {
                const scored = await Promise.all(pool.map(async (f) => {
                    try {
                        const r = await (window as any).ipcRenderer.scoreClip({ path: f.path });
                        return { f, score: r?.success ? (r.score || 0) : 0 };
                    } catch { return { f, score: 0 }; }
                }));
                scored.sort((a, b) => b.score - a.score);
                workingPool = scored.map((s) => s.f);
                console.log('[TrailerRouter] preferHighEnergy ranking:', scored.map(s => `${s.f.filename}:${s.score}`).join(', '));
            } catch (e) { console.warn('[TrailerRouter] scoring failed, using original order', e); }
        }

        // ── Smart clip prep: precompute non-silent range + scene cuts per file ──
        if ((newSettings.autoTrimSilence || newSettings.sceneAwareCuts) && workingPool.length > 0) {
            const projFps = useProjectStore.getState().settings.fps || 30;
            workingPool = await Promise.all(workingPool.map(async (f) => {
                const ef: any = { ...f };
                if (f.type !== 'video' || !f.path) return ef;
                const fps = (f as any).fps || projFps;
                try {
                    if (newSettings.autoTrimSilence) {
                        const r = await (window as any).ipcRenderer.detectSilence({ path: f.path });
                        if (r?.success && r.trim) {
                            ef._usableInFrames = Math.round(r.trim.trimStart * fps);
                            ef._usableOutFrames = Math.round(r.trim.trimEnd * fps);
                        }
                    }
                    if (newSettings.sceneAwareCuts) {
                        const r = await (window as any).ipcRenderer.detectScenes({ path: f.path });
                        if (r?.success && Array.isArray(r.cuts)) ef._sceneCutsFrames = r.cuts.map((t: number) => Math.round(t * fps));
                    }
                } catch (e) { /* per-file analysis failure is non-fatal */ }
                return ef;
            }));
            console.log('[TrailerRouter] smart prep complete (silence/scene)');
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
