import React, { useState } from 'react';
import { Copy, Trash2, Shuffle, Pin, PinOff, Volume2, VolumeX, Sparkles, ArrowRightLeft, Palette, Lock, Unlock, ArrowUpCircle, ArrowDownCircle, Wand2 } from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import { SpeedControl } from '../../components/SpeedControl';
import { AssetPicker } from '../../components/AssetPicker';

interface ClipControlsProps {
    clipId: string;
    variant?: 'sidebar' | 'player'; // Added variant prop
}

export const ClipControls: React.FC<ClipControlsProps> = ({ clipId, variant = 'sidebar' }) => {
    const { clips, duplicateClip, deleteClip, randomizeSegment, pinClip, lockClip, setClipVolume, setClipMuted, setClipSpeed, moveClip } = useClipStore();
    const clip = clips.find((c) => c.id === clipId);
    const [showAssetPicker, setShowAssetPicker] = useState(false);
    const [showStyleMenu, setShowStyleMenu] = useState(false);

    const applyStyle = (styleName: 'rubber-band-standard' | 'rubber-band-zoom' | 'rubber-band-zoom-speed' | 'rubber-band-extreme' | 'multi-boomerang' | 'triple-shot' | 'rubber-band' | 'rubber-band-speed') => {
        useClipStore.getState().applyEditingStyle(clipId, styleName);
        setShowStyleMenu(false);
    };

    if (!clip) return null;

    const isPinned = clip.isPinned || false;
    const isLocked = clip.locked || false;
    const volume = clip.volume ?? 100;
    const isMuted = clip.isMuted || false;
    const speed = clip.speed ?? 1.0;

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
                    title="Apply Speed Ramps & Effects"
                >
                    <Palette size={16} className="text-primary" />
                </button>

                <div className="relative">
                    <button
                        onClick={() => setShowStyleMenu(!showStyleMenu)}
                        className={`p-1.5 rounded transition-colors flex items-center gap-1 ${showStyleMenu ? 'bg-indigo-500/30' : 'hover:bg-indigo-500/20'}`}
                        title="Apply Custom Editing Style"
                    >
                        <Wand2 size={16} className="text-indigo-400" />
                    </button>
                    
                    {showStyleMenu && (
                        <div className="absolute top-full left-0 mt-1 w-48 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden py-1">
                            <div className="px-3 py-2 text-[10px] font-black text-white/40 uppercase tracking-widest bg-black/40">Custom Styles</div>
                            <button onClick={() => applyStyle('rubber-band-standard')} className="w-full text-left px-3 py-2 text-xs font-bold text-white/80 hover:bg-white/10 transition-colors">Rubber Band (Standard)</button>
                            <button onClick={() => applyStyle('rubber-band-zoom')} className="w-full text-left px-3 py-2 text-xs font-bold text-white/80 hover:bg-white/10 transition-colors">Rubber Band (Zoom Only)</button>
                            <button onClick={() => applyStyle('rubber-band-zoom-speed')} className="w-full text-left px-3 py-2 text-xs font-bold text-white/80 hover:bg-white/10 transition-colors">Zoom + Speed Ramp</button>
                            <button onClick={() => applyStyle('rubber-band-extreme')} className="w-full text-left px-3 py-2 text-xs font-bold text-white/80 hover:bg-white/10 transition-colors">Rubber Band (Extreme)</button>
                            <button onClick={() => applyStyle('multi-boomerang')} className="w-full text-left px-3 py-2 text-xs font-bold text-white/80 hover:bg-white/10 transition-colors border-t border-white/5 mt-0.5 pt-2">Multi-Boomerang</button>
                            <button onClick={() => applyStyle('triple-shot')} className="w-full text-left px-3 py-2 text-xs font-bold text-white/80 hover:bg-white/10 transition-colors">Triple-Shot (A→B→A)</button>
                        </div>
                    )}
                </div>

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
        </>
    );
};
