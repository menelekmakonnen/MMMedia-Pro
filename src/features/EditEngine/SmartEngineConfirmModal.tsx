import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle2, Clock, Zap, Layers, PowerOff } from 'lucide-react';

interface SmartEngineConfirmModalProps {
    isOpen: boolean;
    analyzedCount: number;
    totalCount: number;
    onUseNow: () => void;
    onWaitAll: () => void;
    onProceedAll: () => void;
    onDisableSmart: () => void;
    onCancel: () => void;
}

export const SmartEngineConfirmModal: React.FC<SmartEngineConfirmModalProps> = ({
    isOpen,
    analyzedCount,
    totalCount,
    onUseNow,
    onWaitAll,
    onProceedAll,
    onDisableSmart,
    onCancel,
}) => {
    const progress = totalCount > 0 ? analyzedCount / totalCount : 0;
    const pct = Math.round(progress * 100);
    const isComplete = analyzedCount >= totalCount;

    // Pulsing dot animation for the "Wait for All" button
    const [waitDots, setWaitDots] = useState(0);
    useEffect(() => {
        if (!isOpen || isComplete) return;
        const id = setInterval(() => setWaitDots(d => (d + 1) % 4), 400);
        return () => clearInterval(id);
    }, [isOpen, isComplete]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="fixed inset-0 z-[9999] flex items-center justify-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    {/* Overlay */}
                    <motion.div
                        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                        onClick={onCancel}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    />

                    {/* Modal Card */}
                    <motion.div
                        className="relative w-[420px] max-w-[90vw] rounded-2xl border border-white/10 bg-gradient-to-br from-[#0f0a1a] via-[#0d0d14] to-[#0a0f1a] shadow-[0_0_60px_rgba(124,58,237,0.15)] overflow-hidden"
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                    >
                        {/* Top glow accent */}
                        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-64 h-24 bg-purple-500/20 blur-[50px] pointer-events-none rounded-full" />

                        <div className="relative p-6 space-y-5">
                            {/* Title */}
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-purple-500/15 border border-purple-500/20">
                                    <Loader2 size={18} className="text-purple-400 animate-spin" />
                                </div>
                                <div>
                                    <h3 className="text-base font-black tracking-tight text-white">
                                        Analysis In Progress
                                    </h3>
                                    <p className="text-[11px] text-white/40 mt-0.5">
                                        Smart Engine is analyzing your clips
                                    </p>
                                </div>
                            </div>

                            {/* Progress bar */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                                    <span className="text-white/40">Progress</span>
                                    <span className="text-purple-300 font-mono">
                                        {analyzedCount} / {totalCount} clips
                                    </span>
                                </div>
                                <div className="relative h-2 bg-white/5 rounded-full overflow-hidden">
                                    <motion.div
                                        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-purple-600 to-blue-500"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${pct}%` }}
                                        transition={{ duration: 0.4, ease: 'easeOut' }}
                                    />
                                    {/* Shimmer effect */}
                                    {!isComplete && (
                                        <div
                                            className="absolute inset-y-0 left-0 rounded-full"
                                            style={{ width: `${pct}%` }}
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_1.5s_infinite]" />
                                        </div>
                                    )}
                                </div>
                                <div className="text-right text-[10px] text-white/20 font-mono">{pct}%</div>
                            </div>

                            {/* Option buttons */}
                            <div className="space-y-2.5">
                                {/* Use Analyzed Clips */}
                                <button
                                    onClick={onUseNow}
                                    className="group w-full flex items-center gap-3 p-3.5 rounded-xl border border-purple-500/20 bg-gradient-to-r from-purple-600/15 to-purple-500/10 hover:from-purple-600/25 hover:to-purple-500/20 hover:border-purple-500/40 transition-all duration-200"
                                >
                                    <div className="p-1.5 rounded-lg bg-purple-500/20 group-hover:bg-purple-500/30 transition-colors">
                                        <Zap size={16} className="text-purple-300" />
                                    </div>
                                    <div className="text-left flex-1">
                                        <div className="text-sm font-bold text-white group-hover:text-purple-100 transition-colors">
                                            Use Analyzed Clips
                                        </div>
                                        <div className="text-[10px] text-white/40 mt-0.5">
                                            Proceed with {analyzedCount} of {totalCount} clips analyzed
                                        </div>
                                    </div>
                                    <CheckCircle2 size={16} className="text-purple-400/50 group-hover:text-purple-400 transition-colors" />
                                </button>

                                {/* Wait for All */}
                                <button
                                    onClick={onWaitAll}
                                    className="group w-full flex items-center gap-3 p-3.5 rounded-xl border border-blue-500/20 bg-gradient-to-r from-blue-600/15 to-blue-500/10 hover:from-blue-600/25 hover:to-blue-500/20 hover:border-blue-500/40 transition-all duration-200"
                                >
                                    <div className="p-1.5 rounded-lg bg-blue-500/20 group-hover:bg-blue-500/30 transition-colors">
                                        <Clock size={16} className="text-blue-300" />
                                    </div>
                                    <div className="text-left flex-1">
                                        <div className="text-sm font-bold text-white group-hover:text-blue-100 transition-colors">
                                            Wait for All
                                        </div>
                                        <div className="text-[10px] text-white/40 mt-0.5">
                                            Auto-continue when complete{!isComplete ? '.'.repeat(waitDots) : ''}
                                        </div>
                                    </div>
                                    {!isComplete && (
                                        <Loader2 size={14} className="text-blue-400/50 animate-spin" />
                                    )}
                                </button>

                                {/* Proceed With All Clips (analyzed + not-yet-analyzed) */}
                                <button
                                    onClick={onProceedAll}
                                    className="group w-full flex items-center gap-3 p-3.5 rounded-xl border border-emerald-500/20 bg-gradient-to-r from-emerald-600/15 to-emerald-500/10 hover:from-emerald-600/25 hover:to-emerald-500/20 hover:border-emerald-500/40 transition-all duration-200"
                                >
                                    <div className="p-1.5 rounded-lg bg-emerald-500/20 group-hover:bg-emerald-500/30 transition-colors">
                                        <Layers size={16} className="text-emerald-300" />
                                    </div>
                                    <div className="text-left flex-1">
                                        <div className="text-sm font-bold text-white group-hover:text-emerald-100 transition-colors">
                                            Proceed With All Clips
                                        </div>
                                        <div className="text-[10px] text-white/40 mt-0.5">
                                            Use all {totalCount} clips now — analyzed and not-yet-analyzed combined
                                        </div>
                                    </div>
                                    <CheckCircle2 size={16} className="text-emerald-400/50 group-hover:text-emerald-400 transition-colors" />
                                </button>

                                {/* Disable Smart Engine for this edit */}
                                <button
                                    onClick={onDisableSmart}
                                    className="group w-full flex items-center gap-3 p-3.5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 transition-all duration-200"
                                >
                                    <div className="p-1.5 rounded-lg bg-white/10 group-hover:bg-white/15 transition-colors">
                                        <PowerOff size={16} className="text-white/60" />
                                    </div>
                                    <div className="text-left flex-1">
                                        <div className="text-sm font-bold text-white/90 group-hover:text-white transition-colors">
                                            Disable Smart Engine
                                        </div>
                                        <div className="text-[10px] text-white/40 mt-0.5">
                                            Build the edit without Smart input (it keeps analyzing in the background)
                                        </div>
                                    </div>
                                </button>
                            </div>

                            {/* Cancel */}
                            <button
                                onClick={onCancel}
                                className="w-full text-center py-2 text-xs text-white/30 hover:text-white/60 transition-colors font-medium"
                            >
                                Cancel
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
