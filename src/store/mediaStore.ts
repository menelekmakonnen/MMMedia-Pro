import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface RecentFolder {
    path: string;
    name: string;
    addedAt: number;
    fileCount: number;
}

export interface RecentAudioFile {
    path: string;
    name: string;
    addedAt: number;
}

export interface MediaFile {
    id: string;
    path: string;
    filename: string;
    type: 'video' | 'audio' | 'image';
    duration: number; // in seconds
    width?: number;
    height?: number;
    orientation?: 'horizontal' | 'vertical' | 'square';
    rotation?: 0 | 90 | 180 | 270;  // Committed rotation applied in preview + export
    pendingRotation?: 0 | 90 | 180 | 270;  // Uncommitted rotation awaiting user approval
    format?: string;
    size?: number;
    createdAt?: number;
    /** Filesystem modification time (mtime) — populated from fs.stat at import */
    modifiedAt?: number;
    /** Filesystem birth/creation time — populated from fs.stat at import */
    fileCreatedAt?: number;
    // Pre-import trim constraints (seconds). When set, all downstream tools
    // (trailer, godmode, timeline, flux) only use this portion of the source.
    trimIn?: number;   // Start of usable region (default: 0)
    trimOut?: number;  // End of usable region (default: duration)
    /** Include/exclude edit decisions layered over the usable region — the
     *  SOURCE OF TRUTH for which footage downstream tools may pull from. See
     *  lib/mediaSegments.ts (resolveKeptRanges). Empty/undefined = whole region. */
    segments?: import('../lib/mediaSegments').MediaSegment[];
    /** True once the Smart Engine has produced suggestions for this source. */
    smartAnalyzed?: boolean;
    /** Asset tags for the music-video generator (intro person-pull, "more shots
     *  on the stairs", per-scene grades). */
    tags?: { people?: string[]; scene?: string; location?: string; color?: string };
    /** Source is marked for deflickering — clips created from this file auto-inherit deflicker config */
    deflicker?: boolean;
    /** Whether the deflickered output keeps the original audio (default true) */
    deflickerAudio?: boolean;
    // ── Source-level framing (zoom + reposition) ──────────────────────────
    sourceZoom?: number;     // 100 = no zoom (default), 150 = 1.5x crop, etc.
    sourcePanX?: number;     // -100 to 100, horizontal offset from center (default 0)
    sourcePanY?: number;     // -100 to 100, vertical offset from center (default 0)
    // ── Usage weight (Edit Engine allocation influence) ───────────────────
    usageWeight?: number;    // default 1.0; 2.0 = show more, 0.5 = show less, -1 = show once
    usageMode?: 'more' | 'normal' | 'less' | 'once';
}

interface MediaState {
    files: MediaFile[];
    selectedFileIds: string[];
    lastSelectedFileId: string | null;
    orientationFilter: 'all' | 'horizontal' | 'vertical' | 'square';
    // Preloaded audio for Beat Intelligence Engine (set by MediaManager, consumed by TrailerWizard)
    preloadedAudioPath: string | null;
    preloadedAudioName: string | null;
    // Recent imports (persisted for sidebar suggestions)
    recentFolders: RecentFolder[];
    recentAudioFiles: RecentAudioFile[];

    // Actions
    addFiles: (newFiles: MediaFile[]) => void;
    removeFile: (id: string) => void;
    clearLibrary: () => void;
    updateFile: (id: string, updates: Partial<MediaFile>) => void;
    rotateFile: (id: string) => void;
    confirmRotation: (id: string) => void;
    cancelRotation: (id: string) => void;
    setOrientationFilter: (filter: 'all' | 'horizontal' | 'vertical' | 'square') => void;
    setPreloadedAudio: (path: string | null, name: string | null) => void;
    // Trim constraints
    setFileTrim: (id: string, trimIn: number, trimOut: number) => void;
    clearFileTrim: (id: string) => void;
    // Include/exclude segments (source of truth)
    setFileSegments: (id: string, segments: import('../lib/mediaSegments').MediaSegment[]) => void;
    addFileSegment: (id: string, segment: import('../lib/mediaSegments').MediaSegment) => void;
    updateFileSegment: (id: string, segmentId: string, patch: Partial<import('../lib/mediaSegments').MediaSegment>) => void;
    removeFileSegment: (id: string, segmentId: string) => void;
    toggleFileSegmentType: (id: string, segmentId: string) => void;
    clearFileSegments: (id: string) => void;
    // Multi-select actions
    toggleFileSelection: (id: string, mode: 'single' | 'ctrl' | 'shift', allVisibleIds?: string[]) => void;
    selectAllFiles: (visibleIds?: string[]) => void;
    clearSelection: () => void;
    // Recent imports
    addRecentFolder: (path: string, fileCount: number) => void;
    removeRecentFolder: (path: string) => void;
    addRecentAudio: (path: string) => void;
    removeRecentAudio: (path: string) => void;
    // Counter-clockwise rotation
    rotateFileCCW: (id: string) => void;
    // Source-level framing
    setFileFraming: (id: string, zoom: number, panX: number, panY: number) => void;
    resetFileFraming: (id: string) => void;
    // Usage weight
    setFileUsageWeight: (id: string, mode: 'more' | 'normal' | 'less' | 'once') => void;
}

export const useMediaStore = create<MediaState>()(
    persist(
        (set) => ({
            files: [],
            selectedFileIds: [],
            lastSelectedFileId: null,
            orientationFilter: 'all',
            preloadedAudioPath: null,
            preloadedAudioName: null,
            recentFolders: [],
            recentAudioFiles: [],

            addFiles: (newFiles) => set((state) => {
                return { files: [...state.files, ...newFiles] };
            }),

            removeFile: (id) => set((state) => ({
                files: state.files.filter(f => f.id !== id),
                selectedFileIds: state.selectedFileIds.filter(fid => fid !== id),
            })),

            clearLibrary: () => set({ files: [], selectedFileIds: [], lastSelectedFileId: null }),

            updateFile: (id, updates) => set((state) => ({
                files: state.files.map(f => f.id === id ? { ...f, ...updates } : f)
            })),

            // Sets a pending (preview-only) rotation — NOT committed until confirmRotation.
            rotateFile: (id) => set((state) => ({
                files: state.files.map(f => {
                    if (f.id !== id) return f;
                    // Rotate from the current pending (if mid-rotate) or committed rotation
                    const base = f.pendingRotation ?? f.rotation ?? 0;
                    const nextRotation = ((base + 90) % 360) as 0 | 90 | 180 | 270;
                    return { ...f, pendingRotation: nextRotation };
                })
            })),

            // Commits pendingRotation → rotation, recalculates orientation.
            confirmRotation: (id) => set((state) => ({
                files: state.files.map(f => {
                    if (f.id !== id || f.pendingRotation === undefined) return f;
                    const nextRotation = f.pendingRotation;

                    // For 90° and 270° rotations, the effective dimensions swap.
                    const isOrthogonal = nextRotation === 90 || nextRotation === 270;
                    const origW = f.width || 1920;
                    const origH = f.height || 1080;
                    const effectiveW = isOrthogonal ? origH : origW;
                    const effectiveH = isOrthogonal ? origW : origH;

                    const orientation: 'horizontal' | 'vertical' | 'square' =
                        effectiveW > effectiveH ? 'horizontal' :
                        effectiveH > effectiveW ? 'vertical' : 'square';

                    return { ...f, rotation: nextRotation, orientation, pendingRotation: undefined };
                })
            })),

            // Cancels pending rotation — reverts to the committed value.
            cancelRotation: (id) => set((state) => ({
                files: state.files.map(f =>
                    f.id === id ? { ...f, pendingRotation: undefined } : f
                )
            })),

            setOrientationFilter: (filter) => set({ orientationFilter: filter }),

            setPreloadedAudio: (path, name) => set({ preloadedAudioPath: path, preloadedAudioName: name }),

            setFileTrim: (id, trimIn, trimOut) => set((state) => ({
                files: state.files.map(f => f.id === id ? { ...f, trimIn, trimOut } : f)
            })),

            clearFileTrim: (id) => set((state) => ({
                files: state.files.map(f => f.id === id ? { ...f, trimIn: undefined, trimOut: undefined } : f)
            })),

            // ── Include/exclude segments (source of truth) ──────────────────
            setFileSegments: (id, segments) => set((state) => ({
                files: state.files.map(f => f.id === id ? { ...f, segments } : f)
            })),

            addFileSegment: (id, segment) => set((state) => ({
                files: state.files.map(f => f.id === id ? { ...f, segments: [...(f.segments ?? []), segment] } : f)
            })),

            updateFileSegment: (id, segmentId, patch) => set((state) => ({
                files: state.files.map(f => f.id === id
                    ? { ...f, segments: (f.segments ?? []).map(s => s.id === segmentId ? { ...s, ...patch } : s) }
                    : f)
            })),

            removeFileSegment: (id, segmentId) => set((state) => ({
                files: state.files.map(f => f.id === id
                    ? { ...f, segments: (f.segments ?? []).filter(s => s.id !== segmentId) }
                    : f)
            })),

            toggleFileSegmentType: (id, segmentId) => set((state) => ({
                files: state.files.map(f => f.id === id
                    ? { ...f, segments: (f.segments ?? []).map(s => s.id === segmentId
                        ? { ...s, type: s.type === 'include' ? 'exclude' as const : 'include' as const, origin: 'user' as const }
                        : s) }
                    : f)
            })),

            clearFileSegments: (id) => set((state) => ({
                files: state.files.map(f => f.id === id ? { ...f, segments: [] } : f)
            })),

            toggleFileSelection: (id, mode, allVisibleIds) => set((state) => {
                if (mode === 'single') {
                    // Plain click: toggle single selection (deselect if already only selected)
                    const isAlreadySole = state.selectedFileIds.length === 1 && state.selectedFileIds[0] === id;
                    return {
                        selectedFileIds: isAlreadySole ? [] : [id],
                        lastSelectedFileId: id,
                    };
                }
                if (mode === 'ctrl') {
                    // Ctrl+Click: toggle individual item in/out of selection
                    const isSelected = state.selectedFileIds.includes(id);
                    return {
                        selectedFileIds: isSelected
                            ? state.selectedFileIds.filter(fid => fid !== id)
                            : [...state.selectedFileIds, id],
                        lastSelectedFileId: id,
                    };
                }
                if (mode === 'shift' && allVisibleIds) {
                    // Shift+Click: range select from lastSelectedFileId to id
                    const anchor = state.lastSelectedFileId;
                    if (!anchor) {
                        return { selectedFileIds: [id], lastSelectedFileId: id };
                    }
                    const anchorIdx = allVisibleIds.indexOf(anchor);
                    const targetIdx = allVisibleIds.indexOf(id);
                    if (anchorIdx === -1 || targetIdx === -1) {
                        return { selectedFileIds: [id], lastSelectedFileId: id };
                    }
                    const start = Math.min(anchorIdx, targetIdx);
                    const end = Math.max(anchorIdx, targetIdx);
                    const rangeIds = allVisibleIds.slice(start, end + 1);
                    // Merge with existing ctrl selections
                    const merged = new Set([...state.selectedFileIds, ...rangeIds]);
                    return { selectedFileIds: Array.from(merged), lastSelectedFileId: id };
                }
                return state;
            }),

            selectAllFiles: (visibleIds) => set((state) => ({
                selectedFileIds: visibleIds ?? state.files.map(f => f.id),
            })),

            clearSelection: () => set({ selectedFileIds: [], lastSelectedFileId: null }),

            addRecentFolder: (path, fileCount) => set((state) => {
                const name = path.split(/[\\/]/).pop() || path;
                const existing = state.recentFolders.filter(f => f.path !== path);
                return { recentFolders: [{ path, name, addedAt: Date.now(), fileCount }, ...existing] };
            }),

            removeRecentFolder: (path) => set((state) => ({
                recentFolders: state.recentFolders.filter(f => f.path !== path),
            })),

            addRecentAudio: (path) => set((state) => {
                const name = path.split(/[\\/]/).pop() || path;
                const existing = state.recentAudioFiles.filter(f => f.path !== path);
                return { recentAudioFiles: [{ path, name, addedAt: Date.now() }, ...existing] };
            }),

            removeRecentAudio: (path) => set((state) => ({
                recentAudioFiles: state.recentAudioFiles.filter(f => f.path !== path),
            })),

            // Counter-clockwise rotation (subtract 90°)
            rotateFileCCW: (id) => set((state) => ({
                files: state.files.map(f => {
                    if (f.id !== id) return f;
                    const base = f.pendingRotation ?? f.rotation ?? 0;
                    const nextRotation = ((base - 90 + 360) % 360) as 0 | 90 | 180 | 270;
                    return { ...f, pendingRotation: nextRotation };
                })
            })),

            // Source-level framing (zoom + reposition)
            setFileFraming: (id, zoom, panX, panY) => set((state) => ({
                files: state.files.map(f => f.id === id
                    ? { ...f, sourceZoom: zoom, sourcePanX: panX, sourcePanY: panY }
                    : f)
            })),

            resetFileFraming: (id) => set((state) => ({
                files: state.files.map(f => f.id === id
                    ? { ...f, sourceZoom: undefined, sourcePanX: undefined, sourcePanY: undefined }
                    : f)
            })),

            // Usage weight
            setFileUsageWeight: (id, mode) => set((state) => {
                const weightMap = { more: 2.0, normal: 1.0, less: 0.5, once: -1 };
                return {
                    files: state.files.map(f => f.id === id
                        ? { ...f, usageMode: mode, usageWeight: weightMap[mode] }
                        : f)
                };
            }),
        }),
        {
            name: 'mmmedia-media-storage',
            partialize: (state) => ({
                orientationFilter: state.orientationFilter,
                recentFolders: state.recentFolders,
                recentAudioFiles: state.recentAudioFiles,
            }),
        }
    )
);

