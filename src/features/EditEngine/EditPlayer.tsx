import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMediaStore } from '../../store/mediaStore';
import { useClipStore } from '../../store/clipStore';
import { useViewStore } from '../../store/viewStore';
import { useUserStore } from '../../store/userStore';
import { useSavedEditsStore } from '../../store/savedEditsStore';
import { useGodModeStore } from '../../store/godModeStore';
import { generateTrailerSequence, TrailerSettings, TrailerClip, extractBeatTimestamps } from '../../lib/trailerGenerator';
import { generateSeed } from '../../lib/random';
import { finalizeGeneratedSequence } from '../../lib/editSequencePipeline';
import { reorderClips } from '../../lib/clipOrdering';

import { DEFAULT_FPS } from '../../lib/time';
import { Wand2, RefreshCw, Settings2, Film, Play, Pause, ArrowLeft, Volume2, VolumeX, Shuffle, Dice3, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { v4 as uuidv4 } from 'uuid';
import { Clip } from '../../types';

interface PlayerProps {
    settings: TrailerSettings;
    preGeneratedClips?: any[];
    onDiscard: () => void;
    onSettings: () => void;
}

export const EditPlayer: React.FC<PlayerProps> = ({ settings, preGeneratedClips, onDiscard, onSettings }) => {
    const { files, selectedFileIds } = useMediaStore();
    const { setClips } = useClipStore();
    const { setActiveTab } = useViewStore();
    const { masterVolume, isMasterMuted, setMasterVolume, setIsMasterMuted } = useUserStore();
    const { orientationFilter } = useMediaStore();

    // Use only selected clips if user made a selection, otherwise use all
    const pool = selectedFileIds.length > 0
        ? files.filter(f => selectedFileIds.includes(f.id))
        : files;

    const [draftSequence, setDraftSequence] = useState<TrailerClip[]>([]);
    const [currentClipIndex, setCurrentClipIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(true);
    const [isGenerating, setIsGenerating] = useState(true);
    const [globalProgress, setGlobalProgress] = useState(0);
    const [showVolumeBar, setShowVolumeBar] = useState(false);
    const volumeBarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const videoARef = useRef<HTMLVideoElement>(null);
    const videoBRef = useRef<HTMLVideoElement>(null);
    const activeVideoRef = useRef<'A' | 'B'>('A');
    const audioPlayerRef = useRef<HTMLAudioElement>(null);
    const rafRef = useRef<number>(0);
    const flipLockRef = useRef(false);
    const lastRafTimeRef = useRef(0);
    const stallStartRef = useRef<number>(0);
    const lastCurrentTimeRef = useRef<number>(-1);
    const clipChangeTimeRef = useRef<number>(performance.now()); // Grace period: when the current clip changed

    // Stable refs for RAF loop
    const draftRef = useRef(draftSequence);
    const indexRef = useRef(currentClipIndex);
    const isPlayingRef = useRef(isPlaying);
    const isGeneratingRef = useRef(isGenerating);

    useEffect(() => { draftRef.current = draftSequence; }, [draftSequence]);
    useEffect(() => {
        indexRef.current = currentClipIndex;
        // Reset stall detection whenever the clip changes — give the new video
        // element time to load, seek, and begin playback before checking for stalls.
        stallStartRef.current = 0;
        lastCurrentTimeRef.current = -1;
        clipChangeTimeRef.current = performance.now();
    }, [currentClipIndex]);
    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
    useEffect(() => { isGeneratingRef.current = isGenerating; }, [isGenerating]);

    const processClips = (rawClips: Clip[], settingsObj: TrailerSettings): Clip[] => {
        let clips = finalizeGeneratedSequence(rawClips, pool, settingsObj, DEFAULT_FPS);
        if (settingsObj.clipOrderMode && settingsObj.clipOrderMode !== 'none') {
            const fileMeta = new Map(
                pool.map(file => [file.id, { createdAt: file.createdAt, filename: file.filename }]),
            );
            clips = reorderClips(clips, settingsObj.clipOrderMode, {
                sequentialBy: settingsObj.sequentialBy,
                fileMeta,
                seed: settingsObj.seed,
            });
        }
        return clips;
    };

    const buildSequence = async (forceRegenerate = false) => {
        setIsGenerating(true); setIsPlaying(false);

        // The router's draft is the source of truth. This branch must remain
        // idempotent because React Strict Mode intentionally replays effects in
        // development. A ref gate here previously caused the second pass to
        // regenerate and overwrite the real draft with a repeated mini-pattern.
        if (!forceRegenerate && preGeneratedClips && preGeneratedClips.length > 0) {
            const videoClips = preGeneratedClips.filter((c: any) => c.type !== 'audio');
            let accumulated = 0;
            const embellished = videoClips.map((c: any) => {
                const dur = (c.endFrame - c.startFrame) / DEFAULT_FPS;
                const ret = { ...c, globalStart: accumulated, globalEnd: accumulated + dur, localDuration: dur };
                accumulated += dur;
                return ret;
            });
            (embellished as any).totalDuration = accumulated;
            setDraftSequence(embellished);
            setCurrentClipIndex(0);
            setGlobalProgress(0);
            setIsGenerating(false);
            if (embellished.length > 0) setIsPlaying(true);
            return;
        }

        let beats = null;
        if (settings.useAudioGuide && settings.audioUrl) {
            beats = await extractBeatTimestamps(settings.audioUrl, settings.audioTrimStart || 0, settings.audioTrimEnd || settings.targetDuration, settings.audioAnalysis);
        }
        
        setTimeout(() => {
            // Generate a fresh seed so Flux/regeneration produces different clips
            const seq = generateTrailerSequence(pool, { ...settings, seed: generateSeed(), beatTimestamps: beats });
            const processed = processClips(seq, settings);
            let accumulated = 0;
            const embellished = processed.map(c => {
                const dur = (c.endFrame - c.startFrame) / DEFAULT_FPS;
                const ret = { ...c, globalStart: accumulated, globalEnd: accumulated + dur, localDuration: dur };
                accumulated += dur;
                return ret;
            });
            (embellished as any).totalDuration = accumulated;
            setDraftSequence(embellished);
            setCurrentClipIndex(0);
            setGlobalProgress(0);
            setIsGenerating(false);
            if (embellished.length > 0) setIsPlaying(true);
        }, 100);
    };
    // ── SHUFFLE ONLY: keep same clips & durations, just reorder ──
    const shuffleOnly = () => {
        if (draftSequence.length <= 1) return;
        setIsPlaying(false);
        const videoClips = draftSequence.filter(c => c.type !== 'audio');
        const audioClips = draftSequence.filter(c => c.type === 'audio');
        // Fisher-Yates shuffle
        const shuffled = [...videoClips];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        // Recalculate timeline positions
        let accumulated = 0;
        let accumulatedFrames = 0;
        const reordered = shuffled.map(c => {
            const durFrames = c.endFrame - c.startFrame;
            const dur = durFrames / DEFAULT_FPS;
            const ret = { 
                ...c, 
                startFrame: accumulatedFrames,
                endFrame: accumulatedFrames + durFrames,
                globalStart: accumulated, 
                globalEnd: accumulated + dur, 
                localDuration: dur 
            };
            accumulated += dur;
            accumulatedFrames += durFrames;
            return ret;
        });
        (reordered as any).totalDuration = accumulated;
        setDraftSequence([...reordered, ...audioClips]);
        setCurrentClipIndex(0);
        setGlobalProgress(0);
        setIsPlaying(true);
    };

    // ── RANDOMIZE SEGMENTS + DURATIONS: fresh seed → new trim points, durations, speeds ──
    const randomizeSegments = () => {
        buildSequence(true);
    };

    // ── SHUFFLE + FLUX: full regenerate then shuffle the result ──
    const shuffleFlux = async () => {
        setIsGenerating(true); setIsPlaying(false);

        let beats = null;
        if (settings.useAudioGuide && settings.audioUrl) {
            beats = await extractBeatTimestamps(settings.audioUrl, settings.audioTrimStart || 0, settings.audioTrimEnd || settings.targetDuration, settings.audioAnalysis);
        }

        setTimeout(() => {
            const seq = generateTrailerSequence(pool, { ...settings, seed: generateSeed(), beatTimestamps: beats });
            const processed = processClips(seq, settings);
            // Separate video and audio
            const videoClips = processed.filter(c => c.type !== 'audio');
            const audioClips = processed.filter(c => c.type === 'audio');
            // Shuffle video clips
            for (let i = videoClips.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [videoClips[i], videoClips[j]] = [videoClips[j], videoClips[i]];
            }
            let accumulated = 0;
            let accumulatedFrames = 0;
            const embellished = videoClips.map(c => {
                const durFrames = c.endFrame - c.startFrame;
                const dur = durFrames / DEFAULT_FPS;
                const ret = { 
                    ...c, 
                    startFrame: accumulatedFrames,
                    endFrame: accumulatedFrames + durFrames,
                    globalStart: accumulated, 
                    globalEnd: accumulated + dur, 
                    localDuration: dur 
                };
                accumulated += dur;
                accumulatedFrames += durFrames;
                return ret;
            });
            (embellished as any).totalDuration = accumulated;
            setDraftSequence([...embellished, ...audioClips]);
            setCurrentClipIndex(0);
            setGlobalProgress(0);
            setIsGenerating(false);
            if (embellished.length > 0) setIsPlaying(true);
        }, 100);
    };

    useEffect(() => { buildSequence(false); }, [settings, preGeneratedClips]);

    const [urlCache, setUrlCache] = useState<Record<string, string>>({});
    
    useEffect(() => {
        if (draftSequence.length === 0 || isGenerating) return;
        const current = draftSequence[currentClipIndex];
        const next = draftSequence[(currentClipIndex + 1) % draftSequence.length];
        const needed = [current?.path, next?.path].filter(Boolean);
        
        const newCache = { ...urlCache };
        let changed = false;

        needed.forEach(path => {
            if (!path || newCache[path]) return;
            const file = files.find(f => f.path === path);
            if (file) {
                newCache[path] = `file://${path}`;
                changed = true;
            }
        });

        if (changed) setUrlCache(newCache);
    }, [currentClipIndex, draftSequence, files]);

    const isActA = activeVideoRef.current === 'A';
    const clipA = isActA ? draftSequence[currentClipIndex] : draftSequence[(currentClipIndex + 1) % draftSequence.length];
    const clipB = isActA ? draftSequence[(currentClipIndex + 1) % draftSequence.length] : draftSequence[currentClipIndex];
    const urlA = clipA ? urlCache[clipA.path] : '';
    const urlB = clipB ? urlCache[clipB.path] : '';

    const handleClipEnd = useCallback(() => {
        if (flipLockRef.current) return;
        flipLockRef.current = true;
        const seq = draftRef.current;
        if (!seq || seq.length === 0) { flipLockRef.current = false; return; }
        
        const nextIdx = (indexRef.current + 1) % seq.length;

        // Audio lock: when looping back to start, reset audio
        if (nextIdx === 0 && audioPlayerRef.current && settings.useAudioGuide) {
            audioPlayerRef.current.currentTime = settings.audioTrimStart || 0;
        }

        activeVideoRef.current = activeVideoRef.current === 'A' ? 'B' : 'A';
        setCurrentClipIndex(nextIdx);
        flipLockRef.current = false;
    }, [settings]);

    // Compute transition style for the current active clip
    const currentClip = draftSequence[currentClipIndex];
    const localFrame = currentClip
        ? Math.floor(((globalProgress * ((draftSequence as any).totalDuration || 1)) - (currentClip.globalStart || 0)) * DEFAULT_FPS)
        : 0;
    const transitionStyle = { transform: '', opacity: 1, zIndex: 20, clipPath: undefined as string | undefined };

    // Determine object-fit based on source orientation
    const currentOrientation = currentClip?.sourceOrientation || 'horizontal';
    const objectFit = (currentClip?.zoomStart || currentClip?.zoomEnd) && currentOrientation === 'vertical'
        ? 'object-cover' : 'object-contain';

    useEffect(() => {
        if (!isPlaying || isGenerating || draftSequence.length === 0) return;
        lastRafTimeRef.current = performance.now();
        const loop = (now: number) => {
            const seq = draftRef.current;
            const idx = indexRef.current;
            if (!seq || seq.length === 0 || !isPlayingRef.current || isGeneratingRef.current) return;
            
            const clip = seq[idx];
            const activeVid = activeVideoRef.current === 'A' ? videoARef.current : videoBRef.current;
            
            if (activeVid && clip && clip.type === 'video') {
                const trimStart = clip.trimStartFrame / DEFAULT_FPS;
                const trimEnd = clip.trimEndFrame / DEFAULT_FPS;

                // ── STALL DETECTION ──
                // If video currentTime hasn't changed in 5s, the source is likely
                // corrupt or unplayable. Skip to next clip to prevent black screen.
                //
                // GRACE PERIOD: Skip stall detection for the first 3 seconds after
                // a clip change. The video element needs time to: set src → load
                // metadata → seek to trimStart → begin playback. Without this grace
                // period, every clip gets falsely flagged as "stalled" and skipped.
                //
                // NOTE: Reversed clips use manual seeking (not native playback), so
                // stall detection is skipped entirely for them.
                const STALL_GRACE_MS = 3000;
                const STALL_TIMEOUT_MS = 5000;
                const timeSinceClipChange = now - clipChangeTimeRef.current;

                if (!clip.reversed && timeSinceClipChange > STALL_GRACE_MS) {
                    const ct = activeVid.currentTime;
                    if (ct === lastCurrentTimeRef.current) {
                        if (stallStartRef.current === 0) stallStartRef.current = now;
                        else if (now - stallStartRef.current > STALL_TIMEOUT_MS) {
                            console.warn(`[TrailerPlayer] Clip ${idx} stalled for ${STALL_TIMEOUT_MS/1000}s — skipping`);
                            stallStartRef.current = 0;
                            lastCurrentTimeRef.current = -1;
                            handleClipEnd();
                            return;
                        }
                    } else {
                        stallStartRef.current = 0;
                        lastCurrentTimeRef.current = ct;
                    }
                }

                if (clip.reversed) {
                    // BOOMERANG PREVIEW: Play forward instead of seeking backward.
                    // HTML5 video cannot smoothly reverse. The exported video uses
                    // FFmpeg's `reverse` filter for true reversal. In preview we
                    // replay the same source range forward — the bouncing duration
                    // decay still communicates the boomerang feel.
                    lastRafTimeRef.current = now;
                    if (activeVid.currentTime >= trimEnd || activeVid.ended) {
                        handleClipEnd();
                    } else {
                        const globalTime = (clip.globalStart || 0) + Math.max(0, activeVid.currentTime - trimStart);
                        setGlobalProgress(globalTime / (seq as any).totalDuration);
                    }
                } else {
                    if (activeVid.currentTime >= trimEnd || activeVid.ended) {
                        handleClipEnd();
                    } else {
                        const globalTime = (clip.globalStart || 0) + Math.max(0, activeVid.currentTime - trimStart);
                        setGlobalProgress(globalTime / (seq as any).totalDuration);
                    }
                }
            }
            rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(rafRef.current!);
    }, [isPlaying, isGenerating, handleClipEnd]);

    useEffect(() => {
        if (isGenerating || draftSequence.length === 0) return;
        const clip = draftSequence[currentClipIndex];
        const nextClip = draftSequence[(currentClipIndex + 1) % draftSequence.length];
        const activeVid = activeVideoRef.current === 'A' ? videoARef.current : videoBRef.current;
        const bgVid = activeVideoRef.current === 'A' ? videoBRef.current : videoARef.current;
        const vol = isMasterMuted ? 0 : masterVolume;

        if (activeVid && clip) {
            activeVid.volume = (clip.isMuted || isMasterMuted) ? 0 : vol;
            activeVid.playbackRate = Math.max(0.0625, Math.min(16, clip.speed || 1));
            // Preview always plays forward from trimStart (FFmpeg handles reversal on export)
            const startSec = clip.trimStartFrame / DEFAULT_FPS;
            if (Math.abs(activeVid.currentTime - startSec) > 0.1) {
                const onSeek = () => {
                    activeVid.removeEventListener('seeked', onSeek);
                    if (isPlayingRef.current) activeVid.play().catch(() => {});
                };
                activeVid.addEventListener('seeked', onSeek, { once: true });
                activeVid.currentTime = startSec;
            } else if (isPlayingRef.current) {
                activeVid.play().catch(() => {});
            } else {
                activeVid.pause();
            }
        }

        if (bgVid && nextClip) {
            const bgStart = nextClip.trimStartFrame / DEFAULT_FPS;
            if (bgVid.readyState >= 1) { bgVid.currentTime = bgStart; bgVid.pause(); }
            else { bgVid.addEventListener('loadedmetadata', () => { bgVid.currentTime = bgStart; bgVid.pause(); }, { once: true }); }
        }
    }, [currentClipIndex, isPlaying, isGenerating, draftSequence, masterVolume, isMasterMuted]);

    // Audio sync: play/pause based on player state, always start from audioTrimStart.
    useEffect(() => {
        const audio = audioPlayerRef.current;
        if (!audio || !settings.useAudioGuide) return;
        const vol = isMasterMuted ? 0 : masterVolume;
        
        audio.volume = vol;
        if (isPlaying && !isGenerating) {
            if (audio.paused) {
                // When starting playback, sync audio to the correct position.
                // If at the beginning (progress ~0), reset to audioTrimStart.
                const totalDur = (draftSequence as any).totalDuration || 1;
                const expectedTime = (settings.audioTrimStart || 0) + (globalProgress * totalDur);
                if (globalProgress < 0.01) {
                    // Starting from the beginning — always reset to trim start
                    audio.currentTime = settings.audioTrimStart || 0;
                } else if (Math.abs(audio.currentTime - expectedTime) > 0.5) {
                    audio.currentTime = expectedTime;
                }
                audio.play().catch(() => {});
            }
        } else {
            if (!audio.paused) audio.pause();
        }
    }, [isPlaying, isGenerating, settings, masterVolume, isMasterMuted]);

    // Cleanup: stop all playback when component unmounts (user navigates away)
    useEffect(() => {
        return () => {
            cancelAnimationFrame(rafRef.current!);
            videoARef.current?.pause();
            videoBRef.current?.pause();
            audioPlayerRef.current?.pause();
        };
    }, []);

    // Pause/resume video elements when isPlaying toggles
    useEffect(() => {
        const activeVid = activeVideoRef.current === 'A' ? videoARef.current : videoBRef.current;
        if (!activeVid) return;
        if (isPlaying && !isGenerating) {
            const clip = draftSequence[currentClipIndex];
            if (clip && !clip.reversed) activeVid.play().catch(() => {});
        } else {
            activeVid.pause();
        }
    }, [isPlaying, isGenerating]);

    // Keyboard shortcut: Space to toggle play/pause
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.key === ' ') {
                e.preventDefault();
                setIsPlaying(p => !p);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    /*
     * ── SAVE TO TIMELINE (Keep Edit) ──────────────────────────────────────
     * This function converts the draft trailer sequence into permanent Clip
     * objects and pushes them into the global clipStore. It also creates a
     * background AUDIO clip (type='audio', track=2) when music was used.
     *
     * ⚠ EXPORT PIPELINE NOTE:
     * The audio clip created here flows directly to the export-project IPC
     * handler in electron/main.ts. The handler uses the clip's `path` field
     * to add it as an FFmpeg input. Therefore:
     *   1. The path MUST be a raw filesystem path (e.g., "D:\Music\song.mp3")
     *      NOT a file:// URL. FFmpeg on Windows cannot open file:// URLs.
     *   2. The volume MUST be set (default 100). The export handler uses
     *      clip.volume to set the amix volume for background music.
     *   3. Video clips may have volume=0/isMuted=true (from audioMixStrategy)
     *      which is correct — it mutes the video's embedded audio so the
     *      background music dominates via amix in the FFmpeg filter chain.
     */
    const handleSave = () => {
        const cleanSeq: Clip[] = draftSequence.map(c => ({
            ...c,                    // Preserve ALL properties (effectIds, visualTexture, zoom*, rotation, etc.)
            id: uuidv4(),            // Fresh ID for timeline instance
            track: c.track || 1,     // Preserve track assignment from preset
            origin: 'auto' as const, // Mark as auto-generated
        }));

        // Add audio track if audio guide was used
        const allClips: Clip[] = [...cleanSeq];
        if (settings.useAudioGuide && settings.audioUrl) {
            const totalFrames = cleanSeq.length > 0
                ? cleanSeq[cleanSeq.length - 1].endFrame
                : Math.floor(settings.targetDuration * DEFAULT_FPS);

            // ── PATH RESOLUTION ──
            // Prefer audioFilePath (raw filesystem path from Electron's File.path).
            // Fall back to audioUrl, but strip file:// prefix if present since
            // FFmpeg cannot open file:// URLs on Windows.
            let resolvedAudioPath = settings.audioFilePath || settings.audioUrl;
            if (resolvedAudioPath.startsWith('file:///')) {
                resolvedAudioPath = resolvedAudioPath.slice(8);
            } else if (resolvedAudioPath.startsWith('file://')) {
                resolvedAudioPath = resolvedAudioPath.slice(7);
            }
            // If still a blob URL, try multiple fallbacks for the real filesystem path
            if (resolvedAudioPath.startsWith('blob:')) {
                // 1. Check godModeStore directly (Zustand state survives navigation)
                const gmStorePath = useGodModeStore.getState().audioFilePath;
                if (gmStorePath && !gmStorePath.startsWith('blob:')) {
                    console.warn('[TrailerPlayer] audioUrl was blob — using godModeStore.audioFilePath:', gmStorePath);
                    resolvedAudioPath = gmStorePath;
                }
                // 2. Check window global (set by TrailerWizard.handleAudioUpload)
                else {
                    const gmWindowPath = (window as any).__godModeAudioFilePath;
                    if (gmWindowPath && !gmWindowPath.startsWith('blob:')) {
                        console.warn('[TrailerPlayer] audioUrl was blob — using window.__godModeAudioFilePath:', gmWindowPath);
                        resolvedAudioPath = gmWindowPath;
                    } else {
                        console.error('[TrailerPlayer] ⚠ Audio path is a blob URL with no filesystem fallback — audio WILL be missing from export');
                    }
                }
            }
            // Strip file:// prefix from fallback paths too
            if (resolvedAudioPath.startsWith('file:///')) resolvedAudioPath = resolvedAudioPath.slice(8);
            else if (resolvedAudioPath.startsWith('file://')) resolvedAudioPath = resolvedAudioPath.slice(7);
            // Decode URL-encoded characters (e.g., %20 → space)
            try { resolvedAudioPath = decodeURIComponent(resolvedAudioPath); } catch {}

            const audioClip: Clip = {
                id: uuidv4(),
                type: 'audio',
                path: resolvedAudioPath,
                filename: settings.audioFile || 'Audio Track',
                startFrame: 0,
                endFrame: totalFrames,
                sourceDurationFrames: totalFrames,
                trimStartFrame: Math.floor((settings.audioTrimStart || 0) * DEFAULT_FPS),
                trimEndFrame: Math.floor((settings.audioTrimEnd || settings.targetDuration) * DEFAULT_FPS),
                track: 101,  // Audio 2 track — background music, NOT linked clip audio (track 2)
                speed: 1,
                volume: 100,
                reversed: false,
                loopToTimeline: true,
                locked: false,
                origin: 'auto',
            };
            allClips.push(audioClip);
        }

        // ⚠ EXPORT PIPELINE: Also preserve any existing audio clips from the store
        // that were imported via the Media Manager (not via Beat Intelligence).
        // This ensures background music survives the "Keep Edit" flow.
        const { clips: existingClips } = useClipStore.getState();
        const existingAudioClips = existingClips.filter(c => c.type === 'audio');
        // Avoid duplicating audio clips — only add existing ones whose paths aren't
        // already in allClips (the Beat Intelligence audio clip was just added above).
        const newAudioPaths = new Set(allClips.filter(c => c.type === 'audio').map(c => c.path));
        for (const existing of existingAudioClips) {
            if (!newAudioPaths.has(existing.path)) {
                allClips.push(existing);
            }
        }

        setClips(allClips);

        // Save a snapshot to the Saved Edits store
        const gm = useGodModeStore.getState();
        const mediaState = useMediaStore.getState();
        const videoClips = allClips.filter(c => c.type !== 'audio');
        const dur = videoClips.length > 0
            ? Math.round(videoClips[videoClips.length - 1].endFrame / DEFAULT_FPS)
            : settings.targetDuration;
        // Extract thumbnail from first video clip
        const firstVideoClip = videoClips.find(c => c.type === 'video' && c.path);

        // Build a clean settings snapshot (exclude transient/large data)
        const settingsSnapshot: Record<string, any> = { ...settings };
        delete settingsSnapshot.audioAnalysis;
        delete settingsSnapshot.narrationAnalysis;

        // Collect source folder paths for project restore
        const sourceFolders = mediaState.recentFolders.map(f => f.path);

        useSavedEditsStore.getState().addEdit({
            name: `Trailer — ${new Date().toLocaleTimeString()}`,
            clips: allClips,
            clipCount: videoClips.length,
            thumbnailPath: firstVideoClip?.path || undefined,
            duration: dur,
            godModePresetId: gm.selectedPresetId || undefined,
            sourceFolders: sourceFolders.length > 0 ? sourceFolders : undefined,
            audioFilePath: settings.audioFilePath || undefined,
            audioFileName: settings.audioFile || undefined,
            settingsSnapshot,
        });

        setActiveTab('sequence');
    };

    // Zoom for current active clip
    const clipProgress = currentClip
        ? Math.max(0, Math.min(1, localFrame / Math.max(1, (currentClip.endFrame - currentClip.startFrame))))
        : 0;
    const currentZoom = currentClip?.zoomStart !== undefined && currentClip?.zoomEnd !== undefined
        ? currentClip.zoomStart + (clipProgress * (currentClip.zoomEnd - currentClip.zoomStart))
        : (currentClip?.zoomLevel || 100);

    // Total duration of the generated sequence
    const totalDuration: number = draftSequence.length > 0
        ? (draftSequence[draftSequence.length - 1].globalEnd || 0)
        : (settings.targetDuration || 30);

    const formatTime = (seconds: number): string => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="h-full w-full bg-black flex flex-col relative group overflow-hidden">
            <audio ref={audioPlayerRef} src={settings.audioUrl || ''} className="hidden" />
            
            {/* Header */}
            <div className={clsx("absolute top-0 inset-x-0 p-6 z-50 bg-gradient-to-b from-black/80 to-transparent flex justify-between transition-opacity", isPlaying ? "opacity-0 group-hover:opacity-100" : "opacity-100")}>
                <div className="flex gap-3">
                    <button onClick={onDiscard} className="flex items-center gap-2 border border-white/20 bg-white/5 text-white font-bold uppercase text-xs px-4 py-2 rounded-lg hover:bg-white/10">
                        <ArrowLeft size={16} /> Discard
                    </button>
                    <button onClick={onSettings} className="flex items-center gap-2 border border-white/20 bg-white/5 text-white font-bold uppercase text-xs px-4 py-2 rounded-lg hover:bg-white/10">
                        <Settings2 size={16} /> Settings
                    </button>
                </div>
                <div className="flex gap-1.5 flex-wrap justify-end">
                    <button onClick={randomizeSegments} title="New random trim points, durations & speeds — same pool" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500/15 text-blue-300 font-bold text-[10px] uppercase tracking-wider hover:bg-blue-500/30 border border-blue-500/20 hover:border-blue-500/40 transition-all">
                        <Dice3 size={13} className={isGenerating ? "animate-spin" : ""} /> Randomize
                    </button>
                    <button onClick={shuffleOnly} title="Shuffle clip order — keep same segments & durations" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/15 text-amber-300 font-bold text-[10px] uppercase tracking-wider hover:bg-amber-500/30 border border-amber-500/20 hover:border-amber-500/40 transition-all">
                        <Shuffle size={13} /> Shuffle
                    </button>
                    <button onClick={shuffleFlux} title="Full regenerate + shuffle order" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/15 text-emerald-300 font-bold text-[10px] uppercase tracking-wider hover:bg-emerald-500/30 border border-emerald-500/20 hover:border-emerald-500/40 transition-all">
                        <Sparkles size={13} className={isGenerating ? "animate-pulse" : ""} /> Shuffle + Flux
                    </button>
                    <button onClick={() => buildSequence(true)} title="Completely regenerate the edit" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-500/15 text-purple-300 font-bold text-[10px] uppercase tracking-wider hover:bg-purple-500/30 border border-purple-500/20 hover:border-purple-500/40 transition-all">
                        <RefreshCw size={13} className={isGenerating ? "animate-spin" : ""} /> Flux All
                    </button>
                    <button onClick={handleSave} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-white font-black uppercase text-[10px] tracking-wider hover:bg-primary/80 shadow-[0_0_15px_rgba(var(--color-primary),0.3)]">
                        <Film size={13} /> Keep Edit
                    </button>
                </div>
            </div>

            {/* Player — aspect-ratio driven by orientation filter */}
            <div className={clsx("flex-1 relative overflow-hidden",
                orientationFilter === 'vertical' ? 'max-w-[40%] mx-auto' : '',
                orientationFilter === 'square' ? 'max-w-[60%] mx-auto aspect-square' : '')}
                style={{ ...(orientationFilter === 'vertical' ? { aspectRatio: '9/16' } : {}) }}
                onClick={() => setIsPlaying(!isPlaying)}
                onWheel={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const delta = e.deltaY > 0 ? -0.05 : 0.05;
                    const newVol = Math.max(0, Math.min(1, masterVolume + delta));
                    setMasterVolume(newVol);
                    if (isMasterMuted && newVol > 0) setIsMasterMuted(false);
                    setShowVolumeBar(true);
                    if (volumeBarTimeoutRef.current) clearTimeout(volumeBarTimeoutRef.current);
                    volumeBarTimeoutRef.current = setTimeout(() => setShowVolumeBar(false), 1500);
                }}>
                {isGenerating ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 animate-pulse">
                        <Wand2 size={48} className="text-purple-500/50" />
                        <span className="text-white/50 font-bold uppercase text-xs">Generating Sequence...</span>
                    </div>
                ) : (
                    <>
                        <video ref={videoARef} src={urlA}
                            className={clsx(`absolute inset-0 w-full h-full ${objectFit} pointer-events-none transition-none`, isActA ? "z-20 opacity-100" : "z-0 opacity-0")}
                            style={{
                                transform: `scale(${currentZoom / 100}) ${isActA ? transitionStyle.transform : ''}`,
                                transformOrigin: currentClip?.zoomOrigin || 'center',
                                opacity: isActA ? transitionStyle.opacity : 0,
                                clipPath: isActA && transitionStyle.clipPath ? transitionStyle.clipPath : undefined,
                            }}
                            onError={() => { console.warn('[TrailerPlayer] Video A failed to load — skipping clip'); handleClipEnd(); }}
                            playsInline muted={clipA?.isMuted || isMasterMuted} />
                        <video ref={videoBRef} src={urlB}
                            className={clsx(`absolute inset-0 w-full h-full ${objectFit} pointer-events-none transition-none`, !isActA ? "z-20 opacity-100" : "z-0 opacity-0")}
                            style={{
                                transform: `scale(${currentZoom / 100}) ${!isActA ? transitionStyle.transform : ''}`,
                                transformOrigin: currentClip?.zoomOrigin || 'center',
                                opacity: !isActA ? transitionStyle.opacity : 0,
                                clipPath: !isActA && transitionStyle.clipPath ? transitionStyle.clipPath : undefined,
                            }}
                            onError={() => { console.warn('[TrailerPlayer] Video B failed to load — skipping clip'); handleClipEnd(); }}
                            playsInline muted={clipB?.isMuted || isMasterMuted} />

                        {/* Volume Overlay Bar */}
                        {showVolumeBar && (
                            <div className="absolute top-3 right-3 z-30 flex flex-col items-center gap-1 bg-black/60 backdrop-blur-md rounded-lg px-2 py-2 border border-white/10 transition-opacity duration-300"
                                style={{ opacity: showVolumeBar ? 1 : 0 }}>
                                <div className="text-[9px] font-bold text-white/70 uppercase tracking-wider">Vol</div>
                                <div className="relative w-1.5 h-16 bg-white/10 rounded-full overflow-hidden">
                                    <div className="absolute bottom-0 w-full rounded-full transition-all duration-150"
                                        style={{
                                            height: `${Math.round((isMasterMuted ? 0 : masterVolume) * 100)}%`,
                                            background: masterVolume > 0.7 ? '#ef4444' : masterVolume > 0.4 ? '#eab308' : '#22c55e'
                                        }} />
                                </div>
                                <div className="text-[10px] font-mono text-white/80">{Math.round((isMasterMuted ? 0 : masterVolume) * 100)}</div>
                            </div>
                        )}

                        {/* Centered Play/Pause overlay — always accessible */}
                        <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
                            <div className={clsx(
                                "w-16 h-16 rounded-full flex items-center justify-center backdrop-blur-xl pointer-events-auto cursor-pointer transition-all duration-300",
                                isPlaying ? "opacity-0 hover:opacity-80 scale-90" : "opacity-100 scale-100"
                            )}
                                style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)' }}
                                onClick={(e) => { e.stopPropagation(); setIsPlaying(!isPlaying); }}
                            >
                                {isPlaying ? <Pause size={28} className="text-white/90" /> : <Play size={28} className="text-white/90 ml-1" />}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Controls */}
            {!isGenerating && (
                <div className={clsx("absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-6 pt-12 z-50 flex flex-col gap-4 transition-transform duration-200", isPlaying ? "translate-y-full group-hover:translate-y-0" : "translate-y-0")} onClick={e => e.stopPropagation()}>
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden cursor-pointer"
                        onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                            setGlobalProgress(pct);
                        }}>
                        <div className="h-full bg-primary" style={{ width: `${globalProgress * 100}%` }} />
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button onClick={() => setIsPlaying(!isPlaying)} className="text-white hover:text-primary">
                                {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                            </button>
                            {/* Duration Display */}
                            <div className="text-xs font-mono text-white/60">
                                <span className="text-white">{formatTime(globalProgress * totalDuration)}</span>
                                <span className="text-white/30"> / </span>
                                <span>{formatTime(totalDuration)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setIsMasterMuted(!isMasterMuted)} className="text-white/70 hover:text-white">
                                    {isMasterMuted || masterVolume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                                </button>
                                <input type="range" min="0" max="1" step="0.05" value={isMasterMuted ? 0 : masterVolume} onChange={(e) => { setMasterVolume(Number(e.target.value)); setIsMasterMuted(false); }} className="w-20 accent-primary" />
                            </div>
                        </div>
                        <div className="text-[10px] text-white/30 font-bold uppercase tracking-wider">
                            {draftSequence.length} clips · {settings.targetDuration}s target
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
