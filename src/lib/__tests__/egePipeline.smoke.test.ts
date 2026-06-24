// Smoke test for the Edit Generator Engine wiring:
//   subcategory resolver → shot classification → shot-diversity de-cluster →
//   generation contract. Exercises the real modules end-to-end on synthetic data.
import { describe, it, expect } from 'vitest';
import { resolveSubcategories } from '../subcategoryResolver';
import { classifyShot } from '../shotClassifier';
import { deClusterShotTypes, type DiversityClip } from '../ege/shotDiversity';
import { validateEdit, autoRepairEdit } from '../ege/generationContract';
import { classifyContent } from '../contentClassifier';
import { getPacingArcMultiplier } from '../pacingArc';
import { exportToFCPXML } from '../fcpxmlExport';
import type { IcuniEdit } from '../icuniEdit';

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

    it('pacing arc engine produces expected multipliers', () => {
        // build-to-climax starts slow (>1.0) and ends fast (<1.0)
        expect(getPacingArcMultiplier('build-to-climax', 0.0)).toBeCloseTo(1.5);
        expect(getPacingArcMultiplier('build-to-climax', 1.0)).toBeCloseTo(0.5);

        // slow-burn is flat/slow for first 70%, then fast at the end
        expect(getPacingArcMultiplier('slow-burn', 0.2)).toBeGreaterThan(1.0);
        expect(getPacingArcMultiplier('slow-burn', 0.95)).toBeLessThan(0.6);

        // flat-high is consistently fast
        expect(getPacingArcMultiplier('flat-high', 0.5)).toBeCloseTo(0.5);
    });

    it('content classifier groups clips by filename and visual metadata', () => {
        const interview = classifyContent('speaker_interview_01.mp4', {
            score: 5, energyLevel: 'static', analyzed: true, hasFaces: true, faceCount: 1,
        });
        expect(interview).toBe('interview');

        const action = classifyContent('running_clip.mp4', {
            score: 80, energyLevel: 'intense', analyzed: true, hasFaces: false,
        });
        expect(action).toBe('action');

        const bts = classifyContent('bts_setup_lights.mp4', {
            score: 20, energyLevel: 'low', analyzed: true, hasFaces: false,
        });
        expect(bts).toBe('BTS');
    });

    it('FCPXML exporter outputs structured XML string', () => {
        const edit: IcuniEdit = {
            schema: 'icuni-edit',
            version: '1.2',
            createdBy: 'mmmedia',
            createdAt: new Date().toISOString(),
            timeUnit: 'frames',
            project: { name: 'Smoke Test', fps: 30, width: 1920, height: 1080 },
            clips: [
                {
                    id: 'clip1',
                    name: 'A-roll',
                    file: 'D:/media/a-roll.mp4',
                    type: 'video',
                    trackType: 'video',
                    track: 1,
                    sourceStart: 0,
                    sourceEnd: 60,
                    timelineStart: 0,
                    timelineEnd: 60,
                    volume: 100,
                    speed: 1,
                    reversed: false,
                    muted: false,
                    locked: false,
                },
                {
                    id: 'clip2',
                    name: 'B-roll Overlay',
                    file: 'D:/media/b-roll.mp4',
                    type: 'video',
                    trackType: 'video',
                    track: 2,
                    sourceStart: 10,
                    sourceEnd: 40,
                    timelineStart: 20,
                    timelineEnd: 50,
                    volume: 80,
                    speed: 1,
                    reversed: false,
                    muted: false,
                    locked: false,
                },
                {
                    id: 'audio1',
                    name: 'Music',
                    file: 'D:/media/music.mp3',
                    type: 'audio',
                    trackType: 'audio',
                    track: 1,
                    sourceStart: 0,
                    sourceEnd: 90,
                    timelineStart: 0,
                    timelineEnd: 90,
                    volume: 50,
                    speed: 1,
                    reversed: false,
                    muted: false,
                    locked: false,
                }
            ],
        };
        const xml = exportToFCPXML(edit);
        expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
        expect(xml).toContain('<fcpxml version="1.9">');
        expect(xml).toContain('<spine>');
        expect(xml).toContain('a-roll.mp4');
        expect(xml).toContain('b-roll.mp4');
        expect(xml).toContain('music.mp3');
        expect(xml).toContain('audio-adjust volume="-1.94dB"'); // 20 * log10(0.8)
    });
});
