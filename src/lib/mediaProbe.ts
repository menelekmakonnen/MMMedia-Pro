/**
 * Media Probe — Shared utility for probing media file metadata.
 * ════════════════════════════════════════════════════════════════════════════
 * Extracts duration, dimensions, and orientation from video/audio files
 * using HTML5 media elements. Used by both MediaManagerTab (import) and
 * EditsTab (project restore from saved edits).
 */

import { v4 as uuidv4 } from 'uuid';

export interface MediaMetadata {
    duration: number;
    width: number;
    height: number;
    orientation: 'horizontal' | 'vertical' | 'square';
}

export interface ProbeMediaFile {
    id: string;
    path: string;
    filename: string;
    type: 'video' | 'audio' | 'image';
    duration: number;
    width?: number;
    height?: number;
    orientation?: 'horizontal' | 'vertical' | 'square';
    createdAt?: number;
}

/**
 * Probe a video file for metadata (duration, dimensions, orientation)
 * using a temporary HTML5 video element.
 */
export function probeVideoMetadata(path: string): Promise<MediaMetadata> {
    return new Promise((resolve, reject) => {
        const element = document.createElement('video');
        element.preload = 'metadata';
        element.src = `file://${path}`;

        element.onloadedmetadata = () => {
            const w = element.videoWidth;
            const h = element.videoHeight;
            const orientation = w > h ? 'horizontal' : h > w ? 'vertical' : 'square';
            resolve({ duration: element.duration, width: w, height: h, orientation });
            element.remove();
        };

        element.onerror = (e) => {
            reject(e);
            element.remove();
        };
    });
}

/**
 * Probe an audio file for duration using a temporary HTML5 audio element.
 */
export function probeAudioDuration(path: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const el = document.createElement('audio');
        el.preload = 'metadata';
        el.src = `file://${path}`;
        el.onloadedmetadata = () => { resolve(el.duration); el.remove(); };
        el.onerror = (e) => { reject(e); el.remove(); };
    });
}

/**
 * Build a fully-probed MediaFile from a raw file descriptor.
 * Probes metadata for video/audio files; images get duration=0.
 */
export async function buildMediaFile(file: { path: string; filename: string; type: string }): Promise<ProbeMediaFile> {
    let duration = 0;
    let width = 0;
    let height = 0;
    let orientation: 'horizontal' | 'vertical' | 'square' = 'horizontal';

    if (file.type === 'video') {
        try {
            const meta = await probeVideoMetadata(file.path);
            duration = meta.duration;
            width = meta.width;
            height = meta.height;
            orientation = meta.orientation;
        } catch (e) {
            console.warn('[mediaProbe] Failed to probe video:', file.path, e);
        }
    } else if (file.type === 'audio') {
        try {
            duration = await probeAudioDuration(file.path);
        } catch (e) {
            console.warn('[mediaProbe] Failed to probe audio:', file.path, e);
        }
    }

    return {
        id: getStableMediaId(file.path),
        path: file.path,
        filename: file.filename,
        type: file.type as 'video' | 'audio' | 'image',
        duration,
        width: width || undefined,
        height: height || undefined,
        orientation,
        createdAt: Date.now(),
    };
}

export function getStableMediaId(path: string): string {
    let hash = 0;
    for (let i = 0; i < path.length; i++) {
        hash = (hash << 5) - hash + path.charCodeAt(i);
        hash |= 0;
    }
    return `f-${Math.abs(hash)}`;
}
