import React, { useState } from 'react';

/**
 * Animated SVG icon library for GodMode vibes.
 * Each icon has unique idle, hover, and click animations.
 */

interface IconProps {
    size?: number;
    className?: string;
    active?: boolean;
}

// ─── ICE CRYSTAL (Clean) ──────────────────────────────────────────────────
export const IceCrystalIcon: React.FC<IconProps> = ({ size = 24, className = '', active = false }) => {
    const [hover, setHover] = useState(false);
    const [clicked, setClicked] = useState(false);

    const handleClick = () => { setClicked(true); setTimeout(() => setClicked(false), 400); };

    return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
            className={`transition-transform ${className}`}
            style={{ transform: hover ? 'scale(1.15) rotate(15deg)' : clicked ? 'scale(0.9)' : '' }}
            onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={handleClick}>
            <defs>
                <linearGradient id="ice-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#93C5FD" />
                    <stop offset="100%" stopColor="#3B82F6" />
                </linearGradient>
                <filter id="ice-glow"><feGaussianBlur stdDeviation="1.5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            <g filter={active || hover ? 'url(#ice-glow)' : undefined}>
                {/* Main crystal body */}
                <polygon points="16,2 22,10 22,22 16,30 10,22 10,10" fill="url(#ice-grad)" opacity={active ? 1 : 0.8}>
                    <animateTransform attributeName="transform" type="rotate" values="0 16 16;3 16 16;-3 16 16;0 16 16" dur="4s" repeatCount="indefinite" />
                </polygon>
                {/* Crystal facets */}
                <line x1="16" y1="2" x2="16" y2="30" stroke="white" strokeWidth="0.5" opacity="0.4" />
                <line x1="10" y1="10" x2="22" y2="22" stroke="white" strokeWidth="0.5" opacity="0.3" />
                <line x1="22" y1="10" x2="10" y2="22" stroke="white" strokeWidth="0.5" opacity="0.3" />
                {/* Sparkle dots */}
                <circle cx="16" cy="8" r="1" fill="white" opacity="0.9">
                    <animate attributeName="opacity" values="0.9;0.3;0.9" dur="2s" repeatCount="indefinite" />
                </circle>
                <circle cx="12" cy="16" r="0.7" fill="white" opacity="0.6">
                    <animate attributeName="opacity" values="0.6;0.1;0.6" dur="2.5s" repeatCount="indefinite" />
                </circle>
                <circle cx="20" cy="18" r="0.7" fill="white" opacity="0.7">
                    <animate attributeName="opacity" values="0.7;0.2;0.7" dur="1.8s" repeatCount="indefinite" />
                </circle>
                {/* Click burst ring */}
                {clicked && <circle cx="16" cy="16" r="2" fill="none" stroke="#93C5FD" strokeWidth="2" opacity="1">
                    <animate attributeName="r" from="2" to="16" dur="0.4s" fill="freeze" />
                    <animate attributeName="opacity" from="1" to="0" dur="0.4s" fill="freeze" />
                </circle>}
            </g>
        </svg>
    );
};

// ─── CLAPPERBOARD (Cinematic) ──────────────────────────────────────────────
export const ClapperIcon: React.FC<IconProps> = ({ size = 24, className = '', active = false }) => {
    const [hover, setHover] = useState(false);
    const [clicked, setClicked] = useState(false);

    const handleClick = () => { setClicked(true); setTimeout(() => setClicked(false), 500); };

    const clapAngle = clicked ? -25 : hover ? -8 : 0;

    return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
            className={className}
            onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={handleClick}>
            <defs>
                <linearGradient id="clap-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#A78BFA" />
                    <stop offset="100%" stopColor="#7C3AED" />
                </linearGradient>
            </defs>
            {/* Board body */}
            <rect x="4" y="12" width="24" height="16" rx="2" fill="url(#clap-grad)" opacity={active ? 1 : 0.85}>
                <animate attributeName="opacity" values={active ? '1;0.9;1' : '0.85;0.75;0.85'} dur="3s" repeatCount="indefinite" />
            </rect>
            {/* Board stripes */}
            <line x1="10" y1="12" x2="10" y2="28" stroke="white" strokeWidth="0.5" opacity="0.2" />
            <line x1="16" y1="12" x2="16" y2="28" stroke="white" strokeWidth="0.5" opacity="0.2" />
            <line x1="22" y1="12" x2="22" y2="28" stroke="white" strokeWidth="0.5" opacity="0.2" />
            {/* Clapper arm — pivots at right end */}
            <g style={{ transformOrigin: '4px 12px', transform: `rotate(${clapAngle}deg)`, transition: clicked ? 'transform 0.1s' : 'transform 0.3s ease' }}>
                <rect x="4" y="8" width="24" height="4" rx="1" fill="#F59E0B" opacity="0.9" />
                {/* Diagonal stripes on clapper */}
                <line x1="8" y1="8" x2="10" y2="12" stroke="#292524" strokeWidth="1.5" opacity="0.4" />
                <line x1="14" y1="8" x2="16" y2="12" stroke="#292524" strokeWidth="1.5" opacity="0.4" />
                <line x1="20" y1="8" x2="22" y2="12" stroke="#292524" strokeWidth="1.5" opacity="0.4" />
            </g>
            {/* Click flash */}
            {clicked && <rect x="0" y="0" width="32" height="32" fill="white" opacity="0.6" rx="4">
                <animate attributeName="opacity" from="0.6" to="0" dur="0.15s" fill="freeze" />
            </rect>}
        </svg>
    );
};

// ─── LIGHTNING BOLT (High Energy) ──────────────────────────────────────────
export const LightningBoltIcon: React.FC<IconProps> = ({ size = 24, className = '', active = false }) => {
    const [hover, setHover] = useState(false);
    const [clicked, setClicked] = useState(false);

    const handleClick = () => { setClicked(true); setTimeout(() => setClicked(false), 350); };

    return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
            className={`transition-transform ${className}`}
            style={{ transform: hover ? 'scale(1.2)' : clicked ? 'scale(0.85) rotate(-5deg)' : '' }}
            onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={handleClick}>
            <defs>
                <linearGradient id="bolt-grad" x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#FDE68A" />
                    <stop offset="50%" stopColor="#FBBF24" />
                    <stop offset="100%" stopColor="#F59E0B" />
                </linearGradient>
                <filter id="bolt-glow"><feGaussianBlur stdDeviation="2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            <g filter={active || hover ? 'url(#bolt-glow)' : undefined}>
                {/* Main bolt */}
                <polygon points="18,2 10,16 15,16 12,30 24,14 18,14 22,2" fill="url(#bolt-grad)" opacity={active ? 1 : 0.9}>
                    <animate attributeName="opacity" values={active ? '1;0.85;1' : '0.9;0.7;0.9'} dur="0.8s" repeatCount="indefinite" />
                </polygon>
                {/* Inner highlight */}
                <polygon points="17,5 13,15 16,15 14,26 21,15 17.5,15 20,5" fill="white" opacity="0.3" />
                {/* Energy particles on hover */}
                {hover && <>
                    <circle cx="8" cy="12" r="1" fill="#FDE68A" opacity="0.8">
                        <animate attributeName="cy" from="12" to="6" dur="0.5s" repeatCount="indefinite" />
                        <animate attributeName="opacity" from="0.8" to="0" dur="0.5s" repeatCount="indefinite" />
                    </circle>
                    <circle cx="24" cy="18" r="0.8" fill="#FBBF24" opacity="0.7">
                        <animate attributeName="cy" from="18" to="24" dur="0.6s" repeatCount="indefinite" />
                        <animate attributeName="opacity" from="0.7" to="0" dur="0.6s" repeatCount="indefinite" />
                    </circle>
                    <circle cx="6" cy="20" r="0.6" fill="#FDE68A" opacity="0.6">
                        <animate attributeName="cx" from="6" to="2" dur="0.4s" repeatCount="indefinite" />
                        <animate attributeName="opacity" from="0.6" to="0" dur="0.4s" repeatCount="indefinite" />
                    </circle>
                </>}
                {/* Click shockwave */}
                {clicked && <>
                    <circle cx="16" cy="16" r="4" fill="none" stroke="#FBBF24" strokeWidth="2">
                        <animate attributeName="r" from="4" to="18" dur="0.35s" fill="freeze" />
                        <animate attributeName="opacity" from="1" to="0" dur="0.35s" fill="freeze" />
                    </circle>
                    <circle cx="16" cy="16" r="2" fill="none" stroke="#FDE68A" strokeWidth="1">
                        <animate attributeName="r" from="2" to="14" dur="0.25s" fill="freeze" />
                        <animate attributeName="opacity" from="0.8" to="0" dur="0.25s" fill="freeze" />
                    </circle>
                </>}
            </g>
        </svg>
    );
};

// ─── FIRE (Maximum Chaos) ──────────────────────────────────────────────────
export const FireIcon: React.FC<IconProps> = ({ size = 24, className = '', active = false }) => {
    const [hover, setHover] = useState(false);
    const [clicked, setClicked] = useState(false);

    const handleClick = () => { setClicked(true); setTimeout(() => setClicked(false), 450); };

    return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
            className={`transition-transform ${className}`}
            style={{ transform: hover ? 'scale(1.15) translateY(-2px)' : clicked ? 'scale(1.3)' : '' }}
            onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={handleClick}>
            <defs>
                <linearGradient id="fire-outer" x1="16" y1="28" x2="16" y2="4" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#DC2626" />
                    <stop offset="60%" stopColor="#F97316" />
                    <stop offset="100%" stopColor="#FBBF24" />
                </linearGradient>
                <linearGradient id="fire-inner" x1="16" y1="28" x2="16" y2="12" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#F97316" />
                    <stop offset="100%" stopColor="#FDE68A" />
                </linearGradient>
                <filter id="fire-glow"><feGaussianBlur stdDeviation="2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            <g filter={active || hover ? 'url(#fire-glow)' : undefined}>
                {/* Outer flame */}
                <path d="M16 3C16 3 8 12 8 20C8 24.4 11.6 28 16 28C20.4 28 24 24.4 24 20C24 12 16 3 16 3Z" fill="url(#fire-outer)" opacity={active ? 1 : 0.85}>
                    <animate attributeName="d" values="M16 3C16 3 8 12 8 20C8 24.4 11.6 28 16 28C20.4 28 24 24.4 24 20C24 12 16 3 16 3Z;M16 4C16 4 7 13 7 20C7 24.4 11.6 28 16 28C20.4 28 25 24.4 25 20C25 13 16 4 16 4Z;M16 3C16 3 8 12 8 20C8 24.4 11.6 28 16 28C20.4 28 24 24.4 24 20C24 12 16 3 16 3Z" dur="1.2s" repeatCount="indefinite" />
                </path>
                {/* Inner flame */}
                <path d="M16 12C16 12 12 18 12 22C12 24.2 13.8 26 16 26C18.2 26 20 24.2 20 22C20 18 16 12 16 12Z" fill="url(#fire-inner)" opacity="0.9">
                    <animate attributeName="d" values="M16 12C16 12 12 18 12 22C12 24.2 13.8 26 16 26C18.2 26 20 24.2 20 22C20 18 16 12 16 12Z;M16 13C16 13 11 19 11 22C11 24.2 13.8 26 16 26C18.2 26 21 24.2 21 22C21 19 16 13 16 13Z;M16 12C16 12 12 18 12 22C12 24.2 13.8 26 16 26C18.2 26 20 24.2 20 22C20 18 16 12 16 12Z" dur="0.9s" repeatCount="indefinite" />
                </path>
                {/* Core bright spot */}
                <ellipse cx="16" cy="23" rx="2" ry="3" fill="white" opacity="0.4">
                    <animate attributeName="opacity" values="0.4;0.6;0.4" dur="0.7s" repeatCount="indefinite" />
                </ellipse>
                {/* Ember particles on hover */}
                {hover && <>
                    <circle cx="12" cy="8" r="1" fill="#FBBF24" opacity="0.9">
                        <animate attributeName="cy" from="8" to="2" dur="0.8s" repeatCount="indefinite" />
                        <animate attributeName="opacity" from="0.9" to="0" dur="0.8s" repeatCount="indefinite" />
                    </circle>
                    <circle cx="20" cy="6" r="0.8" fill="#F97316" opacity="0.7">
                        <animate attributeName="cy" from="6" to="1" dur="0.6s" repeatCount="indefinite" />
                        <animate attributeName="opacity" from="0.7" to="0" dur="0.6s" repeatCount="indefinite" />
                    </circle>
                    <circle cx="17" cy="4" r="0.6" fill="#FDE68A" opacity="0.8">
                        <animate attributeName="cy" from="4" to="-2" dur="0.7s" repeatCount="indefinite" />
                        <animate attributeName="opacity" from="0.8" to="0" dur="0.7s" repeatCount="indefinite" />
                    </circle>
                </>}
                {/* Click explosion */}
                {clicked && <>
                    <circle cx="16" cy="16" r="3" fill="none" stroke="#F97316" strokeWidth="2.5">
                        <animate attributeName="r" from="3" to="20" dur="0.45s" fill="freeze" />
                        <animate attributeName="opacity" from="1" to="0" dur="0.45s" fill="freeze" />
                    </circle>
                    <circle cx="16" cy="16" r="6" fill="#FBBF24" opacity="0.5">
                        <animate attributeName="r" from="6" to="1" dur="0.3s" fill="freeze" />
                        <animate attributeName="opacity" from="0.5" to="0" dur="0.3s" fill="freeze" />
                    </circle>
                </>}
            </g>
        </svg>
    );
};

// ─── PHONE/VIRAL (Viral) ────────────────────────────────────────────────────
export const ViralPhoneIcon: React.FC<IconProps> = ({ size = 24, className = '', active = false }) => {
    const [hover, setHover] = useState(false);
    const [clicked, setClicked] = useState(false);

    const handleClick = () => { setClicked(true); setTimeout(() => setClicked(false), 400); };

    return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
            className={`transition-transform ${className}`}
            style={{ transform: hover ? 'scale(1.1) rotate(-5deg)' : clicked ? 'scale(0.9) rotate(5deg)' : '' }}
            onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={handleClick}>
            <defs>
                <linearGradient id="phone-grad" x1="10" y1="4" x2="22" y2="28" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#E879F9" />
                    <stop offset="100%" stopColor="#A855F7" />
                </linearGradient>
                <filter id="phone-glow"><feGaussianBlur stdDeviation="1.5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            <g filter={active || hover ? 'url(#phone-glow)' : undefined}>
                {/* Phone body */}
                <rect x="10" y="4" width="12" height="24" rx="3" fill="url(#phone-grad)" opacity={active ? 1 : 0.85}>
                    <animateTransform attributeName="transform" type="rotate" values="0 16 16;-2 16 16;2 16 16;0 16 16" dur="3s" repeatCount="indefinite" />
                </rect>
                {/* Screen */}
                <rect x="12" y="8" width="8" height="14" rx="1" fill="#1E1B4B" opacity="0.8" />
                {/* Play triangle on screen */}
                <polygon points="14,12 14,18 19,15" fill="white" opacity="0.6">
                    <animate attributeName="opacity" values="0.6;0.9;0.6" dur="1.5s" repeatCount="indefinite" />
                </polygon>
                {/* Home button dot */}
                <circle cx="16" cy="25" r="1" fill="white" opacity="0.4" />
                {/* Notification dots */}
                {hover && <>
                    <circle cx="24" cy="6" r="2.5" fill="#EF4444" opacity="0.9">
                        <animate attributeName="r" values="2.5;3;2.5" dur="0.6s" repeatCount="indefinite" />
                    </circle>
                    <text x="24" y="7.5" textAnchor="middle" fill="white" fontSize="4" fontWeight="bold">!</text>
                    {/* Signal waves */}
                    <path d="M24 10 Q28 8 26 4" fill="none" stroke="#E879F9" strokeWidth="1" opacity="0.5">
                        <animate attributeName="opacity" values="0.5;0;0.5" dur="1s" repeatCount="indefinite" />
                    </path>
                </>}
                {/* Click ripple from screen */}
                {clicked && <>
                    <circle cx="16" cy="15" r="2" fill="none" stroke="white" strokeWidth="1.5">
                        <animate attributeName="r" from="2" to="16" dur="0.4s" fill="freeze" />
                        <animate attributeName="opacity" from="1" to="0" dur="0.4s" fill="freeze" />
                    </circle>
                </>}
            </g>
        </svg>
    );
};

// ─── SPARKLE STAR (Utility — replaces ✦ / ⚡ in misc UI) ────────────────
export const SparkleStarIcon: React.FC<IconProps> = ({ size = 12, className = '' }) => {
    const [hover, setHover] = useState(false);

    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
            className={`inline-block ${className}`}
            style={{ transform: hover ? 'scale(1.3) rotate(15deg)' : '', transition: 'transform 0.2s' }}
            onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
            <path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5Z" fill="currentColor" opacity="0.9">
                <animate attributeName="opacity" values="0.9;0.5;0.9" dur="2s" repeatCount="indefinite" />
            </path>
        </svg>
    );
};

// ─── ZAP ICON (Utility — replaces ⚡ in auto-select buttons) ─────────────
export const ZapSvgIcon: React.FC<IconProps> = ({ size = 12, className = '' }) => {
    const [hover, setHover] = useState(false);

    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
            className={`inline-block ${className}`}
            style={{ transform: hover ? 'scale(1.2)' : '', transition: 'transform 0.15s' }}
            onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
            <polygon points="9,1 5,9 8,9 6,15 12,7 9,7 11,1" fill="currentColor" opacity="0.9">
                <animate attributeName="opacity" values="0.9;0.6;0.9" dur="1s" repeatCount="indefinite" />
            </polygon>
        </svg>
    );
};

// ─── Vibe icon map for convenience ──────────────────────────────────────────
export const VIBE_ICONS: Record<string, React.FC<IconProps>> = {
    'clean': IceCrystalIcon,
    'cinematic': ClapperIcon,
    'high-energy': LightningBoltIcon,
    'chaos': FireIcon,
    'viral': ViralPhoneIcon,
};
