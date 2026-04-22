import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useAppHealthStore, AppHealthState } from '../store/appHealthStore';

/**
 * MMMedia Pro — Living Logo (Triple-M Cascade)
 *
 * THEME-REACTIVE: Reads --color-logo-* CSS variables so the logo
 * automatically matches the active color scheme (purple/neon/ocean/hacker).
 *
 * Interactive animations:
 *   • Hover  — layers fan out (spread apart) with parallax timing
 *   • Click  — compress then spring back
 *   • Active — breathing glow intensifies
 *   • Idle   — subtle breathing pulse
 */

interface LogoProps {
    size?: number;
    className?: string;
    showLabel?: boolean;
}

/** Read a CSS variable from the document root. */
function getCSSVar(name: string, fallback: string): string {
    if (typeof document === 'undefined') return fallback;
    // Read from body first (where theme class lives), fallback to documentElement
    const bodyVal = getComputedStyle(document.body).getPropertyValue(name).trim();
    if (bodyVal) return bodyVal;
    const rootVal = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return rootVal || fallback;
}

// Health state overrides (only glow intensity/speed — colors come from CSS vars)
const STATE_OVERRIDES: Record<AppHealthState, {
    glowRadius: number; glowOpacity: number;
    pulseSpeed: string; ringSpeed: string; shakeClass: string;
    colorOverride?: { back: string; mid: string; front: string; glow: string };
}> = {
    idle: {
        glowRadius: 2, glowOpacity: 0.25, pulseSpeed: '4s', ringSpeed: '24s', shakeClass: '',
    },
    active: {
        glowRadius: 3, glowOpacity: 0.4, pulseSpeed: '2.5s', ringSpeed: '12s', shakeClass: '',
    },
    fast: {
        glowRadius: 5, glowOpacity: 0.55, pulseSpeed: '1s', ringSpeed: '3s', shakeClass: '',
    },
    slow: {
        glowRadius: 2, glowOpacity: 0.15, pulseSpeed: '7s', ringSpeed: '40s', shakeClass: '',
        colorOverride: { back: '#78350F', mid: '#B45309', front: '#D97706', glow: '#92400E' },
    },
    error: {
        glowRadius: 6, glowOpacity: 0.65, pulseSpeed: '0.5s', ringSpeed: '2s', shakeClass: 'mmm-shake',
        colorOverride: { back: '#7F1D1D', mid: '#DC2626', front: '#FCA5A5', glow: '#EF4444' },
    },
    loading: {
        glowRadius: 3, glowOpacity: 0.35, pulseSpeed: '1.5s', ringSpeed: '1.5s', shakeClass: '',
    },
};

export const MMLogo: React.FC<LogoProps> = ({ size = 24, className = '', showLabel = false }) => {
    const { state, scrollVelocity, errorCount } = useAppHealthStore();
    const [isHovered, setIsHovered] = useState(false);
    const [isPressed, setIsPressed] = useState(false);

    // Read theme colors from CSS variables
    const [themeColors, setThemeColors] = useState({
        back: '#3730A3', mid: '#7C3AED', front: '#D946EF', glow: '#7C3AED',
    });

    // Re-read CSS vars when theme changes (body class)
    useEffect(() => {
        const updateColors = () => {
            setThemeColors({
                back: getCSSVar('--color-logo-back', '#3730A3'),
                mid: getCSSVar('--color-logo-mid', '#7C3AED'),
                front: getCSSVar('--color-logo-front', '#D946EF'),
                glow: getCSSVar('--color-logo-glow', '#7C3AED'),
            });
        };
        updateColors();

        // Watch for class changes on body (theme switches)
        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.attributeName === 'class') {
                    // Small delay to let CSS variables propagate
                    requestAnimationFrame(updateColors);
                }
            }
        });
        observer.observe(document.body, { attributes: true });
        return () => observer.disconnect();
    }, []);

    const stateConfig = useMemo(() => STATE_OVERRIDES[state] || STATE_OVERRIDES.idle, [state]);

    // Use color overrides for error/slow, otherwise use theme colors
    const colors = useMemo(() => {
        if (stateConfig.colorOverride) return stateConfig.colorOverride;
        return themeColors;
    }, [stateConfig, themeColors]);

    const dynamicRingSpeed = useMemo(() => {
        if (scrollVelocity > 500) return '2s';
        if (scrollVelocity > 200) return '6s';
        if (scrollVelocity > 50) return '10s';
        return stateConfig.ringSpeed;
    }, [scrollVelocity, stateConfig.ringSpeed]);

    // Layer transforms based on interaction
    const layerTransforms = useMemo(() => {
        if (isPressed) {
            return {
                back: 'translate(6, 3) scale(0.95)',
                mid: 'translate(2, 1) scale(0.97)',
                front: 'translate(-2, -1) scale(0.99)',
            };
        }
        if (isHovered) {
            return {
                back: 'translate(-4, -2)',
                mid: 'translate(0, 0)',
                front: 'translate(4, 2)',
            };
        }
        return { back: 'translate(0, 0)', mid: 'translate(0, 0)', front: 'translate(0, 0)' };
    }, [isHovered, isPressed]);

    const handleClick = useCallback(() => {
        setIsPressed(true);
        setTimeout(() => setIsPressed(false), 200);
    }, []);

    return (
        <div
            className={`flex items-center gap-2 select-none ${className}`}
            title={`MMMedia Pro · ${state}${errorCount > 0 ? ` · ${errorCount} error${errorCount > 1 ? 's' : ''}` : ''}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => { setIsHovered(false); setIsPressed(false); }}
            onMouseDown={handleClick}
            style={{ cursor: 'pointer' }}
        >
            <svg
                width={size} height={size}
                viewBox="0 0 64 64" fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className={stateConfig.shakeClass}
                style={{
                    filter: `drop-shadow(0 0 ${stateConfig.glowRadius}px ${colors.glow})`,
                    transition: 'filter 0.3s ease',
                }}
            >
                <defs>
                    <linearGradient id="mmm-g1" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={colors.back} />
                        <stop offset="100%" stopColor={colors.back} stopOpacity="0.8" />
                    </linearGradient>
                    <linearGradient id="mmm-g2" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={colors.mid} />
                        <stop offset="100%" stopColor={colors.mid} stopOpacity="0.85" />
                    </linearGradient>
                    <linearGradient id="mmm-g3" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={colors.front} />
                        <stop offset="100%" stopColor="#ffffff" stopOpacity="0.2" />
                    </linearGradient>
                    <filter id="mmm-glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" />
                    </filter>
                    <radialGradient id="mmm-err" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#EF4444" />
                        <stop offset="100%" stopColor="#B91C1C" />
                    </radialGradient>
                </defs>

                {/* Orbital Ring */}
                <circle cx="32" cy="32" r="30" fill="none" stroke={colors.mid}
                    strokeWidth="0.6" strokeOpacity="0.12" strokeDasharray="3 8"
                    style={{ animation: `mmm-ring-spin ${dynamicRingSpeed} linear infinite`, transformOrigin: '32px 32px' }}
                />

                {/* Breathing Glow */}
                <circle cx="30" cy="34" r="14" fill={colors.glow} filter="url(#mmm-glow)"
                    style={{ animation: `mmm-breathe ${stateConfig.pulseSpeed} ease-in-out infinite`, transformOrigin: '30px 34px' }}
                />

                {/* BACK M — deepest, leftmost */}
                <g opacity="0.5" style={{ transform: layerTransforms.back, transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
                    <path d="M4 54 L4 12 L16 32 L16 54 Z" fill="url(#mmm-g1)" />
                    <path d="M4 12 L24 54 L44 12 L36 12 L24 30 L16 12 Z" fill="url(#mmm-g1)" />
                    <path d="M36 54 L36 32 L44 12 L44 54 Z" fill="url(#mmm-g1)" />
                </g>

                {/* MIDDLE M */}
                <g opacity="0.72" style={{ transform: layerTransforms.mid, transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
                    <path d="M12 56 L12 18 L22 34 L22 56 Z" fill="url(#mmm-g2)" />
                    <path d="M12 18 L30 56 L48 18 L42 18 L30 34 L22 18 Z" fill="url(#mmm-g2)" />
                    <path d="M42 56 L42 34 L48 18 L48 56 Z" fill="url(#mmm-g2)" />
                </g>

                {/* FRONT M — brightest */}
                <g opacity="1" style={{ transform: layerTransforms.front, transition: 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
                    <path d="M20 58 L20 24 L29 38 L29 58 Z" fill="url(#mmm-g3)" />
                    <path d="M20 24 L36 58 L52 24 L46 24 L36 38 L29 24 Z" fill="url(#mmm-g3)" />
                    <path d="M46 58 L46 38 L52 24 L52 58 Z" fill="url(#mmm-g3)" />
                </g>

                {/* Error Badge */}
                {state === 'error' && errorCount > 0 && (
                    <g>
                        <circle cx="54" cy="10" r="7" fill="url(#mmm-err)" stroke="#0a0515" strokeWidth="1.5" />
                        <text x="54" y="13" textAnchor="middle" fill="white" fontSize="8" fontWeight="800" fontFamily="system-ui">
                            {errorCount > 9 ? '!' : errorCount}
                        </text>
                    </g>
                )}

                {/* Loading Spinner */}
                {state === 'loading' && (
                    <circle cx="32" cy="32" r="28" fill="none" stroke={colors.front}
                        strokeWidth="1.5" strokeLinecap="round" strokeDasharray="25 145"
                        style={{ animation: 'mmm-ring-spin 1s linear infinite', transformOrigin: '32px 32px' }}
                    />
                )}

                {/* Fast Particles */}
                {state === 'fast' && (
                    <>
                        <circle cx="5" cy="28" r="1" fill={colors.front} opacity="0.6" style={{ animation: 'mmm-particle 1.4s ease-in-out infinite' }} />
                        <circle cx="59" cy="24" r="0.7" fill={colors.front} opacity="0.4" style={{ animation: 'mmm-particle 1.7s ease-in-out 0.3s infinite' }} />
                        <circle cx="28" cy="4" r="0.9" fill={colors.mid} opacity="0.5" style={{ animation: 'mmm-particle 2s ease-in-out 0.6s infinite' }} />
                    </>
                )}

                {/* Slow Dimmer */}
                {state === 'slow' && (
                    <rect x="0" y="0" width="64" height="64" rx="8" fill="#000" fillOpacity="0.3" />
                )}
            </svg>

            {showLabel && (
                <span className="text-xs font-medium text-white/60 select-none">MMMedia Pro</span>
            )}

            <style>{`
                @keyframes mmm-ring-spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes mmm-breathe {
                    0%, 100% { opacity: ${stateConfig.glowOpacity * 0.4}; transform: scale(0.85); }
                    50% { opacity: ${stateConfig.glowOpacity}; transform: scale(1.2); }
                }
                @keyframes mmm-particle {
                    0%, 100% { opacity: 0; transform: scale(0.4); }
                    50% { opacity: 0.9; transform: scale(1.6); }
                }
                .mmm-shake {
                    animation: mmm-shake-anim 0.25s ease-in-out infinite;
                }
                @keyframes mmm-shake-anim {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-1.5px) rotate(-1deg); }
                    75% { transform: translateX(1.5px) rotate(1deg); }
                }
            `}</style>
        </div>
    );
};
