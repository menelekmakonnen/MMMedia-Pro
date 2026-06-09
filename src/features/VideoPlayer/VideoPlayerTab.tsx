import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
    Maximize2, Minimize2, Repeat, ChevronLeft, ChevronRight,
    Film
} from 'lucide-react';
import { useClipStore, Clip } from '../../store/clipStore';
import { useProjectStore } from '../../store/projectStore';
import { useUserStore } from '../../store/userStore';
import { useProxyStore } from '../../store/proxyStore';
import { DEFAULT_FPS } from '../../lib/time';
import clsx from 'clsx';

/**
 * VideoPlayerTab — Premium cinematic playback page.
 * 
 * Pool of 3 <video> elements for seamless source-aware transitions.
 */
export const VideoPlayerTab: React.FC = () => {
    const { clips, trackMutes, trackVolumes } = useClipStore();
    const { settings } = useProjectStore();
    const { masterVolume, isMasterMuted, setMasterVolume, setIsMasterMuted } = useUserStore();

    const [currentFrame, setCurrentFrame] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [_isSeeking, setIsSeeking] = useState(false);
    const [loopMode, setLoopMode] = useState(false);
    const [hoverTime, setHoverTime] = useState<number | null>(null);
    const [hoverX, setHoverX] = useState(0);

    const videoPoolRef = useRef<(HTMLVideoElement | null)[]>([null, null, null]);
    const activePoolIdx = useRef(0);
    const rafRef = useRef<number>(0);
    const lastClipIdx = useRef(-1);
    const lastRafTimeRef = useRef(0);
    const bgAudioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
    const _bgAudioRefsCleanup = useRef<Set<string>>(new Set());
    const poolSources = useRef<string[]>(['', '', '']);
    const containerRef = useRef<HTMLDivElement>(null);
    const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // Proxy store
    const { proxies, requestProxy, setProxyReady, setProxyFailed, setProxyRendering, invalidateProxy, getProxy } = useProxyStore();
    const proxyHashRef = useRef<string>('');

    const fps = settings.fps || DEFAULT_FPS;

    const videoClips = useMemo(() =>
        clips.filter(c => c.type !== 'audio' && !c.disabled).sort((a, b) => a.startFrame - b.startFrame),
        [clips]
    );

    const bgAudioClips = useMemo(() =>
        clips.filter(c => c.type === 'audio' && (c.track || 0) >= 101),
        [clips]
    );

    const maxFrame = useMemo(() => {
        if (videoClips.length === 0) return 0;
        return Math.max(...videoClips.map(c => c.endFrame));
    }, [videoClips]);

    const totalDuration = maxFrame / fps;

    const activeClipIdx = useMemo(() => {
        for (let i = videoClips.length - 1; i >= 0; i--) {
            const c = videoClips[i];
            if (currentFrame >= c.startFrame && currentFrame < c.endFrame) return i;
        }
        return -1;
    }, [videoClips, currentFrame]);

    const activeClip = activeClipIdx >= 0 ? videoClips[activeClipIdx] : null;

    const getActiveVid = useCallback(() => videoPoolRef.current[activePoolIdx.current], []);

    const setPoolSource = useCallback((poolIdx: number, path: string) => {
        const vid = videoPoolRef.current[poolIdx];
        if (!vid || poolSources.current[poolIdx] === path) return;
        const src = path.startsWith('file://') ? path : `file://${path}`;
        vid.src = src;
        vid.load();
        poolSources.current[poolIdx] = path;
    }, []);

    const getIdlePoolIdx = useCallback((preferSource?: string) => {
        if (preferSource) {
            for (let i = 0; i < 3; i++) {
                if (i !== activePoolIdx.current && poolSources.current[i] === preferSource) return i;
            }
        }
        for (let i = 0; i < 3; i++) {
            if (i !== activePoolIdx.current) return i;
        }
        return (activePoolIdx.current + 1) % 3;
    }, []);

    // ── Preview Proxy Engine ─────────────────────────────────────────────
    // Compute a hash of the active clip's visual settings to drive proxy generation
    const computeClipHash = useCallback((clip: Clip): string => {
        const data = JSON.stringify({
            path: clip.path,
            trimStartFrame: clip.trimStartFrame,
            trimEndFrame: clip.trimEndFrame,
            startFrame: clip.startFrame,
            endFrame: clip.endFrame,
            speed: clip.speed,
            reversed: clip.reversed,
            rotation: clip.rotation,
            flipH: clip.flipH,
            flipV: clip.flipV,
            zoomStart: clip.zoomStart,
            zoomEnd: clip.zoomEnd,
            zoomLevel: clip.zoomLevel,
            zoomOrigin: clip.zoomOrigin,
            effectIds: clip.effectIds,
            parametricEffects: clip.parametricEffects,
            colorGrading: clip.colorGrading,
            textOverlays: clip.textOverlays,
            shake: clip.shake,
            filmGrain: clip.filmGrain,
            vignette: clip.vignette,
            chromaticAberration: clip.chromaticAberration,
            sharpen: clip.sharpen,
            blurAmount: clip.blurAmount,
            chromaKey: clip.chromaKey,
            letterbox: clip.letterbox,
            volume: clip.volume,
            isMuted: clip.isMuted,
        });
        // Simple string hash for the browser side
        let h = 0;
        for (let i = 0; i < data.length; i++) {
            h = ((h << 5) - h + data.charCodeAt(i)) | 0;
        }
        return Math.abs(h).toString(16).padStart(8, '0');
    }, []);

    // Check if clip has any effects that require a proxy
    const clipNeedsProxy = useCallback((clip: Clip): boolean => {
        return !!(
            clip.reversed ||
            (clip.effectIds && clip.effectIds.length > 0) ||
            (clip.parametricEffects && clip.parametricEffects.length > 0) ||
            clip.colorGrading ||
            (clip.textOverlays && clip.textOverlays.length > 0) ||
            clip.shake ||
            (clip.filmGrain && clip.filmGrain > 0) ||
            (clip.vignette && clip.vignette > 0) ||
            (clip.chromaticAberration && clip.chromaticAberration > 0) ||
            (clip.sharpen && clip.sharpen > 0) ||
            (clip.blurAmount && clip.blurAmount > 0) ||
            clip.chromaKey?.enabled ||
            clip.letterbox ||
            (clip.zoomStart && clip.zoomStart !== 100) ||
            (clip.zoomEnd && clip.zoomEnd !== 100) ||
            (clip.zoomLevel && clip.zoomLevel !== 100)
        );
    }, []);

    // Trigger proxy generation when the active clip changes or its settings change
    useEffect(() => {
        if (!activeClip || activeClip.type !== 'video') return;
        if (!clipNeedsProxy(activeClip)) return;
        if (!window.ipcRenderer?.generatePreviewProxy) return;

        const hash = computeClipHash(activeClip);
        const existing = getProxy(activeClip.id);

        // If proxy exists with same hash, we're good
        if (existing && existing.hash === hash && (existing.status === 'ready' || existing.status === 'rendering')) {
            return;
        }

        // If hash changed, invalidate old proxy
        if (existing && existing.hash !== hash) {
            invalidateProxy(activeClip.id);
        }

        // Request new proxy
        requestProxy(activeClip.id, hash);
        setProxyRendering(activeClip.id);
        proxyHashRef.current = hash;

        const proxySettings = {
            fps: settings.fps || DEFAULT_FPS,
            outputWidth: settings.resolution?.width || 1080,
            outputHeight: settings.resolution?.height || 1920,
        };

        window.ipcRenderer.generatePreviewProxy({
            clip: activeClip,
            settings: proxySettings,
        }).then((result) => {
            if (result.success && result.proxyPath) {
                setProxyReady(activeClip.id, result.proxyPath);
                console.log('[ProxyEngine] Proxy ready for', activeClip.filename);
            } else {
                setProxyFailed(activeClip.id);
                console.warn('[ProxyEngine] Proxy failed for', activeClip.filename, result.error);
            }
        }).catch((err) => {
            setProxyFailed(activeClip.id);
            console.error('[ProxyEngine] IPC error:', err);
        });
    }, [activeClip, settings, computeClipHash, clipNeedsProxy, getProxy, requestProxy, setProxyRendering, setProxyReady, setProxyFailed, invalidateProxy]);

    // Core sync: when clip changes, either seek or swap
    useEffect(() => {
        if (activeClipIdx < 0 || !activeClip || activeClip.type !== 'video') return;
        if (lastClipIdx.current === activeClipIdx) return;

        const prevIdx = lastClipIdx.current;
        lastClipIdx.current = activeClipIdx;

        const prevClip = prevIdx >= 0 && prevIdx < videoClips.length ? videoClips[prevIdx] : null;

        // Check if proxy is available for this clip
        const proxy = proxies[activeClip.id];
        const useProxyPath = proxy?.status === 'ready' && proxy.proxyPath;
        const sourcePath = useProxyPath ? proxy.proxyPath : activeClip.path;
        const sameSource = prevClip && prevClip.path === activeClip.path && !useProxyPath;

        if (sameSource) {
            const vid = getActiveVid();
            if (vid) {
                // When using proxy, start from beginning (proxy is already trimmed)
                const targetSec = useProxyPath ? 0 : (activeClip.trimStartFrame || 0) / fps;
                vid.currentTime = targetSec;
                // Proxy is already speed-adjusted
                vid.playbackRate = useProxyPath ? 1 : Math.max(0.0625, Math.min(activeClip.speed || 1, 16));
                if (isPlaying && vid.paused) vid.play().catch(() => {});
            }
        } else {
            const newIdx = getIdlePoolIdx(sourcePath);
            const oldIdx = activePoolIdx.current;
            const oldVid = videoPoolRef.current[oldIdx];
            if (oldVid) oldVid.pause();
            setPoolSource(newIdx, sourcePath);
            const newVid = videoPoolRef.current[newIdx];
            if (newVid) {
                const targetSec = useProxyPath ? 0 : (activeClip.trimStartFrame || 0) / fps;
                newVid.currentTime = targetSec;
                newVid.playbackRate = useProxyPath ? 1 : Math.max(0.0625, Math.min(activeClip.speed || 1, 16));
                if (isPlaying) newVid.play().catch(() => {});
            }
            activePoolIdx.current = newIdx;
        }

        const nextDiffIdx = findNextDifferentSource(activeClipIdx, videoClips);
        if (nextDiffIdx >= 0) {
            const nextClip = videoClips[nextDiffIdx];
            const preloadIdx = getIdlePoolIdx(nextClip.path);
            if (preloadIdx !== activePoolIdx.current) {
                setPoolSource(preloadIdx, nextClip.path);
                const vid = videoPoolRef.current[preloadIdx];
                if (vid) vid.currentTime = (nextClip.trimStartFrame || 0) / fps;
            }
        }
    }, [activeClipIdx, activeClip, videoClips, isPlaying, fps, getActiveVid, getIdlePoolIdx, setPoolSource]);

    // Volume sync
    useEffect(() => {
        const vid = getActiveVid();
        if (!vid) return;
        const audio1Muted = trackMutes[2] ?? false;
        const audio1Vol = (trackVolumes[2] ?? 100) / 100;
        vid.volume = (isMasterMuted || audio1Muted) ? 0 : masterVolume * audio1Vol;
    }, [isMasterMuted, masterVolume, trackMutes, trackVolumes, getActiveVid, activeClipIdx]);

    // Background music sync — per-frame volume, position, play/pause
    // Audio elements are rendered in JSX below (DOM-attached, like <video> elements)
    const bgAudioDebugRef = useRef(false);
    useEffect(() => {
        // Log diagnostic info once when clips change
        if (bgAudioClips.length > 0 && !bgAudioDebugRef.current) {
            bgAudioDebugRef.current = true;
            console.log('[VideoPlayer] ═══ A2 AUDIO DEBUG ═══');
            console.log('[VideoPlayer] bgAudioClips count:', bgAudioClips.length);
            bgAudioClips.forEach((clip, i) => {
                console.log(`[VideoPlayer] Clip[${i}]:`, {
                    id: clip.id,
                    path: clip.path,
                    type: clip.type,
                    track: clip.track,
                    startFrame: clip.startFrame,
                    endFrame: clip.endFrame,
                    trimStartFrame: clip.trimStartFrame,
                    trimEndFrame: clip.trimEndFrame,
                    volume: clip.volume,
                    isMuted: clip.isMuted,
                });
                const audio = bgAudioRefs.current[clip.id];
                if (audio) {
                    console.log(`[VideoPlayer] Audio element[${i}]:`, {
                        src: audio.src,
                        readyState: audio.readyState,
                        networkState: audio.networkState,
                        error: audio.error,
                        paused: audio.paused,
                        duration: audio.duration,
                    });
                } else {
                    console.log(`[VideoPlayer] Audio element[${i}]: NOT in ref yet`);
                }
            });
            console.log('[VideoPlayer] trackMutes:', trackMutes);
            console.log('[VideoPlayer] isMasterMuted:', isMasterMuted);
            console.log('[VideoPlayer] maxFrame:', maxFrame);
        }

        bgAudioClips.forEach(clip => {
            const audio = bgAudioRefs.current[clip.id];
            if (!audio) return;

            const trackId = clip.track || 101;
            const trackMuted = trackMutes[trackId] ?? false;

            // Volume — master × track slider × clip volume
            const trackVol = (trackVolumes[trackId] ?? 100) / 100;
            const clipVol = ((clip.volume ?? 100) / 100);
            audio.volume = (isMasterMuted || trackMuted) ? 0 : masterVolume * trackVol * clipVol;

            // Sync position — account for clip's startFrame offset on the timeline
            const trimStartSec = (clip.trimStartFrame || 0) / fps;
            const clipStartFrame = clip.startFrame || 0;
            const clipEndFrame = clip.endFrame || 0;

            if (isPlaying && !trackMuted && currentFrame >= clipStartFrame && currentFrame < clipEndFrame) {
                const elapsedFrames = currentFrame - clipStartFrame;
                const expectedSec = trimStartSec + (elapsedFrames / fps);
                if (Math.abs(audio.currentTime - expectedSec) > 0.3) audio.currentTime = expectedSec;
                if (audio.paused && audio.readyState >= 2) {
                    audio.play().catch(e => console.warn(`[VideoPlayer] A2 play FAILED:`, e));
                } else if (audio.paused && audio.readyState < 2) {
                    // Log why we're not playing — audio hasn't loaded
                    if (Math.floor(currentFrame) % 30 === 0) {
                        console.warn(`[VideoPlayer] A2 audio NOT READY: readyState=${audio.readyState}, networkState=${audio.networkState}, error=`, audio.error, 'src=', audio.src);
                    }
                }
            } else {
                if (!audio.paused) audio.pause();
            }
        });
    }, [bgAudioClips, isPlaying, currentFrame, isMasterMuted, masterVolume, trackVolumes, trackMutes, fps, maxFrame]);

    // RAF playback loop
    useEffect(() => {
        if (!isPlaying) {
            cancelAnimationFrame(rafRef.current);
            return;
        }
        const loop = (timestamp: number) => {
            if (!lastRafTimeRef.current) lastRafTimeRef.current = timestamp;
            const delta = timestamp - lastRafTimeRef.current;
            lastRafTimeRef.current = timestamp;
            const framesToAdvance = (delta / 1000) * fps;
            setCurrentFrame(prev => {
                const next = prev + framesToAdvance;
                if (next >= maxFrame) {
                    if (loopMode) return 0;
                    setIsPlaying(false);
                    return maxFrame;
                }
                return next;
            });
            rafRef.current = requestAnimationFrame(loop);
        };
        lastRafTimeRef.current = 0;
        rafRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(rafRef.current);
    }, [isPlaying, fps, maxFrame, loopMode]);

    useEffect(() => {
        if (!isPlaying) {
            videoPoolRef.current.forEach(v => v?.pause());
            // Also pause all background audio elements (DOM-rendered)
            Object.values(bgAudioRefs.current).forEach(a => { if (a && !a.paused) a.pause(); });
        }
    }, [isPlaying]);

    // Auto-hide controls
    const resetControlsTimer = useCallback(() => {
        setShowControls(true);
        clearTimeout(controlsTimerRef.current);
        if (isPlaying) {
            controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
        }
    }, [isPlaying]);

    useEffect(() => { resetControlsTimer(); }, [isPlaying, resetControlsTimer]);

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement) return;
            switch (e.key) {
                case ' ': e.preventDefault(); togglePlay(); break;
                case 'ArrowLeft': e.preventDefault(); seekTo(currentFrame - fps * 5); break;
                case 'ArrowRight': e.preventDefault(); seekTo(currentFrame + fps * 5); break;
                case 'ArrowUp': e.preventDefault(); setMasterVolume(Math.min(1, masterVolume + 0.05)); break;
                case 'ArrowDown': e.preventDefault(); setMasterVolume(Math.max(0, masterVolume - 0.05)); break;
                case 'm': case 'M': setIsMasterMuted(!isMasterMuted); break;
                case 'l': case 'L': setLoopMode(p => !p); break;
                case 'f': case 'F': toggleFullscreen(); break;
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [currentFrame, fps, masterVolume, isMasterMuted]);

    const togglePlay = () => {
        if (currentFrame >= maxFrame) setCurrentFrame(0);
        setIsPlaying(p => !p);
    };

    const seekTo = (frame: number) => {
        setCurrentFrame(Math.max(0, Math.min(frame, maxFrame)));
        lastClipIdx.current = -1;
    };

    const toggleFullscreen = () => {
        if (!containerRef.current) return;
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
        } else {
            document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
        }
    };

    const formatTime = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const currentSec = currentFrame / fps;
    const progress = maxFrame > 0 ? (currentFrame / maxFrame) * 100 : 0;
    const volumePct = Math.round(masterVolume * 100);

    if (videoClips.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
                <div className="text-center space-y-4">
                    <div className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center" style={{ background: 'var(--color-surface)' }}>
                        <Film size={36} style={{ color: 'var(--color-primary)', opacity: 0.3 }} />
                    </div>
                    <div>
                        <p className="text-white/30 text-sm font-semibold">No clips in timeline</p>
                        <p className="text-white/15 text-xs mt-1">Generate a trailer or add clips to preview.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef}
            className="w-full h-full flex flex-col select-none"
            style={{ background: '#0a0a14' }}
            onMouseMove={resetControlsTimer}
            onClick={(e) => {
                if ((e.target as HTMLElement).closest('.vp-controls')) return;
                togglePlay();
            }}
        >
            {/* ── Video Display ── */}
            <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
                {[0, 1, 2].map(i => (
                    <video
                        key={i}
                        ref={el => { videoPoolRef.current[i] = el; }}
                        className={clsx(
                            "absolute inset-0 w-full h-full object-contain",
                            activePoolIdx.current === i ? "opacity-100 z-10" : "opacity-0 z-0"
                        )}
                        style={{ transition: 'opacity 60ms ease' }}
                        playsInline muted={false} preload="auto" crossOrigin="anonymous"
                    />
                ))}
                {/* ── A2+ Background Audio (DOM-attached, same security context as <video>) ── */}
                {bgAudioClips.map(clip => (
                    <audio
                        key={clip.id}
                        ref={el => { bgAudioRefs.current[clip.id] = el; }}
                        src={clip.path?.startsWith('blob:') ? clip.path : clip.path?.startsWith('file://') ? clip.path : `file://${clip.path}`}
                        preload="auto"
                        className="hidden"
                    />
                ))}

                {/* ── Top gradient + clip info ── */}
                <div className={clsx(
                    "absolute top-0 inset-x-0 h-24 z-20 pointer-events-none transition-opacity duration-500",
                    showControls ? 'opacity-100' : 'opacity-0'
                )} style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)' }}>
                    {activeClip && (
                        <div className="flex items-center gap-2 px-4 pt-3">
                            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: isPlaying ? '#22c55e' : 'var(--color-primary)' }} />
                            <span className="text-[10px] font-medium text-white/60 truncate max-w-[300px]">{activeClip.filename}</span>
                            {activeClip.speed && activeClip.speed !== 1 && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono text-white/40" style={{ background: 'var(--color-surface)' }}>
                                    {activeClip.speed}x
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Center play button (when paused) ── */}
                {!isPlaying && showControls && (
                    <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                        <div className="w-16 h-16 rounded-full flex items-center justify-center backdrop-blur-xl"
                            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <Play size={28} className="text-white/80 ml-1" />
                        </div>
                    </div>
                )}

                {/* ── Bottom controls overlay ── */}
                <div className={clsx(
                    "vp-controls absolute bottom-0 inset-x-0 z-30 transition-all duration-500",
                    showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                )} onClick={e => e.stopPropagation()}
                    style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 70%, transparent 100%)' }}>
                    <div className="px-4 pb-3 pt-8 space-y-2">

                        {/* ── Progress bar ── */}
                        <div className="group relative"
                            onMouseMove={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                                setHoverTime(pct * totalDuration);
                                setHoverX(e.clientX - rect.left);
                            }}
                            onMouseLeave={() => setHoverTime(null)}
                        >
                            {/* Hover time tooltip */}
                            {hoverTime !== null && (
                                <div className="absolute -top-8 px-2 py-0.5 rounded text-[10px] font-mono text-white/90 pointer-events-none"
                                    style={{ left: hoverX, transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.9)' }}>
                                    {formatTime(hoverTime)}
                                </div>
                            )}

                            {/* Clip blocks */}
                            <div className="relative h-1.5 group-hover:h-3 rounded-full overflow-hidden cursor-pointer transition-all duration-200"
                                style={{ background: 'rgba(255,255,255,0.08)' }}
                                onMouseDown={(e) => {
                                    setIsSeeking(true);
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const pct = (e.clientX - rect.left) / rect.width;
                                    seekTo(pct * maxFrame);
                                    const onMove = (ev: MouseEvent) => {
                                        const p = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
                                        seekTo(p * maxFrame);
                                    };
                                    const onUp = () => { setIsSeeking(false); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                                    window.addEventListener('mousemove', onMove);
                                    window.addEventListener('mouseup', onUp);
                                }}
                            >
                                {/* Clip blocks visualization */}
                                {videoClips.map((clip) => {
                                    const left = (clip.startFrame / maxFrame) * 100;
                                    const width = ((clip.endFrame - clip.startFrame) / maxFrame) * 100;
                                    const isActive = activeClip?.id === clip.id;
                                    return (
                                        <div key={clip.id}
                                            className="absolute top-0 bottom-0 transition-colors duration-150"
                                            style={{
                                                left: `${left}%`, width: `${Math.max(width, 0.15)}%`,
                                                background: isActive ? 'var(--color-primary)' : 'rgba(255,255,255,0.12)',
                                                opacity: isActive ? 0.6 : 0.4,
                                            }}
                                        />
                                    );
                                })}

                                {/* Progress fill */}
                                <div className="absolute top-0 bottom-0 left-0 rounded-full"
                                    style={{ width: `${progress}%`, background: `var(--color-primary)`, opacity: 0.8 }} />

                                {/* Playhead dot */}
                                <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-lg"
                                    style={{
                                        left: `${progress}%`, transform: 'translate(-50%, -50%)',
                                        background: 'var(--color-primary)',
                                        boxShadow: '0 0 8px var(--color-primary)',
                                    }} />
                            </div>
                        </div>

                        {/* ── Transport Row ── */}
                        <div className="flex items-center justify-between gap-3">
                            {/* Left: time + clip info */}
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="text-xs font-mono text-white/80 tabular-nums whitespace-nowrap">
                                    {formatTime(currentSec)}
                                    <span className="text-white/25 mx-1">/</span>
                                    <span className="text-white/40">{formatTime(totalDuration)}</span>
                                </span>
                                {activeClip && (
                                    <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-white/30">
                                        <Film size={10} />
                                        <span>{activeClipIdx + 1}/{videoClips.length}</span>
                                    </div>
                                )}
                            </div>

                            {/* Center: transport */}
                            <div className="flex items-center gap-1">
                                <CtrlBtn icon={<SkipBack size={14} />} onClick={() => seekTo(0)} title="Start (Home)" />
                                <CtrlBtn icon={<ChevronLeft size={14} />} onClick={() => seekTo(currentFrame - fps * 5)} title="-5s (←)" />
                                <button onClick={togglePlay} title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                                    className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105"
                                    style={{
                                        background: 'var(--color-primary)',
                                        boxShadow: '0 0 20px rgba(74,158,224,0.3)',
                                    }}>
                                    {isPlaying ? <Pause size={18} className="text-white" /> : <Play size={18} className="text-white ml-0.5" />}
                                </button>
                                <CtrlBtn icon={<ChevronRight size={14} />} onClick={() => seekTo(currentFrame + fps * 5)} title="+5s (→)" />
                                <CtrlBtn icon={<SkipForward size={14} />} onClick={() => seekTo(maxFrame)} title="End" />
                            </div>

                            {/* Right: volume, loop, fullscreen */}
                            <div className="flex items-center gap-1.5">
                                {/* Volume cluster */}
                                <div className="group/vol flex items-center gap-1">
                                    <CtrlBtn
                                        icon={isMasterMuted || masterVolume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                                        onClick={() => setIsMasterMuted(!isMasterMuted)}
                                        title="Mute (M)"
                                        active={isMasterMuted}
                                    />
                                    <div className="w-0 group-hover/vol:w-20 overflow-hidden transition-all duration-300">
                                        <input type="range" min={0} max={1} step={0.01} value={masterVolume}
                                            onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                                            className="w-full h-1 rounded-full appearance-none cursor-pointer"
                                            style={{ accentColor: 'var(--color-primary)', background: 'rgba(255,255,255,0.15)' }}
                                        />
                                    </div>
                                    <span className="text-[9px] font-mono text-white/30 w-6 text-center opacity-0 group-hover/vol:opacity-100 transition-opacity">{volumePct}%</span>
                                </div>

                                <div className="w-px h-4 bg-white/10 mx-1" />

                                <CtrlBtn icon={<Repeat size={13} />} onClick={() => setLoopMode(p => !p)} title="Loop (L)" active={loopMode} />
                                <CtrlBtn
                                    icon={isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                                    onClick={toggleFullscreen}
                                    title="Fullscreen (F)"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

/** Small control button */
const CtrlBtn: React.FC<{ icon: React.ReactNode; onClick: () => void; title?: string; active?: boolean }> = ({ icon, onClick, title, active }) => (
    <button onClick={onClick} title={title}
        className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 hover:scale-110"
        style={{
            color: active ? 'var(--color-primary)' : 'rgba(255,255,255,0.55)',
            background: active ? 'rgba(74,158,224,0.12)' : 'transparent',
        }}
        onMouseEnter={e => { (e.target as HTMLElement).style.color = active ? 'var(--color-primary)' : 'rgba(255,255,255,0.9)'; }}
        onMouseLeave={e => { (e.target as HTMLElement).style.color = active ? 'var(--color-primary)' : 'rgba(255,255,255,0.55)'; }}
    >
        {icon}
    </button>
);

function findNextDifferentSource(currentIdx: number, clips: Clip[]): number {
    if (currentIdx < 0 || currentIdx >= clips.length) return -1;
    const currentPath = clips[currentIdx].path;
    for (let i = currentIdx + 1; i < clips.length; i++) {
        if (clips[i].path !== currentPath) return i;
    }
    return -1;
}
