// ══════════════════════════════════════════════════════════════════════════════
// visualHook.ts — SPG (Summarize, Power word, Graphic) Engine
// Generates graphic visual hooks for short-form video content.
// The SPG formula: short text (3-7 words) × at least one power word ×
// a graphic type that frames the viewer's expectation.
//
// Pure utility — no React or UI imports.
// ══════════════════════════════════════════════════════════════════════════════

import type { TextOverlay, TextPosition, TextAnimation } from './textOverlay';
import { DEFAULT_TEXT_OVERLAY } from './textOverlay';

// ── Types ───────────────────────────────────────────────────────────────────

/** The four graphic framings that give the hook its visual context. */
export type GraphicType =
    | 'borrowed-interest'   // Leverage a recognizable icon/trend to grab attention
    | 'value-preview'       // Show a glimpse of the payoff the viewer will receive
    | 'symbolic'            // Use a single metaphoric image to represent the idea
    | 'transformation';     // Before/after or progress imagery

export interface SPGHookConfig {
    /** The hook line — must be 3-7 words for maximum punch. */
    text: string;
    /** Which graphic framing strategy to use. */
    graphicType: GraphicType;
    /** Override auto-detection: manually specify the power word. */
    powerWord?: string;
    /** Where on screen the text appears (default: bottom-center). */
    position?: TextPosition;
    /** Font size in pixels (default: 64). */
    fontSize?: number;
    /** Hex color string (default: '#FFFFFF'). */
    fontColor?: string;
    /** Entry/exit animation (default: 'fade'). */
    animation?: TextAnimation;
    /** How long the overlay stays on screen in seconds (default: 3). */
    durationSeconds?: number;
}

export interface SPGValidation {
    /** Whether the text passes all SPG rules. */
    valid: boolean;
    /** Number of words in the input text. */
    wordCount: number;
    /** True if at least one power word was detected. */
    hasPowerWord: boolean;
    /** Every power word found in the text. */
    detectedPowerWords: string[];
    /** Human-readable issues (empty when valid). */
    issues: string[];
}

export interface SPGHookResult {
    /** The ready-to-render text overlay. */
    overlay: TextOverlay;
    /** The graphic framing used. */
    graphicType: GraphicType;
    /** Validation report for the hook text. */
    validation: SPGValidation;
}

// ── Power Words ─────────────────────────────────────────────────────────────

/**
 * Categorized dictionary of power words.
 * Each category targets a different emotional trigger.
 */
export const POWER_WORDS: Record<string, string[]> = {
    curiosity: [
        'secret', 'hidden', 'unknown', 'mysterious',
        'revealed', 'forbidden', 'untold', 'obscure',
    ],
    urgency: [
        'stop', 'now', 'immediately', 'urgent',
        'critical', 'emergency', 'deadline', 'last-chance',
    ],
    surprise: [
        'shocking', 'unexpected', 'unbelievable', 'insane',
        'mind-blowing', 'jaw-dropping', 'stunning',
    ],
    authority: [
        'ultimate', 'definitive', 'proven', 'guaranteed',
        'official', 'expert', 'masterclass',
    ],
    technology: [
        'hack', 'glitch', 'exploit', 'cheat-code',
        'shortcut', 'loophole', 'workaround',
    ],
    transformation: [
        'transform', 'revolutionize', 'upgrade', 'unleash',
        'unlock', 'maximize', 'dominate',
    ],
    exclusivity: [
        'exclusive', 'rare', 'limited', 'premium',
        'elite', 'vip', 'insider',
    ],
};

/** Flat set of every power word for O(1) lookup. */
const ALL_POWER_WORDS: Set<string> = new Set(
    Object.values(POWER_WORDS).flat(),
);

// ── Internal Helpers ────────────────────────────────────────────────────────

/** Minimum word count for a valid SPG hook. */
const MIN_WORDS = 3;
/** Maximum word count for a valid SPG hook. */
const MAX_WORDS = 7;

/** Simple monotonic counter used when crypto.randomUUID is unavailable. */
let _idCounter = 0;

/** Generate a unique overlay ID. */
function generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `spg-${crypto.randomUUID()}`;
    }
    _idCounter += 1;
    return `spg-${Date.now()}-${_idCounter}`;
}

/**
 * Tokenize text into lowercase words, stripping punctuation.
 * Hyphenated power words (e.g. "last-chance") are kept whole so they match
 * the dictionary, but also split so plain words still count toward length.
 */
function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .split(/\s+/)
        .map(w => w.replace(/[^a-z0-9-]/g, ''))
        .filter(w => w.length > 0);
}

// ── Common "weak" words that a power word could replace ─────────────────────

const WEAK_WORDS = new Set([
    'good', 'great', 'nice', 'cool', 'awesome', 'amazing', 'best',
    'thing', 'stuff', 'way', 'tip', 'trick', 'method', 'change',
    'new', 'big', 'top', 'fast', 'easy', 'simple', 'quick',
    'important', 'special', 'better', 'really', 'very',
]);

// ── Public Functions ────────────────────────────────────────────────────────

/**
 * Detect all power words present in the given text.
 *
 * @param text - The hook text to scan.
 * @returns Array of matching power words (lowercase, deduplicated).
 */
export function detectPowerWords(text: string): string[] {
    const words = tokenize(text);
    const found: string[] = [];
    const seen = new Set<string>();

    for (const word of words) {
        if (ALL_POWER_WORDS.has(word) && !seen.has(word)) {
            seen.add(word);
            found.push(word);
        }
    }

    return found;
}

/**
 * Validate hook text against the SPG formula.
 *
 * Rules:
 *   1. Word count must be between 3 and 7 (inclusive).
 *   2. At least one power word should be present (advisory — not a hard fail).
 *   3. Text must not be empty or whitespace-only.
 *
 * @param text - The hook text to validate.
 * @returns Detailed validation result.
 */
export function validateSPG(text: string): SPGValidation {
    const issues: string[] = [];
    const trimmed = text.trim();

    if (trimmed.length === 0) {
        return {
            valid: false,
            wordCount: 0,
            hasPowerWord: false,
            detectedPowerWords: [],
            issues: ['Text is empty.'],
        };
    }

    const words = tokenize(trimmed);
    const wordCount = words.length;

    if (wordCount < MIN_WORDS) {
        issues.push(
            `Too few words (${wordCount}). SPG hooks need at least ${MIN_WORDS}.`,
        );
    }
    if (wordCount > MAX_WORDS) {
        issues.push(
            `Too many words (${wordCount}). SPG hooks should be ${MAX_WORDS} words max.`,
        );
    }

    const detectedPowerWords = detectPowerWords(trimmed);
    const hasPowerWord = detectedPowerWords.length > 0;

    if (!hasPowerWord) {
        issues.push(
            'No power word detected. Add one to increase hook strength.',
        );
    }

    return {
        valid: issues.length === 0,
        wordCount,
        hasPowerWord,
        detectedPowerWords,
        issues,
    };
}

/**
 * Suggest power words that could replace weak/generic words in the text.
 *
 * If a `category` is supplied, suggestions are drawn only from that category;
 * otherwise all categories are considered.
 *
 * @param text     - The original hook text.
 * @param category - Optional power-word category to draw from.
 * @returns Array of suggested power words (deduplicated).
 */
export function suggestPowerWords(text: string, category?: string): string[] {
    const words = tokenize(text);

    // Determine the pool of candidates.
    let pool: string[];
    if (category && POWER_WORDS[category]) {
        pool = POWER_WORDS[category];
    } else {
        pool = Array.from(ALL_POWER_WORDS);
    }

    // If the text already contains weak words, score candidates that share a
    // first letter (loose heuristic for "feels like a replacement").  Otherwise
    // return the full pool — the caller can pick.
    const weakInText = words.filter(w => WEAK_WORDS.has(w));

    if (weakInText.length === 0) {
        // No weak words — return up to 5 candidates from the pool.
        return pool.slice(0, 5);
    }

    const suggestions = new Set<string>();

    for (const weak of weakInText) {
        const initial = weak[0];
        for (const candidate of pool) {
            if (candidate[0] === initial) {
                suggestions.add(candidate);
            }
        }
    }

    // If the letter heuristic yielded nothing, fall back to generic picks.
    if (suggestions.size === 0) {
        return pool.slice(0, 5);
    }

    return Array.from(suggestions);
}

/**
 * Returns a human-readable description for each graphic type, including a
 * concrete example to guide creators.
 *
 * @param type - The graphic framing type.
 * @returns Label, description, and example for the graphic type.
 */
export function graphicTypeDescription(
    type: GraphicType,
): { label: string; description: string; example: string } {
    switch (type) {
        case 'borrowed-interest':
            return {
                label: 'Borrowed Interest',
                description:
                    'Leverage a trending topic, recognizable brand, or cultural reference to instantly capture attention.',
                example:
                    'A hook about productivity showing a well-known CEO portrait in the background.',
            };
        case 'value-preview':
            return {
                label: 'Value Preview',
                description:
                    'Give the viewer a taste of the payoff — show the result, the outcome, or the key insight upfront.',
                example:
                    'A before/after screenshot of a redesigned dashboard placed behind the text.',
            };
        case 'symbolic':
            return {
                label: 'Symbolic',
                description:
                    'Use a single powerful metaphor or icon to represent the core idea without literal depiction.',
                example:
                    'A padlock icon behind "The Secret Hack" to represent hidden knowledge.',
            };
        case 'transformation':
            return {
                label: 'Transformation',
                description:
                    'Show progression, a before/after split, or a status change that implies the viewer will evolve.',
                example:
                    'A split-screen showing messy code on the left and clean code on the right.',
            };
    }
}

/**
 * Generate a fully-configured TextOverlay from an SPG hook configuration.
 *
 * The overlay is built on top of `DEFAULT_TEXT_OVERLAY`, then overridden with
 * SPG-specific defaults (bold, large font, bottom-center, fade animation)
 * and finally any explicit values from `config`.
 *
 * @param config - The SPG hook configuration.
 * @returns The overlay, graphic type, and validation report.
 */
export function generateSPGHook(config: SPGHookConfig): SPGHookResult {
    const validation = validateSPG(config.text);

    const durationSeconds = config.durationSeconds ?? 3;

    const overlay: TextOverlay = {
        // Spread sensible base values, then apply SPG-specific overrides.
        ...DEFAULT_TEXT_OVERLAY,

        id: generateId(),
        text: config.text.trim(),

        // SPG defaults — bold, large, prominent.
        fontWeight: 'bold',
        fontSize: config.fontSize ?? 64,
        fontColor: config.fontColor ?? '#FFFFFF',
        position: config.position ?? 'bottom-center',
        animation: config.animation ?? 'fade',
        animationDuration: 0.5,

        // Timing
        startTime: 0,
        endTime: durationSeconds,

        // Ensure full visibility with drop shadow for legibility.
        opacity: 1.0,
        shadow: true,
    };

    return {
        overlay,
        graphicType: config.graphicType,
        validation,
    };
}
