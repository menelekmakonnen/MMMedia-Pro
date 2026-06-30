/**
 * sequencePresets.ts — Automated NLE presets for the Edit Generator Engine.
 *
 * Each preset maps to a professional editing technique. When selected,
 * the generator applies the pattern to the clip array — setting track
 * assignments, timing offsets, speed values, transitions, and effects
 * so the user gets a professional edit structure out of the box.
 *
 * Deeply connected to: clipStore, timelineStore, trailerGenerator, types.ts
 */

import { Clip, TransitionType } from '../../types';

/* ── Track assignment constants ── */
export const TRACK = {
    V1: 1, V2: 2, V3: 3, V4: 4,
    A1: 101, A2: 102, A3: 103,
} as const;

/* ── Preset category ── */
export type PresetCategory = 'structure' | 'pacing' | 'audio' | 'effects' | 'advanced';

/* ── Preset definition ── */
export interface SequencePreset {
    id: string;
    name: string;
    description: string;
    icon: string;         // lucide icon name for UI rendering
    category: PresetCategory;
    /** Apply the preset to a clip array, returning modified clips + suggested track count */
    apply: (clips: Clip[], fps: number) => {
        clips: Clip[];
        videoTrackCount: number;
        audioTrackCount: number;
    };
}

/* ── Utility: deep-clone clips to avoid mutation ── */
function cloneClips(clips: Clip[]): Clip[] {
    return clips.map(c => ({ ...c }));
}

/* ── Utility: get clip duration in frames ── */
function clipDuration(clip: Clip): number {
    return clip.endFrame - clip.startFrame;
}

/* ════════════════════════════════════════════════════════════════════
 * STRUCTURE PRESETS — How clips are arranged across tracks
 * ════════════════════════════════════════════════════════════════════ */

const multiTrackSplit: SequencePreset = {
    id: 'multi-track-split',
    name: 'Multi-Track Split',
    description: 'Distribute clips across 2 video tracks for layered editing. Odd clips on V1, even clips on V2.',
    icon: 'Layers',
    category: 'structure',
    apply: (clips, fps) => {
        const out = cloneClips(clips);
        let cursorV1 = 0;
        let cursorV2 = 0;
        out.forEach((c, i) => {
            const dur = clipDuration(c);
            if (i % 2 === 0) {
                c.track = TRACK.V1;
                c.startFrame = cursorV1;
                c.endFrame = cursorV1 + dur;
                cursorV1 += dur;
            } else {
                c.track = TRACK.V2;
                c.startFrame = cursorV2;
                c.endFrame = cursorV2 + dur;
                cursorV2 += dur;
            }
        });
        return { clips: out, videoTrackCount: 2, audioTrackCount: 2 };
    },
};

const abRoll: SequencePreset = {
    id: 'a-b-roll',
    name: 'A/B Roll',
    description: 'Classic broadcast pattern: primary footage on V1, cutaway/B-roll on V2 with 30-frame overlaps for dissolve transitions.',
    icon: 'Repeat',
    category: 'structure',
    apply: (clips, fps) => {
        const out = cloneClips(clips);
        const overlapFrames = Math.round(fps); // 1 second overlap
        let cursor = 0;
        out.forEach((c, i) => {
            const dur = clipDuration(c);
            c.track = i % 2 === 0 ? TRACK.V1 : TRACK.V2;
            if (i === 0) {
                c.startFrame = 0;
                c.endFrame = dur;
                cursor = dur;
            } else {
                // Overlap with previous clip for dissolve
                c.startFrame = Math.max(0, cursor - overlapFrames);
                c.endFrame = c.startFrame + dur;
                cursor = c.endFrame;
                c.transition = { type: 'dissolve' as TransitionType, durationFrames: overlapFrames, params: {} };
            }
            // Both tracks visible — V2 clips appear as overlaid B-roll during overlap
            if (c.track === TRACK.V2) {
                c.compositeOverlay = true;
            }
        });
        return { clips: out, videoTrackCount: 2, audioTrackCount: 2 };
    },
};

const splitScreenDual: SequencePreset = {
    id: 'split-screen-dual',
    name: 'Split Screen (Dual)',
    description: 'Two clips side-by-side: V1 scaled to left half, V2 scaled to right half. Creates a cinematic parallel view.',
    icon: 'Columns',
    category: 'structure',
    apply: (clips, fps) => {
        const out = cloneClips(clips);
        // Pair clips: first goes left (V1), second goes right (V2), etc.
        // Both clips in a pair play at the same time
        const pairs = Math.ceil(out.length / 2);
        let cursor = 0;
        for (let p = 0; p < pairs; p++) {
            const leftIdx = p * 2;
            const rightIdx = p * 2 + 1;
            const leftClip = out[leftIdx];
            const rightClip = rightIdx < out.length ? out[rightIdx] : null;

            const leftDur = clipDuration(leftClip);
            const rightDur = rightClip ? clipDuration(rightClip) : 0;
            const pairDur = Math.max(leftDur, rightDur);

            // Left half
            leftClip.track = TRACK.V1;
            leftClip.startFrame = cursor;
            leftClip.endFrame = cursor + pairDur;
            leftClip.compositeScale = 50;
            leftClip.compositeX = 25;  // Centered in left half
            leftClip.compositeY = 50;
            leftClip.compositeOverlay = true;

            // Right half
            if (rightClip) {
                rightClip.track = TRACK.V2;
                rightClip.startFrame = cursor;
                rightClip.endFrame = cursor + pairDur;
                rightClip.compositeScale = 50;
                rightClip.compositeX = 75;  // Centered in right half
                rightClip.compositeY = 50;
                rightClip.compositeOverlay = true;
            }
            cursor += pairDur;
        }
        return { clips: out, videoTrackCount: 2, audioTrackCount: 1 };
    },
};

const pictureInPicture: SequencePreset = {
    id: 'picture-in-picture',
    name: 'Picture-in-Picture',
    description: 'Main footage on V1, smaller overlay on V2 in the corner. Every 3rd clip becomes a PiP overlay.',
    icon: 'PictureInPicture2',
    category: 'structure',
    apply: (clips, fps) => {
        const out = cloneClips(clips);
        // Separate main and PiP clips
        let mainCursor = 0;
        out.forEach((c, i) => {
            const dur = clipDuration(c);
            if (i % 3 === 2) {
                // PiP overlay — small in bottom-right corner, overlaying the previous clip
                c.track = TRACK.V2;
                c.compositeScale = 30;          // 30% of frame
                c.compositeX = 82;              // Bottom-right area
                c.compositeY = 78;
                c.compositeBorderRadius = 8;
                c.compositeOpacity = 95;
                c.compositeOverlay = true;
                // Time-align with the previous main clip
                const prevClip = out[i - 1];
                if (prevClip) {
                    c.startFrame = prevClip.startFrame;
                    c.endFrame = Math.min(prevClip.endFrame, prevClip.startFrame + dur);
                } else {
                    c.startFrame = mainCursor;
                    c.endFrame = mainCursor + dur;
                }
            } else {
                // Main footage — full frame
                c.track = TRACK.V1;
                c.startFrame = mainCursor;
                c.endFrame = mainCursor + dur;
                mainCursor = c.endFrame;
            }
        });
        return { clips: out, videoTrackCount: 2, audioTrackCount: 2 };
    },
};

const tripleLayer: SequencePreset = {
    id: 'triple-layer',
    name: 'Triple Layer',
    description: '3 video tracks for complex compositing. Distribute clips in round-robin across V1, V2, V3.',
    icon: 'LayoutList',
    category: 'structure',
    apply: (clips, fps) => {
        const out = cloneClips(clips);
        const cursors = [0, 0, 0]; // V1, V2, V3
        const trackIds = [TRACK.V1, TRACK.V2, TRACK.V3];
        out.forEach((c, i) => {
            const trackIdx = i % 3;
            const dur = clipDuration(c);
            c.track = trackIds[trackIdx];
            c.startFrame = cursors[trackIdx];
            c.endFrame = cursors[trackIdx] + dur;
            cursors[trackIdx] += dur;
        });
        return { clips: out, videoTrackCount: 3, audioTrackCount: 2 };
    },
};

/* ════════════════════════════════════════════════════════════════════
 * PACING PRESETS — How clips are timed and cut
 * ════════════════════════════════════════════════════════════════════ */

const rapidMontage: SequencePreset = {
    id: 'montage-rapid',
    name: 'Rapid Montage',
    description: 'Quick cuts averaging 0.3-0.8s. Every other clip gets a speed ramp (1× → 2× → 1×). Creates energetic, MTV-style pacing.',
    icon: 'Zap',
    category: 'pacing',
    apply: (clips, fps) => {
        const out = cloneClips(clips);
        let cursor = 0;
        out.forEach((c, i) => {
            // Clamp to rapid durations
            const maxFrames = Math.round(0.8 * fps);
            const minFrames = Math.round(0.3 * fps);
            let dur = clipDuration(c);
            if (dur > maxFrames) {
                dur = maxFrames;
            }
            if (dur < minFrames) {
                dur = minFrames;
            }
            c.startFrame = cursor;
            c.endFrame = cursor + dur;
            cursor += dur;

            // Speed ramp on alternating clips
            if (i % 2 === 1) {
                c.speedCurvePreset = 'ramp-up';
                c.speed = 1.5;
            }
            c.track = TRACK.V1;
        });
        return { clips: out, videoTrackCount: 1, audioTrackCount: 2 };
    },
};

const slowBuild: SequencePreset = {
    id: 'slow-build',
    name: 'Slow Build',
    description: 'Clips start long (3-5s) and progressively get shorter toward the end (0.5s). Creates tension and buildup.',
    icon: 'TrendingUp',
    category: 'pacing',
    apply: (clips, fps) => {
        const out = cloneClips(clips);
        const total = out.length;
        let cursor = 0;
        out.forEach((c, i) => {
            const progress = i / Math.max(1, total - 1); // 0 → 1
            const targetSeconds = 5 - (progress * 4.5); // 5s → 0.5s
            const targetFrames = Math.round(targetSeconds * fps);
            const dur = Math.max(Math.round(0.3 * fps), targetFrames);
            
            c.startFrame = cursor;
            c.endFrame = cursor + dur;
            cursor += dur;
            
            c.track = TRACK.V1;
        });
        return { clips: out, videoTrackCount: 1, audioTrackCount: 2 };
    },
};

const crescendoCut: SequencePreset = {
    id: 'crescendo',
    name: 'Crescendo Cut',
    description: 'Starts with normal pacing (2s clips), builds to rapid cuts (0.3s) in the final third, then holds a hero shot (4s) at the end.',
    icon: 'ArrowUpRight',
    category: 'pacing',
    apply: (clips, fps) => {
        const out = cloneClips(clips);
        const total = out.length;
        const buildStart = Math.floor(total * 0.6);
        let cursor = 0;
        out.forEach((c, i) => {
            let targetSeconds: number;
            if (i === total - 1) {
                targetSeconds = 4; // Hero shot
                c.speed = 0.7; // Slight slowmo
            } else if (i >= buildStart) {
                const buildProgress = (i - buildStart) / (total - 1 - buildStart);
                targetSeconds = 2 - (buildProgress * 1.7); // 2s → 0.3s
            } else {
                targetSeconds = 2;
            }
            const dur = Math.round(targetSeconds * fps);
            
            c.startFrame = cursor;
            c.endFrame = cursor + dur;
            cursor += dur;
            
            c.track = TRACK.V1;
        });
        return { clips: out, videoTrackCount: 1, audioTrackCount: 2 };
    },
};

const breathingRhythm: SequencePreset = {
    id: 'breathing-rhythm',
    name: 'Breathing Rhythm',
    description: 'Alternates between long (2-3s) and short (0.5-0.8s) clips like inhale-exhale. Creates a hypnotic, rhythmic flow.',
    icon: 'Wind',
    category: 'pacing',
    apply: (clips, fps) => {
        const out = cloneClips(clips);
        let cursor = 0;
        out.forEach((c, i) => {
            const isLong = i % 2 === 0;
            const targetSeconds = isLong ? 2.5 : 0.6;
            const dur = Math.round(targetSeconds * fps);
            
            c.startFrame = cursor;
            c.endFrame = cursor + dur;
            cursor += dur;
            
            c.track = TRACK.V1;
        });
        return { clips: out, videoTrackCount: 1, audioTrackCount: 2 };
    },
};

/* ════════════════════════════════════════════════════════════════════
 * AUDIO PRESETS — Audio-centric editing patterns
 * ════════════════════════════════════════════════════════════════════ */

const jCut: SequencePreset = {
    id: 'j-cut',
    name: 'J-Cut Pattern',
    description: 'Audio from next clip starts 15 frames before its video appears. Creates smooth, cinematic audio transitions.',
    icon: 'CornerDownRight',
    category: 'audio',
    apply: (clips, fps) => {
        const out = cloneClips(clips);
        const audioOffset = Math.round(fps * 0.5); // 0.5s audio lead
        out.forEach((c, i) => {
            // Create audio pre-lap: the audio track version starts earlier
            if (i > 0) {
                // This sets metadata for the renderer to handle audio offset
                (c as any)._audioLeadFrames = audioOffset;
            }
        });
        return { clips: out, videoTrackCount: 1, audioTrackCount: 2 };
    },
};

const lCut: SequencePreset = {
    id: 'l-cut',
    name: 'L-Cut Pattern',
    description: 'Audio from current clip continues 15 frames after video cuts to next. Audio trails behind the visual edit.',
    icon: 'CornerRightDown',
    category: 'audio',
    apply: (clips, fps) => {
        const out = cloneClips(clips);
        const audioTrail = Math.round(fps * 0.5);
        out.forEach((c, i) => {
            if (i < out.length - 1) {
                (c as any)._audioTrailFrames = audioTrail;
            }
        });
        return { clips: out, videoTrackCount: 1, audioTrackCount: 2 };
    },
};

const audioDucking: SequencePreset = {
    id: 'audio-ducking',
    name: 'Audio Ducking',
    description: 'Background music on A2 ducks to 20% volume when clip audio is present on A1. Professional podcast/vlog technique.',
    icon: 'Volume1',
    category: 'audio',
    apply: (clips, fps) => {
        const out = cloneClips(clips);
        out.forEach(c => {
            c.volume = 100; // Full clip audio
            // Mark for ducking processor
            (c as any)._duckBgMusic = true;
        });
        return { clips: out, videoTrackCount: 1, audioTrackCount: 3 };
    },
};

/* ════════════════════════════════════════════════════════════════════
 * EFFECTS PRESETS — Visual effect patterns
 * ════════════════════════════════════════════════════════════════════ */

const flashCut: SequencePreset = {
    id: 'flash-cut',
    name: 'Flash Cut',
    description: 'White flash transition between every cut. Each flash is 3 frames. Creates punchy, music-video energy.',
    icon: 'Flashlight',
    category: 'effects',
    apply: (clips, fps) => {
        const out = cloneClips(clips);
        out.forEach(c => {
            c.transition = { type: 'flash' as TransitionType, durationFrames: 3, params: {} };
        });
        return { clips: out, videoTrackCount: 1, audioTrackCount: 2 };
    },
};

const cinematicBars: SequencePreset = {
    id: 'cinematic-bars',
    name: 'Cinematic Bars + Grain',
    description: 'Letterbox bars + film grain on every clip. Instant cinematic look with dissolve transitions.',
    icon: 'Film',
    category: 'effects',
    apply: (clips, fps) => {
        const out = cloneClips(clips);
        out.forEach(c => {
            c.letterbox = true;
            c.filmGrain = 15;
            c.transition = { type: 'dissolve' as TransitionType, durationFrames: Math.round(fps * 0.5), params: {} };
        });
        return { clips: out, videoTrackCount: 1, audioTrackCount: 2 };
    },
};

const glitchPulse: SequencePreset = {
    id: 'glitch-pulse',
    name: 'Glitch Pulse',
    description: 'RGB split + chromatic aberration on beat drops. Glitch transitions between clips. Raw digital energy.',
    icon: 'MonitorSmartphone',
    category: 'effects',
    apply: (clips, fps) => {
        const out = cloneClips(clips);
        out.forEach((c, i) => {
            c.transition = { type: 'glitch' as TransitionType, durationFrames: Math.round(fps * 0.25), params: {} };
            if (i % 2 === 0) {
                c.rgbSplit = { amount: 30 };
                c.chromaticAberration = 8;
            }
        });
        return { clips: out, videoTrackCount: 1, audioTrackCount: 2 };
    },
};

/* ════════════════════════════════════════════════════════════════════
 * ADVANCED PRESETS — Complex multi-technique patterns
 * ════════════════════════════════════════════════════════════════════ */

const matchCut: SequencePreset = {
    id: 'match-cut',
    name: 'Match Cut',
    description: 'Each clip transition uses a zoom-through effect, simulating match cuts. Last frame zooms into next clip\'s first frame.',
    icon: 'Focus',
    category: 'advanced',
    apply: (clips, fps) => {
        const out = cloneClips(clips);
        out.forEach((c, i) => {
            c.track = TRACK.V1;
            c.transition = { type: 'zoom-through' as TransitionType, durationFrames: Math.round(fps * 0.4), params: {} };
            // Slight zoom on each clip for continuity
            c.zoomLevel = 105 + (i % 3) * 5; // 105%, 110%, 115% rotation
        });
        return { clips: out, videoTrackCount: 1, audioTrackCount: 2 };
    },
};

const parallelEdit: SequencePreset = {
    id: 'parallel-edit',
    name: 'Parallel Editing',
    description: 'Cross-cutting between V1 and V2. Alternates every 2 clips. Creates suspense through interleaving two storylines.',
    icon: 'GitBranch',
    category: 'advanced',
    apply: (clips, fps) => {
        const out = cloneClips(clips);
        // Group clips into pairs, alternate tracks
        out.forEach((c, i) => {
            const group = Math.floor(i / 2);
            c.track = group % 2 === 0 ? TRACK.V1 : TRACK.V2;
            // Slightly different color grading per track for visual distinction
            if (c.track === TRACK.V2) {
                c.colorGrading = {
                    ...(c.colorGrading || {}),
                    temperature: -15, // Cool tint for B-story
                } as any;
            }
        });
        return { clips: out, videoTrackCount: 2, audioTrackCount: 2 };
    },
};

const nestedSequence: SequencePreset = {
    id: 'nested-sequence',
    name: 'Nested Sequence',
    description: 'Groups every 3-4 clips into subsequences. Each group becomes a single nested composition clip.',
    icon: 'FolderTree',
    category: 'advanced',
    apply: (clips, fps) => {
        const out = cloneClips(clips);
        const groupSize = 3;
        out.forEach((c, i) => {
            const groupIdx = Math.floor(i / groupSize);
            c.track = TRACK.V1;
            // Tag for subsequence grouping
            (c as any)._subsequenceGroup = `subseq-${groupIdx}`;
            (c as any)._subsequenceLabel = `Group ${groupIdx + 1}`;
        });
        return { clips: out, videoTrackCount: 1, audioTrackCount: 2 };
    },
};

const speedRampDrama: SequencePreset = {
    id: 'speed-ramp-drama',
    name: 'Speed Ramp Drama',
    description: 'Alternates between 0.5× slowmo and 2× fast motion. Ramped speed curves on each transition. Epic action-movie feel.',
    icon: 'Gauge',
    category: 'advanced',
    apply: (clips, fps) => {
        const out = cloneClips(clips);
        let cursor = 0;
        out.forEach((c, i) => {
            c.track = TRACK.V1;
            c.speed = i % 2 === 0 ? 0.5 : 2.0;
            c.speedCurvePreset = i % 2 === 0 ? 'ramp-down' : 'ramp-up';
            // Recalculate endFrame based on speed
            const sourceDur = (c.trimEndFrame - c.trimStartFrame) / c.speed;
            const dur = Math.round(sourceDur);
            c.startFrame = cursor;
            c.endFrame = cursor + dur;
            cursor += dur;
        });
        return { clips: out, videoTrackCount: 1, audioTrackCount: 2 };
    },
};

/* ════════════════════════════════════════════════════════════════════
 * EXPORTS
 * ════════════════════════════════════════════════════════════════════ */

export const SEQUENCE_PRESETS: SequencePreset[] = [
    // Structure (5)
    multiTrackSplit,
    abRoll,
    splitScreenDual,
    pictureInPicture,
    tripleLayer,
    // Pacing (4)
    rapidMontage,
    slowBuild,
    crescendoCut,
    breathingRhythm,
    // Audio (3)
    jCut,
    lCut,
    audioDucking,
    // Effects (3)
    flashCut,
    cinematicBars,
    glitchPulse,
    // Advanced (4)
    matchCut,
    parallelEdit,
    nestedSequence,
    speedRampDrama,
];

export const PRESET_CATEGORIES: { id: PresetCategory; label: string; icon: string }[] = [
    { id: 'structure', label: 'Structure', icon: 'Layers' },
    { id: 'pacing', label: 'Pacing', icon: 'Clock' },
    { id: 'audio', label: 'Audio', icon: 'Volume2' },
    { id: 'effects', label: 'Effects', icon: 'Sparkles' },
    { id: 'advanced', label: 'Advanced', icon: 'Cpu' },
];

/** Get all presets for a category */
export function getPresetsByCategory(category: PresetCategory): SequencePreset[] {
    return SEQUENCE_PRESETS.filter(p => p.category === category);
}

/** Get a preset by ID */
export function getPresetById(id: string): SequencePreset | undefined {
    return SEQUENCE_PRESETS.find(p => p.id === id);
}

/** Advanced editing patterns that are always applied in the generator pipeline.
 *  These were previously user-selectable in the Advanced Editing Patterns UI section. */
const ALWAYS_ACTIVE_ADVANCED_PRESETS = ['match-cut', 'parallel-edit', 'nested-sequence', 'speed-ramp-drama', 'j-cut', 'audio-ducking'] as const;

/** Resolve modern stacked presets while retaining saved legacy selections.
 *  Falls back to `defaultStructurePresets` when no explicit presets are selected,
 *  ensuring best-practice structure patterns are always applied.
 *  The four advanced editing patterns are always included regardless of user selection. */
export function resolveSequencePresetIds(settings: { sequencePresetIds?: string[]; sequencePresetId?: string; defaultStructurePresets?: string[] }): string[] {
    let ids: string[];
    const explicit = settings.sequencePresetIds?.filter(Boolean) ?? [];
    if (explicit.length > 0) {
        ids = explicit;
    } else if (settings.sequencePresetId) {
        ids = [settings.sequencePresetId];
    } else {
        // Fallback: apply default structure presets as best practices
        ids = settings.defaultStructurePresets?.filter(Boolean) ?? [];
    }
    // Always include advanced editing patterns
    return Array.from(new Set([...ids, ...ALWAYS_ACTIVE_ADVANCED_PRESETS]));
}

/** Apply multiple sequence patterns in user-selected order. */
export function applySequencePresetStack(clips: Clip[], presetIds: string[], fps: number): Clip[] {
    return presetIds.reduce((current, id) => {
        const preset = getPresetById(id);
        return preset && preset.category !== 'pacing' ? preset.apply(current, fps).clips : current;
    }, clips);
}
