import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Video, Mic, Volume2, VolumeX, Eye, EyeOff, Lock, Unlock, Link2, GripVertical } from 'lucide-react';
import { useHistoryStore } from '../../store/historyStore';
import { useClipStore, Clip } from '../../store/clipStore';
import { useProjectStore } from '../../store/projectStore';
import { useUserStore } from '../../store/userStore';

import { DEFAULT_FPS } from '../../lib/time';
import { SequenceToolbar, SequenceTool } from './SequenceToolbar';
import { ProgramMonitor } from './ProgramMonitor';
import { SequenceInspector } from './SequenceInspector';
import { EffectControlsPanel } from './inspector/EffectControlsPanel';
import { ClipSpeedDurationDialog } from './inspector/ClipSpeedDurationDialog';
import { MarkersPanel } from './MarkersPanel';
import { SourceMonitor } from './SourceMonitor';
import { AdjustmentLayerDialog } from './AdjustmentLayerDialog';
import { SequenceMenuBar } from './SequenceMenuBar';
import { Sliders, SlidersHorizontal } from 'lucide-react';

import clsx from 'clsx';
import { TimelineCanvas } from './timeline/TimelineCanvas';
import { AudioMeters } from './audio/AudioMeters';
import { KeyboardShortcutsOverlay } from './KeyboardShortcutsOverlay';
import { useTimelineStore } from './timeline/useTimelineStore';
import { useSequenceViewStore } from '../../store/sequenceViewStore';
import { EffectsBrowser } from './effects/EffectsBrowser';
import { LumetriColorPanel } from './color/LumetriColorPanel';
import { ScopePanel } from './scopes/ScopePanel';
import { Sparkles, BarChart2, PanelLeftClose, PanelLeftOpen, Palette } from 'lucide-react';
import {
    splitAtPlayhead,
    deleteSelectedClips,
    rippleDeleteSelectedClips,
    duplicateSelectedClips,
    toggleClipEnabled,
} from './actions';

const DEFAULT_SCALE = 0.5; // Pixels per frame

export const SequenceViewTab: React.FC = () => {
    const { clips, magnetizeClips, transitionStrategy, trackMutes, trackVolumes, setTrackMuted, setTrackVolume, updateClip, selectedClipIds } = useClipStore();
    const { settings } = useProjectStore();
    const { masterVolume, isMasterMuted, setMasterVolume, setIsMasterMuted } = useUserStore();

    const [scale, setScale] = useState(DEFAULT_SCALE);
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

    // Left panel state from store
    const {
        leftPanelOpen, leftPanelWidth, leftPanelTab,
        setLeftPanelOpen, setLeftPanelWidth, setLeftPanelTab, toggleLeftPanel,
    } = useSequenceViewStore();

    // Track-level controls: lock, visibility, solo
    const [trackLocked, setTrackLocked] = useState<Record<number, boolean>>({});
    const [trackHidden, setTrackHidden] = useState<Record<number, boolean>>({});
    const [trackSolo, setTrackSolo] = useState<Record<number, boolean>>({});
    const toggleTrackLock = (id: number) => setTrackLocked(p => ({ ...p, [id]: !p[id] }));
    const toggleTrackHidden = (id: number) => setTrackHidden(p => ({ ...p, [id]: !p[id] }));
    const toggleTrackSolo = (id: number) => setTrackSolo(p => ({ ...p, [id]: !p[id] }));

    // ── Audio clip drag state ──
    const [dragClipId, setDragClipId] = useState<string | null>(null);
    const dragStartXRef = useRef(0);
    const dragOrigStartFrameRef = useRef(0);
    const dragOrigEndFrameRef = useRef(0);
    const [currentGlobalFrame, setCurrentGlobalFrame] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
    const [scopeOpen, setScopeOpen] = useState(false);
    // Latest play/pause handler, callable from the (memoised) keyboard effect.
    const handlePlayPauseRef = useRef<() => void>(() => {});

    // Sync local playhead and play/pause state with NLE Timeline Store
    const showAudioMeters = useTimelineStore((s) => s.showAudioMeters);
    const storePlayhead = useTimelineStore((s) => s.playheadFrame);
    const storeIsPlaying = useTimelineStore((s) => s.isPlaying);
    const storeSetPlayhead = useTimelineStore((s) => s.setPlayheadFrame);
    const storeSetIsPlaying = useTimelineStore((s) => s.setIsPlaying);

    useEffect(() => {
        setCurrentGlobalFrame(storePlayhead);
    }, [storePlayhead]);

    useEffect(() => {
        if (currentGlobalFrame !== storePlayhead) {
            storeSetPlayhead(currentGlobalFrame);
        }
    }, [currentGlobalFrame, storePlayhead, storeSetPlayhead]);

    useEffect(() => {
        setIsPlaying(storeIsPlaying);
    }, [storeIsPlaying]);

    useEffect(() => {
        if (isPlaying !== storeIsPlaying) {
            storeSetIsPlaying(isPlaying);
        }
    }, [isPlaying, storeIsPlaying, storeSetIsPlaying]);

    // Mirror the unified clip selection into the Inspector.
    useEffect(() => {
        setSelectedClipId(selectedClipIds.length ? selectedClipIds[0] : null);
    }, [selectedClipIds]);

    // ── Active tool (Premiere-style: select / razor / hand) ──
    const [activeTool, setActiveTool] = useState<SequenceTool>('select');
    const razorMode = activeTool === 'razor';

    // ── Snap to grid ──
    const [snapEnabled, setSnapEnabled] = useState(true);

    // ── Right sidebar width (resizable) ──
    const [sidebarWidth, setSidebarWidth] = useState(320);

    // ── Right sidebar tab: Premiere-style Effect Controls vs metadata Inspector ──
    const [rightTab, setRightTab] = useState<'fx' | 'inspector'>('fx');

    // ── Multi-select ──
    const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(new Set());

    // ── Clipboard ──
    const [clipboard, setClipboard] = useState<Clip[]>([]);

    // ── V1 Drag reorder ──
    const [v1DragClipId, setV1DragClipId] = useState<string | null>(null);
    const [v1DropTargetIndex, setV1DropTargetIndex] = useState<number | null>(null);

    // ── Trim handles ──
    const [trimState, setTrimState] = useState<{ clipId: string; edge: 'left' | 'right'; startX: number; origStart: number; origEnd: number; origTrimStart: number; origTrimEnd: number } | null>(null);
    const [showVolumeBar, setShowVolumeBar] = useState(false);
    const volumeBarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Double-buffered video refs (TrailerPlayer-style smooth playback)
    const videoARef = useRef<HTMLVideoElement>(null);
    const videoBRef = useRef<HTMLVideoElement>(null);
    const activeBufferRef = useRef<'A' | 'B'>('A');
    const rafRef = useRef<number>(0);
    const lastClipIdRef = useRef<string | null>(null);


    // Resizable Panels
    const [topHeight, setTopHeight] = useState(settings.sequenceViewSplitHeight ?? 50);
    const [isResizing, setIsResizing] = useState(false);
    const { updateSettings } = useProjectStore();

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            // Calculate percentage based on window height relative to the tab content
            const newHeight = (e.clientY / window.innerHeight) * 100;
            setTopHeight(Math.max(20, Math.min(newHeight, 80)));
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            // Persist the height on mouse up to avoid spamming the store during drag
            if (topHeight !== settings.sequenceViewSplitHeight) {
                updateSettings({ sequenceViewSplitHeight: topHeight });
            }
        };

        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, topHeight, settings.sequenceViewSplitHeight, updateSettings]);

    // ── Keyboard shortcuts ──
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if user is typing in an input
            if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;

            // ? key = show keyboard shortcuts overlay helper
            if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
                setIsShortcutsOpen(prev => !prev);
                return;
            }

            // V key = selection tool
            if (e.key === 'v' && !e.ctrlKey && !e.metaKey) {
                setActiveTool('select');
            }
            // C key = razor tool
            if (e.key === 'c' && !e.ctrlKey && !e.metaKey) {
                setActiveTool(prev => prev === 'razor' ? 'select' : 'razor');
            }
            // H key = hand tool
            if (e.key === 'h' && !e.ctrlKey && !e.metaKey) {
                setActiveTool('hand');
            }
            // Premiere tool shortcuts (unbound keys only — B stays "split", C "razor")
            if (e.key === 'y' && !e.ctrlKey && !e.metaKey) setActiveTool('slip');
            if (e.key === 'u' && !e.ctrlKey && !e.metaKey) setActiveTool('slide');
            if (e.key === 'a' && !e.ctrlKey && !e.metaKey) setActiveTool('track-select');
            if (e.key === 'n' && !e.ctrlKey && !e.metaKey) setActiveTool('rolling');
            if (e.key === 'p' && !e.ctrlKey && !e.metaKey) setActiveTool('pen');
            // S key = toggle snap
            if (e.key === 's' && !e.ctrlKey && !e.metaKey) {
                setSnapEnabled(prev => !prev);
            }
            // Escape = exit to select tool, deselect
            if (e.key === 'Escape') {
                setActiveTool('select');
                setMultiSelectedIds(new Set());
                setSelectedClipId(null);
            }
            // Delete = lift (leave gap); Shift+Delete = ripple delete (close gap)
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                if (e.shiftKey) rippleDeleteSelectedClips(); else deleteSelectedClips();
                setMultiSelectedIds(new Set());
                setSelectedClipId(null);
            }
            // B = split clip(s) at the playhead
            if (e.key === 'b' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                splitAtPlayhead(useTimelineStore.getState().playheadFrame);
            }
            // Ctrl/Cmd+D = duplicate selected
            if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                e.preventDefault();
                duplicateSelectedClips();
            }
            // Ctrl/Cmd+R = Clip Speed / Duration dialog
            if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
                e.preventDefault();
                useSequenceViewStore.getState().setSpeedDialogOpen(true);
            }
            // M = drop a marker at the playhead
            if (e.key === 'm' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                useTimelineStore.getState().addMarker({
                    id: crypto.randomUUID(),
                    frame: useTimelineStore.getState().playheadFrame,
                    label: `Marker ${useTimelineStore.getState().markers.length + 1}`,
                    color: '#facc15',
                });
            }
            // I / O = set in / out points
            if (e.key === 'i' && !e.ctrlKey && !e.metaKey) {
                const st = useTimelineStore.getState();
                st.setInOutRange({ ...st.inOutRange, inFrame: st.playheadFrame });
            }
            if (e.key === 'o' && !e.ctrlKey && !e.metaKey) {
                const st = useTimelineStore.getState();
                st.setInOutRange({ ...st.inOutRange, outFrame: st.playheadFrame });
            }
            // Space = play / pause
            if (e.key === ' ') {
                e.preventDefault();
                handlePlayPauseRef.current();
            }
            // Arrows = nudge playhead (Shift = 10 frames)
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setCurrentGlobalFrame((f) => Math.max(0, f - (e.shiftKey ? 10 : 1)));
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                setCurrentGlobalFrame((f) => f + (e.shiftKey ? 10 : 1));
            }
            if (e.key === 'Home') { e.preventDefault(); setCurrentGlobalFrame(0); }
            // J / K / L transport (engine plays forward only; J steps back)
            if (e.key === 'l' && !e.ctrlKey && !e.metaKey) { setIsPlaying(true); }
            if (e.key === 'k' && !e.ctrlKey && !e.metaKey) { setIsPlaying(false); }
            if (e.key === 'j' && !e.ctrlKey && !e.metaKey) {
                setIsPlaying(false);
                setCurrentGlobalFrame((f) => Math.max(0, f - 1));
            }
            // + / − = zoom timeline scale
            if ((e.key === '+' || e.key === '=') && !e.ctrlKey && !e.metaKey) {
                const s = useTimelineStore.getState();
                s.setPixelsPerFrame(s.pixelsPerFrame * 1.25);
            }
            if ((e.key === '-' || e.key === '_') && !e.ctrlKey && !e.metaKey) {
                const s = useTimelineStore.getState();
                s.setPixelsPerFrame(s.pixelsPerFrame / 1.25);
            }
            // Shift+Z = fit entire sequence to window
            if (e.key === 'Z' && e.shiftKey && !e.ctrlKey && !e.metaKey) {
                const max = useClipStore.getState().clips.reduce((m, c) => Math.max(m, c.endFrame), 0);
                if (max > 0) {
                    useTimelineStore.getState().setPixelsPerFrame(Math.max(0.02, (window.innerWidth - 220) / max));
                }
            }
            // Ctrl+C = copy
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                const ids = multiSelectedIds.size > 0 ? [...multiSelectedIds] : (selectedClipId ? [selectedClipId] : []);
                const clipsToCopy = clips.filter(c => ids.includes(c.id));
                if (clipsToCopy.length > 0) setClipboard(clipsToCopy.map(c => ({ ...c })));
            }
            // Ctrl+V = paste
            if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboard.length > 0) {
                const maxEnd = clips.reduce((m, c) => Math.max(m, c.endFrame), 0);
                clipboard.forEach((clip, i) => {
                    const duration = clip.endFrame - clip.startFrame;
                    const newClip = {
                        ...clip,
                        id: crypto.randomUUID(),
                        startFrame: maxEnd + (i > 0 ? i * duration : 0),
                        endFrame: maxEnd + (i > 0 ? i * duration : 0) + duration,
                        origin: 'manual' as const,
                    };
                    useClipStore.getState().addClip(newClip);
                });
            }
            // Ctrl+Z = undo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                try { useHistoryStore?.getState()?.undo?.(); } catch {}
            }
            // Ctrl+Shift+Z = redo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
                try { useHistoryStore?.getState()?.redo?.(); } catch {}
            }
            // E = toggle Enable/Disable on selected clips (non-destructive editing)
            if (e.key === 'e' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                const ids = multiSelectedIds.size > 0 ? [...multiSelectedIds] : (selectedClipId ? [selectedClipId] : []);
                ids.forEach(id => toggleClipEnabled(id));
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [clips, selectedClipId, multiSelectedIds, clipboard]);

    // ── Audio clip drag handlers ──
    useEffect(() => {
        if (!dragClipId) return;
        const handleDragMove = (e: MouseEvent) => {
            const dx = e.clientX - dragStartXRef.current;
            const frameDelta = Math.round(dx / scale);
            const newStart = Math.max(0, dragOrigStartFrameRef.current + frameDelta);
            const duration = dragOrigEndFrameRef.current - dragOrigStartFrameRef.current;
            updateClip(dragClipId, { startFrame: newStart, endFrame: newStart + duration });
        };
        const handleDragEnd = () => setDragClipId(null);
        window.addEventListener('mousemove', handleDragMove);
        window.addEventListener('mouseup', handleDragEnd);
        return () => {
            window.removeEventListener('mousemove', handleDragMove);
            window.removeEventListener('mouseup', handleDragEnd);
        };
    }, [dragClipId, scale, updateClip]);

    // ── Trim handle drag effect ──
    useEffect(() => {
        if (!trimState) return;
        const handleTrimMove = (e: MouseEvent) => {
            const dx = e.clientX - trimState.startX;
            const frameDelta = Math.round(dx / scale);

            if (trimState.edge === 'left') {
                // Trim in-point: adjust startFrame and trimStartFrame
                const newStart = Math.max(0, trimState.origStart + frameDelta);
                const newTrimStart = Math.max(0, trimState.origTrimStart + Math.round(frameDelta * (clips.find(c => c.id === trimState.clipId)?.speed || 1)));
                if (newStart < trimState.origEnd) { // Don't let left edge pass right edge
                    updateClip(trimState.clipId, { startFrame: newStart, trimStartFrame: newTrimStart } as any);
                }
            } else {
                // Trim out-point: adjust endFrame and trimEndFrame
                const newEnd = Math.max(trimState.origStart + 1, trimState.origEnd + frameDelta);
                const newTrimEnd = Math.max(trimState.origTrimStart + 1, trimState.origTrimEnd + Math.round(frameDelta * (clips.find(c => c.id === trimState.clipId)?.speed || 1)));
                updateClip(trimState.clipId, { endFrame: newEnd, trimEndFrame: newTrimEnd } as any);
            }
        };
        const handleTrimEnd = () => setTrimState(null);
        window.addEventListener('mousemove', handleTrimMove);
        window.addEventListener('mouseup', handleTrimEnd);
        return () => {
            window.removeEventListener('mousemove', handleTrimMove);
            window.removeEventListener('mouseup', handleTrimEnd);
        };
    }, [trimState, scale, updateClip, clips]);

    // ── V1 drag reorder effect ──
    useEffect(() => {
        if (!v1DragClipId) return;
        const handleV1DragMove = (e: MouseEvent) => {
            // Find which clip index the cursor is over
            const v1Clips = clips.filter(c => (c.track || 1) === 1).sort((a, b) => a.startFrame - b.startFrame);
            const mouseFrame = Math.max(0, Math.floor((e.clientX - 200) / scale));
            let targetIdx = v1Clips.length;
            for (let i = 0; i < v1Clips.length; i++) {
                const mid = v1Clips[i].startFrame + (v1Clips[i].endFrame - v1Clips[i].startFrame) / 2;
                if (mouseFrame < mid) { targetIdx = i; break; }
            }
            setV1DropTargetIndex(targetIdx);
        };
        const handleV1DragEnd = () => {
            if (v1DropTargetIndex !== null && v1DragClipId) {
                const v1Clips = clips.filter(c => (c.track || 1) === 1).sort((a, b) => a.startFrame - b.startFrame);
                const fromIndex = v1Clips.findIndex(c => c.id === v1DragClipId);
                if (fromIndex !== -1 && fromIndex !== v1DropTargetIndex) {
                    useClipStore.getState().reorderClips(fromIndex, v1DropTargetIndex > fromIndex ? v1DropTargetIndex - 1 : v1DropTargetIndex);
                }
            }
            setV1DragClipId(null);
            setV1DropTargetIndex(null);
        };
        window.addEventListener('mousemove', handleV1DragMove);
        window.addEventListener('mouseup', handleV1DragEnd);
        return () => {
            window.removeEventListener('mousemove', handleV1DragMove);
            window.removeEventListener('mouseup', handleV1DragEnd);
        };
    }, [v1DragClipId, v1DropTargetIndex, clips, scale]);

    // Group clips by track + generate shadow audio blocks for video clips
    const tracks = React.useMemo(() => {
        const grouped: Record<number, Clip[]> = {};
        grouped[1] = [];
        grouped[2] = []; // Audio 1 — linked audio from video clips
        grouped[101] = []; // Audio 2 — background music

        clips.forEach(clip => {
            const trackId = clip.track || 1;
            if (!grouped[trackId]) grouped[trackId] = [];
            grouped[trackId].push(clip);
        });

        // Generate shadow audio blocks on Audio 1 (track 2) for each video clip on track 1
        const videoClips = grouped[1]?.filter(c => c.type === 'video') || [];
        const shadowAudio: Clip[] = videoClips.map(vc => ({
            ...vc,
            id: `shadow-audio-${vc.id}`,
            type: 'audio' as const,
            track: 2,
            volume: vc.volume ?? 100,
            isMuted: vc.isMuted ?? false,
            origin: 'auto' as const,
            _shadowOf: vc.id, // link marker
        } as Clip & { _shadowOf: string }));
        // Merge shadow audio with any existing track-2 clips
        grouped[2] = [...(grouped[2] || []), ...shadowAudio];

        const trackOrder = [1, 2, 101, ...Object.keys(grouped).map(Number).filter(id => id !== 1 && id !== 2 && id !== 101).sort((a,b) => a-b)];
        const uniqueOrder = [...new Set(trackOrder)].filter(id => grouped[id]);

        return uniqueOrder.map(id => ({
            id,
            label: id === 1 ? 'V1' : id === 2 ? 'A1' : id === 3 ? 'V3 (PIP)' : id === 101 ? 'A2 (Music)' : id === 102 ? 'SFX-1' : id === 103 ? 'SFX-2' : id < 100 ? `V${id}` : `A${id - 100 + 1}`,
            isAudio: id === 2 || id >= 100,
            clips: grouped[id].sort((a, b) => a.startFrame - b.startFrame)
        }));
    }, [clips]);

    // Determines which clip is currently active under the playhead
    const activeVisualClip = React.useMemo(() => {
        // Simple priority: Highest video track wins
        // Filter for video tracks only (id < 100)
        const videoTracks = tracks.filter(t => !t.isAudio).reverse(); // Topmost track first

        for (const track of videoTracks) {
            const clip = track.clips.find(
                c => !c.disabled && !c.isAdjustmentLayer && currentGlobalFrame >= c.startFrame && currentGlobalFrame < c.endFrame
            );
            if (clip) return clip;
        }
        return null;
    }, [tracks, currentGlobalFrame]);

    // All visual clips at the current playhead (for multi-track compositing: PiP, split screen, etc.)
    const activeVisualClips = React.useMemo(() => {
        const videoTracks = tracks.filter(t => !t.isAudio);
        // Sort tracks bottom-to-top (V1 first, V2 next, etc.) for correct compositing order
        videoTracks.sort((a, b) => a.id - b.id);
        const result: Clip[] = [];
        for (const track of videoTracks) {
            for (const clip of track.clips) {
                if (!clip.disabled && !clip.isAdjustmentLayer && currentGlobalFrame >= clip.startFrame && currentGlobalFrame < clip.endFrame) {
                    result.push(clip);
                }
            }
        }
        return result;
    }, [tracks, currentGlobalFrame]);

    // Compute max frame of the entire sequence
    const maxFrameId = React.useMemo(() => {
        const allClips = tracks.flatMap(t => t.clips).filter(c => !c.disabled);
        return allClips.reduce((max, clip) => Math.max(max, clip.endFrame), 0);
    }, [tracks]);

    // Handle playhead crossing sequence end
    useEffect(() => {
        if (isPlaying && currentGlobalFrame >= maxFrameId && maxFrameId > 0) {
            if (settings.sequenceLoop) {
                setCurrentGlobalFrame(0);
            } else {
                setCurrentGlobalFrame(maxFrameId);
                setIsPlaying(false);
            }
        }
    }, [currentGlobalFrame, maxFrameId, isPlaying, settings.sequenceLoop]);

    // ========= DOUBLE-BUFFERED PLAYBACK ENGINE WITH REVERSE SUPPORT =========
    const fps = settings.fps || DEFAULT_FPS;
    const lastRafTimeRef = useRef(0);

    const syncVideoToClip = useCallback((clip: Clip | null, vid: HTMLVideoElement | null) => {
        if (!vid || !clip || clip.type !== 'video') return;
        const src = `file://${clip.path}`;
        if (vid.getAttribute('src') !== src) vid.src = src;
        // A1 track controls govern embedded video audio
        const audio1Muted = trackMutes[2] ?? false;
        const audio1Vol = (trackVolumes[2] ?? 100) / 100;
        vid.volume = (isMasterMuted || audio1Muted) ? 0 : masterVolume * audio1Vol;
        // For reversed clips we DON'T use native playback — we step backwards manually
        if (!clip.reversed) {
            vid.playbackRate = Math.max(0.1, Math.min(clip.speed || 1, 16));
        } else {
            vid.playbackRate = 1; // paused stepping, rate doesn't matter
        }
        // Seek to start position: reversed clips start at trimEnd, forward clips at trimStart
        const targetSec = clip.reversed ? (clip.trimEndFrame / fps) : (clip.trimStartFrame / fps);
        if (Math.abs(vid.currentTime - targetSec) > 0.05) vid.currentTime = targetSec;
    }, [fps, masterVolume, isMasterMuted, trackMutes, trackVolumes]);

    useEffect(() => {
        if (!activeVisualClip || activeVisualClip.type !== 'video') return;
        if (lastClipIdRef.current === activeVisualClip.id) return;
        lastClipIdRef.current = activeVisualClip.id;
        activeBufferRef.current = activeBufferRef.current === 'A' ? 'B' : 'A';
        const activeVid = activeBufferRef.current === 'A' ? videoARef.current : videoBRef.current;
        const bgVid = activeBufferRef.current === 'A' ? videoBRef.current : videoARef.current;
        if (bgVid) bgVid.pause();
        syncVideoToClip(activeVisualClip, activeVid);
        // Only auto-play for forward clips; reversed clips use manual seeking
        if (isPlaying && activeVid && !activeVisualClip.reversed) {
            activeVid.play().catch(() => {});
        }
    }, [activeVisualClip?.id, isPlaying, syncVideoToClip]);

    useEffect(() => {
        if (!isPlaying) { videoARef.current?.pause(); videoBRef.current?.pause(); return; }
        lastRafTimeRef.current = performance.now();

        const loop = (now: number) => {
            const clip = activeVisualClip;
            if (!clip || clip.type !== 'video') { setCurrentGlobalFrame(f => f + 1); rafRef.current = requestAnimationFrame(loop); return; }
            const activeVid = activeBufferRef.current === 'A' ? videoARef.current : videoBRef.current;
            if (!activeVid) { rafRef.current = requestAnimationFrame(loop); return; }

            const clipDurFrames = clip.endFrame - clip.startFrame;
            const trimStart = clip.trimStartFrame / fps;
            const trimEnd = clip.trimEndFrame / fps;
            const speed = clip.speed || 1;

            if (clip.reversed) {
                // REVERSE PLAYBACK: manually step currentTime backwards each frame
                const dt = (now - lastRafTimeRef.current) / 1000; // seconds since last frame
                lastRafTimeRef.current = now;
                const step = dt * speed; // how many seconds of source to rewind
                activeVid.pause(); // keep paused, we're seeking manually
                const newTime = activeVid.currentTime - step;

                if (newTime <= trimStart) {
                    // Clip done
                    setCurrentGlobalFrame(clip.endFrame);
                } else {
                    activeVid.currentTime = newTime;
                    const elapsed = Math.max(0, trimEnd - newTime) * fps / speed;
                    setCurrentGlobalFrame(clip.startFrame + Math.min(Math.floor(elapsed), clipDurFrames));
                }
            } else {
                // FORWARD PLAYBACK: native play, read currentTime
                if (activeVid.paused && activeVid.readyState >= 2) activeVid.play().catch(() => {});
                const elapsed = Math.max(0, activeVid.currentTime - trimStart) * fps / speed;
                if (elapsed >= clipDurFrames || activeVid.ended || activeVid.currentTime >= trimEnd) {
                    setCurrentGlobalFrame(clip.endFrame);
                } else {
                    setCurrentGlobalFrame(clip.startFrame + Math.min(Math.floor(elapsed), clipDurFrames));
                }
            }
            rafRef.current = requestAnimationFrame(loop);
        };

        const activeVid = activeBufferRef.current === 'A' ? videoARef.current : videoBRef.current;
        if (activeVid && activeVisualClip?.type === 'video') {
            const audio1Muted = trackMutes[2] ?? false;
            const audio1Vol = (trackVolumes[2] ?? 100) / 100;
            activeVid.volume = (isMasterMuted || audio1Muted) ? 0 : masterVolume * audio1Vol;
            if (!activeVisualClip.reversed) activeVid.play().catch(() => {});
        }
        rafRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(rafRef.current);
    }, [isPlaying, activeVisualClip, fps, masterVolume, isMasterMuted]);

    // Background audio clips: real audio clips on track 101+ (NOT shadow audio on track 2)
    const bgAudioClips = React.useMemo(() => {
        return clips.filter(c => c.type === 'audio' && (c.track || 0) >= 101);
    }, [clips]);

    // Refs for each background audio element
    const bgAudioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

    // Background music sync — per-frame volume, position, play/pause
    // Audio elements are rendered in JSX below (DOM-attached, like <video> elements)
    useEffect(() => {
        bgAudioClips.forEach(clip => {
            const audio = bgAudioRefs.current[clip.id];
            if (!audio) return;

            const trackId = clip.track || 101;
            const trackMuted = trackMutes[trackId] ?? false;

            // Volume — include per-track volume slider (trackVolumes)
            const trackVol = (trackVolumes[trackId] ?? 100) / 100;
            const clipVol = (clip.volume !== undefined ? clip.volume : 100) / 100;
            audio.volume = (isMasterMuted || trackMuted) ? 0 : masterVolume * trackVol * clipVol;

            // Sync position — audio clips may have their own startFrame offset on the timeline
            const trimStartSec = (clip.trimStartFrame || 0) / fps;
            const clipStartFrame = clip.startFrame || 0;
            const clipEndFrame = clip.endFrame || 0;

            if (isPlaying && !trackMuted && currentGlobalFrame >= clipStartFrame && currentGlobalFrame < clipEndFrame) {
                const elapsedFrames = currentGlobalFrame - clipStartFrame;
                const expectedSec = trimStartSec + (elapsedFrames / fps);
                if (Math.abs(audio.currentTime - expectedSec) > 0.3) audio.currentTime = expectedSec;
                // Only attempt play if audio has loaded enough data
                if (audio.paused && audio.readyState >= 2) {
                    audio.play().catch(e => console.warn(`[SequenceView] A2 play failed:`, e));
                }
            } else {
                if (!audio.paused) audio.pause();
            }
        });
    }, [isPlaying, currentGlobalFrame, bgAudioClips, masterVolume, isMasterMuted, fps, trackMutes, trackVolumes]);

    const handlePlayPause = () => {
        if (!isPlaying && currentGlobalFrame >= maxFrameId && maxFrameId > 0) setCurrentGlobalFrame(0);
        setIsPlaying(!isPlaying);
    };
    handlePlayPauseRef.current = handlePlayPause;
    const handleStop = () => { setIsPlaying(false); setCurrentGlobalFrame(0); };
    const handleSkipNext = () => {
        const allClips = tracks.flatMap(t => t.clips).filter(c => !c.disabled);
        const ns = allClips.map(c => c.startFrame).filter(s => s > currentGlobalFrame).sort((a, b) => a - b);
        if (ns.length > 0) setCurrentGlobalFrame(ns[0]);
    };
    const handleSkipPrev = () => {
        if (currentGlobalFrame === 0) return;
        const allClips = tracks.flatMap(t => t.clips).filter(c => !c.disabled);
        const ps = allClips.map(c => c.startFrame).filter(s => s < (currentGlobalFrame - 10)).sort((a, b) => b - a);
        if (ps.length > 0) setCurrentGlobalFrame(ps[0]); else setCurrentGlobalFrame(0);
    };

    const clipProgress = activeVisualClip ? (currentGlobalFrame - activeVisualClip.startFrame) / Math.max(1, activeVisualClip.endFrame - activeVisualClip.startFrame) : 0;
    const currentZoom = activeVisualClip?.zoomStart !== undefined && activeVisualClip?.zoomEnd !== undefined
        ? activeVisualClip.zoomStart + (clipProgress * (activeVisualClip.zoomEnd - activeVisualClip.zoomStart))
        : (activeVisualClip?.zoomLevel || 100);

    // Compute transition style for active clip
    const clipLocalFrame = activeVisualClip ? currentGlobalFrame - activeVisualClip.startFrame : 0;
    const transitionStyle = { transform: '', opacity: 1, zIndex: 20 };

    // Vertical video: use object-cover when zoomed
    const activeOrientation = activeVisualClip?.sourceOrientation || 'horizontal';
    const seqObjectFit = (activeVisualClip?.zoomStart || activeVisualClip?.zoomEnd) && activeOrientation === 'vertical'
        ? 'object-cover' : 'object-contain';

    const containerRef = useRef<HTMLDivElement>(null);

    // ── Split clip handler ──
    const handleSplitClip = useCallback((clipId: string, splitFrame: number) => {
        const clip = clips.find(c => c.id === clipId);
        if (!clip || splitFrame <= clip.startFrame || splitFrame >= clip.endFrame) return;

        const curFps = settings.fps || DEFAULT_FPS;
        const clipLocalFrame = splitFrame - clip.startFrame;
        const speed = clip.speed || 1;
        const sourceSplitOffset = Math.floor(clipLocalFrame * speed);

        // Left half: same start, ends at split point
        const leftClip: Partial<typeof clip> = {
            endFrame: splitFrame,
            trimEndFrame: (clip.trimStartFrame || 0) + sourceSplitOffset,
        };

        // Right half: new clip starting at split point
        const rightClip = {
            ...clip,
            id: crypto.randomUUID(),
            startFrame: splitFrame,
            trimStartFrame: (clip.trimStartFrame || 0) + sourceSplitOffset,
            origin: 'manual' as const,
        };

        updateClip(clipId, leftClip as any);
        useClipStore.getState().addClip(rightClip as any);
    }, [clips, settings.fps, updateClip]);

    const handleTimelineClick = (e: React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const startX = 200; // Width of track header
        const clickX = e.clientX - rect.left - startX;

        // Convert pixels to frames
        // x = frame * scale => frame = x / scale
        const newFrame = Math.max(0, Math.floor((clickX + containerRef.current.scrollLeft) / scale));
        setCurrentGlobalFrame(newFrame);
    };

    // Calculate transition opacity for active clip
    const transitionFrames = Math.floor(settings.fps / 2); // 0.5s transition
    const clipOpacity = React.useMemo(() => {
        if (!activeVisualClip || transitionStrategy === 'cut') return 1;

        const isFirstClip = activeVisualClip.startFrame === 0;
        const framesFromStart = currentGlobalFrame - activeVisualClip.startFrame;
        const framesFromEnd = activeVisualClip.endFrame - currentGlobalFrame;

        if (framesFromStart < transitionFrames && !isFirstClip) {
            return framesFromStart / transitionFrames;
        } else if (framesFromEnd < transitionFrames) {
            return framesFromEnd / transitionFrames;
        }
        return 1;
    }, [activeVisualClip, currentGlobalFrame, transitionStrategy, transitionFrames]);

    // ── Paste handler for toolbar ──
    const handlePaste = useCallback(() => {
        if (clipboard.length > 0) {
            const maxEnd = clips.reduce((m, c) => Math.max(m, c.endFrame), 0);
            clipboard.forEach((clip) => {
                useClipStore.getState().addClip({
                    ...clip,
                    id: crypto.randomUUID(),
                    startFrame: maxEnd,
                    endFrame: maxEnd + (clip.endFrame - clip.startFrame),
                    origin: 'manual' as const,
                } as any);
            });
        }
    }, [clipboard, clips]);

    // ── Aspect ratio cycle handler ──
    const handleAspectCycle = useCallback(() => {
        const current = settings.aspectRatio;
        const next = current === '16:9' ? '9:16' : current === '9:16' ? '1:1' : '16:9';
        updateSettings({ aspectRatio: next as any });
    }, [settings.aspectRatio, updateSettings]);

    return (
        <div className="flex h-full w-full flex-col bg-[#0d0d1a] text-white overflow-hidden">

            {/* ═══ Premiere-style application menu bar ═══ */}
            <SequenceMenuBar />

            {/* ═══ TOP HALF: Program Monitor + Inspector Sidebar ═══ */}
            <div
                className="flex min-h-0 border-b border-white/[0.06]"
                style={{ height: `${topHeight}%` }}
            >
                {/* ── Left Sidebar: Effects / Scopes ── */}
                {leftPanelOpen && (
                    <div
                        className="flex-shrink-0 border-r border-white/[0.06] relative flex flex-col h-full overflow-hidden bg-[#0d0d1a]/95"
                        style={{ width: leftPanelWidth }}
                    >
                        {/* Tab switcher */}
                        <div className="flex items-center border-b border-white/[0.06] flex-shrink-0 bg-[#111122]/60">
                            <button
                                onClick={() => setLeftPanelTab('effects')}
                                className={clsx(
                                    'flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-semibold transition-colors',
                                    leftPanelTab === 'effects'
                                        ? 'text-purple-300 border-b-2 border-purple-500 bg-purple-500/5'
                                        : 'text-white/35 hover:text-white/60'
                                )}
                            >
                                <Sparkles size={11} />
                                Effects
                            </button>
                            <button
                                onClick={() => setLeftPanelTab('color')}
                                className={clsx(
                                    'flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-semibold transition-colors',
                                    leftPanelTab === 'color'
                                        ? 'text-amber-300 border-b-2 border-amber-500 bg-amber-500/5'
                                        : 'text-white/35 hover:text-white/60'
                                )}
                            >
                                <Palette size={11} />
                                Color
                            </button>
                            <button
                                onClick={toggleLeftPanel}
                                className="px-2 py-1.5 text-white/25 hover:text-white/60 transition-colors"
                                title="Close panel"
                            >
                                <PanelLeftClose size={12} />
                            </button>
                        </div>
                        {/* Content */}
                        <div className="flex-1 overflow-hidden">
                            {leftPanelTab === 'effects' && <EffectsBrowser />}
                            {leftPanelTab === 'color' && <LumetriColorPanel />}
                        </div>
                        {/* Resize handle (right edge) */}
                        <div
                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/30 transition-colors z-20"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                const startX = e.clientX;
                                const startW = leftPanelWidth;
                                const handleMove = (ev: MouseEvent) => {
                                    const dx = ev.clientX - startX;
                                    setLeftPanelWidth(startW + dx);
                                };
                                const handleUp = () => {
                                    window.removeEventListener('mousemove', handleMove);
                                    window.removeEventListener('mouseup', handleUp);
                                };
                                window.addEventListener('mousemove', handleMove);
                                window.addEventListener('mouseup', handleUp);
                            }}
                        />
                    </div>
                )}

                {/* Left panel toggle (when collapsed) */}
                {!leftPanelOpen && (
                    <button
                        onClick={toggleLeftPanel}
                        className="flex-shrink-0 w-6 flex flex-col items-center justify-center bg-[#0d0d1a] border-r border-white/[0.06] text-white/25 hover:text-white/60 hover:bg-white/[0.03] transition-colors"
                        title="Open Effects / Color panel"
                    >
                        <PanelLeftOpen size={12} />
                    </button>
                )}

                {/* ── Program Monitor + Scopes Stack ── */}
                <div className="flex-1 flex flex-col min-w-0 min-h-0">
                    {/* Scopes — stacked above monitor, collapsible */}
                    {scopeOpen && (
                        <div className="flex-shrink-0 border-b border-white/[0.06]" style={{ height: '35%', minHeight: 120 }}>
                            <ScopePanel />
                        </div>
                    )}
                    {/* Scope toggle strip */}
                    <button
                        onClick={() => setScopeOpen(p => !p)}
                        className={clsx(
                            'flex items-center justify-center gap-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.15em] transition-colors flex-shrink-0 border-b border-white/[0.04]',
                            scopeOpen
                                ? 'text-emerald-400/60 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08]'
                                : 'text-white/20 hover:text-white/40 hover:bg-white/[0.02]',
                        )}
                    >
                        <BarChart2 size={9} />
                        {scopeOpen ? 'Hide Scopes' : 'Show Scopes'}
                    </button>
                    {/* Program Monitor */}
                    <ProgramMonitor
                        activeVisualClip={activeVisualClip as any}
                        activeVisualClips={activeVisualClips}
                        currentGlobalFrame={currentGlobalFrame}
                        isPlaying={isPlaying}
                        onPlayPause={handlePlayPause}
                        fps={fps}
                        aspectRatio={settings.aspectRatio}
                        clipOpacity={clipOpacity}
                        videoARef={videoARef}
                        videoBRef={videoBRef}
                        activeBuffer={activeBufferRef.current}
                        currentZoom={currentZoom}
                        seqObjectFit={seqObjectFit}
                        transitionStyle={transitionStyle}
                        masterVolume={masterVolume}
                        isMasterMuted={isMasterMuted}
                        trackMutes={trackMutes}
                        setMasterVolume={setMasterVolume}
                        setIsMasterMuted={setIsMasterMuted}
                        showVolumeBar={showVolumeBar}
                        setShowVolumeBar={setShowVolumeBar}
                        volumeBarTimeoutRef={volumeBarTimeoutRef}
                        bgAudioClips={bgAudioClips}
                        bgAudioRefs={bgAudioRefs}
                        exactProxyAvailable={!!(activeVisualClip && useTimelineStore.getState().prerenderCache[activeVisualClip.id])}
                        maxFrame={maxFrameId}
                        onSeek={setCurrentGlobalFrame}
                    />
                </div>

                {/* ── Right Sidebar: Inspector (always visible) ── */}
                <div
                    className="flex-shrink-0 border-l border-white/[0.06] relative"
                    style={{ width: sidebarWidth }}
                >
                    {/* Resize Handle (left edge) */}
                    <div
                        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/30 transition-colors z-20"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            const startX = e.clientX;
                            const startWidth = sidebarWidth;
                            const handleMove = (ev: MouseEvent) => {
                                const dx = startX - ev.clientX;
                                setSidebarWidth(Math.max(220, Math.min(450, startWidth + dx)));
                            };
                            const handleUp = () => {
                                window.removeEventListener('mousemove', handleMove);
                                window.removeEventListener('mouseup', handleUp);
                            };
                            window.addEventListener('mousemove', handleMove);
                            window.addEventListener('mouseup', handleUp);
                        }}
                    />
                    <div className="flex flex-col h-full overflow-hidden">
                        {/* Tab switcher: Effect Controls (Premiere) | Inspector (metadata) */}
                        <div className="flex items-center border-b border-white/[0.06] bg-[#0e0e1c] flex-shrink-0">
                            <button
                                onClick={() => setRightTab('fx')}
                                className={clsx(
                                    'flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-semibold transition-colors',
                                    rightTab === 'fx'
                                        ? 'text-indigo-300 border-b-2 border-indigo-500 bg-indigo-500/5'
                                        : 'text-white/35 hover:text-white/60'
                                )}
                            >
                                <SlidersHorizontal size={11} />
                                Effect Controls
                            </button>
                            <button
                                onClick={() => setRightTab('inspector')}
                                className={clsx(
                                    'flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-semibold transition-colors',
                                    rightTab === 'inspector'
                                        ? 'text-purple-300 border-b-2 border-purple-500 bg-purple-500/5'
                                        : 'text-white/35 hover:text-white/60'
                                )}
                            >
                                <Sliders size={11} />
                                Inspector
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            {rightTab === 'fx' ? (
                                <EffectControlsPanel
                                    selectedClipId={selectedClipId}
                                    currentFrame={currentGlobalFrame}
                                    onJumpToFrame={setCurrentGlobalFrame}
                                />
                            ) : (
                                <SequenceInspector
                                    selectedClipId={selectedClipId}
                                    currentFrame={currentGlobalFrame}
                                    onJumpToFrame={setCurrentGlobalFrame}
                                    maxFrame={maxFrameId}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ RESIZE HANDLE (horizontal) ═══ */}
            <div
                className="h-1 bg-[#0a0a18] hover:bg-primary/30 cursor-row-resize transition-colors z-30 flex items-center justify-center group flex-shrink-0"
                onMouseDown={() => setIsResizing(true)}
            >
                <div className="w-10 h-0.5 bg-white/[0.06] group-hover:bg-primary/40 rounded-full" />
            </div>

            {/* ═══ BOTTOM HALF: Toolbar + Timeline ═══ */}
            <div className="flex-1 overflow-hidden flex flex-col relative">
                {/* Premiere-style Toolbar */}
                <SequenceToolbar
                    activeTool={activeTool}
                    onToolChange={setActiveTool}
                    snapEnabled={snapEnabled}
                    onSnapToggle={() => setSnapEnabled(!snapEnabled)}
                    isPlaying={isPlaying}
                    onPlayPause={handlePlayPause}
                    onStop={handleStop}
                    onSkipPrev={handleSkipPrev}
                    onSkipNext={handleSkipNext}
                    currentFrame={currentGlobalFrame}
                    maxFrame={maxFrameId}
                    fps={fps}
                    scale={scale}
                    onScaleChange={setScale}
                    isLooping={settings.sequenceLoop ?? false}
                    onLoopToggle={() => updateSettings({ sequenceLoop: !settings.sequenceLoop })}
                    clipboardCount={clipboard.length}
                    onPaste={handlePaste}
                    aspectRatio={settings.aspectRatio}
                    onAspectCycle={handleAspectCycle}
                    onMagnetize={magnetizeClips}
                />

                {/* Timeline Area + master audio meters */}
                <div className="flex-1 flex min-h-0">
                    <div className="flex-1 min-w-0 h-full overflow-hidden">
                        <TimelineCanvas fps={settings.fps} />
                    </div>
                    {showAudioMeters && <AudioMeters />}
                </div>

                {/* Keyboard Shortcuts Helper Overlay */}
                <KeyboardShortcutsOverlay
                    isOpen={isShortcutsOpen}
                    onClose={() => setIsShortcutsOpen(false)}
                />
            </div>

            {/* Clip Speed/Duration dialog (⌃R) */}
            <ClipSpeedDurationDialog />

            {/* Markers panel (Window ▸ Markers) */}
            <MarkersPanel />

            {/* Source monitor + 3-point editing (opens on Media double-click) */}
            <SourceMonitor />

            {/* Adjustment Layer creation dialog (File ▸ New ▸ Adjustment Layer) */}
            <AdjustmentLayerDialog />
        </div>
    );
};
