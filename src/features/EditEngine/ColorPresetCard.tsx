import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

interface ColorPresetCardProps {
    id: string;
    label: string;
    description: string;
    active: boolean;
    onToggle: () => void;
    previewGradient: string; // CSS gradient showing the color effect
}

export const ColorPresetCard: React.FC<ColorPresetCardProps> = ({
    id,
    label,
    description,
    active,
    onToggle,
    previewGradient,
}) => {
    const [hovered, setHovered] = useState(false);

    return (
        <motion.button
            onClick={onToggle}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
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

            {/* Gradient swatch */}
            <div
                className={clsx(
                    'w-10 h-10 rounded-lg border transition-all duration-200',
                    active ? 'border-purple-400/30 shadow-lg' : 'border-white/10'
                )}
                style={{ background: previewGradient }}
            />

            {/* Label */}
            <span className={clsx(
                'text-[9px] font-bold uppercase tracking-wider leading-tight text-center px-0.5 line-clamp-1',
                active ? 'text-purple-200' : 'text-white/40'
            )}>
                {label}
            </span>

            {/* ── Hover Description Tooltip ── */}
            <AnimatePresence>
                {hovered && (
                    <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.92 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.92 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 z-50 pointer-events-none"
                    >
                        <div className="bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl p-2.5 shadow-2xl min-w-[100px]">
                            <p className="text-[10px] text-white/60 text-center leading-snug whitespace-nowrap">{description}</p>
                        </div>
                        {/* Tooltip arrow */}
                        <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 bg-black/90 border-r border-b border-white/10 rotate-45" />
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.button>
    );
};

export default ColorPresetCard;
