import React, { useState, useEffect, useRef } from 'react';
import { EditWizard } from './EditWizard';
import { EditPlayer } from './EditPlayer';
import { TrailerSettings, generateTrailerSequence, extractBeatTimestamps } from '../../lib/trailerGenerator';
import { generateSeed } from '../../lib/random';
import { useClipStore } from '../../store/clipStore';
import { useMediaStore } from '../../store/mediaStore';
import { useGodModeStore } from '../../store/godModeStore';
import { useProjectStore } from '../../store/projectStore';
import { generateMusicVideoSequence } from '../../lib/musicVideoBuild';
import { useTrailerSmartStore } from '../../store/trailerSmartStore';
import { SmartEngineConfirmModal } from './SmartEngineConfirmModal';

export const EditRouter: React.FC = () => {
    const [activeView, setActiveView] = useState<'wizard' | 'player'>('wizard');
    const [settings, setSettings] = useState<TrailerSettings | null>(null);
    const [preGeneratedClips, setPreGeneratedClips] = useState<any[]>([]);
    const { setClips } = useClipStore();
    const { files } = useMediaStore();
    const autoGenerateConsumed = useRef(false);

    // ── Smart Engine confirmation modal state ──
    const [showConfirm, setShowConfirm] = useState<{ resolve: (v: 'now' | 'wait' | 'cancel') => void } | null>(null);
    const smartState = useTrailerSmartStore();

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

        // ── Consume pre-computed Smart Engine results ──────────────────────
        // The background Smart Engine has been auto-analyzing clips since load.
        // Read cached results instead of running inline analysis.
        const smart = useTrailerSmartStore.getState();
        const needScore = !!(newSettings.preferHighEnergy && pool.length > 1);
        const needSilence = !!newSettings.autoTrimSilence;
        const needScenes = !!newSettings.sceneAwareCuts;
        const needColor = !!newSettings.autoColorGrade;

        // If analysis is not fully complete and user wants smart features,
        // show the confirmation modal instead of window.confirm().
        if ((needScore || needSilence || needScenes || needColor) && !smart.isFullyAnalyzed && smart.totalCount > 0) {
            const decision = await new Promise<'now' | 'wait' | 'cancel'>((resolve) => {
                setShowConfirm({ resolve });
            });
            setShowConfirm(null);

            if (decision === 'cancel') {
                return; // Abort generation entirely
            }

            if (decision === 'wait') {
                // Wait for analysis to complete, auto-proceed when done
                await new Promise<void>((resolve) => {
                    const unsub = useTrailerSmartStore.subscribe((state) => {
                        if (state.isFullyAnalyzed) {
                            unsub();
                            resolve();
                        }
                    });
                    // Resolve immediately if it finished in the meantime
                    if (useTrailerSmartStore.getState().isFullyAnalyzed) {
                        unsub();
                        resolve();
                    }
                });
            }
            // decision === 'now' → fall through, proceed with partial results
        }

        // Enrich pool with pre-computed analysis data
        let workingPool = pool.map((f) => {
            const result = smart.getResult(f.id);
            if (!result) return f;
            const enriched: any = { ...f };
            if (needScore) enriched.score = result.score;
            if (needSilence && result.usableInFrames != null) {
                enriched._usableInFrames = result.usableInFrames;
                enriched._usableOutFrames = result.usableOutFrames;
            }
            if (needScenes && result.sceneCutsFrames) {
                enriched._sceneCutsFrames = result.sceneCutsFrames;
            }
            if (needColor && result.autoGrade) {
                enriched._autoGrade = result.autoGrade;
            }
            return enriched;
        });

        // Sort by score if preferring high-energy
        if (needScore) {
            workingPool = [...workingPool].sort((a, b) => ((b as any).score || 0) - ((a as any).score || 0));
        }
        console.log('[TrailerRouter] Using pre-computed Smart Engine results');

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
                <EditWizard onGenerate={handleGenerate} />
            ) : (
                <EditPlayer 
                    settings={settings} 
                    preGeneratedClips={preGeneratedClips}
                    onDiscard={handleDiscard} 
                    onSettings={handleSettings} 
                />
            )}

            {/* Smart Engine confirmation modal */}
            <SmartEngineConfirmModal
                isOpen={!!showConfirm}
                analyzedCount={smartState.analyzedCount}
                totalCount={smartState.totalCount}
                onUseNow={() => showConfirm?.resolve('now')}
                onWaitAll={() => showConfirm?.resolve('wait')}
                onCancel={() => showConfirm?.resolve('cancel')}
            />
        </div>
    );
};
