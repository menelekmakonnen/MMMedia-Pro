import React, { useState } from 'react';
import { Sparkles, Sliders, Trash2, Plus, Settings } from 'lucide-react';
import { useClipStore, type Clip } from '../../../store/clipStore';
import { useTimelineStore } from '../timeline/useTimelineStore';
import clsx from 'clsx';

interface EffectDef {
    id: string;
    name: string;
    category: 'color' | 'stylize' | 'transition' | 'transform';
    description: string;
    defaultParams: Record<string, number | string>;
}

const NLE_EFFECTS: EffectDef[] = [
    { id: 'vhs_glitch', name: 'VHS Tape Jitter', category: 'stylize', description: 'Retro tape distortion with scanlines and static noise', defaultParams: { speed: 50, noise: 40 } },
    { id: 'rgb_split', name: 'RGB Split', category: 'color', description: 'Chromatic aberration offset of Red, Green, Blue sub-pixels', defaultParams: { amount: 15 } },
    { id: 'dream_glow', name: 'Dreamy Bloom Glow', category: 'stylize', description: 'Diffuses highlights with soft high-radius bloom', defaultParams: { threshold: 45, radius: 60 } },
    { id: 'vibration_flash', name: 'Beat Flash Vibration', category: 'transition', description: 'Micro-shakes image coordinates synced to peak drops', defaultParams: { speed: 80, decay: 30 } },
    { id: 'lut_orange_teal', name: 'Orange & Teal Cinematic', category: 'color', description: 'Warm skin tones contrasted with deep cool shadows', defaultParams: { intensity: 75 } },
    { id: 'lut_cyberpunk', name: 'Neo-Tokyo Cyberpunk', category: 'color', description: 'Vibrant neon purple and turquoise color grade', defaultParams: { saturation: 80 } },
    { id: 'slowmo_flow', name: 'Optical Flow interpolation', category: 'transform', description: 'Smooth vector-based motion slow motion interpolation', defaultParams: { speed: 25 } },
];

export const EffectsBrowser: React.FC = () => {
    const clips = useClipStore((s) => s.clips);
    const updateClip = useClipStore((s) => s.updateClip);
    const selectedItemIds = useTimelineStore((s) => s.selectedItemIds);

    const [activeCategory, setActiveCategory] = useState<'all' | 'color' | 'stylize' | 'transition' | 'transform'>('all');

    // Get currently selected clip (if exactly one is selected)
    const selectedIdsArray = Array.from(selectedItemIds);
    const selectedClipId = selectedIdsArray.length === 1 ? selectedIdsArray[0] : null;
    const selectedClip = clips.find((c) => c.id === selectedClipId) as (Clip & { effectsChain?: any[] }) | undefined;

    // Filtered effects catalog
    const filteredEffects = NLE_EFFECTS.filter(
        (eff) => activeCategory === 'all' || eff.category === activeCategory
    );

    // Apply effect to selected clip
    const handleApplyEffect = (effect: EffectDef) => {
        if (!selectedClipId) return;

        const currentEffects = selectedClip?.effectsChain || [];
        const exists = currentEffects.some((e: any) => e.id === effect.id);
        if (exists) return; // Prevent duplicates

        const newEffectInstance = {
            id: effect.id,
            name: effect.name,
            params: { ...effect.defaultParams },
            enabled: true,
        };

        updateClip(selectedClipId, {
            effectsChain: [...currentEffects, newEffectInstance],
        } as any);
    };

    // Remove effect from selected clip
    const handleRemoveEffect = (effectId: string) => {
        if (!selectedClipId || !selectedClip) return;
        const currentEffects = selectedClip.effectsChain || [];
        updateClip(selectedClipId, {
            effectsChain: currentEffects.filter((e: any) => e.id !== effectId),
        } as any);
    };

    // Update effect parameters
    const handleUpdateParam = (effectId: string, paramKey: string, value: number) => {
        if (!selectedClipId || !selectedClip) return;
        const currentEffects = selectedClip.effectsChain || [];
        const updated = currentEffects.map((eff: any) => {
            if (eff.id === effectId) {
                return {
                    ...eff,
                    params: {
                        ...eff.params,
                        [paramKey]: value,
                    },
                };
            }
            return eff;
        });
        updateClip(selectedClipId, { effectsChain: updated } as any);
    };

    return (
        <div className="w-full h-full flex flex-col bg-[#0b0b18] select-none p-4 overflow-hidden">
            {/* Split layout: left = effect library, right = applied effect controls */}
            <div className="flex-1 flex gap-4 min-h-0">
                {/* Left side: Effects library list */}
                <div className="w-1/2 flex flex-col min-h-0 bg-[#0d0d22]/40 rounded-xl border border-white/[0.04] p-3">
                    <div className="mb-3 flex-shrink-0">
                        <h3 className="text-xs font-black text-white/50 tracking-wider mb-2 flex items-center gap-1.5 uppercase">
                            <Sparkles size={12} className="text-purple-400" />
                            NLE Effect Catalog
                        </h3>
                        <div className="flex bg-[#070712] p-0.5 rounded-lg border border-white/[0.03] gap-0.5">
                            {(['all', 'color', 'stylize', 'transition', 'transform'] as const).map((cat) => (
                                <button
                                    key={cat}
                                    onClick={() => setActiveCategory(cat)}
                                    className={clsx(
                                        'flex-1 text-[8px] font-black py-1.5 rounded-md uppercase transition-colors',
                                        activeCategory === cat
                                            ? 'bg-purple-500/25 text-purple-300'
                                            : 'text-white/35 hover:text-white/70'
                                    )}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Scrollable list of cards */}
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
                        {filteredEffects.map((eff) => (
                            <div
                                key={eff.id}
                                className="p-2.5 rounded-lg border border-white/[0.03] bg-[#0c0c1b]/60 hover:bg-[#12122b]/80 hover:border-purple-500/25 transition-all group flex items-start justify-between cursor-pointer"
                                onDoubleClick={() => handleApplyEffect(eff)}
                            >
                                <div className="flex-1 pr-3">
                                    <div className="text-[10px] font-bold text-white group-hover:text-purple-300 transition-colors">
                                        {eff.name}
                                    </div>
                                    <div className="text-[8px] text-white/30 mt-0.5 leading-normal">
                                        {eff.description}
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleApplyEffect(eff);
                                    }}
                                    disabled={!selectedClipId}
                                    className="p-1 rounded bg-[#161630] border border-white/5 hover:border-purple-500/40 text-white/50 hover:text-purple-300 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                                    title="Apply Effect to Selected Clip"
                                >
                                    <Plus size={10} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right side: Applied effects control inspector */}
                <div className="w-1/2 flex flex-col min-h-0 bg-[#0d0d22]/40 rounded-xl border border-white/[0.04] p-3">
                    <h3 className="text-xs font-black text-white/50 tracking-wider mb-2 flex items-center gap-1.5 uppercase flex-shrink-0">
                        <Sliders size={12} className="text-indigo-400" />
                        Applied Parameters
                    </h3>

                    {!selectedClip ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center text-white/20 p-4">
                            <Settings size={28} className="stroke-[1] mb-2 opacity-50" />
                            <p className="text-[10px]">Select a single clip on the timeline to configure applied effects parameters</p>
                        </div>
                    ) : !selectedClip.effectsChain || selectedClip.effectsChain.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center text-white/20 p-4">
                            <Sparkles size={28} className="stroke-[1] mb-2 opacity-50 text-purple-400" />
                            <p className="text-[10px] mb-1 font-bold">No FX Applied</p>
                            <p className="text-[8px] text-white/10 max-w-[160px]">Double click an effect card in the catalog on the left to apply it</p>
                        </div>
                    ) : (
                        /* List of applied effects with controls */
                        <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
                            {selectedClip.effectsChain.map((eff: any) => (
                                <div key={eff.id} className="p-3 rounded-lg border border-white/[0.04] bg-[#080816]">
                                    <div className="flex items-center justify-between border-b border-white/[0.04] pb-1.5 mb-2">
                                        <span className="text-[10px] font-black text-purple-300">{eff.name}</span>
                                        <button
                                            onClick={() => handleRemoveEffect(eff.id)}
                                            className="p-1 rounded hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-colors"
                                            title="Remove Effect"
                                        >
                                            <Trash2 size={10} />
                                        </button>
                                    </div>
                                    
                                    {/* Parameters Slider row */}
                                    <div className="space-y-2">
                                        {Object.entries(eff.params).map(([key, val]: [string, any]) => (
                                            <div key={key} className="flex flex-col gap-1">
                                                <div className="flex items-center justify-between text-[8px] font-mono">
                                                    <span className="text-white/40 uppercase">{key}</span>
                                                    <span className="text-indigo-400 font-bold">{val}</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min={0}
                                                    max={100}
                                                    value={val}
                                                    onChange={(e) => handleUpdateParam(eff.id, key, parseInt(e.target.value))}
                                                    className="w-full h-1 bg-[#121226] rounded-full cursor-pointer appearance-none accent-purple-500"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
