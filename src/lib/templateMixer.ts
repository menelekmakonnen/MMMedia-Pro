import { EditingTemplate, TemplateId, TEMPLATES } from './editingModes';
import { RhythmPatternId } from './rhythmPatterns';
import type { TransitionType, TransitionStyle, BoomerangPresetId, EffectApplyPolicy } from '../types';

export interface MixedTemplate {
    sourceTemplates: TemplateId[];
    minClip: number;
    maxClip: number;
    minCPM: number;
    maxCPM: number;
    beatDivisor: number;
    beatOffset: number;
    speedRange: [number, number];
    useSpeedRamps: boolean;
    zoomRange: [number, number];
    cameraMotionIntensity: number;
    defaultRhythmPattern: RhythmPatternId;
    allowDuplicates: boolean;
    burstOnDrops: boolean;
    reverseOnHits: boolean;
    // Transition
    transitionStyle: TransitionStyle;
    transitionTypes: TransitionType[];
    transitionDurationMs: number;
    // Boomerang
    boomerangFrequency: number;
    boomerangPresets: BoomerangPresetId[];
    // PIP
    pipPolicy: EffectApplyPolicy;
}

/**
 * Mix 1-3 templates into a single composite template.
 * Uses weighted averaging for numeric values, OR for booleans,
 * and picks the first template's rhythm pattern as default.
 */
export function mixTemplates(templateIds: TemplateId[], weights?: number[]): MixedTemplate {
    if (templateIds.length === 0) templateIds = ['pulse'];
    
    const templates = templateIds.map(id => TEMPLATES[id]).filter(Boolean);
    if (templates.length === 0) return mixTemplates(['pulse']);
    
    // Normalize weights
    const w = weights && weights.length === templates.length
        ? weights.map(v => v / weights.reduce((a, b) => a + b, 0))
        : templates.map(() => 1 / templates.length);
    
    const wavg = (fn: (t: EditingTemplate) => number) =>
        templates.reduce((sum, t, i) => sum + fn(t) * w[i], 0);
    
    const wmin = (fn: (t: EditingTemplate) => number) =>
        Math.min(...templates.map(fn));
    
    const wmax = (fn: (t: EditingTemplate) => number) =>
        Math.max(...templates.map(fn));
    
    const boolOr = (fn: (t: EditingTemplate) => boolean) =>
        templates.some(fn);
    
    return {
        sourceTemplates: templateIds,
        // For clip ranges, use weighted average but expand range
        minClip: wmin(t => t.minClip),
        maxClip: wmax(t => t.maxClip),
        // CPM: weighted average
        minCPM: wavg(t => t.minCPM),
        maxCPM: wavg(t => t.maxCPM),
        // Beat: use the smallest divisor (most responsive)
        beatDivisor: Math.round(wmin(t => t.beatDivisor)),
        beatOffset: Math.round(wavg(t => t.beatOffset)),
        // Speed: expand range from all templates
        speedRange: [wmin(t => t.speedRange[0]), wmax(t => t.speedRange[1])],
        useSpeedRamps: boolOr(t => t.useSpeedRamps),
        // Camera: expand range, average intensity
        zoomRange: [wmin(t => t.zoomRange[0]), wmax(t => t.zoomRange[1])],
        cameraMotionIntensity: wavg(t => t.cameraMotionIntensity),
        // Rhythm: first template wins
        defaultRhythmPattern: templates[0].defaultRhythmPattern,
        // Booleans: OR (if any template wants it, enable)
        allowDuplicates: boolOr(t => t.allowDuplicates),
        burstOnDrops: boolOr(t => t.burstOnDrops),
        reverseOnHits: boolOr(t => t.reverseOnHits),
        // Transition: first template's style wins, union all transition types
        transitionStyle: templates[0].transitionStyle,
        transitionTypes: [...new Set(templates.flatMap(t => t.transitionTypes))] as TransitionType[],
        transitionDurationMs: Math.round(wavg(t => t.transitionDurationMs)),
        // Boomerang: max frequency, union presets
        boomerangFrequency: Math.round(wmax(t => t.boomerangFrequency)),
        boomerangPresets: [...new Set(templates.flatMap(t => t.boomerangPresets))] as BoomerangPresetId[],
        // PIP: most aggressive policy wins (every-clip > per-beat > sparingly > off)
        pipPolicy: (['every-clip', 'per-beat', 'sparingly', 'off'] as EffectApplyPolicy[]).find(
            p => templates.some(t => t.pipPolicy === p)
        ) || 'off',
    };
}

/**
 * Convert a MixedTemplate to TrailerSettings overrides.
 * These get merged into the generation settings.
 */
export function templateToSettings(mixed: MixedTemplate): Record<string, any> {
    return {
        shortestClip: mixed.minClip,
        longestClip: mixed.maxClip,
        allowDuplicates: mixed.allowDuplicates,
        rhythmPattern: mixed.defaultRhythmPattern,
        beatOffset: mixed.beatOffset,
        // These are new fields the engine will read:
        templateSpeedRange: mixed.speedRange,
        templateUseSpeedRamps: mixed.useSpeedRamps,
        templateZoomRange: mixed.zoomRange,
        templateCameraMotion: mixed.cameraMotionIntensity,
        templateBurstOnDrops: mixed.burstOnDrops,
        templateReverseOnHits: mixed.reverseOnHits,
        templateBeatDivisor: mixed.beatDivisor,
        // Transition preferences from template
        transitionStyle: mixed.transitionStyle,
        transitionTypes: mixed.transitionTypes,
        transitionDurationMs: mixed.transitionDurationMs,
        // Boomerang preferences from template
        templateBoomerangFrequency: mixed.boomerangFrequency,
        templateBoomerangPresets: mixed.boomerangPresets,
        // PIP from template
        pipPolicy: mixed.pipPolicy,
    };
}
