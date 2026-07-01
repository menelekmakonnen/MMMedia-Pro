/**
 * editPlanBuilder.ts — Builds a comprehensive EditPlan from current app state.
 * ════════════════════════════════════════════════════════════════════════════
 * Reads every store (clips, generator mode, creator hacks, settings, SFX)
 * and the feature manifest to produce a structured decision tree explaining
 * WHY and HOW every feature is applied in the current edit.
 */

import { useClipStore } from '../store/clipStore';
import { useGeneratorModeStore } from '../store/generatorModeStore';
import { getGeneratorMode } from './generatorModes';
import { detectActiveFeatures } from './featureManifest';
import type {
    EditPlan,
    GlobalDecisions,
    GlobalDecisionNode,
    ClipDecisionNode,
    ClipFeatureNode,
    AudioDecisions,
    AudioDecisionNode,
    DecisionSource,
} from '../types/EditPlanTypes';

// ─── Node ID generator ───────────────────────────────────────────────────────

let _counter = 0;
function nid(prefix: string): string {
    return `${prefix}-${(++_counter).toString(36)}-${Date.now().toString(36)}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function gnode(overrides: Partial<GlobalDecisionNode> & { label: string; description: string }): GlobalDecisionNode {
    return {
        nodeId: nid('g'),
        category: 'global',
        source: 'baked-in',
        adjustable: false,
        value: null,
        ...overrides,
    };
}

function anode(overrides: Partial<AudioDecisionNode> & { label: string; description: string }): AudioDecisionNode {
    return {
        nodeId: nid('a'),
        category: 'audio',
        source: 'baked-in',
        adjustable: false,
        value: null,
        ...overrides,
    };
}

// ─── Feature source detection ────────────────────────────────────────────────

const CREATOR_HACK_IDS = new Set(['light_bloom', 'blur_background', 'hard_limiter', 'ring_out', 'shake', 'motion_blur']);

function inferSource(featureId: string): DecisionSource {
    if (CREATOR_HACK_IDS.has(featureId)) return 'creator-hack';
    if (featureId === 'transition') return 'editorial-rule';
    return 'generator-mode';
}

// ─── Build Edit Plan ─────────────────────────────────────────────────────────

export function buildEditPlan(projectFps: number = 30): EditPlan {
    const clips = useClipStore.getState().clips;
    const modeStore = useGeneratorModeStore.getState();

    const modeId = modeStore.selectedModeId;
    const mode = modeId ? getGeneratorMode(modeId) : null;

    // ── Global Decisions ──

    const generatorMode = gnode({
        label: 'Generator Mode',
        description: mode ? `${mode.name} (${mode.family})` : 'No mode selected',
        source: mode ? 'generator-mode' : 'baked-in',
        adjustable: true,
        value: modeId,
        featureId: 'generator_mode',
    });

    const pacingStrategy = gnode({
        label: 'Pacing Strategy',
        description: mode?.pacing?.logic
            ? `${mode.pacing.logic}${mode.pacing.cutsPerMin ? ` (${mode.pacing.cutsPerMin[0]}–${mode.pacing.cutsPerMin[1]} cuts/min)` : ''}`
            : 'Dynamic pacing — longer cuts in verses, faster in choruses/drops. Cut on action and beat grid.',
        category: 'editorial',
        source: 'baked-in',
        value: mode?.pacing ?? { logic: 'dynamic', cutsPerMin: [15, 30] },
    });

    const transitionDiscipline = gnode({
        label: 'Transition Discipline',
        description: 'Hard cuts by default. Cross-dissolves only on slow/atmospheric moments. Flash cuts on impacts. No unmotivated dissolves.',
        category: 'editorial',
        source: 'baked-in',
        value: { defaultType: 'cut', dissolveOnlyForAtmosphere: true },
    });

    const eyeTrace = gnode({
        label: 'Eye Trace Reframe',
        description: 'Keep subject focus in consistent screen region across cuts. Auto-reframe when subject drifts >30% between adjacent shots.',
        category: 'editorial',
        source: 'baked-in',
        value: { maxZoomPercent: 118, driftThreshold: 0.3 },
    });

    const siftTakes = gnode({
        label: 'Sift Takes',
        description: 'Automatically disable weak takes — keeps the strongest performance or visual from multi-take sessions.',
        category: 'editorial',
        source: 'baked-in',
        value: { enabled: true },
    });

    // ── Creator Hacks ──
    const globalHacks = modeStore.toggleState['_global_hacks'] ?? {};
    const hackLabels: Record<string, string> = {
        bloom: 'Light Bloom — soft glow on highlights',
        blur_bg: 'Blur Background — blurred fill for letterbox/pillarbox',
        ring_out: 'Audio Ring-out — pitch-dropping trail-off at cuts',
        hard_limiter: 'Hard Limiter — brickwall peak prevention at -1dB',
        smooth_zoom: 'Smooth Zoom — motion-blurred punch-ins',
        motion_tween: 'Motion Tween — position/scale interpolation between clips',
        handheld_shake: 'Handheld Shake — subtle organic camera movement',
    };

    const creatorHacks: GlobalDecisionNode[] = Object.entries(hackLabels).map(([id, desc]) => {
        const isOn = globalHacks[id] === true || (globalHacks[id] === undefined && id === 'hard_limiter');
        const freq = globalHacks[`${id}_freq`];
        return gnode({
            label: desc.split('—')[0].trim(),
            description: `${desc}${freq ? ` (freq: ${freq}%)` : ''}`,
            source: 'creator-hack',
            adjustable: true,
            value: { enabled: isOn, frequency: freq },
            featureId: id,
        });
    });

    // ── Editorial score ──
    const editorialScore = gnode({
        label: 'Editorial Quality',
        description: 'Composite score: shot grammar (45%) + transition discipline (30%) + eye trace (25%)',
        source: 'baked-in',
        value: { score: 1.0, notes: [] },
    });

    const global: GlobalDecisions = {
        generatorMode,
        pacingStrategy,
        transitionDiscipline,
        eyeTrace,
        siftTakes,
        creatorHacks,
        editorialScore,
    };

    // ── Per-Clip Decisions ──

    const videoClips = clips
        .filter((c: any) => c.type !== 'audio' && (c.track === 0 || c.track === undefined))
        .sort((a: any, b: any) => a.startFrame - b.startFrame);

    const clipDecisions: ClipDecisionNode[] = videoClips.map((clip: any, i: number) => {
        const durationFrames = clip.endFrame - clip.startFrame;
        const durationSec = durationFrames / projectFps;
        const trimStartSec = (clip.trimStartFrame || 0) / projectFps;
        const trimEndSec = (clip.trimEndFrame || clip.sourceDurationFrames || durationFrames) / projectFps;

        // Detect all active features on this clip
        const detected = detectActiveFeatures(clip);

        const features: ClipFeatureNode[] = detected
            .filter((d) => d.feature.category !== 'audio')
            .map((d) => ({
                featureId: d.feature.id,
                label: d.feature.label,
                params: d.params,
                source: inferSource(d.feature.id),
                adjustable: d.feature.adjustable,
            }));

        const audioFeatures: ClipFeatureNode[] = detected
            .filter((d) => d.feature.category === 'audio')
            .map((d) => ({
                featureId: d.feature.id,
                label: d.feature.label,
                params: d.params,
                source: inferSource(d.feature.id),
                adjustable: d.feature.adjustable,
            }));

        // Transition info
        const trans = clip.transition;
        const transitionType = trans?.type || null;
        const transitionDurationMs = trans?.durationFrames
            ? Math.round((trans.durationFrames / projectFps) * 1000)
            : 0;

        // Selection reason
        let selectionReason = 'Selected by generator';
        if (clip._showSegment) selectionReason = 'Show segment';
        else if (clip.origin === 'auto') selectionReason = 'Auto-generated';
        else if (clip.origin === 'user') selectionReason = 'User-placed';

        return {
            clipId: clip.id,
            filename: clip.filename || clip.path?.split(/[/\\]/).pop() || `Clip ${i + 1}`,
            sourcePath: clip.path || '',
            order: i,
            selectionReason,
            durationSec: Math.round(durationSec * 100) / 100,
            trimRange: [
                Math.round(trimStartSec * 100) / 100,
                Math.round(trimEndSec * 100) / 100,
            ] as [number, number],
            speed: clip.speed || 1,
            speedCurve: clip.speedCurvePreset !== 'constant' ? clip.speedCurvePreset : undefined,
            transitionType,
            transitionDurationMs,
            transitionReason: transitionType === null
                ? 'Hard cut (transition discipline: default)'
                : `${transitionType} (${transitionDurationMs}ms)`,
            features,
            audioFeatures,
        };
    });

    // ── Audio Decisions ──

    const audioClips = clips.filter((c: any) => c.type === 'audio');
    const musicTrack: AudioDecisionNode | undefined = audioClips.length > 0
        ? anode({
            label: 'Music Track',
            description: `${audioClips[0].filename || 'Imported audio'}`,
            value: { path: audioClips[0].path, filename: audioClips[0].filename },
        })
        : undefined;

    const sfxClips = clips.filter((c: any) => c.type === 'audio' && c.track && c.track > 0);
    const sfxPlacements: AudioDecisionNode[] = sfxClips.map((c: any, i: number) => anode({
        label: `SFX ${i + 1}`,
        description: `${c.filename || 'Sound effect'} at ${Math.round(c.startFrame / projectFps * 100) / 100}s`,
        source: 'generator-mode',
        value: { filename: c.filename, startSec: c.startFrame / projectFps },
    }));

    const audio: AudioDecisions = {
        musicTrack,
        sfxPlacements,
    };

    // ── Stats ──

    const totalDurationSec = clipDecisions.reduce((sum, c) => sum + c.durationSec, 0);
    const featureCount = clipDecisions.reduce((sum, c) => sum + c.features.length + c.audioFeatures.length, 0);

    return {
        generatedAt: Date.now(),
        version: 1,
        global,
        clips: clipDecisions,
        audio,
        stats: {
            totalClips: clipDecisions.length,
            totalDurationSec: Math.round(totalDurationSec * 100) / 100,
            featureCount,
            editorialScore: 1.0,
        },
    };
}
