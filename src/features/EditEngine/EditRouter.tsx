import React, { useState, useEffect, useRef } from 'react';
import { EditWizard } from './EditWizard';
import { EditPlayer } from './EditPlayer';
import { EditGeneratorHome } from './EditGeneratorHome';
import type { EditType } from './EditGeneratorHome';
import { TrailerSettings, generateTrailerSequence, extractBeatTimestamps } from '../../lib/trailerGenerator';
import { generateSeed } from '../../lib/random';
import { useClipStore } from '../../store/clipStore';
import { useMediaStore } from '../../store/mediaStore';
import { useGodModeStore } from '../../store/godModeStore';
import { useProjectStore } from '../../store/projectStore';
import { useEditSettingsStore } from '../../store/editSettingsStore';
import { generateMusicVideoSequence } from '../../lib/musicVideoBuild';
import { useTrailerSmartStore } from '../../store/trailerSmartStore';
import { SmartEngineConfirmModal } from './SmartEngineConfirmModal';
import { ShowreelWizard } from './ShowreelWizard';
import { VideoEssayWizard } from './VideoEssayWizard';
import { ShortFilmDashboard } from './ShortFilmDashboard';
import { planShowreel, buildShowreelClips } from '../../lib/showreelGenerator';
import type { ShowreelSettings, ShowreelClipMeta } from '../../lib/showreelGenerator';
import { planVideoEssay } from '../../lib/videoEssayGenerator';
import type { VideoEssaySettings, NarrationSegment } from '../../lib/videoEssayGenerator';
import { generateAssemblyCut } from '../../lib/shortFilmAssistant';
import type { SceneDefinition, ActStructure } from '../../lib/shortFilmAssistant';
import { mergeIntelligence } from '../../lib/intelligenceMerger';
import { useNarrationStore } from '../../store/narrationStore';

// ═══════════════════════════════════════════════════════════════════════════════
// EditRouter — 3-state router: home → wizard → player
// ═══════════════════════════════════════════════════════════════════════════════
// State machine:
//   'home'   — EditGeneratorHome (mode picker)
//   'wizard' — mode-specific wizard (trailer / music-video / showreel / essay / short-film)
//   'player' — EditPlayer with generated clips
//
// Transitions:
//   home → wizard    — user picks a mode
//   wizard → player  — generation completes
//   player → wizard  — user discards / tweaks settings
// ═══════════════════════════════════════════════════════════════════════════════

export const EditRouter: React.FC = () => {
    // ── Core state machine ───────────────────────────────────────────────────
    const [activeView, setActiveView] = useState<'home' | 'wizard' | 'player'>('wizard');
    const [activeMode, setActiveMode] = useState<EditType>('trailer');
    const [settings, setSettings] = useState<TrailerSettings | null>(null);
    const [preGeneratedClips, setPreGeneratedClips] = useState<any[]>([]);

    // ── Stores ───────────────────────────────────────────────────────────────
    const { setClips } = useClipStore();
    const { files } = useMediaStore();
    const editSettings = useEditSettingsStore();
    const narrationStore = useNarrationStore();
    const autoGenerateConsumed = useRef(false);

    // ── Smart Engine confirmation modal state ────────────────────────────────
    const [showConfirm, setShowConfirm] = useState<{ resolve: (v: 'now' | 'wait' | 'cancel') => void } | null>(null);
    const smartState = useTrailerSmartStore();

    // ── GodMode auto-generate: skip home, jump straight to wizard ────────────
    const { autoGenerate, lastGeneratedSettings, clearAutoGenerate } = useGodModeStore();

    useEffect(() => {
        if (autoGenerate && lastGeneratedSettings && !autoGenerateConsumed.current) {
            autoGenerateConsumed.current = true;
            clearAutoGenerate();
            // Skip home → go directly into the trailer/music-video wizard pipeline
            setActiveView('wizard');
            handleGenerate(lastGeneratedSettings);
        }
    }, [autoGenerate, lastGeneratedSettings]);

    // ═════════════════════════════════════════════════════════════════════════
    // MODE SELECTION — Home → Wizard
    // ═════════════════════════════════════════════════════════════════════════

    const handleModeSelect = (mode: EditType) => {
        setActiveMode(mode);
        editSettings.setActiveMode(mode);
        setActiveView('wizard');
    };

    // ═════════════════════════════════════════════════════════════════════════
    // SMART ENGINE CONFIRMATION (shared across modes)
    // ═════════════════════════════════════════════════════════════════════════

    /** Resolves the media pool (respecting selection) and runs the Smart Engine confirmation flow. */
    const resolvePoolAndConfirm = async (newSettings: TrailerSettings) => {
        const { selectedFileIds } = useMediaStore.getState();
        const pool = selectedFileIds.length > 0
            ? files.filter(f => selectedFileIds.includes(f.id))
            : files;

        // ── Smart Engine gate ────────────────────────────────────────────
        const smart = useTrailerSmartStore.getState();
        const needScore = !!(newSettings.preferHighEnergy && pool.length > 1);
        const needSilence = !!newSettings.autoTrimSilence;
        const needScenes = !!newSettings.sceneAwareCuts;
        const needColor = !!newSettings.autoColorGrade;

        if ((needScore || needSilence || needScenes || needColor) && !smart.isFullyAnalyzed && smart.totalCount > 0) {
            const decision = await new Promise<'now' | 'wait' | 'cancel'>((resolve) => {
                setShowConfirm({ resolve });
            });
            setShowConfirm(null);

            if (decision === 'cancel') return null;

            if (decision === 'wait') {
                await new Promise<void>((resolve) => {
                    const unsub = useTrailerSmartStore.subscribe((state) => {
                        if (state.isFullyAnalyzed) { unsub(); resolve(); }
                    });
                    if (useTrailerSmartStore.getState().isFullyAnalyzed) { unsub(); resolve(); }
                });
            }
        }

        // ── Enrich pool with Smart Engine pre-computed analysis ──────────
        let workingPool = pool.map((f) => {
            const result = smart.getResult(f.id);
            if (!result) return f;
            const enriched: any = { ...f };
            if (needScore) enriched.score = result.score;
            if (needSilence && result.usableInFrames != null) {
                enriched._usableInFrames = result.usableInFrames;
                enriched._usableOutFrames = result.usableOutFrames;
            }
            if (needScenes && result.sceneCutsFrames) enriched._sceneCutsFrames = result.sceneCutsFrames;
            if (needColor && result.autoGrade) enriched._autoGrade = result.autoGrade;
            return enriched;
        });

        if (needScore) {
            workingPool = [...workingPool].sort((a, b) => ((b as any).score || 0) - ((a as any).score || 0));
        }

        return workingPool;
    };

    // ═════════════════════════════════════════════════════════════════════════
    // INTELLIGENCE MERGER — merges beat + narration analysis when available
    // ═════════════════════════════════════════════════════════════════════════

    /** Returns merged cut points if narration + audio analysis are both available. */
    const tryMergeIntelligence = (audioAnalysis: any) => {
        const narration = narrationStore.analysis;
        if (narration && audioAnalysis) {
            const strategy = (editSettings.trailerSettings as any)?.mergeStrategy ?? 'balanced';
            const merged = mergeIntelligence(audioAnalysis, narration, strategy);
            console.log('[EditRouter] Intelligence merged:', merged.primaryDriver, merged.cutPoints.length, 'cut points');
            return merged;
        }
        return null;
    };

    // ═════════════════════════════════════════════════════════════════════════
    // CLIP COMMIT — pushes generated clips to the timeline store
    // ═════════════════════════════════════════════════════════════════════════

    /** Commit clips: preserve manually-imported audio, replace auto audio. */
    const commitClips = (clips: any[]) => {
        setPreGeneratedClips(clips);
        if (clips.length > 0) {
            // ⚠ Preserve existing MANUALLY-IMPORTED audio clips.
            // Do NOT preserve wizard-generated audio (track 101, origin='auto')
            // to avoid the "double audio" bug.
            const { clips: existingClips } = useClipStore.getState();
            const manualAudioClips = existingClips.filter(c =>
                c.type === 'audio' && !(c.origin === 'auto' && c.track === 101)
            );
            setClips([...clips as any, ...manualAudioClips]);
        }
        setActiveView('player');
    };

    // ═════════════════════════════════════════════════════════════════════════
    // GENERATOR: Trailer / Music-Video (existing logic, refactored)
    // ═════════════════════════════════════════════════════════════════════════

    const handleGenerate = async (newSettings: TrailerSettings) => {
        if (!newSettings.seed) newSettings.seed = generateSeed();
        setSettings(newSettings);

        // ── Beat extraction ──────────────────────────────────────────────
        let beatTimestamps = newSettings.beatTimestamps;
        if (newSettings.useAudioGuide && newSettings.audioUrl && !beatTimestamps) {
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
                console.log(`[EditRouter] Extracted ${beatTimestamps.length} beats from pre-computed analysis`);
            } else {
                beatTimestamps = await extractBeatTimestamps(
                    newSettings.audioUrl,
                    newSettings.audioTrimStart || 0,
                    newSettings.audioTrimEnd || 30,
                    newSettings.audioAnalysis,
                );
            }
        }

        // ── Pool + Smart Engine confirmation ─────────────────────────────
        const workingPool = await resolvePoolAndConfirm(newSettings);
        if (!workingPool) return; // User cancelled
        console.log('[EditRouter] Using pre-computed Smart Engine results');

        // ── Intelligence merge (if narration available) ──────────────────
        const merged = tryMergeIntelligence(newSettings.audioAnalysis);
        if (merged) {
            // Use merged cut points as beat timestamps when available
            beatTimestamps = merged.cutPoints;
        }

        // ── Generate clips ───────────────────────────────────────────────
        let clips: any[];
        if (newSettings.generatorMode === 'music-video' && newSettings.audioAnalysis) {
            const projFps = useProjectStore.getState().settings.fps || 30;
            const seedNum = typeof newSettings.seed === 'number'
                ? newSettings.seed
                : Math.abs(String(newSettings.seed || '1').split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)) || 1;
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
            console.log('[EditRouter] Music-video mode:', mv.report);
        } else {
            clips = generateTrailerSequence(workingPool, { ...newSettings, beatTimestamps });
        }

        commitClips(clips);
    };

    // ═════════════════════════════════════════════════════════════════════════
    // GENERATOR: Showreel
    // ═════════════════════════════════════════════════════════════════════════

    const handleShowreelGenerate = (
        showreelSettings: ShowreelSettings,
        selectedFileIds: string[],
        actorAssignments: Record<string, string>,
    ) => {
        const pool = selectedFileIds.length > 0
            ? files.filter(f => selectedFileIds.includes(f.id))
            : files;

        // Build clip metadata from pool (using actorAssignments for face matching)
        const clipMetas: ShowreelClipMeta[] = pool.map((f, i) => ({
            fileIndex: i,
            faceVisibility: actorAssignments[f.id] ? 0.8 : 0.2,
            shotType: 'ms' as const,
            emotion: 'neutral' as const,
            genre: 'drama' as const,
            hasDialogue: true,
            stabilityScore: 0.8,
            worthinessScore: 0,
        }));

        const plan = planShowreel(clipMetas, pool as any, showreelSettings);
        const clips = buildShowreelClips(plan, pool as any, showreelSettings);
        console.log(`[EditRouter] Showreel: ${plan.length} planned → ${clips.length} clips`);
        commitClips(clips);
    };

    // ═════════════════════════════════════════════════════════════════════════
    // GENERATOR: Video Essay
    // ═════════════════════════════════════════════════════════════════════════

    const handleVideoEssayGenerate = (
        essaySettings: VideoEssaySettings,
        narrationPath: string | null,
        transcription: string,
        brollTags: Record<string, string[]>,
    ) => {
        if (!narrationPath) {
            console.warn('[EditRouter] Video-essay requires a narration file');
            return;
        }

        // Build segments from transcription (split by sentences)
        const sentences = transcription.split(/[.!?]+/).filter(s => s.trim());
        const narrationDuration = narrationStore.narrationDuration || 60;
        const segDuration = narrationDuration / Math.max(sentences.length, 1);
        const segments: NarrationSegment[] = sentences.map((text, i) => ({
            id: `seg-${i}`,
            text: text.trim(),
            startTime: i * segDuration,
            endTime: (i + 1) * segDuration,
            keywords: Object.entries(brollTags)
                .filter(([, tags]) => tags.some(tag => text.toLowerCase().includes(tag.toLowerCase())))
                .flatMap(([, tags]) => tags),
        }));

        // Build pool with tag info
        const pool = files.filter(f => f.type === 'video' || f.type === 'image').map(f => ({
            ...f,
            tags: brollTags[f.id] || [],
        }));

        const { narrationClip, brollClips, report } = planVideoEssay(
            narrationPath, narrationDuration, segments, pool as any, essaySettings,
        );
        console.log('[EditRouter] Video-essay:', report);

        // Intelligence merge — merge narration + beat analysis for cut refinement
        const merged = tryMergeIntelligence(null);
        if (merged) console.log('[EditRouter] Essay: intelligence merge available');

        commitClips([narrationClip, ...brollClips]);
    };

    // ═════════════════════════════════════════════════════════════════════════
    // GENERATOR: Short Film (assembly cut)
    // ═════════════════════════════════════════════════════════════════════════

    const handleShortFilmGenerate = (scenes: SceneDefinition[], structure: ActStructure) => {
        const projFps = useProjectStore.getState().settings.fps || 30;

        // Build clip Map from all existing timeline clips + media files
        const allClipsMap = new Map<string, any>();
        const { clips: existingClips } = useClipStore.getState();
        existingClips.forEach(c => allClipsMap.set(c.id, c));

        const assemblyCut = generateAssemblyCut(scenes, allClipsMap, projFps);
        console.log(`[EditRouter] Short-film assembly: ${assemblyCut.length} clips from ${scenes.length} scenes (${structure})`);
        commitClips(assemblyCut);
    };

    // ═════════════════════════════════════════════════════════════════════════
    // NAVIGATION: discard / settings
    // ═════════════════════════════════════════════════════════════════════════

    const handleDiscard = () => {
        setSettings(null);
        setActiveView('wizard');
    };

    const handleSettings = () => {
        setActiveView('wizard');
    };

    // ═════════════════════════════════════════════════════════════════════════
    // RENDER — Three-way view switch
    // ═════════════════════════════════════════════════════════════════════════

    return (
        <div className="w-full h-full bg-[#050505]">
            {activeView === 'home' ? (
                /* ── HOME: Mode picker ──────────────────────────────── */
                <EditGeneratorHome onSelect={handleModeSelect} />

            ) : activeView === 'wizard' || !settings ? (
                /* ── WIZARD: Route to mode-specific wizard ──────────── */
                activeMode === 'showreel' ? (
                    <ShowreelWizard onGenerate={handleShowreelGenerate} />
                ) : activeMode === 'video-essay' ? (
                    <VideoEssayWizard onGenerate={handleVideoEssayGenerate} />
                ) : activeMode === 'short-film' ? (
                    <ShortFilmDashboard onAssemblyCut={handleShortFilmGenerate} />
                ) : (
                    /* trailer + music-video share the same wizard */
                    <EditWizard onGenerate={handleGenerate} />
                )

            ) : (
                /* ── PLAYER: Generated timeline ─────────────────────── */
                <EditPlayer
                    settings={settings}
                    preGeneratedClips={preGeneratedClips}
                    onDiscard={handleDiscard}
                    onSettings={handleSettings}
                />
            )}

            {/* Smart Engine confirmation modal (shared across all modes) */}
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
