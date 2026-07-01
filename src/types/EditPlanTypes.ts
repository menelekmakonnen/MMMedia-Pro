/**
 * EditPlanTypes.ts — Comprehensive Edit Plan decision tree types.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The Edit Plan is a structured tree of decisions that explains WHY and HOW
 * every feature is applied in the current edit. It's the foundation for
 * future AI management — an AI can read, modify, and regenerate from this plan.
 *
 * Three layers:
 *   1. Global decisions — mode, baked-in editorial rules, creator hacks
 *   2. Per-clip decisions — every feature applied to each clip
 *   3. Audio decisions — music, SFX, beat sync, ducking
 */

// ─── Decision source ─────────────────────────────────────────────────────────

/** Where this decision came from. */
export type DecisionSource =
    | 'editorial-rule'    // Baked-in from editorialRules.ts (pacing, 30° rule, etc.)
    | 'generator-mode'    // From the active Generator Mode + its look/toggles
    | 'creator-hack'      // From the Creator Hacks panel
    | 'user-manual'       // User explicitly changed this in the timeline/inspector
    | 'baked-in'          // Always-on default (e.g. hard limiter, sift takes)
    | 'preset'            // From an NLE Quick Preset
    | 'style-recipe';     // From a style recipe (social media, etc.)

// ─── Base node ───────────────────────────────────────────────────────────────

export interface EditPlanNode {
    /** Unique identifier for this decision node. */
    nodeId: string;
    /** Feature area this decision belongs to. */
    category: 'visual' | 'audio' | 'motion' | 'timing' | 'editorial' | 'composition' | 'global';
    /** Human-readable label. */
    label: string;
    /** Detailed description of what was decided and why. */
    description: string;
    /** Where this decision came from. */
    source: DecisionSource;
    /** Whether the user can change this decision and re-generate. */
    adjustable: boolean;
    /** Current value (serializable). */
    value: unknown;
    /** Feature ID from the featureManifest. */
    featureId?: string;
}

// ─── Global decisions ────────────────────────────────────────────────────────

export interface GlobalDecisionNode extends EditPlanNode {
    category: 'global' | 'editorial';
}

export interface GlobalDecisions {
    /** Active generator mode ID + name. */
    generatorMode: GlobalDecisionNode;
    /** Pacing strategy from editorial rules (baked-in). */
    pacingStrategy: GlobalDecisionNode;
    /** Transition discipline rule (baked-in). */
    transitionDiscipline: GlobalDecisionNode;
    /** Eye trace reframe rule (baked-in). */
    eyeTrace: GlobalDecisionNode;
    /** Sift takes rule (baked-in). */
    siftTakes: GlobalDecisionNode;
    /** Active creator hacks with their settings. */
    creatorHacks: GlobalDecisionNode[];
    /** Editorial quality scores. */
    editorialScore: GlobalDecisionNode;
}

// ─── Per-clip decisions ──────────────────────────────────────────────────────

export interface ClipFeatureNode {
    /** Feature ID from the manifest. */
    featureId: string;
    /** Human-readable label. */
    label: string;
    /** Current parameter values. */
    params: Record<string, unknown>;
    /** Where this was applied from. */
    source: DecisionSource;
    /** Whether this can be adjusted. */
    adjustable: boolean;
}

export interface ClipDecisionNode {
    /** Matches Clip.id */
    clipId: string;
    /** Display filename */
    filename: string;
    /** Full source path for thumbnail */
    sourcePath: string;
    /** Reorderable position (0-based) */
    order: number;
    /** Why this clip was selected for this position */
    selectionReason: string;

    // ── Timing ──
    /** Duration in seconds */
    durationSec: number;
    /** [trimStart, trimEnd] in source seconds */
    trimRange: [number, number];
    /** Playback speed */
    speed: number;
    /** Speed curve preset if any */
    speedCurve?: string;

    // ── Transition ──
    /** Transition to NEXT clip */
    transitionType: string | null;
    /** Transition duration in ms */
    transitionDurationMs: number;
    /** Transition reasoning (from discipline rule) */
    transitionReason?: string;

    // ── Applied features ──
    /** All features applied to this clip, with params and source */
    features: ClipFeatureNode[];

    // ── Audio ──
    /** Audio effects on this clip */
    audioFeatures: ClipFeatureNode[];
}

// ─── Audio decisions ─────────────────────────────────────────────────────────

export interface AudioDecisionNode extends EditPlanNode {
    category: 'audio';
}

export interface AudioDecisions {
    /** Music track info */
    musicTrack?: AudioDecisionNode;
    /** Beat sync strategy */
    beatSync?: AudioDecisionNode;
    /** SFX placement decisions */
    sfxPlacements: AudioDecisionNode[];
    /** Audio ducking settings */
    ducking?: AudioDecisionNode;
}

// ─── Full Edit Plan ──────────────────────────────────────────────────────────

export interface EditPlan {
    /** Timestamp when this plan was generated */
    generatedAt: number;
    /** Plan version for migrations */
    version: 1;

    /** Global / mode-level decisions */
    global: GlobalDecisions;
    /** Per-clip decision nodes (reorderable) */
    clips: ClipDecisionNode[];
    /** Audio-layer decisions */
    audio: AudioDecisions;

    /** Summary stats */
    stats: {
        totalClips: number;
        totalDurationSec: number;
        featureCount: number;
        editorialScore: number;
    };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a unique node ID */
export function makeNodeId(prefix: string, index?: number): string {
    return `${prefix}${index !== undefined ? `-${index}` : ''}-${Date.now().toString(36)}`;
}
