/**
 * ClipDecision — lightweight metadata describing WHY and HOW each clip
 * appears in a generated edit sequence. Powers the Edit Logic Sidebar.
 */

export interface ClipDecision {
    /** Matches the Clip.id this decision belongs to */
    clipId: string;
    /** Truncated source filename for display */
    sourceFilename: string;
    /** Full source path (for thumbnail <video> element) */
    sourcePath: string;
    /** Duration of this clip in seconds */
    durationSec: number;
    /** [trimStartSec, trimEndSec] in source time */
    trimRange: [number, number];
    /** Transition type to NEXT clip, or null for hard cut */
    transitionType: string | null;
    /** Transition duration in ms (0 for cuts) */
    transitionDurationMs: number;
    /** Active effects on this clip */
    effects: string[];
    /** Playback speed multiplier (1.0 = normal) */
    speed: number;
    /** Human-readable reason this clip was chosen/placed here */
    reason?: string;
    /** If this clip is part of a one-take speed ramp sequence */
    rampPattern?: 'one-take';
    /** 0-based position in the sequence */
    order: number;
}

/**
 * Extract ClipDecision[] from a generated Clip[] sequence.
 * Works with any generator output (trailer, music-video, social, BTS).
 */
export function extractDecisions(clips: any[], fps: number): ClipDecision[] {
    // Only video clips on the main track (track 0)
    const videoClips = clips
        .filter((c: any) => c.type !== 'audio' && (c.track === 0 || c.track === undefined))
        .sort((a: any, b: any) => a.startFrame - b.startFrame);

    return videoClips.map((clip: any, i: number): ClipDecision => {
        const durationFrames = clip.endFrame - clip.startFrame;
        const durationSec = durationFrames / fps;
        const trimStartSec = (clip.trimStartFrame || 0) / fps;
        const trimEndSec = (clip.trimEndFrame || clip.sourceDurationFrames || durationFrames) / fps;

        // Collect active effects
        const effects: string[] = [];
        if (clip.filmGrain && clip.filmGrain > 0) effects.push('grain');
        if (clip.vignette && clip.vignette > 0) effects.push('vignette');
        if (clip.letterbox) effects.push('letterbox');
        if (clip.chromaticAberration && clip.chromaticAberration > 0) effects.push('chromatic');
        if (clip.motionBlur?.enabled) effects.push('motion-blur');
        if (clip.glow?.enabled) effects.push('glow');
        if (clip.doubleExposure?.enabled) effects.push('double-exposure');
        if (clip.tripleExposure?.enabled) effects.push('triple-exposure');
        if (clip.vibrationFlash?.enabled) effects.push('flash');
        if (clip.rgbSplit?.enabled) effects.push('rgb-split');
        if (clip.hueCycle?.enabled) effects.push('hue-cycle');
        if (clip.vhs?.enabled) effects.push('vhs');
        if (clip.shake?.enabled) effects.push('shake');
        if (clip.boomerang) effects.push('boomerang');
        if (clip.blurAnimated?.enabled) effects.push('blur');
        if (clip.colorGrading) effects.push('color-grade');
        if (clip.speedCurvePreset && clip.speedCurvePreset !== 'constant') effects.push(`speed:${clip.speedCurvePreset}`);

        // Transition info
        const trans = clip.transition;
        const transitionType = trans?.type || null;
        const transitionDurationMs = trans?.durationFrames
            ? Math.round((trans.durationFrames / fps) * 1000)
            : 0;

        return {
            clipId: clip.id,
            sourceFilename: clip.filename || clip.path?.split(/[/\\]/).pop() || `Clip ${i + 1}`,
            sourcePath: clip.path || '',
            durationSec: Math.round(durationSec * 100) / 100,
            trimRange: [
                Math.round(trimStartSec * 100) / 100,
                Math.round(trimEndSec * 100) / 100,
            ],
            transitionType,
            transitionDurationMs,
            effects,
            speed: clip.speed || 1,
            reason: clip._showSegment ? 'show-segment' : clip.origin === 'auto' ? 'auto-generated' : undefined,
            rampPattern: clip._rampPattern === 'one-take' ? 'one-take' : undefined,
            order: i,
        };
    });
}
