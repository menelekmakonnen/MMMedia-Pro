export type ClipType = 'video' | 'image' | 'audio';

export interface Clip {
    id: string;
    type: ClipType;
    path: string;
    filename: string;

    // Frame-based timing (Source of Truth)
    startFrame: number;      // Timeline In
    endFrame: number;        // Timeline Out
    sourceDurationFrames: number; // Total length of source media
    trimStartFrame: number;  // Source In
    trimEndFrame: number;    // Source Out

    // Playback properties
    track: number;
    speed: number;        // 1.0 = normal
    volume: number;       // 0-100 (percentage)
    reversed: boolean;
    locked: boolean;
    isPinned?: boolean;   // NEW: Prevents clip from being moved
    isMuted?: boolean;    // NEW: Per-clip mute

    // Metadata
    metadata?: {
        width: number;
        height: number;
        fps: number;
        format: string;
    };
}

export type TabId = 'dashboard' | 'media' | 'timeline' | 'godmode' | 'export';
