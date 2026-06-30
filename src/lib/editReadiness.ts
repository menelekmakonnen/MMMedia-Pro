import type { Clip } from '../types';

export interface ReadinessCheck {
    name: string;
    passed: boolean;
    weight: number;
    tip: string;
}

export interface ReadinessScore {
    total: number;   // 0-100
    checks: ReadinessCheck[];
}

/**
 * Evaluate the current edit's readiness for publishing.
 * Implements the "90% rule" — once you hit 90%, publish rather than over-polish.
 */
export function computeReadiness(clips: Clip[]): ReadinessScore {
    const videoClips = clips.filter(c => c.type !== 'audio' && !c.disabled);
    const audioClips = clips.filter(c => c.type === 'audio' && !c.disabled);
    const allActive = clips.filter(c => !c.disabled);

    const checks: ReadinessCheck[] = [];

    // 1. Has video clips (10%)
    checks.push({
        name: 'Has clips',
        passed: videoClips.length > 0,
        weight: 10,
        tip: 'Add video clips to your timeline',
    });

    // 2. Has audio/music track (10%)
    checks.push({
        name: 'Has audio',
        passed: audioClips.length > 0 || videoClips.some(c => !c.isMuted),
        weight: 10,
        tip: 'Add music or ensure audio is not muted',
    });

    // 3. Audio levels in safe range (15%)
    const audioOk = allActive.every(c => {
        const vol = c.volume ?? 100;
        return vol <= 100 && vol >= 10;
    });
    checks.push({
        name: 'Audio levels safe',
        passed: audioOk,
        weight: 15,
        tip: 'Dialogue: -12 to -6 dB, Music: -30 to -24 dB',
    });

    // 4. Has transitions (10%)
    const hasTransitions = videoClips.some(c => c.transition && c.transition.type !== 'cut');
    checks.push({
        name: 'Transitions applied',
        passed: hasTransitions || videoClips.length <= 1,
        weight: 10,
        tip: 'Add transitions between clips for smoother cuts',
    });

    // 5. Color grading applied (10%)
    const hasGrading = videoClips.some(c => c.colorGrading || (c.effectIds && c.effectIds.length > 0));
    checks.push({
        name: 'Color grading',
        passed: hasGrading || videoClips.length === 0,
        weight: 10,
        tip: 'Apply color grading or visual effects',
    });

    // 6. No blank gaps (10%)
    const sorted = [...videoClips].sort((a, b) => a.startFrame - b.startFrame);
    let hasGaps = false;
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].startFrame > sorted[i - 1].endFrame + 1) {
            hasGaps = true;
            break;
        }
    }
    checks.push({
        name: 'No gaps',
        passed: !hasGaps || videoClips.length <= 1,
        weight: 10,
        tip: 'Close gaps between clips on the timeline',
    });

    // 7. Effects applied consistently (10%)
    const hasEffects = videoClips.filter(c => c.effectIds && c.effectIds.length > 0).length;
    const effectConsistency = videoClips.length > 0 ? hasEffects / videoClips.length : 0;
    checks.push({
        name: 'Effects consistency',
        passed: effectConsistency >= 0.5 || videoClips.length <= 1,
        weight: 10,
        tip: 'Apply effects consistently across clips',
    });

    // 8. No disabled clips left (5%)
    const disabledCount = clips.filter(c => c.disabled).length;
    checks.push({
        name: 'No disabled clips',
        passed: disabledCount === 0,
        weight: 5,
        tip: 'Remove or re-enable disabled clips before export',
    });

    // 9. Multiple clips (10%)
    checks.push({
        name: 'Multi-clip edit',
        passed: videoClips.length >= 3,
        weight: 10,
        tip: 'A good edit typically has 3+ clips',
    });

    // 10. Duration reasonable (10%)
    const maxFrame = allActive.reduce((m, c) => Math.max(m, c.endFrame || 0), 0);
    checks.push({
        name: 'Has duration',
        passed: maxFrame > 30,  // At least 1 second at 30fps
        weight: 10,
        tip: 'Your edit should be at least a few seconds long',
    });

    const total = checks.reduce((sum, c) => sum + (c.passed ? c.weight : 0), 0);

    return { total, checks };
}
