/**
 * generatorModeConfig.ts — Central subcategory definitions for every Edit Generator mode.
 * Each subcategory tells the engine HOW to edit (pacing, transitions, structure, priorities).
 * Modes and subcategories can be stacked — the engine merges their intelligence.
 */

export interface ModeSubcategory {
    id: string;
    label: string;
    /** One-line summary shown in the UI tooltip */
    summary: string;
    /** Detailed engine behavior description — used by generation pipeline */
    engineBehavior: string;
    /** Optional icon hint (lucide icon name) */
    icon?: string;
}

export interface ModeConfig {
    id: string;
    subcategories: ModeSubcategory[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRAILER
// ═══════════════════════════════════════════════════════════════════════════════

const trailerSubs: ModeSubcategory[] = [
    { id: 'product', label: 'Product', summary: 'Slow reveals → fast cuts for product showcase',
      engineBehavior: 'Focus on object close-ups, center-frame compositions. Slow reveals build to rapid cuts. Clean transitions (dissolves, zooms). Pack shot priority at end.' },
    { id: 'film', label: 'Film', summary: 'Dramatic arc with cinematic pacing',
      engineBehavior: 'Three-act dramatic arc: tension build → climax → resolve. J/L cuts, score-driven timing. Letterbox aspect ratios. Dialogue peaks as cut triggers.' },
    { id: 'music-release', label: 'Music Release', summary: 'Song snippet drives all cuts',
      engineBehavior: 'Waveform-synced, heavy beat-matching. Artist/performer shots prioritized. Verse/chorus structure mirrors visual intensity. Album art reveal at end.' },
    { id: 'brand', label: 'Brand', summary: 'Logo-forward, color-consistent corporate edit',
      engineBehavior: 'Logo placement in first and last 2 seconds. Brand color palette enforced across clips. Corporate-safe transitions (dissolves, wipes). Consistent aspect ratio.' },
    { id: 'event', label: 'Event', summary: 'Chronological highlights with energy escalation',
      engineBehavior: 'Chronological clip ordering. Wide-to-close progression per segment. Energy-escalating edit pace. Crowd/reaction shots intercut. Date/venue overlay slots.' },
    { id: 'game', label: 'Game', summary: 'Fast-twitch gaming montage',
      engineBehavior: 'Sub-second cuts on action peaks. Glitch transitions, neon color accents. Screen capture + cinematic intercuts. Kill/win moment detection. HUD-overlay slots.' },
    { id: 'documentary', label: 'Documentary', summary: 'Long holds, slow dissolves, interview intercuts',
      engineBehavior: 'Longer clip holds (4-8s). Slow dissolves between scenes. Interview + B-roll intercut pattern. Ken Burns on still images. Subtle sound design.' },
    { id: 'teaser', label: 'Teaser', summary: 'Ultra-short mystery hook (15-30s)',
      engineBehavior: 'Maximum 30 seconds. Single question/hook → blackout → title card. Minimum reveal, maximum mystery. 2-4 clips only. Heavy sound design.' },
    { id: 'recap', label: 'Recap', summary: 'Chronological summary with context overlays',
      engineBehavior: 'Strict chronological ordering. Text overlays for dates/context. Clean straight cuts, minimal effects. Even pacing throughout. Summary title at start.' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MUSIC VIDEO
// ═══════════════════════════════════════════════════════════════════════════════

const musicVideoSubs: ModeSubcategory[] = [
    { id: 'performance', label: 'Performance', summary: 'Beat-locked stage/studio cuts',
      engineBehavior: 'Beat-locked cuts on downbeats. Stage/studio footage priority. Lip-sync detection for cut timing. Energy-matched transitions. Multi-cam switching feel.' },
    { id: 'narrative', label: 'Story-Driven', summary: 'Scene-based emotional arc',
      engineBehavior: 'Scene-based structure over beat sync. Dialogue/action moments as primary cut points. Emotional arc drives clip ordering. Performance intercuts as chorus payoff.' },
    { id: 'calm-spiritual', label: 'Calm / Spiritual', summary: 'Slow dissolves, long holds, ambient feel',
      engineBehavior: 'Long clip holds (3-8s). Slow dissolves between shots. Nature/ambient B-roll priority. Gentle camera movement preference. Warm color grading. Breath-paced editing.' },
    { id: 'action', label: 'Action', summary: 'Sub-second cuts on drops with velocity ramps',
      engineBehavior: 'Sub-second cuts on musical drops/hits. Velocity ramps (2x-4x) on impact moments. Motion blur on transitions. High-contrast grading. Bass-driven camera shake.' },
    { id: 'lyric-visual', label: 'Lyric Visual', summary: 'Text overlay synced to lyrics',
      engineBehavior: 'Text overlay generation synced to lyric timestamps. Typographic transitions between lines. Visual metaphor matching per verse. Minimal video movement during text.' },
    { id: 'dance', label: 'Dance', summary: 'Choreography-synced body movement cuts',
      engineBehavior: 'Body-movement-synced cut points. Wide shots for choreography context, close-ups on accent moves. Speed ramps on rhythmic hits. Formation change detection.' },
    { id: 'aesthetic', label: 'Aesthetic', summary: 'Color-palette driven mood editing',
      engineBehavior: 'Color-palette consistency drives clip selection. Smooth transitions (dissolves, morphs). Visual texture prioritized over narrative. Mood-first editing. Grain/film look.' },
    { id: 'live', label: 'Live', summary: 'Multi-cam concert/live performance switching',
      engineBehavior: 'Multi-cam switching simulation. Crowd/reaction shots intercut on chorus. Raw energy feel, minimal post-processing. Wide-close-wide rhythm. Audience POV priority.' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SHOWREEL
// ═══════════════════════════════════════════════════════════════════════════════

const showreelSubs: ModeSubcategory[] = [
    { id: 'actor', label: 'Actor', summary: 'Face-detection priority, emotional range showcase',
      engineBehavior: 'Face-detection for clip selection. Emotional range diversity in ordering. Genre variety: drama → comedy → action. Hook with strongest moment. Agent-standard pacing (2-3min).' },
    { id: 'director', label: 'Director', summary: 'Visual style and shot composition variety',
      engineBehavior: 'Shot composition variety showcase. Signature technique repetition for brand identity. Genre-diverse project ordering. Scale progression (intimate → epic). Color palette shifts.' },
    { id: 'cinematographer', label: 'Cinematographer', summary: 'Camera movement and lighting showcase',
      engineBehavior: 'Camera movement variety (dolly, crane, handheld, gimbal). Lighting diversity (natural, studio, mixed). Technical excellence ordering. Format diversity (film, digital). Golden-hour priority.' },
    { id: 'vfx', label: 'VFX', summary: 'Before/after breakdowns, complexity progression',
      engineBehavior: 'Before/after intercuts where possible. Complexity progression (simple → complex). Technical breakdown moments. Wireframe/render pass reveals. Tool/software credit slots.' },
    { id: 'editor', label: 'Editor', summary: 'Rhythm, pacing, and transition variety showcase',
      engineBehavior: 'Rhythm + pacing variety as primary showcase. Transition technique diversity. Genre-jumping montage to show range. Tempo changes demonstrate control. Sound design sync moments.' },
    { id: 'model', label: 'Model', summary: 'Posing variety with wardrobe changes',
      engineBehavior: 'Posing variety across looks. Wardrobe/look change transitions. Agency-standard pacing (60-90s). Full-body + close-up alternation. Commercial + editorial mix.' },
    { id: 'photographer', label: 'Photographer', summary: 'Still-to-motion intercuts with Ken Burns',
      engineBehavior: 'Still image showcase with Ken Burns movement. Behind-the-scenes motion intercuts. Print-ready composition emphasis. Portfolio category grouping. Before/after retouching reveals.' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// VIDEO ESSAY
// ═══════════════════════════════════════════════════════════════════════════════

const videoEssaySubs: ModeSubcategory[] = [
    { id: 'analysis', label: 'Analysis', summary: 'Voiceover-driven with citation overlays',
      engineBehavior: 'Voiceover-driven clip timing. Citation/source overlays at key claims. Side-by-side comparison cuts for analysis. Thesis → evidence → conclusion structure. Academic pacing.' },
    { id: 'commentary', label: 'Commentary', summary: 'Talking-head + B-roll intercut',
      engineBehavior: 'Talking-head as anchor, B-roll for illustration. Reaction framing on key points. Casual, conversational pacing. Jump-cut talking-head segments. Meme/clip inserts for emphasis.' },
    { id: 'explainer', label: 'Explainer', summary: 'Step-by-step with diagram intercuts',
      engineBehavior: 'Diagram/graphic intercuts at explanation points. Step-by-step numbered progression. Clean typography overlays. Process visualization. Summary recap at end.' },
    { id: 'review', label: 'Review', summary: 'Product/media showcase + opinion intercut',
      engineBehavior: 'Subject showcase footage (product, film, game). Opinion/reaction intercuts. Rating graphic slots. Highlight reel for "best moments". Pros/cons comparison structure.' },
    { id: 'documentary-essay', label: 'Documentary', summary: 'Long-form narration with archival footage',
      engineBehavior: 'Long-form narration pacing (6-10s per shot). Archival footage integration with date overlays. Atmospheric ambient B-roll. Interview segment slots. Chapter title cards.' },
    { id: 'educational', label: 'Educational', summary: 'Instructor + demonstration intercut',
      engineBehavior: 'Instructor-to-demonstration intercut pattern. Annotation/callout overlay slots. Structured chapter divisions. Quiz/summary recap sections. Screen recording integration.' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SHORT FILM
// ═══════════════════════════════════════════════════════════════════════════════

const shortFilmSubs: ModeSubcategory[] = [
    { id: 'drama', label: 'Drama', summary: 'Dialogue-driven with shot-reverse-shot',
      engineBehavior: 'Dialogue-driven assembly. Shot-reverse-shot pattern detection. Emotional beat editing with reaction holds. J/L cuts for conversation flow. Score-driven scene transitions.' },
    { id: 'comedy', label: 'Comedy', summary: 'Timing-critical cuts with reaction emphasis',
      engineBehavior: 'Timing-critical cuts (comedic beat detection). Reaction shot emphasis after punchlines. Beat pauses for audience laugh timing. Wider framing for physical comedy. Quick-cut montage for gags.' },
    { id: 'horror', label: 'Horror', summary: 'Tension holds with jump-cut scares',
      engineBehavior: 'Extended tension holds (silence detection). Jump-cut scares on audio spikes. Sound-design-driven timing. Dark/shadow clip preference. Slow zoom for dread building.' },
    { id: 'action-film', label: 'Action', summary: 'Fast intercutting with impact frames',
      engineBehavior: 'Fast intercutting (< 1s per cut in action). Impact frames (1-2 frame flash) on hits. Velocity ramps on stunts. Multi-angle coverage switching. Sound-effect-synced cuts.' },
    { id: 'experimental', label: 'Experimental', summary: 'Non-linear abstract editing',
      engineBehavior: 'Non-linear clip assembly. Abstract transition techniques. Rhythm-over-narrative structure. Color/texture matching between shots. Repetition and variation patterns.' },
    { id: 'music-driven', label: 'Music-Driven', summary: 'Score-as-structure visual rhythm',
      engineBehavior: 'Musical score defines all cut points. Visual rhythm matches musical phrases. Tempo changes drive pacing shifts. Instrument entries trigger new visual elements. Crescendo → climax editing.' },
    { id: 'silent', label: 'Silent', summary: 'No dialogue, pure visual storytelling',
      engineBehavior: 'No dialogue reliance. Visual storytelling through action and composition. Title cards for essential context. Extended reaction holds. Musical score carries emotion.' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SOCIAL MEDIA
// ═══════════════════════════════════════════════════════════════════════════════

const socialMediaSubs: ModeSubcategory[] = [
    { id: 'talking-head', label: 'Talking Head', summary: 'Face-centered with auto-captions',
      engineBehavior: 'Face-centered framing (auto-crop to speaker). Caption generation slots. Jump-cut removal of dead air/pauses. Zoom punches on emphasis. Hook line in first 1s.' },
    { id: 'viral-hook', label: 'Viral Hook', summary: '0.5s hook → content → CTA loop',
      engineBehavior: '0.5s attention hook (best moment first). Content body with fast pacing. CTA end frame slot. Loop-friendly ending (last frame matches first). 15-60s target duration.' },
    { id: 'boomerang', label: 'Boomerang', summary: 'Forward-reverse loops at peak moments',
      engineBehavior: 'Peak-moment detection in clips. Forward-reverse loop at action peaks. Seamless loop point detection. 1-3 second total duration. Speed ramp variations (slow-fast-slow).' },
    { id: 'before-after', label: 'Before/After', summary: 'Split-screen or wipe reveal',
      engineBehavior: 'Clip pairing by similarity/contrast. Split-screen or diagonal wipe reveal. Dramatic pause at transition point (0.5s hold). Sound effect sync on reveal. Text overlay: Before/After.' },
    { id: 'carousel', label: 'Carousel', summary: 'Multi-segment chapter-based content',
      engineBehavior: 'Multi-segment division (3-10 slides). Each segment self-contained (2-5s). Visual continuity between segments (color/composition). Numbered chapter markers. Swipe-cue transitions.' },
    { id: 'reaction', label: 'Reaction', summary: 'Side-by-side or PiP reaction sync',
      engineBehavior: 'Source + reaction PiP or side-by-side layout. Emotion-peak detection for cut points. Reaction camera as primary, source as secondary. Audio from reaction track. Exaggerated zoom on reactions.' },
    { id: 'transition-trend', label: 'Transition Trend', summary: 'Object-match cuts on beat',
      engineBehavior: 'Object-match cuts between clips. Snap/clap audio as transition triggers. Wardrobe/scene changes on musical beats. Hand-over-lens transitions. Seamless movement continuation.' },
    { id: 'asmr-satisfying', label: 'ASMR / Satisfying', summary: 'Close-up textures, no abrupt cuts',
      engineBehavior: 'Extreme close-up framing priority. Long holds on satisfying textures (3-6s). No abrupt cuts (slow dissolves only). Loop-friendly endings. Ambient/no-music audio preference.' },
    { id: 'day-in-life', label: 'Day in Life', summary: 'Chronological fast-paced montage',
      engineBehavior: 'Chronological time-of-day ordering. Fast-paced montage (1-2s per clip). Time-indicator overlay slots (morning/afternoon/evening). Casual transitions (whip pans). Music-driven pacing.' },
    { id: 'tutorial-short', label: 'Quick Tutorial', summary: 'Step-numbered speed-up process',
      engineBehavior: 'Step-numbered overlays (Step 1, Step 2...). Speed-up on process/waiting shots. Before/after bookend structure. Tool/material callout slots. 30-60s target duration.' },
    { id: 'meme-edit', label: 'Meme Edit', summary: 'Rapid-fire absurdist cuts with zoom punches',
      engineBehavior: 'Rapid-fire cuts (<0.5s). Sound effect sync on every cut. Zoom punches on faces/objects. Absurdist pacing with unexpected interrupts. Bass-boosted audio spikes. Screen shake.' },
    { id: 'cinematic-reel', label: 'Cinematic Reel', summary: 'Letterbox slow-motion with film grain',
      engineBehavior: 'Letterbox (2.39:1) framing. Slow-motion on hero shots. Film-grain overlay application. Score-driven cut timing. Color-graded consistency. Dramatic reveals.' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// BTS (Behind the Scenes)
// ═══════════════════════════════════════════════════════════════════════════════

const btsSubs: ModeSubcategory[] = [
    { id: 'film-bts', label: 'Film BTS', summary: 'On-set footage with setup → take → result',
      engineBehavior: 'Setup → take → final result intercut pattern. Crew/team moments as transitions. Equipment showcase shots. Director/actor interaction captures. Timelapse for set builds.' },
    { id: 'music-video-bts', label: 'Music Video BTS', summary: 'Rehearsal → performance intercuts',
      engineBehavior: 'Rehearsal → performance intercut comparison. Artist candid moments priority. Set design reveals and build timelapses. Costume/makeup transformation montages. Song as audio bed.' },
    { id: 'event-bts', label: 'Event BTS', summary: 'Preparation → event → aftermath arc',
      engineBehavior: 'Three-phase structure: prep → event → aftermath. Organizer/team POV emphasis. Time-lapse for setup/teardown. Guest arrival moments. Energy escalation to event peak.' },
    { id: 'photoshoot-bts', label: 'Photoshoot BTS', summary: 'Setup → shoot → final image reveals',
      engineBehavior: 'Lighting/set setup process documentation. Shoot session with photographer direction. Final image reveal (motion → still transition). Model prep and wardrobe sequences. Equipment/technique highlights.' },
    { id: 'studio-session', label: 'Studio Session', summary: 'Recording/creation process capture',
      engineBehavior: 'Recording/creation process documentation. Screen captures + room ambience intercuts. Raw audio moment preservation. Creative discussion captures. Progress comparison (demo → final).' },
    { id: 'travel-bts', label: 'Travel BTS', summary: 'Journey montage with location reveals',
      engineBehavior: 'Journey/transit footage as connective tissue. Location reveal moments with wide establishing shots. Local interaction and culture captures. Map/route overlay slots. Golden-hour priority.' },
    { id: 'production-diary', label: 'Production Diary', summary: 'Day-by-day journal format',
      engineBehavior: 'Day-by-day sequential structure. Date/location text overlays per segment. Progress tracking (day 1 vs day N comparison). Personal reflection/to-camera segments. Milestone celebration moments.' },
    { id: 'making-of', label: 'Making Of', summary: 'Deep-dive creative process documentary',
      engineBehavior: 'Interview + B-roll documentary format. Technical process breakdowns. Before/after comparison reveals. Creative decision exploration. Tool/software showcase segments.' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MASTER CONFIG MAP
// ═══════════════════════════════════════════════════════════════════════════════

export const MODE_SUBCATEGORIES: Record<string, ModeSubcategory[]> = {
    'trailer': trailerSubs,
    'music-video': musicVideoSubs,
    'showreel': showreelSubs,
    'video-essay': videoEssaySubs,
    'short-film': shortFilmSubs,
    'social-media': socialMediaSubs,
    'bts': btsSubs,
};

/** Get subcategories for a mode, or empty array if unknown */
export const getSubcategories = (modeId: string): ModeSubcategory[] =>
    MODE_SUBCATEGORIES[modeId] ?? [];

/** Get a specific subcategory by mode + sub ID */
export const getSubcategory = (modeId: string, subId: string): ModeSubcategory | undefined =>
    getSubcategories(modeId).find(s => s.id === subId);
