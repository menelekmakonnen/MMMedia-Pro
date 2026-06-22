import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import type { TransitionType } from '../../types';
import { TRANSITION_META } from '../../lib/transitions';

interface TransitionCardProps {
    type: TransitionType;
    selected: boolean;
    onToggle: () => void;
}

/* ────────────────────────────────────────────────────────────
 *  CSS-animation class per transition category
 *  Each animation shows panel B replacing panel A
 * ──────────────────────────────────────────────────────────── */

const PREVIEW_STYLES = `
/* ── Shared panel base ── */
.tp-a, .tp-b { position: absolute; inset: 0; border-radius: 4px; }
.tp-a { background: linear-gradient(135deg, #7c3aed, #a855f7); }
.tp-b { background: linear-gradient(135deg, #3b82f6, #06b6d4); }

/* ── Basic: opacity ── */
.anim-fade .tp-b     { animation: tp-fade 1.2s ease-in-out infinite; }
@keyframes tp-fade   { 0%,15% { opacity:0 } 50%,100% { opacity:1 } }

.anim-cut .tp-b      { animation: tp-cut 1.2s steps(1) infinite; }
@keyframes tp-cut    { 0%,49% { opacity:0 } 50%,100% { opacity:1 } }

.anim-fadewhite .tp-b { animation: tp-fadewhite 1.2s ease-in-out infinite; }
.anim-fadewhite::after { content:''; position:absolute; inset:0; background:#fff; border-radius:4px; animation: tp-fw-flash 1.2s ease-in-out infinite; pointer-events:none; }
@keyframes tp-fadewhite { 0%,30% { opacity:0 } 60%,100% { opacity:1 } }
@keyframes tp-fw-flash  { 0% { opacity:0 } 30% { opacity:.8 } 60% { opacity:0 } 100% { opacity:0 } }

.anim-fadeblack .tp-b { animation: tp-fadeblack 1.2s ease-in-out infinite; }
.anim-fadeblack::after { content:''; position:absolute; inset:0; background:#000; border-radius:4px; animation: tp-fb-flash 1.2s ease-in-out infinite; pointer-events:none; }
@keyframes tp-fadeblack { 0%,30% { opacity:0 } 60%,100% { opacity:1 } }
@keyframes tp-fb-flash  { 0% { opacity:0 } 30% { opacity:.9 } 60% { opacity:0 } 100% { opacity:0 } }

.anim-dissolve .tp-b  { animation: tp-dissolve 1.2s ease-in-out infinite; mix-blend-mode: normal; }
@keyframes tp-dissolve { 0%,10% { opacity:0; filter:contrast(1.5) } 55%,100% { opacity:1; filter:contrast(1) } }

/* ── Directional: transform translate ── */
.anim-wipeleft .tp-b  { animation: tp-wipeleft 1.2s ease-in-out infinite; clip-path: inset(0 0 0 100%); }
@keyframes tp-wipeleft { 0%,15% { clip-path:inset(0 0 0 100%) } 60%,100% { clip-path:inset(0 0 0 0) } }

.anim-wiperight .tp-b { animation: tp-wiperight 1.2s ease-in-out infinite; clip-path: inset(0 100% 0 0); }
@keyframes tp-wiperight { 0%,15% { clip-path:inset(0 100% 0 0) } 60%,100% { clip-path:inset(0 0 0 0) } }

.anim-wipeup .tp-b    { animation: tp-wipeup 1.2s ease-in-out infinite; clip-path: inset(100% 0 0 0); }
@keyframes tp-wipeup   { 0%,15% { clip-path:inset(100% 0 0 0) } 60%,100% { clip-path:inset(0 0 0 0) } }

.anim-wipedown .tp-b  { animation: tp-wipedown 1.2s ease-in-out infinite; clip-path: inset(0 0 100% 0); }
@keyframes tp-wipedown { 0%,15% { clip-path:inset(0 0 100% 0) } 60%,100% { clip-path:inset(0 0 0 0) } }

.anim-slideleft .tp-b { animation: tp-slideleft 1.2s ease-in-out infinite; }
@keyframes tp-slideleft { 0%,15% { transform:translateX(100%) } 60%,100% { transform:translateX(0) } }

.anim-slideright .tp-b { animation: tp-slideright 1.2s ease-in-out infinite; }
@keyframes tp-slideright { 0%,15% { transform:translateX(-100%) } 60%,100% { transform:translateX(0) } }

.anim-slideup .tp-b   { animation: tp-slideup 1.2s ease-in-out infinite; }
@keyframes tp-slideup  { 0%,15% { transform:translateY(100%) } 60%,100% { transform:translateY(0) } }

.anim-slidedown .tp-b { animation: tp-slidedown 1.2s ease-in-out infinite; }
@keyframes tp-slidedown { 0%,15% { transform:translateY(-100%) } 60%,100% { transform:translateY(0) } }

/* ── Geometric: clip-path ── */
.anim-circlecrop .tp-b { animation: tp-circlecrop 1.2s ease-in-out infinite; }
@keyframes tp-circlecrop { 0%,15% { clip-path:circle(0% at 50% 50%) } 60%,100% { clip-path:circle(75% at 50% 50%) } }

.anim-circleopen .tp-b { animation: tp-circleopen 1.2s ease-in-out infinite; }
@keyframes tp-circleopen { 0%,15% { clip-path:circle(0% at 50% 50%) } 60%,100% { clip-path:circle(75% at 50% 50%) } }

.anim-circleclose .tp-b { animation: tp-circleclose 1.2s ease-in-out infinite; }
@keyframes tp-circleclose { 0%,15% { clip-path:circle(75% at 50% 50%) } 60%,100% { clip-path:circle(0% at 50% 50%) } }

.anim-radial .tp-b    { animation: tp-radial 1.2s linear infinite; }
@keyframes tp-radial  { 0%,15% { clip-path:polygon(50% 50%,50% 0%,50% 0%,50% 0%,50% 0%,50% 0%) } 30% { clip-path:polygon(50% 50%,50% 0%,100% 0%,100% 0%,100% 0%,100% 0%) } 45% { clip-path:polygon(50% 50%,50% 0%,100% 0%,100% 100%,100% 100%,100% 100%) } 55% { clip-path:polygon(50% 50%,50% 0%,100% 0%,100% 100%,0% 100%,0% 100%) } 70%,100% { clip-path:polygon(50% 50%,50% 0%,100% 0%,100% 100%,0% 100%,0% 0%) } }

.anim-pixelize .tp-b  { animation: tp-pixelize 1.2s ease-in-out infinite; image-rendering: pixelated; }
@keyframes tp-pixelize { 0%,15% { opacity:0; filter:blur(4px) } 35% { opacity:.5; filter:blur(2px) } 60%,100% { opacity:1; filter:blur(0) } }

/* ── Smooth: transform with easing ── */
.anim-smoothleft .tp-b  { animation: tp-smoothleft 1.2s cubic-bezier(.22,1,.36,1) infinite; }
@keyframes tp-smoothleft  { 0%,15% { transform:translateX(100%); opacity:0 } 60%,100% { transform:translateX(0); opacity:1 } }

.anim-smoothright .tp-b { animation: tp-smoothright 1.2s cubic-bezier(.22,1,.36,1) infinite; }
@keyframes tp-smoothright { 0%,15% { transform:translateX(-100%); opacity:0 } 60%,100% { transform:translateX(0); opacity:1 } }

.anim-smoothup .tp-b   { animation: tp-smoothup 1.2s cubic-bezier(.22,1,.36,1) infinite; }
@keyframes tp-smoothup  { 0%,15% { transform:translateY(100%); opacity:0 } 60%,100% { transform:translateY(0); opacity:1 } }

.anim-smoothdown .tp-b { animation: tp-smoothdown 1.2s cubic-bezier(.22,1,.36,1) infinite; }
@keyframes tp-smoothdown { 0%,15% { transform:translateY(-100%); opacity:0 } 60%,100% { transform:translateY(0); opacity:1 } }

/* ── Diagonal: clip-path polygon ── */
.anim-diagtl .tp-b    { animation: tp-diagtl 1.2s ease-in-out infinite; }
@keyframes tp-diagtl   { 0%,15% { clip-path:polygon(0 0,0 0,0 0) } 60%,100% { clip-path:polygon(0 0,200% 0,0 200%) } }

.anim-diagtr .tp-b    { animation: tp-diagtr 1.2s ease-in-out infinite; }
@keyframes tp-diagtr   { 0%,15% { clip-path:polygon(100% 0,100% 0,100% 0) } 60%,100% { clip-path:polygon(-100% 0,100% 0,100% 200%) } }

.anim-diagbl .tp-b    { animation: tp-diagbl 1.2s ease-in-out infinite; }
@keyframes tp-diagbl   { 0%,15% { clip-path:polygon(0 100%,0 100%,0 100%) } 60%,100% { clip-path:polygon(0 -100%,200% 100%,0 100%) } }

.anim-diagbr .tp-b    { animation: tp-diagbr 1.2s ease-in-out infinite; }
@keyframes tp-diagbr   { 0%,15% { clip-path:polygon(100% 100%,100% 100%,100% 100%) } 60%,100% { clip-path:polygon(100% -100%,-100% 100%,100% 100%) } }

/* ── Squeeze: scaleX / scaleY ── */
.anim-squeezeh .tp-b  { animation: tp-squeezeh 1.2s ease-in-out infinite; transform-origin: center; }
@keyframes tp-squeezeh { 0%,15% { transform:scaleX(0) } 60%,100% { transform:scaleX(1) } }

.anim-squeezev .tp-b  { animation: tp-squeezev 1.2s ease-in-out infinite; transform-origin: center; }
@keyframes tp-squeezev { 0%,15% { transform:scaleY(0) } 60%,100% { transform:scaleY(1) } }

/* ── Blur: filter blur ── */
.anim-hblur .tp-b     { animation: tp-hblur 1.2s ease-in-out infinite; }
@keyframes tp-hblur   { 0%,15% { opacity:0; filter:blur(8px) } 60%,100% { opacity:1; filter:blur(0) } }

/* ── Impact: flash / glitch effects ── */
.anim-flash .tp-b     { animation: tp-flash-b 1.2s ease-in-out infinite; }
.anim-flash::after    { content:''; position:absolute; inset:0; background:#fff; border-radius:4px; animation: tp-flash-w 1.2s ease-in-out infinite; pointer-events:none; }
@keyframes tp-flash-b { 0%,35% { opacity:0 } 55%,100% { opacity:1 } }
@keyframes tp-flash-w { 0%,25% { opacity:0 } 35% { opacity:1 } 55%,100% { opacity:0 } }

.anim-glitch .tp-b    { animation: tp-glitch 1.2s steps(4) infinite; }
@keyframes tp-glitch  { 0% { opacity:0; transform:translate(0) } 20% { opacity:1; transform:translate(-3px,2px) } 40% { transform:translate(3px,-1px) } 60% { transform:translate(-1px,3px) } 80%,100% { opacity:1; transform:translate(0) } }

.anim-rgb-split .tp-b { animation: tp-rgbsplit 1.2s ease-in-out infinite; }
@keyframes tp-rgbsplit { 0%,15% { opacity:0; filter:hue-rotate(0deg) } 30% { opacity:.6; filter:hue-rotate(90deg) } 50% { filter:hue-rotate(180deg) } 70%,100% { opacity:1; filter:hue-rotate(360deg) } }

.anim-zoom-through .tp-b { animation: tp-zoom 1.2s ease-in-out infinite; }
@keyframes tp-zoom    { 0%,15% { opacity:0; transform:scale(3) } 60%,100% { opacity:1; transform:scale(1) } }

.anim-spin .tp-b      { animation: tp-spin 1.2s ease-in-out infinite; }
@keyframes tp-spin    { 0%,15% { opacity:0; transform:rotate(-180deg) scale(.5) } 60%,100% { opacity:1; transform:rotate(0) scale(1) } }

.anim-film-burn .tp-b { animation: tp-filmburn-b 1.2s ease-in-out infinite; }
.anim-film-burn::after { content:''; position:absolute; inset:0; border-radius:4px; animation: tp-filmburn-o 1.2s ease-in-out infinite; pointer-events:none; background: linear-gradient(135deg, #f97316, #fbbf24, transparent); }
@keyframes tp-filmburn-b { 0%,35% { opacity:0 } 60%,100% { opacity:1 } }
@keyframes tp-filmburn-o { 0% { opacity:0 } 25% { opacity:.8 } 55%,100% { opacity:0 } }

.anim-whip .tp-b      { animation: tp-whip 1.2s ease-in-out infinite; }
@keyframes tp-whip    { 0%,15% { opacity:0; transform:translateX(100%); filter:blur(6px) } 50% { filter:blur(3px) } 60%,100% { opacity:1; transform:translateX(0); filter:blur(0) } }
`;

// Inject styles once
let stylesInjected = false;
function injectStyles() {
    if (stylesInjected) return;
    const style = document.createElement('style');
    style.textContent = PREVIEW_STYLES;
    document.head.appendChild(style);
    stylesInjected = true;
}

/** Map each TransitionType to its CSS animation class name */
function getAnimClass(type: TransitionType): string {
    return `anim-${type}`;
}

export const TransitionCard: React.FC<TransitionCardProps> = ({ type, selected, onToggle }) => {
    const [hovered, setHovered] = useState(false);
    const meta = TRANSITION_META[type];

    // Ensure styles are injected
    React.useEffect(() => { injectStyles(); }, []);

    return (
        <motion.button
            onClick={onToggle}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={clsx(
                'relative w-20 h-20 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all duration-200 cursor-pointer group',
                selected
                    ? 'bg-gradient-to-br from-purple-600/20 to-violet-600/20 border-purple-500/50 shadow-[0_0_12px_rgba(147,51,234,0.25)]'
                    : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06] hover:border-white/20'
            )}
        >
            {/* Selected checkmark badge */}
            <AnimatePresence>
                {selected && (
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

            {/* Icon */}
            <span className="text-2xl leading-none select-none" aria-hidden>{meta.icon}</span>

            {/* Label */}
            <span className={clsx(
                'text-[9px] font-bold uppercase tracking-wider leading-tight text-center px-0.5 line-clamp-1',
                selected ? 'text-purple-200' : 'text-white/40'
            )}>
                {meta.label}
            </span>

            {/* Custom badge */}
            {meta.isCustom && (
                <span className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-amber-400/60" title="Custom filter chain" />
            )}

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
                            {/* Animated preview */}
                            <div className={clsx('relative w-[100px] h-[56px] rounded-md overflow-hidden mx-auto mb-2', getAnimClass(type))}>
                                <div className="tp-a" />
                                <div className="tp-b" />
                            </div>
                            {/* Description */}
                            <p className="text-[10px] text-white/60 text-center leading-snug">{meta.description}</p>
                        </div>
                        {/* Tooltip arrow */}
                        <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 bg-black/90 border-r border-b border-white/10 rotate-45" />
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.button>
    );
};

export default TransitionCard;
