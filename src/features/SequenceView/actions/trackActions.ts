/**
 * Track Management Actions
 *
 * Track CRUD and clip-to-track operations.
 * All mutations are undoable via the history store.
 *
 * Track IDs are numeric in this project:
 *   Track 1 = Video 1 (primary), Track 2+ = additional video/audio.
 *   Track 100+ = dedicated audio-only tracks.
 */

import { useClipStore } from '../../../store/clipStore';
import { useHistoryStore } from '../../../store/historyStore';
import { createSetClipsCommand } from '../../../lib/commandPattern';
import type { Clip } from '../../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cloneClips(clips: Clip[]): Clip[] {
    return JSON.parse(JSON.stringify(clips));
}

function commitClips(newClips: Clip[], description: string): void {
    const cmd = createSetClipsCommand(
        () => useClipStore.getState(),
        (updater) => useClipStore.setState(updater(useClipStore.getState())),
        newClips,
        description,
    );
    useHistoryStore.getState().execute(cmd);
}

/** Get all track numbers currently in use. */
function getUsedTracks(clips: Clip[]): Set<number> {
    return new Set(clips.map((c) => c.track));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Add a new track.
 *
 * @param type - 'video' or 'audio'
 * @param position - Optional specific track number. If omitted, auto-assigns
 *                   the next available number in the appropriate range.
 * @returns The new track ID (as string, matching the convention).
 */
export function addTrack(type: 'video' | 'audio', position?: number): string {
    const clips = useClipStore.getState().clips;
    const usedTracks = getUsedTracks(clips);

    let trackId: number;

    if (position !== undefined) {
        trackId = position;
    } else if (type === 'audio') {
        // Audio tracks start at 100.
        let candidate = 101;
        while (usedTracks.has(candidate)) candidate++;
        trackId = candidate;
    } else {
        // Video tracks start at 1.
        let candidate = 2; // Track 1 is always primary.
        while (usedTracks.has(candidate) && candidate < 100) candidate++;
        trackId = candidate;
    }

    // Adding a track doesn't modify clips directly — the track "exists" as soon
    // as a clip references it. We'll record the intent for undo purposes by
    // adding/removing a zero-duration sentinel if needed, but the simpler approach
    // is to just return the ID and let the caller use it.
    return String(trackId);
}

/**
 * Remove a track. Only succeeds if the track has no clips.
 *
 * @returns true if the track was empty and "removed", false otherwise.
 */
export function removeTrack(trackId: string): boolean {
    const track = parseInt(trackId, 10);
    const clips = useClipStore.getState().clips;

    const trackClips = clips.filter((c) => c.track === track);
    if (trackClips.length > 0) {
        return false; // Track is not empty.
    }

    // Track doesn't exist in clips at all — it's already effectively removed.
    // If there are track-level settings (mutes/volumes), clear them.
    const { trackMutes, trackVolumes } = useClipStore.getState();
    const newMutes = { ...trackMutes };
    const newVolumes = { ...trackVolumes };
    delete newMutes[track];
    delete newVolumes[track];

    useClipStore.setState({ trackMutes: newMutes, trackVolumes: newVolumes });
    return true;
}

/**
 * Move a clip to a different track.
 *
 * The clip keeps its timeline position (startFrame/endFrame); only the
 * track assignment changes. Creates an undo entry.
 */
export function moveClipToTrack(clipId: string, targetTrackId: string): void {
    const targetTrack = parseInt(targetTrackId, 10);
    const clips = cloneClips(useClipStore.getState().clips);
    const clip = clips.find((c) => c.id === clipId);

    if (!clip || clip.locked) return;
    if (clip.track === targetTrack) return; // No-op.

    const oldTrack = clip.track;
    clip.track = targetTrack;

    commitClips(clips, `Move clip to track ${targetTrack} (from ${oldTrack})`);
}
