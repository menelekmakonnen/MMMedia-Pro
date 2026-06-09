// Run with:  npx vitest run src/lib/__tests__/transitions.test.ts
//
// GUARANTEE: every transition the UI offers renders to a REAL FFmpeg xfade
// transition on export. This test is the safety net that stops a transition
// from silently degrading to a hard cut (the bug that hid the 7 "impact"
// transitions for months).
import { describe, it, expect } from 'vitest';
import {
    TRANSITION_META,
    TRANSITION_XFADE_MAP,
    getTransitionFFmpegName,
    isApproximatedTransition,
} from '../transitions';
import type { TransitionType } from '../../types';

// The set of xfade transition names available in the bundled FFmpeg (6.x).
// Any value in TRANSITION_XFADE_MAP must be one of these, or the export errors.
const VALID_XFADE = new Set([
    'fade', 'fadeblack', 'fadewhite', 'fadegrays', 'distance', 'dissolve', 'pixelize',
    'radial', 'hblur', 'zoomin',
    'wipeleft', 'wiperight', 'wipeup', 'wipedown',
    'slideleft', 'slideright', 'slideup', 'slidedown',
    'smoothleft', 'smoothright', 'smoothup', 'smoothdown',
    'circlecrop', 'circleopen', 'circleclose', 'rectcrop',
    'diagtl', 'diagtr', 'diagbl', 'diagbr',
    'squeezeh', 'squeezev',
    'horzopen', 'horzclose', 'vertopen', 'vertclose',
    'hlslice', 'hrslice', 'vuslice', 'vdslice',
]);

const allTypes = Object.keys(TRANSITION_META) as TransitionType[];

describe('transition export mapping (single source of truth)', () => {
    it('maps every transition type (exhaustive)', () => {
        for (const t of allTypes) {
            expect(TRANSITION_XFADE_MAP).toHaveProperty(t);
        }
        // and no extra/stale keys
        for (const k of Object.keys(TRANSITION_XFADE_MAP)) {
            expect(allTypes).toContain(k as TransitionType);
        }
    });

    it('NEVER silently degrades a non-cut transition to a hard cut', () => {
        for (const t of allTypes) {
            const name = getTransitionFFmpegName(t);
            if (t === 'cut') {
                expect(name).toBeNull();
            } else {
                expect(name, `${t} must resolve to an xfade name`).not.toBeNull();
                expect(VALID_XFADE.has(name as string), `${t} → "${name}" must be a real xfade transition`).toBe(true);
            }
        }
    });

    it('flags the 7 impact transitions as approximated, and nothing else', () => {
        const approx = allTypes.filter(isApproximatedTransition).sort();
        expect(approx).toEqual(
            ['film-burn', 'flash', 'glitch', 'rgb-split', 'spin', 'whip', 'zoom-through'].sort()
        );
    });

    it('renders the marquee impact transitions to sensible cousins', () => {
        expect(getTransitionFFmpegName('flash')).toBe('fadewhite');
        expect(getTransitionFFmpegName('zoom-through')).toBe('zoomin');
        expect(getTransitionFFmpegName('glitch')).toBe('pixelize');
        expect(getTransitionFFmpegName('spin')).toBe('radial');
    });
});
