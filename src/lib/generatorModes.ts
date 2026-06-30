/**
 * Generator Modes — editing-style templates reverse-engineered from real edits.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Each mode captures a repeatable *look + pacing + transition recipe + SFX intent*
 * derived from the Premiere projects in `MMMedia Pro/edit/` (see
 * `MMMedia Pro/Generator Modes/`). A mode is the source of truth that powers:
 *
 *   • the Edit Generator "Generator Modes" picker (EditGeneratorHome), and
 *   • the Sequence page "Modes" panel (SequenceViewTab left panel).
 *
 * Both surfaces let the user flip the per-mode `toggles` (rendered as UI
 * switches) and hit Apply — `applyGeneratorMode()` then transforms the live
 * timeline (one undo step) and, when the SFX toggle is on, auto-places sound
 * effects from the SFX Engine onto the SFX track.
 *
 * Design principle — FITTING TRANSITIONS OVER HARD CUTS. Every mode declares a
 * default transition and a library; hard cuts are never the default.
 *
 * Everything a `look` writes maps onto fields that already exist on the Clip
 * model and that the preview/export pipelines understand, so applying a mode is
 * non-destructive and fully reversible.
 */

import type { TransitionType, SpeedCurvePreset } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

export type GeneratorModeFamily =
    | 'Interview'
    | 'Explainer'
    | 'Intro'
    | 'Music'
    | 'Social'
    | 'Instructional'
    | 'Promo';

export type ModeAspect = '16:9' | '9:16' | '4:3' | '1:1';

/** A user-flippable switch exposed in the UI for a mode. */
export interface ModeToggle {
    id: string;
    label: string;
    description: string;
    /** Default on/off state. */
    default: boolean;
    /** Lucide icon name (resolved in the UI). */
    icon?: string;
}

/**
 * Where a sound-effect cue is placed when SFX is enabled for a mode.
 *   • 'transition' — one hit on every clip that has a transition to the next
 *   • 'impact'     — a hit on the first frame of every clip (beat/cut accents)
 *   • 'ambience'   — one long bed under the whole sequence
 *   • 'whoosh'     — movement swoosh on reframes / whip transitions
 */
export type SfxPlacement = 'transition' | 'impact' | 'ambience' | 'whoosh';

export interface ModeSfxCue {
    placement: SfxPlacement;
    /** SFX Engine category id (see sfxCategories.ts). */
    categoryId: string;
    /** Optional subcategory id to narrow the pick. */
    subcategoryId?: string;
    /** Gain 0–100 applied to placed SFX clips. */
    volume: number;
    /** Which toggle id gates this cue. When the toggle is off the cue is skipped.
     *  Defaults to the mode-wide 'sfx' toggle. */
    gatedBy?: string;
}

/**
 * Declarative description of the per-clip look a mode stamps onto the timeline.
 * The apply engine reads these and writes the matching Clip fields. Each field
 * may be gated by a toggle id via `*_gatedBy`.
 */
export interface ModeLook {
    /** Default transition stamped between video clips. */
    transition?: { type: TransitionType; durationFrames: number; gatedBy?: string };
    /** Subtle push-in (zoomStart → zoomEnd, %). */
    punchIn?: { start: number; end: number; gatedBy?: string };
    /** Color-grade preset id from colorGradingPresets.ts. */
    colorPreset?: { id: string; gatedBy?: string };
    /** 2.39:1 cinematic letterbox. */
    letterbox?: { gatedBy?: string };
    /** Film grain strength 0–25 + vignette 0–100. */
    filmTexture?: { grain: number; vignette: number; gatedBy?: string };
    /** Speed-curve preset (slow-fast-slow etc.). */
    speedCurve?: { preset: SpeedCurvePreset; gatedBy?: string };
    /** Stabilize handheld footage. */
    stabilize?: { smoothing: number; gatedBy?: string };
    /** Shutter-style motion blur. */
    motionBlur?: { gatedBy?: string };
    /** Chromatic / RGB split px. */
    rgbSplit?: { amount: number; gatedBy?: string };
    /** Global transition strategy set on the clip store (drives program-monitor blend). */
    transitionStrategy?: string;
}

export interface GeneratorMode {
    id: string;
    name: string;
    family: GeneratorModeFamily;
    /** Source edits this mode was derived from. */
    derivedFrom: string[];
    summary: string;
    bestFor: string;
    /** Lucide icon name for the picker. */
    icon: string;
    /** Tailwind text-color accent. */
    accent: string;

    canvas: { resolution: string; aspect: ModeAspect; fps: number };
    pacing: {
        /** [min, max] cuts per minute. Omitted for intro stings. */
        cutsPerMin?: [number, number];
        logic: string;
    };
    /** Human-readable transition philosophy + library (shown in the UI). */
    transitions: { default: string; library: string[]; notes: string };
    /** Effects observed in the source edits (informational, shown in detail view). */
    effectStack: string[];

    /** The actual timeline transformation the engine applies. */
    look: ModeLook;
    /** SFX cues placed when the relevant toggle is on. */
    sfxCues: ModeSfxCue[];
    /** UI switches. The 'sfx' toggle (added automatically below) gates SFX. */
    toggles: ModeToggle[];
}

// ─── Shared toggles ──────────────────────────────────────────────────────────

const SFX_TOGGLE: ModeToggle = {
    id: 'sfx',
    label: 'SFX Engine',
    description: 'Auto-place sound effects (whooshes, impacts, ambience) from your SFX library on the SFX track.',
    default: true,
    icon: 'AudioLines',
};

/** Append the shared SFX toggle to every mode so it is always last. */
function withSfx(toggles: ModeToggle[]): ModeToggle[] {
    return [...toggles, SFX_TOGGLE];
}

// ─── Mode registry ───────────────────────────────────────────────────────────

export const GENERATOR_MODES: GeneratorMode[] = [
    // ── Interview family ─────────────────────────────────────────────────────
    {
        id: 'interview_clean',
        name: 'Interview — Clean',
        family: 'Interview',
        derivedFrom: ['DANIEL NYANYO', 'BLESS', 'Benedicta Gavor', 'Derrick', 'FREDRICK AMPOFO'],
        summary: 'Single-subject seated interview. Silence-removal pacing kept invisible with soft seam transitions and motion-keyframe punch-ins so the conversation reads continuous.',
        bestFor: 'Long-form single-person interviews, founder/expert Q&A, podcast video.',
        icon: 'Mic',
        accent: 'text-sky-400',
        canvas: { resolution: '1920x1080', aspect: '16:9', fps: 30 },
        pacing: { cutsPerMin: [8, 18], logic: 'silence_removal' },
        transitions: {
            default: 'Seamless soft cut (short dissolve)',
            library: ['seamless soft cut', 'reframe-covered cut', 'film dissolve on topic change'],
            notes: 'Every silence-removal seam is covered by a reframe or a 2–4f dissolve; never a bare hard cut.',
        },
        effectStack: ['AE.ADBE Motion (reframe / punch-in)'],
        look: {
            transition: { type: 'dissolve', durationFrames: 6 },
            transitionStrategy: 'dissolve',
            punchIn: { start: 100, end: 118, gatedBy: 'punch_in' },
            colorPreset: { id: 'doc-natural', gatedBy: 'light_grade' },
        },
        sfxCues: [
            { placement: 'transition', categoryId: 'transitions', subcategoryId: 'swoosh', volume: 35 },
        ],
        toggles: withSfx([
            { id: 'punch_in', label: 'Punch-in reframe', description: 'Alternate wide / push-in across cuts to disguise jump points.', default: true, icon: 'ZoomIn' },
            { id: 'light_grade', label: 'Light grade', description: 'Natural corrective color for consistent skin tones.', default: true, icon: 'Palette' },
            { id: 'broll_inserts', label: 'B-roll inserts', description: 'Allow topic B-roll to cover cuts (reserved for generation).', default: false, icon: 'Film' },
            { id: 'lower_thirds', label: 'Lower thirds', description: 'Name + role on first appearance.', default: true, icon: 'Type' },
        ]),
    },
    {
        id: 'interview_dual_subject',
        name: 'Interview — Dual Subject',
        family: 'Interview',
        derivedFrom: ['AZASI AND DERRICK', 'AZASI AND DERRICK final'],
        summary: 'Two-person conversation cut at a high tempo, bouncing between speakers with reframes so a single or dual source reads as a multi-cam shoot.',
        bestFor: 'Two-guest interviews, host + guest, debate/dialogue.',
        icon: 'Users',
        accent: 'text-sky-400',
        canvas: { resolution: '1920x1080', aspect: '16:9', fps: 30 },
        pacing: { cutsPerMin: [25, 35], logic: 'speaker_change + silence_removal' },
        transitions: {
            default: 'Reframe-covered cut',
            library: ['reframe-covered cut', 'seamless soft cut', 'short dissolve on topic change'],
            notes: 'Speaker switches are covered by the framing change; soften jarring motion with a 2–3f dissolve.',
        },
        effectStack: ['AE.ADBE Motion (isolate speaker / reaction reframe)'],
        look: {
            transition: { type: 'seamless', durationFrames: 4 },
            transitionStrategy: 'dissolve',
            punchIn: { start: 100, end: 132, gatedBy: 'speaker_isolate' },
            colorPreset: { id: 'doc-natural', gatedBy: 'match_grade' },
        },
        sfxCues: [
            { placement: 'whoosh', categoryId: 'transitions', subcategoryId: 'swoosh', volume: 30 },
        ],
        toggles: withSfx([
            { id: 'speaker_isolate', label: 'Speaker isolate', description: 'Crop/scale to single each speaker from a wide.', default: true, icon: 'Crop' },
            { id: 'reaction_shots', label: 'Reaction shots', description: 'Cut to the listener on emphatic lines (generation).', default: true, icon: 'Eye' },
            { id: 'match_grade', label: 'Match grade', description: 'Shot-match both subjects to one look.', default: true, icon: 'Palette' },
            { id: 'lower_thirds', label: 'Lower thirds', description: 'Name + role for each speaker.', default: true, icon: 'Type' },
        ]),
    },
    {
        id: 'interview_captioned',
        name: 'Interview — Captioned',
        family: 'Interview',
        derivedFrom: ['FREDRICK SRT FILE', 'FREDRICK AMPOFO'],
        summary: 'Clean interview with burned-in, styled captions for silent-autoplay feeds while staying a polished talking-head edit.',
        bestFor: 'Social-distributed interview clips, accessibility-first uploads.',
        icon: 'Captions',
        accent: 'text-sky-400',
        canvas: { resolution: '1920x1080', aspect: '16:9', fps: 30 },
        pacing: { cutsPerMin: [12, 20], logic: 'silence_removal' },
        transitions: {
            default: 'Seamless soft cut',
            library: ['seamless soft cut', 'reframe-covered cut', 'short dissolve on topic change'],
            notes: 'Keep transitions subtle so captions stay readable; no flashy wipes over text.',
        },
        effectStack: ['AE.ADBE Motion (reframe)', 'Captions (SRT-driven, styled)'],
        look: {
            transition: { type: 'seamless', durationFrames: 5 },
            transitionStrategy: 'dissolve',
            punchIn: { start: 100, end: 115, gatedBy: 'punch_in' },
            colorPreset: { id: 'doc-natural', gatedBy: 'light_grade' },
        },
        sfxCues: [
            { placement: 'transition', categoryId: 'transitions', subcategoryId: 'swoosh', volume: 30 },
        ],
        toggles: withSfx([
            { id: 'captions', label: 'Burned-in captions', description: 'Styled SRT captions in the safe area (required look).', default: true, icon: 'Captions' },
            { id: 'word_highlight', label: 'Word highlight', description: 'Highlight the active word as it is spoken.', default: false, icon: 'Highlighter' },
            { id: 'punch_in', label: 'Punch-in reframe', description: 'Push-ins on key phrases.', default: true, icon: 'ZoomIn' },
            { id: 'light_grade', label: 'Light grade', description: 'Natural corrective color.', default: true, icon: 'Palette' },
        ]),
    },
    {
        id: 'interview_blur_reveal',
        name: 'Interview — Blur Reveal',
        family: 'Interview',
        derivedFrom: ['OWUSUAA INTERVIEW NEW'],
        summary: 'Interview with masked background defocus and reveal framing — blur the surroundings to isolate the subject, then rack focus for emphasis.',
        bestFor: 'Stylized portrait interviews, emotional or premium tone.',
        icon: 'Aperture',
        accent: 'text-sky-400',
        canvas: { resolution: '1920x1080', aspect: '16:9', fps: 30 },
        pacing: { cutsPerMin: [10, 18], logic: 'silence_removal' },
        transitions: {
            default: 'Focus-pull (blur) transition',
            library: ['focus-pull blur', 'soft dissolve', 'reframe-covered cut'],
            notes: 'Use the blur itself as the transition between beats; dissolve on topic changes.',
        },
        effectStack: ['AE.ADBE AEMask', 'AE.ADBE Gaussian Blur 2', 'AE.ADBE Opacity', 'AE.ADBE Motion'],
        look: {
            transition: { type: 'hblur', durationFrames: 10 },
            transitionStrategy: 'dissolve',
            punchIn: { start: 100, end: 116, gatedBy: 'punch_in' },
            colorPreset: { id: 'cin-moonlight', gatedBy: 'cinematic_grade' },
            filmTexture: { grain: 4, vignette: 35, gatedBy: 'vignette' },
        },
        sfxCues: [
            { placement: 'transition', categoryId: 'cinematic', subcategoryId: 'drones', volume: 25 },
        ],
        toggles: withSfx([
            { id: 'focus_pull', label: 'Focus-pull transitions', description: 'Use background blur ramps as the transition.', default: true, icon: 'Aperture' },
            { id: 'vignette', label: 'Vignette', description: 'Subtle darkening + grain to draw the eye.', default: true, icon: 'Circle' },
            { id: 'cinematic_grade', label: 'Cinematic grade', description: 'Soft, lifted-black moonlit look.', default: true, icon: 'Palette' },
            { id: 'punch_in', label: 'Punch-in reframe', description: 'Push-ins paired with focus shifts.', default: false, icon: 'ZoomIn' },
        ]),
    },
    {
        id: 'interview_music_bed',
        name: 'Interview — Music Bed',
        family: 'Interview',
        derivedFrom: ['PARKER new'],
        summary: 'Sparse, slow interview held together by a continuous music bed. Few cuts, long held reframes — editorial and composed rather than chopped.',
        bestFor: 'Brand/founder films, reflective interviews, documentary-leaning pieces.',
        icon: 'Music2',
        accent: 'text-sky-400',
        canvas: { resolution: '1920x1080', aspect: '16:9', fps: 30 },
        pacing: { cutsPerMin: [2, 8], logic: 'narrative_beats + music_phrasing' },
        transitions: {
            default: 'Soft dissolve on music phrase',
            library: ['soft dissolve', 'gentle film dissolve', 'reframe-covered cut'],
            notes: 'Dissolve to B-roll and back on phrase boundaries; avoid abrupt changes.',
        },
        effectStack: ['AE.ADBE Motion (slow reframe drift)'],
        look: {
            transition: { type: 'dissolve', durationFrames: 18 },
            transitionStrategy: 'dissolve',
            punchIn: { start: 100, end: 110, gatedBy: 'slow_push' },
            colorPreset: { id: 'cin-golden-hour', gatedBy: 'cinematic_grade' },
        },
        sfxCues: [
            { placement: 'ambience', categoryId: 'cinematic', subcategoryId: 'swells', volume: 22 },
        ],
        toggles: withSfx([
            { id: 'slow_push', label: 'Slow push-in', description: 'Gentle drift to keep static shots alive.', default: true, icon: 'ZoomIn' },
            { id: 'cinematic_grade', label: 'Cinematic grade', description: 'Filmic editorial tone.', default: true, icon: 'Palette' },
            { id: 'broll_montage', label: 'B-roll montage', description: 'Cut to B-roll on musical phrases (generation).', default: true, icon: 'Film' },
            { id: 'music_swells', label: 'Music swells', description: 'Let the bed swell in dialogue gaps.', default: true, icon: 'AudioWaveform' },
        ]),
    },
    // ── Explainer family ─────────────────────────────────────────────────────
    {
        id: 'talkinghead_premium',
        name: 'Talking-Head — Premium',
        family: 'Explainer',
        derivedFrom: ['Cyber Security Regulation'],
        summary: 'Highly produced single-presenter explainer: cross-dissolves between beats, graded look, caption capsules, zoom-blur emphasis and B-roll over a music bed.',
        bestFor: 'Educational/explainer videos, thought-leadership, branded long-form.',
        icon: 'Presentation',
        accent: 'text-emerald-400',
        canvas: { resolution: '1920x1080', aspect: '16:9', fps: 25 },
        pacing: { cutsPerMin: [22, 30], logic: 'silence_removal + broll_coverage' },
        transitions: {
            default: 'Cross dissolve',
            library: ['cross dissolve', 'zoom-through on emphasis', 'seamless soft cut'],
            notes: 'Short cross-dissolves between talking beats; zoom-blur for energetic emphasis; cut straight to B-roll where cleaner.',
        },
        effectStack: ['AE.ADBE Lumetri', 'AE.ADBE Cross Dissolve New', 'AE.ADBE Capsule (captions)', 'AE.ADBE Geometry2', 'HitFilm ZoomBlur'],
        look: {
            transition: { type: 'dissolve', durationFrames: 12 },
            transitionStrategy: 'dissolve',
            punchIn: { start: 100, end: 125, gatedBy: 'punch_in' },
            colorPreset: { id: 'cin-teal-orange', gatedBy: 'branded_grade' },
        },
        sfxCues: [
            { placement: 'transition', categoryId: 'transitions', subcategoryId: 'swoosh', volume: 38 },
            { placement: 'impact', categoryId: 'ui-tech', subcategoryId: 'beeps', volume: 28, gatedBy: 'keyword_capsules' },
        ],
        toggles: withSfx([
            { id: 'keyword_capsules', label: 'Keyword capsules', description: 'Surface spoken keywords as caption pills.', default: true, icon: 'Captions' },
            { id: 'zoom_emphasis', label: 'Zoom-blur emphasis', description: 'Zoom-through transition on emphatic beats.', default: true, icon: 'ZoomIn' },
            { id: 'branded_grade', label: 'Branded grade', description: 'Polished teal-orange color.', default: true, icon: 'Palette' },
            { id: 'punch_in', label: 'Punch-in reframe', description: 'Push-ins on emphasis.', default: true, icon: 'Crop' },
            { id: 'broll_graphics', label: 'B-roll & graphics', description: 'Insert topic B-roll / motion graphics (generation).', default: true, icon: 'Film' },
        ]),
    },
    // ── Intro family ─────────────────────────────────────────────────────────
    {
        id: 'branded_intro',
        name: 'Branded Intro',
        family: 'Intro',
        derivedFrom: ['AMOSA intro'],
        summary: 'Animated logo/title opener: kinetic text, gradient ramps, mirrored motion, 3D card moves and matte reveals — a short branded sting to front any video.',
        bestFor: 'Show/series intros, channel branding, segment openers.',
        icon: 'Sparkles',
        accent: 'text-fuchsia-400',
        canvas: { resolution: '1920x1080', aspect: '16:9', fps: 30 },
        pacing: { logic: 'beat-synced reveals (4–12s sting)' },
        transitions: {
            default: 'Matte reveal',
            library: ['matte reveal', 'ramp/gradient wipe', '3D flip', 'dip-to-brand-color'],
            notes: 'Reveals ARE the transitions; land hard on the final logo lockup.',
        },
        effectStack: ['AE.ADBE Text', 'AE.ADBE Ramp', 'AE.ADBE Mirror', 'AE.ADBE Basic 3D', 'AE.ADBE Legacy Key Track Matte', 'AE.ADBE Drop Shadow'],
        look: {
            transition: { type: 'wiperight', durationFrames: 14 },
            transitionStrategy: 'dissolve',
            colorPreset: { id: 'mv-neon-pop', gatedBy: 'brand_color' },
        },
        sfxCues: [
            { placement: 'whoosh', categoryId: 'transitions', subcategoryId: 'riser', volume: 55, gatedBy: 'riser_sfx' },
            { placement: 'impact', categoryId: 'impacts', subcategoryId: 'hit', volume: 60, gatedBy: 'logo_impact' },
        ],
        toggles: withSfx([
            { id: 'riser_sfx', label: 'Riser', description: 'Build a riser into the logo reveal.', default: true, icon: 'TrendingUp' },
            { id: 'logo_impact', label: 'Logo impact', description: 'Bass hit on the final logo lockup.', default: true, icon: 'Zap' },
            { id: 'brand_color', label: 'Brand color', description: 'Enforce the brand palette via tint/ramps.', default: true, icon: 'Palette' },
            { id: 'kaleidoscope', label: 'Kaleidoscope', description: 'Mirrored / kaleidoscopic motion behind the title.', default: false, icon: 'Hexagon' },
        ]),
    },
    // ── Music family ─────────────────────────────────────────────────────────
    {
        id: 'music_video_cinematic',
        name: 'Music Video — Cinematic',
        family: 'Music',
        derivedFrom: ['Soldier Music Video - Wonu'],
        summary: 'Beat-cut performance/narrative music video with stylized looks — graded color, gaussian/lens blur, lens distortion and masked composites, all on the beat.',
        bestFor: 'Music videos, performance pieces, stylized brand films.',
        icon: 'Clapperboard',
        accent: 'text-rose-400',
        canvas: { resolution: '1920x1080', aspect: '16:9', fps: 25 },
        pacing: { cutsPerMin: [60, 100], logic: 'beat_sync' },
        transitions: {
            default: 'Blur dissolve on beat',
            library: ['blur dissolve', 'cross dissolve', 'lens-distortion whip', 'flash cut', 'match cut'],
            notes: 'Every transition lands on a beat; vary blur dissolves, whips and match cuts.',
        },
        effectStack: ['AE.ADBE Lumetri', 'AE.ADBE Gaussian Blur 2', 'AE.ADBE AEMask', 'AE.ADBE ProcAmp', 'PR.ADBE Lens Distortion', 'AE.ADBE Find Edges'],
        look: {
            transition: { type: 'hblur', durationFrames: 8 },
            transitionStrategy: 'dissolve',
            colorPreset: { id: 'mv-high-contrast-bw', gatedBy: 'cinematic_looks' },
            rgbSplit: { amount: 4, gatedBy: 'rgb_split' },
            motionBlur: { gatedBy: 'motion_blur' },
            speedCurve: { preset: 's-curve', gatedBy: 'speed_ramps' },
        },
        sfxCues: [
            { placement: 'whoosh', categoryId: 'transitions', subcategoryId: 'swoosh', volume: 40 },
            { placement: 'impact', categoryId: 'impacts', subcategoryId: 'bass-drop', volume: 45, gatedBy: 'impacts' },
        ],
        toggles: withSfx([
            { id: 'cinematic_looks', label: 'Cinematic looks', description: 'Strong scene-specific color grade.', default: true, icon: 'Palette' },
            { id: 'rgb_split', label: 'RGB split', description: 'Chromatic separation on hits.', default: true, icon: 'Split' },
            { id: 'motion_blur', label: 'Motion blur', description: 'Shutter-style smear on movement.', default: true, icon: 'Wind' },
            { id: 'speed_ramps', label: 'Speed ramps', description: 'Slow-fast-slow on shots.', default: true, icon: 'Gauge' },
            { id: 'impacts', label: 'Beat impacts', description: 'Bass drops on hard hits.', default: true, icon: 'Zap' },
        ]),
    },
    // ── Social family ────────────────────────────────────────────────────────
    {
        id: 'social_vertical_hypercut',
        name: 'Social — Vertical Hyper-Cut',
        family: 'Social',
        derivedFrom: ['dance'],
        summary: '9:16 maximum-energy edit: 100+ cuts/min, grid splits, magnify punches, camera shake, echo trails and motion blur — built to stop the scroll.',
        bestFor: 'Reels/TikTok/Shorts dance, hype, trend edits.',
        icon: 'Smartphone',
        accent: 'text-violet-400',
        canvas: { resolution: '1080x1920', aspect: '9:16', fps: 25 },
        pacing: { cutsPerMin: [100, 140], logic: 'beat_sync' },
        transitions: {
            default: 'Magnify / zoom punch',
            library: ['magnify/zoom punch', 'shake whip', 'displace warp', 'echo trail', 'flash on beat'],
            notes: 'Transition energy matches the beat; chain shakes, zoom punches and warps.',
        },
        effectStack: ['AE.ADBE Grid', 'AE.ADBE Magnify', 'AE.S_Shake', 'AE.ADBE Turbulent Displace', 'AE.ADBE Echo', 'AE.ADBE Motion Blur'],
        look: {
            transition: { type: 'zoom-through', durationFrames: 4 },
            transitionStrategy: 'dissolve',
            punchIn: { start: 100, end: 140, gatedBy: 'zoom_punch' },
            colorPreset: { id: 'mv-neon-pop', gatedBy: 'vibrant_grade' },
            motionBlur: { gatedBy: 'motion_blur' },
        },
        sfxCues: [
            { placement: 'transition', categoryId: 'transitions', subcategoryId: 'swoosh', volume: 45 },
            { placement: 'impact', categoryId: 'impacts', subcategoryId: 'hit', volume: 42, gatedBy: 'impacts' },
        ],
        toggles: withSfx([
            { id: 'zoom_punch', label: 'Zoom punch', description: 'Snap punch-in on every hit.', default: true, icon: 'ZoomIn' },
            { id: 'shake', label: 'Camera shake', description: 'Shake on hits.', default: true, icon: 'Vibrate' },
            { id: 'motion_blur', label: 'Motion blur', description: 'Movement smear between cuts.', default: true, icon: 'Wind' },
            { id: 'vibrant_grade', label: 'Vibrant grade', description: 'High-contrast saturated punch.', default: true, icon: 'Palette' },
            { id: 'impacts', label: 'Beat impacts', description: 'Hits on every beat.', default: true, icon: 'Zap' },
            { id: 'hook_text', label: 'Hook text', description: '1-second opening hook caption.', default: true, icon: 'Type' },
        ]),
    },
    {
        id: 'social_vertical_whip_vlog',
        name: 'Social — Vertical Whip Vlog',
        family: 'Social',
        derivedFrom: ['MorningWLK'],
        summary: '9:16 lifestyle/vlog cut held together with whip-pan and flip transitions, stabilized handheld footage and exponential audio fades.',
        bestFor: 'Day-in-the-life, routine/vlog reels, lifestyle brand clips.',
        icon: 'Footprints',
        accent: 'text-violet-400',
        canvas: { resolution: '1080x1920', aspect: '9:16', fps: 30 },
        pacing: { cutsPerMin: [25, 45], logic: 'narrative_beats + motion_matches' },
        transitions: {
            default: 'Whip pan',
            library: ['whip pan', 'flip transition', 'exponential audio fade', 'soft dissolve'],
            notes: 'Hide cuts inside motion: whip-pans and flips on movement; dissolve on scene change.',
        },
        effectStack: ['AE.ADBE SubspaceStabilizer', 'AE.ADBE Vertical Flip', 'AE.ADBE Lumetri', 'AE.ADBE Motion'],
        look: {
            transition: { type: 'whip', durationFrames: 6 },
            transitionStrategy: 'dissolve',
            stabilize: { smoothing: 14, gatedBy: 'stabilize' },
            punchIn: { start: 100, end: 112, gatedBy: 'push_in' },
            colorPreset: { id: 'soc-instagram-warm', gatedBy: 'lifestyle_grade' },
        },
        sfxCues: [
            { placement: 'whoosh', categoryId: 'transitions', subcategoryId: 'swoosh', volume: 42 },
        ],
        toggles: withSfx([
            { id: 'stabilize', label: 'Stabilize', description: 'Smooth handheld footage first.', default: true, icon: 'Move' },
            { id: 'push_in', label: 'Push-in', description: 'Gentle push-ins between whips.', default: false, icon: 'ZoomIn' },
            { id: 'lifestyle_grade', label: 'Lifestyle grade', description: 'Warm, bright Instagram look.', default: true, icon: 'Palette' },
            { id: 'location_tags', label: 'Location tags', description: 'On-screen location labels.', default: false, icon: 'MapPin' },
        ]),
    },
    {
        id: 'social_vertical_short_punch',
        name: 'Social — Vertical Short Punch',
        family: 'Social',
        derivedFrom: ['ShaunaNN'],
        summary: 'Sub-40s 9:16 punch piece: a few fast, stylized shots with fisheye/warp, lens flare and motion blur — a compact, high-impact moment.',
        bestFor: 'Single-moment reels, product/teaser drops, quick brand hits.',
        icon: 'Zap',
        accent: 'text-violet-400',
        canvas: { resolution: '1080x1920', aspect: '9:16', fps: 30 },
        pacing: { cutsPerMin: [50, 80], logic: 'beat_sync (10–40s)' },
        transitions: {
            default: 'Fisheye warp whip',
            library: ['fisheye warp whip', 'flare flash', 'zoom punch', 'blur dissolve'],
            notes: 'Big stylized transitions for a small number of shots; each lands on a beat.',
        },
        effectStack: ['AE.S_WarpFishEye', 'AE.ADBE Lens Flare', 'AE.ADBE Motion Blur', 'AE.ADBE Lumetri'],
        look: {
            transition: { type: 'zoom-through', durationFrames: 5 },
            transitionStrategy: 'dissolve',
            punchIn: { start: 100, end: 145, gatedBy: 'zoom_punch' },
            colorPreset: { id: 'mv-high-contrast-bw', gatedBy: 'bold_grade' },
            motionBlur: { gatedBy: 'motion_blur' },
        },
        sfxCues: [
            { placement: 'transition', categoryId: 'transitions', subcategoryId: 'swoosh', volume: 48 },
            { placement: 'impact', categoryId: 'impacts', subcategoryId: 'hit', volume: 45, gatedBy: 'impacts' },
        ],
        toggles: withSfx([
            { id: 'zoom_punch', label: 'Zoom punch', description: 'Snap punch-in on each beat.', default: true, icon: 'ZoomIn' },
            { id: 'motion_blur', label: 'Motion blur', description: 'Movement smear.', default: true, icon: 'Wind' },
            { id: 'bold_grade', label: 'Bold grade', description: 'High-contrast, saturated.', default: true, icon: 'Palette' },
            { id: 'impacts', label: 'Beat impacts', description: 'Hits on each beat.', default: true, icon: 'Zap' },
            { id: 'hook_text', label: 'Hook text', description: 'Bold center hook.', default: true, icon: 'Type' },
        ]),
    },
    // ── Instructional family ─────────────────────────────────────────────────
    {
        id: 'fitness_demo',
        name: 'Fitness — Exercise Demo',
        family: 'Instructional',
        derivedFrom: ['BroganExercise_without_weights', 'BroganExercise_weights'],
        summary: 'Instructional exercise demo: clean reps with an alignment grid, magnify highlights on form cues, mirrored angles, strobe for tempo and labeled callouts.',
        bestFor: 'Workout tutorials, form breakdowns, coaching content.',
        icon: 'Dumbbell',
        accent: 'text-lime-400',
        canvas: { resolution: '1920x1080', aspect: '16:9', fps: 60 },
        pacing: { cutsPerMin: [45, 110], logic: 'rep_and_cue_driven' },
        transitions: {
            default: 'Speed-ramp into slow-mo',
            library: ['speed-ramp into slow-mo', 'clean match cut on rep', 'magnify push', 'soft dissolve between exercises'],
            notes: 'Ramp into slow-mo for technique; match-cut between reps; dissolve between exercises.',
        },
        effectStack: ['AE.ADBE Grid', 'AE.ADBE Magnify', 'AE.ADBE Strobe', 'AE.ADBE Horizontal Flip', 'AE.ADBE Drop Shadow', 'AE.ADBE Lumetri'],
        look: {
            transition: { type: 'match-cut', durationFrames: 6 },
            transitionStrategy: 'dissolve',
            speedCurve: { preset: 'ramp-down', gatedBy: 'slowmo' },
            punchIn: { start: 100, end: 130, gatedBy: 'magnify' },
            colorPreset: { id: 'soc-clean-bright', gatedBy: 'clean_grade' },
        },
        sfxCues: [
            { placement: 'transition', categoryId: 'foley-body', subcategoryId: 'body-movement', volume: 35 },
            { placement: 'impact', categoryId: 'impacts', subcategoryId: 'thud', volume: 30, gatedBy: 'rep_accents' },
        ],
        toggles: withSfx([
            { id: 'alignment_grid', label: 'Alignment grid', description: 'Posture/alignment reference grid overlay.', default: true, icon: 'Grid3x3' },
            { id: 'magnify', label: 'Magnify cues', description: 'Zoom the working joint/muscle on form cues.', default: true, icon: 'Search' },
            { id: 'slowmo', label: 'Slow-mo technique', description: 'Ramp into slow-mo for technique moments.', default: true, icon: 'Gauge' },
            { id: 'rep_accents', label: 'Rep accents', description: 'Soft thud on each rep.', default: false, icon: 'Zap' },
            { id: 'clean_grade', label: 'Clean grade', description: 'Bright, even lighting look.', default: true, icon: 'Palette' },
        ]),
    },
    // ── Promo family ─────────────────────────────────────────────────────────
    {
        id: 'cinematic_promo',
        name: 'Cinematic Promo',
        family: 'Promo',
        derivedFrom: ['Sara Chy - FINAL'],
        summary: 'Polished branded story driven by music (no synced dialogue): graphic groups and animated text, layered color grade, masked composites and motion blur — a designed promo.',
        bestFor: 'Brand films, product/launch promos, event recaps, sizzles.',
        icon: 'Award',
        accent: 'text-amber-400',
        canvas: { resolution: '1920x1080', aspect: '16:9', fps: 30 },
        pacing: { cutsPerMin: [80, 110], logic: 'music_phrasing + montage' },
        transitions: {
            default: 'Graphic / matte wipe',
            library: ['graphic/matte wipe', 'blur dissolve on phrase', 'match cut', 'speed-ramp', 'cross dissolve'],
            notes: 'Transitions are designed moments — graphic wipes, match cuts and ramps cut to the music.',
        },
        effectStack: ['AE.ADBE Graphic Group', 'AE.ADBE Text', 'AE.ADBE RGB Curves', 'PR.ADBE Levels', 'AE.ADBE Tint', 'AE.ADBE AEMask', 'AE.ADBE Motion Blur'],
        look: {
            transition: { type: 'wipeleft', durationFrames: 10 },
            transitionStrategy: 'dissolve',
            colorPreset: { id: 'cin-bleach-bypass', gatedBy: 'brand_grade' },
            motionBlur: { gatedBy: 'motion_blur' },
            speedCurve: { preset: 's-curve', gatedBy: 'speed_ramps' },
            letterbox: { gatedBy: 'letterbox' },
        },
        sfxCues: [
            { placement: 'whoosh', categoryId: 'transitions', subcategoryId: 'swoosh', volume: 40 },
            { placement: 'impact', categoryId: 'cinematic', subcategoryId: 'cinematic-hit', volume: 42, gatedBy: 'impacts' },
        ],
        toggles: withSfx([
            { id: 'kinetic_typography', label: 'Kinetic typography', description: 'Animated brand type to the beat (generation).', default: true, icon: 'Type' },
            { id: 'brand_grade', label: 'Brand grade', description: 'Cohesive cinematic color stack.', default: true, icon: 'Palette' },
            { id: 'motion_blur', label: 'Motion blur', description: 'Movement realism on moves.', default: true, icon: 'Wind' },
            { id: 'speed_ramps', label: 'Speed ramps', description: 'Ramps to music hits.', default: true, icon: 'Gauge' },
            { id: 'letterbox', label: 'Cinematic bars', description: '2.39:1 widescreen letterbox.', default: false, icon: 'RectangleHorizontal' },
            { id: 'impacts', label: 'Cinematic hits', description: 'Impact on logo/title moments.', default: true, icon: 'Zap' },
            { id: 'logo_outro', label: 'Logo outro', description: 'End on the brand logo lockup.', default: true, icon: 'Award' },
        ]),
    },
];

// ─── Lookups ─────────────────────────────────────────────────────────────────

export const GENERATOR_MODE_FAMILIES: GeneratorModeFamily[] = [
    'Interview', 'Explainer', 'Intro', 'Music', 'Social', 'Instructional', 'Promo',
];

export function getGeneratorMode(id: string): GeneratorMode | undefined {
    return GENERATOR_MODES.find((m) => m.id === id);
}

export function getModesByFamily(family: GeneratorModeFamily): GeneratorMode[] {
    return GENERATOR_MODES.filter((m) => m.family === family);
}

/** Default toggle state for a mode (id → boolean). */
export function defaultToggleState(mode: GeneratorMode): Record<string, boolean> {
    const state: Record<string, boolean> = {};
    for (const t of mode.toggles) state[t.id] = t.default;
    return state;
}
