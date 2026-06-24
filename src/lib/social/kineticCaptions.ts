// ══════════════════════════════════════════════════════════════════════════════
// social/kineticCaptions.ts — Word-timed kinetic (karaoke) captions.
//
// Takes word-level timing (text + start/end seconds, as produced by a forced
// aligner / ASR upstream) and lays it out into caption EVENTS: groups of words
// wrapped into lines, each word carrying its own active highlight window in
// FRAMES. This is the data a renderer needs to pop / underline / color each word
// the instant it is spoken (TikTok-style karaoke captions).
//
//   words [{text,startSec,endSec}] ─▶ chunk into events ─▶ wrap into lines ─▶
//   per-word active frame windows ─▶ CaptionEvent[]
//
// PURE: no React, no IPC, no canvas, no FFmpeg. Times convert to frames via
// DEFAULT_FPS (overridable). Deterministic & unit-testable.
// ══════════════════════════════════════════════════════════════════════════════

// COMPANION: ../captionStyles.ts defines the render-ready visual appearance
// (font sizes, colors, stroke, shadows, positions) for each caption style ID.
// This module handles TIMING — word-level active windows, event grouping, line
// wrapping. Together they form the complete caption pipeline.

import { DEFAULT_FPS, secondsToFrames } from '../time';

// ── Preset styles ──────────────────────────────────────────────────────────────

export type KineticPresetId = 'bold-pop' | 'clean-underline' | 'tiktok-caption' | 'highlight-box';

/** Visual + layout spec for a kinetic-caption look. Colors are hex; numbers are
 *  renderer-agnostic intents (px / fractions) the export layer maps to drawtext
 *  / overlay parameters. Kept self-contained so a renderer needs no extra config. */
export interface KineticStyle {
    id: KineticPresetId;
    label: string;
    /** Highlight treatment applied to the currently-spoken word. */
    activeEffect: 'scale-pop' | 'underline' | 'color-swap' | 'box-fill';
    fontFamily: string;
    fontWeight: 'normal' | 'bold';
    /** Base font scale (1 = renderer default). */
    fontScale: number;
    /** Resting word color / active word color. */
    baseColor: string;
    activeColor: string;
    /** Outline + shadow for legibility over busy footage. */
    outlineColor: string;
    outlineWidth: number;
    shadow: boolean;
    /** Optional background highlight box behind the active word. '' = none. */
    boxColor: string;
    /** Caption block placement. */
    position: 'top' | 'center' | 'bottom';
    /** Max words rendered per caption event (one "card" on screen). */
    maxWordsPerEvent: number;
    /** Max words per wrapped line within an event. */
    maxWordsPerLine: number;
    /** Pop overshoot for scale-pop (1.0 = none). */
    popScale: number;
}

export const KINETIC_STYLES: Record<KineticPresetId, KineticStyle> = {
    // Big bold words that punch in one or two at a time — the loud, high-retention look.
    'bold-pop': {
        id: 'bold-pop', label: 'Bold Pop',
        activeEffect: 'scale-pop', fontFamily: 'Montserrat', fontWeight: 'bold', fontScale: 1.5,
        baseColor: '#FFFFFF', activeColor: '#FFE500', outlineColor: '#000000', outlineWidth: 8,
        shadow: true, boxColor: '', position: 'center', maxWordsPerEvent: 3, maxWordsPerLine: 3, popScale: 1.18,
    },
    // Clean readable lines; the spoken word is underlined. Professional / explainer.
    'clean-underline': {
        id: 'clean-underline', label: 'Clean Underline',
        activeEffect: 'underline', fontFamily: 'Inter', fontWeight: 'bold', fontScale: 1.1,
        baseColor: '#FFFFFF', activeColor: '#4FC3F7', outlineColor: '#101418', outlineWidth: 4,
        shadow: true, boxColor: '', position: 'bottom', maxWordsPerEvent: 7, maxWordsPerLine: 4, popScale: 1.0,
    },
    // The ubiquitous TikTok look: a line of words, the active word swaps to an accent color.
    'tiktok-caption': {
        id: 'tiktok-caption', label: 'TikTok Caption',
        activeEffect: 'color-swap', fontFamily: 'Proxima Nova', fontWeight: 'bold', fontScale: 1.25,
        baseColor: '#FFFFFF', activeColor: '#00F2EA', outlineColor: '#000000', outlineWidth: 6,
        shadow: true, boxColor: '', position: 'center', maxWordsPerEvent: 5, maxWordsPerLine: 3, popScale: 1.06,
    },
    // Each active word sits in a filled rounded box (the "captioned podcast" look).
    'highlight-box': {
        id: 'highlight-box', label: 'Highlight Box',
        activeEffect: 'box-fill', fontFamily: 'Poppins', fontWeight: 'bold', fontScale: 1.2,
        baseColor: '#FFFFFF', activeColor: '#111111', outlineColor: '#000000', outlineWidth: 2,
        shadow: false, boxColor: '#A6FF00', position: 'bottom', maxWordsPerEvent: 6, maxWordsPerLine: 3, popScale: 1.0,
    },
};

export function getKineticStyle(id: KineticPresetId): KineticStyle {
    const s = KINETIC_STYLES[id];
    if (!s) throw new Error(`[kineticCaptions] Unknown style: ${String(id)}`);
    return s;
}

// ── Inputs / outputs ──────────────────────────────────────────────────────────

export interface TimedWord {
    text: string;
    startSec: number;
    endSec: number;
}

export interface CaptionWord {
    text: string;
    /** Frame the word lights up (its spoken start). */
    activeStartFrame: number;
    /** Frame the word stops being the active word (next word's start, or its own end). */
    activeEndFrame: number;
}

export interface CaptionLine {
    text: string;
    words: CaptionWord[];
}

export interface CaptionEvent {
    /** First frame the whole caption card is on screen. */
    startFrame: number;
    /** Last frame (exclusive) the card is on screen. */
    endFrame: number;
    lines: CaptionLine[];
    style: KineticStyle;
}

export interface KineticOptions {
    fps?: number;
    /** Frames the card lingers after its last word finishes (so the final word is
     *  readable). Default 6. */
    holdOutFrames?: number;
    /** Max silent gap (seconds) tolerated inside one event before it is split into
     *  a new card. Default 0.6. Long pauses → fresh card. */
    maxGapSec?: number;
}

// ── Grouping helpers ───────────────────────────────────────────────────────────

/** Split the flat word stream into events of ≤ maxWordsPerEvent words, also
 *  breaking whenever a silent gap exceeds maxGapSec. */
function chunkIntoEvents(words: TimedWord[], maxWords: number, maxGapSec: number): TimedWord[][] {
    const events: TimedWord[][] = [];
    let cur: TimedWord[] = [];
    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        if (cur.length > 0) {
            const prev = cur[cur.length - 1];
            const gap = w.startSec - prev.endSec;
            if (cur.length >= maxWords || gap > maxGapSec) {
                events.push(cur);
                cur = [];
            }
        }
        cur.push(w);
    }
    if (cur.length) events.push(cur);
    return events;
}

/** Wrap an event's words into lines of ≤ maxWordsPerLine. */
function wrapIntoLines(words: CaptionWord[], maxPerLine: number): CaptionLine[] {
    const lines: CaptionLine[] = [];
    for (let i = 0; i < words.length; i += maxPerLine) {
        const slice = words.slice(i, i + maxPerLine);
        lines.push({ text: slice.map((w) => w.text).join(' '), words: slice });
    }
    return lines;
}

// ── The builder ────────────────────────────────────────────────────────────────

/**
 * Build kinetic caption events from word-level timing.
 *
 * Each word's active window runs from its own spoken start to the NEXT word's
 * start (so exactly one word is highlighted at a time and windows never overlap).
 * The last word in an event holds to its own end. The card itself spans from its
 * first word's start to its last word's end + holdOutFrames.
 */
export function buildKineticCaptions(
    words: TimedWord[],
    style: KineticStyle | KineticPresetId,
    opts: KineticOptions = {},
): CaptionEvent[] {
    const st = typeof style === 'string' ? getKineticStyle(style) : style;
    const fps = opts.fps ?? DEFAULT_FPS;
    const holdOut = opts.holdOutFrames ?? 6;
    const maxGapSec = opts.maxGapSec ?? 0.6;

    // Defensive: drop empties, sort by start, clamp inverted ranges.
    const clean = words
        .filter((w) => w.text && w.text.trim().length > 0)
        .map((w) => ({ text: w.text.trim(), startSec: w.startSec, endSec: Math.max(w.endSec, w.startSec) }))
        .sort((a, b) => a.startSec - b.startSec);
    if (clean.length === 0) return [];

    const eventGroups = chunkIntoEvents(clean, st.maxWordsPerEvent, maxGapSec);

    const events: CaptionEvent[] = [];
    for (const group of eventGroups) {
        const captionWords: CaptionWord[] = group.map((w, i) => {
            const startFrame = secondsToFrames(w.startSec, fps);
            // Active until the next word starts; last word holds to its own end.
            const nextStartSec = i < group.length - 1 ? group[i + 1].startSec : w.endSec;
            let endFrame = secondsToFrames(nextStartSec, fps);
            if (endFrame <= startFrame) endFrame = startFrame + 1; // guarantee ≥1 frame, no overlap
            return { text: w.text, activeStartFrame: startFrame, activeEndFrame: endFrame };
        });

        const lines = wrapIntoLines(captionWords, st.maxWordsPerLine);
        const startFrame = captionWords[0].activeStartFrame;
        const lastWordEnd = secondsToFrames(group[group.length - 1].endSec, fps);
        const endFrame = Math.max(captionWords[captionWords.length - 1].activeEndFrame, lastWordEnd) + holdOut;

        events.push({ startFrame, endFrame, lines, style: st });
    }
    return events;
}
