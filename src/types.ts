import type { TextOverlay } from './lib/textOverlay';
import type { AudioEffects } from './lib/audioEffects';

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
export type ClipType = 'video' | 'image' | 'audio' | 'grid';

export interface Asset {
    id: string;
    name: string;
    type: 'effect';
    description?: string;
    thumbnail?: string;
}

export interface Effect extends Asset {
    type: 'effect';
    lumetriPreset?: string; // Lumetri LUT/preset filename
    shader?: string; // CSS filter or WebGL shader name (legacy)
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
    zoomLevel?: number;   // 100 to 200 percentage (Static fallback)
    zoomStart?: number;   // Dynamic zoom start percentage
    zoomEnd?: number;     // Dynamic zoom end percentage
    zoomOrigin?: 'center' | 'top' | 'bottom' | 'left' | 'right'; // Anchor point for zoom



    // Audio Analysis
    bpm?: number;
    beatMarkers?: { time: number, energy: number }[];

    // Asset References

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



    // Source orientation for rendering decisions
    sourceOrientation?: 'horizontal' | 'vertical' | 'square';

    // Persistent rotation (0/90/180/270 degrees) — applied in preview AND export
    rotation?: 0 | 90 | 180 | 270;

    // Boomerang (damped-bounce forward↔reverse effect)
    boomerang?: boolean;

    // Parametric effects (new system — each with adjustable params)
    parametricEffects?: Array<{
        effectId: string;
        params: Record<string, number | string | boolean>;
    }>;

    // Color grading
    colorGrading?: import('./lib/colorGrading').ColorGrading;

    // Quick transform tools
    flipH?: boolean;
    flipV?: boolean;
    sharpen?: number;       // 0 = off, 0.5-3.0 = strength
    blurAmount?: number;    // 0 = off, 0.5-20 = sigma

    // Chroma key (green screen removal)
    chromaKey?: {
        enabled: boolean;
        color: string;      // hex color (e.g. '#00ff00')
        similarity: number; // 0.01-1.0
        blend: number;      // 0.0-1.0
    };

    // Video stabilization
    stabilize?: {
        enabled: boolean;
        smoothing: number;  // 1-60, default 10
    };

    // Linkage
    mediaLibraryId?: string; // ID of the MediaFile this clip was created from

    // Text Overlays (rendered via FFmpeg drawtext during export)
    textOverlays?: TextOverlay[];

    // Audio Effects (EQ, compression, noise reduction, etc.)
    audioEffects?: AudioEffects;
}

export interface GridCell {
    id: string; // Internal cell id
    clip: Clip | null; // Legacy — single clip for backward compatibility
    clips: Clip[]; // Mini-timeline — ordered list of clips in sequence
    x: number; // 0-1 percentage
    y: number; // 0-1 percentage
    width: number; // 0-1 percentage
    height: number; // 0-1 percentage
}

export type GridFormat = 'horizontal' | 'vertical' | 'square';

export interface GridClip extends Clip {
    type: 'grid';
    gridFormat: GridFormat;
    numCells: number; // 2 to 12
    cells: GridCell[];
    backgroundMode: BackgroundFillMode;
    // Global grid playback sync
    globalShuffle?: boolean;
    globalFlux?: boolean;
}



export type TabId = 'dashboard' | 'media' | 'trailer' | 'timeline' | 'grideditor' | 'export' | 'sequence' | 'videoplayer' | 'edits' | 'global-settings';
