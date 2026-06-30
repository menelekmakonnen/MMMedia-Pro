import React, { useState, useCallback } from 'react';
import { Copy, Trash2, Shuffle, Pin, PinOff, Volume2, VolumeX, Sparkles, ArrowRightLeft, Palette, Lock, Unlock, ArrowUpCircle, ArrowDownCircle, Repeat2, ChevronDown, ChevronRight, Layers, Paintbrush, Type, Music, Wrench, Zap, Blend } from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import { SpeedControl } from '../../components/SpeedControl';
import { AssetPicker } from '../../components/AssetPicker';
import { EffectsPanel } from './EffectsPanel';
import { ColorGradingPanel } from './ColorGradingPanel';
import { ColorLabPanel } from './ColorLabPanel';
import { TextOverlayPanel } from './TextOverlayPanel';
import { AudioEffectsPanel } from './AudioEffectsPanel';
import { DEFAULT_AUDIO_EFFECTS } from '../../lib/audioEffects';
import { toast } from '../../components/Toast';
import { useProjectStore } from '../../store/projectStore';
import { useViewStore } from '../../store/viewStore';
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
                        <ColorLabPanel clipId={clip.id} />
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
                        {/* Pitch Shift */}
                        <div className="flex items-center gap-2 mt-2">
                            <span className="text-[10px] text-white/40 w-14">Pitch</span>
                            <input
                                type="range"
                                min={-12}
                                max={12}
                                step={1}
                                value={clip.audioEffects?.pitchShift ?? 0}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    updateClip({
                                        audioEffects: {
                                            ...(clip.audioEffects || DEFAULT_AUDIO_EFFECTS),
                                            pitchShift: val,
                                        }
                                    });
                                }}
                                className="flex-1 h-1 accent-purple-500"
                            />
                            <span className="text-[10px] font-mono text-white/60 w-8 text-right">
                                {(clip.audioEffects?.pitchShift ?? 0) > 0 ? '+' : ''}{clip.audioEffects?.pitchShift ?? 0}st
                            </span>
                        </div>
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

            {/* Deflicker */}
            <div className="border-t border-white/5">
                <button
                    onClick={() => toggleSection('deflicker')}
                    className="flex items-center gap-2 w-full px-3 py-2 hover:bg-white/5 transition-colors"
                >
                    {expandedSections.deflicker
                        ? <ChevronDown size={12} className="text-white/30" />
                        : <ChevronRight size={12} className="text-white/30" />
                    }
                    <Zap size={13} className="text-amber-400/70" />
                    <span className="text-xs font-medium text-white/60">Deflicker</span>
                    {clip.deflicker?.enabled && (
                        <span className="ml-auto text-[10px] bg-amber-500/20 text-amber-300 px-1.5 rounded-full">
                            ON
                        </span>
                    )}
                </button>
                {expandedSections.deflicker && (
                    <div className="px-3 pb-3 space-y-2">
                        {/* Enable Toggle */}
                        <button
                            onClick={() => updateClip({
                                deflicker: {
                                    enabled: !clip.deflicker?.enabled,
                                    includeAudio: clip.deflicker?.includeAudio ?? true,
                                    layers: clip.deflicker?.layers ?? 3,
                                }
                            })}
                            className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg border transition-all ${
                                clip.deflicker?.enabled
                                    ? 'bg-amber-500/20 border-amber-500/30 text-amber-300'
                                    : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                            }`}
                        >
                            <span className="text-xs font-medium">Remove Flicker</span>
                            <span className="text-[10px]">{clip.deflicker?.enabled ? '✓ Active' : 'Off'}</span>
                        </button>

                        {clip.deflicker?.enabled && (
                            <>
                                {/* Audio Toggle */}
                                <button
                                    onClick={() => updateClip({ deflicker: { ...clip.deflicker!, includeAudio: !clip.deflicker!.includeAudio } })}
                                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg border transition-all ${
                                        clip.deflicker?.includeAudio
                                            ? 'bg-amber-500/15 border-amber-500/20 text-amber-300'
                                            : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                                    }`}
                                >
                                    <span className="text-xs">Include Audio</span>
                                    <span className="text-[10px]">{clip.deflicker?.includeAudio ? 'On' : 'Off'}</span>
                                </button>

                                {/* Layers Selector */}
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => updateClip({ deflicker: { ...clip.deflicker!, layers: 3 } })}
                                        className={`flex-1 text-[10px] py-1.5 rounded-lg border transition-all ${
                                            clip.deflicker?.layers === 3
                                                ? 'bg-amber-500/20 border-amber-500/30 text-amber-300'
                                                : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                                        }`}
                                    >
                                        3 Layers (Standard)
                                    </button>
                                    <button
                                        onClick={() => updateClip({ deflicker: { ...clip.deflicker!, layers: 5 } })}
                                        className={`flex-1 text-[10px] py-1.5 rounded-lg border transition-all ${
                                            clip.deflicker?.layers === 5
                                                ? 'bg-amber-500/20 border-amber-500/30 text-amber-300'
                                                : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                                        }`}
                                    >
                                        5 Layers (Heavy)
                                    </button>
                                </div>

                                {/* View in Player */}
                                <button
                                    onClick={() => useViewStore.getState().setActiveTab('videoplayer')}
                                    className="w-full py-1.5 bg-sky-500/20 text-sky-300 rounded-lg text-xs hover:bg-sky-500/30 transition-colors"
                                >
                                    ▶ View in Player
                                </button>

                                {/* Render Deflickered */}
                                <button
                                    onClick={async () => {
                                        if (!clip.path) return;
                                        const outPath = clip.path.replace(/\.(mp4|mov|avi|mkv)$/i, '_deflickered.mp4');
                                        try {
                                            toast.info('Rendering deflickered video...');
                                            const res = await (window as any).ipcRenderer.invoke('render-deflickered', {
                                                inputPath: clip.path,
                                                outputPath: outPath,
                                                layers: clip.deflicker?.layers ?? 3,
                                                includeAudio: clip.deflicker?.includeAudio ?? true,
                                                fps: useProjectStore.getState().settings.fps || 30,
                                            });
                                            if (res?.success) toast.success('Deflickered video saved!');
                                            else toast.error(res?.error || 'Deflicker render failed');
                                        } catch (e: any) {
                                            toast.error(e?.message || 'Deflicker render failed');
                                        }
                                    }}
                                    className="w-full py-1.5 bg-amber-500/20 text-amber-300 rounded-lg text-xs hover:bg-amber-500/30 transition-colors"
                                >
                                    ⚡ Render Deflickered Video
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Transition to Next Clip */}
            <div className="border-t border-white/5">
                <button
                    onClick={() => toggleSection('transition')}
                    className="flex items-center gap-2 w-full px-3 py-2 hover:bg-white/5 transition-colors"
                >
                    {expandedSections.transition
                        ? <ChevronDown size={12} className="text-white/30" />
                        : <ChevronRight size={12} className="text-white/30" />
                    }
                    <Blend size={13} className="text-cyan-400/70" />
                    <span className="text-xs font-medium text-white/60">Transition</span>
                    {clip.transition && clip.transition.type !== 'cut' && (
                        <span className="ml-auto text-[10px] bg-cyan-500/20 text-cyan-300 px-1.5 rounded-full">
                            {clip.transition.type}
                        </span>
                    )}
                </button>
                {expandedSections.transition && (
                    <div className="px-3 pb-3 space-y-3">
                        {/* Transition Type */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Type</label>
                            <select
                                value={clip.transition?.type || 'cut'}
                                onChange={(e) => {
                                    const type = e.target.value as import('../../types').TransitionType;
                                    if (type === 'cut') {
                                        updateClip({ transition: undefined });
                                    } else {
                                        updateClip({ transition: { type, durationFrames: clip.transition?.durationFrames || 15, params: clip.transition?.params } });
                                    }
                                }}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
                            >
                                <optgroup label="None">
                                    <option value="cut">Cut (No Transition)</option>
                                </optgroup>
                                <optgroup label="Cinematic">
                                    <option value="white-flash">✦ White Flash</option>
                                    <option value="film-burn">✦ Film Burn</option>
                                    <option value="zoom-through">✦ Zoom In/Out</option>
                                    <option value="subject-mask">✦ Subject Mask</option>
                                </optgroup>
                                <optgroup label="Fades">
                                    <option value="fade">Fade</option>
                                    <option value="fadewhite">Fade to White</option>
                                    <option value="fadeblack">Fade to Black</option>
                                    <option value="dissolve">Dissolve</option>
                                </optgroup>
                                <optgroup label="Slides">
                                    <option value="slideleft">Slide Left</option>
                                    <option value="slideright">Slide Right</option>
                                    <option value="slideup">Slide Up</option>
                                    <option value="slidedown">Slide Down</option>
                                </optgroup>
                                <optgroup label="Wipes">
                                    <option value="wipeleft">Wipe Left</option>
                                    <option value="wiperight">Wipe Right</option>
                                    <option value="circlecrop">Circle Crop</option>
                                    <option value="circleopen">Circle Open</option>
                                    <option value="circleclose">Circle Close</option>
                                    <option value="radial">Radial</option>
                                </optgroup>
                                <optgroup label="Impact">
                                    <option value="flash">Flash</option>
                                    <option value="glitch">Glitch</option>
                                    <option value="rgb-split">RGB Split</option>
                                    <option value="spin">Spin</option>
                                    <option value="whip">Whip Pan</option>
                                </optgroup>
                                <optgroup label="Stylized">
                                    <option value="double-exposure">Double Exposure</option>
                                    <option value="triple-exposure">Triple Exposure</option>
                                    <option value="vhs">VHS</option>
                                    <option value="boomerang">Boomerang</option>
                                    <option value="pixelize">Pixelize</option>
                                </optgroup>
                            </select>
                        </div>

                        {/* Duration */}
                        {clip.transition && clip.transition.type !== 'cut' && (
                            <>
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Duration</label>
                                        <span className="text-[10px] text-white/50">{clip.transition.durationFrames}f</span>
                                    </div>
                                    <input
                                        type="range" min={2} max={60} step={1}
                                        value={clip.transition.durationFrames}
                                        onChange={(e) => updateClip({ transition: { ...clip.transition!, durationFrames: parseInt(e.target.value) } })}
                                        className="w-full accent-cyan-500 h-1"
                                    />
                                </div>

                                {/* Blend Mode (for applicable transitions) */}
                                {['white-flash', 'film-burn', 'double-exposure', 'triple-exposure'].includes(clip.transition.type) && (
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Blend Mode</label>
                                        <select
                                            value={clip.blendMode || 'normal'}
                                            onChange={(e) => updateClip({ blendMode: e.target.value })}
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
                                        >
                                            <option value="normal">Normal</option>
                                            <option value="overlay">Overlay</option>
                                            <option value="screen">Screen</option>
                                            <option value="add">Add</option>
                                            <option value="multiply">Multiply</option>
                                            <option value="softlight">Soft Light</option>
                                            <option value="lighten">Lighten</option>
                                        </select>
                                    </div>
                                )}

                                {/* Motion Blur Angle (for slides & zooms) */}
                                {['slideleft', 'slideright', 'slideup', 'slidedown', 'zoom-through', 'whip'].includes(clip.transition.type) && (
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Motion Blur</label>
                                            <span className="text-[10px] text-white/50">{clip.motionBlurAngle ?? 360}°</span>
                                        </div>
                                        <input
                                            type="range" min={0} max={360} step={45}
                                            value={clip.motionBlurAngle ?? 360}
                                            onChange={(e) => updateClip({ motionBlurAngle: parseInt(e.target.value) })}
                                            className="w-full accent-cyan-500 h-1"
                                        />
                                    </div>
                                )}

                                {/* Subject Mask Controls */}
                                {clip.transition.type === 'subject-mask' && (
                                    <div className="space-y-2 border-t border-white/5 pt-2">
                                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Mask Mode</label>
                                        <select
                                            value={clip.maskIsolation?.mode ?? 'chromakey'}
                                            onChange={(e) => updateClip({
                                                maskIsolation: {
                                                    enabled: true,
                                                    mode: e.target.value as 'chromakey' | 'ml-segment',
                                                    chromakey: clip.maskIsolation?.chromakey ?? { color: '#00ff00', similarity: 0.3, blend: 0.1 },
                                                    mlSegment: clip.maskIsolation?.mlSegment ?? { model: 'u2net' },
                                                },
                                            })}
                                            className="w-full bg-white/5 border border-white/10 rounded text-[11px] text-white/80 py-1 px-2"
                                        >
                                            <option value="chromakey">Chroma Key (Green Screen)</option>
                                            <option value="ml-segment">ML Segmentation (AI)</option>
                                        </select>

                                        {/* Chroma-key controls */}
                                        {(clip.maskIsolation?.mode ?? 'chromakey') === 'chromakey' && (
                                            <div className="space-y-1.5 pl-1">
                                                <div className="flex items-center gap-2">
                                                    <label className="text-[10px] text-white/40 w-12">Color</label>
                                                    <input
                                                        type="color"
                                                        value={clip.maskIsolation?.chromakey?.color ?? '#00ff00'}
                                                        onChange={(e) => updateClip({
                                                            maskIsolation: {
                                                                ...clip.maskIsolation!,
                                                                enabled: true,
                                                                mode: 'chromakey',
                                                                chromakey: {
                                                                    ...clip.maskIsolation?.chromakey ?? { similarity: 0.3, blend: 0.1 },
                                                                    color: e.target.value,
                                                                },
                                                            },
                                                        })}
                                                        className="w-6 h-6 rounded border border-white/10 cursor-pointer"
                                                    />
                                                    <span className="text-[10px] text-white/50 font-mono">
                                                        {clip.maskIsolation?.chromakey?.color ?? '#00ff00'}
                                                    </span>
                                                </div>
                                                <div className="space-y-0.5">
                                                    <div className="flex justify-between">
                                                        <label className="text-[10px] text-white/40">Similarity</label>
                                                        <span className="text-[10px] text-white/50">{(clip.maskIsolation?.chromakey?.similarity ?? 0.3).toFixed(2)}</span>
                                                    </div>
                                                    <input type="range" min={0.01} max={1} step={0.01}
                                                        value={clip.maskIsolation?.chromakey?.similarity ?? 0.3}
                                                        onChange={(e) => updateClip({
                                                            maskIsolation: {
                                                                ...clip.maskIsolation!,
                                                                enabled: true,
                                                                mode: 'chromakey',
                                                                chromakey: {
                                                                    ...clip.maskIsolation?.chromakey ?? { color: '#00ff00', blend: 0.1 },
                                                                    similarity: parseFloat(e.target.value),
                                                                },
                                                            },
                                                        })}
                                                        className="w-full accent-emerald-500 h-1"
                                                    />
                                                </div>
                                                <div className="space-y-0.5">
                                                    <div className="flex justify-between">
                                                        <label className="text-[10px] text-white/40">Blend</label>
                                                        <span className="text-[10px] text-white/50">{(clip.maskIsolation?.chromakey?.blend ?? 0.1).toFixed(2)}</span>
                                                    </div>
                                                    <input type="range" min={0} max={1} step={0.01}
                                                        value={clip.maskIsolation?.chromakey?.blend ?? 0.1}
                                                        onChange={(e) => updateClip({
                                                            maskIsolation: {
                                                                ...clip.maskIsolation!,
                                                                enabled: true,
                                                                mode: 'chromakey',
                                                                chromakey: {
                                                                    ...clip.maskIsolation?.chromakey ?? { color: '#00ff00', similarity: 0.3 },
                                                                    blend: parseFloat(e.target.value),
                                                                },
                                                            },
                                                        })}
                                                        className="w-full accent-emerald-500 h-1"
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {/* ML Segmentation controls */}
                                        {clip.maskIsolation?.mode === 'ml-segment' && (
                                            <div className="space-y-1.5 pl-1">
                                                <div className="space-y-0.5">
                                                    <label className="text-[10px] text-white/40">Model</label>
                                                    <select
                                                        value={clip.maskIsolation?.mlSegment?.model ?? 'u2net'}
                                                        onChange={(e) => updateClip({
                                                            maskIsolation: {
                                                                ...clip.maskIsolation!,
                                                                mlSegment: {
                                                                    ...clip.maskIsolation?.mlSegment,
                                                                    model: e.target.value as 'u2net' | 'isnet-general' | 'sam',
                                                                },
                                                            },
                                                        })}
                                                        className="w-full bg-white/5 border border-white/10 rounded text-[11px] text-white/80 py-1 px-2"
                                                    >
                                                        <option value="u2net">U²-Net (Fast)</option>
                                                        <option value="isnet-general">IS-Net (Balanced)</option>
                                                        <option value="sam">SAM (Precise)</option>
                                                    </select>
                                                </div>
                                                {clip.maskIsolation?.mlSegment?.mattePath ? (
                                                    <div className="flex items-center gap-1.5 text-[10px] text-emerald-400/70">
                                                        <span>✓ Matte ready</span>
                                                        <span className="text-white/30 truncate max-w-[120px]">{clip.maskIsolation.mlSegment.mattePath.split(/[/\\]/).pop()}</span>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                const api = (window as any).api;
                                                                if (!api?.segmentSubject) return;
                                                                const result = await api.segmentSubject({
                                                                    path: clip.path,
                                                                    model: clip.maskIsolation?.mlSegment?.model ?? 'u2net',
                                                                });
                                                                if (result?.success && result.mattePath) {
                                                                    updateClip({
                                                                        maskIsolation: {
                                                                            ...clip.maskIsolation!,
                                                                            mlSegment: {
                                                                                ...clip.maskIsolation?.mlSegment,
                                                                                model: clip.maskIsolation?.mlSegment?.model ?? 'u2net',
                                                                                mattePath: result.mattePath,
                                                                            },
                                                                        },
                                                                    });
                                                                }
                                                            } catch {}
                                                        }}
                                                        className="w-full py-1.5 rounded text-[10px] font-semibold bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 transition-colors border border-violet-500/20"
                                                    >
                                                        Generate Matte
                                                    </button>
                                                )}
                                                <label className="flex items-center gap-1.5 text-[10px] text-white/40 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={clip.maskIsolation?.mlSegment?.invertMask ?? false}
                                                        onChange={(e) => updateClip({
                                                            maskIsolation: {
                                                                ...clip.maskIsolation!,
                                                                mlSegment: {
                                                                    ...clip.maskIsolation?.mlSegment,
                                                                    model: clip.maskIsolation?.mlSegment?.model ?? 'u2net',
                                                                    invertMask: e.target.checked,
                                                                },
                                                            },
                                                        })}
                                                        className="accent-violet-500"
                                                    />
                                                    Invert mask (isolate background)
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </>
    );
};
