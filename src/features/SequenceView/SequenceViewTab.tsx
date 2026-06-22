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

import clsx from 'clsx';

const DEFAULT_SCALE = 0.5; // Pixels per frame

export const SequenceViewTab: React.FC = () => {
    const { clips, magnetizeClips, transitionStrategy, trackMutes, trackVolumes, setTrackMuted, setTrackVolume, updateClip } = useClipStore();
    const { settings } = useProjectStore();
    const { masterVolume, isMasterMuted, setMasterVolume, setIsMasterMuted } = useUserStore();

    const [scale, setScale] = useState(DEFAULT_SCALE);
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

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

    // ── Active tool (Premiere-style: select / razor / hand) ──
    const [activeTool, setActiveTool] = useState<SequenceTool>('select');
    const razorMode = activeTool === 'razor';

    // ── Snap to grid ──
    const [snapEnabled, setSnapEnabled] = useState(true);

    // ── Right sidebar width (resizable) ──
    const [sidebarWidth, setSidebarWidth] = useState(280);

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
            // Delete/Backspace = delete selected clips
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (multiSelectedIds.size > 0) {
                    multiSelectedIds.forEach(id => useClipStore.getState().removeClip(id));
                    setMultiSelectedIds(new Set());
                } else if (selectedClipId) {
                    useClipStore.getState().removeClip(selectedClipId);
                    setSelectedClipId(null);
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
            label: id === 1 ? 'V1' : id === 2 ? 'A1' : id === 101 ? 'A2' : id < 100 ? `V${id}` : `A${id - 100 + 1}`,
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
                c => !c.disabled && currentGlobalFrame >= c.startFrame && currentGlobalFrame < c.endFrame
            );
            if (clip) return clip;
        }
        return null;
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

            {/* ═══ TOP HALF: Program Monitor + Inspector Sidebar ═══ */}
            <div
                className="flex min-h-0 border-b border-white/[0.06]"
                style={{ height: `${topHeight}%` }}
            >
                {/* Program Monitor */}
                <ProgramMonitor
                    activeVisualClip={activeVisualClip as any}
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
                />

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
                    <SequenceInspector
                        selectedClipId={selectedClipId}
                        currentFrame={currentGlobalFrame}
                        onJumpToFrame={setCurrentGlobalFrame}
                        maxFrame={maxFrameId}
                    />
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

                {/* Timeline Area */}
                <div className="flex-1 overflow-hidden flex flex-col relative" ref={containerRef}>
                    {/* Time Ruler */}
                    <div
                        className="h-7 border-b border-white/[0.04] bg-[#080810]/80 flex items-center overflow-hidden shrink-0 ml-[200px]"
                        onClick={handleTimelineClick}
                    >
                        <div className="relative h-full w-full">
                            {Array.from({ length: 100 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="absolute bottom-0 border-l border-white/[0.06] h-3 text-[8px] text-white/20 pl-1 select-none font-mono"
                                    style={{ left: (i * settings.fps * 10) * scale }}
                                >
                                    {i * 10}s
                                </div>
                            ))}
                            {/* Playhead Indicator in Ruler */}
                            <div
                                className="absolute top-0 bottom-0 w-4 -ml-2 flex justify-center cursor-pointer z-30"
                                style={{ left: currentGlobalFrame * scale }}
                            >
                                <div className="w-0.5 h-full bg-red-500" />
                                <div className="absolute top-0 w-2.5 h-2.5 bg-red-500 transform rotate-45 -mt-1 rounded-sm shadow-[0_0_6px_rgba(239,68,68,0.4)]" />
                            </div>
                        </div>
                    </div>

                    {/* Tracks Container */}
                    <div className="flex-1 flex flex-col min-h-0 overflow-x-auto relative bg-transparent">
                        <div className="min-w-full relative flex-1 flex flex-col">
                            {tracks.map(track => {
                                const isLocked = trackLocked[track.id] ?? false;
                                const isHiddenTrack = trackHidden[track.id] ?? false;
                                const isSolo = trackSolo[track.id] ?? false;
                                const isMuted = trackMutes[track.id] ?? false;
                                return (
                                <div key={track.id} className={clsx("flex flex-1 min-h-[48px] border-b border-white/[0.04] relative group transition-all", isHiddenTrack ? 'bg-[#0a0a15]/80 opacity-50' : 'bg-[#0c0c18]/60')}>
                                    {/* Track Header — Premiere Pro style */}
                                    <div className="w-[200px] bg-[#0f0f20]/80 backdrop-blur-md border-r border-white/[0.04] flex flex-col p-2 gap-1 flex-shrink-0 sticky left-0 z-10 shadow-lg top-0">
                                        <div className="flex items-center justify-between">
                                            <span className={clsx("text-[10px] font-bold flex items-center gap-1.5 tracking-wide", isMuted ? 'text-white/25 line-through' : 'text-white/55')}>
                                                {track.isAudio ? <Mic size={10} className={isMuted ? 'text-white/15' : track.id === 2 ? 'text-cyan-400/70' : 'text-pink-400/70'} /> : <Video size={10} className="text-accent/70" />}
                                                {track.label}
                                                {track.id === 2 && <Link2 size={8} className="text-cyan-400/30" />}
                                            </span>
                                        </div>
                                        {/* Control row */}
                                        <div className="flex items-center gap-0.5">
                                            <button onClick={() => toggleTrackHidden(track.id)} className={clsx('p-0.5 rounded transition-colors', isHiddenTrack ? 'text-yellow-400' : 'text-white/20 hover:text-white/50')} title="Toggle Visibility">
                                                {isHiddenTrack ? <EyeOff size={11} /> : <Eye size={11} />}
                                            </button>
                                            <button onClick={() => toggleTrackLock(track.id)} className={clsx('p-0.5 rounded transition-colors', isLocked ? 'text-red-400' : 'text-white/20 hover:text-white/50')} title="Toggle Lock">
                                                {isLocked ? <Lock size={11} /> : <Unlock size={11} />}
                                            </button>
                                            {track.isAudio && (
                                                <>
                                                    <button onClick={(e) => { e.stopPropagation(); setTrackMuted(track.id, !isMuted); }}
                                                        className={clsx('px-1 py-0.5 rounded text-[8px] font-black transition-colors', isMuted ? 'bg-red-500/30 text-red-300' : 'text-white/25 hover:text-white/50 hover:bg-white/5')}
                                                        title={isMuted ? 'Unmute' : 'Mute'}>M</button>
                                                    <button onClick={() => toggleTrackSolo(track.id)}
                                                        className={clsx('px-1 py-0.5 rounded text-[8px] font-black transition-colors', isSolo ? 'bg-yellow-500/30 text-yellow-300' : 'text-white/25 hover:text-white/50 hover:bg-white/5')}
                                                        title={isSolo ? 'Unsolo' : 'Solo'}>S</button>
                                                    <button onClick={(e) => { e.stopPropagation(); setTrackMuted(track.id, !isMuted); }}
                                                        className={clsx('p-0.5 rounded transition-colors', isMuted ? 'text-red-400' : 'text-white/20 hover:text-white/50')}
                                                        title={isMuted ? 'Unmute' : 'Mute'}>
                                                        {isMuted ? <VolumeX size={11} /> : <Volume2 size={11} />}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                        {/* Per-Track Volume Slider */}
                                        {track.isAudio && (
                                            <div className="flex items-center gap-1 mt-0.5">
                                                <span className="text-[7px] text-white/20 w-4 text-right font-mono">{trackVolumes[track.id] ?? 100}</span>
                                                <input
                                                    type="range"
                                                    min={0}
                                                    max={100}
                                                    step={1}
                                                    value={trackVolumes[track.id] ?? 100}
                                                    onChange={(e) => setTrackVolume(track.id, parseInt(e.target.value))}
                                                    className="flex-1 h-0.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-purple-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400"
                                                    title={`Track Volume: ${trackVolumes[track.id] ?? 100}%`}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Track Lane */}
                                    <div
                                        className={clsx('flex-1 relative min-w-0', razorMode ? 'cursor-crosshair' : '')}
                                        style={{
                                            backgroundSize: '20px 20px',
                                            backgroundImage: 'radial-gradient(circle, #ffffff03 1px, transparent 1px)'
                                        }}
                                        onClick={handleTimelineClick}
                                    >
                                        {track.clips.map(clip => {
                                            const duration = clip.endFrame - clip.startFrame;
                                            const width = duration * scale;
                                            const left = clip.startFrame * scale;
                                            const isShadow = (clip as any)._shadowOf;
                                            const isLinkedAudio = track.id === 2 && isShadow;

                                            return (
                                                <div
                                                    key={clip.id}
                                                    className={clsx(
                                                        "absolute top-1 bottom-1 rounded border text-xs flex flex-col justify-center px-2 truncate overflow-hidden hover:brightness-110 shadow-lg transition-colors border-l-[3px]",
                                                        activeVisualClip?.id === clip.id || activeVisualClip?.id === isShadow ? "ring-1 ring-white/30" : "",
                                                        multiSelectedIds.has(clip.id) ? 'ring-1 ring-blue-400/50' : '',
                                                        razorMode ? 'cursor-crosshair' : '',
                                                        isLocked ? "cursor-not-allowed" : (track.isAudio && track.id > 100 ? (dragClipId === clip.id ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-pointer'),
                                                        clip.disabled ? "opacity-30 grayscale border-dashed" : (
                                                            isLinkedAudio ? 'bg-cyan-900/30 border-l-cyan-500/70 border-y-cyan-500/15 border-r-cyan-500/15 text-cyan-200/80' :
                                                            clip.type === 'grid' ? 'bg-primary/30 border-l-primary/70 border-y-primary/20 border-r-primary/20 text-primary-light' :
                                                                clip.type === 'video' ? 'bg-accent/30 border-l-accent/70 border-y-accent/20 border-r-accent/20 text-accent-light' :
                                                                    clip.type === 'audio' ? 'bg-pink-900/30 border-l-pink-500/70 border-y-pink-500/20 border-r-pink-500/20 text-pink-200/80' :
                                                                        'bg-gray-800/30 border-gray-600/50'
                                                        )
                                                    )}
                                                    style={{ left, width }}
                                                    title={`${clip.filename} (${duration}f)${isLinkedAudio ? ' — linked audio' : ''}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (razorMode && !isLocked) {
                                                            // Split this clip at the clicked position
                                                            const rect = e.currentTarget.parentElement!.getBoundingClientRect();
                                                            const clickX = e.clientX - rect.left;
                                                            const clickFrame = Math.max(0, Math.floor(clickX / scale));
                                                            handleSplitClip(clip.id, clickFrame);
                                                            return;
                                                        }
                                                        setCurrentGlobalFrame(clip.startFrame);
                                                        // Multi-select support
                                                        if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                                            setMultiSelectedIds(prev => {
                                                                const next = new Set(prev);
                                                                const realId = (isShadow as string) || clip.id;
                                                                if (next.has(realId)) next.delete(realId); else next.add(realId);
                                                                return next;
                                                            });
                                                        } else {
                                                            setMultiSelectedIds(new Set());
                                                            setSelectedClipId((isShadow as string) || clip.id);
                                                        }
                                                    }}
                                                    onMouseDown={(e) => {
                                                        if (isLocked) return;
                                                        if (track.isAudio && track.id > 100 && !isShadow) {
                                                            // Existing audio drag behavior
                                                            e.stopPropagation();
                                                            e.preventDefault();
                                                            setDragClipId(clip.id);
                                                            dragStartXRef.current = e.clientX;
                                                            dragOrigStartFrameRef.current = clip.startFrame;
                                                            dragOrigEndFrameRef.current = clip.endFrame;
                                                        } else if (track.id === 1 && !isShadow) {
                                                            // V1 drag-to-reorder
                                                            e.stopPropagation();
                                                            e.preventDefault();
                                                            setV1DragClipId(clip.id);
                                                        }
                                                    }}
                                                >
                                                    {/* Left trim handle */}
                                                    {!isLocked && !isShadow && (
                                                        <div
                                                            className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-yellow-400/20 z-10 group/trim"
                                                            onMouseDown={(e) => {
                                                                e.stopPropagation();
                                                                e.preventDefault();
                                                                setTrimState({
                                                                    clipId: clip.id, edge: 'left', startX: e.clientX,
                                                                    origStart: clip.startFrame, origEnd: clip.endFrame,
                                                                    origTrimStart: clip.trimStartFrame || 0, origTrimEnd: clip.trimEndFrame || clip.sourceDurationFrames || 0
                                                                });
                                                            }}
                                                        >
                                                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-yellow-400/0 group-hover/trim:bg-yellow-400 rounded-r transition-colors" />
                                                        </div>
                                                    )}
                                                    {/* Right trim handle */}
                                                    {!isLocked && !isShadow && (
                                                        <div
                                                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-yellow-400/20 z-10 group/trim"
                                                            onMouseDown={(e) => {
                                                                e.stopPropagation();
                                                                e.preventDefault();
                                                                setTrimState({
                                                                    clipId: clip.id, edge: 'right', startX: e.clientX,
                                                                    origStart: clip.startFrame, origEnd: clip.endFrame,
                                                                    origTrimStart: clip.trimStartFrame || 0, origTrimEnd: clip.trimEndFrame || clip.sourceDurationFrames || 0
                                                                });
                                                            }}
                                                        >
                                                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-yellow-400/0 group-hover/trim:bg-yellow-400 rounded-l transition-colors" />
                                                        </div>
                                                    )}
                                                    <span className="font-semibold truncate flex items-center gap-1 text-[10px]">
                                                        {track.id === 1 && !isShadow && <GripVertical size={9} className="text-white/15 flex-shrink-0 cursor-grab" />}
                                                        {isLinkedAudio && <Link2 size={8} className="text-cyan-300/40 flex-shrink-0" />}
                                                        {clip.filename}
                                                    </span>
                                                    <span className="text-[8px] opacity-40">{isLinkedAudio ? 'Linked' : `${duration}f`}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                            })}

                            {/* Full Height Playhead Line */}
                            <div
                                className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none z-20 shadow-[0_0_4px_rgba(239,68,68,0.3)]"
                                style={{ left: 200 + (currentGlobalFrame * scale) }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
