// ══════════════════════════════════════════════════════════════════════════════
// ege/sectionRegeneration.ts — Surgical section regeneration for timelines.
//
// Currently MMMedia Pro can only regenerate the entire timeline. This module
// gives users precision control: select a RANGE of frames, regenerate just
// that section with fresh clips from the generator, and stitch everything
// back together — preserving clips outside the range, respecting locked clips,
// trimming straddlers, and smoothing boundary transitions.
//
// Algorithm overview:
//   1. classifyClips  — bucket every clip as before/inside/after/straddle
//   2. regenerateSection — splice newClips into the range, trim straddlers,
//      smooth boundaries, and recombine
//   3. selectionToRange — helper that converts a set of selected clip IDs
//      into the min/max frame range for the UI
//
// Multi-track rule: only clips on track 0 (primary) are regenerated. Clips
// on overlay tracks that overlap the range are preserved unchanged.
//
// PURE: no React, no IPC, no filesystem. Never mutates input arrays/objects.
// ══════════════════════════════════════════════════════════════════════════════

import { v4 as uuidv4 } from 'uuid';
import type { Clip } from '../../types';
import { DEFAULT_FPS, secondsToFrames } from '../time';
import type { ContractClip } from './generationContract';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Default dissolve length for boundary smoothing (frames). */
const BOUNDARY_DISSOLVE_FRAMES = 20;

/** The primary track that gets regenerated. Overlay tracks are always preserved. */
const PRIMARY_TRACK = 0;

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface RegenerationRange {
    /** Start of the section to regenerate (in frames) */
    startFrame: number;
    /** End of the section to regenerate (in frames) */
    endFrame: number;
}

export interface RegenerationInput {
    /** The full current timeline */
    clips: Clip[];
    /** The section to regenerate */
    range: RegenerationRange;
    /** Fresh clips to fill the section (from generator) */
    newClips: Clip[];
    /** Frames per second */
    fps: number;
}

export interface RegenerationResult {
    /** The reconstructed timeline */
    clips: Clip[];
    /** How many clips were replaced */
    replacedCount: number;
    /** How many clips were preserved */
    preservedCount: number;
    /** How many new clips were inserted */
    insertedCount: number;
    /** Whether boundary transitions were smoothed */
    boundariesSmoothed: boolean;
}

export interface ClassifiedClips {
    before: Clip[];             // entirely before range
    inside: Clip[];             // entirely inside range
    after: Clip[];              // entirely after range
    straddleStart: Clip | null; // starts before range, ends inside
    straddleEnd: Clip | null;   // starts inside range, ends after
}

// ─── Classification ──────────────────────────────────────────────────────────

/**
 * Determine which clips fall inside, outside, or straddle the regeneration
 * range. Only track-0 clips are eligible for replacement; clips on other
 * tracks are always bucketed into `before` (preserved).
 *
 * Locked clips within the range are also moved to `before` so they survive
 * regeneration untouched.
 */
export function classifyClips(
    clips: Clip[],
    range: RegenerationRange,
): ClassifiedClips {
    const result: ClassifiedClips = {
        before: [],
        inside: [],
        after: [],
        straddleStart: null,
        straddleEnd: null,
    };

    for (const clip of clips) {
        // Non-primary-track clips are always preserved
        if (clip.track !== PRIMARY_TRACK) {
            result.before.push(clip);
            continue;
        }

        // Locked clips within the range are preserved
        if (clip.locked) {
            result.before.push(clip);
            continue;
        }

        // Entirely before the range
        if (clip.endFrame <= range.startFrame) {
            result.before.push(clip);
            continue;
        }

        // Entirely after the range
        if (clip.startFrame >= range.endFrame) {
            result.after.push(clip);
            continue;
        }

        // Straddles the start boundary: starts before range, ends inside or at range end
        if (
            clip.startFrame < range.startFrame &&
            clip.endFrame > range.startFrame &&
            clip.endFrame <= range.endFrame
        ) {
            result.straddleStart = clip;
            continue;
        }

        // Straddles the end boundary: starts inside range, ends after
        if (
            clip.startFrame >= range.startFrame &&
            clip.startFrame < range.endFrame &&
            clip.endFrame > range.endFrame
        ) {
            result.straddleEnd = clip;
            continue;
        }

        // Fully inside the range
        if (clip.startFrame >= range.startFrame && clip.endFrame <= range.endFrame) {
            result.inside.push(clip);
            continue;
        }

        // Edge case: clip completely spans the range (starts before, ends after).
        // Treat it as straddleStart if no straddleStart yet, otherwise inside.
        if (clip.startFrame < range.startFrame && clip.endFrame > range.endFrame) {
            // This clip wraps the entire range — split it as straddleStart
            // (the after-portion is lost to regeneration; the before-portion is kept).
            if (result.straddleStart === null) {
                result.straddleStart = clip;
            } else {
                result.inside.push(clip);
            }
            continue;
        }
    }

    return result;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Shallow-clone a clip with an optional partial override.
 * Never mutates the original.
 */
function cloneClip(clip: Clip, overrides?: Partial<Clip>): Clip {
    return { ...clip, ...overrides };
}

/**
 * Trim a straddleStart clip so it ends at range.startFrame.
 * Proportionally adjusts trimEndFrame so the source window shrinks to match
 * the shorter timeline duration.
 */
function trimStraddleStart(clip: Clip, rangeStart: number): Clip {
    const originalTimelineDuration = clip.endFrame - clip.startFrame;
    const newTimelineDuration = rangeStart - clip.startFrame;

    if (originalTimelineDuration <= 0 || newTimelineDuration <= 0) {
        // Degenerate — return the clip clamped to zero-width
        return cloneClip(clip, {
            endFrame: rangeStart,
            trimEndFrame: clip.trimStartFrame,
        });
    }

    const ratio = newTimelineDuration / originalTimelineDuration;
    const sourceDuration = clip.trimEndFrame - clip.trimStartFrame;
    const newSourceDuration = Math.round(sourceDuration * ratio);

    return cloneClip(clip, {
        endFrame: rangeStart,
        trimEndFrame: clip.trimStartFrame + newSourceDuration,
    });
}

/**
 * Trim a straddleEnd clip so it starts at range.endFrame.
 * Proportionally adjusts trimStartFrame so the source window shrinks.
 */
function trimStraddleEnd(clip: Clip, rangeEnd: number): Clip {
    const originalTimelineDuration = clip.endFrame - clip.startFrame;
    const newTimelineDuration = clip.endFrame - rangeEnd;

    if (originalTimelineDuration <= 0 || newTimelineDuration <= 0) {
        return cloneClip(clip, {
            startFrame: rangeEnd,
            trimStartFrame: clip.trimEndFrame,
        });
    }

    const ratio = newTimelineDuration / originalTimelineDuration;
    const sourceDuration = clip.trimEndFrame - clip.trimStartFrame;
    const newSourceDuration = Math.round(sourceDuration * ratio);

    return cloneClip(clip, {
        startFrame: rangeEnd,
        trimStartFrame: clip.trimEndFrame - newSourceDuration,
    });
}

/**
 * Fit `newClips` into the regeneration range [rangeStart, rangeEnd].
 *
 * 1. Shifts all clips so the first one starts at rangeStart.
 * 2. If total duration > range, clamps the last clip's endFrame.
 * 3. If total duration < range, stretches the last clip to fill.
 *
 * Each clip gets a fresh ID to avoid collisions with replaced clips.
 */
function fitClipsToRange(
    newClips: Clip[],
    rangeStart: number,
    rangeEnd: number,
): Clip[] {
    if (newClips.length === 0) return [];

    const rangeDuration = rangeEnd - rangeStart;
    if (rangeDuration <= 0) return [];

    // Determine the offset to shift all new clips into the range
    const firstStart = newClips[0].startFrame;
    const offset = rangeStart - firstStart;

    const shifted: Clip[] = newClips.map((clip) => {
        return cloneClip(clip, {
            id: uuidv4(),
            startFrame: clip.startFrame + offset,
            endFrame: clip.endFrame + offset,
            origin: 'auto' as const,
        });
    });

    // Calculate total duration of the shifted clips
    const lastClip = shifted[shifted.length - 1];
    const totalEnd = lastClip.endFrame;

    if (totalEnd > rangeEnd) {
        // Clamp the last clip
        const overflow = totalEnd - rangeEnd;
        const clampedEnd = lastClip.endFrame - overflow;
        const clampedDuration = clampedEnd - lastClip.startFrame;
        const originalDuration = lastClip.endFrame - lastClip.startFrame;

        if (originalDuration > 0 && clampedDuration > 0) {
            const ratio = clampedDuration / originalDuration;
            const sourceDur = lastClip.trimEndFrame - lastClip.trimStartFrame;
            shifted[shifted.length - 1] = cloneClip(lastClip, {
                endFrame: rangeEnd,
                trimEndFrame: lastClip.trimStartFrame + Math.round(sourceDur * ratio),
            });
        } else {
            shifted[shifted.length - 1] = cloneClip(lastClip, {
                endFrame: rangeEnd,
            });
        }
    } else if (totalEnd < rangeEnd) {
        // Stretch the last clip to fill the remaining gap
        const gap = rangeEnd - totalEnd;
        const originalDuration = lastClip.endFrame - lastClip.startFrame;
        const newDuration = originalDuration + gap;

        if (originalDuration > 0) {
            const ratio = newDuration / originalDuration;
            const sourceDur = lastClip.trimEndFrame - lastClip.trimStartFrame;
            shifted[shifted.length - 1] = cloneClip(lastClip, {
                endFrame: rangeEnd,
                trimEndFrame: Math.min(
                    lastClip.trimStartFrame + Math.round(sourceDur * ratio),
                    lastClip.sourceDurationFrames,
                ),
            });
        } else {
            shifted[shifted.length - 1] = cloneClip(lastClip, {
                endFrame: rangeEnd,
            });
        }
    }

    return shifted;
}

/**
 * Add a dissolve transition at a boundary join point.
 * Attaches the transition to the clip immediately before the join.
 */
function addBoundaryDissolve(clip: Clip, durationFrames: number): Clip {
    return cloneClip(clip, {
        transition: {
            type: 'dissolve',
            durationFrames,
        },
    });
}

/**
 * Sort clips by startFrame ascending, then by track ascending.
 */
function sortClips(clips: Clip[]): Clip[] {
    return [...clips].sort((a, b) => {
        if (a.startFrame !== b.startFrame) return a.startFrame - b.startFrame;
        return a.track - b.track;
    });
}

// ─── Main Entry Points ──────────────────────────────────────────────────────

/**
 * Regenerate a section of the timeline, preserving everything outside.
 *
 * The range size is kept constant — after clips are never shifted — so
 * the overall timeline duration is preserved.
 */
export function regenerateSection(input: RegenerationInput): RegenerationResult {
    const { clips, range, newClips, fps } = input;

    // Edge case: empty range → no-op
    if (range.startFrame >= range.endFrame) {
        return {
            clips: [...clips],
            replacedCount: 0,
            preservedCount: clips.length,
            insertedCount: 0,
            boundariesSmoothed: false,
        };
    }

    // Find timeline extent
    const timelineStart = clips.length > 0
        ? Math.min(...clips.map((c) => c.startFrame))
        : 0;
    const timelineEnd = clips.length > 0
        ? Math.max(...clips.map((c) => c.endFrame))
        : 0;

    // Edge case: range covers the entire timeline
    if (range.startFrame <= timelineStart && range.endFrame >= timelineEnd) {
        const fitted = fitClipsToRange(newClips, range.startFrame, range.endFrame);
        // Still preserve locked clips and non-primary-track clips
        const preserved = clips.filter(
            (c) => c.locked || c.track !== PRIMARY_TRACK,
        );
        return {
            clips: sortClips([...preserved, ...fitted]),
            replacedCount: clips.length - preserved.length,
            preservedCount: preserved.length,
            insertedCount: fitted.length,
            boundariesSmoothed: false,
        };
    }

    // Classify
    const classified = classifyClips(clips, range);

    // Build the result
    const result: Clip[] = [];
    let boundariesSmoothed = false;

    // 1. Before clips — preserved as-is
    result.push(...classified.before);

    // 2. Trimmed straddle-start
    let trimmedStraddleStart: Clip | null = null;
    if (classified.straddleStart) {
        trimmedStraddleStart = trimStraddleStart(
            classified.straddleStart,
            range.startFrame,
        );
    }

    // 3. Trimmed straddle-end
    let trimmedStraddleEnd: Clip | null = null;
    if (classified.straddleEnd) {
        trimmedStraddleEnd = trimStraddleEnd(
            classified.straddleEnd,
            range.endFrame,
        );
    }

    // 4. Fit new clips into the range
    const fittedNewClips = fitClipsToRange(newClips, range.startFrame, range.endFrame);

    // 5. Smooth boundary transitions
    //    Add a dissolve at the join between preserved content and new content.
    if (trimmedStraddleStart) {
        // The straddle-start clip leads into the new section
        const duration = Math.min(
            BOUNDARY_DISSOLVE_FRAMES,
            trimmedStraddleStart.endFrame - trimmedStraddleStart.startFrame,
        );
        if (duration > 0 && fittedNewClips.length > 0) {
            trimmedStraddleStart = addBoundaryDissolve(trimmedStraddleStart, duration);
            boundariesSmoothed = true;
        }
        result.push(trimmedStraddleStart);
    } else {
        // No straddler — check if the last 'before' clip (on track 0) borders the range
        const lastBeforeOnTrack0 = [...classified.before]
            .filter((c) => c.track === PRIMARY_TRACK)
            .sort((a, b) => b.endFrame - a.endFrame)[0];

        if (lastBeforeOnTrack0 && fittedNewClips.length > 0) {
            const duration = Math.min(
                BOUNDARY_DISSOLVE_FRAMES,
                lastBeforeOnTrack0.endFrame - lastBeforeOnTrack0.startFrame,
            );
            if (duration > 0 && lastBeforeOnTrack0.endFrame === range.startFrame) {
                // Replace it in the result array with the dissolve-attached version
                const idx = result.findIndex((c) => c.id === lastBeforeOnTrack0.id);
                if (idx !== -1) {
                    result[idx] = addBoundaryDissolve(lastBeforeOnTrack0, duration);
                    boundariesSmoothed = true;
                }
            }
        }
    }

    // 6. Insert new clips
    result.push(...fittedNewClips);

    // 7. Smooth exit boundary
    if (fittedNewClips.length > 0) {
        const lastNewClip = fittedNewClips[fittedNewClips.length - 1];
        const hasExitNeighbor = trimmedStraddleEnd !== null ||
            classified.after.some(
                (c) => c.track === PRIMARY_TRACK && c.startFrame === range.endFrame,
            );

        if (hasExitNeighbor) {
            const duration = Math.min(
                BOUNDARY_DISSOLVE_FRAMES,
                lastNewClip.endFrame - lastNewClip.startFrame,
            );
            if (duration > 0) {
                // Replace the last new clip in result with the dissolve-attached version
                const idx = result.findIndex((c) => c.id === lastNewClip.id);
                if (idx !== -1) {
                    result[idx] = addBoundaryDissolve(lastNewClip, duration);
                    boundariesSmoothed = true;
                }
            }
        }
    }

    // 8. Straddle-end (after new clips)
    if (trimmedStraddleEnd) {
        result.push(trimmedStraddleEnd);
    }

    // 9. After clips — preserved as-is (no shift needed, range size unchanged)
    result.push(...classified.after);

    // 10. Sort final timeline
    const sorted = sortClips(result);

    return {
        clips: sorted,
        replacedCount: classified.inside.length,
        preservedCount: classified.before.length + classified.after.length +
            (classified.straddleStart ? 1 : 0) +
            (classified.straddleEnd ? 1 : 0),
        insertedCount: fittedNewClips.length,
        boundariesSmoothed,
    };
}

/**
 * Extract the time range of the current selection.
 * Given a set of selected clip IDs, find the min startFrame and max endFrame.
 *
 * Returns null if no matching clips are found (e.g. empty selection or
 * all IDs are invalid).
 */
export function selectionToRange(
    clipIds: string[],
    allClips: Clip[],
): RegenerationRange | null {
    if (clipIds.length === 0) return null;

    const idSet = new Set(clipIds);
    const selectedClips = allClips.filter((c) => idSet.has(c.id));

    if (selectedClips.length === 0) return null;

    const startFrame = Math.min(...selectedClips.map((c) => c.startFrame));
    const endFrame = Math.max(...selectedClips.map((c) => c.endFrame));

    if (startFrame >= endFrame) return null;

    return { startFrame, endFrame };
}
