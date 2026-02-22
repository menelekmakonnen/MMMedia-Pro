// Project Settings Types
export type ResolutionPreset = '9:16' | '16:9' | '1:1' | '4:3' | '21:9';
export type BackgroundFillMode = 'blur' | 'black';

export interface ProjectResolution {
    width: number;
    height: number;
    label: string;
}

export interface ProjectSettings {
    id: string;
    name: string;
    resolution: ProjectResolution;
    aspectRatio: string;
    fps: number;
    backgroundFillMode: BackgroundFillMode;
    createdAt: string;
    lastModified: string;
    targetDurationSeconds?: number;
    sequenceLoop?: boolean;

    // Contract 4: Randomization
    seed?: string;
    projectType?: 'auto' | 'god-mode' | 'manual';

    // UI Persistence
    sequenceViewSplitHeight?: number;
}

// Clip Types
export type ClipType = 'video' | 'image' | 'audio';

export interface Asset {
    id: string;
    name: string;
    type: 'speed-ramp' | 'effect';
    description?: string;
    thumbnail?: string;
}

export interface SpeedRamp extends Asset {
    type: 'speed-ramp';
    points: Array<{ x: number, y: number }>; // Normalized 0-1 Bezier points
}

export interface Effect extends Asset {
    type: 'effect';
    shader: string; // CSS filter or WebGL shader name
    parameters: Record<string, number | string | boolean>;
}

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

    // Metadata
    width?: number;
    height?: number;

    // Playback properties
    track: number;
    speed: number;        // 1.0 = normal (Constant speed)
    volume: number;       // 0-100 (percentage)
    reversed: boolean;
    locked: boolean;
    isPinned?: boolean;   // NEW: Prevents clip from being moved
    isMuted?: boolean;    // NEW: Per-clip mute
    disabled?: boolean;   // NEW: Non-destructive deletion (hides from playback/export)
    zoomLevel?: number;   // 100 to 200 percentage
    zoomOrigin?: 'center' | 'top' | 'bottom' | 'left' | 'right'; // Anchor point for zoom

    // Audio Analysis
    bpm?: number;
    beatMarkers?: { time: number, energy: number }[];

    // Asset References
    speedRampId?: string; // Overrides 'speed' if present
    effectIds?: string[]; // Applied in order

    // Metadata
    metadata?: {
        width: number;
        height: number;
        fps: number;
        format: string;
    };

    // Ownership (Contract 5)
    origin?: 'auto' | 'manual';

    // Linkage
    mediaLibraryId?: string; // ID of the MediaFile this clip was created from
}

// Manifest Protocol (Contract 2)
export interface Manifest {
    version: "1.0";
    project: ProjectSettings;
    clips: Clip[];
}

export type TabId = 'dashboard' | 'media' | 'timeline' | 'godmode' | 'export' | 'sequence';
