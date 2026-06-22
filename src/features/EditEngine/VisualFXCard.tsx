import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Film, Aperture, Scan, Monitor } from 'lucide-react';
import clsx from 'clsx';

interface VisualFXCardProps {
    id: string;
    label: string;
    icon: string; // lucide icon identifier
    description: string;
    value: number;
    min: number;
    max: number;
    step: number;
    unit?: string;
    onChange: (value: number) => void;
}

function VisualFXPreviewSVG({ id }: { id: string }) {
    const shared = 'w-10 h-7 overflow-hidden rounded-sm relative border border-white/10 bg-black/40 flex items-center justify-center';

    switch (id) {
        case 'filmGrainAmount':
            return (
                <div className={shared}>
                    <style>{`
                        @keyframes grain-noise {
                            0% { transform: translate(0, 0); }
                            10% { transform: translate(-1px, -1px); }
                            20% { transform: translate(-2px, 1px); }
                            30% { transform: translate(1px, -2px); }
                            40% { transform: translate(-1px, 2px); }
                            50% { transform: translate(2px, 1px); }
                            65% { transform: translate(1px, -1px); }
                            80% { transform: translate(-2px, -2px); }
                            90% { transform: translate(2px, 2px); }
                            100% { transform: translate(0, 0); }
                        }
                        .group:hover .grain-overlay {
                            animation: grain-noise 0.5s steps(5) infinite;
                            opacity: 0.6 !important;
                        }
                    `}</style>
                    <div className="absolute inset-0 bg-purple-900/20" />
                    <div
                        className="grain-overlay absolute inset-[-20px] opacity-10 pointer-events-none transition-opacity duration-300"
                        style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                        }}
                    />
                    <Film className="absolute inset-0 m-auto text-white/40 group-hover:text-white/80 transition-colors duration-300" size={14} />
                </div>
            );

        case 'vignetteAmount':
            return (
                <div className={shared}>
                    <div className="absolute inset-0 bg-purple-500/20 transition-all duration-300 group-hover:bg-purple-500/40" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_60%,rgba(0,0,0,0.85)_100%)] transition-all duration-500 ease-in-out group-hover:bg-[radial-gradient(circle_at_center,transparent_30%,rgba(0,0,0,0.95)_100%)]" />
                    <Aperture className="absolute inset-0 m-auto text-white/40 group-hover:text-white/80 transition-colors duration-300" size={14} />
                </div>
            );

        case 'chromaticAmount':
            return (
                <div className={shared}>
                    <style>{`
                        @keyframes chromatic-split-r {
                            0%, 100% { transform: translate(0, 0); }
                            50% { transform: translate(-2px, 0.5px); }
                        }
                        @keyframes chromatic-split-b {
                            0%, 100% { transform: translate(0, 0); }
                            50% { transform: translate(2px, -0.5px); }
                        }
                        .group:hover .chroma-r {
                            animation: chromatic-split-r 1s infinite ease-in-out;
                            opacity: 0.8;
                        }
                        .group:hover .chroma-b {
                            animation: chromatic-split-b 1s infinite ease-in-out;
                            opacity: 0.8;
                        }
                    `}</style>
                    <div className="absolute inset-0 bg-black/40" />
                    <div className="chroma-r absolute inset-0 flex items-center justify-center text-red-500/50 mix-blend-screen transition-all duration-300">
                        <Scan size={14} />
                    </div>
                    <div className="chroma-b absolute inset-0 flex items-center justify-center text-cyan-500/50 mix-blend-screen transition-all duration-300">
                        <Scan size={14} />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center text-white/40 group-hover:text-white/80 transition-colors duration-300">
                        <Scan size={14} />
                    </div>
                </div>
            );

        case 'letterbox':
            return (
                <div className={shared}>
                    <div className="absolute inset-0 bg-purple-500/10 transition-colors duration-300 group-hover:bg-purple-500/30" />
                    <div className="absolute top-0 left-0 right-0 h-0 bg-black transition-all duration-300 ease-in-out group-hover:h-[6px]" />
                    <div className="absolute bottom-0 left-0 right-0 h-0 bg-black transition-all duration-300 ease-in-out group-hover:h-[6px]" />
                    <Monitor className="absolute inset-0 m-auto text-white/40 group-hover:text-white/80 transition-colors duration-300" size={14} />
                </div>
            );

        default:
            return null;
    }
}

export const VisualFXCard: React.FC<VisualFXCardProps> = ({
    id,
    label,
    icon,
    description,
    value,
    min,
    max,
    step,
    unit,
    onChange,
}) => {
    const [expanded, setExpanded] = useState(false);
    const isToggle = min === 0 && max === 1 && step === 1;
    const isActive = isToggle ? value === 1 : value > min;

    const handleClick = () => {
        if (isToggle) {
            onChange(value === 1 ? 0 : 1);
        } else {
            setExpanded(prev => !prev);
        }
    };

    const displayValue = isToggle
        ? (value === 1 ? 'ON' : 'OFF')
        : `${value}${unit ?? ''}`;

    return (
        <div className="flex flex-col">
            <motion.button
                onClick={handleClick}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title={description}
                className={clsx(
                    'relative w-20 h-20 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all duration-200 cursor-pointer group',
                    isActive
                        ? 'bg-gradient-to-br from-purple-600/20 to-violet-600/20 border-purple-500/50 shadow-[0_0_12px_rgba(147,51,234,0.25)]'
                        : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06] hover:border-white/20'
                )}
            >
                {/* Value badge */}
                {isActive && (
                    <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 bg-purple-500 rounded-full text-[8px] font-bold text-white z-10 min-w-[18px] text-center">
                        {displayValue}
                    </span>
                )}

                {/* Animated FX Preview */}
                <VisualFXPreviewSVG id={id} />

                {/* Label */}
                <span className={clsx(
                    'text-[9px] font-bold uppercase tracking-wider leading-tight text-center px-0.5 line-clamp-1',
                    isActive ? 'text-purple-200' : 'text-white/40'
                )}>
                    {label}
                </span>
            </motion.button>

            {/* ── Expanded Slider (non-toggle only) ── */}
            <AnimatePresence>
                {expanded && !isToggle && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="pt-2 pb-1 px-0.5">
                            <input
                                type="range"
                                min={min}
                                max={max}
                                step={step}
                                value={value}
                                onChange={(e) => onChange(parseFloat(e.target.value))}
                                className="w-full accent-purple-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                            />
                            <div className="flex justify-between text-[8px] text-white/30 font-mono mt-0.5">
                                <span>{min}{unit}</span>
                                <span className="text-purple-300 font-bold">{value}{unit}</span>
                                <span>{max}{unit}</span>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default VisualFXCard;
