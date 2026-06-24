// ══════════════════════════════════════════════════════════════════════════════
// social/socialStyles.ts — The 10 locked-in viral short-form styles.
//
// Each style is a small CONFIG + a pure `plan(input)` that returns a SocialPlan:
// a data description of how the edit is shaped (aspect, pacing, caption usage,
// transition palette, reframe usage, loop policy, plus any style-specific
// structure like a perfect-loop match or a split-attention two-region layout).
//
// Styles ride on the EGE `StyleRecipe` registry where one fits (extending an
// existing social-* recipe rather than duplicating it); styles that need
// social-only structure model it explicitly here. Nothing here calls React, IPC
// or FFmpeg — planners return DATA the generator/exporter consumes.
//
// PURE & deterministic given a seed. Unit-testable in isolation.
// ══════════════════════════════════════════════════════════════════════════════

import { DEFAULT_FPS, secondsToFrames } from '../time';
import { RECIPES, type StyleRecipe } from '../ege/styleRecipes';
import {
    ASPECT_PRESETS,
    planReframe,
    type AspectPresetId,
    type ReframeInput,
    type ReframePlan,
} from './autoReframe';
import {
    buildKineticCaptions,
    KINETIC_STYLES,
    type CaptionEvent,
    type KineticPresetId,
    type TimedWord,
} from './kineticCaptions';

// ── Identity ──────────────────────────────────────────────────────────────────

export type SocialStyleId =
    | 'hook-retention-payoff'
    | 'beatcut-montage'
    | 'auto-reframe-repurpose'
    | 'kinetic-quote'
    | 'list-topN'
    | 'transformation-reveal'
    | 'perfect-loop'
    | 'trend-template'
    | 'split-attention'
    | 'photo-motion';

// ── Shared sub-shapes the plan exposes ─────────────────────────────────────────

export interface PacingSpec {
    /** Clip-length envelope across the edit. */
    shape: 'accelerate' | 'decelerate' | 'wave' | 'steady' | 'pulse' | 'build-drop';
    /** [shortest, longest] clip duration in seconds. */
    clipSeconds: [number, number];
    /** True when cuts should land on detected beats. */
    beatSynced: boolean;
}

export interface CaptionSpec {
    enabled: boolean;
    /** Which kinetic preset to drive (when enabled). */
    preset: KineticPresetId | null;
    /** Caption emphasis granularity. */
    emphasis: 'word' | 'line' | 'phrase';
}

export interface TransitionSpec {
    /** Transition type ids from the app's TransitionType union (kept as strings
     *  to avoid a hard import cycle; the generator validates against the enum). */
    palette: string[];
    /** 0..1 share of boundaries carrying a transition (rest are hard cuts). */
    frequency: number;
    /** Whether A→B→A return legs are on-brand. */
    returns: boolean;
}

export interface ReframeSpec {
    enabled: boolean;
    /** Default reframe smoothing/tracking the style wants (fed to planReframe). */
    smoothing: number;
    trackingSpeed: number;
}

/** Loop behaviour. 'none' = plays once; 'soft' = trims to a clean musical bar;
 *  'perfect' = enforces a first/last frame match for a seamless boomerang loop. */
export interface LoopSpec {
    policy: 'none' | 'soft' | 'perfect';
    /** For 'perfect': how many frames to crossfade/match at the seam. */
    seamFrames: number;
}

/** A two-region split layout (split-attention "gameplay + talking-head" style). */
export interface SplitLayout {
    /** 'vertical-stack' = top/bottom; 'horizontal-split' = left/right. */
    orientation: 'vertical-stack' | 'horizontal-split';
    /** Fraction of the canvas the primary region occupies (0..1). */
    primaryFraction: number;
    regions: Array<{
        id: 'primary' | 'secondary';
        /** Normalized rect within the output canvas. */
        x: number; y: number; w: number; h: number;
        /** Reframe this region's source into its rect. */
        reframe: boolean;
    }>;
}

/** A photo Ken-Burns move (photo-motion style). Normalized zoom + pan. */
export interface PhotoMotionMove {
    zoomStart: number; // percentage, 100 = no zoom
    zoomEnd: number;
    zoomOrigin: 'center' | 'top' | 'bottom' | 'left' | 'right';
    panFrom: { x: number; y: number };
    panTo: { x: number; y: number };
}

// ── The plan ────────────────────────────────────────────────────────────────

export interface SocialPlan {
    styleId: SocialStyleId;
    label: string;
    aspect: AspectPresetId;
    aspectRatio: number;
    pacing: PacingSpec;
    captions: CaptionSpec;
    transitions: TransitionSpec;
    reframe: ReframeSpec;
    loop: LoopSpec;
    /** The EGE recipe this style rides on, when one applies. */
    recipe?: StyleRecipe;
    /** Per-section structural hints (a hook → retain → payoff arc, list items, …).
     *  Each section is a normalized [0..1] span of the timeline plus a role tag. */
    sections: Array<{ role: string; from: number; to: number; note?: string }>;
    /** Style-specific structure, present only when the style needs it. */
    split?: SplitLayout;
    photoMotion?: PhotoMotionMove;
    /** Concrete artifacts when the input provides the data for them. */
    captionEvents?: CaptionEvent[];
    reframePlan?: ReframePlan;
    /** A short human-readable description of the edit's behaviour. */
    behavior: string;
}

// ── Plan input ─────────────────────────────────────────────────────────────

export interface SocialPlanInput {
    /** Total timeline length in frames (drives section spans + loop seams). */
    totalFrames?: number;
    fps?: number;
    seed?: number | string;
    /** Word-level timing to bake kinetic captions from (optional). */
    words?: TimedWord[];
    /** Source dimensions + subject centers to bake a reframe plan from (optional). */
    reframeSource?: Pick<ReframeInput, 'sourceW' | 'sourceH' | 'subjectCentersByFrame' | 'detector' | 'frameRange'>;
    /** For list-topN: how many items the list enumerates. */
    listCount?: number;
}

// ── Style config + planners ────────────────────────────────────────────────

interface StyleConfig {
    id: SocialStyleId;
    label: string;
    aspect: AspectPresetId;
    pacing: PacingSpec;
    captions: CaptionSpec;
    transitions: TransitionSpec;
    reframe: ReframeSpec;
    loop: LoopSpec;
    /** Recipe id in the EGE registry this rides on, if any. */
    recipeId?: keyof typeof RECIPES;
    behavior: string;
    /** Optional builder for style-specific structure + section arc. */
    structure?: (cfg: StyleConfig, input: SocialPlanInput) => Partial<SocialPlan>;
}

const fps = (input: SocialPlanInput) => input.fps ?? DEFAULT_FPS;

/** Even N-way section split as normalized spans. */
function evenSections(roles: string[]): Array<{ role: string; from: number; to: number }> {
    const n = roles.length;
    return roles.map((role, i) => ({ role, from: i / n, to: (i + 1) / n }));
}

// Helper builders for style-specific structure ──────────────────────────────

function buildSplitLayout(): SplitLayout {
    return {
        orientation: 'vertical-stack',
        primaryFraction: 0.62,
        regions: [
            { id: 'primary', x: 0, y: 0, w: 1, h: 0.62, reframe: true },
            { id: 'secondary', x: 0, y: 0.62, w: 1, h: 0.38, reframe: true },
        ],
    };
}

function buildPhotoMotion(seedNum: number): PhotoMotionMove {
    // Deterministic Ken-Burns: alternate push-in / pull-back by seed parity.
    const pushIn = (seedNum & 1) === 0;
    return {
        zoomStart: pushIn ? 100 : 118,
        zoomEnd: pushIn ? 118 : 100,
        zoomOrigin: 'center',
        panFrom: { x: pushIn ? 0.45 : 0.55, y: 0.5 },
        panTo: { x: pushIn ? 0.55 : 0.45, y: 0.5 },
    };
}

function seedToNum(seed?: number | string): number {
    if (typeof seed === 'number') return seed >>> 0 || 1;
    const s = String(seed ?? '1');
    let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (Math.abs(h) >>> 0) || 1;
}

// ── The locked-in registry ────────────────────────────────────────────────────

const STYLES: Record<SocialStyleId, StyleConfig> = {
    // 1. HOOK → RETENTION → PAYOFF — front-load a hook, sustain curiosity, pay off.
    'hook-retention-payoff': {
        id: 'hook-retention-payoff', label: 'Hook · Retention · Payoff',
        aspect: '9:16',
        pacing: { shape: 'accelerate', clipSeconds: [0.3, 1.2], beatSynced: true },
        captions: { enabled: true, preset: 'bold-pop', emphasis: 'word' },
        transitions: { palette: ['flash', 'zoom-through', 'whip', 'rgb-split'], frequency: 0.45, returns: false },
        reframe: { enabled: true, smoothing: 0.85, trackingSpeed: 0.02 },
        loop: { policy: 'none', seamFrames: 0 },
        recipeId: 'social-hook',
        behavior: 'Front-loads a 0–3s hook, holds an open loop through the middle, resolves on a payoff beat.',
        structure: () => ({
            sections: [
                { role: 'hook', from: 0, to: 0.15, note: 'punchiest clip + biggest caption first' },
                { role: 'retention', from: 0.15, to: 0.8, note: 'open loop / rising stakes' },
                { role: 'payoff', from: 0.8, to: 1, note: 'resolve the promise' },
            ],
        }),
    },

    // 2. BEATCUT MONTAGE — relentless beat-locked vertical cuts.
    'beatcut-montage': {
        id: 'beatcut-montage', label: 'Beat-Cut Montage',
        aspect: '9:16',
        pacing: { shape: 'pulse', clipSeconds: [0.15, 0.6], beatSynced: true },
        captions: { enabled: true, preset: 'tiktok-caption', emphasis: 'word' },
        transitions: { palette: ['flash', 'glitch', 'rgb-split', 'zoom-through'], frequency: 0.55, returns: true },
        reframe: { enabled: true, smoothing: 0.8, trackingSpeed: 0.03 },
        loop: { policy: 'soft', seamFrames: 0 },
        recipeId: 'social-beatcut',
        behavior: 'Cuts every beat/half-beat with flash+glitch transitions; relentless energy, soft musical-bar loop.',
        structure: () => ({ sections: evenSections(['intro', 'build', 'drop', 'outro']) }),
    },

    // 3. AUTO-REFRAME REPURPOSE — turn wide footage vertical, subject-tracked.
    'auto-reframe-repurpose': {
        id: 'auto-reframe-repurpose', label: 'Auto-Reframe Repurpose',
        aspect: '9:16',
        pacing: { shape: 'steady', clipSeconds: [0.8, 2.5], beatSynced: false },
        captions: { enabled: true, preset: 'clean-underline', emphasis: 'line' },
        transitions: { palette: ['fade', 'dissolve', 'smoothup', 'smoothdown'], frequency: 0.3, returns: false },
        reframe: { enabled: true, smoothing: 0.9, trackingSpeed: 0.015 },
        loop: { policy: 'none', seamFrames: 0 },
        recipeId: 'social-reframe',
        behavior: 'Repurposes 16:9 footage to 9:16 with smoothed subject tracking; gentle cuts, clean captions.',
        structure: () => ({ sections: evenSections(['open', 'body', 'close']) }),
    },

    // 4. KINETIC QUOTE — one big quote, word-by-word, minimal cuts.
    'kinetic-quote': {
        id: 'kinetic-quote', label: 'Kinetic Quote',
        aspect: '4:5',
        pacing: { shape: 'decelerate', clipSeconds: [2.0, 5.0], beatSynced: false },
        captions: { enabled: true, preset: 'bold-pop', emphasis: 'phrase' },
        transitions: { palette: ['fade', 'dissolve'], frequency: 0.15, returns: false },
        reframe: { enabled: false, smoothing: 0.9, trackingSpeed: 0.012 },
        loop: { policy: 'none', seamFrames: 0 },
        recipeId: 'social-quote',
        behavior: 'A single quote animates word-by-word over slow B-roll; moody, minimal cuts, centered text.',
        structure: () => ({ sections: evenSections(['setup', 'quote', 'rest']) }),
    },

    // 5. LIST / TOP-N — enumerated beats with snappy lower-thirds.
    'list-topN': {
        id: 'list-topN', label: 'List · Top-N',
        aspect: '9:16',
        pacing: { shape: 'steady', clipSeconds: [0.7, 2.0], beatSynced: true },
        captions: { enabled: true, preset: 'highlight-box', emphasis: 'line' },
        transitions: { palette: ['slideup', 'slidedown', 'wipeleft', 'flash'], frequency: 0.4, returns: false },
        reframe: { enabled: true, smoothing: 0.85, trackingSpeed: 0.02 },
        loop: { policy: 'none', seamFrames: 0 },
        recipeId: 'social-list',
        behavior: 'Enumerates N items with numbered slide-in lower-thirds; one item per section, snappy reveals.',
        structure: (_cfg, input) => {
            const n = Math.max(1, input.listCount ?? 5);
            const sections: SocialPlan['sections'] = [{ role: 'intro', from: 0, to: 0.12 }];
            const span = 0.88 / n;
            for (let i = 0; i < n; i++) {
                sections.push({ role: `item-${i + 1}`, from: 0.12 + i * span, to: 0.12 + (i + 1) * span, note: `#${n - i}` });
            }
            return { sections };
        },
    },

    // 6. TRANSFORMATION REVEAL — before → process → after.
    'transformation-reveal': {
        id: 'transformation-reveal', label: 'Transformation Reveal',
        aspect: '9:16',
        pacing: { shape: 'build-drop', clipSeconds: [0.4, 2.0], beatSynced: true },
        captions: { enabled: true, preset: 'bold-pop', emphasis: 'word' },
        transitions: { palette: ['whip', 'zoom-through', 'flash', 'match-cut'], frequency: 0.5, returns: false },
        reframe: { enabled: true, smoothing: 0.85, trackingSpeed: 0.025 },
        loop: { policy: 'none', seamFrames: 0 },
        recipeId: 'social-hook',
        behavior: 'Before → fast process montage → big after reveal on a drop; whip/match-cut at the reveal seam.',
        structure: () => ({
            sections: [
                { role: 'before', from: 0, to: 0.18, note: 'the starting state' },
                { role: 'process', from: 0.18, to: 0.72, note: 'sped-up montage' },
                { role: 'reveal', from: 0.72, to: 1, note: 'the after — land on a beat' },
            ],
        }),
    },

    // 7. PERFECT LOOP — first frame == last frame, seamless boomerang.
    'perfect-loop': {
        id: 'perfect-loop', label: 'Perfect Loop',
        aspect: '9:16',
        pacing: { shape: 'wave', clipSeconds: [0.5, 1.5], beatSynced: true },
        captions: { enabled: false, preset: null, emphasis: 'word' },
        transitions: { palette: ['seamless', 'match-cut', 'dissolve'], frequency: 0.25, returns: false },
        reframe: { enabled: true, smoothing: 0.9, trackingSpeed: 0.015 },
        loop: { policy: 'perfect', seamFrames: 8 },
        recipeId: 'social-beatcut',
        behavior: 'Engineers the last frames to match the first for a seamless infinite loop; seam crossfade at the wrap.',
        structure: (cfg, input) => {
            const total = input.totalFrames ?? secondsToFrames(8, fps(input));
            const seam = cfg.loop.seamFrames;
            return {
                sections: [
                    { role: 'loop-body', from: 0, to: 1 },
                ],
                // Explicit seam metadata the exporter uses to match endpoints.
                behavior: `${cfg.behavior} Match window: first ${seam}f ↔ last ${seam}f of ${total}f.`,
            };
        },
    },

    // 8. TREND TEMPLATE — drop clips into a fixed beat/caption template.
    'trend-template': {
        id: 'trend-template', label: 'Trend Template',
        aspect: '9:16',
        pacing: { shape: 'pulse', clipSeconds: [0.3, 1.0], beatSynced: true },
        captions: { enabled: true, preset: 'tiktok-caption', emphasis: 'word' },
        transitions: { palette: ['flash', 'zoom-through', 'whip'], frequency: 0.5, returns: true },
        reframe: { enabled: true, smoothing: 0.85, trackingSpeed: 0.022 },
        loop: { policy: 'soft', seamFrames: 0 },
        recipeId: 'social-beatcut',
        behavior: 'Drops user clips into a fixed, pre-timed beat+caption template (a reusable trend skeleton).',
        structure: (_cfg, input) => {
            // A template defines fixed beat slots; default to 8 evenly-timed slots.
            const slots = 8;
            return { sections: evenSections(Array.from({ length: slots }, (_, i) => `slot-${i + 1}`)) };
        },
    },

    // 9. SPLIT ATTENTION — two-region layout (e.g. gameplay + talking head).
    'split-attention': {
        id: 'split-attention', label: 'Split Attention',
        aspect: '9:16',
        pacing: { shape: 'steady', clipSeconds: [1.0, 3.0], beatSynced: false },
        captions: { enabled: true, preset: 'clean-underline', emphasis: 'line' },
        transitions: { palette: ['fade', 'dissolve'], frequency: 0.15, returns: false },
        reframe: { enabled: true, smoothing: 0.88, trackingSpeed: 0.018 },
        loop: { policy: 'none', seamFrames: 0 },
        recipeId: 'social-reframe',
        behavior: 'Stacks two reframed regions (primary 62% / secondary 38%) — retention-bait split layout.',
        structure: () => ({ split: buildSplitLayout(), sections: evenSections(['open', 'body', 'close']) }),
    },

    // 10. PHOTO MOTION — Ken-Burns life over stills.
    'photo-motion': {
        id: 'photo-motion', label: 'Photo Motion',
        aspect: '9:16',
        pacing: { shape: 'steady', clipSeconds: [1.5, 3.5], beatSynced: false },
        captions: { enabled: true, preset: 'clean-underline', emphasis: 'line' },
        transitions: { palette: ['dissolve', 'fade', 'smoothleft', 'smoothright'], frequency: 0.35, returns: false },
        reframe: { enabled: false, smoothing: 0.9, trackingSpeed: 0.01 },
        loop: { policy: 'none', seamFrames: 0 },
        recipeId: 'social-reframe',
        behavior: 'Adds Ken-Burns zoom/pan motion to still photos; alternating push-in / pull-back per clip.',
        structure: (_cfg, input) => ({
            photoMotion: buildPhotoMotion(seedToNum(input.seed)),
            sections: evenSections(['photo-1', 'photo-2', 'photo-3']),
        }),
    },
};

/** Stable ordered list of every social style id. */
export const SOCIAL_STYLE_IDS = Object.keys(STYLES) as SocialStyleId[];

export function getSocialStyleConfig(id: SocialStyleId): StyleConfig {
    const cfg = STYLES[id];
    if (!cfg) throw new Error(`[socialStyles] Unknown style: ${String(id)}`);
    return cfg;
}

// ── The planner ────────────────────────────────────────────────────────────

/**
 * Resolve a social style into a concrete SocialPlan for the given input. Bakes a
 * caption track when `words` are supplied and a reframe plan when `reframeSource`
 * is supplied (and the style uses reframing). Always returns the style's section
 * arc and any style-specific structure (split layout, photo motion, loop seam).
 */
export function planSocialStyle(id: SocialStyleId, input: SocialPlanInput = {}): SocialPlan {
    const cfg = getSocialStyleConfig(id);
    const recipe = cfg.recipeId ? RECIPES[cfg.recipeId] : undefined;
    const aspectRatio = ASPECT_PRESETS[cfg.aspect].ratio;

    const plan: SocialPlan = {
        styleId: cfg.id,
        label: cfg.label,
        aspect: cfg.aspect,
        aspectRatio,
        pacing: cfg.pacing,
        captions: cfg.captions,
        transitions: cfg.transitions,
        reframe: cfg.reframe,
        loop: cfg.loop,
        recipe,
        sections: [{ role: 'body', from: 0, to: 1 }],
        behavior: cfg.behavior,
    };

    // Style-specific structure overrides defaults (sections, split, photoMotion).
    if (cfg.structure) Object.assign(plan, cfg.structure(cfg, input));

    // Bake captions when words are provided and the style uses them.
    if (cfg.captions.enabled && cfg.captions.preset && input.words?.length) {
        plan.captionEvents = buildKineticCaptions(
            input.words,
            KINETIC_STYLES[cfg.captions.preset],
            { fps: input.fps },
        );
    }

    // Bake a reframe plan when source + centers are provided and the style reframes.
    if (cfg.reframe.enabled && input.reframeSource) {
        plan.reframePlan = planReframe({
            sourceW: input.reframeSource.sourceW,
            sourceH: input.reframeSource.sourceH,
            targetAspect: cfg.aspect,
            subjectCentersByFrame: input.reframeSource.subjectCentersByFrame,
            detector: input.reframeSource.detector,
            frameRange: input.reframeSource.frameRange,
            smoothing: cfg.reframe.smoothing,
            trackingSpeed: cfg.reframe.trackingSpeed,
            fps: input.fps,
        });
    }

    return plan;
}

/** Plan every locked-in style at once (handy for galleries / smoke tests). */
export function planAllSocialStyles(input: SocialPlanInput = {}): Record<SocialStyleId, SocialPlan> {
    const out = {} as Record<SocialStyleId, SocialPlan>;
    for (const id of SOCIAL_STYLE_IDS) out[id] = planSocialStyle(id, input);
    return out;
}
