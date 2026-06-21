import React, { useState, useCallback } from 'react';
import { Copy, Trash2, Shuffle, Pin, PinOff, Volume2, VolumeX, Sparkles, ArrowRightLeft, Palette, Lock, Unlock, ArrowUpCircle, ArrowDownCircle, Repeat2, ChevronDown, ChevronRight, Layers, Paintbrush, Type, Music, Wrench } from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import { SpeedControl } from '../../components/SpeedControl';
import { AssetPicker } from '../../components/AssetPicker';
import { EffectsPanel } from './EffectsPanel';
import { ColorGradingPanel } from './ColorGradingPanel';
import { TextOverlayPanel } from './TextOverlayPanel';
import { AudioEffectsPanel } from './AudioEffectsPanel';
import { toast } from '../../components/Toast';
import { useProjectStore } from '../../store/projectStore';
import { KeyframeEditor } from '../../components/KeyframeEditor';
import type { KfPoint } from '../../lib/keyframes';

interface ClipControlsProps {
    clipId: string;
    variant?: 'sidebar' | 'player'; // Added variant prop
}

export const ClipControls: React.FC<ClipControlsProps> = ({ clipId, variant = 'sidebar' }) => {
    const { clips, duplicateClip, deleteClip, randomizeSegment, pinClip, lockClip, setClipVolume, setClipMuted, setClipSpeed, moveClip } = useClipStore();
    const clip = clips.find((c) => c.id === clipId);
    const [showAssetPicker, setShowAssetPicker] = useState(false);

    // Expandable section state
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

    const toggleSection = useCallback((section: string) => {
        setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
    }, []);

    if (!clip) return null;

    const isPinned = clip.isPinned || false;
    const isLocked = clip.locked || false;
    const volume = clip.volume ?? 100;
    const isMuted = clip.isMuted || false;
    const speed = clip.speed ?? 1.0;

    // Quick Tools values
    const flipH = clip.flipH ?? false;
    const flipV = clip.flipV ?? false;
    const sharpenVal = clip.sharpen ?? 0;
    const blurVal = clip.blurAmount ?? 0;
    const chromaKey = clip.chromaKey ?? { enabled: false, color: '#00ff00', similarity: 0.4, blend: 0.1 };
    const stabilize = clip.stabilize ?? { enabled: false, smoothing: 10 };

    const updateClip = useCallback(
        (updates: Record<string, any>) => {
            useClipStore.getState().updateClip(clipId, updates);
        },
        [clipId]
    );

    // ── Smart (auto-editor) actions: FFmpeg-backed silence/scene detection ──
    const [smartBusy, setSmartBusy] = useState(false);
    const [kfProp, setKfProp] = useState<'brightness' | 'contrast' | 'saturation'>('brightness');
    const handleRemoveSilence = useCallback(async () => {
        const c = useClipStore.getState().clips.find((x) => x.id === clipId);
        if (!c?.path) return;
        setSmartBusy(true);
        try {
            const fps = useProjectStore.getState().settings.fps || 30;
            const res = await (window as any).ipcRenderer.detectSilence({ path: c.path });
            if (res?.success && res.trim) {
                const ns = Math.round(res.trim.trimStart * fps);
                const ne = Math.round(res.trim.trimEnd * fps);
                if (ne > ns && (res.trim.trimStart > 0.05 || (res.duration && res.trim.trimEnd < res.duration - 0.05))) {
                    useClipStore.getState().updateClipSource(clipId, ns, ne);
                    toast.success(`Trimmed silence (${res.trim.trimStart.toFixed(2)}s head)`);
                } else {
                    toast.info('No leading/trailing silence found');
                }
            } else {
                toast.error(res?.error || 'Silence detection failed');
            }
        } catch (e: any) {
            toast.error(e?.message || 'Silence detection failed');
        } finally {
            setSmartBusy(false);
        }
    }, [clipId]);
    const handleDetectScenes = useCallback(async () => {
        const c = useClipStore.getState().clips.find((x) => x.id === clipId);
        if (!c?.path) return;
        setSmartBusy(true);
        try {
            const res = await (window as any).ipcRenderer.detectScenes({ path: c.path });
            if (res?.success) toast.success(`${res.cuts?.length || 0} scene cuts detected`);
            else toast.error(res?.error || 'Scene detection failed');
        } catch (e: any) {
            toast.error(e?.message || 'Scene detection failed');
        } finally {
            setSmartBusy(false);
        }
    }, [clipId]);
    const handleScore = useCallback(async () => {
        const c = useClipStore.getState().clips.find((x) => x.id === clipId);
        if (!c?.path) return;
        setSmartBusy(true);
        try {
            const res = await (window as any).ipcRenderer.scoreClip({ path: c.path });
            if (res?.success) toast.success(`Interest score: ${res.score}/100 (motion ${(res.motionEnergy || 0).toFixed(1)})`);
            else toast.error(res?.error || 'Scoring failed');
        } catch (e: any) {
            toast.error(e?.message || 'Scoring failed');
        } finally {
            setSmartBusy(false);
        }
    }, [clipId]);

    return (
        <>
            {showAssetPicker && (
                <AssetPicker clipId={clipId} onClose={() => setShowAssetPicker(false)} />
            )}
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 bg-black/30 border-t border-white/5">
                {/* Action Buttons */}
                <button onClick={() => duplicateClip(clipId)} className="p-1.5 hover:bg-white/10 rounded-lg border border-transparent hover:border-white/10 transition-all" title="Duplicate Clip">
                    <Copy size={14} className="text-white/50" />
                </button>

                <button onClick={() => deleteClip(clipId)} className="p-1.5 hover:bg-red-500/20 rounded-lg border border-transparent hover:border-red-500/10 transition-all" title="Delete Clip">
                    <Trash2 size={14} className="text-red-400/50" />
                </button>

                <button
                    onClick={() => randomizeSegment(clipId)}
                    className="p-1.5 hover:bg-white/10 rounded transition-colors"
                    title="Shuffle Segment Position"
                >
                    <Shuffle size={16} className="text-white/60" />
                </button>

                <button
                    onClick={() => useClipStore.getState().swapClip(clipId)}
                    className={`p-1.5 hover:bg-white/10 rounded transition-colors ${isPinned ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={isPinned ? "Cannot swap pinned clip" : "Swap Clip Position"}
                >
                    <ArrowRightLeft size={16} className="text-white/60" />
                </button>

                <button
                    onClick={() => moveClip(clipId, 'up')}
                    className="p-1.5 hover:bg-white/10 rounded transition-colors"
                    title="Move Clip Up/Left"
                >
                    <ArrowUpCircle size={16} className="text-white/60" />
                </button>

                <button
                    onClick={() => moveClip(clipId, 'down')}
                    className="p-1.5 hover:bg-white/10 rounded transition-colors"
                    title="Move Clip Down/Right"
                >
                    <ArrowDownCircle size={16} className="text-white/60" />
                </button>

                <button
                    onClick={() => useClipStore.getState().randomizeClipDuration(clipId)}
                    className="p-1.5 hover:bg-accent/20 rounded transition-colors"
                    title="Flux: Randomize Duration & Segment"
                >
                    <Sparkles size={16} className="text-accent" />
                </button>

                <button
                    onClick={() => setShowAssetPicker(true)}
                    className="p-1.5 hover:bg-primary/20 rounded transition-colors"
                    title="Apply Effects"
                >
                    <Palette size={16} className="text-primary" />
                </button>

                {/* Boomerang Toggle */}
                <button
                    onClick={() => useClipStore.getState().toggleBoomerang(clipId)}
                    className={`p-1.5 hover:bg-white/10 rounded transition-colors ${clip.boomerang ? 'bg-cyan-500/20' : ''}`}
                    title={clip.boomerang ? 'Boomerang enabled' : 'Enable Boomerang'}
                >
                    <Repeat2 size={16} className={clip.boomerang ? 'text-cyan-400' : 'text-white/60'} />
                </button>



                <button
                    onClick={() => pinClip(clipId, !isPinned)}
                    className={`p-1.5 hover:bg-white/10 rounded transition-colors ${isPinned ? 'bg-accent/20' : ''}`}
                    title={isPinned ? 'Unpin Clip' : 'Pin Clip'}
                >
                    {isPinned ? <Pin size={16} className="text-accent" /> : <PinOff size={16} className="text-white/60" />}
                </button>

                <button
                    onClick={() => lockClip(clipId, !isLocked)}
                    className={`p-1.5 hover:bg-white/10 rounded transition-colors ${isLocked ? 'bg-yellow-500/20' : ''}`}
                    title={isLocked ? 'Unlock Clip (allow regeneration)' : 'Lock Clip (protect from regeneration)'}
                >
                    {isLocked ? <Lock size={16} className="text-yellow-500" /> : <Unlock size={16} className="text-white/60" />}
                </button>

                {!clip.isFolded && variant === 'player' && (
                    <>
                        <div className="h-4 w-px bg-white/10 mx-1" />
                        <div className="flex items-center gap-2 flex-1 min-w-[100px]">
                            <button
                                onClick={() => setClipMuted(clipId, !isMuted)}
                                className="p-1.5 hover:bg-white/10 rounded transition-colors"
                                title={isMuted ? 'Unmute' : 'Mute'}
                            >
                                {isMuted ? <VolumeX size={16} className="text-white/40" /> : <Volume2 size={16} className="text-white/60" />}
                            </button>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={volume}
                                onChange={(e) => setClipVolume(clipId, parseInt(e.target.value))}
                                className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-accent"
                                disabled={isMuted}
                                title="Volume"
                            />
                            <span className="text-xs text-white/40 w-8 text-right">{volume}%</span>
                        </div>

                        <div className="h-4 w-px bg-white/10 mx-1" />

                        {/* Speed Control */}
                        <SpeedControl
                            value={speed}
                            onChange={(newSpeed) => setClipSpeed(clipId, newSpeed)}
                            size="sm"
                        />
                    </>
                )}
            </div>

            {/* ═══ Expandable Sections ═══════════════════════════════════════ */}

            {/* Effects */}
            <div className="border-t border-white/5">
                <button
                    onClick={() => toggleSection('effects')}
                    className="flex items-center gap-2 w-full px-3 py-2 hover:bg-white/5 transition-colors"
                >
                    {expandedSections.effects
                        ? <ChevronDown size={12} className="text-white/30" />
                        : <ChevronRight size={12} className="text-white/30" />
                    }
                    <Layers size={13} className="text-purple-400/70" />
                    <span className="text-xs font-medium text-white/60">Effects</span>
                    {(clip.parametricEffects?.length ?? 0) > 0 && (
                        <span className="ml-auto text-[10px] bg-purple-500/20 text-purple-300 px-1.5 rounded-full">
                            {clip.parametricEffects!.length}
                        </span>
                    )}
                </button>
                {expandedSections.effects && (
                    <div className="px-3 pb-3">
                        <EffectsPanel clipId={clip.id} />
                    </div>
                )}
            </div>

            {/* Color Grading */}
            <div className="border-t border-white/5">
                <button
                    onClick={() => toggleSection('colorGrading')}
                    className="flex items-center gap-2 w-full px-3 py-2 hover:bg-white/5 transition-colors"
                >
                    {expandedSections.colorGrading
                        ? <ChevronDown size={12} className="text-white/30" />
                        : <ChevronRight size={12} className="text-white/30" />
                    }
                    <Paintbrush size={13} className="text-orange-400/70" />
                    <span className="text-xs font-medium text-white/60">Color Grading</span>
                </button>
                {expandedSections.colorGrading && (
                    <div className="px-3 pb-3">
                        <ColorGradingPanel clipId={clip.id} />
                    </div>
                )}
            </div>

            {/* Text Overlays */}
            <div className="border-t border-white/5">
                <button
                    onClick={() => toggleSection('textOverlays')}
                    className="flex items-center gap-2 w-full px-3 py-2 hover:bg-white/5 transition-colors"
                >
                    {expandedSections.textOverlays
                        ? <ChevronDown size={12} className="text-white/30" />
                        : <ChevronRight size={12} className="text-white/30" />
                    }
                    <Type size={13} className="text-emerald-400/70" />
                    <span className="text-xs font-medium text-white/60">Text Overlays</span>
                    {(clip.textOverlays?.length ?? 0) > 0 && (
                        <span className="ml-auto text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 rounded-full">
                            {clip.textOverlays!.length}
                        </span>
                    )}
                </button>
                {expandedSections.textOverlays && (
                    <div className="px-3 pb-3">
                        <TextOverlayPanel clipId={clip.id} />
                    </div>
                )}
            </div>

            {/* Audio Effects */}
            <div className="border-t border-white/5">
                <button
                    onClick={() => toggleSection('audioEffects')}
                    className="flex items-center gap-2 w-full px-3 py-2 hover:bg-white/5 transition-colors"
                >
                    {expandedSections.audioEffects
                        ? <ChevronDown size={12} className="text-white/30" />
                        : <ChevronRight size={12} className="text-white/30" />
                    }
                    <Music size={13} className="text-sky-400/70" />
                    <span className="text-xs font-medium text-white/60">Audio Effects</span>
                </button>
                {expandedSections.audioEffects && (
                    <div className="px-3 pb-3">
                        <AudioEffectsPanel clipId={clip.id} />
                    </div>
                )}
            </div>

            {/* Quick Tools */}
            <div className="border-t border-white/5">
                <button
                    onClick={() => toggleSection('quickTools')}
                    className="flex items-center gap-2 w-full px-3 py-2 hover:bg-white/5 transition-colors"
                >
                    {expandedSections.quickTools
                        ? <ChevronDown size={12} className="text-white/30" />
                        : <ChevronRight size={12} className="text-white/30" />
                    }
                    <Wrench size={13} className="text-white/40" />
                    <span className="text-xs font-medium text-white/60">Quick Tools</span>
                </button>
                {expandedSections.quickTools && (
                    <div className="px-3 pb-3 space-y-2">
                        {/* Flip Toggles */}
                        <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <button
                                    onClick={() => updateClip({ flipH: !flipH })}
                                    className={`w-8 h-4 rounded-full transition-colors relative ${flipH ? 'bg-purple-500' : 'bg-white/15'}`}
                                >
                                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${flipH ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                </button>
                                <span className="text-xs text-white/50">Flip H</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <button
                                    onClick={() => updateClip({ flipV: !flipV })}
                                    className={`w-8 h-4 rounded-full transition-colors relative ${flipV ? 'bg-purple-500' : 'bg-white/15'}`}
                                >
                                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${flipV ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                </button>
                                <span className="text-xs text-white/50">Flip V</span>
                            </label>
                        </div>

                        {/* Sharpen */}
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-white/50 w-20 shrink-0">Sharpen</label>
                            <input
                                type="range"
                                min="0" max="3" step="0.1"
                                value={sharpenVal}
                                onChange={(e) => updateClip({ sharpen: parseFloat(e.target.value) })}
                                onDoubleClick={() => updateClip({ sharpen: 0 })}
                                className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                            <span className="text-xs text-white/40 w-8 text-right tabular-nums">{sharpenVal.toFixed(1)}</span>
                        </div>

                        {/* Blur */}
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-white/50 w-20 shrink-0">Blur</label>
                            <input
                                type="range"
                                min="0" max="20" step="0.5"
                                value={blurVal}
                                onChange={(e) => updateClip({ blurAmount: parseFloat(e.target.value) })}
                                onDoubleClick={() => updateClip({ blurAmount: 0 })}
                                className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                            <span className="text-xs text-white/40 w-8 text-right tabular-nums">{blurVal.toFixed(1)}</span>
                        </div>

                        {/* ── Chroma Key ────────────────────────────────────── */}
                        <div className="pt-1 border-t border-white/5">
                            <div className="flex items-center justify-between pb-1">
                                <span className="text-[10px] uppercase tracking-wider text-white/30 font-semibold">Chroma Key</span>
                                <button
                                    onClick={() => updateClip({ chromaKey: { ...chromaKey, enabled: !chromaKey.enabled } })}
                                    className={`w-8 h-4 rounded-full transition-colors relative ${chromaKey.enabled ? 'bg-green-500' : 'bg-white/15'}`}
                                >
                                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${chromaKey.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                </button>
                            </div>
                            {chromaKey.enabled && (
                                <div className="space-y-1 pl-1">
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs text-white/50 w-20 shrink-0">Color</label>
                                        <input
                                            type="color"
                                            value={chromaKey.color}
                                            onChange={(e) => updateClip({ chromaKey: { ...chromaKey, color: e.target.value } })}
                                            className="w-6 h-6 rounded border border-white/10 cursor-pointer bg-transparent"
                                        />
                                        <span className="text-xs text-white/40">{chromaKey.color}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs text-white/50 w-20 shrink-0">Similarity</label>
                                        <input
                                            type="range"
                                            min="0.01" max="1.0" step="0.01"
                                            value={chromaKey.similarity}
                                            onChange={(e) => updateClip({ chromaKey: { ...chromaKey, similarity: parseFloat(e.target.value) } })}
                                            className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-green-500"
                                        />
                                        <span className="text-xs text-white/40 w-8 text-right tabular-nums">{chromaKey.similarity.toFixed(2)}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs text-white/50 w-20 shrink-0">Blend</label>
                                        <input
                                            type="range"
                                            min="0" max="1" step="0.01"
                                            value={chromaKey.blend}
                                            onChange={(e) => updateClip({ chromaKey: { ...chromaKey, blend: parseFloat(e.target.value) } })}
                                            className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-green-500"
                                        />
                                        <span className="text-xs text-white/40 w-8 text-right tabular-nums">{chromaKey.blend.toFixed(2)}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Stabilization ─────────────────────────────────── */}
                        <div className="pt-1 border-t border-white/5">
                            <div className="flex items-center justify-between pb-1">
                                <span className="text-[10px] uppercase tracking-wider text-white/30 font-semibold">Stabilization</span>
                                <button
                                    onClick={() => updateClip({ stabilize: { ...stabilize, enabled: !stabilize.enabled } })}
                                    className={`w-8 h-4 rounded-full transition-colors relative ${stabilize.enabled ? 'bg-blue-500' : 'bg-white/15'}`}
                                >
                                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${stabilize.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                </button>
                            </div>
                            {stabilize.enabled && (
                                <div className="flex items-center gap-2 pl-1">
                                    <label className="text-xs text-white/50 w-20 shrink-0">Smoothing</label>
                                    <input
                                        type="range"
                                        min="1" max="60"
                                        value={stabilize.smoothing}
                                        onChange={(e) => updateClip({ stabilize: { ...stabilize, smoothing: parseInt(e.target.value) } })}
                                        className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                    />
                                    <span className="text-xs text-white/40 w-8 text-right tabular-nums">{stabilize.smoothing}</span>
                                </div>
                            )}
                        </div>

                        {/* ── Smart (auto-editor) ───────────────────────────── */}
                        <div className="pt-1 border-t border-white/5">
                            <span className="text-[10px] uppercase tracking-wider text-white/30 font-semibold">Smart</span>
                            <div className="flex gap-1.5 mt-1">
                                <button disabled={smartBusy} onClick={handleRemoveSilence} className="flex-1 text-[10px] py-1 rounded-md bg-white/5 hover:bg-white/10 text-white/60 disabled:opacity-40 transition-colors" title="Trim leading/trailing silence">Remove Silence</button>
                                <button disabled={smartBusy} onClick={handleDetectScenes} className="flex-1 text-[10px] py-1 rounded-md bg-white/5 hover:bg-white/10 text-white/60 disabled:opacity-40 transition-colors" title="Detect scene-change cut points">Detect Scenes</button>
                                <button disabled={smartBusy} onClick={handleScore} className="flex-1 text-[10px] py-1 rounded-md bg-white/5 hover:bg-white/10 text-white/60 disabled:opacity-40 transition-colors" title="Score clip by motion/activity">Score</button>
                            </div>
                        </div>

                        {/* ── Keyframes (animatable color, via the keyframe substrate) ── */}
                        <div className="pt-1 border-t border-white/5">
                            {(() => {
                                const META = {
                                    brightness: { field: 'brightnessKeyframes', min: -1, max: 1, neutral: 0 },
                                    contrast: { field: 'contrastKeyframes', min: 0, max: 3, neutral: 1 },
                                    saturation: { field: 'saturationKeyframes', min: 0, max: 3, neutral: 1 },
                                } as const;
                                const m = META[kfProp];
                                const pts = (((clip as any)[m.field] as KfPoint[] | undefined) || []);
                                const fps = useProjectStore.getState().settings.fps || 30;
                                const dur = (clip.endFrame - clip.startFrame) || Math.round(fps * 2);
                                const setPts = (next: KfPoint[]) => updateClip({ [m.field]: next.length ? next : undefined });
                                return (
                                    <>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[10px] uppercase tracking-wider text-white/30 font-semibold">Keyframes</span>
                                            <div className="flex gap-0.5">
                                                {(['brightness', 'contrast', 'saturation'] as const).map((k) => (
                                                    <button key={k} onClick={() => setKfProp(k)}
                                                        className={`text-[9px] px-1.5 py-0.5 rounded ${kfProp === k ? 'bg-purple-500/30 text-purple-200' : 'bg-white/5 text-white/40 hover:bg-white/10'}`} title={k}>{k[0].toUpperCase()}</button>
                                                ))}
                                            </div>
                                        </div>
                                        <KeyframeEditor points={pts} min={m.min} max={m.max} durationFrames={dur} onChange={setPts} />
                                        <div className="flex gap-1.5 mt-1.5">
                                            <button onClick={() => { const half = Math.max(2, Math.round(fps * 0.6)); setPts([{ frame: 0, value: m.min, interp: 'linear' }, { frame: half, value: m.neutral, interp: 'linear' }]); }}
                                                className="flex-1 text-[10px] py-1 rounded-md bg-white/5 hover:bg-white/10 text-white/60" title="Ramp in from minimum">Ramp In</button>
                                            <button onClick={() => { const half = Math.max(2, Math.round(fps * 0.6)); setPts([{ frame: Math.max(0, dur - half), value: m.neutral, interp: 'linear' }, { frame: dur, value: m.min, interp: 'linear' }]); }}
                                                className="flex-1 text-[10px] py-1 rounded-md bg-white/5 hover:bg-white/10 text-white/60" title="Ramp out to minimum">Ramp Out</button>
                                            <button onClick={() => setPts([])}
                                                className="px-2 text-[10px] py-1 rounded-md bg-white/5 hover:bg-white/10 text-white/40" title="Clear">Clear</button>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};
