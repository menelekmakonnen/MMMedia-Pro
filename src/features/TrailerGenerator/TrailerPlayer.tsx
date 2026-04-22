import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMediaStore } from '../../store/mediaStore';
import { useClipStore } from '../../store/clipStore';
import { useViewStore } from '../../store/viewStore';
import { useUserStore } from '../../store/userStore';
import { generateTrailerSequence, TrailerSettings, TrailerClip, extractBeatTimestamps } from '../../lib/trailerGenerator';
import { getClipTransitionStyle } from '../../lib/transitions';
import { DEFAULT_FPS } from '../../lib/time';
import { Wand2, RefreshCw, Settings2, Film, Play, Pause, ArrowLeft, Volume2, VolumeX } from 'lucide-react';
import clsx from 'clsx';
import { v4 as uuidv4 } from 'uuid';
import { Clip } from '../../types';

interface PlayerProps {
    settings: TrailerSettings;
    onDiscard: () => void;
    onSettings: () => void;
}

export const TrailerPlayer: React.FC<PlayerProps> = ({ settings, onDiscard, onSettings }) => {
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

    const videoARef = useRef<HTMLVideoElement>(null);
    const videoBRef = useRef<HTMLVideoElement>(null);
    const activeVideoRef = useRef<'A' | 'B'>('A');
    const audioPlayerRef = useRef<HTMLAudioElement>(null);
    const rafRef = useRef<number>(0);
    const flipLockRef = useRef(false);
    const lastRafTimeRef = useRef(0);

    // Stable refs for RAF loop
    const draftRef = useRef(draftSequence);
    const indexRef = useRef(currentClipIndex);
    const isPlayingRef = useRef(isPlaying);
    const isGeneratingRef = useRef(isGenerating);

    useEffect(() => { draftRef.current = draftSequence; }, [draftSequence]);
    useEffect(() => { indexRef.current = currentClipIndex; }, [currentClipIndex]);
    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
    useEffect(() => { isGeneratingRef.current = isGenerating; }, [isGenerating]);


    const buildSequence = async () => {
        setIsGenerating(true); setIsPlaying(false);
        let beats = null;
        if (settings.useAudioGuide && settings.audioUrl) {
            beats = await extractBeatTimestamps(settings.audioUrl, settings.audioTrimStart || 0, settings.audioTrimEnd || settings.targetDuration, settings.audioAnalysis);
        }
        
        setTimeout(() => {
            const seq = generateTrailerSequence(pool, { ...settings, beatTimestamps: beats });
            let accumulated = 0;
            const embellished = seq.map(c => {
                // Use OUTPUT frames (endFrame - startFrame) which already account for speed
                // NOT source frames (trimEndFrame - trimStartFrame) which ignore speed
                const dur = (c.endFrame - c.startFrame) / DEFAULT_FPS;
                const ret = { ...c, globalStart: accumulated, globalEnd: accumulated + dur, localDuration: dur };
                accumulated += dur;
                return ret;
            });
            // Attach total duration as a custom property
            (embellished as any).totalDuration = accumulated;
            setDraftSequence(embellished);
            setCurrentClipIndex(0);
            setGlobalProgress(0);
            setIsGenerating(false);
            if (embellished.length > 0) setIsPlaying(true);
        }, 100);
    };

    useEffect(() => { buildSequence(); }, [settings]);

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
    const transitionStyle = currentClip ? getClipTransitionStyle(currentClip, Math.max(0, localFrame)) : { transform: '', opacity: 1, zIndex: 20 };

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

                if (clip.reversed) {
                    const dt = (now - lastRafTimeRef.current) / 1000;
                    lastRafTimeRef.current = now;
                    const step = dt * (clip.speed || 1);
                    activeVid.pause();
                    const newTime = activeVid.currentTime - step;
                    if (newTime <= trimStart) {
                        handleClipEnd();
                    } else {
                        activeVid.currentTime = newTime;
                        const globalTime = (clip.globalStart || 0) + Math.max(0, trimEnd - newTime);
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
            activeVid.playbackRate = clip.speed || 1;
            const startSec = clip.reversed
                ? clip.trimEndFrame / DEFAULT_FPS
                : clip.trimStartFrame / DEFAULT_FPS;
            if (Math.abs(activeVid.currentTime - startSec) > 0.1) {
                const onSeek = () => {
                    activeVid.removeEventListener('seeked', onSeek);
                    if (isPlayingRef.current && !clip.reversed) activeVid.play().catch(() => {});
                };
                activeVid.addEventListener('seeked', onSeek, { once: true });
                activeVid.currentTime = startSec;
            } else if (isPlayingRef.current && !clip.reversed) {
                activeVid.play().catch(() => {});
            } else {
                activeVid.pause();
            }
        }

        if (bgVid && nextClip) {
            const bgStart = nextClip.reversed
                ? nextClip.trimEndFrame / DEFAULT_FPS
                : nextClip.trimStartFrame / DEFAULT_FPS;
            if (bgVid.readyState >= 1) { bgVid.currentTime = bgStart; bgVid.pause(); }
            else { bgVid.addEventListener('loadedmetadata', () => { bgVid.currentTime = bgStart; bgVid.pause(); }, { once: true }); }
        }
    }, [currentClipIndex, isPlaying, isGenerating, draftSequence, masterVolume, isMasterMuted]);

    // Audio sync: just play/pause based on player state. Avoid aggressive re-syncing to prevent stuttering.
    useEffect(() => {
        const audio = audioPlayerRef.current;
        if (!audio || !settings.useAudioGuide) return;
        const vol = isMasterMuted ? 0 : masterVolume;
        
        audio.volume = vol;
        if (isPlaying && !isGenerating) {
            if (audio.paused) {
                // Only sync if drastically off when resuming playback
                const totalDur = (draftSequence as any).totalDuration || 1;
                const expectedTime = (settings.audioTrimStart || 0) + (globalProgress * totalDur);
                if (Math.abs(audio.currentTime - expectedTime) > 0.5) {
                    audio.currentTime = expectedTime;
                }
                audio.play().catch(() => {});
            }
        } else {
            if (!audio.paused) audio.pause();
        }
    }, [isPlaying, isGenerating, settings, masterVolume, isMasterMuted]);

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
            id: uuidv4(), mediaLibraryId: c.mediaLibraryId, type: c.type, path: c.path,
            filename: c.filename, startFrame: c.startFrame, endFrame: c.endFrame,
            sourceDurationFrames: c.sourceDurationFrames, trimStartFrame: c.trimStartFrame,
            trimEndFrame: c.trimEndFrame, track: 1, speed: c.speed, volume: c.volume,
            reversed: c.reversed, isMuted: c.isMuted, isPinned: c.isPinned, origin: 'auto', locked: c.locked,
            transitionEnter: c.transitionEnter, transitionExit: c.transitionExit,
            transitionDurationFrames: c.transitionDurationFrames,
            sourceOrientation: c.sourceOrientation,
            zoomStart: c.zoomStart, zoomEnd: c.zoomEnd, zoomOrigin: c.zoomOrigin, zoomLevel: c.zoomLevel,
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
                track: 2,
                speed: 1,
                volume: 100,
                reversed: false,
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
                <div className="flex gap-2">
                    <button onClick={buildSequence} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/20 text-purple-300 font-bold text-xs hover:bg-purple-500/40">
                        <RefreshCw size={14} className={isGenerating ? "animate-spin" : ""} /> Flux All
                    </button>
                    <button onClick={handleSave} className="flex items-center gap-2 px-6 py-2 rounded-lg bg-primary text-white font-black uppercase text-xs hover:bg-primary/80">
                        <Film size={14} /> Keep Edit
                    </button>
                </div>
            </div>

            {/* Player — aspect-ratio driven by orientation filter */}
            <div className={clsx("flex-1 relative overflow-hidden",
                orientationFilter === 'vertical' ? 'max-w-[40%] mx-auto' : '',
                orientationFilter === 'square' ? 'max-w-[60%] mx-auto aspect-square' : '')}
                style={{ ...(orientationFilter === 'vertical' ? { aspectRatio: '9/16' } : {}) }}
                onClick={() => setIsPlaying(!isPlaying)}>
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
                            playsInline muted={clipA?.isMuted || isMasterMuted} />
                        <video ref={videoBRef} src={urlB}
                            className={clsx(`absolute inset-0 w-full h-full ${objectFit} pointer-events-none transition-none`, !isActA ? "z-20 opacity-100" : "z-0 opacity-0")}
                            style={{
                                transform: `scale(${currentZoom / 100}) ${!isActA ? transitionStyle.transform : ''}`,
                                transformOrigin: currentClip?.zoomOrigin || 'center',
                                opacity: !isActA ? transitionStyle.opacity : 0,
                                clipPath: !isActA && transitionStyle.clipPath ? transitionStyle.clipPath : undefined,
                            }}
                            playsInline muted={clipB?.isMuted || isMasterMuted} />
                    </>
                )}
            </div>

            {/* Controls */}
            {!isGenerating && (
                <div className={clsx("absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-6 pt-12 z-50 flex flex-col gap-4 transition-transform", isPlaying ? "translate-y-full group-hover:translate-y-0" : "translate-y-0")} onClick={e => e.stopPropagation()}>
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
