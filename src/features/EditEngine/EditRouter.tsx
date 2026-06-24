import React, { useState, useEffect, useRef } from 'react';
import { EditWizard } from './EditWizard';
import { EditPlayer } from './EditPlayer';
import { finalizeGeneratedSequence } from '../../lib/editSequencePipeline';
import { EDIT_TYPES } from './EditGeneratorHome';
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
import { reorderClips } from '../../lib/clipOrdering';
import { validateEdit, autoRepairEdit, type PoolSource } from '../../lib/ege/generationContract';
import { resolveSubcategories } from '../../lib/subcategoryResolver';
import { deClusterShotTypes } from '../../lib/ege/shotDiversity';
import { useExportSettingsStore } from '../../store/exportSettingsStore';
import type { QueuedEdit } from '../../store/exportSettingsStore';
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
import { toast } from '../../components/Toast';

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
    // Open straight into the generator wizard (the mode-picker landing page was
    // removed); modes are switched via the compact bar at the top of the wizard.
    const [activeView, setActiveView] = useState<'home' | 'wizard' | 'player'>('wizard');
    const [activeMode, setActiveMode] = useState<EditType>('trailer');
    const [settings, setSettings] = useState<TrailerSettings | null>(null);
    const [preGeneratedClips, setPreGeneratedClips] = useState<any[]>([]);
    // Snapshot of the timeline taken right before a generated edit is committed,
    // so "Discard" can restore the user's prior clips instead of leaving the
    // generated edit behind.
    const preCommitClipsRef = useRef<any[] | null>(null);

    // ── Stores ───────────────────────────────────────────────────────────────
    const { setClips } = useClipStore();
    const { files } = useMediaStore();
    const editSettings = useEditSettingsStore();
    const narrationStore = useNarrationStore();
    const autoGenerateConsumed = useRef(false);

    // ── Smart Engine confirmation modal state ────────────────────────────────
    const [showConfirm, setShowConfirm] = useState<{ resolve: (v: 'now' | 'wait' | 'all' | 'disable' | 'cancel') => void } | null>(null);
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

        // 'all' = use every clip now (analyzed + not-yet-analyzed, combined).
        // 'disable' = build without Smart input (background analysis keeps running).
        let proceedAll = false;
        let smartDisabled = false;

        // Always confirm how Smart Engine should participate when any Smart
        // option is enabled. Previously this prompt disappeared once background
        // analysis completed, making Generate feel unresponsive and removing the
        // user's last chance to disable or limit Smart input for this edit.
        if ((needScore || needSilence || needScenes || needColor) && pool.length > 0) {
            const decision = await new Promise<'now' | 'wait' | 'all' | 'disable' | 'cancel'>((resolve) => {
                setShowConfirm({ resolve });
            });
            setShowConfirm(null);

            if (decision === 'cancel') return null;

            if (decision === 'disable') {
                smartDisabled = true;
            } else if (decision === 'all') {
                proceedAll = true;
            } else if (decision === 'wait') {
                await new Promise<void>((resolve) => {
                    const unsub = useTrailerSmartStore.subscribe((state) => {
                        if (state.isFullyAnalyzed) { unsub(); resolve(); }
                    });
                    if (useTrailerSmartStore.getState().isFullyAnalyzed) { unsub(); resolve(); }
                });
            }
            // 'now' → keep default behaviour (enrich with whatever is analyzed)
        }

        // ── Smart disabled: run the edit on the RAW pool, no enrichment/sorting.
        // Every clip participates equally so nothing gets put on repeat. ──
        if (smartDisabled) {
            console.log('[EditRouter] Smart Engine disabled for this edit — using raw pool of', pool.length, 'clips');
            return pool;
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
            if (proceedAll) {
                // Give not-yet-analyzed clips a NEUTRAL score (mean of the analyzed
                // ones, or a mid value) so they sit in the middle of the ranking and
                // get used — instead of sinking to 0 and the same few clips repeating.
                const known = workingPool.map(f => (f as any).score).filter((s): s is number => typeof s === 'number');
                const neutral = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 50;
                workingPool = workingPool.map(f => (typeof (f as any).score === 'number' ? f : { ...f, score: neutral }));
            }
            // Stable-ish sort with a tiny deterministic jitter to avoid identical
            // scores always resolving to the same order (another repeat source).
            workingPool = [...workingPool].sort((a, b) => ((b as any).score || 0) - ((a as any).score || 0));
        }

        // ── Semantic filtering & ranking (mood / setting / time-of-day) ──
        // Activates the Smart Engine's semantic tags. Filters never empty the pool
        // (unclassified clips are kept), and mood preference biases selection order.
        const settingFilter = newSettings.settingFilter;
        const timeFilter = newSettings.timeOfDayFilter;
        const moodPref = newSettings.moodPreference;
        const tagOf = (f: any) => smart.getResult(f.id);
        if ((settingFilter && settingFilter.length) || (timeFilter && timeFilter.length)) {
            const filtered = workingPool.filter((f: any) => {
                const r = tagOf(f);
                if (!r) return true; // keep unclassified — never starve the pool
                const settingOk = !settingFilter?.length || !r.setting || settingFilter.includes(r.setting);
                const timeOk = !timeFilter?.length || !r.timeOfDay || timeFilter.includes(r.timeOfDay);
                return settingOk && timeOk;
            });
            if (filtered.length >= Math.min(2, workingPool.length)) workingPool = filtered;
        }
        if (moodPref && moodPref.length) {
            const prefSet = new Set(moodPref);
            const pref: any[] = [], rest: any[] = [];
            for (const f of workingPool as any[]) {
                const r = tagOf(f);
                (r?.mood && prefSet.has(r.mood) ? pref : rest).push(f);
            }
            if (pref.length > 0) workingPool = [...pref, ...rest];
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

    // ── Generation contract: the EGE reliability backbone ────────────────────
    // Every generated edit passes through here before it reaches the timeline.
    // It validates structural invariants (contiguity, slot length, trim bounds,
    // over-reuse) and non-destructively repairs violations. A valid edit passes
    // through untouched. Wrapped in try/catch so a contract issue can NEVER block
    // a generation — worst case it commits the un-repaired clips.
    const runGenerationContract = (clips: any[], pool?: any[]): any[] => {
        try {
            const projFps = useProjectStore.getState().settings.fps || 30;
            const mainTrack = 0;
            const videoClips = clips.filter((c: any) => c.track === mainTrack);
            if (videoClips.length === 0) return clips;
            // Target = the generator's own total, so the contract never fights the
            // chosen length — it only fixes internal violations (starved slots,
            // out-of-source trims, over-reuse, overlaps/gaps).
            const targetFrames = Math.max(...videoClips.map((c: any) => c.endFrame));
            const poolSources: PoolSource[] | undefined = pool?.map((f: any) => ({
                id: f.id,
                sourceDurationFrames: Math.max(1, Math.round((f.duration || 0) * projFps)),
                mediaLibraryId: f.id,
                path: f.path,
                filename: f.filename,
            }));
            const opts = { targetFrames, mainTrack, pool: poolSources, fps: projFps };
            const report = validateEdit(clips as any, opts);
            if (report.valid) {
                console.log('[EditRouter] Generation contract OK', report.metrics);
                return clips;
            }
            const fixed = autoRepairEdit(clips as any, opts);
            console.warn('[EditRouter] Generation contract repaired:', report.violations.map((v: any) => v.kind).join(', '), '→ repaired:', fixed.repaired);
            return fixed.clips as any;
        } catch (e) {
            console.error('[EditRouter] Generation contract error (committing as-is):', e);
            return clips;
        }
    };

    /** Commit clips: preserve manually-imported audio, replace auto audio. */
    const commitClips = (clips: any[], pool?: any[]) => {
        clips = runGenerationContract(clips, pool);
        const isExporting = useExportSettingsStore.getState().isExporting;

        if (isExporting) {
            // ── QUEUE MODE: Don't touch the active timeline during render ──
            const modeLabel = { 'trailer': 'Trailer', 'music-video': 'Music Video', 'showreel': 'Showreel', 'video-essay': 'Video Essay', 'short-film': 'Short Film', 'social-media': 'Social Media', 'bts': 'BTS' }[activeMode] || 'Edit';
            const edit: QueuedEdit = {
                id: crypto.randomUUID?.() || `q-${Date.now()}`,
                clips,
                label: `${modeLabel} (${clips.length} clips)`,
                queuedAt: Date.now(),
            };
            useExportSettingsStore.getState().addQueuedEdit(edit);
            toast.success(`${modeLabel} queued for rendering`);
            // Stay on wizard — don't switch to player
            return;
        }

        setPreGeneratedClips(clips);
        if (clips.length > 0) {
            // Snapshot the current timeline BEFORE we overwrite it, so Discard
            // can restore it (draft semantics).
            preCommitClipsRef.current = useClipStore.getState().clips.map((c) => ({ ...c }));
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
        // Every "Generate" must produce a NEW variation. A previously-used seed
        // (including a stale persisted one) must never pin the output to the same
        // selection forever. Only honour an explicit Lock Seed for reproducibility.
        if ((newSettings as any).lockSeed) {
            if (!newSettings.seed) newSettings.seed = generateSeed();
        } else {
            newSettings.seed = generateSeed();
        }

        // ── Subcategory intelligence → concrete settings ─────────────────
        // Translate the selected subcategories (e.g. "Meme Edit", "Product
        // Trailer") into real TrailerSettings overrides so each one actually
        // edits differently. Subcategory overrides win over incoming defaults;
        // multiple active subcategories stack (later wins).
        const subOverrides = resolveSubcategories(newSettings.generatorMode || activeMode, newSettings.activeSubcategories);
        if (Object.keys(subOverrides).length > 0) {
            newSettings = { ...newSettings, ...subOverrides };
            console.log('[EditRouter] Subcategory overrides:', newSettings.activeSubcategories, '→', Object.keys(subOverrides).join(', '));
        }

        // ── Aspect intent → real export orientation ──────────────────────
        // Social subcategories declare outputAspectRatios (e.g. ['9:16']). Map the
        // primary aspect onto the export orientation so the rendered output is
        // actually vertical/square, not just a setting nobody reads.
        const aspects = newSettings.outputAspectRatios;
        if (aspects && aspects.length) {
            const a = aspects[0];
            const orientation = (a === '9:16' || a === '4:5') ? 'portrait' : a === '1:1' ? 'square' : 'landscape';
            useExportSettingsStore.getState().setOrientation(orientation as any);
            console.log('[EditRouter] Output aspect', a, '→ export orientation', orientation);
        }
        setSettings(newSettings);

        // Ask how Smart Engine should participate before beat extraction or any
        // other expensive work, so Generate provides immediate feedback.
        const workingPool = await resolvePoolAndConfirm(newSettings);
        if (!workingPool) return; // User cancelled

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
            const projFps = useProjectStore.getState().settings.fps || 30;
            clips = generateTrailerSequence(workingPool, { ...newSettings, beatTimestamps, fps: projFps });
        }

        const projFps = useProjectStore.getState().settings.fps || 30;
        clips = finalizeGeneratedSequence(clips, workingPool, newSettings, projFps);

        // ── Lockable clip-ordering structure (Media Pool toggle) ─────────
        // 'none' keeps the generator's existing structure. The other modes group a
        // clip's segments contiguously and order them sequentially / randomly.
        if (newSettings.clipOrderMode && newSettings.clipOrderMode !== 'none') {
            const fileMeta = new Map(
                files.map((f): [string, { createdAt?: number; filename?: string }] => [f.id, { createdAt: f.createdAt, filename: f.filename }])
            );
            clips = reorderClips(clips, newSettings.clipOrderMode, {
                sequentialBy: newSettings.sequentialBy,
                fileMeta,
                seed: newSettings.seed,
            });
            console.log('[EditRouter] Clip-order mode:', newSettings.clipOrderMode, newSettings.sequentialBy);
        }

        // ── Shot-diversity de-clustering (slot-preserving) ───────────────
        // When the active subcategory asks for shot variety (e.g. showreels),
        // avoid two same shot-types back-to-back by swapping slot CONTENT only —
        // cut times never move. Uses shot types produced by the Smart Engine.
        if (newSettings.shotDiversityEnabled) {
            const smart = useTrailerSmartStore.getState();
            const shotMap = new Map<string, string>();
            for (const f of workingPool as any[]) {
                const st = smart.getResult(f.id)?.shotType;
                if (st) shotMap.set(f.id, st);
            }
            if (shotMap.size > 0) {
                clips = deClusterShotTypes(clips as any, shotMap) as any;
                console.log('[EditRouter] Shot-diversity de-cluster applied across', shotMap.size, 'classified sources');
            }
        }

        commitClips(clips, workingPool);
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
        // Restore the timeline to its pre-generation state (draft discarded).
        if (preCommitClipsRef.current) {
            setClips(preCommitClipsRef.current as any);
            preCommitClipsRef.current = null;
        }
        setPreGeneratedClips([]);
        setSettings(null);
        setActiveView('wizard');
    };

    const handleSettings = () => {
        setActiveView('wizard');
    };

    // ═════════════════════════════════════════════════════════════════════════
    // RENDER — Three-way view switch
    // ═════════════════════════════════════════════════════════════════════════

    const inWizard = activeView === 'wizard' || !settings;

    return (
        <div className="w-full h-full bg-[#050505] flex flex-col">
            {/* Mode is now selected via the unified GENERATOR MODE buttons inside the wizard */}

            <div className="flex-1 min-h-0">
                {inWizard ? (
                    /* Mode-aware wizard rendering: specialized wizards for modes that
                       need additional data entry (actor assignments, narration, scenes);
                       the unified EditWizard for beat-sync modes that differ via subcategory. */
                    activeMode === 'showreel' ? (
                        <ShowreelWizard onGenerate={handleShowreelGenerate} />
                    ) : activeMode === 'video-essay' ? (
                        <VideoEssayWizard onGenerate={handleVideoEssayGenerate} />
                    ) : activeMode === 'short-film' ? (
                        <ShortFilmDashboard onAssemblyCut={handleShortFilmGenerate} />
                    ) : (
                        /* Trailer, Music Video, Social Media, BTS — unified engine
                           with subcategory-driven behaviour differences. */
                        <EditWizard
                            onGenerate={handleGenerate}
                            onModeChange={(mode) => handleModeSelect(mode as EditType)}
                            activeMode={activeMode}
                        />
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
            </div>

            {/* Smart Engine confirmation modal (shared across all modes) */}
            <SmartEngineConfirmModal
                isOpen={!!showConfirm}
                analyzedCount={smartState.analyzedCount}
                totalCount={smartState.totalCount}
                onUseNow={() => showConfirm?.resolve('now')}
                onWaitAll={() => showConfirm?.resolve('wait')}
                onProceedAll={() => showConfirm?.resolve('all')}
                onDisableSmart={() => showConfirm?.resolve('disable')}
                onCancel={() => showConfirm?.resolve('cancel')}
            />
        </div>
    );
};
