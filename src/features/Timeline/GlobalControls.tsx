import React, { useState } from 'react';
import {
    Sparkles, VolumeX, Volume2, Layers, ArrowRightLeft, Zap,
    Clock, Wand2, Scissors, Smartphone, Activity, Type as TypeIcon,
    Music, Share2
} from 'lucide-react';
import { useClipStore } from '../../store/clipStore';
import { useProjectStore } from '../../store/projectStore';
import { SpeedControl } from '../../components/SpeedControl';
import { AutomationCard } from '../GodMode/AutomationCard';
import { GodModePanel } from '../GodMode/GodModePanel';

interface GlobalControlsProps {
    orientation?: 'horizontal' | 'vertical';
    slim?: boolean;
    className?: string;
    containerWidth?: number;
    sections?: ('stats' | 'automation' | 'actions' | 'mute')[];
}

export const GlobalControls: React.FC<GlobalControlsProps> = ({
    orientation = 'horizontal',
    slim = false,
    className = '',
    containerWidth = 200,
    sections = ['stats', 'automation', 'actions', 'mute']
}) => {
    const { clips, globalMute, setGlobalMute, globalPlaybackSpeed, setGlobalPlaybackSpeed, setGlobalFlux } = useClipStore();
    const { settings } = useProjectStore();
    const [isGodModeOpen, setIsGodModeOpen] = useState(false);

    // Dynamic Icon Sizing
    // If width < 60px, shrink icons. Base size is 18px.
    const iconScale = Math.min(1, Math.max(0.6, containerWidth / 64));
    const iconSize = Math.floor(18 * iconScale);
    const compactMode = containerWidth < 140; // Force compact if narrow

    // Override slim based on width if vertical
    const isSlim = slim || (orientation === 'vertical' && containerWidth < 180);

    const simulateTask = (duration: number) => {
        return new Promise<void>(resolve => setTimeout(resolve, duration));
    };

    const runAutoEdit = async () => {
        setGlobalFlux();
        await simulateTask(1000);
    };

    // Calculate total duration
    const totalDuration = clips.reduce((max, clip) => Math.max(max, clip.endFrame), 0);
    const totalSeconds = totalDuration / (settings.fps || 30);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);

    const isVertical = orientation === 'vertical';

    return (
        <>
            <div className={`bg-[#080816] ${isVertical ? 'h-full border-l border-white/10 flex flex-col' : 'border-t border-white/10'} ${slim ? 'p-2 space-y-4 items-center' : 'p-4 space-y-4'} ${className}`}>

                {/* Stats Section */}
                {sections.includes('stats') && (
                    <div className={`flex ${isVertical ? 'flex-col gap-3' : 'items-center gap-4 border-b border-white/5 pb-0'} order-1`}>
                        {isVertical && !slim && (
                            <div className="text-xs font-bold text-white/40 uppercase tracking-widest mb-1">Project Stats</div>
                        )}

                        <div className={`flex ${isVertical ? 'w-full flex-col gap-2' : 'items-center gap-4'}`}>
                            {/* Total Duration */}
                            <div className={`flex items-center gap-2 ${isSlim ? 'justify-center p-2' : 'px-3 py-2'} bg-white/5 rounded-lg border border-white/5 ${isVertical && !isSlim ? 'flex-1 mr-2' : ''}`} title="Timeline Duration">
                                <Clock size={iconSize} className="text-white/40" />
                                {!isSlim && (
                                    <div>
                                        <div className="text-[10px] text-white/30 uppercase tracking-tighter">Timeline</div>
                                        <div className="text-sm font-mono text-white/90 leading-none">
                                            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Clip Count */}
                            <div className={`flex items-center gap-2 ${isSlim ? 'justify-center p-2' : 'px-3 py-2'} bg-white/5 rounded-lg border border-white/5 ${isVertical && !isSlim ? 'flex-1' : ''}`} title="Total Assets">
                                <Layers size={iconSize} className="text-white/40" />
                                {!isSlim && (
                                    <div>
                                        <div className="text-[10px] text-white/30 uppercase tracking-tighter">Assets</div>
                                        <div className="text-sm font-mono text-white/90 leading-none">{clips.length}</div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Playback Speed */}
                        {/* Hide speed control in slim mode for now, or just show icon? Let's hide it or make it very compact if feasible. User wants "very slim". */}
                        {!slim && (
                            <div className={`flex items-center gap-4 ${isVertical ? 'w-full justify-between bg-white/5 p-2 rounded-lg border border-white/5' : 'ml-2'}`}>
                                <label className="text-[10px] text-white/30 uppercase tracking-widest font-bold">Global Speed</label>
                                <SpeedControl
                                    value={globalPlaybackSpeed}
                                    onChange={setGlobalPlaybackSpeed}
                                    size="sm"
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Automation Suite */}
                {sections.includes('automation') && (
                    <div className={`order-2 ${isVertical ? 'flex-1 overflow-y-auto min-h-0 custom-scrollbar w-full' : 'pt-2'}`}>
                        {isVertical && !slim && (
                            <div className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3 mt-2">Automation</div>
                        )}
                        <div className={`grid ${isVertical ? 'grid-cols-1 gap-2' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3'}`}>
                            {/* In slim mode, Automation cards should be icon only? AutomationCard needs support for that or we just map differently */}
                            <AutomationCard title="Auto-Edit" description="Trim & arrange clips" icon={Scissors} color="text-pink-500" onRun={runAutoEdit} compact={compactMode} iconSize={iconSize} />
                            <AutomationCard title="Viral 9:16" description="Vertical reformat" icon={Smartphone} color="text-indigo-500" onRun={async () => await simulateTask(2000)} compact={compactMode} iconSize={iconSize} />
                            <AutomationCard title="Silence" description="Strip dead air" icon={Activity} color="text-emerald-500" onRun={async () => await simulateTask(1200)} compact={compactMode} iconSize={iconSize} />
                            <AutomationCard title="Captions" description="Auto-subtitles" icon={TypeIcon} color="text-orange-500" onRun={async () => await simulateTask(2500)} compact={compactMode} iconSize={iconSize} />
                            <AutomationCard title="Remix" description="Sync to music" icon={Music} color="text-blue-500" onRun={async () => await simulateTask(1800)} compact={compactMode} iconSize={iconSize} />
                            <AutomationCard title="Export" description="Post to social" icon={Share2} color="text-red-500" onRun={async () => await simulateTask(3000)} compact={compactMode} iconSize={iconSize} />
                        </div>
                    </div>
                )}

                {/* Actions & Mute Section */}
                {(sections.includes('actions') || sections.includes('mute')) && (
                    <div className={`order-3 ${isVertical ? 'flex flex-col gap-3 mt-auto pt-4 border-t border-white/5 w-full' : 'flex flex-wrap items-center justify-between gap-4 border-t border-white/5 pt-4'}`}>

                        {/* Center Section: Actions */}
                        {sections.includes('actions') && (
                            <div className={`flex ${isVertical ? 'flex-col gap-3' : 'items-center gap-3'}`}>
                                <button
                                    onClick={() => useClipStore.getState().shuffleClips()}
                                    className={`h-10 ${slim ? 'px-0 w-10 justify-center' : 'px-6'} bg-white/5 hover:bg-white/10 rounded-xl flex items-center ${isVertical ? (slim ? 'justify-center' : 'justify-between') : 'gap-2'} transition-all border border-white/10 hover:border-white/20 active:scale-95 group`}
                                    title="Shuffle Clip Order"
                                >
                                    <div className="flex items-center gap-2">
                                        <ArrowRightLeft size={iconSize} className="text-white/60 group-hover:text-white" />
                                        {!isSlim && <span className="text-sm font-bold text-white/80 group-hover:text-white">SHUFFLE</span>}
                                    </div>
                                </button>

                                <button
                                    onClick={() => useClipStore.getState().setGlobalFlux()}
                                    className={`h-10 ${slim ? 'px-0 w-10 justify-center' : 'px-6'} bg-primary/20 hover:bg-primary/40 text-primary-light rounded-xl flex items-center ${isVertical ? (slim ? 'justify-center' : 'justify-between') : 'gap-2'} transition-all border border-primary/20 hover:border-primary/40 active:scale-95 group shadow-lg shadow-primary/10`}
                                    title="Randomize All Durations & Segments"
                                >
                                    <div className="flex items-center gap-2">
                                        <Sparkles size={iconSize} className="group-hover:scale-110 transition-transform" />
                                        {!isSlim && <span className="text-sm font-bold">FLUX EVERYTHING</span>}
                                    </div>
                                </button>

                                <button
                                    onClick={() => useClipStore.getState().chaos()}
                                    className={`h-10 ${slim ? 'px-0 w-10 justify-center' : 'px-6'} bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl flex items-center ${isVertical ? (slim ? 'justify-center' : 'justify-between') : 'gap-2'} transition-all border border-red-500/20 hover:border-red-500/40 active:scale-95 group`}
                                    title="Shuffle + Flux Everything"
                                >
                                    <div className="flex items-center gap-2">
                                        <Zap size={iconSize} fill="currentColor" className="group-hover:animate-pulse" />
                                        {!isSlim && <span className="text-sm font-bold">CHAOS</span>}
                                    </div>
                                </button>
                            </div>
                        )}

                        {/* Right/Bottom Section: God Mode & Mute */}
                        {(sections.includes('mute') || sections.includes('actions')) && (
                            <div className={`flex ${isVertical ? (slim ? 'flex-col-reverse gap-3 items-center mt-2' : 'items-center justify-between mt-2') : 'items-center gap-3'}`}>
                                <div className={`flex items-center gap-3 w-full ${slim ? 'flex-col gap-3' : 'justify-end'}`}>
                                    {sections.includes('mute') && (
                                        <button
                                            onClick={() => setGlobalMute(!globalMute)}
                                            className={`h-10 ${slim ? 'w-10 px-0' : 'px-4 flex-1'} rounded-xl flex items-center gap-2 transition-all active:scale-95 justify-center ${globalMute
                                                ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/20 shadow-lg shadow-red-500/10'
                                                : 'bg-white/5 hover:bg-white/10 text-white/80 border border-white/10'
                                                }`}
                                            title={globalMute ? "Unmute All Clips" : "Mute All Clips"}
                                        >
                                            {globalMute ? <VolumeX size={iconSize} /> : <Volume2 size={iconSize} />}
                                            {isVertical && !isSlim && <span className="text-xs font-bold ml-1">{globalMute ? 'MUTED' : 'MUTE'}</span>}
                                        </button>
                                    )}

                                    {/* Show God Mode button if actions are enabled, or if explicitly desired. I'll tie it to actions for now as it's a control. */}
                                    {sections.includes('actions') && (
                                        <button
                                            onClick={() => setIsGodModeOpen(true)}
                                            className="h-10 w-10 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 rounded-xl flex items-center justify-center transition-all active:scale-95 flex-shrink-0"
                                            title="State Control & State Inspector"
                                        >
                                            <Wand2 size={iconSize} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

            </div>

            {/* God Mode Modal */}
            {isGodModeOpen && (
                <GodModePanel onClose={() => setIsGodModeOpen(false)} />
            )}
        </>
    );
};
