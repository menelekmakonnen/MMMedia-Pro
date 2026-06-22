import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

interface VisualFXCardProps {
    id: string;
    label: string;
    icon: string; // emoji
    description: string;
    value: number;
    min: number;
    max: number;
    step: number;
    unit?: string;
    onChange: (value: number) => void;
}

/* ────────────────────────────────────────────────────────────
 *  CSS-animated previews per FX type
 * ──────────────────────────────────────────────────────────── */

const VFX_PREVIEW_STYLES = `
/* ── Film Grain ── */
.vfx-grain { position: relative; overflow: hidden; }
.vfx-grain::after {
    content: ''; position: absolute; inset: -50%; width: 200%; height: 200%;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E");
    animation: vfx-grain-move 0.3s steps(3) infinite;
    pointer-events: none; mix-blend-mode: overlay;
}
@keyframes vfx-grain-move { 0% { transform: translate(0,0) } 33% { transform: translate(-10px,5px) } 66% { transform: translate(5px,-10px) } 100% { transform: translate(0,0) } }

/* ── Vignette ── */
.vfx-vignette { position: relative; overflow: hidden; }
.vfx-vignette::after {
    content: ''; position: absolute; inset: 0; border-radius: 4px;
    background: radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.8) 100%);
    animation: vfx-vig-pulse 1.5s ease-in-out infinite alternate;
    pointer-events: none;
}
@keyframes vfx-vig-pulse { 0% { opacity: 0.4 } 100% { opacity: 1 } }

/* ── Chromatic Aberration ── */
.vfx-chroma { position: relative; overflow: hidden; }
.vfx-chroma::before, .vfx-chroma::after {
    content: ''; position: absolute; inset: 0; border-radius: 4px; pointer-events: none;
}
.vfx-chroma::before { background: rgba(255,0,0,0.15); animation: vfx-chroma-r 0.8s ease-in-out infinite alternate; }
.vfx-chroma::after  { background: rgba(0,100,255,0.15); animation: vfx-chroma-b 0.8s ease-in-out infinite alternate-reverse; }
@keyframes vfx-chroma-r { 0% { transform: translateX(-2px) } 100% { transform: translateX(2px) } }
@keyframes vfx-chroma-b { 0% { transform: translateX(2px) } 100% { transform: translateX(-2px) } }

/* ── Letterbox ── */
.vfx-letterbox { position: relative; overflow: hidden; }
.vfx-letterbox::before, .vfx-letterbox::after {
    content: ''; position: absolute; left: 0; right: 0; background: #000; pointer-events: none;
    animation: vfx-lbox 1.2s ease-in-out infinite alternate;
}
.vfx-letterbox::before { top: 0; }
.vfx-letterbox::after  { bottom: 0; }
@keyframes vfx-lbox { 0% { height: 0 } 100% { height: 18% } }
`;

let vfxStylesInjected = false;
function injectVfxStyles() {
    if (vfxStylesInjected) return;
    const style = document.createElement('style');
    style.textContent = VFX_PREVIEW_STYLES;
    document.head.appendChild(style);
    vfxStylesInjected = true;
}

/** Map FX id to preview CSS class */
const VFX_PREVIEW_CLASS: Record<string, string> = {
    filmGrainAmount: 'vfx-grain',
    vignetteAmount: 'vfx-vignette',
    chromaticAmount: 'vfx-chroma',
    letterbox: 'vfx-letterbox',
};

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
    const [hovered, setHovered] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const isToggle = min === 0 && max === 1 && step === 1;
    const isActive = isToggle ? value === 1 : value > min;

    React.useEffect(() => { injectVfxStyles(); }, []);

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
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
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

                {/* Icon */}
                <span className="text-2xl leading-none select-none" aria-hidden>{icon}</span>

                {/* Label */}
                <span className={clsx(
                    'text-[9px] font-bold uppercase tracking-wider leading-tight text-center px-0.5 line-clamp-1',
                    isActive ? 'text-purple-200' : 'text-white/40'
                )}>
                    {label}
                </span>

                {/* ── Hover Preview Tooltip ── */}
                <AnimatePresence>
                    {hovered && (
                        <motion.div
                            initial={{ opacity: 0, y: 6, scale: 0.92 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 6, scale: 0.92 }}
                            transition={{ duration: 0.15 }}
                            className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 z-50 pointer-events-none"
                        >
                            <div className="bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl p-2.5 shadow-2xl min-w-[120px]">
                                {/* Animated FX preview */}
                                <div className={clsx(
                                    'relative w-[100px] h-[56px] rounded-md overflow-hidden mx-auto mb-2',
                                    VFX_PREVIEW_CLASS[id]
                                )}>
                                    <div className="absolute inset-0 rounded bg-gradient-to-br from-indigo-600 to-violet-500" />
                                </div>
                                {/* Description */}
                                <p className="text-[10px] text-white/60 text-center leading-snug">{description}</p>
                            </div>
                            {/* Tooltip arrow */}
                            <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 bg-black/90 border-r border-b border-white/10 rotate-45" />
                        </motion.div>
                    )}
                </AnimatePresence>
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
