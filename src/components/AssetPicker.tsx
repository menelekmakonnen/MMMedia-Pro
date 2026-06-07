import React, { useState } from 'react';
import { Palette, X } from 'lucide-react';
import { useAssetStore } from '../store/assetStore';
import { useClipStore } from '../store/clipStore';

interface AssetPickerProps {
    clipId: string;
    onClose: () => void;
}

export const AssetPicker: React.FC<AssetPickerProps> = ({ clipId, onClose }) => {
    const { effects } = useAssetStore();
    const { updateClip } = useClipStore();

    const applyEffect = (effectId: string) => {
        const clip = useClipStore.getState().clips.find(c => c.id === clipId);
        const currentEffects = clip?.effectIds || [];

        if (currentEffects.includes(effectId)) {
            updateClip(clipId, { effectIds: currentEffects.filter(id => id !== effectId) });
        } else {
            updateClip(clipId, { effectIds: [...currentEffects, effectId] });
        }
        console.log(`[AssetPicker] Toggled effect ${effectId} on clip ${clipId}`);
    };

    const clip = useClipStore.getState().clips.find(c => c.id === clipId);
    const appliedEffects = clip?.effectIds || [];

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

                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
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
