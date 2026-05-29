/**
 * ── EDITING RHYTHM PATTERNS ──────────────────────────────────────────────
 * 
 * Research-based editing rhythm patterns that replace flat randomization
 * with structured, predictable-yet-varied clip duration sequences.
 * 
 * Based on:
 * - Eisenstein's Metric Montage (duration-based cutting)
 * - The 2-1-2 pulse pattern (exposition → impact → reflection)
 * - Accelerating/decelerating cut theory (tension building/release)
 * - "Breathing room" pacing design (preventing edit fatigue)
 * - Musical bar structure (4-bar phrases, call-and-response)
 *
 * Each pattern returns a multiplier (0.0–1.0) applied to the clip duration
 * range: duration = min + multiplier * (max - min).
 * A value of 0.0 = shortest possible clip, 1.0 = longest possible clip.
 */

export type RhythmPatternId =
    | 'flat'            // Legacy: pure random (no pattern)
    | 'pulse-2-1-2'     // Long-Short-Long: exposition → impact → reflection
    | 'accelerando'     // Accelerating cuts: progressively shorter
    | 'ritardando'      // Decelerating cuts: progressively longer
    | 'breathing'       // Fast burst → long breather, repeating
    | 'heartbeat'       // Short-short-LONG, like a heartbeat
    | 'cascade'         // Waterfall: long → rapid descent → long landing
    | 'call-response'   // Musical: 4 fast "call" cuts → 1 long "response"
    | 'fibonacci'       // Fibonacci-ratio durations: 1, 1, 2, 3, 5, 3, 2, 1, 1...
    | 'wave'            // Sinusoidal: smooth ebb and flow
    | 'staccato-legato' // Alternating bursts of rapid and sustained cuts
    | 'climax-arc'      // Slow build → fastest at midpoint → slow resolution
    | 'random-walk'     // Brownian: each clip slightly shorter or longer than last
    | 'random';         // Meta: randomly picks a pattern from the pool each clip

export interface RhythmPattern {
    id: RhythmPatternId;
    name: string;
    description: string;
    /** Returns a duration multiplier (0.0 = shortest, 1.0 = longest) */
    getMultiplier: (clipIndex: number, totalClips: number, prevMultiplier: number) => number;
}

// ── PATTERN IMPLEMENTATIONS ──────────────────────────────────────────────

const flatPattern: RhythmPattern = {
    id: 'flat',
    name: 'Pure Random',
    description: 'Flat randomization with no rhythmic structure.',
    getMultiplier: () => Math.random(),
};

const pulse212: RhythmPattern = {
    id: 'pulse-2-1-2',
    name: 'Pulse (2-1-2)',
    description: 'Long-Short-Long: two exposition shots, one impact cut, two reflective shots. Creates a natural editorial heartbeat.',
    getMultiplier: (i) => {
        // 5-clip repeating cycle: Long, Long, Short, Long, Long
        const phase = i % 5;
        if (phase === 2) return 0.1 + Math.random() * 0.15;  // Impact: short
        return 0.6 + Math.random() * 0.35;                     // Exposition/Reflection: long
    },
};

const accelerando: RhythmPattern = {
    id: 'accelerando',
    name: 'Accelerando',
    description: 'Cuts get progressively shorter, building tension and urgency toward a climax.',
    getMultiplier: (i, total) => {
        const progress = total > 1 ? i / (total - 1) : 0;
        // Start at 0.9, end at 0.05 — with slight jitter
        return Math.max(0.05, 0.9 - progress * 0.85 + (Math.random() - 0.5) * 0.1);
    },
};

const ritardando: RhythmPattern = {
    id: 'ritardando',
    name: 'Ritardando',
    description: 'Cuts get progressively longer, providing emotional resolution and letting scenes breathe.',
    getMultiplier: (i, total) => {
        const progress = total > 1 ? i / (total - 1) : 0;
        return Math.min(0.95, 0.1 + progress * 0.85 + (Math.random() - 0.5) * 0.1);
    },
};

const breathing: RhythmPattern = {
    id: 'breathing',
    name: 'Breathing Room',
    description: 'Rapid-fire burst of 3-4 quick cuts, then one long "breather" shot. Prevents edit fatigue.',
    getMultiplier: (i) => {
        const cycle = i % 5;
        if (cycle < 4) return 0.05 + Math.random() * 0.2;  // 4 fast cuts
        return 0.7 + Math.random() * 0.3;                    // 1 breather
    },
};

const heartbeat: RhythmPattern = {
    id: 'heartbeat',
    name: 'Heartbeat',
    description: 'Short-Short-LONG rhythm mimicking a heartbeat (lub-dub-pause). Visceral and primal.',
    getMultiplier: (i) => {
        const phase = i % 3;
        if (phase === 0) return 0.1 + Math.random() * 0.1;   // lub
        if (phase === 1) return 0.15 + Math.random() * 0.1;  // dub
        return 0.65 + Math.random() * 0.3;                    // pause
    },
};

const cascade: RhythmPattern = {
    id: 'cascade',
    name: 'Cascade',
    description: 'Waterfall pattern: one long establishing shot, rapid descent of shorter cuts, then a long landing. Dramatic reveals.',
    getMultiplier: (i) => {
        const cycle = i % 7;
        if (cycle === 0) return 0.85 + Math.random() * 0.15;  // Long opening
        if (cycle <= 4) return Math.max(0.05, 0.4 - cycle * 0.08 + Math.random() * 0.1); // Rapid descent
        if (cycle === 5) return 0.3 + Math.random() * 0.2;     // Recovery
        return 0.8 + Math.random() * 0.2;                      // Long landing
    },
};

const callResponse: RhythmPattern = {
    id: 'call-response',
    name: 'Call & Response',
    description: 'Musical structure: 4 quick "call" cuts answered by 1 long "response" shot. Like a conversation.',
    getMultiplier: (i) => {
        const phase = i % 5;
        if (phase < 4) {
            // Call: 4 quick cuts with slight variation
            return 0.1 + Math.random() * 0.2;
        }
        // Response: 1 long, sustained cut
        return 0.7 + Math.random() * 0.3;
    },
};

const fibonacci: RhythmPattern = {
    id: 'fibonacci',
    name: 'Fibonacci',
    description: 'Clip durations follow the Fibonacci ratio (1,1,2,3,5,3,2,1,1...) creating naturally beautiful, organic pacing.',
    getMultiplier: (i) => {
        // Fibonacci sequence mapped to 0-1: 1,1,2,3,5,3,2,1,1 (palindrome)
        const seq = [1, 1, 2, 3, 5, 3, 2, 1, 1];
        const val = seq[i % seq.length];
        const norm = val / 5; // Normalize against max (5)
        return Math.min(0.95, norm + (Math.random() - 0.5) * 0.1);
    },
};

const wave: RhythmPattern = {
    id: 'wave',
    name: 'Wave',
    description: 'Smooth sinusoidal ebb and flow. Clips gradually lengthen then shorten, like ocean waves.',
    getMultiplier: (i, total) => {
        const progress = total > 1 ? i / (total - 1) : 0;
        const sine = Math.sin(progress * Math.PI * 2); // One full cycle
        return 0.5 + sine * 0.4 + (Math.random() - 0.5) * 0.08;
    },
};

const staccatoLegato: RhythmPattern = {
    id: 'staccato-legato',
    name: 'Staccato/Legato',
    description: 'Alternating blocks of 3 rapid staccato cuts followed by 2 sustained legato shots. Musical and dynamic.',
    getMultiplier: (i) => {
        const _block = Math.floor(i / 5); // 5-clip blocks
        const pos = i % 5;
        if (pos < 3) {
            // Staccato: fast, crisp
            return 0.05 + Math.random() * 0.15;
        }
        // Legato: sustained, flowing
        return 0.6 + Math.random() * 0.35;
    },
};

const climaxArc: RhythmPattern = {
    id: 'climax-arc',
    name: 'Climax Arc',
    description: 'Slow build → fastest cuts at the midpoint → slow resolution. Classic story arc in editing form.',
    getMultiplier: (i, total) => {
        const progress = total > 1 ? i / (total - 1) : 0;
        // Inverted bell curve: slow at edges, fast at center
        const distFromCenter = Math.abs(progress - 0.5) * 2; // 1→0→1
        return Math.min(0.95, distFromCenter * 0.8 + 0.1 + (Math.random() - 0.5) * 0.1);
    },
};

const randomWalk: RhythmPattern = {
    id: 'random-walk',
    name: 'Random Walk',
    description: 'Brownian motion: each clip is slightly shorter or longer than the last. Organic drift.',
    getMultiplier: (_i, _total, prevMultiplier) => {
        const step = (Math.random() - 0.5) * 0.3;
        return Math.max(0.05, Math.min(0.95, prevMultiplier + step));
    },
};

// ── Random meta-pattern: delegates to a randomly chosen pattern per clip ──
const RANDOM_POOL_IDS: RhythmPatternId[] = [
    'flat', 'pulse-2-1-2', 'accelerando', 'ritardando', 'breathing',
    'heartbeat', 'cascade', 'call-response', 'fibonacci', 'wave',
    'staccato-legato', 'climax-arc', 'random-walk',
];

const randomMetaPattern: RhythmPattern = {
    id: 'random',
    name: 'Random',
    description: 'Randomly picks a rhythm pattern from the pool for each clip. Maximum variety.',
    getMultiplier: (i, total, prev) => {
        const pick = RANDOM_POOL_IDS[Math.floor(Math.random() * RANDOM_POOL_IDS.length)];
        // Lazily look up from the registry (defined below)
        return RHYTHM_PATTERNS[pick].getMultiplier(i, total, prev);
    },
};

// ── REGISTRY ──────────────────────────────────────────────────────────────

export const RHYTHM_PATTERNS: Record<RhythmPatternId, RhythmPattern> = {
    'flat': flatPattern,
    'pulse-2-1-2': pulse212,
    'accelerando': accelerando,
    'ritardando': ritardando,
    'breathing': breathing,
    'heartbeat': heartbeat,
    'cascade': cascade,
    'call-response': callResponse,
    'fibonacci': fibonacci,
    'wave': wave,
    'staccato-legato': staccatoLegato,
    'climax-arc': climaxArc,
    'random-walk': randomWalk,
    'random': randomMetaPattern,
};

export const RHYTHM_PATTERN_LIST: RhythmPattern[] = Object.values(RHYTHM_PATTERNS);

/**
 * Resolves a clip duration using a rhythm pattern instead of flat random.
 * 
 * @param pattern    The rhythm pattern to use
 * @param clipIndex  Current clip index in the sequence
 * @param totalClips Estimated total clip count
 * @param minFrames  Minimum clip duration in frames
 * @param maxFrames  Maximum clip duration in frames
 * @param prevMult   Previous multiplier (for patterns like random-walk)
 * @returns { durationFrames, multiplier }
 */
export const resolveRhythmDuration = (
    pattern: RhythmPattern,
    clipIndex: number,
    totalClips: number,
    minFrames: number,
    maxFrames: number,
    prevMult: number = 0.5,
): { durationFrames: number; multiplier: number } => {
    const multiplier = pattern.getMultiplier(clipIndex, totalClips, prevMult);
    const clamped = Math.max(0, Math.min(1, multiplier));
    const durationFrames = Math.max(2, Math.floor(minFrames + clamped * (maxFrames - minFrames)));
    return { durationFrames, multiplier: clamped };
};
