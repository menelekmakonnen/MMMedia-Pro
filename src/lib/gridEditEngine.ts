/**
 * Grid Edit Engine — Multi-cell EGE orchestrator
 * ════════════════════════════════════════════════════════════════════════════
 * Runs the Edit Generator Engine (EGE) across all cells of a GridClip,
 * producing a fully-generated grid with independent clip timelines per cell.
 *
 * All functions are pure — no side effects, no store mutations, no DOM access.
 * Every output is a fresh object (immutable update pattern).
 */

import type { GridClip, GridCell, CellOrientation, Clip } from '../types';
import {
    type TrailerSettings,
    DEFAULT_TRAILER_SETTINGS,
    generateTrailerSequence,
} from './trailerGenerator';
import type { MediaFile } from '../store/mediaStore';
import type { AudioAnalysisResult } from './audioAnalysis';

// ═══════════════════════════════════════════════════════════════════════════
//  SETTINGS MERGE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Merge grid-level defaults with cell-level overrides into a concrete
 * `TrailerSettings`.
 *
 * Layering order (last wins):
 *   1. `DEFAULT_TRAILER_SETTINGS`  — factory defaults
 *   2. `gridSettings`              — grid-wide overrides
 *   3. `cellSettings`              — per-cell overrides
 *
 * Only defined keys in each layer participate; `undefined` values are
 * silently skipped so lower layers shine through.
 */
export function mergeCellSettings(
    gridSettings: Partial<TrailerSettings> | undefined,
    cellSettings: Partial<TrailerSettings> | undefined,
): TrailerSettings {
    // Start from the canonical defaults, then layer grid → cell.
    // We use a two-pass spread so `undefined` values from one layer don't
    // clobber concrete values from the previous layer.
    const base: TrailerSettings = { ...DEFAULT_TRAILER_SETTINGS };

    if (gridSettings) {
        for (const key of Object.keys(gridSettings) as (keyof TrailerSettings)[]) {
            if (gridSettings[key] !== undefined) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (base as any)[key] = gridSettings[key];
            }
        }
    }

    if (cellSettings) {
        for (const key of Object.keys(cellSettings) as (keyof TrailerSettings)[]) {
            if (cellSettings[key] !== undefined) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (base as any)[key] = cellSettings[key];
            }
        }
    }

    return base;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ORIENTATION DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Auto-detect cell orientation from its assigned media dimensions.
 *
 * Counts how many of the cell's files are vertical (height > width),
 * horizontal (width > height), or square and returns the majority.
 * Ties and empty sets resolve to `'horizontal'` as a safe default.
 */
export function detectCellOrientation(
    cellMediaIds: string[],
    allFiles: MediaFile[],
): CellOrientation {
    if (cellMediaIds.length === 0) return 'horizontal';

    // Build a fast lookup set for the cell's media IDs.
    const idSet = new Set(cellMediaIds);
    const cellFiles = allFiles.filter((f) => idSet.has(f.id));

    if (cellFiles.length === 0) return 'horizontal';

    let vertical = 0;
    let horizontal = 0;
    // Square count is tracked implicitly — only vertical and horizontal vote.

    for (const file of cellFiles) {
        const w = file.width ?? 0;
        const h = file.height ?? 0;
        if (h > w) vertical++;
        else if (w > h) horizontal++;
        // Square (w === h) does not vote for either side.
    }

    if (vertical > horizontal) return 'vertical';
    // 'horizontal' wins on tie or when no votes cast (all square).
    return 'horizontal';
}

// ═══════════════════════════════════════════════════════════════════════════
//  MEDIA DISTRIBUTION
// ═══════════════════════════════════════════════════════════════════════════

/** Seeded pseudo-random number generator (Mulberry32). */
function mulberry32(seed: number): () => number {
    let s = seed | 0;
    return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Fisher-Yates shuffle (in-place) using the supplied random source. */
function shuffle<T>(arr: T[], rand: () => number): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Distribute media across grid cells using the specified strategy.
 *
 * Returns an array of `numCells` sub-arrays, each containing media IDs
 * allocated to that cell. Every file appears exactly once.
 *
 * Strategies:
 *   - `'round-robin'`      — File 0 → cell 0, file 1 → cell 1, etc.
 *   - `'by-orientation'`   — Vertical media grouped together, horizontal
 *                            together, then groups are dealt to cells.
 *   - `'random'`           — Shuffled, then distributed evenly.
 */
export function distributeMediaToCells(
    files: MediaFile[],
    numCells: number,
    strategy: 'round-robin' | 'by-orientation' | 'random',
): string[][] {
    if (numCells <= 0) return [];

    // Initialise empty buckets.
    const buckets: string[][] = Array.from({ length: numCells }, () => []);

    if (files.length === 0) return buckets;

    switch (strategy) {
        case 'round-robin': {
            for (let i = 0; i < files.length; i++) {
                buckets[i % numCells].push(files[i].id);
            }
            break;
        }

        case 'by-orientation': {
            // Partition into vertical / horizontal / square groups.
            const vertical: MediaFile[] = [];
            const horizontal: MediaFile[] = [];
            const square: MediaFile[] = [];

            for (const file of files) {
                const w = file.width ?? 0;
                const h = file.height ?? 0;
                if (h > w) vertical.push(file);
                else if (w > h) horizontal.push(file);
                else square.push(file);
            }

            // Concatenate groups so same-orientation files cluster together,
            // then deal round-robin across cells.
            const ordered = [...vertical, ...horizontal, ...square];
            for (let i = 0; i < ordered.length; i++) {
                buckets[i % numCells].push(ordered[i].id);
            }
            break;
        }

        case 'random': {
            // Use a time-based seed for true randomness per invocation.
            const rand = mulberry32(Date.now() ^ (files.length * 7919));
            const shuffled = shuffle([...files], rand);
            for (let i = 0; i < shuffled.length; i++) {
                buckets[i % numCells].push(shuffled[i].id);
            }
            break;
        }
    }

    return buckets;
}

// ═══════════════════════════════════════════════════════════════════════════
//  SINGLE-CELL GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate clips for a single grid cell.
 *
 * Merges grid-level and cell-level settings, injects the grid's
 * `masterDurationSec` as the `targetDuration`, wires up beat timestamps
 * when the grid is beat-locked, seeds the RNG, then delegates to the
 * core EGE via `generateTrailerSequence`.
 */
export function generateCellSequence(
    cell: GridCell,
    cellPool: MediaFile[],
    mergedSettings: TrailerSettings,
    audioAnalysis: AudioAnalysisResult | null,
    fps: number,
): Clip[] {
    // Clone the merged settings so we can mutate locally without side effects.
    const settings: Partial<TrailerSettings> = { ...mergedSettings };

    // Inject FPS so the EGE uses the project frame rate.
    settings.fps = fps;

    // Set the seed: prefer the cell's explicit seed; otherwise generate one.
    if (cell.generationSeed !== undefined) {
        settings.seed = String(cell.generationSeed);
    } else {
        // Deterministic-ish seed derived from cell id and timestamp so each
        // cell in the same generation pass gets a unique sequence.
        const hash = cell.id
            .split('')
            .reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0);
        settings.seed = String(Math.abs(hash ^ Date.now()));
    }

    // Pipe beat timestamps from audio analysis when the grid is beat-locked.
    // The caller passes audioAnalysis only when syncMode is 'beat-locked'.
    if (audioAnalysis) {
        settings.useAudioGuide = true;
        settings.beatTimestamps = audioAnalysis.gridBeats ?? null;
        settings.audioAnalysis = audioAnalysis;
    }

    // Orientation filter — map cell orientation to the EGE's filter vocabulary.
    if (cell.cellOrientation && cell.cellOrientation !== 'auto') {
        settings.orientationFilter = cell.cellOrientation;
    }

    return generateTrailerSequence(cellPool, settings);
}

// ═══════════════════════════════════════════════════════════════════════════
//  FULL GRID GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve the media pool for a specific cell.
 *
 * If the cell has explicit `cellMediaIds`, filter the global pool to those.
 * Otherwise return `null` to signal that the caller should use distributed media.
 */
function resolveCellPool(
    cell: GridCell,
    globalPool: MediaFile[],
): MediaFile[] | null {
    if (!cell.cellMediaIds || cell.cellMediaIds.length === 0) return null;

    const idSet = new Set(cell.cellMediaIds);
    return globalPool.filter((f) => idSet.has(f.id));
}

/**
 * Run the Grid Edit Engine: generates clips for every cell in a grid.
 *
 * For each cell:
 *   1. Resolves the media pool (per-cell assignment or distributed from global).
 *   2. Auto-detects cell orientation when `grid.autoOrientation` is enabled.
 *   3. Merges settings (factory → grid-level → cell-level).
 *   4. Generates the clip sequence via the core EGE.
 *   5. Marks the cell as `isGenerated: true`.
 *
 * Returns a **new** `GridClip` — no mutation of the input.
 */
export function generateGridSequence(
    grid: GridClip,
    globalPool: MediaFile[],
    audioAnalysis: AudioAnalysisResult | null,
    fps: number,
): GridClip {
    const numCells = grid.cells.length;

    // Pre-distribute media for cells that don't have explicit assignments.
    // Default to round-robin when no strategy is specified on the grid.
    const distributed = distributeMediaToCells(globalPool, numCells, 'round-robin');

    // Only pass audio analysis through when the grid is beat-locked.
    const beatLockedAudio =
        grid.syncMode === 'beat-locked' ? audioAnalysis : null;

    const updatedCells: GridCell[] = grid.cells.map((cell, cellIndex) => {
        // ── 1. Resolve media pool ───────────────────────────────────────
        let cellPool = resolveCellPool(cell, globalPool);

        if (!cellPool) {
            // Fall back to distributed bucket.
            const distributedIds = distributed[cellIndex] ?? [];
            const idSet = new Set(distributedIds);
            cellPool = globalPool.filter((f) => idSet.has(f.id));
        }

        // ── 2. Auto-detect orientation ──────────────────────────────────
        let cellOrientation = cell.cellOrientation;
        if (grid.autoOrientation !== false) {
            // Auto-orientation is on by default (undefined = true).
            const detectedMediaIds =
                cell.cellMediaIds && cell.cellMediaIds.length > 0
                    ? cell.cellMediaIds
                    : cellPool.map((f) => f.id);
            const detected = detectCellOrientation(detectedMediaIds, globalPool);
            // Only override if the cell hasn't been explicitly set (non-'auto').
            if (!cellOrientation || cellOrientation === 'auto') {
                cellOrientation = detected;
            }
        }

        // ── 3. Merge settings (factory → grid → cell) ──────────────────
        const merged = mergeCellSettings(grid.gridSettings, cell.cellSettings);

        // Inject the master duration if the grid specifies one.
        if (grid.masterDurationSec !== undefined && grid.masterDurationSec > 0) {
            merged.targetDuration = grid.masterDurationSec;
        }

        // ── 4. Generate clips ───────────────────────────────────────────
        const cellWithOrientation: GridCell = {
            ...cell,
            cellOrientation: cellOrientation ?? 'horizontal',
        };

        const clips = generateCellSequence(
            cellWithOrientation,
            cellPool,
            merged,
            beatLockedAudio,
            fps,
        );

        // ── 5. Return updated cell ──────────────────────────────────────
        return {
            ...cell,
            clips,
            cellOrientation: cellOrientation ?? 'horizontal',
            isGenerated: true,
        };
    });

    // Return a brand-new GridClip with updated cells.
    return {
        ...grid,
        cells: updatedCells,
    };
}
