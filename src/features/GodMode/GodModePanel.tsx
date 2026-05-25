import React from 'react';
import { X, Crown } from 'lucide-react';
import { GodModeTab } from './GodModeTab';

interface GodModePanelProps {
    onClose: () => void;
}

export const GodModePanel: React.FC<GodModePanelProps> = ({ onClose }) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="relative w-full max-w-4xl max-h-[85vh] bg-[#0a0a1a] border border-yellow-500/20 rounded-2xl shadow-2xl shadow-yellow-500/10 overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-gradient-to-r from-yellow-900/20 to-transparent flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-gradient-to-br from-yellow-500 to-amber-600 shadow-lg shadow-yellow-500/20">
                            <Crown size={16} className="text-black" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-yellow-100 uppercase tracking-wider">God Mode</h3>
                            <p className="text-[9px] text-white/40">State Control & Inspector</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all border border-white/5 hover:border-white/20"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <GodModeTab />
                </div>
            </div>
        </div>
    );
};
