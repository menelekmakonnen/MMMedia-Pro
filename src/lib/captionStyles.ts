/**
 * captionStyles.ts — Pre-built caption style presets for text overlays.
 *
 * Each style defines the visual appearance, animation, and positioning of
 * on-screen text. Used by the Text Engine for subtitles, lyric sync, titles,
 * and social media caption overlays.
 *
 * Deeply connected to: textEngine.ts (consumer), filterBuilder.ts (FFmpeg drawtext rendering)
 */

// ── Caption Style Types ──────────────────────────────────────────────────────

export type CaptionStyleId =
    | 'tiktok-bold'
    | 'hormozi'
    | 'karaoke'
    | 'typewriter'
    | 'pop-stack'
    | 'cinematic-sub'
    | 'meme-impact'
    | 'minimal'
    | 'neon-glow'
    | 'handwritten';

export type CaptionAnimation =
    | 'none'
    | 'fade-in'
    | 'pop-in'
    | 'slide-up'
    | 'typewriter'
    | 'word-highlight'
    | 'word-pop'
    | 'bounce';

export type CaptionPosition =
    | 'top'
    | 'center'
    | 'bottom'
    | 'lower-third'
    | 'upper-third'
    | 'custom';

export interface CaptionStyleDef {
    id: CaptionStyleId;
    name: string;
    description: string;
    /** Font family — must be available on system or bundled */
    fontFamily: string;
    /** Font size in pixels (at 1080p; scaled proportionally for other resolutions) */
    fontSize: number;
    /** Font weight: 'normal' | 'bold' | 'black' */
    fontWeight: 'normal' | 'bold' | 'black';
    /** Primary text colour (hex) */
    color: string;
    /** Text stroke/outline colour (hex) or 'none' */
    strokeColor: string;
    /** Stroke width in pixels */
    strokeWidth: number;
    /** Background box colour (hex with alpha) or 'none' */
    bgColor: string;
    /** Background box padding in pixels */
    bgPadding: number;
    /** Background box border radius in pixels */
    bgBorderRadius: number;
    /** Shadow colour (hex) or 'none' */
    shadowColor: string;
    /** Shadow offset X, Y in pixels */
    shadowOffset: [number, number];
    /** Text position on screen */
    position: CaptionPosition;
    /** Y offset from position anchor in pixels */
    yOffset: number;
    /** Text alignment */
    alignment: 'left' | 'center' | 'right';
    /** Maximum width as percentage of video width (0-100) */
    maxWidthPct: number;
    /** Line spacing multiplier */
    lineSpacing: number;
    /** Animation style for text appearance */
    animation: CaptionAnimation;
    /** Animation duration in seconds */
    animationDuration: number;
    /** Word-level timing (true = each word appears individually) */
    wordByWord: boolean;
    /** Highlight colour for active word (karaoke/hormozi styles) */
    highlightColor?: string;
    /** Letter spacing in pixels */
    letterSpacing?: number;
    /** Text transform */
    textTransform?: 'none' | 'uppercase' | 'lowercase';
    /** Whether to show a persistent background bar */
    persistentBar?: boolean;
}

// ── Style Definitions ────────────────────────────────────────────────────────

const TIKTOK_BOLD: CaptionStyleDef = {
    id: 'tiktok-bold',
    name: 'TikTok Bold',
    description: 'Large white Impact font, word-by-word centre screen with black stroke. The viral social media standard.',
    fontFamily: 'Impact',
    fontSize: 72,
    fontWeight: 'black',
    color: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 4,
    bgColor: 'none',
    bgPadding: 0,
    bgBorderRadius: 0,
    shadowColor: '#00000080',
    shadowOffset: [2, 2],
    position: 'center',
    yOffset: 50,
    alignment: 'center',
    maxWidthPct: 85,
    lineSpacing: 1.1,
    animation: 'word-pop',
    animationDuration: 0.15,
    wordByWord: true,
    textTransform: 'uppercase',
};

const HORMOZI: CaptionStyleDef = {
    id: 'hormozi',
    name: 'Hormozi / Talking Head',
    description: 'Yellow highlight on the active word, rest in white. Bottom third positioning. Perfect for talking head content.',
    fontFamily: 'Inter',
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 2,
    bgColor: '#00000099',
    bgPadding: 12,
    bgBorderRadius: 8,
    shadowColor: 'none',
    shadowOffset: [0, 0],
    position: 'lower-third',
    yOffset: 0,
    alignment: 'center',
    maxWidthPct: 90,
    lineSpacing: 1.3,
    animation: 'word-highlight',
    animationDuration: 0.1,
    wordByWord: true,
    highlightColor: '#FFD700',
};

const KARAOKE: CaptionStyleDef = {
    id: 'karaoke',
    name: 'Karaoke / Lyric Sync',
    description: 'Words light up on beat and fade after. Designed for music videos and lyric overlays.',
    fontFamily: 'Outfit',
    fontSize: 56,
    fontWeight: 'bold',
    color: '#FFFFFF40',
    strokeColor: 'none',
    strokeWidth: 0,
    bgColor: 'none',
    bgPadding: 0,
    bgBorderRadius: 0,
    shadowColor: '#00000060',
    shadowOffset: [0, 2],
    position: 'center',
    yOffset: 80,
    alignment: 'center',
    maxWidthPct: 80,
    lineSpacing: 1.2,
    animation: 'word-highlight',
    animationDuration: 0.2,
    wordByWord: true,
    highlightColor: '#FFFFFF',
};

const TYPEWRITER: CaptionStyleDef = {
    id: 'typewriter',
    name: 'Typewriter',
    description: 'Characters appear one-by-one with a cursor blink. Perfect for dramatic reveals and intro sequences.',
    fontFamily: 'Courier New',
    fontSize: 42,
    fontWeight: 'normal',
    color: '#E0E0E0',
    strokeColor: 'none',
    strokeWidth: 0,
    bgColor: '#0A0A0ACC',
    bgPadding: 16,
    bgBorderRadius: 4,
    shadowColor: 'none',
    shadowOffset: [0, 0],
    position: 'center',
    yOffset: 0,
    alignment: 'left',
    maxWidthPct: 70,
    lineSpacing: 1.5,
    animation: 'typewriter',
    animationDuration: 0.05,
    wordByWord: false,
    letterSpacing: 2,
};

const POP_STACK: CaptionStyleDef = {
    id: 'pop-stack',
    name: 'Pop Stack',
    description: 'Each phrase pops in and stacks vertically with bounce. Fast-paced montage overlays.',
    fontFamily: 'Inter',
    fontSize: 38,
    fontWeight: 'black',
    color: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 3,
    bgColor: 'none',
    bgPadding: 0,
    bgBorderRadius: 0,
    shadowColor: '#00000080',
    shadowOffset: [1, 3],
    position: 'center',
    yOffset: -20,
    alignment: 'center',
    maxWidthPct: 75,
    lineSpacing: 1.4,
    animation: 'bounce',
    animationDuration: 0.25,
    wordByWord: false,
    textTransform: 'uppercase',
};

const CINEMATIC_SUB: CaptionStyleDef = {
    id: 'cinematic-sub',
    name: 'Cinematic Subtitle',
    description: 'Thin elegant font in the letterbox zone. Fade in/out. Film and trailer standard.',
    fontFamily: 'Helvetica Neue',
    fontSize: 32,
    fontWeight: 'normal',
    color: '#FFFFFFCC',
    strokeColor: 'none',
    strokeWidth: 0,
    bgColor: 'none',
    bgPadding: 0,
    bgBorderRadius: 0,
    shadowColor: '#00000060',
    shadowOffset: [0, 1],
    position: 'bottom',
    yOffset: 40,
    alignment: 'center',
    maxWidthPct: 60,
    lineSpacing: 1.3,
    animation: 'fade-in',
    animationDuration: 0.3,
    wordByWord: false,
    letterSpacing: 1,
};

const MEME_IMPACT: CaptionStyleDef = {
    id: 'meme-impact',
    name: 'Meme / Impact',
    description: 'Classic Impact font top/bottom, all caps. The original meme style.',
    fontFamily: 'Impact',
    fontSize: 64,
    fontWeight: 'bold',
    color: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 5,
    bgColor: 'none',
    bgPadding: 0,
    bgBorderRadius: 0,
    shadowColor: 'none',
    shadowOffset: [0, 0],
    position: 'top',
    yOffset: 20,
    alignment: 'center',
    maxWidthPct: 95,
    lineSpacing: 1.0,
    animation: 'none',
    animationDuration: 0,
    wordByWord: false,
    textTransform: 'uppercase',
};

const MINIMAL: CaptionStyleDef = {
    id: 'minimal',
    name: 'Minimal / Clean',
    description: 'Small, clean sans-serif in lower third with subtle background. Professional and understated.',
    fontFamily: 'Inter',
    fontSize: 28,
    fontWeight: 'normal',
    color: '#FFFFFF',
    strokeColor: 'none',
    strokeWidth: 0,
    bgColor: '#00000066',
    bgPadding: 8,
    bgBorderRadius: 6,
    shadowColor: 'none',
    shadowOffset: [0, 0],
    position: 'bottom',
    yOffset: 30,
    alignment: 'center',
    maxWidthPct: 80,
    lineSpacing: 1.3,
    animation: 'fade-in',
    animationDuration: 0.2,
    wordByWord: false,
};

const NEON_GLOW: CaptionStyleDef = {
    id: 'neon-glow',
    name: 'Neon Glow',
    description: 'Glowing neon text with colour pulse. Eye-catching for nightlife and music content.',
    fontFamily: 'Outfit',
    fontSize: 52,
    fontWeight: 'bold',
    color: '#FF00FF',
    strokeColor: '#FF00FF40',
    strokeWidth: 6,
    bgColor: 'none',
    bgPadding: 0,
    bgBorderRadius: 0,
    shadowColor: '#FF00FF80',
    shadowOffset: [0, 0],
    position: 'center',
    yOffset: 0,
    alignment: 'center',
    maxWidthPct: 80,
    lineSpacing: 1.2,
    animation: 'pop-in',
    animationDuration: 0.2,
    wordByWord: false,
    textTransform: 'uppercase',
};

const HANDWRITTEN: CaptionStyleDef = {
    id: 'handwritten',
    name: 'Handwritten',
    description: 'Casual handwritten-style font. Personal, authentic feel for vlogs and stories.',
    fontFamily: 'Comic Sans MS',
    fontSize: 36,
    fontWeight: 'normal',
    color: '#FFFFEE',
    strokeColor: 'none',
    strokeWidth: 0,
    bgColor: 'none',
    bgPadding: 0,
    bgBorderRadius: 0,
    shadowColor: '#00000040',
    shadowOffset: [1, 2],
    position: 'center',
    yOffset: 60,
    alignment: 'center',
    maxWidthPct: 85,
    lineSpacing: 1.4,
    animation: 'slide-up',
    animationDuration: 0.3,
    wordByWord: false,
};

// ── Exports ──────────────────────────────────────────────────────────────────

export const CAPTION_STYLES: Record<CaptionStyleId, CaptionStyleDef> = {
    'tiktok-bold': TIKTOK_BOLD,
    hormozi: HORMOZI,
    karaoke: KARAOKE,
    typewriter: TYPEWRITER,
    'pop-stack': POP_STACK,
    'cinematic-sub': CINEMATIC_SUB,
    'meme-impact': MEME_IMPACT,
    minimal: MINIMAL,
    'neon-glow': NEON_GLOW,
    handwritten: HANDWRITTEN,
};

export const CAPTION_STYLE_LIST: CaptionStyleDef[] = Object.values(CAPTION_STYLES);

/** Get a caption style by ID, with fallback to 'minimal'. */
export function getCaptionStyle(id: CaptionStyleId): CaptionStyleDef {
    return CAPTION_STYLES[id] ?? CAPTION_STYLES.minimal;
}

/** Get all styles suitable for a given use case. */
export function getStylesForUseCase(useCase: 'social' | 'music' | 'film' | 'essay' | 'meme'): CaptionStyleDef[] {
    const map: Record<string, CaptionStyleId[]> = {
        social: ['tiktok-bold', 'hormozi', 'pop-stack', 'neon-glow'],
        music: ['karaoke', 'neon-glow', 'cinematic-sub'],
        film: ['cinematic-sub', 'minimal', 'typewriter'],
        essay: ['hormozi', 'minimal', 'typewriter'],
        meme: ['meme-impact', 'tiktok-bold'],
    };
    return (map[useCase] || []).map(id => CAPTION_STYLES[id]);
}
