import React from 'react';
import { Sparkles, VolumeX, Volume2, Layers, Shuffle, ArrowRightLeft, Zap, Clock } from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import { useProjectStore } from '../../store/projectStore';
import { SpeedControl } from '../../components/SpeedControl';

export const GlobalControls: React.FC = () => {
    const { clips, globalMute, setGlobalMute, globalPlaybackSpeed, setGlobalPlaybackSpeed } = useClipStore();
    const { settings } = useProjectStore();

    // Calculate total duration
    const totalDuration = clips.reduce((max, clip) => Math.max(max, clip.endFrame), 0);
    const totalSeconds = totalDuration / (settings.fps || 30);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);

    return (
        <div className="bg-surface-dark p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
                {/* Left Section: Stats */}
                <div className="flex items-center gap-4">
                    {/* Total Duration */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg">
                        <Clock size={16} className="text-white/40" />
                        <div>
                            <div className="text-xs text-white/40">Duration</div>
                            <div className="text-sm font-mono text-white/90">
                                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                            </div>
                        </div>
                    </div>

                    {/* Clip Count */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg">
                        <Layers size={16} className="text-white/40" />
                        <div>
                            <div className="text-xs text-white/40">Clips</div>
                            <div className="text-sm font-mono text-white/90">{clips.length}</div>
                        </div>
                    </div>

                    {/* Playback Speed */}
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-white/40">Speed</label>
                        <SpeedControl
                            value={globalPlaybackSpeed}
                            onChange={setGlobalPlaybackSpeed}
                            size="sm"
                        />
                    </div>
                </div>

                {/* Center Section: Actions */}
                <div className="flex items-center gap-2">
                    {/* Global Shuffle */}
                    <button
                        onClick={() => useClipStore.getState().shuffleClips()}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg flex items-center gap-2 transition-colors"
                        title="Shuffle Clip Order"
                    >
                        <ArrowRightLeft size={16} />
                        <span className="text-sm font-medium">Shuffle</span>
                    </button>

                    {/* Global Flux */}
                    <button
                        onClick={() => useClipStore.getState().setGlobalFlux()}
                        className="px-4 py-2 bg-accent/80 hover:bg-accent rounded-lg flex items-center gap-2 transition-colors"
                        title="Randomize All Durations & Segments"
                    >
                        <Sparkles size={16} />
                        <span className="text-sm font-medium">Flux</span>
                    </button>

                    {/* Chaos Mode */}
                    <button
                        onClick={() => useClipStore.getState().chaos()}
                        className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg flex items-center gap-2 transition-colors border border-red-500/20"
                        title="Shuffle + Flux Everything"
                    >
                        <Zap size={16} />
                        <span className="text-sm font-medium">Chaos</span>
                    </button>
                </div>

                {/* Right Section: Mute */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setGlobalMute(!globalMute)}
                        className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${globalMute
                                ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/20'
                                : 'bg-white/5 hover:bg-white/10 text-white/80'
                            }`}
                        title={globalMute ? "Unmute All Clips" : "Mute All Clips"}
                    >
                        {globalMute ? <VolumeX size={16} /> : <Volume2 size={16} />}
                        <span className="text-sm font-medium">{globalMute ? 'Unmute All' : 'Mute All'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
