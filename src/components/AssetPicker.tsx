import React, { useState } from 'react';
import { Zap, Palette, X } from 'lucide-react';
import { useAssetStore } from '../store/assetStore';
import { useClipStore } from '../store/clipStore';

interface AssetPickerProps {
    clipId: string;
    onClose: () => void;
}

export const AssetPicker: React.FC<AssetPickerProps> = ({ clipId, onClose }) => {
    const { speedRamps, effects } = useAssetStore();
    const { updateClip } = useClipStore();
    const [activeTab, setActiveTab] = useState<'speed' | 'effects'>('speed');

    const applySpeedRamp = (rampId: string) => {
        updateClip(clipId, { speedRampId: rampId });
        console.log(`[AssetPicker] Applied speed ramp ${rampId} to clip ${clipId}`);
    };

    const applyEffect = (effectId: string) => {
        const clip = useClipStore.getState().clips.find(c => c.id === clipId);
        const currentEffects = clip?.effectIds || [];

        if (currentEffects.includes(effectId)) {
            // Remove if already applied
            updateClip(clipId, { effectIds: currentEffects.filter(id => id !== effectId) });
        } else {
            // Add effect
            updateClip(clipId, { effectIds: [...currentEffects, effectId] });
        }
        console.log(`[AssetPicker] Toggled effect ${effectId} on clip ${clipId}`);
    };

    const clip = useClipStore.getState().clips.find(c => c.id === clipId);
    const appliedEffects = clip?.effectIds || [];
    const appliedRamp = clip?.speedRampId;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0a0a14] border border-white/10 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="p-6 border-b border-white/10 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-white">Apply Assets to Clip</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full text-white/40 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/10">
                    <button
                        onClick={() => setActiveTab('speed')}
                        className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 transition-colors ${activeTab === 'speed'
                            ? 'bg-primary/20 text-primary border-b-2 border-primary'
                            : 'text-white/40 hover:text-white/60'
                            }`}
                    >
                        <Zap size={18} />
                        Speed Ramps
                    </button>
                    <button
                        onClick={() => setActiveTab('effects')}
                        className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 transition-colors ${activeTab === 'effects'
                            ? 'bg-primary/20 text-primary border-b-2 border-primary'
                            : 'text-white/40 hover:text-white/60'
                            }`}
                    >
                        <Palette size={18} />
                        Effects
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    {activeTab === 'speed' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {speedRamps.map(ramp => (
                                <button
                                    key={ramp.id}
                                    onClick={() => applySpeedRamp(ramp.id)}
                                    className={`p-4 rounded-lg border transition-all text-left ${appliedRamp === ramp.id
                                        ? 'bg-primary/20 border-primary/60 shadow-lg shadow-primary/20'
                                        : 'bg-white/5 border-white/10 hover:border-primary/40 hover:bg-white/10'
                                        }`}
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <Zap size={16} className={appliedRamp === ramp.id ? 'text-primary' : 'text-white/40'} />
                                        <h3 className="font-semibold text-white">{ramp.name}</h3>
                                    </div>
                                    <p className="text-sm text-white/60">{ramp.description}</p>
                                    {appliedRamp === ramp.id && (
                                        <div className="mt-2 text-xs text-primary font-medium">✓ Applied</div>
                                    )}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {effects.map(effect => {
                                const isApplied = appliedEffects.includes(effect.id);
                                return (
                                    <button
                                        key={effect.id}
                                        onClick={() => applyEffect(effect.id)}
                                        className={`p-4 rounded-lg border transition-all text-left ${isApplied
                                            ? 'bg-primary/20 border-primary/60 shadow-lg shadow-primary/20'
                                            : 'bg-white/5 border-white/10 hover:border-primary/40 hover:bg-white/10'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <Palette size={16} className={isApplied ? 'text-primary' : 'text-white/40'} />
                                            <h3 className="font-semibold text-white">{effect.name}</h3>
                                        </div>
                                        <p className="text-sm text-white/60">{effect.description}</p>
                                        {isApplied && (
                                            <div className="mt-2 text-xs text-primary font-medium">✓ Applied</div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/10 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors font-medium"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};
