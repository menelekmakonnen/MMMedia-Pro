import { describe, it, expect } from 'vitest';
import { SeededRandom, generateSeed } from '../random';
import { RHYTHM_PATTERNS, resolveRhythmDuration, RHYTHM_PATTERN_LIST, RhythmPatternId } from '../rhythmPatterns';
import { mixTemplates, templateToSettings } from '../templateMixer';

// ══════════════════════════════════════════════════════════════════════════════
// SEEDED RANDOM
// ══════════════════════════════════════════════════════════════════════════════

describe('SeededRandom', () => {
    it('produces deterministic sequences from same seed', () => {
        const a = new SeededRandom('test-seed');
        const b = new SeededRandom('test-seed');
        for (let i = 0; i < 100; i++) {
            expect(a.random()).toBe(b.random());
        }
    });

    it('produces different sequences from different seeds', () => {
        const a = new SeededRandom('seed-alpha');
        const b = new SeededRandom('seed-beta');
        // At least one of 10 values should differ
        const diffs = Array.from({ length: 10 }, () => a.random() !== b.random());
        expect(diffs.some(Boolean)).toBe(true);
    });

    it('random() returns values in [0, 1)', () => {
        const rng = new SeededRandom('range-test');
        for (let i = 0; i < 1000; i++) {
            const v = rng.random();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it('randInt returns values in [min, max)', () => {
        const rng = new SeededRandom('randint-test');
        for (let i = 0; i < 500; i++) {
            const v = rng.randInt(5, 10);
            expect(v).toBeGreaterThanOrEqual(5);
            expect(v).toBeLessThan(10);
        }
    });

    it('shuffle is deterministic', () => {
        const a = new SeededRandom('shuffle-seed');
        const b = new SeededRandom('shuffle-seed');
        const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        expect(a.shuffle(arr)).toEqual(b.shuffle(arr));
    });

    it('shuffle does not mutate original array', () => {
        const rng = new SeededRandom('no-mutate');
        const arr = [1, 2, 3];
        const copy = [...arr];
        rng.shuffle(arr);
        expect(arr).toEqual(copy);
    });

    it('choice selects from array deterministically', () => {
        const a = new SeededRandom('choice-seed');
        const b = new SeededRandom('choice-seed');
        const items = ['a', 'b', 'c', 'd', 'e'];
        for (let i = 0; i < 20; i++) {
            expect(a.choice(items)).toBe(b.choice(items));
        }
    });

    it('choice returns undefined for empty array', () => {
        const rng = new SeededRandom('empty');
        expect(rng.choice([])).toBeUndefined();
    });

    it('random() works when passed as unbound property reference', () => {
        // This tests the bind fix — rhythmPatterns does: rng?.random
        const rng = new SeededRandom('bind-test');
        const r = rng.random; // Unbound reference
        expect(() => r()).not.toThrow();
        expect(r()).toBeGreaterThanOrEqual(0);
        expect(r()).toBeLessThan(1);
    });
});

describe('generateSeed', () => {
    it('returns a string', () => {
        expect(typeof generateSeed()).toBe('string');
    });

    it('generates unique seeds', () => {
        const seeds = new Set(Array.from({ length: 100 }, () => generateSeed()));
        expect(seeds.size).toBeGreaterThan(90); // Allow tiny collision chance
    });

    it('starts with "seed_" prefix', () => {
        expect(generateSeed()).toMatch(/^seed_/);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// RHYTHM PATTERNS
// ══════════════════════════════════════════════════════════════════════════════

describe('RhythmPatterns', () => {
    it('registry contains all declared pattern IDs', () => {
        const expectedIds: RhythmPatternId[] = [
            'flat', 'pulse-2-1-2', 'accelerando', 'ritardando', 'breathing',
            'heartbeat', 'cascade', 'call-response', 'fibonacci', 'wave',
            'staccato-legato', 'climax-arc', 'random-walk', 'random',
        ];
        for (const id of expectedIds) {
            expect(RHYTHM_PATTERNS[id]).toBeDefined();
            expect(RHYTHM_PATTERNS[id].id).toBe(id);
        }
    });

    it('RHYTHM_PATTERN_LIST matches registry size', () => {
        expect(RHYTHM_PATTERN_LIST.length).toBe(Object.keys(RHYTHM_PATTERNS).length);
    });

    describe('getMultiplier', () => {
        const rng = { random: () => 0.5 }; // Fixed rng for deterministic tests

        it('all patterns return multipliers in [0, 1]', () => {
            for (const pattern of RHYTHM_PATTERN_LIST) {
                if (pattern.id === 'random') continue; // Meta-pattern delegates
                for (let i = 0; i < 20; i++) {
                    const m = pattern.getMultiplier(i, 20, 0.5, rng);
                    expect(m).toBeGreaterThanOrEqual(-0.01); // Allow tiny float error
                    expect(m).toBeLessThanOrEqual(1.01);
                }
            }
        });

        it('accelerando produces decreasing multipliers', () => {
            const pattern = RHYTHM_PATTERNS.accelerando;
            const rng = { random: () => 0.5 };
            const vals = Array.from({ length: 10 }, (_, i) =>
                pattern.getMultiplier(i, 10, 0.5, rng)
            );
            // First value should be larger than last
            expect(vals[0]).toBeGreaterThan(vals[9]);
        });

        it('ritardando produces increasing multipliers', () => {
            const pattern = RHYTHM_PATTERNS.ritardando;
            const rng = { random: () => 0.5 };
            const vals = Array.from({ length: 10 }, (_, i) =>
                pattern.getMultiplier(i, 10, 0.5, rng)
            );
            expect(vals[9]).toBeGreaterThan(vals[0]);
        });

        it('heartbeat has short-short-LONG 3-cycle pattern', () => {
            const pattern = RHYTHM_PATTERNS.heartbeat;
            const rng = { random: () => 0.5 };
            const vals = Array.from({ length: 6 }, (_, i) =>
                pattern.getMultiplier(i, 6, 0.5, rng)
            );
            // positions 0,1 (lub,dub) should be < position 2 (pause)
            expect(vals[0]).toBeLessThan(vals[2]);
            expect(vals[1]).toBeLessThan(vals[2]);
            // Pattern repeats
            expect(vals[3]).toBeLessThan(vals[5]);
        });

        it('patterns accept SeededRandom instance', () => {
            const srng = new SeededRandom('pattern-test');
            const pattern = RHYTHM_PATTERNS.flat;
            const v = pattern.getMultiplier(0, 10, 0.5, srng);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        });

        it('patterns fall back to Math.random when rng is undefined', () => {
            const pattern = RHYTHM_PATTERNS.flat;
            const v = pattern.getMultiplier(0, 10, 0.5, undefined);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        });
    });
});

describe('resolveRhythmDuration', () => {
    it('returns frame count within [min, max] range', () => {
        const rng = new SeededRandom('resolve-test');
        for (let i = 0; i < 50; i++) {
            const { durationFrames } = resolveRhythmDuration(
                RHYTHM_PATTERNS.flat, i, 50, 5, 30, 0.5, rng
            );
            expect(durationFrames).toBeGreaterThanOrEqual(2);
            expect(durationFrames).toBeLessThanOrEqual(30);
        }
    });

    it('multiplier is clamped to [0, 1]', () => {
        const rng = new SeededRandom('clamp-test');
        for (let i = 0; i < 50; i++) {
            const { multiplier } = resolveRhythmDuration(
                RHYTHM_PATTERNS.flat, i, 50, 5, 30, 0.5, rng
            );
            expect(multiplier).toBeGreaterThanOrEqual(0);
            expect(multiplier).toBeLessThanOrEqual(1);
        }
    });

    it('is deterministic with same seed', () => {
        const a = new SeededRandom('det-test');
        const b = new SeededRandom('det-test');
        for (let i = 0; i < 20; i++) {
            const ra = resolveRhythmDuration(RHYTHM_PATTERNS.breathing, i, 20, 5, 30, 0.5, a);
            const rb = resolveRhythmDuration(RHYTHM_PATTERNS.breathing, i, 20, 5, 30, 0.5, b);
            expect(ra.durationFrames).toBe(rb.durationFrames);
            expect(ra.multiplier).toBe(rb.multiplier);
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEMPLATE MIXER
// ══════════════════════════════════════════════════════════════════════════════

describe('mixTemplates', () => {
    it('returns pulse defaults when no templates specified', () => {
        const result = mixTemplates([]);
        expect(result.sourceTemplates).toEqual(['pulse']);
    });

    it('single template returns its values directly', () => {
        const result = mixTemplates(['impact']);
        expect(result.minClip).toBe(0.08);
        expect(result.maxClip).toBe(4.0);
        expect(result.burstOnDrops).toBe(true);
        expect(result.reverseOnHits).toBe(true);
    });

    it('mixing expands clip range (min of mins, max of maxes)', () => {
        const result = mixTemplates(['pulse', 'flow']);
        // pulse minClip=0.3, flow minClip=2.0 → min is 0.3
        expect(result.minClip).toBe(0.3);
        // pulse maxClip=2.0, flow maxClip=8.0 → max is 8.0
        expect(result.maxClip).toBe(8.0);
    });

    it('booleans use OR logic', () => {
        const result = mixTemplates(['narrative', 'impact']);
        // narrative: burstOnDrops=false, impact: burstOnDrops=true
        expect(result.burstOnDrops).toBe(true);
        // narrative: reverseOnHits=false, impact: reverseOnHits=true
        expect(result.reverseOnHits).toBe(true);
    });

    it('CPM is weighted average', () => {
        const result = mixTemplates(['pulse', 'rapid']);
        // pulse minCPM=15, rapid minCPM=40 → avg = 27.5
        expect(result.minCPM).toBeCloseTo(27.5);
    });

    it('speed range expands to encompass all templates', () => {
        const result = mixTemplates(['flow', 'rapid']);
        // flow: [0.5, 1.5], rapid: [1.0, 2.0]
        expect(result.speedRange[0]).toBe(0.5);
        expect(result.speedRange[1]).toBe(2.0);
    });
});

describe('templateToSettings', () => {
    it('converts mixed template to TrailerSettings overrides', () => {
        const mixed = mixTemplates(['pulse']);
        const settings = templateToSettings(mixed);
        expect(settings.shortestClip).toBe(0.3);
        expect(settings.longestClip).toBe(2.0);
        expect(settings.rhythmPattern).toBe('breathing');
        expect(settings.allowDuplicates).toBe(true);
    });

    it('includes template-specific fields', () => {
        const mixed = mixTemplates(['impact']);
        const settings = templateToSettings(mixed);
        expect(settings.templateBurstOnDrops).toBe(true);
        expect(settings.templateReverseOnHits).toBe(true);
        expect(settings.templateUseSpeedRamps).toBe(true);
    });
});
