// Smoke test for the Edit Generator Engine wiring:
//   subcategory resolver → shot classification → shot-diversity de-cluster →
//   generation contract. Exercises the real modules end-to-end on synthetic data.
import { describe, it, expect } from 'vitest';
import { resolveSubcategories } from '../subcategoryResolver';
import { classifyShot } from '../shotClassifier';
import { deClusterShotTypes, type DiversityClip } from '../ege/shotDiversity';
import { validateEdit, autoRepairEdit } from '../ege/generationContract';

describe('EGE pipeline smoke', () => {
    it('subcategory resolver yields distinct settings per subcategory', () => {
        const meme = resolveSubcategories('social-media', ['meme-edit']);
        const asmr = resolveSubcategories('social-media', ['asmr-satisfying']);
        const product = resolveSubcategories('trailer', ['product']);
        expect(Object.keys(meme).length).toBeGreaterThan(0);
        // Meme = ultra-fast; ASMR = long holds — they must differ meaningfully.
        expect(meme.shortestClip).toBeLessThan(asmr.shortestClip as number);
        expect(meme.longestClip).toBeLessThan(asmr.longestClip as number);
        expect(product.shortestClip).not.toBe(meme.shortestClip);
        // Unknown mode/sub returns empty (spreadable).
        expect(resolveSubcategories('nope', ['nope'])).toEqual({});
    });

    it('multiple active subcategories stack (later wins)', () => {
        const merged = resolveSubcategories('trailer', ['product', 'teaser']);
        // teaser sets targetDuration; product does not → teaser value survives.
        expect(merged.targetDuration).toBe(25);
    });

    it('shot classifier distinguishes a wide vs a close-up', () => {
        const base = {
            faceCount: 0, faceRegionRatio: 0, isStatic: false, histogramUniformity: 0.4,
            hasUIEdges: false, avgLuma: 140, salientRegion: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 },
            aspectRatio: 16 / 9, duration: 5, motionStdDev: 0.1,
        };
        const wide = classifyShot({ ...base, edgeDensity: 0.1, motionMagnitude: 0.1 });
        const close = classifyShot({ ...base, edgeDensity: 0.5, motionMagnitude: 0.1, faceCount: 1, faceRegionRatio: 0.5, salientRegion: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } });
        expect(typeof wide.shotType).toBe('string');
        expect(wide.confidence).toBeGreaterThanOrEqual(0);
        expect(wide.shotType).not.toBe(close.shotType);
    });

    it('shot-diversity de-cluster removes adjacency without moving slots', () => {
        const types = ['wide', 'wide', 'wide', 'close-up', 'medium'];
        const clips: DiversityClip[] = types.map((_, i) => ({
            id: `c${i}`, startFrame: i * 30, endFrame: i * 30 + 30, track: 0,
            trimStartFrame: 0, trimEndFrame: 30, sourceDurationFrames: 300, mediaLibraryId: `c${i}`,
        }));
        const shotMap = new Map<string, string>(types.map((t, i) => [`c${i}`, t]));
        const slotsBefore = clips.map(c => `${c.startFrame}-${c.endFrame}`).sort();

        const adjClashes = (arr: DiversityClip[]) => {
            const sorted = [...arr].filter(c => c.track === 0).sort((a, b) => a.startFrame - b.startFrame);
            let n = 0;
            for (let i = 1; i < sorted.length; i++) {
                if (shotMap.get(sorted[i].mediaLibraryId!) === shotMap.get(sorted[i - 1].mediaLibraryId!)) n++;
            }
            return n;
        };

        const before = adjClashes(clips);
        const after = deClusterShotTypes(clips, shotMap);
        expect(adjClashes(after)).toBeLessThan(before);

        // Slot grid is identical (positions never move).
        const slotsAfter = after.map(c => `${c.startFrame}-${c.endFrame}`).sort();
        expect(slotsAfter).toEqual(slotsBefore);
        // Still a permutation of the same content ids.
        expect(after.map(c => c.mediaLibraryId).sort()).toEqual(clips.map(c => c.mediaLibraryId).sort());
    });

    it('generation contract validates a healthy edit and repairs a broken one', () => {
        const good = [0, 1, 2, 3].map(i => ({
            id: `g${i}`, startFrame: i * 30, endFrame: i * 30 + 30, track: 0,
            trimStartFrame: 0, trimEndFrame: 30, sourceDurationFrames: 300, mediaLibraryId: `src${i}`,
        }));
        const report = validateEdit(good, { targetFrames: 120, mainTrack: 0 });
        expect(report.valid).toBe(true);

        // A starved 1-frame slot must be flagged and repaired.
        const broken = [
            { id: 'b0', startFrame: 0, endFrame: 1, track: 0, trimStartFrame: 0, trimEndFrame: 1, sourceDurationFrames: 300, mediaLibraryId: 's0' },
            { id: 'b1', startFrame: 1, endFrame: 120, track: 0, trimStartFrame: 0, trimEndFrame: 119, sourceDurationFrames: 300, mediaLibraryId: 's1' },
        ];
        const brokenReport = validateEdit(broken, { targetFrames: 120, mainTrack: 0 });
        expect(brokenReport.valid).toBe(false);
        const fixed = autoRepairEdit(broken, { targetFrames: 120, mainTrack: 0 });
        expect(fixed.repaired).toBe(true);
        expect(validateEdit(fixed.clips, { targetFrames: 120, mainTrack: 0 }).valid).toBe(true);
    });
});
