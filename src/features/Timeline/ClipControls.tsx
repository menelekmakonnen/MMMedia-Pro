import React from 'react';
import { Copy, Trash2, Shuffle, Pin, PinOff, Volume2, VolumeX, Sparkles, ArrowRightLeft } from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import { SpeedControl } from '../../components/SpeedControl';

interface ClipControlsProps {
    clipId: string;
}

export const ClipControls: React.FC<ClipControlsProps> = ({ clipId }) => {
    const { clips, duplicateClip, deleteClip, randomizeSegment, pinClip, setClipVolume, setClipMuted, setClipSpeed } = useClipStore();
    const clip = clips.find((c) => c.id === clipId);

    if (!clip) return null;

    const isPinned = clip.isPinned || false;
    const volume = clip.volume ?? 100;
    const isMuted = clip.isMuted || false;
    const speed = clip.speed ?? 1.0;

    return (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-surface-dark/50 border-t border-white/5">
            {/* Action Buttons */}
            <button
                onClick={() => duplicateClip(clipId)}
                className="p-1.5 hover:bg-white/10 rounded transition-colors"
                title="Duplicate Clip"
            >
                <Copy size={16} className="text-white/60" />
            </button>

            <button
                onClick={() => deleteClip(clipId)}
                className="p-1.5 hover:bg-red-500/20 rounded transition-colors"
                title="Delete Clip"
            >
                <Trash2 size={16} className="text-red-400/60" />
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
                onClick={() => useClipStore.getState().randomizeClipDuration(clipId)}
                className="p-1.5 hover:bg-accent/20 rounded transition-colors"
                title="Flux: Randomize Duration & Segment"
            >
                <Sparkles size={16} className="text-accent" />
            </button>

            <button
                onClick={() => pinClip(clipId, !isPinned)}
                className={`p-1.5 hover:bg-white/10 rounded transition-colors ${isPinned ? 'bg-accent/20' : ''}`}
                title={isPinned ? 'Unpin Clip' : 'Pin Clip'}
            >
                {isPinned ? <Pin size={16} className="text-accent" /> : <PinOff size={16} className="text-white/60" />}
            </button>

            <div className="h-4 w-px bg-white/10 mx-1" />

            {/* Volume Controls */}
            <button
                onClick={() => setClipMuted(clipId, !isMuted)}
                className="p-1.5 hover:bg-white/10 rounded transition-colors"
                title={isMuted ? 'Unmute' : 'Mute'}
            >
                {isMuted ? <VolumeX size={16} className="text-white/40" /> : <Volume2 size={16} className="text-white/60" />}
            </button>

            {!clip.isFolded && (
                <>
                    <div className="flex items-center gap-2 flex-1 min-w-[100px]">
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
    );
};
