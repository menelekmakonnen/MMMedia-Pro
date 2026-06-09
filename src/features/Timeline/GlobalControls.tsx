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

    const iconSize = Math.floor(18 * Math.min(1, Math.max(0.6, containerWidth / 64)));
    const compactMode = containerWidth < 140;
    const isSlim = slim || (orientation === 'vertical' && containerWidth < 180);
    const isVertical = orientation === 'vertical';
    const canFitRow = containerWidth >= 260; // Enough space for side-by-side buttons

    const simulateTask = (duration: number) => new Promise<void>(resolve => setTimeout(resolve, duration));
    const runAutoEdit = async () => { setGlobalFlux(); await simulateTask(1000); };

    const totalDuration = clips.reduce((max, clip) => Math.max(max, clip.endFrame), 0);
    const totalSeconds = totalDuration / (settings.fps || 30);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);

    return (
        <>
            <div className={`bg-[#080816] ${isVertical ? 'h-full border-l border-white/10 flex flex-col' : 'border-t border-white/10'} ${slim ? 'p-2 space-y-3 items-center' : 'p-3 space-y-3'} ${className}`}>

                {/* Stats Section (horizontal only) */}
                {!isVertical && sections.includes('stats') && (
                    <div className="flex items-center gap-4 border-b border-white/5 pb-0 order-1">
                        <div className={`flex ${isVertical ? 'w-full flex-col gap-2' : 'items-center gap-4'}`}>
                            <div className={`flex items-center gap-2 ${isSlim ? 'justify-center p-2' : 'px-3 py-2'} bg-white/5 rounded-lg border border-white/5`} title="Timeline Duration">
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
                            <div className={`flex items-center gap-2 ${isSlim ? 'justify-center p-2' : 'px-3 py-2'} bg-white/5 rounded-lg border border-white/5`} title="Total Assets">
                                <Layers size={iconSize} className="text-white/40" />
                                {!isSlim && (
                                    <div>
                                        <div className="text-[10px] text-white/30 uppercase tracking-tighter">Assets</div>
                                        <div className="text-sm font-mono text-white/90 leading-none">{clips.length}</div>
                                    </div>
                                )}
                            </div>
                        </div>
                        {!slim && (
                            <div className={`flex items-center gap-4 ml-2`}>
                                <label className="text-[10px] text-white/30 uppercase tracking-widest font-bold">Global Speed</label>
                                <SpeedControl value={globalPlaybackSpeed} onChange={setGlobalPlaybackSpeed} size="sm" />
                            </div>
                        )}
                    </div>
                )}

                {/* Automation Suite (horizontal only) */}
                {!isVertical && sections.includes('automation') && (
                    <div className="order-2 pt-2">
                        <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3`}>
                            <AutomationCard title="Auto-Edit" description="Trim & arrange clips" icon={Scissors} color="text-pink-500" onRun={runAutoEdit} compact={compactMode} iconSize={iconSize} />
                            <AutomationCard title="Viral 9:16" description="Vertical reformat" icon={Smartphone} color="text-primary" onRun={async () => await simulateTask(2000)} compact={compactMode} iconSize={iconSize} />
                            <AutomationCard title="Silence" description="Strip dead air" icon={Activity} color="text-emerald-500" onRun={async () => await simulateTask(1200)} compact={compactMode} iconSize={iconSize} />
                            <AutomationCard title="Captions" description="Auto-subtitles" icon={TypeIcon} color="text-orange-500" onRun={async () => await simulateTask(2500)} compact={compactMode} iconSize={iconSize} />
                            <AutomationCard title="Remix" description="Sync to music" icon={Music} color="text-accent" onRun={async () => await simulateTask(1800)} compact={compactMode} iconSize={iconSize} />
                            <AutomationCard title="Export" description="Post to social" icon={Share2} color="text-red-500" onRun={async () => await simulateTask(3000)} compact={compactMode} iconSize={iconSize} />
                        </div>
                    </div>
                )}

                {/* Actions & Mute Section */}
                {(sections.includes('actions') || sections.includes('mute')) && (
                    <div className={`order-3 ${isVertical ? 'flex flex-col gap-3 w-full pt-2' : 'flex flex-wrap items-center justify-between gap-4 border-t border-white/5 pt-4'}`}>

                        {/* Shuffle / Flux / Chaos — side-by-side when room */}
                        {sections.includes('actions') && (
                            <div className={`flex w-full ${isVertical ? (canFitRow ? 'flex-row gap-2' : 'flex-col gap-2') : 'items-center gap-3'}`}>
                                <button
                                    onClick={() => useClipStore.getState().shuffleClips()}
                                    className={`${isVertical ? `flex-1 ${canFitRow ? 'h-10' : 'h-10'} rounded-lg` : `h-10 px-6 ${slim ? 'w-10 px-0' : ''} rounded-xl`} bg-white/5 hover:bg-white/10 flex items-center justify-center gap-1.5 transition-all border border-white/5 hover:border-white/20 active:scale-95 group`}
                                    title="Shuffle Clip Order"
                                >
                                    <ArrowRightLeft size={15} className="text-white/60 group-hover:text-white flex-shrink-0" />
                                    {(!isSlim || canFitRow) && <span className="text-[10px] font-bold uppercase tracking-wider text-white/60 group-hover:text-white truncate">Shuffle</span>}
                                </button>

                                <button
                                    onClick={() => useClipStore.getState().setGlobalFlux()}
                                    className={`${isVertical ? `flex-1 ${canFitRow ? 'h-10' : 'h-10'} rounded-lg` : `h-10 px-6 ${slim ? 'w-10 px-0' : ''} rounded-xl`} bg-primary/20 hover:bg-primary/40 text-primary-light flex items-center justify-center gap-1.5 transition-all border border-primary/20 hover:border-primary/40 active:scale-95 group shadow-[0_0_10px_rgba(var(--color-primary),0.1)]`}
                                    title="Randomize All Durations & Segments"
                                >
                                    <Sparkles size={15} className="group-hover:scale-110 transition-transform flex-shrink-0" />
                                    {(!isSlim || canFitRow) && <span className="text-[10px] font-bold uppercase tracking-wider truncate">Flux</span>}
                                </button>

                                <button
                                    onClick={() => useClipStore.getState().chaos()}
                                    className={`${isVertical ? `flex-1 ${canFitRow ? 'h-10' : 'h-10'} rounded-lg` : `h-10 px-6 ${slim ? 'w-10 px-0' : ''} rounded-xl`} bg-red-500/10 hover:bg-red-500/20 text-red-500 flex items-center justify-center gap-1.5 transition-all border border-red-500/10 hover:border-red-500/30 active:scale-95 group`}
                                    title="Shuffle + Flux Everything"
                                >
                                    <Zap size={15} fill="currentColor" className="group-hover:animate-pulse flex-shrink-0" />
                                    {(!isSlim || canFitRow) && <span className="text-[10px] font-bold uppercase tracking-wider truncate">Chaos</span>}
                                </button>
                            </div>
                        )}

                        {/* Mute + God Mode — always side-by-side */}
                        {(sections.includes('mute') || sections.includes('actions')) && (
                            <div className={`flex ${isVertical ? 'flex-row gap-2 w-full' : 'items-center gap-3'}`}>
                                {sections.includes('mute') && (
                                    <button
                                        onClick={() => setGlobalMute(!globalMute)}
                                        className={`h-10 ${isVertical ? 'flex-1' : (slim ? 'w-10 px-0' : 'px-4 flex-1')} rounded-lg flex items-center gap-2 transition-all active:scale-95 justify-center border ${globalMute
                                            ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border-red-500/20'
                                            : 'bg-white/5 hover:bg-white/10 text-white/60 border-white/5 hover:border-white/20'
                                            }`}
                                        title={globalMute ? "Unmute All Clips" : "Mute All Clips"}
                                    >
                                        {globalMute ? <VolumeX size={15} /> : <Volume2 size={15} />}
                                        {!isSlim && <span className="text-[10px] font-bold uppercase tracking-wider truncate">{globalMute ? 'Muted' : 'Mute'}</span>}
                                    </button>
                                )}

                                {sections.includes('actions') && (
                                    <button
                                        onClick={() => setIsGodModeOpen(true)}
                                        className={`h-10 ${isVertical ? 'flex-1' : 'w-10'} bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/10 hover:border-purple-500/30 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 flex-shrink-0`}
                                        title="State Control & State Inspector"
                                    >
                                        <Wand2 size={15} />
                                        {isVertical && !isSlim && <span className="text-[10px] font-bold uppercase tracking-wider truncate">Inspector</span>}
                                    </button>
                                )}
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
