import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

interface ColorPresetCardProps {
    id: string;
    label: string;
    description: string;
    active: boolean;
    onToggle: () => void;
    previewGradient: string; // fallback if needed
}

function ColorPreviewSVG({ id }: { id: string }) {
    const shared = 'w-10 h-10 rounded-lg border border-white/10 overflow-hidden relative transition-all duration-300';
    
    switch (id) {
        case 'colorPerSection': // Auto Grade
            return (
                <div className={clsx(shared, "relative flex items-center justify-center bg-black/40 group")}>
                    {/* A spinning color wheel or gradient sector SVG */}
                    <svg viewBox="0 0 40 40" className="w-8 h-8 transition-transform duration-[1200ms] ease-in-out group-hover:rotate-180">
                        <defs>
                            <linearGradient id="auto-grade-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#3b82f6" />
                                <stop offset="50%" stopColor="#8b5cf6" />
                                <stop offset="100%" stopColor="#ec4899" />
                            </linearGradient>
                        </defs>
                        <circle cx="20" cy="20" r="16" fill="url(#auto-grade-grad)" />
                        <path d="M 20 20 L 20 4 A 16 16 0 0 1 36 20 Z" fill="rgba(255,255,255,0.15)" />
                        <path d="M 20 20 L 4 20 A 16 16 0 0 1 20 4 Z" fill="rgba(0,0,0,0.15)" />
                    </svg>
                </div>
            );
        case 'desaturationBuildup': // Desat Build
            return (
                <div className={clsx(shared, "relative bg-black/40 group overflow-hidden flex items-center justify-center")}>
                    {/* Left half is colorful, right half is gray. On hover, a desaturation wipe sweeps */}
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500" />
                    <div className="absolute inset-y-0 right-0 left-1/2 bg-gray-500 mix-blend-color transition-all duration-500 ease-in-out group-hover:left-0" />
                    <svg viewBox="0 0 40 40" className="w-8 h-8 relative z-10">
                        <circle cx="20" cy="20" r="14" fill="none" stroke="white" strokeWidth="2" strokeDasharray="3 3" />
                    </svg>
                </div>
            );
        case 'beatFlashEnabled': // Beat Flash
            return (
                <div className={clsx(shared, "relative bg-black/40 group overflow-hidden flex items-center justify-center")}>
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500 to-yellow-300 opacity-30 transition-opacity duration-300 group-hover:opacity-100" />
                    <style>{`
                        @keyframes beat-flash {
                            0%, 100% { transform: scale(1); opacity: 0.3; }
                            15% { transform: scale(1.3); opacity: 1; filter: brightness(1.5); }
                            30% { transform: scale(1); opacity: 0.3; }
                            45% { transform: scale(1.3); opacity: 1; filter: brightness(1.5); }
                            60% { transform: scale(1); opacity: 0.3; }
                        }
                        .group:hover .flash-circle {
                            animation: beat-flash 1.2s infinite ease-out;
                        }
                    `}</style>
                    <svg viewBox="0 0 40 40" className="w-8 h-8 relative z-10 overflow-visible">
                        <circle cx="20" cy="20" r="8" fill="white" className="flash-circle transition-all duration-300" style={{ transformOrigin: 'center' }} />
                        <circle cx="20" cy="20" r="14" fill="none" stroke="white" strokeWidth="1.5" className="flash-circle opacity-50" style={{ transformOrigin: 'center' }} />
                    </svg>
                </div>
            );
        default:
            return null;
    }
}

export const ColorPresetCard: React.FC<ColorPresetCardProps> = ({
    id,
    label,
    description,
    active,
    onToggle,
}) => {
    return (
        <motion.button
            onClick={onToggle}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title={description}
            className={clsx(
                'relative w-20 h-20 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer group',
                active
                    ? 'bg-gradient-to-br from-purple-600/20 to-violet-600/20 border-purple-500/50 shadow-[0_0_12px_rgba(147,51,234,0.25)]'
                    : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06] hover:border-white/20'
            )}
        >
            {/* Selected checkmark badge */}
            <AnimatePresence>
                {active && (
                    <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center z-10"
                    >
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Custom SVG preview with hover animations */}
            <ColorPreviewSVG id={id} />

            {/* Label */}
            <span className={clsx(
                'text-[9px] font-bold uppercase tracking-wider leading-tight text-center px-0.5 line-clamp-1',
                active ? 'text-purple-200' : 'text-white/40'
            )}>
                {label}
            </span>
        </motion.button>
    );
};

export default ColorPresetCard;
