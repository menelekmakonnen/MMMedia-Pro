// ══════════════════════════════════════════════════════════════════════════════
// ege/variationOperators.ts — Seedable variation operators.
//
// Given a base StyleRecipe + a seed, produce a VARIED recipe that is distinct but
// still on-brand: rotate the transition palette, jitter effect frequencies within
// bounds, vary the pacing curve, and swap the clip-order mode. Same inputs + same
// seed → identical output (deterministic); different seeds → different on-brand
// edits. This is what lets one recipe yield infinite valid cuts.
//
// Uses the same mulberry32 PRNG + string-seed hash as clipOrdering.ts /
// returnTransitions.ts, so behaviour matches the rest of the engine.
//
// PURE: no React, no IPC, no filesystem. Never mutates the input recipe.
// ══════════════════════════════════════════════════════════════════════════════

import type {
    StyleRecipe,
    PacingCurve,
    TransitionPalette,
    EffectFrequencies,
    ClipOrderDefaults,
} from './styleRecipes';
import type { TransitionType, EffectApplyPolicy } from '../../types';
import type { ClipOrderMode } from '../clipOrdering';

// ── Seeded RNG (identical to the other pure modules) ─────────────────────────

function mulberry32(a: number) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function seedToInt(seed?: number | string): number {
    if (typeof seed === 'number') return (seed >>> 0) || 1;
    const s = String(seed ?? '1');
    let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (Math.abs(h) >>> 0) || 1;
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

/** Rotate an array left by `n` (non-mutating). */
function rotate<T>(arr: T[], n: number): T[] {
    if (arr.length === 0) return arr;
    const k = ((n % arr.length) + arr.length) % arr.length;
    return [...arr.slice(k), ...arr.slice(0, k)];
}

function pick<T>(arr: readonly T[], rand: () => number): T {
    return arr[Math.floor(rand() * arr.length)];
}

// ── Bounds — variation must never escape "on-brand" ──────────────────────────

/** Effect policies that variation may shift between, ordered by intensity. */
const POLICY_LADDER: EffectApplyPolicy[] = ['off', 'sparingly', 'per-beat', 'every-clip'];

/** Nudge a policy up or down ONE rung at most (never jumps off→every-clip). An
 *  'off' policy stays off — variation never invents an effect a recipe excluded. */
function jitterPolicy(policy: EffectApplyPolicy, rand: () => number): EffectApplyPolicy {
    if (policy === 'off') return 'off'; // respect the recipe's intent to exclude it
    const idx = POLICY_LADDER.indexOf(policy);
    const roll = rand();
    if (roll < 0.34 && idx > 1) return POLICY_LADDER[idx - 1]; // step down (but not to off)
    if (roll > 0.66 && idx < POLICY_LADDER.length - 1) return POLICY_LADDER[idx + 1]; // step up
    return policy;
}

/** Pacing shapes are kept within an energy-equivalent neighbourhood per shape so
 *  a steady recipe never becomes a frantic pulse. */
const PACING_NEIGHBORS: Record<PacingCurve['shape'], PacingCurve['shape'][]> = {
    accelerate: ['accelerate', 'build-drop', 'pulse'],
    decelerate: ['decelerate', 'wave', 'steady'],
    wave: ['wave', 'decelerate', 'steady'],
    steady: ['steady', 'wave', 'build-drop'],
    pulse: ['pulse', 'accelerate', 'build-drop'],
    'build-drop': ['build-drop', 'accelerate', 'pulse'],
};

/** Clip-order modes a recipe may rotate through. Sequential family and the
 *  random family stay within their own neighbourhood so structure intent holds. */
const ORDER_NEIGHBORS: Record<ClipOrderMode, ClipOrderMode[]> = {
    none: ['none', 'sequential'],
    sequential: ['sequential', 'sequential-randomized', 'randomized-sequential'],
    'sequential-randomized': ['sequential-randomized', 'sequential', 'randomized-sequential'],
    'randomized-sequential': ['randomized-sequential', 'sequential-randomized', 'randomize'],
    randomize: ['randomize', 'randomized-sequential'],
};

// ── Individual operators ─────────────────────────────────────────────────────

function varyPacing(p: PacingCurve, rand: () => number): PacingCurve {
    const shape = pick(PACING_NEIGHBORS[p.shape], rand);
    // Jitter clip bounds by ±20% but keep ordering and sane floors.
    const jitter = (v: number) => v * (0.85 + rand() * 0.3); // 0.85–1.15×
    let lo = jitter(p.clipSeconds[0]);
    let hi = jitter(p.clipSeconds[1]);
    lo = clamp(lo, 0.15, 8);
    hi = clamp(hi, lo + 0.1, 10);
    // Occasionally bump the beat divisor within {1,2,4} but never below the recipe's.
    const divisors = [1, 2, 4].filter(d => d >= p.beatDivisor || d === p.beatDivisor);
    const beatDivisor = rand() < 0.3 ? pick(divisors.length ? divisors : [p.beatDivisor], rand) : p.beatDivisor;
    return {
        shape,
        clipSeconds: [Number(lo.toFixed(3)), Number(hi.toFixed(3))],
        rhythmPattern: p.rhythmPattern, // rhythm id stays — it's part of brand identity
        beatDivisor,
    };
}

function varyTransitions(t: TransitionPalette, rand: () => number): TransitionPalette {
    // Rotate the palette so a different transition leads, optionally drop one.
    let palette = rotate(t.palette, 1 + Math.floor(rand() * Math.max(1, t.palette.length)));
    if (palette.length > 3 && rand() < 0.4) {
        palette = palette.slice(0, palette.length - 1); // thin the palette slightly
    }
    // Jitter frequency ±0.12 within a sane band, keeping the style's character.
    const frequency = clamp(t.frequency + (rand() - 0.5) * 0.24, 0.1, 0.7);
    // Jitter duration ±25% within 80–600ms.
    const durationMs = clamp(Math.round(t.durationMs * (0.8 + rand() * 0.4)), 80, 600);
    return {
        style: t.style,
        palette: palette as TransitionType[],
        frequency: Number(frequency.toFixed(3)),
        durationMs,
        returns: t.returns, // return-leg eligibility is a brand trait, kept as-is
    };
}

function varyEffects(e: EffectFrequencies, rand: () => number): EffectFrequencies {
    return {
        motionBlur: jitterPolicy(e.motionBlur, rand),
        glow: jitterPolicy(e.glow, rand),
        rgbSplit: jitterPolicy(e.rgbSplit, rand),
        hueCycle: jitterPolicy(e.hueCycle, rand),
        vhs: jitterPolicy(e.vhs, rand),
        vibrationFlash: jitterPolicy(e.vibrationFlash, rand),
        doubleExposure: jitterPolicy(e.doubleExposure, rand),
        // shake + beatDropImpact are categorical brand markers — keep them.
        shake: e.shake,
        beatDropImpact: e.beatDropImpact,
        // Grain/vignette jitter within ±25%, clamped to their settings ranges.
        filmGrain: clamp(Math.round(e.filmGrain * (0.75 + rand() * 0.5)), 0, 25),
        vignette: clamp(Math.round(e.vignette * (0.75 + rand() * 0.5)), 0, 100),
    };
}

function varyClipOrder(c: ClipOrderDefaults, rand: () => number): ClipOrderDefaults {
    const mode = pick(ORDER_NEIGHBORS[c.mode], rand);
    return { mode, sequentialBy: c.sequentialBy };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Produce a varied-but-on-brand copy of `recipe` for the given `seed`.
 * Deterministic: same recipe + same seed → identical output. The input is never
 * mutated. Identity fields (id, label, generatorMode), the rhythm pattern, and
 * categorical brand markers (shake, beatDropImpact, caption/aspect/audio) are
 * preserved; only the variation-eligible fields move, and always within bounds.
 */
export function varyRecipe(recipe: StyleRecipe, seed: number | string): StyleRecipe {
    const rand = mulberry32(seedToInt(seed));
    return {
        ...recipe,
        pacing: varyPacing(recipe.pacing, rand),
        transitions: varyTransitions(recipe.transitions, rand),
        effects: varyEffects(recipe.effects, rand),
        clipOrder: varyClipOrder(recipe.clipOrder, rand),
        // color / caption / aspect / audio define the style's identity — untouched.
    };
}

/**
 * Human-readable, single-line summary of how a variation differs from its base —
 * for logging / debugging which seed produced which edit.
 */
export function describeVariation(base: StyleRecipe, varied: StyleRecipe): string {
    const parts: string[] = [];

    if (varied.pacing.shape !== base.pacing.shape) {
        parts.push(`pacing ${base.pacing.shape}→${varied.pacing.shape}`);
    }
    const [bl, bh] = base.pacing.clipSeconds;
    const [vl, vh] = varied.pacing.clipSeconds;
    if (bl !== vl || bh !== vh) {
        parts.push(`clip ${bl}-${bh}s→${vl}-${vh}s`);
    }
    if (varied.pacing.beatDivisor !== base.pacing.beatDivisor) {
        parts.push(`beatDiv ${base.pacing.beatDivisor}→${varied.pacing.beatDivisor}`);
    }
    if (varied.transitions.palette[0] !== base.transitions.palette[0] || varied.transitions.palette.length !== base.transitions.palette.length) {
        parts.push(`palette lead ${base.transitions.palette[0]}→${varied.transitions.palette[0]} (${varied.transitions.palette.length} types)`);
    }
    if (varied.transitions.frequency !== base.transitions.frequency) {
        parts.push(`transFreq ${base.transitions.frequency}→${varied.transitions.frequency}`);
    }
    if (varied.transitions.durationMs !== base.transitions.durationMs) {
        parts.push(`transDur ${base.transitions.durationMs}→${varied.transitions.durationMs}ms`);
    }
    const effKeys: (keyof EffectFrequencies)[] = ['motionBlur', 'glow', 'rgbSplit', 'hueCycle', 'vhs', 'vibrationFlash', 'doubleExposure', 'filmGrain', 'vignette'];
    for (const k of effKeys) {
        if (base.effects[k] !== varied.effects[k]) parts.push(`${k} ${base.effects[k]}→${varied.effects[k]}`);
    }
    if (varied.clipOrder.mode !== base.clipOrder.mode) {
        parts.push(`order ${base.clipOrder.mode}→${varied.clipOrder.mode}`);
    }

    return parts.length
        ? `[variation ${varied.id}] ${parts.join(', ')}`
        : `[variation ${varied.id}] (no change)`;
}
