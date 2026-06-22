import React from 'react';
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
 *  Inline SVG transition preview per type.
 *  Each returns an SVG with two panels (A = purple, B = blue)
 *  animated via CSS `transition` + Tailwind `group-hover:`.
 *
 *  Panel A is the "current clip", Panel B is the "incoming clip".
 *  On hover the parent `group` triggers the animation.
 * ──────────────────────────────────────────────────────────── */

const A_COLOR = '#8b5cf6'; // purple-500
const B_COLOR = '#3b82f6'; // blue-500

function TransitionPreviewSVG({ type }: { type: TransitionType }) {
    const shared = 'w-10 h-7';

    switch (type) {
        /* ── Basic opacity ── */
        case 'fade':
            return (
                <svg viewBox="0 0 40 28" className={clsx(shared, 'overflow-hidden rounded-sm')}>
                    <rect x="0" y="0" width="40" height="28" fill={A_COLOR}
                        className="transition-opacity duration-[600ms] ease-in-out group-hover:opacity-0" />
                    <rect x="0" y="0" width="40" height="28" fill={B_COLOR}
                        className="opacity-0 transition-opacity duration-[600ms] ease-in-out group-hover:opacity-100" />
                </svg>
            );

        case 'cut':
            return (
                <svg viewBox="0 0 40 28" className={clsx(shared, 'overflow-hidden rounded-sm')}>
                    <rect x="0" y="0" width="40" height="28" fill={A_COLOR}
                        className="transition-opacity duration-0 group-hover:opacity-0" />
                    <rect x="0" y="0" width="40" height="28" fill={B_COLOR}
                        className="opacity-0 transition-opacity duration-0 group-hover:opacity-100" />
                </svg>
            );

        case 'fadewhite':
            return (
                <svg viewBox="0 0 40 28" className={clsx(shared, 'overflow-hidden rounded-sm')}>
                    <rect x="0" y="0" width="40" height="28" fill={A_COLOR}
                        className="transition-opacity duration-[600ms] ease-in-out group-hover:opacity-0" />
                    <rect x="0" y="0" width="40" height="28" fill="#ffffff"
                        className="opacity-0 transition-opacity duration-[300ms] ease-in-out group-hover:opacity-80" />
                    <rect x="0" y="0" width="40" height="28" fill={B_COLOR}
                        className="opacity-0 transition-opacity duration-[600ms] ease-in-out delay-[200ms] group-hover:opacity-100" />
                </svg>
            );

        case 'fadeblack':
            return (
                <svg viewBox="0 0 40 28" className={clsx(shared, 'overflow-hidden rounded-sm')}>
                    <rect x="0" y="0" width="40" height="28" fill={A_COLOR}
                        className="transition-opacity duration-[600ms] ease-in-out group-hover:opacity-0" />
                    <rect x="0" y="0" width="40" height="28" fill="#000000"
                        className="opacity-0 transition-opacity duration-[300ms] ease-in-out group-hover:opacity-90" />
                    <rect x="0" y="0" width="40" height="28" fill={B_COLOR}
                        className="opacity-0 transition-opacity duration-[600ms] ease-in-out delay-[200ms] group-hover:opacity-100" />
                </svg>
            );

        case 'dissolve':
            return (
                <svg viewBox="0 0 40 28" className={clsx(shared, 'overflow-hidden rounded-sm')}>
                    <defs>
                        <filter id="dissolve-px">
                            <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" result="noise" />
                            <feComponentTransfer in="noise" result="threshold">
                                <feFuncA type="discrete" tableValues="0 1" />
                            </feComponentTransfer>
                        </filter>
                    </defs>
                    <rect x="0" y="0" width="40" height="28" fill={A_COLOR}
                        className="transition-opacity duration-[600ms] ease-in-out group-hover:opacity-0" />
                    <rect x="0" y="0" width="40" height="28" fill={B_COLOR}
                        className="opacity-0 transition-opacity duration-[600ms] ease-in-out group-hover:opacity-100"
                        style={{ filter: 'url(#dissolve-px)' }} />
                </svg>
            );

        /* ── Directional wipes (clip-path inset) ── */
        case 'wipeleft':
            return (
                <svg viewBox="0 0 40 28" className={clsx(shared, 'overflow-hidden rounded-sm')}>
                    <rect x="0" y="0" width="40" height="28" fill={A_COLOR} />
                    <rect x="0" y="0" width="40" height="28" fill={B_COLOR}
                        className="transition-all duration-[600ms] ease-in-out"
                        style={{ clipPath: 'inset(0 0 0 100%)' }}
                        clipPath="group-hover"
                    />
                    <style>{`.group:hover .wl-b { clip-path: inset(0) !important; }`}</style>
                    {/* Inline approach using CSS variable trick */}
                </svg>
            );

        case 'wiperight':
            return (
                <svg viewBox="0 0 40 28" className={clsx(shared, 'overflow-hidden rounded-sm')}>
                    <rect x="0" y="0" width="40" height="28" fill={A_COLOR} />
                    <rect x="0" y="0" width="40" height="28" fill={B_COLOR}
                        className="transition-all duration-[600ms] ease-in-out"
                        style={{ clipPath: 'inset(0 100% 0 0)' }}
                    />
                </svg>
            );

        default:
            break;
    }

    /* ──────────────────────────────────────────────────────
     *  For wipe / slide / circle / etc. SVG clip-path needs
     *  a CSS-in-JS approach since Tailwind can't do inline
     *  clip-path on hover. We use a wrapper <div> with CSS
     *  transition + hover selector instead.
     * ────────────────────────────────────────────────────── */

    // We handle all remaining types with a div-based approach
    // that gives us full CSS `:hover` control via the parent group.
    return <DivTransitionPreview type={type} />;
}

/* ────────────────────────────────────────────────────────────
 *  Div-based animated preview (supports clip-path hover)
 *  The parent card has className `group`, so we use
 *  inline styles + a <style> scoped with a unique data attr.
 * ──────────────────────────────────────────────────────────── */

function DivTransitionPreview({ type }: { type: TransitionType }) {
    const base: React.CSSProperties = {
        position: 'absolute', inset: 0, borderRadius: '2px',
        transition: 'all 600ms ease-in-out',
    };

    const panelA: React.CSSProperties = {
        ...base,
        background: `linear-gradient(135deg, ${A_COLOR}, #a855f7)`,
    };

    const panelB: React.CSSProperties = {
        ...base,
        background: `linear-gradient(135deg, ${B_COLOR}, #06b6d4)`,
    };

    // Build per-type idle → hover transforms for panel B
    type StateStyles = { idle: React.CSSProperties; hover: string };
    const getStyles = (): StateStyles => {
        switch (type) {
            // Already handled as SVG above, but fallback just in case
            case 'fade':
            case 'cut':
            case 'dissolve':
            case 'fadewhite':
            case 'fadeblack':
                return { idle: { opacity: 0 }, hover: 'opacity: 1;' };

            case 'wipeleft':
                return { idle: { clipPath: 'inset(0 0 0 100%)' }, hover: 'clip-path: inset(0);' };
            case 'wiperight':
                return { idle: { clipPath: 'inset(0 100% 0 0)' }, hover: 'clip-path: inset(0);' };
            case 'wipeup':
                return { idle: { clipPath: 'inset(100% 0 0 0)' }, hover: 'clip-path: inset(0);' };
            case 'wipedown':
                return { idle: { clipPath: 'inset(0 0 100% 0)' }, hover: 'clip-path: inset(0);' };

            case 'slideleft':
                return { idle: { transform: 'translateX(100%)', opacity: 0 }, hover: 'transform: translateX(0); opacity: 1;' };
            case 'slideright':
                return { idle: { transform: 'translateX(-100%)', opacity: 0 }, hover: 'transform: translateX(0); opacity: 1;' };
            case 'slideup':
                return { idle: { transform: 'translateY(100%)', opacity: 0 }, hover: 'transform: translateY(0); opacity: 1;' };
            case 'slidedown':
                return { idle: { transform: 'translateY(-100%)', opacity: 0 }, hover: 'transform: translateY(0); opacity: 1;' };

            case 'circlecrop':
            case 'circleopen':
                return { idle: { clipPath: 'circle(0% at 50% 50%)' }, hover: 'clip-path: circle(75% at 50% 50%);' };
            case 'circleclose':
                return { idle: { clipPath: 'circle(75% at 50% 50%)' }, hover: 'clip-path: circle(0% at 50% 50%);' };

            case 'radial':
                return {
                    idle: { clipPath: 'polygon(50% 50%, 50% 0%, 50% 0%, 50% 0%, 50% 0%, 50% 0%)' },
                    hover: 'clip-path: polygon(50% 50%, 50% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%);',
                };

            case 'pixelize':
                return { idle: { opacity: 0, filter: 'blur(4px)', imageRendering: 'pixelated' as never }, hover: 'opacity: 1; filter: blur(0);' };

            case 'smoothleft':
                return { idle: { transform: 'translateX(100%)', opacity: 0 }, hover: 'transform: translateX(0); opacity: 1;' };
            case 'smoothright':
                return { idle: { transform: 'translateX(-100%)', opacity: 0 }, hover: 'transform: translateX(0); opacity: 1;' };
            case 'smoothup':
                return { idle: { transform: 'translateY(100%)', opacity: 0 }, hover: 'transform: translateY(0); opacity: 1;' };
            case 'smoothdown':
                return { idle: { transform: 'translateY(-100%)', opacity: 0 }, hover: 'transform: translateY(0); opacity: 1;' };

            case 'diagtl':
                return { idle: { clipPath: 'polygon(0 0, 0 0, 0 0)' }, hover: 'clip-path: polygon(0 0, 200% 0, 0 200%);' };
            case 'diagtr':
                return { idle: { clipPath: 'polygon(100% 0, 100% 0, 100% 0)' }, hover: 'clip-path: polygon(-100% 0, 100% 0, 100% 200%);' };
            case 'diagbl':
                return { idle: { clipPath: 'polygon(0 100%, 0 100%, 0 100%)' }, hover: 'clip-path: polygon(0 -100%, 200% 100%, 0 100%);' };
            case 'diagbr':
                return { idle: { clipPath: 'polygon(100% 100%, 100% 100%, 100% 100%)' }, hover: 'clip-path: polygon(100% -100%, -100% 100%, 100% 100%);' };

            case 'squeezeh':
                return { idle: { transform: 'scaleX(0)', transformOrigin: 'center' }, hover: 'transform: scaleX(1);' };
            case 'squeezev':
                return { idle: { transform: 'scaleY(0)', transformOrigin: 'center' }, hover: 'transform: scaleY(1);' };

            case 'hblur':
                return { idle: { opacity: 0, filter: 'blur(6px)' }, hover: 'opacity: 1; filter: blur(0);' };

            case 'flash':
                return { idle: { opacity: 0 }, hover: 'opacity: 1;' };
            case 'glitch':
                return { idle: { opacity: 0, transform: 'translate(-3px, 2px)' }, hover: 'opacity: 1; transform: translate(0);' };
            case 'rgb-split':
                return { idle: { opacity: 0, filter: 'hue-rotate(0deg)' }, hover: 'opacity: 1; filter: hue-rotate(360deg);' };
            case 'zoom-through':
                return { idle: { opacity: 0, transform: 'scale(3)' }, hover: 'opacity: 1; transform: scale(1);' };
            case 'spin':
                return { idle: { opacity: 0, transform: 'rotate(-180deg) scale(0.5)', transformOrigin: 'center' }, hover: 'opacity: 1; transform: rotate(0) scale(1);' };
            case 'film-burn':
                return { idle: { opacity: 0 }, hover: 'opacity: 1;' };
            case 'whip':
                return { idle: { opacity: 0, transform: 'translateX(100%)', filter: 'blur(4px)' }, hover: 'opacity: 1; transform: translateX(0); filter: blur(0);' };

            default:
                return { idle: { opacity: 0 }, hover: 'opacity: 1;' };
        }
    };

    const { idle, hover } = getStyles();
    const uid = `tp-${type}`;

    return (
        <div className="relative w-10 h-7 rounded-sm overflow-hidden">
            <style>{`
                .group:hover .${uid}-b { ${hover} }
            `}</style>
            <div style={panelA} />
            <div className={`${uid}-b`} style={{ ...panelB, ...idle }} />
            {/* Flash overlay for flash / film-burn */}
            {type === 'flash' && (
                <div
                    className={`${uid}-flash`}
                    style={{
                        ...base,
                        background: '#ffffff',
                        opacity: 0,
                    }}
                />
            )}
            {type === 'film-burn' && (
                <div
                    className={`${uid}-burn`}
                    style={{
                        ...base,
                        background: 'linear-gradient(135deg, #f97316, #fbbf24, transparent)',
                        opacity: 0,
                    }}
                />
            )}
            {(type === 'flash') && (
                <style>{`
                    .group:hover .${uid}-flash { opacity: 0.8; transition: opacity 300ms ease-in-out; }
                `}</style>
            )}
            {(type === 'film-burn') && (
                <style>{`
                    .group:hover .${uid}-burn { opacity: 0.7; transition: opacity 400ms ease-in-out; }
                `}</style>
            )}
        </div>
    );
}

/* ────────────────────────────────────────────────────────────
 *  TransitionCard component
 * ──────────────────────────────────────────────────────────── */

export const TransitionCard: React.FC<TransitionCardProps> = ({ type, selected, onToggle }) => {
    const meta = TRANSITION_META[type];

    return (
        <motion.button
            onClick={onToggle}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title={meta.description}
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

            {/* Animated transition preview SVG */}
            <TransitionPreviewSVG type={type} />

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
        </motion.button>
    );
};

export default TransitionCard;
