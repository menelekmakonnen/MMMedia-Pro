import React, { useMemo } from 'react';
import { useClipStore, Clip } from '../../store/clipStore';
import { useProxyStore } from '../../store/proxyStore';
import { useProjectStore } from '../../store/projectStore';
import { DEFAULT_FPS } from '../../lib/time';
import { getTransitionById } from '../../lib/transitions';
import {
    AlertTriangle, CheckCircle, Clock, Film, Music, Zap,
    ArrowRight, Loader, XCircle, Info
} from 'lucide-react';
import clsx from 'clsx';

/**
 * RenderInspector — Shows the compiled FFmpeg filter chains, timing math,
 * proxy status, and warnings for the currently selected clip.
 */
export const RenderInspector: React.FC = () => {
    const clips = useClipStore((s) => s.clips);
    const selectedIds = useClipStore((s) => s.selectedClipIds);
    const transitionStrategy = useClipStore((s) => s.transitionStrategy);
    const { settings } = useProjectStore();
    const proxies = useProxyStore((s) => s.proxies);

    const fps = settings.fps || DEFAULT_FPS;
    const outW = settings.resolution?.width || 1080;
    const outH = settings.resolution?.height || 1920;

    const selectedClip = useMemo(() => {
        if (selectedIds.length === 0) return null;
        return clips.find((c) => c.id === selectedIds[0]) || null;
    }, [clips, selectedIds]);

    const clipIndex = useMemo(() => {
        if (!selectedClip) return -1;
        return clips.filter(c => c.type !== 'audio').findIndex(c => c.id === selectedClip.id);
    }, [clips, selectedClip]);

    const nextClip = useMemo(() => {
        if (clipIndex < 0) return null;
        const videoClips = clips.filter(c => c.type !== 'audio');
        return videoClips[clipIndex + 1] || null;
    }, [clips, clipIndex]);

    if (!selectedClip) {
        return (
            <div className="w-full h-full flex items-center justify-center">
                <div className="text-center space-y-2 opacity-50">
                    <Info size={24} className="mx-auto text-white/30" />
                    <p className="text-xs text-white/30">Select a clip to inspect render details</p>
                </div>
            </div>
        );
    }

    const speed = selectedClip.speed || 1;
    const seekSec = (selectedClip.trimStartFrame ?? 0) / fps;
    const srcDurSec = ((selectedClip.endFrame - selectedClip.startFrame) / fps) * speed;
    const outDurSec = srcDurSec / speed;

    // Build video filter chain description
    const videoFilters = buildVideoFilterDescription(selectedClip, outW, outH, fps);
    const audioFilters = buildAudioFilterDescription(selectedClip, fps);
    const warnings = buildWarnings(selectedClip, clips, clipIndex, fps);

    // Proxy status
    const proxy = proxies[selectedClip.id];

    // Transition info
    const transition = selectedClip.transition;
    const globalTransition = transitionStrategy !== 'cut' ? transitionStrategy : null;

    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar">
            <div className="p-4 space-y-4">

                {/* Header */}
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md" style={{ background: 'rgba(74,158,224,0.15)' }}>
                        <Zap size={14} className="text-primary-300" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white">Render Inspector</h3>
                        <p className="text-[10px] text-white/40 truncate max-w-[200px]">{selectedClip.filename}</p>
                    </div>
                </div>

                {/* Duration Math */}
                <Section title="Duration Math" icon={<Clock size={12} />}>
                    <Row label="Seek Time" value={`${seekSec.toFixed(3)}s`} />
                    <Row label="Source Duration" value={`${srcDurSec.toFixed(3)}s`} />
                    <Row label="Output Duration" value={`${outDurSec.toFixed(3)}s`} />
                    <Row label="Speed Multiplier" value={`${speed}x`} />
                    <Row label="Timeline Frames" value={`${selectedClip.startFrame} → ${selectedClip.endFrame}`} />
                    <Row label="Trim Frames" value={`${selectedClip.trimStartFrame ?? 0} → ${selectedClip.trimEndFrame ?? 0}`} />
                </Section>

                {/* Video Filter Chain */}
                <Section title="Video Filter Chain" icon={<Film size={12} />}>
                    <div className="bg-black/40 rounded-lg p-3 border border-white/5">
                        <code className="text-[10px] font-mono text-green-400/80 whitespace-pre-wrap break-all leading-relaxed">
                            {videoFilters || 'No filters applied'}
                        </code>
                    </div>
                </Section>

                {/* Audio Filter Chain */}
                <Section title="Audio Filter Chain" icon={<Music size={12} />}>
                    <div className="bg-black/40 rounded-lg p-3 border border-white/5">
                        <code className="text-[10px] font-mono text-blue-400/80 whitespace-pre-wrap break-all leading-relaxed">
                            {audioFilters || 'No audio filters'}
                        </code>
                    </div>
                </Section>

                {/* Proxy Status */}
                <Section title="Proxy Status" icon={proxy?.status === 'ready' ? <CheckCircle size={12} /> : <Loader size={12} />}>
                    {proxy ? (
                        <>
                            <Row label="Status" value={
                                <span className={clsx(
                                    'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                                    proxy.status === 'ready' && 'bg-green-500/20 text-green-400',
                                    proxy.status === 'rendering' && 'bg-yellow-500/20 text-yellow-400',
                                    proxy.status === 'pending' && 'bg-blue-500/20 text-blue-400',
                                    proxy.status === 'failed' && 'bg-red-500/20 text-red-400',
                                )}>
                                    {proxy.status}
                                </span>
                            } />
                            <Row label="Hash" value={<span className="font-mono text-white/30">{proxy.hash.slice(0, 16)}…</span>} />
                            {proxy.proxyPath && (
                                <Row label="Path" value={<span className="font-mono text-white/30 truncate max-w-[180px] inline-block">{proxy.proxyPath.split(/[/\\]/).pop()}</span>} />
                            )}
                        </>
                    ) : (
                        <p className="text-[10px] text-white/30">No proxy generated for this clip</p>
                    )}
                </Section>

                {/* Transition Info */}
                <Section title="Transition Info" icon={<ArrowRight size={12} />}>
                    {transition ? (
                        <>
                            <Row label="Type" value={transition.type} />
                            <Row label="Duration" value={`${transition.durationFrames} frames (${(transition.durationFrames / fps).toFixed(3)}s)`} />
                            {nextClip && <Row label="Next Clip" value={nextClip.filename} />}
                        </>
                    ) : globalTransition ? (
                        <>
                            <Row label="Global Strategy" value={globalTransition} />
                            {nextClip && <Row label="Next Clip" value={nextClip.filename} />}
                        </>
                    ) : (
                        <p className="text-[10px] text-white/30">Hard cut (no transition)</p>
                    )}
                </Section>

                {/* Warnings */}
                {warnings.length > 0 && (
                    <Section title={`Warnings (${warnings.length})`} icon={<AlertTriangle size={12} />}>
                        <div className="space-y-1.5">
                            {warnings.map((w, i) => (
                                <div key={i} className={clsx(
                                    'flex items-start gap-2 text-[10px] p-2 rounded-md border',
                                    w.level === 'warning' ? 'bg-red-500/10 border-red-500/20 text-red-300' : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300'
                                )}>
                                    {w.level === 'warning' ? <XCircle size={10} className="mt-0.5 shrink-0" /> : <Info size={10} className="mt-0.5 shrink-0" />}
                                    <span>{w.message}</span>
                                </div>
                            ))}
                        </div>
                    </Section>
                )}
            </div>
        </div>
    );
};

// ── Helper components ──

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
    <div className="border border-white/5 rounded-xl bg-black/20 p-3 space-y-2">
        <div className="flex items-center gap-1.5">
            <span className="text-primary-300">{icon}</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-white/50">{title}</span>
        </div>
        {children}
    </div>
);

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div className="flex justify-between items-center py-0.5">
        <span className="text-[10px] text-white/40">{label}</span>
        <span className="text-[10px] text-white/70 font-mono">{value}</span>
    </div>
);

// ── Filter chain description builders (mirror filterBuilder.ts logic) ──

function buildVideoFilterDescription(clip: Clip, outW: number, outH: number, fps: number): string {
    const speed = clip.speed || 1;
    const filters: string[] = [];

    // Trim
    const seekSec = (clip.trimStartFrame ?? 0) / fps;
    const srcDurSec = ((clip.endFrame - clip.startFrame) / fps) * speed;
    filters.push(`trim=start=${seekSec.toFixed(4)}:end=${(seekSec + srcDurSec).toFixed(4)}`);
    filters.push('setpts=PTS-STARTPTS');

    if (clip.reversed) filters.push('reverse');
    if (clip.flipH) filters.push('hflip');
    if (clip.flipV) filters.push('vflip');

    const rot = clip.rotation || 0;
    if (rot === 90) filters.push('transpose=1');
    else if (rot === 180) filters.push('transpose=1,transpose=1');
    else if (rot === 270) filters.push('transpose=2');

    // Zoom
    const zs = clip.zoomStart ?? 100;
    const ze = clip.zoomEnd ?? (clip.zoomLevel ?? 100);
    if (Math.abs(zs - 100) >= 0.5 || Math.abs(ze - 100) >= 0.5) {
        filters.push(`zoompan=z='lerp(${(zs/100).toFixed(4)},${(ze/100).toFixed(4)},...)':d=1:s=${outW}x${outH}:fps=${fps}`);
    }

    filters.push(`scale=${outW}:${outH}:force_original_aspect_ratio=decrease`);
    filters.push(`pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2`);
    filters.push('setsar=1');

    if (clip.chromaKey?.enabled) filters.push(`chromakey=color=0x${clip.chromaKey.color.replace('#','')}:similarity=${clip.chromaKey.similarity}:blend=${clip.chromaKey.blend}`);
    if (clip.colorGrading) filters.push('[color grading chain]');
    if (clip.effectIds?.length) filters.push(`[${clip.effectIds.length} effect(s)]`);
    if (clip.textOverlays?.length) filters.push(`[${clip.textOverlays.length} text overlay(s)]`);
    if (clip.parametricEffects?.length) filters.push(`[${clip.parametricEffects.length} parametric effect(s)]`);
    if (clip.sharpen && clip.sharpen > 0) filters.push(`unsharp=5:5:${clip.sharpen.toFixed(4)}:5:5:0`);
    if (clip.blurAmount && clip.blurAmount > 0) filters.push(`gblur=sigma=${clip.blurAmount.toFixed(4)}`);
    if (clip.filmGrain && clip.filmGrain > 0) filters.push(`noise=c0s=${Math.round(clip.filmGrain)}:c0f=t+u`);
    if (clip.vignette && clip.vignette > 0) filters.push(`vignette=${((Math.PI/6)+((clip.vignette/100)*(Math.PI/2-Math.PI/6))).toFixed(4)}`);
    if (clip.chromaticAberration && clip.chromaticAberration > 0) filters.push(`rgbashift=rh=${Math.round(clip.chromaticAberration)}:bh=${-Math.round(clip.chromaticAberration)}`);
    if (clip.letterbox) filters.push('drawbox [letterbox bars]');
    if (clip.shake?.intensity) filters.push(`[shake: ${clip.shake.type} @ ${clip.shake.intensity}%]`);
    if (speed !== 1.0) filters.push(`setpts=${(1/speed).toFixed(4)}*PTS`);
    filters.push(`fps=fps=${fps}`);

    return filters.join(',\n');
}

function buildAudioFilterDescription(clip: Clip, fps: number): string {
    const speed = clip.speed || 1;
    const filters: string[] = [];

    const seekSec = (clip.trimStartFrame ?? 0) / fps;
    const srcDurSec = ((clip.endFrame - clip.startFrame) / fps) * speed;
    filters.push(`atrim=start=${seekSec.toFixed(4)}:end=${(seekSec + srcDurSec).toFixed(4)}`);
    filters.push('asetpts=PTS-STARTPTS');

    if (clip.reversed) filters.push('areverse');
    if (speed !== 1.0) {
        // atempo chain description
        if (speed >= 0.5 && speed <= 2.0) {
            filters.push(`atempo=${speed.toFixed(4)}`);
        } else {
            filters.push(`[chained atempo for ${speed}x]`);
        }
    }

    if (clip.audioEffects) filters.push('[audio effects chain]');

    const vol = ((clip.volume ?? 100) / 100) * (clip.isMuted ? 0 : 1);
    filters.push(`volume=${vol.toFixed(4)}`);
    filters.push('aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo');

    return filters.join(',\n');
}

function buildWarnings(
    clip: Clip,
    allClips: Clip[],
    clipIndex: number,
    fps: number
): { level: 'warning' | 'info'; message: string }[] {
    const warnings: { level: 'warning' | 'info'; message: string }[] = [];

    // Missing media
    if (!clip.path || clip.path.startsWith('blob:') || clip.path.startsWith('data:')) {
        warnings.push({ level: 'warning', message: 'Media source is a blob/data URL — will not export.' });
    }

    // Very short clip
    const outDurSec = ((clip.endFrame - clip.startFrame) / fps) / (clip.speed || 1);
    if (outDurSec < 1 / fps) {
        warnings.push({ level: 'warning', message: 'Clip is shorter than one frame — will be dropped.' });
    }

    // Long reversed clip
    if (clip.reversed && outDurSec > 5) {
        warnings.push({ level: 'info', message: 'Reversed clip >5s will use slower two-pass approach.' });
    }

    // Transition handle check
    const videoClips = allClips.filter(c => c.type !== 'audio');
    if (clipIndex >= 0 && clipIndex < videoClips.length - 1) {
        const nextClip = videoClips[clipIndex + 1];
        const transition = clip.transition;
        if (transition && transition.durationFrames > 0) {
            const transDurSec = transition.durationFrames / fps;
            const maxD = 0.4 * Math.min(outDurSec, ((nextClip.endFrame - nextClip.startFrame) / fps) / (nextClip.speed || 1));
            if (transDurSec > maxD) {
                warnings.push({ level: 'info', message: `Transition duration (${transDurSec.toFixed(2)}s) exceeds safe limit (${maxD.toFixed(2)}s) — will be clamped.` });
            }
        }
    }

    // Resolution mismatch
    if (clip.width && clip.height) {
        const settings = useProjectStore.getState().settings;
        const outW = settings.resolution?.width || 1080;
        const outH = settings.resolution?.height || 1920;
        const srcAR = clip.width / clip.height;
        const outAR = outW / outH;
        if (Math.abs(srcAR - outAR) > 0.1) {
            warnings.push({ level: 'info', message: `Source aspect ratio (${srcAR.toFixed(2)}) differs from output (${outAR.toFixed(2)}) — padding will be applied.` });
        }
    }

    return warnings;
}
