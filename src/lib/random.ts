import seedrandom from 'seedrandom';

/**
 * Deterministic Random Number Generator
 * Contract 4: Randomization Engine Determinism
 * 
 * Given identical seed, this produces identical random sequences.
 */
export class SeededRandom {
    private rng: any;

    constructor(seed: string) {
        this.rng = seedrandom(seed);
    }

    /**
     * Returns random number between 0 (inclusive) and 1 (exclusive)
     */
    random(): number {
        return this.rng();
    }

    /**
     * Returns random integer between min (inclusive) and max (exclusive)
     */
    randInt(min: number, max: number): number {
        return Math.floor(this.random() * (max - min)) + min;
    }

    /**
     * Shuffles array in-place using Fisher-Yates algorithm
     * Returns the shuffled array for chaining
     */
    shuffle<T>(array: T[]): T[] {
        const arr = [...array]; // Clone to avoid mutation
        for (let i = arr.length - 1; i > 0; i--) {
            const j = this.randInt(0, i + 1);
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    /**
     * Returns random element from array
     */
    choice<T>(array: T[]): T | undefined {
        if (array.length === 0) return undefined;
        return array[this.randInt(0, array.length)];
    }
}

/**
 * Generates a deterministic seed from current timestamp
 */
export function generateSeed(): string {
    return `seed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
