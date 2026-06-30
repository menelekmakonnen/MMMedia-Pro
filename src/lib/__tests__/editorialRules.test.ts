// Run with:  npx vitest run src/lib/__tests__/editorialRules.test.ts
//
// Locks the editorial cutting rules: dynamic pacing, cut-on-action, the 30°
// rule, eye-trace reframing, and transition discipline — plus the editorial
// self-critique score.
import { describe, it, expect } from 'vitest';
import {
    planSegmentPacing,
    targetClipSecAt,
    scoreCutCandidate,
    pickActionCut,
    shotGrammarKey,
    detect30DegreeViolations,
    planEyeTraceReframe,
    decideTransition,
    planTransitionDiscipline,
    scoreEditorial,
    type PacingSection,
    type AdjacencyClip,
    type ShotGrammar,
} from '../ege/editorialRules';

describe('Dynamic pacing & cut timing', () => {
    const sections: PacingSection[] = [
        { startSec: 0, endSec: 8, type: 'verse', energy: 0.3 },
        { startSec: 8, endSec: 16, type: 'chorus', energy: 0.9 },
    ];

    it('cuts faster in choruses than verses', () => {
        const plan = planSegmentPacing(sections, { clipSeconds: [0.5, 3] });
        const verse = plan.sections[0].targetClipSec;
        const chorus = plan.sections[1].targetClipSec;
        expect(chorus).toBeLessThan(verse);
        expect(verse).toBeLessThanOrEqual(3);
        expect(chorus).toBeGreaterThanOrEqual(0.5);
    });

    it('targetClipSecAt resolves by position and falls back gracefully', () => {
        const plan = planSegmentPacing(sections, { clipSeconds: [0.5, 3] });
        expect(targetClipSecAt(plan, 4)).toBe(plan.sections[0].targetClipSec);
        expect(targetClipSecAt(plan, 12)).toBe(plan.sections[1].targetClipSec);
        expect(targetClipSecAt(plan, 100)).toBe(plan.sections[1].targetClipSec); // past end
        expect(targetClipSecAt({ sections: [], clipSeconds: [1, 3] }, 5)).toBe(2);
    });

    it('cut-on-action picks the highest-motion candidate within the window', () => {
        const cands = [
            { tSec: 4.0, motion: 0.1 },
            { tSec: 4.1, motion: 0.9 }, // a swing — best place to hide the cut
            { tSec: 4.2, motion: 0.3 },
            { tSec: 9.0, motion: 1.0 }, // outside the window — ignored
        ];
        expect(pickActionCut(cands, 4.0, { windowSec: 0.25 })).toBe(4.1);
    });

    it('cut-on-action falls back to the ideal time when nothing is in range', () => {
        expect(pickActionCut([{ tSec: 9, motion: 1 }], 4, { windowSec: 0.25 })).toBe(4);
    });

    it('beat proximity tightens the candidate score', () => {
        const onBeat = scoreCutCandidate({ tSec: 4, motion: 0.5, beatDistanceSec: 0.01 }, 0.5);
        const offBeat = scoreCutCandidate({ tSec: 4, motion: 0.5, beatDistanceSec: 0.5 }, 0.5);
        expect(onBeat).toBeGreaterThan(offBeat);
    });
});

describe('30° rule', () => {
    it('composes a scale|angle key and ignores empty grammar', () => {
        expect(shotGrammarKey({ shotScale: 'cu', cameraMotion: 'static' })).toBe('cu|static');
        expect(shotGrammarKey({})).toBeUndefined();
        expect(shotGrammarKey(undefined)).toBeUndefined();
    });

    it('flags adjacent clips that share scale AND angle', () => {
        const clips: AdjacencyClip[] = [
            { id: 'a', startFrame: 0, endFrame: 30, track: 0 },
            { id: 'b', startFrame: 30, endFrame: 60, track: 0 },
            { id: 'c', startFrame: 60, endFrame: 90, track: 0 },
        ];
        const g: Record<string, ShotGrammar> = {
            a: { shotScale: 'cu', cameraMotion: 'static' },
            b: { shotScale: 'cu', cameraMotion: 'static' }, // same as a → jump cut
            c: { shotScale: 'ls', cameraMotion: 'pan' },     // differs → fine
        };
        const v = detect30DegreeViolations(clips, (id) => g[id]);
        expect(v).toHaveLength(1);
        expect(v[0]).toMatchObject({ aId: 'a', bId: 'b', sharedKey: 'cu|static' });
    });

    it('does not flag when scale OR angle changes', () => {
        const clips: AdjacencyClip[] = [
            { id: 'a', startFrame: 0, endFrame: 30, track: 0 },
            { id: 'b', startFrame: 30, endFrame: 60, track: 0 },
        ];
        const g: Record<string, ShotGrammar> = {
            a: { shotScale: 'cu', cameraMotion: 'static' },
            b: { shotScale: 'cu', cameraMotion: 'pan' }, // angle changed
        };
        expect(detect30DegreeViolations(clips, (id) => g[id])).toHaveLength(0);
    });
});

describe('Eye trace', () => {
    it('returns null when the subject is already on the eye line', () => {
        expect(planEyeTraceReframe({ cx: 0.5, cy: 0.42, width: 0.3, height: 0.4 })).toBeNull();
    });

    it('reframes toward a subject sitting off to the right', () => {
        const plan = planEyeTraceReframe({ cx: 0.85, cy: 0.45, width: 0.2, height: 0.3 });
        expect(plan).not.toBeNull();
        expect(plan!.zoomOrigin).toBe('right');
        expect(plan!.zoomLevel).toBeGreaterThan(100);
        expect(plan!.zoomLevel).toBeLessThanOrEqual(130);
    });

    it('returns null with no subject', () => {
        expect(planEyeTraceReframe(undefined)).toBeNull();
    });
});

describe('Transition discipline', () => {
    it('dissolves only on slow, low-energy atmospheric boundaries', () => {
        expect(decideTransition({ energy: 0.1, segmentType: 'intro' })).toBe('dissolve');
        expect(decideTransition({ energy: 0.1, segmentType: 'chorus' })).toBe('hard-cut'); // not atmospheric
        expect(decideTransition({ energy: 0.9, segmentType: 'outro' })).toBe('hard-cut');  // too energetic
        expect(decideTransition({ energy: 0.5 })).toBe('hard-cut');                        // default hard
    });

    it('plans a list of boundaries', () => {
        const out = planTransitionDiscipline([
            { energy: 0.1, segmentType: 'intro' },
            { energy: 0.8, segmentType: 'drop' },
        ]);
        expect(out).toEqual(['dissolve', 'hard-cut']);
    });
});

describe('Editorial self-critique', () => {
    const clips: AdjacencyClip[] = [
        { id: 'a', startFrame: 0, endFrame: 30, track: 0 },
        { id: 'b', startFrame: 30, endFrame: 60, track: 0 },
        { id: 'c', startFrame: 60, endFrame: 90, track: 0 },
    ];

    it('scores a clean edit highly', () => {
        const g: Record<string, ShotGrammar> = {
            a: { shotScale: 'cu', cameraMotion: 'static' },
            b: { shotScale: 'ms', cameraMotion: 'pan' },
            c: { shotScale: 'ls', cameraMotion: 'static' },
        };
        const score = scoreEditorial({ clips, grammarOf: (id) => g[id] });
        expect(score.shotGrammar).toBe(1);
        expect(score.overall).toBeGreaterThan(0.9);
    });

    it('penalizes jump cuts and undisciplined transitions', () => {
        const g: Record<string, ShotGrammar> = {
            a: { shotScale: 'cu', cameraMotion: 'static' },
            b: { shotScale: 'cu', cameraMotion: 'static' },
            c: { shotScale: 'cu', cameraMotion: 'static' },
        };
        const score = scoreEditorial({
            clips,
            grammarOf: (id) => g[id],
            boundaries: [{ energy: 0.9, segmentType: 'drop', used: 'dissolve' }],
        });
        expect(score.shotGrammar).toBeLessThan(1);
        expect(score.transitionDiscipline).toBeLessThan(1);
        expect(score.notes.length).toBeGreaterThan(0);
    });
});
