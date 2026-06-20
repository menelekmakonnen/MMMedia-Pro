import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Clip, useClipStore } from '../../store/clipStore';
import { useMediaStore, MediaFile } from '../../store/mediaStore';
import { Wand2, FileVideo, FileAudio, Image as ImageIcon, X, RotateCw, Scissors, RotateCcw, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import clsx from 'clsx';

interface MediaDetailsPanelProps {
    clip: Clip | null;
    mediaFile?: MediaFile | null; // The underlying MediaFile with trim data
    onClose: () => void;
    onAdd?: () => void;
    onRotate?: () => void;
    hasPendingRotation?: boolean;
    onConfirmRotation?: () => void;
    onCancelRotation?: () => void;
}

/* ── Timecode Formatter ──────────────────────────────────────────── */
const formatTime = (seconds: number): string => {
    if (!seconds || seconds < 0) return '0:00.0';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
};

/* ── Dual-Handle Trim Slider ─────────────────────────────────────── */
const TrimSlider: React.FC<{
    duration: number;
    trimIn: number;
    trimOut: number;
    currentTime: number;
    onTrimChange: (trimIn: number, trimOut: number) => void;
    onSeek: (time: number) => void;
}> = ({ duration, trimIn, trimOut, currentTime, onTrimChange, onSeek }) => {
    const trackRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState<'in' | 'out' | 'playhead' | null>(null);

    const getTimeFromX = useCallback((clientX: number): number => {
        if (!trackRef.current) return 0;
        const rect = trackRef.current.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        return ratio * duration;
    }, [duration]);

    const handlePointerDown = useCallback((e: React.PointerEvent, handle: 'in' | 'out' | 'playhead') => {
        e.preventDefault();
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(handle);
    }, []);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragging) return;
        const time = getTimeFromX(e.clientX);
        if (dragging === 'in') {
            const clamped = Math.max(0, Math.min(time, trimOut - 0.1));
            onTrimChange(clamped, trimOut);
            onSeek(clamped);
        } else if (dragging === 'out') {
            const clamped = Math.min(duration, Math.max(time, trimIn + 0.1));
            onTrimChange(trimIn, clamped);
            onSeek(clamped);
        } else if (dragging === 'playhead') {
            onSeek(Math.max(0, Math.min(duration, time)));
        }
    }, [dragging, duration, trimIn, trimOut, getTimeFromX, onTrimChange, onSeek]);

    const handlePointerUp = useCallback(() => {
        setDragging(null);
    }, []);

    const handleTrackClick = useCallback((e: React.MouseEvent) => {
        if (dragging) return;
        const time = getTimeFromX(e.clientX);
        onSeek(time);
    }, [dragging, getTimeFromX, onSeek]);

    const inPct = duration > 0 ? (trimIn / duration) * 100 : 0;
    const outPct = duration > 0 ? (trimOut / duration) * 100 : 100;
    const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div className="relative select-none touch-none">
            {/* Track */}
            <div
                ref={trackRef}
                className="relative h-10 rounded-lg overflow-hidden cursor-pointer bg-white/[0.04] border border-white/10"
                onClick={handleTrackClick}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
            >
                {/* Excluded region left (dimmed) */}
                <div
                    className="absolute top-0 bottom-0 left-0 bg-black/60 z-[1]"
                    style={{ width: `${inPct}%` }}
                >
                    {/* Diagonal stripes for excluded area */}
                    <div className="absolute inset-0 opacity-30" style={{
                        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.05) 3px, rgba(255,255,255,0.05) 6px)',
                    }} />
                </div>

                {/* Active region (highlighted) */}
                <div
                    className="absolute top-0 bottom-0 z-[1]"
                    style={{
                        left: `${inPct}%`,
                        width: `${outPct - inPct}%`,
                        background: 'linear-gradient(180deg, rgba(139,92,246,0.15) 0%, rgba(139,92,246,0.25) 100%)',
                        borderLeft: '2px solid rgba(139,92,246,0.6)',
                        borderRight: '2px solid rgba(139,92,246,0.6)',
                    }}
                />

                {/* Excluded region right (dimmed) */}
                <div
                    className="absolute top-0 bottom-0 right-0 bg-black/60 z-[1]"
                    style={{ width: `${100 - outPct}%` }}
                >
                    <div className="absolute inset-0 opacity-30" style={{
                        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.05) 3px, rgba(255,255,255,0.05) 6px)',
                    }} />
                </div>

                {/* Waveform visualization (decorative) */}
                <div className="absolute inset-0 flex items-end px-1 gap-[1px] z-0">
                    {Array.from({ length: 60 }).map((_, i) => (
                        <div
                            key={i}
                            className="flex-1 rounded-t-sm bg-white/[0.06]"
                            style={{
                                height: `${20 + Math.sin(i * 0.4) * 15 + Math.cos(i * 0.7) * 10 + Math.random() * 5}%`,
                            }}
                        />
                    ))}
                </div>

                {/* Playhead */}
                <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white/80 z-[5] cursor-ew-resize"
                    style={{ left: `${playheadPct}%`, transform: 'translateX(-50%)' }}
                    onPointerDown={(e) => handlePointerDown(e, 'playhead')}
                >
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.5)]" />
                </div>

                {/* In handle */}
                <div
                    className={clsx(
                        "absolute top-0 bottom-0 z-[6] cursor-ew-resize flex items-center",
                        dragging === 'in' && "scale-110"
                    )}
                    style={{ left: `${inPct}%`, transform: 'translateX(-50%)' }}
                    onPointerDown={(e) => handlePointerDown(e, 'in')}
                >
                    <div className={clsx(
                        "w-3.5 h-8 rounded-md flex items-center justify-center transition-all",
                        "bg-violet-500/80 border border-violet-400/60 shadow-[0_0_10px_rgba(139,92,246,0.4)]",
                        dragging === 'in' && "bg-violet-400 shadow-[0_0_16px_rgba(139,92,246,0.7)]"
                    )}>
                        <ChevronRight size={10} className="text-white/80" />
                    </div>
                </div>

                {/* Out handle */}
                <div
                    className={clsx(
                        "absolute top-0 bottom-0 z-[6] cursor-ew-resize flex items-center",
                        dragging === 'out' && "scale-110"
                    )}
                    style={{ left: `${outPct}%`, transform: 'translateX(-50%)' }}
                    onPointerDown={(e) => handlePointerDown(e, 'out')}
                >
                    <div className={clsx(
                        "w-3.5 h-8 rounded-md flex items-center justify-center transition-all",
                        "bg-violet-500/80 border border-violet-400/60 shadow-[0_0_10px_rgba(139,92,246,0.4)]",
                        dragging === 'out' && "bg-violet-400 shadow-[0_0_16px_rgba(139,92,246,0.7)]"
                    )}>
                        <ChevronLeft size={10} className="text-white/80" />
                    </div>
                </div>
            </div>

            {/* Time labels */}
            <div className="flex justify-between mt-1.5 text-[9px] font-mono text-white/25">
                <span>0:00</span>
                <span>{formatTime(duration)}</span>
            </div>
        </div>
    );
};

/* ═══════════════════════════════════════════════════════════════════
 * MediaDetailsPanel — Right Sidebar
 * ═══════════════════════════════════════════════════════════════════ */
export const MediaDetailsPanel: React.FC<MediaDetailsPanelProps> = ({ clip, mediaFile, onClose, onAdd, onRotate, hasPendingRotation, onConfirmRotation, onCancelRotation }) => {
    const { addClip } = useClipStore();
    const { setFileTrim, clearFileTrim } = useMediaStore();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [videoDuration, setVideoDuration] = useState(0);
    // Scale applied when the preview is rotated 90/270 so it fits the 16:9 box by
    // height regardless of the source aspect (portrait clips need scale-UP, not 0.5625).
    const [rotFitScale, setRotFitScale] = useState(0.5625);

    // Trim state — sourced from mediaFile, falls back to full duration
    const trimIn = mediaFile?.trimIn ?? 0;
    const trimOut = mediaFile?.trimOut ?? (mediaFile?.duration || videoDuration || 0);
    const hasTrim = mediaFile?.trimIn !== undefined && mediaFile?.trimOut !== undefined;
    const trimmedDuration = trimOut - trimIn;

    // Sync video time updates
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const handler = () => setCurrentTime(video.currentTime);
        video.addEventListener('timeupdate', handler);
        return () => video.removeEventListener('timeupdate', handler);
    }, [clip?.id]);

    const handleSeek = useCallback((time: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime = time;
            setCurrentTime(time);
        }
    }, []);

    const handleTrimChange = useCallback((newIn: number, newOut: number) => {
        if (mediaFile) {
            setFileTrim(mediaFile.id, newIn, newOut);
        }
    }, [mediaFile, setFileTrim]);

    const handleMarkIn = useCallback(() => {
        if (mediaFile) {
            const newIn = Math.min(currentTime, trimOut - 0.1);
            setFileTrim(mediaFile.id, newIn, trimOut);
        }
    }, [mediaFile, currentTime, trimOut, setFileTrim]);

    const handleMarkOut = useCallback(() => {
        if (mediaFile) {
            const newOut = Math.max(currentTime, trimIn + 0.1);
            setFileTrim(mediaFile.id, trimIn, newOut);
        }
    }, [mediaFile, currentTime, trimIn, setFileTrim]);

    const handleResetTrim = useCallback(() => {
        if (mediaFile) {
            clearFileTrim(mediaFile.id);
        }
    }, [mediaFile, clearFileTrim]);

    if (!clip) return (
        <div className="h-full flex flex-col items-center justify-center text-white/20 p-8 text-center bg-[#080810]">
            <FileVideo size={40} className="text-white/10 mb-4" />
            <h3 className="text-sm font-bold text-white/30 mb-1">No Selection</h3>
            <p className="text-[11px] text-white/20">Click a media file to view details and trim controls.</p>
        </div>
    );

    const getIcon = () => {
        switch (clip.type) {
            case 'video': return <FileVideo size={48} className="text-accent/50" />;
            case 'audio': return <FileAudio size={48} className="text-accent/50" />;
            case 'image': return <ImageIcon size={48} className="text-accent/50" />;
            default: return null;
        }
    };

    const rotation = clip.rotation || 0;
    const effectiveDuration = mediaFile?.duration || videoDuration || (clip.sourceDurationFrames / 30);

    return (
        <div className="h-full flex flex-col bg-[#080810] flex-shrink-0 animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h3 className="font-medium text-white/90">Details</h3>
                    {hasTrim && (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/20 border border-violet-500/30 text-[9px] font-bold text-violet-300 uppercase tracking-wider">
                            <Scissors size={9} /> Trimmed
                        </div>
                    )}
                </div>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors"
                >
                    <X size={16} />
                </button>
            </div>

            {/* Preview Section */}
            <div className="p-4 border-b border-white/5">
                <div className="aspect-video bg-black/50 rounded-lg border border-white/10 overflow-hidden relative group flex items-center justify-center mb-4">
                    {clip.type === 'video' || clip.type === 'image' ? (
                        <video
                            ref={videoRef}
                            src={`file://${clip.path}`}
                            className="w-full h-full object-contain transition-transform duration-300"
                            style={rotation ? {
                                transform: `rotate(${rotation}deg)${(rotation === 90 || rotation === 270) ? ` scale(${rotFitScale})` : ''}`,
                                // For 90°/270°, scale down so the rotated video fits within the 16:9 container
                            } : undefined}
                            controls={clip.type === 'video'}
                            onLoadedMetadata={(e) => {
                                const dur = e.currentTarget.duration;
                                setVideoDuration(dur);
                                const vw = e.currentTarget.videoWidth, vh = e.currentTarget.videoHeight;
                                if (vw && vh) { const av = vw / vh; setRotFitScale(av >= 16 / 9 ? 9 / 16 : Math.min(16 / 9, 1 / av)); }
                                if (clip.sourceDurationFrames === 0 && dur > 0) {
                                    useClipStore.getState().setClipDuration(clip.id, dur);
                                }
                            }}
                        />
                    ) : (
                        getIcon()
                    )}
                    {/* Trim region overlay on video */}
                    {hasTrim && clip.type === 'video' && effectiveDuration > 0 && (
                        <>
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50 z-10 pointer-events-none">
                                <div
                                    className="absolute top-0 bottom-0 bg-violet-500/70 rounded-full"
                                    style={{
                                        left: `${(trimIn / effectiveDuration) * 100}%`,
                                        width: `${((trimOut - trimIn) / effectiveDuration) * 100}%`,
                                    }}
                                />
                            </div>
                        </>
                    )}
                </div>

                <h2 className="text-lg font-semibold text-white/90 break-words mb-1">
                    {clip.filename}
                </h2>
                <div className="text-xs text-white/40 uppercase tracking-wider font-medium flex items-center gap-2">
                    <span>{clip.type}</span>
                    {rotation > 0 && (
                        <span className="text-blue-400/60 font-mono text-[10px]">{rotation}°</span>
                    )}
                    {hasTrim && (
                        <span className="text-violet-400/80 font-mono text-[10px]">
                            {formatTime(trimmedDuration)} trimmed
                        </span>
                    )}
                </div>
            </div>

            {/* ── TRIM SECTION ── */}
            {clip.type === 'video' && effectiveDuration > 0 && (
                <div className="p-4 border-b border-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <Scissors size={12} className="text-violet-400" />
                            <span className="text-[10px] font-black text-white/60 uppercase tracking-wider">
                                Pre-Trim
                            </span>
                        </div>
                        {hasTrim && (
                            <button
                                onClick={handleResetTrim}
                                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-[9px] font-bold text-white/40 hover:text-white/70 transition-colors uppercase tracking-wider"
                            >
                                <RotateCcw size={9} /> Reset
                            </button>
                        )}
                    </div>

                    {/* Dual-handle slider */}
                    <TrimSlider
                        duration={effectiveDuration}
                        trimIn={trimIn}
                        trimOut={trimOut}
                        currentTime={currentTime}
                        onTrimChange={handleTrimChange}
                        onSeek={handleSeek}
                    />

                    {/* Timecodes */}
                    <div className="grid grid-cols-3 gap-2">
                        <div className="bg-white/[0.04] rounded-lg p-2 text-center border border-white/5">
                            <div className="text-[8px] text-white/30 uppercase tracking-widest mb-0.5">In</div>
                            <div className="text-xs font-mono font-bold text-violet-300">{formatTime(trimIn)}</div>
                        </div>
                        <div className="bg-white/[0.04] rounded-lg p-2 text-center border border-white/5">
                            <div className="text-[8px] text-white/30 uppercase tracking-widest mb-0.5">Out</div>
                            <div className="text-xs font-mono font-bold text-violet-300">{formatTime(trimOut)}</div>
                        </div>
                        <div className={clsx(
                            "rounded-lg p-2 text-center border",
                            hasTrim
                                ? "bg-violet-500/10 border-violet-500/20"
                                : "bg-white/[0.04] border-white/5"
                        )}>
                            <div className="text-[8px] text-white/30 uppercase tracking-widest mb-0.5">Duration</div>
                            <div className={clsx(
                                "text-xs font-mono font-bold",
                                hasTrim ? "text-violet-200" : "text-white/60"
                            )}>
                                {formatTime(trimmedDuration)}
                            </div>
                        </div>
                    </div>

                    {/* Mark In / Mark Out buttons */}
                    <div className="flex gap-2">
                        <button
                            onClick={handleMarkIn}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-violet-500/10 hover:bg-violet-500/25 text-violet-300 text-[10px] font-bold uppercase tracking-wider border border-violet-500/20 hover:border-violet-500/40 transition-all active:scale-95"
                        >
                            <ChevronRight size={12} /> Mark In
                        </button>
                        <button
                            onClick={handleMarkOut}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-violet-500/10 hover:bg-violet-500/25 text-violet-300 text-[10px] font-bold uppercase tracking-wider border border-violet-500/20 hover:border-violet-500/40 transition-all active:scale-95"
                        >
                            Mark Out <ChevronLeft size={12} />
                        </button>
                    </div>

                    {/* Description */}
                    <p className="text-[9px] text-white/20 leading-relaxed">
                        {hasTrim
                            ? 'Only the highlighted region will be used by Trailer, GodMode, Timeline, and Flux. Click Reset to use the full video.'
                            : 'Set In/Out points to limit which portion of this video tools can use. Pause the video and click Mark In or Mark Out.'}
                    </p>
                </div>
            )}

            {/* Metadata Grid */}
            <div className="p-4 space-y-4 flex-1 overflow-y-auto">
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <div className="text-xs text-white/40 mb-1">Format</div>
                            <div className="text-sm text-white/80 font-mono">
                                {clip.path.split('.').pop()?.toUpperCase() || '-'}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-white/40 mb-1">Duration</div>
                            <div className="text-sm text-white/80 font-mono">
                                {formatTime(effectiveDuration)}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-white/40 mb-1">Resolution</div>
                            <div className="text-sm text-white/80 font-mono">
                                {mediaFile?.width && mediaFile?.height
                                    ? (rotation === 90 || rotation === 270)
                                        ? <>{mediaFile.height}×{mediaFile.width} <span className="text-[9px] text-blue-400/60">(rotated)</span></>
                                        : `${mediaFile.width}×${mediaFile.height}`
                                    : '-'}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-white/40 mb-1">Rotation</div>
                            <div className="text-sm text-white/80 font-mono">
                                {rotation}°
                                {rotation > 0 && (
                                    <span className="text-[9px] text-blue-400/60 ml-1">
                                        {mediaFile?.orientation === 'horizontal' ? 'Landscape' : mediaFile?.orientation === 'vertical' ? 'Portrait' : 'Square'}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="pt-2">
                        <div className="text-xs text-white/40 mb-1">File Path</div>
                        <div className="text-xs text-white/60 font-mono break-all bg-white/5 p-2 rounded select-all">
                            {clip.path}
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions Footer */}
            <div className="p-4 border-t border-white/5 bg-white/5 space-y-2">
                {/* Pending rotation: Approve / Decline row */}
                {hasPendingRotation && (
                    <div className="flex gap-2 mb-2">
                        {onConfirmRotation && (
                            <button
                                onClick={onConfirmRotation}
                                className="flex-1 flex items-center justify-center gap-2 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 p-2.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors border border-emerald-500/30 hover:border-emerald-500/50"
                            >
                                <Check size={16} strokeWidth={3} /> Approve {rotation}°
                            </button>
                        )}
                        {onCancelRotation && (
                            <button
                                onClick={onCancelRotation}
                                className="flex items-center justify-center gap-2 bg-red-600/20 hover:bg-red-600/40 text-red-300 p-2.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors border border-red-500/30 hover:border-red-500/50"
                            >
                                <X size={16} strokeWidth={3} />
                            </button>
                        )}
                    </div>
                )}
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            if (onAdd) {
                                onAdd();
                            }
                        }}
                        className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white p-3 rounded-lg font-medium transition-all shadow-[0_0_15px_rgba(168,85,247,0.3)] hover:shadow-[0_0_25px_rgba(168,85,247,0.5)]"
                    >
                        <Wand2 size={18} />
                        {hasTrim ? 'Open Trimmed in Trailer Wizard' : 'Open in Trailer Wizard'}
                    </button>
                    {onRotate && clip.type === 'video' && (
                        <button
                            onClick={onRotate}
                            className="flex items-center justify-center gap-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 p-3 rounded-lg font-medium transition-colors border border-blue-500/20 hover:border-blue-500/40"
                            title={`Rotate (currently ${rotation}°)`}
                        >
                            <RotateCw size={18} />
                        </button>
                    )}
                </div>
            </div>
        </div >
    );
};
