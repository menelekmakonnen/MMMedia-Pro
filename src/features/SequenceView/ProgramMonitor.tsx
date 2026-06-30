import React, { useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
    Play, Pause, Volume2, VolumeX, MonitorSmartphone, Maximize2, Ruler, Frame, Zap
} from 'lucide-react';
import clsx from 'clsx';
import { ProgramMonitorGuides } from './ProgramMonitorGuides';
import { useTimelineStore } from './timeline/useTimelineStore';
import { GridPlayer } from '../../components/GridPlayer';
import { GridClip, Clip } from '../../types';
import { formatTimecode } from '../../lib/time';
import { useProjectStore } from '../../store/projectStore';
import { resolveMotion, motionToCssStyle, MATCH } from '../../lib/premiere/effectControls';
import { maskToCss } from '../../lib/premiere/masks';

/** Map a Premiere blend-mode label to the nearest CSS mix-blend-mode for preview. */
function mapBlendMode(label: string): string | undefined {
    const m: Record<string, string> = {
        'Normal': 'normal', 'Multiply': 'multiply', 'Screen': 'screen', 'Overlay': 'overlay',
        'Darken': 'darken', 'Lighten': 'lighten', 'Color Dodge': 'color-dodge', 'Color Burn': 'color-burn',
        'Hard Light': 'hard-light', 'Soft Light': 'soft-light', 'Difference': 'difference',
        'Exclusion': 'exclusion', 'Hue': 'hue', 'Saturation': 'saturation', 'Color': 'color',
        'Luminosity': 'luminosity', 'Linear Dodge (Add)': 'plus-lighter',
    };
    return m[label];
}

interface ProgramMonitorProps {
    activeVisualClip: Clip | null;
    /** All visual clips at the current playhead across all tracks (ordered bottom-to-top) */
    activeVisualClips: Clip[];
    currentGlobalFrame: number;
    isPlaying: boolean;
    onPlayPause: () => void;
    fps: number;
    aspectRatio: string;
    clipOpacity: number;
    // Video refs + buffer state (double-buffered engine)
    videoARef: React.RefObject<HTMLVideoElement | null>;
    videoBRef: React.RefObject<HTMLVideoElement | null>;
    activeBuffer: 'A' | 'B';
    // Zoom state
    currentZoom: number;
    seqObjectFit: string;
    transitionStyle: { transform: string; opacity: number; zIndex: number };
    // Audio
    masterVolume: number;
    isMasterMuted: boolean;
    trackMutes: Record<number, boolean>;
    setMasterVolume: (vol: number) => void;
    setIsMasterMuted: (muted: boolean) => void;
    // Volume HUD
    showVolumeBar: boolean;
    setShowVolumeBar: (show: boolean) => void;
    volumeBarTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
    // Background audio
    bgAudioClips: Clip[];
    bgAudioRefs: React.MutableRefObject<Record<string, HTMLAudioElement | null>>;
    /** True when an exact FFmpeg proxy exists for the active clip (preview == export). */
    exactProxyAvailable?: boolean;
    /** Total sequence length in frames (for the seek bar). */
    maxFrame?: number;
    /** Seek the global playhead to a frame (program-monitor scrubber). */
    onSeek?: (frame: number) => void;
}

export const ProgramMonitor: React.FC<ProgramMonitorProps> = ({
    activeVisualClip,
    activeVisualClips,
    currentGlobalFrame,
    isPlaying,
    onPlayPause,
    fps,
    aspectRatio,
    clipOpacity,
    videoARef,
    videoBRef,
    activeBuffer,
    currentZoom,
    seqObjectFit,
    transitionStyle,
    masterVolume,
    isMasterMuted,
    trackMutes,
    setMasterVolume,
    setIsMasterMuted,
    showVolumeBar,
    setShowVolumeBar,
    volumeBarTimeoutRef,
    bgAudioClips,
    bgAudioRefs,
    exactProxyAvailable,
    maxFrame = 0,
    onSeek,
}) => {
    const isGrid = activeVisualClip?.type === 'grid';
    const isActA = activeBuffer === 'A';
    const showGuides = useTimelineStore((s) => s.showGuides);
    const showSafeMargins = useTimelineStore((s) => s.showSafeMargins);
    const globalFxMute = useTimelineStore((s) => s.globalFxMute);
    const inOutRange = useTimelineStore((s) => s.inOutRange);

    // ── Program-monitor seek bar (scrubber) ──
    const seekBarRef = useRef<HTMLDivElement>(null);
    const seekDragRef = useRef(false);
    const seekPct = maxFrame > 0 ? Math.max(0, Math.min(100, (currentGlobalFrame / maxFrame) * 100)) : 0;
    const seekFromClientX = useCallback((clientX: number) => {
        const r = seekBarRef.current?.getBoundingClientRect();
        if (!r || maxFrame <= 0) return;
        const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
        onSeek?.(Math.round(ratio * maxFrame));
    }, [maxFrame, onSeek]);
    const seqRes = useProjectStore((s) => s.settings.resolution);
    const seqW = seqRes?.width ?? 1920;
    const seqH = seqRes?.height ?? 1080;

    const clipTimecode = activeVisualClip
        ? formatTimecode(currentGlobalFrame - activeVisualClip.startFrame, fps)
        : '--:--:--:--';

    return (
        <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
            {/* Monitor Header */}
            <div className="h-6 flex items-center justify-between px-3 bg-[#0e0e1c]/80 border-b border-white/[0.04] flex-shrink-0 select-none">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                    <span className="text-[9px] uppercase tracking-[0.15em] text-white/35 font-semibold">
                        Program
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {exactProxyAvailable && (
                        <span
                            className="text-[8px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-500/15 px-1.5 py-0.5 rounded"
                            title="An exact FFmpeg render proxy exists for this clip — the preview matches the export."
                        >
                            Exact
                        </span>
                    )}
                    {activeVisualClip && (
                        <span className="text-[9px] font-mono text-white/25 truncate max-w-[160px]">
                            {activeVisualClip.filename}
                        </span>
                    )}
                    <span className="text-[9px] font-mono text-primary/50">{clipTimecode}</span>
                </div>
            </div>

            {/* Video Area */}
            <div
                className="flex-1 overflow-hidden relative flex items-center justify-center bg-[#050508] transition-opacity duration-200"
                style={{ opacity: clipOpacity }}
            >
                {/* Aspect Ratio Container */}
                <div
                    className="relative bg-black/80 overflow-clip flex items-center justify-center h-full"
                    style={{
                        aspectRatio: aspectRatio.replace(':', '/'),
                        maxHeight: '100%',
                        maxWidth: '100%',
                    }}
                    onClick={onPlayPause}
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
                    }}
                >
                    {/* Multi-track clip compositor */}
                    {activeVisualClips.length > 0 ? (
                        activeVisualClips.map((clip, idx) => {
                            const isTopClip = idx === activeVisualClips.length - 1;
                            const hasComposite = clip.compositeOverlay && clip.compositeScale !== undefined;

                            // Compositing transform
                            const scale = (clip.compositeScale ?? 100) / 100;
                            const x = clip.compositeX ?? 50; // percentage
                            const y = clip.compositeY ?? 50;
                            const opacity = (clip.compositeOpacity ?? 100) / 100;
                            const borderRadius = clip.compositeBorderRadius ?? 0;

                            // Calculate clip-local zoom
                            const clipLocalFrame = currentGlobalFrame - clip.startFrame;
                            const clipTotalFrames = Math.max(1, clip.endFrame - clip.startFrame);
                            const clipProgress = clipLocalFrame / clipTotalFrames;
                            const clipZoom = clip.zoomStart !== undefined && clip.zoomEnd !== undefined
                                ? clip.zoomStart + (clipProgress * (clip.zoomEnd - clip.zoomStart))
                                : (clip.zoomLevel || 100);

                            // Premiere Effect Controls — evaluate Motion/Opacity at this frame.
                            // When present it is the source of truth for the preview transform.
                            const ecMotion = clip.effectControls
                                ? resolveMotion(clip.effectControls, Math.max(0, clipLocalFrame), seqW, seqH)
                                : null;
                            const ecStyle = ecMotion ? motionToCssStyle(ecMotion, seqW, seqH) : null;
                            // Opacity-effect mask → clip-path / mask-image preview.
                            const ecMaskCss = clip.effectControls
                                ? maskToCss(clip.effectControls.video.find((c) => c.matchName === MATCH.OPACITY), seqW, seqH)
                                : null;
                            const ecMaskStyle = ecMaskCss ? { clipPath: ecMaskCss.clipPath, maskImage: ecMaskCss.maskImage, WebkitMaskImage: ecMaskCss.WebkitMaskImage } : undefined;
                            const ecMaskOpacity = ecMaskCss?.opacity ?? 1;

                            if (clip.type === 'grid') {
                                return (
                                    <div
                                        key={clip.id}
                                        className="absolute inset-0"
                                        style={hasComposite ? {
                                            width: `${scale * 100}%`,
                                            height: `${scale * 100}%`,
                                            left: `${x - (scale * 50)}%`,
                                            top: `${y - (scale * 50)}%`,
                                            position: 'absolute',
                                            opacity,
                                            borderRadius,
                                            overflow: 'hidden',
                                            zIndex: idx + 1,
                                            boxShadow: hasComposite ? '0 2px 12px rgba(0,0,0,0.6)' : undefined,
                                        } : { position: 'absolute', inset: 0, zIndex: idx + 1 }}
                                    >
                                        <GridPlayer
                                            grid={clip as GridClip}
                                            currentFrame={Math.floor(clipLocalFrame * clip.speed) + (clip.trimStartFrame || 0)}
                                            isPlaying={isPlaying}
                                            onFrameChange={() => {}}
                                        />
                                    </div>
                                );
                            }

                            if (clip.type === 'video') {
                                // For the topmost (or only) clip, use the double-buffered engine
                                if (isTopClip && !hasComposite) {
                                    return (
                                        <React.Fragment key={clip.id}>
                                            <video
                                                ref={videoARef}
                                                src={`file://${clip.path}`}
                                                className={clsx(
                                                    `absolute inset-0 w-full h-full ${seqObjectFit} transition-none`,
                                                    isActA ? 'z-20 opacity-100' : 'z-0 opacity-0'
                                                )}
                                                style={{
                                                    transform: ecStyle
                                                        ? `${ecStyle.transform} ${isActA ? transitionStyle.transform : ''}`
                                                        : `scale(${clipZoom / 100}) ${isActA ? transitionStyle.transform : ''}`,
                                                    transformOrigin: ecStyle ? ecStyle.transformOrigin : (clip.zoomOrigin || 'center'),
                                                    opacity: isActA ? transitionStyle.opacity * (ecStyle ? ecStyle.opacity : 1) * ecMaskOpacity : 0,
                                                    mixBlendMode: (ecMotion && ecMotion.blendMode !== 'Normal' ? mapBlendMode(ecMotion.blendMode) : undefined) as any,
                                                    ...(ecMaskStyle || {}),
                                                    zIndex: idx + 20,
                                                }}
                                                playsInline
                                                muted={isMasterMuted || (trackMutes[clip.track] ?? false)}
                                            />
                                            <video
                                                ref={videoBRef}
                                                src={`file://${clip.path}`}
                                                className={clsx(
                                                    `absolute inset-0 w-full h-full ${seqObjectFit} transition-none`,
                                                    !isActA ? 'z-20 opacity-100' : 'z-0 opacity-0'
                                                )}
                                                style={{
                                                    transform: ecStyle
                                                        ? `${ecStyle.transform} ${!isActA ? transitionStyle.transform : ''}`
                                                        : `scale(${clipZoom / 100}) ${!isActA ? transitionStyle.transform : ''}`,
                                                    transformOrigin: ecStyle ? ecStyle.transformOrigin : (clip.zoomOrigin || 'center'),
                                                    opacity: !isActA ? transitionStyle.opacity * (ecStyle ? ecStyle.opacity : 1) * ecMaskOpacity : 0,
                                                    mixBlendMode: (ecMotion && ecMotion.blendMode !== 'Normal' ? mapBlendMode(ecMotion.blendMode) : undefined) as any,
                                                    ...(ecMaskStyle || {}),
                                                    zIndex: idx + 20,
                                                }}
                                                playsInline
                                                muted={isMasterMuted || (trackMutes[clip.track] ?? false)}
                                            />
                                        </React.Fragment>
                                    );
                                }

                                // Composite clips (PiP, split screen, etc.)
                                return (
                                    <div
                                        key={clip.id}
                                        className="absolute"
                                        style={hasComposite ? {
                                            width: `${scale * 100}%`,
                                            height: `${scale * 100}%`,
                                            left: `${x - (scale * 50)}%`,
                                            top: `${y - (scale * 50)}%`,
                                            opacity,
                                            borderRadius,
                                            overflow: 'hidden',
                                            zIndex: idx + 10,
                                            boxShadow: '0 2px 12px rgba(0,0,0,0.6)',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                        } : {
                                            position: 'absolute',
                                            inset: 0,
                                            zIndex: idx + 1,
                                        }}
                                    >
                                        <video
                                            src={`file://${clip.path}`}
                                            className={`w-full h-full ${seqObjectFit}`}
                                            style={{
                                                transform: `scale(${clipZoom / 100})`,
                                                transformOrigin: clip.zoomOrigin || 'center',
                                            }}
                                            playsInline
                                            muted={isMasterMuted || (trackMutes[clip.track] ?? false)}
                                            autoPlay={isPlaying}
                                        />
                                    </div>
                                );
                            }

                            return null;
                        })
                    ) : (
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center">
                                <Play size={16} className="text-white/15 ml-0.5" />
                            </div>
                            <div className="text-white/15 text-[10px] tracking-wide">No clip at playhead</div>
                        </div>
                    )}

                    {/* Center play/pause indicator (subtle flash) */}
                    {/* Volume Overlay Bar */}
                    {showVolumeBar && (
                        <div
                            className="absolute top-3 right-3 z-30 flex flex-col items-center gap-1 bg-black/70 backdrop-blur-md rounded-lg px-2 py-2 border border-white/[0.08] transition-opacity duration-300"
                            style={{ opacity: showVolumeBar ? 1 : 0 }}
                        >
                            <div className="text-[8px] font-bold text-white/50 uppercase tracking-wider">Vol</div>
                            <div className="relative w-1.5 h-14 bg-white/10 rounded-full overflow-hidden">
                                <div
                                    className="absolute bottom-0 w-full rounded-full transition-all duration-150"
                                    style={{
                                        height: `${Math.round((isMasterMuted ? 0 : masterVolume) * 100)}%`,
                                        background: masterVolume > 0.7 ? '#ef4444' : masterVolume > 0.4 ? '#eab308' : '#22c55e',
                                    }}
                                />
                            </div>
                            <div className="text-[9px] font-mono text-white/60">
                                {Math.round((isMasterMuted ? 0 : masterVolume) * 100)}
                            </div>
                        </div>
                    )}

                    {/* Safe area center crosshair (subtle) */}
                    <div className="absolute inset-0 pointer-events-none z-10">
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10 -translate-x-1/2" />
                            <div className="absolute top-1/2 left-0 right-0 h-px bg-white/10 -translate-y-1/2" />
                        </div>
                    </div>

                    {/* Safe-margin overlay (Action safe 93% / Title safe 90%) */}
                    {showSafeMargins && (
                        <div className="absolute inset-0 pointer-events-none z-20">
                            <div
                                className="absolute border border-yellow-300/40"
                                style={{ left: '3.5%', top: '3.5%', right: '3.5%', bottom: '3.5%' }}
                            >
                                <span className="absolute -top-0.5 left-1 text-[8px] font-mono text-yellow-300/60 leading-none">action safe</span>
                            </div>
                            <div
                                className="absolute border border-cyan-300/40"
                                style={{ left: '5%', top: '5%', right: '5%', bottom: '5%' }}
                            >
                                <span className="absolute -top-0.5 left-1 text-[8px] font-mono text-cyan-300/60 leading-none">title safe</span>
                            </div>
                        </div>
                    )}

                    {/* Ruler guide overlay */}
                    <ProgramMonitorGuides containerWidth={0} containerHeight={0} />
                </div>

                {/* Background Audio Elements */}
                {bgAudioClips.map((clip) => (
                    <audio
                        key={clip.id}
                        ref={(el) => { bgAudioRefs.current[clip.id] = el; }}
                        src={
                            clip.path?.startsWith('blob:')
                                ? clip.path
                                : clip.path?.startsWith('file://')
                                    ? clip.path
                                    : `file://${clip.path}`
                        }
                        preload="auto"
                        className="hidden"
                    />
                ))}
            </div>

            {/* Seek bar (program-monitor scrubber) */}
            <div className="h-5 flex items-center px-3 bg-[#0e0e1c]/80 border-t border-white/[0.04] flex-shrink-0 select-none">
                <div
                    ref={seekBarRef}
                    className="relative flex-1 h-1.5 bg-white/[0.08] rounded-full cursor-pointer group"
                    onPointerDown={(e) => {
                        e.preventDefault();
                        seekDragRef.current = true;
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        seekFromClientX(e.clientX);
                    }}
                    onPointerMove={(e) => { if (seekDragRef.current) seekFromClientX(e.clientX); }}
                    onPointerUp={(e) => { seekDragRef.current = false; try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ } }}
                >
                    {/* progress fill */}
                    <div className="absolute left-0 top-0 bottom-0 bg-primary/40 rounded-full pointer-events-none" style={{ width: `${seekPct}%` }} />
                    {/* in/out shading */}
                    {inOutRange.inFrame !== null && maxFrame > 0 && (
                        <div className="absolute top-0 bottom-0 bg-sky-400/15 pointer-events-none" style={{ left: `${(inOutRange.inFrame / maxFrame) * 100}%`, width: `${(((inOutRange.outFrame ?? maxFrame) - inOutRange.inFrame) / maxFrame) * 100}%` }} />
                    )}
                    {/* playhead handle */}
                    <div
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-primary rounded-full shadow ring-2 ring-[#0e0e1c] pointer-events-none group-hover:scale-110 transition-transform"
                        style={{ left: `${seekPct}%` }}
                    />
                </div>
            </div>

            {/* Monitor Footer — mini transport bar */}
            <div className="h-7 flex items-center justify-between px-3 bg-[#0e0e1c]/80 border-t border-white/[0.04] flex-shrink-0 select-none">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsMasterMuted(!isMasterMuted)}
                        className="text-white/35 hover:text-white/70 transition-colors"
                    >
                        {isMasterMuted || masterVolume === 0 ? <VolumeX size={12} /> : <Volume2 size={12} />}
                    </button>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={isMasterMuted ? 0 : masterVolume}
                        title="Master Volume"
                        onChange={(e) => {
                            setMasterVolume(parseFloat(e.target.value));
                            setIsMasterMuted(false);
                        }}
                        className="w-14 h-0.5 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white/60"
                    />
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => useTimelineStore.getState().toggleGuides()}
                        className={clsx('p-1.5 rounded transition-colors', showGuides ? 'bg-indigo-500/30 text-indigo-300' : 'text-white/40 hover:text-white/60')}
                        title="Toggle Ruler Guides"
                    >
                        <Ruler size={14} />
                    </button>
                    <button
                        onClick={() => useTimelineStore.getState().toggleSafeMargins()}
                        className={clsx('p-1.5 rounded transition-colors', showSafeMargins ? 'bg-yellow-500/30 text-yellow-300' : 'text-white/40 hover:text-white/60')}
                        title="Toggle Safe Margins (Action / Title safe)"
                    >
                        <Frame size={14} />
                    </button>
                    <button
                        onClick={() => useTimelineStore.getState().toggleGlobalFxMute()}
                        className={clsx('p-1.5 rounded transition-colors', globalFxMute ? 'bg-orange-500/30 text-orange-300' : 'text-white/40 hover:text-white/60')}
                        title="Global FX Mute — bypass clip effects during playback"
                    >
                        <Zap size={14} />
                    </button>
                    <span className="text-[9px] font-mono text-white/20">FIT</span>
                    <Maximize2 size={10} className="text-white/20" />
                </div>
            </div>
        </div>
    );
};
