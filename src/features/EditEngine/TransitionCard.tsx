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
 *  Colour constants for the two preview panels.
 *  Panel A = "current clip" (purple), Panel B = "incoming clip" (blue).
 * ──────────────────────────────────────────────────────────── */

const A_GRADIENT = 'linear-gradient(135deg, #8b5cf6, #a855f7)';
const B_GRADIENT = 'linear-gradient(135deg, #3b82f6, #06b6d4)';

/* ────────────────────────────────────────────────────────────
 *  DivTransitionPreview
 *
 *  Pure-CSS animated preview for every TransitionType.
 *  The parent card carries className `group`, so we inject
 *  scoped <style> rules keyed by a unique class per type
 *  to drive the idle -> hover animation.
 *
 *  For each type we define:
 *    aIdle  / aHover  – CSS for Panel A
 *    bIdle  / bHover  – CSS for Panel B
 *    extras           – optional overlays (flash, burn, etc.)
 *    extraStyles      – optional extra hover rules
 *    defs             – optional inline SVG defs (filters)
 * ──────────────────────────────────────────────────────────── */

interface PanelConfig {
    aIdle: string;
    aHover: string;
    bIdle: string;
    bHover: string;
    /** Extra DOM nodes rendered after the two panels */
    extras?: React.ReactNode;
    /** Additional scoped CSS rules injected into the <style> block */
    extraStyles?: string;
    /** SVG <defs> rendered inside a zero-size SVG (for filters) */
    defs?: React.ReactNode;
}

const DUR = '600ms';

function getConfig(type: TransitionType, uid: string): PanelConfig {
    switch (type) {
        /* ═══════════════════ WIPE ═══════════════════
         * A stays static. B reveals via clip-path inset.
         * Hard sharp edge, no opacity. */

        case 'wipeleft':
            return {
                aIdle: '', aHover: '',
                bIdle: 'clip-path: inset(0 0 0 100%);',
                bHover: 'clip-path: inset(0);',
            };
        case 'wiperight':
            return {
                aIdle: '', aHover: '',
                bIdle: 'clip-path: inset(0 100% 0 0);',
                bHover: 'clip-path: inset(0);',
            };
        case 'wipeup':
            return {
                aIdle: '', aHover: '',
                bIdle: 'clip-path: inset(100% 0 0 0);',
                bHover: 'clip-path: inset(0);',
            };
        case 'wipedown':
            return {
                aIdle: '', aHover: '',
                bIdle: 'clip-path: inset(0 0 100% 0);',
                bHover: 'clip-path: inset(0);',
            };

        /* ═══════════════════ SLIDE ═══════════════════
         * BOTH panels move — push effect.
         * A slides out, B slides in from opposite side. */

        case 'slideleft':
            return {
                aIdle: 'transform: translateX(0);',
                aHover: 'transform: translateX(-100%);',
                bIdle: 'transform: translateX(100%);',
                bHover: 'transform: translateX(0);',
            };
        case 'slideright':
            return {
                aIdle: 'transform: translateX(0);',
                aHover: 'transform: translateX(100%);',
                bIdle: 'transform: translateX(-100%);',
                bHover: 'transform: translateX(0);',
            };
        case 'slideup':
            return {
                aIdle: 'transform: translateY(0);',
                aHover: 'transform: translateY(-100%);',
                bIdle: 'transform: translateY(100%);',
                bHover: 'transform: translateY(0);',
            };
        case 'slidedown':
            return {
                aIdle: 'transform: translateY(0);',
                aHover: 'transform: translateY(100%);',
                bIdle: 'transform: translateY(-100%);',
                bHover: 'transform: translateY(0);',
            };

        /* ═══════════════════ SMOOTH ═══════════════════
         * A stays static. B slides in with a soft feathered
         * leading edge (box-shadow acts as the feather). */

        case 'smoothleft':
            return {
                aIdle: '', aHover: '',
                bIdle: 'transform: translateX(100%);',
                bHover: 'transform: translateX(0); box-shadow: 8px 0 12px 4px rgba(0,0,0,0.5);',
            };
        case 'smoothright':
            return {
                aIdle: '', aHover: '',
                bIdle: 'transform: translateX(-100%);',
                bHover: 'transform: translateX(0); box-shadow: -8px 0 12px 4px rgba(0,0,0,0.5);',
            };
        case 'smoothup':
            return {
                aIdle: '', aHover: '',
                bIdle: 'transform: translateY(100%);',
                bHover: 'transform: translateY(0); box-shadow: 0 8px 12px 4px rgba(0,0,0,0.5);',
            };
        case 'smoothdown':
            return {
                aIdle: '', aHover: '',
                bIdle: 'transform: translateY(-100%);',
                bHover: 'transform: translateY(0); box-shadow: 0 -8px 12px 4px rgba(0,0,0,0.5);',
            };

        /* ═══════════════════ BASIC ═══════════════════ */

        case 'cut':
            return {
                aIdle: '', aHover: 'opacity: 0; transition-duration: 0ms;',
                bIdle: 'opacity: 0;',
                bHover: 'opacity: 1; transition-duration: 0ms;',
            };
        case 'fade':
            return {
                aIdle: '', aHover: 'opacity: 0;',
                bIdle: 'opacity: 0;',
                bHover: 'opacity: 1;',
            };
        case 'fadewhite':
            return {
                aIdle: '', aHover: 'opacity: 0;',
                bIdle: 'opacity: 0;',
                bHover: 'opacity: 1; transition-delay: 200ms;',
                extras: (
                    <div
                        className={`${uid}-mid`}
                        style={{
                            position: 'absolute', inset: 0, borderRadius: '2px',
                            background: '#ffffff',
                            opacity: 0,
                            transition: `opacity 300ms ease-in-out`,
                        }}
                    />
                ),
                extraStyles: `.group:hover .${uid}-mid { opacity: 0.85; }`,
            };
        case 'fadeblack':
            return {
                aIdle: '', aHover: 'opacity: 0;',
                bIdle: 'opacity: 0;',
                bHover: 'opacity: 1; transition-delay: 200ms;',
                extras: (
                    <div
                        className={`${uid}-mid`}
                        style={{
                            position: 'absolute', inset: 0, borderRadius: '2px',
                            background: '#000000',
                            opacity: 0,
                            transition: `opacity 300ms ease-in-out`,
                        }}
                    />
                ),
                extraStyles: `.group:hover .${uid}-mid { opacity: 0.9; }`,
            };
        case 'dissolve':
            return {
                aIdle: '', aHover: 'opacity: 0;',
                bIdle: 'opacity: 0; filter: url(#dissolve-noise);',
                bHover: 'opacity: 1;',
                defs: (
                    <svg width="0" height="0" style={{ position: 'absolute' }}>
                        <defs>
                            <filter id="dissolve-noise">
                                <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves={2} result="noise" />
                                <feComponentTransfer in="noise" result="threshold">
                                    <feFuncA type="discrete" tableValues="0 1" />
                                </feComponentTransfer>
                            </filter>
                        </defs>
                    </svg>
                ),
            };

        /* ═══════════════════ GEOMETRIC ═══════════════════ */

        case 'circlecrop':
        case 'circleopen':
            return {
                aIdle: '', aHover: '',
                bIdle: 'clip-path: circle(0% at 50% 50%);',
                bHover: 'clip-path: circle(75% at 50% 50%);',
            };
        case 'circleclose':
            // B is fully visible; A shrinks away via circle
            return {
                aIdle: 'clip-path: circle(75% at 50% 50%);',
                aHover: 'clip-path: circle(0% at 50% 50%);',
                bIdle: '', bHover: '',
            };
        case 'radial':
            return {
                aIdle: '', aHover: '',
                bIdle: 'clip-path: polygon(50% 50%, 50% 0%, 50% 0%, 50% 0%, 50% 0%, 50% 0%);',
                bHover: 'clip-path: polygon(50% 50%, 50% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%);',
            };
        case 'pixelize':
            return {
                aIdle: '', aHover: 'filter: blur(4px); opacity: 0;',
                bIdle: 'opacity: 0; filter: blur(6px);',
                bHover: 'opacity: 1; filter: blur(0px);',
            };

        /* ═══════════════════ DIAGONAL ═══════════════════ */

        case 'diagtl':
            return {
                aIdle: '', aHover: '',
                bIdle: 'clip-path: polygon(0 0, 0 0, 0 0);',
                bHover: 'clip-path: polygon(0 0, 200% 0, 0 200%);',
            };
        case 'diagtr':
            return {
                aIdle: '', aHover: '',
                bIdle: 'clip-path: polygon(100% 0, 100% 0, 100% 0);',
                bHover: 'clip-path: polygon(-100% 0, 100% 0, 100% 200%);',
            };
        case 'diagbl':
            return {
                aIdle: '', aHover: '',
                bIdle: 'clip-path: polygon(0 100%, 0 100%, 0 100%);',
                bHover: 'clip-path: polygon(0 -100%, 200% 100%, 0 100%);',
            };
        case 'diagbr':
            return {
                aIdle: '', aHover: '',
                bIdle: 'clip-path: polygon(100% 100%, 100% 100%, 100% 100%);',
                bHover: 'clip-path: polygon(100% -100%, -100% 100%, 100% 100%);',
            };

        /* ═══════════════════ SQUEEZE ═══════════════════ */

        case 'squeezeh':
            return {
                aIdle: '', aHover: '',
                bIdle: 'transform: scaleX(0); transform-origin: center;',
                bHover: 'transform: scaleX(1);',
            };
        case 'squeezev':
            return {
                aIdle: '', aHover: '',
                bIdle: 'transform: scaleY(0); transform-origin: center;',
                bHover: 'transform: scaleY(1);',
            };

        /* ═══════════════════ BLUR ═══════════════════ */

        case 'hblur':
            return {
                aIdle: '', aHover: 'filter: blur(6px); opacity: 0;',
                bIdle: 'opacity: 0; filter: blur(8px);',
                bHover: 'opacity: 1; filter: blur(0px);',
            };

        /* ═══════════════════ IMPACT ═══════════════════ */

        case 'flash':
            return {
                aIdle: '', aHover: '',
                bIdle: 'opacity: 0;',
                bHover: 'opacity: 1;',
                extras: (
                    <div
                        className={`${uid}-flash`}
                        style={{
                            position: 'absolute', inset: 0, borderRadius: '2px',
                            background: '#ffffff',
                            opacity: 0,
                            transition: `opacity 200ms ease-in-out`,
                            zIndex: 5,
                        }}
                    />
                ),
                extraStyles: `.group:hover .${uid}-flash { opacity: 0.85; transition: opacity 150ms ease-in, opacity 300ms 150ms ease-out; }`,
            };

        case 'glitch':
            return {
                aIdle: '', aHover: '',
                bIdle: 'opacity: 0; transform: translate(-3px, 2px);',
                bHover: 'opacity: 1; transform: translate(0, 0);',
                extras: (
                    <>
                        <div
                            className={`${uid}-g1`}
                            style={{
                                position: 'absolute', inset: 0, borderRadius: '2px',
                                background: B_GRADIENT,
                                opacity: 0,
                                clipPath: 'inset(20% 0 60% 0)',
                                transition: `all ${DUR} ease-in-out`,
                            }}
                        />
                        <div
                            className={`${uid}-g2`}
                            style={{
                                position: 'absolute', inset: 0, borderRadius: '2px',
                                background: B_GRADIENT,
                                opacity: 0,
                                clipPath: 'inset(70% 0 10% 0)',
                                transition: `all ${DUR} ease-in-out`,
                            }}
                        />
                    </>
                ),
                extraStyles: [
                    `.group:hover .${uid}-g1 { opacity: 0.7; transform: translateX(3px); }`,
                    `.group:hover .${uid}-g2 { opacity: 0.6; transform: translateX(-2px); }`,
                ].join('\n'),
            };

        case 'rgb-split':
            return {
                aIdle: '', aHover: '',
                bIdle: 'opacity: 0; transform: translateX(0);',
                bHover: 'opacity: 1;',
                extras: (
                    <>
                        <div
                            className={`${uid}-r`}
                            style={{
                                position: 'absolute', inset: 0, borderRadius: '2px',
                                background: 'rgba(255,0,0,0.35)',
                                opacity: 0,
                                transition: `all ${DUR} ease-in-out`,
                            }}
                        />
                        <div
                            className={`${uid}-g`}
                            style={{
                                position: 'absolute', inset: 0, borderRadius: '2px',
                                background: 'rgba(0,255,0,0.25)',
                                opacity: 0,
                                transition: `all ${DUR} ease-in-out`,
                            }}
                        />
                        <div
                            className={`${uid}-bl`}
                            style={{
                                position: 'absolute', inset: 0, borderRadius: '2px',
                                background: 'rgba(0,0,255,0.35)',
                                opacity: 0,
                                transition: `all ${DUR} ease-in-out`,
                            }}
                        />
                    </>
                ),
                extraStyles: [
                    `.group:hover .${uid}-r  { opacity: 1; transform: translateX(-3px); }`,
                    `.group:hover .${uid}-g  { opacity: 1; transform: translateX(0); }`,
                    `.group:hover .${uid}-bl { opacity: 1; transform: translateX(3px); }`,
                ].join('\n'),
            };

        case 'zoom-through':
            return {
                aIdle: '', aHover: 'opacity: 0; transform: scale(0.5);',
                bIdle: 'opacity: 0; transform: scale(3);',
                bHover: 'opacity: 1; transform: scale(1);',
            };

        case 'spin':
            return {
                aIdle: '', aHover: 'opacity: 0;',
                bIdle: 'opacity: 0; transform: rotate(-180deg) scale(0.5); transform-origin: center;',
                bHover: 'opacity: 1; transform: rotate(0deg) scale(1);',
            };

        case 'film-burn':
            return {
                aIdle: '', aHover: 'opacity: 0; transition-delay: 250ms;',
                bIdle: 'opacity: 0;',
                bHover: 'opacity: 1; transition-delay: 300ms;',
                extras: (
                    <div
                        className={`${uid}-burn`}
                        style={{
                            position: 'absolute', inset: 0, borderRadius: '2px',
                            background: 'linear-gradient(135deg, #f97316, #fbbf24, transparent)',
                            opacity: 0,
                            transition: `opacity 400ms ease-in-out`,
                            zIndex: 5,
                        }}
                    />
                ),
                extraStyles: `.group:hover .${uid}-burn { opacity: 0.75; }`,
            };

        case 'whip':
            return {
                aIdle: '', aHover: 'filter: blur(4px); opacity: 0;',
                bIdle: 'opacity: 0; transform: translateX(100%); filter: blur(6px);',
                bHover: 'opacity: 1; transform: translateX(0); filter: blur(0px);',
            };

        /* ═══════════════════ FALLBACK ═══════════════════ */

        default:
            return {
                aIdle: '', aHover: '',
                bIdle: 'opacity: 0;',
                bHover: 'opacity: 1;',
            };
    }
}

function DivTransitionPreview({ type }: { type: TransitionType }) {
    const uid = `tp-${type}`;
    const cfg = getConfig(type, uid);

    /* Build the two base inline style objects.
     * The idle CSS strings are applied via the scoped <style> block
     * alongside the hover overrides so that transition works correctly
     * on both the forward and reverse directions. */
    const panelBase: React.CSSProperties = {
        position: 'absolute',
        inset: 0,
        borderRadius: '2px',
        transition: `all ${DUR} ease-in-out`,
    };

    return (
        <div className="relative w-10 h-7 rounded-sm overflow-hidden">
            {cfg.defs}

            {/* Scoped styles: idle state via class, hover via .group:hover */}
            <style>{`
                .${uid}-a { ${cfg.aIdle} }
                .${uid}-b { ${cfg.bIdle} }
                .group:hover .${uid}-a { ${cfg.aHover} }
                .group:hover .${uid}-b { ${cfg.bHover} }
                ${cfg.extraStyles ?? ''}
            `}</style>

            {/* Panel A */}
            <div className={`${uid}-a`} style={{ ...panelBase, background: A_GRADIENT }} />

            {/* Panel B */}
            <div className={`${uid}-b`} style={{ ...panelBase, background: B_GRADIENT }} />

            {/* Optional extra overlay elements */}
            {cfg.extras}
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

            {/* Animated transition preview */}
            <DivTransitionPreview type={type} />

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
