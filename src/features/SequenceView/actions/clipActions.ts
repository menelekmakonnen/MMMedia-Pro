/**
 * Clip CRUD Actions
 *
 * Insert, overwrite, delete, clipboard, and enable/disable operations.
 * All mutations go through the Command pattern for undo/redo.
 *
 * The internal clipboard is module-scoped (not in Zustand) to hold
 * deep-cloned clip references without serialization overhead.
 */

import { useClipStore } from '../../../store/clipStore';
import { useHistoryStore } from '../../../store/historyStore';
import { createSetClipsCommand } from '../../../lib/commandPattern';
import { v4 as uuidv4 } from 'uuid';
import type { Clip } from '../../../types';
import type { MediaFile } from '../../../store/mediaStore';

// ─── Internal Clipboard ───────────────────────────────────────────────────────

let _clipboard: Clip[] = [];

/** Read-only access to clipboard count (for toolbar badge). */
export function getClipboardCount(): number {
    return _clipboard.length;
}

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

/** Build a Clip from a MediaFile and frame range. */
function mediaToClip(
    media: MediaFile,
    inFrame: number,
    outFrame: number,
    startFrame: number,
    track: number,
): Clip {
    const durationFrames = outFrame - inFrame;
    return {
        id: uuidv4(),
        type: media.type === 'audio' ? 'audio' : (media.type === 'image' ? 'image' : 'video'),
        path: media.path,
        filename: media.filename,
        startFrame,
        endFrame: startFrame + durationFrames,
        sourceDurationFrames: Math.round(media.duration * 30), // fallback; real value from probe
        trimStartFrame: inFrame,
        trimEndFrame: outFrame,
        track,
        speed: 1,
        volume: 100,
        reversed: false,
        locked: false,
        origin: 'manual',
        width: media.width,
        height: media.height,
    };
}

// ─── Insert ───────────────────────────────────────────────────────────────────

/**
 * Insert a clip from the source monitor at the playhead.
 * Pushes all downstream clips on the target track to make room (ripple insert).
 */
export function insertClipAtPlayhead(
    mediaFile: MediaFile,
    inFrame: number,
    outFrame: number,
    trackId: string,
    playheadFrame: number,
): void {
    const track = parseInt(trackId, 10) || 1;
    const clips = cloneClips(useClipStore.getState().clips);
    const insertDuration = outFrame - inFrame;

    // Ripple: shift downstream clips on the same track.
    for (const c of clips) {
        if (c.track === track && c.startFrame >= playheadFrame) {
            c.startFrame += insertDuration;
            c.endFrame += insertDuration;
        }
    }

    const newClip = mediaToClip(mediaFile, inFrame, outFrame, playheadFrame, track);
    clips.push(newClip);

    commitClips(clips, `Insert "${mediaFile.filename}"`);
}

/**
 * Overwrite: replace timeline content at the playhead position.
 * Clips that overlap the overwrite region are trimmed or removed.
 */
export function overwriteAtPlayhead(
    mediaFile: MediaFile,
    inFrame: number,
    outFrame: number,
    trackId: string,
    playheadFrame: number,
): void {
    const track = parseInt(trackId, 10) || 1;
    let clips = cloneClips(useClipStore.getState().clips);
    const overwriteDuration = outFrame - inFrame;
    const overwriteEnd = playheadFrame + overwriteDuration;

    // Remove or trim clips that fall in the overwrite zone.
    clips = clips.flatMap((c) => {
        if (c.track !== track) return [c];

        const clipEnd = c.endFrame;

        // Fully inside overwrite zone → remove.
        if (c.startFrame >= playheadFrame && clipEnd <= overwriteEnd) {
            return [];
        }

        // Spans the entire overwrite zone → split into two pieces.
        if (c.startFrame < playheadFrame && clipEnd > overwriteEnd) {
            const speed = c.speed ?? 1;
            const leftHalf: Clip = {
                ...JSON.parse(JSON.stringify(c)),
                endFrame: playheadFrame,
                trimEndFrame: c.trimStartFrame + Math.round((playheadFrame - c.startFrame) * speed),
            };
            const rightHalf: Clip = {
                ...JSON.parse(JSON.stringify(c)),
                id: uuidv4(),
                startFrame: overwriteEnd,
                trimStartFrame: c.trimStartFrame + Math.round((overwriteEnd - c.startFrame) * speed),
            };
            return [leftHalf, rightHalf];
        }

        // Overlaps start of overwrite zone → trim end.
        if (c.startFrame < playheadFrame && clipEnd > playheadFrame) {
            const speed = c.speed ?? 1;
            c.endFrame = playheadFrame;
            c.trimEndFrame = c.trimStartFrame + Math.round((playheadFrame - c.startFrame) * speed);
            return [c];
        }

        // Overlaps end of overwrite zone → trim start.
        if (c.startFrame < overwriteEnd && clipEnd > overwriteEnd) {
            const speed = c.speed ?? 1;
            const trimDelta = Math.round((overwriteEnd - c.startFrame) * speed);
            c.trimStartFrame += trimDelta;
            c.startFrame = overwriteEnd;
            return [c];
        }

        return [c];
    });

    const newClip = mediaToClip(mediaFile, inFrame, outFrame, playheadFrame, track);
    clips.push(newClip);

    commitClips(clips, `Overwrite "${mediaFile.filename}"`);
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/** Delete selected clips, leaving gaps (Lift edit). */
export function deleteSelectedClips(): void {
    const store = useClipStore.getState();
    const selectedIds = new Set(store.selectedClipIds);
    if (selectedIds.size === 0) return;

    const newClips = store.clips.filter((c) => !selectedIds.has(c.id) || c.locked);

    commitClips(newClips, `Delete ${selectedIds.size} clip(s)`);

    // Clear selection.
    useClipStore.setState({ selectedClipIds: [], selectedSegment: null });
}

/** Ripple delete: remove selected clips AND close the gap. */
export function rippleDeleteSelectedClips(): void {
    const store = useClipStore.getState();
    const selectedIds = new Set(store.selectedClipIds);
    if (selectedIds.size === 0) return;

    const removed = store.clips.filter((c) => selectedIds.has(c.id) && !c.locked);
    if (removed.length === 0) return;

    let newClips = store.clips.filter((c) => !selectedIds.has(c.id) || c.locked);

    // Close gaps per-track.
    const trackGaps = new Map<number, { start: number; duration: number }[]>();
    for (const clip of removed) {
        const gaps = trackGaps.get(clip.track) ?? [];
        gaps.push({ start: clip.startFrame, duration: clip.endFrame - clip.startFrame });
        trackGaps.set(clip.track, gaps);
    }

    // Sort gaps per track by start position (reverse) and shift downstream clips.
    for (const [track, gaps] of trackGaps) {
        gaps.sort((a, b) => b.start - a.start); // process from end to avoid cascading shifts
        for (const gap of gaps) {
            for (const c of newClips) {
                if (c.track === track && c.startFrame >= gap.start) {
                    c.startFrame -= gap.duration;
                    c.endFrame -= gap.duration;
                }
            }
        }
    }

    commitClips(cloneClips(newClips), `Ripple delete ${removed.length} clip(s)`);
    useClipStore.setState({ selectedClipIds: [], selectedSegment: null });
}

// ─── Clipboard ────────────────────────────────────────────────────────────────

/** Copy selected clips to the internal clipboard. */
export function copySelectedClips(): void {
    const store = useClipStore.getState();
    const selectedIds = new Set(store.selectedClipIds);
    if (selectedIds.size === 0) return;

    _clipboard = cloneClips(store.clips.filter((c) => selectedIds.has(c.id)));
}

/** Paste clipboard contents at the playhead frame. */
export function pasteAtPlayhead(playheadFrame: number): void {
    if (_clipboard.length === 0) return;

    const clips = cloneClips(useClipStore.getState().clips);

    // Determine the earliest start frame in the clipboard to compute offset.
    const minStart = Math.min(..._clipboard.map((c) => c.startFrame));
    const offset = playheadFrame - minStart;

    const pasted = _clipboard.map((c) => ({
        ...JSON.parse(JSON.stringify(c)) as Clip,
        id: uuidv4(),
        startFrame: c.startFrame + offset,
        endFrame: c.endFrame + offset,
        origin: 'manual' as const,
    }));

    commitClips([...clips, ...pasted], `Paste ${pasted.length} clip(s)`);

    // Select pasted clips.
    useClipStore.setState({ selectedClipIds: pasted.map((c) => c.id) });
}

/** Cut = copy + delete. */
export function cutSelectedClips(): void {
    copySelectedClips();
    deleteSelectedClips();
}

/** Duplicate selected clips, placing copies immediately after originals. */
export function duplicateSelectedClips(): void {
    const store = useClipStore.getState();
    const selectedIds = new Set(store.selectedClipIds);
    if (selectedIds.size === 0) return;

    const clips = cloneClips(store.clips);
    const duplicates: Clip[] = [];

    for (const clip of store.clips) {
        if (!selectedIds.has(clip.id)) continue;

        const duration = clip.endFrame - clip.startFrame;
        const dupe: Clip = {
            ...JSON.parse(JSON.stringify(clip)),
            id: uuidv4(),
            startFrame: clip.endFrame,
            endFrame: clip.endFrame + duration,
            origin: 'manual' as const,
        };
        duplicates.push(dupe);
    }

    commitClips([...clips, ...duplicates], `Duplicate ${duplicates.length} clip(s)`);
    useClipStore.setState({ selectedClipIds: duplicates.map((c) => c.id) });
}

// ─── Toggle Enable / Disable ──────────────────────────────────────────────────

/** Toggle a clip's disabled state (non-destructive hide from playback/export). */
export function toggleClipEnabled(clipId: string): void {
    const clips = cloneClips(useClipStore.getState().clips);
    const clip = clips.find((c) => c.id === clipId);
    if (!clip) return;

    clip.disabled = !clip.disabled;
    const state = clip.disabled ? 'Disable' : 'Enable';

    commitClips(clips, `${state} clip "${clip.filename}"`);
}

// ─── Subsequence Nesting ──────────────────────────────────────────────────────

/**
 * Nest selected clips as a subsequence (sub-composition).
 *
 * Replaces the selected clips with a single "composition" clip whose
 * `subClips` field holds deep-clones of the originals. The composition
 * clip spans from the earliest start to the latest end of the selected clips.
 */
export function nestAsSubsequence(clipIds: string[]): void {
    if (clipIds.length < 2) return;

    const store = useClipStore.getState();
    const selectedClips = store.clips.filter((c) => clipIds.includes(c.id));
    if (selectedClips.length < 2) return;

    const minStart = Math.min(...selectedClips.map((c) => c.startFrame));
    const maxEnd = Math.max(...selectedClips.map((c) => c.endFrame));
    const primaryTrack = selectedClips[0].track;

    // Store sub-clips with timeline-relative offsets.
    const subClips: Clip[] = selectedClips.map((c) => ({
        ...JSON.parse(JSON.stringify(c)),
        // Convert to composition-local coordinates.
        startFrame: c.startFrame - minStart,
        endFrame: c.endFrame - minStart,
    }));

    const compositionClip: Clip = {
        id: uuidv4(),
        type: 'video',
        path: '',
        filename: `Subsequence (${selectedClips.length} clips)`,
        startFrame: minStart,
        endFrame: maxEnd,
        sourceDurationFrames: maxEnd - minStart,
        trimStartFrame: 0,
        trimEndFrame: maxEnd - minStart,
        track: primaryTrack,
        speed: 1,
        volume: 100,
        reversed: false,
        locked: false,
        origin: 'manual',
        // Store nested clips in a special field.
        // TypeScript Note: this is stored via the `as any` escape because
        // subClips is not in the base Clip interface — it's a runtime extension.
    } as Clip & { subClips: Clip[] };

    (compositionClip as any).subClips = subClips;

    const removedIds = new Set(clipIds);
    const newClips = [
        ...store.clips.filter((c) => !removedIds.has(c.id)),
        compositionClip,
    ];

    commitClips(newClips, `Nest ${selectedClips.length} clips as subsequence`);
    useClipStore.setState({ selectedClipIds: [compositionClip.id] });
}

/**
 * Unnest a subsequence back to individual clips.
 *
 * Extracts the sub-clips stored in the composition clip's `subClips` field,
 * converts their coordinates back to absolute timeline space, and replaces
 * the composition clip with the originals.
 */
export function unnestSubsequence(clipId: string): void {
    const store = useClipStore.getState();
    const compClip = store.clips.find((c) => c.id === clipId) as any;

    if (!compClip || !compClip.subClips || !Array.isArray(compClip.subClips)) {
        return; // Not a composition clip.
    }

    const baseFrame = compClip.startFrame;

    // Convert sub-clips back to absolute timeline coordinates.
    const restored: Clip[] = compClip.subClips.map((sc: Clip) => ({
        ...JSON.parse(JSON.stringify(sc)),
        id: uuidv4(), // Fresh IDs to avoid conflicts.
        startFrame: sc.startFrame + baseFrame,
        endFrame: sc.endFrame + baseFrame,
    }));

    const newClips = [
        ...store.clips.filter((c) => c.id !== clipId),
        ...restored,
    ];

    commitClips(newClips, `Unnest subsequence (${restored.length} clips)`);
    useClipStore.setState({ selectedClipIds: restored.map((c) => c.id) });
}
